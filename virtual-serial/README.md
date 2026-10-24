# LabSerial — driver virtual independente / PORTUS serial core

O novo **LabSerial** é um driver Windows independente (protótipo em `standalone-driver/`), planejado para conectar dois aplicativos via um par de portas COM. Não depende do PORTUS, do Electron, do Node.js nem do simulador Python.

**NÃO INSTALAR EM PRODUÇÃO:** o KMDF ainda não foi compilado no WDK, não foi assinado nem executado em Windows. Os arquivos de driver são fontes experimentais.

## Dois componentes separados

1. `standalone-driver/` — driver nativo LabSerial, INF, projeto WDK e CLI independente de inspeção/teste.
2. `core/` e `simulator/` — núcleo C++17 e simulador Python já existentes, usados como ferramentas de desenvolvimento. Não são carregados nem exigidos pelo driver LabSerial.

## Testes que podem ser feitos sem instalar driver

```bash
cmake -S virtual-serial -B virtual-serial/build
cmake --build virtual-serial/build
ctest --test-dir virtual-serial/build --output-on-failure
python -m unittest discover -s virtual-serial/standalone-driver/tests -p 'test_*.py' -v
```

### PowerShell Windows — somente diagnóstico

```powershell
.\virtual-serial\standalone-driver\tools\LabSerial.ps1 -Action status
```

A opção `-Action test` somente deve ser usada numa VM descartável, após o driver estar compilado, assinado e instalado com duas portas reais.

Especificação: [docs/PHASE_3_STANDALONE.md](docs/PHASE_3_STANDALONE.md). A integração com o PORTUS é opcional e posterior.
