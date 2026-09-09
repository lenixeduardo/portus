# PORTUS

![PORTUS — captura industrial e gestão central de lotes](docs/assets/portus-cover.png)

Aplicativo desktop industrial para leitura de equipamentos via porta serial,
controle de lotes e persistência compartilhada em PostgreSQL. O PORTUS mantém a
aquisição física no Electron e centraliza o estado operacional para Produção e
Laboratório.

## Estado atual

- captura simultânea de até seis equipamentos seriais;
- protocolos passivo e Modbus RTU;
- leitura por scanner de código de barras e simulação de scan;
- sessões, leituras, histórico e exportação CSV;
- banco local para configuração da estação e operação legada;
- PostgreSQL central opcional para lotes, sessões e leituras;
- fechamento global somente após confirmação da Produção e do Laboratório;
- badge de conectividade PostgreSQL atualizado a cada 15 segundos;
- instalador Windows NSIS com ícones próprios.

## Arquitetura

```mermaid
flowchart LR
  E["Equipamentos"] --> M["Electron main"]
  M --> L["Configuração local"]
  M --> P["PostgreSQL central"]
  R["React renderer"] -->|"IPC seguro"| M
  P --> F["Produção + Laboratório"]
```

O frontend não recebe credenciais nem acessa o PostgreSQL diretamente. Todas as
operações passam pelo preload, pelos handlers IPC e pela camada de domínio do
processo principal.

## Stack

| Camada | Tecnologia |
|---|---|
| Desktop | Electron 32 |
| Interface | React 18, Vite e TypeScript |
| Captura | serialport, protocolo passivo e Modbus RTU |
| Banco local | sql.js |
| Banco central | PostgreSQL 18 e `pg` |
| Validação | Zod e Vitest |
| Distribuição | electron-builder e NSIS |

## Requisitos

- Node.js 20 ou superior;
- npm;
- PostgreSQL local ou remoto para o modo central;
- Windows 10/11 para gerar e testar o instalador NSIS.

Docker não é obrigatório. Em máquinas com poucos recursos, use diretamente a
instalação local do PostgreSQL.

## Instalação

```bash
git clone https://github.com/lenixeduardo/portus.git
cd portus
git checkout feat/portus-stage-0-database-baseline
npm install
```

### Configurar o PostgreSQL no Windows

Abra o Query Tool do pgAdmin como administrador do PostgreSQL ou conecte com o
usuário criado na instalação. Crie o usuário e o banco de desenvolvimento:

```sql
CREATE ROLE portus_admin WITH LOGIN PASSWORD 'SUA_SENHA_FORTE';
CREATE DATABASE portus OWNER portus_admin;
```

No PowerShell, dentro da pasta do projeto:

```powershell
$env:PGPASSWORD="SUA_SENHA_FORTE"
$psql="C:\Program Files\PostgreSQL\18\bin\psql.exe"

& $psql -h 127.0.0.1 -p 5432 -U portus_admin -d portus -v ON_ERROR_STOP=1 -f "database/migrations/001_schema.sql"
& $psql -h 127.0.0.1 -p 5432 -U portus_admin -d portus -v ON_ERROR_STOP=1 -f "database/migrations/002_domain_functions.sql"
& $psql -h 127.0.0.1 -p 5432 -U portus_admin -d portus -v ON_ERROR_STOP=1 -f "database/migrations/003_security_permissions.sql"
& $psql -h 127.0.0.1 -p 5432 -U portus_admin -d portus -v ON_ERROR_STOP=1 -f "database/seed/reference.sql"
```

Valide a instalação:

```powershell
& $psql -h 127.0.0.1 -p 5432 -U portus_admin -d portus -v ON_ERROR_STOP=1 -f "database/tests/001_domain_functions.sql"
& $psql -h 127.0.0.1 -p 5432 -U portus_admin -d portus -v ON_ERROR_STOP=1 -f "database/tests/002_security_permissions.sql"
```

O primeiro teste termina com `ROLLBACK`, portanto não mantém o lote de teste.

### Conectar o Electron à base central

Defina as variáveis no mesmo terminal que iniciará o aplicativo:

