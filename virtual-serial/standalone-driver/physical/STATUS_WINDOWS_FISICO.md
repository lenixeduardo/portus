# LabSerial — status de compatibilidade Windows físico

**Status do projeto (17/10/2026):** **COMPATÍVEL NO ESCOPO DE TRANSMISSÃO WIN32 BÁSICA EM WINDOWS x64 FÍSICO (EXPERIMENTAL)**. **NÃO** homologado para uso geral/produção.

Este status é baseado nos testes reais relatados pelo operador no Windows físico; não é inferido da compilação CI. Não equivale a afirmar compatibilidade plena com todos os programas seriais.

| Capacidade | Status validado | Evidência/limitação |
|---|---|---|
| Driver KMDF carrega como serviço `LabSerial` e cria os dois dispositivos PnP | **CONFIRMADO no Windows físico** | A/B PnP Status OK, `ROOT\\DEVGEN` e HardwareIds `ROOT\\LABSERIAL_VCOM_A/B` |
| `COM210` e `COM211` aparecem em `SERIALCOMM` / `GetPortNames()` | **CONFIRMADO no Windows físico** | Mapeamento `\\Device\\LabSerialA/B` |
| Tráfego Win32 A↔B | **COMPATÍVEL NO TESTE BÁSICO** | 6/6 PASS, 1.154 bytes, SHA-256 TX/RX idênticos; supervisor final PASS |
| Aplicação `System.IO.Ports.SerialPort.Open()` (.NET Framework) — driver anterior 0.1.0.0 | **INCOMPATÍVEL no teste realizado** | `IOException: Não há suporte para o pedido` em `SerialStream..ctor`; falha antes da transmissão |
| Correção `GET_PROPERTIES` e `SET_QUEUE_SIZE` — pacote da build 17/10/2026 | **VALIDADA no teste básico Win32 e .NET** | Dois devnodes vinculados a `oem66.inf`; novo teste Win32 6/6 PASS e teste System.IO.Ports.SerialPort 4/4 PASS em 9600/115200 baud |
| Nome amigável A/B na enumeração PnP | **CONFIRMADO** | Saída real de `Get-PnpDevice`: `LabSerial Virtual Serial Port A (EXPERIMENTAL) (COM210)` e B `(COM211)`, ambos `Status=OK`; persistência após reboot não testada |
| COM3/COM4 do com0com | **NÃO AFETADAS PELO TESTE** | Testes abriram somente COM210/COM211 |
| Reboot/PnP/cancelamento/timeouts/stress/Driver Verifier/assinatura Microsoft | **NÃO HOMOLOGADO** | Requer testes dedicados adicionais |

## Critério de atualização do status

O status atual no Windows físico é **compatível nos testes básicos de transporte Win32 e .NET System.IO.Ports.SerialPort**. A compatibilidade com aplicações seriais de terceiros e funções avançadas ainda não foi comprovada. Não tratar `DriverVer` ou resultado WDK como teste de runtime.

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
- **A etapa .NET então pendente foi concluída com PASS, conforme registro cronológico de 05:18 abaixo.** Os relatórios JSON/TXT continuam no computador de laboratório.

Este é um segundo marco distinto: **transmissão Win32 passou também após atualização para o pacote `oem66.inf`**, mas não há homologação nem testes de stress/cancelamento/reboot.


## Compatibilidade .NET APROVADA no Windows físico — 17/10/2026 05:18

Após atualização das duas instâncias LabSerial para o pacote `oem66.inf` (DriverVersion `7.23.0.659`), o operador executou `Run-LabSerialCompatibilityBounded.ps1`. O teste abriu as portas COM210 e COM211 via `System.IO.Ports.SerialPort` com 8N1, sem handshake, a 9600 e 115200 baud.

Saída fornecida pelo operador:

```text
PASS BINARY 9600 B-A COM211 -> COM210, 16 bytes
Abrindo System.IO.Ports.SerialPort em COM210 e COM211 a 115200 baud, 8N1, Handshake.None
PASS ASCII 115200 A-B COM210 -> COM211, 43 bytes
PASS BINARY 115200 B-A COM211 -> COM210, 16 bytes
PASS: System.IO.Ports.SerialPort abriu ambas as portas e transferiu dados em duas velocidades.
PASS FINAL: System.IO.Ports.SerialPort - 9600/115200 baud, 8N1, quatro quadros TX/RX.
```

