import { ipcMain } from "electron";
import { IPC, type LoginRequest, type LoginResult } from "../../shared/ipc";
import { getCurrentUser, isLoginBlocked, login, logout, recordFailedLogin } from "../auth/auth-service";
import { logAudit } from "../db/audit-repo";
import { cancelCapture, isActive } from "../serial/capture-service";
import { loginSchema } from "../validation/schemas";
import { validateInput } from "./middleware";

export function registerAuthHandlers(): void {
  ipcMain.handle(
    IPC.authLogin,
    validateInput(loginSchema)((_e, req: LoginRequest): LoginResult => {
      if (isLoginBlocked(req.username)) {
        logAudit({ action: "auth.login_blocked", resourceType: "session", details: { username: req.username.trim() } });
        return { ok: false, error: "Usuário ou senha inválidos." };
      }
      const user = login(req.username.trim(), req.password);
      if (!user) {
        recordFailedLogin(req.username);
        logAudit({ action: "auth.login_failed", resourceType: "session", details: { username: req.username.trim() } });
        return { ok: false, error: "Usuário ou senha inválidos." };
      }
      logAudit({ actorUserId: user.id, action: "auth.login", resourceType: "session" });
      return { ok: true, user };
    })
  );

  ipcMain.handle(IPC.authLogout, async () => {
    const user = getCurrentUser();
    if (isActive()) {
      try {
        await Promise.race([
          cancelCapture(),
          new Promise<void>((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // ignore — logout deve prosseguir mesmo se cleanup falhar
      }
    }
    logout();
    if (user) logAudit({ actorUserId: user.id, action: "auth.logout", resourceType: "session" });
  });

  ipcMain.handle(IPC.authCurrentUser, () => getCurrentUser());
}
