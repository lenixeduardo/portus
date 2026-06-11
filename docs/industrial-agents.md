# Sistema de Integracao Industrial

Este documento descreve a arquitetura implementada em `src/main/industrial`.
Ela complementa a captura serial existente do Portus e cria uma base testavel para
Serial, Modbus RTU, parser, streaming e diagnostico.

## Agentes

### 1. Serial Connection Agent

Arquivo: `src/main/industrial/serial-connection-agent.ts`

Responsabilidades:

- Descobrir portas COM via `SerialPort.list()`.
- Validar porta, baud rate, data bits, stop bits, paridade e timeout.
- Executar teste tecnico de abertura de porta.
- Emitir logs industriais no event bus.

Uso previsto na interface:

- Tela tecnica de configuracao COM.
- Botao de atualizar portas.
- Botao de testar conexao.
- Status visual: conectado, porta indisponivel, timeout ou erro.

### 2. Modbus Communication Agent

Arquivo: `src/main/industrial/modbus-communication-agent.ts`

Responsabilidades:

- Montar frames Modbus RTU para leitura de holding registers.
- Calcular e validar CRC16 Modbus.
- Interpretar respostas binaras em registradores.
- Permitir transporte real ou mock por dispositivo.

O agente foi desenhado para receber uma implementacao de `ModbusTransport`.
Isso permite plugar `jsmodbus`, uma porta serial direta, ou um mock de teste sem
alterar parser, streaming ou monitoramento.

### 3. Device Parser Agent

Arquivo: `src/main/industrial/device-parser-agent.ts`

Responsabilidades:

- Converter registradores brutos em leitura padronizada.
- Aplicar escala por equipamento.
- Emitir payload no formato:

```json
{
  "device": "densimeter",
  "timestamp": "ISO_DATE",
  "value": 12.345,
  "unit": "kg/m3",
  "status": "connected",
  "metric": "density"
}
```

Mapeamentos iniciais:

- Densimetro: densidade em `kg/m3`.
- Viscosimetro: viscosidade em `mPa.s` ou unidade configurada.
- Espectrometro: frequencia, absorbancia ou amostragem espectral conforme mapa de registradores.

### 4. Data Streaming Agent

Arquivo: `src/main/industrial/data-streaming-agent.ts`

Responsabilidades:

- Publicar leituras para WebSocket, REST, event bus ou sink local.
- Manter cache offline quando um destino falha.
- Reprocessar fila com `flush()`.

Para ERP, implemente `ReadingSink` com `send(reading)` e registre um target do
tipo `rest` ou `event-bus`.

### 5. Monitoring & Diagnostics Agent

Arquivo: `src/main/industrial/monitoring-diagnostics-agent.ts`

Responsabilidades:

- Controlar ultima leitura, tempo de resposta, falhas, reconexoes e estabilidade.
- Emitir snapshots de diagnostico por dispositivo.
- Classificar erros como `crc_error`, `timeout`, `offline`, `port_unavailable` ou `error`.

## Fluxo

1. `SerialConnectionAgent` descobre e valida a porta.
2. `ModbusCommunicationAgent` envia request RTU e valida CRC.
3. `DeviceParserAgent` normaliza registradores para payload industrial.
4. `DataStreamingAgent` publica a leitura e preserva fallback offline.
5. `MonitoringDiagnosticsAgent` atualiza metricas e logs.

O `IndustrialOrchestrator` executa esse fluxo para uma leitura com `pollOnce`.
Um loop de polling continuo pode chamar `pollOnce` respeitando `pollIntervalMs`
por equipamento.

## Testes sem hardware

Rodar:

```powershell
npm test -- --run src/main/__tests__/industrial-agents.test.ts
```

Os testes cobrem:

- CRC16 Modbus conhecido.
- Montagem de frame RTU.
- Parsing de resposta Modbus.
- Fluxo completo com `MockModbusTransport`.

## Validacao para instalacao

Checklist recomendado:

1. Conectar um equipamento por vez.
2. Abrir configuracao tecnica e atualizar portas COM.
3. Selecionar porta, baud rate, data bits, stop bits, paridade e timeout do manual.
4. Executar teste de conexao.
5. Rodar leitura mock para confirmar parser/streaming.
6. Rodar leitura real e conferir payload bruto nos logs.
7. Ajustar escala, unidade e registradores.
8. Ativar streaming para ERP somente depois de leituras consistentes.

## Proximo encaixe no app

A captura serial atual continua em `src/main/serial/capture-service.ts`.
Para expor a arquitetura industrial na UI, os proximos handlers IPC sugeridos sao:

- `industrial:list-ports`
- `industrial:test-connection`
- `industrial:poll-once`
- `industrial:get-diagnostics`
- `industrial:on-reading`
- `industrial:on-log`

Essa separacao evita misturar o fluxo atual de lotes/codigo de barras com a
camada industrial Modbus ate a validacao em bancada estar completa.
