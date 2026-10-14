# LabSerial — Windows Virtual COM Driver (independente)

**NÃO INSTALAR EM PRODUÇÃO. Não compilado no WDK e não validado em Windows.**

## Objetivo

Driver **autônomo**, sem dependência do executável, código Electron, Node.js, Python ou runtime do PORTUS. Qualquer programa Windows poderá tentar utilizar os endpoints COM quando uma versão operacional estiver compilada, assinada, instalada e validada.

### Organização

- `kmdf/labserial.c`: protótipo de driver nativo KMDF; dois dispositivos root enumerated com estado partilhado no próprio driver; leitura/escrita Win32, buffers e um subconjunto de IOCTLs seriais.
- `kmdf/labserial.inx`: proposta de pacote de driver com dispositivos `ROOT\\PORTUS_VCOM_A` e `ROOT\\PORTUS_VCOM_B`, nomes fixos temporários `COM210` e `COM211`.
- `kmdf/labserial.vcxproj`: projeto MSBuild/WDK.
- `tools/LabSerial.ps1`: utilitário independente para listar portas e testar transmissão nas duas direções. Não cria portas nem instala drivers.
- `tests/test_layout.py`: checagens estruturais, **não substituem compilação nem teste nativo**.

### Como verificar sem instalar nada (PowerShell)

Na raiz do repositório:
```powershell
.\virtual-serial\standalone-driver\tools\LabSerial.ps1 -Action status
```

### Compilação Windows (requer VS + WDK, não foi executada)

Instalar Windows SDK/WDK da mesma versão e Visual Studio C++ correspondente. Abrir **Developer PowerShell for VS**:

```powershell
msbuild .\virtual-serial\standalone-driver\kmdf\labserial.vcxproj /p:Configuration=Debug /p:Platform=x64
```

Validar o INF gerado com `InfVerif` e o pacote com `Inf2Cat`. Inspecionar/solucionar todos os erros, incluindo o mecanismo de emparelhamento e registro em `SERIALCOMM`. **Não executar devcon/pnputil antes que o build, INF, assinatura e revisão de código estejam aprovados.**

### Teste de portas (APENAS em VM descartável, após instalação assinada)

```powershell
.\virtual-serial\standalone-driver\tools\LabSerial.ps1 -Action test -PortA COM210 -PortB COM211 -ConfirmTestVm -ConfirmPortsBelongToLabSerial
```

O operador deve verificar antes, no Gerenciador de Dispositivos, que ambas são interfaces virtuais do LabSerial e que nenhuma porta de equipamento real recebeu esses números.

### Limitações deste protótipo

1. Dois root devnodes não são criados pelo script/driver; instalar e enumerar ambos requer pacote WDK, assinatura e procedimento específico em VM.
2. Leitura/escrita básica entre dois buffers está **codificada, mas sem teste de compilação ou comportamento Windows**.
3. Handshake XON/XOFF, RTS/CTS, WaitCommEvent, timeouts exatos e DTR/DSR ainda não implementados.
4. Nomes COM210 e COM211 são experimentais, fixos e exigem preflight para colisões.
5. O `PortName` e `SERIALCOMM` precisarão ser comprovados em Windows com o SerialTool.
6. A instalação de drivers de kernel exige assinatura adequada; não contornar políticas de segurança.
7. Suporte PnP, remoção durante I/O, referências a filas e cancelamento precisam de stress test/Driver Verifier.

## Critério objetivo de 'funcionando'

Somente após **build WDK x64 bem-sucedido**, **INF validado**, **dois COM reais visíveis e abertos**, **leitura A→B e B→A**, **reinício/remoção/estabilidade** e evidência de assinatura. Antes disso, é um protótipo de código.

Referência técnica: [Fase 3 independente](../docs/PHASE_3_STANDALONE.md).

## Licenciamento

Nenhum trecho do com0com foi reutilizado. Código próprio escrito com as APIs públicas do WDK. Isso não dispensa conferência das licenças do SDK/WDK, ferramentas e quaisquer componentes futuros.
