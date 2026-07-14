# NCS Multi-profile Binding Implementation Plan

## Purpose

질문 하나가 NCS profile 1~2개를 평가하는 최종 flow를 기존 단일 `ncs_profile_id` 구조에 안전하게 도입하기 위한 구현 문서다. 정본은 `docs/03_contracts/ncs-final-evaluation.md`이며 NE-M1부터 Prisma schema와 forward-only migration에 순차 반영한다.

## Weight UI Placement Options

### Option A. 평가 기준 표의 배점을 가중치로 사용 (Recommended)

- 위치: 면접 설정 1단계 `평가 기준` 표의 기존 `배점` 열
- NCS 모드에서는 열 이름을 `가중치`로 변경하고 `%` 단위를 표시한다.
- 세 고정 row의 기본값은 `JOB_TECHNICAL=30`, `COLLABORATION_COMMUNICATION=30`, `PROBLEM_SOLVING=40`이다.
- 표 상단 우측의 기존 `배점 합계` badge를 `가중치 합계 100%`로 변경한다.
- NCS 모드의 `합격점` 열은 입력을 제거하고 `최소 3/5`를 읽기 전용으로 표시한다.
- 총점 기준 `80/100`은 합계 badge 인접 영역에 읽기 전용으로 표시한다.
- 저장은 기존 `API-036 PATCH /company/interviews/evaluation-criteria`의 `criteria[].weight`를 그대로 사용한다.

장점은 현재 데이터 계약과 저장 흐름을 재사용하고, 면접관이 역량명과 가중치를 같은 행에서 바로 비교할 수 있다는 점이다. 별도 설정 UI와 중복 상태가 생기지 않는다.

### Option B. 평가 기준 표 위의 가중치 요약 band

- 위치: 평가 체계 selector 아래, 평가 기준 표 위
- 세 profile을 가로 3열로 배치하고 각 열에 숫자 input 또는 stepper를 둔다.
- 합계와 총점·역량별 최소 기준을 band 우측에 표시한다.
- 아래 평가 기준 표의 배점 열은 읽기 전용으로 바꾸거나 제거한다.

가중치가 눈에 잘 띄지만 같은 값을 요약 band와 criteria row가 함께 소유하면 동기화가 필요하다. 모바일에서는 3열을 세로로 재배치해야 한다.

### Option C. `가중치 설정` dialog

- 위치: 평가 기준 panel 우측 상단 toolbar
- 버튼을 누르면 3개 profile weight와 합계, 초기화 명령을 dialog에서 편집한다.
- 표에는 현재 비율만 읽기 전용으로 표시한다.

기본 화면은 간결하지만 핵심 합격 정책이 숨겨지고, 저장 전 dialog 상태와 criteria draft 상태를 함께 관리해야 한다. 설정을 자주 수정하는 현재 workflow에는 우선순위가 낮다.

## Recommended UI Contract

Option A를 기준으로 한다.

1. `evaluationFramework=NCS_3_PROFILE_V1`을 선택하면 서버가 세 기준을 30/30/40으로 초기화한다.
2. 면접관은 각 row의 weight를 1~100 정수로 수정할 수 있다.
3. 저장 조건은 profile 3개, 각 profile 1개, 합계 정확히 100이다.
4. 합계가 100이 아니면 `평가 기준 저장`과 다음 단계 이동을 차단한다.
5. NCS 최소 기준은 profile별 `3/5`, 총점 `80/100`으로 읽기 전용 표시한다.
6. 진행 중인 세션은 criteria/version snapshot을 유지하고 이후 변경을 소급하지 않는다.
7. LEGACY 모드는 기존 `배점`, `합격점` UI와 검증을 유지한다.

## Current Structural Gap

| Stage | Current canonical field | Gap |
| --- | --- | --- |
| 공통 질문 | `question_bank.ncs_profile_id` | 두 profile 저장 불가 |
| 개인화 질문 | `application_interview_questions.ncs_profile_id` | 두 profile 저장 불가 |
| 세션 snapshot | `interview_session_questions.ncs_profile_id` | 응시 시점 binding 2개 보존 불가 |
| evaluator adapter | `profileIds: [snapshot.ncsProfileId]` | evaluator 다중 profile 입력을 단일 값으로 제한 |
| 평가 저장 | unique `(report_id, answer_id)` | 답변·profile별 row 두 개 저장 불가 |

## Proposed Relational Models

모델명은 migration 구현 전 A/E/D와 최종 확인한다. 질문 유형은 질문 하나당 하나이므로 기존 parent row의 `ncsQuestionMode`를 유지하고, profile별 alignment와 criterion snapshot만 binding row로 분리한다.

