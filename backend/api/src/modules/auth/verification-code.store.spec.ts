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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("atomically allows only one concurrent issue during the cooldown", async () => {
    const store = new VerificationCodeStore();
    const results = await Promise.all([
      store.issue("Candidate@Example.com", "SIGNUP", "123456", "issue-a"),
      store.issue("candidate@example.com", "SIGNUP", "654321", "issue-b"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(store.hasCooldown("candidate@example.com", "SIGNUP")).resolves.toBe(true);
  });

  it("does not let a stale SMTP failure delete a newer issue", async () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    const store = new VerificationCodeStore();
    await store.issue("Candidate@Example.com", "SIGNUP", "123456", "issue-a");

    now += 61_000;
    await expect(store.issue("candidate@example.com", "SIGNUP", "654321", "issue-b")).resolves.toBe(true);

    await store.clearIfOwned("candidate@example.com", "SIGNUP", "issue-a");

    await expect(store.get("candidate@example.com", "SIGNUP")).resolves.toEqual(expect.objectContaining({
      code: "654321",
      issueId: "issue-b",
    }));
    await expect(store.hasCooldown("candidate@example.com", "SIGNUP")).resolves.toBe(true);
  });

  it("does not let stale verification updates overwrite a newer issue", async () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    const store = new VerificationCodeStore();
    await store.issue("candidate@example.com", "SIGNUP", "123456", "issue-a");
    const staleRecord = await store.get("candidate@example.com", "SIGNUP");
    expect(staleRecord).not.toBeNull();

    now += 61_000;
    await store.issue("candidate@example.com", "SIGNUP", "654321", "issue-b");

    await expect(store.markVerified("candidate@example.com", "SIGNUP", staleRecord!)).resolves.toBe(false);
    await expect(store.incrementAttempts("candidate@example.com", "SIGNUP", staleRecord!)).resolves.toBe(false);
    await expect(store.get("candidate@example.com", "SIGNUP")).resolves.toEqual(expect.objectContaining({
      code: "654321",
      issueId: "issue-b",
      attempts: 0,
      verified: false,
    }));
  });

  it("preserves the original expiry when verification state changes", async () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    const store = new VerificationCodeStore();
    await store.issue("candidate@example.com", "SIGNUP", "123456", "issue-a");
    const record = await store.get("candidate@example.com", "SIGNUP");

    now += 299_000;
    await expect(store.markVerified("candidate@example.com", "SIGNUP", record!)).resolves.toBe(true);
    now += 2_000;

    await expect(store.get("candidate@example.com", "SIGNUP")).resolves.toBeNull();
  });

  it("clears the code and cooldown owned by the failed issue", async () => {
    const store = new VerificationCodeStore();
    await store.issue("Candidate@Example.com", "SIGNUP", "123456", "issue-a");

    await store.clearIfOwned("candidate@example.com", "SIGNUP", "issue-a");

    await expect(store.get("candidate@example.com", "SIGNUP")).resolves.toBeNull();
    await expect(store.hasCooldown("candidate@example.com", "SIGNUP")).resolves.toBe(false);
  });
});
