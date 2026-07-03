# AI Job Contracts

E 파트 AI 작업을 로컬 개발과 팀 연동에서 호출할 때 필요한 최소 입력, 상태 조회, 출력 형태를 정리한다.

상세 필드의 최종 기준은 `docs/03_contracts/api-spec.md`이고, 이 문서는 구현자용 빠른 확인 자료다.

## Dev Auth Headers

| Caller | Headers |
| --- | --- |
| Company | `X-Dev-User-Id: 1`, `X-Dev-User-Type: COMPANY`, `X-Dev-Company-Id: 1` |
| Candidate | `X-Dev-User-Id: 2`, `X-Dev-User-Type: CANDIDATE`, `X-Dev-Candidate-Id: 1` |
| Admin/System | `X-Dev-User-Id: 9`, `X-Dev-User-Type: ADMIN` |

각 담당자는 임시 인증 값을 하드코딩해서 직접 쓰지 말고, API 서버의 공통 CurrentUser 계약을 통해 userId, userType, companyId, candidateId를 전달받는 구조를 유지한다.

## Async Response

장기 AI 작업 생성 API는 즉시 결과 본문을 만들지 않고 `202 Accepted`와 `processLogId`를 반환한다.

```json
{
  "data": {
    "processLogId": 101,
    "processType": "REPORT_GENERATE",
    "status": "PENDING",
    "queued": true,
    "inputRef": "{\"kind\":\"REPORT_PIPELINE_STEP\"}"
  }
}
```

화면은 아래 상태 조회 API를 polling한다.

```http
GET /api/v1/ai/jobs/101/status
```

완료 응답 예시는 다음과 같다.

```json
{
  "data": {
    "processLogId": 101,
    "processType": "QUESTION_GENERATE",
    "status": "COMPLETED",
    "output": {
      "sourceProcessLogId": 101,
      "items": ["Question 1", "Question 2"],
      "questionCandidates": [
        {
          "content": "Question 1",
          "category": "채용면접",
          "difficulty": "MEDIUM",
          "criterionId": 1,
          "criterionTitle": "문제 해결력",
          "expectedKeywords": ["경험", "근거", "성과"],
          "suggestionReason": "JD와 평가 기준을 기준으로 검증 가능한 답변을 유도합니다.",
          "questionType": "TECHNICAL"
        }
      ],
      "reviewRequired": true,
      "reviewStatus": "PENDING_REVIEW",
      "targetTables": ["question_bank"],
      "postingId": 2
    }
  }
}
```

실패 응답은 재시도 가능 여부를 포함한다.

```json
{
  "data": {
    "processLogId": 101,
    "processType": "REPORT_GENERATE",
    "status": "FAILED",
    "failure": {
      "category": "RETRYABLE",
      "reason": "SQS publish failed: timeout",
      "retryable": true
    }
  }
}
```

## Minimum Request Matrix

| API | Caller | Required Input | Final Save Policy |
| --- | --- | --- | --- |
| `POST /reports/{reportId}/evaluation-context` | Company | reportType=`RECRUITING_REPORT`, company, posting, criteria, application, answers, manualEvaluations? | status output에 context 반환 |
| `POST /reports/{reportId}/answer-evaluation` | Company | reportType=`RECRUITING_REPORT`, criteria, answers, documentText? | guardrail 통과 후 `report_scores`, `report_evidences` 저장 |
| `POST /reports/{reportId}/communication-analysis` | Company | reportType=`RECRUITING_REPORT`, consentConfirmed, mediaQuality, metrics? | 보조 지표로만 저장, decisionWeight는 0 |
| `POST /reports/{reportId}/generate` | Company | reportType=`RECRUITING_REPORT`, jobDescription, criteria, answers | guardrail 통과 후 리포트/점수/근거 최종 저장 |
| `POST /candidate/mock-interview/reports/{reportId}/generate` | Candidate | reportType=`MOCK_INTERVIEW_REPORT`, jobDescription, criteria, answers | 합격/탈락 판단 표현 금지 |
| `POST /candidate/documents/extract` | Candidate | applicationId, documentId, fileId, s3Key | 원본 파일은 DB 저장 금지, S3 key 참조 |
| `POST /candidate/mock-interviews/{sessionId}/stt` | Candidate | answerId, audioFileId, audioS3Key | transcript 없을 때만 저장 |
| `POST /candidate/interviews/{sessionId}/stt` | Candidate | answerId, audioFileId, audioS3Key | transcript 없을 때만 저장 |
| `POST /candidate/mock-interviews/{sessionId}/follow-up-question` | Candidate | answerId, previousQuestion, transcript | 모의면접 표현 정책 적용 |
| `POST /candidate/mock-interviews/{sessionId}/follow-up-questions/insert` | Candidate | processLogId | MVP 임시 브릿지. 완료된 FOLLOW_UP 작업 결과를 면접 질문 흐름에 추가 |
| `POST /candidate/interviews/{sessionId}/follow-up-question` | Candidate | answerId, previousQuestion, transcript, jobDescription 또는 documentSummary | 채용면접 표현 정책 적용 |
| `POST /candidate/interviews/{sessionId}/follow-up-questions/insert` | Candidate | processLogId | MVP 임시 브릿지. 완료된 FOLLOW_UP 작업 결과를 면접 질문 흐름에 추가 |
| `POST /company/interviews/evaluation-criteria/suggest` | Company | postingId, jobDescription, talentProfile, evaluationPolicy | reviewRequired draft 반환, 확정 전 최종 저장 금지 |
| `POST /company/interviews/questions/generate` | Company | postingId, jobDescription, questionCount | reviewRequired draft 반환 |
| `POST /company/interviews/question-sets` | Company | postingId, questionCount, criteria, questionTypes | reviewRequired draft 반환 |
| `POST /candidate/mock-interviews/questions/generate` | Candidate | questionCount | JD/posting/기업 기준 없이 동작 |
| `POST /ai/guardrails/validate` | Admin/System | reportType, target, scores, summary? | PASS/BLOCKED/REGENERATED 기록 |

