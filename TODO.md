# PORTUS — TODO

> Lista persistente de tarefas. Atualizar marcando `[x]` ao concluir cada item.
> Ver `CLAUDE.md` para o contexto completo do produto.

## Fase 0 — Setup inicial ✅
- [x] `package.json` com Electron + React + Vite + TS + serialport + sql.js
- [x] `tsconfig` separados (main / renderer / base)
- [x] `vite.config.ts` apontando p/ `src/renderer`
- [x] Esqueleto Electron (`main/index.ts`, `preload/index.ts`)
- [x] Esqueleto React (`renderer/{index.html,main.tsx,App.tsx}`)
- [x] Tipos do domínio em `src/shared/types.ts`
- [x] `.gitignore` e `README.md`
- [x] Commit inicial e push

## Fase 1 — Banco SQLite + Login ✅
- [x] Criar `src/main/db/connection.ts` (sql.js, path em `app.getPath('userData')`)
- [x] Sistema de migrations em `src/main/db/migrations.ts` (inline TS p/ sobreviver ao bundle)
- [x] Schema: `users`, `formulas`, `batches`, `equipments`, `capture_sessions`, `readings`, `settings`
- [x] Seed: usuário inicial + 6 equipamentos placeholder + `capture_timeout_seconds=30`
- [x] IPC handlers: `auth:login`, `auth:logout`, `auth:current-user`
- [x] Hash de senha com `bcryptjs` (puro JS, sem build nativo)
- [x] Tela de Login (React) — card centralizado, validação, erro
- [x] Estado de sessão em memória no main + expor `currentUser` ao renderer
- [x] Layout base com sidebar (após login) e roteamento simples
- [x] Commit + push

## Fase 2 — CRUD Fórmulas + Lotes + Dashboard ✅
- [x] IPC `formulas:list|create|update|delete` (`src/main/ipc/formulas-handlers.ts`)
- [x] Repository fórmulas (`src/main/db/formulas-repo.ts`)
- [x] Tela "Fórmulas" (tabela + modal de criação/edição) + exclusão com confirmação
- [x] IPC `batches:list-open|create|close` (`src/main/ipc/batches-handlers.ts`)
- [x] Repository lotes com join de fórmula/operador/contagem de leituras
- [x] Geração automática de código do lote (`YYYY-NNNN`)
- [x] Dashboard com grid 3×2 dos lotes abertos
- [x] Modal "Novo Lote" (seleciona fórmula, código opcional)
- [x] Botão "Finalizar Lote" com confirmação
- [x] Limite de 6 lotes abertos (bloqueio com mensagem clara)
- [x] Botão "Iniciar Leitura" placeholder (Fase 4)
- [x] Commit + push

## Fase 3 — Configurações ✅
- [x] Tela Configurações com abas (Captura / Equipamentos / Usuários)
- [x] Aba Captura: input numérico para `capture_timeout_seconds` (validação 5–600s)
- [x] Aba Equipamentos: lista os 6 slots, modal de edição com dropdown de portas detectadas (`SerialPort.list()`), baud, data/stop/parity, regex validada, toggle habilitado
- [x] Aba Usuários: criar, alterar senha, excluir (protege admin logado / último usuário / usuários com fórmulas/lotes vinculados)
- [x] IPC `settings:get-all|set`, `equipments:list|update`, `users:list|create|change-password|delete`, `serial:list-ports`
- [x] Repositories: `settings-repo`, `equipments-repo`, `users-repo`
- [x] Equipment ganhou campo `parseRegex` em `shared/types.ts`
- [x] Commit + push

## Fase 4 — Núcleo de captura serial 🎯 ✅
- [x] Service `src/main/serial/capture-service.ts`
- [x] Abrir as 6 portas em paralelo ao iniciar sessão
- [x] Parser configurável por equipamento (regex em `equipment.parse_regex`)
- [x] Gravar cada leitura em `readings` com `capture_session_id`
- [x] Timer com `timeout_seconds`; ao expirar, fechar todas as portas
- [x] IPC events: `capture:slot-update` (cinza/verde/vermelho), `capture:tick`, `capture:ended`
- [x] Tolerância: erro em uma porta não derruba as outras
- [x] Modal de Captura Ativa (countdown + grid 2×3 de LEDs)
- [x] Botão Cancelar
- [x] Commit + push

