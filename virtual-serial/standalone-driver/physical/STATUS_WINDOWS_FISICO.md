# LabSerial — status de compatibilidade Windows físico

**Status do projeto (17/10/2026):** **COMPATÍVEL NO ESCOPO DE TRANSMISSÃO WIN32 BÁSICA EM WINDOWS x64 FÍSICO (EXPERIMENTAL)**. **NÃO** homologado para uso geral/produção.

Este status é baseado nos testes reais relatados pelo operador no Windows físico; não é inferido da compilação CI. Não equivale a afirmar compatibilidade plena com todos os programas seriais.

| Capacidade | Status validado | Evidência/limitação |
|---|---|---|
| Driver KMDF carrega como serviço `LabSerial` e cria os dois dispositivos PnP | **CONFIRMADO no Windows físico** | A/B PnP Status OK, `ROOT\\DEVGEN` e HardwareIds `ROOT\\LABSERIAL_VCOM_A/B` |
| `COM210` e `COM211` aparecem em `SERIALCOMM` / `GetPortNames()` | **CONFIRMADO no Windows físico** | Mapeamento `\\Device\\LabSerialA/B` |
| Tráfego Win32 A↔B | **COMPATÍVEL NO TESTE BÁSICO** | 6/6 PASS, 1.154 bytes, SHA-256 TX/RX idênticos; supervisor final PASS |
| Aplicação `System.IO.Ports.SerialPort.Open()` (.NET Framework) — driver anterior 0.1.0.0 | **INCOMPATÍVEL no teste realizado** | `IOException: Não há suporte para o pedido` em `SerialStream..ctor`; falha antes da transmissão |
| Correção `GET_PROPERTIES` e `SET_QUEUE_SIZE` — pacote da build 17/10/2026 | **INSTALADO e testado em transporte Win32; .NET pendente** | Dois devnodes agora vinculados a `oem66.inf`; novo teste Win32 6/6 PASS. Ainda não há teste `SerialPort.Open()` pós-atualização |
| Nome amigável A/B na enumeração PnP | **CONFIRMADO** | Saída real de `Get-PnpDevice`: `LabSerial Virtual Serial Port A (EXPERIMENTAL) (COM210)` e B `(COM211)`, ambos `Status=OK`; persistência após reboot não testada |
| COM3/COM4 do com0com | **NÃO AFETADAS PELO TESTE** | Testes abriram somente COM210/COM211 |
| Reboot/PnP/cancelamento/timeouts/stress/Driver Verifier/assinatura Microsoft | **NÃO HOMOLOGADO** | Requer testes dedicados adicionais |

## Critério de atualização do status

O status geral do Windows físico pode continuar **“funcional para transmissão Win32 básica”**. Somente marcar **“compatível com System.IO.Ports.SerialPort”** depois de receber `Open()` + transmissão real em ambos os sentidos sem erros usando a versão `oem66.inf` já instalada. Não tratar `DriverVer` ou resultado WDK como teste de runtime.

Evidências originais da transmissão e diagnóstico:
- [Execução Win32 6/6 PASS com supervisor](./RESULTADO_TRANSFERENCIA_WINDOWS_2026-10-17_0353.md)
- [Falha em SerialPort.Open() e correção candidata](./DIAGNOSTICO_SERIALPORT_OPEN_2026-10-17.md)

**PR Draft e instalação exclusivamente experimental.**


## Atualização de driver no host físico — 17/10/2026, relatório do operador

Após exportar com êxito o driver anterior `oem65.inf` para `Documents\LabSerial-Backup-oem65`, verificar assinatura Authenticode `Valid` do pacote de teste e adicioná-lo ao DriverStore, o operador executou `pnputil /add-driver ... /install`. O Windows informou instalação do pacote nas **duas instâncias já existentes**:

- A: `ROOT\DEVGEN\{92205F30-ECF7-DF4F-BB04-D1B13C89502E}`
- B: `ROOT\DEVGEN\{CAF11815-BCE7-EA4E-90F6-F3C2758EB0F8}`

A consulta posterior `Win32_PnPSignedDriver` retornou **`InfName=oem66.inf` e `DriverVersion=7.23.0.659` para ambos os dispositivos**, confirmando a vinculação PnP da versão candidata construída em 17/10/2026. O valor de versão é um carimbo do WDK, não a versão semântica 0.1.1.0 esperada. Não houve novo DevGen nem duplicação declarada de instâncias.

**Estado de testes pós-atualização:** ainda NÃO foram enviados `Get-PnpDevice Status`, novo smoke Win32 6/6, nem resultado de `System.IO.Ports.SerialPort.Open()` com o pacote `oem66.inf`. Compatibilidade .NET continua **PENDENTE DE TESTE PÓS-INSTALAÇÃO**, não pode ser marcada PASS. Não afirmar que a imagem KMDF foi efetivamente testada em execução apenas pelo `InfName`.


## Validação pós-atualização no Windows físico — 17/10/2026 05:15 (evidência relatada pelo operador)

- Saída `Get-PnpDevice -Class Ports -PresentOnly`: `LabSerial Virtual Serial Port B (EXPERIMENTAL) (COM211)` e `LabSerial Virtual Serial Port A (EXPERIMENTAL) (COM210)`, ambos `Status=OK`; mesmas instâncias `ROOT\\DEVGEN` anteriores, sem indicação de duplicação.
- Com driver agora associado a `oem66.inf` (`DriverVersion=7.23.0.659` no host), o operador executou `Run-LabSerialEvidenceBounded.ps1` com autorizações de PC de laboratório e identidade LabSerial.
- **Resultado: 6/6 PASS e `PASS FINAL: 6 quadros, 1154 bytes verificados, A->B=3 e B->A=3`.** Casos: ASCII 49 bytes em ambos os sentidos; binário 16 bytes em ambos os sentidos; padrão de 512 bytes em ambos os sentidos. Nenhuma divergência reportada.
- Arquivos originais criados no host, **não anexados ao repositório**: `C:\\Users\\uzinh\\Documents\\LabSerial-Evidencias\\Sessao-20261017-051526-667-8e2793de\\LabSerial-Transmissao-20261017-051535-824.json` e `.txt` correspondente.
- Os nomes PnP agora apresentam COM210 e COM211 corretamente. Não há confirmação de como se deu a alteração visual (reinstalação PnP ou utilitário de correção); registrar **somente o estado verificado**.
- **Ainda pendente:** teste real de `System.IO.Ports.SerialPort` 9600/115200 e relatório `PASS/FAIL` pós-atualização; NÃO marcar compatibilidade .NET como aprovada sem esse teste.

Este é um segundo marco distinto: **transmissão Win32 passou também após atualização para o pacote `oem66.inf`**, mas não há homologação nem testes de stress/cancelamento/reboot.
