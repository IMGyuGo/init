# 점수 기반 목표 합격자 선발 및 메일 발송 설계

## 배경

PR #428은 공고 상세에서 기업 사용자가 목표 합격자 수를 입력하면 기존 `PASS`와 `FAIL` 지원자를 점수순으로 다시 나누고 최종 합격자에게 메일을 보내는 흐름을 제공했다. 이후 자동판정 검토·결과 확정 기능이 재적용되면서 상단 목표 인원 UI가 `결과 확정` 버튼으로 바뀌었고, 일부 자동판정 행은 전형 상태 드롭다운 대신 읽기 전용 배지만 표시된다.

변경된 운영 규약은 리포트 생성이 완료되어 `PASS`, `HOLD`, `FAIL` 중 하나로 판정 가능한 지원자 모두를 목표 합격자 수 조정 대상으로 본다. 목표 인원보다 높은 순위는 합격, 나머지는 불합격이므로 메일 발송 시점에는 대상 범위에 `HOLD`가 남지 않는다.

## 목표

- 리포트 완료 후 판정 가능한 지원자의 전형 상태를 공고 상세 목록의 기존 드롭다운에서 수정한다.
- 자동판정 원본은 보존하고 기업의 수동 선택을 유효 전형 상태로 반영한다.
- 상단에 현재 합격 수, 목표 합격자 수, 최대 선발 가능 인원, 합격 메일 전송 컨트롤을 PR #428 형태로 복원한다.
- 리포트 완료 상태의 `PASS`, `HOLD`, `FAIL` 전체를 점수순으로 정렬해 상위 N명은 합격, 나머지는 불합격으로 변경한다.
- 최종 합격 대상자에게만 합격 메일을 보내고 기존 발송자는 중복 발송하지 않는다.

## 비목표

- 면접 설정, 자동판정 점수 계산식, NCS 가중치, 리포트 생성 로직은 변경하지 않는다.
- 지원자 목록의 레이아웃, 필터, 정렬 UI, 점수 색상, 공고 정보 영역은 재설계하지 않는다.
- `UNDECIDED`, `RETRY`, 리포트 미완료 지원자를 목표 인원에 포함하지 않는다.
- 기존 결과 확정 API와 지원자 결과 공개 계약을 삭제하지 않는다.
- 합격 메일 템플릿과 메일 provider 설정은 변경하지 않는다.

## 검토한 접근

### 1. 자동판정 원본과 검토 결과 분리 유지

자동판정 snapshot이 완전한 행은 `screeningDecision`을 그대로 두고 `screeningReviewerDecision`에 수동 선택 또는 목표 인원 결과를 저장한다. 자동판정 snapshot이 없는 legacy·고정 데모 행은 기존 `screeningDecision` 수동 저장 경로를 사용한다.

자동판정 근거를 보존하고 현재 `effectiveScreeningDecision` 조회 구조를 재사용할 수 있으므로 이 접근을 채택한다.

### 2. 자동판정 값을 직접 덮어쓰기

PR #428처럼 모든 행의 `screeningDecision`을 직접 변경한다. 구현은 짧지만 자동판정 reason/version/report snapshot이 사라져 어떤 결과가 AI 판정이고 어떤 결과가 기업 수정인지 추적할 수 없다.

### 3. 현재 결과 확정 UI에 목표 인원만 추가

검토·확정 모델은 유지하기 쉽지만 사용자가 요청한 이전 드롭다운과 합격 메일 전송 흐름을 복구하지 못한다.

## 전형 상태 드롭다운

드롭다운 편집 가능 조건은 다음과 같다.

- 리포트 상태가 `COMPLETED`다.
- 자동 또는 유효 판정이 `PASS`, `HOLD`, `FAIL` 중 하나다.
- 이미 결과 확정된 행은 기존 계약대로 잠근다.
- 자동판정 정책이 없는 legacy 행은 기존 수동 저장 API를 사용한다.

자동판정 snapshot이 있는 행은 기존 검토 수정 API를 사용한다. 선택값이 자동판정과 같으면 검토 override를 제거하고, 다르면 검토 판정을 저장한다. 메모가 비어 있는 즉시 선택에는 서버 감사용 기본 사유 `지원자 목록에서 수동 전형 상태 변경`을 사용하며, 사용자가 메모를 입력하면 그 값으로 갱신한다.

UI는 기존 전형 상태 셀 안에 드롭다운과 저장 상태를 표시한다. 자동판정 행에는 현재의 `자동 판정` 보조 문구를 유지해 원본 판정이 존재함을 알린다.

## 목표 합격자 수 규칙

선발 대상은 다음 조건을 모두 만족해야 한다.

- 취소되지 않은 지원이다.
- 리포트 상태가 `COMPLETED`다.
- 유효 전형 상태가 `PASS`, `HOLD`, `FAIL` 중 하나다.
- 결과 확정 전 상태다.

최대 선발 가능 인원은 위 대상의 전체 수다. 정렬 규칙은 다음 순서를 사용한다.

1. 최신 리포트 총점 내림차순
2. 제출 시각 오름차순
3. application ID 오름차순

목표 합격자 수가 N이면 정렬 결과의 상위 N명을 `PASS`, 나머지를 `FAIL`로 저장한다. 기존 상태가 `HOLD`인 지원자도 순위에 따라 반드시 `PASS` 또는 `FAIL`로 변경한다.

예를 들어 리포트 완료 판정 가능자가 100명이고 현재 `PASS 20`, `HOLD 10`, `FAIL 70`이면 최대 인원은 100명이다. 목표를 30명으로 설정하면 점수 상위 30명이 합격이 되며 기존 보류·불합격 중 상위권이 승격될 수 있다. 목표를 15명으로 설정하면 기존 합격자 중 점수 하위 5명 이상이 불합격으로 내려가고 전체 상위 15명만 합격으로 남는다.

