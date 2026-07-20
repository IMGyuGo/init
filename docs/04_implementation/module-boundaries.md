# Module Boundaries

> Source: `init/docs/00_source` 기준. Generated at 2026-06-27.

구현 모듈별 책임과 접근 가능한 테이블/API 경계를 정의한다.

## Baseline Boundary Rules

팀별 구현 충돌을 줄이기 위해 module, shared code, 공유 테이블 field owner를 아래처럼 고정한다.

### Backend Module Folders

| Folder | Module | Owner | Notes |
| --- | --- | --- | --- |
| `backend/api/src/modules/auth` | Auth | A | 로그인, 회원가입, 이메일 인증, Dev/JWT Auth |
| `backend/api/src/modules/company-recruiting` | Company Recruiting | B | 공고, 지원자 등록/초대, 전형 판정 |
| `backend/api/src/modules/company-interview` | Company Interview | C | 평가 기준, 질문 뱅크, 면접 설정 |
| `backend/api/src/modules/company-profile` | Company Profile | A/B | 회사 정보, 회사 로고, 기업 알림 설정 |
| `backend/api/src/modules/candidate` | Candidate | D | 공고 조회, 지원서 제출, 지원현황, 마이페이지 |
| `backend/api/src/modules/interview` | Interview Runtime | D/E | 모의/채용 면접 세션, 답변, 완료 처리 |
| `backend/api/src/modules/report` | Report | E | 평가 리포트 조회/생성 요청, 근거/점수 |
| `backend/api/src/modules/ai` | AI API | E | 가드레일, AI process status API |

### Shared Code Locations

| Path | Purpose | Owner |
| --- | --- | --- |
| `backend/common/src/enums` | enum 단일 정의 | A with all reviewers |
| `backend/common/src/dto` | 공통 response/error/current-user DTO | A |
| `backend/common/src/errors` | 공통 error code와 exception mapping | A |
| `frontend/src/api` | frontend API client entrypoint | A/B/D/E reviewers |
| `frontend/src/features/auth` | 인증 화면, 세션 복원, 페이지 접근 제어 | A with B/D/PM reviewers |
| `frontend/src/shared` | 여러 feature가 쓰는 UI/helper | touched owners |
| `design.md` | 디자인 시스템, 공통 UI 토큰, 제품 UI 기준 | PM with touched frontend reviewers |

### Frontend Route Ownership

App Router의 `frontend/src/app` 경로는 화면 도메인 기준으로 feature ownership과 함께 본다. 동일 PR에 여러 route가 섞이면 CI는 영향 role을 합산해 role별 harness를 실행한다.

| Path | Owner | Notes |
| --- | --- | --- |
| `frontend/src/app/company/recruitments` | B | 기업 채용공고 |
| `frontend/src/app/company/applicants` | B | 기업 지원자 운영 |
| `frontend/src/app/company/applications` | B | 기업 지원현황/공고 관리 |
| `frontend/src/app/company/interviews` | C | 기업 면접 설정, 평가 기준, 질문 관리 |
| `frontend/src/app/candidate` | D | 지원자 공고, 지원서, 지원현황, 면접 진행, 마이페이지 |
| `frontend/src/app/reports`, `frontend/src/app/ai` | E | AI 리포트와 AI 작업 화면 |
| `frontend/src/app/layout.tsx`, `frontend/src/app/page.tsx` | B | 초기 shell과 기업 진입 화면. 인증 흐름 영향이 있으면 A 리뷰를 요청한다. |

### Backend Shared Runtime Ownership

| Path | Owner | Notes |
| --- | --- | --- |
| `backend/api/src/modules/health` | A | 배포/헬스체크와 런타임 상태 |
| `backend/api/src/swagger` | A | OpenAPI/Swagger 공통 문서화 DTO |
| `backend/api/scripts/report-smoke.ts` | E | AI 리포트 smoke 검증 |

### Ownership Map Baseline

CI와 로컬 harness의 ownership 기준은 `docs/04_implementation/ownership-map.json`을 단일 source of truth로 사용한다. PowerShell/bash 스크립트에 role별 경로를 중복 하드코딩하지 않는다.

새 경로를 ownership에 추가할 때는 너무 넓은 패턴을 피한다.

| Avoid | Prefer |
| --- | --- |
| `frontend/src/**` | `frontend/src/features/<domain>/**`, `frontend/src/app/<domain>/**` |
| `backend/api/src/**` | `backend/api/src/modules/<module>/**` |

ownership map 변경 PR은 영향 role과 추가된 path pattern을 PR 본문에 적고 관련 owner 리뷰를 요청한다.

