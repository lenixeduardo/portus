# PORTUS — Baseline do banco e inventário da Etapa 0

- **Data:** 2026-09-09
- **Branch:** `feat/portus-stage-0-database-baseline`
- **Referência:** `main` em 2026-09-09

## Objetivo

Registrar o estado real do banco local antes da implementação do PostgreSQL central e
identificar os pontos que precisam ser preservados ou substituídos.

## Estado atual

O PORTUS roda como Electron + React + TypeScript. O banco atual é `sql.js`, persistido
como `serial-reader.sqlite` no diretório de dados do usuário. A camada de consulta usa
transações locais e exporta o banco para o arquivo após as escritas.

A documentação antiga cita `better-sqlite3`, mas o código efetivo utiliza `sql.js`.
Esta divergência deve ser corrigida antes da migração para evitar decisões baseadas em uma
stack que não está em produção.

## Tabelas e responsabilidades

| Tabela | Papel atual | Destino inicial |
|---|---|---|
| `users` | Login local; `admin` e `operator` | Identidade central + perfis e permissões |
| `products` | Catálogo de produtos | Catálogo central |
| `batches` | Lote aberto/fechado | `lots` com UUID global, estado e versão |
| `capture_sessions` | Janela de captura serial | Sessão associada a lote, estação e equipamento |
| `readings` | Valor cru e valor parseado | Leituras centralizadas ou migradas por etapa |
| `equipments` | Configuração serial/Modbus | Equipamento lógico + configuração por estação |
| `capture_error_logs` | Erros técnicos de captura | Logs técnicos ligados ao lote/sessão |
| `settings` | Configuração local | Permanece local quando for específica da máquina |
| `schema_migrations` | Controle de migrations | Migrations versionadas do PostgreSQL |

As migrations atuais também registram a evolução de nomenclatura
`recipes → formulas → products`. O contrato futuro deve usar **lote** e **produto**;
um adaptador pode manter `Batch` internamente no PORTUS durante a transição.

## Relações atuais

- Usuário cria produtos e lotes.
- Produto possui vários lotes.
- Lote possui várias sessões de captura.
- Sessão possui várias leituras.
- Leitura aponta para equipamento e lote.
- Erros técnicos podem apontar para lote, sessão e equipamento.

## Escritores atuais

| Operação | Local do escritor |
|---|---|
| Criar lote | `src/main/ipc/batches-handlers.ts` → repository local |
| Fechar lote | `src/main/ipc/batches-handlers.ts` → repository local |
| Criar sessão | `src/main/serial/capture-service.ts` → repository local |
| Inserir leitura | `src/main/serial/capture-service.ts` → repository local |
| Atualizar equipamento | Handler IPC → repository local |
| Usuários/produtos/configurações | Handlers IPC → repositories locais |

Não há, no estado atual, um escritor externo ou um serviço central implementado.

## Riscos identificados

1. O limite de seis lotes é validado no handler, antes da inserção, e não é uma garantia
   transacional para múltiplos clientes.
2. A geração do código `YYYY-NNNN` depende de contagem local.
3. Não existem `global_lot_id`, `version`, `application_id` ou `command_id`.
4. A sessão autenticada vive somente em memória do processo Electron.
5. A auditoria de negócio não registra todas as tentativas e transições.
6. O banco local não representa autoridade compartilhada entre computadores.
7. O banco de leituras e o banco de comandos ainda não estão separados conceitualmente.

## Invariantes a validar na descoberta

Antes de criar o schema central, confirmar com Produção e Laboratório:

- o que significa “seis lotes abertos”: global, por setor ou por linha;
- quais linhas e estações existem;
- quais estados são válidos e quais permitem retrabalho;
- quem pode abrir, fechar, transferir, reabrir e corrigir;
- se o lote pode passar do Setor A para o Laboratório;
- quais leituras precisam estar disponíveis centralmente;
- qual período de histórico deve ser migrado;
- qual comportamento é esperado quando o Lot Service estiver indisponível.

## Primeiro recorte técnico

A primeira implementação deve conter somente o caminho vertical:

1. PostgreSQL local de desenvolvimento e migrations reproduzíveis.
2. Entidade de lote com UUID global e `version`.
3. Estado por linha/trecho.
4. `processed_commands` para idempotência.
5. `lot_audit` e `event_outbox`.
6. Comandos de abrir e fechar lote.
7. Testes concorrentes, limite de seis e retry por `command_id`.
8. Adaptador no PORTUS com feature flag; captura serial permanece intacta.

## Critério de saída da Etapa 0

A Etapa 0 estará concluída quando:

- não houver escritor de lote desconhecido;
- as invariantes acima estiverem documentadas;
- o ADR-001 estiver aprovado;
- o schema alvo estiver suficientemente definido para iniciar migrations;
- o comportamento de rollback e indisponibilidade estiver decidido;
- a implementação puder começar sem alterar ainda o fluxo serial existente.
