# NCS 채용면접 질문 생성 준비 마일스톤

## 1. 목적

기업 면접 설정의 1단계 평가 기준과 2단계 질문 구성을 NCS 기반 평가로 확장한다. 다른 담당자가 구현 중인 NCS 평가기를 현재 페이지에 직접 복제하지 않고, 평가기 계약이 확정되면 adapter를 연결할 수 있는 입력·상태·저장 경계를 먼저 준비한다.

이 문서의 범위는 다음과 같다.

- 고정된 NCS 평가 기준과 질문 유형을 기업 평가 기준에 연결한다.
- 면접관이 `평가 기준 + JD` 질문 수와 `이력서 개인화` 질문 수를 각각 설정한다.
- 공통 질문은 면접 설정 2단계에서 즉시 생성한다.
- 이력서 개인화 질문은 지원서 제출 후 이력서 텍스트 추출이 완료되면 지원자별로 생성한다.
- 질문과 NCS 기준의 정렬 검증, 답변 평가, 점수 계산은 E 담당 NCS 평가기와 계약으로 연결한다.

## 2. 확정 용어와 기준

### 2.1 NCS 평가 기준

`feat-ncs-text-evaluation-playground`에서 검증한 아래 3개 프로필을 초기 기준으로 사용한다.

| Profile ID | 화면 이름 | 주요 행동지표 | 기본 질문 유형 | 허용 fallback |
| --- | --- | --- | --- | --- |
| `problem-solving` | 문제해결능력 | 문제 분석, 대안 선택, 결과 검증 | `EXPERIENCE_BEHAVIOR` | `SITUATIONAL_DESIGN` |
| `communication` | 의사소통능력 | 구조화된 설명, 대상 맞춤, 상호 이해 확인 | `EXPERIENCE_BEHAVIOR` | 없음 |
| `digital` | 디지털능력 | 기술 원리, 실무 적용, 위험 검증 | `TECHNICAL_KNOWLEDGE` | 실제 수행 경험을 묻는 `EXPERIENCE_BEHAVIOR` |

현재 playground의 `profileVersion=2025.12-v1`, 정렬 기준 `0.6`은 통합 전 참고값이다. C 코드나 DB에 숫자와 버전을 중복 하드코딩하지 않고 NCS adapter가 제공하는 계약값을 사용한다.

### 2.2 질문 출처

| Source | 의미 | 생성 시점 | 저장 범위 |
| --- | --- | --- | --- |
| `JD_CRITERIA` | 평가 기준 3개와 채용공고 JD를 기반으로 한 공통 질문 | 면접 설정 2단계 | 공고의 `question_bank` 및 확정 질문 세트 |
| `RESUME_PERSONALIZED` | 평가 기준 3개, JD, 지원 당시 이력서 스냅샷을 기반으로 한 지원자별 질문 | 지원서 제출 후 문서 추출 완료 시 | 지원서 전용 질문 초안, 이후 세션 질문 스냅샷 |

이력서 개인화 질문은 공통 `question_bank`에 저장하지 않는다. 다른 지원자에게 질문이나 이력서 내용이 노출되지 않도록 `application_id` 범위로 격리한다.

## 3. 제품 흐름

```text
1단계 평가 기준 설정
→ NCS 3개 기준과 profile/question mode 연결
→ 평가 기준 저장 및 버전 확정

2단계 질문 구성
→ 면접관이 JD 질문 수와 이력서 질문 수 지정
→ JD + 평가 기준 질문 즉시 생성
→ 면접관 검토 후 공통 질문 확정
→ 이력서 질문 수와 생성 정책만 저장

지원자 지원 완료
→ 지원서·이력서 스냅샷 고정
→ 이력서 텍스트 추출
→ 평가 기준 + JD + 이력서 기반 개인화 질문 생성
→ NCS 정렬 검증 및 가드레일
→ 지원자 전용 질문 확정
→ 면접 세션 생성 시 공통 질문과 개인화 질문을 세션 스냅샷으로 복사

면접 답변 완료
→ 질문에 연결된 NCS profile/question mode로 답변 평가
→ 근거·역량·총점 계산
→ 면접관 검토 가능한 리포트 생성
```

화면에서 지원 완료라고 표현하더라도 실제 AI 생성 트리거는 `application_status=SUBMITTED`만으로 충분하지 않다. 이력서의 `application_documents.parse_status=EXTRACTED`와 `extracted_text` 존재를 함께 확인한다.

## 4. 질문 개수 정책

2단계에 다음 두 입력을 둔다.

- `jdCriteriaQuestionCount`: 평가 기준 + JD 공통 질문 수
- `resumeQuestionCount`: 지원자별 이력서 개인화 질문 수

초기 검증 정책은 다음과 같다.

