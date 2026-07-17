# NCS Evaluator Team Flow Integration Notes

## Status

- Source: 2026-07-14 팀원 최종 공유 `NCS 기반 AI 면접 평가 방식`
- Purpose: 현재 M1~M6 구현과 팀원 evaluator를 결합하기 위한 확정 flow 및 차이 분석
- Contract status: `SUPERSEDED_BY_CANONICAL_CONTRACT`

이 문서는 제품 flow 비교 이력을 보존한다. 확정 계약은 [`docs/03_contracts/ncs-final-evaluation.md`](../03_contracts/ncs-final-evaluation.md)를 따른다.

다중 profile 관계의 migration과 API compatibility 구현 순서는 [`ncs-multi-profile-binding-implementation-plan.md`](./ncs-multi-profile-binding-implementation-plan.md)에서 관리한다.

## Final Flow

1. 면접관은 NCS 3개 역량의 weight 합계를 100으로 설정한다.
2. 기본값은 기술·직무 30, 협업·의사소통 30, 문제 해결력 40이며 면접관이 공고별로 수정할 수 있다.
3. 같은 공고의 지원자는 동일한 공통 기본 질문 세트를 받는다.
4. 질문 하나는 NCS 역량 1~2개와 질문 유형 하나에 연결된다.
5. 각 역량은 공통 기본 질문에서 최소 2문항으로 평가한다.
6. 질문 유형은 점수 weight가 아니라 답변의 논리 구조를 결정한다.
7. 질문·역량별 점수는 NCS 행동 포인트 0~3과 논리 구조 0~2를 합한 0~5다.
8. 질문·역량별 점수가 5 미만이면 해당 세션의 답변 시간과 동일한 제한 시간 안에서 같은 질문 유형의 꼬리질문을 최대 1회 제공한다.
9. 꼬리질문은 이미 확인된 내용을 다시 묻지 않고 부족한 행동 포인트와 논리 연결만 보강한다.
10. 원답과 꼬리답변 근거를 함께 재평가하되 보강 후 점수는 원점수보다 낮아지지 않고 5를 넘지 않는다.
11. 공통 기본 질문과 이력서 개인화 질문을 모두 포함한 역량별 유효 점수 평균에 weight를 적용해 최종 100점을 계산한다.
12. 총점 80 이상이며 세 역량 평균이 각각 3 이상일 때 기준 충족이다.
13. AI는 답변의 논리성과 NCS 근거를 평가한다. 기술 사실과 실제 경험의 진위는 확정하지 않는다.

## Question Mode Logic

| Mode | Required structure |
| --- | --- |
| `EXPERIENCE_BEHAVIOR` | 상황·과제 → 본인 행동 → 결과 |
| `TECHNICAL_KNOWLEDGE` | 문제·목적 → 기술 선택 이유 → 적용·검증 |
| `SITUATIONAL_DESIGN` | 제약 조건 → 대안 비교 → 선택·실행 → 검증·조정 |

## What Already Matches

| Final flow | Current implementation | Assessment |
| --- | --- | --- |
| NCS 역량 3개 | 기존 `PROBLEM_SOLVING`, `COMMUNICATION`, `DIGITAL` | 구조는 일치하며 canonical ID는 팀원 브랜치 기준으로 전환 |
| 역량별 행동 포인트 3개 | profile마다 behavior 3개 | 일치 |
| 질문 유형 3개 | `EXPERIENCE_BEHAVIOR`, `TECHNICAL_KNOWLEDGE`, `SITUATIONAL_DESIGN` | 일치 |
| 유형별 논리 구조 | mode마다 evidence dimension 4개 | 구조 재매핑 필요 |
| 답변 원문 근거 | exact substring evidence guardrail | 일치 |
| 근거 부족 시 점수 보류 | nullable 점수와 `INSUFFICIENT_INPUT`, `LOW_ALIGNMENT`, `BLOCKED` | 일치 |
| 역량 weight 합계 | evaluation criteria weight 합계 100 | 일치 |
| 기술·경험 진위 비확정 | 금지 표현·민감정보 guardrail | 경계 문구 보강 필요 |

## Changed From The Intermediate Share

- 논리 구조 점수 0~2는 꼬리질문 판단에만 쓰는 보조값이 아니라 질문·역량별 5점에 포함된다.
- 꼬리질문 조건은 질문·역량별 점수 5 미만으로 확정됐다.
- 꼬리질문은 질문당 최대 1회이며 같은 question mode를 유지한다.
- 보강 점수는 원점수보다 낮아질 수 없고 최대 5다.
- 최종 점수는 공통 기본 질문의 역량별 평균과 weight로 계산한다.
- 기준은 총점 80 이상과 각 역량 평균 3 이상을 동시에 요구한다.

## Integration Deltas

