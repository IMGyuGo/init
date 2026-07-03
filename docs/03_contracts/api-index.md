# API Index

> Source: `init/docs/00_source` 기준. Generated at 2026-06-27.

API 전체 목록을 도메인별로 빠르게 탐색한다.

## API Module Baseline

NestJS 구현은 API path를 그대로 controller 파일명으로 흩뜨리지 않고 아래 module/controller 기준으로 묶는다.

| Module Folder | Controller Baseline | Route Prefix | Primary Owner | API Range |
| --- | --- | --- | --- | --- |
| `backend/api/src/modules/auth` | `AuthController` | `/api/v1/auth` | A | API-001..009 |
| `backend/api/src/modules/company-recruiting` | `CompanyRecruitingController`, `PublicRecruitmentController`, `PublicApplicationController` | `/api/v1/company/recruitments`, `/api/v1/company/applicants`, `/api/v1/public/recruitments`, `/api/v1/public/applications` | B | API-010..033 중 공고/지원자 운영, API-080, API-086..089 |
| `backend/api/src/modules/company-interview` | `CompanyInterviewController` | `/api/v1/company/interviews` | C | API-034..040 |
| `backend/api/src/modules/company-profile` | `CompanyProfileController` | `/api/v1/company/profile`, `/api/v1/company/notifications` | A/B | API-041..043 |
| `backend/api/src/modules/candidate` | `CandidateController` | `/api/v1/candidate/jobs`, `/api/v1/candidate/applications`, `/api/v1/candidate/resume`, `/api/v1/candidate/portfolio-links` | D | API-058..078 중 지원/마이페이지 |
| `backend/api/src/modules/interview` | `InterviewController`, `PublicInterviewController` | `/api/v1/candidate/mock-interviews`, `/api/v1/candidate/interviews`, `/api/v1/public` | D/E | API-044..057, API-064..072, API-087..096 |
| `backend/api/src/modules/report` | `ReportController` | `/api/v1/company/reports`, `/api/v1/reports`, `/api/v1/candidate/*/reports` | E | API-019, API-022..031, API-053..057, API-073 |
| `backend/api/src/modules/ai` | `AiController` | `/api/v1/ai` | E | API-079 |

기존 구현에 다른 route alias가 있으면 임시 controller alias는 둘 수 있지만 service는 위 module 기준으로만 하나를 유지한다. 새 API는 이 표에 먼저 배치한 뒤 api-index/api-spec에 추가한다.

