import type { AvailableUpdate } from "../shared/ipc";
import { checkForUpdateDetailed } from "./updates";

export type UpdateGateState =
  | { status: "checking" }
  | { status: "current" }
  | { status: "required"; update: AvailableUpdate }
  | { status: "error"; error: string };

let state: UpdateGateState = { status: "checking" };
let inFlight: Promise<UpdateGateState> | null = null;

export function getUpdateGateState(): UpdateGateState {
  return state;
}

export function isUpdateGateOpen(): boolean {
  return state.status === "current";
}

export function assertUpdateGateOpen(): void {
  if (!isUpdateGateOpen()) {
    throw new Error("Atualização obrigatória: verifique e instale a versão mais recente do PORTUS antes de continuar.");
  }
}

/**
 * O processo principal é a fonte da política de atualização. Resultado de rede
 * inválido nunca libera a sessão; erro de rede transitório após uma verificação
 * válida não interrompe uma sessão em andamento. Uma versão comprovadamente
 * antiga permanece bloqueada, mesmo se consultas seguintes falharem.
 */
export function verifyUpdateGate(
  installedVersion: string,
  request: (url: string, init?: RequestInit) => Promise<Response>
): Promise<UpdateGateState> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const result = await checkForUpdateDetailed(installedVersion, request);
    if (result.ok) {
      state = result.data
        ? { status: "required", update: result.data }
        : { status: "current" };
    } else if (state.status !== "current" && state.status !== "required") {
      state = { status: "error", error: result.error };
    }
    return state;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

// Apenas para builds em desenvolvimento, que não possuem release instalável.
export function allowDevelopmentWithoutUpdateCheck(): UpdateGateState {
  state = { status: "current" };
  return state;
}
