// Reverse geocoding GRÁTIS via malhas do IBGE (sem chave Google, sem custo).
// Descobre "que município/UF" está num ponto (lon/lat). Carrega sob demanda:
//   1) a malha dos 27 estados (1x, leve) -> descobre a UF do ponto;
//   2) a malha dos municípios daquela UF (1x por estado, cacheada em memória) -> o município.
// Assim nunca baixa o Brasil inteiro: só os estados que você realmente olha.

type LonLat = [number, number];
type Ring = LonLat[];
interface Feature {
  properties: { codarea?: string; [k: string]: unknown };
  geometry: { type: string; coordinates: unknown } | null;
}
interface FeatureCollection {
  features?: Feature[];
}

// Código IBGE da UF (2 dígitos) -> sigla.
const UF_SIGLA: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};

const MALHAS = "https://servicodados.ibge.gov.br/api/v3/malhas";
const LOCALIDADES = "https://servicodados.ibge.gov.br/api/v1/localidades";

// Point-in-polygon (ray casting) num anel [lon,lat][].
function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Polygon/MultiPolygon: considera só o anel externo (ignora buracos — ok p/ municípios).
function pointInGeometry(lon: number, lat: number, geom: Feature["geometry"]): boolean {
  if (!geom) return false;
  const c = geom.coordinates as number[][][] | number[][][][];
  if (geom.type === "Polygon") return pointInRing(lon, lat, (c as number[][][])[0] as Ring);
  if (geom.type === "MultiPolygon") {
    for (const poly of c as number[][][][]) {
      if (pointInRing(lon, lat, poly[0] as Ring)) return true;
    }
  }
  return false;
}

// Bounding box p/ descartar rápido features longe do ponto.
function bbox(geom: Feature["geometry"]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const scan = (ring: Ring) => {
    for (const p of ring) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
  };
  if (!geom) return [minX, minY, maxX, maxY];
  const c = geom.coordinates as number[][][] | number[][][][];
  if (geom.type === "Polygon") scan((c as number[][][])[0] as Ring);
  else if (geom.type === "MultiPolygon") for (const poly of c as number[][][][]) scan(poly[0] as Ring);
  return [minX, minY, maxX, maxY];
}

function achaFeature(lon: number, lat: number, features: Feature[]): Feature | null {
  for (const f of features) {
    const [minX, minY, maxX, maxY] = bbox(f.geometry);
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    if (pointInGeometry(lon, lat, f.geometry)) return f;
  }
  return null;
}

// --- Caches em memória (sessão). IBGE é grátis; recarrega a cada reload. ---
let estadosPromise: Promise<Feature[]> | null = null;
async function getEstados(): Promise<Feature[]> {
  if (!estadosPromise) {
    estadosPromise = fetch(`${MALHAS}/paises/BR?formato=application/vnd.geo+json&intrarregiao=UF&qualidade=intermediaria`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((fc: FeatureCollection) => fc.features ?? [])
      .catch((e) => { console.error("IBGE malha de estados:", e); estadosPromise = null; return []; });
  }
  return estadosPromise;
}

interface UFData { features: Feature[]; nomes: Map<string, string>; }
const ufCache = new Map<string, Promise<UFData | null>>();
async function getUFData(codUf: string): Promise<UFData | null> {
  if (!ufCache.has(codUf)) {
    const p = (async (): Promise<UFData | null> => {
      try {
        const [malhaRes, nomesRes] = await Promise.all([
          fetch(`${MALHAS}/estados/${codUf}?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=intermediaria`),
          fetch(`${LOCALIDADES}/estados/${codUf}/municipios`),
        ]);
        if (!malhaRes.ok || !nomesRes.ok) return null;
        const malha: FeatureCollection = await malhaRes.json();
        const nomesArr: Array<{ id: number; nome: string }> = await nomesRes.json();
        const nomes = new Map<string, string>();
        for (const m of nomesArr) nomes.set(String(m.id), m.nome);
        return { features: malha.features ?? [], nomes };
      } catch (e) {
        console.error("IBGE malha de municípios:", e);
        return null;
      }
    })();
    ufCache.set(codUf, p);
    // Se falhar, permite nova tentativa depois (não cacheia o erro pra sempre).
    p.then((v) => { if (!v) ufCache.delete(codUf); });
  }
  return ufCache.get(codUf)!;
}

export interface LocalInfo { municipio: string | null; uf: string | null; label: string; }

/**
 * Resolve o "você está em" de um ponto (graus). Retorna `null` fora do Brasil ou se
 * o IBGE falhar (o chamador simplesmente não mostra o rótulo). Tudo grátis, sem chave.
 */
export async function resolverLocal(lon: number, lat: number): Promise<LocalInfo | null> {
  const estados = await getEstados();
  if (!estados.length) return null;

  const estado = achaFeature(lon, lat, estados);
  const codUf = estado?.properties.codarea ?? null;
  if (!codUf) return null; // fora do Brasil (oceano, outro país)

  const sigla = UF_SIGLA[codUf] ?? codUf;
  const ufData = await getUFData(codUf);
  if (!ufData) return { municipio: null, uf: sigla, label: sigla };

  const mun = achaFeature(lon, lat, ufData.features);
  const nome = mun ? ufData.nomes.get(mun.properties.codarea ?? "") ?? null : null;
  return { municipio: nome, uf: sigla, label: nome ? `${nome} – ${sigla}` : sigla };
}
