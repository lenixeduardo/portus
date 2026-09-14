import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findPostgresBin } from "../setup/initial-setup-service";

const initialSetupSource = readFileSync(
  join(process.cwd(), "src", "renderer", "screens", "InitialSetup.tsx"),
  "utf8"
);

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

  it("bloqueia senha do PORTUS com menos de 8 caracteres antes de chamar o IPC", () => {
    expect(initialSetupSource).toContain("form.appPassword.length < 8");
    expect(initialSetupSource).toContain("A senha do PORTUS deve ter ao menos 8 caracteres.");
  });

  it("aplica limite mínimo de 8 caracteres nos dois campos de senha do PORTUS", () => {
    const minLengthOccurrences = initialSetupSource.match(/minLength=\{8\}/g) ?? [];
    expect(minLengthOccurrences).toHaveLength(2);
  });

  it("preserva a mensagem real quando o IPC rejeita a configuração", () => {
    expect(initialSetupSource).toContain("catch (cause)");
    expect(initialSetupSource).toContain("cause instanceof Error");
  });

  it("distingue o host local do servidor do IP usado nas estações", () => {
    expect(initialSetupSource).toContain("Host local do PostgreSQL");
    expect(initialSetupSource).toContain("IP do servidor central");
    expect(initialSetupSource).toContain('readOnly={form.installationMode === "server"}');
    expect(initialSetupSource).toContain("Na estação cliente, informe o IP da máquina servidor.");
  });
});
