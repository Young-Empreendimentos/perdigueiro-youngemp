import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Users, Plus, Trash2, Shield, ShieldCheck, Loader2, Pencil, Check, X, RefreshCw, MapPin, ChevronDown, FileType } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ReportConfigCard } from "@/components/configuracoes/ReportConfigCard";
import { useTiposArquivo } from "@/hooks/useTiposArquivo";

// Usuário do portal (login compartilhado). Usado SOMENTE em leitura, para escolher
// quem adicionar à lista do Perdigueiro. Esta tela nunca cria/edita/apaga esse cadastro.
interface UserWithRole {
  id: string;
  email: string;
  role: "admin" | "user";
  created_at: string;
  nome: string;
}

// Membro do Perdigueiro — a fonte da verdade de quem acessa este sistema.
interface Membro {
  id: string;
  user_id: string;
  nome: string | null;
  email: string | null;
  ativo: boolean;
  nivel: "admin" | "user";
  created_at: string;
}

export default function Configuracoes() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [newMemberNivel, setNewMemberNivel] = useState<"admin" | "user">("user");

  // Lista de membros do Perdigueiro (tabela nova, dedicada).
  const { data: membros, isLoading } = useQuery({
    queryKey: ["perdigueiro-membros"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perdigueiro_membros" as any)
        .select("id, user_id, nome, email, ativo, nivel, created_at")
        .eq("ativo", true)
        .order("nome");

      if (error) {
        console.error("Erro ao buscar membros:", error);
        throw error;
      }

      return (data || []) as unknown as Membro[];
    },
  });

  // Usuários que já têm login no portal (somente leitura) — para o seletor de "adicionar".
  // Não modificamos nada aqui; só lemos quem existe para poder pôr na lista do Perdigueiro.
  const { data: portalUsers } = useQuery({
    queryKey: ["portal-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_all_users_with_roles" as any);
      if (error) {
        console.error("Erro ao buscar usuários do portal:", error);
        throw error;
      }
      return (data || []) as UserWithRole[];
    },
  });

  const membrosUserIds = new Set((membros || []).map((m) => m.user_id));
  const candidatos = (portalUsers || []).filter((u) => !membrosUserIds.has(u.id));

  // Adiciona alguém (que já tem login) à lista do Perdigueiro.
  const addMember = useMutation({
    mutationFn: async (userId: string) => {
      const u = (portalUsers || []).find((x) => x.id === userId);
      // upsert: se a pessoa já tem linha (ex.: estava desativada), reativa; senão, cria.
      const { error, count } = await supabase
        .from("perdigueiro_membros" as any)
        .upsert(
          { user_id: userId, nome: u?.nome ?? null, email: u?.email ?? null, nivel: newMemberNivel, ativo: true },
          { onConflict: "user_id", count: "exact" }
        );

      if (error) throw error;
      if (!count) throw new Error("Não foi possível adicionar (sem permissão de admin?).");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perdigueiro-membros"] });
      toast.success("Membro adicionado ao Perdigueiro!");
      setAddDialogOpen(false);
      setSelectedUserId("");
      setNewMemberNivel("user");
    },
    onError: (error: any) => {
      console.error("Erro ao adicionar membro:", error);
      toast.error(error.message || "Erro ao adicionar membro");
    },
  });

  // Remover da lista = DESATIVA (ativo=false), não apaga a linha. Preserva o histórico;
  // a pessoa pode ser readicionada OU pedir acesso de volta (e ser reativada na aprovação).
  // NÃO toca no login do portal — ela continua nos outros sistemas.
  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase
        .from("perdigueiro_membros" as any)
        .update({ ativo: false }, { count: "exact" })
        .eq("id", id);

      if (error) throw error;
      if (!count) throw new Error("Nada foi alterado (sem permissão de admin?).");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perdigueiro-membros"] });
      toast.success("Membro removido do Perdigueiro.");
    },
    onError: (error: any) => {
      console.error("Erro ao remover membro:", error);
      toast.error(error.message || "Erro ao remover membro");
    },
  });

  // Muda o nível (admin/usuário) de um membro — grava só na tabela nova.
  const updateNivel = useMutation({
    mutationFn: async ({ id, nivel }: { id: string; nivel: "admin" | "user" }) => {
      const { error, count } = await supabase
        .from("perdigueiro_membros" as any)
        .update({ nivel }, { count: "exact" })
        .eq("id", id);
      if (error) throw error;
      if (!count) throw new Error("Nada foi alterado (sem permissão de admin?).");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perdigueiro-membros"] });
      toast.success("Nível atualizado!");
    },
    onError: (error: any) => {
      console.error("Erro ao atualizar nível:", error);
      toast.error(error.message || "Erro ao atualizar nível");
    },
  });

  return (
    <div className="space-y-6">

      {/* Membros do Perdigueiro */}
      <Collapsible defaultOpen>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CollapsibleTrigger className="flex-1 text-left group">
                <CardTitle className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                  <Users className="h-5 w-5" />
                  Membros do Perdigueiro
                </CardTitle>
                <CardDescription className="ml-10">
                  Somente as pessoas desta lista acessam os dados do Perdigueiro. As demais
                  continuam no portal e nos outros sistemas — só não veem este.
                </CardDescription>
              </CollapsibleTrigger>
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Membro
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar membro ao Perdigueiro</DialogTitle>
                    <DialogDescription>
                      Escolha uma pessoa que já tem login no portal. Ela passará a acessar o
                      Perdigueiro. Isto não cria um novo login nem altera os outros sistemas.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="pessoa">Pessoa</Label>
                      <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                        <SelectTrigger id="pessoa">
                          <SelectValue placeholder="Selecione uma pessoa..." />
                        </SelectTrigger>
                        <SelectContent>
                          {candidatos.length === 0 ? (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              Todos os usuários do portal já estão na lista.
                            </div>
                          ) : (
                            candidatos.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.nome ? `${u.nome} — ${u.email}` : u.email}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="nivel">Nível de acesso</Label>
                      <Select value={newMemberNivel} onValueChange={(v) => setNewMemberNivel(v as "admin" | "user")}>
                        <SelectTrigger id="nivel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              Usuário
                            </div>
                          </SelectItem>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4" />
                              Administrador
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Usuário: cria e edita registros. Administrador: acesso total ao Perdigueiro (inclusive esta tela).
                      </p>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => addMember.mutate(selectedUserId)}
                      disabled={!selectedUserId || addMember.isPending}
                    >
                      {addMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Adicionar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !membros || membros.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum membro cadastrado
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Nível</TableHead>
                      <TableHead>Na lista desde</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membros.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.email || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{m.nome || "—"}</TableCell>
                        <TableCell>
                          <Select
                            value={m.nivel}
                            onValueChange={(v) => updateNivel.mutate({ id: m.id, nivel: v as "admin" | "user" })}
                            disabled={m.user_id === currentUser?.id}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">
                                <Badge variant="secondary" className="gap-1">
                                  <Shield className="h-3 w-3" />
                                  Usuário
                                </Badge>
                              </SelectItem>
                              <SelectItem value="admin">
                                <Badge variant="default" className="gap-1">
                                  <ShieldCheck className="h-3 w-3" />
                                  Admin
                                </Badge>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          {m.user_id !== currentUser?.id && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover do Perdigueiro?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    "{m.nome || m.email}" deixará de acessar o Perdigueiro. O login
                                    continua ativo e os outros sistemas não são afetados.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => removeMember.mutate(m.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Remover
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Meta VGV Semestral */}
      <MetaVgvCard />

      {/* Tipos de Arquivo */}
      <TiposArquivoCard />

      {/* Relatórios */}
      <ReportConfigCard />

      {/* Reprocessar KMZs */}
      <ReprocessKmzCard />
    </div>
  );
}

function TiposArquivoCard() {
  const { tiposArquivo, isLoading, createTipo, updateTipo, deleteTipo } = useTiposArquivo();
  const [newNome, setNewNome] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNome, setEditingNome] = useState("");

  const handleCreate = async () => {
    if (!newNome.trim()) return;
    try {
      await createTipo.mutateAsync(newNome.trim());
      setNewNome("");
      toast.success("Tipo de arquivo criado!");
    } catch {
      toast.error("Erro ao criar tipo de arquivo");
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editingNome.trim()) return;
    try {
      await updateTipo.mutateAsync({ id, nome: editingNome.trim() });
      setEditingId(null);
      toast.success("Tipo atualizado!");
    } catch {
      toast.error("Erro ao atualizar tipo");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTipo.mutateAsync(id);
      toast.success("Tipo removido!");
    } catch {
      toast.error("Erro ao remover tipo. Verifique se não está em uso.");
    }
  };

  return (
    <Collapsible>
      <Card>
        <CardHeader>
          <CollapsibleTrigger className="flex-1 text-left group">
            <CardTitle className="flex items-center gap-2">
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
              <FileType className="h-5 w-5" />
              Tipos de Arquivo
            </CardTitle>
            <CardDescription className="ml-10">
              Gerencie os tipos de arquivo que podem ser atribuídos aos anexos das glebas
            </CardDescription>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Novo tipo de arquivo..."
                value={newNome}
                onChange={(e) => setNewNome(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <Button onClick={handleCreate} disabled={createTipo.isPending || !newNome.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                Criar
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tiposArquivo.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum tipo cadastrado</p>
            ) : (
              <div className="space-y-1">
                {tiposArquivo.map((tipo) => (
                  <div key={tipo.id} className="flex items-center justify-between gap-2 bg-muted/50 rounded-md px-3 py-2 group">
                    {editingId === tipo.id ? (
                      <div className="flex items-center gap-1 flex-1">
                        <Input
                          value={editingNome}
                          onChange={(e) => setEditingNome(e.target.value)}
                          className="h-8"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleUpdate(tipo.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleUpdate(tipo.id)}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm">{tipo.nome}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => { setEditingId(tipo.id); setEditingNome(tipo.nome); }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir tipo de arquivo?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  O tipo "{tipo.nome}" será removido. Isso só é possível se nenhum anexo estiver usando este tipo.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(tipo.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function ReprocessKmzCard() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ apelido: string; success: boolean; message: string }[]>([]);
  const queryClient = useQueryClient();

  const { data: pendingGlebas, isLoading } = useQuery({
    queryKey: ["glebas-sem-poligono"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("glebas")
        .select("id, apelido, arquivo_kmz")
        .not("arquivo_kmz", "is", null)
        .is("poligono_geojson", null);
      if (error) throw error;
      return data || [];
    },
  });

  const handleReprocess = useCallback(async () => {
    if (!pendingGlebas || pendingGlebas.length === 0) return;
    setIsProcessing(true);
    setResults([]);
    setProgress({ current: 0, total: pendingGlebas.length });

    const newResults: typeof results = [];

    for (let i = 0; i < pendingGlebas.length; i++) {
      const gleba = pendingGlebas[i];
      setProgress({ current: i + 1, total: pendingGlebas.length });

      try {
        const { data, error } = await supabase.functions.invoke("process-kmz", {
          body: { kmzUrl: gleba.arquivo_kmz, glebaApelido: gleba.apelido },
        });

        if (error) throw error;

        if (data?.success && data.geojson) {
          const { error: updateError } = await supabase
            .from("glebas")
            .update({ poligono_geojson: data.geojson } as any)
            .eq("id", gleba.id);

          if (updateError) throw updateError;
          newResults.push({ apelido: gleba.apelido, success: true, message: "Polígono extraído" });
        } else {
          newResults.push({ apelido: gleba.apelido, success: false, message: data?.warning || "Sem polígono no arquivo" });
        }
      } catch (err: any) {
        newResults.push({ apelido: gleba.apelido, success: false, message: err.message || "Erro" });
      }

      setResults([...newResults]);
    }

    setIsProcessing(false);
    queryClient.invalidateQueries({ queryKey: ["glebas"] });
    queryClient.invalidateQueries({ queryKey: ["glebas-sem-poligono"] });

    const successCount = newResults.filter((r) => r.success).length;
    toast.success(`Reprocessamento concluído: ${successCount}/${pendingGlebas.length} polígonos extraídos`);
  }, [pendingGlebas, queryClient]);

  const pendingCount = pendingGlebas?.length || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Reprocessar KMZs
            </CardTitle>
            <CardDescription>
              Extrair polígonos de glebas que possuem KMZ mas não têm polígono salvo
            </CardDescription>
          </div>
          <Button
            onClick={handleReprocess}
            disabled={isProcessing || isLoading || pendingCount === 0}
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {isProcessing
              ? `${progress.current}/${progress.total}`
              : `Reprocessar (${pendingCount})`}
          </Button>
        </div>
      </CardHeader>
      {results.length > 0 && (
        <CardContent>
          <div className="space-y-1 max-h-48 overflow-y-auto text-sm">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                {r.success ? (
                  <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                ) : (
                  <X className="h-3.5 w-3.5 text-destructive shrink-0" />
                )}
                <span className="font-medium truncate">{r.apelido}</span>
                <span className="text-muted-foreground text-xs truncate ml-auto">{r.message}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function MetaVgvCard() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");

  const { data: meta, isLoading } = useQuery({
    queryKey: ["system_config", "meta_semestre_vgv"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("system_config") as any)
        .select("value")
        .eq("key", "meta_semestre_vgv")
        .maybeSingle();
      if (error) throw error;
      const raw = data?.value;
      return raw != null ? Number(raw) || 0 : 0;
    },
  });

  const saveMeta = useMutation({
    mutationFn: async (value: number) => {
      const { error } = await (supabase.from("system_config") as any).upsert(
        { key: "meta_semestre_vgv", value: String(value) },
        { onConflict: "key" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system_config", "meta_semestre_vgv"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Meta atualizada");
      setEditing(false);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const formatBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  const startEdit = () => {
    setDraft(meta ? String(meta) : "");
    setEditing(true);
  };

  const handleSave = () => {
    const n = Number(draft.replace(/\./g, "").replace(",", "."));
    if (!isFinite(n) || n < 0) {
      toast.error("Informe um valor válido");
      return;
    }
    saveMeta.mutate(n);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle>Meta de VGV do Semestre</CardTitle>
            <CardDescription>
              Valor Geral de Venda alvo. O atingimento considera todos os negócios fechados dentro do semestre corrente e seus VGV atribuídos.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : editing && isAdmin ? (
          <div className="flex items-end gap-2 max-w-md">
            <div className="flex-1">
              <Label htmlFor="meta-vgv">Meta (R$)</Label>
              <Input
                id="meta-vgv"
                type="number"
                step="0.01"
                min={0}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ex: 25000000"
              />
            </div>
            <Button onClick={handleSave} disabled={saveMeta.isPending}>
              {saveMeta.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">
              {meta && meta > 0 ? formatBRL(meta) : <span className="text-muted-foreground text-base font-normal">Meta não definida</span>}
            </span>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="h-3 w-3 mr-1" /> Editar
              </Button>
            )}
          </div>
        )}
        {!isAdmin && (
          <p className="text-xs text-muted-foreground mt-2">Somente a diretoria pode editar este valor.</p>
        )}
      </CardContent>
    </Card>
  );
}
