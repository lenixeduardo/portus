# PORTUS Virtual Serial Driver

**Data:** 2026-10-13  
**Escopo:** driver Windows independente como produto LabSerial, reutilizável por PORTUS ou qualquer software serial; fase 3 reformulada.  
**Status:** núcleo C++17 testado; protótipo LabSerial KMDF versionado, mas ainda **não compilado no WDK nem instalável**. O scaffold UMDF2 antigo é obsoleto.

## Objetivo

Criar o produto independente **LabSerial**, um driver Windows nativo que disponibiliza pares seriais virtuais para **quaisquer dois aplicativos Windows**, sem precisar instalar ou executar PORTUS. Este será apenas um dos possíveis consumidores. Não utilizar código, bibliotecas, binários, instaladores, mecanismos de implementação específicos ou arquivos derivados do com0com.

A análise prévia do com0com foi utilizada **exclusivamente como levantamento de requisitos de comportamento**. O desenvolvimento toma como referência a documentação pública das APIs Win32/WDK e testes independentes.

## Arquitetura pretendida

```text
PORTUS (Electron/serialport)     Simulador (Python/SerialTool)
            |                              |
           COM10                         COM11
            |                              |
            +------ PORTUS driver ---------+
                  PnP / serial Win32
                  buffers RX/TX
                  comunicação A <-> B
                  timeouts / fluxo
```

As portas COM10 e COM11 são exemplos. Seus nomes serão alocados evitando conflitos com dispositivos reais.

O repositório PORTUS utiliza `serialport` em seu processo Electron principal. Este projeto deve permanecer **separado** até que o driver esteja funcional, testado e assinado. A integração não modifica a captura atual do PORTUS.

## Decisão técnica e ressalva

- **Decisão nova (Fase 3):** driver standalone em C/KMDF, projeto WDK independente, com dois devnodes root e buffers no mesmo serviço. O código do adaptador UMDF2 permanece só como histórico experimental.
- **Motivo:** menor exposição a falhas em modo kernel para o primeiro protótipo.
- **Ressalva crítica:** o exemplo oficial Microsoft VirtualSerial2 demonstra uma **porta serial virtual simples**; não confirma que duas instâncias tenham automaticamente estado compartilhado nem que funcionem como par.
- **Validação pendente:** compilação WDK, aprovação de INF/InfVerif, enumeração PnP real de duas COM, serial IOCTLs completos e teste em VM Windows. Os dois dispositivos KMDF são uma implementação proposta ainda não homologada.

## Componentes do repositório

```text
virtual-serial/
├── CMakeLists.txt
├── core/include/portus/serial_pair.hpp
├── core/src/serial_pair.cpp
├── tests/serial_pair_tests.cpp
├── driver/portus_umdf.cpp
├── driver/portus_virtual_serial.inx
├── driver/README.md
└── README.md
```

O motor `SerialPair` implementa dois buffers RX circulares e independentes, com capacidade configurável. Uma escrita por A entrega bytes a B e vice-versa. Preserva FIFO, incluindo `0x00` e outros bytes binários, e possui mutex para concorrência. Se a fila de destino estiver cheia, aceita parcialmente ou retorna zero; **não há descarte silencioso**. A operação não bloqueia nem implementa timeout — tais controles são responsabilidade do adaptador Windows futuro.

O adaptador legado `portus_umdf.cpp` (não utilizado pelo LabSerial) declara `DriverEntry`, registro de dispositivo experimental e fila WDF, porém completa operações `read`/`write` com `STATUS_NOT_IMPLEMENTED`. Sua interface GUID é **privada**, não registra COM funcional. O arquivo INX é **template experimental**, não pacote instalável.

## Plano por fases

### Fase 1 — Motor, WDK e primeiro par COM