## 저장과 메일 발송

상단 컨트롤은 PR #428과 같은 `현재 합격`, `목표`, `최대`, `합격 메일 전송` 구성을 사용한다. 현재 합격 수와 최대 인원은 raw 자동판정이 아니라 `effectiveScreeningDecision`과 선발 가능 조건을 기준으로 계산한다.

사용자가 합격 메일 전송을 누르면 서버가 다음 순서로 처리한다.

1. 최신 선발 대상과 점수를 다시 조회한다.
2. 목표 인원의 유효성과 최대 인원 초과 여부를 검증한다.
3. 같은 정렬 규칙으로 합격·불합격 대상 ID를 결정한다.
4. 자동판정 행은 reviewer decision, legacy 행은 screening decision에 결과를 transaction으로 저장한다.
5. 최종 합격 대상자에게만 합격 메일을 발송한다.
6. `SENT` 이력이 있는 합격자는 `SKIPPED`로 처리한다.
7. 발송 실패자가 있으면 실패 대상에 이번 요청으로 적용한 변경을 이전 상태로 복구하고 오류를 반환한다.

응답의 `currentPassCount`, `targetPassCount`, `promotedCount`, `demotedCount`, `sentCount`, `failedCount`, `skippedCount`, `recipients` shape는 유지한다. `promotedCount`와 `demotedCount`는 요청 직전 유효 상태와 최종 상태를 비교해 계산한다.

## API 계약 변경

기존 합격 메일 API의 대상 규칙을 다음과 같이 수정한다.

- 대상: `reportStatus=COMPLETED`이고 `effectiveScreeningDecision IN (PASS, HOLD, FAIL)`인 미확정 지원자
- 최대 인원: 대상 전체 수
- 결과: 상위 N명 `PASS`, 나머지 `FAIL`
- `HOLD` 제외 규칙 삭제
- 자동판정 정책 활성 공고의 호출 차단 삭제

지원자별 전형 상태 수정 API는 자동판정 snapshot 유무에 따라 기존 수동 저장 또는 검토 override 저장을 사용한다. 외부 enum과 응답 shape는 변경하지 않는다.

## 코드 경계

- `docs/03_contracts/api-spec.md`
  - 합격 메일 API의 HOLD 포함, 리포트 완료, 유효 판정 기준을 먼저 갱신한다.
- `docs/03_contracts/automatic-screening-decision.md`
  - 자동판정 후 기업 수동 조정과 목표 인원 선발 규칙을 동기화한다.
- `frontend/src/features/company-recruiting/applicant-list.ts`
  - 편집 가능 조건, 유효 상태 기반 현재 합격 수와 최대 인원을 계산한다.
- `frontend/src/features/company-recruiting/applicant-list.spec.ts`
  - 편집 조건과 PASS/HOLD/FAIL 최대 인원 계산을 검증한다.
- `frontend/src/features/company-recruiting/RecruitmentDetailPage.tsx`
  - PR #428 상단 컨트롤을 복원하고 행별 저장 API를 snapshot 유무에 따라 선택한다.
- `backend/api/src/modules/company-recruiting/service/company-recruiting.service.ts`
  - 자동판정 공고 차단을 제거하고 유효 상태·리포트 완료 기준으로 목표 선발을 계산한다.
- `backend/api/src/modules/company-recruiting/repository/company-recruiting.repository.ts`
  - 자동판정 원본 보존형 일괄 reviewer override와 legacy 직접 판정 저장, 실패 복구를 transaction으로 처리한다.
- 관련 service/repository 테스트
  - HOLD 승격·강등, 점수순 선발, 정책 활성 공고, 미완료 제외, 실패 복구를 검증한다.

## 테스트

테스트를 먼저 추가하고 다음 RED를 확인한다.

- 정책이 없는 리포트 완료 legacy 행도 드롭다운 편집이 가능하다.
- 자동판정 리포트 완료 행은 드롭다운 편집이 가능하고 확정 행은 잠긴다.
- 최대 선발 가능 인원은 유효 `PASS+HOLD+FAIL`이며 미완료·UNDECIDED·RETRY는 제외한다.
- 목표 30명에서 점수 상위 보류·불합격이 합격으로 승격된다.
- 목표를 현재 합격 수보다 줄이면 점수 하위 합격자가 불합격으로 강등된다.
- 동점은 제출 시각과 application ID 순으로 안정적으로 선발된다.
- 자동판정 정책 활성 공고도 목표 인원 선발을 실행할 수 있다.
- 메일은 최종 PASS에만 발송되고 기존 SENT는 SKIPPED다.
- 메일 실패 시 실패 대상의 reviewer/legacy 판정이 이전 상태로 복구된다.

최종 검증은 프런트 applicant-list spec과 typecheck, company-recruiting service/repository 테스트와 typecheck, `git diff --check`, Windows Role B 로컬 하네스로 수행한다.

## 완료 기준

- 솔트룩스 목록의 리포트 완료 판정 가능 행에서 전형 상태 드롭다운을 사용할 수 있다.
- 목표 합격자 수의 최대값에 PASS/HOLD/FAIL 전체가 반영된다.
- 목표 인원을 늘리거나 줄이면 점수순으로 정확히 N명만 PASS가 되고 나머지는 FAIL이 된다.
- 합격 메일은 최종 PASS에게만 발송된다.
- 자동판정 reason/version/report snapshot은 수동 조정 후에도 보존된다.
- 요청 범위 밖 화면과 면접·리포트 생성 로직에는 변경이 없다.
