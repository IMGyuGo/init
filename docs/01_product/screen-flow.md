# Screen Flow

> Source: `init/docs/00_source` 기준. Generated at 2026-06-27.

와이어프레임의 화면 경로와 주요 전환을 포털별로 정리한다.

## Frontend Feature Baseline

Next.js route는 `frontend/src/app`에 두고, 화면별 구현 코드는 `frontend/src/features` 아래 도메인 폴더에 둔다. 같은 화면의 component, hook, client helper는 해당 feature 폴더 안에서 먼저 해결하고 공통화가 필요한 경우에만 `frontend/src/shared`로 이동한다.

| Feature Folder | Owns Routes | Primary Owner |
| --- | --- | --- |
| `frontend/src/features/auth` | `/login`, `/signup`, `/signup/candidate`, `/signup/company`, `/password/reset` | A |
| `frontend/src/features/company-recruiting` | `/company/applications/dashboard`, `/company/recruitments`, `/company/recruitments/new`, `/company/recruitments/{recruitmentId}`, `/company/recruitments/{recruitmentId}/interview-settings`, `/company/recruitments/{recruitmentId}/settings`, `/company/recruitments/{recruitmentId}/applicants` | B |
| `frontend/src/features/company-interview-criteria` | `/company/interviews/settings` | C |
| `frontend/src/features/company-profile` | `/company/mypage` | A/B |
| `frontend/src/features/candidate-application-interview` | `/candidate/jobs`, `/candidate/jobs/{jobId}`, `/candidate/jobs/{jobId}/apply`, `/candidate/applications`, `/candidate/applications/{applicationId}/interview`, `/candidate/applications/{applicationId}/report`, `/candidate/mypage` | D |
| `frontend/src/features/ai-report` | 기업/지원자 리포트 상세, 리포트 상태 표시, AI 처리 상태 표시 component | E |

금지 패턴: 새 화면을 `frontend/src/app` 아래에 모든 로직까지 직접 구현하지 않는다. `app`은 routing/layout 경계로 유지하고, 실제 기능 구현은 feature folder에 둔다.

## High-Level Flow

```mermaid
flowchart TD
  Landing[/랜딩 /] --> Login[/로그인 /login/]
  Login --> Signup[/회원가입 /signup/]
  Signup --> CandidateSignup[/지원자 회원가입/]
  Signup --> CompanySignup[/기업 회원가입/]
  Login --> CompanyDashboard[/기업 공고 관리/]
  CompanyDashboard --> RecruitmentCreate[/공고 생성/]
  RecruitmentCreate --> InterviewBridge[/면접 설정 브릿지/]
  InterviewBridge --> RecruitmentDetail
  CompanyDashboard --> RecruitmentDetail[/공고 세부내용/]
  RecruitmentDetail --> InterviewBridge
  RecruitmentDetail --> Applicants[/지원자 관리/]
  Applicants --> Evaluation[/지원자 평가 상세/]
  Login --> Jobs[/채용공고 목록/]
  Jobs --> MockStart[/지원자 모의면접 시작/]
  MockStart --> MockInterview[/모의면접 진행/]
  MockInterview --> MockReport[/모의면접 리포트/]
  Jobs --> JobDetail[/회사 상세/]
  JobDetail --> Apply[/기업별 이력서 제출/]
  Apply --> Applications[/지원현황/]
  Applications --> RecruitingInterview[/채용 AI 면접 진행/]
  RecruitingInterview --> RecruitingReport[/채용 AI 면접 결과/]
```

## Company Recruitment Creation Flow

기업 공고 생성 흐름은 공고 정보와 JD 입력 후 바로 `OPEN` 등록하지 않고, 먼저 `DRAFT` 공고를 생성한 뒤 면접 설정 단계를 거쳐 `OPEN`으로 전환한다.

```text
공고 정보/JD 입력 -> DRAFT 공고 생성 -> 면접 설정 브릿지 -> 공고 등록하기 -> OPEN 전환 -> 공고 대시보드
```

- B는 공고 생성, JD 텍스트 입력, DRAFT 저장, OPEN 전환, 공고 대시보드 연결을 담당한다.
- B 임시 브릿지 경로는 `/company/recruitments/{recruitmentId}/interview-settings`다.
- C의 실제 면접 설정 경로는 `/company/interviews/settings`이며, 평가 기준/질문 뱅크/면접 시간 저장은 C 담당 영역이다.
- B 임시 브릿지는 실제 C 저장, AI 생성, 면접 세션 연결을 대체하지 않는다.

