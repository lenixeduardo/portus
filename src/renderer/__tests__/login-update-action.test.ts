import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Login } from "../screens/Login";
import { canManageUpdates } from "../../shared/update-permissions";

describe("login: atualizações somente após autenticação administrativa", () => {
  it("não exibe ação de atualização na tela de login", () => {
    const html = renderToStaticMarkup(createElement(Login, { onAuthenticated: () => undefined }));
    expect(html).not.toContain("Buscar atualizações");
    expect(html).not.toContain("login-update-button");
    expect(html).toContain("Entrar");
  });
  it("autoriza exclusivamente admin e master", () => {
    expect(canManageUpdates("admin")).toBe(true);
    expect(canManageUpdates("master")).toBe(true);
    expect(canManageUpdates("supervisor")).toBe(false);
    expect(canManageUpdates("operator")).toBe(false);
    expect(canManageUpdates(null)).toBe(false);
  });
});
