# Matriz de parâmetros EPA

A [matriz dos 19 modelos](epa-matrix/README.md) contém 291 linhas de ensaio conferidas visualmente nos 19 formulários originais. A planilha original `Cálculo Caramelo.xlsx` foi reaberta e suas cinco fórmulas foram recalculadas independentemente. As fontes foram identificadas pelo nome e pelo SHA-256 nos arquivos estruturados.

Os modelos e parâmetros estão em rascunho. A migration 027 carrega a transcrição, as evidências e as pendências sem ativar limites operacionais. As 94 pendências incluem faixas descendentes, critérios em branco, unidades de densidade, identificação do produto no cabeçalho e homologação por modelo. A unidade da densidade em B15 precisa de confirmação antes da aplicação da fórmula de °Bé.

Os arquivos complementares `PORTUS_EPA_matriz_19_modelos_validacao.xlsx`, `PORTUS_matriz_auditoria_laboratorial.xlsx`, `PORTUS_backend_specs_v1.zip` e `PORTUS_EPA_Orcamento_White_Premium.pdf` não foram localizados no acervo conectado consultado. A revisão desta matriz usou as fontes primárias recuperadas.

A homologação dos ensaios e do banco Windows depende de execução no ambiente do contratante. O preflight somente leitura está disponível em `database/tests/epa_preflight.sql`.
