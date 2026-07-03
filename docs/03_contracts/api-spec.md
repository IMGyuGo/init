# API Spec

> Source: `init/docs/00_source` 기준. Generated at 2026-06-27.

AI와 구현 에이전트가 바로 읽을 수 있는 상세 API 명세다.

## Common Contract

- Base URL: `/api/v1`
- Success: `{ "data": ..., "meta": { "traceId": "...", "timestamp": "ISO-8601" } }`
- Error: `{ "error": { "code": "STRING", "message": "사용자 표시 메시지", "details": [] } }`
- Auth: 공개 API를 제외하고 `Authorization: Bearer {accessToken}`
- CurrentUser/Dev Auth: `docs/03_contracts/dev-auth-contract.md` 기준. JWT 구현 전에는 local/dev 환경에서 `X-Dev-*` 헤더로 동일한 `CurrentUser`를 만든다.
- Session: 로그인 성공 시 `accessToken`은 응답 본문으로 반환하고 `refreshToken`은 HttpOnly cookie로 설정한다. 프론트엔드는 protected API에 `Authorization: Bearer {accessToken}`을 사용한다.
- Google OAuth: 지원자(`CANDIDATE`) 개인 계정만 허용한다. 기업(`COMPANY`) 계정은 이메일 회원가입/로그인만 사용하며 Google OAuth 요청은 `AUTH_USER_TYPE_MISMATCH` 또는 `COMMON_FORBIDDEN`으로 거부한다.
- Email delivery: 이메일 인증과 비밀번호 재설정 코드는 Redis TTL 캐시에 저장하고 SMTP로 발송한다.

### Response Envelope Baseline

모든 JSON API는 아래 envelope를 따른다. controller별로 `{ result }`, `{ success }`, `{ items }`를 최상위에 직접 반환하지 않는다.

```json
{
  "data": {},
  "meta": {
    "traceId": "request-id",
    "timestamp": "2026-06-29T00:00:00.000Z"
  }
}
```

목록 API는 `data.items`와 `meta.page`를 사용한다.

```json
{
  "data": {
    "items": []
  },
  "meta": {
    "traceId": "request-id",
    "timestamp": "2026-06-29T00:00:00.000Z",
    "page": {
      "page": 1,
      "limit": 20,
      "totalItems": 0,
      "totalPages": 0,
      "hasNext": false
    }
  }
}
```

오류 응답은 HTTP status와 `error.code`를 함께 사용한다. `details`는 validation field error 배열 또는 디버깅 가능한 구조화 데이터만 담고, stack trace는 반환하지 않는다.

```json
{
  "error": {
    "code": "COMMON_VALIDATION_FAILED",
    "message": "입력값을 확인해주세요.",
    "details": []
  },
  "meta": {
    "traceId": "request-id",
    "timestamp": "2026-06-29T00:00:00.000Z"
  }
}
```

### Pagination Filter Sort Baseline

목록 API는 별도 사유가 없으면 아래 query parameter 이름을 사용한다.

| Parameter | Type | Default | Rule |
| --- | --- | --- | --- |
| `page` | number | `1` | 1부터 시작한다. 1보다 작으면 validation error를 반환한다. |
| `limit` | number | `20` | 최대 `100`까지 허용한다. |
| `q` | string | 없음 | 자유 검색어. 빈 문자열은 전달하지 않는다. |
| `sort` | string | API별 기본값 | 정렬 가능한 field만 허용한다. |
| `order` | `asc` 또는 `desc` | `desc` | 대소문자를 섞지 않고 lowercase만 허용한다. |

도메인 필터는 enum 이름을 그대로 query에 사용한다. 예: `postingStatus=OPEN`, `applicationStatus=SUBMITTED`, `reportStatus=COMPLETED`.

## Implementation Baseline

API 구현은 `docs/03_contracts/api-index.md`의 `API Module Baseline`을 따른다.

- 인증 API는 `backend/api/src/modules/auth`에 둔다.
- 기업 공고/지원자 운영 API는 `backend/api/src/modules/company-recruiting`에 둔다.
- 기업 면접 설정/평가 기준/질문 API는 `backend/api/src/modules/company-interview`에 둔다.
- 지원자 공고/지원/마이페이지 API는 `backend/api/src/modules/candidate`에 둔다.
- 모의/채용 면접 런타임 API는 `backend/api/src/modules/interview`에 둔다.
- 리포트 API는 `backend/api/src/modules/report`, AI 공통 API는 `backend/api/src/modules/ai`에 둔다.
- 기존 구현에 임시 alias route가 있더라도 신규 service와 DTO는 baseline module 기준으로 정렬한다.

## 인증/계정

### API-001 POST /auth/login
- 도메인: 인증/계정
- 권한/인증: 비로그인 허용
- 관련 화면: 로그인 화면 (/login)
- UI Type: form, button
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 이메일, 비밀번호
  - 사용자 유형, 이메일, 비밀번호
- 검증/전제조건:
  - 등록된 계정 정보와 일치
  - 사용자 유형 선택 및 계정 정보 일치
- 성공 응답/처리:
  - 로그인 버튼 클릭 가능
  - 기업은 지원현황 > 공고 관리로 이동, 지원자는 AI 모의면접 > 면접시작으로 이동
- 오류/예외:
  - 계정 정보 불일치, 비활성 계정, 사용자 유형 불일치 시 로그인 실패 메시지를 표시한다.
  - 계정 정보 불일치, 비활성 계정, 권한 불일치, 서버 오류 시 로그인 실패 메시지를 표시한다.
- 관련 ERD 테이블:
  - users, companies, candidate_profiles, postings, applications, interview_sessions, notifications, ai_process_logs
- 비고/미결:
  - ID/PW 찾기·회원가입 링크는 비밀번호 입력란 바로 아래 배치
  - 기업 기본 진입: /company/applications/dashboard, 지원자 기본 진입: /candidate/mock-interview/start

### API-002 GET /auth/google
- 도메인: 인증/계정
- 권한/인증: 비로그인 허용
- 관련 화면: 로그인 화면 (/login)
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - Google 계정 정보, 사용자 유형(CANDIDATE)
- 검증/전제조건:
  - 사용자 유형은 지원자(CANDIDATE)만 허용
  - Google OAuth 인증 성공 및 계정 연동 성공
- 성공 응답/처리:
  - 지원자는 AI 모의면접 > 면접시작으로 이동
- 오류/예외:
  - 기업(COMPANY) 유형으로 요청하면 `AUTH_USER_TYPE_MISMATCH`로 거부한다.
  - OAuth 인증 실패, 계정 연동 실패, 권한 거부 시 로그인 실패 메시지를 표시한다.
- 관련 ERD 테이블:
  - users, companies, candidate_profiles, postings, applications, interview_sessions, notifications, ai_process_logs
- 비고/미결:
  - Google 로그인은 지원자 개인 계정만 허용한다.
  - 이메일 회원가입과 달리 별도 이메일 인증 입력 단계는 적용하지 않음

### API-003 POST /auth/signup/candidate
- 도메인: 인증/계정
- 권한/인증: 비로그인 허용
- 관련 화면: 지원자 회원가입 화면 (/signup/candidate)
- UI Type: form
- 상태 코드: 201 Created
- 비동기: N
- 요청 데이터:
  - 이메일, 인증 코드, 비밀번호, 비밀번호 확인, 이름, 약관 동의
- 검증/전제조건:
  - 이메일 형식, 이메일 인증 완료, 비밀번호 정책, 비밀번호 확인 일치, 필수 약관 동의 충족
- 성공 응답/처리:
  - 지원자 계정 생성 후 로그인 화면 또는 지원자 포털 > AI 모의면접 > 면접시작으로 이동
- 오류/예외:
  - 중복 이메일, 이메일 인증 실패, 인증 코드 만료, 약관 미동의, 비밀번호 정책 미충족, 비밀번호 불일치 시 오류 메시지를 표시한다.
- 관련 ERD 테이블:
  - users, candidate_profiles, applications, consent_records, interview_sessions, notifications, ai_process_logs
- 비고/미결:
  - 이메일 회원가입은 이메일 인증 필수

### API-004 POST /auth/email/send-code
- 도메인: 인증/계정
- 권한/인증: 비로그인 허용
- 관련 화면: 지원자 회원가입 화면 (/signup/candidate)
기업 회원가입 화면 (/signup/company)
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 이메일
- 검증/전제조건:
  - 이메일 형식이 유효해야 함
- 성공 응답/처리:
  - 인증 코드 입력 영역 활성화
- 오류/예외:
  - 이미 가입된 이메일, 이메일 형식 오류, 메일 발송 실패 시 오류 메시지를 표시한다.
- 관련 ERD 테이블:
  - users, companies, candidate_profiles, applications, notifications, ai_process_logs, Redis/TTL cache
- 비고/미결:
  - 우선 이메일 인증만 구현

### API-005 POST /auth/email/verify-code
- 도메인: 인증/계정
- 권한/인증: 비로그인 허용
- 관련 화면: 지원자 회원가입 화면 (/signup/candidate)
기업 회원가입 화면 (/signup/company)
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 이메일, 인증 코드
- 검증/전제조건:
  - 인증 코드가 유효하고 만료되지 않아야 함
- 성공 응답/처리:
  - 이메일 인증 완료 상태로 전환
- 오류/예외:
  - 코드 불일치, 인증 만료, 재시도 횟수 초과 시 오류 메시지를 표시한다.
- 관련 ERD 테이블:
  - users, companies, candidate_profiles, applications, notifications, ai_process_logs, Redis/TTL cache

### API-006 POST /auth/signup/company
- 도메인: 인증/계정
- 권한/인증: 비로그인 허용
- 관련 화면: 기업 회원가입 화면 (/signup/company)
- UI Type: form
- 상태 코드: 201 Created
- 비동기: N
- 요청 데이터:
  - 이메일, 인증 코드, 비밀번호, 비밀번호 확인, 이름, 회사명, 약관 동의
- 검증/전제조건:
  - 이메일 형식, 이메일 인증 완료, 비밀번호 정책, 비밀번호 확인 일치, 회사명 입력, 필수 약관 동의 충족
- 성공 응답/처리:
  - 기업 계정 생성 후 로그인 화면 또는 기업 포털 > 지원현황 > 공고 관리로 이동
- 오류/예외:
  - 중복 이메일, 이메일 인증 실패, 인증 코드 만료, 약관 미동의, 비밀번호 정책 미충족, 비밀번호 불일치, 회사명 누락 시 오류 메시지를 표시한다.
- 관련 ERD 테이블:
  - users, companies, postings, applications, consent_records, notifications, ai_process_logs
- 비고/미결:
  - 기업 전용 필드 확정 필요

### API-007 POST /auth/password/reset
- 도메인: 인증/계정
- 권한/인증: 비로그인 허용
- 관련 화면: 비밀번호 재설정 화면 (/password/reset)
- UI Type: form
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 이메일, 인증 코드, 새 비밀번호, 새 비밀번호 확인
- 검증/전제조건:
  - 가입된 이메일, 인증 코드 유효, 새 비밀번호 정책 충족, 새 비밀번호 확인 일치
- 성공 응답/처리:
  - 비밀번호 재설정 완료 후 로그인 화면으로 이동
- 오류/예외:
  - 인증 만료, 코드 불일치, 미가입 이메일, 비밀번호 정책 미충족, 비밀번호 불일치 시 오류 메시지를 표시한다.
- 관련 ERD 테이블:
  - users, notifications

### API-008 POST /auth/password/send-code
- 도메인: 인증/계정
- 권한/인증: 비로그인 허용
- 관련 화면: 비밀번호 재설정 화면 (/password/reset)
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 이메일
- 검증/전제조건:
  - 가입된 이메일이어야 함
- 성공 응답/처리:
  - 인증 코드 입력 영역 활성화
- 오류/예외:
  - 미가입 이메일, 발송 실패, 요청 횟수 초과 시 오류 메시지를 표시한다.
- 관련 ERD 테이블:
  - users, notifications, Redis/TTL cache

### API-009 POST /auth/password/verify-code
- 도메인: 인증/계정
- 권한/인증: 비로그인 허용
- 관련 화면: 비밀번호 재설정 화면 (/password/reset)
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 이메일, 인증 코드
- 검증/전제조건:
  - 인증 코드가 유효하고 만료되지 않아야 함
- 성공 응답/처리:
  - 새 비밀번호 입력 영역 활성화
- 오류/예외:
  - 코드 불일치, 인증 만료, 재시도 횟수 초과 시 오류 메시지를 표시한다.
- 관련 ERD 테이블:
  - users, notifications, Redis/TTL cache

### API-080 GET /auth/me
- 도메인: 인증/계정
- 권한/인증: 로그인 필요
- 관련 화면: 로그인 이후 공통 세션 확인
- UI Type: system process
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터
  - Authorization: Bearer accessToken
- 검증/전제조건:
  - accessToken이 유효하고 만료되지 않아야 함
- 성공 응답/처리:
  - `CurrentUser`와 기본 프로필 식별자(`companyId`, `candidateId`)를 반환
- 오류/예외:
  - 토큰 없음, 만료, 위조 시 `COMMON_UNAUTHORIZED`를 반환한다.
- 관련 ERD 테이블
  - users, companies, candidate_profiles

### API-081 POST /auth/refresh
- 도메인: 인증/계정
- 권한/인증: refreshToken HttpOnly cookie
- 관련 화면: 로그인 이후 공통 세션 갱신
- UI Type: system process
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터
  - Cookie: refreshToken
- 검증/전제조건:
  - refreshToken이 유효하고 만료되지 않아야 함
- 성공 응답/처리:
  - 새 accessToken을 응답 본문으로 반환하고 refreshToken cookie를 갱신
- 오류/예외:
  - refreshToken 없음, 만료, 위조 시 `COMMON_UNAUTHORIZED`를 반환한다.
- 관련 ERD 테이블
  - users, companies, candidate_profiles

### API-082 POST /auth/logout
- 도메인: 인증/계정
- 권한/인증: 로그인 권장
- 관련 화면: 로그인 이후 공통 로그아웃
- UI Type: button, system process
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터
  - Cookie: refreshToken
- 검증/전제조건:
  - 없음. cookie가 없어도 성공 처리한다.
