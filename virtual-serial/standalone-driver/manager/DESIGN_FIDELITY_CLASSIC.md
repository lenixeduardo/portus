# LabSerial Setup — fidelidade ao mockup clássico WinForms

## Referência aprovada
A referência original é o mockup claro **“Configuração LabSerial no Windows”**, inspirado na hierarquia nativa do com0com. Não é o mockup premium escuro com navegação por abas.

## Diagnóstico da versão instalada v0.1.0
Avaliação do operador: **4,5/10** de fidelidade visual. O driver e os botões Win32/.NET/perfil foram realmente testados em máquina Windows física e passaram **12/12 quadros**, mas a UI havia reinterpretado a referência (tabela comprimida, propriedades em bloco de texto, log escuro e toolbar sem ícones).

## Revisão visual aplicada à versão v0.1.1

| Elemento aprovado | Alteração implementada |
|---|---|
| Barra de menus clássica | Preserva Arquivo, Ação, Exibir, Ferramentas, Ajuda |
| Toolbar com ícones coloridos e divisórias | Adiciona ícones distintos e separadores, sem retirar ações reais existentes |
| Tabela de pares ocupando a largura | Grid com colunas **#, Porta A, Porta B, Status, Driver, Criado em** e seleção azul nativa |
| Propriedades Porta A/B paralelas | Dois formulários lado a lado: Número da Porta, Nome Amigável, Hardware ID, Descrição |
| Configuração do par | Exibe emulação null-modem fixa, configuração avançada com limites explícitos e opções não suportadas desabilitadas |
| Log de eventos clássico | Fundo branco e distinção de PASS/FAIL/INICIANDO por cor, mantendo relatórios JSON/TXT |
| Rodapé clássico | Contagem, estado de driver, par COM210/211 e link real ao Gerenciador de Dispositivos |
| Modal para adicionar par | Layout visual baseado na referência, mas sem fingir criação PnP: permite apenas reexibir o par COM210↔COM211 |
| Logo aplicativo | Marca A vermelha triangular desenhada localmente, sem assets de terceiros |
| Falha de inventário | Invalida snapshot anterior e bloqueia todos os testes (fail-closed) |

## Limitações não disfarçadas
- O KMDF experimental suporta apenas o **par fixo COM210 ↔ COM211**. Não há API para criar ou remover pares adicionais, renomear portas nem ativar opções avançadas de handshake.
- A coluna **“Criado em”** mostra “Não disponível” quando o driver não expõe essa informação; não inventar uma data.
- As propriedades A/B são somente leitura; “Aplicar” altera somente o perfil local de teste.
- As opções “Iniciar com o Windows” e “Criar portas automaticamente” estão desabilitadas; “Log de testes (local)” descreve apenas evidências do aplicativo, não telemetria de kernel.
- O instalador não reinstala drivers, não confia em certificados novos, não toca BCD nem modifica com0com COM3/COM4.

## Critério de aceite de fidelidade visual
A pipeline Windows compila WinForms e o instalador, faz smoke de inicialização **sem driver** e captura uma tela para revisão estrutural. Essa captura mostra o par “verificação pendente” no runner porque não há LabSerial instalado — **não é evidência de falha no host físico**.

A nota final de fidelidade ainda depende de captura da v0.1.1 aberta no Windows do operador, comparada ao mockup original. **Não atribuir 9,5/10 automaticamente por compilar ou fazer screenshot da CI.**

A integração funcional Win32 6/6, .NET 4/4 e perfil 2/2 foi comprovada **na versão anterior v0.1.0**. A revisão v0.1.1 preserva os invocadores e scripts, mas requer regressão curta no computador físico após atualização da interface.
