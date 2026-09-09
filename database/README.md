# PostgreSQL central do PORTUS

Esta pasta contém a fundação do banco central definida no
`PORTUS_SPEC_TECNICO(1).md`.

## Ordem de aplicação

Execute as migrations em ordem:

```bash
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/001_schema.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/002_domain_functions.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/003_security_permissions.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed/reference.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/001_domain_functions.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/002_security_permissions.sql
```

Cada migration é transacional e falha ao primeiro erro.

## Princípios

- O banco central compartilha o estado dos lotes entre setores.
- O estado global é `open` ou `closed`.
- `stage` representa a etapa/setor atual.
- O lote só fecha quando Produção e Laboratório confirmam.
- A captura USB/serial continua no PORTUS.
- Não existe limite global de seis lotes nesta especificação.
- Kafka, RabbitMQ, CQRS, CDC e Event Sourcing não fazem parte do Passo 1.

## Funções de domínio

As aplicações devem chamar as funções abaixo, em vez de escrever diretamente
nas tabelas críticas:

- `open_batch`
- `register_reading`
- `move_batch_to_stage`
- `confirm_production_close`
- `confirm_laboratory_close`

## Permissões

O schema separa permissões de usuário e aplicação por setor. A instalação deve
criar os usuários de banco da infraestrutura e conceder apenas:

- `SELECT` nas tabelas necessárias para consultas;
- `EXECUTE` nas funções de domínio;
- nenhum `INSERT`, `UPDATE` ou `DELETE` direto para clientes operacionais.

A migration `003_security_permissions.sql` remove de `PUBLIC` o acesso às
tabelas, sequências e funções do schema. A role usada pelo aplicativo deve ser
criada na implantação e receber somente os `SELECT`, escritas técnicas e
`EXECUTE` estritamente necessários. O proprietário das migrations não deve ser
usado como credencial nas estações em produção.

## Validação

O teste transacional em `database/tests/001_domain_functions.sql` verifica o
fluxo de abertura, mudança de etapa, dupla confirmação e idempotência. O teste
`002_security_permissions.sql` confirma que `PUBLIC` não possui escrita direta
nem execução das funções críticas. A concorrência entre duas sessões permanece
como teste de homologação em PostgreSQL real.
