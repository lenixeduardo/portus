import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'vitest';

describe('senha protegida do utilitario Windows', () => {
  it.skipIf(process.platform !== 'win32')('reabre a senha, isola conexoes, substitui e esquece sem texto puro no arquivo', () => {
    const root = mkdtempSync(join(tmpdir(), 'portus-credentials-test-'));
    const quote = (v: string) => "'" + v.replace(/'/g, "''") + "'";
    const helper = join(process.cwd(), 'database', 'portus-utility-credentials.ps1');
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `
        $ErrorActionPreference='Stop'; . ${quote(helper)};
        $argsMap=@{ DatabaseHost='192.168.0.10'; Port='5432'; DatabaseName='portus'; AdminUser='postgres'; CredentialRoot=${quote(root)} };
        $password=' synthetic-secret @:# with spaces ';
        Save-PortusUtilityPassword @argsMap -Password $password;
        if ((Read-PortusUtilityPassword @argsMap) -cne $password) { throw 'Roundtrip falhou' };
        $file=Get-PortusUtilityCredentialPath @argsMap;
        if ([IO.File]::ReadAllText($file).Contains($password)) { throw 'Senha em texto puro' };
        $argsMap.DatabaseHost='192.168.0.27';
        if ((Read-PortusUtilityPassword @argsMap) -ne '') { throw 'Senha vazou entre servidores' };
        $argsMap.DatabaseHost='192.168.0.10'; $argsMap.AdminUser='portus_admin';
        if ((Read-PortusUtilityPassword @argsMap) -ne '') { throw 'Senha vazou entre usuarios' };
        $argsMap.AdminUser='postgres';
        Save-PortusUtilityPassword @argsMap -Password 'replacement-secret';
        if ((Read-PortusUtilityPassword @argsMap) -cne 'replacement-secret') { throw 'Substituicao falhou' };
        Save-PortusUtilityPassword @argsMap -Password '';
        if (Test-Path -LiteralPath $file) { throw 'Arquivo nao foi removido' };
        if ((Read-PortusUtilityPassword @argsMap) -ne '') { throw 'Senha nao foi esquecida' };
      `], { timeout: 20_000, windowsHide: true, stdio: 'pipe' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 25_000);
});