## NCS Recruiting Question Setup Target Flow

NQ-M1 이후 면접 설정은 평가 기준과 질문 출처를 아래 순서로 확정한다. NQ-M0에서는 이 흐름의 계약만 고정하며 현재 화면 구현 완료를 의미하지 않는다.

```text
1단계 NCS 평가 기준 설정
-> 문제해결능력 / 의사소통능력 / 디지털능력 저장
-> 2단계 질문 구성
-> JD·평가 기준 공통 질문 수 + 이력서 개인화 질문 수 저장
-> JD 공통 질문 즉시 생성·검토
-> 공고 공개 및 지원 대기
-> 지원 완료 + 이력서 추출 완료
-> 지원자별 이력서 질문 생성·정렬 검증
-> READY 질문을 면접 세션에 합성
```

- 1단계에서 `NCS_3_PROFILE_V1`을 선택하면 세 기준을 추가·삭제해 임의 조합하지 않는다. 배점과 순서는 편집할 수 있지만 profile binding은 서버가 제공한다.
- `NCS_ACTIVE_PROFILE_V2`에서는 canonical 세 기준을 유지하되 `weight=0`인 기준을 비활성으로 해석한다. 활성 기준은 1~3개, 활성 배점 합계는 100이어야 한다.
- 지원서 제출 이력이 생긴 공고의 평가 체계·기준·질문 정책은 잠근다. 연결 질문이 있는 기준을 비활성화하려면 질문 영향 확인을 거친다.
- 2단계는 `JD·평가 기준 공통 질문`과 `이력서 개인화 질문` 개수를 별도 numeric control로 입력한다.
- JD 공통 질문은 설정 화면에서 즉시 생성하고 면접관이 적용한다.
- 이력서 질문은 아직 지원자가 없으면 `지원 후 생성`, 문서 추출 대기면 `이력서 분석 대기`, 생성 중이면 `생성 중`, 완료면 `준비 완료`, 실패/검토 필요면 해당 상태를 표시한다.
- `REVIEW_REQUIRED` 또는 `FAILED`인데 이력서 질문 수가 1 이상인 지원자는 면접 세션을 자동 생성하지 않는다. 공통 질문만으로 조용히 대체하지 않는다.
- 지원자 화면에는 개인화 질문 생성 내부 상태, 이력서 추출 텍스트, 정렬점수·실패 사유를 노출하지 않는다. 면접 준비가 끝나지 않았으면 일반적인 `면접 준비 중` 상태만 표시한다.

### Official Three-question Demo Flow

`NCS_ACTIVE_PROFILE_V2`의 공식 데모는 STANDARD 면접을 축약하지 않고 별도 `DEMO_PRESET` 사용 범위와 공식 세션 mode로 고정한다.

```text
활성 기준 3개 + 확정 STANDARD 공통 질문 확인
-> 지원자 문서 factual anchor + DEMO_PRESET 개인화 질문 확인
-> readiness READY
-> DEMO_PRESET 공식 세션 시작
-> 공통 1개
-> 개인화 BASE 1개(JOB_TECHNICAL + PROBLEM_SOLVING)
-> 개인화 follow-up 1개(원본 binding 상속)
-> 총 3문항 snapshot 확정
```

- 공통 질문은 활성 STANDARD 공통 풀에서 `COLLABORATION_COMMUNICATION` 단일 binding 질문을 서버가 선택한다.
- 개인화 BASE는 `DEMO_PRESET` batch에서 `JOB_TECHNICAL`과 `PROBLEM_SOLVING` 두 binding을 가진 질문을 서버가 선택한다.
- 동일 mode 재호출은 `READY` 또는 `IN_PROGRESS`이고 응시 기간이 남은 기존 공식 세션만 재개한다. 완료·실패·만료 세션은 재개 버튼을 노출하지 않으며, 이미 다른 mode의 공식 세션이 있으면 새 세션을 만들지 않는다.
- 준비 불가 상태는 내부 추적번호가 아니라 설정, 질문 풀, 문서 anchor, 기존 세션 등 사용자가 해결할 수 있는 사유로 안내한다.

