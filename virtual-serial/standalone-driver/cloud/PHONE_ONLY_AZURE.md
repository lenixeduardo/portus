# LabSerial — testes Windows 100% remotos, usando apenas celular

**Estado:** procedimento pronto; **nenhuma VM Azure foi provisionada** (é necessária uma assinatura Azure com autorização explícita de cobrança). O repositório contém build WDK x64 validado, mas não teste de carregamento real do driver.

## Por que a Azure?

É possível criar uma VM Windows da Azure pelo portal na nuvem, sem depender do computador pessoal. O recurso **Executar comando (Run Command / RunPowerShellScript)** executa PowerShell dentro da VM pelo agente Azure, inclusive sem RDP. Para inspeção gráfica, existe o Azure Bastion Developer, sem custo adicional de acesso na região Brazil South, mas **o cliente web móvel/iPhone não possui garantia de compatibilidade oficial**. Usar o cliente Windows App no iPhone com acesso RDP protegido/VPN é uma alternativa, não expor a porta 3389 abertamente.

## Perfil inicial sugerido

- Nome: `labserial-win-test`.
- Grupo de recursos: `rg-labserial-test`.
- Região: `Brazil South` (sujeita à capacidade e cotas da conta).
- Sistema: **Windows Server 2022 Datacenter** para primeiro teste do driver; Windows 11 Enterprise deve ser testado depois com assinatura/licenciamento elegíveis.
- CPU/RAM: 2 vCPU e pelo menos 8 GiB RAM (por exemplo tamanho B2ms, se disponível).
- Disco: SSD gerenciado de 64–128 GiB (conforme imagem/requisitos).
- Rede: VNet/subnet privadas e **sem IP público na VM**; Bastion Developer para acesso administrativo, quando compatível.
- Segurança: iniciar com as proteções padrão e somente alterar o **Secure Boot da VM isolada** quando necessário para testar drivers com assinatura de teste, com recuperação/snapshot prontos. **Nunca** executar mudanças de BCD no computador pessoal.

## Passo a passo no celular

1. Abrir [portal.azure.com](https://portal.azure.com) e autenticar-se com uma assinatura autorizada.
2. Em **Máquinas virtuais → Criar**, escolher Windows Server 2022, região Brazil South, nome `labserial-win-test`, usuário administrador e senha forte que nunca será publicada no GitHub ou chat.
3. Criar com rede privada (sem IP público). Inspecionar os custos antes da confirmação e configurar orçamento/alerta de gastos. VM é cobrada mesmo sem RDP enquanto provisionada e ativa.
4. Na VM, em **Operações → Executar comando → RunPowerShellScript**, executar primeiro:
   ```powershell
   Get-ComputerInfo | Select-Object WindowsProductName,WindowsVersion,OsArchitecture
   [System.IO.Ports.SerialPort]::GetPortNames()
   Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue | Select-Object Status,FriendlyName,InstanceId
   ```
   Esse comando é somente leitura; se a saída aparecer, já há administração remota sem computador.
5. Criar ponto de recuperação de disco/VM conforme a opção de Azure disponível **antes** de instalar o driver experimental.
6. Só então planejar carregamento do `labserial.sys` do CI, com pacote INF/CAT de teste e autorização para modo de teste **apenas no guest**. O Secure Boot/Trusted Launch da VM pode impedir test-signing. É preciso avaliar configuração permitida pela assinatura/cloud e **não desabilitar segurança em sistemas de produção**.
7. Após o driver estar devidamente instalado, usar Run Command para validar PnP, duas portas COM, o script autônomo `LabSerial.ps1` e os logs. Abrir sessão gráfica com Bastion apenas quando necessário para SerialTool.
8. Exportar os relatórios, desligar/desalocar a VM ao terminar e remover o grupo de recursos quando não precisar mais — discos, backups ou IPs reservados podem continuar cobrando se deixados ativos.

## Critérios de aprovação

- [ ] VM na Azure criada em assinatura autorizada com cobrança/limites conhecidos.
- [ ] Run Command executado com sucesso sem computador do usuário.
- [ ] Driver de teste instalado no Windows convidado sem alterar o host.
- [ ] Instâncias LabSerial A/B reconhecidas como COMs (nomes podem diferir).
- [ ] Teste `LabSerial.ps1 -Action test` validado A↔B.
- [ ] Testes de abertura/leitura/escrita com software terceiro e SerialTool.
- [ ] Reiniciar a VM, repetir os testes e validar recuperação/remoção.
- [ ] Logs armazenados e resultado documentado.

## Restrições importantes

- GitHub Actions runner Windows **compilou** o driver, mas isso não equivale a instalar/testar kernel. Não tratar o artefato de CI como release confiável.
- **Azure Bastion Developer** é gratuito onde oferecido, não a VM; suporte ao portal/HTML5 no navegador de **iPhone** não é oficialmente garantido. Para executar scripts, preferir **Run Command**, que não exige RDP.
- Windows 11 na Azure tem requisitos específicos de licenciamento/assinatura para dev/test. Validar elegibilidade antes de selecionar imagem cliente.
- Acesso à conta, assinatura e operação de provisionamento dependem do titular; esta conversa não dispõe de conexão de gerenciamento de VMs na Azure.

## Referências Microsoft

- Criar VM Windows: https://learn.microsoft.com/en-us/azure/virtual-machines/windows/quick-create-portal
- Run Command: https://learn.microsoft.com/pt-br/azure/virtual-machines/windows/run-command
- Bastion Developer: https://learn.microsoft.com/en-us/azure/bastion/quickstart-developer
- Bastion FAQs/browsers: https://learn.microsoft.com/en-us/azure/bastion/bastion-faq
- Trusted Launch e Secure Boot: https://learn.microsoft.com/en-us/azure/virtual-machines/trusted-launch
- Windows 11 licenciamento dev/test: https://learn.microsoft.com/en-us/azure/virtual-machines/windows/client-images
