import type { User } from "./types";

export const IPC = {
  authLogin: "auth:login",
  authLogout: "auth:logout",
  authCurrentUser: "auth:current-user"
} as const;

export interface LoginRequest {
  username: string;
  password: string;
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

export interface SerialReaderApi {
  auth: {
    login(req: LoginRequest): Promise<LoginResult>;
    logout(): Promise<void>;
    currentUser(): Promise<User | null>;
  };
}

declare global {
  interface Window {
    api: SerialReaderApi;
  }
}
