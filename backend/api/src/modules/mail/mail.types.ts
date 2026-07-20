export type MailKind =
  | "SIGNUP_VERIFICATION"
  | "PASSWORD_RESET_VERIFICATION"
  | "PUBLIC_APPLICATION_STATUS"
  | "RECRUITING_PASS_NOTICE"
  | "SCREENING_RESULT_NOTICE"
  | "SMTP_SMOKE";

export type MailMessage = {
  kind: MailKind;
  to: string;
  subject: string;
  text: string;
};

export type MailTransport = {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<{
    messageId?: string;
    accepted?: unknown[];
    rejected?: unknown[];
  }>;
  verify(): Promise<unknown>;
};

export type MailFailureReason = "AUTH" | "CONNECTION" | "TIMEOUT" | "REJECTED" | "UNKNOWN";

export class MailDeliveryError extends Error {
  constructor(
    readonly reason: MailFailureReason,
    options?: ErrorOptions,
  ) {
    super("SMTP delivery failed", options);
    this.name = "MailDeliveryError";
  }
}