- 성공 응답/처리:
  - refreshToken cookie를 제거하고 로그인 화면으로 이동
- 오류/예외:
  - cookie가 없어도 오류로 처리하지 않는다.
- 관련 ERD 테이블
  - users

## 기업 - 대시보드

### API-010 GET /company/dashboard
- 도메인: 기업 - 대시보드
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 공고 관리 화면 (/company/applications/dashboard)
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 회사 ID
- 검증/전제조건:
  - 관리자 권한 보유
- 성공 응답/처리:
  - 공고 목록과 공고별 운영 지표 표시
- 오류/예외:
  - 조회 데이터가 없으면 빈 상태와 공고 생성 CTA를 제공한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, evaluation_reports, report_scores, report_evidences, ai_process_logs
- 비고/미결:
  - 기존 SNB 삭제. 2-depth는 GNB hover dropdown으로 노출. 기존 관리자 대시보드 명칭을 공고 관리로 변경

## 기업 - 채용공고

### API-011 GET /company/recruitments
- 도메인: 기업 - 채용공고
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 공고 관리 화면 (/company/applications/dashboard)
채용 공고 관리 화면 (/company/recruitments)
- UI Type: list, page
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 회사 ID
  - 검색어, 상태, 정렬 기준
  - 공고 ID
- 검증/전제조건:
  - 관리자 권한 보유
  - 기업 관리자 권한 보유
- 성공 응답/처리:
  - 공고 목록 표시 및 공고 상세 이동 가능
  - 채용 공고 목록 표시
  - 공고 리스트 표시 및 공고 상세/수정/복사 가능
  - 별도 상태 필터가 없으면 `ARCHIVED` 공고는 기본 목록에서 제외한다.
- 오류/예외:
  - 공고가 없으면 공고 생성 안내를 표시한다.
  - 공고가 없으면 빈 상태와 공고 생성 CTA를 표시한다.
  - 공고 조회 실패 시 오류 안내를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, interview_sessions, evaluation_reports, report_scores, report_evidences, ai_process_logs, embeddings
- 비고/미결:
  - 검색필터(프로젝트, 기간, 상태, 조회) 삭제
  - 첨부 이미지 기준 리스트형 레이아웃으로 변경
  - grid/table이 아니라 첨부 이미지처럼 가로형 리스트 카드로 표시

### API-080 POST /company/recruitments
- 도메인: 기업 - 채용공고
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 채용 공고 관리 화면 (/company/recruitments)
- UI Type: form, button
- 상태 코드: 201 Created
- 비동기: N
- 요청 데이터:
  - title, jobRole, jobDescription, startsOn, endsOn, status
  - careerRequirement, educationRequirement, salaryInfo, workLocation, employmentType
  - `jobDescription`은 Tiptap 기반 rich text HTML 문자열을 저장할 수 있다.
  - careerRequirement, educationRequirement, salaryInfo, workLocation, employmentType은 선택 입력 항목이며 모두 optional이다.
- 검증/전제조건:
  - `CurrentUser.userType=COMPANY`이고 `CurrentUser.companyId`가 존재해야 한다.
  - 공고는 항상 `CurrentUser.companyId`의 회사에 생성한다.
  - title, jobRole은 필수다.
  - startsOn과 endsOn이 함께 있으면 startsOn은 endsOn보다 늦을 수 없다.
  - status는 MVP 생성 흐름에서 `DRAFT` 또는 `OPEN`만 허용한다.
- 성공 응답/처리:
  - 생성된 공고 상세 데이터를 `{ data, meta }` envelope로 반환한다.
  - 선택 입력 항목이 저장된 경우 응답에 careerRequirement, educationRequirement, salaryInfo, workLocation, employmentType을 포함한다.
  - `OPEN` 공고만 지원자용 공개 공고 조회 대상이 된다.
- 오류/예외:
  - 필수값 누락 또는 날짜 오류는 `COMMON_VALIDATION_FAILED`를 반환한다.
  - 기업 권한이 아니거나 자기 회사 컨텍스트가 없으면 `COMMON_FORBIDDEN`을 반환한다.
- 관련 ERD 테이블:
  - companies, postings
- 비고/미결:
  - 평가 기준/질문 연결은 C 영역이며 공고 생성 happy path에서는 연결하지 않는다.
  - JD 이미지 파일 업로드/S3/file_assets 저장은 `API-086 POST /company/recruitments/jd-images`에서 처리하고, 이 API에는 반환된 이미지 URL이 포함된 `jobDescription` HTML만 저장한다.

### API-086 POST /company/recruitments/jd-images
- 도메인: 기업 - 채용공고
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 공고 생성 화면 (/company/recruitments/new), 공고 설정 화면 (/company/recruitments/{recruitmentId}/settings)
- UI Type: file input, editor toolbar button
- 상태 코드: 201 Created
- 비동기: N
- Content-Type: `multipart/form-data`
- 요청 데이터:
  - `file`: JD 에디터 본문에 삽입할 로컬 이미지 파일
- 검증/전제조건:
  - `CurrentUser.userType=COMPANY`이고 `CurrentUser.companyId`가 존재해야 한다.
  - 허용 MIME type은 `image/png`, `image/jpeg`, `image/webp`다.
  - 파일 크기 제한은 기본 `5MB`이며 환경변수 `JD_IMAGE_MAX_UPLOAD_BYTES`로 조정할 수 있다.
  - 파일 원본은 DB나 JD HTML에 직접 저장하지 않고 S3-compatible object storage에 저장한다.
  - `file_assets`에는 `owner_user_id=CurrentUser.userId`, `storage_key`, `original_name`, `mime_type`, `size_bytes`, `status=ACTIVE` 메타데이터만 저장한다.
- 성공 응답/처리:
  - 업로드된 이미지 메타데이터와 공개 조회 URL을 `{ data, meta }` envelope로 반환한다.
  - 프론트는 `data.url`을 Tiptap Image 노드의 `src`로 삽입한다.
  - 공고 생성/수정 저장 시 `jobDescription` HTML에는 업로드 이미지 URL만 포함한다.
- 성공 응답 예시:
```json
{
  "data": {
    "fileId": 123,
    "url": "https://cdn.example.com/company/1/jd-images/uuid-image.webp",
    "storageKey": "company/1/jd-images/uuid-image.webp",
    "originalName": "culture.webp",
    "mimeType": "image/webp",
    "sizeBytes": 245760,
    "status": "ACTIVE",
    "createdAt": "2026-07-02T00:00:00.000Z"
  },
  "meta": {
    "traceId": "request-id",
    "timestamp": "2026-07-02T00:00:00.000Z"
  }
}
```
- 오류/예외:
  - 파일이 없거나 필수 multipart field가 없으면 `COMMON_VALIDATION_FAILED`를 반환한다.
  - 허용하지 않는 MIME type은 `FILE_INVALID_TYPE`을 반환한다.
  - 파일 크기 제한 초과는 `FILE_SIZE_EXCEEDED`를 반환한다.
  - 기업 권한이 아니거나 자기 회사 컨텍스트가 없으면 `COMMON_FORBIDDEN`을 반환한다.
  - S3 업로드 또는 메타데이터 저장 실패는 공통 오류 envelope로 반환하고 원본 파일을 DB에 저장하지 않는다.
- 관련 ERD 테이블:
  - users, companies, file_assets
- 비고/미결:
  - 이 API는 이미지 원본을 반환하지 않는다. 이미지 조회는 `data.url` 또는 배포 CDN/S3 공개 URL 정책을 따른다.

### API-013 GET /company/recruitments/{recruitmentId}
- 도메인: 기업 - 채용공고
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 공고 세부내용 화면 (/company/recruitments/{recruitmentId})
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- Path Params: recruitmentId
- 요청 데이터:
  - 공고 ID
- 검증/전제조건:
  - 공고 조회 권한 보유
- 성공 응답/처리:
  - 공고 세부내용 표시
- 오류/예외:
  - 공고가 삭제되었거나 권한이 없으면 접근 제한 메시지를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications
- 비고/미결:
  - 공고가 상위 개념이고 지원자 관리는 이 화면의 하위 흐름으로 구성

### API-083 PATCH /company/recruitments/{recruitmentId}
- 도메인: 기업 - 채용공고
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 공고 설정 화면 (/company/recruitments/{recruitmentId}/settings)
- UI Type: form, button
- 상태 코드: 200 OK
- 비동기: N
- Path Params: recruitmentId
- 요청 데이터:
  - title, jobRole, jobDescription, startsOn, endsOn, status
  - careerRequirement, educationRequirement, salaryInfo, workLocation, employmentType
  - `jobDescription`은 Tiptap 기반 rich text HTML 문자열을 저장할 수 있다.
  - careerRequirement, educationRequirement, salaryInfo, workLocation, employmentType은 선택 입력 항목이며 모두 optional이다.
- 검증/전제조건:
  - `CurrentUser.userType=COMPANY`이고 `CurrentUser.companyId`가 존재해야 한다.
  - 수정 대상 공고는 로그인 기업 소유여야 한다.
  - title, jobRole은 필수다.
  - startsOn과 endsOn이 함께 있으면 startsOn은 endsOn보다 늦을 수 없다.
  - status는 MVP 설정 흐름에서 `DRAFT` 또는 `OPEN`만 허용한다.
  - JD 이미지 파일 업로드는 `API-086`에서 처리하고, 이 API는 `jobDescription` rich text HTML 문자열만 저장한다.
- 성공 응답/처리:
  - 수정된 공고 상세 데이터를 `{ data, meta }` envelope로 반환한다.
  - 선택 입력 항목이 저장된 경우 응답에 careerRequirement, educationRequirement, salaryInfo, workLocation, employmentType을 포함한다.
  - 설정 저장 후 프론트는 공고 대시보드로 이동한다.
- 오류/예외:
  - 필수값 누락 또는 날짜 오류는 `COMMON_VALIDATION_FAILED`를 반환한다.
  - 기업 권한이 아니거나 자기 회사 컨텍스트가 없으면 `COMMON_FORBIDDEN`을 반환한다.
  - 자기 회사 공고가 아니거나 공고가 없으면 `COMMON_NOT_FOUND`를 반환한다.
- 관련 ERD 테이블:
  - companies, postings
- 비고/미결:
  - 일반 JD 파일 업로드/텍스트 추출은 별도 API 합의 전까지 제공하지 않는다.
  - 에디터 이미지 업로드는 `API-086`에서 반환한 URL 또는 사용자가 직접 입력한 이미지 URL 삽입을 허용한다.

### API-084 DELETE /company/recruitments/{recruitmentId}
- 도메인: 기업 - 채용공고
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 채용 공고 관리 화면 (/company/recruitments), 공고 세부내용 화면 (/company/recruitments/{recruitmentId})
- UI Type: button, modal
- 상태 코드: 200 OK
- 비동기: N
- Path Params: recruitmentId
- 요청 데이터:
  - 공고 ID
- 검증/전제조건:
  - `CurrentUser.userType=COMPANY`이고 `CurrentUser.companyId`가 존재해야 한다.
  - 삭제 대상 공고는 로그인 기업 소유여야 한다.
  - 상태 전이 기준에 맞춰 `DRAFT` 또는 `CLOSED` 공고만 `ARCHIVED`로 전환할 수 있다.
- 성공 응답/처리:
  - 물리 삭제하지 않고 공고 상태를 `ARCHIVED`로 전환한다.
  - `{ data, meta }` envelope로 `ARCHIVED` 상태의 공고 데이터를 반환한다.
  - 프론트는 삭제 성공 후 공고 목록으로 이동하거나 목록에서 해당 공고를 제거한다.
- 오류/예외:
  - 자기 회사 공고가 아니거나 공고가 없으면 `COMMON_NOT_FOUND`를 반환한다.
  - `DRAFT` 또는 `CLOSED`가 아닌 공고는 `COMMON_VALIDATION_FAILED`를 반환한다.
  - 삭제 실패 시 전역 레이아웃을 밀지 않는 확인 UI 내부 오류로 표시한다.
- 관련 ERD 테이블:
  - postings, applications
- 비고/미결:
  - 지원자/면접/리포트 연결 데이터 보호를 위해 FK row 물리 삭제는 하지 않는다.

### API-014 GET /company/recruitments/{recruitmentId}/applicants
- 도메인: 기업 - 채용공고
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 관리 화면 (/company/recruitments/{recruitmentId}/applicants)
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- Path Params: recruitmentId
- 요청 데이터:
  - 공고 ID
- 검증/전제조건:
  - 공고 조회 권한 보유
- 성공 응답/처리:
  - 공고별 지원자 관리 화면 표시
- 오류/예외:
  - 공고 정보가 없거나 권한이 없으면 접근 제한 메시지를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, evaluation_reports, report_scores, report_evidences, notifications
- 비고/미결:
  - 기존 구직자 관리 명칭을 지원자 관리로 변경. 평가 리포트 메뉴는 지원자 관리로 통합

### API-032 GET /company/recruitments?keyword={keyword}&status={status}
- 도메인: 기업 - 채용공고
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 채용 공고 관리 화면 (/company/recruitments)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Query Params: q, keyword, status, page, limit, sort, order
- 요청 데이터:
  - 검색어(`q` 또는 `keyword`), 상태(`DRAFT`, `OPEN`, `CLOSING_SOON`, `CLOSED`, `ARCHIVED`)
- 검증/전제조건:
  - 자기 회사 공고만 조회 가능
  - 유효한 검색 조건과 공고 상태
- 성공 응답/처리:
  - 검색 조건에 맞는 공고 목록 갱신
- 오류/예외:
  - 검색 결과가 없으면 빈 상태 안내를 표시한다.
- 관련 ERD 테이블:
  - companies, postings, embeddings
- 비고/미결:
  - 검색어 placeholder: 프로젝트명, 직무명 검색

### API-033 POST /company/recruitments/{recruitmentId}/copy
- 도메인: 기업 - 채용공고
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 채용 공고 관리 화면 (/company/recruitments)
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- Path Params: recruitmentId
- 요청 데이터:
  - 공고 ID
- 검증/전제조건:
  - 마감 상태의 공고
- 성공 응답/처리:
  - 지원자, 면접 세션, 리포트는 복사하지 않고 공고 내용만 `DRAFT` 복사본으로 생성한다.
  - 복사본의 채용 시작일/마감일은 비워둔다.
  - 복사된 공고 생성 화면 또는 목록으로 이동
