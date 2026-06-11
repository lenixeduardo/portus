import { ipcMain } from "electron";
import { IPC, type ServiceResult } from "../../shared/ipc";
import type { User } from "../../shared/types";
import { getCurrentUser } from "../auth/auth-service";
import {
  countUsers,
  createUser,
  deleteUser,
  getUser,
  listUsers,
  reassignUserReferences,
  updateUserPassword
} from "../db/users-repo";
import { getUserByUsername } from "../db/users-repo";
import {
  changePasswordSchema,
  createUserSchema,
  deleteUserSchema,
  type ChangePasswordInput,
  type CreateUserInput,
  type DeleteUserInput
} from "../validation/schemas";
import { compose, requireAdmin, requireAuth, validateInput } from "./middleware";

function usernameExists(username: string): boolean {
  return getUserByUsername(username) != null;
}

export function registerUsersHandlers(): void {
  ipcMain.handle(
    IPC.usersList,
    compose([requireAdmin])((): User[] => listUsers())
  );

  ipcMain.handle(
    IPC.usersCreate,
    compose([requireAdmin, validateInput(createUserSchema)])(
      (_e, input: CreateUserInput): ServiceResult<User> => {
        const username = input.username.trim();
        if (usernameExists(username)) {
          return { ok: false, error: "Já existe um usuário com esse nome." };
        }
        const user = createUser(username, input.password, input.role ?? "operator");
        return { ok: true, data: user };
      }
    )
  );

  ipcMain.handle(
    IPC.usersChangePassword,
    compose([requireAuth, validateInput(changePasswordSchema)])(
      (_e, input: ChangePasswordInput): ServiceResult<true> => {
        if (!getUser(input.id)) return { ok: false, error: "Usuário não encontrado." };
        updateUserPassword(input.id, input.password);
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
        if (!getUser(input.id)) return { ok: false, error: "Usuário não encontrado." };
        reassignUserReferences(input.id, current.id);
        deleteUser(input.id);
        return { ok: true, data: true };
      }
    )
  );
}
