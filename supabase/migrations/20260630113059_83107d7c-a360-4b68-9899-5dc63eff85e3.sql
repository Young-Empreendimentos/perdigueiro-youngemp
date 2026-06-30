-- Corrige silent-fail na edição de imobiliárias.
--
-- A migration 20260610193942 abriu o INSERT da tabela `imobiliarias` para
-- qualquer usuário autenticado (imobiliarias_admin_insert -> imobiliarias_authenticated_insert),
-- mas o UPDATE continuou restrito a admin (imobiliarias_admin_update). Resultado:
-- um usuário comum conseguia CRIAR uma imobiliária, mas ao EDITAR (ex.: adicionar
-- telefone/contato) o RLS não casava nenhuma linha, o UPDATE afetava 0 linhas e o
-- PostgREST retornava sucesso sem erro — o app mostrava "salvo com sucesso" sem
-- nada ter sido gravado.
--
-- Aqui espelhamos a política de INSERT: qualquer autenticado pode editar.
-- O DELETE permanece restrito a admin (exclusão é destrutiva).

DROP POLICY IF EXISTS imobiliarias_admin_update ON public.imobiliarias;

CREATE POLICY imobiliarias_authenticated_update ON public.imobiliarias
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
