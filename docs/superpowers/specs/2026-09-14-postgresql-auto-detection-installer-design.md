# Design — Detecção automática de PostgreSQL no instalador do PORTUS

Data: 2026-09-14

## Objetivo

Tornar a instalação final do PORTUS segura e previsível em três tipos de máquina: Servidor, Produção e Laboratório. O instalador deve detectar automaticamente uma instalação existente do PostgreSQL quando a máquina for configurada como Servidor, reutilizar essa instalação sem sobrescrevê-la e impedir qualquer tentativa de instalar/configurar PostgreSQL localmente em estações de Produção ou Laboratório.

## Estado atual

Hoje o `PORTUS-Setup` gerado por Electron Builder/NSIS instala apenas o aplicativo. A customização NSIS em `build/installer.nsh` não possui lógica de detecção de PostgreSQL nem seleção de tipo de máquina.

A configuração do banco fica separada em `database/install-portus-database.ps1`. Esse script assume por padrão `C:\Program Files\PostgreSQL\18\bin`, valida apenas a presença de `psql.exe`, cria/atualiza `portus` e `portus_admin`, executa migrations de forma idempotente e persiste `database-config.json`.

Portanto, a detecção atual é parcial e baseada em um caminho esperado, não em uma descoberta real do PostgreSQL instalado no Windows.

## Escopo

### Incluído

- Seleção explícita do tipo da máquina: `Servidor`, `Produção` ou `Laboratório`.
- Detecção automática de PostgreSQL apenas quando `Servidor` for selecionado.
- Reutilização segura de PostgreSQL já instalado.
- Descoberta por múltiplas fontes do Windows.
- Validação de versão, `psql.exe`, serviço do Windows, estado do serviço e porta configurada.
- Continuidade do bootstrap idempotente já existente para banco, role, migrations, seed e configuração do PORTUS.
- Mensagens de erro claras e bloqueio seguro quando o ambiente não estiver pronto.
- Nenhuma instalação/configuração de PostgreSQL local para Produção ou Laboratório.
- Testes unitários da lógica de descoberta e testes de integração dos fluxos do instalador.

### Fora de escopo

- Instalação silenciosa automática do PostgreSQL sem consentimento do usuário.
- Alteração automática de senha do usuário `postgres`.
- Migração de um cluster PostgreSQL existente entre versões.
- Remoção ou reinstalação de PostgreSQL.
- Alteração destrutiva de bancos ou roles já existentes.
- Suporte a sistemas operacionais diferentes de Windows neste ciclo.

## Fluxo principal

```text
PORTUS Setup
     |
     v
Escolher tipo da máquina
     |
     +-- Servidor
     |     |
     |     +-- Detectar PostgreSQL
     |     +-- Validar instalação encontrada
     |     +-- Validar serviço
     |     +-- Validar porta
     |     +-- Reutilizar instalação existente
     |     +-- Executar bootstrap PORTUS
     |     +-- Aplicar migrations pendentes
     |     +-- Persistir configuração local
     |
     +-- Produção
     |     +-- Não detectar/instalar PostgreSQL local
     |     +-- Solicitar dados do servidor central
     |     +-- Testar conexão remota
     |     +-- Persistir configuração da estação
     |
     +-- Laboratório
           +-- Não detectar/instalar PostgreSQL local
           +-- Solicitar dados do servidor central
           +-- Testar conexão remota
           +-- Persistir configuração da estação
```

## Componente de descoberta do PostgreSQL

A lógica de descoberta deve ficar isolada da UI e do bootstrap do banco. O objetivo é retornar uma lista de instalações candidatas normalizadas.

Cada instalação detectada deve produzir um objeto equivalente a:

```ts
interface PostgreSqlInstallation {
  version: string;
  majorVersion: number;
  installRoot: string;
  binPath: string;
  psqlPath: string;
  serviceName?: string;
  serviceStatus?: 'running' | 'stopped' | 'unknown';
  port?: number;
  source: Array<'registry' | 'service' | 'filesystem'>;
}
```

### Ordem de descoberta

