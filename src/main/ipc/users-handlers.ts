import { ipcMain } from "electron";
import { IPC, type ServiceResult, type UserCreateInput } from "../../shared/ipc";
import type { User } from "../../shared/types";
import { getCurrentUser } from "../auth/auth-service";
import {
  countUsers,
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUserPassword,
  userHasReferences
} from "../db/users-repo";
import { getUserByUsername } from "../db/users-repo";

function validateUsername(username: string): string | null {
  const t = (username ?? "").trim();
  if (!t) return "Informe o nome de usuário.";
  if (t.length < 3) return "Usuário deve ter ao menos 3 caracteres.";
  if (t.length > 40) return "Usuário muito longo (máx. 40).";
  if (!/^[a-zA-Z0-9._-]+$/.test(t)) return "Usuário aceita apenas letras, números, '.', '_' e '-'.";
  return null;
}

function validatePassword(password: string): string | null {
  if (!password || password.length < 4) return "Senha deve ter ao menos 4 caracteres.";
  if (password.length > 100) return "Senha muito longa.";
  return null;
}

function usernameExists(username: string): boolean {
  return getUserByUsername(username) != null;
}

export function registerUsersHandlers(): void {
  ipcMain.handle(IPC.usersList, (): User[] => listUsers());

  ipcMain.handle(IPC.usersCreate, (_e, input: UserCreateInput): ServiceResult<User> => {
    if (!getCurrentUser()) return { ok: false, error: "Sessão expirada." };
    const eU = validateUsername(input.username);
    if (eU) return { ok: false, error: eU };
    const eP = validatePassword(input.password);
    if (eP) return { ok: false, error: eP };
    const username = input.username.trim();
    if (usernameExists(username)) return { ok: false, error: "Já existe um usuário com esse nome." };
    const user = createUser(username, input.password);
    return { ok: true, data: user };
  });

  ipcMain.handle(
    IPC.usersChangePassword,
    (_e, id: number, newPassword: string): ServiceResult<true> => {
      if (!getCurrentUser()) return { ok: false, error: "Sessão expirada." };
      if (!getUser(id)) return { ok: false, error: "Usuário não encontrado." };
      const eP = validatePassword(newPassword);
      if (eP) return { ok: false, error: eP };
      updateUserPassword(id, newPassword);
      return { ok: true, data: true };
    }
  );

  ipcMain.handle(IPC.usersDelete, (_e, id: number): ServiceResult<true> => {
    const current = getCurrentUser();
    if (!current) return { ok: false, error: "Sessão expirada." };
    if (current.id === id) return { ok: false, error: "Não é possível excluir o usuário logado." };
    if (countUsers() <= 1) return { ok: false, error: "Deve haver ao menos um usuário no sistema." };
    if (!getUser(id)) return { ok: false, error: "Usuário não encontrado." };
    if (userHasReferences(id)) {
      return { ok: false, error: "Usuário possui fórmulas/lotes vinculados e não pode ser excluído." };
    }
    deleteUser(id);
    return { ok: true, data: true };
  });
}
