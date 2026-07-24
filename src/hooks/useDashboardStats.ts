import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, format, startOfWeek, endOfWeek, eachDayOfInterval, eachMonthOfInterval, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { validateGlebaStatus } from "@/lib/glebaValidation";

interface InactiveGleba {
  id: string;
  numero: number | null;
  apelido: string;
  status: string;
}

interface DashboardStats {
  totalGlebas: number;
  glebasPorStatus: Record<string, number>;
  totalPropostas: number;
  totalCidades: number;
  negociosFechados: number;
  negociosFechadosSemestre: number;
  negociosFechadosSemestreList: NegocioFechado[];
  vgvFechadoSemestre: number;
  metaVgvSemestre: number;
  propostasPorMes: { month: string; count: number }[];
  atividadesPorDia: { day: string; count: number }[];
  atividadesEstaSemana: number;
  glebasEmStandby: number;
  glebasPrioritarias: number;
  glebasInativas: InactiveGleba[];
  glebasComInfoFaltando: number;
}

interface NegocioFechado {
  id: string;
  numero: number | null;
  apelido: string;
  cidade_id: string | null;
  vgv_atribuido: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  identificada: "Identificada",
  analise_interna_realizada: "Análise Interna Realizada",
  informacoes_recebidas: "Informações Recebidas",
  visita_realizada: "Visita Realizada",
  proposta_enviada: "Proposta Enviada",
  minuta_enviada: "Minuta Enviada",
  protocolo_assinado: "Protocolo Assinado",
  descartada: "Descartada",
  proposta_recusada: "Proposta Recusada",
  negocio_fechado: "Negócio Fechado",
  standby: "Standby",
};

const PAGE_SIZE = 1000;

async function fetchAllPages<T>(createQuery: (from: number, to: number) => any): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await createQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data || []) as T[];
    allRows.push(...rows);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async (): Promise<DashboardStats> => {
      const now = new Date();

      // Calculate current semester start, but never before 2026-03-10
      const currentMonth = now.getMonth();
      const semesterStartMonth = currentMonth < 6 ? 0 : 6;
      const semesterStartDate = new Date(now.getFullYear(), semesterStartMonth, 1);
      const cutoffDate = new Date("2026-03-10T00:00:00");
      const semesterStart = semesterStartDate > cutoffDate ? semesterStartDate : cutoffDate;

      // Buscar dados em páginas de 1000 linhas para não cair no limite padrão do Supabase/PostgREST
      const [glebas, propostas, cidades, atividades, negociosSemestre, recentAtividades, metaConfig] = await Promise.all([
        fetchAllPages<any>((from, to) => supabase.from("glebas").select("id, status, prioridade, numero, apelido, cidade_id, tamanho_m2, preco, data_visita, arquivo_protocolo, motivo_descarte_id, arquivo_contrato, data_fechamento, standby_motivo").range(from, to)),
        fetchAllPages<any>((from, to) => supabase.from("propostas").select("id, data_proposta").range(from, to)),
        fetchAllPages<any>((from, to) => supabase.from("cidades").select("id").range(from, to)),
        fetchAllPages<any>((from, to) => supabase.from("atividades").select("id, data").range(from, to)),
        fetchAllPages<any>((from, to) => (supabase.from("glebas") as any).select("id, numero, apelido, cidade_id, data_fechamento, vgv_atribuido").eq("status", "negocio_fechado").gte("data_fechamento", semesterStart.toISOString().split("T")[0]).range(from, to)),
        fetchAllPages<any>((from, to) => supabase.from("atividades").select("gleba_id").gte("created_at", subDays(now, 10).toISOString()).range(from, to)),
        (supabase.from("system_config") as any).select("value").eq("key", "meta_semestre_vgv").maybeSingle(),
      ]);

      // Contadores básicos
      const totalGlebas = glebas.length;
      const totalPropostas = propostas.length;
      const totalCidades = cidades.length;

      // Glebas por status
      const glebasPorStatus: Record<string, number> = {};
      glebas.forEach((g) => {
        glebasPorStatus[g.status] = (glebasPorStatus[g.status] || 0) + 1;
      });

      const negociosFechados = glebasPorStatus["negocio_fechado"] || 0;
      const negociosFechadosSemestre = negociosSemestre.length;
      const negociosFechadosSemestreList: NegocioFechado[] = negociosSemestre.map((g: any) => ({
        id: g.id, numero: g.numero, apelido: g.apelido, cidade_id: g.cidade_id,
        vgv_atribuido: g.vgv_atribuido != null ? Number(g.vgv_atribuido) : null,
      }));
      const vgvFechadoSemestre = negociosFechadosSemestreList.reduce(
        (sum, g) => sum + (g.vgv_atribuido || 0), 0
      );
      const metaRaw = (metaConfig as any)?.data?.value;
      const metaVgvSemestre = metaRaw != null ? Number(metaRaw) || 0 : 0;
      const glebasEmStandby = glebasPorStatus["standby"] || 0;
      const glebasPrioritarias = glebas.filter((g) => g.prioridade).length;

      // Glebas com informações faltando (validação de status)
      const glebasComInfoFaltando = glebas.filter((g) => {
        const result = validateGlebaStatus(g as any);
        return !result.isValid;
      }).length;

      // Glebas inativas (sem atividade nos últimos 10 dias, excluindo descartada/negocio_fechado)
      const excludedStatuses = ["descartada", "negocio_fechado", "proposta_recusada", "standby"];
      const activeGlebaIds = new Set(
        recentAtividades.map((a) => a.gleba_id).filter(Boolean)
      );
      const glebasInativas: InactiveGleba[] = glebas
        .filter((g) => !excludedStatuses.includes(g.status) && !activeGlebaIds.has(g.id))
        .map((g) => ({ id: g.id, numero: g.numero, apelido: g.apelido, status: g.status }));

      // Propostas por mês (últimos 6 meses)
      const sixMonthsAgo = subMonths(now, 5);
      const months = eachMonthOfInterval({ start: startOfMonth(sixMonthsAgo), end: endOfMonth(now) });
      
      const propostasPorMes = months.map((month) => {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        const count = propostas.filter((p) => {
          const date = new Date(p.data_proposta);
          return date >= monthStart && date <= monthEnd;
        }).length;
        
        return {
          month: format(month, "MMM", { locale: ptBR }),
          count,
        };
      });

      // Atividades por dia (últimos 7 dias)
      const sevenDaysAgo = subDays(now, 6);
      const days = eachDayOfInterval({ start: sevenDaysAgo, end: now });
      
      const atividadesPorDia = days.map((day) => {
        const dayStr = format(day, "yyyy-MM-dd");
        const count = atividades.filter((a) => a.data === dayStr).length;
        
        return {
          day: format(day, "EEE", { locale: ptBR }),
          count,
        };
      });

      // Atividades esta semana
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      const atividadesEstaSemana = atividades.filter((a) => {
        const date = new Date(a.data);
        return date >= weekStart && date <= weekEnd;
      }).length;

      return {
        totalGlebas,
        glebasPorStatus,
        totalPropostas,
        totalCidades,
        negociosFechados,
        negociosFechadosSemestre,
        negociosFechadosSemestreList,
        vgvFechadoSemestre,
        metaVgvSemestre,
        propostasPorMes,
        atividadesPorDia,
        atividadesEstaSemana,
        glebasEmStandby,
        glebasPrioritarias,
        glebasInativas,
        glebasComInfoFaltando,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

export { STATUS_LABELS };
