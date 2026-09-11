import { describe, expect, it } from "vitest";
import { findPostgresBin } from "../setup/initial-setup-service";

describe("assistente de configuração inicial", () => {
  it("localiza a versão mais recente do PostgreSQL instalada", () => {
    const checked: string[] = [];
    const result = findPostgresBin("C:\\Program Files", (path) => {
      checked.push(path);
      return path.endsWith("PostgreSQL\\17\\bin\\psql.exe");
    });

    expect(result).toBe("C:\\Program Files\\PostgreSQL\\17\\bin");
    expect(checked).toEqual([
      "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe",
      "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"
    ]);
  });

  it("informa ausência quando o cliente PostgreSQL não existe", () => {
    expect(findPostgresBin("C:\\Program Files", () => false)).toBeNull();
    expect(findPostgresBin(undefined, () => true)).toBeNull();
  });
});