- 오류/예외:
  - 자기 회사 공고가 아니거나 공고가 없으면 오류를 반환한다.
  - `CLOSED` 상태가 아니면 복사 실패 메시지를 표시한다.
- 관련 ERD 테이블:
  - companies, postings, ai_process_logs
- 비고/미결:
  - 마감 상태에서 수정 버튼 대신 노출

## 기업 - 지원자/리포트

### API-012 PATCH /company/applicants/{applicantId}/screening-status
- 도메인: 기업 - 지원자/리포트
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 공고 관리 화면 (/company/applications/dashboard)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicantId
- 요청 데이터:
  - 지원자 ID, 전형 상태(`UNDECIDED`, `PASS`, `HOLD`, `FAIL`), 메모
- 검증/전제조건:
  - 자기 회사 공고에 연결된 지원자만 수정 가능
  - B MVP에서는 `applications.screening_decision`, `applications.screening_memo`만 저장
- 성공 응답/처리:
  - 편집 모드에서 전형 상태 저장
- 오류/예외:
  - 허용되지 않은 전형 상태, 권한 없는 지원자, 존재하지 않는 지원자이면 오류를 반환한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, evaluation_reports, report_scores, report_evidences, manual_evaluations
- 비고/미결:
  - `manual_evaluations` 저장은 E/PM 계약 합의 후 별도 구현

## 공개 - 채용공고/지원

### API-086 GET /public/recruitments/{recruitmentId}
- 도메인: 공개 - 채용공고/지원
- 권한/인증: 비로그인 허용
- 관련 화면: 공개 지원 공고 화면 (/public/recruitments/{recruitmentId}/apply)
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- Path Params:
  - `recruitmentId`
- 요청 데이터:
  - 공고 ID
- 검증/전제조건:
  - 공고 상태가 `OPEN`이어야 한다.
  - `DRAFT`, `CLOSING_SOON`, `CLOSED`, `ARCHIVED` 공고는 공개 지원 링크로 조회할 수 없다.
  - 기업 내부 운영 정보, 지원자 수, 평가 상태, 내부 메모는 응답에 포함하지 않는다.
- 성공 응답/처리:
  - 공개 지원자가 확인할 수 있는 공고 상세 데이터를 `{ data, meta }` envelope로 반환한다.
  - 응답 필드:
    - `recruitmentId`
    - `postingId`
    - `companyName`
    - `title`
    - `jobRole`
    - `jobDescription`
    - `careerRequirement`
    - `educationRequirement`
    - `salaryInfo`
    - `workLocation`
    - `employmentType`
    - `startsOn`
    - `endsOn`
    - `status`
- 오류/예외:
  - 공고가 없거나 공개 상태가 아니면 `COMMON_NOT_FOUND`를 반환한다.
- 관련 ERD 테이블:
  - companies, postings
- 비고/미결:
  - `recruitmentId` 직접 노출 방식은 1차 구현이다.
  - `public_token` 또는 slug 기반 공개 링크는 필요성이 확정되면 별도 DB/API 계약으로 분리한다.

### API-087 POST /public/recruitments/{recruitmentId}/applications
- 도메인: 공개 - 채용공고/지원
- 권한/인증: 비로그인 허용
- 관련 화면: 공개 지원 폼 화면 (/public/recruitments/{recruitmentId}/apply)
- UI Type: form
- 상태 코드: 201 Created
- 비동기: N
- Path Params:
  - `recruitmentId`
- 요청 데이터:
  - `name`: string, required
  - `email`: string, required
  - `phone`: string, optional
  - `portfolioUrl`: string, optional
  - `resumeText`: string, optional
  - `consentAgreed`: boolean, required
- 검증/전제조건:
  - 공고 상태가 `OPEN`이어야 한다.
  - `name`, `email`, `consentAgreed`는 필수다.
  - `email`은 이메일 형식이어야 한다.
  - `consentAgreed`는 `true`여야 한다.
  - 같은 공고에 같은 이메일로 이미 지원한 경우 중복 지원을 막는다.
- 성공 응답/처리:
  - 비회원 지원자 최소 row를 생성하거나 기존 candidate profile을 재사용한다.
  - `users.user_type=CANDIDATE`, `users.status=PENDING` 기준으로 생성한다.
  - `candidate_profiles.portfolio_url`에는 `portfolioUrl`을 저장한다.
  - `candidate_profiles.summary`에는 공개 지원 폼의 `resumeText`를 저장한다.
  - `applications.application_status=SUBMITTED`, `screening_decision=UNDECIDED`로 생성한다.
  - 응답 필드:
    - `applicationId`
    - `recruitmentId`
    - `email`
    - `applicationStatus`
    - `emailVerificationStatus`: `PENDING`
    - `nextAction`: `CHECK_EMAIL`
    - `temporary`: false
    - `temporaryBoundary`: null
    - `magicLinkDeliveryStatus`: `SENT` 또는 `FAILED`
    - `magicLinkExpiresInSeconds`: number
- 오류/예외:
  - 공고가 없거나 공개 상태가 아니면 `COMMON_NOT_FOUND`를 반환한다.
  - 필수값 누락, 이메일 형식 오류, 동의 누락은 `COMMON_VALIDATION_FAILED`를 반환한다.
  - 같은 공고에 같은 이메일이 이미 있으면 `COMMON_CONFLICT`를 반환한다.
- 관련 ERD 테이블:
  - companies, postings, users, candidate_profiles, applications
- 비고/미결:
  - 매직링크 token 원문은 저장하지 않고 SHA-256 hash만 Redis에 저장한다.
  - Redis key namespace는 `auth:magic-link:application-status:{tokenHash}`를 사용한다.
  - 매직링크 TTL은 고정 TTL을 사용하며 MVP 기준 기본값은 7일이다.
  - 이메일 발송은 기존 Auth `MailService`/SMTP 경로를 재사용한다.
  - 파일 업로드/S3/file_assets/application_documents 저장은 이번 범위에서 제외한다.

### API-088 POST /public/recruitments/{recruitmentId}/applications/access-link
- 도메인: 공개 - 채용공고/지원
- 권한/인증: 비로그인 허용
- 관련 화면: 공개 지원 폼 화면 (/public/recruitments/{recruitmentId}/apply)
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- Path Params:
  - `recruitmentId`
- 요청 데이터:
  - `email`: string, required
- 검증/전제조건:
  - 해당 공고에 같은 이메일로 제출된 지원서가 있어야 한다.
  - 클라이언트가 `applicationId`만으로 지원현황을 조회할 수 없어야 한다.
- 성공 응답/처리:
  - `applicationId/email/recruitmentId` 기준으로 매직링크 토큰을 발급한다.
  - token 원문은 이메일 링크에만 포함하고, 서버 저장소에는 token hash만 저장한다.
  - 응답 필드:
    - `recruitmentId`
    - `email`
    - `emailVerificationStatus`: `PENDING`
    - `nextAction`: `CHECK_EMAIL`
    - `magicLinkDeliveryStatus`: `SENT` 또는 `FAILED`
    - `magicLinkExpiresInSeconds`: number
- 오류/예외:
  - 공고가 없거나 공개 상태가 아니면 `COMMON_NOT_FOUND`를 반환한다.
  - 이메일 형식 오류는 `COMMON_VALIDATION_FAILED`를 반환한다.
  - 해당 이메일의 지원서가 없으면 `COMMON_NOT_FOUND`를 반환한다.
- 관련 ERD 테이블:
  - postings, users, candidate_profiles, applications
- 비고/미결:
  - 만료된 링크는 같은 `recruitmentId/email`로 재발급한다.

### API-089 GET /public/applications/status
- 도메인: 공개 - 채용공고/지원
- 권한/인증: 매직링크 토큰 필요
- 관련 화면: 공개 지원 현황 화면 (/public/recruitments/{recruitmentId}/applications/status?token={token})
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- Query Params:
  - `token`: string, required
- 요청 데이터:
  - 이메일로 전달된 매직링크 token
- 검증/전제조건:
  - B 서버는 매 요청마다 `token -> applicationId`를 검증해야 한다.
  - 클라이언트가 `applicationId` 또는 `email`만으로 지원현황을 조회하는 API는 제공하지 않는다.
  - 만료되었거나 존재하지 않는 token은 인증 실패로 처리한다.
- 성공 응답/처리:
  - 검증된 `applicationId`의 공개 지원 현황만 반환한다.
  - 응답 필드:
    - `applicationId`
    - `recruitmentId`
    - `email`
    - `name`
    - `jobRole`
    - `applicationStatus`
    - `documentStatus`
    - `interviewStatus`
    - `reportStatus`
    - `interviewEntry`
      - `href`: public interview bridge path. 예: `/public/applications/{applicationId}/interview`
      - `label`: `면접 시작`, `면접 이어가기`, `면접 완료`
      - `enabled`: boolean
      - `integrationStatus`: `D_PUBLIC_CONTEXT_PENDING`
      - `temporary`: true
      - `temporaryBoundary`: `B_MODULE_PUBLIC_INTERVIEW_ADAPTER`
      - `message`: D public interview context 연동 대기 안내
    - `submittedAt`
    - `updatedAt`
- 오류/예외:
  - token 누락/만료/검증 실패는 공통 에러 형식으로 반환한다.
  - 검증된 token의 지원서가 없으면 `COMMON_NOT_FOUND`를 반환한다.
- 관련 ERD 테이블:
  - postings, users, candidate_profiles, applications
- 비고/미결:
  - 채용 AI 면접 시작/재진입은 D 면접 런타임 API와 별도 연동한다.
  - B는 `/public/applications/{applicationId}/interview?token={token}` 브릿지 화면에서 API-089를 다시 검증한 뒤 D `API-087 POST /public/applications/{applicationId}/interview/start`를 호출한다.
  - D는 B `API-089B`를 통해 magic token을 applicationId로 검증한 뒤 publicAccessToken을 발급한다.

### API-089B POST /public/applications/token/verify
- 도메인: 공개 - 채용공고/지원
- 권한/인증: B-D 서버 내부 호출 / 매직링크 토큰 필요
- 관련 화면: 직접 화면 없음. D public interview start API에서 호출
- UI Type: internal-api
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  ```json
  {
    "token": "magic-link-token"
  }
  ```
- Headers:
  - `x-public-application-verify-secret`: optional. `PUBLIC_APPLICATION_TOKEN_VERIFY_SECRET`가 설정된 환경에서는 필수
- 검증/전제조건:
  - token은 B magic-link 저장소에서 검증한다.
  - token payload의 applicationId, recruitmentId, email이 실제 application과 일치해야 한다.
  - 클라이언트가 직접 applicationId/email만으로 검증할 수 없다.
- 성공 응답/처리:
  ```json
  {
    "data": {
      "applicationId": 77
    },
    "meta": {
      "traceId": "trace-id",
      "timestamp": "2026-07-02T00:00:00.000Z"
    }
  }
  ```
- 오류/예외:
  - token 누락/만료/검증 실패는 `COMMON_UNAUTHORIZED`
  - token payload와 application 정보가 불일치하면 `COMMON_UNAUTHORIZED`
  - 검증된 application이 없으면 `COMMON_NOT_FOUND`
- 관련 ERD 테이블:
  - postings, users, candidate_profiles, applications
  - magic token 저장소: Redis namespace `auth:magic-link:application-status:{tokenHash}`

### API-018 GET /company/applicants
- 도메인: 기업 - 지원자/리포트
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 관리 화면 (/company/recruitments/{recruitmentId}/applicants)
- UI Type: list
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 공고, 상태 필터, 검색어
- 검증/전제조건:
  - 조회 권한 보유
- 성공 응답/처리:
  - 지원자 목록 표시
- 오류/예외:
  - 데이터가 없으면 빈 상태 안내를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, application_documents, interview_sessions, evaluation_reports, report_scores, report_evidences, ai_process_logs, embeddings
- 비고/미결:
  - 기존 구직자 진행 상태 목록을 지원자 목록으로 변경

### API-019 GET /company/reports
- 도메인: 기업 - 지원자/리포트
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 관리 화면 (/company/recruitments/{recruitmentId}/applicants)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 공고, 지원자 ID, 리포트 상태
- 검증/전제조건:
  - 조회 권한 보유
- 성공 응답/처리:
  - 리포트 요약 표시 및 평가 상세 이동 가능
- 오류/예외:
  - 리포트가 없으면 분석 대기 또는 미응시 상태를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, application_documents, interview_sessions, evaluation_reports, report_scores, report_evidences, ai_process_logs
- 비고/미결:
  - 기존 평가 리포트 SNB 메뉴를 지원자 관리 내부로 통합

### API-020 GET /company/applicants/{applicantId}/evaluation
- 도메인: 기업 - 지원자/리포트
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 평가 상세 화면 (/company/applicants/{applicantId}/evaluation)
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicantId
- 요청 데이터:
  - 지원자 ID, 공고 ID
- 검증/전제조건:
  - 지원자 조회 권한 보유
- 성공 응답/처리:
  - 지원자 기본 정보, 지원/면접/리포트 상태, 전형 상태/메모 표시
  - 리포트가 있으면 점수, 근거, 요약 표시
  - 리포트가 없으면 없음/생성중 상태로 표시
- 오류/예외:
  - 평가 데이터가 없으면 분석 대기 또는 미응시 상태를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, application_documents, interview_sessions, evaluation_reports, report_scores, report_evidences, manual_evaluations, ai_process_logs
- 비고/미결:
  - 기존 9번 서류 평가 상세과 10번 채용 리포트 상세을 9번으로 통합

### API-021 GET /company/applicants/{applicantId}/document-evaluation
- 도메인: 기업 - 지원자/리포트
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 평가 상세 화면 (/company/applicants/{applicantId}/evaluation)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicantId
- 요청 데이터:
  - 평가 결과, 근거 문장
- 검증/전제조건:
  - 서류 평가 완료 상태
- 성공 응답/처리:
  - 평가 근거 표시
- 오류/예외:
  - 근거가 불충분하면 낮은 신뢰도 표시와 함께 수동 검토를 요청한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, file_assets, postings, applications, application_documents, evaluation_reports, report_scores, report_evidences, manual_evaluations

