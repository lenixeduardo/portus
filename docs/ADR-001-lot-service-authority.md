# ADR-001 — Autoridade central para o domínio de lotes

- **Status:** Accepted for implementation
- **Date:** 2026-09-09
- **Scope:** Etapa 0 do plano de evolução do PORTUS
- **Owners:** PORTUS / domínio de lotes

## Contexto

A versão atual do PORTUS é um aplicativo Electron local. O estado de lotes é persistido em
`sql.js`, e as operações de abertura e fechamento são executadas diretamente pelos
handlers IPC. Esse desenho atende uma máquina, mas não garante uma decisão única quando
mais de um computador ou software manipula o mesmo lote ou linha.

O escopo acordado prevê um PostgreSQL central, regras de lote entre Produção e Laboratório,
controle de concorrência, auditoria e migração progressiva do PORTUS.

## Decisão

O domínio de lotes terá uma única autoridade de escrita: o **Lot Service**, apoiado por um
PostgreSQL central e transacional.

PORTUS e futuros clientes:

- enviam comandos de domínio ao Lot Service;
- consultam o estado autoritativo por API;
- não executam escrita direta nas tabelas centrais;
- não mantêm escritores paralelos durante a migração.

Durante a coexistência, o banco local do PORTUS poderá continuar como leitura, cache ou
armazenamento temporário de funcionalidades ainda não migradas. A escrita autoritativa dos
comandos de lote deverá ser centralizada primeiro; as leituras serão migradas depois.

## Regras obrigatórias

1. Toda operação de domínio recebe um `command_id` global e idempotente.
2. Toda alteração de lote utiliza controle de versão otimista (`version`).
3. Abertura, fechamento, estado da linha, auditoria e outbox são gravados na mesma transação.
4. O limite de seis lotes abertos deve ser protegido no banco/serviço, não somente na UI.
5. A identidade global do lote não depende do ID local existente no PORTUS.
6. Nenhuma solução de `dual-write` será usada como caminho permanente.
7. Operação offline para abrir, fechar ou transferir lotes não faz parte da primeira entrega.
8. Correções administrativas geram histórico; não apagam a transição anterior.

## Consequências

### Positivas

- Uma única decisão para concorrência entre PORTUS e Software B.
- Auditoria consistente de quem, quando, onde e qual comando foi aplicado.
- Possibilidade de evoluir clientes sem expor o schema central.
- Migração gradual com rollback por linha ou setor.

### Custos

- Introdução de um serviço e uma dependência de rede.
- Necessidade de autenticação de aplicações e operadores.
- Necessidade de migrations, observabilidade, backup e testes de concorrência.
- O banco local permanece temporariamente, exigindo uma fase de reconciliação.

## Fora do escopo desta decisão

- Desenvolvimento do Software B.
- Kafka, RabbitMQ e CDC como requisitos da primeira entrega.
- Operação offline com múltiplos escritores.
- Event Sourcing completo.
- Banco distribuído multi-site.

## Critério de validação

A decisão será considerada validada quando testes concorrentes comprovarem que:

- somente uma abertura concorrente na mesma linha é confirmada;
- o sétimo lote aberto é rejeitado;
- repetir o mesmo `command_id` não duplica efeito;
- uma versão antiga não sobrescreve uma versão mais nova;
- cada resultado gera registro de auditoria.
