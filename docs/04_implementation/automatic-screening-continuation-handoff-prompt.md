# 자동 합격·보류·불합격 전체 개발 인수인계 프롬프트

아래 내용을 새 Codex 작업에 그대로 입력한다. 이 프롬프트는 여러 명에게 작업을 병렬 배분하기 위한 것이 아니다. 기존 작업자가 자리를 비운 뒤 다음 팀원이 현재 저장소 상태를 확인하고, 이미 끝난 부분을 반복하지 않으며, 미완료 지점부터 전체 흐름을 순서대로 이어서 개발하기 위한 단일 인수인계 지시서다.

---

## Codex에 전달할 프롬프트

당신은 `seok3m4/init` 프로젝트의 자동 전형 판정 기능을 이어서 구현하는 개발자입니다. 이 요청은 업무를 여러 팀원에게 병렬 배분하는 요청이 아닙니다. 현재 원격 `dev`, 관련 Issue/PR, 로컬 브랜치와 변경 사항을 먼저 확인하고, 선행 작업자가 끝낸 부분은 보존한 채 다음 미완료 작업부터 의존 순서대로 진행해야 합니다.

### 1. 첫 응답에서만 수행할 일

아직 코드를 수정하거나 커밋·push·PR을 생성하지 마세요. 먼저 저장소와 GitHub의 실제 상태를 읽기 전용으로 확인한 뒤 아래 내용을 보고하세요.

1. 현재 기준 브랜치와 commit SHA, 원격 `dev`와의 차이
2. 관련 Issue `#394`, `#395`, `#396`, `#397`, `#398`과 관련 PR의 제목·상태·병합 여부·선후 관계
3. 아래 확정 계약 중 이미 구현된 항목과 미구현 항목
4. 남은 작업 개수와 작업 이름
5. 각 작업의 예상 소요시간과 관련 Issue 번호
6. 한 사람이 한 번에 끝까지 진행 가능한 범위인지, 순차 작업이 필요한 의존 관계는 무엇인지
7. 권장 Codex 추론 모델과 reasoning effort
8. 예상 PR 개수, PR 순서, 필요한 cross-owner review
9. 지금부터 이어서 작업할 정확한 첫 번째 미완료 지점

첫 응답 마지막 문장은 반드시 아래 문장과 정확히 같아야 합니다.

`"'승인'이라고 말하면 계속 진행하겠습니다."`

첫 응답에서는 위 현황 보고 후 멈추세요. 사용자가 `승인`이라고 답하면 아래 계약과 구현 순서에 따라 실제 수정, 테스트, 커밋, push, PR 생성을 계속 진행하세요. 각 단계마다 다시 승인을 요구하지 말고 안전한 범위에서 끝까지 진행하되, merge·배포·운영 데이터 변경은 사용자가 명시적으로 요청하지 않았다면 하지 마세요.

### 2. 작업 목적

서비스 목적은 면접관이 모든 지원자의 리포트를 하나씩 읽고 직접 합격·보류·불합격을 입력하는 일을 줄이는 것입니다.

면접 완료 및 평가 리포트 생성 후 시스템이 공고별 합격선과 평가 기준별 하한선을 사용해 `PASS | HOLD | FAIL`을 자동 산출합니다. 평가할 수 없는 경우 점수를 0점으로 간주해 `FAIL`로 만들지 않고 `RETRY`로 분리합니다. 자동 결과는 면접관에게 즉시 그룹 목록으로 보여주고, 면접관은 궁금하거나 수정이 필요한 지원자만 리포트를 열어 결과를 변경합니다. 이후 공고 단위 `결과 확정`을 두 번 확인하면 지원자에게 알림이 생성되고 제한된 최종 결과가 공개됩니다.

### 3. 반드시 읽을 문서와 우선순위

작업 전에 저장소의 최신 내용을 기준으로 아래 순서대로 읽으세요.

1. 루트 `AGENTS.md`
2. `docs/05_agents/AGENTS.md`
3. 담당 역할 문서 `docs/05_agents/agent-*.md`
4. `docs/04_implementation/team-split-5dev-1pm.md`
5. `docs/03_contracts/automatic-screening-decision.md`
6. `docs/03_contracts/api-index.md`
7. `docs/03_contracts/api-spec.md`의 API-012R, API-012C, API-014, API-020, API-034, API-036, API-073, API-074, API-078A 및 Saltlux demo 관련 부분
8. `docs/02_architecture/data-model.md`
9. `docs/02_architecture/async-ai-pipeline.md`
10. `docs/04_implementation/module-boundaries.md`
11. 수정할 폴더의 `AGENTS.md`

