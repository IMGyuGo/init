# Feature Spec

> Source: `init/docs/00_source` 기준. Generated at 2026-06-27.

init v0.5의 화면/기능 정의를 구현 단위로 정리한다.

## Summary

| Release | Feature Rows |
| --- |--- |
| v1.0 | 92 |
| v2.0 | 3 |

## Product Scope

- 공통: 랜딩, 로그인, 회원가입, 이메일 인증, 비밀번호 재설정
- 기업: 공고 운영, 지원자 관리, 평가 리포트, 면접 설정, 회사 정보 관리
- 지원자: 모의면접, 채용공고 조회, 기업별 지원서 제출, 채용 AI 면접, 마이페이지
- 시스템: AI 서류 추출, 질문 생성, STT, 꼬리질문, 평가/리포트 생성, 가드레일

## Implementation Baseline Impact

기능정의서의 화면/기능은 구현 시 아래 feature/module 기준에 배치한다. 이미 구현된 화면이 다른 위치에 있으면 1회용 alignment 지시서 기준으로 이동하거나 wrapper를 남기고 내부 구현을 기준 위치로 정렬한다.

| Product Area | Frontend Feature | Backend Module |
| --- | --- | --- |
| 로그인/회원가입/비밀번호 재설정 | `frontend/src/features/auth` | `backend/api/src/modules/auth` |
| 기업 공고/지원자 운영 | `frontend/src/features/company-recruiting` | `backend/api/src/modules/company-recruiting` |
| 기업 면접 설정/평가 기준/질문 | `frontend/src/features/company-interview-criteria` | `backend/api/src/modules/company-interview` |
| 회사 정보 관리 | `frontend/src/features/company-profile` | `backend/api/src/modules/company-profile` |
| 지원자 공고/지원/지원현황/마이페이지 | `frontend/src/features/candidate-application-interview` | `backend/api/src/modules/candidate` |
| 모의/채용 면접 런타임 | `frontend/src/features/candidate-application-interview` | `backend/api/src/modules/interview` |
| 리포트/AI 처리 상태 | `frontend/src/features/ai-report` | `backend/api/src/modules/report`, `backend/api/src/modules/ai` |

## -

| Screen | Path | Type | Content | Description | Input | Success | API/Route | Release | Note |
| --- |--- |--- |--- |--- |--- |--- |--- |--- |--- |
| 랜딩 화면 | / | page | 랜딩 화면 | 서비스 소개 조회 | 서비스 URL | 랜딩 화면 표시 | - | v1.0 | - |
| 랜딩 화면 | / | button | 로그인 버튼 | 로그인 화면 이동 | - | 로그인 화면으로 이동 | /login | v1.0 | - |
| 공통 AI 시스템 처리 | - | system process | AI 안전 가드레일 | AI 출력 안전성 검증 | 평가 프롬프트, 금지 규칙, 출력 결과 | 정책 준수 결과만 저장 | POST /ai/guardrails/validate | v1.0 | 독립 화면 아님. 모든 AI 평가/생성 단계의 공통 정책 레이어 |

## 로그인

| Screen | Path | Type | Content | Description | Input | Success | API/Route | Release | Note |
| --- |--- |--- |--- |--- |--- |--- |--- |--- |--- |
| 로그인 화면 | /login | selection | 사용자 선택 | 로그인 사용자 유형 선택 | 유형 선택 버튼(기업/지원자) | 선택한 사용자 유형이 로그인 요청에 반영됨 | - | v1.0 | 로그인 성공 후 기업은 지원현황 > 공고 관리, 지원자는 AI 모의면접 > 면접시작으로 이동 |
| 로그인 화면 | /login | form | 로그인 입력 폼 | 이메일/비밀번호 입력 | 이메일, 비밀번호 | 로그인 버튼 클릭 가능 | POST /auth/login | v1.0 | ID/PW 찾기·회원가입 링크는 비밀번호 입력란 바로 아래 배치 |
| 로그인 화면 | /login | link button | ID/PW 찾기 버튼 | ID/PW 찾기 화면 이동 | 이메일 | ID/PW 찾기 또는 비밀번호 재설정 화면으로 이동 | /password/reset | v1.0 | 비밀번호 입력란 바로 아래 배치 |
| 로그인 화면 | /login | link button | 회원가입 버튼 | 회원가입 화면 이동 | - | 회원가입 유형 선택 화면으로 이동 | /signup | v1.0 | 비밀번호 입력란 바로 아래 배치 |
| 로그인 화면 | /login | button | 로그인 버튼 | 로그인 요청 | 사용자 유형, 이메일, 비밀번호 | 기업은 지원현황 > 공고 관리로 이동, 지원자는 AI 모의면접 > 면접시작으로 이동 | POST /auth/login | v1.0 | 기업 기본 진입: /company/applications/dashboard, 지원자 기본 진입: /candidate/mock-interview/start |
| 로그인 화면 | /login | button | Google 로그인 버튼 | 지원자 전용 Google OAuth 로그인 | Google 계정 정보, 사용자 유형(CANDIDATE) | 지원자는 AI 모의면접 > 면접시작으로 이동 | GET /auth/google | v1.0 | Google 로그인은 지원자 개인 계정만 허용한다. 기업 계정은 이메일 회원가입/로그인만 사용하며, 이메일 회원가입과 달리 별도 이메일 인증 입력 단계는 적용하지 않음 |
| 비밀번호 재설정 화면 | /password/reset | form | 비밀번호 재설정 폼 | 비밀번호 재설정 | 이메일, 인증 코드, 새 비밀번호, 새 비밀번호 확인 | 비밀번호 재설정 완료 후 로그인 화면으로 이동 | POST /auth/password/reset | v1.0 | - |
| 비밀번호 재설정 화면 | /password/reset | button | 인증 코드 발송 버튼 | 비밀번호 재설정 인증 요청 | 이메일 | 인증 코드 입력 영역 활성화 | POST /auth/password/send-code | v1.0 | - |
| 비밀번호 재설정 화면 | /password/reset | button | 인증 확인 버튼 | 비밀번호 재설정 인증 확인 | 이메일, 인증 코드 | 새 비밀번호 입력 영역 활성화 | POST /auth/password/verify-code | v1.0 | - |

