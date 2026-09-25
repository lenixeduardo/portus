import { ipcMain } from "electron";
import { z } from "zod";
import { IPC, type BarcodeUserRegistrationInput, type ServiceResult } from "../../shared/ipc";
import type { LaboratoryProfile, User, UserSector } from "../../shared/types";
import { isUserBarcode, normalizeUserBarcode } from "../../shared/user-barcode";
import { getCurrentUser } from "../auth/auth-service";
import { logAudit } from "../db/audit-repo";
import { isCentralDatabaseConfigured } from "../db/central-connection";
import { ensureCentralUserAccess } from "../db/central-users-repo";
import {
  countUsers,
  createUser,
  deleteUser,
  getUser,
  getUserByBarcodeValue,
  listUsers,
  reassignUserReferences,
  updateUserPassword
} from "../db/users-repo";
import { getUserByUsername } from "../db/users-repo";
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
    displayName: z.string().trim().min(1, "Informe o nome do usuário").max(120, "Nome muito longo").optional()
  })
);
type CreateUserWithDisplayNameInput = z.infer<typeof createUserWithDisplayNameSchema>;

const barcodeUserRegistrationSchema = z.object({
  barcode: z
    .string()
    .trim()
    .min(3, "Etiqueta inválida.")
    .max(64, "Etiqueta inválida.")
    .refine(isUserBarcode, "A etiqueta deve conter um identificador textual válido."),
  displayName: z.string().trim().min(1, "Informe o nome do usuário").max(120, "Nome muito longo"),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(100, "Senha muito longa"),
  profile: z.enum(["production", "laboratory_capture", "laboratory_closure"])
});

const userBarcodeLookupSchema = z.object({
  barcodeValue: z.string().trim().min(3).max(64)
});

type ValidatedBarcodeUserRegistrationInput = z.infer<typeof barcodeUserRegistrationSchema>;

function usernameExists(username: string): boolean {
  return getUserByUsername(username) != null;
}

function mapBarcodeProfile(profile: BarcodeUserRegistrationInput["profile"]): {
  sectorCode: UserSector;
  laboratoryProfile?: LaboratoryProfile;
} {
  if (profile === "laboratory_capture") {
    return { sectorCode: "LABORATORY", laboratoryProfile: "capture" };
  }
  if (profile === "laboratory_closure") {
    return { sectorCode: "LABORATORY", laboratoryProfile: "closure" };
  }
  return { sectorCode: "PRODUCTION" };
}

