import { Logger } from "@nestjs/common";

import { MailService } from "./mail.service";
import { MailDeliveryError, type MailTransport } from "./mail.types";
import type { SmtpConfig } from "./smtp.config";

describe("MailService", () => {
  const config: SmtpConfig = {
    host: "localhost",
    port: 1025,
    secure: false,
    requireTLS: false,
    from: "no-reply@init.local",
    connectionTimeoutMs: 10_000,
    greetingTimeoutMs: 10_000,
    socketTimeoutMs: 20_000,
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns an SMTP receipt without exposing the message body", async () => {
    const transport: MailTransport = {
      sendMail: jest.fn().mockResolvedValue({ messageId: "mail-1", accepted: ["candidate@example.com"], rejected: [] }),
      verify: jest.fn().mockResolvedValue(true),
    };
    const service = new MailService(config, transport);

    await expect(service.send({
      kind: "SIGNUP_VERIFICATION",
      to: "candidate@example.com",
      subject: "subject",
      text: "secret verification code",
    })).resolves.toEqual({ messageId: "mail-1", acceptedCount: 1, rejectedCount: 0 });

    const logPayload = String((Logger.prototype.log as jest.Mock).mock.calls[0][0]);
    expect(logPayload).toContain("mail.delivery.succeeded");
    expect(logPayload).not.toContain("candidate@example.com");
    expect(logPayload).not.toContain("secret verification code");
  });

  it.each([
    ["EAUTH", "AUTH"],
    ["ETIMEDOUT", "TIMEOUT"],
    ["ECONNECTION", "CONNECTION"],
    ["EENVELOPE", "REJECTED"],
  ])("classifies %s SMTP failures as %s", async (code, expectedReason) => {
    const transport: MailTransport = {
      sendMail: jest.fn().mockRejectedValue(Object.assign(new Error("provider detail"), { code })),
      verify: jest.fn().mockResolvedValue(true),
    };
    const service = new MailService(config, transport);

    const error = await service.send({
      kind: "PASSWORD_RESET_VERIFICATION",
      to: "candidate@example.com",
      subject: "subject",
      text: "body",
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error.reason).toBe(expectedReason);
    const logPayload = String((Logger.prototype.error as jest.Mock).mock.calls[0][0]);
    expect(logPayload).not.toContain("candidate@example.com");
    expect(logPayload).not.toContain("provider detail");
  });

  it("verifies the SMTP connection explicitly", async () => {
    const transport: MailTransport = {
      sendMail: jest.fn(),
      verify: jest.fn().mockResolvedValue(true),
    };
    const service = new MailService(config, transport);

    await expect(service.verifyConnection()).resolves.toBeUndefined();
    expect(transport.verify).toHaveBeenCalledTimes(1);
  });
});