## 회원가입

| Screen | Path | Type | Content | Description | Input | Success | API/Route | Release | Note |
| --- |--- |--- |--- |--- |--- |--- |--- |--- |--- |
| 회원가입 화면 | /signup | page | 회원가입 화면 | 회원가입 유형 선택 | 유형 선택 버튼(기업/지원자) | 선택한 유형의 회원가입 화면으로 이동 | - | v1.0 | - |
| 지원자 회원가입 화면 | /signup/candidate | form | 지원자 회원가입 폼 | 지원자 계정 생성 | 이메일, 인증 코드, 비밀번호, 비밀번호 확인, 이름, 약관 동의 | 지원자 계정 생성 후 로그인 화면 또는 지원자 포털 > AI 모의면접 > 면접시작으로 이동 | POST /auth/signup/candidate | v1.0 | 이메일 회원가입은 이메일 인증 필수 |
| 지원자 회원가입 화면 | /signup/candidate | button | 이메일 인증 메일 발송 버튼 | 이메일 인증 요청 | 이메일 | 인증 코드 입력 영역 활성화 | POST /auth/email/send-code | v1.0 | 우선 이메일 인증만 구현 |
| 지원자 회원가입 화면 | /signup/candidate | button | 이메일 인증 확인 버튼 | 이메일 인증 코드 확인 | 이메일, 인증 코드 | 이메일 인증 완료 상태로 전환 | POST /auth/email/verify-code | v1.0 | - |
| 기업 회원가입 화면 | /signup/company | form | 기업 회원가입 폼 | 기업 계정 생성 | 이메일, 인증 코드, 비밀번호, 비밀번호 확인, 이름, 회사명, 약관 동의 | 기업 계정 생성 후 로그인 화면 또는 기업 포털 > 지원현황 > 공고 관리로 이동 | POST /auth/signup/company | v1.0 | 기업 전용 필드 확정 필요 |
| 기업 회원가입 화면 | /signup/company | button | 이메일 인증 메일 발송 버튼 | 이메일 인증 요청 | 이메일 | 인증 코드 입력 영역 활성화 | POST /auth/email/send-code | v1.0 | 우선 이메일 인증만 구현 |
| 기업 회원가입 화면 | /signup/company | button | 이메일 인증 확인 버튼 | 이메일 인증 코드 확인 | 이메일, 인증 코드 | 이메일 인증 완료 상태로 전환 | POST /auth/email/verify-code | v1.0 | - |

## 지원현황 (GNB button)

