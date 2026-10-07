# PORTUS — TODO de implementação da rastreabilidade unificada

## Sequência

- [x] Formalizar spec e critérios de aceite.
- [x] Criar migração para `supervisor`, `completed` e workflow supervisionado.
- [x] Permitir abertura de lote por Produção e Laboratório.
- [x] Remover bloqueio de captura por fechamento setorial legado.
- [x] Configurar identificação física da estação por computador.
- [x] Persistir `station_id` nas sessões de captura.
- [x] Expor estação, responsável e login no histórico.
- [x] Trocar confirmações Produção/Laboratório por checkbox único `Lote concluído`.
- [x] Restringir finalização e reabertura a Supervisor/Master.
- [x] Bloquear captura para Supervisor e manter Master operacional.
- [x] Atualizar tela de usuários com perfil Supervisor.
- [x] Atualizar folha de rastreabilidade/Excel com estação e linha cronológica.
- [x] Adicionar impressão da folha do lote.
- [x] Adicionar testes de contrato, permissões, histórico e relatório.
- [x] Rodar suíte automatizada no GitHub Actions — 21 arquivos / 140 testes aprovados.
- [x] Corrigir regressões encontradas pelo CI — typecheck e pacote Windows aprovados.
