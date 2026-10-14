# Fases 2 e 3 — status atualizado (14/10/2026)

## Fase 2: compatibilidade serial Windows

- [x] Núcleo C++17 e contratos de comunicação serial e timeouts.
- [x] Protótipo de callbacks KMDF `ReadFile` e `WriteFile` com encaminhamento entre dois endpoints.
- [x] Protótipo de IOCTLs básicos para baud, line control, timeout, wait mask, commstatus e purge.
- [ ] Compilar no WDK, corrigir erros e obter um binário Windows válido.
- [ ] Completar os IOCTLs que faltam: handshake, modem signals, WaitCommEvent e timeouts reais.
- [ ] Testar cancelamento, PnP e concorrência com Driver Verifier em VM.

## Fase 3: LABSERIAL STANDALONE (substitui integração ao PORTUS)

**Novo requisito:** o driver precisa ser um produto independente. PORTUS não é obrigatório nem para instalar nem para executar LabSerial.

- [x] Definir identidade e hardware IDs próprios: `LabSerial`, `ROOT\\LABSERIAL_VCOM_A`, `ROOT\\LABSERIAL_VCOM_B`.
- [x] Código-fonte KMDF original com duas portas previstas, `COM210` e `COM211` (nomes de teste).
- [x] Projeto Visual Studio/WDK separado e arquivo INX/INF experimental.
- [x] CLI PowerShell autônomo para status e smoke bidirecional.
- [x] Testes estáticos de estrutura e CI.
- [ ] Compilar, assinar para testes, validar INF e enumerar duas portas no Windows.
- [ ] Testar no Windows com o CLI LabSerial e SerialTool, **sem executar PORTUS**.
- [ ] Corrigir defeitos observados em VMs Windows 10 e 11.
- [ ] Definir política de instalação/desinstalação e licenciamento próprio.

**Estado comprovado:** código e ferramentas versionados; driver Windows ainda sem compilação WDK e sem teste de instalação. Não há prova de duas COM reais operacionais.

Arquitetura detalhada: [docs/PHASE_3_STANDALONE.md](docs/PHASE_3_STANDALONE.md).