### API-022 GET /company/reports/{reportId}
- 도메인: 기업 - 지원자/리포트
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 평가 상세 화면 (/company/applicants/{applicantId}/evaluation)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: reportId
- 요청 데이터:
  - 지원자 ID, 평가 기준
- 검증/전제조건:
  - 평가 완료 상태
- 성공 응답/처리:
  - 역량별 점수 표시
- 오류/예외:
  - 일부 평가 항목이 누락되면 미평가 사유를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, criterion_tags, evaluation_criteria, applications, interview_sessions, evaluation_reports, report_scores, report_evidences, ai_process_logs
- 비고/미결:
  - reportType=RECRUITING_REPORT

### API-023 GET /company/reports/{reportId}/evidence
- 도메인: 기업 - 지원자/리포트
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 평가 상세 화면 (/company/applicants/{applicantId}/evaluation)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: reportId
- 요청 데이터:
  - 평가 결과, 근거 데이터
- 검증/전제조건:
  - 근거 데이터 존재
- 성공 응답/처리:
  - 평가 근거 표시
- 오류/예외:
  - 근거가 부족하면 신뢰도 낮음 배지를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, application_documents, interview_answers, evaluation_reports, report_scores, report_evidences, ai_process_logs

### API-024 GET /company/reports/{reportId}/media
- 도메인: 기업 - 지원자/리포트
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 평가 상세 화면 (/company/applicants/{applicantId}/evaluation)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: reportId
- 요청 데이터:
  - 영상 파일, 스크립트
- 검증/전제조건:
  - 영상 저장 및 STT 처리 완료
- 성공 응답/처리:
  - 영상과 스크립트 동시 표시
- 오류/예외:
  - 영상 재생 실패 시 스크립트만 표시하고 재처리 요청을 제공한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, file_assets, postings, applications, interview_answers, evaluation_reports, report_scores, report_evidences, ai_process_logs
- 비고/미결:
  - 문제별 타임스탬프 기능 추가 여부 검토 필요

### API-025 GET /company/applicants/compare
- 도메인: 기업 - 지원자/리포트
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 평가 상세 화면 (/company/applicants/{applicantId}/evaluation)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 공고, 지원자 목록, 평가 항목
- 검증/전제조건:
  - 동일 기준으로 평가된 지원자 2명 이상
- 성공 응답/처리:
  - 지원자 비교 결과 표시
- 오류/예외:
  - 비교 대상이 부족하면 비교 기능을 비활성화한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, criterion_tags, evaluation_criteria, applications, evaluation_reports, report_scores, report_evidences

### API-026 PATCH /company/applicants/{applicantId}/manual-evaluation
- 도메인: 기업 - 지원자/리포트
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 평가 상세 화면 (/company/applicants/{applicantId}/evaluation)
- UI Type: form
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicantId
- 요청 데이터:
  - 수동 점수, 메모, 최종 상태
- 검증/전제조건:
  - 면접관 또는 관리자 권한 보유
- 성공 응답/처리:
  - 수동 평가 저장
- 오류/예외:
  - 권한 없음 또는 필수 메모 누락 시 저장을 제한한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, interview_sessions, evaluation_reports, report_scores, report_evidences, manual_evaluations, ai_process_logs

### API-027 GET /company/reports/{reportId}/download
- 도메인: 기업 - 지원자/리포트
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 평가 상세 화면 (/company/applicants/{applicantId}/evaluation)
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- Path Params: reportId
- 요청 데이터:
  - 지원자 ID, 파일 형식
- 검증/전제조건:
  - 리포트 생성 완료
- 성공 응답/처리:
  - PDF 또는 Excel 파일 다운로드
- 오류/예외:
  - 파일 생성 실패 시 재시도 버튼을 제공한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, file_assets, postings, applications, evaluation_reports, report_scores, report_evidences, ai_process_logs
- 비고/미결:
  - MVP 후순위

## 지원자 - Public 채용면접

### API-087 POST /public/applications/{applicationId}/interview/start
- 도메인: 지원자 - Public 채용면접
- 권한/인증: B magic token
- 관련 화면: B public bridge (/public/applications/{applicationId}/interview?token=...)
- UI Type: bridge action
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicationId
- 요청 데이터:
  - body.token 또는 body.magicToken
- 검증/전제조건:
  - D는 `PUBLIC_APPLICATION_TOKEN_VERIFY_URL`로 설정된 B `API-089B POST /public/applications/token/verify`를 호출해 token을 applicationId로 검증한다.
  - token 검증 결과의 applicationId와 path applicationId가 일치해야 한다.
  - application이 존재해야 한다.
  - D가 applicationId 기준 RECRUITING interview_session을 조회하고 없으면 생성한다.
- 성공 응답/처리:
  - sessionId, applicationId, interviewStatus, interviewSessionStatus, runtimePath, publicAccessToken 반환
  - runtimePath는 /public/applications/{applicationId}/interview/runtime?sessionId={sessionId}
- 오류/예외:
  - token 누락 시 400, token 검증 실패 시 401, applicationId 불일치 시 403
- 관련 ERD 테이블:
  - candidate_profiles, applications, interview_sessions
- 비고/미결:
  - B bridge는 publicAccessToken을 sessionStorage에 저장한 뒤 runtimePath로 이동한다.

### API-088 POST /public/applications/{applicationId}/interview/begin
- 도메인: 지원자 - Public 채용면접
- 권한/인증: Authorization Bearer publicAccessToken
- 관련 화면: D public runtime (/public/applications/{applicationId}/interview/runtime)
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicationId
- 요청 데이터:
  - publicAccessToken
- 검증/전제조건:
  - publicAccessToken의 applicationId가 path applicationId와 일치해야 한다.
  - 장치 점검 및 필수 동의 조건은 기존 채용면접 start 규칙을 따른다.
- 성공 응답/처리:
  - 채용면접을 IN_PROGRESS로 전환하고 public runtime interviewUrl을 반환한다.
- 관련 ERD 테이블:
  - candidate_profiles, applications, consent_records, interview_sessions

### API-089 GET /public/applications/{applicationId}/interview
- 도메인: 지원자 - Public 채용면접
- 권한/인증: Authorization Bearer publicAccessToken
- 관련 화면: D public runtime (/public/applications/{applicationId}/interview/runtime)
- UI Type: page data
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicationId
- 검증/전제조건:
  - publicAccessToken의 applicationId가 path applicationId와 일치해야 한다.
- 성공 응답/처리:
  - 기존 candidate runtime view를 반환하되 nextQuestionEndpoint와 answerUploadEndpoint는 public endpoint로 반환한다.
- 관련 ERD 테이블:
  - candidate_profiles, applications, interview_sessions, interview_answers

### API-090 POST /public/interviews/{sessionId}/device-check
- 도메인: 지원자 - Public 채용면접
- 권한/인증: Authorization Bearer publicAccessToken
- 관련 화면: D public runtime
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: sessionId
- 요청 데이터:
  - cameraGranted, microphoneGranted, networkStable
- 검증/전제조건:
  - publicAccessToken의 sessionId가 path sessionId와 일치해야 한다.
- 성공 응답/처리:
  - 장치 점검 결과를 저장하고 시작 가능 여부를 반환한다.
- 관련 ERD 테이블:
  - applications, interview_sessions

### API-091 GET /public/interviews/{sessionId}/questions
- 도메인: 지원자 - Public 채용면접
- 권한/인증: Authorization Bearer publicAccessToken
- 관련 화면: D public runtime
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: sessionId
- 검증/전제조건:
  - publicAccessToken의 sessionId가 path sessionId와 일치해야 한다.
- 성공 응답/처리:
  - 채용면접 질문 목록을 반환한다.
- 관련 ERD 테이블:
  - question_bank, applications, interview_sessions

### API-092 POST /public/interviews/{sessionId}/answers
- 도메인: 지원자 - Public 채용면접
- 권한/인증: Authorization Bearer publicAccessToken
- 관련 화면: D public runtime
- UI Type: section
- 상태 코드: 201 Created
- 비동기: N
- Path Params: sessionId
- 검증/전제조건:
  - publicAccessToken의 sessionId가 path sessionId와 일치해야 한다.
- 성공 응답/처리:
  - 기존 채용면접 답변 저장 흐름으로 interview_answers와 file_assets 메타데이터를 저장한다.
- 관련 ERD 테이블:
  - file_assets, applications, interview_sessions, interview_answers

### API-093 POST /public/interviews/{sessionId}/next-question
- 도메인: 지원자 - Public 채용면접
- 권한/인증: Authorization Bearer publicAccessToken
- 관련 화면: D public runtime
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- Path Params: sessionId
- 성공 응답/처리:
  - 다음 질문으로 이동한다.
- 관련 ERD 테이블:
  - question_bank, applications, interview_sessions, interview_answers

### API-094 POST /public/interviews/{sessionId}/stt
- 도메인: 지원자 - Public 채용면접
- 권한/인증: Authorization Bearer publicAccessToken
- 관련 화면: D public runtime
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- Path Params: sessionId
- 성공 응답/처리:
  - E worker STT 요청 payload를 생성한다.
- 관련 ERD 테이블:
  - file_assets, applications, interview_sessions, interview_answers, ai_process_logs

### API-095 POST /public/interviews/{sessionId}/follow-up-question
- 도메인: 지원자 - Public 채용면접
- 권한/인증: Authorization Bearer publicAccessToken
- 관련 화면: D public runtime
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- Path Params: sessionId
- 성공 응답/처리:
  - E worker 꼬리질문 생성 요청 payload를 생성한다.
- 관련 ERD 테이블:
  - postings, applications, application_documents, interview_sessions, interview_answers, follow_up_questions, ai_process_logs

### API-096 PATCH /public/interviews/{sessionId}/complete
- 도메인: 지원자 - Public 채용면접
- 권한/인증: Authorization Bearer publicAccessToken
- 관련 화면: D public runtime
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- Path Params: sessionId
- 성공 응답/처리:
  - 채용면접을 완료 처리하고 분석 대기 상태로 전환한다.
- 관련 ERD 테이블:
  - applications, interview_sessions, interview_answers, evaluation_reports, ai_process_logs

## 기업 - 면접관리

### API-017 POST /company/interview-sessions
- 도메인: 기업 - 면접관리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 관리 화면 (/company/recruitments/{recruitmentId}/applicants)
- UI Type: system process
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 지원자, 공고, 응시 기간, 질문 세트
- 검증/전제조건:
  - 지원자와 질문 세트가 존재
- 성공 응답/처리:
  - 면접 세션 생성 및 초대 링크 연결
- 오류/예외:
  - 기간 오류, 질문 없음, 세션 생성 실패 시 초대 발송을 제한한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, question_bank, applications, interview_sessions, notifications, ai_process_logs
- 비고/미결:
  - 독립 화면 아님. 초대 링크 발송 프로세스와 묶어서 처리

### API-034 GET /company/interviews/settings
- 도메인: 기업 - 면접관리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 면접 관리 화면 (/company/interviews/settings)
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- Query Params:
  - `postingId?: number`
- DTO:
  - Query DTO: `InterviewSettingsQueryDto`
  - Response DTO: `InterviewSettingsResponseDto`
- 요청 데이터:
  - `postingId`: 조회할 채용 공고 ID. 미전달 시 회사의 기본/최근 공고 선택 정책은 구현 시 확정한다.
- 검증/전제조건:
  - 기업 관리자 권한 보유
  - `postingId`가 있으면 해당 공고가 로그인 기업 소유여야 함
- 성공 응답/처리:
  - 면접 관리 화면 표시
  - Response envelope: `{ data, meta }`
  - `data.posting`
    - `postingId: number`
    - `title: string`
    - `status: PostingStatus`
  - `data.availableTags[]`
    - `tagId: number`
    - `jobRole: string`
    - `tagName: string`
    - `category: string`
    - `description: string | null`
    - `sortOrder: number`
  - `data.criteria[]`
    - `criterionId: number`
    - `tagId: number`
    - `tagName: string`
    - `category: string`
    - `description: string | null`
    - `weight: number`
    - `passScore: number | null`
    - `sortOrder: number`
  - `data.questions[]`
    - `questionId: number`
    - `criterionId: number | null`
    - `questionType: QuestionType`
    - `content: string`
    - `isActive: boolean`
  - `data.timePolicy`
    - `preparationTimeSec: number`
    - `answerTimeSec: number`
    - `retryAllowed: boolean`
- 오류/예외:
  - 권한 없음 또는 공고 정보 없음 시 접근 제한 메시지를 표시한다.
  - 인증 누락: `COMMON_UNAUTHORIZED`
  - 기업 권한 또는 공고 소유권 불일치: `COMMON_FORBIDDEN`
  - 공고 없음: `COMMON_NOT_FOUND`
- 관련 ERD 테이블:
  - companies, postings, criterion_tags, evaluation_criteria, question_bank, interview_time_policies, interview_sessions, ai_process_logs
- 비고/미결:
  - 기존 SNB 삭제. 2-depth는 GNB hover dropdown으로 노출
  - `timePolicy`는 공고별 1:1 설정으로 `interview_time_policies`에 저장한다.

### API-035 POST /company/interviews/evaluation-criteria/suggest
- 도메인: 기업 - 면접관리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 면접 관리 화면 (/company/interviews/settings)
- UI Type: section
- 상태 코드: 202 Accepted
- 비동기: Y
- DTO:
  - Request DTO: `CriteriaSuggestRequestDto`
  - Response DTO: `AiJobResponseDto`
- 요청 데이터:
  - `postingId: number`
  - `jobDescription: string`
  - `talentProfile: string`
  - `evaluationPolicy: string`
- 검증/전제조건:
  - 채용 공고가 생성되어 있어야 함
  - `postingId`, `jobDescription`, `talentProfile`, `evaluationPolicy`는 필수다.
