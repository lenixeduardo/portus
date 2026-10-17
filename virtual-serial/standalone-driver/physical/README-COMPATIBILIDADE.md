# LabSerial — compatibilidade .NET e correção dos nomes COM

**Tipo de alteração:** ferramentas de teste e uma alteração opt-in na propriedade `FriendlyName` dos dois dispositivos. **Não substitui nem reinstala** `labserial.sys`, INF ou catálogo, não altera portas COM, não altera BCD e não toca no com0com.

## Contexto da instalação real (17/10/2026)

Após a instalação de laboratório, a comunicação Win32 básica COM210 ↔ COM211 passou em seis quadros (1.154 bytes). Entretanto, o Windows exibia o dispositivo A como **COM6** e B como **COM5**, enquanto `PortName`, `SERIALCOMM`, `QueryDosDevice` e a comunicação efetiva usam **COM210** e **COM211**. São as propriedades visuais PnP que precisam ser conciliadas.

## Ferramenta de nomes

- `Repair-LabSerialNames.ps1` sem argumentos: **prévia somente leitura**, validando HardwareIds A/B, estado PnP `OK`, serviço `LabSerial`, `PortName` e mapa `SERIALCOMM` (nenhuma alteração).
- `Repair-LabSerialNames.ps1 -Apply -ConfirmDedicatedNonProductionPC -ConfirmRecoveryAndConsoleAccess`: opção restrita ao **computador de laboratório com backup e console físico**.
- Usa a API oficial Windows `SetupDiSetDeviceRegistryPropertyW` com `SPDRP_FRIENDLYNAME` para definir:
  - `LabSerial Virtual Serial Port A (EXPERIMENTAL) (COM210)`
  - `LabSerial Virtual Serial Port B (EXPERIMENTAL) (COM211)`
- Antes da mudança, salva arquivo de backup em `Documentos\LabSerial-Evidencias\LabSerial-FriendlyName-Backup-*.json`, contendo os nomes anteriores e IDs exatos.
- Restauração opcional: execute `Restore-LabSerialNames.ps1 -BackupPath "CAMINHO_DO_BACKUP.json"` para **prévia**, e somente em laboratório use `-Apply -ConfirmDedicatedNonProductionPC -ConfirmRecoveryAndConsoleAccess` para restaurar exatamente os nomes originais. O script verifica o host, os IDs, o serviço e o PortName antes de modificar qualquer propriedade.
- Altera **apenas** o nome amigável PnP; não modifica número de porta, mapeamento real, INF, serviço de driver ou dispositivo com0com. Exige autorização explícita do administrador e pergunta de confirmação.
- O nome PnP pode ser redefinido pelo instalador da classe Ports durante reinstalações ou atualizações. Essa correção serve à instalação atual e precisa ser testada novamente após PnP/reboot. A resolução definitiva no fluxo de instalação deverá ser revisitada na próxima versão.

Referência oficial: https://learn.microsoft.com/en-us/windows/win32/api/setupapi/nf-setupapi-setupdisetdeviceregistrypropertyw

## Compatibilidade `System.IO.Ports.SerialPort`

O teste nativo Win32 anterior não chamava a API de alto nível. A nova suíte usa exatamente `System.IO.Ports.SerialPort`, exigindo:

1. Dois PnP corretamente identificados por HardwareIds, serviço e `PortName` mais os links DOS (COM210/211).
2. `SerialPort.Open()` e configuração `9600 baud`, 8N1, `Handshake.None`, `ReadTimeout=2500`, `WriteTimeout=2500`.
3. Escrita e leitura de texto ASCII (COM210 → COM211) e dados binários (COM211 → COM210).
4. Mesmas verificações na velocidade `115200 baud`.
5. Quatro casos, comparação byte a byte, hash SHA-256 dos conteúdos TX/RX, resultados detalhados PASS/FAIL e exceções reais (.NET/Win32).

Arquivos: `Test-LabSerialSerialPort.ps1` (padrão diagnóstico somente leitura), `Run-LabSerialCompatibilityBounded.ps1` (executor com timeout de **45 segundos** e validação JSON). Os relatórios são salvos em `Documentos\LabSerial-Evidencias\Compat-*\`.

**Risco:** o tempo limite do supervisor apenas limita o processo de usuário, não protege de travamento de kernel. `SerialPort` pode exigir IOCTLs como `IOCTL_SERIAL_GET_PROPERTIES`, `IOCTL_SERIAL_SET_QUEUE_SIZE` ou `IOCTL_SERIAL_WAIT_ON_MASK`; essas operações ainda não estão implementadas integralmente no LabSerial KMDF. Um resultado FAIL indica exatamente onde evoluir o driver, **não deve ser convertido em sucesso**.

Referências Microsoft: https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/_serports/ ; https://learn.microsoft.com/en-us/dotnet/api/system.io.ports.serialport

## Executar no computador de laboratório

Extraia o artefato `labserial-compatibility-name-tools` do GitHub Actions em uma pasta nova. **Não substitua o driver previamente instalado.**

Abra `LabSerial-Compatibilidade-e-Nomes.bat`; o menu oferece:

- `1` Diagnóstico .NET sem abrir COM.
- `2` Teste REAL com `SerialPort`, sujeito a confirmações de laboratório.
- `3` Prévia da correção dos nomes, sem modificar.
- `4` Aplicação da correção exclusivamente à propriedade `FriendlyName`, com backup e confirmação.
- `5` Abrir diretório de relatórios.
- `6` Desbloquear marcação de origem da internet somente após validar hashes dos scripts.
- `0` Sair.

O BAT exige `LabSerial-Compat-Manifest.json` com os hashes SHA-256 de todos os arquivos distribuídos; a pipeline gera e inclui esse manifesto em todos os pacotes de compatibilidade. O menu aborta se houver divergências.

Se os testes falharem, não modifique o `.sys` sem registrar primeiro o erro/stack trace e os relatórios. **A compatibilidade e a alteração visual dos nomes não estão confirmadas em Windows físico até a execução pelo operador.**

## Gates para produção

A comunicação Win32 básica já passou no computador de laboratório, mas ainda faltam `SerialPort`/SerialTool, comportamento de timeouts, PnP/reboot, preservação do `FriendlyName` em reinicializações, Driver Verifier, stress e assinatura pública Microsoft. PR permanece Draft.
