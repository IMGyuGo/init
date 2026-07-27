import { Module } from "@nestjs/common";

import { MailService } from "./mail.service";
import {
  createSmtpTransport,
  loadSmtpConfig,
  SMTP_CONFIG,
  SMTP_TRANSPORT,
  type SmtpConfig,
} from "./smtp.config";

@Module({
  providers: [
    { provide: SMTP_CONFIG, useFactory: loadSmtpConfig },
    {
      provide: SMTP_TRANSPORT,
      useFactory: (config: SmtpConfig) => createSmtpTransport(config),
      inject: [SMTP_CONFIG],
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
