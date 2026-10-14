# PORTUS Virtual Serial Driver — Fase 1

Camada C++17 independente do Windows e sem código com0com: dois endpoints, buffers RX circulares, sincronização e transferência binária. **Não é driver COM instalável ainda.** Uma camada WDK/UMDF 2 experimental está em `driver/`.

Testar o núcleo:

```bash
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```

Especificação e pendências: [docs/PORTUS_VIRTUAL_SERIAL_DRIVER.md](docs/PORTUS_VIRTUAL_SERIAL_DRIVER.md).

**Isolamento:** a captura serial Electron existente e o instalador do PORTUS permanecem inalterados. Não instale o INX experimental.
