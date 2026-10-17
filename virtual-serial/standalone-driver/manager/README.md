# LabSerial Setup — interface WinForms para COM210 ↔ COM211

App Windows x64 em C#/.NET 8 WinForms, reproduzindo o fluxo visual do com0com dentro do que o driver LabSerial experimental suporta. Nenhum código do com0com é reutilizado.

## Funcionalidades integradas

- **Inventário somente leitura**: valida dois dispositivos PnP, HardwareID, serviço LabSerial, PortName, SERIALCOMM, QueryDosDevice e estado PnP antes de habilitar qualquer teste.
- **Adicionar Par**: mostra na lista o par existente, quando ocultado. Não cria dispositivos PnP.
- **Remover Par**: oculta apenas da interface nesta sessão; não desinstala nem modifica o driver.
- **Propriedades e Aplicar**: lê a identidade do hardware e define um perfil de teste a 9600 ou 115200 baud (8N1, Handshake.None). Não grava configurações no kernel.
- **Testar Perfil**: abre ambos os endpoints com System.IO.Ports.SerialPort e troca dados ASCII A→B e binários B→A na velocidade escolhida; teste adicional validado no Windows físico em 17/10/2026 (2/2 PASS a 9600 baud).
- **Testar Win32**: executa os scripts de prova de transmissão já aprovados 6/6 no PC físico.
- **Testar .NET**: executa os scripts de compatibilidade já aprovados 4/4 no PC físico.
- **Console independente e evidências**: logs e exportação TXT; relatórios JSON/TXT salvos em Documentos\LabSerial-Evidencias.

Todos os testes requerem identidade das COM verificada, privilégios de administrador, confirmação de laboratório dedicado e execução em processo separado com watchdog. O watchdog não impede BSOD ou travamentos de kernel.

## Build da interface (Windows x64 com .NET SDK 8)

Em PowerShell, a partir desta pasta:

    dotnet build .\LabSerial.Setup.csproj -c Release
    dotnet publish .\LabSerial.Setup.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=false -o .\publish

Distribua publish\LabSerial.Setup.exe junto com a pasta publish\Scripts. A compilação é self-contained; o computador de destino não precisa ter runtime .NET 8 instalado. Compile LabSerialSetup.iss com Inno Setup 6 para gerar o instalador; o workflow CI compila GUI, publica ZIP portátil e instalador experimental.

## Segurança e limitações

O driver KMDF atual só fornece COM210 e COM211 como par fixo, portanto a interface não cria/remove devnodes nem altera PortName persistente. Não instala drivers, não altera a configuração BCD, não instala certificados, não modifica COM3/COM4 ou dispositivos de terceiros.

Windows 10/11 x64, PowerShell 5.1 e driver pré-instalado são exigidos. Apenas PC sobressalente, com backup e console físico de recuperação, para testes reais. Execute o aplicativo como Administrador para testes (a navegação pode ser feita como usuário comum).

Os testes do driver foram aprovados independentemente da GUI; a interface WinForms já foi aberta e os três fluxos de teste foram aprovados (Win32 6/6, .NET 4/4, perfil 2/2) no Windows físico, mas a fidelidade visual e o instalador ainda exigem revisão. NÃO HOMOLOGADO PARA PRODUÇÃO.

## Teste de integração GUI → driver em Windows físico (17/10/2026 06:06–06:07)

Com o LabSerial vinculado ao INF de teste `oem66.inf`, o usuário executou os botões da interface WinForms instalada. Inventário PnP identificou e validou o par COM210 ↔ COM211. Resultados exibidos diretamente no log da interface:

- **Testar Win32**: 6/6 quadros, 1154 bytes, A→B=3 e B→A=3, `PASS (exit 0)`.
- **Testar .NET**: 4/4 quadros via `System.IO.Ports.SerialPort`, 9600/115200 baud 8N1 sem handshake, `PASS (exit 0)`.
- **Testar Perfil**: 2/2 quadros via `System.IO.Ports.SerialPort`, 9600 baud 8N1 sem handshake, `PASS (exit 0)`.

**12/12 PASS, sem divergências relatadas.** Evidências JSON/TXT permaneceram na pasta local `Documentos\LabSerial-Evidencias` no host; ver detalhes e os caminhos completos em [STATUS_WINDOWS_FISICO.md](../physical/STATUS_WINDOWS_FISICO.md).

**Avaliação visual independente (usuário, screenshot real vs. mockup): 4,5/10**, sem conformidade com a hierarquia aprovada. Próxima versão deve restaurar toolbar com ícones, tabela full-width, propriedades em dois painéis A/B, opções de configuração e log clássico, sem inventar capacidades de criação dinâmica que o driver ainda não possui.


## Revisão de fidelidade v0.1.1 (17/10/2026)

Recriação **não reinterpretada** do [mockup claro original](DESIGN_FIDELITY_CLASSIC.md), após avaliação de 4,5/10 da v0.1.0. A nova interface contém tabela de pares em toda a largura, toolbar com ícones, propriedades Porta A/B em colunas paralelas, painel de configurações com opções suportadas/indisponíveis explícitas, log clássico branco com cores semânticas, status de rodapé, modal de adicionar par existente e marca vermelha. A integração com scripts reais foi preservada. A versão WinForms instalada anteriormente v0.1.0 passou 12/12 quadros; **a nova interface v0.1.1 ainda exige teste breve do operador**.

O runner Windows em GitHub Actions gera captura PNG de revisão visual no artefato junto com instalador e ZIP portátil. A captura em CI, que não possui driver, é somente validação de layout; o PnP e os botões de comunicação no host físico deverão ser revalidados após atualizar a GUI. A nota final de fidelidade ainda depende de nova captura do operador.

## Revisão responsiva v0.1.2

A versão 0.1.2 preserva o fluxo de testes Win32, .NET e perfil, altera **somente o gerenciador WinForms** e aprimora a fidelidade ao mockup clássico. A janela é limitada à área útil da tela (evita rodapé escondido pela barra de tarefas); ícones da barra são desenhados em GDI+ com geometria estável, indicadores de ativo são LEDs verdes no ListView selecionado, descrições de portas permitem duas linhas, e o rodapé é adaptativo. Em largura reduzida, o texto dos botões de testes é recolhido mas os botões continuam visíveis e acessíveis por tooltip; o Console permanece acessível. A única linha da tabela não produz barra de rolagem.

Smoke visual em Windows CI: janela normal e compacta **940×650**, com verificações automáticas de rodapé, controles de configurações e toolbar, sem acesso a portas e sem driver instalado no runner. A conformidade exata no PC físico depende da nova captura do usuário. O driver experimental instalado não é substituído pelo novo instalador de interface.
