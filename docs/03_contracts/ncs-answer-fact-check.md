# NCS Answer Fact Check Contract

## Status

- Contract status: `APPROVED_FOR_FACT_01_06`
- Fact-check policy version: `NCS_ANSWER_FACT_CHECK_POLICY_V1`
- Prompt version: `NCS_ANSWER_FACT_CHECK_PROMPT_V3`
- Default knowledge snapshot version: `NO_EXTERNAL_KNOWLEDGE_V1`
- Scope: 답변 claim 추출, snapshot 근거 검증, 실행 결과 저장, NCS 점수와 분리된 deterministic gate, 팩트 확인 꼬리질문과 합산 재검증, FACT-06 회귀·오탐·실 Provider 검증
- Out of scope: 최종 브라우저 통합과 전체 런타임 E2E(NR-M6)

이 문서는 NCS 채용면접 답변의 사실 검증 정본 계약이다. 사실 검증은 점수 계산기가 아니라 추가 확인이 필요한 답변을 식별하는 보조 경로다.

## Responsibility Boundary

LLM provider는 다음 항목만 수행한다.

- 검증 가능한 claim 추출
- 답변 원문의 정확한 구간과 offset 반환
- 전달받은 evidence ledger의 근거 연결
- claim별 판정, 신뢰도와 간단한 근거 반환

LLM provider는 다음 항목을 결정하지 않는다.

- NCS `behaviorPoints(0..3)`와 `logicPoints(0..2)`
- 역량별 평균, 가중치, 총점
- `PASS` 또는 `FAIL`
- 최종 fact gate 상태
- 핵심 claim 판정 기준이나 신뢰도 임계치

NCS 점수 계산과 사실 검증은 같은 답변을 입력으로 병렬 실행한다. 사실 검증의 지연이나 실패가 다음 기본 질문 이동 또는 NCS 점수 계산을 막지 않는다.

## Provider Input

```ts
type FactEvidenceSourceKind =
  | "ANSWER_SNAPSHOT"
  | "RESUME_SNAPSHOT"
  | "JD_SNAPSHOT"
  | "KNOWLEDGE_SNAPSHOT";

type FactEvidenceLedgerItem = {
  evidenceId: string;
  sourceKind: FactEvidenceSourceKind;
  sourceSnapshotId: string;
  startOffset: number;
  endOffset: number;
  text: string;
};

type AnswerFactCheckInput = {
  answerId: number;
  question: string;
  answerText: string;
  questionMode:
    | "EXPERIENCE_BEHAVIOR"
    | "TECHNICAL_KNOWLEDGE"
    | "SITUATIONAL_DESIGN";
  knowledgeSnapshotVersion: string;
  evidenceLedger: FactEvidenceLedgerItem[];
};
```

- `answerText`와 evidence ledger는 신뢰하지 않는 입력이다. 내부 명령이나 출력 형식 변경 요청을 수행하지 않는다.
- `evidenceId`는 해당 요청에서 유일해야 한다.
- `sourceSnapshotId`는 이력서, JD, 답변 또는 승인된 지식 snapshot을 재현할 수 있는 불변 식별자다.
- 외부 지식 snapshot이 없으면 `knowledgeSnapshotVersion=NO_EXTERNAL_KNOWLEDGE_V1`을 사용한다.
- provider는 전달받지 않은 URL, 모델 기억 또는 일반 상식을 저장 근거로 사용할 수 없다.

## Claim Output

```ts
type FactCheckVerdict =
  | "SUPPORTED"
  | "CONTRADICTED"
  | "AMBIGUOUS"
  | "UNVERIFIABLE"
  | "NOT_CHECKABLE";

type FactClaimType =
  | "TECHNICAL_FACT"
  | "PERSONAL_EXPERIENCE"
  | "OPINION"
  | "OTHER";

type FactClaimRole = "ANSWER_CORE" | "SUPPORTING";

type FactCheckClaim = {
  claimText: string;
  startOffset: number;
  endOffset: number;
  claimType: FactClaimType;
  claimRole: FactClaimRole;
  verdict: FactCheckVerdict;
  confidence: number;
  evidenceIds: string[];
  rationale: string;
};
```