## Payload Examples

평가 컨텍스트 입력:

```json
{
  "reportType": "RECRUITING_REPORT",
  "company": {
    "companyId": 1,
    "name": "Init Corp",
    "talentProfile": "Pragmatic problem solver"
  },
  "posting": {
    "postingId": 2,
    "title": "Backend Engineer",
    "jobDescription": "NestJS and PostgreSQL backend engineer"
  },
  "application": {
    "applicationId": 3,
    "candidateId": 4,
    "documentText": "Built Redis cache and improved API latency."
  },
  "criteria": [
    {
      "criterionId": 1,
      "name": "Backend ownership",
      "description": "Owns server-side design and operations",
      "weight": 50
    }
  ],
  "answers": [
    {
      "answerId": 10,
      "question": "How did you use Redis?",
      "transcript": "I used Redis cache to reduce repeated database reads."
    }
  ],
  "manualEvaluations": [
    {
      "reviewerUserId": 7,
      "decision": "HOLD",
      "memo": "Needs additional system design discussion."
    }
  ]
}
```

서류 추출 입력:

```json
{
  "applicationId": 3,
  "documentId": 8,
  "fileId": 9,
  "s3Key": "candidate/4/resume.pdf"
}
```

STT 입력:

```json
{
  "answerId": 10,
  "audioFileId": 11,
  "audioS3Key": "candidate/4/answer-10.wav"
}
```

채용 꼬리질문 입력:

```json
{
  "answerId": 10,
  "previousQuestion": "How did you use Redis?",
  "transcript": "I improved read performance with Redis cache.",
  "jobDescription": "Backend engineer with Redis operations."
}
```

질문 생성 draft 출력:

```json
{
  "sourceProcessLogId": 101,
  "items": ["Question 1", "Question 2"],
  "questionCandidates": [
    {
      "content": "Question 1",
      "category": "채용면접",
      "difficulty": "MEDIUM",
      "criterionId": 1,
      "criterionTitle": "문제 해결력",
      "expectedKeywords": ["경험", "근거", "성과"],
      "suggestionReason": "JD와 평가 기준을 기준으로 검증 가능한 답변을 유도합니다.",
      "questionType": "TECHNICAL"
    }
  ],
  "reviewRequired": true,
  "reviewStatus": "PENDING_REVIEW",
  "targetTables": ["question_bank"],
  "postingId": 2
}
```

평가 기준 추천 draft 출력:

```json
{
  "sourceProcessLogId": 102,
  "items": ["문제 해결력", "조직 적합도"],
  "criteriaSuggestions": [
    {
      "title": "문제 해결력",
      "description": "JD 맥락: NestJS와 PostgreSQL 기반 백엔드 개발",
      "weight": 40,
      "order": 1,
      "suggestionReason": "직무 요구사항에서 문제 분석과 해결 역량 검증이 필요합니다.",
      "category": "직무 역량"
    }
  ],
  "reviewRequired": true,
  "reviewStatus": "PENDING_REVIEW",
  "targetTables": ["criterion_tags", "evaluation_criteria"],
  "postingId": 2
}
```

질문 세트 draft 출력:

```json
{
  "sourceProcessLogId": 103,
  "items": ["TECHNICAL question 1 for 문제 해결력"],
  "questionSetPreview": [
    {
      "criterionId": 1,
      "criterionTitle": "문제 해결력",
      "questions": [
        {
          "content": "TECHNICAL question 1 for 문제 해결력",
          "category": "질문 세트",
          "difficulty": "MEDIUM",
          "criterionId": 1,
          "criterionTitle": "문제 해결력",
          "expectedKeywords": ["상황", "행동", "결과"],
          "suggestionReason": "평가 기준별 질문 세트 구성을 위해 선택된 후보입니다.",
          "questionType": "TECHNICAL"
        }
      ]
    }
  ],
  "reviewRequired": true,
  "reviewStatus": "PENDING_REVIEW",
  "targetTables": ["question_bank", "interview_question_sets"],
  "postingId": 2
}
```

## C 면접 설정 화면 적용 규칙

