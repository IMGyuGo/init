# Synthetic Applicant Importer Contract

이 문서는 기존 기업과 공고를 변경하지 않고 지정 공고에 대규모 합성 지원자를 생성하는 운영 도구의 계약이다. 전체 Prisma seed와 독립적으로 실행하며 운영에서 `prisma db seed`를 호출하지 않는다.

## Scope

- 대상은 명시한 `companyId`가 소유한 `postingId` 한 건이다.
- 각 생성 건은 `User + CandidateProfile + Application`을 가진다.
- interactive 계정은 정확히 10개이며 `ACTIVE + LOCAL + passwordHash`로 생성한다.
- 나머지는 `PENDING + LOCAL + providerUserId/passwordHash null`과 `demo.invalid` 이메일을 사용한다.
- 기존 사용자·후보자·지원서·기업·공고는 update/delete하지 않는다.
- bulk 기본 경로는 SMTP, S3, SQS, worker, OpenAI를 호출하지 않는다.

## CLI

```powershell
npm run synthetic:applicants -- --action=plan --environment=local --company-id=1 --posting-id=1 --dataset-id=demo-20260720 --active-count=1000 --canceled-count=50 --interactive-count=10 --pipeline-count=0 --batch-size=100
```

| Argument | Default | Rule |
| --- | --- | --- |
| `action` | `plan` | `plan`, `apply`, `cleanup`. `plan`은 DB를 변경하지 않는다. |
| `environment` | 없음 | `SYNTHETIC_APPLICANT_ALLOWED_ENV`와 정확히 일치해야 한다. |
| `company-id` | 없음 | 대상 공고의 실제 `company_id`와 일치해야 한다. |
| `posting-id` | 없음 | 기존 공고 한 건만 허용한다. |
| `dataset-id` | 없음 | 소문자 영숫자로 시작하는 3~64자의 영숫자, `-`, `_`만 허용한다. |
| `active-count` | `1000` | 100~5,000. 공식 검증 규모는 100/1,000/5,000이다. |
| `canceled-count` | `50` | 0~activeCount. 활성 목록과 별도 취소 이력이다. |
| `interactive-count` | `10` | 정확히 10으로 고정한다. |
| `pipeline-count` | `0` | 0~10. 실제 외부 작업을 발행하지 않고 별도 승인 대상 application ID만 manifest에 표시한다. |
| `batch-size` | `100` | 10~500. 각 batch를 독립 transaction으로 저장한다. |

`apply`와 `cleanup`은 `SYNTHETIC_APPLICANT_WRITE_ENABLED=true`가 추가로 필요하다. interactive 비밀번호는 `SYNTHETIC_APPLICANT_INTERACTIVE_PASSWORD`에서만 읽으며 출력·manifest·로그에 저장하지 않는다. production write는 `SYNTHETIC_APPLICANT_PRODUCTION_ACK=ISSUE_393_DEPLOYED_AND_SNAPSHOT_READY`가 없으면 거부한다.

## Data Profile

1,000명 활성 기준 상태 분포는 다음과 같고 다른 규모는 같은 비율로 deterministic allocation한다.

| Stage | Count | Application projection |
| --- | ---: | --- |
| `DOCUMENT_PROCESSING` | 350 | `SUBMITTED`, 문서 제출/추출 진행 |
| `DOCUMENT_REVIEW` | 250 | `IN_REVIEW`, 문서 추출 완료 |
| `INTERVIEW_WAITING` | 180 | `INTERVIEW_WAITING`, 면접 준비 완료 |
| `INTERVIEW_IN_PROGRESS` | 100 | `INTERVIEW_WAITING`, 면접 진행 중 |
| `REPORT_COMPLETED` | 100 | `COMPLETED`, 면접/리포트 완료 |
| `FAILED` | 20 | 문서·면접·리포트 실패를 순환 배치 |

취소 이력 50건은 별도 `CANCELED` application으로 생성한다. 데이터 깊이는 활성 1,000명 기준 `LIGHTWEIGHT 800`, `PROFILE 150`, `INTERVIEW 40`, `REPORT 10`을 사용한다. `REPORT_COMPLETED` 100건에는 경량 report header를 만들고 `REPORT` 깊이 10건에만 질문·답변·canonical profile score를 완성한다.

## Manifest And Idempotency

- `synthetic_applicant_datasets`는 실행 환경, 대상 기업/공고, 옵션 hash, 상태와 batch 결과를 기록한다.
- `synthetic_applicant_records`는 ordinal과 생성된 user/candidate/application ID를 영속 기록한다.
- record의 생성 ID는 cleanup 뒤에도 audit snapshot으로 남고 FK로 연결하지 않는다.
- 같은 datasetId와 같은 options hash의 `APPLIED` 재실행은 생성 없이 기존 결과를 반환한다.
- 같은 datasetId에 다른 옵션을 사용하면 거부한다.
- `APPLYING`, `PARTIAL`, `FAILED`는 이미 manifest에 기록된 ordinal을 건너뛰고 batch 단위로 재개한다.
- batch는 도메인 row와 manifest record를 같은 transaction에 저장하여 manifest 없는 고아 row를 만들지 않는다.

## Cleanup

- cleanup은 dataset manifest의 정확한 user/candidate/application ID만 사용한다.
- 실행 전에 active/canceled/interactive와 생성 ID 수를 출력한다.
- 이메일 prefix, PK 범위, posting 전체 조건으로 삭제하지 않는다.
- 생성 이후 결제처럼 importer가 소유하지 않는 FK 데이터가 추가되면 transaction을 실패시키고 dataset을 `PARTIAL`로 남겨 수동 점검한다.
- 성공하면 record의 `cleanedAt`과 dataset의 `CLEANED/cleanedAt`을 저장하며 audit manifest는 삭제하지 않는다.

## Authentication Isolation

- non-interactive 계정은 `PENDING`, `passwordHash=null`, `providerUserId=null`이므로 로컬 로그인이 실패한다.
- password reset send/verify/reset은 `ACTIVE + LOCAL + passwordHash 존재` 계정만 허용한다.
- Google callback은 기존 계정이 `ACTIVE + GOOGLE`이고 provider user ID가 일치할 때만 로그인한다.
- non-interactive 계정은 `.invalid` 예약 도메인을 사용하므로 실제 SMTP/OAuth 주체가 될 수 없다.

## Operations

- #393 배포와 DB migration 적용을 확인하기 전 production apply를 실행하지 않는다.
- production apply 전 DB snapshot, plan 출력, companyId/postingId 소유 관계를 사람이 재확인한다.
- `pipeline-count`는 실제 작업을 발행하지 않는다. 선택된 최대 10개 application ID를 별도 승인된 pipeline 검증 도구에 전달한다.
- importer module은 mail, S3, SQS, worker, OpenAI client를 import하지 않는다.
