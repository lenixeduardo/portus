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

## Confirmação posterior do operador — INF e serviço realmente instalados

Consulta somente leitura executada no Windows físico:

```text
(Select-String -LiteralPath "$env:windir\INF\oem65.inf" -Pattern '^\s*DriverVer\s*=').Line
DriverVer = 10/14/2026,5.20.56.923

sc.exe qc LabSerial
[SC] QueryServiceConfig ÊXITO
TIPO : KERNEL_DRIVER
TIPO_DE_INÍCIO : DEMAND_START
NOME_DO_CAMINHO_BINÁRIO : \SystemRoot\System32\DriverStore\FileRepository\labserial.inf_amd64_5af65e96e1978c9b\labserial.sys
```

Isso elimina a ambiguidade do **pacote INF instalado**: `oem65.inf` contém carimbo de **14/10/2026**, anterior ao fonte da correção `.NET` (`GET_PROPERTIES`/`SET_QUEUE_SIZE`, 17/10/2026). Os dois dispositivos PnP referenciam o mesmo `oem65.inf`. Assim, a execução `.NET` ainda testou o **pacote anterior**, não a correção do dia 17. O INF e o caminho do serviço foram conferidos; o hash do `.sys` carregado não foi auditado de forma independente.

**Proibição operacional:** não executar DevGen novamente; as instâncias PnP A/B já existem. Não considerar a extração do ZIP como instalação. Primeiro preservar driver em uso, confirmar assinatura/certificado e garantir rollback, só então cogitar `pnputil /add-driver ... /install` com supervisão.

## Estado da pipeline de versão fixada

A compilação WDK anterior à tentativa de fixar metadata StampInf passou em Debug/Release (run `39013388736`), mas o INF emitido usa numeração de carimbo horário. A nova configuração com data/versão explícitas no MSBuild e verificação do INF final foi commitada; **não há execução WDK bem-sucedida confirmada para essa alteração** no momento deste registro. Não oferecer como pacote validado até a pipeline produzir o INF correto.

## Backup exportado e identidade do candidato — confirmação do operador

Em 17/10/2026, o operador executou `pnputil.exe /export-driver oem65.inf "$env:USERPROFILE\Documents\LabSerial-Backup-oem65"`: **um pacote exportado, um sucesso**. Não houve instalação ou substituição de driver.

O pacote candidato anteriormente fornecido possui INF `DriverVer = 10/17/2026,7.23.0.659` e hash SHA-256 do `labserial.sys` **`F11AC4E2BE92D83716F49BCB439B857EEC5FF22B9530D240E7C4770F6C731B69`**. Esse hash foi comparado diretamente com a extração íntegra do artefato Release GitHub Actions de run `39013388736` (artifact `12093822014`), coincidindo exatamente.

O manifesto do artefato declara certificado de teste SHA-1 thumbprint `F6B7536F32961561E01F540E58E6D0938D82F5BA`; o certificado público incluído no ZIP é **autoassinado** (CN `WDKTestCert runneradmin,134366953847180556`) e foi emitido em `2026-10-17T07:23:04Z`. A confiança deste certificado no PC físico **não está confirmada**. O comando do operador `Get-AuthenticodeSignature labserial.sys` retornou `UnknownError` com certificado presente, exigindo inspeção de cadeia/SignTool antes de qualquer atualização.

**Status:** backup positivo e integridade de bytes da build candidata confirmados; confiança/autorização do certificado de teste NÃO confirmada; atualização de driver NÃO executada. O arquivo INF dessa build apresenta numeração baseada em horário, não a versão fixa pretendida.

## Assinatura do pacote candidato verificada no Windows físico

O operador importou conscientemente o certificado autoassinado de teste correspondente ao candidato, thumbprint `F6B7536F32961561E01F540E58E6D0938D82F5BA`, para o repositório Windows de confiança de sua máquina de laboratório, após confirmação interativa do PowerShell. Reexecutou:

```text
Get-AuthenticodeSignature "$p\labserial.sys" | Format-List Status,StatusMessage
Status        : Valid
StatusMessage : Assinatura verificada.
```

**Interpretação:** assinatura Authenticode do `.sys` candidato aceita pela máquina de laboratório. Não demonstra que o dispositivo foi atualizado; até evidência contrária os dispositivos A/B continuam associados ao `oem65.inf` de 14/10/2026. Não representa assinatura Microsoft de distribuição. O backup anterior foi exportado via `pnputil /export-driver oem65.inf` com êxito. Próximo passo conservador: comparar certificado de catálogo, depois **somente adicionar ao DriverStore, sem `/install`**, conferir ranking PnP das duas instâncias ROOT\\DEVGEN; instalar apenas com plano de rollback e confirmação do ambiente dedicado. A atualização deve evitar DevGen, remoção dos devnodes, `/force`, alteração de BCD ou reinicialização automática.
