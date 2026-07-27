import { Injectable } from "@nestjs/common";
import Redis from "ioredis";
import type { VerificationPurpose } from "./auth.types";

type VerificationRecord = {
  code: string;
  issueId: string;
  attempts: number;
  verified: boolean;
};

const ISSUE_SCRIPT = `
if redis.call("EXISTS", KEYS[2]) == 1 then
  return 0
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
redis.call("SET", KEYS[2], ARGV[3], "EX", ARGV[4])
return 1
`;

const CLEAR_IF_OWNED_SCRIPT = `
local deleted = 0
local raw = redis.call("GET", KEYS[1])
if raw then
  local record = cjson.decode(raw)
  if record.issueId == ARGV[1] then
    deleted = deleted + redis.call("DEL", KEYS[1])
  end
end
if redis.call("GET", KEYS[2]) == ARGV[1] then
  deleted = deleted + redis.call("DEL", KEYS[2])
end
return deleted
`;

const UPDATE_IF_OWNED_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then
  return 0
end
local current = cjson.decode(raw)
if current.issueId ~= ARGV[1] then
  return 0
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl > 0 then
  redis.call("SET", KEYS[1], ARGV[2], "PX", ttl)
elseif ttl == -1 then
  redis.call("SET", KEYS[1], ARGV[2])
else
  return 0
end
return 1
`;

@Injectable()
export class VerificationCodeStore {
  private readonly ttlSeconds = 300;
  private readonly cooldownSeconds = 60;
  private readonly redis =
    process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        })
      : null;
  private redisConnectPromise: Promise<void> | null = null;
  private readonly memory = new Map<string, { expiresAt: number; value: VerificationRecord }>();
  private readonly cooldownMemory = new Map<string, { expiresAt: number; issueId: string }>();

  constructor() {
    this.redis?.on("error", () => undefined);
  }

  async issue(email: string, purpose: VerificationPurpose, code: string, issueId: string) {
    const codeKey = this.key(email, purpose);
    const cooldownKey = this.cooldownKey(email, purpose);
    const record: VerificationRecord = { code, issueId, attempts: 0, verified: false };

    const redis = await this.redisClient();
    if (redis) {
      const result = await redis.eval(
        ISSUE_SCRIPT,
        2,
        codeKey,
        cooldownKey,
        JSON.stringify(record),
        String(this.ttlSeconds),
        issueId,
        String(this.cooldownSeconds),
      );
      return Number(result) === 1;
    }

    const now = Date.now();
    const cooldown = this.cooldownMemory.get(cooldownKey);
    if (cooldown && cooldown.expiresAt > now) return false;
    this.cooldownMemory.delete(cooldownKey);
    this.memory.set(codeKey, { expiresAt: now + this.ttlSeconds * 1000, value: record });
    this.cooldownMemory.set(cooldownKey, { expiresAt: now + this.cooldownSeconds * 1000, issueId });
    return true;
  }

  async get(email: string, purpose: VerificationPurpose): Promise<VerificationRecord | null> {
    return this.read(this.key(email, purpose));
  }

  async markVerified(email: string, purpose: VerificationPurpose, record: VerificationRecord) {
    return this.updateIfOwned(this.key(email, purpose), record.issueId, { ...record, verified: true });
  }

  async incrementAttempts(email: string, purpose: VerificationPurpose, record: VerificationRecord) {
    return this.updateIfOwned(
      this.key(email, purpose),
      record.issueId,
      { ...record, attempts: record.attempts + 1 },
    );
  }

  async delete(email: string, purpose: VerificationPurpose) {
    const key = this.key(email, purpose);
    const redis = await this.redisClient();
    if (redis) {
      await redis.del(key);
      return;
    }
    this.memory.delete(key);
  }

  async clearIfOwned(email: string, purpose: VerificationPurpose, issueId: string) {
    const codeKey = this.key(email, purpose);
    const cooldownKey = this.cooldownKey(email, purpose);
    const redis = await this.redisClient();
    if (redis) {
      await redis.eval(CLEAR_IF_OWNED_SCRIPT, 2, codeKey, cooldownKey, issueId);
      return;
    }

    if (this.memory.get(codeKey)?.value.issueId === issueId) this.memory.delete(codeKey);
    if (this.cooldownMemory.get(cooldownKey)?.issueId === issueId) this.cooldownMemory.delete(cooldownKey);
  }

  async hasCooldown(email: string, purpose: VerificationPurpose) {
    const key = this.cooldownKey(email, purpose);
    const redis = await this.redisClient();
    if (redis) return (await redis.exists(key)) === 1;

    const cooldown = this.cooldownMemory.get(key);
    if (!cooldown) return false;
    if (cooldown.expiresAt > Date.now()) return true;
    this.cooldownMemory.delete(key);
    return false;
  }

  private async read(key: string): Promise<VerificationRecord | null> {
    const redis = await this.redisClient();
    if (redis) {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as VerificationRecord) : null;
    }

    const memoryValue = this.memory.get(key);
    if (!memoryValue) return null;
    if (memoryValue.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return memoryValue.value;
  }

  private async updateIfOwned(key: string, issueId: string, value: VerificationRecord) {
    const redis = await this.redisClient();
    if (redis) {
      const result = await redis.eval(UPDATE_IF_OWNED_SCRIPT, 1, key, issueId, JSON.stringify(value));
      return Number(result) === 1;
    }

    const current = this.memory.get(key);
    if (!current) return false;
    if (current.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return false;
    }
    if (current.value.issueId !== issueId) return false;
    this.memory.set(key, { expiresAt: current.expiresAt, value });
    return true;
  }

  private async redisClient() {
    if (!this.redis) return null;
    if (this.redis.status === "wait" && !this.redisConnectPromise) {
      const connecting = this.redis.connect();
      this.redisConnectPromise = connecting.finally(() => {
        this.redisConnectPromise = null;
      });
    }
    if (this.redisConnectPromise) await this.redisConnectPromise;
    return this.redis;
  }

  private key(email: string, purpose: VerificationPurpose) {
    return `auth:code:${purpose}:${email.toLowerCase()}`;
  }

  private cooldownKey(email: string, purpose: VerificationPurpose) {
    return `auth:cooldown:${purpose}:${email.toLowerCase()}`;
  }
}
