import { HttpStatus } from "@nestjs/common";
import { ERROR_CODES } from "@init/common";

import { ApiException } from "../../../shared/api-exception";
import { VerificationCodeStore } from "../verification-code.store";
import { AuthService } from "./auth.service";

describe("AuthService policy", () => {
  it("is defined for Jest wiring", () => {
    expect(AuthService).toBeDefined();
  });

  it("clears the verification code and cooldown when SMTP delivery fails", async () => {
    const repository = {
      findUserByEmail: jest.fn().mockResolvedValue(null),
    };
    const codeStore = {
      issue: jest.fn().mockResolvedValue(true),
      clearIfOwned: jest.fn().mockResolvedValue(undefined),
    };
    const mailer = {
      send: jest.fn().mockRejectedValue(new Error("smtp unavailable")),
    };
    const service = new AuthService(repository as never, codeStore as never, mailer as never, {} as never);

    const error = await service.sendEmailCode("candidate@example.com").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiException);
    expect(error.code).toBe(ERROR_CODES.MAIL_DELIVERY_FAILED);
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(codeStore.clearIfOwned).toHaveBeenCalledWith(
      "candidate@example.com",
      "SIGNUP",
      expect.any(String),
    );
  });

  it("keeps the verification state when SMTP accepts the message", async () => {
    const repository = {
      findUserByEmail: jest.fn().mockResolvedValue(null),
    };
    const codeStore = {
      issue: jest.fn().mockResolvedValue(true),
      clearIfOwned: jest.fn().mockResolvedValue(undefined),
    };
    const mailer = {
      send: jest.fn().mockResolvedValue({ messageId: "smtp-1" }),
    };
    const service = new AuthService(repository as never, codeStore as never, mailer as never, {} as never);

    await expect(service.sendEmailCode("candidate@example.com")).resolves.toEqual({ sent: true });
    expect(codeStore.issue).toHaveBeenCalledWith(
      "candidate@example.com",
      "SIGNUP",
      expect.stringMatching(/^\d{6}$/),
      expect.any(String),
    );
    expect(codeStore.clearIfOwned).not.toHaveBeenCalled();
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({
      kind: "SIGNUP_VERIFICATION",
      to: "candidate@example.com",
    }));
  });

  it("keeps a newer code when an older SMTP delivery fails late", async () => {
    const previousRedisUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    let rejectFirst!: (reason?: unknown) => void;
    const firstDelivery = new Promise((_, reject) => {
      rejectFirst = reject;
    });
    const mailer = {
      send: jest.fn()
        .mockReturnValueOnce(firstDelivery)
        .mockResolvedValueOnce({ messageId: "smtp-2" }),
    };
    const store = new VerificationCodeStore();
    const repository = { findUserByEmail: jest.fn().mockResolvedValue(null) };
    const service = new AuthService(repository as never, store, mailer as never, {} as never);

    try {
      const olderResult = service.sendEmailCode("candidate@example.com").catch((error) => error);
      for (let index = 0; index < 5 && mailer.send.mock.calls.length === 0; index += 1) {
        await Promise.resolve();
      }
      expect(mailer.send).toHaveBeenCalledTimes(1);

      now += 61_000;
      await expect(service.sendEmailCode("candidate@example.com")).resolves.toEqual({ sent: true });
      const newerRecord = await store.get("candidate@example.com", "SIGNUP");

      rejectFirst(new Error("late SMTP failure"));
      const olderError = await olderResult;

      expect(olderError).toBeInstanceOf(ApiException);
      await expect(store.get("candidate@example.com", "SIGNUP")).resolves.toEqual(newerRecord);
      await expect(store.hasCooldown("candidate@example.com", "SIGNUP")).resolves.toBe(true);
    } finally {
      jest.restoreAllMocks();
      if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previousRedisUrl;
    }
  });

  it("rejects verification when a newer issue replaces the record before the update", async () => {
    const codeStore = {
      get: jest.fn().mockResolvedValue({
        code: "123456",
        issueId: "issue-a",
        attempts: 0,
        verified: false,
      }),
      markVerified: jest.fn().mockResolvedValue(false),
    };
    const service = new AuthService({} as never, codeStore as never, {} as never, {} as never);

    const error = await service.verifyEmailCode("candidate@example.com", "123456").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiException);
    expect(error.code).toBe(ERROR_CODES.AUTH_EMAIL_CODE_INVALID);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it("blocks local login and password reset for a non-interactive synthetic account", async () => {
    const repository = {
      findUserByEmail: jest.fn().mockResolvedValue({
        userId: 9001n,
        email: "candidate-demo-00001@demo.invalid",
        name: "시연 지원자 00001",
        userType: "CANDIDATE",
        status: "PENDING",
        authProvider: "LOCAL",
        providerUserId: null,
        passwordHash: null,
      }),
    };
    const codeStore = {
      issue: jest.fn(),
      get: jest.fn(),
    };
    const mailer = { send: jest.fn() };
    const service = new AuthService(repository as never, codeStore as never, mailer as never, {} as never);

    const loginError = await service.login({
      email: "candidate-demo-00001@demo.invalid",
      password: "Password1234",
      userType: "CANDIDATE",
    }).catch((caught) => caught);
    const sendError = await service.sendPasswordCode("candidate-demo-00001@demo.invalid").catch((caught) => caught);
    const verifyError = await service.verifyPasswordCode("candidate-demo-00001@demo.invalid", "123456").catch((caught) => caught);
    const resetError = await service.resetPassword({
      email: "candidate-demo-00001@demo.invalid",
      code: "123456",
      password: "Password1234",
      passwordConfirm: "Password1234",
    }).catch((caught) => caught);

    expect(loginError).toBeInstanceOf(ApiException);
    expect(loginError.code).toBe(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    for (const error of [sendError, verifyError, resetError]) {
      expect(error).toBeInstanceOf(ApiException);
      expect(error.code).toBe(ERROR_CODES.COMMON_NOT_FOUND);
    }
    expect(codeStore.issue).not.toHaveBeenCalled();
    expect(codeStore.get).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("does not turn an existing PENDING LOCAL account into a Google login session", async () => {
    const repository = {
      findUserByEmail: jest.fn().mockResolvedValue({
        userId: 9001n,
        email: "candidate-demo-00001@demo.invalid",
        name: "시연 지원자 00001",
        userType: "CANDIDATE",
        status: "PENDING",
        authProvider: "LOCAL",
        providerUserId: null,
        passwordHash: null,
      }),
      createGoogleCandidate: jest.fn(),
    };
    const service = new AuthService(repository as never, {} as never, {} as never, {} as never);
    jest.spyOn(service as never, "fetchGoogleProfile" as never).mockResolvedValue({
      sub: "google-sub-1",
      email: "candidate-demo-00001@demo.invalid",
      name: "Synthetic Candidate",
    } as never);

    const error = await service.googleCallback("oauth-code", "CANDIDATE").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiException);
    expect(error.code).toBe(ERROR_CODES.COMMON_UNAUTHORIZED);
    expect(repository.createGoogleCandidate).not.toHaveBeenCalled();
  });
});
