# Design QA — Lotes Ativos

- **Fonte visual:** referência de tela enviada pelo usuário (`4CE5E80C-C717-43EB-B57D-00EC84B257E6.jpeg`), exibida na conversa.
- **Implementação:** `src/renderer/screens/Dashboard.tsx` e `src/renderer/styles.css`.
- **Viewport-alvo:** desktop, 1536 × 864 (referência).
- **Estado-alvo:** tema escuro, dois lotes abertos, leitor pronto e banco conectado.

## Comparação planejada

### P1 corrigidos no código

- A grade de cards verticais foi substituída por linhas operacionais horizontais.
- O leitor agora ocupa um painel permanente entre ações e lista de lotes.
- Foram adicionados filtros funcionais para Todos, Produção e Laboratório.
- O código de barras permanece visível em cada lote, agora com valor humano-legível.
- Confirmações de Produção e Laboratório foram agrupadas como bloco independente de fechamento.
- Metadados de abertura, leituras e operador foram compactados na região operacional da linha.

### Preservações intencionais

- As últimas leituras centrais continuam visíveis por lote, pois são requisito funcional posterior à referência.
- A barra aqua de 3px no item ativo da navegação foi mantida: é uma regra explícita do `DESIGN.md`.

## Evidência de validação técnica

- `npm run typecheck`: aprovado.
- `npm test`: aprovado — 90 testes.
- `npm run build`: aprovado.
- Interações verificadas em código: filtros por setor, simulação de scan, abertura por código de barras, impressão e confirmação de fechamento por setor.

## Bloqueio de captura visual

Não há sessão gráfica/X Server disponível neste executor. O Electron encerra antes de criar uma janela e o servidor Vite também não inicia devido à limitação de interfaces de rede do ambiente. Portanto não existe screenshot renderizado da implementação para comparação lado a lado.

## Próxima verificação visual

Abrir o PORTUS em um ambiente gráfico, com dois lotes reais em estados diferentes, e comparar no viewport desktop a hierarquia, a altura das linhas, o painel de scanner e a legibilidade do barcode.

**final result: blocked**