- 각 값은 0 이상이며 합계는 기존 질문 세트 최대값인 20 이하로 제한한다.
- 합계는 1 이상이어야 한다.
- 세 평가 기준을 모두 평가하려면 총 3개 이상을 권장한다.
- 생성기는 질문을 세 평가 기준에 가능한 한 균등 배분한다.
- 특정 기준에 질문이 하나도 배정되지 않으면 저장 전에 `평가 기회 없음` 경고를 표시한다.
- 이력서 질문 수가 0이면 개인화 생성 작업을 만들지 않는다.
- NCS 평가기의 최종 커버리지 정책이 확정되면 권장 개수와 차단 조건을 adapter 결과로 교체한다.

질문 하나에는 원칙적으로 NCS profile 하나와 평가 기준 하나를 연결한다. playground가 프로필 2개 평가를 지원하더라도 초기 제품 연결에서는 판정 이유와 점수 귀속을 명확하게 하기 위해 단일 기준 연결을 기본값으로 한다.

## 5. 이력서 질문 생성 규칙

이력서는 질문의 평가 기준이 아니라 질문을 구체화하는 근거로만 사용한다.

```text
NCS profile + question mode + 행동지표
→ JD의 요구 역량
→ 이력서의 프로젝트·기술·협업 경험
→ 지원자에게 확인할 질문
```

예시는 다음과 같다.

| 기준 | 질문 예시 |
| --- | --- |
| 문제해결능력 | 이력서의 결제 API 장애 경험에서 원인을 어떻게 분석했고, 어떤 대안을 비교해 선택했으며, 결과와 재발 방지를 어떻게 검증했나요? |
| 의사소통능력 | 해당 프로젝트에서 기술 내용을 비개발 직군에게 어떻게 설명했고, 의견 차이를 어떻게 조율한 뒤 합의를 확인했나요? |
| 디지털능력 | 이력서에 기재한 Redis를 선택한 이유와 동작 원리, 실제 적용 방식, 정합성 및 장애 위험을 어떻게 검증했나요? |

다음 질문은 생성 단계에서 재작성한다.

- 이력서에 작성한 프로젝트를 설명해주세요.
- 본인의 장단점을 설명해주세요.
- 해당 기술을 사용해본 적이 있나요?

이 질문들은 평가 행동지표와 확인할 근거를 특정하지 않아 NCS 점수의 근거로 사용하기 어렵다.

## 6. 정렬 실패와 질문 유형 변경

정렬점수 미달을 해결하기 위해 질문 유형부터 임의로 바꾸지 않는다.

```text
1차 생성
→ 동일 profile/question mode로 질문 문장 재작성
→ 최대 2회 정렬 재검증
→ 여전히 미달이면 허용된 fallback mode로 재생성
→ fallback도 미달이면 REVIEW_REQUIRED
```

- 정렬 기준과 실패 이유는 NCS adapter 응답을 사용한다.
- 질문 유형 변경은 점수를 통과시키기 위한 우회가 아니라 확인하려는 증거가 실제 경험·기술 지식·상황 설계 중 무엇인지 바뀔 때만 허용한다.
- `REVIEW_REQUIRED` 질문은 면접에 자동 포함하지 않는다.
- 질문 정렬이 통과해도 답변이 짧거나 근거가 없으면 `INSUFFICIENT_INPUT` 또는 평가 불충분으로 처리한다.
- 평가 불충분은 0점으로 환산하지 않는다.

## 7. 준비할 계약 경계

NCS 구현이 완료되기 전에는 아래 인터페이스 경계만 정의하고 실제 평가 로직은 복제하지 않는다.

```ts
type NcsQuestionBinding = {
  criterionId: number;
  profileId: "problem-solving" | "communication" | "digital";
  questionMode: "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN";
  profileVersion?: string;
};

type QuestionGenerationPolicy = {
  postingId: number;
  jdCriteriaQuestionCount: number;
  resumeQuestionCount: number;
  policyVersion: number;
};

type QuestionAlignmentResult = {
  status: "ALIGNED" | "LOW_ALIGNMENT" | "REVIEW_REQUIRED";
  score?: number;
  reason?: string;
  evaluatorVersion?: string;
};
```

최종 필드명과 enum은 E 담당 NCS 계약을 우선한다. 위 타입은 C 화면과 API가 준비해야 할 최소 경계를 설명하기 위한 초안이다.

## 8. 권장 데이터 경계

### 공고 설정

공고별 질문 생성 정책을 별도 설정으로 관리한다.

- `posting_id`
- `jd_criteria_question_count`
- `resume_question_count`
- `policy_version`
- `created_at`, `updated_at`

테이블 추가 여부와 이름은 계약 단계에서 C/PM 검토 후 확정한다. 기존 `interview_time_policies`에는 시간 정책과 무관한 질문 생성 설정을 섞지 않는다.

### 지원자 개인화 질문