```powershell
$env:PORTUS_DATABASE_URL="postgresql://portus_admin:SUA_SENHA@127.0.0.1:5432/portus"
$env:PORTUS_DATABASE_POOL_MAX="5"
$env:PORTUS_DATABASE_CONNECT_TIMEOUT_MS="5000"
$env:PORTUS_SECTOR_CODE="PRODUCTION"
npm run dev
```

Se a senha possuir `@`, `:`, `/`, `#` ou outros caracteres reservados, aplique
URL encoding antes de colocá-la em `PORTUS_DATABASE_URL`.

## Badge do banco central

| Estado | Significado |
|---|---|
| Banco conectado | `PORTUS_DATABASE_URL` configurada e `SELECT 1` respondendo |
| Banco desconectado | URL configurada, mas a conexão falhou |
| Banco não configurado | variável `PORTUS_DATABASE_URL` ausente |
| Verificando banco | teste de conectividade em andamento |

O status é consultado ao autenticar e atualizado a cada 15 segundos.

## Regra de fechamento

O cliente não altera diretamente o status global. As funções PostgreSQL
`confirm_production_close` e `confirm_laboratory_close` bloqueiam o lote,
registram histórico e mantêm as confirmações idempotentes.

```text
Produção confirmou + Laboratório confirmou = lote fechado
Qualquer confirmação isolada                 = lote permanece aberto
```

Não existe limite global de seis lotes no modelo central. As permissões são
definidas por usuário, aplicação e setor.

## Desenvolvimento e validação

```bash
npm run dev        # Vite, TypeScript watch e Electron
npm run typecheck  # valida main e renderer
npm test           # suíte automatizada
npm run build      # build do renderer e do processo principal
```

A base atual possui 84 testes automatizados. A validação PostgreSQL fica em
`database/tests` e deve ser executada separadamente contra um banco de teste.

```powershell
$env:PORTUS_DATABASE_URL="postgresql://portus_admin:portus_dev_123@127.0.0.1:5432/portus"
npm run test:postgres:concurrency
```

Esse comando automatiza a disputa pelo mesmo lote entre Produção e Laboratório
e remove os dados temporários ao terminar.

## Simulação serial

O projeto inclui presets de balança, pH, viscosímetro, espectrofotômetro e carga
genérica.

```bash
npm run sim -- --port COM11 --preset balanca
npm run sim -- --port COM11 --preset ph --interval 2000
npm run sim:test
```

No Windows, crie um par de portas com `com0com` e configure, por exemplo, o app
na `COM10` e o simulador na `COM11`. No Linux, use duas PTYs criadas pelo
`socat`. O guia detalhado está em [docs/RUNNING.md](docs/RUNNING.md).

## Empacotamento Windows

```bash
npm run rebuild
npm run package
```

O instalador é criado em `release/`. Os assets canônicos ficam em
`build/icon.png` e `build/icon.ico`; para regenerá-los:

```bash
node scripts/gen-icon.mjs
node scripts/gen-ico.mjs
```

## Estrutura principal

```text
database/
  migrations/   Schema, funções e segurança PostgreSQL
  seed/          Aplicações e setores de referência
  tests/         Testes transacionais do domínio
docs/            ADRs, especificações e guias operacionais
src/
  main/          Electron, captura, banco e IPC
  preload/       Contrato seguro do renderer
  renderer/      Interface React
  shared/        Tipos e canais IPC
tools/           Simulador serial
```

## Documentação

- [Baseline do PostgreSQL](docs/PORTUS-DATABASE-BASELINE.md)
- [Decisão de autoridade central](docs/ADR-001-lot-service-authority.md)
- [Especificação da Visão Laboratório](docs/PORTUS-LABORATORIO-SPEC.md)
- [Changelog da integração](docs/POSTGRESQL-INTEGRATION-CHANGELOG.md)
- [Guia de execução](docs/RUNNING.md)
- [Empacotamento](docs/PACKAGING.md)
- [Pendências](TODO.md)

## Pendências de homologação

- executar e registrar o teste automatizado de concorrência no ambiente de homologação;
- validar permissões com roles físicas de runtime;
- homologar o mapeamento dos equipamentos reais;
- validar com o Laboratório quais leituras são obrigatórias;
- implementar o cliente dedicado PORTUS Visão Laboratório.

Estas pendências dependem do ambiente e do processo industrial real; não são
tratadas como funcionalidades concluídas.