1. **Registry do Windows**
   - Consultar as chaves padrão do instalador oficial do PostgreSQL/EnterpriseDB.
   - Coletar versão, diretório de instalação, diretório de dados, nome do serviço e porta quando disponíveis.
   - Considerar visualizações 64-bit e 32-bit do Registry quando necessário.

2. **Serviços do Windows**
   - Enumerar serviços compatíveis com nomes como `postgresql-x64-*` e equivalentes reconhecidos.
   - Usar o `PathName`/binário do serviço para inferir a instalação quando possível.
   - Registrar se o serviço está `Running`, `Stopped` ou em estado desconhecido.

3. **Filesystem como fallback**
   - Procurar instalações sob `C:\Program Files\PostgreSQL\*\bin\psql.exe`.
   - Opcionalmente considerar `ProgramFiles(x86)` apenas como fallback.
   - Nunca varrer o disco inteiro.

4. **Normalização e deduplicação**
   - Instalações encontradas por mais de uma fonte devem ser consolidadas pelo caminho canônico do `psql.exe`/raiz de instalação.

## Seleção entre múltiplas instalações

Quando houver mais de uma instalação válida:

1. Preferir PostgreSQL 18 se presente, pois é a versão atualmente homologada pelo PORTUS.
2. Se não houver 18, aceitar versões suportadas explicitamente pela matriz de compatibilidade do projeto.
3. Se houver mais de uma instalação da mesma prioridade, mostrar ao usuário uma seleção explícita em vez de escolher silenciosamente.
4. Nunca trocar de cluster/instalação automaticamente em uma reinstalação do PORTUS sem confirmação.

Nesta entrega, a versão preferencial continua sendo PostgreSQL 18. O mecanismo deve, porém, deixar de depender de um caminho fixo.

## Validação da instalação encontrada

Antes do bootstrap do banco, o instalador deve validar:

- `psql.exe` existe e é executável.
- `psql --version` responde e a versão corresponde à instalação detectada.
- O serviço associado existe quando a instalação usa serviço do Windows.
- O serviço está em execução; se estiver parado, oferecer iniciar o serviço com consentimento/elevação quando aplicável.
- A porta configurada pode ser determinada. O padrão é `5432`, mas a detecção não deve presumir que toda instalação usa essa porta.
- A porta está vinculada ao processo/serviço PostgreSQL esperado antes do bootstrap.

A validação de porta deve distinguir entre:

- porta livre;
- porta usada pelo PostgreSQL detectado;
- porta usada por outro processo.

Se a porta esperada estiver ocupada por outro processo, o instalador deve bloquear a continuidade e explicar o conflito.

## Comportamento por tipo de máquina

### Servidor

Ao selecionar `Servidor`:

1. Executar descoberta automática.
2. Se encontrar uma instalação válida, mostrar resumo:
   - versão;
   - caminho;
   - serviço;
   - status;
   - porta.
3. Reutilizar a instalação selecionada.
4. Pedir as credenciais administrativas necessárias para o bootstrap.
5. Executar a lógica atual de criação/atualização idempotente de `portus` e `portus_admin`.
6. Aplicar apenas migrations ainda não registradas em `portus_schema_migrations`.
7. Executar seed/testes previstos para instalação.
8. Persistir a configuração de runtime do PORTUS.

Se nenhuma instalação for encontrada, não tentar instalar PostgreSQL silenciosamente. Mostrar uma etapa bloqueada com instrução para instalar PostgreSQL 18 e uma ação de `Detectar novamente`.

### Produção

Ao selecionar `Produção`:

- Não executar descoberta de PostgreSQL local.
- Não chamar o instalador do banco central.
- Solicitar/usar host, porta, banco e credenciais da conexão remota.
- Recusar `localhost` e `127.0.0.1` como endereço do banco central, salvo modo técnico explicitamente habilitado fora do fluxo normal de implantação.
- Testar conectividade TCP e autenticação antes de concluir.
- Persistir `PORTUS_DATABASE_URL`, `PORTUS_DATABASE_MODE=central` e o tipo da estação.

