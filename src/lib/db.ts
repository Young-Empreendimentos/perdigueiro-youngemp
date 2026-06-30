/**
 * Erro lançado quando uma escrita no Supabase não afeta nenhuma linha.
 *
 * No PostgREST, um INSERT/UPDATE/DELETE bloqueado pelo RLS (sem permissão) ou
 * que não encontra a linha **não retorna erro** — ele simplesmente afeta 0
 * linhas. Sem checar isso, o app exibiria "salvo com sucesso" sem nada ter sido
 * gravado. Use `assertAfetou` com a opção `{ count: "exact" }` para transformar
 * esse silêncio em um erro de verdade.
 */
export class SemPermissaoError extends Error {
  constructor(
    message = "Você não tem permissão para esta ação (ou o registro não existe mais). Nada foi salvo.",
  ) {
    super(message);
    this.name = "SemPermissaoError";
  }
}

/**
 * Garante que a escrita afetou ao menos uma linha.
 *
 * `count` vem da resposta de uma query feita com `{ count: "exact" }`. Optamos
 * por `count` em vez de `.select()` de propósito: `.select()` depende da
 * política de SELECT (em `user_roles`, por exemplo, o SELECT é restrito e
 * daria falso negativo), enquanto `count` reflete as linhas efetivamente
 * afetadas pela escrita.
 */
export function assertAfetou(count: number | null): void {
  if (!count) {
    throw new SemPermissaoError();
  }
}
