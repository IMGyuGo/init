import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { randomUUID } from "crypto";
import { map, Observable } from "rxjs";

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const traceId = request.headers["x-request-id"] ?? randomUUID();

    return next.handle().pipe(
      map((data) => {
        if (isEnvelope(data)) {
          return data;
        }
        return {
          data,
          meta: {
            traceId,
            timestamp: new Date().toISOString(),
          },
        };
      }),
    );
  }
}

function isEnvelope(value: unknown): value is { data: unknown; meta: unknown } {
  return typeof value === "object" && value !== null && "data" in value && "meta" in value;
}
