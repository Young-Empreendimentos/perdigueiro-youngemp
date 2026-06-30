import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { assertAfetou } from "@/lib/db";

type Imobiliaria = Tables<"imobiliarias">;
type ImobiliariaInsert = TablesInsert<"imobiliarias">;

export function useImobiliarias() {
  const queryClient = useQueryClient();

  const { data: imobiliarias = [], isLoading } = useQuery({
    queryKey: ["imobiliarias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imobiliarias")
        .select("*")
        .eq("ativo", true)
        .order("nome");

      if (error) throw error;
      return data as Imobiliaria[];
    },
  });

  // Also fetch gleba counts per imobiliaria
  const { data: glebaCounts = {} } = useQuery({
    queryKey: ["imobiliarias-gleba-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("glebas")
        .select("imobiliaria_id");

      if (error) throw error;

      const counts: Record<string, number> = {};
      data.forEach((gleba) => {
        if (gleba.imobiliaria_id) {
          counts[gleba.imobiliaria_id] = (counts[gleba.imobiliaria_id] || 0) + 1;
        }
      });
      return counts;
    },
  });

  const createImobiliaria = useMutation({
    mutationFn: async (data: ImobiliariaInsert) => {
      const { error, count } = await supabase
        .from("imobiliarias")
        .insert([{ ...data, ativo: true }], { count: "exact" });
      if (error) throw error;
      assertAfetou(count);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imobiliarias"] });
    },
  });

  const updateImobiliaria = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Imobiliaria> & { id: string }) => {
      const { error, count } = await supabase
        .from("imobiliarias")
        .update(data, { count: "exact" })
        .eq("id", id);
      if (error) throw error;
      assertAfetou(
        count,
        "Não foi possível salvar: esta imobiliária não foi encontrada. Ela pode ter sido removida — atualize a página e tente novamente.",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imobiliarias"] });
    },
  });

  const deleteImobiliaria = useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase
        .from("imobiliarias")
        .delete({ count: "exact" })
        .eq("id", id);
      if (error) throw error;
      assertAfetou(count, "Apenas administradores podem excluir imobiliárias.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imobiliarias"] });
    },
  });

  return {
    imobiliarias,
    isLoading,
    glebaCounts,
    createImobiliaria,
    updateImobiliaria,
    deleteImobiliaria,
  };
}
