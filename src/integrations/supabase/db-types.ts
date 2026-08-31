// Shim de tipos: os tipos gerados (`types.ts`) conhecem apenas o schema public.
// As tabelas do schema "perdigueiro" (glebas, cidades, atividades, etc.) nao
// aparecem la, entao caem para `any` aqui em vez de quebrar o build.
import type {
  Database,
  Tables as PublicTables,
  TablesInsert as PublicTablesInsert,
  TablesUpdate as PublicTablesUpdate,
  Enums as PublicEnums,
} from "./types";

type PublicTableName = keyof Database["public"]["Tables"];
type PublicEnumName = keyof Database["public"]["Enums"];

export type Tables<T extends string> = T extends PublicTableName ? PublicTables<T> : any;
export type TablesInsert<T extends string> = T extends PublicTableName ? PublicTablesInsert<T> : any;
export type TablesUpdate<T extends string> = T extends PublicTableName ? PublicTablesUpdate<T> : any;
export type Enums<T extends string> = T extends PublicEnumName ? PublicEnums<T> : any;

export type { Database };
