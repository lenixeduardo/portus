# Design — Detecção automática de PostgreSQL no instalador do PORTUS

Data: 2026-09-14

## Objetivo

Tornar a instalação final do PORTUS segura e previsível em três tipos de máquina: Servidor, Produção e Laboratório. Quando a máquina for `Servidor`, o instalador deve detectar automaticamente uma instalação existente do PostgreSQL 18, reutilizá-la sem reinstalar ou sobrescrever o cluster e então executar o bootstrap idempotente do banco PORTUS. Quando a máquina for `Produção` ou `Laboratório`, nenhuma detecção ou configuração de PostgreSQL local deve ocorrer.

## Estado atual

O `PORTUS-Setup` gerado por Electron Builder/NSIS instala o aplicativo, mas a customização atual em `build/installer.nsh` não possui seleção de tipo de máquina nem detecção de PostgreSQL.

O banco é configurado separadamente por `database/install-portus-database.ps1`. Esse script usa por padrão `C:\Program Files\PostgreSQL\18\bin`, verifica se `psql.exe` existe, cria/atualiza `portus` e `portus_admin`, aplica migrations de forma idempotente e persiste `%LOCALAPPDATA%\PORTUS\database-config.json`.

A detecção atual, portanto, é apenas uma validação de caminho conhecido. Ela não descobre instalações pelo Windows.

## Escopo

### Incluído

- Seleção explícita do tipo da máquina: `Servidor`, `Produção` ou `Laboratório`.
- Detecção automática de PostgreSQL somente no fluxo `Servidor`.
- Descoberta por Registry, serviços do Windows e filesystem controlado.
- PostgreSQL 18 como única versão homologada no fluxo normal desta entrega.
- Validação de `psql.exe`, versão, serviço, estado do serviço e porta.
- Reutilização do bootstrap idempotente já existente para banco, role, migrations, seed e configuração do PORTUS.
- Persistência do tipo de máquina junto da configuração local do PORTUS.
- Erros estruturados e bloqueio seguro quando o ambiente não estiver pronto.
- Testes unitários e de integração do novo fluxo.

### Fora de escopo

- Instalação silenciosa automática do PostgreSQL.
- Suporte operacional automático a PostgreSQL 17 ou versões anteriores. Elas podem ser detectadas como candidatas, mas devem aparecer como `unsupported` no instalador normal.
- Alteração automática da senha do usuário `postgres`.
- Migração de cluster entre versões.
- Remoção ou reinstalação de PostgreSQL.
- Alteração destrutiva de bancos, roles ou dados existentes.
- Edição automática de `postgresql.conf` ou `pg_hba.conf` como efeito da detecção. A liberação de acesso remoto continua sendo uma etapa de implantação separada até existir uma especificação própria para isso.
- Sistemas operacionais diferentes de Windows neste ciclo.

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
     |     +-- Exigir PostgreSQL 18 suportado
     |     +-- Validar serviço e porta
     |     +-- Reutilizar instalação existente
     |     +-- Executar bootstrap PORTUS
     |     +-- Aplicar migrations pendentes
     |     +-- Persistir configuração local
     |
     +-- Produção
     |     +-- Não detectar/instalar PostgreSQL local
     |     +-- Configurar conexão com servidor central
     |     +-- Testar conexão remota
     |     +-- Persistir configuração da estação
     |
     +-- Laboratório
           +-- Não detectar/instalar PostgreSQL local
           +-- Configurar conexão com servidor central
           +-- Testar conexão remota
           +-- Persistir configuração da estação
```

## Componente de descoberta

A lógica de descoberta deve ficar isolada da UI NSIS e do bootstrap do banco. O helper retornará instalações candidatas normalizadas em JSON.

Estrutura conceitual:

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
  supported: boolean;
  source: Array<'registry' | 'service' | 'filesystem'>;
}
```

### Ordem de descoberta

1. **Registry do Windows**
   - Consultar chaves padrão criadas pelo instalador oficial PostgreSQL/EnterpriseDB.
   - Coletar versão, diretório de instalação, diretório de dados, serviço e porta quando disponíveis.
   - Considerar as visualizações 64-bit e 32-bit do Registry quando necessário.

