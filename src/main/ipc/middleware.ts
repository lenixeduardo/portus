import type { IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import { getCurrentUser } from "../auth/auth-service";

export type Handler = (event: IpcMainInvokeEvent, ...args: any[]) => any;

/**
 * Middleware que requer autenticação.
 * Se não há usuário logado, lança erro.
 */
export function requireAuth(handler: Handler): Handler {
  return (event, ...args) => {
    const user = getCurrentUser();
    if (!user) {
      throw new Error("Não autenticado.");
    }
    return handler(event, ...args);
  };
}

/**
 * Middleware que requer role de administrador.
 * Se não há usuário ou role é diferente de 'admin', lança erro.
 */
export function requireAdmin(handler: Handler): Handler {
  return (event, ...args) => {
    const user = getCurrentUser();
    if (!user || user.role !== "admin") {
      throw new Error("Acesso negado.");
    }
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
          throw new Error(err.errors[0]?.message || "Validação falhou.");
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
