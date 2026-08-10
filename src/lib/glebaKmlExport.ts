// Exporta UMA gleba como arquivo .kml (para importar/compartilhar no Google Earth Web).
// Usa o poligono_geojson que a gleba ja tem — nao depende de token nem de endpoint.

type GlebaLike = {
  numero?: number | null;
  apelido?: string | null;
  poligono_geojson?: any;
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Converte o GeoJSON da gleba em coordenadas KML ("lon,lat,0 lon,lat,0 ...").
function geoJsonToKml(geojson: any): { coords: string; type: "Polygon" | "Point" } | null {
  if (!geojson) return null;
  try {
    if (geojson.type === "FeatureCollection" && geojson.features?.length) return geoJsonToKml(geojson.features[0]);
    if (geojson.type === "Feature" && geojson.geometry) return geoJsonToKml(geojson.geometry);
    if (geojson.type === "Polygon" && geojson.coordinates?.[0]) {
      return { coords: geojson.coordinates[0].map((c: number[]) => `${c[0]},${c[1]},0`).join(" "), type: "Polygon" };
    }
    if (geojson.type === "MultiPolygon" && geojson.coordinates?.[0]?.[0]) {
      return { coords: geojson.coordinates[0][0].map((c: number[]) => `${c[0]},${c[1]},0`).join(" "), type: "Polygon" };
    }
    if (geojson.type === "Point" && geojson.coordinates) {
      return { coords: `${geojson.coordinates[0]},${geojson.coordinates[1]},0`, type: "Point" };
    }
    return null;
  } catch {
    return null;
  }
}

// A gleba tem um poligono/ponto exportavel?
export function glebaTemPoligono(gleba: GlebaLike | null | undefined): boolean {
  return !!(gleba && geoJsonToKml(gleba.poligono_geojson));
}

// Gera e baixa o .kml de UMA gleba. Retorna false se ela nao tiver poligono.
export function exportarGlebaKml(gleba: GlebaLike): boolean {
  const geo = geoJsonToKml(gleba?.poligono_geojson);
  if (!geo) return false;

  const titulo = `${gleba.numero ? `#${gleba.numero} - ` : ""}${gleba.apelido ?? "Gleba"}`;
  const geometry =
    geo.type === "Polygon"
      ? `<Polygon><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${geo.coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>`
      : `<Point><altitudeMode>clampToGround</altitudeMode><coordinates>${geo.coords}</coordinates></Point>`;

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(titulo)}</name>
    <Style id="estilo"><PolyStyle><color>4d0090ff</color><fill>1</fill><outline>1</outline></PolyStyle><LineStyle><color>ff0090ff</color><width>2</width></LineStyle></Style>
    <Placemark>
      <name>${escapeXml(titulo)}</name>
      <styleUrl>#estilo</styleUrl>
      ${geometry}
    </Placemark>
  </Document>
</kml>`;

  const slug = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "gleba";
  const nome = `perdigueiro-${gleba.numero ? gleba.numero + "-" : ""}${slug(gleba.apelido ?? "gleba")}.kml`;

  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
  return true;
}
