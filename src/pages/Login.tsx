import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2 } from "lucide-react";

export default function Login() {
  const { user, isLoading: authLoading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    const { error } = await signInWithGoogle();
    if (error) {
      toast({
        variant: "destructive",
        title: "Erro no login com Google",
        description: error.message,
      });
      setIsSubmitting(false);
    }
    // Em caso de sucesso, o navegador é redirecionado para o Google.
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Lado esquerdo - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-secondary flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-secondary-foreground">
            Young Empreendimentos
          </span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-secondary-foreground leading-tight">
            Perdigueiro
          </h1>
        </div>
      </div>

      {/* Lado direito - Login */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardHeader className="text-center space-y-2">
            <div className="lg:hidden flex justify-center mb-4">
              <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center">
                <Building2 className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Bem-vindo</CardTitle>
            <CardDescription>
              Entre com sua conta Young Empreendimentos
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <Button
              type="button"
              className="w-full"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar com Google"
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Acesso restrito a colaboradores Young Empreendimentos
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
