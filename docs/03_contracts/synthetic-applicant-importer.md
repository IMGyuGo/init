# Synthetic Applicant Importer Contract

이 문서는 기존 기업과 공고를 변경하지 않고 지정 공고에 합성 지원자를 생성하는 운영 도구의 계약이다. 전체 Prisma seed와 독립적으로 실행하며 운영에서 `prisma db seed`를 호출하지 않는다.

## Scope And Manifest Version

- 대상은 명시한 `companyId`가 소유한 `postingId` 한 건이다.
- 각 생성 건은 `User + CandidateProfile + Application`을 가진다.
- dataset manifest가 없는 새 `plan/apply`의 기본 버전은 `SYNTHETIC_APPLICANT_MANIFEST_V2`다.
- 기존 dataset은 저장된 manifest version을 따른다. `SYNTHETIC_APPLICANT_MANIFEST_V1` dataset은 기존 옵션과 identity를 유지한 채 plan, partial resume, already-applied 조회, verifier, cleanup을 계속 지원한다.
- V1은 legacy generic 규모와 `.invalid` identity를 보존할 수 있다. V2 새 운영은 공고 36번과 고정 규모 계약을 사용하고, 아래 열 개의 통제된 `init-jungle.cloud` provider subdomain 및 마스킹 전화번호를 사용한다.
- interactive 계정은 정확히 10개이며 `ACTIVE + LOCAL + passwordHash`로 생성한다.
- non-interactive 계정은 `PENDING + LOCAL + providerUserId/passwordHash null`로 생성한다.
- 기존 사용자·후보자·지원서·기업·공고는 update/delete하지 않는다.
- bulk 경로는 SMTP, S3, SQS, worker, OpenAI, OAuth callback을 호출하지 않는다.

## CLI

새 V2 plan 예시는 다음과 같다. `<companyId>`에는 공고 36번을 실제로 소유한 기업 ID를 사람이 확인해 넣는다.

```powershell
npm run synthetic:applicants -- --action=plan --environment=local --company-id=<companyId> --posting-id=36 --dataset-id=posting36-v2-20260721 --active-count=1000 --canceled-count=50 --interactive-count=10 --pipeline-count=0 --batch-size=100
```

| Argument | Default | Parser/generator rule | Operational rule |
| --- | --- | --- | --- |
| `action` | `plan` | `plan`, `apply`, `cleanup` | `plan`은 DB를 변경하지 않는다. 새 V2 고정 계약은 `plan/apply`에 적용하고 cleanup에는 적용하지 않는다. |
| `environment` | 없음 | 비어 있을 수 없다. | `SYNTHETIC_APPLICANT_ALLOWED_ENV` 및 저장 dataset 환경과 정확히 일치해야 한다. |
| `company-id` | 없음 | 1 이상의 정수 | 대상 공고의 실제 `company_id` 및 저장 dataset과 일치해야 한다. |
| `posting-id` | 없음 | 1 이상의 정수 | 새 V2 `plan/apply`는 정확히 `36`이다. 저장된 V1은 기존 공고를 유지한다. cleanup은 저장 dataset의 공고와 일치해야 한다. |
| `dataset-id` | 없음 | 소문자 영숫자로 시작하는 3~64자의 영숫자, `-`, `_` | 동일 ID는 저장 manifest version/options hash 계약을 따른다. |
| `active-count` | `1000` | `100~5,000`; pure generator와 V1 호환 경로는 generic 규모를 지원한다. | 새 V2 `plan/apply`는 정확히 `1000`이다. 저장 V1과 cleanup은 저장 옵션과 일치해야 한다. |
| `canceled-count` | `50` | `0~activeCount` | 새 V2 `plan/apply`는 정확히 `50`이다. 저장 V1과 cleanup은 저장 옵션과 일치해야 한다. |
| `interactive-count` | `10` | 정확히 `10` | 새 V2도 `10`이며 저장 V1/cleanup은 저장 옵션과 일치해야 한다. |
| `pipeline-count` | `0` | `0~10`, `interactive-count` 이하; pure generator/V1은 generic 값을 지원한다. | 새 V2 `plan/apply`는 정확히 `0`이다. 외부 작업이나 application ID 전달을 수행하지 않는다. |
| `batch-size` | `100` | `10~500` | 저장 dataset options hash와 일치해야 하며 각 batch를 독립 transaction으로 처리한다. |

`apply`와 `cleanup`은 `SYNTHETIC_APPLICANT_WRITE_ENABLED=true`가 추가로 필요하다. interactive 비밀번호는 `SYNTHETIC_APPLICANT_INTERACTIVE_PASSWORD`에서만 읽으며 출력·manifest·로그에 저장하지 않는다. production write는 `SYNTHETIC_APPLICANT_PRODUCTION_ACK=ISSUE_393_DEPLOYED_AND_SNAPSHOT_READY`가 없으면 거부한다.

