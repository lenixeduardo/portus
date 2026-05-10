import { contextBridge, ipcRenderer } from "electron";
import { IPC, type LoginRequest, type LoginResult, type SerialReaderApi } from "../shared/ipc";
import type { User } from "../shared/types";

const api: SerialReaderApi = {
  auth: {
    login: (req: LoginRequest): Promise<LoginResult> => ipcRenderer.invoke(IPC.authLogin, req),
    logout: (): Promise<void> => ipcRenderer.invoke(IPC.authLogout),
    currentUser: (): Promise<User | null> => ipcRenderer.invoke(IPC.authCurrentUser)
  }
};

contextBridge.exposeInMainWorld("api", api);
