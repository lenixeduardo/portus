import { ipcMain } from "electron";
import { IPC, type LoginRequest, type LoginResult } from "../../shared/ipc";
import { getCurrentUser, login, logout } from "../auth/auth-service";
import { cancelCapture, isActive } from "../serial/capture-service";
import { loginSchema } from "../validation/schemas";
import { validateInput } from "./middleware";

export function registerAuthHandlers(): void {
  ipcMain.handle(
    IPC.authLogin,
    validateInput(loginSchema)((_e, req: LoginRequest): LoginResult => {
      const user = login(req.username.trim(), req.password);
      if (!user) return { ok: false, error: "Usuário ou senha inválidos." };
      return { ok: true, user };
    })
  );

  ipcMain.handle(IPC.authLogout, async () => {
    if (isActive()) {
      await cancelCapture();
    }
    logout();
  });

  ipcMain.handle(IPC.authCurrentUser, () => getCurrentUser());
}
