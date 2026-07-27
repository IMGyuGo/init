import { HttpException, HttpStatus } from "@nestjs/common";
import type { ErrorCode } from "@init/common";

export class ApiException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details: Array<Record<string, unknown>> = [],
  ) {
    super({ code, message, details }, status);
  }
}
