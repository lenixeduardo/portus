# PostgreSQL central do PORTUS

Esta pasta contém a fundação do banco central definida no
`PORTUS_SPEC_TECNICO(1).md`.

## Ordem de aplicação

## Instalação no Windows (máquina nova)

O instalador do aplicativo não instala o PostgreSQL. Após instalar o PostgreSQL
18 e manter o serviço em execução, na raiz do projeto execute:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\database\install-portus-database.ps1
```

Ou dê duplo clique em `database\install-portus-database.bat`. O script pede a
senha do `postgres` e cria/atualiza de forma idempotente o banco `portus` e o
usuário operacional `portus_admin`. Ao fim, ele executa as migrations, o seed
e os testes SQL 001/002. A URL de conexão, que contém a credencial, é salva no
ambiente do usuário atual e em `%LOCALAPPDATA%\PORTUS\database-config.json`
para que o executável instalado consiga conectar ao PostgreSQL sem abrir um
terminal. Se o banco já existe e o PORTUS mostra **Não configurado**, execute
`database\check-portus-database.bat`; a validação bem-sucedida também repara
esse arquivo. Para instalação sem
testes, use `-SkipTests`; para não persistir essa configuração, use
`-SkipAppConfiguration`.

### Gerar o ZIP autocontido

Para entregar somente o instalador do banco, sem o restante do código do
PORTUS, execute:

```bash
npm run package:database-installer
```

O arquivo gerado em `release/portus-database-installer.zip` inclui o instalador
principal, diagnóstico, atualização de migrations, schema real, seed e testes.
No Windows, o ponto de entrada é `database\install-portus-database.bat`.

Para uma instalação com PostgreSQL em outro caminho, por exemplo versão 17:

```powershell
.\database\install-portus-database.ps1 -PostgresBin "C:\Program Files\PostgreSQL\17\bin"
```

## Atualizar um servidor existente: erro `coluna b.completed não existe`

A versão com lote único e conclusão supervisionada depende da migration
`012_unified_batch_traceability.sql`. Atualizar apenas o executável da estação
**não atualiza o PostgreSQL do servidor**. Se a lista de lotes falhar com
`b.completed`, faça a atualização **somente no computador servidor**, usando
o pacote mais recente (com a migration 012 corrigida).

Abra PowerShell no diretório do projeto ou na pasta `database` extraída do
pacote de instalação e execute, a partir da raiz do projeto:

```powershell
.\database\install-portus-database.ps1 -MigrationsOnly
```

O script solicita a senha do **administrador PostgreSQL** e aplica somente
migrations ainda não registradas, sem recriar o banco ou limpar lotes, sessões,
leituras e histórico. Se o PostgreSQL estiver instalado em outro local,
informe `-PostgresBin "C:\Program Files\PostgreSQL\17\bin"` (ajuste a versão).

Confira o resultado no banco `portus`:

```sql
SELECT name, applied_at
  FROM portus_schema_migrations
 WHERE name = '012_unified_batch_traceability.sql';

SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'batches'
   AND column_name IN ('completed', 'completed_at', 'completed_by');
```

Depois de aplicar com sucesso, reinicie o PORTUS nas estações. Não conceda
credenciais administrativas PostgreSQL aos operadores/clientes.

## Ordem de aplicação manual

Execute as migrations em ordem:

```bash
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/001_schema.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/002_domain_functions.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/003_security_permissions.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/004_laboratory_view.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/005_runtime_function_security.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/006_product_catalog_sync.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/007_admin_force_close.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/008_master_reopen_batch.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/009_default_equipment_catalog.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/010_admin_reopen_batch.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/011_operational_closure_rules.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/012_unified_batch_traceability.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed/reference.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/001_domain_functions.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/002_security_permissions.sql
npm run test:postgres:concurrency
```

Cada migration é transacional e falha ao primeiro erro.

## Princípios

- O banco central compartilha o estado dos lotes entre setores.
- O estado global é `open` ou `closed`.
- `stage` representa a etapa/setor atual.
- Produção e Laboratório trabalham no mesmo lote enquanto ele estiver aberto.
- O checkbox `Lote concluído` sinaliza o fim operacional do ciclo, sem fechar administrativamente o lote.
- Somente Supervisor ou Master finalizam e reabrem lotes.
- Cada sessão central registra o usuário responsável e a estação física onde a leitura foi executada.
- A captura USB/serial continua no PORTUS.
- Não existe limite global de seis lotes nesta especificação.
- Kafka, RabbitMQ, CQRS, CDC e Event Sourcing não fazem parte do Passo 1.

## Funções de domínio

As aplicações devem chamar as funções abaixo, em vez de escrever diretamente
nas tabelas críticas:

- `open_batch`
- `register_reading`
- `move_batch_to_stage`
- `set_batch_completed`
- `supervisor_finalize_batch`
- `master_reopen_batch`
- `ensure_station`

As funções `confirm_production_close` e `confirm_laboratory_close` permanecem apenas para compatibilidade com versões anteriores e não fazem parte do fluxo operacional novo.

A migration `004_laboratory_view.sql` registra a aplicação
`PORTUS_LABORATORY`, concede as capacidades da aplicação no setor Laboratório e
passa a identificar o usuário responsável em cada sessão de captura. A
permissão de cada usuário continua obrigatória em
`user_sector_permissions`.

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
nem execução das funções críticas. O teste
`003_concurrent_closure.mjs` cria conexões independentes de Produção e
Laboratório, força a disputa pelo lock do mesmo lote e valida atomicidade,
versão, histórico e idempotência em PostgreSQL real.
