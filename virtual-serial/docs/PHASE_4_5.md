# PORTUS Virtual Serial — Fases 4 e 5

**Estado em 14/10/2026:** QA e distribuição segura preparados; driver Windows **não operacional**, **não instalável**, **não assinado**.

## Bloqueio central

O núcleo C++17 move bytes entre duas filas, mas o adaptador `driver/portus_umdf.cpp` ainda devolve `STATUS_NOT_IMPLEMENTED`. Nenhum par COM PnP real é criado e o `.inx` ainda não passou por InfVerif. A implementação de compatibilidade Win32/IOCTLs continua pendente. Portanto, não podemos concluir testes fim a fim no Windows, assinatura e distribuição.

O exemplo Microsoft VirtualSerial2 UMDF 2 é didático, não certificado para produção. Não copiar o código do com0com. Não alterar capturas reais, BCD, registro Windows nem instalador PORTUS de produção.

## Fase 4 — Qualidade e compatibilidade

- [x] Criar inventário **somente leitura** de Windows, WDK, COM, PnP, hashes/assinatura: `scripts/windows_readiness.ps1`.
- [x] Criar teste bidirecional COM A ↔ B, com duplo consentimento explícito e timeout: `scripts/com_pair_smoke.ps1`.
- [x] Recusar tráfego se portas não existirem, forem idênticas ou não houver confirmação de VM descartável.
- [x] Criar testes de validação de evidências e hash de arquivos (ver Fase 5).
- [ ] Compilar driver no WDK/Visual Studio, passar InfVerif e Inf2Cat.
- [ ] Registrar duas COM reais via PnP e implementar serial IOCTLs, I/O, cancelamento e pareamento.
- [ ] Rodar o smoke em **VM** usando portas criadas pelo driver PORTUS.
- [ ] Validar com SerialTool e biblioteca Node `serialport`.
- [ ] Testar Windows 10 e 11 x64, reinício, remoção e rollback.

### Comandos Windows — sem instalação

Na raiz do repositório:
```powershell
.\virtual-serial\scripts\windows_readiness.ps1
.\virtual-serial\scripts\com_pair_smoke.ps1 -PortA COM10 -PortB COM11
```

Somente quando existir um par criado pelo driver PORTUS, numa **VM descartável**, após conferir no Gerenciador de Dispositivos que não se trata de hardware real:
```powershell
.\virtual-serial\scripts\com_pair_smoke.ps1 -PortA COM10 -PortB COM11 -RunTraffic -IConfirmDisposableVmAndVirtualPorts
```
Os nomes COM10/COM11 são ilustrativos. O script de smoke não autentica a identidade do hardware; confirmação manual é obrigatória.

## Fase 5 — Distribuição controlada

- [x] Definir checklist de homologação independente de com0com.
- [x] Criar verificador conservador `scripts/release_gate.py`: falha se faltam evidências.
- [x] Exigir relatórios individuais para WDK, InfVerif, Inf2Cat, duas COM, serial Win32, E2E, Windows 10/11, reboot, remoção, assinatura e aprovação do responsável.
- [x] Exigir binários DLL/INF/CAT com hashes SHA-256 válidos; rejeitar caminhos externos inseguros.
- [x] Criar manifesto exemplo, com todos os itens **pendentes** (`release/release-evidence.example.json`).
- [x] Testes unitários Python do gate em `tests/test_release_gate.py`.
- [ ] Gerar DLL/INF/CAT reais via WDK e validar assinatura Windows independentemente.
- [ ] Preparar instalador separado e opt-in com rollback comprovado.
- [ ] Obter assinatura adequada pela Microsoft para distribuição; validar no hardware alvo.
- [ ] Aprovação de QA e titular do projeto, depois integrar à distribuição PORTUS.

### Testar liberação (deve falhar hoje)

```powershell
python virtual-serial/scripts/release_gate.py --manifest virtual-serial/release/release-evidence.example.json
python -m unittest discover -s virtual-serial/tests -p 'test_release_gate.py' -v
```

**O gate não certifica um driver.** Apenas verifica arquivos, hashes e a presença de evidências declaradas. Os documentos e resultados devem ser auditados e aprovados por pessoas e ferramentas de sistema independentes.

## Condições de aceitação

1. Driver PORTUS possui duas portas COM operacionais no Windows.
2. SerialTool e PORTUS trocam dados em ambos os sentidos.
3. Windows 10/11 x64, reboot, desinstalação e rollback testados em VM.
4. WDK/InfVerif/Inf2Cat, assinatura e requisitos de segurança atendidos.
5. Release com consentimento explícito e instalação reversível, sem afetar equipamentos reais.

## Referências

- https://github.com/microsoft/Windows-driver-samples/tree/main/serial/VirtualSerial2
- https://learn.microsoft.com/windows-hardware/drivers/devtest/infverif
- https://learn.microsoft.com/windows-hardware/drivers/devtest/inf2cat
- https://support.microsoft.com/windows/hardware/drivers/the-windows-driver-policy
