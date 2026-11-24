# Matriz de parâmetros EPA — validação em andamento

Escopo confirmado: **19 modelos** (CER-A, CER-K, CER-P, CPO, CPO-B, DPC, DPC-C, DPC-CPO, DPC-CPOB, DPC-M, DPC-MB, DPC-MF, MOL, MOL-L, MOL-S, NAT PO, NAT líquido, SPC, VER).

Fonte: 19 imagens PNG das folhas de análise, com a planilha original `Cálculo Caramelo.xlsx`. A planilha de trabalho `PORTUS_EPA_matriz_19_modelos_validacao.xlsx` foi gerada como artefato de revisão (não anexada ao GitHub nesta alteração).

## Progresso
- Inventário: **19/19** fontes catalogadas.
- Extração revisada manualmente: **49 linhas de parâmetros** em **4 modelos** (CPO, CPO-B, DPC-C e MOL-L); **15 modelos restantes exigem transcrição detalhada**. Não considerar a matriz homologada.
- Fórmulas: **5/5** conferidas com valores de referência, conforme `docs/epa-source-validation.md`.
- Divergências: cabeçalho DPC-C com produto interno DPC-M; Cor Spencer CPO-B 58,7–53,7; Cor Spencer DPC-C 82–71; unidade de densidade aparente impressa g/Kg; densidade Excel g/ml (ou g/L).
- Parâmetros não transcritos estão sinalizados como **a conferir**, nunca como ausentes. Limites invertidos não podem ser usados para aprovação automática.

## Banco de homologação
A busca nas conexões Supabase disponíveis não encontrou um projeto identificado como PORTUS. A arquitetura PORTUS utiliza PostgreSQL via `pg`, possivelmente hospedado fora dessas conexões. **Não foi executado o diagnóstico no banco real**. O preflight somente leitura permanece em `database/tests/epa_preflight.sql`.

Próxima ação: fornecer conexão autorizada ao PostgreSQL de homologação ou executar o script com `psql` nesse ambiente e compartilhar o resultado; revisar as 15 folhas restantes e homologar os critérios ambíguos antes dos seeds.
