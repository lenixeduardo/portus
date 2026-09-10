# PORTUS — Design System

> **Versão:** 2.0  
> **Direção:** Industrial / Technical Interface  
> **Plataforma:** Desktop  
> **Tema:** Dark + Light  
> **Fonte principal:** IBM Plex Mono  
> **Ícones:** Lucide  
> **Accent da marca:** Verde-água PORTUS

---

## 1. Objetivo visual

O PORTUS deve parecer uma ferramenta industrial de operação contínua, e não um dashboard SaaS genérico.

A interface deve transmitir:

- precisão;
- estabilidade;
- leitura rápida;
- alta densidade de informação;
- baixo ruído visual;
- hierarquia operacional clara;
- estética técnica/premium;
- consistência entre todas as páginas.

A direção visual baseia-se em uma superfície técnica escura, com linhas estruturais discretas, tipografia monoespaçada e accent verde-água usado apenas para marca, seleção, foco e ações primárias.

---

## 2. Princípios obrigatórios

1. **Desktop-first industrial.**
2. **Nada de visual “dashboard de métricas”** quando o contexto for operacional.
3. **Evitar cards decorativos** quando uma tabela, linha ou painel técnico resolver melhor.
4. **Alta legibilidade à distância** e em operação prolongada.
5. **Verde-água PORTUS é o accent de marca**, não um verde genérico de sucesso.
6. **Status semânticos têm cores próprias** e não devem competir com a marca.
7. **Bordas finas e pouco arredondamento.**
8. **Sem glassmorphism, glow, gradientes decorativos ou 3D.**
9. **Sem ícones decorativos desnecessários.**
10. **A visão de Produção ou Laboratório é definida pelo login**, não por seletor manual visível no topo.

---

## 3. Identidade visual

### 3.1 Accent principal

```css
--portus-aqua-50:  #E8FFFB;
--portus-aqua-100: #C8FFF5;
--portus-aqua-200: #8EFFE9;
--portus-aqua-300: #50F5D5;
--portus-aqua-400: #23E6C3;
--portus-aqua-500: #00D7B5;
--portus-aqua-600: #00B99B;
--portus-aqua-700: #008B76;
--portus-aqua-800: #06695B;
--portus-aqua-900: #07554B;
```

### 3.2 Uso do verde-água

Usar em:

- item ativo da sidebar;
- foco de inputs;
- botão primário;
- controles selecionados;
- links ativos;
- indicadores de conexão quando apropriado;
- bordas de destaque;
- pequenos detalhes de marca.

Não usar em:

- grandes áreas de fundo;
- preenchimento excessivo de cards;
- todos os status do sistema;
- elementos puramente decorativos.

---

## 4. Tipografia

### 4.1 Fonte principal

```css
font-family:
  "IBM Plex Mono",
  "SFMono-Regular",
  "Cascadia Code",
  "Roboto Mono",
  monospace;
```

A fonte deve reforçar o caráter técnico do sistema e manter boa leitura em:

- IDs;
- códigos;
- timestamps;
- tabelas;
- leitura de equipamentos;
- labels operacionais;
- filtros;
- menus.

### 4.2 Escala tipográfica

```css
--text-xs: 11px;
--text-sm: 12px;
--text-md: 13px;
--text-base: 14px;
--text-lg: 16px;
--text-xl: 20px;
--text-page: 30px;
```

### 4.3 Pesos

```css
--font-regular: 400;
--font-medium: 500;
--font-semibold: 600;
```

### 4.4 Aplicação

- Título da página: `28–30px / 600`
- Título de seção: `18–20px / 600`
- Título de lote: `18px / 600`
- Navegação: `13–14px / 500`
- Tabela: `12–13px / 400–500`
- Labels técnicos: `10–11px / 500`
- Metadata: `11–12px / 400`

Evitar textos em caixa alta em excesso.

---

## 5. Dark Mode

