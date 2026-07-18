import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@init/common';
import { ApiException } from '../../shared/api-exception';

type ErrorDetail = {
  field?: string;
  reason: string;
};

function apiError(
  code: ErrorCode,
  message: string,
  status: HttpStatus,
  details: ErrorDetail[] = [],
): never {
  throw new ApiException(code, message, status, details);
}

export function unauthorized(message = '인증 정보가 필요합니다.'): never {
  apiError(ERROR_CODES.COMMON_UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
}

export function forbidden(message = '접근 권한이 없습니다.'): never {
  apiError(ERROR_CODES.COMMON_FORBIDDEN, message, HttpStatus.FORBIDDEN);
}

export function notFound(message = '리소스를 찾을 수 없습니다.'): never {
  apiError(ERROR_CODES.COMMON_NOT_FOUND, message, HttpStatus.NOT_FOUND);
}

export function conflict(
  message = '이미 존재하는 리소스입니다.',
  details: ErrorDetail[] = [],
): never {
  apiError(ERROR_CODES.COMMON_CONFLICT, message, HttpStatus.CONFLICT, details);
}

export function ncsActiveProfileInvalid(
  message = 'NCS 활성 평가 기준 구성을 확인해주세요.',
  details: ErrorDetail[] = [],
): never {
  apiError(
    ERROR_CODES.INTERVIEW_NCS_ACTIVE_PROFILE_INVALID,
    message,
    HttpStatus.UNPROCESSABLE_ENTITY,
    details,
  );
}

export function configurationLocked(
  message = '제출 이력이 있어 면접 설정을 변경할 수 없습니다.',
): never {
  apiError(
    ERROR_CODES.INTERVIEW_CONFIGURATION_LOCKED,
    message,
    HttpStatus.CONFLICT,
    [{ field: 'postingId', reason: 'SUBMITTED_APPLICATION_EXISTS' }],
  );
}

export function validationFailed(
  message = '입력값을 확인해주세요.',
  details: ErrorDetail[] = [],
): never {
  apiError(
    ERROR_CODES.COMMON_VALIDATION_FAILED,
    message,
    HttpStatus.BAD_REQUEST,
    details,
  );
}

export function questionCountInvalid(
  message = '질문 개수 정책을 확인해주세요.',
  details: ErrorDetail[] = [],
): never {
  apiError(
    ERROR_CODES.INTERVIEW_QUESTION_COUNT_INVALID,
    message,
    HttpStatus.BAD_REQUEST,
    details,
  );
}

export function ncsBindingInvalid(
  message = 'NCS 평가 기준 연결을 확인해주세요.',
  details: ErrorDetail[] = [],
): never {
  apiError(
    ERROR_CODES.INTERVIEW_NCS_BINDING_INVALID,
    message,
    HttpStatus.UNPROCESSABLE_ENTITY,
    details,
  );
}

export function ncsWeightInvalid(
  message = 'NCS 평가 기준 가중치를 확인해주세요.',
  details: ErrorDetail[] = [],
): never {
  apiError(
    ERROR_CODES.INTERVIEW_NCS_WEIGHT_INVALID,
    message,
    HttpStatus.UNPROCESSABLE_ENTITY,
    details,
  );
}

export function ncsQuestionCoverageInvalid(
  message = 'NCS 질문의 profile별 문항 수를 확인해주세요.',
  details: ErrorDetail[] = [],
): never {
  apiError(
    ERROR_CODES.INTERVIEW_NCS_QUESTION_COVERAGE_INVALID,
    message,
    HttpStatus.UNPROCESSABLE_ENTITY,
    details,
  );
}

export function personalizedQuestionsNotReady(
  message = '이력서 개인화 질문이 아직 준비되지 않았습니다.',
  details: ErrorDetail[] = [],
): never {
  apiError(
    ERROR_CODES.INTERVIEW_PERSONALIZED_QUESTIONS_NOT_READY,
    message,
    HttpStatus.CONFLICT,
    details,
  );
}

export function aiProcessFailed(
  message = 'AI 작업을 생성하지 못했습니다.',
  details: ErrorDetail[] = [],
): never {
  apiError(ERROR_CODES.AI_PROCESS_FAILED, message, HttpStatus.INTERNAL_SERVER_ERROR, details);
}
