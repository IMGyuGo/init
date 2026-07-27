const mockValues = new Map<string, string>();

jest.mock("ioredis", () => {
  class MockRedis {
    status = "wait";

    on = jest.fn();

    connect = jest.fn(async () => {
      this.status = "ready";
    });

    eval = jest.fn(async (script: string, numberOfKeys: number, ...args: unknown[]) => {
      if (script.includes("KEEPTTL")) {
        throw new Error("ERR Error running script: @user_script:10: ERR syntax error");
      }

      const keys = args.slice(0, numberOfKeys).map(String);
      const argv = args.slice(numberOfKeys).map(String);

      if (numberOfKeys === 2 && script.includes("EXISTS")) {
        const [codeKey, cooldownKey] = keys;
        if (mockValues.has(cooldownKey)) {
          return 0;
        }
        mockValues.set(codeKey, argv[0]);
        mockValues.set(cooldownKey, argv[2]);
        return 1;
      }

      if (numberOfKeys === 1 && script.includes("cjson.decode")) {
        const [codeKey] = keys;
        const raw = mockValues.get(codeKey);
        if (!raw) {
          return 0;
        }
        const current = JSON.parse(raw) as { issueId?: string };
        if (current.issueId !== argv[0]) {
          return 0;
        }
        mockValues.set(codeKey, argv[1]);
        return 1;
      }

      return 0;
    });

    get = jest.fn(async (key: string) => mockValues.get(key) ?? null);
  }

  return { __esModule: true, default: MockRedis };
});

import { VerificationCodeStore } from "./verification-code.store";

describe("VerificationCodeStore Redis scripts", () => {
  const previousRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    mockValues.clear();
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterAll(() => {
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
  });

  it("updates verification records on Redis servers without SET KEEPTTL support", async () => {
    const store = new VerificationCodeStore();

    await expect(store.issue("candidate@example.com", "SIGNUP", "123456", "issue-a")).resolves.toBe(true);
    const record = await store.get("candidate@example.com", "SIGNUP");

    await expect(store.markVerified("candidate@example.com", "SIGNUP", record!)).resolves.toBe(true);
    await expect(store.get("candidate@example.com", "SIGNUP")).resolves.toEqual(
      expect.objectContaining({
        code: "123456",
        issueId: "issue-a",
        verified: true,
      }),
    );
  });
});
