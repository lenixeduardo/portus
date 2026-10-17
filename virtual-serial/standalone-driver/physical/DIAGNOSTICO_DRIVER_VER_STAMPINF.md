# LabSerial — DriverVersion inesperado `5.20.56.923` em Windows físico

**Relato do operador em 17/10/2026:**

```text
DeviceName    : LabSerial Virtual Serial Port B (EXPERIMENTAL)
DriverVersion : 5.20.56.923
InfName       : oem65.inf
DeviceID      : ROOT\DEVGEN\{CAF11815-BCE7-EA4E-90F6-F3C2758EB0F8}

DeviceName    : LabSerial Virtual Serial Port A (EXPERIMENTAL)
DriverVersion : 5.20.56.923
InfName       : oem65.inf
DeviceID      : ROOT\DEVGEN\{92205F30-ECF7-DF4F-BB04-D1B13C89502E}
```

**Causa identificada no processo de build:** embora `labserial.inx` fixe `DriverVer=10/17/2026,0.1.1.0`, `StampInf` reescrevia a versão final no INF empacotado usando horário de compilação. Exemplo observado diretamente no artefato Release test-only 0.1.1.0 produzido pelo próprio GitHub Actions:

```text
DriverVer = 10/17/2026,7.23.0.659
```

O valor instalado `5.20.56.923` é compatível com o mesmo padrão de versão numérica derivada de hora/minuto/segundo/milisegundo. **Logo, `Win32_PnPSignedDriver.DriverVersion` não permite distinguir qual snapshot do código KMDF está instalado nesses pacotes antigos.** Não afirmar que 0.1.1.0 está carregado porque o nome do ZIP é 0.1.1.0, e nem inferir especificamente 0.1.0.0 da numeração.

Correções propostas na branch:
- Fixar `SpecifyDriverVerDirectiveDate`/`DateStamp` e `SpecifyDriverDirectiveVersion`/`TimeStamp` no item `Inf` do `.vcxproj`.
- Fail closed na CI se o INF **gerado** não contiver `DriverVer=10/17/2026,0.1.1.0`, não confiar somente no `.inx`.
- **A revisão da pipeline de carimbo de versão ainda necessita da validação de um novo artefato WDK.** O artefato antigo com valor horário NÃO pode ser anunciado como semanticamente versionado 0.1.1.0.

## Próximo diagnóstico sem alterações no host

No PowerShell do computador físico:

```powershell
(Select-String -LiteralPath "$env:windir\INF\oem65.inf" -Pattern '^\s*DriverVer\s*=').Line
sc.exe qc LabSerial
```

A consulta não reinicia serviço, não atualiza driver, não muda COM210/COM211 e não instala pacote. Para identificação conclusiva do build em execução, avaliar o hash do arquivo binário do driver **atualmente utilizado** e comparar com hashes dos artefatos de compilação conhecidos; os nomes INF podem ser diferentes do caminho de imagem realmente em uso, e binário em disco não garante que a imagem carregada esteja atualizada sem reinicialização.

**Pendências**: compatibilidade `System.IO.Ports.SerialPort.Open()` segue FAIL em campo; novo `GET_PROPERTIES`/filas 0.1.1.0 ainda sem validação real. Testes Win32 6/6 continuam comprovados no host. PR permanece Draft.
