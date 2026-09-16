import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, perdigueiroDb } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/db-types";

type Gleba = Tables<"glebas">;

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

const STATUS_ORDER = [
  "identificada",
  "informacoes_recebidas",
  "analise_interna_realizada",
  "proposta_enviada",
  "minuta_enviada",
  "protocolo_assinado",
  "descartada",
  "proposta_recusada",
  "negocio_fechado",
  "standby",
];

// O PostgREST corta cada request em 1000 linhas ("Max rows" do Supabase), e um
// .range(0, 99999) numa tirada só NÃO fura esse teto. Como as glebas passam de
// 1000, buscamos em páginas de 1000 até vir uma página incompleta. O .order("id")
// no fim garante ordem total (desempate) para a paginação não pular/duplicar.
const PAGE_SIZE = 1000;

export function useGlebas() {
  const { data: glebas = [], isLoading, refetch } = useQuery({
    queryKey: ["glebas"],
    queryFn: async () => {
      const all: Gleba[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await perdigueiroDb
          .from("glebas")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        const rows = (data || []) as Gleba[];
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      return all;
    },
  });

  const updateGlebaStatus = async (glebaId: string, newStatus: string) => {
    const updateData: any = { status: newStatus };
    if (newStatus === "negocio_fechado") {
      updateData.data_fechamento = new Date().toISOString().split("T")[0];
    }
    const { error } = await perdigueiroDb
      .from("glebas")
      .update(updateData)
      .eq("id", glebaId);

    if (error) throw error;
    await refetch();
  };

  const createGleba = async (data: Partial<Gleba> & { apelido: string; status: string }) => {
    const { error } = await perdigueiroDb.from("glebas").insert([data as any]);
    if (error) throw error;
    await refetch();
  };

  const updateGleba = async (glebaId: string, data: Partial<Gleba>) => {
    const { error } = await perdigueiroDb
      .from("glebas")
      .update(data)
      .eq("id", glebaId);

    if (error) throw error;
    await refetch();
  };

  const deleteGleba = async (glebaId: string) => {
    const { error } = await perdigueiroDb
      .from("glebas")
      .delete()
      .eq("id", glebaId);

    if (error) throw error;
    await refetch();
  };

  const getGlebasByStatus = (status: string) => {
    return glebas.filter((g) => g.status === status);
  };

  return {
    glebas,
    isLoading,
    refetch,
    updateGlebaStatus,
    createGleba,
    updateGleba,
    deleteGleba,
    getGlebasByStatus,
  };
}

export { STATUS_LABELS, STATUS_ORDER };