### V2 New-Run Contract

새 V2 service `plan/apply`는 preview 반환, dataset 생성, manifest record 조회, 상태 갱신, batch 생성보다 먼저 다음 값을 검사한다.

```text
postingId = 36
activeCount = 1000
canceledCount = 50
interactiveCount = 10
pipelineSelectionCount = 0
```

pure `buildSyntheticApplicantPlanV2`는 작은 deterministic test와 allocation 검증을 위해 generic으로 유지한다. 이 generic 성질은 새 운영 실행의 고정 계약을 완화하지 않는다. 기존 stored V1만 legacy generic 옵션으로 plan/apply/resume/verifier/cleanup할 수 있다.

## V2 Data Profile

활성 1,000명의 stage 분포는 다음과 같다.

| Stage | Count | Application projection |
| --- | ---: | --- |
| `DOCUMENT_PROCESSING` | 350 | `SUBMITTED`, 문서 추출 진행 |
| `DOCUMENT_REVIEW` | 250 | `IN_REVIEW`, 문서 추출 완료 |
| `INTERVIEW_WAITING` | 180 | `INTERVIEW_WAITING`, 면접 준비 완료 |
| `INTERVIEW_IN_PROGRESS` | 100 | `INTERVIEW_WAITING`, 면접 진행 중 |
| `REPORT_COMPLETED` | 100 | `COMPLETED`, 면접/리포트 완료 |
| `FAILED` | 20 | 문서 실패 상태 |

취소 이력 50건은 별도 `CANCELED` application으로 생성한다. 활성 데이터 깊이는 다음과 같다.

| Data depth | Count |
| --- | ---: |
| `LIGHTWEIGHT` | 800 |
| `PROFILE` | 150 |
| `INTERVIEW` | 40 |
| `REPORT` | 10 |

V2 `REPORT_COMPLETED`는 정확히 100건이다.

- 판정: `PASS 20`, `FAIL 80`, `HOLD 0`
- PASS total score: `80~96`
- FAIL total score: `45~79`
- 완료 리포트 100건 모두 canonical profile score 3행을 가지며 총 300행이다.
- 각 profile weight는 `40/30/30`이고 weighted total은 report total score와 일치한다.

### V1 Data Compatibility

V1은 저장된 active/canceled/pipeline 규모와 deterministic allocation을 그대로 재구성한다. 활성 1,000명인 legacy dataset은 stage/depth 비율이 위 기본 분포와 같을 수 있지만 운영상 고정 규모로 강제하지 않는다. V1 완료 리포트 total score는 모두 `81`이며, canonical profile score 3행은 `REPORT` depth에만 존재한다. 활성 1,000명 기준 `REPORT` depth 10건이므로 profile score는 30행이고, 나머지 완료 리포트는 header만 유지한다.

## Identity And Authentication Isolation

V1과 V2 identity 계약은 다르다.

### Stored V1

- interactive V1 identity는 legacy `example.com` 형식을 유지할 수 있다.
- non-interactive V1 identity는 예약 도메인 `demo.invalid`을 유지할 수 있다.
- V1 identity/options를 V2 형식으로 migration하거나 다시 생성하지 않는다.

### New V2

V2 email domain은 정확히 다음 열 개 중 하나다.

1. `bluepost.init-jungle.cloud`
2. `mailtree.init-jungle.cloud`
3. `inbox24.init-jungle.cloud`
4. `cloudletter.init-jungle.cloud`
5. `poston.init-jungle.cloud`
6. `morningmail.init-jungle.cloud`
7. `dailyinbox.init-jungle.cloud`
8. `quickpost.init-jungle.cloud`
9. `letterbox.init-jungle.cloud`
10. `mymail.init-jungle.cloud`

V2 전화번호는 `010-****-NNNN` 형식으로 저장한다. 통제 domain을 사용하더라도 importer는 outbound SMTP, OAuth 시작/callback, 초대, 비밀번호 재설정 발송을 수행하지 않는다.

### Shared Authentication Rules

- non-interactive 계정은 `PENDING`, `passwordHash=null`, `providerUserId=null`이므로 로컬 로그인이 실패한다.
- password reset send/verify/reset은 `ACTIVE + LOCAL + passwordHash 존재` 계정만 허용한다.
- Google callback은 기존 계정이 `ACTIVE + GOOGLE`이고 provider user ID가 일치할 때만 로그인한다.
- importer는 OAuth provider identity를 만들거나 연결하지 않는다.

## Manifest And Idempotency