- 성공 응답/처리:
  - 평가 역량 추천 AI job 생성
  - Response envelope: `{ data, meta }`
  - `data.processLogId: number`
  - `data.status: AiProcessStatus`
  - `data.queued?: boolean`
  - `data.inputRef?: string`
  - 완료 결과는 `GET /ai/jobs/{processLogId}/status`의 `data.output.criteriaSuggestions[]`로 조회한다.
    - `title: string`
    - `description: string`
    - `weight: number`
    - `order: number`
    - `suggestionReason: string`
    - `category?: string`
    - `tagId?: number`
  - C 화면은 추천 결과를 자동 저장하지 않고 미리보기로 표시한 뒤, 사용자가 선택한 항목만 기존 `PATCH /company/interviews/evaluation-criteria` 흐름에 반영한다.
  - C 화면 적용 규칙:
    - 추천 항목은 `tagId`, `tagName`, `category`, `title` 순서로 활성 `criterion_tags`와 매칭한다.
    - 이미 선택된 태그는 `적용됨`으로 표시하고 중복 추가하지 않는다.
    - 적용 시 배점 합계가 100을 넘으면 적용을 막고 기존 배점 조정을 안내한다.
    - 결과가 비어 있거나 guardrail이 차단한 경우 자동 저장하지 않고 재요청 안내를 표시한다.
  - 사용자 화면 상태 라벨은 `PENDING=대기 중`, `RUNNING=처리 중`, `COMPLETED=완료`, `FAILED=실패`를 사용한다.
- 오류/예외:
  - AI 생성 실패 시 기본 역량 템플릿을 제공하고 재시도 버튼을 표시한다.
  - 인증 누락: `COMMON_UNAUTHORIZED`
  - 기업 권한 또는 공고 소유권 불일치: `COMMON_FORBIDDEN`
  - 입력 검증 실패: `COMMON_VALIDATION_FAILED`
  - 공고 없음: `COMMON_NOT_FOUND`
- 관련 ERD 테이블:
  - companies, postings, criterion_tags, evaluation_criteria, interview_sessions, ai_process_logs, embeddings
- 비고/미결:
  - Route Owner: `backend/api/src/modules/ai/ai-jobs.controller.ts`의 `CompanyAiJobsController`
  - C 모듈의 `CompanyInterviewController`는 동일 method/path를 중복 등록하지 않는다.
  - 태그 추천 세부 정책 확정 필요
  - AI 추천 평가 기준 후보 저장 방식은 E 리뷰 필요
  - API-035 worker/SQS 메시지 구조는 E/A 리뷰 필요

### API-036 PATCH /company/interviews/evaluation-criteria
- 도메인: 기업 - 면접관리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 면접 관리 화면 (/company/interviews/settings)
- UI Type: form
- 상태 코드: 200 OK
- 비동기: N
- DTO:
  - Request DTO: `UpdateEvaluationCriterionDto`
  - Response DTO: `EvaluationCriterionResponseDto`
- 요청 데이터:
  - `postingId: number`
  - `criteria: EvaluationCriterionItemDto[]`
  - `criteria[].criterionId?: number`
  - `criteria[].tagId: number`
  - `criteria[].weight: number`
  - `criteria[].passScore?: number | null`
  - `criteria[].sortOrder: number`
- 검증/전제조건:
  - 총 배점 합계가 정책 범위 내여야 함
  - `postingId`는 로그인 기업 소유 공고여야 함
  - `tagId`는 필수이며 활성 `criterion_tags`에 존재해야 함
  - `criterionId`가 있으면 해당 공고의 `evaluation_criteria`에 존재해야 함
  - `sortOrder`는 요청 배열 안에서 중복될 수 없음
  - `passScore`는 nullable이며 값이 있으면 정책 점수 범위 안이어야 함
  - `weight` 합계 정책은 구현 전 PM/A와 확정한다.
- 성공 응답/처리:
  - 평가 기준 저장
  - 요청에서 제외된 기존 평가 기준은 삭제한다.
  - 삭제되는 평가 기준에 연결된 활성 질문은 `isActive=false`로 비활성화하고 질문 목록에서 제외한다.
  - Response envelope: `{ data, meta }`
  - `data.postingId: number`
  - `data.criteria[]`
    - `criterionId: number`
    - `tagId: number`
    - `tagName: string`
    - `category: string`
    - `description: string | null`
    - `weight: number`
    - `passScore: number | null`
    - `sortOrder: number`
  - `data.totalWeight: number`
- 오류/예외:
  - 배점 합계 오류 또는 필수 평가 항목 삭제 시 저장을 제한한다.
  - 인증 누락: `COMMON_UNAUTHORIZED`
  - 기업 권한 또는 공고 소유권 불일치: `COMMON_FORBIDDEN`
  - 입력 검증 실패: `COMMON_VALIDATION_FAILED`
  - 공고/평가 태그/평가 기준 없음: `COMMON_NOT_FOUND`
- 관련 ERD 테이블:
  - companies, postings, criterion_tags, evaluation_criteria, interview_sessions, evaluation_reports, report_scores, report_evidences, manual_evaluations, ai_process_logs
- 비고/미결:
  - 저장 버튼은 평가 기준 설정 영역 우측 상단 배치
  - `evaluation_criteria` 컬럼 추가/변경은 A/PM 리뷰 필요
  - 공통 DTO를 `backend/common/src/dto`에 추가해야 하면 A 리뷰 필요

### API-037 POST /company/interviews/questions
- 도메인: 기업 - 면접관리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 면접 관리 화면 (/company/interviews/settings)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 질문 내용, 질문 유형, 평가 역량
- 검증/전제조건:
  - 질문 내용과 평가 역량 필수
- 성공 응답/처리:
  - 질문 저장 및 공고 연결
- 오류/예외:
  - 중복 질문 또는 연결된 평가 항목이 없으면 경고를 표시한다.
- 관련 ERD 테이블:
  - companies, postings, criterion_tags, evaluation_criteria, question_bank, interview_sessions, follow_up_questions
- 비고/미결:
  - 질문 저장 버튼은 질문 뱅크 관리 영역 우측 상단 배치

#### Contract Baseline
- Request Body:
  - `postingId`: number, required
  - `criterionId`: number, required
  - `questionType`: `INTRO | TECHNICAL | EXPERIENCE | SITUATION | FOLLOW_UP | CLOSING`, required
  - `content`: string, required, 10~1000 chars
- Response Body:
  - `postingId`: number
  - `question`: `{ questionId, postingId, criterionId, questionType, content, isActive }`
- Validation:
  - `postingId`는 로그인한 기업의 공고여야 한다.
  - `criterionId`는 같은 `postingId`에 연결된 평가 기준이어야 한다.
  - 같은 공고 안에서 같은 `content`의 활성 질문은 중복 등록하지 않는다.
- Error Codes:
  - `COMMON_FORBIDDEN`, `COMMON_NOT_FOUND`, `COMMON_CONFLICT`, `COMMON_VALIDATION_FAILED`

### API-037-1 PATCH /company/interviews/questions/{questionId}
- 도메인: 기업 - 면접관리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 면접 관리 화면 (/company/interviews/settings)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N

#### Contract Baseline
- Path Params:
  - `questionId`: number, required
- Request Body:
  - `criterionId`: number, required
  - `questionType`: `INTRO | TECHNICAL | EXPERIENCE | SITUATION | FOLLOW_UP | CLOSING`, required
  - `content`: string, required, 10~1000 chars
- Response Body:
  - `postingId`: number
  - `question`: `{ questionId, postingId, criterionId, questionType, content, isActive }`
- Validation:
  - `questionId`는 로그인한 기업 소유 질문이어야 한다.
  - `criterionId`는 해당 질문과 같은 공고의 평가 기준이어야 한다.
  - 같은 공고 안에 같은 `content`의 활성 질문을 중복 저장할 수 없다.
- Error Codes:
  - `COMMON_FORBIDDEN`, `COMMON_NOT_FOUND`, `COMMON_CONFLICT`, `COMMON_VALIDATION_FAILED`

### API-037-2 DELETE /company/interviews/questions/{questionId}
- 도메인: 기업 - 면접관리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 면접 관리 화면 (/company/interviews/settings)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N

#### Contract Baseline
- Path Params:
  - `questionId`: number, required
- Response Body:
  - `postingId`: number
  - `question`: `{ questionId, postingId, criterionId, questionType, content, isActive }`
- Processing:
  - 질문은 물리 삭제하지 않고 `isActive=false`로 비활성화한다.
  - 면접 설정 조회의 질문 목록에는 활성 질문만 노출한다.
- Validation:
  - `questionId`는 로그인한 기업 소유 질문이어야 한다.
- Error Codes:
  - `COMMON_FORBIDDEN`, `COMMON_NOT_FOUND`, `COMMON_VALIDATION_FAILED`

### API-038 POST /company/interviews/questions/generate
- 도메인: 기업 - 면접관리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 면접 관리 화면 (/company/interviews/settings)
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- 요청 데이터:
  - JD, 직무명세서, 평가 역량
- 검증/전제조건:
  - 직무명세서 생성 완료
- 성공 응답/처리:
  - JD 기반 질문 생성 AI job 생성
- 오류/예외:
  - 질문 품질 검증 실패 시 재생성 또는 수동 검토를 요청한다.
- 관련 ERD 테이블:
  - companies, postings, criterion_tags, evaluation_criteria, question_bank, applications, interview_sessions, manual_evaluations, ai_process_logs
- 비고/미결:
  - 생성 결과는 질문 뱅크 관리 영역에 표시

#### Contract Baseline
- Route Owner:
  - 현재 이 route는 `backend/api/src/modules/ai/ai-jobs.controller.ts`의 `CompanyAiJobsController`가 등록한다.
  - C 모듈의 `CompanyInterviewController`는 동일 method/path를 중복 등록하지 않는다.
  - request body를 C DTO 기준으로 전환하거나 AI job controller에서 C controller로 소유권을 옮기려면 E/A/C 리뷰 후 별도 계약 변경이 필요하다.
- Request Body:
  - `postingId`: number, required
  - `jobDescription`: string, required
  - `questionCount`: number, required, 1~
- Response Body:
  - `processLogId`: number
  - `status`: `PENDING`
  - `queued?: boolean`
  - `inputRef?: string`
- Completed Output:
  - `questionCandidates[]`
    - `content: string`
    - `category: string`
    - `difficulty: "EASY" | "MEDIUM" | "HARD" | string`
    - `criterionId?: number`
    - `criterionTitle?: string`
    - `expectedKeywords: string[]`
    - `suggestionReason: string`
    - `questionType?: QuestionType`
  - C 화면은 질문 후보를 자동 저장하지 않고 미리보기로 표시한 뒤, 사용자가 선택한 질문만 기존 `POST /company/interviews/questions` 흐름에 반영한다.
  - 평가 기준 매칭 실패 시 사용자 화면에는 `연결할 평가 기준 선택 필요`를 표시한다.
  - C 화면 적용 규칙:
    - `criterionId`가 있으면 같은 공고의 평가 기준과 먼저 매칭한다.
    - `criterionTitle`이 있으면 평가 기준 이름 또는 카테고리와 매칭한다.
    - 같은 공고의 활성 질문과 내용이 같으면 `저장됨`으로 표시하고 중복 저장하지 않는다.
    - 저장 가능한 후보가 없으면 `저장 가능한 질문 후보가 없습니다` 계열의 안내를 표시한다.
- Processing:
  - API 서버는 장기 AI 생성을 직접 수행하지 않고 `ai_process_logs` 추적 ID만 반환한다.
  - worker/SQS 페이로드와 AI 품질 검증은 E/A 리뷰 후 확정한다.
- Error Codes:
  - `COMMON_FORBIDDEN`, `COMMON_NOT_FOUND`, `COMMON_VALIDATION_FAILED`, `AI_PROCESS_FAILED`

### API-039 POST /company/interviews/question-sets
- 도메인: 기업 - 면접관리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 면접 관리 화면 (/company/interviews/settings)
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- 요청 데이터:
  - 질문 유형, 질문 수, 평가 역량
- 검증/전제조건:
  - 평가 기준과 질문 뱅크 존재
- 성공 응답/처리:
  - 면접 질문 세트 구성 AI job 생성
- 오류/예외:
  - 질문 수 부족 시 AI 생성 또는 수동 추가를 안내한다.
- 관련 ERD 테이블:
  - companies, postings, criterion_tags, evaluation_criteria, question_bank, application_documents, interview_sessions, manual_evaluations, ai_process_logs
- 비고/미결:
  - 질문 뱅크 관리 화면에서 요청 상태와 구성 미리보기를 확인

#### Contract Baseline
- Route Owner:
  - 현재 이 route는 `backend/api/src/modules/ai/ai-jobs.controller.ts`의 `CompanyAiJobsController`가 등록한다.
  - C 모듈의 `CompanyInterviewController`는 동일 method/path를 중복 등록하지 않는다.
  - API-039를 비동기 AI job 생성으로 유지할지, C의 단순 질문 선택/세트 구성 API로 분리할지는 E/A/C/D 리뷰 후 확정한다.
- Request Body:
  - `postingId`: number, required
  - `questionCount`: number, required, 1~20
  - `criteria`: `{ criterionId: number, name: string, weight?: number }[]`, required
  - `questionTypes`: string[], required
- Response Body:
  - `processLogId`: number
  - `status`: `PENDING`
  - `queued?: boolean`
  - `inputRef?: string`
- Completed Output:
  - `questionSetPreview[]`
    - `criterionId?: number`
    - `criterionTitle: string`
    - `questions: questionCandidates[]`
  - 화면은 질문 세트를 최종 저장하지 않고 평가 기준별 질문 묶음 미리보기로 표시한다.
  - C 화면 적용 규칙:
    - 사용자는 질문 후보별 포함/제외를 선택할 수 있다.
    - 질문 뱅크의 활성 질문과 매칭되는 후보만 확정 대상에 포함한다.
    - 포함 선택된 확정 대상이 없으면 `POST /company/interviews/question-sets/confirm`을 호출하지 않는다.
    - 확정 시 선택된 항목만 `items[]`로 전달한다.
- Validation:
  - 평가 기준과 활성 질문 뱅크가 존재해야 한다.
  - `criteria`, `questionTypes`는 비어 있을 수 없다.
  - API 서버는 질문 세트를 직접 저장하지 않고 AI job 생성 상태를 반환한다.
- Error Codes:
  - `COMMON_FORBIDDEN`, `COMMON_NOT_FOUND`, `COMMON_VALIDATION_FAILED`

### API-039A POST /company/interviews/question-sets/confirm
- 도메인: 기업 - 면접관리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 면접 관리 화면 (/company/interviews/settings)
- UI Type: system process
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - `postingId`: number, required
  - `title`: string, required
  - `sourceProcessLogId`: number, optional
  - `items`: `{ questionId: number, criterionId?: number | null, sortOrder: number }[]`, required
