# Adaptador UMDF 2 — somente um scaffold de Fase 1

**NÃO INSTALAR.** Esta pasta contém um ponto de entrada WDF e callbacks que retornam erro intencionalmente. Não existe COM10/COM11 funcional ainda, o template INX não passou por InfVerif e não há assinatura de catálogo.

## Para continuar no Windows

1. Instalar Visual Studio 2026 (C++), Windows SDK e WDK com versões correspondentes.
2. Criar projeto UMDF 2 DLL no Visual Studio, incluir `portus_umdf.cpp` e compilar com WDK.
3. Gerar INF a partir de `portus_virtual_serial.inx`, rodar InfVerif e corrigir problemas.
4. Projetar e implementar **dois dispositivos PnP reais**, seus nomes COM e ligação bidirecional explícita (não assumir memória compartilhada entre hosts UMDF).
5. Implementar ReadFile, WriteFile, IOCTL_SERIAL_*, cancelamento, timeouts e configuração serial.
6. Testar em VM Windows isolada com assinatura de teste; não mexer nas políticas de assinatura do computador de produção.

Se a estratégia UMDF 2 não suportar os requisitos de emparelhamento, avaliar KMDF e enumerador de barramento virtual, ainda sem código de com0com.

Documentação técnica: [especificação](../../docs/PORTUS_VIRTUAL_SERIAL_DRIVER.md).
