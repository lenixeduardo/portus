import type { IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import { getCurrentUser, touchSession, logout } from "../auth/auth-service";
import { centralQuery } from "../db/central-connection";

export type Handler = (event: IpcMainInvokeEvent, ...args: any[]) => any;

/**
 * Middleware que requer autenticação.
 * Se não há usuário logado, lança erro.
 */
interface CurrentCentralIdentity {
  id: number | string;
  role: string;
  sector_code: "PRODUCTION" | "LABORATORY";
}

async function verifiedIdentity(requireAdministrator: boolean): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error("Não autenticado.");

  const result = await centralQuery<CurrentCentralIdentity>(
    "SELECT id, role, sector_code FROM users WHERE id=$1 AND active LIMIT 1",
    [user.id]
  );
  const row = result.rows[0];
  const realRole = row?.role === "laboratory" ? "operator" : row?.role;
  if (!row || realRole !== user.role || row.sector_code !== user.sectorCode) {
    logout();
    throw new Error("Sessão revogada ou perfil alterado. Faça login novamente.");
  }
  if (requireAdministrator && realRole !== "admin" && realRole !== "master") {
    throw new Error("Acesso negado.");
  }
  touchSession();
}

/** Valida a sessão diretamente no PostgreSQL; não existe fallback offline. */
export function requireAuth(handler: Handler): Handler {
  return async (event, ...args) => {
    await verifiedIdentity(false);
    return handler(event, ...args);
  };
}

/** Evita privilégios antigos após alterações de perfis em outra estação. */
export function requireAdmin(handler: Handler): Handler {
  return async (event, ...args) => {
    await verifiedIdentity(true);
    return handler(event, ...args);
  };
}

/**
 * Middleware que valida entrada com Zod schema.
 * Recebe um handler que espera apenas o payload validado (sem event).
 */
export function validateInput<T>(schema: z.ZodSchema<T>) {
  return (handler: (event: IpcMainInvokeEvent, data: T) => any) => {
    return (event: IpcMainInvokeEvent, input: unknown) => {
      try {
        const data = schema.parse(input);
        return handler(event, data);
      } catch (err) {
        if (err instanceof z.ZodError) {
          // Retorna o primeiro erro de validação
          const firstIssue = err.issues[0];
          throw new Error(firstIssue?.message || "Validação falhou.");
        }
        throw err;
      }
    };
  };
}

/**
 * Composição de middlewares.
 * Aplica múltiplos middlewares a um handler.
 * Ex.: compose([requireAuth, requireAdmin, validateInput(schema)])(handler)
 */
export function compose(middlewares: Array<(h: Handler) => Handler>) {
  return (handler: Handler): Handler => {
    return middlewares.reduceRight((fn, middleware) => middleware(fn), handler);
  };
}
