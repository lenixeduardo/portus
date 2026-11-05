import { beforeEach, describe, expect, it } from "vitest";
import {
  assertUpdateGateOpen,
  configureUpdateGateEnforcement,
  getUpdateGateState,
  verifyUpdateGate
} from "../update-gate";

const release = (version = "0.1.60", assets = true) => ({
  tag_name: `v${version}`, draft: false, prerelease: false,
  assets: assets ? [{
    name: `PORTUS-Setup-${version}-x64.exe`,
    browser_download_url: `https://github.com/lenixeduardo/portus/releases/download/v${version}/PORTUS-Setup-${version}-x64.exe`
  }] : []
});
const response = (body: unknown) => async () => new Response(JSON.stringify(body));

describe("bloqueio obrigatório de versões desatualizadas", () => {
  beforeEach(() => configureUpdateGateEnforcement(true));

  it("não libera operações antes da verificação", () => {
    expect(getUpdateGateState()).toMatchObject({ status: "checking" });
    expect(() => assertUpdateGateOpen()).toThrow(/Atualização obrigatória/);
  });

  it("identifica versão inferior e mantém bloqueio para todo acesso", async () => {
    expect(await verifyUpdateGate("0.1.59", response(release()))).toMatchObject({
      status: "required", update: { currentVersion: "0.1.59", version: "0.1.60" }
    });
    expect(() => assertUpdateGateOpen()).toThrow(/Atualização obrigatória/);
  });

  it("libera a versão instalada igual ou superior após consulta válida", async () => {
    expect(await verifyUpdateGate("0.1.60", response(release()))).toEqual({ status: "current" });
    expect(() => assertUpdateGateOpen()).not.toThrow();
  });

  it("bloqueia quando o canal está indisponível e permite tentar novamente", async () => {
    const offline = async (): Promise<Response> => { throw new Error("offline"); };
    expect((await verifyUpdateGate("0.1.59", offline)).status).toBe("error");
    expect(() => assertUpdateGateOpen()).toThrow();
    expect((await verifyUpdateGate("0.1.60", response(release()))).status).toBe("current");
    expect(() => assertUpdateGateOpen()).not.toThrow();
  });

  it("não perde bloqueio de atualização se rede cair depois", async () => {
    await verifyUpdateGate("0.1.59", response(release()));
    const offline = async (): Promise<Response> => { throw new Error("offline"); };
    expect((await verifyUpdateGate("0.1.59", offline)).status).toBe("required");
    expect(() => assertUpdateGateOpen()).toThrow();
  });

  it("não interrompe sessão já validada por falha transitória posterior", async () => {
    await verifyUpdateGate("0.1.60", response(release()));
    await verifyUpdateGate("0.1.60", async () => { throw new Error("offline"); });
    expect(() => assertUpdateGateOpen()).not.toThrow();
  });

  it("bloqueia quando release superior não possui instalador oficial", async () => {
    expect((await verifyUpdateGate("0.1.59", response(release("0.1.60", false)))).status).toBe("error");
    expect(() => assertUpdateGateOpen()).toThrow();
  });

  it("desabilita o gate em desenvolvimento sem lançamento instalável", () => {
    configureUpdateGateEnforcement(false);
    expect(() => assertUpdateGateOpen()).not.toThrow();
  });
});
