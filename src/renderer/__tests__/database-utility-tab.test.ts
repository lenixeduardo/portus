import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DatabaseUtilityTab } from "../screens/settings/DatabaseUtilityTab";

describe("atalho para DB Utility nas configurações", () => {
  it("mostra a ação e esclarece que migrations não são iniciadas automaticamente", () => {
    const html = renderToStaticMarkup(React.createElement(DatabaseUtilityTab));
    expect(html).toContain("PORTUS DB Utility");
    expect(html).toContain("Abrir DB Utility");
    expect(html).toContain("não executa migrations automaticamente");
    expect(html).toContain("senha administrativa");
  });
});
