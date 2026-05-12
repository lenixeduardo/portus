import type { Batch, Recipe, User } from "./types";

export const IPC = {
  authLogin: "auth:login",
  authLogout: "auth:logout",
  authCurrentUser: "auth:current-user",
  recipesList: "recipes:list",
  recipesCreate: "recipes:create",
  recipesUpdate: "recipes:update",
  recipesDelete: "recipes:delete",
  batchesListOpen: "batches:list-open",
  batchesCreate: "batches:create",
  batchesClose: "batches:close"
} as const;

export interface LoginRequest {
  username: string;
  password: string;
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

export interface RecipeInput {
  name: string;
  description?: string;
}

export interface BatchInput {
  recipeId: number;
  code?: string;
}

export interface BatchWithRecipe extends Batch {
  recipeName: string;
  operatorName: string;
  readingsCount: number;
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface SerialReaderApi {
  auth: {
    login(req: LoginRequest): Promise<LoginResult>;
    logout(): Promise<void>;
    currentUser(): Promise<User | null>;
  };
  recipes: {
    list(): Promise<Recipe[]>;
    create(input: RecipeInput): Promise<ServiceResult<Recipe>>;
    update(id: number, input: RecipeInput): Promise<ServiceResult<Recipe>>;
    remove(id: number): Promise<ServiceResult<true>>;
  };
  batches: {
    listOpen(): Promise<BatchWithRecipe[]>;
    create(input: BatchInput): Promise<ServiceResult<BatchWithRecipe>>;
    close(id: number): Promise<ServiceResult<true>>;
  };
}

declare global {
  interface Window {
    api: SerialReaderApi;
  }
}
