import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { AvailableUpdate, UpdateDownloadProgress } from "../shared/ipc";
import { selectUpdate } from "./updates";

export async function downloadUpdate(
  update: AvailableUpdate,
  directory: string,
  request: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  onProgress: (progress: UpdateDownloadProgress) => void = () => {}
): Promise<string> {
  // Only the canonical release package can become an update on disk.
  if (!selectUpdate(update.currentVersion, { tag_name: `v${update.version}`, draft: false, prerelease: false,
    assets: [{ name: `PORTUS-Update-${update.version}-x64.zip`, browser_download_url: update.downloadUrl, digest: `sha256:${update.sha256}` }] })) {
    throw new Error("Metadados da atualização inválidos.");
  }
  await mkdir(directory, { recursive: true });
  const destination = join(directory, `PORTUS-Update-${update.version}-x64.zip`);
  const partial = `${destination}.${randomUUID()}.part`;
  try {
    const response = await request(update.downloadUrl, { signal: AbortSignal.timeout(15 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`Falha ao baixar o pacote (HTTP ${response.status}).`);
    const length = Number(response.headers.get("content-length"));
    const totalBytes = Number.isSafeInteger(length) && length > 0 ? length : 0;
    let receivedBytes = 0;
    const hash = createHash("sha256");
    async function* chunks() {
      const reader = response.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          receivedBytes += value.byteLength;
          hash.update(value);
          onProgress({ receivedBytes, totalBytes });
          yield value;
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
    await pipeline(Readable.from(chunks()), createWriteStream(partial, { flags: "wx" }));
    if (totalBytes && receivedBytes !== totalBytes) throw new Error("Download incompleto. Tente novamente.");
    const file = await open(partial, "r");
    try {
      const header = Buffer.alloc(2);
      const { bytesRead } = await file.read(header, 0, 2, 0);
      if (bytesRead !== 2 || header.toString("ascii") !== "PK") throw new Error("O arquivo recebido não é um pacote de atualização.");
    } finally { await file.close(); }
    if (hash.digest("hex") !== update.sha256) throw new Error("Falha de integridade do pacote de atualização.");
    await rename(partial, destination);
    return destination;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}