C 화면은 E worker가 반환한 draft output을 자동 저장하지 않는다. 화면은 아래 규칙으로 미리보기와 수동 적용 상태만 관리한다.

| Output field | C 화면 표시 | 사용자 적용 | 중복/빈 결과 처리 |
| --- | --- | --- | --- |
| `criteriaSuggestions[]` | 평가 기준 추천 목록 | 사용자가 태그를 선택하거나 자동 매칭된 태그를 확인한 뒤 평가 기준 draft에 추가 | 이미 선택된 태그는 `적용됨`으로 표시하고 중복 추가하지 않는다. 적용 시 배점 합계가 100을 넘으면 적용을 막는다. |
| `questionCandidates[]` | JD 질문 후보 목록 | 사용자가 평가 기준을 선택한 뒤 기존 `POST /company/interviews/questions`로 질문 뱅크에 저장 | 같은 공고에 동일한 활성 질문이 있으면 `저장됨`으로 표시하고 중복 저장하지 않는다. |
| `questionSetPreview[]` | 평가 기준별 질문 세트 후보 | 사용자가 후보별 포함/제외를 선택한 뒤 기존 `POST /company/interviews/question-sets/confirm`으로 확정 | 질문 뱅크의 활성 질문과 매칭되지 않는 후보는 확정 대상에서 제외한다. 선택된 확정 대상이 없으면 확정을 막는다. |

AI 결과가 비어 있거나 `guardrail.result=BLOCKED`이면 C 화면은 최종 저장을 시도하지 않고 한글 안내 문구와 재요청 흐름을 제공한다. `failure.category`, `failure.reason`, `failure.retryable`은 사용자 문구 변환에 사용하며 원문을 그대로 장문 노출하지 않는다.

## C AI 예외 상태 QA 기준

| 상태 | Worker/API 응답 조건 | C 화면 기대 동작 | 저장/확정 가능 여부 |
| --- | --- | --- | --- |
| 실패 | `status=FAILED`, `failure.reason` 존재 | 실패 badge와 한글 안내 문구, `다시 요청` 버튼 표시 | 불가 |
| 빈 평가 기준 결과 | `status=COMPLETED`, `criteriaSuggestions=[]` | "추천 가능한 평가 기준 결과가 없습니다" 계열 안내 표시 | 불가 |
| 빈 질문 후보 결과 | `status=COMPLETED`, `questionCandidates=[]` | "저장 가능한 질문 후보가 없습니다" 계열 안내 표시 | 불가 |
| 빈 질문 세트 결과 | `status=COMPLETED`, `questionSetPreview=[]` | "확정 가능한 질문 세트 결과가 없습니다" 계열 안내 표시 | 불가 |
| Guardrail 차단 | `output.guardrail.result=BLOCKED` 또는 실패 reason에 guardrail 포함 | 정책 검수 차단 안내와 재요청 흐름 표시 | 불가 |

QA는 정상 완료 흐름과 별개로 위 5개 상태를 최소 1회씩 확인한다. C 화면은 예외 상태에서 기존 `evaluation_criteria`, `question_bank`, `interview_question_sets`에 자동 저장을 시도하지 않아야 한다.

리포트 생성 완료 출력:

```json
{
  "report": {
    "reportId": 1,
    "reportType": "RECRUITING_REPORT",
    "status": "COMPLETED",
    "summary": "Evidence-backed backend ownership is strong.",
    "totalScore": 84
  },
  "scores": [
    {
      "criterionId": 1,
      "criterionName": "Backend ownership",
      "score": 84,
      "rationale": "The answer included concrete Redis cache evidence.",
      "evidences": [
        {
          "sourceType": "INTERVIEW_ANSWER",
          "answerId": 10,
          "text": "I used Redis cache to reduce repeated database reads."
        }
      ]
    }
  ],
  "guardrail": {
    "result": "PASS",
    "reason": null
  }
}
```

## Coordination Notes

- A는 SQS queue URL, S3 bucket, AI provider secret, worker 배포/재시작을 제공한다.
- D는 파일 원본을 API payload에 넣지 않고 S3 업로드 후 fileId와 storage key만 E API에 전달한다.
- C는 평가 기준/질문 생성 화면에서 `reviewRequired=true` 결과를 사용자 확정 전 draft로 취급한다. 사용자 화면 상태는 `대기 중`, `처리 중`, `완료`, `실패` 한글 라벨로 표시한다.
- C는 `criteriaSuggestions`, `questionCandidates`, `questionSetPreview`를 자동 저장하지 않고 미리보기로 표시한 뒤 사용자가 선택한 항목만 기존 C 저장 API에 반영한다.
- D는 STT와 꼬리질문 입력으로 `answerId`, `audioFileId`, `audioS3Key`, transcript를 넘긴다.
- B는 리포트 화면에서 `evaluation_reports.status`와 `GET /ai/jobs/{processLogId}/status` 결과를 함께 표시한다.
- E는 guardrail PASS/REGENERATED 전에는 `evaluation_reports`, `report_scores`, `report_evidences`, `question_bank`, `evaluation_criteria`에 최종 저장하지 않는다.
