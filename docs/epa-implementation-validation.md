# Validação da implementação laboratorial EPA

## Fontes e dados

A conferência visual abrangeu 19 formulários originais. A [matriz](epa-matrix/README.md) contém 291 linhas de ensaio e 94 pendências documentais abertas. O catálogo e as evidências são carregados em rascunho pela migration 027. A associação entre produtos e especificações, os critérios operacionais e a aplicação de fórmulas por modelo dependem de homologação. A geração do seed pode ser verificada com `node scripts/generate-epa-draft-seed.mjs`.

A planilha original **Cálculo Caramelo.xlsx** forneceu cinco fórmulas e seus resultados de referência. Cor Spencer = 124,855, Poder Tintorial = 0,187, Poder Corante = 24.100, Índice de Hue ≈ 6,283889300503115 e °Bé = 31,77875. O teste de °Bé usa g/mL como hipótese identificada. A unidade B15 impressa, “g/ml (ou g/L)”, mantém a versão bloqueada para laudos.

Os quatro arquivos complementares `PORTUS_EPA_matriz_19_modelos_validacao.xlsx`, `PORTUS_matriz_auditoria_laboratorial.xlsx`, `PORTUS_backend_specs_v1.zip` e `PORTUS_EPA_Orcamento_White_Premium.pdf` ficaram sem confirmação de localização nas buscas pelos títulos. A matriz cita os formulários primários e a planilha Caramelo.

## Mudanças no PostgreSQL

| Migration | Contrato |
|---|---|
| 027 | Catálogo, versões, critérios e pendências, com imutabilidade após aprovação |
| 028 | Análises por lote e ciclo, amostras, resultados e revisões, com vínculo à captura do próprio lote |
| 029 | Fórmulas versionadas, entradas validadas, resultado NUMERIC e evidência de cálculo |
| 030 | Avaliação por amostra e parâmetro, estados de conformidade e revisão de evidências |
| 031 | Funções de domínio, checagem de usuário e setor, segregação de aprovação e grants |
| 032 | Bloqueio transacional na finalização, com flag desligada e novo ciclo na reabertura |

`lab_feature_flags.enforce_from` começa no momento da instalação da migration 032. Com a flag habilitada, o gate exige uma aprovação vigente para lotes abertos a partir desse marco e para lotes reabertos após a instalação. Lotes abertos antes do marco seguem o fluxo legado até a primeira reabertura. As funções de conclusão e reabertura continuam registrando o histórico de lote.

## Evidências de validação

- PostgreSQL 16.16 isolado, com instalação 001–032 e atualização da migration 026 preservando os campos `value_raw` e `value_parsed`.
- Suítes EPA de integridade, cálculos, conformidade, permissões e finalização. O cenário com duas conexões verifica a espera pelo bloqueio, um único registro de finalização e o bloqueio após reabertura.
- TypeScript e build do Electron/React verificados localmente. Playwright Chromium passou 14 de 14 testes. A regressão Vitest local em Linux encontrou 310 aprovados, 16 ignorados e uma falha no cenário positivo do assistente restrito a Windows, também reproduzida na base anterior.
- O [script de homologação](../database/epa_homologation.ps1) foi exercitado em PowerShell com PostgreSQL isolado, incluindo backup, ledger e rollback de falha simulada. A [execução no Windows do contratante](../database/tests/README.md#homologação-epa-no-windows) segue pendente.

## Revisão de segurança

A revisão independente verificou a atualização e o caminho de cálculo, aprovação por segundo usuário e finalização. O SQL bloqueia edições diretas pela credencial operacional, aplica permissões por setor nas funções, protege evidências e sincroniza escritas por lote. As funções de elevação usam `search_path` explícito. A configuração de grants do instalador é transacional.

A credencial PostgreSQL de runtime é compartilhada e as funções recebem o identificador do usuário do PORTUS. A autenticação por pessoa continua na camada autenticada do aplicativo. Um acesso direto com a credencial de runtime não oferece essa identidade por pessoa. O fluxo existente de sincronização também mantém os privilégios necessários sobre cadastros de usuários e permissões centrais.
