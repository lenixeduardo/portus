# PORTUS — Documento de Contexto para IA

> **Para que serve este arquivo:** dar a qualquer assistente de IA o entendimento
> completo do **produto** PORTUS — a dor que ele resolve, como resolve e por que é
> fácil de manter — sem depender de detalhes de implementação.
> Use-o para explicar, apresentar, treinar operadores, responder dúvidas de
> clientes ou redigir materiais sobre o PORTUS.
>
> **Escopo:** este documento é deliberadamente **livre de stack técnica de
> desenvolvimento**. Não descreve linguagens, bibliotecas, frameworks ou estrutura
> de código. Para isso existem `CLAUDE.md`, `README.md` e os demais arquivos de
> `docs/`.

---

## 1. Resumo em uma frase

**PORTUS é o sistema que elimina a anotação manual de leituras no laboratório
industrial: o operador aperta PRINT no equipamento e o valor já entra registrado,
carimbado com data, hora, operador, fórmula e lote.**

---

## 2. A dor que o PORTUS resolve

### 2.1 O cenário sem PORTUS

Num laboratório de controle de qualidade industrial, cada lote produzido precisa
ser medido em vários equipamentos de bancada — balança, pH-metro, viscosímetro,
espectrofotômetro, refratômetro. O fluxo tradicional é:

1. O operador mede a amostra no equipamento.
2. Lê o número no visor.
3. **Anota em papel** (ou digita numa planilha).
4. Repete para os outros equipamentos.
5. No fim do turno, alguém **transcreve** o papel para o sistema.

### 2.2 O que dói nesse cenário

| Dor | O que acontece na prática |
|---|---|
| **Erro de transcrição** | Um dígito trocado (`7.23` → `7.32`) vira decisão errada de processo, retrabalho ou lote descartado. |
| **Dado sem rastreabilidade** | O papel diz "pH 7.2", mas não diz *quando*, *quem mediu*, *em qual equipamento* nem *de qual lote*. |
| **Retrabalho de digitação** | O mesmo número é escrito duas ou três vezes até chegar ao sistema. Tempo puro de operador consumido. |
| **Perda de histórico** | Só o valor "final" sobrevive. Leituras intermediárias, repetições e medições descartadas somem — e são justamente elas que explicam um desvio. |
| **Auditoria frágil** | Numa auditoria de qualidade, a evidência é uma caderneta. Não há prova de que o número veio do equipamento e não da caneta. |
| **Dependência de pessoas** | O processo funciona porque "o Zé sabe fazer". Quem entra novo demora semanas para não errar. |

### 2.3 Quem sente a dor

- **Operador de laboratório** — quer medir e seguir, não preencher formulário.
- **Supervisor de qualidade** — precisa provar que o lote foi medido e como.
- **Gestor de produção** — precisa de histórico confiável para decidir.
- **Auditoria / certificação** — precisa de rastreabilidade íntegra e verificável.

---

## 3. Como o PORTUS resolve

### 3.1 Princípio central

> **O número nunca é digitado. Ele vem do equipamento.**

O PORTUS conversa diretamente com os equipamentos de bancada pelo cabo de
comunicação já existente neles. Quando o operador aperta o botão **PRINT**
(ou equivalente) do aparelho, o valor viaja pelo cabo e é gravado
automaticamente — sem passar por papel, olho humano ou teclado.

### 3.2 O fluxo do operador, ponta a ponta

```
Login  →  Abrir lote  →  Iniciar leitura  →  Apertar PRINT em cada
equipamento  →  Valores entram sozinhos  →  Finalizar lote
```

1. **Login.** Por usuário e senha, ou passando o **crachá no leitor de código de
   barras** — na fábrica, com luva, isso importa.
2. **Lotes ativos.** A tela principal mostra até **6 lotes abertos ao mesmo
   tempo**, lado a lado. É o painel de trabalho do turno.
