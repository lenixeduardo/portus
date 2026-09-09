# ADR-001 — Autoridade central no PostgreSQL e funções de domínio

- **Status:** Accepted for implementation
- **Date:** 2026-09-09
- **Scope:** Etapa 0 / Passo 1 da evolução do PORTUS
- **Owners:** PORTUS / domínio de lotes

## Contexto

A versão atual do PORTUS é um aplicativo Electron local. O estado dos lotes é persistido em
`sql.js`, e as operações de abertura e fechamento são executadas diretamente pelos
handlers IPC.

A especificação técnica acordada define um novo PostgreSQL central, compartilhado entre
PORTUS e futuros setores/software. A captura USB/serial continua local ao computador
conectado ao equipamento.

## Decisão

A primeira implementação usará um **PostgreSQL central compartilhado**, com as regras
críticas encapsuladas em funções/stored procedures, transações e permissões por setor e
aplicação.

PORTUS e futuros clientes:

- podem utilizar o mesmo banco central;
- não recebem privilégios irrestritos de `INSERT`, `UPDATE` e `DELETE` nas tabelas críticas;
- executam abertura, movimentação, leitura e confirmações por funções de domínio;
- preservam a camada local de captura serial e parsing.

Um `Lot Service`/API central poderá ser criado em uma evolução posterior. Ele não é
obrigatório no primeiro passo e não deve alterar o escopo acordado de 60 horas.

## Regras obrigatórias

1. O modelo existente `batches` será evoluído; não haverá reconstrução desnecessária do domínio.
2. O estado global do lote permanece `open` ou `closed`.
3. A etapa/setor é representada separadamente, inicialmente por `stage`.
4. O fechamento definitivo exige confirmação da Produção e do Laboratório.
5. Uma confirmação isolada nunca fecha o lote globalmente.
6. Abertura, movimentação, confirmações e fechamento executam transações PostgreSQL.
7. Alterações concorrentes utilizam bloqueio transacional e incrementam `version`.
8. Repetição de confirmação não pode produzir efeito duplicado.
9. Toda transição relevante registra usuário, aplicação, setor, origem e horário.
10. Não existe limite global de seis lotes nesta especificação.
11. Kafka, RabbitMQ, CQRS, Event Sourcing, CDC e banco distribuído ficam fora da primeira versão.
12. A comunicação USB/serial não passa pelo banco central.

## Funções de domínio iniciais

- `open_batch(...)`
- `register_reading(...)`
- `move_batch_to_stage(...)`
- `confirm_production_close(...)`
- `confirm_laboratory_close(...)`

## Consequências

### Positivas

- Migração pequena e compatível com o PORTUS atual.
- Regras de fechamento protegidas no banco.
- Controle explícito de acesso por setor.
- Leituras e sessões existentes permanecem preservadas.
- Base preparada para futura API sem antecipar sua complexidade.

### Custos

- Necessidade de PostgreSQL, migrations e permissões de banco.
- Configuração de usuários/aplicações e setores.
- Necessidade de testes concorrentes e homologação industrial.
- A camada local e a central coexistirão durante a migração.

## Critério de validação

A decisão será considerada validada quando:

- o lote puder ser aberto pela função autorizada;
- Produção e Laboratório puderem confirmar separadamente;
- uma confirmação isolada mantiver o lote em `open`;
- a segunda confirmação fechar o lote atomicamente;
- uma aplicação sem permissão não conseguir executar a operação;
- duas operações concorrentes não produzirem estado intermediário inválido;
- o histórico registrar todas as transições relevantes.
