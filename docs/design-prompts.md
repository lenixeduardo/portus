# Prompts de Design — PORTUS

Prompts prontos para gerar a interface do PORTUS em ferramentas de design assistidas por IA.

---

## 1. Google Stitch

**Project:** Desktop application UI (Windows, 1280×800) for an industrial laboratory tool called **"PORTUS"** — it captures readings from lab equipment connected via serial (COM) ports and links them to recipes and production batches.

**Visual style:**
- Clean, professional industrial/lab software aesthetic.
- Light theme with a dark sidebar; primary color **deep blue (#1E3A8A)**, accent **emerald green (#10B981)** for "active/connected" states, **amber (#F59E0B)** for warnings/countdown, **red (#EF4444)** for errors.
- Sans-serif typography (Inter or similar), generous spacing, rounded corners (8px), subtle shadows, no gradients.
- Status indicators rendered as round LED-style "lights" (gray = idle, green = received, amber = waiting, red = port error).
- Desktop-first, no mobile responsiveness needed.

**Generate the following screens:**

**1. Login screen** — Centered card on a soft gray background. Logo/title "PORTUS" at top. Username + password fields, "Entrar" primary button. Small footer with version number.

**2. Main Dashboard — Open Batches** — Left dark sidebar with nav: Dashboard, Receitas, Lotes, Histórico, Configurações, Sair. Logged-in user at the bottom. Top bar with title "Lotes Abertos" and two primary buttons: **"+ Nova Receita"**, **"+ Novo Lote"**. Grid of up to **6 batch cards** (3×2). Each card: batch code in bold, recipe name, opened date/time, number of readings, operator. Primary button **"▶ Iniciar Leitura"** + secondary outline **"Finalizar Lote"**. Status chip "ABERTO" in green.

**3. Active Capture Modal (the core screen)** — Large modal, dimmed background. Title "Captura em Andamento — Lote #2025-0142". Big circular **countdown timer** (e.g., "00:23" of 30s) with thin amber depleting ring. Below, **2×3 grid of 6 equipment slots**, each: LED-style colored circle (gray/green/red), equipment name (Espectrofotômetro, Balança, Viscosímetro, pH-metro, Refratômetro, Reserva), COM port label ("COM3 · 9600 baud"), captured value in monospaced font + timestamp when received. Bottom: outline **"Cancelar"** + instruction text "Aperte PRINT em cada equipamento dentro do tempo restante."

**4. Recipes management** — Table with columns: Nome, Descrição, Criada em, Criada por, Ações. "+ Nova Receita" opens a form modal.

**5. New Batch form (modal)** — Recipe dropdown, auto-generated batch code (editable), "Criar Lote" button.

**6. Settings (tabbed)** — **Captura**: numeric input "Tempo de captura (segundos)" (default 30). **Equipamentos**: 6 rows, each with slot index, name, COM port dropdown, baud, data/stop bits, parity, parsing regex, enabled toggle. **Usuários**: simple list with add/remove.

**7. Batch History** — Batch header (code, recipe, status, dates). Timeline grouped by **capture session**, expandable, listing the 6 equipments and their captured values + timestamp. Export to CSV button.

**Language:** All UI labels in **Brazilian Portuguese**.

**Deliverables:** High-fidelity mockups for all 7 screens, plus a small component library showing the LED status indicator states (idle / connected / receiving / error) and the countdown ring at 100% / 50% / 10%.

---

## 2. Claude Design (Artifacts)

> Cole este prompt no Claude (claude.ai). Ele gera um artifact React funcional e navegável que você pode abrir no painel lateral e clicar entre as telas.

Crie um **artifact React interativo** (single-file, sem dependências externas além de React) que sirva como **mockup navegável** da interface do "PORTUS" — um aplicativo desktop para Windows usado em laboratório industrial para capturar leituras de equipamentos via porta serial e vinculá-las a receitas e lotes.

### Requisitos técnicos do artifact
- Um único componente React em TypeScript (ou JSX) exportado como default.
- Estilização **inteiramente com Tailwind CSS** (utility classes inline). Não usar bibliotecas de componentes (sem shadcn, sem MUI, sem Radix).
- Para ícones, use **lucide-react** (já disponível no ambiente do Claude).
- Estado local com `useState` para simular: usuário logado, tela atual, lotes abertos, captura em andamento, contagem regressiva.
- Sem chamadas reais de rede ou serial — tudo mockado em memória.
- O artifact deve **abrir já logado no Dashboard**, mas com um botão "Sair" no canto inferior da sidebar que volta para a tela de Login.
- Janela alvo: 1280×800 (desktop). Não precisa ser responsivo para mobile.

### Identidade visual
- Tema claro com sidebar escura.
- Primário **azul `#1E3A8A`** (use classes arbitrárias do Tailwind: `bg-[#1E3A8A]`).
- Accent verde **`#10B981`** para estados "ativo/conectado".
- Âmbar **`#F59E0B`** para countdown e avisos.
- Vermelho **`#EF4444`** para erros de porta.
- Tipografia sans-serif (default do Tailwind), espaçamento generoso, cantos arredondados (`rounded-lg`), sombras sutis (`shadow-sm`/`shadow-md`), **sem gradientes**.
- Indicadores de status como **círculos estilo LED** com glow sutil (use `shadow-[0_0_12px_...]` na cor do estado).
- Todos os textos da UI em **português brasileiro**. Identificadores de código em inglês.

### Telas a implementar (navegáveis pela sidebar)

1. **Login** — card centralizado em fundo cinza claro. Título "PORTUS" em azul. Campos usuário/senha, botão "Entrar". Rodapé pequeno com versão `v0.1.0`. Submeter qualquer valor entra no Dashboard.

2. **Dashboard — Lotes Abertos** (rota inicial após login)
   - Sidebar escura à esquerda (220px) com itens: Dashboard, Receitas, Histórico, Configurações. No rodapé da sidebar: nome do usuário e botão "Sair".
   - Topbar branca com título "Lotes Abertos" + dois botões primários à direita: **"+ Nova Receita"** e **"+ Novo Lote"**.
   - Grid 3×2 com **6 cards de lote mockados**. Cada card: código do lote (`Lote #2025-0142`), nome da receita, data/hora de abertura, contador de leituras, operador. Chip verde "ABERTO". Botão primário **"▶ Iniciar Leitura"** + botão secundário outline **"Finalizar Lote"**.
   - Clicar em "Iniciar Leitura" abre o **Modal de Captura Ativa** (item 3).

3. **Modal de Captura Ativa** (sobrepõe o Dashboard com backdrop escuro)
   - Título "Captura em Andamento — Lote #..." (usar o lote clicado).
   - **Timer circular grande** no centro mostrando contagem regressiva de **30s** (anel âmbar depletando, número grande no meio em formato `00:23`). Use SVG com `strokeDasharray` animado por `useEffect`.
   - Abaixo: **grid 2×3 de 6 slots de equipamento**. Slots fixos: Espectrofotômetro, Balança, Viscosímetro, pH-metro, Refratômetro, Reserva.
   - Cada slot mostra: LED redondo (cinza idle / verde recebido / vermelho erro), nome do equipamento, label da porta (`COM3 · 9600 baud`), e quando recebe valor: valor em fonte monoespaçada grande + timestamp.
   - Para o mockup, simule via `setTimeout` que a cada 3–6 segundos um slot aleatório recebe um valor (verde + valor numérico fictício). Um dos slots ("Reserva") deve aparecer em vermelho como exemplo de porta indisponível.
   - Botão **"Cancelar"** outline no rodapé do modal + texto pequeno "Aperte PRINT em cada equipamento dentro do tempo restante."
   - Quando o timer chegar a 00:00, fechar o modal automaticamente e voltar pro Dashboard.

4. **Receitas** — tabela com colunas Nome, Descrição, Criada em, Criada por, Ações (ícones editar/excluir). Botão **"+ Nova Receita"** no topo. 4–5 linhas mockadas.

5. **Histórico** — header com seletor de lote + dados (código, receita, status, datas). Abaixo, timeline agrupada por **capture session** (ex.: "Sessão #1 — 14:32:11"), expansível, listando os 6 equipamentos e seus valores capturados com timestamp. Botão "Exportar CSV" no topo.

6. **Configurações** — abas no topo: **Captura** (input numérico "Tempo de captura (segundos)" com default 30, botão Salvar), **Equipamentos** (tabela com 6 linhas: slot, nome editável, dropdown de porta COM, baud, data/stop bits, parity, regex de parsing, toggle habilitado), **Usuários** (lista com botão adicionar).

### Detalhes finais
- Inclua um **mini "design system"** no topo do arquivo: constantes para as cores e um componente `<Led status="idle|active|receiving|error" />` reutilizável.
- Comente no código apenas o que não é óbvio.
- Use `lucide-react` para ícones de navegação (LayoutDashboard, FlaskConical, History, Settings, LogOut, Play, CheckCircle2, XCircle, Plus, Download, Pencil, Trash2).
- Garanta que o artifact é **clicável e navegável de ponta a ponta** — quem abrir consegue passar por todas as telas e ver o modal de captura funcionando.

---

## 3. Como usar

- **Stitch**: cole o prompt da seção 1 em https://stitch.withgoogle.com — vai gerar mockups estáticos de alta fidelidade nas 7 telas.
- **Claude Design (Artifacts)**: cole o prompt da seção 2 em uma conversa nova no claude.ai. O Claude criará um artifact React interativo no painel lateral, navegável e com o modal de captura animado. Útil para validar fluxo antes de implementar nas fases 2–4.
