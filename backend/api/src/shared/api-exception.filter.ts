import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { ERROR_CODES } from "@init/common";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const traceId = Array.isArray(request.headers["x-request-id"]) ? request.headers["x-request-id"][0] : request.headers["x-request-id"] ?? randomUUID();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500 && exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }
    const payload = exception instanceof HttpException ? exception.getResponse() : null;
    const body =
      typeof payload === "object" && payload !== null && "code" in payload
        ? (payload as { code: string; message?: string; details?: Array<Record<string, unknown>> })
        : {
            code: ERROR_CODES.COMMON_VALIDATION_FAILED,
            message: status >= 500 ? "서버 오류가 발생했습니다." : "요청을 처리할 수 없습니다.",
            details: [],
          };

    response.status(status).json({
      error: {
        code: body.code,
        message: body.message ?? "요청을 처리할 수 없습니다.",
        details: body.details ?? [],
      },
      meta: {
        traceId,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