## Fase 5 — Histórico ✅
- [x] Tela "Histórico do Lote" — timeline agrupada por `capture_session`
- [x] Exportação CSV (todas as leituras do lote)
- [x] Filtro por data/equipamento
- [x] Commit + push

## Fase 6 — Simulador serial ✅
- [x] Script `tools/serial-sim.ts` que abre uma porta virtual e envia strings
- [x] Documentar no README como usar `com0com` (Windows) e `socat` (Linux)
- [x] Presets de payload por tipo de equipamento (balança, pH, etc.)
- [x] Commit + push

## Fase 7 — Empacotamento ✅
- [x] Ícone do app (`build/icon.png` e `build/icon.ico`)
- [x] `electron-builder` config final (NSIS)
- [x] Smoke test do `.exe` gerado
- [x] Documentar processo de release no README
- [x] Commit + push

## Etapa 0 — Baseline e decisões para PostgreSQL 🎯 ✅

- [x] Criar branch `feat/portus-stage-0-database-baseline`
- [x] Incorporar `PORTUS_SPEC_TECNICO(1).md`
- [x] Registrar ADR-001: PostgreSQL compartilhado + funções de domínio
- [x] Registrar baseline real do banco e inventário de escritores
- [x] Registrar regra de fechamento Produção + Laboratório
- [x] Remover limite global de seis lotes do modelo central
- [x] Confirmar preservação de `batches`, `capture_sessions` e `readings`

## Passo 1 — Fundação PostgreSQL central 🎯

- [x] Criar migrations PostgreSQL reproduzíveis
- [x] Criar tabelas de setores, aplicações e permissões
- [x] Evoluir `batches` com `stage`, `version` e confirmações por setor
- [x] Criar `batch_history`
- [x] Criar funções `open_batch`, `register_reading` e `move_batch_to_stage`
- [x] Criar funções de confirmação de fechamento da Produção e do Laboratório
- [x] Revogar privilégios de `PUBLIC` nas tabelas, sequências e funções centrais
- [x] Criar teste transacional de idempotência e fluxo de fechamento
- [x] Automatizar teste concorrente com conexões de Produção e Laboratório
- [ ] Executar teste concorrente em duas sessões PostgreSQL
- [x] Validar migrations e teste de domínio em PostgreSQL local
- [x] Criar adaptador PostgreSQL opcional e IPC central para lotes
- [x] Migrar o Dashboard de lotes para a API central quando disponível
- [x] Migrar histórico e consulta de código de barras para a API central
- [x] Migrar sessões e leituras da captura serial para persistência central
- [x] Implementar preflight de mapeamento e bloqueio offline seguro
- [x] Exibir status real da conexão PostgreSQL na interface
- [x] Sincronizar `package-lock.json` com o cliente `pg`
- [x] Documentar integração, instalação, validação e limitações atuais
- [x] Criar instalador idempotente do PostgreSQL para Windows
- [x] Restringir a credencial de runtime a privilégios explícitos e funções de domínio
- [x] Tornar PostgreSQL autoritativo e exigir opt-in explícito para modo local
- [x] Aguardar gravações centrais antes de encerrar a sessão de captura
- [x] Configurar automaticamente a conexão do app pelo instalador do banco
- [x] Validar estaticamente assets, migrations e empacotamento antes da release
- [ ] Gerar o instalador Windows e executar smoke test em máquina limpa
- [ ] Executar homologação com PostgreSQL e equipamentos reais

## Backlog / Ideias
- [ ] Auto-update via `electron-updater`
- [x] Backup automático do SQLite
- [ ] Relatório PDF do lote
- [x] Tema escuro industrial
- [x] Tema claro opcional
- [x] Integração com leitor de código de barras para código de lote


## Portus Visão Laboratório
- [x] Documentar escopo, atores, fluxos, permissões, dados, funções e critérios de aceite
- [x] Criar visão selecionada pelo login para Captura e Fechamento
- [x] Exibir confirmações da Produção e do Laboratório nos lotes
- [x] Registrar o responsável pela sessão de captura central
- [x] Bloquear fallback local para usuários do Laboratório
- [ ] Validar leituras obrigatórias e acúmulo dos perfis Captura/Fechamento com o Laboratório
- [ ] Validar equipamentos e permissões do Laboratório
- [x] Implementar cliente do Laboratório para captura e fechamento