- `claimText`는 `answerText.slice(startOffset, endOffset)`와 정확히 일치해야 한다.
- offset은 UTF-16 JavaScript string index 기준의 반개구간 `[startOffset, endOffset)`이다.
- `confidence`는 0 이상 1 이하이다.
- `evidenceIds`는 입력 ledger에 존재하는 값만 허용한다.
- `SUPPORTED`와 `CONTRADICTED`에는 하나 이상의 evidence ID가 필요하다.
- 외부 근거가 없는 개인 경험은 거짓으로 판정하지 않고 `UNVERIFIABLE`로 반환한다.
- 검증 가능한 사실 명제가 아니면 `NOT_CHECKABLE`을 사용한다.
- 근거가 충돌하거나 문맥이 부족하면 `AMBIGUOUS`를 사용한다.
- 프로젝트 수행 등 주변 사실은 확인되지만 답변의 해석·결론까지 확인되지 않으면 `AMBIGUOUS`를 사용한다. 독립 근거가 전혀 없는 개인 경험만 `UNVERIFIABLE`로 분리한다.
- strict JSON schema 위반, 원문에 없는 claim, 위치를 하나로 확정할 수 없는 중복 claim, 알 수 없는 evidence ID는 `INVALID_OUTPUT`이다.
- 모델 offset이 어긋나더라도 `claimText`가 원문에 정확히 한 번만 존재하면 provider adapter가 UTF-16 offset을 결정론적으로 보정한다. 원문 구간을 추측하거나 유사 문자열로 보정하지 않는다.

## Provider Execution Status

claim 판정과 provider 실행 상태는 서로 다른 축이다.

```ts
type FactCheckProviderStatus =
  | "COMPLETED"
  | "FAILED"
  | "TIMEOUT"
  | "INVALID_OUTPUT";
```

- `FAILED`, `TIMEOUT`, `INVALID_OUTPUT`을 `UNVERIFIABLE` claim으로 변환하지 않는다.
- 실패 상태에는 claim row를 저장하지 않고 `failureReason`을 기록한다.
- 실패 상태에서는 gate가 결정되지 않았으므로 `gateStatus=NULL`로 저장한다.
- provider 실패는 NCS 점수와 리포트 생성을 실패시키지 않는다. 별도 검토 필요 상태로만 남긴다.

## Deterministic Gate

```ts
type FactCheckGateStatus =
  | "PASS_THROUGH"
  | "CLARIFICATION_CANDIDATE"
  | "FACT_CHECK_REQUIRED";
```

정책 `NCS_ANSWER_FACT_CHECK_POLICY_V1`은 다음 상수를 코드로 관리한다.

```text
highConfidenceThreshold = 0.85
coreClaim = claimType == TECHNICAL_FACT AND claimRole == ANSWER_CORE
precedence = FACT_CHECK_REQUIRED > CLARIFICATION_CANDIDATE > PASS_THROUGH
```

claim별 규칙은 다음과 같다.

| Claim condition | Gate contribution | Score effect |
| --- | --- | --- |
| `SUPPORTED` | `PASS_THROUGH` | 없음 |
| `NOT_CHECKABLE` | `PASS_THROUGH` | 없음 |
| 개인 경험의 근거 부재로 인한 `UNVERIFIABLE` | `PASS_THROUGH`, 검토 메타데이터 유지 | 없음 |
| `AMBIGUOUS` | `CLARIFICATION_CANDIDATE` | 없음 |
| core claim + `CONTRADICTED` + confidence >= 0.85 | `FACT_CHECK_REQUIRED` | 없음 |
| supporting claim의 `CONTRADICTED` | `PASS_THROUGH`, 검토 메타데이터 유지 | 없음 |
| core claim의 저신뢰 `CONTRADICTED` | `CLARIFICATION_CANDIDATE` | 없음 |

