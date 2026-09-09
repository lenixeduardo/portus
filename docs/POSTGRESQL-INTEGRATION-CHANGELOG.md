# PORTUS — Changelog da integração PostgreSQL

- **Data de consolidação:** 2026-09-09
- **Branch:** `feat/portus-stage-0-database-baseline`
- **Escopo:** Etapa 0 e Passo 1 da centralização de lotes

## Resumo executivo

O PORTUS passou de um aplicativo exclusivamente local para uma arquitetura
híbrida. A estação continua responsável pela comunicação serial, enquanto o
PostgreSQL pode assumir a autoridade sobre lotes, sessões, leituras, histórico
e confirmações da Produção e do Laboratório.

O modo central é ativado por `PORTUS_DATABASE_URL`. Sem essa configuração, o
aplicativo preserva os fluxos locais compatíveis. Um lote central nunca faz
fallback silencioso de escrita para o banco local.

## Alterações entregues

### 1. Baseline e decisões

- inventário do banco e de todos os pontos de escrita;
- ADR definindo o PostgreSQL como autoridade central;
- preservação das entidades `batches`, `capture_sessions` e `readings`;
- remoção do limite global de seis lotes no domínio central;
- fechamento condicionado às confirmações da Produção e do Laboratório;
- especificação separada do PORTUS Visão Laboratório.

### 2. Fundação PostgreSQL

- schema de aplicações, usuários, setores, estações e permissões;
- catálogo de produtos e equipamentos;
- lotes versionados com etapa e dupla confirmação;
- sessões, leituras, erros de captura e histórico;
- índices e atualização automática de timestamps;
- seed das aplicações e setores de referência.

### 3. Funções de domínio

- `portus_assert_permission`;
- `open_batch`;
- `register_reading`;
- `move_batch_to_stage`;
- `confirm_production_close`;
- `confirm_laboratory_close`;
- `portus_record_batch_history`.

As mutações críticas usam transação, validação de usuário/aplicação/setor,
`SELECT ... FOR UPDATE`, incremento de versão, histórico e idempotência.

### 4. Segurança

- migration `003_security_permissions.sql`;
- remoção dos privilégios implícitos de `PUBLIC` em tabelas e sequências;
- revogação de execução pública das funções;
- alteração dos privilégios padrão para objetos futuros;
- teste SQL específico de privilégios.

As credenciais administrativas continuam restritas a migrations e manutenção.
As estações de produção deverão usar uma role de runtime criada na homologação.

### 5. Integração Electron

- pool PostgreSQL no processo principal;
- timeout e limite de conexões configuráveis;
- handlers IPC centrais isolados do renderer;
- Dashboard central para listar, abrir e confirmar lotes;
- histórico e busca por código de barras usando a base central;
- sessões e leituras da captura persistidas no PostgreSQL;
- preflight de equipamentos por nome ou código;
- bloqueio seguro quando um lote central está offline ou sem mapeamento;
- manutenção da captura física no processo principal do Electron.

### 6. Interface e identidade

- badge no cabeçalho com os estados conectado, desconectado, não configurado e
  verificando;
- verificação real com `SELECT 1` a cada 15 segundos;
- novo ícone minimalista baseado em portal e cinco canais de captura;
- favicon SVG para o renderer;
- PNG e ICO regeneráveis para aplicação e instalador.

### 7. Build e documentação

- `package-lock.json` sincronizado com `pg` e `@types/pg`;
- README refeito com instalação local sem Docker, migrations, variáveis,
  validação, captura, empacotamento e troubleshooting de conexão;
- TODO reconciliado com o código entregue;
- especificação do Laboratório restrita aos perfis Captura e Fechamento;
- capa do projeto produzida a partir da interface real.

## Validação executada

| Validação | Resultado |
|---|---|
| Teste de domínio PostgreSQL local | aprovado, com `ROLLBACK` |
| Histórico do teste de domínio | 5 eventos registrados |
| Testes Vitest | 84 de 84 aprovados |
| TypeScript main + renderer | aprovado |
| Build de produção | aprovado |
| Instalação limpa com lockfile | aprovada |

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Uso |
|---|---:|---:|---|
| `PORTUS_DATABASE_URL` | somente no modo central | — | conexão PostgreSQL |
| `PORTUS_DATABASE_POOL_MAX` | não | `5` | máximo de conexões |
| `PORTUS_DATABASE_CONNECT_TIMEOUT_MS` | não | `5000` | timeout em milissegundos |
| `PORTUS_SECTOR_CODE` | não | `PRODUCTION` | setor da estação |

## Limitações e próximos passos

Não foram declarados como concluídos:

- teste simultâneo em duas sessões PostgreSQL;
- grants de uma role física de runtime no ambiente final;
- homologação com equipamentos reais;
- definição das leituras laboratoriais obrigatórias;
- implementação do cliente PORTUS Visão Laboratório.

Esses itens exigem infraestrutura, dispositivos ou validação operacional externa.