계약 문서와 구현이 다르면 임의로 구현을 계약에 맞추거나 계약을 다시 바꾸지 말고, diff와 영향 범위를 먼저 보고하세요. API·enum·error 변경은 계약 문서를 먼저, DB·상태 전이 변경은 아키텍처 문서를 먼저 맞춥니다.

### 4. 확정된 전체 사용자 흐름

1. 기업이 공고의 면접 평가 기준, 기준별 `passScore`, 자동 판정 사용 여부, 총점 합격선과 보류 하한선을 저장합니다.
2. 지원서가 제출되면 해당 공고의 평가 기준과 자동 판정 정책은 잠깁니다.
3. 지원자가 면접을 완료합니다.
4. 일반 경로는 STT·평가·리포트 worker가 최종 리포트를 저장할 때, Saltlux 3문항 시연 경로는 동기 API transaction에서 고정 리포트를 완성할 때 같은 deterministic decision 함수를 호출합니다.
5. 시스템은 평가 가능 여부를 먼저 확인하고 `UNDECIDED | RETRY | PASS | HOLD | FAIL`을 자동 저장합니다.
6. 기업 지원자 목록은 `effectiveDecision = screeningReviewerDecision ?? screeningDecision` 기준으로 전체 지원자를 `PASS`, `HOLD`, `FAIL` 그룹에 즉시 배치합니다. `UNDECIDED | RETRY`는 `재처리/확인 필요` 그룹에 둡니다.
7. 면접관은 모든 행을 체크하거나 직접 판정하지 않습니다. 보고 싶은 지원자만 상세 리포트를 열고 필요할 때 `PASS | HOLD | FAIL` 검토 초안을 저장합니다.
8. 자동판정과 다른 값으로 바꾸면 내부 변경 사유를 필수로 저장합니다. 자동판정으로 되돌리면 검토 결과와 사유를 `NULL`로 초기화합니다.
9. 면접관이 공고 단위 `결과 확정`을 클릭하면 PASS/HOLD/FAIL 인원, 확정 대상 합계, 제외되는 UNDECIDED/RETRY 인원을 Alert 또는 modal에 표시합니다.
10. 사용자가 modal에서 다시 `확정`을 눌러야 확정 API를 호출합니다. `취소` 시 API를 호출하지 않습니다.
11. 서버는 대상 application을 잠그고 현재 effective decision을 final decision으로 snapshot하며 확정 시각·확정자를 저장하고 지원자별 인앱/이메일 알림을 멱등 생성합니다.
12. transaction commit 이후에만 지원자 화면과 알림 API에서 제한된 최종 결과를 공개합니다.
13. 이메일 전송 실패는 재시도 대상으로 남기되 지원자 포털의 확정 결과 공개를 되돌리지 않습니다.

### 5. 확정된 판정 계약

#### 5.1 공통 enum

- `UNDECIDED`: 정책 비활성 또는 리포트 대기·진행 중
- `PASS`: 총점 합격선과 모든 활성 필수 평가 기준 하한선 충족
- `HOLD`: 보류 점수 구간이거나, 총점 합격선은 충족했지만 하나 이상의 필수 기준 하한선 미달
- `FAIL`: 총점이 보류 하한선 미만
- `RETRY`: 리포트 실패, STT terminal 실패, 평가 불완전, 점수 누락 등으로 평가 불가

`PASS | HOLD | FAIL`은 판정 가능한 점수가 있을 때만 허용합니다. 실패·누락 값을 0점으로 대체해 `FAIL`로 저장하면 안 됩니다.

#### 5.2 reason code

- `PASS_TOTAL_AND_CRITERIA_MET`
- `HOLD_TOTAL_BAND`
- `HOLD_CRITERION_BELOW_PASS_SCORE`
- `FAIL_BELOW_HOLD_THRESHOLD`
- `RETRY_REPORT_FAILED`
- `RETRY_STT_UNAVAILABLE`
- `RETRY_EVALUATION_INCOMPLETE`
- `RETRY_SCORE_MISSING`

`UNDECIDED`의 reason code는 `NULL`입니다. 지원자에게 내부 reason code를 노출하지 않습니다.

#### 5.3 정책 validation

