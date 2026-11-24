# Testes do domínio PostgreSQL

O teste principal valida a fundação do Passo 1 em um banco descartável:

- abertura de lote;
- mudança de etapa e incremento de versão;
- confirmação da Produção sem fechamento global;
- confirmação do Laboratório e fechamento definitivo;
- idempotência de uma confirmação repetida;
- registro de histórico.

Execute após as migrations e o seed:

\`\`\`bash
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f database/migrations/001_schema.sql \
  -f database/migrations/002_domain_functions.sql \
  -f database/migrations/003_security_permissions.sql \
  -f database/migrations/004_laboratory_view.sql \
  -f database/seed/reference.sql \
  -f database/tests/001_domain_functions.sql \
  -f database/tests/002_security_permissions.sql
\`\`\`

O teste usa \`ROLLBACK\`, portanto não deixa o lote de fixture persistido.

O teste de permissões valida que o papel `PUBLIC` não pode escrever diretamente
nas tabelas críticas nem executar as funções de domínio. Execute as validações
como proprietário das migrations; os testes consultam os privilégios de
`PUBLIC`, não os privilégios herdados pelo proprietário.

A validação de concorrência abre três conexões PostgreSQL independentes: uma
prepara e verifica a fixture, uma representa a Produção e outra representa o
Laboratório. No PowerShell, execute:

```powershell
$env:PORTUS_DATABASE_URL="postgresql://portus_admin:portus_dev_123@127.0.0.1:5432/portus"
npm run test:postgres:concurrency
```

Se a senha possuir caracteres reservados de URL, codifique-os antes de montar
a conexão. O teste chama `confirm_production_close` e
`confirm_laboratory_close` simultaneamente para o mesmo lote e valida que:

1. cada confirmação aguarda o lock da linha do lote;
2. nenhuma sessão observa um fechamento parcial incorreto;
3. a versão final permanece consistente;
4. o fechamento global ocorre uma única vez.

A fixture usa aplicação, usuário, produto e lote exclusivos e é removida ao
final, inclusive quando uma asserção falha. A saída esperada começa com
`Stage 1 concurrent closure test OK`.

### Regressão da finalização pelo laboratório

`008_laboratory_finalization.sql` valida a conclusão obrigatória, o fechamento pelo
operador do laboratório e a repetição sem duplicar o histórico. Executar somente
em banco de teste migrado; os dados de teste são revertidos.

Para também verificar todas as migrations desde uma base vazia e executar o SQL
real de auditoria do handler, use o runner isolado (não acessa banco externo):

```sh
npm install --prefix /tmp/portus-db-tests --ignore-scripts @electric-sql/pglite
PORTUS_TEST_PGLITE_MODULE=/tmp/portus-db-tests/node_modules/@electric-sql/pglite/dist/index.js node database/tests/008_laboratory_finalization.mjs
```

### Identidade do lote por produto

Após aplicar `026_batch_product_composite_identity.sql` em um banco PostgreSQL de teste,
execute `psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/011_batch_composite_identity.sql`.
O teste valida dois produtos com o mesmo código, rejeita duplicação no mesmo produto e usa `ROLLBACK`.

### Homologação EPA no Windows

Use o script a partir do checkout do PORTUS. Configure as credenciais do
PostgreSQL em `%APPDATA%\postgresql\pgpass.conf` para o host, a porta, o
banco e o usuário escolhidos. Use `-PostgresBin` se a descoberta automática
selecionar uma instalação diferente.

Diagnóstico somente leitura, incluindo preflight, histórico das migrations e
verificação do catálogo de um backup PostgreSQL customizado, se informado.

```powershell
powershell.exe -NoProfile -File .\database\epa_homologation.ps1 -DatabaseHost 127.0.0.1 -Port 5432 -DatabaseName portus_homologacao -AdminUser postgres -ReportPath .\epa-diagnostico.json
```

Na cópia isolada de homologação que já recebeu as migrations 001–026,
informe um caminho novo para o backup e autorize a instalação e os testes.

```powershell
powershell.exe -NoProfile -File .\database\epa_homologation.ps1 -DatabaseHost 127.0.0.1 -Port 5432 -DatabaseName portus_homologacao -AdminUser postgres -ConfirmHomologation -ApplyMigrations -RunTests -BackupPath .\portus-antes-epa.dump -ReportPath .\epa-homologacao.json
```

A opção `-RunTests` também pode ser executada sozinha com
`-ConfirmHomologation` após as seis migrations EPA. A instalação cria um
backup customizado e confere a leitura do catálogo antes de aplicar as
migrations 027–032 pendentes em uma transação com o ledger. O relatório JSON
registra a fase, a versão PostgreSQL, o estado das migrations, a conferência
do backup e o resultado por arquivo de teste. O código de saída é zero
quando o modo solicitado conclui e diferente de zero em caso de falha.
