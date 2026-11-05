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
  const name = `PORTUS-Setup-${version}-x64.exe`;
  const url = `https://github.com/lenixeduardo/portus/releases/download/${release.tag_name}/${name}`;
  if (!Array.isArray(release.assets) || !release.assets.some(asset =>
    asset && asset.name === name && asset.browser_download_url === url
  )) return null;
  return { currentVersion, version, downloadUrl: url };
}

/**
 * Consulta manual: distingue "nenhuma atualização instalável" de erro de rede.
 * O resultado negativo só é confiável se o GitHub respondeu com release válida.
 */
export async function checkForUpdateDetailed(
  currentVersion: string,
  request: (url: string, init?: RequestInit) => Promise<Response> = fetch
): Promise<import("../shared/ipc").ServiceResult<AvailableUpdate | null>> {
  try {
    const response = await request(RELEASE_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "PORTUS" },
      signal: AbortSignal.timeout(8000), cache: "no-store"
    });
    if (!response.ok) {
      return { ok: false, error: `Não foi possível consultar as atualizações (HTTP ${response.status}). Tente novamente.` };
    }
    const release: unknown = await response.json();
    if (!release || typeof release !== "object" ||
        (release as Record<string, unknown>).draft !== false ||
        (release as Record<string, unknown>).prerelease !== false ||
        typeof (release as Record<string, unknown>).tag_name !== "string" ||
        !versionParts((release as { tag_name: string }).tag_name) ||
        !versionParts(currentVersion) ||
        !Array.isArray((release as Record<string, unknown>).assets)) {
      return { ok: false, error: "O canal de atualizações retornou dados inválidos. Tente novamente." };
    }
    const update = selectUpdate(currentVersion, release);
    const installed = versionParts(currentVersion)!;
    const published = versionParts((release as { tag_name: string }).tag_name)!;
    const isNewer = published.some((part, i) =>
      part !== installed[i] && published.slice(0, i).every((value, index) => value === installed[index]) && part > installed[i]
    );
    if (isNewer && !update) {
      return { ok: false, error: "A versão mais recente não possui instalador oficial válido. Contate o administrador antes de continuar." };
    }
    return { ok: true, data: update };
  } catch {
    return { ok: false, error: "Não foi possível acessar o canal de atualizações. Verifique a conexão e tente novamente." };
  }
}

export async function checkForUpdate(
  currentVersion: string,
  request: (url: string, init?: RequestInit) => Promise<Response> = fetch
): Promise<AvailableUpdate | null> {
  const result = await checkForUpdateDetailed(currentVersion, request);
  if (!result.ok) {
    logWarn("updates:check", result.error);
    // A consulta automática não deve impedir o uso do PORTUS.
    return null;
  }
  return result.data;
}
