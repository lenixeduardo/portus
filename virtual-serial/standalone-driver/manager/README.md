# LabSerial Setup — interface WinForms para COM210 ↔ COM211

App Windows x64 em C#/.NET 8 WinForms, reproduzindo o fluxo visual do com0com dentro do que o driver LabSerial experimental suporta. Nenhum código do com0com é reutilizado.

## Funcionalidades integradas

- **Inventário somente leitura**: valida dois dispositivos PnP, HardwareID, serviço LabSerial, PortName, SERIALCOMM, QueryDosDevice e estado PnP antes de habilitar qualquer teste.
- **Adicionar Par**: mostra na lista o par existente, quando ocultado. Não cria dispositivos PnP.
- **Remover Par**: oculta apenas da interface nesta sessão; não desinstala nem modifica o driver.
- **Propriedades e Aplicar**: lê a identidade do hardware e define um perfil de teste a 9600 ou 115200 baud (8N1, Handshake.None). Não grava configurações no kernel.
- **Testar Perfil**: abre ambos os endpoints com System.IO.Ports.SerialPort e troca dados ASCII A→B e binários B→A na velocidade escolhida; teste adicional ainda não validado no Windows físico.
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

Os testes do driver foram aprovados independentemente da GUI; a interface WinForms e o instalador ainda exigem validação visual e funcional no Windows físico. NÃO HOMOLOGADO PARA PRODUÇÃO.
