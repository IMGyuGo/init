import type { UserType } from "../enums";
import type { ErrorCode } from "../errors";

export type CurrentUser = {
  userId: number;
  userType: UserType;
  companyId: number | null;
  candidateId: number | null;
};

export type PageMetaDto = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
};

export type ApiResponseDto<T> = {
  data: T;
  meta: {
    traceId: string;
    timestamp: string;
    page?: PageMetaDto;
  };
};

export type ApiErrorDto = {
  error: {
    code: ErrorCode;
    message: string;
    details: Array<Record<string, unknown>>;
  };
  meta?: {
    traceId: string;
    timestamp: string;
  };
};

export type ApiSuccessBody<T> = ApiResponseDto<T>;
export type ApiErrorBody = ApiErrorDto;

export * from "./ncs-demo-preset";
