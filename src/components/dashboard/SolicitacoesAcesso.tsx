import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

interface Tentativa {
  id: string;
  user_id: string;
  email: string | null;
  nome: string | null;
  tentou_em: string;
}

/**
 * Aviso para os admins do Perdigueiro (ex.: Eduardo): mostra quem tentou entrar
 * e está aguardando autorização. Só admins enxergam linhas (garantido pelo RLS
 * da tabela perdigueiro_tentativas_acesso); para os demais, renderiza nada.
 */
export function SolicitacoesAcesso() {
  const queryClient = useQueryClient();

  const { data: pendentes } = useQuery({
    queryKey: ["perdigueiro-tentativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perdigueiro_tentativas_acesso" as any)
        .select("id, user_id, email, nome, tentou_em")
        .eq("resolvido", false)
        .order("tentou_em", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Tentativa[];
    },
  });

  const autorizar = useMutation({
    mutationFn: async (t: Tentativa) => {
      // upsert: reativa quem já era membro (ex.: estava desativado) preservando o nível;
      // ou cria novo (nível 'user' por padrão). Evita erro de chave duplicada.
      const { error } = await supabase
        .from("perdigueiro_membros" as any)
        .upsert(
          { user_id: t.user_id, nome: t.nome, email: t.email, ativo: true },
          { onConflict: "user_id" }
        );
      if (error) throw error;
      await supabase
        .from("perdigueiro_tentativas_acesso" as any)
        .delete()
        .eq("id", t.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perdigueiro-tentativas"] });
      queryClient.invalidateQueries({ queryKey: ["perdigueiro-membros"] });
      toast.success("Acesso ao Perdigueiro liberado!");
    },
    onError: (error: any) => {
      console.error("Erro ao autorizar acesso:", error);
      toast.error(error.message || "Erro ao autorizar acesso");
    },
  });

  const dispensar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("perdigueiro_tentativas_acesso" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perdigueiro-tentativas"] });
      toast.success("Solicitação dispensada.");
    },
    onError: (error: any) => {
      console.error("Erro ao dispensar solicitação:", error);
      toast.error(error.message || "Erro ao dispensar solicitação");
    },
  });

  if (!pendentes || pendentes.length === 0) return null;

  return (
    <Card className="border-amber-500/50 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-amber-600" />
          Solicitações de acesso
          <Badge variant="secondary" className="ml-auto">{pendentes.length}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pessoas que tentaram entrar no Perdigueiro e aguardam sua autorização
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {pendentes.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{t.nome || t.email || "—"}</p>
              {t.email && <p className="text-xs text-muted-foreground truncate">{t.email}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={() => autorizar.mutate(t)} disabled={autorizar.isPending}>
                <UserPlus className="mr-1 h-4 w-4" />
                Autorizar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dispensar.mutate(t.id)}
                disabled={dispensar.isPending}
                title="Dispensar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
