import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Login } from "../screens/Login";

describe("login: busca de atualizações", () => {
  it("exibe botão secundário com ícone, sem exigir autenticação", () => {
    const html = renderToStaticMarkup(createElement(Login, {
      onAuthenticated: () => undefined,
      onUpdateFound: () => undefined
    }));
    expect(html).toContain("Buscar atualizações");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*login-update-button/);
    expect(html).toContain("login-update-icon");
    expect(html).toContain("Entrar");
  });
});
