# NCS 채용면접 런타임 안정화 마일스톤

## 1. 목적과 범위

NCS 공통·개인화 질문 생성 결과가 채용면접 세션 snapshot으로 확정된 뒤, 답변 저장부터 다음 질문 이동, 꼬리질문, STT 실패, 리포트 입력까지 끊기지 않는 흐름을 만든다.

이번 범위에는 다음을 포함한다.

- NCS 질문 생성 결과와 profile binding 검증
- 면접 세션 snapshot 생성·재사용 검증
- 답변 저장 후 다음 질문 전환
- `API-071-TMP` 꼬리질문 임시 브릿지의 정식 상태 전이 교체
- STT 실패 답변의 임시 0점 제거와 평가 미완료 처리
- 깨끗한 DB에서의 migration·브라우저 E2E 검증

발표용 `NCS_INCOMPLETE_AS_FAIL_DEMO_V1`의 `INCOMPLETE -> FAIL` 표시 정책은 이번 범위에서 변경하지 않는다.

## 2. 확인된 문제

### R-01. 로컬 DB와 현재 브랜치 Prisma 계약이 다르다

- 현재 브랜치에는 NCS 관련 migration 9개가 미적용 상태다.
- 로컬 DB에는 현재 브랜치 migration 폴더에 없는 다른 브랜치 migration도 기록되어 있다.
- Prisma schema가 요구하는 `interview_sessions.ncs_scoring_version` 컬럼이 로컬 DB에 없다.
- `question_bank`와 `interview_session_questions`에도 NCS metadata와 binding 구조가 적용되지 않았다.

따라서 공유 DB에서 바로 `migrate deploy`를 반복하지 않는다. `origin/dev + 현재 브랜치` migration만 사용하는 격리 DB를 먼저 만들고, migration 충돌은 코드 병합 문제와 데이터 문제를 분리해서 해결한다.

### R-02. 기존 snapshot이 있으면 NCS 검증을 우회한다

`prepareInterviewSessionQuestionSnapshot()`은 기존 세션 질문이 한 건이라도 있으면 다음 항목을 재검증하지 않고 `READY`를 반환한다.

- `generationSource=JD_CRITERIA | RESUME_PERSONALIZED`
- 질문별 1~2개 canonical NCS binding
- `alignmentStatus=ALIGNED`
- 세 역량별 최소 2문항
- policy/criteria/profile version
- 세션 NCS 가중치 snapshot

이 때문에 수동으로 넣은 기존 질문으로 면접 시작은 가능하지만, 답변 평가와 꼬리질문 단계에서 필요한 NCS snapshot이 없을 수 있다.

### R-03. 다음 질문 이동이 프론트 비동기 상태에 과도하게 결합되어 있다

- 답변 저장 후 프론트가 STT와 꼬리질문 작업을 자동 실행한다.
- 작업이 `PENDING` 또는 `RUNNING`이면 다음 질문 버튼을 막는다.
- 일반 모드에서는 최대 90초 polling하며, worker 또는 DB 상태가 불안정하면 질문 진행도 함께 정지한다.
- 다음 질문 API 응답의 authoritative question을 화면 상태에 직접 적용하지 않고 `refresh()`를 fire-and-forget으로 실행한다.

질문 진행은 AI 작업 성공 여부와 분리해야 한다. AI 결과가 준비되면 꼬리질문을 먼저 보여주고, 실패·시간 초과·불필요 판정이면 다음 기본 질문으로 진행해야 한다.

### R-04. 꼬리질문 삽입 경로가 이중화되어 있다

- 프론트가 완료된 `processLogId`를 `API-071-TMP`에 전달해 질문을 삽입한다.
- 서버의 `moveNextQuestion()`도 완료된 꼬리질문을 찾아 자동 삽입한다.
- 현재/직전 질문 판정과 세션 인덱스 복원이 두 경로에 걸쳐 있어 race와 중복 삽입 가능성이 있다.
- 꼬리질문 생성 전 `baseScore < 5`, 질문당 최대 1회, 같은 question mode 유지 조건을 하나의 상태 전이로 보장하지 않는다.