```prisma
model QuestionNcsBinding {
  questionId         BigInt
  criterionId        BigInt
  ncsProfileId       String   @db.VarChar(50)
  ncsProfileVersion  String   @db.VarChar(80)
  alignmentStatus    String   @db.VarChar(40)
  alignmentScore     Decimal? @db.Decimal(8, 6)
  alignmentReason    String?
  evaluatorVersion   String?  @db.VarChar(80)
  bindingOrder       Int
  question           Question @relation(fields: [questionId], references: [questionId], onDelete: Cascade)
  criterion          EvaluationCriterion @relation(fields: [criterionId], references: [criterionId], onDelete: Restrict)

  @@id([questionId, ncsProfileId])
  @@unique([questionId, bindingOrder])
  @@index([criterionId])
  @@map("question_ncs_bindings")
}

model ApplicationQuestionNcsBinding {
  personalizedQuestionId BigInt
  criterionId             BigInt?
  ncsProfileId            String   @db.VarChar(50)
  ncsProfileVersion       String   @db.VarChar(80)
  alignmentStatus         String   @db.VarChar(40)
  alignmentScore          Decimal? @db.Decimal(8, 6)
  alignmentReason         String?
  evaluatorVersion        String?  @db.VarChar(80)
  bindingOrder            Int
  personalizedQuestion    ApplicationInterviewQuestion @relation(fields: [personalizedQuestionId], references: [personalizedQuestionId], onDelete: Cascade)
  criterion               EvaluationCriterion? @relation(fields: [criterionId], references: [criterionId], onDelete: SetNull)

  @@id([personalizedQuestionId, ncsProfileId])
  @@unique([personalizedQuestionId, bindingOrder])
  @@index([criterionId])
  @@map("application_question_ncs_bindings")
}

model SessionQuestionNcsBinding {
  sessionQuestionId       BigInt
  criterionId             BigInt?
  criterionTitleSnapshot  String  @db.VarChar(200)
  ncsProfileId            String  @db.VarChar(50)
  ncsProfileVersion       String  @db.VarChar(80)
  alignmentStatus         String  @db.VarChar(40)
  alignmentScore          Decimal? @db.Decimal(8, 6)
  alignmentReason         String?
  evaluatorVersion        String? @db.VarChar(80)
  bindingOrder            Int
  sessionQuestion         InterviewSessionQuestion @relation(fields: [sessionQuestionId], references: [sessionQuestionId], onDelete: Cascade)
  criterion               EvaluationCriterion? @relation(fields: [criterionId], references: [criterionId], onDelete: SetNull)

  @@id([sessionQuestionId, ncsProfileId])
  @@unique([sessionQuestionId, bindingOrder])
  @@index([criterionId])
  @@map("session_question_ncs_bindings")
}
```

profile 최대 2개 규칙은 PostgreSQL row count check로 표현하기 어렵다. C 생성·수정 서비스, D session snapshot transaction, E worker input parser 세 경계에서 `bindings.length`를 1~2로 검증하고 DB에서는 `bindingOrder IN (1, 2)` check와 unique key를 둔다.

## Evaluation Persistence

`ncs_answer_evaluations`는 base answer와 profile 한 쌍당 한 row를 저장한다.

```text
unique(report_id, answer_id, ncs_profile_id)
behavior_points   integer nullable, 0..3
logic_points      integer nullable, 0..2
base_score        integer nullable, 0..5
effective_score   integer nullable, 0..5
follow_up_applied boolean not null default false
```

기존 `competency_score`, `evidence_score`, `total_score`는 호환 기간에 유지하되 신규 0~5 집계에는 사용하지 않는다. 신규 evaluator가 반환하는 exact evidence는 평가 row의 `result_json`에도 보존하고, 출처 추적이 필요한 정본 evidence는 아래 관계로 분리한다.

```prisma
model NcsAnswerEvaluationEvidence {
  evidenceId       BigInt @id @default(autoincrement())
  ncsEvaluationId  BigInt
  sourceAnswerId   BigInt
  sourceKind       String @db.VarChar(20) // BASE | FOLLOW_UP
  quote            String
  sortOrder        Int
  evaluation       NcsAnswerEvaluation @relation(fields: [ncsEvaluationId], references: [ncsEvaluationId], onDelete: Cascade)
  sourceAnswer     InterviewAnswer @relation(fields: [sourceAnswerId], references: [answerId], onDelete: Cascade)

  @@unique([ncsEvaluationId, sourceAnswerId, sortOrder])
  @@index([sourceAnswerId])
  @@map("ncs_answer_evaluation_evidences")
}
```