2. **Serviços do Windows**
   - Enumerar serviços compatíveis com `postgresql-x64-*` e equivalentes reconhecidos.
   - Usar o caminho do binário/serviço para inferir a instalação.
   - Registrar `running`, `stopped` ou `unknown`.

3. **Filesystem como fallback**
   - Procurar somente em locais previsíveis, inicialmente `C:\Program Files\PostgreSQL\*\bin\psql.exe` e, como fallback, `ProgramFiles(x86)`.
   - Não varrer o disco inteiro.

4. **Normalização e deduplicação**
   - Consolidar achados repetidos pelo caminho canônico de `psql.exe` e raiz da instalação.

## Regra de compatibilidade e seleção

Nesta entrega, PostgreSQL 18 é a única versão aceita automaticamente no fluxo `Servidor`.

- Se houver exatamente uma instalação PostgreSQL 18 válida, ela é selecionada.
- Se houver mais de uma instalação PostgreSQL 18 válida, o instalador deve exigir seleção explícita e mostrar caminho, serviço e porta de cada candidata.
- Se houver PostgreSQL 17/16/etc., ele pode ser exibido como detectado, porém `unsupported` para a implantação normal.
- Se não houver PostgreSQL 18 suportado, o instalador deve bloquear o bootstrap e orientar a instalação do PostgreSQL 18.
- Uma reinstalação do PORTUS nunca deve trocar silenciosamente a instalação/cluster já utilizado.

Isso remove a dependência do caminho fixo sem ampliar a matriz de compatibilidade sem testes.

## Validação da instalação selecionada

Antes do bootstrap:

- `psql.exe` deve existir e executar `psql --version` com sucesso.
- A major version obtida deve ser `18`.
- O serviço associado deve ser identificado quando aplicável.
- Se o serviço estiver parado, o estado retornado deve ser `stopped`; o instalador não deve fingir que o PostgreSQL está pronto.
- A porta deve ser obtida da configuração/serviço detectado quando possível. `5432` é o padrão do projeto, não uma suposição cega.
- Se o serviço estiver rodando, a porta deve pertencer ao PostgreSQL selecionado.
- Se a porta configurada estiver ocupada por outro processo, o fluxo deve ser bloqueado.

Estados relevantes:

```text
ready        PostgreSQL 18 válido e serviço pronto
stopped      PostgreSQL 18 detectado, mas serviço parado
not_found    nenhuma instalação suportada encontrada
unsupported  somente versões não homologadas encontradas
conflict     porta/configuração incompatível com a instalação selecionada
error        erro técnico inesperado
```

## Comportamento por tipo de máquina

### Servidor

1. Executar o helper de descoberta.
2. Exibir versão, caminho, serviço, status e porta.
3. Se `ready`, reutilizar a instalação existente.
4. Solicitar somente as credenciais administrativas necessárias ao bootstrap.
5. Executar a lógica atual de criação/atualização de `portus` e `portus_admin`.
6. Aplicar apenas migrations ausentes de `portus_schema_migrations`.
7. Executar seed e testes previstos pela implantação.
8. Persistir a configuração de runtime e `PORTUS_MACHINE_TYPE=server`.

Se o estado for `stopped`, o instalador deve pedir que o serviço seja iniciado e oferecer `Detectar novamente`. Iniciar o serviço pelo próprio instalador somente será permitido quando houver elevação necessária e consentimento explícito do usuário.

Se o estado for `not_found` ou `unsupported`, o instalador não deve instalar PostgreSQL silenciosamente. Deve orientar a instalação do PostgreSQL 18 e oferecer `Detectar novamente`.

### Produção

- Não executar o helper de descoberta.
- Não chamar `install-portus-database.ps1` para bootstrap local.
- Solicitar host, porta, banco e credenciais do servidor central, ou consumir esses valores do fluxo de implantação definido.
- No fluxo normal, rejeitar `localhost` e `127.0.0.1` como host do banco central.
- Testar conexão remota antes de concluir.
- Persistir `PORTUS_DATABASE_MODE=central` e `PORTUS_MACHINE_TYPE=production`.

