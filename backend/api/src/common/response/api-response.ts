import { randomUUID } from "crypto";

export interface ApiSuccessResponse<T> {
  data: T;
  meta: {
    traceId: string;
    timestamp: string;
  };
}

export function ok<T>(data: T): ApiSuccessResponse<T> {
  return {
    data,
    meta: {
      traceId: randomUUID(),
      timestamp: new Date().toISOString()
    }
  };
}