| Screen | Path | Type | Content | Description | Input | Success | API/Route | Release | Note |
| --- |--- |--- |--- |--- |--- |--- |--- |--- |--- |
| 공고 관리 화면 | /company/applications/dashboard | page | 공고 운영 현황 | 공고 목록 및 운영 현황 조회 | 회사 ID | 공고 목록과 공고별 운영 지표 표시 | GET /company/dashboard | v1.0 | 기존 SNB 삭제. 2-depth는 GNB hover dropdown으로 노출. 기존 관리자 대시보드 명칭을 공고 관리로 변경 |
| 공고 관리 화면 | /company/applications/dashboard | list | 공고 목록 | 회사별 공고 목록 조회 | 회사 ID | 공고 목록 표시 및 공고 상세 이동 가능 | GET /company/recruitments | v1.0 | 검색필터(프로젝트, 기간, 상태, 조회) 삭제 |
| 공고 관리 화면 | /company/applications/dashboard | section | 다음 전형 대상자 선별 | 전형 상태 지정 | 지원자 ID, 합격/탈락/보류 상태, 메모, 판정 필터 | 편집 모드에서 전형 상태 저장 | PATCH /company/applicants/{applicantId}/screening-status | v1.0 | 우측 상단 기본 버튼은 편집. 편집 클릭 시 상태 저장으로 toggle |
| 공고 세부내용 화면 | /company/recruitments/{recruitmentId} | page | 공고 세부내용 | 공고 상세 및 지원자 관리 진입 | 공고 ID | 공고 세부내용 표시 | GET /company/recruitments/{recruitmentId} | v1.0 | 공고가 상위 개념이고 지원자 관리는 이 화면의 하위 흐름으로 구성 |
| 지원자 관리 화면 | /company/recruitments/{recruitmentId}/applicants | page | 지원자 관리 | 공고별 지원자 관리 | 공고 ID | 공고별 지원자 관리 화면 표시 | GET /company/recruitments/{recruitmentId}/applicants | v1.0 | 기존 구직자 관리 명칭을 지원자 관리로 변경. 평가 리포트 메뉴는 지원자 관리로 통합 |
| 지원자 관리 화면 | /company/recruitments/{recruitmentId}/applicants | form | 지원자 등록 | 지원자 등록/CSV 업로드 | 이름, 이메일, 지원 직무, 연락처 | 지원자 등록 완료 | POST /company/applicants | v1.0 | CSV 일괄 등록 상세 정책 추가 검토 필요 |
| 지원자 관리 화면 | /company/recruitments/{recruitmentId}/applicants | button | 지원자 초대 링크 발송 | 초대 메일 발송 | 지원자 이메일, 응시 기간, 안내 메시지 | 초대 링크 발송 완료 | POST /company/applicants/invitations | v1.0 | interviewType=RECRUITING |
| 지원자 관리 화면 | /company/recruitments/{recruitmentId}/applicants | system process | 채용 AI 면접 세션 생성 | 면접 세션 자동 생성 | 지원자, 공고, 응시 기간, 질문 세트 | 면접 세션 생성 및 초대 링크 연결 | POST /company/interview-sessions | v1.0 | 독립 화면 아님. 초대 링크 발송 프로세스와 묶어서 처리 |
| 지원자 관리 화면 | /company/recruitments/{recruitmentId}/applicants | list | 지원자 목록 | 지원 상태 조회 | 공고, 상태 필터, 검색어 | 지원자 목록 표시 | GET /company/applicants | v1.0 | 기존 구직자 진행 상태 목록을 지원자 목록으로 변경 |
| 지원자 관리 화면 | /company/recruitments/{recruitmentId}/applicants | section | 지원자별 평가 리포트 요약 | 리포트 상태 조회 | 공고, 지원자 ID, 리포트 상태 | 리포트 요약 표시 및 평가 상세 이동 가능 | GET /company/reports | v1.0 | 기존 평가 리포트 SNB 메뉴를 지원자 관리 내부로 통합 |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | page | 지원자 평가 상세 | 서류 평가와 채용 리포트 통합 조회 | 지원자 ID, 공고 ID | 지원자 평가 상세 표시 | GET /company/applicants/{applicantId}/evaluation | v1.0 | 기존 9번 서류 평가 상세과 10번 채용 리포트 상세을 9번으로 통합 |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | section | 서류 평가 근거 영역 | 서류 평가 근거 조회 | 평가 결과, 근거 문장 | 평가 근거 표시 | GET /company/applicants/{applicantId}/document-evaluation | v1.0 | - |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | section | 역량별 점수 영역 | 역량별 점수 조회 | 지원자 ID, 평가 기준 | 역량별 점수 표시 | GET /company/reports/{reportId} | v1.0 | reportType=RECRUITING_REPORT |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | section | 평가 근거 영역 | 근거 기반 평가 조회 | 평가 결과, 근거 데이터 | 평가 근거 표시 | GET /company/reports/{reportId}/evidence | v1.0 | - |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | section | 영상/스크립트 동시 조회 영역 | 영상/스크립트 조회 | 영상 파일, 스크립트 | 영상과 스크립트 동시 표시 | GET /company/reports/{reportId}/media | v1.0 | 문제별 타임스탬프 기능 추가 여부 검토 필요 |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | section | 지원자 비교 영역 | 지원자 비교 | 공고, 지원자 목록, 평가 항목 | 지원자 비교 결과 표시 | GET /company/applicants/compare | v1.0 | - |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | form | 면접관 수동 평가/메모 | 수동 평가 입력 | 수동 점수, 메모, 최종 상태 | 수동 평가 저장 | PATCH /company/applicants/{applicantId}/manual-evaluation | v1.0 | - |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | button | 리포트 다운로드 버튼 | 리포트 다운로드 | 지원자 ID, 파일 형식 | PDF 또는 Excel 파일 다운로드 | GET /company/reports/{reportId}/download | v2.0 | MVP 후순위 |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | system process | 평가 컨텍스트 생성 | 평가 컨텍스트 구성 | JD, 평가 기준, 서류 요약, 답변 스크립트 | 평가 컨텍스트 저장 | POST /reports/{reportId}/evaluation-context | v1.0 | 독립 화면 아님. 채용 리포트 생성 파이프라인 내부 처리 |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | system process | 답변 평가 | 답변 채점 및 근거 생성 | 답변 스크립트, 평가 기준, 모범 답안 | 답변 평가 결과 저장 | POST /reports/{reportId}/answer-evaluation | v1.0 | 결과는 지원자 평가 상세에 노출 |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | system process | 커뮤니케이션 분석 | 비언어/음성 지표 보조 분석 | 영상 파일, 음성 파일, 얼굴/시선/음성 피처 | 커뮤니케이션 지표 저장 | POST /reports/{reportId}/communication-analysis | v1.0 | 보조 지표로만 사용. 평가 결정 근거 과대해석 주의 |
| 지원자 평가 상세 화면 | /company/applicants/{applicantId}/evaluation | system process | 평가 리포트 생성 | 리포트 생성 | 서류 평가 결과, 면접 평가 결과, 평가 기준 | 평가 리포트 저장 | POST /reports/{reportId}/generate | v1.0 | 리포트 목록에는 분석중/완료/실패 상태 표시 |

