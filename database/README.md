## Configuracao obrigatoria na primeira abertura do aplicativo

Na primeira abertura do PORTUS em uma maquina Windows, o login permanece
bloqueado ate concluir o assistente. O usuario deve selecionar explicitamente
o papel do computador: **Servidor central** ou **Estacao cliente**.
A presenca de ferramentas PostgreSQL nao determina automaticamente esse papel.

- **Servidor central**: precisa de PostgreSQL instalado, com servico iniciado e
  ferramentas administrativas validas. O assistente instala/atualiza o esquema
  PORTUS e valida a conexao antes de concluir. Acesso de outras estacoes exige
  PostgreSQL escutando no endereco LAN, regra restrita no `pg_hba.conf` e
  liberacao da porta apenas para IPs autorizados no firewall Windows. Evite
  regras globais abertas e nunca apague uma pasta `data` existente.
- **Producao e Laboratorio**: precisam apenas do aplicativo PORTUS. No assistente,
  escolha **Estacao cliente**, informe o IP e porta do servidor, usuario e senha
  do banco de aplicacao, e selecione o setor fisico desta maquina. Nao ha
  instalacao de PostgreSQL, criacao de banco ou migracoes nas estacoes clientes.
- Se o servidor estiver indisponivel, houver credenciais invalidas ou o schema
  estiver incompleto, o assistente nao conclui e o login permanece bloqueado.
- A conclusao e registrada por perfil Windows em
  `%LOCALAPPDATA%\\PORTUS\\installation-state.json`, **sem senhas**.
  Uma configuracao anterior de `PORTUS_DATABASE_URL` nao equivale a completar
  o assistente em uma nova instalacao.

## Diagnostico PostgreSQL do Database Utility

O Database Utility executa uma deteccao **somente leitura** ao abrir e possui
o botao **Detectar PostgreSQL** para repetir o diagnostico sem senha.
Ele procura instalacoes em `Program Files`, no Registro e nos servicos
Windows, validando a integridade basica do `psql.exe`. Exibe orientacoes
se o servidor local estiver ativo, parado, se existirem somente as
ferramentas cliente ou se nao houver instalacao detectada.

Se a maquina for cliente, a ausencia de PostgreSQL local **nao e erro**.
Informe o IP da maquina servidora e use **Verificar IP / rede**. Para validar
o schema, informe as credenciais e use **Validar banco de dados**. A deteccao
de um servico ativo nao confirma, por si so, a existencia do banco PORTUS.
O utilitario nao baixa, instala ou altera automaticamente o PostgreSQL.

## Estação sem setor configurado: falha ao iniciar captura

Se a captura mostrar `Defina o setor desta máquina em Configurações antes da captura`,
a estação ainda não possui `station_sector_code` válido registrado no PostgreSQL.

Entre com usuário **Master** ou **Admin** **na máquina que vai capturar** e siga:

1. Abra **Configurações > Captura**.
2. Confira o **Código da estação**, que identifica fisicamente esta máquina.
3. Escolha **Produção** ou **Laboratório** em **Setor desta máquina**.
4. Clique **Salvar setor desta máquina** e aguarde a confirmação no PostgreSQL.
5. Retorne ao lote e inicie a captura com usuário do mesmo setor.

Repita o procedimento em cada computador físico. A configuração é centralizada
por `station_code` em `portus_station_settings`, mas nunca é copiada
automaticamente de outra estação ou da sessão de usuário. Se o setor do
usuário for diferente do setor físico configurado, a captura permanecerá
bloqueada para preservar a rastreabilidade.

Não é necessário reinstalar o PostgreSQL nem executar migrations para
definir o setor quando a migration 014 já tiver sido aplicada.

# PostgreSQL central do PORTUS

Esta pasta contém a fundação do banco central definida no
`PORTUS_SPEC_TECNICO(1).md`.

## Botao Migrar dados (SQLite antigo para PostgreSQL central)

O comando **Aplicar migrations** atualiza somente o schema do banco. O novo
botao **Migrar dados** importa o conteudo historico de uma instalacao SQLite
para a base PostgreSQL central usando o importador existente
`scripts/import-legacy-to-postgres.mjs`.

