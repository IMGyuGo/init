# NCS Report Team Codex Prompt

아래 내용을 리포트 구현 담당자가 Codex 새 세션에 그대로 전달한다.

```text
현재 Final_Weapon 프로젝트에서 기업 채용면접 NCS 리포트 소비 영역을 구현합니다.

목표:
- 평가/DB 구현 완료를 기다리지 않고 canonical fixture를 사용해 리포트 화면과 API adapter를 병렬 구현합니다.
- 이후 실제 API-020의 data.report.ncsEvaluation이 연결돼도 UI와 view model을 다시 작성하지 않도록 합니다.

작업 전 반드시 아래 순서로 읽으세요.
1. 루트 AGENTS.md
2. docs/05_agents/AGENTS.md
3. docs/04_implementation/team-split-5dev-1pm.md
4. docs/03_contracts/ncs-final-evaluation.md
5. docs/03_contracts/ncs-report-output-contract.md
6. docs/03_contracts/api-spec.md의 API-020, API-029, API-031
7. docs/02_architecture/data-model.md의 evaluation_reports, report_scores, ncs_answer_evaluations, evidence 구조
8. backend/api, backend/worker, frontend의 담당 폴더 AGENTS.md

계약 기준:
- 입력 정본은 NcsReportEvaluationOutputV1입니다.
- schemaVersion은 ncs-report-evaluation-output-v1입니다.
- profile ID는 JOB_TECHNICAL, COLLABORATION_COMMUNICATION, PROBLEM_SOLVING입니다.
- legacy DIGITAL, COMMUNICATION은 compatibility adapter에서만 변환합니다.
- 질문 하나는 profileEvaluations 1~2개를 가질 수 있습니다.
- 행동 0~3 + 논리 0~2 = 0~5 점수는 producer가 계산합니다.
- profile 평균, weightedScore, totalScore, thresholdResult와 aiDecision도 producer가 계산합니다.
- UI/API consumer에서 점수를 다시 계산하지 마세요.
- INCOMPLETE는 totalScore=null이며 현재 발표용 정책에서 aiDecision=FAIL입니다.
- INCOMPLETE FAIL과 BELOW_THRESHOLD FAIL을 반드시 다른 사유로 표시하세요.
- aiDecision은 AI 추천이며 application screeningDecision을 자동 변경하지 않습니다.
- base/follow-up evidence는 sourceAnswerId와 sourceKind로 구분합니다.
- 전체 transcript, 이력서/JD 원문, 내부 prompt를 NCS report output에 추가하지 마세요.

먼저 현재 브랜치 구현을 읽고 다음을 확인하세요.
- API-020의 현재 report response와 frontend ApplicantEvaluation 타입
- 기존 ncsAnswerEvaluations 기반 view model과 화면
- report loading/generating/failed 상태
- report score, evidence와 manual screening decision 표시 위치
- 사용 중인 테스트 프레임워크와 스타일 패턴

구현 범위:
1. NcsReportEvaluationOutputV1 소비 타입 또는 contract adapter를 추가합니다.
2. API-020의 report.ncsEvaluation을 우선 소비합니다.
3. migration 기간에는 기존 ncsAnswerEvaluations를 V1으로 읽는 compatibility adapter를 둘 수 있지만, 새 점수나 판정을 추측하지 않습니다.
4. docs/03_contracts/ncs-report-output-contract.md의 Complete PASS fixture를 테스트 fixture로 옮깁니다.
5. 같은 shape로 Complete FAIL과 Incomplete Fail-closed fixture를 만듭니다.
6. 리포트에 아래 상태를 구현합니다.
   - 로딩/생성 중
   - 리포트 없음
   - 생성 실패
   - 정상 PASS
   - 정상 기준 미달 FAIL
   - 평가 미완료에 의한 임시 FAIL
7. profile별 평균 0~5, normalized 0~100, weight, weighted score, 유효/필수 문항 수를 표시합니다.
8. 질문 하나 안에서 연결 profile 1~2개의 평가를 구분해 표시합니다.
9. 행동·논리·base·effective score와 꼬리질문 보완 여부를 표시합니다.
10. evidence quote는 sourceKind BASE/FOLLOW_UP을 구분해 표시합니다.
11. strengths/gaps finding은 전달된 evidenceIds가 실제 evidence와 연결될 때만 표시합니다.
12. NCS_EVALUATION_SCOPE notice를 항상 표시하고 incomplete면 INCOMPLETE_FAIL_CLOSED 안내도 표시합니다.
13. 실제 면접관 screening decision과 AI decision을 별도 영역과 별도 label로 표시합니다.

UI 규칙:
- 운영 도구답게 조용하고 비교하기 쉬운 정보 구조를 사용합니다.
- profile 요약을 먼저, 질문/근거 상세는 그 아래에 둡니다.
- 0점은 표시하고 NULL은 점수 산정 불가로 표시합니다.
- FAIL 하나로 합치지 말고 decisionReasonCode를 사용합니다.
- 질문 하나에 profile 두 개가 있어도 질문 row를 복제하지 않습니다.
- 근거 quote를 임의로 수정하거나 줄여 의미를 바꾸지 않습니다.
- 긴 질문, finding, quote가 mobile/desktop에서 겹치지 않게 합니다.
- 기존 디자인 시스템과 lucide/icon 패턴을 따릅니다.
- 카드 안에 카드를 중첩하지 않습니다.

금지 범위:
- ncs-text-evaluator 점수식 수정
- profile 평균/가중치/총점/PASS·FAIL 재계산
- DB schema 또는 migration을 리포트 편의를 위해 임의 변경
- 질문 문구 기반 profile 추측
- INCOMPLETE를 0점으로 변환
- aiDecision으로 application screeningDecision 자동 변경
- frontend에서 DB table shape를 직접 재현
- 테스트 fixture를 production fallback으로 사용

backend projection이 아직 없다면:
- frontend/view model과 fixture를 먼저 구현하세요.
- live API 값이 없을 때 production에서 fixture를 자동 표시하지 마세요.
- API mismatch는 필드명, 현재 타입, 기대 타입을 표로 정리해 producer에게 전달하세요.
- 계약을 임의 변경하지 말고 docs/03_contracts/ncs-report-output-contract.md 변경 리뷰를 요청하세요.

필수 테스트:
- PASS: 총점 84, 세 profile 최소 점수 충족
- FAIL: 총점 80 미만
- FAIL: 총점 80 이상이지만 profile 하나가 3 미만
- INCOMPLETE: totalScore null, aiDecision FAIL, EVALUATION_INCOMPLETE
- 0점과 NULL 표시 구분
- profile 두 개가 연결된 질문 한 row 렌더링
- base/follow-up evidence label 구분
- effectiveScore가 baseScore보다 낮아지지 않는 전달값 표시
- finding의 잘못된 evidence ID 차단
- AI decision과 manual screening decision 분리
- 긴 한글 질문/근거 mobile overflow 없음

작업 순서:
1. 현재 코드와 dirty worktree를 확인합니다.
2. 구현 계획과 변경 파일을 짧게 보고합니다.
3. fixture/type/view model 테스트를 먼저 추가합니다.
4. 기존 화면 패턴에 맞춰 구현합니다.
5. frontend typecheck/test/lint와 담당 역할 하네스를 실행합니다.
6. Playwright 또는 프로젝트 브라우저 도구로 desktop/mobile을 확인합니다.
7. 변경 파일, 검증 결과, API mismatch, cross-owner review 필요 항목을 보고합니다.

소유권:
- 리포트 pipeline과 AI output은 E 리뷰가 필요합니다.
- 기업 지원자 상세 frontend는 B 리뷰가 필요합니다.
- shared enum/DTO와 DB projection 변경은 A 리뷰가 필요합니다.
- screening decision 표시와 발표 문구는 PM 리뷰가 필요합니다.

커밋은 Conventional Commits를 사용합니다. 변경 내용이 3개 이상이면 title과 body bullet을 함께 작성합니다. 사용자가 명시적으로 요청하기 전에는 commit/push하지 마세요.
```

## Expected Handoff From The Report Team

리포트 팀은 작업 후 아래 내용을 회신한다.

1. 구현한 PASS/FAIL/INCOMPLETE 화면과 fixture 경로
2. 현재 API와 V1 계약의 field mismatch 표
3. producer가 추가로 제공해야 할 field 목록
4. 점수를 재계산하지 않았다는 확인
5. desktop/mobile 검증 결과
6. B/E/A/PM cross-owner review 항목
