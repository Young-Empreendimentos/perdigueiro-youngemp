// Desativada em 10/11/2026 (Perdigueiro, decisão da Elen): o app não chama esta função e nenhum outro sistema usa
// (conferido nos repositórios, agendamentos, funções do banco e fluxos n8n exportados).
// Ela apagava o login de qualquer pessoa da Young, bastando ser admin geral (user_roles).
// O código antigo está em "banco de dados/backup/edges_perdigueiro_2026-11-10" e no histórico do GitHub
// (Young-Empreendimentos/perdigueiro-youngemp). Pode ser apagada de vez no painel do Supabase.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "Função desativada" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
