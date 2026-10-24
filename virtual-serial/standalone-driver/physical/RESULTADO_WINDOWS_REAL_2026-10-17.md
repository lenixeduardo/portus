# LabSerial — primeira transmissão física bidirecional confirmada

**Data informada pelo operador:** 2026-10-17, 03:43 local (informação inferida do nome do relatório).
**Fonte:** transcrição da saída do PowerShell enviada pelo operador durante teste em Windows físico. Os arquivos JSON/TXT originais ainda não foram fornecidos para auditoria independente.
**Natureza:** evidência de teste funcional de transporte COM, **não** homologação de produção e **não** liberação para distribuição.

## Identidade das portas conferida na execução

- HardwareId `ROOT\LABSERIAL_VCOM_A`, serviço `LabSerial`, `PortName=COM210`, `InstanceId=ROOT\DEVGEN\{92205F30-ECF7-DF4F-BB04-D1B13C89502E}`; dispositivo exibido como COM6.
- HardwareId `ROOT\LABSERIAL_VCOM_B`, serviço `LabSerial`, `PortName=COM211`, `InstanceId=ROOT\DEVGEN\{CAF11815-BCE7-EA4E-90F6-F3C2758EB0F8}`; dispositivo exibido como COM5.
- Script verificou PnP, HardwareIds, serviço, `PortName`, `SERIALCOMM` e `QueryDosDevice` antes de abrir exclusivamente COM210 e COM211. A implementação Win32 usa I/O sobreposto (`CreateFile`/`ReadFile`/`WriteFile`).

## Seis casos reportados PASS

| Caso | Direção | Bytes | Hash SHA-256 mostrado | Resultado |
|---|---|---:|---|---|
| ASCII | COM210 → COM211 | 49 | `9B41797247A034E85217B8CE8418CFCF09B5A60AE8BCC20C8C5CF16DE7432BA4` | PASS |
| ASCII | COM211 → COM210 | 49 | `944DDAA3DE6089DA97A7299CB56C01DA60BD48DD1D307158442B74832D6D9B64` | PASS |
| Binário | COM210 → COM211 | 16 | `202375CA0A02D744F1DA875FC4570A1B6C871AA9690818B41C51E91BBA85EA4C` | PASS |
| Binário | COM211 → COM210 | 16 | `202375CA0A02D744F1DA875FC4570A1B6C871AA9690818B41C51E91BBA85EA4C` | PASS |
| 512 bytes | COM210 → COM211 | 512 | `08AC48E649B513D133DE8324A7C75F166F3347490AFCBE447E8DF6DEBF09208B` | PASS |
| 512 bytes | COM211 → COM210 | 512 | `08AC48E649B513D133DE8324A7C75F166F3347490AFCBE447E8DF6DEBF09208B` | PASS |

**Total:** 1.154 bytes validados em seis quadros, três em cada sentido. O teste declarou `PASS: 6 quadros e dados binarios transmitidos e recebidos sem divergencias.`

Relatórios gerados na máquina de teste (ainda não anexados ao projeto):

- `C:\Users\uzinh\Documents\LabSerial-Evidencias\LabSerial-Transmissao-20261017-034320-817.json`
- `C:\Users\uzinh\Documents\LabSerial-Evidencias\LabSerial-Transmissao-20261017-034320-817.txt`

## Defeito encontrado no supervisor (não no transporte)

Após todos os quadros PASS, `Run-LabSerialEvidenceBounded.ps1` apresentou `Teste NAO aprovado (exit code )`, com código de saída vazio. Esse é um **falso negativo do supervisor** originado da leitura de `ExitCode` do processo filho. O teste de transporte reportou sucesso antes desse erro. O estado do JSON original precisa ser inspecionado para encerrar a auditoria.

Correção no código de teste: usar `System.Diagnostics.Process`, `WaitForExit` e `Refresh` com captura explícita de código de saída, acrescentar teste de regressão 0/7/timeout, exigir JSON da própria sessão com exatamente seis quadros PASS, contagem de bytes, hashes TX/RX idênticos e três transmissões em cada direção; propagação correta do status pelo BAT. A correção do supervisor **não altera o `.sys` instalado**.

## Próximas pendências

- [x] Dispositivos A e B reconhecidos como PnP OK no Windows físico.
- [x] Serviço LabSerial e mapas COM210/COM211 resolvidos.
- [x] Seis transferências Win32 A↔B reportadas PASS pelo teste de campo.
- [ ] Verificar JSON/TXT original do teste e seus seis registros com `Status=PASS`.
- [ ] Conciliar nomes exibidos COM5/COM6 com `PortName` COM210/COM211.
- [ ] Testar serial API de alto nível (`System.IO.Ports.SerialPort`/SerialTool), IOCTLs seriais e timeouts reais.
- [ ] Reinicialização, desconexão PnP, cancelamento, race conditions, testes longos e Driver Verifier.
- [ ] Assinatura Windows de distribuição; ainda só test signing.

**Não declarar `ready for production`.**