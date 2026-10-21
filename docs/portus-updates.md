# Atualizações de arquivos do PORTUS

O app consulta `/releases/latest` ao abrir e novamente a cada minuto ou ao voltar a conexão. Ele oferece somente versões estáveis superiores à instalada com um asset `PORTUS-Update-<versão>-x64.zip` e digest SHA256 válido publicado pelo GitHub. O instalador NSIS permanece disponível para a primeira instalação e para versões antigas que ainda só entendem instaladores; não é executado pelo novo atualizador.

**Baixar atualização** transfere o ZIP para uma pasta de sessão em `userData/updates`, sem navegador nem Downloads. O download por stream informa progresso, confere tamanho e SHA256 e descarta parciais e respostas inválidas.

**Aplicar e reiniciar** inicia um auxiliar PowerShell copiado para fora da instalação. Antes de fechar o PORTUS, o auxiliar verifica o arquivo baixado, extrai em staging, valida caminhos e todos os hashes do manifesto e verifica permissão de escrita. Quando necessário, pede elevação pelo Windows. Se essa preparação falhar ou for cancelada, o PORTUS permanece aberto. Captura serial ativa impede a atualização.

Após o PORTUS encerrar, o auxiliar compara hashes, copia apenas os arquivos alterados e remove arquivos obsoletos que estavam no manifesto anterior. Arquivos locais não listados no manifesto são preservados. Configurações, logs e dados do usuário permanecem em userData. O pacote contém o conjunto completo de arquivos da aplicação (incluindo runtime Electron e recursos), por isso também permite atualizar dependências nativas; o download não é um delta binário.

Cada arquivo substituído ou removido tem cópia de segurança. Falha na aplicação restaura as alterações e tenta reabrir a versão anterior. Sucesso registra a versão aplicada e abre o executável no mesmo caminho. `apply.log`, `completed` ou `failed` ficam na pasta da sessão para diagnóstico. A preparação tem limite de tempo; um pedido cancelado não aplica arquivos quando o usuário fechar o app mais tarde.

O build gera ZIP e manifesto a partir do mesmo `win-unpacked` validado. A Release fica em draft durante o upload do instalador e ZIP. PRs geram artifacts e não publicam versões. A publicação valida presença e SHA256 do asset ZIP.

## Compatibilidade

A 0.1.36 e anteriores já publicadas ainda executam o instalador no fluxo de atualização. Elas precisam receber uma vez a versão com este mecanismo. A partir dessa versão, as próximas atualizações usam somente pacotes de arquivos.

Migrations PostgreSQL continuam sendo aplicadas pelo DB Utility com credencial administrativa. Atualizar arquivos não altera automaticamente o banco central.

## Validação

Testes unitários cobrem seleção da Release, integridade, parciais, repetição após falha de rede e bloqueios durante captura. O build Windows executa `tests/windows/file-update.mjs` sobre o aplicativo real empacotado: uma versão alvo com marcador console/log é preparada em ZIP, o transporte da Release ainda não publicada é interceptado, e download, aplicação, reinício e reabertura ocorrem de verdade. O teste confirma versão nova, execução do marcador e preservação do executável não alterado e de arquivos/configurações locais. Evidências ficam no artifact `portus-file-update-<run_id>`.