No Database Utility, configure servidor, porta, banco, administrador e senha
do PostgreSQL. Clique em **Migrar dados**, selecione o arquivo SQLite antigo,
informe o codigo da estacao (o mesmo codigo do runtime PORTUS) e escolha
**Producao** ou **Laboratorio**. Confirme o destino antes de continuar.

Protecoes obrigatorias:

- Copia do SQLite original com sufixo `.pre-postgres.bak`, sem remover a origem.
- Backup do PostgreSQL via `pg_dump.exe` em formato custom `.pre-import.dump`.
- Falha de backup cancela a importacao antes de gravar no PostgreSQL.
- Importacao transacional e historico de registros por estacao no
  `portus_legacy_import_ledger`, evitando duplicacoes e conflitos de ID.
- Reconciliacao por tipo de dado (usuarios, produtos, equipamentos, lotes,
  sessoes, leituras, auditoria, erros de captura).
- Falhas de integridade executam `ROLLBACK`. O codigo de estacao nao pode
  divergir do arquivo `station-identity.json` da maquina.
- Somente apos confirmar a importacao em cada estacao voce deve atualizar
  ou desinstalar a versao que utilizava SQLite.

O pacote Windows inclui o importador, Node.js e as dependencias `pg` /
`sql.js` offline. O projeto aberto usa o Node.js e as dependencias de `npm ci`.
A pasta `database/migration-runtime` e preparada na etapa de empacotamento
e nao deve ser adicionada ao Git.

**Importante:** O botao executa a migracao somente no computador onde o
SQLite e selecionado e o PostgreSQL e acessivel. Nao procura automaticamente
bases SQLite de outras estacoes nem migra dados sem confirmacao do operador.

## Logs e falhas dentro do painel do Database Utility

O painel **Log** do Database Utility e a origem das mensagens. O runner
`database/portus-db-utility-runner.ps1` executa validacao, migrations e rede
com saida UTF-8 (`Console.OutputEncoding`, `PGCLIENTENCODING=UTF8`) para
impedir que acentos de mensagens do PostgreSQL aparecam corrompidos.

O runner grava um arquivo temporario de resultado JSON somente apos concluir
a operacao. A GUI usa esse resultado confirmado e nao interpreta um
`ExitCode` nulo do `Start-Process` como falha da migration. Os arquivos
temporarios sao apagados no fim.

- `Resultado confirmado: migrate, codigo de saida 0.` indica sucesso.
- Codigo diferente de zero exibe detalhes da falha no proprio log.
- `NOTA: relacao ja existe, ignorando` e informativo, nao um erro.
- Sem resultado confirmado, a GUI informa a impossibilidade de confirmar
  a conclusao, sem declarar sucesso automaticamente.

Para atualizar a pasta database local, execute:

~~~powershell
git switch main
git pull --ff-only origin main
.\database\portus-db-utility.bat
~~~

## Cliente PostgreSQL: psql.exe com 0 KB ou invalido

Se a maquina mostrar `psql.exe` com 0 KB, o arquivo esta vazio e nao executara.
O PORTUS agora verifica tamanho, assinatura de executavel Windows e
`psql.exe --version` antes de validar banco, aplicar migrations ou cadastrar admin.
Quando o teste falha, o caminho e a causa aparecem no painel de logs.

Em PowerShell na maquina afetada:

~~~powershell
Get-ChildItem 'C:\Program Files\PostgreSQL' -Filter psql.exe -Recurse -ErrorAction SilentlyContinue |
  Select-Object FullName,Length
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' --version
~~~

Se houver outro `psql.exe` valido, selecione a pasta `bin` correspondente
no utilitario. Caso contrario, repare/reinstale o cliente PostgreSQL oficial
compatível com o computador. Nunca exclua a pasta de dados do servidor
nem recrie o banco PORTUS para solucionar este erro do executavel.

## Diagnostico: operacao conclui com sucesso, mas GUI mostra "Falha (codigo )"

