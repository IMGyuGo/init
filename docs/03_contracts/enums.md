# Enums

> Source: `init/docs/00_source` 기준. Generated at 2026-06-27.

API와 DB에서 공유해야 하는 상태값을 정리한다.

## Implementation Enum Baseline

문서/DB enum 이름은 기존 `snake_case`를 유지하되 Prisma와 TypeScript에서는 아래 `PascalCase` 이름을 사용한다. 같은 enum을 frontend/backend/worker에서 중복 정의하지 않고 `backend/common/src/enums`를 기준으로 공유한다.

| Contract Enum | Prisma/TypeScript Enum |
| --- | --- |
| `user_type` | `UserType` |
| `current_user_type` | `CurrentUserType` |
| `auth_provider` | `AuthProvider` |
| `user_status` | `UserStatus` |
| `posting_status` | `PostingStatus` |
| `application_status` | `ApplicationStatus` |
| `document_status` | `DocumentStatus` |
| `interview_status` | `InterviewStatus` |
| `report_status` | `ReportStatus` |
| `screening_decision` | `ScreeningDecision` |
| `interview_type` | `InterviewType` |
| `report_type` | `ReportType` |
| `document_type` | `DocumentType` |
| `consent_type` | `ConsentType` |
| `question_type` | `QuestionType` |
| `notification_channel` | `NotificationChannel` |
| `ai_process_type` | `AiProcessType` |
| `ai_process_status` | `AiProcessStatus` |
| `guardrail_result` | `GuardrailResult` |
| `embedding_source_type` | `EmbeddingSourceType` |

금지 이름: `EvaluationCriteria`, `QuestionBank`, `AIProcessLog`, `AIGuardrailLog`를 Prisma model/class 이름으로 새로 만들지 않는다.

### Enum Source of Truth

공통 enum의 원천은 이 문서와 `backend/common/src/enums`다. Prisma schema, backend DTO, frontend API client, worker payload에서 같은 enum을 새 이름으로 중복 정의하지 않는다.

- 문서/DB enum 이름: `snake_case`
- Prisma/TypeScript enum 이름: `PascalCase`
- enum value: `UPPER_SNAKE_CASE`
- frontend는 API 응답 string literal을 임의로 재정의하지 않고 `backend/common/src/enums`에서 공유 가능한 타입 또는 API client adapter 타입을 사용한다.
- enum 추가/삭제/rename은 이 문서, Prisma schema, `backend/common/src/enums`, API 계약을 같은 PR에서 수정한다.

## Status Transition Baseline

상태 전이는 아래 표에 있는 방향만 허용한다. 예외 전이가 필요하면 `docs/03_contracts/enums.md`, `docs/02_architecture/data-model.md`, `docs/04_implementation/module-boundaries.md`를 먼저 수정한다.

| Enum | Owner | Allowed Transitions |
| --- | --- | --- |
| `posting_status` | B | `DRAFT -> OPEN -> CLOSING_SOON -> CLOSED -> ARCHIVED`, `DRAFT -> ARCHIVED`, `OPEN -> CLOSED` |
| `application_status` | B/D | `DRAFT -> SUBMITTED -> IN_REVIEW -> INTERVIEW_WAITING -> INTERVIEW_DONE -> COMPLETED`, `SUBMITTED -> CANCELED`, `IN_REVIEW -> CANCELED` |
| `document_status` | D/E | `NOT_SUBMITTED -> SUBMITTED -> EXTRACTING -> EXTRACTED`, `SUBMITTED -> FAILED`, `EXTRACTING -> FAILED`, `FAILED -> SUBMITTED` |
| `interview_status` | D | `NOT_READY -> READY -> IN_PROGRESS -> COMPLETED`, `READY -> FAILED`, `IN_PROGRESS -> FAILED` |
| `report_status` | E | `PENDING -> GENERATING -> COMPLETED`, `PENDING -> FAILED`, `GENERATING -> FAILED`, `FAILED -> GENERATING` |
| `ai_process_status` | E | `PENDING -> RUNNING -> COMPLETED`, `PENDING -> FAILED`, `RUNNING -> FAILED`, `FAILED -> PENDING` for explicit retry only |
| `screening_decision` | B | `UNDECIDED -> PASS`, `UNDECIDED -> HOLD`, `UNDECIDED -> FAIL`, `HOLD -> PASS`, `HOLD -> FAIL` |

상태를 되돌리는 rollback 전이는 기본 금지다. 운영자가 명시적으로 재처리하는 retry는 audit log 또는 `ai_process_logs`에 사유를 남긴다.

| Enum | Values | Description |
| --- |--- |--- |
| user_type | ADMIN, COMPANY, CANDIDATE | 사용자 유형 |
| current_user_type | ADMIN, COMPANY, CANDIDATE | API 권한 판단에 사용하는 CurrentUser 사용자 유형. `user_type`과 같은 값을 사용한다. |
| auth_provider | LOCAL, GOOGLE | 로그인/가입 방식 |
| user_status | ACTIVE, PENDING, SUSPENDED, DEACTIVATED | 계정 상태 |
| posting_status | DRAFT, OPEN, CLOSING_SOON, CLOSED, ARCHIVED | 공고 상태 |
| application_status | DRAFT, SUBMITTED, IN_REVIEW, INTERVIEW_WAITING, INTERVIEW_DONE, COMPLETED, CANCELED | 지원 진행 상태 |
| document_status | NOT_SUBMITTED, SUBMITTED, EXTRACTING, EXTRACTED, FAILED | 서류 제출/분석 상태 |
| interview_status | NOT_READY, READY, IN_PROGRESS, COMPLETED, FAILED | 면접 세션/응시 상태 |
| report_status | PENDING, GENERATING, COMPLETED, FAILED | 리포트 생성 상태 |
| screening_decision | UNDECIDED, PASS, HOLD, FAIL | 기업 담당자 전형 판정 |
| interview_type | MOCK, RECRUITING | 모의면접/채용면접 구분 |
| report_type | MOCK_INTERVIEW_REPORT, RECRUITING_REPORT | 리포트 구분 |
| document_type | RESUME, PORTFOLIO | 지원 서류 유형 |
| consent_type | PRIVACY_COLLECTION, AI_DOCUMENT_ANALYSIS, AI_INTERVIEW_RECORDING | 필수 동의 유형 |
| question_type | INTRO, TECHNICAL, EXPERIENCE, SITUATION, FOLLOW_UP, CLOSING | 면접 질문 유형 |
| notification_channel | EMAIL, IN_APP | 알림 채널 |
| ai_process_type | DOCUMENT_EXTRACT, STT, FOLLOW_UP, REPORT_GENERATE, EMBEDDING, GUARDRAIL_VALIDATE, CRITERIA_SUGGEST, QUESTION_GENERATE, QUESTION_SET_GENERATE, POSTING_DRAFT_GENERATE | AI 처리 유형 |
| ai_process_status | PENDING, RUNNING, COMPLETED, FAILED | AI 처리 상태 |
| failure_category | RETRYABLE, NON_RETRYABLE | AI 실패 재시도 가능 여부 |
| guardrail_result | PASS, BLOCKED, REGENERATED | AI 안전 검증 결과 |
| embedding_source_type | POSTING_JD, CRITERION_TAG, QUESTION, APPLICATION_DOCUMENT, INTERVIEW_ANSWER, EVALUATION_REPORT | 임베딩 원천 유형 |
