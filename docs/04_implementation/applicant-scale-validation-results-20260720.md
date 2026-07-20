# Applicant Scale Validation Results — 2026-07-20

## Scope

- 기준 revision: `origin/dev` `fb173511` (PR #404 merge commit)
- 환경: disposable local PostgreSQL 16 + pgvector, local API/frontend
- 대상 공고: 별도 검증용 기업·공고 fixture
- 검증 규모: 활성 지원자 100명, 1,000명, 5,000명
- 외부 pipeline: 모든 규모에서 `pipeline-count=0`
- AWS/RDS/SQS/worker/OpenAI 검증: 실행하지 않음

## Deployment Prerequisite

PR #404 merge 뒤 `Deploy AWS Main` run `29725402226`의 다음 단계가 모두 성공했다.

- Run database migration
- Update ECS services
- Smoke test

이 확인은 배포 prerequisite 확인일 뿐, AWS에 합성 지원자 dataset을 적용한 것은 아니다.

## Results

| 활성 지원자 | 취소 이력 | apply | 동일 apply | 검증 | cleanup | list+count p50 / p95 | summary p50 / p95 |
| ---: | ---: | --- | --- | --- | --- | --- | --- |
| 100 | 5 | PASS | idempotent | PASS | PASS | smoke 43.50 ms | smoke 28.34 ms |
| 1,000 | 50 | PASS | idempotent | PASS | PASS | 28.10 / 46.40 ms | 21.48 / 32.52 ms |
| 5,000 | 250 | PASS | idempotent | PASS | PASS | 55.92 / 107.51 ms | 53.87 / 130.46 ms |

100명 수치는 smoke 단일 측정값이며, 1,000명과 5,000명은 각각 20회 측정한 값이다. 로컬 개발 장비의 절대 응답시간은 운영 SLO가 아니라 규모별 회귀 비교 기준으로만 사용한다.

## Integrity And Pagination

세 규모 모두 다음 조건을 통과했다.

- manifest, users, candidate_profiles, applications 건수 일치
- 로그인 가능한 시연 계정은 정확히 10개이고 나머지 계정은 비대화 상태
- 취소 이력은 유지하되 활성 목록·집계에서는 제외
- 상태 분포와 summary 집계 일치
- 검색, application/document/interview/report/screening 필터 일치
- 정렬 enum 순서와 application ID tie-break 일치
- PROFILE, INTERVIEW, REPORT 상세 fixture 조회 성공
- cleanup 뒤 audit manifest 외 users/candidate_profiles/applications 잔존 건수 0

페이지 검증 결과는 다음과 같다.

| 규모 | verifier 순회 | UI 확인 | 한 페이지 응답 크기 |
| ---: | --- | --- | --- |
| 100 | limit 100, 누락·중복 0 | 첫 페이지 | 약 35~37 KB (limit 20) |
| 1,000 | 10 pages, unique 1,000 | 첫·25·50페이지, 검색, 면접 상태 필터, 상세 이동 | 약 35~37 KB (limit 20) |
| 5,000 | 50 pages, unique 5,000 | KPI 5,000명과 첫 20건 렌더링 | 약 35~37 KB (limit 20) |

## Query Plan

1,000명 이상에서 첫 페이지와 중간 페이지는 `idx_applications_posting_updated_id`를 사용했다. 5,000명 기준 execution time은 첫 페이지 0.275 ms, 중간 페이지 2.409 ms였다.

마지막 페이지는 offset이 커지면서 PostgreSQL이 sequential scan + sort를 선택했다.

- 1,000명 마지막 페이지: 1.735 ms
- 5,000명 마지막 페이지: 7.544 ms

현재 로컬 규모에서는 허용 가능한 결과지만, AWS 검증에서 데이터 규모와 RDS 부하를 반영해 재측정해야 한다. 더 큰 규모에서 마지막 페이지 지연이 증가하면 offset pagination 대신 `(updated_at, application_id)` cursor pagination을 후속 검토한다.

## Cost Gate

이번 실행은 로컬 DB read/write와 로컬 API/frontend만 사용했으며 추가 외부 비용 구간을 실행하지 않았다. 다음 단계는 별도 승인 전 중단한다.

- AWS 검증 공고에 1,000명 dataset 적용
- ECS/RDS/CloudWatch 기반 성능 재측정
- SQS/worker/OpenAI pipeline 최대 10명 실행

## Review Boundary

검증기 자체는 PM 소유의 좁은 경로로 등록한다. 다만 B 소유의 company recruiting 목록·집계 repository와 D 소유의 synthetic applicant importer 계약을 함께 실행하므로 B/D cross-owner review가 필요하다.