- `0 <= holdMinTotalScore <= passMinTotalScore <= 100`
- 두 점수가 같으면 총점 기준 HOLD 구간은 비활성화됩니다.
- 동일 경계 이상이면서 모든 기준 하한선을 충족하면 PASS입니다.
- 동일 경계 이상이지만 필수 기준 하나라도 미달하면 HOLD입니다.
- `requireAllCriteriaPass`는 V1에서 항상 `true`입니다.
- 자동 판정이 활성화되면 모든 활성 `evaluation_criteria.pass_score`는 0~100 정수여야 합니다.
- submitted application이 존재하면 정책·평가 기준·하한선 변경을 차단합니다.
- 정책이 없거나 `enabled=false`이면 `UNDECIDED`를 유지합니다.
- 생성된 리포트에서 커트라인을 다시 바꿔 재판정하는 UI는 V1 범위에 포함하지 않습니다.

#### 5.4 deterministic decision 순서

아래 우선순서를 바꾸면 안 됩니다.

1. 정책 없음 또는 비활성: `UNDECIDED`
2. report `PENDING | GENERATING`: `UNDECIDED`
3. report `FAILED`: `RETRY / RETRY_REPORT_FAILED`
4. 필수 답변 최신 STT가 terminal 인식 불가: `RETRY / RETRY_STT_UNAVAILABLE`
5. NCS 평가 또는 필수 답변·활성 profile 평가 불완전: `RETRY / RETRY_EVALUATION_INCOMPLETE`
6. 총점 또는 활성 기준 판정 점수 `NULL`: `RETRY / RETRY_SCORE_MISSING`
7. `totalScore < holdMinTotalScore`: `FAIL / FAIL_BELOW_HOLD_THRESHOLD`
8. `totalScore >= passMinTotalScore`이며 모든 활성 기준 점수가 각 `passScore` 이상: `PASS / PASS_TOTAL_AND_CRITERIA_MET`
9. `holdMinTotalScore <= totalScore < passMinTotalScore`: `HOLD / HOLD_TOTAL_BAND`
10. 총점은 합격선 이상이지만 필수 기준 하한선 미달: `HOLD / HOLD_CRITERION_BELOW_PASS_SCORE`

브라우저 telemetry, 비언어 지표, 기업 내부 메모, 지원자별 수동 점수는 자동 판정 입력으로 사용하지 않습니다. frontend와 API consumer가 결과를 재계산하면 안 됩니다.

### 6. 저장 계약

#### 6.1 자동판정

- `screening_decision`: immutable 자동 판정
- `screening_decision_reason_code`
- `screening_decision_policy_version`
- `screening_policy_version`
- `screening_criteria_version`
- `screening_decision_report_id`
- `screening_decided_at`

동일 `reportId + policyVersion + criteriaVersion + decisionPolicyVersion`의 저장은 멱등이어야 합니다. 자동판정을 수정해야 할 때 `screening_decision`을 직접 덮어쓰지 않습니다.

#### 6.2 면접관 검토와 확정

- `screening_reviewer_decision`: 미확정 상태의 선택적 검토 초안. 자동값 유지 시 `NULL`
- `screening_decision_override_reason`: 자동판정과 다르게 수정할 때 10~1000자 필수
- `screening_final_decision`: 공고 단위 확정 당시 effective decision snapshot
- `screening_result_confirmed_at`
- `screening_result_confirmed_by_user_id`

`effectiveDecision = screeningReviewerDecision ?? screeningDecision`입니다.

reviewer decision은 자동판정과 달라야 하며 `PASS | HOLD | FAIL`만 허용합니다. `UNDECIDED | RETRY`와 이미 확정된 결과는 수정할 수 없습니다. 확정 후 수정·취소 기능은 V1에서 제공하지 않습니다.

### 7. API와 화면 계약

#### 7.1 기업 목록과 리포트

- API-014/API-020은 기업에 automatic, reviewer, effective, final decision과 reason/version, 공개·확정 상태를 반환합니다.
- 목록은 effective decision 기준 PASS/HOLD/FAIL 그룹과 count를 보여줍니다.
- UNDECIDED/RETRY는 `재처리/확인 필요` 그룹으로 분리합니다.
- 화면에는 확정 전 `지원자에게 아직 공개되지 않음`을 표시합니다.
- 면접관이 한 명씩 결과를 체크하도록 만들지 않습니다.

#### 7.2 API-012R

`PATCH /company/applicants/{applicantId}/screening-review`

- 미확정 지원자의 reviewer decision과 변경 사유를 저장합니다.
- reviewer decision을 `null`로 보내면 자동판정으로 초기화합니다.
- 자동판정과 다른 값인데 사유가 없거나 10자 미만/1000자 초과이면 validation error입니다.
- UNDECIDED/RETRY 또는 이미 확정된 지원자는 `COMMON_CONFLICT`입니다.

#### 7.3 API-012C

