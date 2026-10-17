# LabSerial: evidência de transmissão COM210 ↔ COM211

## Situação comprovada no Windows (captura de 17/10/2026)

O usuário forneceu captura de PowerShell do computador DESKTOP-R4VIRTK; os dois dispositivos PnP aparecem com Status OK e Problem CM_PROB_NONE. Isso comprova enumeração, mas **ainda não transmissão de dados**.

| Endpoint | Nome apresentado | InstanceId | HardwareId | Serviço | PortName |
| --- | --- | --- | --- | --- | --- |
| A | LabSerial Virtual Serial Port A (COM6) | ROOT\DEVGEN\{92205F30-ECF7-DF4F-BB04-D1B13C89502E} | ROOT\LABSERIAL_VCOM_A | LabSerial | COM210 |
| B | LabSerial Virtual Serial Port B (COM5) | ROOT\DEVGEN\{CAF11815-BCE7-EA4E-90F6-F3C2758EB0F8} | ROOT\LABSERIAL_VCOM_B | LabSerial | COM211 |

O registro SERIALCOMM exibe \Device\LabSerialA=COM210 e \Device\LabSerialB=COM211. SerialPort.GetPortNames retornou COM210/COM211; COM3/COM4 pertencem ao com0com. A diferença visual COM5/COM6 versus PortName COM210/COM211 ainda precisa ser corrigida, sem alterar manualmente as portas neste estágio.

## Teste novo

Os arquivos Teste-Transmissao-LabSerial.bat, Evidence-LabSerialTransfer.ps1, Run-LabSerialEvidenceBounded.ps1 e LabSerialNativeProbe.cs compõem um teste independente de transmissão real.

O BAT oferece (1) inventário somente leitura e (2) envio de dados, **somente em PC sobressalente de laboratório** com backup recuperável e acesso físico. Não altera drivers, BCD, Secure Boot, certificados ou portas de terceiros.

O script resolve a identidade de cada dispositivo por HardwareIds (e não pelo InstanceId ROOT\DEVGEN), exige serviço LabSerial e PnP OK, confere PortName, SERIALCOMM, GetPortNames e QueryDosDevice para os nomes COM210 e COM211. Não abre COM5/COM6 nem COM3/COM4.

O teste real transmite seis quadros: ASCII A→B e B→A, payload binário contendo 0x00, 0xFF, 0x11 e 0x13 em ambos os sentidos, e bloco de 512 bytes em ambos os sentidos. Usa CreateFile/ReadFile/WriteFile Win32 overlapped com timeout e um watchdog externo de 75 segundos. **Watchdog não impede BSOD no kernel.**

## Resultado esperado e evidência

Somente uma execução real no Windows pode produzir PASS. O resultado precisa conter seis casos com Status=PASS, escrita e leitura completas, TX/RX hex idênticos e SHA-256 idênticos.

Os relatórios ficam em Documents\LabSerial-Evidencias\LabSerial-Transmissao-<timestamp>.json e .txt, com data/hora, identidade PnP, mapeamentos, bytes, hashes, durações, observações e erros. Uma falha gera FAIL; não é transformada em sucesso.

## Como executar

1. Extraia o artefato labserial-transfer-evidence-tools do GitHub Actions na pasta do LabSerial instalado (sem substituir o .sys que já funciona).
2. Abra Teste-Transmissao-LabSerial.bat e execute a opção 1 de diagnóstico.
3. Somente se o computador for de laboratório e houver recuperação física, execute a opção 2 para transmissão real.
4. Envie o TXT/JSON para análise. Se falhar por IOCTL/timeout, não repita antes de investigar o driver.

Este protocolo **não** certifica o driver para produção; permanecem pendentes testes de PnP remove, stress, Driver Verifier, timeouts e integridade de dados após reinicialização.