지원 완료 시점에는 면접 세션이 아직 없을 수 있으므로 application 범위의 개인화 질문 staging 저장소가 필요하다.

권장 필드는 다음과 같다.

- `application_id`
- `criterion_id`
- `source=RESUME_PERSONALIZED`
- `question_type`
- `content`
- `alignment_status`, `alignment_score`
- `source_process_log_id`
- `criteria_snapshot_version`, `policy_version`, `evaluator_version`
- `status=PENDING|GENERATING|READY|REVIEW_REQUIRED|FAILED`
- `sort_order`

최종 질문은 면접 세션 생성 시 `interview_session_questions`에 content와 연결 메타데이터를 스냅샷으로 복사한다. 세션 생성 후 평가 기준이나 질문 정책이 바뀌어도 기존 세션 질문은 변경하지 않는다.

중복 생성을 막는 멱등 키는 최소 다음 조합을 포함한다.

```text
applicationId + criteriaSnapshotVersion + policyVersion + resumeDocumentHash
```

## 9. 상태와 실패 정책

| 상태 | 의미 | 사용자 처리 |
| --- | --- | --- |
| `WAITING_APPLICATION` | 이력서 질문 수는 저장됐지만 지원자가 없음 | 설정 화면에 예약 개수 표시 |
| `WAITING_DOCUMENT` | 지원은 완료됐지만 이력서 추출 대기 | 면접 시작 전 처리 대기 표시 |
| `GENERATING` | 개인화 질문 생성 중 | 중복 작업 생성 금지 |
| `READY` | 정렬·가드레일을 통과한 질문 준비 완료 | 세션 생성 시 포함 |
| `REVIEW_REQUIRED` | 정렬 미달 또는 기준 연결 불명확 | 면접관 검토 전 자동 포함 금지 |
| `FAILED` | 문서 추출 또는 AI 작업 실패 | 재시도 또는 질문 개수 정책 수정. 기존 정책을 유지한 채 공통 질문만으로 자동 시작하지 않음 |

이력서 원문 전체를 질문 결과나 `ai_process_logs.output_ref`에 반복 저장하지 않는다. 생성 입력은 S3/file metadata와 추출 텍스트 참조를 사용하고, 질문에는 평가에 필요한 최소한의 경험 맥락만 포함한다.

## 10. 전체 마일스톤

| Milestone | 범위 | 주요 산출물 | 선행 조건 | Exit Criteria | Owner / Review |
| --- | --- | --- | --- | --- | --- |
| NQ-M0 | 계약·용어 동결 | 두 질문 출처, 개수 정책, NCS binding, 상태 enum, 개인정보 경계 | NCS 담당 브랜치 계약 초안 | C/E/D/PM이 요청·응답과 저장 범위 합의 | C / E,D,PM |
| NQ-M1 | 현재 페이지 준비 | 2단계 질문 수 입력 UI, 출처별 상태, nullable NCS binding adapter, feature flag | NQ-M0 최소 타입 | NCS evaluator 없이 기존 JD 질문 생성이 회귀 없이 동작 | C / PM,E |
| NQ-M2 | JD 공통 질문 확장 | 기준별 균등 배분, profile/question mode 메타데이터, 정렬 결과 미리보기 | NCS alignment adapter 사용 가능 | 생성 질문이 기준 하나에 연결되고 미달 질문이 자동 확정되지 않음 | C/E / PM |
| NQ-M3 | 지원 완료 이벤트와 개인화 생성 | 지원서 제출→문서 추출→SQS job, 멱등 처리, application 전용 저장 | NQ-M0, 문서 추출 계약 | 동일 지원서 중복 생성 없음, 이력서 질문의 지원자 간 격리 | D/E / C,A |
| NQ-M4 | 세션 질문 합성 | 공통 질문 + 개인화 질문을 세션 스냅샷으로 확정, 순서와 개수 검증 | NQ-M2, NQ-M3 | 세션 생성 이후 설정 변경이 기존 질문에 영향 없음 | D / C,E |
| NQ-M5 | NCS 답변 평가 연결 | 답변별 profile/question mode 전달, 근거·역량·총점, 평가 불충분 | 동료 NCS 평가기 완료 | 점수에 원문 근거가 있고 미정렬/근거 부족은 점수 없음 | E / C,D,PM |
| NQ-M6 | QA·롤아웃 | feature flag 해제, 회귀·개인정보·부하·실패 복구 테스트 | NQ-M1~M5 | 핵심 E2E와 역할별 harness 통과, 롤백 경로 확보 | PM/A / 전원 |

## 11. 병렬 작업 가능 범위

NQ-M0 합의 후 다음은 병렬 진행할 수 있다.

