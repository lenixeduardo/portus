import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { updateSettingSchema } from "../validation/schemas";

const read = (path: string) => readFileSync(resolve(process.cwd(),path),"utf8");

describe("configuração obrigatória do setor físico da estação", () => {
  it("aceita somente Produção ou Laboratório pelo IPC", () => {
    expect(updateSettingSchema.safeParse({ key:"station_sector_code",value:"PRODUCTION" }).success).toBe(true);
    expect(updateSettingSchema.safeParse({ key:"station_sector_code",value:"LABORATORY" }).success).toBe(true);
    for (const value of ["", "production", "OFFICE", "PRODUCTION,LABORATORY", "UNKNOWN"]) {
      expect(updateSettingSchema.safeParse({ key:"station_sector_code",value }).success).toBe(false);
    }
    expect(updateSettingSchema.safeParse({ key:"barcode_regex",value:"" }).success).toBe(true);
  });

  it("mostra identificação física, seletor e exige escolha explícita", () => {
    const ui = read("src/renderer/screens/settings/CaptureSettingsTab.tsx");
    expect(ui).toContain('label htmlFor="portus-station-code"');
    expect(ui).toContain('label htmlFor="portus-station-sector"');
    expect(ui).toContain('<option value="">Selecione o setor...</option>');
    expect(ui).toContain('<option value="PRODUCTION">Produção</option>');
    expect(ui).toContain('<option value="LABORATORY">Laboratório</option>');
    expect(ui).toContain('useState<"" | "PRODUCTION" | "LABORATORY">("")');
    expect(ui).not.toContain('useState<"PRODUCTION" | "LABORATORY">("PRODUCTION")');
    expect(ui).toContain('window.api.settings.set("station_sector_code", stationSectorCode)');
    expect(ui).toContain('updated.station_sector_code !== stationSectorCode');
    expect(ui).toContain("Esta estação ainda não tem setor configurado.");
    expect(ui).toContain("readOnly");
    expect(ui).not.toContain('window.api.settings.set("station_code"');
  });

  it("mantém a configuração no PostgreSQL por station_code da máquina", () => {
    const db = read("src/main/db/central-station-settings-repo.ts");
    const handlers = read("src/main/ipc/settings-handlers.ts");
    const capture = read("src/main/serial/capture-service.ts");
    expect(db).toContain("portus_station_settings WHERE station_code");
    expect(db).toContain("ON CONFLICT (station_code,key)");
    expect(db).toContain('settings.station_sector_code?.trim().toUpperCase()');
    expect(db).toContain("Configurações > Captura");
    expect(handlers).toContain("requireAdmin");
    expect(capture).toContain("stationIdentity.sectorCode !== sectorCode");
    expect(capture).toContain("O setor do computador difere do perfil operacional do usuário.");
  });
});
