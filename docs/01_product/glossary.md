# Glossary

> Source: `init/docs/00_source` 기준. Generated at 2026-06-27.

도메인 용어와 상태값을 한 곳에서 확인한다.

## Terms

| Korean | English | Definition |
| --- |--- |--- |
| 사용자 | User | 서비스에 로그인하는 계정. `users`가 원천 테이블이다. |
| 기업 | Company | 채용 공고를 운영하는 조직. `companies`와 `postings`를 소유한다. |
| 지원자 | Candidate | 모의면접을 이용하거나 공고에 지원하는 사용자. `candidate_profiles`가 프로필이다. |
| 공고 | Posting | 채용 포지션 단위의 모집 단위. 화면에서는 recruitment/job 용어와 혼용된다. |
| 지원서 | Application | 지원자가 특정 공고에 제출한 지원 이력. 전형 상태의 중심 엔티티다. |
| 면접 세션 | Interview Session | 모의면접 또는 채용 AI 면접의 실행 단위. |
| 답변 | Interview Answer | 질문별 영상/음성/STT 스크립트 단위. |
| 평가 기준 | Evaluation Criteria | 공고별 선택된 평가 태그와 가중치. |
| NCS 평가 프로필 | NCS Evaluation Profile | 질문과 답변이 측정할 역량 단위. 초기 버전은 문제해결능력, 의사소통능력, 디지털능력 3개를 고정 사용한다. |
| JD 공통 질문 | JD Criteria Question | 저장된 NCS 평가 기준과 공고 JD를 기반으로 생성하며 같은 공고의 모든 지원자에게 적용하는 질문. |
| 이력서 개인화 질문 | Resume Personalized Question | NCS 평가 기준, 공고 JD, 지원 완료된 지원자의 이력서를 함께 사용해 해당 지원자에게만 생성하는 질문. |
| 질문 정렬 | Question Alignment | 질문이 지정된 NCS 평가 프로필과 question mode에 맞는 답변 근거를 수집할 수 있는지 versioned evaluator로 검증하는 절차. |
| 리포트 | Evaluation Report | 서류/면접 평가 결과와 점수/근거의 집합. |
| 가드레일 | Guardrail | AI 출력이 평가 범위와 안전 정책을 벗어나지 않도록 검증하는 레이어. |
| 임베딩 | Embedding | JD, 질문, 답변, 리포트 근거 검색/추천을 위한 벡터화 데이터. |
| Redis 인증 코드 | Redis TTL Verification | 이메일 인증 코드는 DB 테이블이 아니라 TTL 캐시에 저장한다. |

## Enums

| Enum | Values | Description |
| --- |--- |--- |
| user_type | ADMIN, COMPANY, CANDIDATE | 사용자 유형 |
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
| evaluation_framework | LEGACY, NCS_3_PROFILE_V1 | 공고 면접 평가 체계 |
| ncs_profile_id | PROBLEM_SOLVING, COMMUNICATION, DIGITAL | 초기 NCS 평가 프로필 |
| ncs_question_mode | EXPERIENCE_BEHAVIOR, TECHNICAL_KNOWLEDGE, SITUATIONAL_DESIGN | NCS 답변 근거를 수집하는 질문 mode |
| question_generation_source | JD_CRITERIA, RESUME_PERSONALIZED | 질문 생성 출처 |
| question_alignment_status | NOT_EVALUATED, ALIGNED, LOW_ALIGNMENT, REVIEW_REQUIRED | 질문과 NCS profile의 정렬 검증 상태 |
| resume_question_generation_status | DISABLED, WAITING_APPLICATION, WAITING_DOCUMENT, GENERATING, READY, REVIEW_REQUIRED, FAILED | 이력서 질문 준비 상태 |
| notification_channel | EMAIL, IN_APP | 알림 채널 |
| ai_process_type | DOCUMENT_EXTRACT, STT, FOLLOW_UP, REPORT_GENERATE, EMBEDDING, GUARDRAIL_VALIDATE, CRITERIA_SUGGEST, QUESTION_GENERATE, RESUME_QUESTION_GENERATE, QUESTION_SET_GENERATE, POSTING_DRAFT_GENERATE | AI 처리 유형 |
| ai_process_status | PENDING, RUNNING, COMPLETED, FAILED | AI 처리 상태 |
| guardrail_result | PASS, BLOCKED, REGENERATED | AI 안전 검증 결과 |
| embedding_source_type | POSTING_JD, CRITERION_TAG, QUESTION, APPLICATION_DOCUMENT, INTERVIEW_ANSWER, EVALUATION_REPORT | 임베딩 원천 유형 |
