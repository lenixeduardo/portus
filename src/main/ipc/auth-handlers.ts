import { ipcMain } from "electron";
import { IPC, type LoginRequest, type LoginResult } from "../../shared/ipc";
import { getCurrentUser, login, logout } from "../auth/auth-service";

export function registerAuthHandlers(): void {
  ipcMain.handle(IPC.authLogin, (_e, req: LoginRequest): LoginResult => {
    if (!req?.username || !req?.password) {
      return { ok: false, error: "Informe usuário e senha." };
    }
    const user = login(req.username.trim(), req.password);
    if (!user) return { ok: false, error: "Usuário ou senha inválidos." };
    return { ok: true, user };
  });

  ipcMain.handle(IPC.authLogout, () => {
    logout();
  });

  ipcMain.handle(IPC.authCurrentUser, () => getCurrentUser());
}
