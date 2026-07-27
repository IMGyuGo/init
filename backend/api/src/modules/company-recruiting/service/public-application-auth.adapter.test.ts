import assert from "node:assert/strict";

import { MailService } from "../../mail/mail.service";
import { PublicApplicationAuthAdapter, PublicApplicationMagicLinkStore } from "./public-application-auth.adapter";

describe("PublicApplicationAuthAdapter", () => {
  const previousRedisUrl = process.env.REDIS_URL;
  const previousFrontendOrigin = process.env.FRONTEND_ORIGIN;
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = "test";
    process.env.FRONTEND_ORIGIN = "http://localhost:3000";
  });

  afterEach(() => {
    if (previousRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousRedisUrl;
    }
    if (previousFrontendOrigin === undefined) {
      delete process.env.FRONTEND_ORIGIN;
    } else {
      process.env.FRONTEND_ORIGIN = previousFrontendOrigin;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("sends a public application magic link and verifies the issued token", async () => {
    const captured: { email?: string; magicLink?: string; expiresInSeconds?: number } = {};
    const mailService = {
      async send(message: { to: string; text: string }) {
        captured.email = message.to;
        captured.magicLink = message.text.match(/http:\/\/localhost:3000\/public\/recruitments\/101\/applications\/status\?token=\S+/)?.[0];
        captured.expiresInSeconds = 604800;
      },
    } as unknown as MailService;
    const adapter = new PublicApplicationAuthAdapter(new PublicApplicationMagicLinkStore(), mailService);

    const result = await adapter.requestEmailVerification({
      applicationId: 77,
      recruitmentId: 101,
      email: "candidate@example.com",
    });

    assert.equal(result.magicLinkDeliveryStatus, "SENT");
    assert.equal(result.temporary, false);
    assert.equal(captured.email, "candidate@example.com");
    assert.ok(captured.magicLink?.startsWith("http://localhost:3000/public/recruitments/101/applications/status?token="));

    const token = new URL(captured.magicLink ?? "").searchParams.get("token");
    assert.ok(token);

    const payload = await adapter.verifyApplicationStatusToken(token);
    assert.deepEqual(payload && {
      applicationId: payload.applicationId,
      recruitmentId: payload.recruitmentId,
      email: payload.email,
      purpose: payload.purpose,
    }, {
      applicationId: 77,
      recruitmentId: 101,
      email: "candidate@example.com",
      purpose: "PUBLIC_APPLICATION_STATUS",
    });
    assert.equal(await adapter.verifyApplicationStatusToken("wrong-token"), null);
  });

  it("returns failed delivery status when SMTP sending fails", async () => {
    const mailService = {
      async send() {
        throw new Error("smtp unavailable");
      },
    } as unknown as MailService;
    const adapter = new PublicApplicationAuthAdapter(new PublicApplicationMagicLinkStore(), mailService);

    const result = await adapter.requestEmailVerification({
      applicationId: 77,
      recruitmentId: 101,
      email: "candidate@example.com",
    });

    assert.equal(result.magicLinkDeliveryStatus, "FAILED");
  });

  it("does not send a magic link when token storage fails", async () => {
    let mailSent = false;
    const mailService = {
      async send() {
        mailSent = true;
      },
    } as unknown as MailService;
    const magicLinkStore = {
      expiresInSeconds: 604800,
      async issueApplicationStatusToken() {
        throw new Error("redis unavailable");
      },
      async verifyApplicationStatusToken() {
        return null;
      },
    } as unknown as PublicApplicationMagicLinkStore;
    const adapter = new PublicApplicationAuthAdapter(magicLinkStore, mailService);

    const result = await adapter.requestEmailVerification({
      applicationId: 77,
      recruitmentId: 101,
      email: "candidate@example.com",
    });

    assert.equal(result.magicLinkDeliveryStatus, "FAILED");
    assert.equal(mailSent, false);
  });
});