Este problema indicava que o Windows PowerShell 5.1 estava retornando
um `ExitCode` nulo do processo filho para o WinForms. A interface
anterior interpretava `null` como erro, mesmo apos a validacao do banco
imprimir "Banco de dados validado com sucesso".

O utilitario agora aguarda `WaitForExit()` do processo Windows antes de ler
seu codigo de saida; `0` significa sucesso e outros codigos indicam falha.
Se nao conseguir ler o codigo, imprime o detalhe tecnico em vermelho,
em vez de exibir `Falha (codigo )`.

O **mesmo stdout e stderr** usado no log do aplicativo tambem e impresso
no PowerShell de origem (prefixos `[PORTUS][HH:mm:ss][stdout]` e
`[PORTUS][HH:mm:ss][stderr]`). Em caso de erro, copie as mensagens
daquele terminal para diagnostico, **removendo previamente segredos e
URLs de conexao que possam conter credenciais**.

~~~powershell
git switch main
git pull --ff-only origin main
.\\database\\portus-db-utility.bat
~~~

Executar Validar banco de dados ou Verificar IP/rede nao altera dados.
Para confirmar a resolucao de codigos sem usar PostgreSQL, os testes
Windows reproduzem subprocessos que terminam com exit codes 0 e 17.

## Utilitario visual de administracao (Windows)

## Interface visual PORTUS Database Utility

A identidade visual v1 esta especificada em [PORTUS-UTILITY-UI-SPEC.md](PORTUS-UTILITY-UI-SPEC.md).
Os quatro icones avulsos de acoes ficam em `assets/actions/` (PNG 24 px e
SVG vetorial). A interface utiliza o emblema azul aprovado em
`assets/portus-blue-logo.png`, inclusive no icone nativo da janela.

**Tipografia obrigatoria:** Sora para titulos e Inter para campos, botoes,
status e logs, com tamanhos em pixels. O operador pode provisionar as fontes
OFL da distribuicao oficial Google Fonts em sua pasta local, sem instalar no
Windows globalmente:

~~~powershell
.\\database\\install-portus-ui-fonts.ps1
~~~

Reinicie o utilitario depois da instalacao. Se uma fonte estiver ausente,
um alerta e exibido no log, status e terminal; nao ocorre substituicao
silenciosa. Para confirmar o carregamento da fonte e da interface com
`-StrictFonts` sem acessar o PostgreSQL:

~~~powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\\database\\portus-db-utility.ps1 -SmokeTest -StrictFonts
~~~


O utilitario passou a usar o visual claro do mockup PORTUS: logotipo
**original** de `build/icon.png`, cabecalho de marca, painel de conexao,
quatro acoes com destaque azul para migrations, status e log colorido.
A interface usa rolagem quando a resolucao da estacao e menor ou quando
o Windows tem escala ampliada. O utilitario continua em WinForms/PowerShell
5.1, sem WebView ou dependencias de frontend.

Na pasta do repositorio o logotipo e lido de `build/icon.png`.
No instalador ZIP independente, o empacotador inclui uma copia identica
em `database/portus-logo.png`. Sem imagem disponivel, a interface continua
funcional com o nome PORTUS visivel. O utilitario inclui seletor da pasta
`bin` do PostgreSQL, visualizacao temporaria da senha e botao
**Limpar log**; essas funcoes nao modificam o PostgreSQL.


Se o PowerShell ficar ocupado mas a janela nao aparecer, tente **Alt+Tab**.
A interface atualizada abre em primeiro plano e exibe mensagens de inicializacao
ou erros no terminal. Um comando de diagnostico verifica a abertura REAL do
formulario, sem se conectar ao PostgreSQL e sem alterar dados:

~~~powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\\database\\portus-db-utility.ps1 -SmokeTest
~~~

O resultado esperado do teste e `PORTUS_DB_UTILITY_SMOKE_OK`.
Se falhar, o erro sera impresso no terminal; nao e preciso aplicar migrations
para testar a interface.

Para abrir sem digitar comandos, execute com duplo clique:

~~~text
database\portus-db-utility.bat
~~~

