# LabSerial — matriz de testes gratuitos do GitHub Actions

**Data:** 14/10/2026. **Escopo:** testes que não precisam iniciar uma VM Windows própria.

## Implementação

- FIFO portável `core/labserial_ring.h` é incluído **diretamente pelo driver KMDF** `kmdf/labserial.c` e pelo teste nativo `tests/ring_tests.c`.
- `ring_tests.c` valida FIFO binário (incluindo NUL/0xFF), wrap-around, fila cheia/escrita parcial, entrada inválida, capacidade unitária e **100.000 operações determinísticas**, comparando saída com uma fila de referência.
- `virtual-serial/CMakeLists.txt` integra o teste nativo C ao CTest. O projeto C++ `SerialPair` permanece com sua bateria independente.
- Workflow `portus-virtual-serial-core.yml`: CMake Windows/Linux em Debug e Release (4 combinações); CTest repetido 3 vezes; execução Linux adicional com ASan/UBSan; testes Python de contrato, simuladores e release gate com falha obrigatória em manifesto sem evidências.
- Workflow `labserial-wdk.yml`: WDK 28000.2526, KMDF x64 Debug e Release; StampInf/InfVerif (incluindo etapa explícita `/w /v`), geração do catálogo e assinaturas de **teste**, verificação de `labserial.sys`, `labserial.inf`, `labserial.cat`, IDs `ROOT\\LABSERIAL_VCOM_A/B`, hashes SHA-256 e arquivos de artefatos separados por configuração.
- Nenhum workflow usa `pnputil` para instalar, `devgen` para enumerar, `bcdedit` ou `TESTSIGNING`. Os runners são ambientes de build, **não VMs de homologação de kernel**.

## Execução e evidência

- [CMake C/C++ + sanitizadores + Python](https://github.com/lenixeduardo/portus/actions/runs/38514790082): todos os jobs concluídos com sucesso na primeira rodada expandida.
- [Driver WDK x64 Debug/Release](https://github.com/lenixeduardo/portus/actions/runs/38514790197): ambos os jobs concluídos com sucesso.
- Artefatos disponíveis no GitHub Actions: `labserial-wdk-Debug-x64-test-only` e `labserial-wdk-Release-x64-test-only`. Eles contêm arquivos de teste e `checksums.json`; não são releases instaláveis em produção. Retenção configurada em 7 dias; nova execução poderá recriá-los.
- As configurações de build Debug e Release continuam sob proteção de PR Draft, sem merge em `main`.

## Cobertura e limites

| Verificação | Situação |
|---|---|
| FIFO do código KMDF em testes nativos C | Aprovado Windows/Linux |
| 100 mil operações determinísticas contra modelo de referência | Aprovado local e na CI |
| Núcleo independente C++ | Aprovado Windows/Linux Debug/Release |
| Sanitizadores ASan/UBSan do código portável | Aprovado Linux |
| Estrutura de pacote e testes Python | Aprovado |
| Compilação WDK de driver .sys (Debug/Release x64) | Aprovado |
| Verificação `InfVerif /w /v` | Aprovado |
| Arquivos SYS/INF/CAT e hashes em artefato | Verificados na CI |
| Assinatura aceita para distribuição pública | **Pendente**: apenas teste |
| Instalar/carregar .sys e criar COM210/COM211 | **Não testado** |
| Testar comandos Win32/IOCTLs, cancelamento e PnP | **Não testado** |
| Comunicar COM210↔COM211 em um Windows real | **Não testado** |

Os sanitizadores exercitam rotinas portáveis em modo usuário, não o kernel. Um build WDK aprovado **não garante** ausência de falhas de PnP, race conditions de lifecycle, crashes de kernel nem compatibilidade COM.

## Como revisar

1. Abrir [PR #123](https://github.com/lenixeduardo/portus/pull/123).
2. Abrir a aba **Checks**, procurar os dois workflows relacionados ao LabSerial.
3. Examinar logs de `test-core`, `test-sanitizers`, `test-python` e `compile-kmdf` e baixar `test-only` se for reproduzir o pacote em um laboratório isolado.
4. Se houver alterações de código, considerar como evidência somente os workflows executados sobre o commit correspondente.

**Custos:** os jobs usam GitHub Actions hospedados. O uso está sujeito à franquia, aos minutos disponíveis e à política de cobrança do plano/repositório; não há provisionamento de uma VM externa paga nesta implementação.

Próximo bloqueio: um Windows dedicado com privilégio para instalar driver de teste, reiniciar, executar Driver Verifier e testar A↔B. Não instalar no Windows pessoal antes desse estágio.
