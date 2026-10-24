# LabSerial — diagnóstico de `SerialPort.Open()` no Windows físico (17/10/2026)

## Erro reportado pelo operador

Na suíte `Test-LabSerialSerialPort.ps1`, a abertura falhou **antes de transmitir qualquer byte**:

```text
System.Management.Automation.MethodInvocationException:
Exceção ao chamar "Open" com "0" argumento(s):
"Não há suporte para o pedido."
---> System.IO.IOException: Não há suporte para o pedido.
  em System.IO.Ports.InternalResources.WinIOError(Int32 errorCode, String str)
  em System.IO.Ports.SerialStream..ctor(...)
  em System.IO.Ports.SerialPort.Open()
```

Arquivo de evidência gerado no host do operador (ainda não enviado ao repositório):
`C:\Users\uzinh\Documents\LabSerial-Evidencias\Compat-20261017-041635-891-3915ffed\LabSerial-SerialPort-20261017-041636-843.json`

O **teste de transporte Win32 independente anterior permanece 6/6 PASS** (1.154 bytes); o resultado de compatibilidade .NET foi **FAIL**, corretamente reportado pelo supervisor.

## Análise do código-fonte

O `SerialStream` do .NET Framework chama `GetCommProperties` e `GetCommModemStatus` antes de inicializar o DCB, as filas e o monitoramento de eventos. Fontes:

- Código-fonte .NET Framework: https://github.com/microsoft/referencesource/blob/main/System/sys/system/IO/ports/SerialStream.cs
- Microsoft WDK `IOCTL_SERIAL_GET_PROPERTIES`: https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddser/ni-ntddser-ioctl_serial_get_properties
- Microsoft WDK `SERIAL_COMMPROP`: https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddser/ns-ntddser-_serial_commprop
- Microsoft WDK `IOCTL_SERIAL_SET_QUEUE_SIZE`: https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddser/ni-ntddser-ioctl_serial_set_queue_size

O driver antes dessa alteração tratava `IOCTL_SERIAL_GET_PROPERTIES` com `STATUS_NOT_SUPPORTED` (comando não implementado). O `IOCTL_SERIAL_GET_MODEMSTATUS` já é implementado. Isso torna o `GET_PROPERTIES` uma **causa fortemente provável da primeira falha**, mas o log .NET sozinho não inclui o código IOCTL; diagnóstico Win32 específico pode confirmar. Mesmo após a correção, outros IOCTLs ainda faltam (`IOCTL_SERIAL_WAIT_ON_MASK`, controle completo de fluxo, comportamento real de timeouts).

## Correção candidata na branch experimental (não instalada no host do operador)

Adicionado tratamento de `IOCTL_SERIAL_GET_PROPERTIES` com resposta tipada `SERIAL_COMMPROP`, capacidades conservadoras (9600/115200 e baud programável, dados/paridade/stop bits) e sem declarar suporte a timeout/flow control não implementados.

Adicionado suporte **limitado** a `IOCTL_SERIAL_SET_QUEUE_SIZE`, retornando sucesso apenas quando tamanhos solicitados cabem nas filas fixas de 4096 bytes; acima disso retorna `STATUS_NOT_SUPPORTED`. Não há alocação de buffers, resize dinâmico nem mudança das seis rotinas de transmissão Win32 existentes.

**Não significa que `SerialPort.Open()` já funciona:** a nova versão não foi instalada nem executada em Windows físico. Compilação WDK/INF/assinatura de teste/contratos na CI não prova compatibilidade de runtime.

## Como validar de forma incremental

1. Preservar os relatórios das execuções que já passaram e o binário original que está funcionando.
2. Realizar um diagnóstico Win32 somente da consulta `GetCommProperties` na instalação atual, sem atualizar driver.
3. Em VM com snapshot ou PC sobressalente/recuperação física, testar a nova compilação com rollback planejado e certificado correspondente; **não rodar o instalador inicial que criaria dispositivos duplicados**.
4. Repetir `System.IO.Ports.SerialPort` 9600/115200, classificando a próxima operação que eventualmente falhar; testar transmissão Win32 A↔B para regressão.
5. Somente depois tratar eventos `WAIT_ON_MASK`, cancelamento/tempo limite, PnP/reboot e stress para eventual distribuição.

O estado do projeto permanece **experimental, Draft, sem homologação para produção**.