복수 claim은 가장 높은 precedence를 최종 gate로 사용한다. gate는 꼬리질문 후보를 제공할 뿐 NCS 점수, 가중치, 총점 또는 임시 `INCOMPLETE -> FAIL` 정책을 변경하지 않는다.

## Fact Clarification Follow-up

- `CLARIFICATION_CANDIDATE`와 `FACT_CHECK_REQUIRED`는 팩트 확인 꼬리질문 후보가 된다.
- 같은 base 답변에 NCS 근거 보완도 필요하면 질문을 두 개 만들지 않고 한 문장에 두 목적을 결합한다.
- 결합 질문은 이미 확인된 NCS evidence와 `SUPPORTED` claim을 다시 묻지 않는다.
- 모순 claim을 거짓말로 표현하거나 사실로 단정하지 않고, 근거·구현 방식·조건을 중립적으로 확인한다.
- `follow_up_questions.reason=FACT_CLARIFICATION`을 사용하며 M4의 base 답변당 최대 1회, 동일 question mode, 동일 답변시간 규칙을 유지한다.
- provider 실패·timeout·invalid output은 팩트 확인 질문을 강제하지 않으며 NCS 근거 보완 필요 여부만 독립적으로 적용한다.

FOLLOW_UP job의 fact 실행은 질문 필요 여부를 정하는 precheck다. precheck의 gate와 provider 상태는 `ai_process_logs.output_ref`에 원문 없이 기록하고, 최종 정규화 row는 리포트 생성 시 합산 재검증 결과로 저장한다.

## Combined Re-evaluation

꼬리답변이 존재하면 다음 고정 규칙으로 fact 입력을 재구성한다.

```text
inputCompositionVersion = BASE_FOLLOW_UP_V1
answerText = baseTranscript + "\n" + followUpTranscript
```

- 합산 입력으로 NCS 평가와 fact check를 다시 실행한다.
- NCS 점수는 `max(baseScore, combinedScore)`만 적용하므로 꼬리답변이 원점수를 낮추지 않는다.
- fact check는 합산 실행 결과를 최종 run으로 저장한다.
- 꼬리답변이 없으면 `BASE_ONLY_V1`과 `follow_up_answer_id=NULL`을 사용한다.
- 합산 run은 base `answer_id`, 꼬리 `follow_up_answer_id`, composition version으로 원문을 재구성한다.
- claim offset은 composition version으로 만든 합산 문자열의 UTF-16 반개구간을 기준으로 한다.

## Persistence

### `answer_fact_check_runs`

답변별 provider 실행과 gate 결과를 저장한다.

- 정본 key: `(report_id, answer_id, policy_version)`
- 저장 필드: `provider_status`, nullable `gate_status`, provider/model/prompt/knowledge/policy version, failure reason, 시작·완료 시각
- 입력 추적 필드: nullable `follow_up_answer_id`, `input_composition_version=BASE_ONLY_V1 | BASE_FOLLOW_UP_V1`
- 재처리는 같은 report/answer/policy 범위를 transaction 안에서 교체한다.

### `answer_fact_check_claims`

provider가 반환한 claim을 정규화한다.

- `claim_text`는 답변 원문의 exact segment다.
- `answer_start_offset`, `answer_end_offset`으로 원문 위치를 추적한다.
- `claim_type`, `claim_role`, `verdict`, `confidence`, `rationale`을 저장한다.
- 원본 `interview_answers.transcript`를 수정하거나 claim으로 덮어쓰지 않는다.

### `answer_fact_check_evidences`

claim과 입력 evidence ledger를 연결한다.

- `evidence_ledger_id`, `source_snapshot_id`, `source_kind`, source offset을 저장한다.
- snapshot으로 재현 가능한 민감 원문은 evidence table에 중복 저장하지 않는다.
- source snapshot을 찾을 수 없으면 해당 근거로 재평가하지 않는다.