`POST /company/recruitments/{recruitmentId}/screening-results/confirm`

- request는 `expectedEligibleCount`를 포함합니다.
- 첫 버튼은 modal만 열고, modal의 두 번째 확정에서 API를 호출합니다.
- modal 문구에는 다음 의미가 포함되어야 합니다: `정말 확정하시겠습니까? 확정 후 지원자에게 알림이 발송되며 결과를 변경할 수 없습니다.`
- PASS/HOLD/FAIL 각각의 수, 확정 대상 합계, 제외 UNDECIDED/RETRY 수를 표시합니다.
- 요청 count와 현재 판정 가능 미확정 인원이 다르면 `COMMON_CONFLICT`, detail reason `SCREENING_CONFIRMATION_SCOPE_CHANGED`를 반환하고 목록 새로고침을 요구합니다.
- transaction에서 대상 행을 lock하고 final/effective snapshot과 확인 정보를 저장합니다.
- 지원자별 `IN_APP` 및 `EMAIL/PENDING` notification을 멱등 생성합니다.
- 같은 범위 재호출은 중복 알림이나 결과 변경 없이 멱등 성공합니다.

#### 7.4 지원자 공개

- API-073/API-074는 `resultPublicationStatus: PENDING | CONFIRMED`를 반환합니다.
- 공고 결과 확정 전에는 자동판정이 있어도 `screeningDecision=null`이며 리포트, 점수, reason, reviewer, override reason, confirmer를 숨깁니다.
- PENDING 문구는 `결과 검토 중`입니다.
- 확정 후에만 `screening_final_decision`을 제한된 `screeningDecision`으로 반환합니다.
- API-078A `GET /candidate/notifications/screening-results`는 확정된 전형 결과 알림만 제공합니다.
- 면접관 확정 전에는 지원자가 자동판정이나 검토 초안을 어떤 경로에서도 유추할 수 없어야 합니다.

### 8. Saltlux 3문항 시연 계약

- `SALTLUX_AI_BACKEND_V1 + DEMO_PRESET`은 버전 관리되는 동일 리포트를 사용합니다.
- 고정 총점은 88점이고 활성 profile 점수는 80/80/100입니다.
- 커트라인 변경을 위해 AI 평가, 리포트, provider 호출, SQS job을 다시 실행하지 않습니다.
- 세션 완료 동기 API transaction에서 고정 리포트를 저장하고 일반 worker와 동일한 deterministic decision 함수를 호출해 자동판정을 저장합니다.
- 동일 요청은 기존 완료 리포트와 판정을 멱등 반환합니다.
- 시연 리포트와 자동판정은 면접관 목록에 즉시 보입니다.
- 지원자에게는 API-012C 공고 단위 확정 이후에만 최종 결과와 알림이 보입니다.
- 기준별 하한선이 모두 충족된다는 전제에서 합격선/보류 하한선 80/80이면 PASS, 90/90이면 FAIL, 합격선 90·보류 하한선 60이면 HOLD가 되어야 합니다.

### 9. RETRY 경계

- RETRY 진입 조건과 지원자 비공개는 이번 전체 흐름에 포함합니다.
- queue 재시도 횟수·backoff·운영자 재처리·지원자 재답변의 상세 실행은 Issue #397 계약을 따릅니다.
- 현재 저장소에 #397 구현이 이미 병합되어 있다면 다시 만들지 말고 그 계약을 소비합니다.
- RETRY를 FAIL로 변환하거나 면접관이 PASS/HOLD/FAIL로 수동 변경하도록 허용하면 안 됩니다.

### 10. 승인 후 구현 순서

실제 저장소 상태를 기준으로 이미 완료된 단계는 건너뛰되 아래 의존 순서를 지키세요. 한 사람이 이어서 수행하는 작업이므로 병렬 브랜치를 새로 나누지 마세요.