3. **Criar fórmula / criar lote.** A *fórmula* é a receita do produto; o *lote* é
   uma produção concreta daquela fórmula. Todo dado nasce amarrado aos dois.
   O código do lote pode ser **lido por código de barras** ou gerado
   automaticamente.
4. **Iniciar leitura.** O operador escolhe quais equipamentos vão participar e o
   sistema abre a **janela de captura** — um período cronometrado (padrão 30
   segundos, configurável) em que o PORTUS fica "ouvindo" os equipamentos.
5. **Apertar PRINT.** O operador percorre as bancadas e aperta PRINT em cada
   aparelho. Cada valor recebido acende o indicador daquele equipamento na tela
   e é gravado na hora.
6. **Fim da janela.** O tempo expira (ou o operador cancela) e as conexões se
   fecham sozinhas. Nada fica aberto por esquecimento.
7. **Repetir quantas vezes precisar.** O mesmo lote aceita **várias sessões de
   captura**. Mediu de novo? É uma nova sessão, registrada separadamente, sem
   apagar a anterior.
8. **Finalizar lote.** O lote é encerrado e o histórico fica selado.

### 3.3 As decisões de projeto que atacam cada dor

| Dor | Resposta do PORTUS |
|---|---|
| Erro de transcrição | O valor vem do equipamento. Ninguém digita. |
| Dado sem contexto | Toda leitura carrega **lote, fórmula, equipamento, operador, data e hora**. |
| Perda de histórico | **Todas** as leituras da janela são gravadas, não só a última — inclusive as repetidas. O sistema guarda também o **texto original enviado pelo equipamento**, além do número interpretado. |
| Auditoria frágil | O histórico é organizado por sessão de captura, mostra quem abriu o lote e quando, e **exporta em CSV** para anexar a relatórios. |
| Equipamento com defeito | Se um aparelho ou cabo falhar, o indicador daquele slot fica **vermelho** e os outros cinco continuam medindo normalmente. A sessão não é perdida. Há ainda um **canal reserva** para assumir o lugar de um que falhou. |
| Dependência de pessoas | A tela guia o operador: contagem regressiva visível, um indicador colorido por equipamento, mensagens em português. Treinamento é de minutos, não de semanas. |

### 3.4 O que o operador vê durante a captura

Uma janela com **contagem regressiva** e um painel com um bloco por
equipamento. Cada bloco tem uma cor de estado:

| Cor | Significado |
|---|---|
| **Cinza** | Aguardando — o equipamento está pronto, ninguém apertou PRINT ainda. |
| **Verde** | Leitura recebida e gravada. |
| **Amarelo** | Chegou informação, mas fora do formato esperado — atenção. |
| **Vermelho** | Falha de comunicação com aquele equipamento. |

O operador entende o estado do laboratório inteiro em um olhar, de longe, sem ler
texto.

### 3.5 O que fica registrado de cada leitura

- O **valor interpretado** (o número limpo, pronto para relatório).
- O **texto cru** exatamente como o equipamento mandou (a evidência).
- **Qual equipamento**, **qual lote**, **qual fórmula**.
- **Qual operador** e **em que data e hora**.
- **Qual sessão de captura** — permitindo separar "primeira medição" de
  "remedição".

É essa combinação que transforma um número solto em **prova auditável**.

---

## 4. Por que o PORTUS é fácil de manter

Esta seção é sobre **manutenção operacional** — o que a fábrica precisa fazer para
manter o sistema vivo no dia a dia — não sobre manutenção de código.

### 4.1 Instalação simples e autocontida

- É um **programa instalado na máquina do laboratório**. Instala e abre.
- **Não depende de servidor, nuvem, internet ou rede corporativa.** Se a internet
  cair, a fábrica não para de medir.
- Não exige banco de dados instalado à parte, nem licença de terceiros, nem
  equipe de TI dedicada para subir ambiente.

### 4.2 Configuração sem programador

Tudo o que muda com o tempo é **configurável por tela**, por um usuário
administrador:

