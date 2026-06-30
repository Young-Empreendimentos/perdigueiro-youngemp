import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { assertAfetou } from "@/lib/db";

type Atividade = Tables<"atividades">;
type AtividadeInsert = TablesInsert<"atividades">;

export function useAtividades() {
  const queryClient = useQueryClient();

  const { data: atividades = [], isLoading } = useQuery({
    queryKey: ["atividades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atividades")
        .select(`
          *,
          gleba:glebas(id, apelido),
          tipo_atividade:tipos_atividade(id, nome)
        `)
        .order("data", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const createAtividade = useMutation({
    mutationFn: async (data: AtividadeInsert) => {
      const { error, count } = await supabase
        .from("atividades")
        .insert([data], { count: "exact" });
      if (error) throw error;
      assertAfetou(count);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["atividades"] });
    },
  });

  const updateAtividade = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Atividade> & { id: string }) => {
      const { error, count } = await supabase
        .from("atividades")
        .update(data, { count: "exact" })
        .eq("id", id);
      if (error) throw error;
      assertAfetou(
        count,
        "Não foi possível salvar: você só pode editar atividades que criou e há menos de 15 dias. Para alterar esta, peça a um administrador.",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["atividades"] });
    },
  });

  const deleteAtividade = useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase
        .from("atividades")
        .delete({ count: "exact" })
        .eq("id", id);
      if (error) throw error;
      assertAfetou(
        count,
        "Você só pode excluir atividades que criou e há menos de 15 dias. Para remover esta, peça a um administrador.",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["atividades"] });
    },
  });

  return {
    atividades,
    isLoading,
    createAtividade,
    updateAtividade,
    deleteAtividade,
  };
}

export function useAtividadesByGleba(glebaId: string | null) {
  return useQuery({
    queryKey: ["atividades", "gleba", glebaId],
    queryFn: async () => {
      if (!glebaId) return [];
      
      const { data, error } = await supabase
        .from("atividades")
        .select("*")
        .eq("gleba_id", glebaId)
        .order("data", { ascending: false });

      if (error) throw error;
      return data as Atividade[];
    },
    enabled: !!glebaId,
  });
}
