# Applicant Scale Validation Runbook

이 문서는 #392의 100/1,000/5,000명 합성 지원자 검증 순서와 비용 경계를 고정한다. 합성 데이터 생성은 `synthetic:applicants`, 정합성과 성능 검증은 `verify:synthetic-applicant-scale`을 사용한다.

2026-07-20 로컬 실행 결과는 [applicant-scale-validation-results-20260720.md](./applicant-scale-validation-results-20260720.md)에 기록한다.

## Safety And Cost Gates

| 단계 | 환경 | 외부 비용 | 승인 |
| --- | --- | --- | --- |
| 100명 smoke | disposable local PostgreSQL | 없음 | 불필요 |
| 1,000명 demo scale | disposable local PostgreSQL | 없음 | 불필요 |
| 5,000명 limit scale | disposable local PostgreSQL | 없음 | 불필요 |
| AWS API/RDS 검증 | AWS ECS/RDS/CloudWatch | 사용량에 따라 발생 | 별도 승인 |
| SQS/worker/OpenAI pipeline | AWS와 AI provider | 명시적 비용 발생 | 별도 승인 |

로컬 단계는 `pipeline-count=0`을 고정한다. verifier는 DB read와 `EXPLAIN ANALYZE`만 수행하며 SMTP, S3, SQS, worker, OpenAI client를 사용하지 않는다. AWS 검증 환경이나 실제 pipeline은 이 문서의 로컬 결과만으로 자동 승격하지 않는다.

production API image에서는 TypeScript source가 아니라 build 산출물을 사용한다.

```text
npm run synthetic:applicants:prod -- <arguments>
npm run verify:synthetic-applicant-scale:prod -- <arguments>
```

## Prerequisites

1. #393 목록·집계 migration과 #391 importer migration을 빈 disposable PostgreSQL에 적용한다.
2. 검증 전용 기업과 공고를 준비한다. 기존 개발자 공유 DB와 운영 DB는 사용하지 않는다.
3. 아래 환경변수를 검증 process에만 주입한다.

```powershell
$env:DATABASE_URL = "postgresql://.../disposable_test_database"
$env:SYNTHETIC_APPLICANT_ALLOWED_ENV = "local"
$env:SYNTHETIC_APPLICANT_WRITE_ENABLED = "true"
$env:SYNTHETIC_APPLICANT_INTERACTIVE_PASSWORD = "local-only-392-password1"
```

interactive password와 `DATABASE_URL`은 report에 기록하지 않는다.

## Scale Sequence

각 규모는 `plan -> apply -> 동일 옵션 apply -> verify -> cleanup -> cleaned verify` 순서로 실행한다. 앞 규모가 실패하면 다음 규모를 실행하지 않는다.

### 100명 Smoke

```powershell
npm run synthetic:applicants -- --action=plan --environment=local --company-id=<companyId> --posting-id=<postingId> --dataset-id=issue392-local-100 --active-count=100 --canceled-count=5 --interactive-count=10 --pipeline-count=0 --batch-size=100
npm run synthetic:applicants -- --action=apply --environment=local --company-id=<companyId> --posting-id=<postingId> --dataset-id=issue392-local-100 --active-count=100 --canceled-count=5 --interactive-count=10 --pipeline-count=0 --batch-size=100
npm run verify:synthetic-applicant-scale -- --dataset-id=issue392-local-100 --iterations=20 --output=../../output/issue-392/local-100.json
```

### 1,000명 Demo Scale

```powershell
npm run synthetic:applicants -- --action=apply --environment=local --company-id=<companyId> --posting-id=<postingId> --dataset-id=issue392-local-1000 --active-count=1000 --canceled-count=50 --interactive-count=10 --pipeline-count=0 --batch-size=100
npm run verify:synthetic-applicant-scale -- --dataset-id=issue392-local-1000 --iterations=20 --output=../../output/issue-392/local-1000.json
```

### 5,000명 Limit Scale

```powershell
npm run synthetic:applicants -- --action=apply --environment=local --company-id=<companyId> --posting-id=<postingId> --dataset-id=issue392-local-5000 --active-count=5000 --canceled-count=250 --interactive-count=10 --pipeline-count=0 --batch-size=500
npm run verify:synthetic-applicant-scale -- --dataset-id=issue392-local-5000 --iterations=20 --output=../../output/issue-392/local-5000.json
```

cleanup은 apply와 동일한 옵션으로 action만 변경한다.

```powershell
npm run synthetic:applicants -- --action=cleanup --environment=local --company-id=<companyId> --posting-id=<postingId> --dataset-id=<datasetId> --active-count=<activeCount> --canceled-count=<canceledCount> --interactive-count=10 --pipeline-count=0 --batch-size=<batchSize>
npm run verify:synthetic-applicant-scale -- --dataset-id=<datasetId> --expect=cleaned --output=../../output/issue-392/<datasetId>-cleaned.json
```

## Automated Assertions

- manifest와 `users`, `candidate_profiles`, `applications` 생성 건수 일치
- interactive 계정 정확히 10개, 나머지는 `PENDING + passwordHash/providerUserId null + demo.invalid`
- 취소 이력은 보존되지만 활성 목록과 집계에서 제외
- 상태 분포와 summary count 일치
- 첫·중간·마지막 페이지의 총 건수와 item 수 일치
- limit 100 전체 페이지 순회에서 누락·중복 없음
- dataset 검색과 application/document/interview/report/screening 필터 count 일치
- 허용된 네 가지 정렬의 enum 순서와 application ID tie-break 일치
- PROFILE, INTERVIEW, REPORT 상세 fixture 조회 가능
- 현재 페이지 응답 크기, list+count와 summary p50/p95 기록
- 첫·중간·마지막 페이지 `EXPLAIN ANALYZE, BUFFERS`와 사용 index 기록
- 1,000명 이상에서 `idx_applications_posting_updated_id` 사용 확인
- cleanup 뒤 manifest audit만 남고 domain row는 제거됨

## Stop Before Paid Validation

로컬 5,000명 결과와 PM/A/B/D 리뷰가 끝나면 중단한다. 다음 작업은 별도 승인 후에만 수행한다.

- AWS 검증 공고에 1,000명 dataset apply
- ECS/RDS/CloudWatch 기준 API p50/p95와 query plan 재측정
- SQS/worker/OpenAI pipeline 대상 최대 10명 선정
- 모델, 호출 수, 토큰 상한, 총비용 상한과 중단 조건 확정