## 채용관리 (GNB button)

| Screen | Path | Type | Content | Description | Input | Success | API/Route | Release | Note |
| --- |--- |--- |--- |--- |--- |--- |--- |--- |--- |
| 채용 공고 관리 화면 | /company/recruitments | page | 채용 공고 목록 | 채용 공고 목록 조회 | 검색어, 상태, 정렬 기준 | 채용 공고 목록 표시 | GET /company/recruitments | v1.0 | 첨부 이미지 기준 리스트형 레이아웃으로 변경 |
| 채용 공고 관리 화면 | /company/recruitments | section | 채용 공고 검색 영역 | 공고 검색/필터링 | 검색어, 상태 | 검색 조건에 맞는 공고 목록 갱신 | GET /company/recruitments?keyword={keyword}&status={status} | v1.0 | 검색어 placeholder: 프로젝트명, 직무명 검색 |
| 채용 공고 관리 화면 | /company/recruitments | list | 채용 공고 리스트 | 채용 공고 리스트 표시 | 공고 ID | 공고 리스트 표시 및 공고 상세/수정/복사 가능 | GET /company/recruitments | v1.0 | grid/table이 아니라 첨부 이미지처럼 가로형 리스트 카드로 표시 |
| 채용 공고 관리 화면 | /company/recruitments | button | 공고 상세 버튼 | 공고 상세 화면 이동 | 공고 ID | 공고 상세 화면으로 이동 | /company/recruitments/{recruitmentId} | v1.0 | 각 공고 리스트 항목 우측에 배치 |
| 채용 공고 관리 화면 | /company/recruitments | button | 공고 수정 버튼 | 공고 수정 화면 이동 | 공고 ID | 공고 수정 화면으로 이동 | /company/recruitments/{recruitmentId}/edit | v1.0 | 진행중/임시저장 상태에서 노출 |
| 채용 공고 관리 화면 | /company/recruitments | button | 공고 복사 버튼 | 마감 공고 복사 | 공고 ID | 복사된 공고 생성 화면으로 이동 | POST /company/recruitments/{recruitmentId}/copy | v1.0 | 마감 상태에서 수정 버튼 대신 노출 |
| 면접 관리 화면 | /company/interviews/settings | page | 면접 관리 | 면접 설정 관리 | 채용 공고, 평가 기준, 질문 세트, 시간 정책 | 면접 관리 화면 표시 | GET /company/interviews/settings | v1.0 | 기존 SNB 삭제. 2-depth는 GNB hover dropdown으로 노출 |
| 면접 관리 화면 | /company/interviews/settings | section | AI 평가 역량 제안 | AI 평가 역량 태그 추천 | JD, 인재상, 평가 템플릿 | 평가 역량 후보 표시 | POST /company/interviews/evaluation-criteria/suggest | v1.0 | 태그 추천 세부 정책 확정 필요 |
| 면접 관리 화면 | /company/interviews/settings | form | 평가 기준 설정 | 평가 기준 편집 | 평가 항목명, 설명, 배점, 기준 점수 | 평가 기준 저장 | PATCH /company/interviews/evaluation-criteria | v1.0 | 저장 버튼은 평가 기준 설정 영역 우측 상단 배치 |
| 면접 관리 화면 | /company/interviews/settings | section | 질문 뱅크 관리 | 질문 등록/연결 | 질문 내용, 질문 유형, 평가 역량 | 질문 저장 및 공고 연결 | POST /company/interviews/questions | v1.0 | 질문 저장 버튼은 질문 뱅크 관리 영역 우측 상단 배치 |
| 면접 관리 화면 | /company/interviews/settings | system process | 채용 직무 질문 생성 | JD 기반 직무 질문 생성 | JD, 직무명세서, 평가 역량 | 직무 질문 후보 저장 | POST /company/interviews/questions/generate | v1.0 | 생성 결과는 질문 뱅크 관리 영역에 표시 |
| 면접 관리 화면 | /company/interviews/settings | system process | 채용 면접 질문 구성 | 면접 질문 목록 구성 | 질문 유형, 질문 수, 평가 역량 | 면접 질문 목록 생성 및 세션 연결 가능 상태 전환 | POST /company/interviews/question-sets | v1.0 | 질문 뱅크 관리 화면에서 결과 확인 |
| 면접 관리 화면 | /company/interviews/settings | form | 면접 시간 설정 | 면접 시간 정책 설정 | 준비 시간, 답변 시간, 재응시 허용 여부 | 면접 설정 저장 | PATCH /company/interviews/time-policy | v1.0 | 설정 저장 버튼은 면접 시간 설정 영역 우측 상단 배치 |