**Resultado confirmado pelo supervisor e JSON local:** 4/4 quadros PASS, transmissão ASCII COM210→COM211 e binária COM211→COM210 nas duas velocidades, comparação TX/RX sem divergências. A parte inicial da saída em 9600 foi truncada na mensagem, mas o resumo PASS FINAL só ocorre após o supervisor verificar os quatro quadros no JSON da sessão.

Arquivos originais gerados no computador físico (ainda não anexados ao projeto):
- JSON: `C:\Users\uzinh\Documents\LabSerial-Evidencias\Compat-20261017-051855-826-31c09113\LabSerial-SerialPort-20261017-051856-752.json`
- TXT: `C:\Users\uzinh\Documents\LabSerial-Evidencias\Compat-20261017-051855-826-31c09113\LabSerial-SerialPort-20261017-051856-752.txt`

**Marco atingido:** compatibilidade funcional BÁSICA com System.IO.Ports.SerialPort e transporte Win32 comprovados em Windows físico, após atualização do pacote oem66.inf. O erro anterior em SerialPort.Open() foi superado no teste.

**Não significa pronto para produção:** testar aplicativos seriais de terceiros/SerialTool, outros handshakes/paridades, timeouts reais, WaitCommEvent, carga prolongada, reinicialização, cancelamento, PnP, Driver Verifier e assinatura de distribuição. PR permanece Draft.

## LabSerial Setup WinForms validado em Windows físico — 17/10/2026 06:06–06:07

**Execução real a partir dos botões da interface instalada** (não apenas PowerShell avulso), conforme log completo enviado pelo operador. Inventário exibiu `Par operacional / identidade confirmada`, COM210/COM211 e ambos os PnP corretos. Foram aprovados os **três fluxos acionáveis**, total **12/12 quadros, 0 divergência/erros**:

| Operação na GUI | Prova de execução | Resultado |
|---|---|---|
| Testar Win32 | 6 quadros: ASCII 49 B por sentido, binário 16 B por sentido e 512 B por sentido; 1154 bytes | **6/6 PASS**, `exit 0` |
| Testar .NET | `System.IO.Ports.SerialPort.Open()` em ambas as portas, 9600 e 115200 baud, 8N1, `Handshake.None`; 4 quadros | **4/4 PASS**, `exit 0` |
| Testar Perfil | Perfil selecionado 9600 baud, 8N1, `Handshake.None`; ASCII COM210→COM211 (47 B) e binário COM211→COM210 (16 B) | **2/2 PASS**, `exit 0` |

Trechos literais de conclusão da interface:

```text
[06:06:35] RESULTADO Win32 — 6 quadros: PASS (exit 0).
[06:06:50] RESULTADO .NET — 4 quadros: PASS (exit 0).
[06:07:06] RESULTADO Perfil selecionado: PASS (exit 0).
```

Os supervisores emitiram `PASS FINAL` e os relatórios locais, incluindo:

- Win32 JSON: `C:\Users\uzinh\Documents\LabSerial-Evidencias\Sessao-20261017-060619-229-2327c94e\LabSerial-Transmissao-20261017-060620-236.json`
- .NET JSON: `C:\Users\uzinh\Documents\LabSerial-Evidencias\Compat-20261017-060644-288-eaabce7e\LabSerial-SerialPort-20261017-060644-874.json`
- Perfil JSON: `C:\Users\uzinh\Documents\LabSerial-Evidencias\Perfil-20261017-060702-026.json`

**Marco do gerenciador:** a interface nativa WinForms foi realmente aberta no Windows do operador, identificou o driver existente e executou com sucesso as três operações de comunicação implementadas; os resultados são evidências de campo relatadas pelo operador. Os JSON originais não foram anexados aqui, apenas as saídas de console.

**Limites ainda pendentes:** fidelidade visual ao mockup clássico avaliada em 4,5/10 na inspeção de tela enviada (a implementação é funcional, porém layout diferente); `Adicionar/Remover Par` apenas manipulam a lista de pares fixos, não dispositivos PnP; ainda sem stress prolongado, reboot/replug, cancelamento, WaitCommEvent, testes de apps terceiros, assinatura Microsoft ou homologação para produção.
