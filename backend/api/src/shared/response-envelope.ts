import { randomUUID } from "crypto";

export type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
};

export type PageMeta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
};

export function ok<T>(request: RequestLike, data: T) {
  return {
    data,
    meta: {
      traceId: getTraceId(request),
      timestamp: new Date().toISOString(),
    },
  };
}

export function okList<T>(request: RequestLike, items: T[], page: PageMeta) {
  return {
    data: { items },
    meta: {
      traceId: getTraceId(request),
      timestamp: new Date().toISOString(),
      page,
    },
  };
}

export function getTraceId(request: RequestLike) {
  const header = request.headers["x-request-id"];
  if (Array.isArray(header)) {
    return header[0] ?? randomUUID();
  }
  return header || randomUUID();
}
