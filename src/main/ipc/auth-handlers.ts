import { ipcMain } from "electron";
import { IPC, type BarcodeLoginRequest, type LoginRequest, type LoginResult } from "../../shared/ipc";
import { getCurrentUser, isLoginBlocked, login, loginByBarcode, logout, recordFailedLogin } from "../auth/auth-service";
import { logAudit } from "../db/audit-repo";
import { checkCentralDatabase } from "../db/central-connection";
import { cancelCapture, isActive } from "../serial/capture-service";
import { barcodeLoginSchema, loginSchema } from "../validation/schemas";
import { validateInput } from "./middleware";

export function registerAuthHandlers(): void {
  ipcMain.handle(
    IPC.authLogin,
    validateInput(loginSchema)(async (_e, req: LoginRequest): Promise<LoginResult> => {
      if (isLoginBlocked(req.username)) {
        return { ok: false, error: "Usuário ou senha inválidos." };
      }
      try {
        await checkCentralDatabase();
        const user = await login(req.username.trim(), req.password);
        if (!user) {
          recordFailedLogin(req.username);
          return { ok: false, error: "Usuário ou senha inválidos." };
        }
        await logAudit({ actorUserId: user.id, action: "auth.login", resourceType: "session" });
        return { ok: true, user };
      } catch (error) {
        return { ok: false, error: error instanceof Error
          ? "Falha no PostgreSQL central: " + error.message
          : "Falha na validação do PostgreSQL central." };
      }
    })
  );

  ipcMain.handle(
    IPC.authLoginBarcode,
    validateInput(barcodeLoginSchema)(async (_e, req: BarcodeLoginRequest): Promise<LoginResult> => {
      try {
        await checkCentralDatabase();
        const user = await loginByBarcode(req.barcodeValue);
        if (!user) return { ok: false, error: "Etiqueta não cadastrada." };
        await logAudit({ actorUserId: user.id, action: "auth.login_barcode", resourceType: "session" });
        return { ok: true, user };
      } catch (error) {
        return { ok: false, error: error instanceof Error
          ? "Falha no PostgreSQL central: " + error.message
          : "Falha na validação do PostgreSQL central." };
      }
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
    if (user) await logAudit({ actorUserId: user.id, action: "auth.logout", resourceType: "session" });
  });

  ipcMain.handle(IPC.authCurrentUser, () => getCurrentUser());
}
