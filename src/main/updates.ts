import { logWarn } from "./logger";
import type { AvailableUpdate } from "../shared/ipc";

const RELEASE_API = "https://api.github.com/repos/lenixeduardo/portus/releases/latest";

function versionParts(value: string): number[] | null {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function selectUpdate(currentVersion: string, data: unknown): AvailableUpdate | null {
  if (!data || typeof data !== "object") return null;
  const release = data as Record<string, unknown>;
  if (release.draft !== false || release.prerelease !== false || typeof release.tag_name !== "string") return null;
  const installed = versionParts(currentVersion);
  const published = versionParts(release.tag_name);
  if (!installed || !published) return null;
  const differing = published.findIndex((part, index) => part !== installed[index]);
  if (differing < 0 || published[differing] <= installed[differing]) return null;
  const version = published.join(".");
  const name = `PORTUS-Update-${version}-x64.zip`;
  const url = `https://github.com/lenixeduardo/portus/releases/download/${release.tag_name}/${name}`;
  if (!Array.isArray(release.assets)) return null;
  const asset = release.assets.find(asset =>
    asset && asset.name === name && asset.browser_download_url === url
  );
  if (!asset || typeof asset.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) return null;
  return { currentVersion, version, downloadUrl: url, sha256: asset.digest.slice(7) };
}

export async function checkForUpdate(currentVersion: string, request: (url: string, init?: RequestInit) => Promise<Response> = fetch): Promise<AvailableUpdate | null> {
  try {
    const response = await request(RELEASE_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "PORTUS" },
      signal: AbortSignal.timeout(8000), cache: "no-store"
    });
    if (!response.ok) {
      logWarn("updates:check", `Canal de atualização indisponível: HTTP ${response.status}. A consulta será repetida.`);
      return null;
    }
    return selectUpdate(currentVersion, await response.json());
  } catch {
    logWarn("updates:check", "Falha de rede ao consultar atualizações. A consulta será repetida.");
    // An unavailable update service must never prevent operational use.
    return null;
  }
}