- **Equipamentos** — quais aparelhos existem, em qual canal cada um está ligado,
  em que velocidade conversam, e **como interpretar o que eles enviam**. O
  sistema **detecta e lista os canais disponíveis** na máquina, então o
  administrador escolhe de uma lista em vez de adivinhar.
- **Tempo da janela de captura** — de 5 a 600 segundos.
- **Usuários** — criar, trocar senha, remover, com proteções contra remover o
  último administrador ou um usuário que já tem histórico vinculado.
- **Fórmulas e produtos** — cadastro próprio, sem intervenção técnica.

**Trocar um equipamento de marca não é um projeto de software.** É reconfigurar a
regra de leitura daquele aparelho numa tela e testar. O PORTUS já vem com regras
sugeridas para os tipos mais comuns (balança, pH, viscosímetro,
espectrofotômetro).

### 4.3 Os dados se cuidam sozinhos

- **Backup automático** do banco de dados na inicialização e **a cada 6 horas**.
- Pasta de destino **configurável** (padrão: `Documentos/PORTUS/backups`).
- **Retenção automática**: guarda os N backups mais recentes (padrão 10) e apaga
  os antigos — o disco não enche sozinho.
- Botão **"Fazer backup agora"** para o momento antes de qualquer mexida.
- **Restaurar é copiar um arquivo de volta.** Não há procedimento de recuperação
  complexo.

### 4.4 Tolerância a falha embutida

O sistema foi desenhado assumindo que **hardware industrial falha**:

- Falha em um equipamento **não derruba** a sessão nem os outros equipamentos.
- Há **tentativas automáticas de reconexão** antes de marcar um canal como
  perdido.
- Existe um **canal reserva** para substituir um que falhou.
- Um equipamento problemático pode ser **desabilitado com um clique** e o
  laboratório segue operando com os demais.

Consequência prática: um cabo solto vira um quadrado vermelho na tela, não um
chamado de suporte.

### 4.5 Diagnóstico ao alcance do operador

- A própria tela é o painel de diagnóstico: o quadrado vermelho **aponta o
  equipamento** com problema.
- Há um botão de **reportar erro ao suporte** dentro do aplicativo — o operador
  descreve o que aconteceu sem precisar montar e-mail com print.
- Antes de haver equipamento físico disponível, o sistema pode ser demonstrado e
  validado com **leituras simuladas**, o que torna treinamento e testes possíveis
  em qualquer máquina.

### 4.6 Atualizar é reinstalar

Uma versão nova é um instalador novo. Os dados ficam guardados fora do programa,
então atualizar **não apaga histórico**. Não há migração manual de planilhas, nem
janela de manutenção negociada com produção.

---

## 5. Vocabulário do PORTUS

Use estes termos com precisão ao falar do produto:

| Termo | Significado |
|---|---|
| **Fórmula** | A receita do produto. (O termo "receita" foi substituído por "fórmula" para alinhar com o vocabulário industrial.) |
| **Produto** | Item cadastrado, com nome e valor de referência. |
| **Lote** | Uma produção concreta de uma fórmula. Tem código, está `aberto` ou `finalizado`. |
| **Sessão de captura** | Uma janela cronometrada de escuta dos equipamentos dentro de um lote. Um lote pode ter várias. |
| **Leitura** | Um valor recebido de um equipamento, gravado com todo o seu contexto. |
| **Slot / canal** | A posição de um equipamento no painel de captura. São 6: 5 ativos + 1 reserva. |
| **Regra de interpretação** | A configuração que ensina o sistema a extrair o número de dentro do texto que o equipamento envia. |
| **Janela de captura** | O tempo (padrão 30s) em que o sistema fica ouvindo os equipamentos. |

---

## 6. O que o PORTUS **não** é

Dizer isso evita expectativa errada:

- **Não é um ERP nem um MES.** Não controla estoque, ordens de produção ou
  faturamento.
- **Não é sistema em nuvem.** Cada máquina é independente; não há sincronização
  entre computadores. Essa foi uma decisão explícita do cliente: simplicidade e
  autonomia acima de integração.
