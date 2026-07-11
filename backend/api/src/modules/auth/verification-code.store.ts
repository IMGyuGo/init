import { Injectable } from "@nestjs/common";
import Redis from "ioredis";
import type { VerificationPurpose } from "./auth.types";

type VerificationRecord = {
  code: string;
  attempts: number;
  verified: boolean;
};

@Injectable()
export class VerificationCodeStore {
  private readonly ttlSeconds = 300;
  private readonly redis =
    process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        })
      : null;
  private readonly memory = new Map<string, { expiresAt: number; value: VerificationRecord }>();

  async set(email: string, purpose: VerificationPurpose, code: string) {
    await this.write(this.key(email, purpose), { code, attempts: 0, verified: false });
  }

  async get(email: string, purpose: VerificationPurpose): Promise<VerificationRecord | null> {
    return this.read(this.key(email, purpose));
  }

  async markVerified(email: string, purpose: VerificationPurpose, record: VerificationRecord) {
    await this.write(this.key(email, purpose), { ...record, verified: true });
  }

  async incrementAttempts(email: string, purpose: VerificationPurpose, record: VerificationRecord) {
    await this.write(this.key(email, purpose), { ...record, attempts: record.attempts + 1 });
  }

  async delete(email: string, purpose: VerificationPurpose) {
    const key = this.key(email, purpose);
    this.memory.delete(key);
    try {
      await this.redis?.del(key);
    } catch {
      // Memory fallback is enough for local/test when Redis is unavailable.
    }
  }

  async clear(email: string, purpose: VerificationPurpose) {
    const codeKey = this.key(email, purpose);
    const cooldownKey = this.cooldownKey(email, purpose);
    this.memory.delete(codeKey);
    this.memory.delete(cooldownKey);
    try {
      await this.redis?.del(codeKey, cooldownKey);
    } catch {
      // SMTP failure must still clear the local fallback and return a delivery error.
    }
  }

  async setCooldown(email: string, purpose: VerificationPurpose) {
    const key = this.cooldownKey(email, purpose);
    this.memory.set(key, { expiresAt: Date.now() + 60_000, value: { code: "1", attempts: 0, verified: false } });
    try {
      await this.redis?.set(key, "1", "EX", 60);
    } catch {
      // fall back to memory
    }
  }

  async hasCooldown(email: string, purpose: VerificationPurpose) {
    const key = this.cooldownKey(email, purpose);
    const memoryValue = this.memory.get(key);
    if (memoryValue && memoryValue.expiresAt > Date.now()) return true;
    try {
      return (await this.redis?.exists(key)) === 1;
    } catch {
      return false;
    }
  }

  private async read(key: string): Promise<VerificationRecord | null> {
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
      return raw ? (JSON.parse(raw) as VerificationRecord) : null;
    } catch {
      return null;
    }
  }

  private async write(key: string, value: VerificationRecord) {
    this.memory.set(key, { expiresAt: Date.now() + this.ttlSeconds * 1000, value });
    try {
      await this.redis?.set(key, JSON.stringify(value), "EX", this.ttlSeconds);
    } catch {
      // fall back to memory
    }
  }

  private key(email: string, purpose: VerificationPurpose) {
    return `auth:code:${purpose}:${email.toLowerCase()}`;
  }

  private cooldownKey(email: string, purpose: VerificationPurpose) {
    return `auth:cooldown:${purpose}:${email.toLowerCase()}`;
  }
}
