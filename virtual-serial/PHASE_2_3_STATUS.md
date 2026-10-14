# Fases 2 e 3 — progresso real

## Fase 2 (compatibilidade serial)
- [x] Definir contrato de configurações seriais com validação (baud/data/stop/parity e flags).
- [x] Definir aritmética de timeouts, protegida por inteiros de 64 bits.
- [x] Criar testes unitários de configuração.
- [ ] Implementar IOCTL_SERIAL_* no adaptador UMDF2.
- [ ] Implementar cancelamento, eventos, handshake e leitura/escrita Win32.
- [ ] Compilar e testar no WDK.

## Fase 3 (integração)
- [x] Confirmar que o PORTUS já utiliza o pacote Node serialport.
- [x] Criar simulador Python separado para cinco categorias de equipamento.
- [x] Implementar protocolo demonstrativo READ?/PING e testes de protocolos sintéticos.
- [ ] Conectar as duas portas do driver PORTUS (não existem ainda).
- [ ] Substituir presets por protocolos reais documentados de cada fabricante.
- [ ] Implantar painel e IPC com permissões administrativas.
- [ ] Executar teste fim a fim PORTUS ↔ COM ↔ simulador/SerialTool.

**Não alteramos o instalador de produção nem afirmamos que um driver COM está pronto.**