### Laboratório

Mesmo comportamento de Produção para infraestrutura do banco. A diferença é apenas o tipo/perfil da estação e as permissões funcionais do PORTUS.

## Integração com o bootstrap existente

`database/install-portus-database.ps1` deve continuar responsável por:

- validação de identificadores;
- criação condicional da role;
- criação condicional do banco;
- aplicação idempotente de migrations;
- grants;
- seed;
- testes SQL previstos;
- criação de `database-config.json`.

A mudança principal é remover a dependência operacional do valor fixo de `PostgresBin`. O caminho descoberto deve ser passado explicitamente para o script, por exemplo:

```powershell
.\database\install-portus-database.ps1 -PostgresBin "C:\Program Files\PostgreSQL\18\bin" -Port 5432
```

O script deve manter compatibilidade com execução manual.

## Integração com o instalador

A implementação deve evitar colocar toda a lógica de descoberta diretamente em `installer.nsh`.

Arquitetura recomendada:

- `build/installer.nsh`: orquestração mínima do NSIS e chamada do helper.
- `scripts/windows/detect-postgresql.ps1`: descoberta e validação do ambiente Windows, emitindo JSON determinístico.
- `database/install-portus-database.ps1`: bootstrap do banco, sem responsabilidade por descobrir instalações.
- configuração persistida do tipo de máquina em `%LOCALAPPDATA%\PORTUS\...` ou arquivo equivalente já adotado pelo app.

O helper deve poder ser executado e testado separadamente do instalador gráfico.

## Contrato do helper de detecção

Exemplo de saída quando PostgreSQL 18 estiver pronto:

```json
{
  "status": "ready",
  "selected": {
    "version": "18.x",
    "majorVersion": 18,
    "binPath": "C:\\Program Files\\PostgreSQL\\18\\bin",
    "psqlPath": "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe",
    "serviceName": "postgresql-x64-18",
    "serviceStatus": "running",
    "port": 5432
  },
  "candidates": []
}
```

Exemplo sem instalação:

```json
{
  "status": "not_found",
  "selected": null,
  "candidates": []
}
```

Exemplo de conflito:

```json
{
  "status": "conflict",
  "selected": null,
  "reason": "port_in_use_by_other_process",
  "port": 5432,
  "candidates": []
}
```

O processo deve retornar código de saída diferente de zero apenas para erros técnicos inesperados. Estados esperados como `not_found`, `stopped` ou `conflict` devem ser representados de forma estruturada para a UI poder explicar o problema.

## Segurança e idempotência

- Nunca remover PostgreSQL existente.
- Nunca sobrescrever `postgresql.conf`, `pg_hba.conf` ou o diretório de dados como efeito colateral da simples detecção.
- Nunca alterar senha administrativa automaticamente.
- Nunca criar uma segunda instância porque a porta 5432 já está ocupada.
- Não armazenar a senha administrativa em arquivo de configuração.
- Manter a senha operacional somente no mecanismo já utilizado pelo PORTUS para a connection string.
- Reexecuções devem detectar o mesmo ambiente e reaplicar apenas passos pendentes.
- Banco, role e migrations existentes devem ser preservados.

## Tratamento de erros

### PostgreSQL não encontrado no Servidor

Mensagem esperada:

> PostgreSQL não foi encontrado nesta máquina. Instale o PostgreSQL 18 e mantenha o serviço em execução. Depois clique em “Detectar novamente”.

### Serviço parado

Mostrar a instalação encontrada e informar que o serviço está parado. Permitir nova verificação após o usuário iniciar o serviço; iniciar automaticamente somente se o fluxo final tiver elevação e consentimento explícito.

### Porta ocupada por outro processo

Bloquear bootstrap. Mostrar porta e motivo do conflito. Não selecionar outra porta silenciosamente.

### Credencial administrativa inválida

Não alterar nada além de artefatos temporários. Exibir erro de autenticação e permitir nova tentativa.

### Banco já configurado

Reconhecer estado existente, executar apenas migrations pendentes e concluir sem recriar ou apagar dados.

