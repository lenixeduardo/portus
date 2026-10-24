# LabSerial — protocolo de teste em Windows físico

AVISO: EXCLUSIVAMENTE PARA UM PC x64 SOBRESSALENTE DE LABORATÓRIO. Não instalar no Windows principal, em máquinas de produção ou remotamente sem recuperação local garantida. Driver de kernel experimental pode causar BSOD.

## Arquivos do ZIP gerado pelo GitHub Actions

- labserial.sys, labserial.inf e labserial.cat: pacote KMDF x64 com assinatura de TESTE;
- labserial-test.cer: certificado público correspondente ao SYS (sem chave privada);
- checksums.json: hashes SHA-256 do pacote;
- Inspect-LabSerialHost.ps1: diagnóstico não destrutivo;
- Install-LabSerialTest.ps1: dry-run por padrão; modo Execute com confirmações;
- Test-LabSerialPorts.ps1: teste A↔B somente em portas comprovadamente LabSerial;
- Remove-LabSerialTest.ps1: rollback somente dos devnodes LabSerial;
- README-PHYSICAL-TEST.txt: estas instruções.

## Preparação obrigatória

1. Faça imagem de disco recuperável do computador sobressalente, teste a mídia de recuperação e disponha da chave do BitLocker.
2. Confirme acesso ao teclado/console físico, administrador, Windows x64 AMD64 e nenhum equipamento real nas portas COM210/COM211.
3. Extraia o artefato Release x64 assinado para TESTE. Jamais use um ZIP de procedência desconhecida.
4. Execute PowerShell elevado no diretório do pacote. Faça primeiro a inspeção: .\Inspect-LabSerialHost.ps1.
5. Esse diagnóstico bloqueia em caso de Secure Boot/BitLocker ativos, assinatura de teste não confirmada, certificado não confiável, conflito de dispositivos ou SHA inválido.
6. O pacote NÃO altera BCD, Secure Boot, BitLocker nem certificados automaticamente. Apenas o responsável pelo PC descartável pode decidir habilitar modo de teste e instalar o certificado público.
7. Verifique manualmente o thumbprint do certificado: o certificado .cer precisa corresponder ao signatário do arquivo .sys. Depois disso, exclusivamente no computador de laboratório, o administrador pode importar o certificado público nas lojas LocalMachine\Root e LocalMachine\TrustedPublisher. Não importa a chave privada.
8. Instale o Windows Driver Kit nesse PC para utilizar DevGen. A Microsoft proíbe redistribuir DevGen; por isso ele NÃO acompanha o pacote.

## Instalação SOMENTE após preflight aprovado

Execute o script Install-LabSerialTest.ps1 com -Execute, -DevGenPath <caminho-local-do-WDK\devgen.exe>, -ConfirmDedicatedNonProductionPC e -ConfirmRecoveryAndConsoleAccess.
O script pedirá confirmação; criará os devnodes ROOT\LABSERIAL_VCOM_A e ROOT\LABSERIAL_VCOM_B e chamará pnputil para instalar o INF. Se falhar, pare e analise C:\Windows\INF\setupapi.dev.log.

## Teste de portas

Verifique Get-PnpDevice -Class Ports e [System.IO.Ports.SerialPort]::GetPortNames().
Rode Test-LabSerialPorts.ps1 -ConfirmDedicatedNonProductionPC -ConfirmPortsAreLabSerial.
Ele exige PnP e SERIALCOMM de LabSerial antes de abrir COM210/COM211; envia um token nos dois sentidos e exige igualdade de bytes. Um PASS não prova estabilidade, cancelamento ou segurança de kernel.

## Remoção

Rode Remove-LabSerialTest.ps1 para prévia. Apenas após conferir os IDs corretos, rode Remove-LabSerialTest.ps1 -Execute -ConfirmDedicatedNonProductionPC.
O script não remove drivers de terceiros, não altera BCD nem certificados. A reversão de alterações manuais de modo de teste e certificados requer inspeção e confirmação do administrador; se ocorrer falha de boot, use a imagem de recuperação.

## Faltam para distribuição

- Instalar e carregar o SYS num Windows dedicado;
- Confirmar ambos os endpoints COM, testar A↔B, reboot, remoção e Driver Verifier;
- Validar IOCTLs, timeouts e cancelamento com SerialTool/serialport;
- Obter assinatura adequada da Microsoft para distribuição. A atual é apenas de TESTE.

Referências: https://learn.microsoft.com/en-us/windows-hardware/drivers/install/test-signing
https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/devgen-command-syntax
https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/infverif