O aplicativo independente inclui **Validar banco de dados**,
**Aplicar migrations**, **Verificar IP / rede** e o registro explicito
**Registrar IP inicial**.

Na **primeira instalacao**, quando o PORTUS grava a conexao PostgreSQL com
um endereco IPv4, o IP do servidor, porta e nome do banco sao registrados
em `%LOCALAPPDATA%\\PORTUS\\server-endpoint.json` (sem senha).
A referencia inicial nao e sobrescrita automaticamente quando a URL muda.
O instalador PostgreSQL tambem registra a referencia apos configuracao
bem-sucedida.

Para estacoes antigas sem esse registro, confirme que o campo **Servidor**
corresponde ao IP da maquina servidor configurado originalmente e clique
em **Registrar IP inicial**. O registro exige confirmacao, URL de conexao
coincidente e porta TCP acessivel; nao substitui referencia preexistente.

Ao clicar em **Verificar IP / rede**, o utilitario:
- verifica o IP IPv4 do servidor esperado e compara com a referencia da
  primeira instalacao;
- consulta o destino configurado no PORTUS (`PORTUS_DATABASE_URL`,
  arquivo `database-config.json` ou Registro Windows);
- mostra os IPv4 e gateway ativos da estacao e testa conexao TCP na
  porta configurada, normalmente 5432;
- diferencia endereco divergente, ausencia de cadastro e falha de rede,
  sem alterar IP estatico, DHCP, DNS, firewall ou arquivo de configuracao.

**O IP da estacao nao precisa estar na mesma sub-rede do servidor**, desde
que exista rota valida ate ele. O teste TCP e mais confiavel do que
depender apenas de ping. A verificacao funciona tambem na maquina servidor,
onde o IP esperado pode ser o proprio IPv4 local.

O aplicativo independente tem ainda os dois botoes originais:

- **Validar banco de dados:** acao somente leitura. Testa a conexao ao
  PostgreSQL indicado, compara `portus_schema_migrations` com os arquivos SQL
  da pasta `migrations` e valida tabelas, funcoes e colunas usadas no login
  (incluindo `users.sector_code`). Mostra erros e migrations pendentes.
- **Aplicar migrations:** solicita confirmacao explicita, usa
  `install-portus-database.ps1 -MigrationsOnly -SkipAppConfiguration` e exibe
  progresso e eventuais falhas sem recriar o banco.

O formulario solicita host/IP do servidor, porta, banco, administrador do PostgreSQL,
caminho da pasta `bin` e senha. A senha nao e salva em arquivo nem aparece
nos parametros da linha de comando. A conexao configurada no PORTUS nao e
alterada por esse utilitario. Os scripts precisam estar na mesma pasta
`database`, junto de `migrations`. A janela funciona em Windows com
PowerShell 5.1 e PostgreSQL/`psql.exe` instalados.

A geracao do pacote `npm run package:database-installer` inclui esses arquivos
no ZIP. Nao use a opcao Aplicar migrations em banco de producao sem conferir
host, nome do banco, migracoes pendentes e backup. O utilitario nao ativa
automaticamente `admin/admin`; a conta fraca permanece disponivel apenas
pelo comando de desenvolvimento explicitamente autorizado.

## Erro ao fazer login: coluna "sector_code" não existe

A versão PostgreSQL-only do aplicativo lê a coluna `users.sector_code` criada
pela migration `013_central_catalog_user_metadata.sql`. O servidor do banco
**deve ser atualizado antes de iniciar as estações**. O merge do código
não executa automaticamente migrations num PostgreSQL já instalado.

No computador onde o PostgreSQL configurado no PORTUS está rodando, use os
scripts **atualizados** do repositório:

```powershell
# Ajustar host, porta, banco e versão PostgreSQL conforme a instalação real.
.\database\install-portus-database.ps1 -MigrationsOnly `
  -DatabaseHost "127.0.0.1" -Port 5432 -DatabaseName "portus" `
  -PostgresBin "C:\Program Files\PostgreSQL\18\bin"
```