| ID | Topic | Current M5/M6 | Final flow | Required work |
| --- | --- | --- | --- | --- |
| D-01 | 질문별 역량 수 | 질문·세션 snapshot에 `ncsProfileId` 하나 | 질문당 최대 2개 | 다중 binding 및 snapshot 계약 |
| D-02 | 답변 저장 단위 | `(reportId, answerId)` 한 row | 답변 하나가 최대 2개 역량 점수 생성 | `(reportId, answerId, profileId)` cardinality 검토 |
| D-03 | 점수 범위 | competency/evidence/total 각각 0~100 | behavior 0~3 + logic 0~2 = 0~5 | field와 scale migration 계약 |
| D-04 | 최종 점수 | 답변 total 평균 후 weight 적용 | 역량별 effective score 평균을 5점 기준으로 weight 환산 | 집계 공식 교체 |
| D-05 | 꼬리답변 | NCS batch에서 제외 | 부모 질문 근거를 1회 보강 | parent linkage, segment evidence, 재평가 계약 |
| D-06 | 꼬리질문 trigger | 일반 FOLLOW_UP provider 정책 | 질문·역량 점수 중 하나라도 5 미만 | deterministic trigger와 부족 포인트 입력 |
| D-07 | 기준 충족 | NCS 자동 합격·불합격 없음 | 총점 80, 역량별 최소 3을 선별 판정에 사용 | deterministic 판정과 application 상태 전이 계약 |
| D-08 | 기술 타당성 | `concept-accuracy`가 점수에 포함 | 기술 사실성·경험 진위 비확정 | expert validation 미적용 표시 |
| D-09 | 역량 이름 | `DIGITAL`, `COMMUNICATION`, `PROBLEM_SOLVING` | `JOB_TECHNICAL`, `COLLABORATION_COMMUNICATION`, `PROBLEM_SOLVING` | compatibility mapping과 forward migration |
| D-10 | 질문 공정성 | JD 공통 + 이력서 개인화 질문을 세션에 합성 | 두 질문 source를 모두 최종 점수에 포함 | source별 동일 개수·생성 실패 처리 계약 |

## Recommended Boundaries

### Deterministic Scoring

LLM은 행동 포인트, 논리 구조 포인트, exact evidence와 불확실성만 반환한다. 최종 질문 점수, 역량 평균, weighted total과 threshold result는 API/worker의 versioned deterministic 함수가 계산한다.

### Deterministic Screening Result

공유 flow의 합격·불합격은 `MEETS_THRESHOLD`, `BELOW_THRESHOLD`, `INCOMPLETE` 계산 결과로 표현한다. `MEETS_THRESHOLD`는 PASS, `BELOW_THRESHOLD`는 FAIL로 매핑한다. 발표용 `NCS_INCOMPLETE_AS_FAIL_DEMO_V1`에서는 `INCOMPLETE`도 AI decision FAIL로 표시하지만 점수는 NULL이고 실제 application 상태는 변경하지 않는다. 발표 후 HOLD/재평가 정책으로 교체한다.

### Common Questions And Personalized Questions

공통 기본 질문과 이력서 개인화 질문을 모두 NCS 최종 점수에 포함한다. 두 source 모두 면접 설정에서 확정한 질문 개수를 충족해야 하며, 개인화 질문 생성 실패나 역량별 유효 질문 부족은 임의 0점이 아니라 `INCOMPLETE`로 처리한다.

### Follow-up Evidence

원답과 꼬리답변을 하나의 문자열로 덮어쓰지 않는다. source answer ID가 있는 segment 목록으로 evaluator에 전달하고 각 exact evidence의 출처를 유지한다. effective score는 `max(baseScore, combinedScore)`이며 5를 상한으로 한다.

### Incomplete Evaluation

각 역량에 유효 공통 기본 질문 점수가 2개 미만이거나 nullable 평가가 남으면 `INCOMPLETE`다. 누락 평가를 0점으로 바꿔 `BELOW_THRESHOLD`로 처리하지 않는다.

## Merge Gates

1. 팀원 브랜치의 profile, behavior, logic structure ID와 점수 type 비교
2. `R-E-06`, `R-E-07`, `R-D-04`, `R-PM-05`, `R-PM-06` 승인
3. 사전 계약을 `docs/03_contracts`와 `docs/02_architecture` 정본으로 승격
4. 기존 single profile과 신규 1~2 profile 질문의 migration 전략 확정
5. 공통 기본 질문과 개인화 질문의 동일 scoring 및 생성 실패 처리 검증
6. 세션 `answerTimeSec` snapshot을 꼬리답변 제한 시간으로 전달
7. adapter, persistence, report projection, UI 순서로 구현
8. 질문당 profile 2개, profile별 2문항, nullable 평가, 꼬리질문 1회 회귀 테스트
9. 80점·역량별 3점 경계값 deterministic test
10. 원답·꼬리답변 exact evidence와 개인정보 비노출 E2E
