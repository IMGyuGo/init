# Error Codes

> Source: `init/docs/00_source` 기준. Generated at 2026-06-27.

공통 오류 코드와 도메인별 오류 코드를 정의한다.

| Code | HTTP | Meaning | Handling |
| --- |--- |--- |--- |
| COMMON_VALIDATION_FAILED | 400 | 입력값 형식 또는 필수값이 잘못됨 | 필드별 오류를 `details`에 담는다. |
| COMMON_UNAUTHORIZED | 401 | 토큰 없음 또는 만료 | 로그인 화면으로 이동한다. |
| COMMON_FORBIDDEN | 403 | 권한 없음 | 기업/지원자 역할 불일치도 여기에 포함한다. |
| COMMON_NOT_FOUND | 404 | 리소스 없음 | 삭제된 공고, 없는 지원서, 없는 리포트 |
| COMMON_CONFLICT | 409 | 중복 또는 상태 충돌 | 중복 이메일, 이미 지원한 공고, 진행 중 상태 충돌 |
| COMMON_RATE_LIMITED | 429 | 요청 횟수 초과 | 이메일 코드 재발송, AI 재생성 제한 |
| AUTH_INVALID_CREDENTIALS | 401 | 이메일/비밀번호 불일치 | 로그인 화면에 사용자 표시 메시지 노출 |
| AUTH_USER_TYPE_MISMATCH | 403 | 선택한 사용자 유형과 계정 유형 불일치 | 기업/지원자 선택값 확인 |
| AUTH_EMAIL_DUPLICATED | 409 | 이미 가입된 이메일 | 회원가입 이메일 인증 전에 차단 |
| AUTH_EMAIL_CODE_INVALID | 400 | 인증 코드 불일치 또는 만료 | Redis TTL 코드 기준 |
| MAIL_DELIVERY_FAILED | 503 | SMTP 서버가 메일을 접수하지 못함 | 인증 코드 상태를 정리하고 잠시 후 재시도를 안내 |
| FILE_INVALID_TYPE | 400 | 허용하지 않는 파일 형식 | PDF/DOCX/JD 이미지 정책에 맞춰 검증 |
| FILE_SIZE_EXCEEDED | 400 | 파일 용량 초과 | 업로드 제한 안내 |
| APPLICATION_ALREADY_SUBMITTED | 409 | 이미 지원한 공고 | 중복 지원 방지 |
| INTERVIEW_SESSION_EXPIRED | 409 | 응시 기간 만료 또는 비활성 세션 | 재초대 또는 고객지원 안내 |
| INTERVIEW_QUESTION_COUNT_INVALID | 400 | JD 질문 수와 이력서 질문 수 또는 합계가 정책 범위를 벗어남 | 두 입력의 필드 오류와 허용 범위를 표시 |
| INTERVIEW_NCS_ACTIVE_PROFILE_INVALID | 422 | `NCS_ACTIVE_PROFILE_V2` canonical 구성, 중복 또는 활성 profile 1~3개 조건을 위반함 | 세 canonical 기준을 유지하고 1개 이상의 weight를 0보다 크게 수정 |
| INTERVIEW_NCS_BINDING_INVALID | 422 | 평가 기준 또는 확정 질문의 NCS profile·question mode·binding·version 연결이 누락되거나 중복됨 | NCS 기준과 ALIGNED 질문 binding을 다시 저장하도록 안내 |
| INTERVIEW_NCS_WEIGHT_INVALID | 422 | NCS profile 가중치가 음수·비정수이거나 합계가 100이 아님 | 자동 기본값 대체 없이 면접 설정에서 가중치를 수정하도록 안내 |
| INTERVIEW_NCS_QUESTION_COVERAGE_INVALID | 422 | 질문 세트 또는 세션 확정 시 V1 profile별 scoring BASE 2개 또는 V2 활성 profile별 BASE 1개를 충족하지 못함 | follow-up을 제외한 공통·개인화 BASE 질문과 profile binding을 보완한 뒤 재시도 |
| INTERVIEW_NCS_SNAPSHOT_INVALID | 409 | 진행·완료 또는 답변이 존재하는 세션의 NCS 질문·binding·시간·가중치 snapshot이 계약을 충족하지 않음 | 기존 세션을 자동 변경하지 않고 운영자에게 새 세션 생성 또는 데이터 복구를 안내 |
| INTERVIEW_PERSONALIZED_QUESTIONS_NOT_READY | 409 | 이력서 개인화 질문이 필요한데 아직 READY가 아님 | 문서 추출/생성 상태를 표시하고 면접 시작을 제한 |
| INTERVIEW_CONFIGURATION_LOCKED | 409 | 제출 이력이 존재해 평가 기준·배점·binding·질문 세트·질문 수 정책을 변경할 수 없음 | 기존 제출/세션 불변성을 유지하고 설정을 읽기 전용으로 표시 |
| INTERVIEW_DEMO_PRESET_NOT_READY | 409 | 3문항 공식 시연 면접 readiness가 READY가 아님 | `demoPreset.reasonCode`에 맞는 준비 상태를 표시하고 STANDARD 준비 상태는 유지 |
| INTERVIEW_DEMO_PRESET_QUESTION_POOL_INSUFFICIENT | 409 | 협업 단일 binding 공통 후보 또는 직무+문제해결 개인화 후보가 없음 | 공통 질문 세트 또는 DEMO_PRESET 개인화 batch를 준비한 뒤 재시도 |
| INTERVIEW_SESSION_MODE_CONFLICT | 409 | 같은 application에 존재하는 공식 session mode와 요청 mode가 다름 | 기존 공식 session을 resume하며 다른 mode의 신규 session은 만들지 않음 |
| INTERVIEW_NCS_FRAMEWORK_UNSUPPORTED | 422 | 지원하지 않는 evaluation framework, profile 또는 scoring version | 지원되는 V1/V2 계약과 version으로 설정·snapshot을 다시 생성 |
| INTERVIEW_GAZE_DATA_INVALID | 422 | 답변의 시선 타임라인 offset이 유한수가 아니거나 `-1..1` 허용 범위를 벗어남 | 답변을 저장하지 않고 정상 시선 데이터가 생성될 때까지 재촬영과 카메라 위치 조정을 안내 |
| DEVICE_PERMISSION_DENIED | 400 | 카메라/마이크 권한 거부 | 브라우저 권한 해결 안내 |
| AI_PROCESS_NOT_FOUND | 404 | AI 작업 로그 없음 | 상태 조회 중 삭제되었거나 잘못된 processLogId |
| AI_PROCESS_FAILED | 500 | AI 처리 실패 | `ai_process_logs.status=FAILED`와 재시도 안내 |
| AI_GUARDRAIL_BLOCKED | 422 | AI 출력 정책 위반 | 저장하지 않고 재생성 또는 수동 검토 |
| REPORT_NOT_READY | 409 | 리포트 생성 전 조회 | 생성중 상태와 재조회 안내 |

## Error Shape

```json
{
  "error": {
    "code": "COMMON_VALIDATION_FAILED",
    "message": "입력값을 확인해주세요.",
    "details": [
      {
        "field": "summary",
        "reason": "MAX_LENGTH",
        "limit": 3000,
        "actualLength": 3001,
        "message": "핵심 내용은 최대 3,000자까지 입력할 수 있습니다."
      }
    ]
  }
}
```

검증 오류의 `details`는 `field`, `reason`, `message`를 기본으로 하며 길이·개수 제한에는 `limit`와 `actualLength`를 추가한다. 보안을 위해 사용자가 제출한 실제 값은 반환하지 않는다.