O comando solicita a senha administrativa do PostgreSQL. Não execute a
instalação completa (sem `-MigrationsOnly`) para corrigir apenas o schema:
ela também altera credenciais/configuração de conexão e não é necessária.

Verifique no **mesmo banco apontado por `PORTUS_DATABASE_URL`**:

```sql
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();

SELECT name, applied_at
FROM portus_schema_migrations
WHERE name IN (
  '012_unified_batch_traceability.sql',
  '013_central_catalog_user_metadata.sql',
  '014_station_profiles_audit_ledger.sql'
)
ORDER BY name;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
  AND column_name IN ('sector_code', 'laboratory_profile', 'barcode_value')
ORDER BY column_name;
```

As três colunas e as migrations 012, 013 e 014 devem estar presentes.
Se a migration 013 constar como aplicada mas uma de suas colunas estiver
ausente, **não** altere manualmente o histórico de migrations e **não** apague
o banco. Isso indica inconsistência física que exige inspeção e reparo
controlado. Se a coluna não aparecer apenas no aplicativo, confira o host,
porta e nome do banco na configuração da estação; a prioridade é variável
`PORTUS_DATABASE_URL`, depois o arquivo
`%LOCALAPPDATA%\PORTUS\database-config.json`, depois o Registro Windows.
Nunca compartilhe a senha que aparece na URL completa.

Após aplicar e validar, reinicie o PORTUS. Como a migration 013 é
transacional e usa `ADD COLUMN IF NOT EXISTS`, sua aplicação normal mantém
os usuários, produtos, lotes, sessões e leituras existentes.

## Ordem de aplicação

## Login Master no PostgreSQL local para desenvolvimento

O login do PORTUS pertence à tabela `public.users` no PostgreSQL,
não é a conta/role `postgres` do servidor. Para preparar um banco local
isolado **com usuário `admin` e senha `admin`**, execute no PowerShell,
a partir da raiz do projeto:

~~~powershell
.\database\install-portus-database.ps1 -MigrationsOnly -SeedDevAdmin
~~~

Este comando instala migrations pendentes, inicializa os setores e cria o
usuário `admin`, com perfil `master` e permissões iniciais de Produção e
Laboratório. A senha fica armazenada como hash bcrypt; o script é idempotente
e **não substitui** credenciais de um usuário `admin` já existente.

Se uma instalação local **já possui `admin` Master e você deseja
explicitamente redefinir sua senha** para `admin`, use:

~~~powershell
.\database\install-portus-database.ps1 -MigrationsOnly -SeedDevAdmin -ResetDevAdminPassword
~~~

No utilitário gráfico, o botão **Inserir admin** agora faz essa redefinição
de forma **explícita**, após uma confirmação que informa que a senha atual de
um Master ativo será substituída por `admin`. A ação cria a conta somente
se estiver ausente e nunca contorna a verificação bcrypt do login. A execução
se limita à conexão PostgreSQL local de desenvolvimento. Se o usuário `admin`
estiver inativo ou tiver outro perfil, o banco rejeita a redefinição.

A mensagem `INSERT 0 0` no seed indica que a conta já existia e, sem
`-ResetDevAdminPassword`, a senha antiga foi mantida. Em caso de várias
tentativas incorretas, o bloqueio temporário do login pode durar 15 minutos;
reinicie o aplicativo de desenvolvimento ou aguarde o prazo. Certifique-se
também de que o PORTUS e o utilitário apontem para o mesmo banco.

As opções de teste aceitam somente `localhost`, `127.0.0.1` ou `::1` como
host do banco. Isso não é uma garantia de que o banco não esteja exposto:
**jamais execute esses comandos contra um banco de produção ou acessível
por operadores/clientes**. A instalação normal e o assistente gráfico
continuam usando senha Master inicial aleatória/forte; nunca habilitam
`admin/admin` automaticamente.

Depois do seed, verifique sem revelar o hash:

~~~sql
SELECT username, role, sector_code, active
FROM public.users
WHERE lower(username) = 'admin';
~~~