### Laboratório

Mesmo comportamento de infraestrutura de Produção, persistindo `PORTUS_MACHINE_TYPE=laboratory`. As diferenças funcionais continuam sendo determinadas pelas permissões e perfil do PORTUS, não pela existência de um PostgreSQL local.

## Integração com o bootstrap existente

`database/install-portus-database.ps1` continua responsável por:

- validação de identificadores;
- criação condicional da role;
- criação condicional do banco;
- migrations idempotentes;
- grants;
- seed;
- testes SQL previstos;
- geração da connection string e de `database-config.json`.

A descoberta passa a fornecer explicitamente `PostgresBin` e `Port`, por exemplo:

```powershell
.\database\install-portus-database.ps1 `
  -PostgresBin "C:\Program Files\PostgreSQL\18\bin" `
  -Port 5432
```

O script deve continuar executável manualmente para diagnóstico/suporte.

## Integração com o instalador

A lógica de descoberta não deve ser implementada integralmente em NSIS.

Arquitetura prevista:

- `build/installer.nsh` — orquestração mínima do fluxo e integração com o helper.
- `scripts/windows/detect-postgresql.ps1` — descoberta/validação do Windows e saída JSON determinística.
- `database/install-portus-database.ps1` — bootstrap do banco, recebendo caminho e porta já resolvidos.
- `package.json`/`electron-builder.yml` — empacotamento dos helpers necessários ao instalador final.

O helper deve ser utilizável isoladamente em testes e suporte técnico.

## Contrato do helper

