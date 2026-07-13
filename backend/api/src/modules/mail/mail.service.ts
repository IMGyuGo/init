import { createHash } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";

import { SMTP_CONFIG, SMTP_TRANSPORT, type SmtpConfig } from "./smtp.config";
import {
  MailDeliveryError,
  type MailFailureReason,
  type MailMessage,
  type MailTransport,
} from "./mail.types";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(SMTP_CONFIG) private readonly config: SmtpConfig,
    @Inject(SMTP_TRANSPORT) private readonly transporter: MailTransport,
  ) {}

  async send(message: MailMessage) {
    const startedAt = Date.now();
    const recipientHash = hashRecipient(message.to);

    try {
      const result = await this.transporter.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      const receipt = {
        messageId: result.messageId ?? "",
        acceptedCount: result.accepted?.length ?? 0,
        rejectedCount: result.rejected?.length ?? 0,
      };
      this.logger.log(JSON.stringify({
        event: "mail.delivery.succeeded",
        kind: message.kind,
        recipientHash,
        elapsedMs: Date.now() - startedAt,
        ...receipt,
      }));
      return receipt;
    } catch (error) {
      const failure = failureMetadata(error);
      this.logger.error(JSON.stringify({
        event: "mail.delivery.failed",
        kind: message.kind,
        recipientHash,
        elapsedMs: Date.now() - startedAt,
        ...failure,
      }));
      throw new MailDeliveryError(failure.reason, { cause: error });
    }
  }

  async verifyConnection() {
    const startedAt = Date.now();
    try {
      await this.transporter.verify();
      this.logger.log(JSON.stringify({
        event: "mail.connection.verified",
        elapsedMs: Date.now() - startedAt,
      }));
    } catch (error) {
      const failure = failureMetadata(error);
      this.logger.error(JSON.stringify({
        event: "mail.connection.failed",
        elapsedMs: Date.now() - startedAt,
        ...failure,
      }));
      throw new MailDeliveryError(failure.reason, { cause: error });
    }
  }
}

function hashRecipient(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 12);
}

function failureMetadata(error: unknown): {
  reason: MailFailureReason;
  smtpCode?: string;
  responseCode?: number;
} {
  const value = error as { code?: unknown; responseCode?: unknown };
  const smtpCode = typeof value?.code === "string" ? value.code : undefined;
  const responseCode = typeof value?.responseCode === "number" ? value.responseCode : undefined;
  let reason: MailFailureReason = "UNKNOWN";

  if (smtpCode === "EAUTH") reason = "AUTH";
  else if (smtpCode === "ETIMEDOUT") reason = "TIMEOUT";
  else if (["ECONNECTION", "ECONNREFUSED", "EDNS", "ESOCKET"].includes(smtpCode ?? "")) reason = "CONNECTION";
  else if (smtpCode === "EENVELOPE" || (responseCode !== undefined && responseCode >= 400)) reason = "REJECTED";

  return { reason, smtpCode, responseCode };
}