A conexão `PORTUS_DATABASE_URL` do aplicativo deve apontar para o mesmo
banco. Se `admin` já existir com um perfil diferente de Master, o reset
será recusado para evitar mudança silenciosa de permissões.

## Instalação no Windows (máquina nova)

O instalador do aplicativo não instala o PostgreSQL. Após instalar o PostgreSQL
18 e manter o serviço em execução, na raiz do projeto execute:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\database\install-portus-database.ps1
```

Ou dê duplo clique em `database\install-portus-database.bat`. O script pede a
senha do `postgres` e cria/atualiza de forma idempotente o banco `portus` e o
usuário operacional `portus_admin`. Ao fim, ele executa as migrations, o seed
e os testes SQL 001/002. A URL de conexão, que contém a credencial, é salva no
ambiente do usuário atual e em `%LOCALAPPDATA%\PORTUS\database-config.json`
para que o executável instalado consiga conectar ao PostgreSQL sem abrir um
terminal. Se o banco já existe e o PORTUS mostra **Não configurado**, execute
`database\check-portus-database.bat`; a validação bem-sucedida também repara
esse arquivo. Para instalação sem
testes, use `-SkipTests`; para não persistir essa configuração, use
`-SkipAppConfiguration`.

### Gerar o ZIP autocontido

Para entregar somente o instalador do banco, sem o restante do código do
PORTUS, execute:

```bash
npm run package:database-installer
```

O arquivo gerado em `release/portus-database-installer.zip` inclui o instalador
principal, diagnóstico, atualização de migrations, schema real, seed e testes.
No Windows, o ponto de entrada é `database\install-portus-database.bat`.

Para uma instalação com PostgreSQL em outro caminho, por exemplo versão 17:

```powershell
.\database\install-portus-database.ps1 -PostgresBin "C:\Program Files\PostgreSQL\17\bin"
```

## Atualizar um servidor existente: erro `coluna b.completed não existe`

A versão com lote único e conclusão supervisionada depende da migration
`012_unified_batch_traceability.sql`. Atualizar apenas o executável da estação
**não atualiza o PostgreSQL do servidor**. Se a lista de lotes falhar com
`b.completed`, faça a atualização **somente no computador servidor**, usando
o pacote mais recente (com a migration 012 corrigida).

Abra PowerShell no diretório do projeto ou na pasta `database` extraída do
pacote de instalação e execute, a partir da raiz do projeto:

```powershell
.\database\install-portus-database.ps1 -MigrationsOnly
```

O script solicita a senha do **administrador PostgreSQL** e aplica somente
migrations ainda não registradas, sem recriar o banco ou limpar lotes, sessões,
leituras e histórico. Se o PostgreSQL estiver instalado em outro local,
informe `-PostgresBin "C:\Program Files\PostgreSQL\17\bin"` (ajuste a versão).

Confira o resultado no banco `portus`:

```sql
SELECT name, applied_at
  FROM portus_schema_migrations
 WHERE name = '012_unified_batch_traceability.sql';

SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'batches'
   AND column_name IN ('completed', 'completed_at', 'completed_by');
