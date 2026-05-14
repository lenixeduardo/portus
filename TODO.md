# Serial Reader — TODO

> Lista persistente de tarefas. Atualizar marcando `[x]` ao concluir cada item.
> Ver `CLAUDE.md` para o contexto completo do produto.

## Fase 0 — Setup inicial ✅
- [x] `package.json` com Electron + React + Vite + TS + serialport + better-sqlite3
- [x] `tsconfig` separados (main / renderer / base)
- [x] `vite.config.ts` apontando p/ `src/renderer`
- [x] Esqueleto Electron (`main/index.ts`, `preload/index.ts`)
- [x] Esqueleto React (`renderer/{index.html,main.tsx,App.tsx}`)
- [x] Tipos do domínio em `src/shared/types.ts`
- [x] `.gitignore` e `README.md`
- [x] Commit inicial e push

## Fase 1 — Banco SQLite + Login ✅
- [x] Criar `src/main/db/connection.ts` (better-sqlite3, path em `app.getPath('userData')`)
- [x] Sistema de migrations em `src/main/db/migrations.ts` (inline TS p/ sobreviver ao bundle)
- [x] Schema: `users`, `formulas`, `batches`, `equipments`, `capture_sessions`, `readings`, `settings`
- [x] Seed: usuário `admin/admin` + 6 equipamentos placeholder + `capture_timeout_seconds=30`
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

## Fase 4 — Núcleo de captura serial 🎯
- [ ] Service `src/main/serial/capture-session.ts`
- [ ] Abrir as 6 portas em paralelo ao iniciar sessão
- [ ] Parser configurável por equipamento (regex em `equipment.parse_regex`)
- [ ] Gravar cada leitura em `readings` com `capture_session_id`
- [ ] Timer com `timeout_seconds`; ao expirar, fechar todas as portas
- [ ] IPC events: `capture:slot-update` (cinza/verde/vermelho), `capture:tick`, `capture:ended`
- [ ] Tolerância: erro em uma porta não derruba as outras
- [ ] Modal de Captura Ativa (countdown + grid 2×3 de LEDs)
- [ ] Botão Cancelar
- [ ] Commit + push

## Fase 5 — Histórico
- [ ] Tela "Histórico do Lote" — timeline agrupada por `capture_session`
- [ ] Exportação CSV (todas as leituras do lote)
- [ ] Filtro por data/equipamento
- [ ] Commit + push

## Fase 6 — Simulador serial
- [ ] Script `tools/serial-sim.ts` que abre uma porta virtual e envia strings
- [ ] Documentar no README como usar `com0com` (Windows) e `socat` (Linux)
- [ ] Presets de payload por tipo de equipamento (balança, pH, etc.)
- [ ] Commit + push

## Fase 7 — Empacotamento
- [ ] Ícone do app (`build/icon.ico`)
- [ ] `electron-builder` config final (NSIS, autoupdate opcional)
- [ ] Smoke test do `.exe` gerado
- [ ] Documentar processo de release no README
- [ ] Commit + push

## Backlog / Ideias
- [ ] Auto-update via `electron-updater`
- [ ] Backup automático do SQLite
- [ ] Relatório PDF do lote
- [ ] Modo escuro
- [ ] Integração com leitor de código de barras p/ código de lote