Exemplo `ready`:

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
    "port": 5432,
    "supported": true
  },
  "candidates": []
}
```

Exemplo `not_found`:

```json
{
  "status": "not_found",
  "selected": null,
  "candidates": []
}
```

Exemplo `unsupported`:

```json
{
  "status": "unsupported",
  "selected": null,
  "candidates": [
    {
      "version": "17.x",
      "majorVersion": 17,
      "supported": false
    }
  ]
}
```

Exemplo `conflict`:

```json
{
  "status": "conflict",
  "selected": null,
  "reason": "port_in_use_by_other_process",
  "port": 5432,
  "candidates": []
}
```

Estados esperados (`ready`, `stopped`, `not_found`, `unsupported`, `conflict`) devem ser comunicados por JSON válido para a UI. Código de saída diferente de zero fica reservado para falha técnica inesperada do helper.

## Persistência

O arquivo já existente `%LOCALAPPDATA%\PORTUS\database-config.json` será estendido para incluir `PORTUS_MACHINE_TYPE`, evitando um segundo arquivo de configuração apenas para esse dado.

Exemplo Servidor:

```json
{
  "PORTUS_DATABASE_URL": "postgresql://...",
  "PORTUS_DATABASE_MODE": "central",
  "PORTUS_MACHINE_TYPE": "server"
}
```

Valores válidos:

```text
server
production
laboratory
```

`PORTUS_MACHINE_TYPE` descreve o papel físico da instalação e não substitui autenticação nem autorização de usuário.

## Segurança e idempotência

- Nunca remover/reinstalar PostgreSQL existente.
- A simples detecção nunca altera `postgresql.conf`, `pg_hba.conf` ou diretório de dados.
- Nunca alterar senha administrativa automaticamente.
- Nunca criar outra instância só porque a porta 5432 está ocupada.
- Nunca armazenar senha administrativa em arquivo.
- Preservar banco, role, migrations e dados já existentes.
- Reexecuções devem reaplicar apenas etapas pendentes.
- Produção/Laboratório nunca executam bootstrap local.

## Tratamento de erros

### PostgreSQL 18 não encontrado

> PostgreSQL 18 não foi encontrado nesta máquina. Instale a versão 18, mantenha o serviço em execução e clique em “Detectar novamente”.

### Versão não homologada

> Foi encontrada uma instalação do PostgreSQL, mas esta versão não está homologada para esta versão do PORTUS. Instale o PostgreSQL 18 para continuar.

### Serviço parado

Mostrar instalação encontrada, serviço e status. Permitir nova verificação após o serviço ser iniciado.

### Porta ocupada por outro processo

Bloquear bootstrap, informar a porta e não alterar automaticamente para outra porta.

### Credencial administrativa inválida

Falhar antes de mudanças persistentes além de artefatos temporários e permitir nova tentativa.

### Banco já configurado

Executar somente migrations pendentes e validações; não recriar nem apagar dados.

## Alterações previstas

- `scripts/windows/detect-postgresql.ps1` — novo helper.
- `database/install-portus-database.ps1` — integração com caminho/porta resolvidos e persistência de `PORTUS_MACHINE_TYPE` quando aplicável.
- `build/installer.nsh` — seleção/orquestração do tipo da máquina e chamada do helper.
- `package.json` e/ou `electron-builder.yml` — inclusão dos recursos necessários no instalador.
- testes do helper e do fluxo de instalação.
- `database/README.md` e documentação de implantação.

Evitar refatorações fora desse fluxo.

## Estratégia de testes

### Unidade — descoberta

1. PostgreSQL 18 via Registry.
2. PostgreSQL 18 apenas via serviço.
3. PostgreSQL 18 apenas via filesystem.
4. Mesma instalação encontrada por várias fontes e deduplicada.
5. PostgreSQL 18 + 17 — selecionar 18.
6. Somente PostgreSQL 17 — retornar `unsupported`.
7. Duas instalações PostgreSQL 18 válidas — exigir seleção explícita.
8. Entrada de Registry sem `psql.exe` — candidato inválido.
9. Serviço parado — `stopped`.
10. Porta usada pelo PostgreSQL selecionado — válida.
11. Porta usada por outro processo — `conflict`.
12. Nenhuma instalação — `not_found`.

### Integração

- Servidor com PostgreSQL 18 e banco inexistente.
- Servidor com PostgreSQL 18 e banco já configurado.
- Segunda execução com migrations já aplicadas.
- Produção sem PostgreSQL local conectando ao servidor remoto.
- Laboratório sem PostgreSQL local conectando ao servidor remoto.
- Garantir que Produção/Laboratório não chamem o bootstrap local.

### Release

`validate:release` deve verificar que o helper, bootstrap e recursos de instalação necessários estão presentes no artefato final.

## Critérios de aceite

1. Um Windows com PostgreSQL 18 instalado no caminho padrão é detectado sem informar `PostgresBin`.
2. PostgreSQL 18 instalado em caminho não padrão, mas registrado/associado a serviço corretamente, também é detectado.
3. O serviço e seu status são identificados.
4. O instalador não cria nem instala uma segunda instância PostgreSQL.
5. Conflito de porta com processo não PostgreSQL bloqueia o bootstrap.
6. PostgreSQL 17 ou anterior não é escolhido automaticamente nesta entrega.
7. `Produção` e `Laboratório` nunca executam detecção/bootstrap local.
8. `Servidor` reutiliza PostgreSQL 18 e executa bootstrap idempotente.
9. Segunda execução preserva banco, usuários e dados, aplicando apenas migrations pendentes.
10. `database-config.json` registra corretamente o tipo da máquina.
11. O instalador final continua sendo gerado pelo pipeline de release atual.
12. Testes automatizados do novo fluxo passam antes da geração do artefato final.

## Decisões finais

- PostgreSQL 18 é a única versão homologada nesta implementação.
- A detecção automática existe apenas para máquinas `Servidor`.
- Não haverá instalação silenciosa do PostgreSQL.
- Descoberta fica em helper PowerShell independente e testável.
- NSIS apenas orquestra o fluxo.
- O bootstrap existente permanece responsável pelo banco e mantém idempotência.
- Produção e Laboratório sempre usam o servidor central.
- Configuração automática de acesso remoto do PostgreSQL (`postgresql.conf`/`pg_hba.conf`) não faz parte desta mudança e permanece uma etapa separada de implantação.