## Screen Catalog

| Screen | Path | Actor | Depth | Linked API/Route |
| --- |--- |--- |--- |--- |
| 랜딩 화면 | / | 공통 |  | /login |
| 로그인 화면 | /login | 공통 | 로그인 | POST /auth/login / /password/reset / /signup / GET /auth/google (지원자 전용) |
| 회원가입 화면 | /signup | 공통 | 회원가입 |  |
| 지원자 회원가입 화면 | /signup/candidate | 공통 | 회원가입 | POST /auth/signup/candidate / POST /auth/email/send-code / POST /auth/email/verify-code |
| 기업 회원가입 화면 | /signup/company | 공통 | 회원가입 | POST /auth/signup/company / POST /auth/email/send-code / POST /auth/email/verify-code |
| 비밀번호 재설정 화면 | /password/reset | 공통 | 로그인 | POST /auth/password/reset / POST /auth/password/send-code / POST /auth/password/verify-code |
| 공고 관리 화면 | /company/applications/dashboard | 기업 | 지원현황 (GNB button) | GET /company/dashboard / GET /company/recruitments / PATCH /company/applicants/{applicantId}/screening-status |
| 공고 세부내용 화면 | /company/recruitments/{recruitmentId} | 기업 | 지원현황 (GNB button) | GET /company/recruitments/{recruitmentId} / GET /company/recruitments/{recruitmentId}/applicants / GET /company/recruitments/{recruitmentId}/applicants/summary / PATCH /company/applicants/{applicantId}/screening-review / PATCH /company/applicants/{applicantId}/screening-status / POST /company/recruitments/{recruitmentId}/applicants/pass-mails |
| 지원자 관리 화면 | /company/recruitments/{recruitmentId}/applicants | 기업 | 지원현황 (GNB button) | GET /company/recruitments/{recruitmentId}/applicants / POST /company/applicants / POST /company/applicants/invitations / POST /company/interview-sessions / GET /company/applicants / GET /company/reports / GET /company/interviews/applications/{applicationId}/resume-questions / POST /company/interviews/applications/{applicationId}/resume-questions/retry |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | 기업 | 지원현황 (GNB button) | GET /company/applicants/{applicantId}/evaluation / GET /company/applicants/{applicantId}/document-evaluation / GET /company/reports/{reportId} / GET /company/reports/{reportId}/evidence / POST /company/applicants/{applicantId}/media/{fileId}/session / GET /company/applicants/{applicantId}/media/{fileId} / GET /company/applicants/compare / PATCH /company/applicants/{applicantId}/manual-evaluation / GET /company/reports/{reportId}/download / POST /reports/{reportId}/evaluation-context / POST /reports/{reportId}/answer-evaluation / POST /reports/{reportId}/communication-analysis / POST /reports/{reportId}/generate |
| 채용 공고 관리 화면 | /company/recruitments | 기업 | 채용관리 (GNB button) | GET /company/recruitments / GET /company/recruitments?keyword={keyword}&status={status} / /company/recruitments/new / /company/recruitments/{recruitmentId} / /company/recruitments/{recruitmentId}/settings / POST /company/recruitments/{recruitmentId}/copy |
| 공고 생성 화면 | /company/recruitments/new | 기업 | 채용관리 (GNB button) | POST /company/recruitments / POST /company/recruitments/ai-draft / GET /ai/jobs/{processLogId}/status |
| 면접 설정 브릿지 화면 | /company/recruitments/{recruitmentId}/interview-settings | 기업 | 채용관리 (GNB button) | GET /company/recruitments/{recruitmentId} / PATCH /company/recruitments/{recruitmentId} |
| 면접 관리 화면 | /company/interviews/settings | 기업 | 채용관리 (GNB button) | GET /company/interviews/settings / POST /company/interviews/evaluation-criteria/suggest / PATCH /company/interviews/evaluation-criteria / PATCH /company/interviews/question-generation-policy / POST /company/interviews/questions / POST /company/interviews/questions/generate / POST /company/interviews/question-sets / PATCH /company/interviews/time-policy / GET /candidate/applications/{applicationId}/interview-guide |
| 회사 정보 관리 화면 | /company/mypage | 기업 | 회사 정보 관리 (GNB button) | PATCH /company/profile / POST /company/profile/logo / PATCH /company/notifications/settings |
| AI 모의면접 시작 화면 | /candidate/mock-interview/start | 지원자 | AI 모의면접 (GNB button) | POST /candidate/mock-interviews / POST /candidate/mock-interviews/questions/generate |
| AI 모의면접 진행 화면 | /candidate/mock-interviews/{sessionId} | 지원자 | AI 모의면접 (GNB button) | GET /candidate/mock-interviews/{sessionId} / GET /candidate/mock-interviews/{sessionId}/questions / POST /candidate/mock-interviews/{sessionId}/answers / POST /candidate/mock-interviews/{sessionId}/next-question / POST /candidate/mock-interviews/{sessionId}/stt / POST /candidate/mock-interviews/{sessionId}/follow-up-question / PATCH /candidate/mock-interviews/{sessionId}/complete |
| 모의면접 평가 리포트 화면 | /candidate/mock-interview/reports | 지원자 | AI 모의면접 (GNB button) | GET /candidate/mock-interview/reports / GET /candidate/mock-interviews/history |
| 모의면접 평가 리포트 화면 | /candidate/mock-interview/reports/{reportId} | 지원자 | AI 모의면접 (GNB button) | GET /candidate/mock-interview/reports/{reportId}/feedback / GET /candidate/mock-interview/reports/{reportId}/media / POST /candidate/mock-interview/reports/{reportId}/generate |
| 회사 리스트 화면 | /candidate/jobs | 지원자 | 채용정보 (GNB button) | GET /candidate/jobs |
| 회사 상세 화면 | /candidate/jobs/{jobId} | 지원자 | 채용정보 (GNB button) | GET /candidate/jobs/{jobId} / /candidate/jobs/{jobId}/apply |
| 기업별 이력서 제출 화면 | /candidate/jobs/{jobId}/apply | 지원자 | 채용정보 (GNB button) | POST /candidate/jobs/{jobId}/applications |
| 지원현황 화면 | /candidate/applications | 지원자 | 채용정보 (GNB button) | GET /candidate/applications / GET /candidate/applications/{applicationId}/interview-guide / POST /candidate/applications/{applicationId}/consent / POST /candidate/interviews/{sessionId}/device-check / POST /candidate/applications/{applicationId}/interview/start |
| 채용 AI 면접 진행 화면 | /candidate/applications/{applicationId}/interview | 지원자 | 채용정보 (GNB button) | GET /candidate/applications/{applicationId}/interview / GET /candidate/interviews/{sessionId}/questions / POST /candidate/interviews/{sessionId}/answers / POST /candidate/interviews/{sessionId}/next-question / POST /candidate/interviews/{sessionId}/stt / POST /candidate/interviews/{sessionId}/follow-up-question / PATCH /candidate/interviews/{sessionId}/complete |
| 채용 AI 면접 결과 화면 | /candidate/applications/{applicationId}/report | 지원자 | 채용정보 (GNB button) | GET /candidate/applications/{applicationId}/report / GET /candidate/applications/{applicationId}/status |
| 지원자 마이페이지 화면 | /candidate/mypage | 지원자 | 마이페이지 (GNB button) | GET /candidate/profile / PUT /candidate/profile / POST /candidate/resume / POST /candidate/documents/extract / POST /candidate/portfolio-links / GET /candidate/notifications/interview-invitations |
| 공통 AI 시스템 처리 | - | 시스템 |  | POST /ai/guardrails/validate |

