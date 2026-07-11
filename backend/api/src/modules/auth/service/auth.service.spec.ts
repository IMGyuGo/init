import { HttpStatus } from "@nestjs/common";
import { ERROR_CODES } from "@init/common";

import { ApiException } from "../../../shared/api-exception";
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
      hasCooldown: jest.fn().mockResolvedValue(false),
      set: jest.fn().mockResolvedValue(undefined),
      setCooldown: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    };
    const mailer = {
      send: jest.fn().mockRejectedValue(new Error("smtp unavailable")),
    };
    const service = new AuthService(repository as never, codeStore as never, mailer as never, {} as never);

    const error = await service.sendEmailCode("candidate@example.com").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiException);
    expect(error.code).toBe(ERROR_CODES.MAIL_DELIVERY_FAILED);
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(codeStore.clear).toHaveBeenCalledWith("candidate@example.com", "SIGNUP");
  });

  it("keeps the verification state when SMTP accepts the message", async () => {
    const repository = {
      findUserByEmail: jest.fn().mockResolvedValue(null),
    };
    const codeStore = {
      hasCooldown: jest.fn().mockResolvedValue(false),
      set: jest.fn().mockResolvedValue(undefined),
      setCooldown: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    };
    const mailer = {
      send: jest.fn().mockResolvedValue({ messageId: "smtp-1" }),
    };
    const service = new AuthService(repository as never, codeStore as never, mailer as never, {} as never);

    await expect(service.sendEmailCode("candidate@example.com")).resolves.toEqual({ sent: true });
    expect(codeStore.set).toHaveBeenCalledWith("candidate@example.com", "SIGNUP", expect.stringMatching(/^\d{6}$/));
    expect(codeStore.setCooldown).toHaveBeenCalledWith("candidate@example.com", "SIGNUP");
    expect(codeStore.clear).not.toHaveBeenCalled();
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({
      kind: "SIGNUP_VERIFICATION",
      to: "candidate@example.com",
    }));
  });
});