```

Depois de aplicar com sucesso, reinicie o PORTUS nas estações. Não conceda
credenciais administrativas PostgreSQL aos operadores/clientes.

## Sincronização das estações — migration 013

**Aplicação obrigatória no servidor, antes das estações:** atualize o
PostgreSQL executando `database/install-portus-database.ps1 -MigrationsOnly`
com a versão que contém a migration 013.

Nesta etapa, **Produtos** usa exclusivamente o catálogo PostgreSQL para
listar, criar, alterar e excluir produtos; o ID do produto usado para abrir lote
também é obtido do PostgreSQL. A listagem de **Usuários** reúne os cadastrados
no banco central, incluindo aqueles provenientes de Produção e Laboratório.

Na primeira abertura de cada estação após a atualização, o PORTUS importa
os usuários e produtos antigos do seu SQLite local antes de exibir a interface
central. O procedimento é idempotente por estação e **não apaga** o banco antigo.
Repita o procedimento em **todas as máquinas** para migrar registros que
existam apenas nelas. Um conflito de login, perfil, setor ou etiqueta interrompe
a importação, sem substituir a identidade central existente.

**Importante:** esta é a primeira etapa de desligamento do SQLite. O login,
configurações locais da estação, equipamentos e algumas rotinas legadas de
captura/exportação ainda dependem do SQLite. Não exclua seus arquivos
`portus.db` e não desinstale o módulo SQLite até terminar a migração desses
módulos, executar a conciliação de dados e aprovar os testes integrados. Os
usuários de outras estações aparecem na administração, porém ficam
temporariamente em modo de consulta, sem alteração de senha ou exclusão
remota. O plano do desligamento completo está em
`docs/superpowers/plans/2026-10-08-postgresql-only-cutover.md`.

## Ordem de aplicação manual

Execute as migrations em ordem:

```bash
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/001_schema.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/002_domain_functions.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/003_security_permissions.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/004_laboratory_view.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/005_runtime_function_security.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/006_product_catalog_sync.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/007_admin_force_close.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/008_master_reopen_batch.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/009_default_equipment_catalog.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/010_admin_reopen_batch.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/011_operational_closure_rules.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/012_unified_batch_traceability.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/013_central_catalog_user_metadata.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed/reference.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/001_domain_functions.sql
psql "$PORTUS_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/002_security_permissions.sql
npm run test:postgres:concurrency
```

Cada migration é transacional e falha ao primeiro erro.

## Princípios

- O banco central compartilha o estado dos lotes entre setores.
- O estado global é `open` ou `closed`.
- `stage` representa a etapa/setor atual.
- Produção e Laboratório trabalham no mesmo lote enquanto ele estiver aberto.
- O checkbox `Lote concluído` sinaliza o fim operacional do ciclo, sem fechar administrativamente o lote.
- Somente Supervisor ou Master finalizam e reabrem lotes.
- Cada sessão central registra o usuário responsável e a estação física onde a leitura foi executada.
- A captura USB/serial continua no PORTUS.
- Não existe limite global de seis lotes nesta especificação.
- Kafka, RabbitMQ, CQRS, CDC e Event Sourcing não fazem parte do Passo 1.

## Funções de domínio

As aplicações devem chamar as funções abaixo, em vez de escrever diretamente
nas tabelas críticas:

- `open_batch`
- `register_reading`
- `move_batch_to_stage`
- `set_batch_completed`
- `supervisor_finalize_batch`
- `master_reopen_batch`
- `ensure_station`

As funções `confirm_production_close` e `confirm_laboratory_close` permanecem apenas para compatibilidade com versões anteriores e não fazem parte do fluxo operacional novo.

A migration `004_laboratory_view.sql` registra a aplicação
`PORTUS_LABORATORY`, concede as capacidades da aplicação no setor Laboratório e
passa a identificar o usuário responsável em cada sessão de captura. A
permissão de cada usuário continua obrigatória em
`user_sector_permissions`.

## Permissões

O schema separa permissões de usuário e aplicação por setor. A instalação deve
criar os usuários de banco da infraestrutura e conceder apenas:

- `SELECT` nas tabelas necessárias para consultas;
- `EXECUTE` nas funções de domínio;
- nenhum `INSERT`, `UPDATE` ou `DELETE` direto para clientes operacionais.

A migration `003_security_permissions.sql` remove de `PUBLIC` o acesso às
tabelas, sequências e funções do schema. A role usada pelo aplicativo deve ser
criada na implantação e receber somente os `SELECT`, escritas técnicas e
`EXECUTE` estritamente necessários. O proprietário das migrations não deve ser
usado como credencial nas estações em produção.

## Validação

O teste transacional em `database/tests/001_domain_functions.sql` verifica o
fluxo de abertura, mudança de etapa, dupla confirmação e idempotência. O teste
`002_security_permissions.sql` confirma que `PUBLIC` não possui escrita direta
nem execução das funções críticas. O teste
`003_concurrent_closure.mjs` cria conexões independentes de Produção e
Laboratório, força a disputa pelo lock do mesmo lote e valida atomicidade,
versão, histórico e idempotência em PostgreSQL real.
