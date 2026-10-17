# LabSerial — status de compatibilidade Windows físico

**Status do projeto (17/10/2026):** **COMPATÍVEL NO ESCOPO DE TRANSMISSÃO WIN32 BÁSICA EM WINDOWS x64 FÍSICO (EXPERIMENTAL)**. **NÃO** homologado para uso geral/produção.

Este status é baseado nos testes reais relatados pelo operador no Windows físico; não é inferido da compilação CI. Não equivale a afirmar compatibilidade plena com todos os programas seriais.

| Capacidade | Status validado | Evidência/limitação |
|---|---|---|
| Driver KMDF carrega como serviço `LabSerial` e cria os dois dispositivos PnP | **CONFIRMADO no Windows físico** | A/B PnP Status OK, `ROOT\\DEVGEN` e HardwareIds `ROOT\\LABSERIAL_VCOM_A/B` |
| `COM210` e `COM211` aparecem em `SERIALCOMM` / `GetPortNames()` | **CONFIRMADO no Windows físico** | Mapeamento `\\Device\\LabSerialA/B` |
| Tráfego Win32 A↔B | **COMPATÍVEL NO TESTE BÁSICO** | 6/6 PASS, 1.154 bytes, SHA-256 TX/RX idênticos; supervisor final PASS |
| Aplicação `System.IO.Ports.SerialPort.Open()` (.NET Framework) — driver anterior 0.1.0.0 | **INCOMPATÍVEL no teste realizado** | `IOException: Não há suporte para o pedido` em `SerialStream..ctor`; falha antes da transmissão |
| Correção `GET_PROPERTIES` e `SET_QUEUE_SIZE` — pacote 0.1.1.0 | **COMPILA; AINDA NÃO VALIDADA EM CAMPO** | WDK x64 Debug/Release e InfVerif passaram; não há relatório de carregamento/abertura do 0.1.1.0 no Windows físico |
| Nome amigável A/B no Gerenciador de Dispositivos | **PENDENTE DE VERIFICAÇÃO** | PnP apresentou COM6/COM5 embora os nomes funcionais sejam COM210/COM211; utilitário de correção disponível, sem confirmação de aplicação |
| COM3/COM4 do com0com | **NÃO AFETADAS PELO TESTE** | Testes abriram somente COM210/COM211 |
| Reboot/PnP/cancelamento/timeouts/stress/Driver Verifier/assinatura Microsoft | **NÃO HOMOLOGADO** | Requer testes dedicados adicionais |

## Critério de atualização do status

O status geral do Windows físico pode continuar **“funcional para transmissão Win32 básica”**. Somente marcar **“compatível com System.IO.Ports.SerialPort”** depois de instalar 0.1.1.0 em VM/PC sobressalente com rollback e receber `Open()` + transmissão real em ambos os sentidos sem erros. Não tratar `DriverVer` ou resultado WDK como teste de runtime.

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
