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
});