## 회사 정보 관리 (GNB button)

| Screen | Path | Type | Content | Description | Input | Success | API/Route | Release | Note |
| --- |--- |--- |--- |--- |--- |--- |--- |--- |--- |
| 회사 정보 관리 화면 | /company/mypage | page | 회사 정보 관리 | 회사 정보 조회/수정 | 기업명, 산업군, 회사 로고, 인재상, 평가 정책 | 회사 정보 저장 | PATCH /company/profile | v1.0 | 기존 기업 마이페이지 명칭을 회사 정보 관리로 변경 |
| 회사 정보 관리 화면 | /company/mypage | button | 회사 로고 등록 | 회사 로고 이미지 업로드 | 회사 로고 이미지 파일 | 회사 로고 등록 완료 | POST /company/profile/logo | v1.0 | 회사 로고 사진 별도 등록 기능 추가 |
| 회사 정보 관리 화면 | /company/mypage | section | 리포트 생성 완료 알림 설정 | 알림 설정 | 알림 수신 여부, 공고 | 알림 설정 저장 | PATCH /company/notifications/settings | v2.0 | MVP 후순위. 담당자 선택 필터 삭제 |

## AI 모의면접 (GNB button)

| Screen | Path | Type | Content | Description | Input | Success | API/Route | Release | Note |
| --- |--- |--- |--- |--- |--- |--- |--- |--- |--- |
| AI 모의면접 시작 화면 | /candidate/mock-interview/start | page | 모의면접 시작 | AI 모의면접 시작 | 직무 선택, 난이도, 질문 유형 | 모의면접 세션 생성 | POST /candidate/mock-interviews | v1.0 | 기존 SNB 삭제. 2-depth는 GNB hover dropdown으로 노출. 연습 이력은 평가 리포트 항목으로 이동 |
| AI 모의면접 시작 화면 | /candidate/mock-interview/start | system process | 모의면접 질문 생성 | 연습용 질문 목록 구성 | 직무, 난이도, 질문 유형 | 모의면접 질문 목록 생성 | POST /candidate/mock-interviews/questions/generate | v1.0 | 채용 질문과 달리 JD/기업 평가 기준을 사용하지 않음 |
| AI 모의면접 진행 화면 | /candidate/mock-interviews/{sessionId} | page | 모의면접 진행 | 개인 연습용 AI 면접 진행 | 면접 세션 ID, 카메라 권한, 마이크 권한, 면접 질문 표시 여부 | 답변 녹화 및 다음 질문 진행 | GET /candidate/mock-interviews/{sessionId} | v1.0 | interviewType=MOCK. 질문 표시 토글은 CC 자막이 아니라 면접 질문 텍스트 표시 여부를 의미함 |
| AI 모의면접 진행 화면 | /candidate/mock-interviews/{sessionId} | section | 질문 제시 | 질문 음성 안내 및 면접 질문 표시 | 질문 텍스트, 음성 안내 설정, 면접 질문 표시 여부 | 질문 음성 재생 및 설정에 따른 질문 텍스트 표시 | GET /candidate/mock-interviews/{sessionId}/questions | v1.0 | 질문 음성 다시 듣기 버튼 삭제. 면접 질문 표시 기본값 OFF. CC 자막 기능 아님 |
| AI 모의면접 진행 화면 | /candidate/mock-interviews/{sessionId} | section | 답변 녹화 | 영상/음성 답변 녹화 | 카메라 스트림, 마이크 스트림, 답변 시간 | 답변 파일 업로드 완료 | POST /candidate/mock-interviews/{sessionId}/answers | v1.0 | 기존 답변 완료 버튼명을 면접 종료로 변경하고 우측 하단 배치 |
| AI 모의면접 진행 화면 | /candidate/mock-interviews/{sessionId} | button | 다음 질문 이동 | 다음 질문 이동 및 단축키 지원 | 버튼 클릭, 단축키 입력 | 다음 질문 표시 | POST /candidate/mock-interviews/{sessionId}/next-question | v1.0 | 다음 질문으로 이동 단축키 지원 |
| AI 모의면접 진행 화면 | /candidate/mock-interviews/{sessionId} | system process | 모의면접 답변 스크립트 생성 | STT 처리 | 음성 파일, 언어 설정 | 답변 스크립트 저장 | POST /candidate/mock-interviews/{sessionId}/stt | v1.0 | 독립 화면 아님. 리포트 상세에서 결과 확인 |
| AI 모의면접 진행 화면 | /candidate/mock-interviews/{sessionId} | section | 실시간 꼬리질문 생성 | 꼬리질문 생성 | 이전 질문, 답변 스크립트, 직무 선택 정보 | 꼬리질문 표시 | POST /candidate/mock-interviews/{sessionId}/follow-up-question | v1.0 | 채용 평가용 꼬리질문과 분리 |
| AI 모의면접 진행 화면 | /candidate/mock-interviews/{sessionId} | button | 꼬리질문 질문 흐름 추가 | 생성된 꼬리질문을 면접 질문으로 추가 | processLogId | 다음 질문으로 FOLLOW_UP 질문 추가 | POST /candidate/mock-interviews/{sessionId}/follow-up-questions/insert | MVP 임시 | 정식 follow_up_questions 스키마/자동 상태 전이 확정 전까지 사용하는 브릿지 API |
| AI 모의면접 진행 화면 | /candidate/mock-interviews/{sessionId} | system process | 모의면접 완료 처리 | 면접 종료 및 분석 상태 전환 | 면접 세션, 답변 파일, 스크립트 | 피드백 생성 대기 상태로 전환 | PATCH /candidate/mock-interviews/{sessionId}/complete | v1.0 | 완료 후 모의면접 리포트 생성 상태 표시 |
| 모의면접 평가 리포트 화면 | /candidate/mock-interview/reports | page | 모의면접 평가 리포트 | 연습 이력 및 리포트 조회 | 지원자 ID, 면접 이력, 리포트 ID | 연습 이력 및 모의면접 리포트 표시 | GET /candidate/mock-interview/reports | v1.0 | 연습 이력을 면접시작에서 평가 리포트 항목으로 편입 |
| 모의면접 평가 리포트 화면 | /candidate/mock-interview/reports | list | 연습 이력 목록 | 연습 이력 조회 | 지원자 ID, 면접 이력 | 연습 이력 목록 표시 | GET /candidate/mock-interviews/history | v1.0 | - |
| 모의면접 평가 리포트 화면 | /candidate/mock-interview/reports/{reportId} | section | 피드백 영역 | 모의면접 피드백 조회 | 녹화 답변, 스크립트, 직무 기준 | 피드백 결과 표시 | GET /candidate/mock-interview/reports/{reportId}/feedback | v1.0 | 기업 선별용 판단 표현 사용 금지 |
| 모의면접 평가 리포트 화면 | /candidate/mock-interview/reports/{reportId} | section | 영상/스크립트 동시 조회 영역 | 영상/스크립트 조회 | 영상 파일, 스크립트 | 영상과 스크립트 동시 표시 | GET /candidate/mock-interview/reports/{reportId}/media | v1.0 | - |
| 모의면접 평가 리포트 화면 | /candidate/mock-interview/reports/{reportId} | system process | 모의면접 리포트 생성 | 피드백 리포트 생성 | 답변 스크립트, 직무 기준, 질문 유형 | 모의면접 리포트 저장 | POST /candidate/mock-interview/reports/{reportId}/generate | v1.0 | 채용 리포트와 달리 합격/탈락 판단 없음 |