## Persistência do tipo de máquina

O instalador deve persistir explicitamente um valor equivalente a:

```text
PORTUS_MACHINE_TYPE=server
PORTUS_MACHINE_TYPE=production
PORTUS_MACHINE_TYPE=laboratory
```

A aplicação poderá usar esse valor para decidir quais etapas de infraestrutura são válidas naquela máquina. Ele não substitui autenticação/permissões de usuário; apenas descreve o papel da estação instalada.

## Alterações previstas em arquivos

Arquivos novos/alterados esperados:

- `scripts/windows/detect-postgresql.ps1` — novo helper de descoberta.
- `database/install-portus-database.ps1` — aceitar integralmente o resultado da descoberta sem depender de caminho fixo.
- `build/installer.nsh` — adicionar integração/orquestração do fluxo.
- `electron-builder.yml` e/ou `package.json` — garantir empacotamento dos helpers necessários.
- testes PowerShell/Node para o helper e fluxo de instalação.
- `database/README.md` e documentação de implantação — atualizar o fluxo final.

A implementação deve reutilizar padrões existentes e evitar refatorações não relacionadas.

## Estratégia de testes

### Testes unitários da descoberta

Cobrir pelo menos:

1. PostgreSQL 18 encontrado via Registry.
2. PostgreSQL encontrado apenas via serviço.
3. PostgreSQL encontrado apenas pelo filesystem.
4. Mesma instalação encontrada por múltiplas fontes e deduplicada.
5. PostgreSQL 18 e 17 presentes — 18 é preferido.
6. Múltiplas instalações equivalentes — exige seleção explícita.
7. `psql.exe` ausente apesar de entrada no Registry — candidato inválido.
8. Serviço parado.
9. Porta 5432 usada pelo PostgreSQL detectado.
10. Porta 5432 usada por outro processo.
11. Nenhuma instalação encontrada.

### Testes de integração

- Servidor com PostgreSQL 18 existente e banco inexistente.
- Servidor com PostgreSQL 18 e banco já configurado.
- Reexecução do instalador após migrations aplicadas.
- Produção sem PostgreSQL local, conectando a servidor remoto.
- Laboratório sem PostgreSQL local, conectando a servidor remoto.
- Garantir que Produção/Laboratório nunca chamem o bootstrap local.

### Validação de release

Adicionar ao `validate:release` verificações para garantir que:

- helper de detecção está empacotado;
- script de bootstrap está empacotado;
- instalador contém a customização esperada;
- nenhuma dependência crítica do fluxo fica fora de `extraResources`/pacote final.

## Critérios de aceite

A funcionalidade será considerada pronta quando:

1. Em um Windows com PostgreSQL 18 instalado em caminho padrão, o PORTUS o detecta sem o usuário informar `PostgresBin`.
2. Em caminho não padrão registrado corretamente, a instalação também é detectada.
3. O instalador identifica serviço e status corretamente.
4. O instalador não cria uma segunda instalação PostgreSQL.
5. O instalador bloqueia conflito de porta com processo não PostgreSQL.
6. A escolha `Produção` ou `Laboratório` não dispara nenhuma detecção/configuração local de PostgreSQL.
7. A escolha `Servidor` reutiliza a instalação existente e executa bootstrap idempotente.
8. Uma segunda execução preserva banco, usuários e dados e aplica apenas migrations pendentes.
9. O instalador final continua gerando um executável funcional pelo pipeline de release atual.
10. Testes automatizados do novo fluxo passam antes da geração do instalador final.

## Decisões adotadas

- PostgreSQL 18 permanece a versão preferencial/homologada.
- A detecção automática é específica do fluxo `Servidor`.
- O instalador não fará instalação silenciosa de PostgreSQL nesta fase.
- A lógica de descoberta ficará em helper separado e testável, não concentrada no NSIS.
- O bootstrap de banco existente será reaproveitado e continuará idempotente.
- Produção e Laboratório sempre apontam para o servidor central e não possuem banco PostgreSQL local por desenho de implantação.