- **Não calibra equipamento.** Ele registra o que o equipamento informa; a
  calibração continua sendo responsabilidade metrológica do laboratório.
- **Não substitui o julgamento do analista.** Ele elimina a digitação, não a
  interpretação.
- **Não é multiusuário em rede.** Múltiplos usuários existem para **auditoria**
  (saber quem fez o quê), não para acesso simultâneo remoto.

---

## 7. Argumentos-chave (para apresentar o produto)

Quando precisar defender o PORTUS em uma frase cada:

1. **Zero digitação de resultado.** O caminho do número, do visor ao banco, não
   passa por mão humana.
2. **Rastreabilidade completa por padrão.** Todo valor sabe de qual lote, qual
   fórmula, qual equipamento, qual operador e de que segundo veio.
3. **Nada se perde.** Guarda todas as leituras da janela e o texto original do
   equipamento, não apenas o resultado final.
4. **Sobrevive à falha de hardware.** Um equipamento fora do ar não interrompe a
   medição dos outros.
5. **Roda sem internet.** Laboratório não fica refém de rede corporativa.
6. **Configurável por quem opera.** Trocar equipamento, ajustar tempo, criar
   usuário: tudo por tela.
7. **Backup automático e restauração trivial.** O histórico é protegido sem
   ninguém lembrar dele.
8. **Curva de aprendizado de minutos.** Interface em português, com semáforo
   colorido e contagem regressiva.

---

## 8. Perguntas frequentes

**"E se o equipamento não tiver saída de comunicação?"**
Ele não entra no fluxo automático. O PORTUS cobre os aparelhos que conseguem
transmitir seu resultado — que é a maioria dos equipamentos de bancada modernos.

**"E se dois operadores medirem o mesmo lote?"**
Cada um faz login com seu usuário, e cada leitura fica marcada com quem estava
logado. O lote aceita várias sessões, de operadores diferentes.

**"O operador pode adulterar um valor?"**
O valor gravado vem do equipamento e o texto original também é guardado. O
histórico registra sessão, data e hora. Alterar o número não é o caminho natural
do sistema — o caminho natural é medir de novo, e a nova medição fica registrada
como uma nova sessão, ao lado da anterior.

**"Quanto tempo leva para começar a usar?"**
Instalar, cadastrar os equipamentos com seus canais e regras de leitura, criar os
usuários e cadastrar as fórmulas. Depois disso é operação.

**"E se o computador queimar?"**
Os backups automáticos ficam em pasta configurável — que pode apontar para uma
unidade de rede ou pasta sincronizada. Restaurar é instalar o programa em outra
máquina e devolver o arquivo de backup ao lugar.

**"Dá para exportar os dados?"**
Sim. O histórico do lote exporta em **CSV**, com filtros por data e por
equipamento, incluindo operador e horário de abertura do lote.

---

## 9. Como uma IA deve usar este documento

**Faça:**
- Comece pela **dor** (seção 2) antes de descrever funcionalidade. O valor do
  PORTUS está no problema, não na lista de telas.
- Use o **vocabulário da seção 5** com exatidão — "fórmula" (não "receita"),
  "sessão de captura", "lote".
- Ao explicar para operador, use a seção 3.2 (fluxo) e 3.4 (cores).
- Ao explicar para gestor ou auditoria, use 3.5 (o que fica registrado) e 4.3
  (backup).
- Ao responder "isso é difícil de manter?", use a seção 4 inteira.

**Não faça:**
- Não cite linguagens, bibliotecas, frameworks ou nomes de arquivos de código
  para responder perguntas de produto. Se a pergunta for realmente técnica de
  desenvolvimento, encaminhe para `CLAUDE.md` e `README.md`.
- Não prometa nuvem, sincronização entre máquinas, integração com ERP ou
  relatório em PDF como se já existissem — veja a seção 6 e o `TODO.md`.
- Não invente números de desempenho, de redução de erro ou de retorno
  financeiro. Este documento não os contém porque eles não foram medidos.
