import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { downloadUpdate } from "../update-download";

const update = { currentVersion: "0.1.27", version: "0.1.35", sha256: createHash("sha256").update(Buffer.from([80,75,1,2,3,4])).digest("hex"), downloadUrl: "https://github.com/lenixeduardo/portus/releases/download/v0.1.35/PORTUS-Update-0.1.35-x64.zip" };
let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "portus-update-test-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe("download interno do instalador", () => {
  it("grava o executável completo e informa o progresso", async () => {
    const progress: number[] = [];
    const bytes = new Uint8Array([80, 75, 1, 2, 3, 4]);
    const path = await downloadUpdate(update, directory, async () => new Response(bytes, { headers: { "Content-Length": "6" } }), p => progress.push(p.receivedBytes));
    expect(await readFile(path)).toEqual(Buffer.from(bytes));
    expect(path).toBe(join(directory, "PORTUS-Update-0.1.35-x64.zip"));
    expect(progress.at(-1)).toBe(6);
    expect(await readdir(directory)).toEqual(["PORTUS-Update-0.1.35-x64.zip"]);
  });
  it("recusa um pacote adulterado mesmo com tamanho correto", async () => {
    await expect(downloadUpdate(update, directory, async () => new Response(new Uint8Array([80,75,9,9,9,9])))).rejects.toThrow(/integridade/i);
    expect(await readdir(directory)).toEqual([]);
  });
  it("remove o arquivo parcial quando a conexão cai", async () => {
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([77,90])); controller.error(new Error("conexao interrompida")); } });
    await expect(downloadUpdate(update, directory, async () => new Response(body))).rejects.toThrow("conexao interrompida");
    expect(await readdir(directory)).toEqual([]);
  });
  it("recusa HTML e downloads incompletos sem deixar instalador final", async () => {
    await expect(downloadUpdate(update, directory, async () => new Response("<html>erro</html>"))).rejects.toThrow(/pacote/i);
    await expect(downloadUpdate(update, directory, async () => new Response(new Uint8Array([77,90]), { headers: { "Content-Length": "100" } }))).rejects.toThrow(/incompleto/i);
    expect(await readdir(directory)).toEqual([]);
  });
  it("recusa metadados manipulados antes de acessar rede ou disco", async () => {
    await expect(downloadUpdate({ ...update, version: "../../evil" }, directory, async () => { throw new Error("nao acessar"); })).rejects.toThrow(/atualiza/i);
    await expect(downloadUpdate({ ...update, sha256: createHash("sha256").update(Buffer.from([80,75,1,2,3,4])).digest("hex"), downloadUrl: "https://evil.example/setup.exe" }, directory)).rejects.toThrow(/atualiza/i);
    expect(await readdir(directory)).toEqual([]);
  });
});
