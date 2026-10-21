# Atualizações do PORTUS

A versão mínima desta mudança é 0.1.35. Cada build aprovado da `main` calcula uma versão superior à última Release publicada (ou usa a mínima do package.json se ela for maior). O build usa essa mesma versão no package.json, package-lock.json, tela de login, executável e nome do instalador. Empacotar localmente não incrementa mais a versão silenciosamente.

O workflow Windows é serializado na main. Após testes, build e smoke test do DB Utility, o instalador validado é enviado como artifact, e o job reutilizável de publicação envia **esse mesmo arquivo** para uma Release. A Release só deixa de ser draft depois do upload. O job confirma que `/releases/latest` contém a tag e o instalador esperado. PRs geram artifacts para homologação e nunca publicam no canal de atualização. Uma execução manual do workflow Build instalável na main também permite publicar uma versão validada. Erros de autenticação/rede ao consultar a versão publicada interrompem o build, evitando reutilizar uma versão por engano.

O app instalado consulta a Release ao abrir, repete a consulta a cada minuto enquanto não encontrar atualização e tenta novamente quando a conexão volta. As falhas ficam nos logs. Uma vez oferecida, a mesma atualização não fica reaparecendo ao dispensar o aviso nessa sessão.

O botão **Baixar atualização** baixa pelo processo principal do Electron para a pasta Downloads. O modal mostra o progresso. Arquivos incompletos e respostas que não sejam executáveis Windows são descartados; a interface nunca fornece URL ou caminho de executável ao processo principal.

Após concluir o download, **Instalar e reiniciar** inicia o instalador NSIS com `/S --updated --force-run /D=<pasta atual do executável>`. O argumento `/D` fica por último, sem aspas internas, conforme o contrato do NSIS para caminhos com espaços. A instalação é bloqueada durante captura ativa. Se não for possível iniciar o instalador, o PORTUS permanece aberto e informa o erro. A atualização usa a instalação atual e preserva os dados de usuário pelo modo `--updated`; o Windows pode pedir elevação conforme a instalação existente.

## Primeira atualização

Instalações antigas ainda abrem o navegador ao clicar em Baixar e não recebem código novo antes de instalá-lo. Após o merge e publicação da primeira Release, essas instalações precisam instalar essa versão uma vez pelo fluxo antigo/download manual. Nas versões corrigidas, o fluxo passa a ocorrer dentro do PORTUS.

As migrations do PostgreSQL central continuam sendo aplicadas pelo DB Utility com a credencial administrativa; a atualização do aplicativo não executa migrations no banco do cliente automaticamente.

## Homologação Windows

1. Instalar uma versão anterior numa pasta personalizada com espaços.
2. Abrir com e sem conexão; ao reconectar, confirmar a oferta da versão publicada.
3. Baixar no modal e conferir progresso/arquivo final, sem abertura de navegador.
4. Iniciar uma captura e conferir que Instalar e reiniciar é bloqueado.
5. Concluir a captura, confirmar instalação, aceitar elevação quando solicitada e conferir reinício, versão exibida e manutenção da pasta/configurações.

Os testes automatizados cobrem consulta, download por stream, limpeza de parciais, falha ao iniciar instalador e argumentos de instalação. O teste do instalador real deve ocorrer em Windows; os mocks de processo não substituem essa homologação.