## HTML Screen Inventory

| HTML ID | Title | Path | Primary Buttons | Input Labels | Panels |
| --- |--- |--- |--- |--- |--- |
| landing | 1. 지원자 메인 채용공고 화면 | / | 로그인, 기업 서비스 | 검색어, 직무, 경력, 지역 | 비로그인 상태에서 공개 공고 목록 표시. 로그인은 /login, 기업 서비스는 /company/login으로 이동 |
| login | 2. 지원자 로그인 화면 | /login | 보기, 로그인, Google로 로그인, 지원자 회원가입 | 이메일, 비밀번호 | 로그인 성공 시 /candidate/jobs로 이동 |
| company-login | 2-1. 기업 로그인 화면 | /company/login | 보기, 기업 로그인, 기업 회원가입, 지원자 서비스로 돌아가기 | 이메일, 비밀번호 | 로그인 성공 시 /company/applications/dashboard로 이동 |
| signup | 3. 회원가입 유형 선택 | /signup | 다음 |  |  |
| signup-candidate | 4. 지원자 회원가입 | /signup/candidate | 인증 메일 발송, 인증 확인, 보기, 가입하기 | 이름, 이메일, 인증 코드, 비밀번호, 비밀번호 확인 |  |
| signup-company | 5. 기업 회원가입 | /signup/company | 인증 메일 발송, 인증 확인, 보기, 가입하기 | 담당자 이름, 회사명, 이메일, 인증 코드, 비밀번호, 비밀번호 확인 |  |
| password-reset | 6. 비밀번호 재설정 | /password/reset | 인증 코드 발송, 인증 확인, 보기, 비밀번호 재설정 | 가입 이메일, 인증 코드, 새 비밀번호, 새 비밀번호 확인 |  |
| company-postings | 7. 공고 목록 | /company/applications/postings | 지원현황, 채용관리, 마이페이지, 로그아웃, 검색어, 직무 ▼, 진행 상태 ▼, 조회, 관리 |  |  |
| company-dashboard | 8. 공고관리탭 | /company/applications/postings/{postingId}/management | 지원현황 ▼, 공고관리, 지원자 관리, 평가 리포트, 채용관리, 마이페이지, 로그아웃, 편집 / 저장, 이전, 1, 2, 3, ..., 13, 다음, 10개씩 ▼ |  | 다음 전형 대상자 선별 |
| company-applicants | 9. 지원자 관리 | /company/applications/postings/{postingId}/applicants | 지원현황 ▼, 공고관리, 지원자 관리, 평가 리포트, 채용관리, 마이페이지, 로그아웃, 직접 등록, CSV 업로드, 응시 시작일, 응시 종료일, 안내 메시지 입력, 초대 메일 발송, 프로젝트 ▼, 상태 ▼, 검색어, 조회, 보기 | 이름, 이메일, 지원 직무, 연락처 | 지원자 등록, 초대 링크 발송, 지원자 진행 상태 목록 |
| document-evaluation | 10. 서류 평가 상세 | /company/applicants/{applicantId}/document-evaluation | 비교 대상 선택 ▼, 비교하기, 저장 | 수동 점수, 최종 상태, 메모 | 지원자: 김지원 / Backend Developer / 서류 평가 완료, 평가 근거 확인, 지원자 리포트 목록, 지원자 비교, 면접관 수동 평가 / 메모 |
| recruiting-report | 11. 채용 리포트 상세 | /company/reports/{reportId} | PDF 다운로드 v2.0, Excel 다운로드 v2.0 |  | 김지원 / Backend Developer / RECRUITING_REPORT, 역량별 점수, 평가 근거, 영상 / 스크립트 동시 조회, 커뮤니케이션 보조 지표 |
| recruitments | 12. 채용 공고 관리 | /company/recruitments | 마이페이지, 로그아웃, 채용관리, 공고 생성, 관리 | 검색어, 상태 | 채용 공고 목록 |
| recruitment-create | 12-1. 공고 생성 | /company/recruitments/new | 공고 목록, 다음 | 공고 제목, 직무명, 채용 시작일, 채용 마감일, JD 직접 입력, JD 파일 | 공고 정보 입력, JD 등록 |
| recruitment-interview-bridge | 12-2. 면접 설정 브릿지 | /company/recruitments/{recruitmentId}/interview-settings | 공고 설정, 대시보드, 공고 등록하기 |  | 공고 정보, 평가 기준 연결 대기, 질문 뱅크 연결 대기, 면접 시간 연결 대기 |
| interview-settings | 13. 면접 관리 | /company/interviews/settings | 마이페이지, 로그아웃, 지원현황, 채용관리, JD 기반 평가 역량 추천, 저장, JD 기반 직무 질문 생성, 질문 세트 구성, 질문 저장, 준비 시간: 30초, 답변 시간: 90초, 재응시 허용: N, 설정 저장 | 질문 내용, 질문 유형, 평가 역량 | AI 평가 역량 제안, 평가 기준 설정, 질문 뱅크 관리, 면접 시간 설정 |
| company-mypage | 14. 기업 마이페이지 | /company/mypage | 마이페이지, 로그아웃, 지원현황, 채용관리, 프로필 저장, 담당자 선택 ▼, □ 제출 완료, □ 면접 완료, □ 리포트 생성 완료, 프로젝트 선택 ▼, 저장 | 기업명, 산업군, 인재상, 평가 정책 | 기업 프로필 등록, 진행 상태 알림 설정 - v2.0 |
| mock-start | 15. AI 모의면접 시작 | /candidate/mock-interview/start | 마이페이지, 로그아웃, AI 모의면접, 채용정보, 모의면접 시작 | 직무, 난이도, 질문 유형 | 모의면접 설정, 연습 이력 |
| mock-progress | 16. AI 모의면접 진행 | /candidate/mock-interviews/{sessionId} | 질문 음성 다시 듣기, 답변 완료, 다음 질문으로 이동 |  | 답변 상태 |
| mock-report | 17. 모의면접 리포트 상세 | /candidate/mock-interview/reports/{reportId} |  |  | MOCK_REPORT / 분석 완료, 종합 피드백, 역량별 점수, 영상 / 스크립트 동시 조회 |
| jobs | 18. 회사 리스트 | /candidate/jobs | 마이페이지, 로그아웃, AI 모의면접, 채용정보, 검색어, 직무 ▼, 지역 ▼, 채용 상태 ▼, 조회, 상세 보기 |  |  |
| job-detail | 19. 회사 상세 팝업 | /candidate/jobs/{jobId} | 지원하기, 닫기 |  | 회사 정보, JD |
| application-submit | 19-1. 지원서 제출 모달 | /candidate/jobs/{jobId}?apply=1 | STEP 1 프로필·지원서 세트, STEP 2 서류·지원 내용, STEP 3 동의 및 제출, 지원서 세트 불러오기·편집 | 마이페이지 전체 프로필 복사본, 이력서, 포트폴리오, 지원 동기, 추가 설명 | 선택 세트의 명시적 빈 값을 포함해 전체 입력 교체. 세트 편집 시 별도 페이지를 거쳐 작성 초안을 복원하고 수정 세트를 자동 적용 |
| applications | 20. 지원현황 | /candidate/applications | AI 모의면접, 채용정보 ▼, 채용공고, 지원현황, 마이페이지, 로그아웃, 상태 필터 ▼, 조회, 카메라 점검, 마이크 점검, 네트워크 점검, 채용 AI 면접 시작 |  | 선택한 지원 건: 회사명 A / Backend Developer, AI 면접 안내, 응시 동의, 장치 점검 |
| recruiting-interview | 21. 채용 AI 면접 진행 | /candidate/applications/{applicationId}/interview | 질문 음성 다시 듣기, 답변 완료, 다음 질문으로 이동 |  | 답변 상태 |
| candidate-result | 22. 채용 AI 면접 결과 | /candidate/applications/{applicationId}/report | 지원현황으로 돌아가기 |  | 회사명 A / Backend Developer, 전형 상태, 제한된 피드백 |
| candidate-mypage | 23. 지원자 마이페이지 | /candidate/mypage | 마이페이지, 로그아웃, AI 모의면접, 채용정보, 프로필 저장, 학력/경력/활동/자격 항목 추가·삭제 | 기본정보, 학력, 경력, 프로젝트·경험·활동·교육, 자격·어학·수상, 자기소개서 | 기본정보는 항상 표시하고 4개 반복 섹션은 독립 다중 아코디언으로 편집. 제일 하단 자기소개서는 최대 5,000자이며 맞춤형 질문 생성에 사용 |
| candidate-application-set-new | 23-1. 지원서 세트 추가 | /candidate/application-sets/new | 세트 저장, 취소, 프로필·서류·지원 내용 편집 | 현재 마이페이지 전체 프로필을 최초 기준으로 복사 | 저장 후 세트 목록으로 이동 |
| candidate-application-set-edit | 23-2. 지원서 세트 수정 | /candidate/application-sets/{setId}/edit | 세트 저장, 취소, 프로필·서류·지원 내용 편집 | 세트에 고정된 전체 프로필 복사본 | 지원 모달에서 진입한 경우 원래 공고로 돌아가 수정 세트를 자동 적용 |
| system-process | SYS. 화면에 직접 노출되지 않는 시스템 처리 | system process |  |  |  |
