import { ConflictException, NotFoundException } from "@nestjs/common";
import { AdminScreeningRetryController } from "./admin-screening-retry.controller";
import {
  ScreeningRetryConflictError,
  ScreeningRetryNotFoundError,
} from "../repository/screening-retry.repository";

describe("AdminScreeningRetryController", () => {
  const adminRequest = { currentUser: { userId: 1, userType: "ADMIN" as const } };

  it("requires ADMIN and delegates a positive application id", async () => {
    const auth = { assertAdmin: jest.fn() };
    const retry = jest.fn().mockResolvedValue({ action: "REPORT_RETRY", processLogId: 4 });
    const controller = new AdminScreeningRetryController(auth as never, { retry } as never);

    await expect(controller.retry("10", adminRequest)).resolves.toMatchObject({ processLogId: 4 });
    expect(auth.assertAdmin).toHaveBeenCalledWith(adminRequest.currentUser);
    expect(retry).toHaveBeenCalledWith(10);
  });

  it("does not delegate when ADMIN authorization is denied", async () => {
    const denied = new Error("admin required");
    const auth = { assertAdmin: jest.fn(() => { throw denied; }) };
    const retry = jest.fn();
    const controller = new AdminScreeningRetryController(auth as never, { retry } as never);

    await expect(controller.retry("10", {
      currentUser: { userId: 2, userType: "COMPANY" as const, companyId: 5 },
    })).rejects.toBe(denied);
    expect(retry).not.toHaveBeenCalled();
  });

  it("maps missing retry context to COMMON_NOT_FOUND", async () => {
    const controller = new AdminScreeningRetryController(
      { assertAdmin: jest.fn() } as never,
      { retry: jest.fn().mockRejectedValue(new ScreeningRetryNotFoundError()) } as never,
    );
    await expect(controller.retry("10", adminRequest)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("maps invalid retry state to COMMON_CONFLICT", async () => {
    const controller = new AdminScreeningRetryController(
      { assertAdmin: jest.fn() } as never,
      { retry: jest.fn().mockRejectedValue(new ScreeningRetryConflictError()) } as never,
    );
    await expect(controller.retry("10", adminRequest)).rejects.toBeInstanceOf(ConflictException);
  });
});
