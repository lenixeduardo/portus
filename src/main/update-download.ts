import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
  // Only the canonical release installer can become an executable on disk.
  if (!selectUpdate(update.currentVersion, { tag_name: `v${update.version}`, draft: false, prerelease: false,
    assets: [{ name: `PORTUS-Setup-${update.version}-x64.exe`, browser_download_url: update.downloadUrl }] })) {
    throw new Error("Metadados da atualização inválidos.");
  }
  await mkdir(directory, { recursive: true });
  const destination = join(directory, `PORTUS-Setup-${update.version}-x64.exe`);
  const partial = `${destination}.${randomUUID()}.part`;
  try {
    const response = await request(update.downloadUrl, { signal: AbortSignal.timeout(15 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`Falha ao baixar o instalador (HTTP ${response.status}).`);
    const length = Number(response.headers.get("content-length"));
    const totalBytes = Number.isSafeInteger(length) && length > 0 ? length : 0;
    let receivedBytes = 0;
    async function* chunks() {
      const reader = response.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          receivedBytes += value.byteLength;
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
      if (bytesRead !== 2 || header.toString("ascii") !== "MZ") throw new Error("O arquivo recebido não é um instalador Windows.");
    } finally { await file.close(); }
    await rename(partial, destination);
    return destination;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}
