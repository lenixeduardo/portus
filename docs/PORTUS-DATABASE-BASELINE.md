# PORTUS — Baseline do banco e inventário da Etapa 0

- **Data:** 2026-09-09
- **Branch:** `feat/portus-stage-0-database-baseline`
- **Referência:** `main` em 2026-09-09
- **Especificação:** `PORTUS_SPEC_TECNICO(1).md`

## Objetivo

Registrar o estado real do banco local e o modelo PostgreSQL acordado antes da implementação
das migrations e da adaptação do PORTUS.

## Estado atual

O PORTUS roda como Electron + React + TypeScript. O banco atual é `sql.js`, persistido
como `serial-reader.sqlite` no diretório de dados do usuário. A camada de consulta usa
transações locais e exporta o banco para o arquivo após as escritas.

A documentação antiga citava `better-sqlite3`, mas o código efetivo utiliza `sql.js`.

## Tabelas atuais a preservar

| Tabela | Papel atual | Evolução inicial |
|---|---|---|
| `users` | Login local; `admin` e `operator` | Usuários centrais e permissões |
| `products` | Catálogo de produtos | Preservar |
| `batches` | Lote aberto/fechado | Evoluir com `stage`, versão e confirmações |
| `capture_sessions` | Janela de captura serial | Preservar e centralizar progressivamente |
| `readings` | Valor cru e valor parseado | Preservar estrutura e vínculo |
| `equipments` | Configuração serial/Modbus | Separar configuração física por estação quando necessário |
| `capture_error_logs` | Erros técnicos de captura | Preservar e relacionar ao lote/sessão |
| `settings` | Configuração local | Continuar local quando depender da estação |
| `schema_migrations` | Migrations locais | Criar migrations PostgreSQL separadas |

A nomenclatura histórica `recipes → formulas → products` não deve ser reintroduzida.
O domínio central utilizará `products` e `batches`.

## Modelo central acordado

`batches` continuará sendo a entidade principal:

```text
id
product_id
code
status              -- open | closed
stage               -- A/B ou código de setor
opened_at
closed_at
created_by
closed_by
production_closed
production_closed_at
production_closed_by
laboratory_closed
laboratory_closed_at
laboratory_closed_by
opened_source
closed_source
version
created_at
updated_at
```

O fechamento global ocorre somente quando:

```text
production_closed = true
laboratory_closed = true
status = closed
```

O limite global de seis lotes foi removido da especificação atual. O controle passa a ser
por setor, aplicação e responsabilidade operacional.

## Relações preservadas

- Usuário cria produtos e lotes.
- Produto possui vários lotes.
- Lote possui várias sessões de captura.
- Sessão possui várias leituras.
- Leitura aponta para equipamento e lote.
- Erros técnicos podem apontar para lote, sessão e equipamento.
- Histórico registra abertura, movimentação, confirmações e fechamento.

## Escritores atuais

| Operação | Local do escritor |
|---|---|
| Criar lote | `src/main/ipc/batches-handlers.ts` → repository local |
| Fechar lote | `src/main/ipc/batches-handlers.ts` → repository local |
| Criar sessão | `src/main/serial/capture-service.ts` → repository local |
| Inserir leitura | `src/main/serial/capture-service.ts` → repository local |
| Atualizar equipamento | Handler IPC → repository local |
| Usuários/produtos/configurações | Handlers IPC → repositories locais |

O Passo 1 criará as funções PostgreSQL para que esses escritores sejam migrados
progressivamente sem reescrever a captura serial.

## Funções de domínio do Passo 1

- `open_batch`
- `register_reading`
- `move_batch_to_stage`
- `confirm_production_close`
- `confirm_laboratory_close`

Todas devem:

- verificar aplicação, usuário e setor;
- usar transação;
- bloquear o lote quando necessário;
- incrementar `version`;
- registrar `batch_history`;
- impedir operação em lote fechado;
- tornar confirmações repetidas idempotentes.

## Fora do escopo inicial

- Lot Service obrigatório.
- Limite global de seis lotes.
- Kafka/RabbitMQ.
- CQRS/Event Sourcing.
- CDC.
- Operação offline com múltiplos escritores.
- Reconstrução integral da captura serial.

## Critério de saída da Etapa 0

- [x] Baseline real do banco documentado.
- [x] Especificação técnica anexada incorporada.
- [x] ADR alinhado ao PostgreSQL compartilhado.
- [x] Regra Produção + Laboratório registrada.
- [x] Limite global de seis lotes removido do modelo central.
- [x] Schema PostgreSQL aplicado em ambiente de desenvolvimento.
- [x] Funções de domínio testadas em transação com `ROLLBACK`.
- [x] Permissões por setor validadas por teste SQL automatizado.
- [ ] Permissões homologadas com usuários e equipamentos reais.

## Integração Electron — Passo 1

O Electron agora possui um adaptador PostgreSQL opcional:

- \`PORTUS_DATABASE_URL\`: URL de conexão do PostgreSQL central;
- \`PORTUS_DATABASE_POOL_MAX\`: máximo de conexões do pool (padrão 5);
- \`PORTUS_DATABASE_CONNECT_TIMEOUT_MS\`: timeout de conexão (padrão 5000 ms);
- \`PORTUS_SECTOR_CODE\`: setor padrão para abertura (padrão \`PRODUCTION\`).
- \`PORTUS_DATABASE_MODE\`: \`central\` por padrão; \`local\` somente para desenvolvimento explícito.

A captura USB/serial continua local. A API central foi exposta por IPC separado para permitir a migração progressiva dos fluxos de lotes, sem substituir o funcionamento local quando a URL não estiver configurada.


A captura serial permanece local no Electron, mas suas sessões e leituras passam a ser persistidas no PostgreSQL central quando a conexão estiver ativa. O mapeamento de equipamento usa `equipments.name` ou `equipments.code`; a homologação deve garantir que esses identificadores coincidam entre a configuração local e a central.

O cabeçalho da aplicação consulta `central.status()` na abertura da sessão e a
cada 15 segundos. O badge diferencia conexão disponível, falha de conexão,
configuração ausente e verificação em andamento. A disponibilidade é confirmada
no processo principal com `SELECT 1`; a URL do banco não é exposta ao renderer.

A migration `003_security_permissions.sql` revoga de `PUBLIC` todos os
privilégios em tabelas e sequências e a execução de funções do schema central.
As roles físicas usadas pelas estações devem ser concedidas explicitamente na
homologação e nunca devem reutilizar o proprietário administrativo das migrations.


## Homologação de captura

Antes de abrir as portas seriais em modo central, o Electron valida se cada equipamento local possui correspondência por `name` ou `code` em `equipments` no PostgreSQL. Se a central estiver indisponível ou houver equipamento sem mapeamento, a captura é interrompida com erro explícito; não há fallback silencioso para o banco local em lotes centrais.