### DTO Naming and Location Baseline

DTO와 API client 타입은 아래 naming을 따른다. 같은 요청/응답 타입을 각 module에 중복 생성하지 않는다.

| Kind | Naming | Location |
| --- | --- | --- |
| Request DTO | `Create{Resource}Dto`, `Update{Resource}Dto`, `{Action}{Resource}Dto` | 담당 backend module 내부 `dto` 폴더 |
| Query DTO | `{Resource}QueryDto` 또는 `{Resource}ListQueryDto` | 담당 backend module 내부 `dto` 폴더 |
| Response DTO | `{Resource}ResponseDto`, `{Resource}ListResponseDto` | 담당 backend module 내부 `dto` 폴더 |
| Shared DTO | `CurrentUserDto`, `ApiResponseDto`, `ApiErrorDto`, `PageMetaDto` | `backend/common/src/dto` |
| Frontend API type | `{Resource}Response`, `{Resource}ListResponse`, `{Resource}Query` | `frontend/src/api` 또는 feature-local adapter |

공통 response/error/current-user/page meta DTO는 A 소유 `backend/common/src/dto`에만 둔다. 도메인 DTO가 다른 담당 module의 DTO를 직접 import해야 한다면 먼저 공통 DTO로 승격할지 owner 리뷰를 받는다.

### Shared Table Field Owners

`candidate_profiles`, `candidate_educations`, `candidate_careers`, `candidate_activities`, `candidate_credentials`는 A/D 공동 소유다. D가 지원자 프로필 API/UI를 쓰고 E가 질문 생성용 안전 투영 결과만 읽는다. AI 모듈은 이름·이메일·전화번호 또는 구조화 프로필 원본 테이블을 직접 직렬화하지 않고 Candidate 모듈의 `CandidateProfileAiContextV1` 빌더를 사용한다.

| Table | Field Group | Write Owner | Read Owner |
| --- | --- | --- | --- |
| `applications` | 생성, `submitted_at`, `document_status` | D | B/E |
| `applications` | 제출 스냅샷(`applicant_*`, URL, 지원동기, 추가설명) | B/D | B/D/E |
| `applications` | `application_status`, 초대/운영 상태 | B | D/E |
| `applications` | `interview_status` | D | B/E |
| `applications` | `report_status` | E | B/D |
| `applications` | `screening_decision`, 자동 판정 reason/version/decided_at | E | B/D 제한 조회, C 정책 연동 |
| `applications` | `screening_memo` | B | E 읽기 금지, D 지원자 응답 비노출 |
| `interview_sessions` | 세션 생성/시작/완료, `status` | D | E |
| `interview_session_questions` | 세션별 질문 연결과 표시 순서 | D | E |
| `interview_answers` | 답변 파일, 제출 시각, 질문 이동 | D | E |
| `interview_answers` | `transcript` | E | B/D |
| `evaluation_reports` | 생성, 상태, 요약, 총점 | E | B/D 제한 조회 |
| `question_bank` | CRUD, 공고/평가 기준 연결 | C | D/E |
| `question_bank` | NCS binding/alignment snapshot 최종 적용 | C | D/E |
| `evaluation_criteria` | CRUD, weight/pass score | C | B/E |
| `evaluation_criteria` | NCS profile/mode/version snapshot, criteria version 증가 | C | D/E |
| `auto_screening_policies` | 총점 PASS/HOLD 하한선, criteria 통과 요구, policy version | C | B/E |
| `interview_question_generation_policies` (NQ-M1 예정) | framework, 출처별 질문 수, policy/criteria version | C | D/E |
| `application_interview_question_batches` (NQ-M3 예정) | 생성 상태, 입력 version, 멱등 key, 실패 사유 | E | C/D/A |
| `application_interview_questions` (NQ-M3 예정) | 개인화 질문, NCS 정렬 결과, 생성 snapshot | E | C/D |
| `interview_session_questions` (NQ-M4 예정) | 공통·개인화 질문 합성 및 NCS snapshot | D | C/E |
| `synthetic_applicant_datasets`, `synthetic_applicant_records` | importer 실행, manifest, cleanup audit | D | A/B/C/E/PM |

공유 테이블을 수정하는 PR은 위 field owner를 기준으로 리뷰어를 지정한다. owner가 아닌 모듈에서 직접 write가 필요하면 먼저 `docs/03_contracts`와 이 문서를 수정한다.