- `synthetic_applicant_datasets`는 manifest version, 실행 환경, 대상 기업/공고, 옵션 hash, 상태와 batch 결과를 기록한다.
- `synthetic_applicant_records`는 ordinal과 생성된 user/candidate/application ID를 영속 기록한다.
- record의 생성 ID는 cleanup 뒤에도 audit snapshot으로 남고 FK로 연결하지 않는다.
- 같은 datasetId와 같은 manifest version/options hash의 `APPLIED` 재실행은 생성 없이 기존 결과를 반환한다.
- 같은 datasetId에 다른 옵션을 사용하면 plan/apply/cleanup preview/cleanup을 거부한다.
- `APPLYING`, `PARTIAL`, `FAILED`는 이미 manifest에 기록된 ordinal을 건너뛰고 batch 단위로 재개한다.
- batch는 도메인 row와 manifest record를 같은 transaction에 저장하여 manifest 없는 고아 row를 만들지 않는다.

## Cleanup Recovery

- cleanup은 dataset manifest의 정확한 user/candidate/application ID만 사용한다.
- environment, company, posting, 지원 manifest version, versioned options hash가 실행 인자와 일치해야 한다.
- 이메일 prefix, PK 범위, posting 전체 조건으로 삭제하지 않는다.
- preview와 결과는 삭제 대상 count 및 ordinal 범위만 출력하고 내부 ID sample을 출력하지 않는다.
- V2 cleanup은 fixed new-run success shape `36/1000/50/10/0`을 요구하지 않는다. 과거 오류로 malformed 규모가 저장됐거나 일부 batch만 생성된 `PARTIAL` V2도 저장 manifest/version/options와 일치하면 manifest-owned record만 복구 삭제할 수 있다.
- 생성 이후 결제처럼 importer가 소유하지 않는 FK 데이터가 추가되면 transaction을 실패시키고 dataset을 `PARTIAL`로 남겨 수동 점검한다.
- 성공하면 record의 `cleanedAt`과 dataset의 `CLEANED/cleanedAt`을 저장하며 audit manifest는 삭제하지 않는다.

## CLI Output Privacy

CLI success output은 aggregate evidence만 반환한다.

- 허용: count, first/last ordinal 또는 ordinal range, stage/depth count map, dataset/manifest version, 대상 posting/company metadata, title/status
- 금지: email, name, phone, password, password hash, user ID, candidate ID, application ID, 정확한 검색값, 모든 `*IdSample`
- interactive/pipeline evidence도 count, ordinal range, stage/depth map만 반환한다. `pipeline-count`가 V1 manifest에 존재하더라도 application ID collection을 출력하지 않는다.
- CLI failure output은 입력 exception 내용을 되풀이하지 않는 일반화된 메시지다.

## Verifier Contract

- V1 verifier는 저장 V1 manifest version과 legacy generic options/identity/report 계약을 사용한다.
- V2 verifier는 manifest record를 읽기 전에 저장 dataset이 `posting 36 / active 1000 / canceled 50 / interactive 10 / pipeline 0`인지 검사한다.
- V2 manifest는 ordinal map으로 `isCanceled`, `isInteractive`, `pipelineSelected`, `lifecycleStage`, `dataDepth`를 rebuilt plan과 비교한다.
- V2 stage/depth aggregate는 저장된 malformed 값에서 기대값을 유도하지 않고 이 문서의 fixed count를 직접 검사한다.
- identity aggregate는 interactive 10, non-interactive 1,040, invalid non-interactive 0, identity match 1,050과 열 개 domain allowlist를 확인한다.
- 완료 리포트 100건, `PASS 20 / FAIL 80 / HOLD 0`, score range, profile row 300건을 실제 DB row로 확인한다.
- 실제 company applicant repository를 `updatedAt desc`로 호출한 UI 첫 페이지에서 baseline ID를 제외한 V2 synthetic row에 PASS와 FAIL이 모두 존재하는지 확인한다. plan 배열만 보고 첫 페이지를 추정하지 않는다.
- cleaned 검증은 audit manifest가 남고 manifest가 가리키는 domain row가 모두 제거됐는지 확인한다.

## Operations

- #393 배포와 DB migration 적용을 확인하기 전 production apply를 실행하지 않는다.
- production apply 전 DB snapshot, aggregate-only plan 출력, companyId/postingId 소유 관계를 사람이 재확인한다.
- 새 V2 `pipeline-count`는 `0`으로 고정하며 실제 작업을 발행하거나 application ID를 외부 도구에 전달하지 않는다.
- 저장 V1의 legacy pipeline flag가 존재해도 importer가 mail/S3/SQS/worker/OpenAI/OAuth 작업을 발행하지 않는다.
- importer module은 mail, S3, SQS, worker, OpenAI, OAuth client를 import하지 않는다.
