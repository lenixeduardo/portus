import { describe, expect, it } from "vitest";
import { checkForUpdate, selectUpdate } from "../updates";

const release = (version = "0.1.15") => ({
  tag_name: `v${version}`, draft: false, prerelease: false,
  assets: [{ name: `PORTUS-Setup-${version}-x64.exe`, browser_download_url: `https://github.com/lenixeduardo/portus/releases/download/v${version}/PORTUS-Setup-${version}-x64.exe` }]
});

describe("available updates", () => {
  it("offers a newer Windows installer and compares versions numerically", () => {
    expect(selectUpdate("0.1.9", release())).toMatchObject({ currentVersion: "0.1.9", version: "0.1.15" });
  });
  it("does not offer the installed version, a downgrade or prerelease", () => {
    expect(selectUpdate("0.1.15", release())).toBeNull();
    expect(selectUpdate("0.2.0", release())).toBeNull();
    expect(selectUpdate("0.1.14", { ...release(), prerelease: true })).toBeNull();
    expect(selectUpdate("0.1.14", { ...release(), draft: true })).toBeNull();
  });
  it("rejects malformed metadata and downloads outside the release repository", () => {
    for (const data of [null, {}, { ...release(), tag_name: "latest" }, { ...release(), assets: [] },
      { ...release(), assets: [{ ...release().assets[0], browser_download_url: "https://evil.example/setup.exe" }] }]) {
      expect(selectUpdate("0.1.14", data)).toBeNull();
    }
  });
  it("returns no update on a network error or missing release", async () => {
    expect(await checkForUpdate("0.1.14", async () => { throw new Error("offline"); })).toBeNull();
    expect(await checkForUpdate("0.1.14", async () => new Response("", { status: 404 }))).toBeNull();
  });
  it("uses the published release response", async () => {
    expect(await checkForUpdate("0.1.14", async () => new Response(JSON.stringify(release())))).toMatchObject({ version: "0.1.15" });
  });
});