```css
--bg-app:       #080B0D;
--bg-sidebar:   #090C0E;
--bg-surface:   #0B1013;
--bg-elevated:  #0E1417;
--bg-hover:     #111A1D;
--bg-active:    #0C211F;

--border-subtle:  #182126;
--border-default: #202B30;
--border-strong:  #303D42;

--text-primary:   #F4F7F7;
--text-secondary: #A6B0B4;
--text-muted:     #68757A;
--text-disabled:  #485257;
```

### Regras

- Evitar `#000000` absoluto em grandes superfícies.
- Evitar `#FFFFFF` puro em todo o texto.
- Superfícies devem ser próximas entre si, com separação principalmente por bordas.
- Não usar sombra pesada.

---

## 6. Light Mode

```css
--bg-app-light:       #F7F9F9;
--bg-sidebar-light:   #F4F7F7;
--bg-surface-light:   #FFFFFF;
--bg-elevated-light:  #FFFFFF;
--bg-hover-light:     #EFF5F4;
--bg-active-light:    #E1F8F3;

--border-subtle-light:  #E4EAEA;
--border-default-light: #D5DEDE;
--border-strong-light:  #BFCBCB;

--text-primary-light:   #101719;
--text-secondary-light: #506064;
--text-muted-light:     #788589;
--text-disabled-light:  #A2ADAF;
```

O light mode deve ser a mesma linguagem visual do dark mode, apenas com inversão de superfícies e contraste.

---

## 7. Grid técnico de fundo

O shell principal pode usar uma grade técnica discreta.

```css
background-image:
  linear-gradient(
    rgba(255,255,255,.025) 1px,
    transparent 1px
  ),
  linear-gradient(
    90deg,
    rgba(255,255,255,.025) 1px,
    transparent 1px
  );

background-size: 72px 72px;
```

### Regras

Usar apenas no:

- background geral da aplicação;
- grandes áreas de shell.

Não usar dentro de:

- tabelas;
- inputs;
- cards;
- modais;
- dropdowns.

Linhas diagonais técnicas podem aparecer no header com opacidade muito baixa.

---

## 8. Radius

```css
--radius-xs: 2px;
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
```

### Uso

- Tabela: `4px`
- Input: `4px`
- Botão: `4px`
- Badge: `4px`
- Item ativo da sidebar: `2–4px`
- Modal: `6px`

Evitar radius acima de `8px` sem justificativa funcional.

---

## 9. Espaçamento

Base de `4px`.

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

### Referências

- Sidebar item: `12px 16px`
- Button: `8px 14px`
- Input: `10px 12px`
- Table cell: `9px 12px`
- Page padding: `24px`
- Section gap: `20–24px`

---

## 10. Ícones

Biblioteca oficial: **Lucide**.

### Stroke

```css
--icon-stroke: 1.5px;
```

### Tamanhos

```css
--icon-xs: 14px;
--icon-sm: 16px;
--icon-md: 18px;
--icon-lg: 20px;
--icon-xl: 24px;
```

### Ícones recomendados

- Lotes: `LayoutGrid`
- Produtos: `Package`
- Equipamentos: `Monitor`
- Usuários: `UserRound`
- Relatórios: `FileSpreadsheet`
- Configurações: `Settings`
- Scanner: `ScanLine`
- Banco: `Database`
- Exportar: `Download`
- Atualizar: `RotateCw`
- Imprimir: `Printer`
- Finalizar: `SquareCheck`
- Light mode: `Sun`
- Dark mode: `Moon`

### Regra de etapa

Não usar ícones nas células de **Etapa**.

As etapas devem ser exibidas apenas como texto:

- Produção
- Laboratório
- Finalizado

---

## 11. Sidebar

```css
--sidebar-width: 220px;
```

### Estrutura

```text
PORTUS

Lotes Ativos
Produtos
Equipamentos
Usuários
Relatórios
Configurações

────────────────

ECOSSISTEMA
Kairos Connect

────────────────

Reportar Erro
Sair
```

### Regras

- Não exibir usuário logado abaixo de Kairos Connect.
- Não exibir cards internos desnecessários.
- O item ativo deve usar accent lateral e fundo sutil.

```css
background: rgba(0, 215, 181, .08);
color: var(--portus-aqua-400);
border-left: 3px solid var(--portus-aqua-500);
```

