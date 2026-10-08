import type { ComponentType } from "react";
import { Tables } from "@/integrations/supabase/db-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Star, Pencil, MapPin, Building2, User, Ruler, DollarSign,
  CalendarDays, Repeat, FileText, MessageSquare, Navigation,
} from "lucide-react";
import { STATUS_LABELS } from "@/hooks/useGlebas";
import { useCidades } from "@/hooks/useCidades";
import { useImobiliarias } from "@/hooks/useImobiliarias";

type Gleba = Tables<"glebas">;

const STATUS_COLORS: Record<string, string> = {
  identificada: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  analise_interna_realizada: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  informacoes_recebidas: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  proposta_enviada: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  minuta_enviada: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  protocolo_assinado: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  descartada: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  proposta_recusada: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  negocio_fechado: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  standby: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

const brl = (n: number, dec = 0) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: dec })}`;

function fmtArea(m2?: number | null): string | null {
  if (m2 == null) return null;
  if (m2 >= 10000) return `${(m2 / 10000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha`;
  return `${Math.round(m2).toLocaleString("pt-BR")} m²`;
}

function fmtData(d?: string | null): string | null {
  if (!d) return null;
  try { return new Date(d + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return d; }
}

function fmtPermuta(v?: string | null): string | null {
  if (v === "sim") return "Sim";
  if (v === "nao") return "Não";
  return v ? "Incerto" : null;
}

function Fato({ icon: Icon, label, value }: { icon?: ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
}

interface Props {
  gleba: Gleba;
  onEditar?: () => void;
  distanciaKm?: number | null;
}

export function GlebaDetalhePanel({ gleba, onEditar, distanciaKm }: Props) {
  const { cidades } = useCidades();
  const { imobiliarias } = useImobiliarias();
  const g = gleba as any;

  const cidadeNome = cidades?.find((c: any) => c.id === g.cidade_id)?.nome ?? null;
  const imobNome = imobiliarias?.find((i: any) => i.id === g.imobiliaria_id)?.nome ?? null;
  const m2 = g.tamanho_m2 as number | null;
  const preco = g.preco as number | null;
  const precoHa = preco != null && m2 != null && m2 > 0 ? preco / (m2 / 10000) : null;
  const permuta = fmtPermuta(g.aceita_permuta);

  return (
    <div className="space-y-4">
      {/* Cabeçalho: nº + prioridade + status + editar */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">#{g.numero}</span>
          {g.prioridade && <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />}
          <Badge variant="outline" className={STATUS_COLORS[g.status] || "bg-gray-100 text-gray-800"}>
            {STATUS_LABELS[g.status] || g.status}
          </Badge>
        </div>
        {onEditar && (
          <Button size="sm" variant="outline" onClick={onEditar}>
            <Pencil className="h-4 w-4 mr-2" />
            Editar
          </Button>
        )}
      </div>

      {/* Grade de informações (só mostra o que tem valor) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
        <Fato icon={MapPin} label="Cidade" value={cidadeNome} />
        <Fato icon={Building2} label="Imobiliária" value={imobNome} />
        <Fato icon={User} label="Proprietário" value={g.proprietario_nome} />
        <Fato icon={Ruler} label="Área" value={fmtArea(m2)} />
        <Fato icon={DollarSign} label="Preço" value={preco != null ? brl(preco) : null} />
        <Fato icon={DollarSign} label="R$/ha" value={precoHa != null ? brl(precoHa) : null} />
        <Fato icon={Repeat} label="Aceita permuta" value={permuta ? `${permuta}${g.percentual_permuta ? ` (${g.percentual_permuta}%)` : ""}` : null} />
        <Fato icon={FileText} label="Zona (plano diretor)" value={g.zona_plano_diretor} />
        <Fato icon={Ruler} label="Lote mínimo" value={g.tamanho_lote_minimo != null ? `${Number(g.tamanho_lote_minimo).toLocaleString("pt-BR")} m²` : null} />
        <Fato icon={CalendarDays} label="Visita" value={fmtData(g.data_visita)} />
        <Fato icon={CalendarDays} label="Fechamento" value={fmtData(g.data_fechamento)} />
        <Fato icon={DollarSign} label="VGV atribuído" value={g.vgv_atribuido != null ? brl(g.vgv_atribuido) : null} />
        <Fato icon={Navigation} label="Distância de você" value={distanciaKm != null ? `${distanciaKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : null} />
      </div>

      {/* Blocos por status */}
      {g.status === "descartada" && g.descricao_descarte && (
        <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm">
          <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Motivo do descarte</div>
          <p className="whitespace-pre-wrap">{g.descricao_descarte}</p>
        </div>
      )}
      {g.status === "standby" && g.standby_motivo && (
        <div className="rounded-md border border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/30 p-3 text-sm">
          <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
            Standby{fmtData(g.standby_inicio) ? ` · desde ${fmtData(g.standby_inicio)}` : ""}
          </div>
          <p className="whitespace-pre-wrap">{g.standby_motivo}</p>
        </div>
      )}

      {/* Comentários */}
      {g.comentarios && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1">
            <MessageSquare className="h-3 w-3" />
            Comentários
          </div>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{g.comentarios}</p>
        </div>
      )}
    </div>
  );
}
