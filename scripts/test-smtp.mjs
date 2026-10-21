import nodemailer from "nodemailer";

const required = ["PORTUS_SMTP_HOST", "PORTUS_SMTP_USER", "PORTUS_SMTP_PASSWORD", "PORTUS_SMTP_FROM"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error("SMTP não configurado. Configure os GitHub Actions Secrets: " + missing.join(", "));
  process.exitCode = 2;
} else {
  const port = Number(process.env.PORTUS_SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.PORTUS_SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.PORTUS_SMTP_USER, pass: process.env.PORTUS_SMTP_PASSWORD },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 15000
  });
  try {
    await transport.verify();
    console.log("SMTP: conexão e autenticação aprovadas.");
    const result = await transport.sendMail({
      from: process.env.PORTUS_SMTP_FROM,
      to: "lenix.camargo@gmail.com",
      subject: "[PORTUS] Teste SMTP — GitHub Actions",
      text: "Teste controlado de envio SMTP do PORTUS.\nWorkflow: " +
        (process.env.GITHUB_WORKFLOW || "manual") +
        "\nExecução: " + (process.env.GITHUB_RUN_ID || "local") +
        "\nData UTC: " + new Date().toISOString()
    });
    if (!result.accepted?.includes("lenix.camargo@gmail.com")) {
      throw new Error("Destinatário não aceito pelo servidor SMTP.");
    }
    console.log("SMTP: mensagem aceita pelo servidor para o destinatário configurado.");
    console.log("Verifique a caixa de entrada para confirmar a entrega final.");
  } catch (error) {
    // Do not print SMTP exception objects: some transports include credentials or payloads.
    console.error("SMTP: conexão, autenticação ou envio falhou. Verifique Secrets, conectividade e configuração da conta.");
    process.exitCode = 1;
  } finally {
    transport.close();
  }
}