정식 경로는 서버가 답변 ID를 기준으로 생성 상태를 소유하고, 다음 질문 이동 시 READY 꼬리질문을 원자적으로 소비하는 방식으로 통일한다.

### R-05. STT 실패의 임시 0점과 NCS 평가 미완료 계약이 충돌한다

- 기존 리포트 경로는 STT transcript가 없으면 임시 0점을 저장한다.
- NCS 계약은 `STT_UNAVAILABLE`을 점수 `NULL`과 평가 미완료 사유로 취급한다.

STT 실패는 한 번의 재답변 기회를 제공한 뒤 면접 진행은 허용하되, NCS 점수는 만들지 않는다. 리포트에는 0점이 아니라 `평가 미완료`와 사유를 전달한다.

## 3. 목표 상태 전이

```text
NCS 질문 생성
-> 정렬·가드레일 통과
-> ACTIVE 질문 세트 확정
-> 세션 시작 시 질문·binding·가중치 snapshot 검증
-> 답변 저장
-> STT 및 NCS 답변 평가
-> 꼬리질문 필요 여부 판정
   -> 필요 + READY: 같은 mode의 꼬리질문 1회 삽입
   -> 불필요/실패/시간 초과: 다음 기본 질문 진행
-> 모든 세션 질문 답변 완료
-> 점수 또는 평가 미완료 상태로 리포트 생성
```

## 4. 마일스톤

| Milestone | 범위 | 주요 작업 | Exit Criteria | Owner / Review | 예상 |
| --- | --- | --- | --- | --- | --- |
| NR-M0 | DB·migration 기준 복구 | 격리 PostgreSQL 구성, `origin/dev`와 NCS migration 순서 병합, Prisma generate/migrate/seed 검증 | 깨끗한 DB에서 migration divergence 없이 전체 적용되고 NCS table·column이 존재 | A / C,D,E | 2~4시간 |
| NR-M1 | NCS 질문 형성 검증 | canonical 3 profile 통일, 질문별 1~2 binding, `ALIGNED`만 확정, 세 역량별 최소 2문항, 개인화 0개 정책 지원 | JD 공통 질문 6개만으로도 profile별 2문항을 충족하고 ACTIVE 세트에 seed/legacy 질문이 섞이지 않음 | C/E / D,PM | 3~5시간 |
| NR-M2 | 세션 snapshot gate 수정 | 기존 snapshot도 전체 계약 재검증, 유효하지 않은 미시작 세션은 원자적 재생성, 진행·완료 세션은 변경하지 않고 명시적 오류 반환 | 질문·binding·가중치·시간·version이 모두 저장된 세션만 시작 가능 | D/C / E,A | 3~5시간 |
| NR-M3 | 답변·다음 질문 전환 안정화 | 답변 저장과 first-unanswered 복원 멱등화, 다음 질문 API 응답을 프론트에 즉시 반영, refresh 실패 처리, AI job과 기본 진행 분리 | 답변 저장 후 worker 지연·재시작과 무관하게 다음 기본 질문으로 이동하며 중복 클릭에도 순서가 유지 | D / C,E,PM | 3~5시간 |
| NR-M4 | 꼬리질문 정식 상태 전이 | `API-071-TMP` 의존 제거, base 평가 후 필요 여부 판정, READY 결과 원자적 삽입, 질문당 1회·동일 mode·답변시간 snapshot 보장 | 꼬리질문이 필요한 경우에만 한 번 삽입되고 실패·timeout이면 기본 질문 진행 | E/D / C,A,PM | 4~7시간 |
| NR-M5 | STT 평가 미완료 정렬 | 임시 0점 제거, `STT_UNAVAILABLE + score NULL` 저장, 재답변 1회, 진행 허용, 리포트 reason 전달 | STT 실패가 질문 진행을 막지 않고 0점과 평가 미완료가 구분됨 | E/D / B,PM | 2~4시간 |
| NR-M6 | 회귀·브라우저 E2E | 공통 6·개인화 0/개인화 포함 시나리오, API/worker 재시작, 꼬리질문 성공·실패, STT 실패, 완료·리포트 검증 | C/D/E 집중 테스트, clean DB E2E, 역할별 harness와 브라우저 체크리스트 통과 | PM/A / 전 owner | 3~5시간 |

