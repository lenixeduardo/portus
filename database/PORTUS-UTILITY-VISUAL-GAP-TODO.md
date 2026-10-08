# PORTUS Database Utility — confronto visual e TODO

## Referencias
- Mockup de referencia enviado pelo usuario: janela Windows 11 com wordmark PORTUS completo, icones em campos e secoes, status com confirmacao e log demonstrativo.
- Captura real anterior: `database/portus-db-utility.ps1` renderizado em Windows no GitHub Actions.
- Regra: nao criar prints artificiais para simular sucesso de banco de dados.

## Checklist (priorizado)

- [x] **P0** Comparar mockup com captura WinForms real, sem confundir captura automatizada com area de trabalho Windows.
- [x] **P1** Hierarquia do cabecalho: ampliar a marca textual Sora e preservar simbolo azul PORTUS.
- [x] **P1** Substituir titulos em caixa alta por titulos editoriais, com icones nas quatro secoes.
- [x] **P1** Colocar icones internos nos seis campos (servidor, porta, banco, usuario, pasta, senha).
- [x] **P1** Melhorar feedback de status com glifos diferentes para pronto, em andamento e falha.
- [x] **P1** Introduzir descricao acessivel no status e estado vazio honesto no painel de logs.
- [x] **P1** Reproduzir icons e tipografia Sora/Inter sem modificar handlers de PostgreSQL, rede e migrations.
- [ ] **P2** Substituir titulo textual pela imagem original completa do wordmark PORTUS fornecida pelo usuario (nao redesenhar). Depende de importar o asset binario original ao repositorio.
- [ ] **P2** Validar fidelidade visual apos a alteracao com captura WinForms real em ambiente Windows, 100% / 125% / 150% DPI.
- [ ] **P2** Confirmar que nenhuma legenda ou controle e cortado em 1366x768 e 1920x1080.
- [ ] **P2** Executar integracao PostgreSQL, smoke real Windows e testes TypeScript; corrigir regressao antes de merge.

## Distincoes importantes

- IP 192.168.0.10, PostgreSQL 15 e linhas de sucesso exibidos no mockup sao exemplos. A interface nao deve copiar valores ou resultados ficticios.
- O script de captura em GitHub Actions salva os controles WinForms renderizados e nao inclui barra de titulo/sistema operacional no bitmap final.
- A conta e a senha PostgreSQL precisam ser informadas para testar conexao; smoke test nao acessa banco nem aplica migration.
