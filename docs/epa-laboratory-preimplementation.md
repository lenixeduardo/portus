# PORTUS EPA — preparação técnica pré-implementação

Status: **proposta para revisão; nenhuma migration EPA aplicada**.
Escopo aprovado pelo responsável: **todos os 19 modelos laboratoriais documentados**, incluindo CPO e CPO-B, independentemente da quantidade prevista no contrato; cinco cálculos automatizados e critérios de conformidade por produto. Limites e critérios individuais continuam sujeitos a conferência documental e homologação.

## Arquitetura real e pontos de integração
- Electron + TypeScript, IPC com validação Zod, processo principal acessando PostgreSQL por `pg`; **não** introduzir API REST paralela.
- Reutilizar `products.id`, `batches.id`, `capture_sessions.id`, `readings.id`, `equipments.id`, `users.id` e `batch_history`.
- A identidade de lote é `(batches.product_id, batches.code)`, conforme migration 026. Consultas por código isolado devem exigir desambiguação.
- `readings.value_raw` e `readings.value_parsed` são TEXT e devem continuar intocados como evidência de captura; resultados derivados devem ser `NUMERIC` em tabelas próprias.
- O fechamento do lote ocorre por funções PostgreSQL, incluindo `supervisor_finalize_batch` (redefinida pela migration 023). A validação EPA deverá ser feita **dentro da mesma transação e bloqueio do lote**; não apenas no renderer.
- Exportações CSV/XLSX existentes são rastreabilidade de captura. Laudos EPA devem ter seção específica e preservar os relatórios atuais.

## Decisões de modelagem a homologar (sem DDL nesta fase)
1. `lab_templates`: código imutável, nome, status draft/approved/retired, revisão e fonte documental.
2. `lab_parameters`: código semântico, grandeza, unidade, método, tipo (medido/calculado), casas decimais e condições de validade.
3. `lab_template_versions` + `lab_template_parameters`: composição versionada dos ensaios; não editar versão aprovada.
4. `lab_product_specifications` + `lab_spec_limits`: vínculo `product_id` à versão aprovada, limites inferior/superior inclusivos/exclusivos, unidades, obrigatoriedade, vigência e origem do documento; ausência de limite é **não configurado**, nunca aprovado automaticamente.
5. `lab_analysis_runs`: `batch_id`, versão de especificação congelada, ciclo/reanálise, estado draft/in_progress/pending_review/approved/rejected, usuário e carimbos de data.
6. `lab_results`: `analysis_run_id`, `parameter_id`, `reading_id NULL` opcional, `numeric_value NUMERIC`, valor original, unidade, origem manual/instrumento/cálculo, precisão, motivo de invalidação. Impedir vínculo de `reading_id` de lote diferente.
7. `lab_formula_versions` + `lab_formula_inputs`: chave semântica da fórmula, expressão versionada, entradas com unidades e restrições; **não** executar expressões arbitrárias de banco via eval/SQL dinâmico.
8. `lab_conformity_evaluations` + `lab_conformity_items`: snapshot imutável de versão, entradas, resultados, limites, decisão pass/fail/incomplete e hash da evidência; decisões antigas não são sobrescritas.
9. `lab_approvals`: ator, perfil, momento, revisão e justificativa; separar executor de aprovador quando exigido.
10. `lab_feature_flags`: habilitação explícita por ambiente; integração de bloqueio de finalização desativada até homologação.

## Regras funcionais
- **Não conformidade**: fora dos limites documentados ou validação instrumental inválida.
- **Incompleto**: parâmetros obrigatórios ausentes, fórmula com entradas ausentes, divisão por zero, `LOG10` com argumento não positivo, especificação não aprovada, unidade incompatível ou documento sem limite necessário.
- **Conforme**: todos os parâmetros obrigatórios avaliados com versão aprovada e limites válidos; aprovação humana conforme matriz de permissões.
- Ao reabrir lote, iniciar novo ciclo de análise; manter avaliações e aprovações anteriores como histórico, nunca reutilizar aprovação anterior como liberação automática.
- Captura original permanece imutável; correções geram nova revisão com justificativa e autoria.
- Unidades, escala, arredondamento e critérios de fronteira são definidos por parâmetro; não inferir das células Excel.
- Qualquer habilitação do bloqueio de finalização requer backfill/estratégia para lotes legados e testes de regressão.

## Fórmulas recuperadas — somente referência, não homologadas
| Cálculo | Fórmula Excel | Ponto de atenção |
|---|---|---|
| Cor Spencer | `=74,913/B3` | B3 não pode ser zero; confirmar unidade e arredondamento |
| Poder Tintorial | `=B5` | Confirmar significado físico de B5 |
| Poder Corante | `=B7*2000*25` | Confirmar fatores, unidade e método |
| Índice de Hue | `=LOG10(B6/B4)*10` | B4 e B6 positivos; confirmar log base 10 |
| °Bé | `=-((145/B15)-145)+0,8-0,74` | B15 diferente de zero; confirmar temperatura, densidade e correção |

A origem exata das células, correspondência de comprimento de onda, densidade, fatores e limites depende de validação do arquivo `Cálculo Caramelo.xlsx` e das folhas laboratoriais originais.

## Riscos encontrados na base atual
- `checkCentralDatabase()` em `src/main/db/central-connection.ts` verifica objetos até migrations 012–014, mas não confirma explicitamente a 026, índices compostos nem futura versão EPA. Expandir o diagnóstico por módulo, sem bloquear o PORTUS legado por feature opcional.
- `findCentralBatchByCode` permite busca por código sem produto e sinaliza ambiguidade; qualquer novo endpoint EPA deve receber `batch_id` ou o par `product_id + code`.
- `src/main/db/central-auto-export.ts` registra exportação por `batch_id` e não por ciclo; laudos EPA devem considerar revisões e reaberturas sem sobrescrever evidências.
- `src/main/db/central-products-repo.ts` procura código de barras no nome/descrição do produto; não usar esse método como chave de especificação.
- Perfis existentes autorizam captura e fechamento; editar limite, homologar versão e aprovar laudo requerem ações específicas, concedidas por função e revogadas de PUBLIC.

## Sequência de entrega planejada
- 027: templates, parâmetros e versões.
- 028: execuções, resultados e associação segura às capturas.
- 029: fórmulas versionadas e motor determinístico com testes de referência.
- 030: conformidade, aprovações e auditoria.
- 031: matriz de privilégios, funções SECURITY DEFINER e grants específicos.
- 032: gate transacional na finalização, condicionado à feature flag.
Cada migration exige teste de upgrade em banco populado, idempotência do instalador, rollback operacional planejado e teste de não regressão.

## Critérios de aceite antes de iniciar implementação
- [x] Escopo confirmado: implementar os 19 modelos dos anexos, incluindo CPO e CPO-B, sem exclusão por divergência contratual.\n- [ ] Validar códigos, revisões e limites de cada um dos 19 modelos.
- [ ] Confirmar associação de cada produto aos parâmetros obrigatórios e limites a partir dos documentos.
- [ ] Conferir célula a célula as cinco fórmulas com exemplos e resultados esperados.
- [ ] Executar `database/tests/epa_preflight.sql` em banco de homologação; conferir migrations aplicadas e privilégios.
- [ ] Aprovar matriz de acesso: capturador, revisor, homologador e supervisor.
- [ ] Definir política de lote legado, reanálise, revisão de laudo e habilitação gradual.
- [ ] Revisar a proposta de schema e os contratos IPC antes de gerar migrations.
