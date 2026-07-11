import { createHash, randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import Redis from "ioredis";

import { MailService } from "../../mail/mail.service";

export type PublicApplicationAuthRequest = {
  applicationId: number;
  recruitmentId: number;
  email: string;
};

export type PublicApplicationAuthResult = {
  emailVerificationStatus: "PENDING";
  nextAction: "CHECK_EMAIL";
  temporary: boolean;
  temporaryBoundary: string | null;
  magicLinkDeliveryStatus: "SENT" | "FAILED" | "NOT_SENT_TEMPORARY";
  magicLinkExpiresInSeconds: number;
};

export type PublicApplicationStatusTokenPayload = {
  applicationId: number;
  recruitmentId: number;
  email: string;
  purpose: "PUBLIC_APPLICATION_STATUS";
  createdAt: string;
};

export type PublicApplicationAuthAdapterPort = {
  requestEmailVerification(input: PublicApplicationAuthRequest): Promise<PublicApplicationAuthResult>;
  verifyApplicationStatusToken(token: string): Promise<PublicApplicationStatusTokenPayload | null>;
};

@Injectable()
export class InMemoryPublicApplicationAuthAdapter implements PublicApplicationAuthAdapterPort {
  async requestEmailVerification(_input: PublicApplicationAuthRequest): Promise<PublicApplicationAuthResult> {
    return {
      emailVerificationStatus: "PENDING",
      nextAction: "CHECK_EMAIL",
      temporary: true,
      temporaryBoundary: "B_MODULE_PUBLIC_APPLICATION_AUTH_ADAPTER",
      magicLinkDeliveryStatus: "NOT_SENT_TEMPORARY",
      magicLinkExpiresInSeconds: 0,
    };
  }

  async verifyApplicationStatusToken(_token: string): Promise<PublicApplicationStatusTokenPayload | null> {
    return null;
  }
}

@Injectable()
export class PublicApplicationMagicLinkStore {
  private readonly ttlSeconds = parseMagicLinkTtlSeconds();
  private readonly redis =
    process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        })
      : null;
  private readonly memory = new Map<string, { expiresAt: number; value: PublicApplicationStatusTokenPayload }>();

  get expiresInSeconds() {
    return this.ttlSeconds;
  }

  async issueApplicationStatusToken(input: PublicApplicationAuthRequest) {
    const token = randomBytes(32).toString("base64url");
    const payload: PublicApplicationStatusTokenPayload = {
      applicationId: input.applicationId,
      recruitmentId: input.recruitmentId,
      email: input.email.toLowerCase(),
      purpose: "PUBLIC_APPLICATION_STATUS",
      createdAt: new Date().toISOString(),
    };
    await this.write(this.key(token), payload);
    return { token, expiresInSeconds: this.ttlSeconds };
  }

  async verifyApplicationStatusToken(token: string): Promise<PublicApplicationStatusTokenPayload | null> {
    const normalized = token.trim();
    if (!normalized) {
      return null;
    }
    return this.read(this.key(normalized));
  }

  private async read(key: string): Promise<PublicApplicationStatusTokenPayload | null> {
    const memoryValue = this.memory.get(key);
    if (memoryValue) {
      if (memoryValue.expiresAt <= Date.now()) {
        this.memory.delete(key);
        return null;
      }
      return memoryValue.value;
    }
    try {
      const raw = await this.redis?.get(key);
      return raw ? (JSON.parse(raw) as PublicApplicationStatusTokenPayload) : null;
    } catch {
      return null;
    }
  }

  private async write(key: string, value: PublicApplicationStatusTokenPayload) {
    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), "EX", this.ttlSeconds);
        return;
      } catch (error) {
        if (isProductionRuntime()) {
          throw error;
        }
      }
    }

    if (isProductionRuntime()) {
      throw new Error("PUBLIC_APPLICATION_MAGIC_LINK_STORE_UNAVAILABLE");
    }

    this.memory.set(key, { expiresAt: Date.now() + this.ttlSeconds * 1000, value });
  }

  private key(token: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return `auth:magic-link:application-status:${tokenHash}`;
  }
}

@Injectable()
export class PublicApplicationAuthAdapter implements PublicApplicationAuthAdapterPort {
  constructor(
    private readonly magicLinkStore: PublicApplicationMagicLinkStore,
    private readonly mailService: MailService,
  ) {}

  async requestEmailVerification(input: PublicApplicationAuthRequest): Promise<PublicApplicationAuthResult> {
    let issuedToken: { token: string; expiresInSeconds: number };
    try {
      issuedToken = await this.magicLinkStore.issueApplicationStatusToken(input);
    } catch {
      return {
        emailVerificationStatus: "PENDING",
        nextAction: "CHECK_EMAIL",
        temporary: false,
        temporaryBoundary: null,
        magicLinkDeliveryStatus: "FAILED",
        magicLinkExpiresInSeconds: this.magicLinkStore.expiresInSeconds,
      };
    }

    const { token, expiresInSeconds } = issuedToken;
    const magicLink = buildPublicApplicationStatusLink(input.recruitmentId, token);

    let magicLinkDeliveryStatus: PublicApplicationAuthResult["magicLinkDeliveryStatus"] = "SENT";
    try {
      await sendPublicApplicationMagicLink(this.mailService, input.email, magicLink, expiresInSeconds);
    } catch {
      magicLinkDeliveryStatus = "FAILED";
    }

    return {
      emailVerificationStatus: "PENDING",
      nextAction: "CHECK_EMAIL",
      temporary: false,
      temporaryBoundary: null,
      magicLinkDeliveryStatus,
      magicLinkExpiresInSeconds: expiresInSeconds,
    };
  }

  async verifyApplicationStatusToken(token: string): Promise<PublicApplicationStatusTokenPayload | null> {
    return this.magicLinkStore.verifyApplicationStatusToken(token);
  }
}

function buildPublicApplicationStatusLink(recruitmentId: number, token: string) {
  const origin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
  const url = new URL(`/public/recruitments/${recruitmentId}/applications/status`, origin);
  url.searchParams.set("token", token);
  return url.toString();
}

async function sendPublicApplicationMagicLink(
  mailService: MailService,
  email: string,
  magicLink: string,
  expiresInSeconds: number,
) {
  const expiresInHours = Math.max(1, Math.ceil(expiresInSeconds / 3600));
  await mailService.send({
    kind: "PUBLIC_APPLICATION_STATUS",
    to: email,
    subject: "INIT 지원 현황 확인 링크",
    text: [
      "지원서가 접수되었습니다.",
      "",
      "아래 링크로 지원 현황과 면접 안내를 확인할 수 있습니다.",
      magicLink,
      "",
      `이 링크는 발급 후 약 ${expiresInHours}시간 동안 사용할 수 있습니다.`,
    ].join("\n"),
  });
}

function parseMagicLinkTtlSeconds() {
  const value = Number(process.env.PUBLIC_APPLICATION_MAGIC_LINK_TTL_SECONDS ?? 60 * 60 * 24 * 7);
  if (!Number.isFinite(value) || value <= 0) {
    return 60 * 60 * 24 * 7;
  }
  return Math.floor(value);
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}