- 검증/전제조건:
  - 공고는 현재 기업 소유여야 한다.
  - 모든 질문은 현재 기업 소유이며 활성 상태여야 한다.
  - 모든 질문은 같은 공고에 연결되어야 한다.
  - `questionId`와 `sortOrder`는 질문 세트 안에서 중복될 수 없다.
  - `criterionId`가 있으면 같은 공고의 평가 기준이어야 한다.
- 성공 응답/처리:
  - 같은 공고의 기존 `ACTIVE` 질문 세트는 `DRAFT`로 변경한다.
  - 새 질문 세트를 `ACTIVE` 상태로 저장한다.
- 응답 데이터:
  - `questionSetId`: number
  - `postingId`: number
  - `title`: string
  - `status`: `ACTIVE`
  - `createdByProcessLogId`: number | null
  - `items`: `{ questionSetItemId, questionId, criterionId, sortOrder }[]`
- Runtime Contract:
  - D 담당 채용 면접 런타임은 세션 생성 시 공고의 `ACTIVE` 질문 세트가 있으면 해당 `items.sortOrder` 순서로 질문을 소비한다.
  - `ACTIVE` 질문 세트가 없으면 기존 공고별 활성 질문 뱅크를 사용한다.
  - 세션 생성 이후 질문 세트 변경은 이미 생성된 세션에 소급 적용하지 않는다.
- Error Codes:
  - `COMMON_FORBIDDEN`, `COMMON_NOT_FOUND`, `COMMON_VALIDATION_FAILED`, `COMMON_CONFLICT`

### API-039B GET /company/interviews/question-sets/active
- 도메인: 기업 - 면접관리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 면접 관리 화면 (/company/interviews/settings)
- UI Type: system process
- 상태 코드: 200 OK
- 비동기: N
- Query:
  - `postingId`: number, optional. 미전달 시 현재 기업의 기본/최근 공고를 사용한다.
- 검증/전제조건:
  - 공고는 현재 기업 소유여야 한다.
- 성공 응답/처리:
  - 공고의 현재 `ACTIVE` 질문 세트를 반환한다.
  - `ACTIVE` 질문 세트가 없으면 `questionSet: null`과 fallback 정책을 반환한다.
  - 응답 데이터:
    - `postingId`: number
    - `questionSet`: `QuestionSetResponse | null`
    - `fallbackPolicy`: `USE_ACTIVE_POSTING_QUESTIONS`
    - `questionSet.items[]`:
      - `questionSetItemId`: number
      - `questionId`: number
      - `criterionId`: number | null
      - `sortOrder`: number
      - `questionType`: string, optional. D 런타임/QA가 확정 질문 타입을 확인하기 위한 스냅샷
      - `content`: string, optional. D 런타임/QA가 확정 질문 본문을 확인하기 위한 스냅샷
      - `isActive`: boolean, optional. 비활성 질문이 확정 세트에 남아 있는지 확인하기 위한 스냅샷
  - Runtime Contract:
    - 이 조회 결과는 C 화면/테스트에서 현재 D 런타임 소비 기준을 확인하기 위한 계약이다.
    - D 런타임의 실제 소비 우선순위는 `ACTIVE 질문 세트 -> 공고별 활성 질문 뱅크 -> 기본 채용 질문` 순서다.
    - D가 API가 아닌 repository에서 직접 조회하더라도 동일한 기준으로 `interview_question_set_items.sort_order`를 질문 순서로 사용한다.
    - `questionSet.items[].content`는 기업 화면/QA용 확인 스냅샷이며, 지원자 런타임 응답에서는 기존 `showQuestionText` 정책에 따라 질문 본문 노출 여부를 결정한다.
- Error Codes:
  - `COMMON_FORBIDDEN`, `COMMON_NOT_FOUND`

### API-040 PATCH /company/interviews/time-policy
- 도메인: 기업 - 면접관리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 면접 관리 화면 (/company/interviews/settings)
- UI Type: form
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 준비 시간, 답변 시간, 재응시 허용 여부
- 검증/전제조건:
  - 시간 값이 정책 범위 내여야 함
- 성공 응답/처리:
  - 면접 설정 저장
- 오류/예외:
  - 시간 값 오류 시 기본값으로 복구하거나 저장을 제한한다.
- 관련 ERD 테이블:
  - companies, postings, interview_time_policies, question_bank, interview_sessions, interview_answers
- 비고/미결:
  - 설정 저장 버튼은 면접 시간 설정 영역 우측 상단 배치

#### Contract Baseline
- Request Body:
  - `postingId`: number, required
  - `preparationTimeSec`: number, required, 0~600
  - `answerTimeSec`: number, required, 30~1800
  - `retryAllowed`: boolean, required
- Response Body:
  - `postingId`: number
  - `timePolicy`: `{ preparationTimeSec, answerTimeSec, retryAllowed }`
- Runtime Contract:
  - D 담당 면접 런타임은 이 정책을 세션 시작 전 읽어 준비/답변 제한 시간 기본값으로 사용한다.
  - 이미 `IN_PROGRESS` 또는 `COMPLETED` 상태인 세션에는 소급 적용하지 않는다.
- Error Codes:
  - `COMMON_FORBIDDEN`, `COMMON_NOT_FOUND`, `COMMON_VALIDATION_FAILED`

## AI/리포트 처리

### API-028 POST /reports/{reportId}/evaluation-context
- 도메인: AI/리포트 처리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 평가 상세 화면 (/company/applicants/{applicantId}/evaluation)
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- Path Params: reportId
- 요청 데이터:
  - JD, 평가 기준, 서류 요약, 답변 스크립트
- 검증/전제조건:
  - 모든 필수 데이터가 존재
- 성공 응답/처리:
  - 평가 컨텍스트 저장
- 오류/예외:
  - 필수 데이터 누락 시 해당 평가 항목을 보류 상태로 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, criterion_tags, evaluation_criteria, applications, application_documents, interview_answers, evaluation_reports, report_scores, report_evidences, manual_evaluations, ai_process_logs
- 비고/미결:
  - 독립 화면 아님. 채용 리포트 생성 파이프라인 내부 처리

### API-029 POST /reports/{reportId}/answer-evaluation
- 도메인: AI/리포트 처리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 평가 상세 화면 (/company/applicants/{applicantId}/evaluation)
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- Path Params: reportId
- 요청 데이터:
  - 답변 스크립트, 평가 기준, 모범 답안
- 검증/전제조건:
  - 답변 스크립트 존재
- 성공 응답/처리:
  - 답변 평가 결과 저장
- 오류/예외:
  - 근거 부족 또는 답변 불성실 판단 시 낮은 신뢰도와 수동 검토 상태를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, criterion_tags, evaluation_criteria, applications, interview_sessions, interview_answers, evaluation_reports, report_scores, report_evidences, manual_evaluations, ai_process_logs
- 비고/미결:
  - 결과는 지원자 평가 상세에 노출

### API-030 POST /reports/{reportId}/communication-analysis
- 도메인: AI/리포트 처리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 평가 상세 화면 (/company/applicants/{applicantId}/evaluation)
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- Path Params: reportId
- 요청 데이터:
  - 영상 파일, 음성 파일, 얼굴/시선/음성 피처
- 검증/전제조건:
  - 분석 동의 및 영상 품질 충족
- 성공 응답/처리:
  - 커뮤니케이션 지표 저장
- 오류/예외:
  - 얼굴 미검출, 음성 품질 저하 시 해당 지표를 제외하고 사유를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, file_assets, postings, applications, consent_records, evaluation_reports, report_scores, report_evidences, ai_process_logs
- 비고/미결:
  - 보조 지표로만 사용. 평가 결정 근거 과대해석 주의

### API-031 POST /reports/{reportId}/generate
- 도메인: AI/리포트 처리
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 지원자 평가 상세 화면 (/company/applicants/{applicantId}/evaluation)
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- Path Params: reportId
- 요청 데이터:
  - 서류 평가 결과, 면접 평가 결과, 평가 기준
- 검증/전제조건:
  - 평가 완료 상태
- 성공 응답/처리:
  - 평가 리포트 저장
- 오류/예외:
  - 리포트 생성 실패 시 재생성 버튼과 오류 상태를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, criterion_tags, evaluation_criteria, applications, application_documents, interview_sessions, interview_answers, evaluation_reports, report_scores, report_evidences, ai_process_logs
- 비고/미결:
  - 리포트 목록에는 분석중/완료/실패 상태 표시

### API-079 POST /ai/guardrails/validate
- 도메인: AI/리포트 처리
- 권한/인증: 시스템 / 자동 처리
- 관련 화면: 공통 AI 시스템 처리 (-)
- UI Type: system process
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 평가 프롬프트, 금지 규칙, 출력 결과
- 검증/전제조건:
  - 안전 정책 활성화
- 성공 응답/처리:
  - 정책 준수 결과만 저장
- 오류/예외:
  - 정책 위반 결과는 저장하지 않고 재생성 또는 수동 검토 상태로 전환한다.
- 관련 ERD 테이블:
  - evaluation_reports, report_scores, report_evidences, manual_evaluations, ai_process_logs, ai_guardrail_logs
- 비고/미결:
  - 독립 화면 아님. 모든 AI 평가/생성 단계의 공통 정책 레이어

## 기업 - 설정

### API-087 GET /company/profile
- 도메인: 기업 - 설정
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 회사 정보 관리 화면 (/company/mypage)
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 없음
- 검증/전제조건:
  - `CurrentUser.userType=COMPANY`
  - `CurrentUser.companyId`가 존재해야 한다.
- 성공 응답/처리:
  - 현재 기업 사용자의 회사 정보를 반환한다.
  - 응답 필드: companyId, ownerUserId, name, businessRegistrationNumber, verificationStatus, logoFileId, logoUrl, industry, profile, talentProfile, evaluationPolicy, createdAt, updatedAt
- 오류/예외:
  - 기업 권한이 아니거나 회사 컨텍스트가 없으면 `COMMON_FORBIDDEN`을 반환한다.
  - 회사 정보가 없으면 `COMMON_NOT_FOUND`를 반환한다.
- 관련 ERD 테이블:
  - companies, file_assets
- 비고/미결:
  - 회사 로고 URL은 `file_assets.storage_key`와 S3/CDN 공개 base URL 정책으로 구성한다.

### API-041 PATCH /company/profile
- 도메인: 기업 - 설정
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 회사 정보 관리 화면 (/company/mypage)
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 기업명, 산업군, 회사 소개, 인재상, 평가 정책
- 검증/전제조건:
  - `CurrentUser.userType=COMPANY`
  - `CurrentUser.companyId`가 존재해야 한다.
  - 기업명은 공백 제거 후 비어 있을 수 없다.
- 성공 응답/처리:
  - 회사 정보를 저장하고 API-087과 동일한 회사 정보 응답을 반환한다.
- 오류/예외:
  - 필수값 누락 또는 권한 없음 시 저장을 제한한다.
- 관련 ERD 테이블:
  - companies, file_assets
- 비고/미결:
  - 기존 기업 마이페이지 명칭을 회사 정보 관리로 변경

### API-042 POST /company/profile/logo
- 도메인: 기업 - 설정
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 회사 정보 관리 화면 (/company/mypage)
- UI Type: button
- 상태 코드: 201 Created
- 비동기: N
- 요청 데이터:
  - 회사 로고 이미지 파일
- 검증/전제조건:
  - `CurrentUser.userType=COMPANY`
  - `CurrentUser.companyId`가 존재해야 한다.
  - 허용 MIME: `image/png`, `image/jpeg`, `image/webp`
  - 최대 크기: 2MB
- 성공 응답/처리:
  - 원본 파일은 S3-compatible object storage에 저장한다.
  - `file_assets`에 메타데이터를 저장한다.
  - `companies.logo_file_id`를 새 파일 ID로 갱신한다.
  - API-087과 동일한 회사 정보 응답을 반환한다.
- 오류/예외:
  - 파일 형식 불일치, 용량 초과, 업로드 실패 시 오류 메시지를 표시한다.
- 관련 ERD 테이블:
  - companies, file_assets
- 비고/미결:
  - 회사 로고 사진 별도 등록 기능 추가

### API-043 PATCH /company/notifications/settings
- 도메인: 기업 - 설정
- 권한/인증: 기업 / 기업 사용자 로그인
- 관련 화면: 회사 정보 관리 화면 (/company/mypage)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 알림 수신 여부, 공고
- 검증/전제조건:
  - 알림 수신 설정 활성화
- 성공 응답/처리:
  - 알림 설정 저장
- 오류/예외:
  - 수신 거부 또는 발송 실패 시 알림 로그에 실패 상태를 남긴다.
- 관련 ERD 테이블:
  - companies, postings, interview_sessions, evaluation_reports, report_scores, report_evidences, notifications, ai_process_logs
- 비고/미결:
  - MVP 후순위. 담당자 선택 필터 삭제

## 지원자 - 모의면접

### API-044 POST /candidate/mock-interviews
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: AI 모의면접 시작 화면 (/candidate/mock-interview/start)
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 직무 선택, 난이도, 질문 유형
- 검증/전제조건:
  - 로그인 사용자
- 성공 응답/처리:
  - 모의면접 세션 생성
- 오류/예외:
  - 질문 생성 실패 시 기본 질문 세트를 제공한다.
- 관련 ERD 테이블:
  - candidate_profiles, question_bank, applications, interview_sessions, evaluation_reports, report_scores, report_evidences, ai_process_logs
- 비고/미결:
  - 기존 SNB 삭제. 2-depth는 GNB hover dropdown으로 노출. 연습 이력은 평가 리포트 항목으로 이동

### API-045 POST /candidate/mock-interviews/questions/generate
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: AI 모의면접 시작 화면 (/candidate/mock-interview/start)
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- 요청 데이터:
  - 직무, 난이도, 질문 유형
- 검증/전제조건:
  - 선택값이 존재해야 함
- 성공 응답/처리:
  - 모의면접 질문 목록 생성
- 오류/예외:
  - 질문 생성 실패 시 기본 질문 세트를 제공한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, criterion_tags, evaluation_criteria, question_bank, applications, interview_sessions, ai_process_logs
