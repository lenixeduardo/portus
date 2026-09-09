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
  -f database/seed/reference.sql \
  -f database/tests/001_domain_functions.sql
\`\`\`

O teste usa \`ROLLBACK\`, portanto não deixa o lote de fixture persistido.

A validação de concorrência deve ser feita em duas sessões PostgreSQL simultâneas,
chamando \`confirm_production_close\` e
\`confirm_laboratory_close\` para o mesmo lote. O resultado esperado é:

1. cada confirmação aguarda o lock da linha do lote;
2. nenhuma sessão observa um fechamento parcial incorreto;
3. a versão final permanece consistente;
4. o fechamento global ocorre uma única vez.