- [x] Documentar a arquitetura e a independência do com0com.
- [x] Criar motor C++17 independente com buffers, FIFO e comunicação bidirecional.
- [x] Validar acesso concorrente.
- [x] Criar testes e executar em ambiente Linux.
- [x] Iniciar adaptador WDF/UMDF 2 e arquivo INX experimental.
- [ ] Preparar projeto WDK no Visual Studio e compilar a DLL Windows.
- [ ] Validar o INX/INF com InfVerif.
- [ ] Expor **duas portas COM reais**, com nomes e dispositivos PnP corretos.
- [ ] Conectar `ReadFile`/`WriteFile` dos dois endpoints ao transporte.
- [ ] Instalar, remover e testar somente em VM Windows com assinatura de teste.

### Fase 2 — API serial Windows

- [ ] Suportar os IOCTLs de configuração serial necessários ao Node `serialport` e ao SerialTool.
- [ ] Implementar baud/paridade/stop bits, timeouts e cancelamento.
- [ ] Eventos seriais e controle de fluxo (RTS/CTS, DTR/DSR, XON/XOFF).
- [ ] Testes de buffers lotados e comunicação concorrente.

### Fase 3 — LabSerial independente (requisito alterado)

- [x] Criar identidade própria, IDs e código KMDF separados do PORTUS.
- [x] Criar `virtual-serial/standalone-driver/kmdf/labserial.c`, `labserial.inx` e `labserial.vcxproj`.
- [x] Criar ferramenta independente `LabSerial.ps1` para status e smoke de duas COM.
- [x] Adicionar verificações estruturais ao CI.
- [ ] Compilar KMDF em Windows com WDK e validar INF e assinatura.
- [ ] Fazer os dois dispositivos aparecerem como portas COM disponíveis.
- [ ] Comprovar A↔B sem PORTUS, usando LabSerial CLI e SerialTool.
- [ ] Finalizar controle de fluxo, `WaitCommEvent`, timeouts e remoção PnP.
- [ ] Distribuição e instalação próprias, sem vínculo ao instalador PORTUS.

Mais informações: [Fase 3 standalone](../virtual-serial/docs/PHASE_3_STANDALONE.md).

### Fase 4 — Qualidade e distribuição

- [ ] Testes end-to-end PORTUS ↔ driver ↔ SerialTool.
- [ ] Testes Windows 10/11 x64, reinstalação, reboot e remoção.
- [ ] Análise estática WDK/InfVerif/HLK quando aplicável.
- [ ] Assinatura Windows adequada para distribuição.
- [ ] Instalador próprio, com opt-in e recuperação segura.

## Testes realizados nesta fase

O motor foi compilado em Linux com GCC 14.2/CMake e executado com CTest: **4/4 grupos de teste aprovados** (bytes binários em ambos os sentidos; capacidade e wrap-around; reset/erros; escrita simultânea).

Para reproduzir:

```bash
cd virtual-serial
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
ctest --test-dir build --output-on-failure
```

**Limite desta validação:** não houve compilação no WDK, teste de `serialport` com portas Windows, `.sys` ou `.dll` instalado, execução de INF, assinatura digital, nem instalação de driver em computador algum.

## Requisitos mínimos de aceitação da fase 1 completa

1. Windows identifica duas COM disponíveis.
2. PORTUS abre COM A e SerialTool abre COM B.
3. Bytes trafegam sem corrupção e nos dois sentidos.
4. Fila cheia tem comportamento determinado, sem perda silenciosa.
5. Instalação e remoção em VM não comprometem o sistema.
6. Build WDK e verificação do INF são aprovados.

## Licença e proveniência

Este código é desenvolvido de forma independente para o projeto PORTUS. Não são reutilizados arquivos ou bibliotecas do com0com. A política de licenciamento própria deve ser estabelecida pelo proprietário antes de distribuição. Componentes futuros de terceiros continuam sujeitos às suas próprias condições.

## Referências oficiais

- WDK: https://learn.microsoft.com/en-us/windows-hardware/drivers/download-the-wdk
- Microsoft VirtualSerial2 (referência de API, não código copiado): https://github.com/microsoft/Windows-driver-samples/tree/main/serial/VirtualSerial2
- Exemplos UMDF: https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/sample-umdf-drivers