| API ID | Domain | Method | Path | Summary | Auth | Async | Status |
| --- |--- |--- |--- |--- |--- |--- |--- |
| API-001 | 인증/계정 | POST | /auth/login | 이메일/비밀번호 입력 / 로그인 요청 | 비로그인 허용 | N | 200 OK |
| API-002 | 인증/계정 | GET | /auth/google | 지원자 전용 Google OAuth 로그인 | 비로그인 허용 | N | 200 OK |
| API-003 | 인증/계정 | POST | /auth/signup/candidate | 지원자 계정 생성 | 비로그인 허용 | N | 201 Created |
| API-004 | 인증/계정 | POST | /auth/email/send-code | 이메일 인증 요청 | 비로그인 허용 | N | 200 OK |
| API-005 | 인증/계정 | POST | /auth/email/verify-code | 이메일 인증 코드 확인 | 비로그인 허용 | N | 200 OK |
| API-006 | 인증/계정 | POST | /auth/signup/company | 기업 계정 생성 | 비로그인 허용 | N | 201 Created |
| API-007 | 인증/계정 | POST | /auth/password/reset | 비밀번호 재설정 | 비로그인 허용 | N | 200 OK |
| API-008 | 인증/계정 | POST | /auth/password/send-code | 비밀번호 재설정 인증 요청 | 비로그인 허용 | N | 200 OK |
| API-009 | 인증/계정 | POST | /auth/password/verify-code | 비밀번호 재설정 인증 확인 | 비로그인 허용 | N | 200 OK |
| API-080 | 인증/계정 | GET | /auth/me | 현재 로그인 사용자 조회 | 로그인 필요 | N | 200 OK |
| API-081 | 인증/계정 | POST | /auth/refresh | refreshToken 쿠키로 accessToken 재발급 | refreshToken 쿠키 | N | 200 OK |
| API-082 | 인증/계정 | POST | /auth/logout | refreshToken 쿠키 제거 | 로그인 권장 | N | 200 OK |
| API-010 | 기업 - 대시보드 | GET | /company/dashboard | 공고 목록 및 운영 현황 조회 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-011 | 기업 - 채용공고 | GET | /company/recruitments | 회사별 공고 목록 조회 / 채용 공고 목록 조회 / 채용 공고 리스트 표시 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-080 | 기업 - 채용공고 | POST | /company/recruitments | 기업 공고 생성 | 기업 / 기업 사용자 로그인 | N | 201 Created |
| API-012 | 기업 - 지원자/리포트 | PATCH | /company/applicants/{applicantId}/screening-status | 전형 상태 지정 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-013 | 기업 - 채용공고 | GET | /company/recruitments/{recruitmentId} | 공고 상세 및 지원자 관리 진입 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-083 | 기업 - 채용공고 | PATCH | /company/recruitments/{recruitmentId} | 공고 설정 수정 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-084 | 기업 - 채용공고 | DELETE | /company/recruitments/{recruitmentId} | 공고 삭제/보관 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-086 | 기업 - 채용공고 | POST | /company/recruitments/jd-images | JD 에디터 이미지 업로드 | 기업 / 기업 사용자 로그인 | N | 201 Created |
| API-014 | 기업 - 채용공고 | GET | /company/recruitments/{recruitmentId}/applicants | 공고별 지원자 관리 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-086 | 공개 - 채용공고/지원 | GET | /public/recruitments/{recruitmentId} | 공개 공고 상세 조회 | 비로그인 허용 | N | 200 OK |
| API-087 | 공개 - 채용공고/지원 | POST | /public/recruitments/{recruitmentId}/applications | 공개 지원 폼 제출 | 비로그인 허용 | N | 201 Created |
| API-088 | 공개 - 채용공고/지원 | POST | /public/recruitments/{recruitmentId}/applications/access-link | 지원 현황 매직링크 재발급 요청 | 비로그인 허용 | N | 200 OK |
| API-089 | 공개 - 채용공고/지원 | GET | /public/applications/status | 매직링크 토큰 기반 지원 현황 조회 | 매직링크 토큰 필요 | N | 200 OK |
| API-089B | 공개 - 채용공고/지원 | POST | /public/applications/token/verify | D public 면접 시작용 매직링크 토큰 검증 | B-D 서버 내부 호출 / 매직링크 토큰 필요 | N | 200 OK |
| API-017 | 기업 - 면접관리 | POST | /company/interview-sessions | 면접 세션 자동 생성 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-018 | 기업 - 지원자/리포트 | GET | /company/applicants | 지원 상태 조회 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-019 | 기업 - 지원자/리포트 | GET | /company/reports | 리포트 상태 조회 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-020 | 기업 - 지원자/리포트 | GET | /company/applicants/{applicantId}/evaluation | 서류 평가와 채용 리포트 통합 조회 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-021 | 기업 - 지원자/리포트 | GET | /company/applicants/{applicantId}/document-evaluation | 서류 평가 근거 조회 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-022 | 기업 - 지원자/리포트 | GET | /company/reports/{reportId} | 역량별 점수 조회 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-023 | 기업 - 지원자/리포트 | GET | /company/reports/{reportId}/evidence | 근거 기반 평가 조회 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-024 | 기업 - 지원자/리포트 | GET | /company/reports/{reportId}/media | 영상/스크립트 조회 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-025 | 기업 - 지원자/리포트 | GET | /company/applicants/compare | 지원자 비교 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-026 | 기업 - 지원자/리포트 | PATCH | /company/applicants/{applicantId}/manual-evaluation | 수동 평가 입력 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-027 | 기업 - 지원자/리포트 | GET | /company/reports/{reportId}/download | 리포트 다운로드 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-028 | AI/리포트 처리 | POST | /reports/{reportId}/evaluation-context | 평가 컨텍스트 구성 | 기업 / 기업 사용자 로그인 | Y | 202 Accepted |
| API-029 | AI/리포트 처리 | POST | /reports/{reportId}/answer-evaluation | 답변 채점 및 근거 생성 | 기업 / 기업 사용자 로그인 | Y | 202 Accepted |
| API-030 | AI/리포트 처리 | POST | /reports/{reportId}/communication-analysis | 비언어/음성 지표 보조 분석 | 기업 / 기업 사용자 로그인 | Y | 202 Accepted |
| API-031 | AI/리포트 처리 | POST | /reports/{reportId}/generate | 리포트 생성 | 기업 / 기업 사용자 로그인 | Y | 202 Accepted |
| API-032 | 기업 - 채용공고 | GET | /company/recruitments?keyword={keyword}&status={status} | 공고 검색/필터링 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-033 | 기업 - 채용공고 | POST | /company/recruitments/{recruitmentId}/copy | 마감 공고 복사 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-034 | 기업 - 면접관리 | GET | /company/interviews/settings | 면접 설정 관리 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-035 | 기업 - 면접관리 | POST | /company/interviews/evaluation-criteria/suggest | AI 평가 역량 태그 추천 | 기업 / 기업 사용자 로그인 | Y | 202 Accepted |
| API-036 | 기업 - 면접관리 | PATCH | /company/interviews/evaluation-criteria | 평가 기준 편집 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-037 | 기업 - 면접관리 | POST | /company/interviews/questions | 질문 등록/연결 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-038 | 기업 - 면접관리 | POST | /company/interviews/questions/generate | JD 기반 직무 질문 생성 | 기업 / 기업 사용자 로그인 | Y | 202 Accepted |
| API-039 | 기업 - 면접관리 | POST | /company/interviews/question-sets | 면접 질문 목록 구성 | 기업 / 기업 사용자 로그인 | Y | 202 Accepted |
| API-039A | 기업 - 면접관리 | POST | /company/interviews/question-sets/confirm | 면접 질문 세트 확정 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-039B | 기업 - 면접관리 | GET | /company/interviews/question-sets/active | 활성 면접 질문 세트 조회 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-040 | 기업 - 면접관리 | PATCH | /company/interviews/time-policy | 면접 시간 정책 설정 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-087 | 기업 - 설정 | GET | /company/profile | 회사 정보 조회 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-041 | 기업 - 설정 | PATCH | /company/profile | 회사 정보 수정 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-042 | 기업 - 설정 | POST | /company/profile/logo | 회사 로고 이미지 업로드 | 기업 / 기업 사용자 로그인 | N | 201 Created |
| API-043 | 기업 - 설정 | PATCH | /company/notifications/settings | 알림 설정 | 기업 / 기업 사용자 로그인 | N | 200 OK |
| API-044 | 지원자 - 모의면접 | POST | /candidate/mock-interviews | AI 모의면접 시작 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-045 | 지원자 - 모의면접 | POST | /candidate/mock-interviews/questions/generate | 연습용 질문 목록 구성 | 지원자 / 지원자 사용자 로그인 | Y | 202 Accepted |
| API-046 | 지원자 - 모의면접 | GET | /candidate/mock-interviews/{sessionId} | 개인 연습용 AI 면접 진행 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-047 | 지원자 - 모의면접 | GET | /candidate/mock-interviews/{sessionId}/questions | 질문 음성 안내 및 면접 질문 표시 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-048 | 지원자 - 모의면접 | POST | /candidate/mock-interviews/{sessionId}/answers | 영상/음성 답변 녹화 | 지원자 / 지원자 사용자 로그인 | N | 201 Created |
| API-049 | 지원자 - 모의면접 | POST | /candidate/mock-interviews/{sessionId}/next-question | 다음 질문 이동 및 단축키 지원 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-050 | 지원자 - 모의면접 | POST | /candidate/mock-interviews/{sessionId}/stt | STT 처리 | 지원자 / 지원자 사용자 로그인 | Y | 202 Accepted |
| API-051 | 지원자 - 모의면접 | POST | /candidate/mock-interviews/{sessionId}/follow-up-question | 꼬리질문 생성 | 지원자 / 지원자 사용자 로그인 | Y | 202 Accepted |
| API-051-TMP | 지원자 - 모의면접 | POST | /candidate/mock-interviews/{sessionId}/follow-up-questions/insert | 생성된 꼬리질문을 면접 질문 흐름에 추가 (MVP 임시 브릿지) | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-052 | 지원자 - 모의면접 | PATCH | /candidate/mock-interviews/{sessionId}/complete | 면접 종료 및 분석 상태 전환 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-053 | 지원자 - 모의면접 | GET | /candidate/mock-interview/reports | 연습 이력 및 리포트 조회 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-054 | 지원자 - 모의면접 | GET | /candidate/mock-interviews/history | 연습 이력 조회 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-055 | 지원자 - 모의면접 | GET | /candidate/mock-interview/reports/{reportId}/feedback | 모의면접 피드백 조회 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-056 | 지원자 - 모의면접 | GET | /candidate/mock-interview/reports/{reportId}/media | 영상/스크립트 조회 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-057 | 지원자 - 모의면접 | POST | /candidate/mock-interview/reports/{reportId}/generate | 피드백 리포트 생성 | 지원자 / 지원자 사용자 로그인 | Y | 202 Accepted |
| API-058 | 지원자 - 채용공고/지원 | GET | /candidate/jobs | 채용공고 목록 조회 / 채용공고 검색 / 채용공고 리스트 표시 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-059 | 지원자 - 채용공고/지원 | GET | /candidate/jobs/{jobId} | 채용공고 상세 조회 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-060 | 지원자 - 채용공고/지원 | POST | /candidate/jobs/{jobId}/applications | 기업별 지원 서류 제출 | 지원자 / 지원자 사용자 로그인 | N | 201 Created |
| API-061 | 지원자 - 지원현황/채용면접 | GET | /candidate/applications | 지원 상태 조회 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-062 | 지원자 - 지원현황/채용면접 | GET | /candidate/applications/{applicationId}/interview-guide | 채용 AI 면접 방식 안내 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-063 | 지원자 - 지원현황/채용면접 | POST | /candidate/applications/{applicationId}/consent | 개인정보/분석 동의 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-064 | 지원자 - 채용면접 | POST | /candidate/interviews/{sessionId}/device-check | 카메라/마이크/네트워크 점검 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-065 | 지원자 - 지원현황/채용면접 | POST | /candidate/applications/{applicationId}/interview/start | 채용 전형용 AI 면접 세션 시작 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-066 | 지원자 - 지원현황/채용면접 | GET | /candidate/applications/{applicationId}/interview | 채용 전형용 AI 면접 진행 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-067 | 지원자 - 채용면접 | GET | /candidate/interviews/{sessionId}/questions | 질문 음성 안내 및 면접 질문 표시 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-068 | 지원자 - 채용면접 | POST | /candidate/interviews/{sessionId}/answers | 영상/음성 답변 녹화 | 지원자 / 지원자 사용자 로그인 | N | 201 Created |
| API-069 | 지원자 - 채용면접 | POST | /candidate/interviews/{sessionId}/next-question | 다음 질문 이동 및 단축키 지원 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-070 | 지원자 - 채용면접 | POST | /candidate/interviews/{sessionId}/stt | STT 처리 | 지원자 / 지원자 사용자 로그인 | Y | 202 Accepted |
| API-071 | 지원자 - 채용면접 | POST | /candidate/interviews/{sessionId}/follow-up-question | 꼬리질문 생성 | 지원자 / 지원자 사용자 로그인 | Y | 202 Accepted |
| API-071-TMP | 지원자 - 채용면접 | POST | /candidate/interviews/{sessionId}/follow-up-questions/insert | 생성된 꼬리질문을 면접 질문 흐름에 추가 (MVP 임시 브릿지) | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-072 | 지원자 - 채용면접 | PATCH | /candidate/interviews/{sessionId}/complete | 면접 종료 및 분석 상태 전환 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-087 | 지원자 - Public 채용면접 | POST | /public/applications/{applicationId}/interview/start | public 면접 access token 발급 및 세션 조회/생성 | B magic token | N | 200 OK |
| API-088 | 지원자 - Public 채용면접 | POST | /public/applications/{applicationId}/interview/begin | public 채용면접 시작/재개 | publicAccessToken | N | 200 OK |
| API-089 | 지원자 - Public 채용면접 | GET | /public/applications/{applicationId}/interview | public 채용면접 런타임 조회 | publicAccessToken | N | 200 OK |
| API-090 | 지원자 - Public 채용면접 | POST | /public/interviews/{sessionId}/device-check | public 면접 장치 점검 | publicAccessToken | N | 200 OK |
| API-091 | 지원자 - Public 채용면접 | GET | /public/interviews/{sessionId}/questions | public 면접 질문 조회 | publicAccessToken | N | 200 OK |
| API-092 | 지원자 - Public 채용면접 | POST | /public/interviews/{sessionId}/answers | public 면접 답변 저장 | publicAccessToken | N | 201 Created |
| API-093 | 지원자 - Public 채용면접 | POST | /public/interviews/{sessionId}/next-question | public 면접 다음 질문 이동 | publicAccessToken | N | 200 OK |
| API-094 | 지원자 - Public 채용면접 | POST | /public/interviews/{sessionId}/stt | public 면접 STT 처리 | publicAccessToken | Y | 202 Accepted |
| API-095 | 지원자 - Public 채용면접 | POST | /public/interviews/{sessionId}/follow-up-question | public 면접 꼬리질문 생성 | publicAccessToken | Y | 202 Accepted |
| API-096 | 지원자 - Public 채용면접 | PATCH | /public/interviews/{sessionId}/complete | public 면접 종료 및 분석 상태 전환 | publicAccessToken | N | 200 OK |
| API-073 | 지원자 - 지원현황/채용면접 | GET | /candidate/applications/{applicationId}/report | 지원자용 제한 결과 조회 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-074 | 지원자 - 지원현황/채용면접 | GET | /candidate/applications/{applicationId}/status | 채용 전형 진행 상태 조회 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-075 | 지원자 - 마이페이지 | POST | /candidate/resume | 이력서 파일 제출 | 지원자 / 지원자 사용자 로그인 | N | 201 Created |
| API-076 | 지원자 - 마이페이지 | POST | /candidate/documents/extract | 서류 텍스트 추출 | 지원자 / 지원자 사용자 로그인 | Y | 202 Accepted |
| API-077 | 지원자 - 마이페이지 | POST | /candidate/portfolio-links | 직무 관련 링크 등록 | 지원자 / 지원자 사용자 로그인 | N | 201 Created |
| API-078 | 지원자 - 마이페이지 | GET | /candidate/notifications/interview-invitations | 응시 안내 메일 조회 | 지원자 / 지원자 사용자 로그인 | N | 200 OK |
| API-079 | AI/리포트 처리 | POST | /ai/guardrails/validate | AI 출력 안전성 검증 | 시스템 / 자동 처리 | N | 200 OK |
| API-080 | AI/리포트 처리 | GET | /ai/jobs/{processLogId}/status | AI 작업 상태 조회 | 로그인 사용자 / 개발 임시 인증 | N | 200 OK |
