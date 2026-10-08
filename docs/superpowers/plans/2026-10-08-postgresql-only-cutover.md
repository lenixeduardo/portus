# PORTUS — corte definitivo para PostgreSQL

Data: 2026-10-08
Status: migração incremental; desligamento do SQLite ainda bloqueado.

## Regra definitiva

O PostgreSQL central é a **única fonte de verdade**. Servidor, Produção e
Laboratório utilizam os mesmos produtos, usuários, lotes e histórico. Os
equipamentos e configurações físicas são escopados por estação, mas também
persistem no PostgreSQL. Falhas de rede geram erro explícito; não há fallback
para SQLite nem sucesso falso com gravação local.

## Etapas de implementação

- [x] **Catálogo central**: CRUD de produtos no PostgreSQL, IDs centrais usados
      na abertura de lotes, sincronização de produtos legados por estação.
- [x] **Visibilidade inicial de usuários**: listagem unificada de PostgreSQL;
      criação convencional e por etiqueta sincronizada; verificação de conflitos
      de login, perfil, setor e barcode; preservação do hash importado.
- [ ] **Autenticação central**: login por senha e barcode contra PostgreSQL,
      autorização única de perfis, gestão remota de usuários e política de
      desativação auditável. Remover dependência de `users-repo.ts` no login.
- [ ] **Migração integral dos dados**: importar todos os bancos SQLite de todas
      as estações (lotes locais, sessões, leituras, equipamentos, ajustes,
      eventos de auditoria), com mapeamento `(station, local_id)` para
      ID central e ledger de importação transacional para evitar duplicações.
- [ ] **Configurações centralizadas por estação**: persistir parâmetros de
      porta serial, Modbus, parsing, identidade física e caminhos de exportação
      em tabelas centrais com chave de estação.
- [ ] **Captura e histórico exclusivamente centrais**: remover branches
      locais de `batches-handlers`, `capture-service` e `history-handlers`.
      Preservar concorrência, autoria, timestamps e reabertura.
- [ ] **Auditoria, exportação e backup**: retirar `audit-repo` e exportações de
      lotes SQLite; usar PostgreSQL e rotinas de backup do servidor.
- [ ] **Retirar SQLite do runtime**: remover inicialização `openDb()`,
      `runMigrations()` do SQLite, `seedInitialData()` local, `sql.js`,
      `src/main/db/query.ts` e rotinas dependentes. Manter importador
      legado externo por um período de transição.
- [ ] **Release gate**: nenhuma versão "PostgreSQL-only" é publicada enquanto
      um import de `query.ts`, `getDb()` ou `sql.js` existir no runtime.

## Estratégia de migração segura

1. Inventariar todas as estações e criar backups intactos dos arquivos locais
   antes de migrar. Fazer também backup consistente do PostgreSQL.
2. Aplicar migrations centralizadas no servidor e verificar colunas e funções.
3. Executar importação de cada estação; registrar checkpoints e hashes;
   não alterar registros históricos existentes.
4. Conciliar contagens e chaves de usuários, produtos, lotes, sessões e leituras
   antes de retirar qualquer leitura local.
5. Testar concorrência (Produção e Laboratório) e desconexão com bloqueio seguro.
6. Criar release PostgreSQL-only; só então remover SQLite do runtime, mantendo backups.

## Critérios de aceite obrigatórios

- Usuário criado em qualquer estação aparece no servidor e faz login com as
  mesmas credenciais, no setor autorizado, em outra estação.
- Produto criado em qualquer estação aparece nas três listagens sem reiniciar;
  alterações persistem com um único ID global.
- As três máquinas visualizam os mesmos lotes e históricos.
- Leituras preservam operador, equipamento, setor, estação, data e hora.
- Conflitos e falhas de conexão nunca geram sucesso local silencioso.
- Migração reexecutável não apaga nem duplica dados históricos.
- Testes de PostgreSQL real, IPC, interface e instalador aprovados em CI.
- Nenhuma dependência SQLite carregada após o corte.

## Limitação atual

Até a conclusão das etapas restantes, **não** afirmar que o SQLite foi extinto.
O catálogo de produtos e a visibilidade de usuários compõem somente a fase 1.
