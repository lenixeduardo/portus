import { ipcMain } from "electron";
import { z } from "zod";
import { IPC, type BarcodeUserRegistrationInput, type ServiceResult } from "../../shared/ipc";
import type { User } from "../../shared/types";
import { isUserBarcode, normalizeUserBarcode } from "../../shared/user-barcode";
import { getCurrentUser } from "../auth/auth-service";
import { logAudit } from "../db/audit-repo";
import {
  createCentralUser,
  deactivateCentralUser,
  getCentralUserByBarcode,
  getCentralUserById,
  listCentralUsers,
  updateCentralUserPassword
} from "../db/central-users-repo";
import { generateUniqueUsername } from "../users/barcode-user-registration";
import {
  changePasswordSchema,
  createUserSchema,
  deleteUserSchema,
  type ChangePasswordInput,
  type DeleteUserInput
} from "../validation/schemas";
import { compose, requireAdmin, requireAuth, validateInput } from "./middleware";

const createUserWithDisplayNameSchema = z.intersection(
  createUserSchema,
  z.object({
    displayName: z.string().trim().min(1, "Informe o nome do usuário").max(120).optional()
  })
);
type CreateUserInput = z.infer<typeof createUserWithDisplayNameSchema>;

const barcodeUserRegistrationSchema = z.object({
  barcode: z.string().trim().min(3).max(64)
    .refine(isUserBarcode, "A etiqueta deve conter um identificador textual válido."),
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(100),
  profile: z.enum(["production", "laboratory_capture"])
});

const barcodeLookupSchema = z.object({
  barcodeValue: z.string().trim().min(3).max(64)
});

function failed(error: unknown): string {
  return error instanceof Error ? error.message : "Erro ao consultar PostgreSQL central.";
}

export function registerUsersHandlers(): void {
  ipcMain.handle(
    IPC.usersList,
    compose([requireAdmin])(async (): Promise<User[]> => listCentralUsers())
  );

  ipcMain.handle(
    IPC.usersFindByBarcode,
    compose([requireAuth, validateInput(barcodeLookupSchema)])(
      async (_e, input: { barcodeValue: string }): Promise<User | null> =>
        getCentralUserByBarcode(input.barcodeValue)
    )
  );

  ipcMain.handle(
    IPC.usersCreate,
    compose([requireAdmin, validateInput(createUserWithDisplayNameSchema)])(
      async (_e, input: CreateUserInput): Promise<ServiceResult<User>> => {
        const actor = getCurrentUser();
        if (!actor) return { ok: false, error: "Sessão expirada." };
        if (input.role === "master" && actor.role !== "master") {
          return { ok: false, error: "Somente Master pode criar outro perfil Master." };
        }
        try {
          const user = await createCentralUser(input);
          logAudit({
            actorUserId: actor.id, action: "users.create",
            resourceType: "user", resourceId: user.id,
            details: { username: user.username, sectorCode: user.sectorCode }
          });
          return { ok: true, data: user };
        } catch (error) {
          return { ok: false, error: failed(error) };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.usersRegisterBarcode,
    compose([requireAdmin, validateInput(barcodeUserRegistrationSchema)])(
      async (_e, input: BarcodeUserRegistrationInput): Promise<ServiceResult<User>> => {
        const actor = getCurrentUser();
        if (!actor) return { ok: false, error: "Sessão expirada." };
        try {
          const barcode = normalizeUserBarcode(input.barcode);
          if (await getCentralUserByBarcode(barcode)) {
            return { ok: false, error: "Esta etiqueta já está vinculada a um usuário." };
          }
          const existing = new Set((await listCentralUsers()).map(u => u.username.toLowerCase()));
          const username = generateUniqueUsername(
            input.displayName,
            candidate => existing.has(candidate.toLowerCase())
          );
          const laboratory = input.profile === "laboratory_capture";
          const user = await createCentralUser({
            username,
            password: input.password,
            displayName: input.displayName,
            role: "operator",
            sectorCode: laboratory ? "LABORATORY" : "PRODUCTION",
            laboratoryProfile: laboratory ? "capture" : undefined
          }, barcode);
          logAudit({
            actorUserId: actor.id, action: "users.create_barcode",
            resourceType: "user", resourceId: user.id,
            details: { username: user.username, sectorCode: user.sectorCode }
          });
          return { ok: true, data: user };
        } catch (error) {
          return { ok: false, error: failed(error) };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.usersChangePassword,
    compose([requireAuth, validateInput(changePasswordSchema)])(
      async (_e, input: ChangePasswordInput): Promise<ServiceResult<true>> => {
        const actor = getCurrentUser();
        if (!actor) return { ok: false, error: "Sessão expirada." };
        try {
          const target = await getCentralUserById(input.id);
          if (!target) return { ok: false, error: "Usuário não encontrado." };
          const administrative = actor.role === "admin" || actor.role === "master";
          if (actor.id !== target.id && !administrative) {
            return { ok: false, error: "Acesso negado." };
          }
          if (target.role === "master" && actor.role !== "master") {
            return { ok: false, error: "Somente Master pode alterar a senha de outro Master." };
          }
          await updateCentralUserPassword(target.id, input.password);
          logAudit({
            actorUserId: actor.id, action: "users.change_password",
            resourceType: "user", resourceId: target.id
          });
          return { ok: true, data: true };
        } catch (error) {
          return { ok: false, error: failed(error) };
        }
      }
    )
  );

  ipcMain.handle(
    IPC.usersDelete,
    compose([requireAdmin, validateInput(deleteUserSchema)])(
      async (_e, input: DeleteUserInput): Promise<ServiceResult<true>> => {
        const actor = getCurrentUser();
        if (!actor) return { ok: false, error: "Sessão expirada." };
        try {
          if (actor.id === input.id) return { ok: false, error: "Não é possível excluir o usuário logado." };
          const users = await listCentralUsers();
          if (users.length <= 1) return { ok: false, error: "Deve haver ao menos um usuário ativo." };
          const target = users.find(u => u.id === input.id);
          if (!target) return { ok: false, error: "Usuário não encontrado." };
          if (target.role === "master" && actor.role !== "master") {
            return { ok: false, error: "Somente Master pode excluir outro Master." };
          }
          await deactivateCentralUser(target.id);
          logAudit({
            actorUserId: actor.id, action: "users.delete",
            resourceType: "user", resourceId: target.id
          });
          return { ok: true, data: true };
        } catch (error) {
          return { ok: false, error: failed(error) };
        }
      }
    )
  );
}