1. 원격 `dev`, 관련 Issue/PR, 현재 branch/worktree와 dirty file을 확인하고 사용자 변경을 보존합니다.
2. 계약 문서가 확정본인지 검증하고 누락이 있을 때만 계약·아키텍처·ERD 문서를 먼저 보완합니다.
3. shared enum/DTO/error와 Prisma schema/migration/CHECK/FK/index를 구현합니다.
4. 공고별 자동 판정 정책과 평가 기준 하한선 저장·조회·lock validation을 구현합니다.
5. frontend 설정 화면을 API 계약에 연결합니다.
6. worker의 리포트 final save 경로에 공용 deterministic decision 함수를 연결합니다.
7. Saltlux 3문항 동기 완료 경로에 같은 함수를 연결하고 리포트와 자동판정을 같은 transaction에 저장합니다.
8. 기업 지원자 목록의 grouped projection, count, 주의 그룹과 상세 리포트 표시를 구현합니다.
9. API-012R과 선택적 reviewer override UI를 구현합니다.
10. API-012C의 lock·snapshot·count conflict·알림 멱등성과 이중 확인 modal을 구현합니다.
11. 지원자 API masking, 확정 결과 공개, API-078A와 알림 UI를 구현합니다.
12. 기존 수동 판정 mutation/UI가 새 계약을 우회하지 못하게 제거하거나 conflict 처리합니다.
13. unit/integration/E2E를 실행하고 문서·구현 diff, migration 실행 가능성, 회귀를 검증합니다.
14. Conventional Commits와 저장소 PR template에 맞춰 commit·push·PR을 생성합니다. 기존 관련 PR이 열려 있으면 중복 PR을 만들지 말고 적절한 branch/PR을 갱신합니다.

### 11. 필수 테스트 벡터

최소 아래 케이스를 자동 테스트에 포함하세요.

1. total 88, pass 80, hold 80, criteria 충족 → PASS
2. total 88, pass 90, hold 90 → FAIL
3. total 88, pass 90, hold 60 → HOLD_TOTAL_BAND
4. total은 pass 이상이나 필수 criterion 미달 → HOLD_CRITERION_BELOW_PASS_SCORE
5. report FAILED → RETRY_REPORT_FAILED
6. STT terminal unavailable → RETRY_STT_UNAVAILABLE
7. 평가 incomplete → RETRY_EVALUATION_INCOMPLETE
8. total 또는 필수 criterion score NULL → RETRY_SCORE_MISSING
9. policy disabled → UNDECIDED
10. reviewer override 저장, 필수 사유 validation, null reset
11. UNDECIDED/RETRY 및 confirmed row의 reviewer 변경 차단
12. 목록 effective grouping/count와 주의 그룹
13. modal cancel 시 API 미호출, second confirm 시 1회 호출
14. `expectedEligibleCount` 불일치 conflict
15. 공고 단위 확정 transaction과 final snapshot
16. confirm 재호출 시 결과·알림 멱등성
17. email 실패 시 portal 공개 유지
18. 확정 전 지원자 masking과 확정 후 final decision 공개
19. Saltlux 동기 경로에서 SQS/provider 재호출 없이 즉시 결과 저장

### 12. 작업 원칙과 완료 보고

- 사용자 worktree의 기존 변경을 덮어쓰거나 reset하지 마세요.
- 다른 사람이 만든 branch를 임의 삭제하지 마세요.
- 관련 branch가 있으면 원격 `dev`를 안전하게 반영하고 conflict를 계약 기준으로 해결하세요.
- API/DB/shared contract 변경은 A/B/C/D/E/PM cross-owner review가 필요합니다.
- 특히 설정은 C, 공고·application·알림·기업 목록은 B, 지원자 공개는 D, 리포트·worker·자동판정 실행은 E, shared enum/migration/security는 A의 review 대상으로 표시하세요.
- 각 담당 영역 하네스와 변경 모듈 테스트를 실행하세요. Windows는 `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role <역할>`을 사용하고, B 담당자의 macOS는 `bash scripts/check-local.sh -Role B`를 사용합니다.
- 테스트 실패나 인프라 제한을 성공으로 표현하지 마세요. 실행한 명령, 통과·실패·skip 수, 남은 위험을 정확히 보고하세요.
- PR 본문에는 구현한 전체 흐름, 계약 준수 여부, migration/rollback 주의점, 테스트 결과, cross-owner review 요청, 관련 Issue를 적으세요.
- merge와 배포는 사용자가 명시적으로 요청할 때만 진행하세요.

최종 완료 보고에는 아래를 포함하세요.

1. 완료한 작업과 남은 작업
2. 변경 파일과 핵심 동작
3. 테스트 결과
4. commit SHA, branch, PR URL
5. 필요한 리뷰어와 merge 순서
6. 배포 후 E2E에서 확인할 시나리오
7. 발견한 문제를 `상황 / 원인 / 해결방안` 형식으로 정리

---

이 프롬프트의 기준 계약 revision은 `SCREENING_RESULT_CONFIRMATION_V1`, 자동 판정 알고리즘 version은 `AUTO_SCREENING_DECISION_V1`이다. 저장소의 최신 확정 계약이 이후 변경되었다면 변경된 PR과 근거를 확인해 차이를 먼저 보고한 뒤 진행한다.
