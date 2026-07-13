import { loadSmtpConfig } from "./smtp.config";

describe("SMTP configuration", () => {
  const production = {
    NODE_ENV: "production",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_REQUIRE_TLS: "true",
    SMTP_USER: "smtp-user",
    SMTP_PASS: "smtp-pass",
    SMTP_FROM: "no-reply@example.com",
  } as NodeJS.ProcessEnv;

  it("supports provider-neutral STARTTLS configuration", () => {
    expect(loadSmtpConfig(production)).toMatchObject({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeoutMs: 10_000,
      greetingTimeoutMs: 10_000,
      socketTimeoutMs: 20_000,
    });
  });

  it("supports implicit TLS", () => {
    expect(loadSmtpConfig({ ...production, SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_REQUIRE_TLS: "false" }))
      .toMatchObject({ port: 465, secure: true, requireTLS: false });
  });

  it("rejects unencrypted production SMTP", () => {
    expect(() => loadSmtpConfig({ ...production, SMTP_REQUIRE_TLS: "false" }))
      .toThrow("Production SMTP must use implicit TLS or require STARTTLS");
  });

  it("rejects partial credentials and invalid timeout values", () => {
    expect(() => loadSmtpConfig({ ...production, SMTP_PASS: "" }))
      .toThrow("SMTP_USER and SMTP_PASS must be configured together");
    expect(() => loadSmtpConfig({ ...production, SMTP_SOCKET_TIMEOUT_MS: "zero" }))
      .toThrow("SMTP_SOCKET_TIMEOUT_MS must be a positive integer");
  });

  it("keeps Mailpit defaults for local and test environments", () => {
    expect(loadSmtpConfig({ NODE_ENV: "test" })).toMatchObject({
      host: "localhost",
      port: 1025,
      secure: false,
      requireTLS: false,
      from: "no-reply@init.local",
    });
  });
});