---

## 12. Topbar

```css
--topbar-height: 72px;
```

### Conteúdo permitido

```text
Banco de dados
● Conectado

|

Scanner / Leitor
● Pronto para leitura

                                  ☀ [switch] ☾
```

### Não exibir

- setor atual;
- data;
- usuário;
- seletor manual Produção/Laboratório.

A visão operacional deve ser determinada pelo login.

---

## 13. Switch de tema

O switch deve ficar no canto superior direito.

### Estados

- `Sun` → light
- `Moon` → dark

### Estilo

```css
width: 42px;
height: 22px;
border-radius: 999px;
background: var(--bg-elevated);
border: 1px solid var(--border-strong);
```

Quando ativo:

```css
background: rgba(0, 215, 181, .12);
border-color: var(--portus-aqua-500);
```

---

## 14. Botões

### Primary

```css
background: var(--portus-aqua-500);
color: #03110F;
border: 1px solid var(--portus-aqua-500);
```

### Secondary

```css
background: transparent;
color: var(--text-primary);
border: 1px solid var(--border-strong);
```

### Ghost

```css
background: transparent;
border: 1px solid transparent;
```

### Alturas

```css
--control-height-sm: 34px;
--control-height: 40px;
```

### Interação

```css
--duration-fast: 120ms;
--duration-normal: 180ms;
--ease-ui: cubic-bezier(.2, 0, 0, 1);
```

---

## 15. Inputs e filtros

```css
background: var(--bg-surface);
border: 1px solid var(--border-default);
border-radius: var(--radius-sm);
color: var(--text-primary);
```

### Focus

```css
border-color: var(--portus-aqua-500);
box-shadow: 0 0 0 1px rgba(0, 215, 181, .15);
```

Sem glow grande.

---

## 16. Tabelas

Tabelas são um componente central do PORTUS.

```css
--table-header-bg: #0C1114;
--table-row-bg: transparent;
--table-row-hover: #0D1719;
--table-border: #20292D;
```

### Cabeçalho

- 12px
- 500
- contraste médio
- sem aparência de card

### Células

- 13px
- 400
- altura de `38–42px`

### Regras

- Não usar zebra stripes.
- Usar linhas finas entre linhas/colunas.
- Ordenação discreta com `ChevronUp/Down`.
- Hover sutil.
- Não usar ícones decorativos em células.

---

## 17. Página Relatórios

A página de relatórios deve parecer uma **planilha técnica nativa**, não um dashboard.

### Estrutura

```text
Relatórios                                   24
Consulte e exporte os registros de lotes, leituras e operações.

[Período] [Produto] [Status] [Busca] [Atualizar] [Exportar relatório]

┌──────────────────────────────────────────────────────────────┐
│ # │ Lote │ Produto │ Etapa │ Abertura │ Leituras │ ...     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Colunas padrão

- #
- Lote
- Produto
- Etapa
- Abertura
- Leituras
- Operador
- Status
- Fechamento
- Observações

### Não usar

- coluna Origem;
- gráficos;
- KPI cards;
- donut charts;
- cards de resumo;
- ícones na coluna Etapa.

### Ação primária

`Exportar relatório`

Ícone: `Download`

---

## 18. Etapas de lote

As etapas visuais são:

```ts
type BatchStage =
  | "production"
  | "laboratory"
  | "finished";
