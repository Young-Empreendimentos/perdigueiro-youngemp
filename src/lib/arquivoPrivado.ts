import { supabase } from "@/integrations/supabase/client";

/**
 * Buckets PRIVADOS do Perdigueiro. O app grava nas glebas o endereço público do arquivo
 * (`/storage/v1/object/public/<bucket>/...`), mas em bucket privado esse endereço não abre
 * ("Bucket not found"). Para abrir, é preciso gerar um link temporário (signed URL), o que só
 * funciona para quem tem permissão no Storage (membros do Perdigueiro, desde 10/11/2026).
 */
export const BUCKETS_PRIVADOS = ["protocolos", "contratos", "propostas"];

export function ehBucketPrivado(bucket: string): boolean {
  return BUCKETS_PRIVADOS.includes(bucket);
}

/** Caminho do arquivo dentro do bucket, a partir do que está gravado (endereço público, assinado ou só o caminho). */
export function caminhoNoBucket(valor: string, bucket: string): string {
  const m = valor.match(new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/([^?#]+)`));
  if (!m) return valor;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Gera um link temporário (padrão: 1 hora) para um arquivo de bucket privado. */
export async function linkTemporario(bucket: string, valor: string, segundos = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(caminhoNoBucket(valor, bucket), segundos);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Abre em outra aba um arquivo de bucket privado. A aba é aberta na hora do clique (antes de gerar o link),
 * para o navegador não bloquear como pop-up. Devolve false se não conseguiu gerar o link.
 */
export async function abrirArquivoPrivado(bucket: string, valor: string): Promise<boolean> {
  const aba = window.open("", "_blank");
  const url = await linkTemporario(bucket, valor);
  if (!url) {
    aba?.close();
    return false;
  }
  if (aba) {
    aba.opener = null;
    aba.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return true;
}