- 비고/미결:
  - 채용 질문과 달리 JD/기업 평가 기준을 사용하지 않음

### API-046 GET /candidate/mock-interviews/{sessionId}
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: AI 모의면접 진행 화면 (/candidate/mock-interviews/{sessionId})
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- Path Params: sessionId
- 요청 데이터:
  - 면접 세션 ID, 카메라 권한, 마이크 권한, 면접 질문 표시 여부
- 검증/전제조건:
  - 모의면접 세션 생성 완료, 장치 권한 허용
- 성공 응답/처리:
  - 답변 녹화 및 다음 질문 진행
- 오류/예외:
  - 권한 거부, 녹화 실패, 네트워크 오류 시 재시도 안내를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, question_bank, applications, interview_sessions, interview_answers, ai_process_logs
- 비고/미결:
  - interviewType=MOCK. 질문 표시 토글은 CC 자막이 아니라 면접 질문 텍스트 표시 여부를 의미함

### API-047 GET /candidate/mock-interviews/{sessionId}/questions
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: AI 모의면접 진행 화면 (/candidate/mock-interviews/{sessionId})
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: sessionId
- 요청 데이터:
  - 질문 텍스트, 음성 안내 설정, 면접 질문 표시 여부
- 검증/전제조건:
  - 질문 목록 존재
- 성공 응답/처리:
  - 질문 음성 재생 및 설정에 따른 질문 텍스트 표시
- 오류/예외:
  - 질문 로딩 실패 시 안내 메시지를 표시하고 재시도를 제공한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, question_bank, applications, interview_sessions, ai_process_logs
- 비고/미결:
  - 질문 음성 다시 듣기 버튼 삭제. 면접 질문 표시 기본값 OFF. CC 자막 기능 아님

### API-048 POST /candidate/mock-interviews/{sessionId}/answers
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: AI 모의면접 진행 화면 (/candidate/mock-interviews/{sessionId})
- UI Type: section
- 상태 코드: 201 Created
- 비동기: N
- Path Params: sessionId
- 요청 데이터:
  - 카메라 스트림, 마이크 스트림, 답변 시간
- 검증/전제조건:
  - 장치 권한 허용, 저장 공간 확보
- 성공 응답/처리:
  - 답변 파일 업로드 완료
- 오류/예외:
  - 녹화 실패 시 재녹화 안내를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, applications, interview_sessions, interview_answers, ai_process_logs
- 비고/미결:
  - 기존 답변 완료 버튼명을 면접 종료로 변경하고 우측 하단 배치

### API-049 POST /candidate/mock-interviews/{sessionId}/next-question
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: AI 모의면접 진행 화면 (/candidate/mock-interviews/{sessionId})
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- Path Params: sessionId
- 요청 데이터:
  - 버튼 클릭, 단축키 입력
- 검증/전제조건:
  - 면접 종료 상태
- 성공 응답/처리:
  - 다음 질문 표시
- 오류/예외:
  - 단축키 충돌 또는 이동 실패 시 오류 안내를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, question_bank, applications, interview_sessions, ai_process_logs
- 비고/미결:
  - 다음 질문으로 이동 단축키 지원

### API-050 POST /candidate/mock-interviews/{sessionId}/stt
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: AI 모의면접 진행 화면 (/candidate/mock-interviews/{sessionId})
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- Path Params: sessionId
- 요청 데이터:
  - 음성 파일, 언어 설정
- 검증/전제조건:
  - 음성 품질이 분석 가능해야 함
- 성공 응답/처리:
  - 답변 스크립트 저장
- 오류/예외:
  - 음성 인식 실패 시 영상 원본 검토 상태로 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, applications, interview_sessions, interview_answers, evaluation_reports, report_scores, report_evidences, ai_process_logs
- 비고/미결:
  - 독립 화면 아님. 리포트 상세에서 결과 확인

### API-051 POST /candidate/mock-interviews/{sessionId}/follow-up-question
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: AI 모의면접 진행 화면 (/candidate/mock-interviews/{sessionId})
- UI Type: section
- 상태 코드: 202 Accepted
- 비동기: Y
- Path Params: sessionId
- 요청 데이터:
  - 이전 질문, 답변 스크립트, 직무 선택 정보
- 검증/전제조건:
  - 답변 텍스트가 충분해야 함
- 성공 응답/처리:
  - 꼬리질문 표시
- 오류/예외:
  - 답변이 너무 짧거나 부적절하면 기본 꼬리질문을 제시한다.
- 관련 ERD 테이블:
  - candidate_profiles, postings, question_bank, applications, interview_sessions, interview_answers, follow_up_questions, ai_process_logs
- 비고/미결:
  - 채용 평가용 꼬리질문과 분리

### API-051-TMP POST /candidate/mock-interviews/{sessionId}/follow-up-questions/insert
- 프레임: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: AI 모의면접 진행 화면 (/candidate/mock-interviews/{sessionId})
- UI Type: MVP bridge
- 상태 코드: 200 OK
- 비동기: N
- 임시 여부:
  - MVP 임시 브릿지 API다. 완료된 FOLLOW_UP AI 작업 결과를 실제 면접 질문 흐름에 끼워 넣기 위해 사용한다.
  - 정식 follow_up_questions 스키마/자동 상태 전이가 확정되면 제거하거나 정식 API로 재정의한다.
- Path Params: sessionId
- 요청 데이터:
  - processLogId
- 검증 전제조건:
  - processLogId가 COMPLETED 상태의 FOLLOW_UP 작업이어야 한다.
  - 작업의 sessionId와 요청 sessionId가 일치해야 한다.
  - 생성 근거가 된 답변의 질문이 현재 질문이거나, 방금 답변한 직전 질문이어야 한다.
- 성공 응답/처리:
  - 생성된 꼬리질문을 FOLLOW_UP 질문으로 세션 질문 목록에 추가한다.
  - question, inserted, totalQuestions, nextQuestionAvailable을 반환한다.
- 오류/예외:
  - 완료된 FOLLOW_UP 작업이 아니거나 다른 세션의 작업이면 오류를 반환한다.
- 관련 ERD 테이블:
  - question_bank, interview_sessions, interview_answers, ai_process_logs
- 비고/미결:
  - 임시 브릿지 API이므로 정식 API 번호 승격 여부는 D/E/PM 리뷰 후 결정한다.

### API-052 PATCH /candidate/mock-interviews/{sessionId}/complete
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: AI 모의면접 진행 화면 (/candidate/mock-interviews/{sessionId})
- UI Type: system process
- 상태 코드: 200 OK
- 비동기: N
- Path Params: sessionId
- 요청 데이터:
  - 면접 세션, 답변 파일, 스크립트
- 검증/전제조건:
  - 필수 질문 응답 완료
- 성공 응답/처리:
  - 피드백 생성 대기 상태로 전환
- 오류/예외:
  - 업로드 지연 시 분석 대기 상태로 표시하고 재시도를 수행한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, question_bank, applications, interview_sessions, interview_answers, evaluation_reports, report_scores, report_evidences, ai_process_logs
- 비고/미결:
  - 완료 후 모의면접 리포트 생성 상태 표시

### API-053 GET /candidate/mock-interview/reports
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 모의면접 평가 리포트 화면 (/candidate/mock-interview/reports)
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 지원자 ID, 면접 이력, 리포트 ID
- 검증/전제조건:
  - 로그인 사용자
- 성공 응답/처리:
  - 연습 이력 및 모의면접 리포트 표시
- 오류/예외:
  - 리포트 생성 중이면 처리 상태를 표시하고 실패 시 재시도 안내를 제공한다.
- 관련 ERD 테이블:
  - candidate_profiles, criterion_tags, evaluation_criteria, applications, interview_sessions, interview_answers, evaluation_reports, report_scores, report_evidences, ai_process_logs, embeddings
- 비고/미결:
  - 연습 이력을 면접시작에서 평가 리포트 항목으로 편입

### API-054 GET /candidate/mock-interviews/history
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 모의면접 평가 리포트 화면 (/candidate/mock-interview/reports)
- UI Type: list
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 지원자 ID, 면접 이력
- 검증/전제조건:
  - 로그인 사용자
- 성공 응답/처리:
  - 연습 이력 목록 표시
- 오류/예외:
  - 이력이 없으면 첫 연습 시작 CTA를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, applications, interview_sessions, evaluation_reports, report_scores, report_evidences, ai_process_logs

### API-055 GET /candidate/mock-interview/reports/{reportId}/feedback
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 모의면접 평가 리포트 화면 (/candidate/mock-interview/reports/{reportId})
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: reportId
- 요청 데이터:
  - 녹화 답변, 스크립트, 직무 기준
- 검증/전제조건:
  - 답변 분석 완료
- 성공 응답/처리:
  - 피드백 결과 표시
- 오류/예외:
  - 답변 길이가 부족하면 피드백 범위를 제한하고 재시도를 안내한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, applications, interview_sessions, interview_answers, evaluation_reports, report_scores, report_evidences, ai_process_logs, embeddings
- 비고/미결:
  - 기업 선별용 판단 표현 사용 금지

### API-056 GET /candidate/mock-interview/reports/{reportId}/media
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 모의면접 평가 리포트 화면 (/candidate/mock-interview/reports/{reportId})
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: reportId
- 요청 데이터:
  - 영상 파일, 스크립트
- 검증/전제조건:
  - 영상 저장 및 STT 처리 완료
- 성공 응답/처리:
  - 영상과 스크립트 동시 표시
- 오류/예외:
  - 영상 재생 실패 시 스크립트만 표시하고 재처리 요청을 제공한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, applications, interview_sessions, interview_answers, evaluation_reports, report_scores, report_evidences, ai_process_logs

### API-057 POST /candidate/mock-interview/reports/{reportId}/generate
- 도메인: 지원자 - 모의면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 모의면접 평가 리포트 화면 (/candidate/mock-interview/reports/{reportId})
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- Path Params: reportId
- 요청 데이터:
  - 답변 스크립트, 직무 기준, 질문 유형
- 검증/전제조건:
  - 답변 분석 완료 상태
- 성공 응답/처리:
  - 모의면접 리포트 저장
- 오류/예외:
  - 리포트 생성 실패 시 재생성 버튼과 오류 상태를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, postings, criterion_tags, evaluation_criteria, question_bank, applications, interview_sessions, interview_answers, evaluation_reports, report_scores, report_evidences, manual_evaluations, ai_process_logs
- 비고/미결:
  - 채용 리포트와 달리 합격/탈락 판단 없음

## 지원자 - 채용공고/지원

### API-058 GET /candidate/jobs
- 도메인: 지원자 - 채용공고/지원
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 회사 리스트 화면 (/candidate/jobs)
- UI Type: page, section, list
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 검색어, 직무/직군, 지역, 경력, 고용형태, 기술스택, 채용 상태, 정렬 기준
  - 공고 ID
- 검증/전제조건:
  - 조회 권한 보유
  - 유효한 검색 조건
  - 공개 상태의 채용공고
- 성공 응답/처리:
  - 회사/채용공고 목록 표시
  - 검색 결과 갱신
  - 채용공고 리스트 표시
  - 응답 항목에는 `companyLogoUrl`을 포함한다. 회사 로고가 없으면 `null`을 반환한다.
- 오류/예외:
  - 조회 결과가 없으면 빈 상태 안내를 표시한다.
  - 검색 조건 오류 시 기본 조건으로 조회하거나 안내 메시지를 표시한다.
  - 공고가 마감되었으면 마감 상태를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, embeddings
- 비고/미결:
  - 기존 SNB 삭제. 2-depth는 GNB hover dropdown으로 노출. grid에서 list 형태로 변경
  - 검색 기능 강화
  - grid가 아니라 list 형태로 표시

### API-059 GET /candidate/jobs/{jobId}
- 도메인: 지원자 - 채용공고/지원
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 회사 상세 화면 (/candidate/jobs/{jobId})
- UI Type: popup
- 상태 코드: 200 OK
- 비동기: N
- Path Params: jobId
- 요청 데이터:
  - 회사 ID, 채용공고 ID
- 검증/전제조건:
  - 채용공고가 공개 상태여야 함
- 성공 응답/처리:
  - 회사 상세 팝업 표시 또는 이력서 제출 화면으로 이동
  - 회사 상세 응답에는 `companyLogoUrl`을 포함한다. 회사 로고가 없으면 `null`을 반환한다.
- 오류/예외:
  - 공고가 마감되었거나 접근 권한이 없으면 안내 메시지를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, file_assets, postings, applications, application_documents
- 비고/미결:
  - 지원하기 클릭 시 별도 이력서 제출 페이지로 이동

### API-060 POST /candidate/jobs/{jobId}/applications
- 도메인: 지원자 - 채용공고/지원
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 기업별 이력서 제출 화면 (/candidate/jobs/{jobId}/apply)
- UI Type: page
- 상태 코드: 201 Created
- 비동기: N
- Path Params: jobId
- 요청 데이터:
  - 채용공고 ID, 이력서 파일, 포트폴리오 링크, 지원자 ID
- 검증/전제조건:
  - 허용 파일 형식과 용량 조건 충족, 공고 지원 가능 상태
- 성공 응답/처리:
  - 지원서 제출 완료
- 오류/예외:
  - 파일 형식 오류, 용량 초과, 이미 지원한 공고, 마감 공고이면 제출을 제한한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, file_assets, postings, applications, application_documents
- 비고/미결:
  - 기업별 이력서 제출 페이지 신규 추가

## 지원자 - 지원현황/채용면접

### API-061 GET /candidate/applications
- 도메인: 지원자 - 지원현황/채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 지원현황 화면 (/candidate/applications)
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 지원자 ID, 상태 필터
- 검증/전제조건:
  - 로그인 사용자
- 성공 응답/처리:
  - 지원현황 목록 표시
- 오류/예외:
  - 지원 내역이 없으면 채용공고 탐색 CTA를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, application_documents, interview_sessions, evaluation_reports, report_scores, report_evidences, ai_process_logs
- 비고/미결:
  - 채용 AI 면접은 이 화면에서 진입

### API-062 GET /candidate/applications/{applicationId}/interview-guide
- 도메인: 지원자 - 지원현황/채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 지원현황 화면 (/candidate/applications)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicationId
- 요청 데이터:
  - 면접 세션 정보