```

Labels:

```ts
const batchStageLabel = {
  production: "Produção",
  laboratory: "Laboratório",
  finished: "Finalizado",
};
```

### Fluxo visual

```text
Produção → Laboratório → Finalizado
```

`Finalizado` é uma etapa visual posterior à conclusão das etapas de Produção e Laboratório.

O status global do lote deve continuar separado da etapa.

---

## 19. Status semânticos

```css
--status-success: #39D98A;
--status-warning: #F1B84B;
--status-danger:  #F06464;
--status-neutral: #879399;
--status-info:    #4DB8FF;
```

### Status de lote

```text
ABERTO
FECHADO
PENDENTE
ERRO
```

### Uso visual

- ABERTO → aqua outline
- FECHADO → verde/aqua discreto
- PENDENTE → amber outline
- ERRO → red outline

Evitar badges completamente preenchidos e saturados.

---

## 20. Lotes Ativos

### Hierarquia

1. Título `Lotes Ativos` + quantidade
2. Banco de dados
3. Scanner / leitor
4. Ação primária `Novo lote por código de barras`
5. Ação secundária `Simular Scan`

### Scanner

Estados:

```text
Pronto para leitura
Lendo...
Código identificado
Falha na leitura
```

O componente deve parecer operacional, não um input comum.

### Card / linha de lote

Priorizar:

- número do lote;
- produto;
- barcode;
- abertura;
- leituras;
- operador;
- etapa;
- fechamento por setor;
- ações.

### Ações

- `Imprimir` → secondary/tertiary
- `Finalizar` → maior hierarquia

---

## 21. Fechamento por setor

A interface deve representar separadamente as confirmações de Produção e Laboratório.

Exemplo:

```text
Produção     ✓
Laboratório  Pendente
```

Após a conclusão das duas etapas, a etapa visual passa a:

```text
Finalizado
```

A UI não deve sugerir que Produção ou Laboratório isoladamente encerram o lote globalmente.

---

## 22. Database Status

Estados:

```text
Conectado
Desconectado
Reconectando
```

### Visual

- ícone `Database`
- label pequena
- status legível
- não parecer botão

---

## 23. Scanner Status

Estados:

```text
Pronto para leitura
Lendo
Código identificado
Falha na leitura
```

Ícone: `ScanLine`

O status deve estar visível no topo e também refletido no componente principal de captura.

---

## 24. Empty States

Evitar ilustrações grandes.

### Exemplo

```text
Nenhum lote ativo
Leia um código de barras para iniciar um novo lote.
```

CTA opcional:

```text
Novo lote por código de barras
```

---

## 25. Feedback operacional

Exemplos:

```text
Código 7823123456789 reconhecido
Leitura registrada
Banco reconectado
Falha ao registrar leitura
```

Feedback deve ser:

- curto;
- contextual;
- não bloqueante quando possível;
- sem modais desnecessários.

---

## 26. Light/Dark parity

Todo componente deve existir nos dois temas com a mesma estrutura.

Nunca criar um layout diferente apenas para light mode.

Apenas mudar:

- superfícies;
- contraste;
- bordas;
- estados de hover;
- densidade visual de grid.

---

## 27. Design Tokens — CSS

```css
:root {
  /* Brand */
  --portus-aqua-50: #E8FFFB;
  --portus-aqua-100: #C8FFF5;
  --portus-aqua-200: #8EFFE9;
  --portus-aqua-300: #50F5D5;
  --portus-aqua-400: #23E6C3;
  --portus-aqua-500: #00D7B5;
  --portus-aqua-600: #00B99B;
  --portus-aqua-700: #008B76;
  --portus-aqua-800: #06695B;
  --portus-aqua-900: #07554B;

  /* Dark surfaces */
  --bg-app: #080B0D;
  --bg-sidebar: #090C0E;
  --bg-surface: #0B1013;
  --bg-elevated: #0E1417;
  --bg-hover: #111A1D;
  --bg-active: #0C211F;

  /* Borders */
  --border-subtle: #182126;
  --border-default: #202B30;
  --border-strong: #303D42;

  /* Text */
  --text-primary: #F4F7F7;
  --text-secondary: #A6B0B4;
  --text-muted: #68757A;
  --text-disabled: #485257;

  /* Semantic */
  --success: #39D98A;
  --warning: #F1B84B;
  --danger: #F06464;
  --info: #4DB8FF;

  /* Typography */
  --font-ui: "IBM Plex Mono", "Cascadia Code", monospace;

  --text-xs: 11px;
  --text-sm: 12px;
  --text-md: 13px;
  --text-base: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-page: 30px;

  /* Radius */
  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Sizing */
  --sidebar-width: 220px;
  --topbar-height: 72px;
  --control-height-sm: 34px;
  --control-height: 40px;

  /* Icons */
  --icon-xs: 14px;
  --icon-sm: 16px;
  --icon-md: 18px;
  --icon-lg: 20px;
  --icon-xl: 24px;

  /* Motion */
  --duration-fast: 120ms;
  --duration-normal: 180ms;
  --ease-ui: cubic-bezier(.2, 0, 0, 1);
}

