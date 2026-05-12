import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type BatchInput,
  type BatchWithRecipe,
  type LoginRequest,
  type LoginResult,
  type RecipeInput,
  type SerialReaderApi,
  type ServiceResult
} from "../shared/ipc";
import type { Recipe, User } from "../shared/types";

const api: SerialReaderApi = {
  auth: {
    login: (req: LoginRequest): Promise<LoginResult> => ipcRenderer.invoke(IPC.authLogin, req),
    logout: (): Promise<void> => ipcRenderer.invoke(IPC.authLogout),
    currentUser: (): Promise<User | null> => ipcRenderer.invoke(IPC.authCurrentUser)
  },
  recipes: {
    list: (): Promise<Recipe[]> => ipcRenderer.invoke(IPC.recipesList),
    create: (input: RecipeInput): Promise<ServiceResult<Recipe>> =>
      ipcRenderer.invoke(IPC.recipesCreate, input),
    update: (id: number, input: RecipeInput): Promise<ServiceResult<Recipe>> =>
      ipcRenderer.invoke(IPC.recipesUpdate, id, input),
    remove: (id: number): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.recipesDelete, id)
  },
  batches: {
    listOpen: (): Promise<BatchWithRecipe[]> => ipcRenderer.invoke(IPC.batchesListOpen),
    create: (input: BatchInput): Promise<ServiceResult<BatchWithRecipe>> =>
      ipcRenderer.invoke(IPC.batchesCreate, input),
    close: (id: number): Promise<ServiceResult<true>> =>
      ipcRenderer.invoke(IPC.batchesClose, id)
  }
};

contextBridge.exposeInMainWorld("api", api);
