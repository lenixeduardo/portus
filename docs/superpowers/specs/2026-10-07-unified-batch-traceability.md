# PORTUS — Lote único, rastreabilidade por usuário/estação e finalização supervisionada

Data: 07/10/2026

## Objetivo

Transformar o lote em uma entidade única e compartilhada entre Produção e Laboratório. O login identifica quem executou a ação; a estação identifica em qual computador físico a ação ocorreu.

## Regras funcionais

1. Produção e Laboratório podem abrir o mesmo tipo de lote.
2. Operador e Analista podem realizar leituras em qualquer computador configurado.
3. Cada leitura deve registrar: data/hora, equipamento/análise, resultado, login, nome do responsável, setor lógico do usuário e estação física.
4. A estação é independente do perfil do usuário. Exemplo válido: Analista do Laboratório executando leitura em PRODUCAO-01.
5. O lote possui um único marcador `Lote concluído`.
6. Marcar `Lote concluído` não fecha administrativamente o lote.
7. Somente `supervisor` ou `master` podem finalizar o lote.
8. Supervisor não realiza captura/análise.
9. Master possui acesso operacional completo, inclusive leituras de teste.
10. Somente `supervisor` ou `master` podem reabrir lote finalizado.
11. A reabertura nunca apaga leituras ou auditoria anteriores; inicia novo ciclo e remove apenas o estado de conclusão.
12. O histórico deve permanecer cronológico e imutável.
13. A folha de rastreabilidade deve apresentar abertura, leituras/análises, conclusão, finalização e reabertura em ordem cronológica.
14. A folha deve exibir para cada leitura: Data/Hora, Setor, Análise, Resultado, Responsável, Login e Computador.
15. A identificação do computador é configurada localmente por `station_code` e `station_sector_code`.

## Estados

- `open + completed=false`: lote em andamento.
- `open + completed=true`: lote concluído operacionalmente, aguardando Supervisor/Master.
- `closed`: lote finalizado.
- Ao reabrir: `status=open` e `completed=false`.

## Perfis

| Ação | Operador | Analista/Lab | Admin | Supervisor | Master |
| --- | --- | --- | --- | --- | --- |
| Consultar lote | Sim | Sim | Sim | Sim | Sim |
| Abrir lote | Sim | Sim | Sim | Não | Sim |
| Capturar/analisar | Sim | Sim | Sim | Não | Sim |
| Marcar lote concluído | Sim | Sim | Sim | Não | Sim |
| Finalizar lote | Não | Não | Não | Sim | Sim |
| Reabrir lote | Não | Não | Não | Sim | Sim |
| Configurações administrativas | Não | Não | Sim | Não | Sim |

## Critérios de aceite

- Uma leitura feita por Analista em PRODUCAO-01 aparece como Laboratório + login do analista + PRODUCAO-01.
- Uma leitura feita por Operador em LABORATORIO-01 aparece como Produção + login do operador + LABORATORIO-01.
- Lote concluído continua aceitando consulta e aguarda finalização do Supervisor/Master.
- Operador, Analista e Admin não conseguem finalizar.
- Supervisor não consegue iniciar captura.
- Master consegue capturar e finalizar.
- Reabertura preserva todas as leituras anteriores.
- Relatório/folha de impressão apresenta a sequência cronológica completa.