[data-theme="light"] {
  --bg-app: #F7F9F9;
  --bg-sidebar: #F4F7F7;
  --bg-surface: #FFFFFF;
  --bg-elevated: #FFFFFF;
  --bg-hover: #EFF5F4;
  --bg-active: #E1F8F3;

  --border-subtle: #E4EAEA;
  --border-default: #D5DEDE;
  --border-strong: #BFCBCB;

  --text-primary: #101719;
  --text-secondary: #506064;
  --text-muted: #788589;
  --text-disabled: #A2ADAF;
}
```

---

## 28. Tokens semânticos — TypeScript

```ts
export const semanticTokens = {
  background: {
    app: "var(--bg-app)",
    sidebar: "var(--bg-sidebar)",
    surface: "var(--bg-surface)",
    elevated: "var(--bg-elevated)",
    hover: "var(--bg-hover)",
    selected: "var(--bg-active)",
  },

  foreground: {
    primary: "var(--text-primary)",
    secondary: "var(--text-secondary)",
    muted: "var(--text-muted)",
    disabled: "var(--text-disabled)",
  },

  interaction: {
    primary: "var(--portus-aqua-500)",
    primaryHover: "var(--portus-aqua-400)",
    primaryPressed: "var(--portus-aqua-600)",
  },

  border: {
    subtle: "var(--border-subtle)",
    default: "var(--border-default)",
    strong: "var(--border-strong)",
    focus: "var(--portus-aqua-500)",
  },

  status: {
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
    info: "var(--info)",
  },
};
```

---

## 29. Regras de acessibilidade

- Contraste mínimo WCAG AA.
- Focus ring sempre visível para teclado.
- Não depender apenas de cor para comunicar status.
- Ícones interativos devem ter `aria-label`.
- Tabelas devem manter ordem de leitura clara.
- Botões críticos devem ter label textual.
- Estados disabled devem continuar legíveis.

---

## 30. Regras de responsividade

O PORTUS é desktop-first.

### Breakpoints sugeridos

```css
--breakpoint-lg: 1280px;
--breakpoint-xl: 1440px;
--breakpoint-2xl: 1600px;
```

### Lotes Ativos

- até 1280px: 2 cards/linhas visíveis;
- 1440px+: permitir 3 colunas se o conteúdo permanecer legível;
- preferir densidade horizontal em vez de aumentar altura.

### Relatórios

- manter tabela como fonte principal;
- permitir scroll horizontal controlado se necessário;
- não transformar em cards no desktop.

---

## 31. Do / Don't

### DO

- usar verde-água com moderação;
- usar IBM Plex Mono;
- usar Lucide outline;
- usar bordas técnicas;
- usar tabelas densas;
- usar status discretos;
- usar grid estrutural no shell;
- manter dark/light com paridade visual;
- priorizar informação operacional.

### DON'T

- não usar azul como accent principal;
- não usar dashboard de KPIs em Relatórios;
- não usar glassmorphism;
- não usar glow;
- não usar gradients decorativos;
- não usar radius exagerado;
- não usar cards gigantes;
- não exibir setor atual no topo;
- não exibir data no topo;
- não exibir usuário abaixo de Kairos Connect;
- não usar coluna Origem em Relatórios;
- não usar ícone na coluna Etapa;
- não confundir Etapa com Status global.

---

## 32. Fonte única de verdade visual

A identidade visual oficial do PORTUS passa a ser:

```text
IBM Plex Mono
+ carvão técnico
+ verde-água PORTUS
+ Lucide outline
+ grid estrutural
+ radius 2–6px
+ tabelas densas
+ quase nenhuma sombra
+ dark/light mode equivalente
```

Todas as páginas novas devem seguir este documento antes de qualquer variação visual local.
