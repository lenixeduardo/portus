# Validação documental EPA — 2026-11-23

## Inventário dos 19 anexos PNG originais
CER-A, CER-K, CER-P, CPO, CPO-B, DPC, DPC-C, DPC-CPO, DPC-CPOB, DPC-M, DPC-MB, DPC-MF, MOL, MOL-L, MOL-S, NAT PO, NAT líquido, SPC, VER.

A relação anterior de 18 omitia **CPO**. CPO e CPO-B são formulários distintos, não duplicatas:
- CPO: `CORANTE CARAMELO CPO`, folha de pó; Poder Corante **77481–80033**, Poder Tintorial **0,811–0,832**, Hue **4,1–4,2**, densidade aparente **0,472–0,548 g/Kg** (unidade impressa a validar com laboratório).
- CPO-B: `CORANTE CARAMELO CPO-B`, folha de pó; Poder Corante **50069–54631**, Poder Tintorial **0,500–0,600**, Hue **4,1–4,4**, Cor Spencer impresso **58,7 – 53,7** (intervalo invertido; **não normalizar sem homologação**), densidade aparente **0,545–0,604 g/Kg** (unidade impressa a validar).
- Conclusão: 19 códigos distintos nos anexos. **Não excluir CPO nem cadastrar os 19 como aprovados** até confirmar os 18 contratados e eventual modelo adicional.

## Verificação do arquivo original `Cálculo Caramelo.xlsx`
Aba: `Cálculo Caramelo`. Entradas: B3=0,6 (Abs 0,4% 610nm), B4=0,04 (Abs 0,1% 610nm), B5=0,187 (Abs 0,1% 560nm), B6=0,17 (Abs 0,1% 510nm), B7=0,482 (Abs 0,05% 430nm), B15=1,28 (densidade 25°C).

| Saída | Fórmula exata da célula | Resultado calculado | Resultado armazenado no arquivo |
|---|---|---|---|
| B8 Cor Spencer | `=74.913/B3` | 124,855 | 124,855 |
| B9 Poder Tintorial | `=B5` | 0,187 | 0,187 |
| B10 Poder Corante | `=B7*2000*25` | 24100 | 24100 |
| B11 Índice de Hue | `=(LOG10(B6/B4))*10` | 6,283889300503115... | 6,283889300503115 |
| B14 Concentração °Be (25°C) | `=(((145/B15))-145)*-1+0.8-0.74` | 31,77875 | 31,77875 |

Medições diretas adicionais: B12 pH da solução original=3,68; B13 viscosidade 30°C=120 cP. Unidades/condições das absorbâncias: concentração em %, comprimento de onda em nm e cubeta 1 cm; densidade B15 rotulada `g/ml (ou g/L)` — **inconsistência dimensional da própria fonte**, exigir validação; saída B14 °Be a 25°C. Não supor casas decimais nem tolerâncias por padrão.

A correspondência de entradas e fórmulas foi conferida diretamente no XLSX e os cinco resultados foram recalculados independentemente usando aritmética decimal.

## PostgreSQL de homologação
**Não executado**: o repositório versiona SQL e conexão `pg`, mas não fornece acesso autenticado ao PostgreSQL de homologação nesta sessão. O script somente leitura `database/tests/epa_preflight.sql` está disponível no PR. Para executar no ambiente correto, usar o utilitário de banco PORTUS ou `psql` com credenciais de homologação; não apontar para produção sem aprovação.

Critério de liberação: consultar `portus_schema_migrations`, confirmar migrations 001–026, `ux_batches_product_code`, ausência de UNIQUE isolado em `batches.code`, funções e grants. Até então **não afirmar paridade entre schema implantado e versionado**.