실제 Prisma 반영 시 parent model에도 대응 relation array를 추가한다. session binding의 `criterionId`는 원본 기준 삭제 이후에도 profile/version/title snapshot을 보존하도록 nullable과 `onDelete: SetNull`을 사용한다.

## API Compatibility Shape

신규 정본 field는 `ncsBindings[]`다.

```ts
type NcsBinding = {
  criterionId: number;
  criterionTitle: string;
  ncsProfileId: NcsProfileId;
  ncsProfileVersion: string;
  alignmentStatus: QuestionAlignmentStatus;
  alignmentScore: number | null;
  alignmentReason: string | null;
  evaluatorVersion: string | null;
};

type NcsQuestionProjection = {
  ncsQuestionMode: NcsQuestionMode;
  ncsBindings: NcsBinding[]; // length 1..2
  ncsProfileId?: NcsProfileId | null; // deprecated migration field
};
```

변경 대상 projection:

- API-034 면접 설정 조회
- API-037 질문 생성·수정 응답
- API-038 공통 질문 생성 결과
- API-097 질문 생성 정책 allocation
- API-098 개인화 질문 조회
- API-065 세션 생성 내부 snapshot
- API-066/067 지원자 면접 질문 runtime
- API-043/REPORT_GENERATE NCS evaluator input/output
- 기업 평가 상세의 답변별 profile 점수

## Forward-only Migration Sequence

### Phase 1. Expand

1. 세 binding table과 evidence table을 추가한다.
2. `ncs_answer_evaluations`에 신규 점수 field를 nullable로 추가한다.
3. 기존 `(report_id, answer_id)` unique를 `(report_id, answer_id, ncs_profile_id)`로 교체한다.
4. 기존 singular field가 있는 row마다 `bindingOrder=1` binding을 backfill한다.
5. backfill row count와 orphan criterion을 검증한다.

### Phase 2. Compatibility

1. repository read는 `bindings` 우선, 없으면 singular field fallback으로 한다.
2. 신규·수정 write는 binding과 singular 첫 profile을 함께 기록한다.
3. API는 `ncsBindings[]`와 deprecated `ncsProfileId`를 함께 응답한다.
4. session snapshot은 source binding 1~2개를 같은 transaction에서 복사한다.

### Phase 3. Runtime Switch

1. E adapter가 `profileIds: bindings.map(...)`를 전달한다.
2. output competency를 profile별 평가 row로 분해해 저장한다.
3. profile별 평균과 30/30/40 weight 집계를 deterministic 함수로 전환한다.
4. 공통·개인화 질문을 동일하게 scoring에 포함한다.
5. D runtime과 기업 평가 상세가 `ncsBindings[]`를 사용하도록 전환한다.

### Phase 4. Contract

1. 회귀 테스트와 운영 데이터 검증 후 singular field write를 중단한다.
2. 한 release 이상 compatibility read를 유지한다.
3. 별도 migration에서 singular `ncs_profile_id`, question-level `criterion_id` 의존을 제거한다.

## Required Tests

- 공통 질문 하나에 profile 1개와 2개 저장
- 개인화 질문 하나에 profile 2개 저장
- profile 0개 또는 3개 요청 차단
- 같은 profile 중복 binding 차단
- 기존 singular row를 binding 하나로 backfill
- 세션 생성 후 원본 질문 binding 변경 시 snapshot 불변
- 답변 하나에서 profile별 평가 row 두 개 저장
- 한 profile이 `INSUFFICIENT_INPUT`이면 0점으로 평균에 포함하지 않음
- 공통·개인화 질문 모두 profile 평균에 포함
- 질문 하나의 두 profile 점수를 총점에 직접 중복 가산하지 않음
- migration compatibility 응답의 singular field가 첫 binding과 일치

## Ownership And Review

| Area | Owner | Required review |
| --- | --- | --- |
| criteria weight UI, question authoring binding | C | PM, E |
| Prisma migration, shared DTO/enums | A | C, D, E |
| session binding snapshot, runtime answer linkage | D | C, E |
| evaluator adapter, profile별 평가 저장·집계 | E | C, D |
| threshold 및 화면 정책 | PM | A, B, C, D, E |

구현 시작 gate는 팀원 evaluator의 profile output cardinality와 behavior/logic field 이름 확정, 그리고 `R-E-06`, `R-E-07`, `R-D-04` 승인이다.
