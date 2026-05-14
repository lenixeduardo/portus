# Serial Reader — Contexto do Projeto

> Este arquivo é lido automaticamente pelo Claude Code no início de cada sessão.
> Contém a visão completa do produto, decisões técnicas e estado atual.
> **Sempre consultar `TODO.md` para o estado das tarefas.**

## 1. Visão do produto

Aplicativo **desktop (Windows)** para um laboratório industrial. Captura leituras de equipamentos de bancada (espectrofotômetro, balança, viscosímetro, pH-metro etc.) **via porta serial (COM)** e vincula cada leitura a uma **receita** e a um **lote** de produção.

### Fluxo do operador
1. Login no sistema.
2. Tela principal: até **5–6 lotes abertos** simultaneamente, com botões para **Criar Fórmula** e **Criar Lote**.
3. Cada lote tem o botão **"Iniciar Leitura"**. Ao clicar:
   - O sistema **abre/arma as 6 portas seriais** (5 equipamentos + 1 reserva para fallback se uma porta falhar).
   - Janela de captura por **N segundos** (default 30s, **configurável** nas Settings).
4. O operador vai a cada equipamento e aperta **PRINT**; o equipamento envia o valor pela serial.
5. O sistema lê o valor, faz parsing por regex configurável por equipamento, e grava em `readings(batch_id, equipment_id, valor, timestamp, capture_session_id)`.
6. Ao expirar o tempo (ou cancelar), as portas fecham. O operador pode abrir nova sessão de captura no mesmo lote ou em outro.
7. Botão **"Finalizar Lote"** encerra o lote.

### Regras importantes
- **6 portas seriais** (hardware): 5 ativas + 1 reserva.
- **Reentrância:** o mesmo lote pode receber várias sessões de captura — cada clique no "Iniciar Leitura" cria uma nova `capture_session`.
- **Tolerância a falhas:** se uma porta falhar ao abrir, marca o slot como vermelho e segue com as outras (não bloqueia a sessão).
- **Auditoria:** gravar **todas** as leituras recebidas dentro da janela (não só a última), com timestamp.
- **Equipamento de teste em casa:** o desenvolvedor terá um equipamento serial físico para simular leituras durante o desenvolvimento. Também há plano para um simulador via porta virtual (`com0com` no Windows / `socat` no Linux).

## 2. Stack confirmada

| Camada | Escolha |
|---|---|
| Shell desktop | **Electron 32** |
| UI | **React 18 + Vite + TypeScript** |
| Serial | **`serialport`** (npm) no processo principal |
| Banco | **SQLite** via **`better-sqlite3`** (local, single-user por máquina) |
| Auth | Hash bcrypt local na tabela `users` |
| Empacotamento | **electron-builder** (target Windows / NSIS) |

### Decisões fechadas com o cliente
1. Stack: Electron + React + SQLite ✅
2. Multi-usuário: **só local** (auditoria), sem sincronização entre máquinas.
3. Parser: **regex configurável por equipamento** + salvar valor cru também.
4. Plataforma: **Windows** (COM ports).

## 3. Modelo de dados (SQLite)

```
users(id, username, password_hash, created_at)
equipments(id, name, port_path, baud_rate, data_bits,
           stop_bits, parity, enabled, slot_index, parse_regex)
formulas(id, name, description, created_by, created_at)
batches(id, formula_id, code, status['open'|'closed'],
        opened_at, closed_at, created_by)
capture_sessions(id, batch_id, started_at, ended_at,
                 timeout_seconds, status['active'|'completed'|'cancelled'])
readings(id, batch_id, equipment_id, value_raw, value_parsed,
         captured_at, capture_session_id)
settings(key, value)   -- ex.: 'capture_timeout_seconds'='30'
```

Tipos TS espelhados em `src/shared/types.ts`.

> **Nomenclatura:** o termo "Receita" foi substituído por **"Fórmula"** em todo o sistema (tabela, IPC, UI) para alinhamento com o vocabulário industrial correto.

## 4. Estrutura de pastas

```
src/
  main/        Processo principal Electron (Node, serial, DB, IPC)
  preload/     contextBridge entre main e renderer
  renderer/    UI React (Vite)
  shared/      Tipos e contratos IPC compartilhados
```

## 5. Telas planejadas

1. **Login** — usuário/senha, card centralizado.
2. **Dashboard de Lotes** — grid 3×2 com até 6 lotes abertos; botões topo: Nova Fórmula, Novo Lote.
3. **Modal de Captura Ativa** — countdown circular + grid 2×3 de slots de equipamento com LEDs de status (cinza/verde/amarelo/vermelho).
4. **Fórmulas** — CRUD em tabela.
5. **Novo Lote** — modal com seleção de receita.
6. **Configurações** — abas Captura (timeout), Equipamentos (6 slots, COM, baud, regex), Usuários.
7. **Histórico do Lote** — timeline agrupada por `capture_session`, exporta CSV.

UI em **português brasileiro**, tema claro com sidebar escura, primário azul (#1E3A8A), accent verde (#10B981).

## 6. Roadmap (fases)

- ✅ **Fase 0 — Setup inicial** (Electron + React + TS, configs, esqueleto)
- ✅ **Fase 1 — Banco SQLite + login** (migrations, seed admin/admin, IPC auth, tela de login, sidebar)
- ✅ **Fase 2 — CRUD receitas + lotes + dashboard** (repositories, IPC, tela Receitas, Dashboard com cards, geração de código de lote, limite de 6 abertos)
- ✅ **Fase 3 — Configurações** (abas Captura/Equipamentos/Usuários, listagem de portas seriais, CRUD usuários, edição de equipamento com regex de parsing)
- ⬜ **Fase 4 — Núcleo de captura serial** (o coração do produto)
- ⬜ **Fase 5 — Histórico e exportação**
- ⬜ **Fase 6 — Simulador de equipamento serial** (porta virtual)
- ⬜ **Fase 7 — Empacotamento Windows (NSIS)**

## 7. Branch e fluxo Git

- Branch de desenvolvimento: **`claude/login-batch-management-bDj7L`**
- Commits descritivos em português, push após cada fase concluída.

## 8. Convenções

- TypeScript estrito (`strict: true`).
- IPC via `contextBridge` em `src/preload/index.ts` — **nunca** expor Node ao renderer diretamente.
- Sem comentários óbvios; comentar só "porquês" não triviais.
- Strings de UI em português; nomes de código/identificadores em inglês.
- Migrations do SQLite versionadas em `src/main/db/migrations/`.

## 9. Scripts npm

```bash
npm install
npm run rebuild   # recompila better-sqlite3 + serialport p/ Electron
npm run dev       # tsc watch (main) + vite (renderer) em paralelo
npm start         # abre Electron (rodar após `npm run dev`)
npm run build     # build produção
npm run package   # gera instalador via electron-builder
npm run typecheck # checa tipos sem emitir
```
