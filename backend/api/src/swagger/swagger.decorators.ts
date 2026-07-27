import { applyDecorators, HttpStatus, Type } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiExtension,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiParam,
  ApiResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from "@nestjs/swagger";

import { ApiErrorEnvelopeDto, ApiListEnvelopeDto, ApiListMetaDto, ApiMetaDto, ApiSuccessEnvelopeDto } from "./swagger.dto";

export function ApiEnvelopeResponse(model: Type<unknown>, status = HttpStatus.OK) {
  return applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, ApiMetaDto, model),
    ApiResponse({
      status,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiSuccessEnvelopeDto) },
          {
            properties: {
              data: { $ref: getSchemaPath(model) },
            },
          },
        ],
      },
    }),
  );
}

export function ApiListEnvelopeResponse(model: Type<unknown>, status = HttpStatus.OK) {
  return applyDecorators(
    ApiExtraModels(ApiListEnvelopeDto, ApiListMetaDto, ApiMetaDto, model),
    ApiResponse({
      status,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiListEnvelopeDto) },
          {
            properties: {
              data: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: { $ref: getSchemaPath(model) },
                  },
                },
              },
            },
          },
        ],
      },
    }),
  );
}

export function ApiErrorResponses() {
  return applyDecorators(
    ApiExtraModels(ApiErrorEnvelopeDto),
    ApiBadRequestResponse({ type: ApiErrorEnvelopeDto, description: "입력값 형식 또는 필수값 오류" }),
    ApiUnauthorizedResponse({ type: ApiErrorEnvelopeDto, description: "인증 누락 또는 만료" }),
    ApiForbiddenResponse({ type: ApiErrorEnvelopeDto, description: "권한 없음" }),
    ApiNotFoundResponse({ type: ApiErrorEnvelopeDto, description: "리소스 없음" }),
  );
}

export function ApiDevAuthHeaders() {
  return applyDecorators(
    ApiHeader({ name: "X-Dev-User-Id", required: false, description: "local/dev 임시 사용자 ID" }),
    ApiHeader({ name: "X-Dev-User-Type", required: false, enum: ["ADMIN", "COMPANY", "CANDIDATE"] }),
    ApiHeader({ name: "X-Dev-Company-Id", required: false, description: "기업 사용자 개발용 회사 ID" }),
    ApiHeader({ name: "X-Dev-Candidate-Id", required: false, description: "지원자 사용자 개발용 후보자 ID" }),
  );
}

export function ApiOperationId(apiId: string) {
  return ApiExtension("x-api-id", apiId);
}

export function ApiParamId(name: string, description: string) {
  return ApiParam({ name, type: Number, description, example: 1 });
}