- C: 2단계 질문 개수 UI와 출처별 상태 view model
- E: NCS alignment/evaluation adapter 계약과 worker 결과
- D: 지원 완료·문서 추출 완료 이벤트와 세션 질문 합성 지점 조사
- PM: 질문 품질 golden case와 브라우저 QA 시나리오

NQ-M3의 DB·이벤트 구현과 NQ-M5의 실제 평가 연결은 계약 없이 병렬 구현하지 않는다. 같은 enum과 상태를 각자 만들면 통합 시 재작업이 발생한다.

## 12. 테스트 전략

### 계약 테스트

- 두 질문 개수가 독립적으로 저장되고 합계 제한을 지킨다.
- 기존 `questionCount` 요청과의 호환 또는 명시적 migration이 검증된다.
- 질문마다 criterion/profile/question mode 연결이 보존된다.
- NCS adapter가 비활성일 때 기존 JD 질문 생성이 동작한다.

### 질문 품질 테스트

- 세 기준마다 정렬 통과 질문, 정렬 미달 질문, 질문과 무관한 답변을 준비한다.
- 같은 이력서에서 생성한 질문이 세 기준에 과도하게 편중되지 않는다.
- 정렬 재생성이 같은 유형을 먼저 유지한다.
- fallback 유형은 표에 정의된 조합에서만 사용한다.

### 비동기·멱등 테스트

- 지원서 제출 이벤트가 중복돼도 개인화 질문 묶음이 하나만 생성된다.
- 문서 추출 실패 시 점수를 만들거나 빈 질문을 확정하지 않는다.
- worker 재시도와 중복 수신에도 READY 질문이 중복 저장되지 않는다.

### 개인정보·격리 테스트

- A 지원자의 개인화 질문이 B 지원자 세션에 포함되지 않는다.
- 질문과 작업 출력에 이력서 원문 전체가 저장되지 않는다.
- 민감 속성, 학교, 나이, 성별, 외모를 질문 또는 평가 근거로 사용하지 않는다.

### E2E

```text
기업이 3개 평가 기준 저장
→ JD 질문 3개, 이력서 질문 3개 설정
→ JD 질문 즉시 생성·검토
→ 지원자가 이력서와 함께 지원 완료
→ 문서 추출 및 개인화 질문 생성
→ 면접 세션에 총 6개 질문 스냅샷 생성
→ 답변 제출
→ NCS 근거·점수 리포트 확인
```

## 13. 리뷰 필수 영역

- C: 평가 기준, 질문 개수 설정, 질문 검토 UX, 공통 질문 저장
- B: JD와 공고 스냅샷 제공 시점
- D: 지원 완료 이벤트, 지원서 문서, 세션 질문 소비
- E: NCS profile/version, 정렬·평가, SQS worker, 가드레일
- A: 비동기 이벤트 신뢰성, 개인정보, 배포 환경변수
- PM: 용어, 질문 품질, 브라우저 E2E, 수용 기준

문서와 구현이 NCS 동료 브랜치의 최종 계약과 충돌하면 동료 브랜치의 profile/version/output 계약을 기준으로 이 문서를 갱신한다.

## 14. 권장 추론 강도

전체 작업의 기본 추론 강도는 `high`가 적합하다. 화면 하나의 수정처럼 보이지만 실제로는 C/B/D/E 데이터 경계, 비동기 생성 시점, 개인정보 격리, NCS 버전 스냅샷을 함께 결정해야 한다.

| 작업 | 권장 추론 강도 | 이유 |
| --- | --- | --- |
| NQ-M0 계약·데이터 모델 | `xhigh` | 잘못 정하면 여러 담당자의 API·DB·상태 전이를 다시 수정해야 함 |
| NQ-M1 UI 준비·view model | `medium` | 계약이 고정된 뒤에는 비교적 기계적인 화면 작업 |
| NQ-M2 질문 생성·정렬 adapter | `high` | 질문 기준 귀속과 실패 재생성 정책을 함께 검증해야 함 |
| NQ-M3 지원 완료 비동기 파이프라인 | `xhigh` | 문서 추출 순서, 멱등성, 개인정보 격리, 재시도가 얽힘 |
| NQ-M4 세션 질문 합성 | `high` | 공통·개인화 질문 순서와 스냅샷 불변성을 보장해야 함 |
| NQ-M5 NCS 평가 통합 | `xhigh` | 동료 브랜치 계약 비교, 근거 없는 점수 차단, 버전 호환이 핵심 |
| NQ-M6 테스트·UI 마감 | `medium`, 실패 분석은 `high` | 테스트 작성은 명시적이며, 실패 원인 분리는 넓은 문맥이 필요 |

한 세션에서 전부 `xhigh`로 처리하기보다 NQ-M0, NQ-M3, NQ-M5에서만 `xhigh`를 사용하고, 확정된 계약을 구현하는 단계는 `medium` 또는 `high`로 낮추는 편이 시간 대비 효율이 좋다.
