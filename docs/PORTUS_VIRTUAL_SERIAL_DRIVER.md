# PORTUS Virtual Serial Driver

**Data:** 2026-10-13  
**Escopo:** driver Windows independente para PORTUS; fase 1 iniciada.  
**Status:** motor C++17 compilado e testado localmente; adaptador UMDF2 experimental **não compilado/instalável**.

## Objetivo

Criar um driver Windows próprio que disponibilize pares de portas seriais virtuais, permitindo ao PORTUS usar uma extremidade e ao SerialTool ou simulador Python usar a outra. Não utilizar código, bibliotecas, binários, instaladores, mecanismos de implementação específicos ou arquivos derivados do com0com.

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

- **Primeira hipótese:** C++/UMDF 2, com WDK/Windows SDK em versões correspondentes.
- **Motivo:** menor exposição a falhas em modo kernel para o primeiro protótipo.
- **Ressalva crítica:** o exemplo oficial Microsoft VirtualSerial2 demonstra uma **porta serial virtual simples**; não confirma que duas instâncias tenham automaticamente estado compartilhado nem que funcionem como par.
- **Decisão pendente:** planejar dois dispositivos PnP e o meio de pareamento explícito. Se UMDF 2 não atender, avaliar uma arquitetura própria baseada em KMDF e enumerador de barramento, mantendo a independência de com0com.

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

O adaptador `portus_umdf.cpp` declara `DriverEntry`, registro de dispositivo experimental e fila WDF, porém completa operações `read`/`write` com `STATUS_NOT_IMPLEMENTED`. Sua interface GUID é **privada**, não registra COM funcional. O arquivo INX é **template experimental**, não pacote instalável.

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

### Fase 3 — Integração PORTUS

- [ ] Gerenciador de portas virtuais separado dos equipamentos reais.
- [ ] Painel de simulação e logs.
- [ ] Simuladores Python para balança, pH-metro, viscosímetro, refratômetro e espectrofotômetro.

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