## 채용정보 (GNB button)

| Screen | Path | Type | Content | Description | Input | Success | API/Route | Release | Note |
| --- |--- |--- |--- |--- |--- |--- |--- |--- |--- |
| 회사 리스트 화면 | /candidate/jobs | page | 회사 리스트 | 채용공고 목록 조회 | 검색어, 직무/직군, 지역, 경력, 고용형태, 기술스택, 채용 상태, 정렬 기준 | 회사/채용공고 목록 표시 | GET /candidate/jobs | v1.0 | 기존 SNB 삭제. 2-depth는 GNB hover dropdown으로 노출. grid에서 list 형태로 변경 |
| 회사 리스트 화면 | /candidate/jobs | section | 채용공고 검색 필터 | 채용공고 검색 | 검색어, 직무/직군, 지역, 경력, 고용형태, 기술스택, 채용 상태, 정렬 기준 | 검색 결과 갱신 | GET /candidate/jobs | v1.0 | 검색 기능 강화 |
| 회사 리스트 화면 | /candidate/jobs | list | 채용공고 리스트 | 채용공고 리스트 표시 | 공고 ID | 채용공고 리스트 표시 | GET /candidate/jobs | v1.0 | grid가 아니라 list 형태로 표시 |
| 회사 상세 화면 | /candidate/jobs/{jobId} | popup | 회사 상세 | 채용공고 상세 조회 | 회사 ID, 채용공고 ID | 회사 상세 팝업 표시 또는 이력서 제출 화면으로 이동 | GET /candidate/jobs/{jobId} | v1.0 | 지원하기 클릭 시 별도 이력서 제출 페이지로 이동 |
| 회사 상세 화면 | /candidate/jobs/{jobId} | button | 지원하기 버튼 | 기업별 이력서 제출 화면 이동 | 채용공고 ID, 지원자 ID | 이력서 제출 화면으로 이동 | /candidate/jobs/{jobId}/apply | v1.0 | 기업별 이력서 구분 적용 |
| 기업별 이력서 제출 화면 | /candidate/jobs/{jobId}/apply | page | 이력서 제출 | 기업별 지원 서류 제출 | 채용공고 ID, 이력서 파일, 포트폴리오 링크, 지원자 ID | 지원서 제출 완료 | POST /candidate/jobs/{jobId}/applications | v1.0 | 기업별 이력서 제출 페이지 신규 추가 |
| 지원현황 화면 | /candidate/applications | page | 지원현황 목록 | 지원 상태 조회 | 지원자 ID, 상태 필터 | 지원현황 목록 표시 | GET /candidate/applications | v1.0 | 채용 AI 면접은 이 화면에서 진입 |
| 지원현황 화면 | /candidate/applications | section | AI 면접 안내 | 채용 AI 면접 방식 안내 | 면접 세션 정보 | 면접 진행 화면으로 이동 가능 | GET /candidate/applications/{applicationId}/interview-guide | v1.0 | interviewType=RECRUITING |
| 지원현황 화면 | /candidate/applications | form | 응시 동의 | 개인정보/분석 동의 | 동의 체크박스, 필수 약관 | 면접 응시 가능 상태로 전환 | POST /candidate/applications/{applicationId}/consent | v1.0 | 채용 AI 면접에서는 필수 |
| 지원현황 화면 | /candidate/applications | section | 장치 점검 | 카메라/마이크/네트워크 점검 | 카메라 권한, 마이크 권한, 네트워크 상태 | 장치 점검 완료 | POST /candidate/interviews/{sessionId}/device-check | v1.0 | - |
| 지원현황 화면 | /candidate/applications | button | 채용 AI 면접 시작 | 채용 전형용 AI 면접 세션 시작 | 지원 ID, 면접 세션 ID, 동의 상태, 장치 점검 결과 | 채용 AI 면접 진행 화면으로 이동 | POST /candidate/applications/{applicationId}/interview/start | v1.0 | interviewType=RECRUITING |
| 채용 AI 면접 진행 화면 | /candidate/applications/{applicationId}/interview | page | 채용 AI 면접 진행 | 채용 전형용 AI 면접 진행 | 면접 세션 ID, 카메라 권한, 마이크 권한, 면접 질문 표시 여부 | 답변 녹화 및 다음 질문 진행 | GET /candidate/applications/{applicationId}/interview | v1.0 | interviewType=RECRUITING. 질문 표시 토글은 CC 자막이 아니라 면접 질문 텍스트 표시 여부를 의미함 |
| 채용 AI 면접 진행 화면 | /candidate/applications/{applicationId}/interview | section | 질문 제시 | 질문 음성 안내 및 면접 질문 표시 | 질문 텍스트, 음성 안내 설정, 면접 질문 표시 여부 | 질문 음성 재생 및 설정에 따른 질문 텍스트 표시 | GET /candidate/interviews/{sessionId}/questions | v1.0 | 모의면접과 동일하게 면접 질문 표시 기본값 OFF. 질문 음성 다시 듣기 버튼 삭제. CC 자막 기능 아님 |
| 채용 AI 면접 진행 화면 | /candidate/applications/{applicationId}/interview | section | 답변 녹화 | 영상/음성 답변 녹화 | 카메라 스트림, 마이크 스트림, 답변 시간 | 답변 파일 업로드 완료 | POST /candidate/interviews/{sessionId}/answers | v1.0 | 기존 답변 완료 버튼명을 면접 종료로 변경하고 우측 하단 배치 |
| 채용 AI 면접 진행 화면 | /candidate/applications/{applicationId}/interview | button | 다음 질문 이동 | 다음 질문 이동 및 단축키 지원 | 버튼 클릭, 단축키 입력 | 다음 질문 표시 | POST /candidate/interviews/{sessionId}/next-question | v1.0 | 다음 질문으로 이동 단축키 지원 |
| 채용 AI 면접 진행 화면 | /candidate/applications/{applicationId}/interview | system process | 채용 면접 답변 스크립트 생성 | STT 처리 | 음성 파일, 언어 설정 | 답변 스크립트 저장 | POST /candidate/interviews/{sessionId}/stt | v1.0 | 독립 화면 아님. 기업 지원자 평가 상세에서 결과 확인 |
| 채용 AI 면접 진행 화면 | /candidate/applications/{applicationId}/interview | section | 실시간 꼬리질문 생성 | 꼬리질문 생성 | 이전 질문, 답변 스크립트, 서류 요약 | 꼬리질문 표시 | POST /candidate/interviews/{sessionId}/follow-up-question | v1.0 | 채용 전형 정책에 따라 사용 여부 확정 필요 |
| 채용 AI 면접 진행 화면 | /candidate/applications/{applicationId}/interview | button | 꼬리질문 질문 흐름 추가 | 생성된 꼬리질문을 면접 질문으로 추가 | processLogId | 다음 질문으로 FOLLOW_UP 질문 추가 | POST /candidate/interviews/{sessionId}/follow-up-questions/insert | MVP 임시 | 정식 follow_up_questions 스키마/자동 상태 전이 확정 전까지 사용하는 브릿지 API |
| 채용 AI 면접 진행 화면 | /candidate/applications/{applicationId}/interview | system process | 채용 면접 완료 처리 | 면접 종료 및 분석 상태 전환 | 면접 세션, 답변 파일, 스크립트 | 분석 대기 상태로 전환 | PATCH /candidate/interviews/{sessionId}/complete | v1.0 | 완료 후 지원현황에는 분석중 상태 표시 |
| 채용 AI 면접 결과 화면 | /candidate/applications/{applicationId}/report | page | 채용 AI 면접 결과 | 지원자용 제한 결과 조회 | 지원 ID, 면접 세션 ID | 응시 결과 또는 제한된 피드백 표시 | GET /candidate/applications/{applicationId}/report | v1.0 | reportType=RECRUITING_REPORT, 지원자 제한 조회 |
| 채용 AI 면접 결과 화면 | /candidate/applications/{applicationId}/report | section | 전형 상태 표시 | 채용 전형 진행 상태 조회 | 지원 ID | 전형 상태 표시 | GET /candidate/applications/{applicationId}/status | v1.0 | 기업용 합격/탈락 내부 메모는 노출하지 않음 |