`applications`의 재지원 불변식은 동일 `(posting_id, candidate_id)`에서 `CANCELED`가 아닌 row를 최대 하나로 제한한다. 취소 후 재지원은 D가 새 row를 생성하고 기존 취소 이력을 보존한다. B의 기본 지원자 목록과 `applicantCount`는 `CANCELED`를 제외하지만, C의 평가 기준·질문 설정 잠금은 취소 여부와 관계없이 제출 이력을 계속 포함한다. 이 제약 또는 집계 기준을 변경하는 PR은 B/C/D cross-owner 리뷰를 받는다.

## Permission Matrix Baseline

모든 protected API는 `CurrentUser`와 role guard를 기준으로 접근을 판단한다. service 내부에서 `userType` 문자열 비교를 반복 구현하지 않고 guard/decorator/helper를 사용한다.

| Actor | Resource | Allowed Actions | Required Scope |
| --- | --- | --- | --- |
| Public | auth signup/login/password/email verification | create/read token flow | 인증 전 API만 허용 |
| `ADMIN` | 운영/검증 API | read/manage | MVP에서는 최소화하고 별도 관리자 API 추가 시 문서 갱신 |
| `COMPANY` | own company profile | read/update | `CurrentUser.companyId`와 resource `companyId` 일치 |
| `COMPANY` | own postings | create/read/update/archive | `postings.company_id = CurrentUser.companyId` |
| `COMPANY` | own applicants/applications | read automatic screening result, update internal memo/invite | application이 자기 회사 공고에 속해야 함. 자동 판정 결과 직접 변경 금지 |
| `COMPANY` | reports for own postings | read company report | 지원자 제한용 field를 제외한 기업용 report |
| `CANDIDATE` | own profile/documents | read/update/upload | `CurrentUser.candidateId`와 resource `candidateId` 일치 |
| `CANDIDATE` | public/open postings | read/apply | 공고가 공개/지원 가능 상태 |
| `CANDIDATE` | own applications/interviews | read/start/answer/complete | application이 본인 소유이고 응시 기간/동의/장치 점검 조건 충족 |
| `CANDIDATE` | own reports | read limited candidate report | 기업 내부 메모, screening memo, 전체 평가 근거는 노출 금지 |
| Worker/System | AI process/report generation and automatic screening decision | update AI-owned fields and applications automatic screening projection | queue message, process log와 policy snapshot 기준. public controller에서 직접 호출 금지 |

권한 실패는 인증 누락이면 `COMMON_UNAUTHORIZED`, role/resource scope 불일치면 `COMMON_FORBIDDEN`을 반환한다. 존재하지 않는 resource와 권한 없는 resource를 구분해 정보가 누출될 수 있으면 `COMMON_FORBIDDEN` 또는 generic not found 정책을 API별로 명시한다.

| Module | Owns | Reads | Representative APIs | Notes |
| --- |--- |--- |--- |--- |
| auth-common | users, companies, candidate_profiles | Redis/TTL cache | /auth/* | 이메일 인증 코드는 DB 저장 금지 |
| company | postings, evaluation_criteria, auto_screening_policies, question_bank, applications screening memo | reports, candidate_profiles, automatic screening result | /company/* | 기업은 기준을 설정하고 지원자별 자동 판정 결과를 직접 변경하지 않음 |
| candidate-interview | interview_sessions, interview_session_questions, interview_answers, consent_records | applications, postings, question_bank | /candidate/*interview* | 모의면접과 채용면접은 `interview_type`으로 분리 |
| ai-report | evaluation_reports, report_scores, report_evidences, ai_process_logs, ai_guardrail_logs, embeddings, applications automatic screening projection | documents, answers, criteria, auto screening policy | /reports/*, /ai/* | 가드레일 통과 전 결과 저장 금지, 점수 없음은 RETRY |
| file-storage | file_assets | users | /candidate/resume, /company/profile/logo | 원본 파일은 Object Storage |
| notification | notifications | users, applications | invitation/notification endpoints | 메일 발송 실패 상태 기록 |

## API Distribution

| Domain | API Count |
| --- |--- |
| 인증/계정 | 9 |
| 기업 - 대시보드 | 1 |
| 기업 - 채용공고 | 5 |
| 기업 - 지원자/리포트 | 13 |
| 기업 - 면접관리 | 8 |
| AI/리포트 처리 | 5 |
| 기업 - 설정 | 3 |
| 지원자 - 모의면접 | 14 |
| 지원자 - 채용공고/지원 | 3 |
| 지원자 - 지원현황/채용면접 | 7 |
| 지원자 - 채용면접 | 7 |
| 지원자 - 마이페이지 | 4 |
