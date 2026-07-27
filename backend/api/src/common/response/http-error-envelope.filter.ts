import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
}

interface HttpResponseLike {
  status(code: number): {
    json(body: ErrorEnvelope): unknown;
  };
}

@Catch()
export class HttpErrorEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponseLike>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const payload = this.payload(status, body, exception);

    response.status(status).json(payload);
  }

  private payload(status: number, body: unknown, exception: unknown): ErrorEnvelope {
    if (this.isObject(body)) {
      const message = this.message(body.message);
      return {
        error: {
          code: typeof body.code === "string" ? body.code : this.defaultCode(status),
          message,
          details: this.details(body)
        }
      };
    }

    return {
      error: {
        code: this.defaultCode(status),
        message:
          typeof body === "string"
            ? body
            : exception instanceof Error
              ? exception.message
              : "Unexpected server error.",
        details: []
      }
    };
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private message(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    return "Request failed.";
  }

  private details(body: Record<string, unknown>): unknown[] {
    if (Array.isArray(body.details)) {
      return body.details;
    }
    if (body.details !== undefined) {
      return [body.details];
    }
    if (Array.isArray(body.message)) {
      return body.message;
    }
    return [];
  }

  private defaultCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "COMMON_VALIDATION_FAILED";
      case HttpStatus.UNAUTHORIZED:
        return "COMMON_UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "COMMON_FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "COMMON_NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "COMMON_CONFLICT";
      default:
        return "AI_PROCESS_FAILED";
    }
  }
}
