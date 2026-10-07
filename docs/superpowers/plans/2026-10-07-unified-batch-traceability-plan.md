# PORTUS — TODO de implementação da rastreabilidade unificada

## Sequência

- [x] Formalizar spec e critérios de aceite.
- [x] Criar migração para `supervisor`, `completed` e workflow supervisionado.
- [ ] Permitir abertura de lote por Produção e Laboratório.
- [ ] Remover bloqueio de captura por fechamento setorial legado.
- [ ] Configurar identificação física da estação por computador.
- [ ] Persistir `station_id` nas sessões de captura.
- [ ] Expor estação, responsável e login no histórico.
- [ ] Trocar confirmações Produção/Laboratório por checkbox único `Lote concluído`.
- [ ] Restringir finalização e reabertura a Supervisor/Master.
- [ ] Bloquear captura para Supervisor e manter Master operacional.
- [ ] Atualizar tela de usuários com perfil Supervisor.
- [ ] Atualizar folha de rastreabilidade/Excel com estação e linha cronológica.
- [ ] Adicionar impressão da folha do lote.
- [ ] Adicionar testes de contrato, permissões, histórico e relatório.
- [ ] Rodar suíte automatizada no GitHub Actions.
- [ ] Corrigir regressões encontradas pelo CI.