## 마이페이지 (GNB button)

| Screen | Path | Type | Content | Description | Input | Success | API/Route | Release | Note |
| --- |--- |--- |--- |--- |--- |--- |--- |--- |--- |
| 지원자 마이페이지 화면 | /candidate/mypage | page | 이력서 업로드 | 이력서 파일 제출 | 이력서 PDF/DOCX 파일 | 이력서 업로드 완료 | POST /candidate/resume | v1.0 | - |
| 지원자 마이페이지 화면 | /candidate/mypage | system process | 서류 텍스트 추출 | 서류 텍스트 추출 | 이력서 파일, 포트폴리오 링크 | 추출 텍스트 저장 및 서류 분석 대기 상태 전환 | POST /candidate/documents/extract | v1.0 | 독립 화면 아님. 업로드 후 백그라운드 처리 |
| 지원자 마이페이지 화면 | /candidate/mypage | form | 포트폴리오/GitHub 링크 등록 | 직무 관련 링크 등록 | URL, 설명, 파일 첨부 | 링크 등록 완료 | POST /candidate/portfolio-links | v1.0 | - |
| 지원자 마이페이지 화면 | /candidate/mypage | section | 응시 안내 알림 | 응시 안내 메일 조회 | 이메일, 응시 링크, 마감일 | 응시 안내 알림 표시 | GET /candidate/notifications/interview-invitations | v2.0 | MVP 후순위 |
