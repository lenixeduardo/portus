# Matriz laboratorial EPA

A matriz transcreve 291 linhas de ensaio em 19 imagens originais encaminhadas pela EPA Química na mensagem “Folhas de análises Caramelos”, de 26/10/2026. A revisão das imagens foi visual. Os nomes e hashes SHA-256 dos anexos permitem identificar os arquivos conferidos. Os originais ficam no acervo de origem.

| Arquivo | Conteúdo |
|---|---|
| `EPA_matriz_19_modelos.xlsx` | Cinco abas filtráveis com inventário, parâmetros, critérios, fórmulas e pendências |
| `epa_models.json` | Código do modelo, identificação e revisão dos formulários, quando visíveis |
| `epa_parameters.json` | Uma linha por ensaio identificado, com unidade, condições de análise, origem e qualificação documental |
| `epa_specifications.json` | Evidências e critérios impressos vinculados pela chave `codigo_modelo` + `codigo_parametro` |
| `epa_formulas.json` | Cinco fórmulas, referências de células, valores armazenados e recálculo decimal |
| `epa_validation_issues.json` | Pendências vinculadas ao modelo ou parâmetro, com evidência e impacto na aprovação |

Campos sem informação documentada ficam nulos. A precisão analítica permanece pendente mesmo quando a folha apresenta casas decimais. Faixas sem indicação explícita de inclusividade conservam ambos os indicadores nulos. Limites descendentes conservam os dois extremos impressos e mantêm os campos de mínimo e máximo vazios. O asterisco só estabelece obrigatoriedade quando sua legenda é visível e inequívoca para a linha. `formula_candidata` identifica a fórmula por correspondência com a planilha e depende de confirmação por modelo.

O arquivo `Cálculo Caramelo.xlsx` foi lido com e sem os resultados armazenados. A unidade impressa na célula B15 admite g/ml ou g/L. A fórmula de °Bé permanece bloqueada para aplicação até a confirmação dessa unidade. O critério de densidade aparente g/Kg e as discrepâncias nos rótulos de DPC-C e VER também exigem resolução.

A migration 027 inclui o catálogo em rascunho e suas evidências transcritas. Para reproduzir o bloco a partir dos JSON, execute `node scripts/generate-epa-draft-seed.mjs --write` na raiz. Use o mesmo comando sem `--write` para verificar se o bloco corresponde aos JSON. A documentação e o seed preservam os critérios impressos para revisão. A associação com produtos, o cadastro de limites operacionais e os vínculos de fórmulas requerem homologação.
