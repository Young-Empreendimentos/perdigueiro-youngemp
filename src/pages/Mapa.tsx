import { useState, useRef, useMemo } from "react";
import { useGlebas } from "@/hooks/useGlebas";
import { useCidades } from "@/hooks/useCidades";
import { useAllPesquisaTerrenos } from "@/hooks/usePesquisasMercado";
import { GlebaMap3D, parseKmzFile, PesquisaPin } from "@/components/map/GlebaMap3D";
import { GlebaCard } from "@/components/glebas/GlebaCard";
import { EditGlebaDialog } from "@/components/glebas/EditGlebaDialog";
import { Tables } from "@/integrations/supabase/db-types";
import { supabase } from "@/integrations/supabase/client";
import {
  Map,
  Maximize2,
  Minimize2,
  Upload,
  Layers,
  Globe,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  CloudDownload,
  Pencil,
  LocateFixed,
  MapPin,
  X
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Gleba = Tables<"glebas">;

const NETWORK_LINK_URL = "https://vvtympzatclvjaqucebr.supabase.co/functions/v1/serve-kml-network-link";
const SYNC_FUNCTION_URL = "https://vvtympzatclvjaqucebr.supabase.co/functions/v1/sync-drive-glebas";

// Área (m²) de um polígono lon/lat pela fórmula esférica (excesso). Boa o suficiente
// para o tamanho de uma gleba; não depende de projeção.
function polygonAreaM2(coords: number[][]): number {
  if (!coords || coords.length < 3) return 0;
  const R = 6378137; // raio da Terra em metros
  const rad = (d: number) => (d * Math.PI) / 180;
  let sum = 0;
  for (let i = 0; i < coords.length; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[(i + 1) % coords.length];
    sum += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((sum * R * R) / 2);
}

// Centro aproximado de uma gleba (média dos vértices do anel externo), em lon/lat.
function glebaCentro(geojson: any): { lon: number; lat: number } | null {
  if (!geojson) return null;
  const g = geojson.type === "Feature" ? geojson.geometry : geojson;
  let ring: number[][] | null = null;
  if (g?.type === "Polygon") ring = g.coordinates?.[0] ?? null;
  else if (g?.type === "MultiPolygon") ring = g.coordinates?.[0]?.[0] ?? null;
  else if (g?.type === "Point" && g.coordinates) return { lon: g.coordinates[0], lat: g.coordinates[1] };
  if (!ring || !ring.length) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  return { lon: sx / ring.length, lat: sy / ring.length };
}

// Distância em km entre dois pontos lon/lat (Haversine).
function distanciaKm(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export default function Mapa() {
  const { glebas, isLoading, createGleba, refetch } = useGlebas();
  const { data: pesquisaTerrenosRaw = [] } = useAllPesquisaTerrenos();
  const pesquisaPins: PesquisaPin[] = pesquisaTerrenosRaw
    .filter((t) => t.latitude != null && t.longitude != null && t.pesquisa)
    .map((t) => ({
      id: t.id, nome: t.nome, preco: t.preco, tamanho_m2: t.tamanho_m2,
      condicoes_pagamento: t.condicoes_pagamento, tipo_terreno: t.tipo_terreno,
      observacoes: t.observacoes, url_anuncio: t.url_anuncio, imagem_url: t.imagem_url,
      latitude: t.latitude as number, longitude: t.longitude as number,
      pesquisa_nome: t.pesquisa!.nome, pesquisa_data: t.pesquisa!.data_pesquisa,
    }));
  const [selectedGleba, setSelectedGleba] = useState<Gleba | null>(null);
  const [editingGleba, setEditingGleba] = useState<Gleba | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [googleEarthDialogOpen, setGoogleEarthDialogOpen] = useState(false);
  const [driveFileId, setDriveFileId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // --- Filtros / localização ---
  const { cidades } = useCidades();
  const [fCidadeId, setFCidadeId] = useState<string>("all");
  const [userPos, setUserPos] = useState<{ lon: number; lat: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ lon: number; lat: number } | null>(null);

  // Só as cidades que têm gleba (dropdown enxuto).
  const cidadesComGlebas = useMemo(() => {
    const ids = new Set(glebas.map((g) => (g as any).cidade_id).filter(Boolean));
    return (cidades ?? [])
      .filter((c: any) => ids.has(c.id))
      .sort((a: any, b: any) => String(a.nome).localeCompare(String(b.nome)));
  }, [glebas, cidades]);

  // Glebas visíveis: filtra por cidade e, com GPS ligado, ordena pela distância.
  const glebasVisiveis = useMemo(() => {
    let arr = fCidadeId !== "all"
      ? glebas.filter((g) => (g as any).cidade_id === fCidadeId)
      : glebas.slice();
    if (userPos) {
      arr = arr
        .map((g) => {
          const c = glebaCentro((g as any).poligono_geojson);
          return { g, d: c ? distanciaKm(userPos, c) : Infinity };
        })
        .sort((a, b) => a.d - b.d)
        .map((x) => x.g);
    }
    return arr;
  }, [glebas, fCidadeId, userPos]);

  const distanciaDe = (g: Gleba): number | null => {
    if (!userPos) return null;
    const c = glebaCentro((g as any).poligono_geojson);
    return c ? distanciaKm(userPos, c) : null;
  };

  const handlePertoDeMim = () => {
    if (!("geolocation" in navigator)) {
      toast({ variant: "destructive", title: "GPS indisponível", description: "Seu navegador não suporta geolocalização." });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lon: pos.coords.longitude, lat: pos.coords.latitude };
        setUserPos(p);
        setFocusTarget({ ...p });
        setLocating(false);
        toast({ title: "Localização encontrada", description: "Glebas ordenadas pela distância de você." });
      },
      (err) => {
        setLocating(false);
        toast({
          variant: "destructive",
          title: "Não consegui pegar sua localização",
          description: err.code === err.PERMISSION_DENIED
            ? "Permissão negada — autorize o acesso à localização no navegador."
            : "Tente de novo (de preferência em local aberto).",
        });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleCidade = (id: string) => {
    setFCidadeId(id);
    if (id !== "all") {
      const centros = glebas
        .filter((g) => (g as any).cidade_id === id)
        .map((g) => glebaCentro((g as any).poligono_geojson))
        .filter(Boolean) as { lon: number; lat: number }[];
      if (centros.length) {
        setFocusTarget({
          lon: centros.reduce((s, c) => s + c.lon, 0) / centros.length,
          lat: centros.reduce((s, c) => s + c.lat, 0) / centros.length,
        });
      }
    }
  };

  // --- Desenhar nova gleba no mapa 3D ---
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnCoords, setDrawnCoords] = useState<number[][] | null>(null);
  const [drawDialogOpen, setDrawDialogOpen] = useState(false);
  const [novoApelido, setNovoApelido] = useState("");
  const [savingDraw, setSavingDraw] = useState(false);

  const areaM2 = drawnCoords ? polygonAreaM2(drawnCoords) : 0;

  const handlePolygonComplete = (coords: number[][]) => {
    setDrawnCoords(coords);
    setIsDrawing(false);
    setNovoApelido("");
    setDrawDialogOpen(true);
  };

  const handleSalvarDesenho = async () => {
    if (!drawnCoords || drawnCoords.length < 3) return;
    if (!novoApelido.trim()) {
      toast({ variant: "destructive", title: "Dê um nome à gleba" });
      return;
    }
    setSavingDraw(true);
    try {
      const ring = [...drawnCoords, drawnCoords[0]]; // fecha o anel
      await createGleba({
        apelido: novoApelido.trim(),
        status: "identificada",
        poligono_geojson: { type: "Polygon", coordinates: [ring] },
        tamanho_m2: Math.round(areaM2),
      });
      await refetch();
      toast({
        title: "Gleba criada!",
        description: `"${novoApelido.trim()}" — ${(areaM2 / 10000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha`,
      });
      setDrawDialogOpen(false);
      setDrawnCoords(null);
      setNovoApelido("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Não foi possível criar a gleba",
      });
    } finally {
      setSavingDraw(false);
    }
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const geojson = await parseKmzFile(file);
      
      // Extrair nome do arquivo como apelido
      const apelido = file.name.replace(/\.(kmz|kml)$/i, "");
      
      // Criar gleba com o polígono importado
      await createGleba({
        apelido: apelido,
        status: "identificada",
        poligono_geojson: geojson,
      });
      
      toast({
        title: "Gleba importada!",
        description: `"${apelido}" foi criada com sucesso a partir do arquivo KMZ/KML`,
      });
    } catch (error) {
      console.error("Erro ao importar KMZ:", error);
      toast({
        variant: "destructive",
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Não foi possível importar o arquivo",
      });
    } finally {
      setIsImporting(false);
      // Limpar input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(NETWORK_LINK_URL);
      setCopied(true);
      toast({
        title: "Link copiado!",
        description: "Cole este link no Google Earth para sincronizar as glebas",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao copiar",
        description: "Não foi possível copiar o link",
      });
    }
  };

  const handleSyncFromDrive = async () => {
    if (!driveFileId.trim()) {
      toast({
        variant: "destructive",
        title: "ID do arquivo obrigatório",
        description: "Cole o ID do arquivo KML do Google Drive",
      });
      return;
    }

    setIsSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          variant: "destructive",
          title: "Não autenticado",
          description: "Você precisa estar logado para sincronizar",
        });
        return;
      }

      const response = await fetch(SYNC_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ fileId: driveFileId.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro na sincronização");
      }

      await refetch();

      toast({
        title: "Sincronização concluída!",
        description: `${result.imported} importadas, ${result.updated} atualizadas`,
      });
    } catch (error) {
      console.error("Erro na sincronização:", error);
      toast({
        variant: "destructive",
        title: "Erro na sincronização",
        description: error instanceof Error ? error.message : "Não foi possível sincronizar",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className={cn(
      "space-y-6",
      isFullscreen && "fixed inset-0 z-50 bg-background p-4"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">

        <div className="flex items-center gap-2">
          {/* Google Earth Integration */}
          <Dialog open={googleEarthDialogOpen} onOpenChange={setGoogleEarthDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Globe className="h-4 w-4 mr-2" />
                Google Earth
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg z-50">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Integração Google Earth
                </DialogTitle>
                <DialogDescription>
                  Sincronize as glebas do sistema com o Google Earth Web usando Network Link
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Exportação - Network Link */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Exportação (Sistema → Earth)
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Use este link no Google Earth para visualizar suas glebas em tempo real
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={NETWORK_LINK_URL}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyLink}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Importação - Drive Sync */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <CloudDownload className="h-4 w-4" />
                    Importação (Drive → Sistema)
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Sincronize glebas de um arquivo KML no Google Drive
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="driveFileId">ID do Arquivo no Drive</Label>
                    <div className="flex gap-2">
                      <Input
                        id="driveFileId"
                        value={driveFileId}
                        onChange={(e) => setDriveFileId(e.target.value)}
                        placeholder="Ex: 1abc123def456..."
                        className="font-mono text-xs"
                      />
                      <Button
                        onClick={handleSyncFromDrive}
                        disabled={isSyncing}
                      >
                        {isSyncing ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O ID está na URL do arquivo: drive.google.com/file/d/<strong>[ID]</strong>/view
                    </p>
                  </div>
                </div>

                {/* Instruções */}
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-sm">Como usar:</h4>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li><strong>Exportar:</strong> Copie o link acima e importe no Google Earth Web</li>
                    <li><strong>Importar:</strong> Compartilhe seu KML com a conta de serviço e cole o ID acima</li>
                    <li>A sincronização preserva status, preço e outros dados editados no sistema</li>
                  </ol>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => window.open(NETWORK_LINK_URL, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Baixar KML
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => window.open("https://earth.google.com/web", "_blank")}
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    Abrir Google Earth
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Desenhar Gleba (no globo 3D da Google) */}
          <Button
            variant={isDrawing ? "default" : "outline"}
            size="sm"
            onClick={() => setIsDrawing((v) => !v)}
          >
            <Pencil className="h-4 w-4 mr-2" />
            {isDrawing ? "Desenhando..." : "Desenhar Gleba"}
          </Button>

          {/* Importar KMZ */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            <Upload className="h-4 w-4 mr-2" />
            {isImporting ? "Importando..." : "Importar KMZ"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".kmz,.kml"
            onChange={handleFileImport}
            className="hidden"
            disabled={isImporting}
          />

          {/* Fullscreen */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-4 w-4 mr-2" />
                Sair
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4 mr-2" />
                Tela Cheia
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Filtros / localização */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={userPos ? "default" : "outline"}
          size="sm"
          onClick={handlePertoDeMim}
          disabled={locating}
        >
          <LocateFixed className="h-4 w-4 mr-2" />
          {locating ? "Localizando..." : "Perto de mim"}
        </Button>

        <Select value={fCidadeId} onValueChange={handleCidade}>
          <SelectTrigger className="w-full sm:w-56">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <SelectValue placeholder="Filtrar por cidade" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as cidades</SelectItem>
            {cidadesComGlebas.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(userPos || fCidadeId !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setUserPos(null); setFCidadeId("all"); }}
          >
            <X className="h-4 w-4 mr-1" />
            Limpar
          </Button>
        )}
        {userPos && (
          <span className="text-xs text-muted-foreground">
            Ordenado por distância de você
          </span>
        )}
      </div>

      {/* Map Container */}
      <div className={cn(
        "grid gap-4",
        isFullscreen 
          ? "grid-cols-1 h-[calc(100vh-120px)]" 
          : "grid-cols-1 lg:grid-cols-4 h-[600px]"
      )}>
        <div className={cn(
          "rounded-lg overflow-hidden border relative",
          isFullscreen ? "h-full" : "lg:col-span-3"
        )}>
          {!isLoading && (
            <GlebaMap3D
              glebas={glebasVisiveis}
              pesquisaTerrenos={pesquisaPins}
              onSelectGleba={setSelectedGleba}
              selectedGlebaId={selectedGleba?.id}
              isFullscreen={isFullscreen}
              isDrawing={isDrawing}
              onPolygonComplete={handlePolygonComplete}
              onCancelDraw={() => setIsDrawing(false)}
              focusTarget={focusTarget}
              userPos={userPos}
            />
          )}
        </div>

        {/* Sidebar - Esconde em fullscreen */}
        {!isFullscreen && (
          <div className="rounded-lg border p-4 overflow-y-auto">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Legenda
            </h3>
            <div className="space-y-2">
              {[
                { status: "identificada", color: "#3b82f6", label: "Identificada" },
                { status: "informacoes_recebidas", color: "#06b6d4", label: "Info. Recebidas" },
                { status: "analise_interna_realizada", color: "#0ea5e9", label: "Análise Interna" },
                { status: "proposta_enviada", color: "#f59e0b", label: "Proposta Enviada" },
                { status: "minuta_enviada", color: "#eab308", label: "Minuta Enviada" },
                { status: "protocolo_assinado", color: "#f97316", label: "Protocolo Assinado" },
                { status: "descartada", color: "#ef4444", label: "Descartada" },
                { status: "proposta_recusada", color: "#f43f5e", label: "Proposta Recusada" },
                { status: "negocio_fechado", color: "#22c55e", label: "Negócio Fechado" },
                { status: "standby", color: "#a855f7", label: "Standby" },
              ].map((item) => (
                <div key={item.status} className="flex items-center gap-2 text-xs">
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
              ))}
            </div>

            <div className="border-t mt-4 pt-4">
              <h4 className="text-sm font-medium mb-2">Glebas ({glebasVisiveis.length})</h4>
              <div className="space-y-2 max-h-[250px] overflow-y-auto scrollbar-thin">
                {glebasVisiveis.map((gleba) => {
                  const dist = distanciaDe(gleba);
                  return (
                    <div
                      key={gleba.id}
                      onClick={() => setSelectedGleba(gleba)}
                      className="p-2 rounded border cursor-pointer hover:bg-muted text-xs transition-colors"
                    >
                      <div className="font-medium truncate">{gleba.apelido}</div>
                      <div className="text-muted-foreground capitalize flex items-center justify-between gap-2">
                        <span className="truncate">{gleba.status.replace(/_/g, " ")}</span>
                        {dist != null && (
                          <span className="whitespace-nowrap normal-case">
                            {dist.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {glebasVisiveis.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma gleba {fCidadeId !== "all" ? "nesta cidade" : "cadastrada"}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selected Gleba Sheet */}
      <Sheet open={!!selectedGleba} onOpenChange={(open) => !open && setSelectedGleba(null)}>
        <SheetContent side="bottom" className="h-[300px]">
          <SheetHeader>
            <SheetTitle>{selectedGleba?.apelido}</SheetTitle>
          </SheetHeader>
          {selectedGleba && (
            <div className="mt-4">
              <div onClick={() => {
                setEditingGleba(selectedGleba);
                setSelectedGleba(null);
              }}>
                <GlebaCard gleba={selectedGleba} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Dialog */}
      <EditGlebaDialog
        gleba={editingGleba}
        open={!!editingGleba}
        onOpenChange={(open) => !open && setEditingGleba(null)}
      />

      {/* Dialog: nomear e salvar a gleba desenhada */}
      <Dialog
        open={drawDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDrawDialogOpen(false);
            setDrawnCoords(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova gleba desenhada</DialogTitle>
            <DialogDescription>
              Área calculada:{" "}
              <strong>{(areaM2 / 10000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong>{" "}
              ({Math.round(areaM2).toLocaleString("pt-BR")} m²)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="novoApelido">Nome / apelido da gleba</Label>
              <Input
                id="novoApelido"
                value={novoApelido}
                onChange={(e) => setNovoApelido(e.target.value)}
                placeholder="Ex: Fazenda São João"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !savingDraw) handleSalvarDesenho();
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDrawDialogOpen(false);
                  setDrawnCoords(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleSalvarDesenho} disabled={savingDraw}>
                {savingDraw ? "Salvando..." : "Criar gleba"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}