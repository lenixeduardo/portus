# Fase 3 revisada — LabSerial independente do PORTUS

**Data:** 2026-10-14  
**Mudança de requisito:** o driver não é um recurso do PORTUS; é um produto separado que poderá ser consumido por qualquer software de portas COM do Windows.

## Antes e depois

| Anterior | Novo |
|---|---|
| Fase 3: integrar simulador/portas ao PORTUS | Fase 3: fornecer driver autônomo LabSerial |
| Dependência planejada de painel Electron | Ferramentas nativas de diagnóstico, sem PORTUS |
| PORTUS ↔ simulador obrigatório | Qualquer aplicação Windows A ↔ B |
| Distribuição acoplada ao instalador | Driver, CLI e distribuição independentes |
| Testes focados no PORTUS | Testes nativos com PowerShell e SerialTool |

## Design do driver independente

**Escolha experimental: KMDF**, substituindo o scaffold UMDF2 que não disponibilizava duas COM operacionais. Dois dispositivos root enumerated (A e B), sob o mesmo serviço de kernel, compartilham o motor de transporte. Os endpoints expõem nomes dos COM e interface `GUID_DEVINTERFACE_COMPORT`. A implementação agora inclui callbacks de leitura/escrita, fila de reads pendentes, buffers circulares, e alguns `IOCTL_SERIAL_*` para baud, formato, timeouts, máscara e status.

Artefatos no repositório:
- `standalone-driver/kmdf/labserial.c`: código C experimental independente.
- `standalone-driver/kmdf/labserial.vcxproj`: projeto WDK.
- `standalone-driver/kmdf/labserial.inx`: pacote experimental.
- `standalone-driver/tools/LabSerial.ps1`: utilitário autônomo de status/teste.
- `standalone-driver/tests/test_layout.py`: verificações estruturais do projeto.

## Critérios de fase 3 (atualizados)

- [x] Separar conceitualmente o produto LabSerial do PORTUS.
- [x] Implementar um protótipo de KMDF com pares de dispositivos de PnP e ligação em memória.
- [x] Preparar projeto MSBuild WDK, INF com dois IDs e CLI independente.
- [x] Manter a base do PORTUS e seu instalador sem mudanças.
- [ ] Compilar KMDF no WDK x64 sem erros e aprovar análise estática.
- [ ] Corrigir e aprovar INF/InfVerif/Inf2Cat.
- [ ] Criar e enumerar duas portas COM no Windows, sem conflitos.
- [ ] Testar leitura/escrita bidirecional com SerialTool e CLI.
- [ ] Implementar `WaitCommEvent`, handshake, timeouts e cancelamento corretamente.
- [ ] Validar Windows 10/11 x64, remoção/reinstalação, assinatura e políticas de segurança.
- [ ] Entregar instalador independente após homologação.

## Pré-requisitos

Windows de desenvolvimento/VM, Visual Studio C++, Windows SDK e WDK compatíveis (ex.: WDK 28000.2526 / Visual Studio 2026), e ferramenta de assinatura adequada para o tipo de teste. Os comandos de build estão no README. **Nenhum instalador de driver é executado automaticamente.**

## Aplicação no PORTUS (opcional)

Após o LabSerial estar homologado, o PORTUS poderá abrir uma das portas via seu `serialport` já existente. Nenhuma integração é necessária para tornar o driver autônomo. Simuladores externos e SerialTool podem abrir a outra extremidade.

## Resultado verificado e limites

Os testes já confirmados anteriormente cobrem **somente** núcleo C++ em host não-Windows e o release-gate. Os novos arquivos KMDF foram escritos e versionados, **não foram compilados, instalados nem executados em VM**. Não está correto chamar o driver de pronto ou funcional em Windows neste momento.
