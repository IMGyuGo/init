import { VerificationCodeStore } from "./verification-code.store";

describe("VerificationCodeStore", () => {
  const previousRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
  });

  afterAll(() => {
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
  });

  it("clears both the verification code and resend cooldown", async () => {
    const store = new VerificationCodeStore();
    await store.set("Candidate@Example.com", "SIGNUP", "123456");
    await store.setCooldown("Candidate@Example.com", "SIGNUP");

    await store.clear("candidate@example.com", "SIGNUP");

    await expect(store.get("candidate@example.com", "SIGNUP")).resolves.toBeNull();
    await expect(store.hasCooldown("candidate@example.com", "SIGNUP")).resolves.toBe(false);
  });
});