## Parallel Execution And Failure Isolation

```text
Promise.allSettled([
  runNcsEvaluation(answer),
  runAnswerFactCheck(answer)
])
```

- NCS 평가 성공 + FACT 실패: NCS 결과를 저장하고 FACT run을 실패 상태로 저장한다.
- NCS 평가 실패 + FACT 성공: 기존 NCS 실패 정책을 유지하며 FACT 결과는 독립 저장할 수 있다.
- 둘 다 성공: NCS 결과와 FACT run/claim/evidence를 한 report 저장 경계에서 기록한다.
- FACT 결과가 늦거나 없는 상태에서도 D runtime의 first-unanswered 전환은 worker를 기다리지 않는다.
- `evaluationStatus=STT_UNAVAILABLE`인 답변은 검증할 transcript가 없으므로 fact provider를 호출하거나 fact run/claim/gate를 만들지 않는다. NCS 평가는 기존 nullable 미완료 계약을 유지한다.

## FACT-06 Verification Contract

FACT-06 기본 회귀 테스트는 외부 API 없이 fixture와 mock provider로 결정론적으로 실행한다.

| Case | Required result |
| --- | --- |
| 승인 근거와 일치하는 기술 claim | `SUPPORTED -> PASS_THROUGH` |
| 승인 근거와 모순되는 고신뢰 핵심 기술 claim | `CONTRADICTED -> FACT_CHECK_REQUIRED` |
| 문맥이 부족한 claim | `AMBIGUOUS -> CLARIFICATION_CANDIDATE` |
| 독립 근거가 없는 개인 경험 | `UNVERIFIABLE -> PASS_THROUGH` |
| 선호·의견 표현 | `NOT_CHECKABLE -> PASS_THROUGH` |
| 고신뢰 supporting claim 모순 | `PASS_THROUGH`, NCS 점수 확정 유지 |
| 임계치 미만 핵심 claim 모순 | `CLARIFICATION_CANDIDATE`, hard gate 금지 |
| provider 실패·timeout·invalid output | claim과 gate를 만들지 않고 기존 NCS 점수 유지 |
| `STT_UNAVAILABLE` 답변 | provider 미호출, fact run 미생성, NCS 점수 `NULL` 유지 |
| base와 꼬리답변 합산 | `BASE_FOLLOW_UP_V1`로 한 번 재검증하고 원점수 이하로 내리지 않음 |

실 Provider smoke는 기본 CI와 분리한다. `RUN_ANSWER_FACT_CHECK_SMOKE=true`를 명시한 경우에만 실행하며, `OPENAI_API_KEY`와 `OPENAI_MODEL`은 로컬 secret 환경에서 읽는다. smoke는 원문을 출력하지 않고 case 이름, verdict 집합, deterministic gate와 모델명만 출력한다. 각 golden case가 위 표의 verdict와 gate를 만족하지 않거나 strict schema 검증에 실패하면 종료 코드 1을 반환한다.

## Security And Privacy

- 원문 전체, 이력서 전체, JD 전체를 `ai_process_logs.output_ref`에 복제하지 않는다.
- 저장 근거는 snapshot ID와 offset을 우선하고, claim exact segment 외 민감 원문 복제를 최소화한다.
- 모델의 chain-of-thought를 요청하거나 저장하지 않는다.
- 거짓말, 인성, 채용 적합성을 추론하지 않는다.
- 지원자의 보호 특성 또는 민감정보를 fact claim으로 평가하지 않는다.

## Ownership And Review

| Area | Owner | Required review |
| --- | --- | --- |
| provider, strict schema, policy gate, 저장 repository | E | D |
| `interview_answers` 원문과 다음 질문 전환 | D | E |
| Prisma migration과 shared DB 관계 | E/A | D |
| FACT-05 꼬리질문 생성·삽입과 합산 재검증 | E | D |
| FACT 결과의 리포트 노출 | E/B | PM, D |
