# Serial Reader

Aplicativo desktop (Electron + React + TypeScript) para captura de leituras de equipamentos laboratoriais via porta serial, vinculadas a receitas e lotes.

## Stack

- **Electron 32** — shell desktop
- **React 18 + Vite** — UI
- **TypeScript** — tipagem
- **better-sqlite3** — banco local
- **serialport** — leitura das portas COM
- **electron-builder** — empacotamento

## Estrutura

```
src/
  main/        Processo principal do Electron (Node, serial, DB)
  preload/     Ponte segura main <-> renderer
  renderer/    UI React
  shared/      Tipos compartilhados
```

## Scripts

```bash
npm install
npm run rebuild    # recompila módulos nativos para Electron
npm run dev        # roda Vite + tsc watch do main
npm start          # abre Electron (em outro terminal, após dev)
npm run build      # build de produção
npm run package    # gera instalador
```

## Fases

- [x] Fase 0 — Setup inicial
- [ ] Fase 1 — Banco + login
- [ ] Fase 2 — CRUD receitas/lotes + dashboard
- [ ] Fase 3 — Configuração de portas/equipamentos
- [ ] Fase 4 — Núcleo de captura serial
- [ ] Fase 5 — Histórico
- [ ] Fase 6 — Simulador serial
- [ ] Fase 7 — Empacotamento Windows
