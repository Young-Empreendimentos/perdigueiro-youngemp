import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Clock, LogOut } from "lucide-react";

/**
 * Tela mostrada a quem está logado mas NÃO é membro do Perdigueiro.
 * Registra a tentativa de acesso (uma vez por sessão) para que os admins
 * (ex.: Eduardo) vejam a solicitação e possam autorizar.
 */
export function AguardandoAutorizacao() {
  const { user, signOut } = useAuth();
  const registrado = useRef(false);

  useEffect(() => {
    if (!user || registrado.current) return;
    registrado.current = true;

    const chave = `perdigueiro_tentativa_${user.id}`;
    if (sessionStorage.getItem(chave)) return;
    sessionStorage.setItem(chave, "1");

    supabase
      .from("perdigueiro_tentativas_acesso" as any)
      .insert({
        user_id: user.id,
        email: user.email ?? null,
        nome: (user.user_metadata as any)?.full_name ?? null,
      })
      .then(({ error }: { error: unknown }) => {
        if (error) console.error("Erro ao registrar tentativa de acesso:", error);
      });
  }, [user]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-6">
      <div className="max-w-md text-center space-y-6">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-primary flex items-center justify-center">
          <Clock className="h-7 w-7 text-primary-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Não foi possível entrar</h1>
          <p className="text-muted-foreground">
            Seu acesso ao Perdigueiro ainda não foi liberado. Sua solicitação foi
            registrada e está <strong>aguardando autorização da direção</strong>.
            Você será avisado quando for aprovado.
          </p>
        </div>
        <Button variant="outline" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );
}
