# Alertas automáticos de erro (PORTUS)

O processo principal do Electron envia erros registrados por `logError` para
`lenix.camargo@gmail.com` usando Nodemailer. O log local continua sendo salvo
mesmo sem SMTP ou internet. Erros idênticos são limitados a um e-mail a cada
15 minutos por estação; até 25 alertas aguardam envio em memória.

Configure estas variáveis de ambiente **na máquina que executa o PORTUS**:

- `PORTUS_SMTP_HOST=smtp.gmail.com`
- `PORTUS_SMTP_PORT=587` (ou `465` para TLS implícito)
- `PORTUS_SMTP_USER=<conta-remetente>`
- `PORTUS_SMTP_PASSWORD=<senha-de-app-ou-credencial-smtp>`
- `PORTUS_SMTP_FROM=<email-remetente>`

Para Gmail, utilize senha de aplicativo quando disponível. Nunca inclua
credenciais no repositório, instalador, logs ou arquivos distribuídos.
Reinicie o aplicativo após configurar as variáveis de ambiente.

**Escopo:** exceções não tratadas, rejeições de Promise, falhas de preload
e demais caminhos que invocam `logError` (inclusive erros reportados pelo
renderer). Respostas de validação esperadas que não geram `logError`
não são tratadas como falhas críticas. Para cobrir falhas de domínio
adicionais, registre-as explicitamente com `logError`.

**Privacidade:** os alertas incluem nome da máquina, stack e até 30
entradas de log, com mascaramento básico de segredos. Não registre
dados pessoais ou credenciais em mensagens de erro; o mascaramento
não substitui essa proteção. O envio depende de conexão SMTP.
