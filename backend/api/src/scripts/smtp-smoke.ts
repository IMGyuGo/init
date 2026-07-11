import { MailService } from "../modules/mail/mail.service";
import { MailDeliveryError } from "../modules/mail/mail.types";
import { createSmtpTransport, loadSmtpConfig } from "../modules/mail/smtp.config";

async function main() {
  const config = loadSmtpConfig();
  if (!config.smokeTo) {
    throw new Error("SMTP_SMOKE_TO is required for the SMTP smoke test");
  }

  const mailService = new MailService(config, createSmtpTransport(config));
  await mailService.verifyConnection();
  await mailService.send({
    kind: "SMTP_SMOKE",
    to: config.smokeTo,
    subject: `INIT SMTP smoke ${new Date().toISOString()}`,
    text: "INIT SMTP 연결 및 발송 검증 메일입니다.",
  });
}

void main().catch((error: unknown) => {
  const message = error instanceof MailDeliveryError
    ? `SMTP smoke failed: ${error.reason}`
    : error instanceof Error
      ? error.message
      : "SMTP smoke failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