- 응답 데이터:
  - applicationId, sessionId, interviewType
  - applicationInterviewStatus: 지원서의 채용 면접 상태
  - interviewSessionStatus: 채용 면접 세션 상태
  - interviewWindowStartsAt, interviewWindowEndsAt
  - method, requiredPreparations, requiredConsentTypes
  - consentCompleted, deviceCheckCompleted, canStart
- 검증/전제조건:
  - 면접 세션 활성 상태
- 성공 응답/처리:
  - 응시 안내와 필수 동의 완료 후 장치 점검 화면으로 이동 가능
- 오류/예외:
  - 세션 만료 또는 비활성 상태면 고객지원 안내를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, postings, applications, interview_sessions, interview_answers, ai_process_logs
- 비고/미결:
  - interviewType=RECRUITING

### API-063 POST /candidate/applications/{applicationId}/consent
- 도메인: 지원자 - 지원현황/채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 지원현황 화면 (/candidate/applications)
- UI Type: form
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicationId
- 요청 데이터:
  - 동의 체크박스, 필수 약관
- 검증/전제조건:
  - 필수 동의 완료
- 성공 응답/처리:
  - 면접 응시 가능 상태로 전환
- 오류/예외:
  - 필수 동의 누락 시 면접 시작 버튼을 비활성화한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, postings, applications, consent_records, interview_sessions, ai_process_logs
- 비고/미결:
  - 채용 AI 면접에서는 필수

### API-065 POST /candidate/applications/{applicationId}/interview/start
- 도메인: 지원자 - 지원현황/채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 지원현황 화면 (/candidate/applications)
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicationId
- 요청 데이터:
  - 지원 ID, 면접 세션 ID, 동의 상태, 장치 점검 결과
- 검증/전제조건:
  - 응시 기간 내, 필수 동의 완료, 장치 점검 완료
- 성공 응답/처리:
  - 채용 AI 면접 진행 화면으로 이동
- 오류/예외:
  - 세션 만료, 동의 누락, 장치 권한 오류 시 시작을 제한한다.
- 관련 ERD 테이블:
  - candidate_profiles, postings, applications, consent_records, interview_sessions, ai_process_logs
- 비고/미결:
  - interviewType=RECRUITING

### API-066 GET /candidate/applications/{applicationId}/interview
- 도메인: 지원자 - 지원현황/채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 채용 AI 면접 진행 화면 (/candidate/applications/{applicationId}/interview)
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicationId
- 요청 데이터:
  - 면접 세션 ID, 카메라 권한, 마이크 권한, 면접 질문 표시 여부
- 검증/전제조건:
  - 응시 기간 내, 동의 완료, 장치 점검 완료
- 성공 응답/처리:
  - 답변 녹화 및 다음 질문 진행
- 오류/예외:
  - 권한 거부, 녹화 실패, 네트워크 오류 시 재시도 안내를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, postings, question_bank, applications, consent_records, interview_sessions, interview_answers, ai_process_logs
- 비고/미결:
  - interviewType=RECRUITING. 질문 표시 토글은 CC 자막이 아니라 면접 질문 텍스트 표시 여부를 의미함

### API-073 GET /candidate/applications/{applicationId}/report
- 도메인: 지원자 - 지원현황/채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 채용 AI 면접 결과 화면 (/candidate/applications/{applicationId}/report)
- UI Type: page
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicationId
- 요청 데이터:
  - 지원 ID, 면접 세션 ID
- 검증/전제조건:
  - 본인 지원 건이며 응시 완료 상태
- 성공 응답/처리:
  - 응시 결과 또는 제한된 피드백 표시
- 오류/예외:
  - 리포트 생성 중이면 처리 상태를 표시하고 접근 제한 항목은 안내 문구를 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, interview_sessions, evaluation_reports, report_scores, report_evidences, ai_process_logs
- 비고/미결:
  - reportType=RECRUITING_REPORT, 지원자 제한 조회

### API-074 GET /candidate/applications/{applicationId}/status
- 도메인: 지원자 - 지원현황/채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 채용 AI 면접 결과 화면 (/candidate/applications/{applicationId}/report)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: applicationId
- 요청 데이터:
  - 지원 ID
- 검증/전제조건:
  - 본인 지원 건
- 성공 응답/처리:
  - 전형 상태 표시
- 오류/예외:
  - 상태 조회 실패 시 다시 조회 버튼을 제공한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, postings, applications, interview_sessions, evaluation_reports, report_scores, report_evidences, manual_evaluations, ai_process_logs
- 비고/미결:
  - 기업용 합격/탈락 내부 메모는 노출하지 않음

## 지원자 - 채용면접

### API-064 POST /candidate/interviews/{sessionId}/device-check
- 도메인: 지원자 - 채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 지원현황 화면 (/candidate/applications)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: sessionId
- 요청 데이터:
  - 카메라 권한, 마이크 권한, 네트워크 상태
- 검증/전제조건:
  - 브라우저 권한 허용
- 성공 응답/처리:
  - 장치 점검 완료
- 오류/예외:
  - 권한 거부 또는 장치 미감지 시 해결 가이드를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, postings, applications, interview_sessions, ai_process_logs

### API-067 GET /candidate/interviews/{sessionId}/questions
- 도메인: 지원자 - 채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 채용 AI 면접 진행 화면 (/candidate/applications/{applicationId}/interview)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- Path Params: sessionId
- 요청 데이터:
  - 질문 텍스트, 음성 안내 설정, 면접 질문 표시 여부
- 검증/전제조건:
  - 질문 목록 존재
- 성공 응답/처리:
  - 질문 음성 재생 및 설정에 따른 질문 텍스트 표시
- 오류/예외:
  - 질문 로딩 실패 시 안내 메시지를 표시하고 재시도를 제공한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, postings, question_bank, applications, interview_sessions, ai_process_logs
- 비고/미결:
  - 모의면접과 동일하게 면접 질문 표시 기본값 OFF. 질문 음성 다시 듣기 버튼 삭제. CC 자막 기능 아님

### API-068 POST /candidate/interviews/{sessionId}/answers
- 도메인: 지원자 - 채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 채용 AI 면접 진행 화면 (/candidate/applications/{applicationId}/interview)
- UI Type: section
- 상태 코드: 201 Created
- 비동기: N
- Path Params: sessionId
- 요청 데이터:
  - 카메라 스트림, 마이크 스트림, 답변 시간
- 검증/전제조건:
  - 장치 권한 허용, 저장 공간 확보
- 성공 응답/처리:
  - 답변 파일 업로드 완료
- 오류/예외:
  - 녹화 실패 시 재녹화 또는 고객지원 안내를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, postings, applications, interview_sessions, interview_answers, ai_process_logs
- 비고/미결:
  - 기존 답변 완료 버튼명을 면접 종료로 변경하고 우측 하단 배치

### API-069 POST /candidate/interviews/{sessionId}/next-question
- 도메인: 지원자 - 채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 채용 AI 면접 진행 화면 (/candidate/applications/{applicationId}/interview)
- UI Type: button
- 상태 코드: 200 OK
- 비동기: N
- Path Params: sessionId
- 요청 데이터:
  - 버튼 클릭, 단축키 입력
- 검증/전제조건:
  - 면접 종료 상태
- 성공 응답/처리:
  - 다음 질문 표시
- 오류/예외:
  - 단축키 충돌 또는 이동 실패 시 오류 안내를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, postings, question_bank, applications, interview_sessions, ai_process_logs
- 비고/미결:
  - 다음 질문으로 이동 단축키 지원

### API-070 POST /candidate/interviews/{sessionId}/stt
- 도메인: 지원자 - 채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 채용 AI 면접 진행 화면 (/candidate/applications/{applicationId}/interview)
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- Path Params: sessionId
- 요청 데이터:
  - 음성 파일, 언어 설정
- 검증/전제조건:
  - 음성 품질이 분석 가능해야 함
- 성공 응답/처리:
  - 답변 스크립트 저장
- 오류/예외:
  - 음성 인식 실패 시 영상 원본 검토 상태로 표시한다.
- 관련 ERD 테이블:
  - companies, candidate_profiles, file_assets, postings, applications, interview_sessions, interview_answers, ai_process_logs
- 비고/미결:
  - 독립 화면 아님. 기업 지원자 평가 상세에서 결과 확인

### API-071 POST /candidate/interviews/{sessionId}/follow-up-question
- 도메인: 지원자 - 채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 채용 AI 면접 진행 화면 (/candidate/applications/{applicationId}/interview)
- UI Type: section
- 상태 코드: 202 Accepted
- 비동기: Y
- Path Params: sessionId
- 요청 데이터:
  - 이전 질문, 답변 스크립트, 서류 요약
- 검증/전제조건:
  - 답변 텍스트가 충분해야 함
- 성공 응답/처리:
  - 꼬리질문 표시
- 오류/예외:
  - 답변이 너무 짧거나 부적절하면 기본 꼬리질문을 제시한다.
- 관련 ERD 테이블:
  - candidate_profiles, postings, question_bank, applications, application_documents, interview_sessions, interview_answers, follow_up_questions, ai_process_logs
- 비고/미결:
  - 채용 전형 정책에 따라 사용 여부 확정 필요

### API-071-TMP POST /candidate/interviews/{sessionId}/follow-up-questions/insert
- 프레임: 지원자 - 채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 채용 AI 면접 진행 화면 (/candidate/applications/{applicationId}/interview)
- UI Type: MVP bridge
- 상태 코드: 200 OK
- 비동기: N
- 임시 여부:
  - MVP 임시 브릿지 API다. 완료된 FOLLOW_UP AI 작업 결과를 실제 면접 질문 흐름에 끼워 넣기 위해 사용한다.
  - 정식 follow_up_questions 스키마/자동 상태 전이가 확정되면 제거하거나 정식 API로 재정의한다.
- Path Params: sessionId
- 요청 데이터:
  - processLogId
- 검증 전제조건:
  - processLogId가 COMPLETED 상태의 FOLLOW_UP 작업이어야 한다.
  - 작업의 sessionId와 요청 sessionId가 일치해야 한다.
  - 생성 근거가 된 답변의 질문이 현재 질문이거나, 방금 답변한 직전 질문이어야 한다.
- 성공 응답/처리:
  - 생성된 꼬리질문을 FOLLOW_UP 질문으로 세션 질문 목록에 추가한다.
  - question, inserted, totalQuestions, nextQuestionAvailable을 반환한다.
- 오류/예외:
  - 완료된 FOLLOW_UP 작업이 아니거나 다른 세션의 작업이면 오류를 반환한다.
- 관련 ERD 테이블:
  - question_bank, interview_sessions, interview_answers, ai_process_logs
- 비고/미결:
  - 임시 브릿지 API이므로 정식 API 번호 승격 여부는 D/E/PM 리뷰 후 결정한다.

### API-072 PATCH /candidate/interviews/{sessionId}/complete
- 도메인: 지원자 - 채용면접
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 채용 AI 면접 진행 화면 (/candidate/applications/{applicationId}/interview)
- UI Type: system process
- 상태 코드: 200 OK
- 비동기: N
- Path Params: sessionId
- 요청 데이터:
  - 면접 세션, 답변 파일, 스크립트
- 검증/전제조건:
  - 필수 질문 응답 완료
- 성공 응답/처리:
  - 분석 대기 상태로 전환
- 오류/예외:
  - 업로드 지연 시 분석 대기 상태로 표시하고 재시도를 수행한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, postings, question_bank, applications, interview_sessions, interview_answers, ai_process_logs
- 비고/미결:
  - 완료 후 지원현황에는 분석중 상태 표시

## 지원자 - 마이페이지

### API-075 POST /candidate/resume
- 도메인: 지원자 - 마이페이지
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 지원자 마이페이지 화면 (/candidate/mypage)
- UI Type: page
- 상태 코드: 201 Created
- 비동기: N
- 요청 데이터:
  - 이력서 PDF/DOCX 파일
- 검증/전제조건:
  - 허용 파일 형식과 용량 조건 충족
- 성공 응답/처리:
  - 이력서 업로드 완료
- 오류/예외:
  - 파일 손상, 형식 불일치, 용량 초과 시 재업로드 안내를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, applications, application_documents

### API-076 POST /candidate/documents/extract
- 도메인: 지원자 - 마이페이지
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 지원자 마이페이지 화면 (/candidate/mypage)
- UI Type: system process
- 상태 코드: 202 Accepted
- 비동기: Y
- 요청 데이터:
  - 이력서 파일, 포트폴리오 링크
- 검증/전제조건:
  - 파일 파싱 가능, 링크 접근 권한 확보
- 성공 응답/처리:
  - 추출 텍스트 저장 및 서류 분석 대기 상태 전환
- 오류/예외:
  - 파싱 실패 시 재업로드 안내 또는 수동 입력 요청 상태를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, applications, application_documents, manual_evaluations, ai_process_logs
- 비고/미결:
  - 독립 화면 아님. 업로드 후 백그라운드 처리

### API-077 POST /candidate/portfolio-links
- 도메인: 지원자 - 마이페이지
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 지원자 마이페이지 화면 (/candidate/mypage)
- UI Type: form
- 상태 코드: 201 Created
- 비동기: N
- 요청 데이터:
  - URL, 설명, 파일 첨부
- 검증/전제조건:
  - URL 형식이 유효해야 함
- 성공 응답/처리:
  - 링크 등록 완료
- 오류/예외:
  - 잘못된 URL 또는 접근 불가 URL이면 확인 메시지를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, file_assets, applications, application_documents, interview_sessions

### API-078 GET /candidate/notifications/interview-invitations
- 도메인: 지원자 - 마이페이지
- 권한/인증: 지원자 / 지원자 사용자 로그인
- 관련 화면: 지원자 마이페이지 화면 (/candidate/mypage)
- UI Type: section
- 상태 코드: 200 OK
- 비동기: N
- 요청 데이터:
  - 이메일, 응시 링크, 마감일
- 검증/전제조건:
  - 수신자 이메일 유효
- 성공 응답/처리:
  - 응시 안내 알림 표시
- 오류/예외:
  - 발송 실패 시 재발송 상태와 오류 사유를 표시한다.
- 관련 ERD 테이블:
  - candidate_profiles, postings, applications, application_documents, interview_sessions, notifications, ai_process_logs
- 비고/미결:
  - MVP 후순위