### NR-M0 격리 DB 검증

공유 `init` DB와 실행 중인 로컬 서버는 migration 검증에 사용하지 않는다. 아래 스크립트는 별도 Compose project, PostgreSQL 포트 `55432`, LocalStack 포트 `54566`, DB `init_ncs_runtime`을 사용한다. 성공 또는 실패 후에는 이 project가 만든 컨테이너와 볼륨만 제거한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-ncs-runtime-clean-db.ps1
```

실패 상태를 직접 확인해야 할 때만 `-KeepDatabase`를 사용한다. 실제 `DATABASE_URL`과 credential은 파일에 기록하지 않고 스크립트 process 환경에만 설정한다.

전체 예상은 약 20~35시간이다. NR-M0~NR-M3은 질문 진행 복구를 위한 선행 범위이고, NR-M4~NR-M5는 발표용 임시 처리를 정식 계약으로 바꾸는 범위다.

## 5. 구현 순서와 병렬화

```text
NR-M0
  -> NR-M1
  -> NR-M2
  -> NR-M3
  -> NR-M6

NR-M2 완료 후 NR-M4와 NR-M5 병렬 진행 가능
NR-M4 + NR-M5 완료 후 NR-M6 최종 회귀
```

- A는 NR-M0에서 격리 DB와 migration 순서를 정리할 수 있다.
- C/E는 NR-M1 질문 생성·binding 검증을 함께 진행할 수 있다.
- D는 NR-M1과 병렬로 NR-M3의 프론트 상태 전이 테스트를 먼저 작성할 수 있지만, 실제 세션 수정은 NR-M2 이후 진행한다.
- E/D는 NR-M2 이후 NR-M4와 NR-M5를 분리해 병렬 구현할 수 있다.

## 6. 필수 테스트 시나리오

1. NCS 공통 질문 6개, 개인화 질문 0개로 세 역량별 2문항을 구성한다.
2. 세션 시작 전에 질문·binding·가중치 snapshot이 모두 존재하는지 확인한다.
3. 첫 질문에 답변하고 다음 질문으로 이동한다.
4. 꼬리질문이 불필요하면 바로 두 번째 기본 질문을 표시한다.
5. 꼬리질문이 필요하면 같은 question mode의 질문을 한 번만 삽입한다.
6. worker를 중지하거나 timeout을 발생시켜도 다음 기본 질문으로 진행한다.
7. STT 실패 후 재답변을 한 번 허용하고, 다시 실패하면 점수 NULL 상태로 진행한다.
8. API를 재시작한 뒤에도 first-unanswered 질문과 질문 순서가 동일하다.
9. 기존 legacy snapshot을 NCS 세션으로 오인하지 않고 재생성 또는 명시적 차단한다.
10. 모든 질문 완료 후 리포트에 답변 ID, profile 점수 또는 평가 미완료 사유가 표시된다.

## 7. 커밋 전략

1. `fix(infra): NCS 면접 격리 DB migration 기준 정렬`
2. `fix(company-interview): NCS 질문 binding 확정 검증 보강`
3. `fix(candidate): NCS 세션 snapshot 재검증 추가`
4. `fix(interview): 답변 후 다음 질문 상태 전이 안정화`
5. `refactor(ai): 꼬리질문 임시 삽입 경로 통합`
6. `fix(report): STT 평가 미완료 점수 계약 정렬`
7. `test(interview): NCS 채용면접 런타임 회귀 검증 추가`
