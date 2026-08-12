import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Cartesian3,
  Color,
  PolygonHierarchy,
  createGooglePhotorealistic3DTileset,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  Viewer,
  Cesium3DTileset,
  Cartographic,
  Math as CesiumMath,
  ClassificationType,
  CallbackProperty,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { Tables } from "@/integrations/supabase/types";

type Gleba = Tables<"glebas">;

// ⚠️ IMPORTANTE: Sua Google Maps API Key
const GOOGLE_MAPS_API_KEY = "AIzaSyDqTgpc8FdUMf622yGI7IFHDcS_e9JncBI";

// Cores por status
const STATUS_COLORS: Record<string, Color> = {
  identificada: Color.fromCssColorString("#3b82f6").withAlpha(0.6),
  analise_interna_realizada: Color.fromCssColorString("#0ea5e9").withAlpha(0.6),
  informacoes_recebidas: Color.fromCssColorString("#06b6d4").withAlpha(0.6),
  visita_realizada: Color.fromCssColorString("#14b8a6").withAlpha(0.6),
  proposta_enviada: Color.fromCssColorString("#f59e0b").withAlpha(0.6),
  minuta_enviada: Color.fromCssColorString("#eab308").withAlpha(0.6),
  protocolo_assinado: Color.fromCssColorString("#f97316").withAlpha(0.6),
  descartada: Color.fromCssColorString("#ef4444").withAlpha(0.6),
  proposta_recusada: Color.fromCssColorString("#f43f5e").withAlpha(0.6),
  negocio_fechado: Color.fromCssColorString("#22c55e").withAlpha(0.6),
  standby: Color.fromCssColorString("#a855f7").withAlpha(0.6),
};

const STATUS_OUTLINE_COLORS: Record<string, Color> = {
  identificada: Color.fromCssColorString("#3b82f6"),
  analise_interna_realizada: Color.fromCssColorString("#0ea5e9"),
  informacoes_recebidas: Color.fromCssColorString("#06b6d4"),
  visita_realizada: Color.fromCssColorString("#14b8a6"),
  proposta_enviada: Color.fromCssColorString("#f59e0b"),
  minuta_enviada: Color.fromCssColorString("#eab308"),
  protocolo_assinado: Color.fromCssColorString("#f97316"),
  descartada: Color.fromCssColorString("#ef4444"),
  proposta_recusada: Color.fromCssColorString("#f43f5e"),
  negocio_fechado: Color.fromCssColorString("#22c55e"),
  standby: Color.fromCssColorString("#a855f7"),
};

export interface PesquisaPin {
  id: string;
  nome: string;
  preco: number | null;
  tamanho_m2: number | null;
  condicoes_pagamento: string | null;
  tipo_terreno: string | null;
  observacoes: string | null;
  url_anuncio: string | null;
  imagem_url: string | null;
  latitude: number;
  longitude: number;
  pesquisa_nome: string;
  pesquisa_data: string;
}

interface GlebaMap3DProps {
  glebas: Gleba[];
  pesquisaTerrenos?: PesquisaPin[];
  onSelectGleba?: (gleba: Gleba) => void;
  selectedGlebaId?: string | null;
  isFullscreen?: boolean;
  /** Modo de desenho de nova gleba ligado/desligado */
  isDrawing?: boolean;
  /** Chamado quando o usuário conclui o desenho (>=3 pontos), com [lon,lat][] em graus */
  onPolygonComplete?: (coords: number[][]) => void;
  /** Chamado quando o usuário cancela o desenho */
  onCancelDraw?: () => void;
}

// Converte GeoJSON para array de Cartesian3
function geoJsonToCartesian3Array(geojson: any): Cartesian3[] | null {
  if (!geojson) return null;

  try {
    let coordinates: number[][] = [];

    if (geojson.type === "FeatureCollection" && geojson.features?.length > 0) {
      return geoJsonToCartesian3Array(geojson.features[0]);
    }

    if (geojson.type === "Feature" && geojson.geometry) {
      return geoJsonToCartesian3Array(geojson.geometry);
    }

    if (geojson.type === "Polygon" && geojson.coordinates?.[0]) {
      coordinates = geojson.coordinates[0];
    } else if (geojson.type === "MultiPolygon" && geojson.coordinates?.[0]?.[0]) {
      coordinates = geojson.coordinates[0][0];
    } else if (geojson.type === "Point" && geojson.coordinates) {
      return [Cartesian3.fromDegrees(geojson.coordinates[0], geojson.coordinates[1])];
    } else {
      return null;
    }

    return coordinates.map((coord) => Cartesian3.fromDegrees(coord[0], coord[1]));
  } catch (error) {
    console.error("Erro ao converter GeoJSON:", error);
    return null;
  }
}