export function registerUsersHandlers(): void {
  ipcMain.handle(
    IPC.usersList,
    compose([requireAdmin])((): User[] => listUsers())
  );

  ipcMain.handle(
    IPC.usersCreate,
    compose([requireAdmin, validateInput(createUserWithDisplayNameSchema)])(
      (_e, input: CreateUserWithDisplayNameInput): ServiceResult<User> => {
        const actor = getCurrentUser();
        if (input.role === "master" && actor?.role !== "master") {
          return { ok: false, error: "Somente o usuário Master pode criar outro perfil Master." };
        }
        const username = input.username.trim();
        if (usernameExists(username)) {
          return { ok: false, error: "Já existe um usuário com esse nome." };
        }
        const user = createUser(
          username,
          input.password,
          input.role ?? "operator",
          input.sectorCode ?? "PRODUCTION",
          input.laboratoryProfile,
          input.displayName
        );
        logAudit({ actorUserId: actor?.id, action: "users.create", resourceType: "user", resourceId: user.id, details: { username: user.username, displayName: user.displayName, role: user.role, sectorCode: user.sectorCode, laboratoryProfile: user.laboratoryProfile } });
        return { ok: true, data: user };
      }
    )
  );

  ipcMain.handle(
    IPC.usersFindByBarcode,
    compose([requireAuth, validateInput(userBarcodeLookupSchema)])(
      (_e, input: { barcodeValue: string }): User | null =>
        getUserByBarcodeValue(input.barcodeValue)
    )
  );

  ipcMain.handle(
    IPC.usersRegisterBarcode,
    compose([requireAdmin, validateInput(barcodeUserRegistrationSchema)])(
      async (_e, input: ValidatedBarcodeUserRegistrationInput): Promise<ServiceResult<User>> => {
        const actor = getCurrentUser();
        if (!actor) return { ok: false, error: "Sessão expirada." };

        const barcode = normalizeUserBarcode(input.barcode);
        if (getUserByBarcodeValue(barcode)) {
          return { ok: false, error: "Esta etiqueta já está vinculada a um usuário." };
        }

        let username: string;
        try {
          username = generateUniqueUsername(input.displayName, usernameExists);
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Não foi possível gerar o usuário." };
        }

        const profile = mapBarcodeProfile(input.profile);
        let user: User;
        try {
          user = createUser(
            username,
            input.password,
            "operator",
            profile.sectorCode,
            profile.laboratoryProfile,
            input.displayName,
            barcode
          );
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error && /unique/i.test(error.message)
              ? "Esta etiqueta já está vinculada a um usuário."
              : "Não foi possível cadastrar o usuário."
          };
        }

        try {
          if (isCentralDatabaseConfigured()) {
            await ensureCentralUserAccess(user);
          }
        } catch (error) {
          deleteUser(user.id);
          return {
            ok: false,
            error: error instanceof Error
              ? `Não foi possível sincronizar o usuário com a base central: ${error.message}`
              : "Não foi possível sincronizar o usuário com a base central."
          };
        }

        logAudit({
          actorUserId: actor.id,
          action: "users.create_barcode",
          resourceType: "user",
          resourceId: user.id,
          details: {
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            sectorCode: user.sectorCode,
            laboratoryProfile: user.laboratoryProfile
          }
        });

        return { ok: true, data: user };
      }
    )
  );

  ipcMain.handle(
    IPC.usersChangePassword,
    compose([requireAuth, validateInput(changePasswordSchema)])(
      (_e, input: ChangePasswordInput): ServiceResult<true> => {
        const actor = getCurrentUser();
        const target = getUser(input.id);
        if (!actor) return { ok: false, error: "Sessão expirada." };
        if (!target) return { ok: false, error: "Usuário não encontrado." };
        const administrative = actor.role === "admin" || actor.role === "master";
        if (actor.id !== target.id && !administrative) {
          return { ok: false, error: "Acesso negado." };
        }
        if (target.role === "master" && actor.role !== "master") {
          return { ok: false, error: "Somente um Master pode alterar a senha de outro Master." };
        }
        updateUserPassword(input.id, input.password);
        logAudit({ actorUserId: actor?.id, action: "users.change_password", resourceType: "user", resourceId: input.id });
        return { ok: true, data: true };
      }
    )
  );

  ipcMain.handle(
    IPC.usersDelete,
    compose([requireAdmin, validateInput(deleteUserSchema)])(
      (_e, input: DeleteUserInput): ServiceResult<true> => {
        const current = getCurrentUser();
        if (!current) return { ok: false, error: "Sessão expirada." };
        if (current.id === input.id) {
          return { ok: false, error: "Não é possível excluir o usuário logado." };
        }
        if (countUsers() <= 1) return { ok: false, error: "Deve haver ao menos um usuário no sistema." };
        const target = getUser(input.id);
        if (!target) return { ok: false, error: "Usuário não encontrado." };
        if (target.role === "master" && current.role !== "master") {
          return { ok: false, error: "Somente um Master pode excluir outro perfil Master." };
        }
        reassignUserReferences(input.id, current.id);
        deleteUser(input.id);
        logAudit({ actorUserId: current.id, action: "users.delete", resourceType: "user", resourceId: input.id });
        return { ok: true, data: true };
      }
    )
  );
}
