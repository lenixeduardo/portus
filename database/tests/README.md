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