// Calcula o centro de um polígono em graus
function getPolygonCenterDegrees(geojson: any): { lon: number; lat: number } | null {
  if (!geojson) return null;

  try {
    let coordinates: number[][] = [];

    if (geojson.type === "FeatureCollection" && geojson.features?.length > 0) {
      return getPolygonCenterDegrees(geojson.features[0]);
    }

    if (geojson.type === "Feature" && geojson.geometry) {
      return getPolygonCenterDegrees(geojson.geometry);
    }

    if (geojson.type === "Polygon" && geojson.coordinates?.[0]) {
      coordinates = geojson.coordinates[0];
    } else if (geojson.type === "MultiPolygon" && geojson.coordinates?.[0]?.[0]) {
      coordinates = geojson.coordinates[0][0];
    } else if (geojson.type === "Point" && geojson.coordinates) {
      return { lon: geojson.coordinates[0], lat: geojson.coordinates[1] };
    } else {
      return null;
    }

    let sumLon = 0, sumLat = 0;
    for (const coord of coordinates) {
      sumLon += coord[0];
      sumLat += coord[1];
    }
    return { lon: sumLon / coordinates.length, lat: sumLat / coordinates.length };
  } catch {
    return null;
  }
}

export function GlebaMap3D({
  glebas,
  pesquisaTerrenos = [],
  onSelectGleba,
  selectedGlebaId,
  isDrawing = false,
  onPolygonComplete,
  onCancelDraw,
}: GlebaMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);

  // --- Estado do desenho de nova gleba ---
  const drawPositionsRef = useRef<Cartesian3[]>([]);
  const drawPointEntitiesRef = useRef<any[]>([]);
  const drawPolygonEntityRef = useRef<any>(null);
  const drawHandlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const [pointCount, setPointCount] = useState(0);

  // Inicializar o viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      selectionIndicator: true,
      navigationHelpButton: false,
      infoBox: true,
      fullscreenButton: false,
    });

    viewerRef.current = viewer;

    // Ocultar widgets
    const timelineContainer = viewer.timeline?.container as HTMLElement;
    const animationContainer = viewer.animation?.container as HTMLElement;
    if (timelineContainer) timelineContainer.style.display = "none";
    if (animationContainer) animationContainer.style.display = "none";

    // Habilitar iluminação
    viewer.scene.globe.enableLighting = true;

    // Carregar Google 3D Tiles
    createGooglePhotorealistic3DTileset({ key: GOOGLE_MAPS_API_KEY })
      .then((tileset) => {
        viewer.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
      })
      .catch((error) => {
        console.error("Erro ao carregar Google 3D Tiles:", error);
      });

    // Posição inicial (Brasil)
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(-47.8822, -15.7942, 50000),
      duration: 2,
    });

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // Adicionar entidades das glebas
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Limpar entidades existentes
    viewer.entities.removeAll();

    let firstGlebaCenter: { lon: number; lat: number } | null = null;

    // Adicionar cada gleba como entidade
    glebas.forEach((gleba, index) => {
      if (!gleba.poligono_geojson) return;

      const coordinates = geoJsonToCartesian3Array(gleba.poligono_geojson);
      if (!coordinates || coordinates.length < 3) return;

      // Guardar centro da primeira gleba para voar até ela
      if (index === 0 && !firstGlebaCenter) {
        firstGlebaCenter = getPolygonCenterDegrees(gleba.poligono_geojson);
      }

      const fillColor = STATUS_COLORS[gleba.status] || Color.GRAY.withAlpha(0.6);
      const outlineColor = STATUS_OUTLINE_COLORS[gleba.status] || Color.GRAY;

      viewer.entities.add({
        id: gleba.id,
        name: gleba.apelido,
        description: `
          <h3>${gleba.apelido}</h3>
          <p><strong>Status:</strong> ${gleba.status.replace(/_/g, " ")}</p>
          ${gleba.tamanho_m2 ? `<p><strong>Área:</strong> ${gleba.tamanho_m2.toLocaleString()} m²</p>` : ""}
          ${gleba.preco ? `<p><strong>Preço:</strong> R$ ${gleba.preco.toLocaleString()}</p>` : ""}
        `,
        polygon: {
          hierarchy: new PolygonHierarchy(coordinates),
          material: fillColor,
          outline: true,
          outlineColor: outlineColor,
          outlineWidth: 2,
          classificationType: ClassificationType.CESIUM_3D_TILE,
        },
      });
    });

    // Pins de pesquisa de mercado
    pesquisaTerrenos.forEach((t) => {
      const precoM2 = t.preco && t.tamanho_m2 ? (t.preco / t.tamanho_m2) : null;
      const dataFmt = (() => { try { return new Date(t.pesquisa_data + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return t.pesquisa_data; } })();
      viewer.entities.add({
        id: `pesquisa_${t.id}`,
        name: `📍 ${t.nome}`,
        position: Cartesian3.fromDegrees(t.longitude, t.latitude),
        point: {
          pixelSize: 14,
          color: Color.fromCssColorString("#2563EB"),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
        },
        description: `
          <div style="font-family:Arial,sans-serif;max-width:320px">
            <h3 style="margin:0 0 8px;color:#2563EB">📍 ${t.nome}</h3>
            <p style="margin:2px 0;font-size:12px;color:#666"><strong>Pesquisa:</strong> ${t.pesquisa_nome} — ${dataFmt}</p>
            ${t.preco ? `<p style="margin:4px 0"><strong>Preço:</strong> R$ ${t.preco.toLocaleString("pt-BR")}</p>` : ""}
            ${t.tamanho_m2 ? `<p style="margin:4px 0"><strong>Área:</strong> ${t.tamanho_m2.toLocaleString("pt-BR")} m²</p>` : ""}
            ${precoM2 ? `<p style="margin:4px 0;color:#2563EB"><strong>R$/m²:</strong> ${precoM2.toLocaleString("pt-BR",{maximumFractionDigits:2})}</p>` : ""}
            ${t.tipo_terreno ? `<p style="margin:4px 0"><strong>Tipo:</strong> ${t.tipo_terreno}</p>` : ""}
            ${t.condicoes_pagamento ? `<p style="margin:4px 0"><strong>Condições:</strong> ${t.condicoes_pagamento}</p>` : ""}
            ${t.observacoes ? `<p style="margin:6px 0;font-style:italic">${t.observacoes}</p>` : ""}
            ${t.imagem_url ? `<img src="${t.imagem_url}" style="max-width:100%;margin-top:8px;border-radius:4px" />` : ""}
            ${t.url_anuncio ? `<p style="margin-top:8px"><a href="${t.url_anuncio}" target="_blank" style="color:#2563EB">🔗 Ver anúncio</a></p>` : ""}
          </div>
        `,
      });
    });

    // Voar para a primeira gleba quando as glebas forem carregadas
    if (firstGlebaCenter && glebas.length > 0) {
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(firstGlebaCenter.lon, firstGlebaCenter.lat, 15000),
        duration: 2,
      });
    }
  }, [glebas, pesquisaTerrenos]);

  // Handler de clique (seleção) — desativado durante o desenho
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !onSelectGleba || isDrawing) return;

    if (handlerRef.current) {
      handlerRef.current.destroy();
    }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      const pickedObject = viewer.scene.pick(click.position);
      if (defined(pickedObject) && pickedObject.id?.id) {
        const glebaId = pickedObject.id.id;
        const gleba = glebas.find((g) => g.id === glebaId);
        if (gleba) {
          onSelectGleba(gleba);
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    handlerRef.current = handler;

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [glebas, onSelectGleba, isDrawing]);

  // FlyTo quando uma gleba é selecionada
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!selectedGlebaId || !viewer) return;

    const gleba = glebas.find((g) => g.id === selectedGlebaId);
    if (!gleba?.poligono_geojson) return;

    const center = getPolygonCenterDegrees(gleba.poligono_geojson);
    if (!center) return;

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(center.lon, center.lat, 5000),
      duration: 1.5,
    });
  }, [selectedGlebaId, glebas]);

  // Pega o ponto 3D (na malha do Google) a partir do pixel clicado
  const pickCartesian = (position: any): Cartesian3 | undefined => {
    const viewer = viewerRef.current;
    if (!viewer) return undefined;
    const scene = viewer.scene;
    try {
      if (scene.pickPositionSupported) {
        const c = scene.pickPosition(position);
        if (defined(c)) return c;
      }
    } catch {
      /* segue para os fallbacks */
    }
    const ray = viewer.camera.getPickRay(position);
    if (ray) {
      const g = scene.globe.pick(ray, scene);
      if (defined(g)) return g;
    }
    return viewer.camera.pickEllipsoid(position) || undefined;
  };

  // Modo de desenho: liga/desliga o handler e o polígono dinâmico
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const clearDraw = () => {
      drawPointEntitiesRef.current.forEach((e) => { try { viewer.entities.remove(e); } catch { /* noop */ } });
      drawPointEntitiesRef.current = [];
      if (drawPolygonEntityRef.current) {
        try { viewer.entities.remove(drawPolygonEntityRef.current); } catch { /* noop */ }
        drawPolygonEntityRef.current = null;
      }
      drawPositionsRef.current = [];
      setPointCount(0);
    };

    if (!isDrawing) {
      clearDraw();
      return;
    }

    // Polígono dinâmico que segue os pontos clicados
    drawPolygonEntityRef.current = viewer.entities.add({
      polygon: {
        hierarchy: new CallbackProperty(
          () => new PolygonHierarchy(drawPositionsRef.current.slice()),
          false
        ) as any,
        material: Color.YELLOW.withAlpha(0.4),
        outline: true,
        outlineColor: Color.YELLOW,
        classificationType: ClassificationType.CESIUM_3D_TILE,
      },
    });

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      const pos = pickCartesian(click.position);
      if (!pos) return;
      drawPositionsRef.current.push(pos);
      const pt = viewer.entities.add({
        position: pos,
        point: {
          pixelSize: 9,
          color: Color.YELLOW,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      drawPointEntitiesRef.current.push(pt);
      setPointCount(drawPositionsRef.current.length);
    }, ScreenSpaceEventType.LEFT_CLICK);
    // Neutraliza o duplo-clique (que daria zoom) durante o desenho
    handler.setInputAction(() => { /* noop */ }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    drawHandlerRef.current = handler;

    return () => {
      if (drawHandlerRef.current) {
        drawHandlerRef.current.destroy();
        drawHandlerRef.current = null;
      }
    };
  }, [isDrawing]);

  const undoLastPoint = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    drawPositionsRef.current.pop();
    const last = drawPointEntitiesRef.current.pop();
    if (last) { try { viewer.entities.remove(last); } catch { /* noop */ } }
    setPointCount(drawPositionsRef.current.length);
  };

  const finishDrawing = () => {
    const pts = drawPositionsRef.current;
    if (pts.length < 3) return;
    const coords = pts.map((c) => {
      const carto = Cartographic.fromCartesian(c);
      return [CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude)];
    });
    onPolygonComplete?.(coords);
  };

  const btn: CSSProperties = {
    border: "none",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 12,
    cursor: "pointer",
    color: "white",
    background: "#334155",
  };

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      {isDrawing && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            zIndex: 20,
            display: "flex",
            gap: 8,
            alignItems: "center",
            background: "rgba(15,23,42,0.85)",
            padding: "8px 12px",
            borderRadius: 10,
            boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
          }}
        >
          <span style={{ color: "white", fontSize: 12 }}>
            Clique nos cantos da área — {pointCount} ponto{pointCount === 1 ? "" : "s"}
          </span>
          <button style={{ ...btn, opacity: pointCount === 0 ? 0.5 : 1 }} onClick={undoLastPoint} disabled={pointCount === 0}>
            Desfazer
          </button>
          <button style={{ ...btn, background: "#22c55e", opacity: pointCount < 3 ? 0.5 : 1 }} onClick={finishDrawing} disabled={pointCount < 3}>
            Concluir
          </button>
          <button style={{ ...btn, background: "#ef4444" }} onClick={() => onCancelDraw?.()}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// Manter a função parseKmzFile para compatibilidade
export { parseKmzFile } from "./GlebaMap";
