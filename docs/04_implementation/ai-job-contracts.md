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

상태 조회는 job 생성자와 현재 사용자가 일치할 때만 허용한다. ADMIN은 운영 조회를 허용하고, COMPANY job은 `userId`와 `companyId`, CANDIDATE job은 `userId`와 `candidateId`를 모두 비교한다. 불일치하면 `403 COMMON_FORBIDDEN`을 반환한다.

완료 응답 예시는 다음과 같다.

```json
{
  "data": {
    "processLogId": 101,
    "processType": "QUESTION_GENERATE",
    "status": "COMPLETED",
    "output": {
      "sourceProcessLogId": 101,
      "providerMode": "openai",
      "providerSource": "OPENAI_QUESTION_GENERATION",
      "model": "gpt-4o-mini",
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

### Provider provenance와 운영 안전 규칙

모든 AI worker 완료 output은 실제 실행 경로를 구분할 수 있도록 아래 필드를 포함한다.

| Field | Value | Rule |
| --- | --- | --- |
| `providerMode` | `openai`, `local`, `mock` | 실제 외부 provider, 로컬 결정론적 parser, mock 실행 여부를 나타낸다. |
| `providerSource` | 작업별 고정 source 문자열 | `OPENAI_QUESTION_GENERATION`, `OPENAI_REPORT_GENERATION`, `OPENAI_AUDIO_TRANSCRIPTION`, `DETERMINISTIC_MOCK`처럼 결과 생성 경로를 나타낸다. |
| `model` | nullable string | 외부 모델을 호출한 경우 실제 모델명을 기록한다. |

- `NODE_ENV=production`인 worker는 `AI_PROVIDER_MODE=openai`와 `AI_STT_PROVIDER=openai`를 모두 요구한다. 하나라도 `mock`이거나 생략되면 worker는 시작하지 않는다.
- local/CI의 결정론적 fixture는 `mock`을 계속 사용할 수 있지만 완료 output에 `providerMode=mock`, `providerSource=DETERMINISTIC_MOCK`을 명시한다.
- `openai` 모드에서 지원하지 않는 process type을 mock 결과로 조용히 대체해서는 안 된다. 운영 연결 전 실제 adapter가 없는 process type은 명시적으로 실패시킨다.
- provider mode와 source는 화면 표시용 추정값이 아니라 worker가 결과 생성 시 기록하는 정본이다.

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
| `POST /reports/{reportId}/generate` | Company | reportType=`RECRUITING_REPORT`, jobDescription, criteria, answers, session snapshot의 ncsScoringVersion/ncsSessionPolicy | guardrail 통과 후 리포트/점수/근거 최종 저장 |
| `POST /candidate/mock-interview/reports/{reportId}/generate` | Candidate | reportType=`MOCK_INTERVIEW_REPORT`, jobDescription, criteria, answers | 합격/탈락 판단 표현 금지 |
| `POST /candidate/documents/extract` | Candidate | applicationId, documentId, fileId, s3Key | 원본 파일은 DB 저장 금지, S3 key 참조 |
| `POST /candidate/mock-interviews/{sessionId}/stt` | Candidate | answerId, audioFileId, audioS3Key | transcript 없을 때만 저장 |
| `POST /candidate/interviews/{sessionId}/stt` | Candidate | answerId, audioFileId, audioS3Key | transcript 없을 때만 저장 |
| `POST /candidate/mock-interviews/{sessionId}/follow-up-question` | Candidate | answerId, previousQuestion, transcript, profileContext(V1, server-built) | 모의면접 표현 정책과 guardrail 통과 후 답변 문맥을 포함한 private session question을 원 질문 바로 다음에 원자적으로 추가. 불필요·실패·timeout이면 다음 기본 질문으로 복구 |
| `POST /candidate/interviews/{sessionId}/follow-up-question` | Candidate | answerId, previousQuestion, transcript, jobDescription 또는 documentSummary, profileContext(V1, server-built) | NCS 근거와 fact gate를 병렬 확인한다. 둘 중 하나라도 보완이 필요하면 답변의 구체 표현을 포함한 동일 mode·답변시간의 private session question 하나만 원 질문 바로 다음에 추가 |
| `POST /company/recruitments/ai-draft` | Company | title(max 120), jobRole(max 80), keywords?(max 10, each max 40), summary?(max 3000), careerRequirement?, employmentType?, workLocation? | reviewRequired draft 반환, 확정 전 최종 저장 금지 |
| `POST /company/interviews/questions/generate` | Company | postingId, jobDescription, questionCount | reviewRequired draft 반환 |
| `POST /candidate/mock-interviews/questions/generate` | Candidate | questionCount, folderContext?, profileContext(V1, server-built) | JD/posting/기업 기준 없이 동작 |
| `POST /ai/guardrails/validate` | Admin/System | reportType, target, scores, summary? | PASS/BLOCKED/REGENERATED 기록 |

## REPORT_GENERATE Nonverbal Metadata

`REPORT_GENERATE` jobs may receive `answers[].nonverbalMetadata` when the answer was recorded through the browser interview runtime.

Example answer input:

```json
{
  "answerId": 10,
  "questionId": 1,
  "question": "Describe a technical problem and how you solved it.",
  "transcript": "I separated upload, API, DB, queue, and worker stages and fixed the missing state transition.",
  "nonverbalMetadata": {
    "cameraWarnings": 0,
    "microphoneWarnings": 1,
    "longSilenceCount": 1,
    "shortAnswerCount": 0,
    "testModeUsed": false,
    "voicePeakLevel": 12,
    "lowAudioFrameCount": 48,
    "observedAudioFrameCount": 320,
    "cameraDisconnectedCount": 0,
    "integrityEvents": [
      {
        "type": "TAB_HIDDEN",
        "occurredAt": "2026-07-09T10:00:00.000Z",
        "durationMs": 4200
      },
      {
        "type": "VOICE_MOUTH_MISMATCH",
        "occurredAt": "2026-07-09T10:00:08.000Z",
        "durationMs": 3100
      },
      {
        "type": "VOICE_WITHOUT_FACE",
        "occurredAt": "2026-07-09T10:00:12.000Z",
        "durationMs": 2800
      },
      {
        "type": "STATIC_VIDEO_FRAME",
        "occurredAt": "2026-07-09T10:00:18.000Z",
        "durationMs": 5200
      },
      {
        "type": "EARLY_SCREEN_AWAY",
        "occurredAt": "2026-07-09T10:00:02.000Z"
      }
    ],
    "integritySummary": {
      "screenAwayCount": 1,
      "cameraLostCount": 0,
      "faceMissingCount": 0,
      "faceOutOfFrameCount": 0,
      "multipleFacesCount": 0,
      "facePositionShiftCount": 0,
      "gazeAwayCount": 0,
      "voiceMouthMismatchCount": 1,
      "voiceWithoutFaceCount": 1,
      "staticVideoFrameCount": 1,
      "earlyScreenAwayCount": 1,
      "faceDetectionSupported": true,
      "faceDetectionFrameCount": 12,
      "personDetectionSupported": true,
      "personDetectionFrameCount": 6,
      "gazeDetectionSupported": true,
      "gazeDetectionFrameCount": 12,
      "mouthSyncSupported": true,
      "mouthSyncFrameCount": 12,
      "mouthSyncMismatchFrameCount": 3,
      "videoFrameMotionSupported": true,
      "videoFrameSampleCount": 12,
      "staticVideoFrameSampleCount": 6,
      "totalAwayDurationMs": 4200,
      "maxAwayDurationMs": 4200,
      "suspicionLevel": "HIGH"
    }
  }
}
```

Policy:

- The metadata is auxiliary practice context. It may surface cheating-suspicion signals for mock interview practice, but it is not a final cheating decision.
- For `MOCK_INTERVIEW_REPORT`, the worker may use `integrityEvents` and `integritySummary` to produce practice feedback about screen/tab leaving, early screen leaving right after the question starts, camera loss, face missing/out of frame, audio input while no face is detected, multiple people detected by face or person-object detection, large face-position shift, long gaze away from the screen, static video frames, or voice-mouth mismatch during recording.
- For `MOCK_INTERVIEW_REPORT`, short-answer, long-silence, and low-audio signals are recording or answer-quality signals, not cheating signals. They may apply conservative delivery-quality caps, but they must be explained as practice feedback.
- The worker must not claim that the voice is AI-generated. `VOICE_MOUTH_MISMATCH` only means audio was detected while mouth movement was missing or too weak in sampled frames.
- For `RECRUITING_REPORT`, the metadata must not be used as a hiring score input or pass/fail signal. If a future company-facing UI exposes it, it must be separated as auxiliary media/communication quality context.
- The worker must not infer appearance, facial expression, eye contact, voice tone, age, gender, school, region, disability, health, or other sensitive attributes from this metadata.

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

문서 추출 worker는 S3의 PDF magic bytes와 크기를 검증한 뒤 PDF parser로 실제 본문을 추출한다. `outputRef`에는 이력서 원문을 기록하지 않고 `providerMode=local`, `providerSource=PDF_TEXT_EXTRACTION`, `pageCount`, `extractedCharCount`, `truncated`만 기록한다. 텍스트가 없는 스캔 PDF와 손상 PDF는 `application_documents.parse_status=FAILED`로 처리하며 placeholder 본문을 저장하지 않는다.

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

지원자 프로필 AI 컨텍스트는 API 서버가 인증된 candidateId로만 만든다. 클라이언트가 같은 이름의 필드를 보내면 validation 단계에서 거부한다.

```ts
type CandidateProfileAiContextV1 = {
  schemaVersion: 1;
  summary: string | null;
  githubUrl: string | null;
  blogUrl: string | null;
  portfolioUrl: string | null;
  educations: Array<Record<string, string | null>>;
  careers: Array<Record<string, string | boolean | null>>;
  activities: Array<Record<string, string | boolean | null>>;
  credentials: Array<Record<string, string | null>>;
};
```

이름, 이메일, 전화번호, candidateId와 자식 PK는 포함하지 않는다. 섹션별 최대 5개, summary 1,000자, responsibilities/description 각 500자, 전체 직렬화 20,000자 제한을 적용한다. `input_ref`에는 원문 대신 schemaVersion/counts/charLength/contextHash/profileUpdatedAt만 저장한다.

질문 생성 draft 출력:

```json
{
  "sourceProcessLogId": 101,
  "providerMode": "openai",
  "providerSource": "OPENAI_QUESTION_GENERATION",
  "model": "gpt-4o-mini",
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

실제 질문 생성 규칙:

- `AI_PROVIDER_MODE=openai`에서는 공통 질문과 개인화 질문을 모두 OpenAI question provider로 생성한다. provider 누락 시 deterministic mock으로 대체하지 않고 job을 실패시킨다.
- worker가 final save에서 생성한 후속 job은 동일 AI SQS queue에 발행한다. worker ECS task role은 queue ARN에 대한 `sqs:SendMessage`를 가져야 하며, 발행 실패 시 child process와 개인화 질문 batch를 `FAILED`로 보상한다.
- `RESUME_QUESTION_GENERATE` process가 15분 이상 `PENDING`이고 최신 개인화 질문 batch가 `GENERATING`이면 worker가 저장된 message envelope를 재발행한다. 동일 `processLogId` 중복 delivery는 claim으로 한 번만 실행한다.
- 공통 질문은 저장된 JD와 NCS 평가 기준을 입력으로 사용하고, 개인화 질문은 동일 입력에 실제 PDF 추출 이력서 본문을 추가한다.
- 개인화 질문 provider 입력에서 이메일과 전화번호를 제거하고 이력서 본문은 최대 50,000자로 제한한다. 원문은 outputRef나 질문 metadata에 복제하지 않는다.
- HTML/editor markup, 공고·회사·직무 접두어, 15자 미만 또는 180자 초과 질문, 동일·유사 질문, 동일 종결 표현의 과도한 반복은 저장 후보에서 제외하고 재생성한다.
- NCS 질문은 정해진 재생성 횟수 안에 요청 수만큼 `alignmentStatus=ALIGNED` 결과를 만들지 못하면 job을 실패시킨다. `LOW_ALIGNMENT` 또는 `REVIEW_REQUIRED` 질문을 공통/개인화 질문으로 자동 대체하지 않는다.

## C 면접 설정 화면 적용 규칙

C 화면은 고정 NCS 3개 평가 기준과 E worker가 반환한 정렬 검증 질문 결과를 아래 규칙으로 적용한다.

| Output field | C 화면 표시 | 사용자 적용 | 중복/빈 결과 처리 |
| --- | --- | --- | --- |
| `questionCandidates[]` | 하단 공통 질문 목록 | `ALIGNED` 결과를 기존 `POST /company/interviews/questions`로 즉시 저장하고 사용자는 Drawer에서 수정·삭제 | 같은 공고의 동일 질문은 중복 저장하지 않는다. 정렬 미통과 또는 평가 기준 연결 실패 질문은 저장하지 않는다. |

평가 기준 추천 AI job은 사용하지 않는다. 면접관은 `JOB_TECHNICAL`, `COLLABORATION_COMMUNICATION`, `PROBLEM_SOLVING` 세 기준의 가중치와 합격점만 조정한다.

별도의 `QUESTION_SET_GENERATE` draft와 질문 세트 미리보기 UI는 사용하지 않는다. 사용자가 3단계로 이동할 때 현재 하단 공통 질문 목록을 `POST /company/interviews/question-sets/confirm`으로 한 번에 확정한다.

AI 결과가 비어 있거나 `guardrail.result=BLOCKED`이면 C 화면은 최종 저장을 시도하지 않고 한글 안내 문구와 재요청 흐름을 제공한다. `failure.category`, `failure.reason`, `failure.retryable`은 사용자 문구 변환에 사용하며 원문을 그대로 장문 노출하지 않는다.

## C AI 예외 상태 QA 기준

| 상태 | Worker/API 응답 조건 | C 화면 기대 동작 | 저장/확정 가능 여부 |
| --- | --- | --- | --- |
| 실패 | `status=FAILED`, `failure.reason` 존재 | 실패 badge와 한글 안내 문구, `다시 요청` 버튼 표시 | 불가 |
| 빈 질문 후보 결과 | `status=COMPLETED`, `questionCandidates=[]` | "저장 가능한 질문 후보가 없습니다" 계열 안내 표시 | 불가 |
| Guardrail 차단 | `output.guardrail.result=BLOCKED` 또는 실패 reason에 guardrail 포함 | 정책 검수 차단 안내와 재요청 흐름 표시 | 불가 |

QA는 정상 완료 흐름과 별개로 위 예외 상태를 최소 1회씩 확인한다. C 화면은 빈 결과 또는 차단 상태에서 `evaluation_criteria`, `question_bank`, `interview_question_sets`에 저장을 시도하지 않아야 한다.

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
- C는 질문 생성 화면에서 `reviewRequired=true` 결과 중 guardrail과 NCS 정렬 검증을 통과한 질문만 공통 질문 목록에 저장한다. 사용자는 Drawer에서 수정·삭제하고 다음 단계 이동으로 목록 전체를 확정한다. 사용자 화면 상태는 `대기 중`, `처리 중`, `완료`, `실패` 한글 라벨로 표시한다.
- C는 고정 NCS 3개 평가 기준을 사용하고, 정렬 검증된 `questionCandidates`를 하단 공통 질문 목록에 반영한다. 사용자가 다음 단계로 이동할 때 목록을 활성 질문 세트로 확정한다.
- D는 STT와 꼬리질문 입력으로 `answerId`, `audioFileId`, `audioS3Key`, transcript를 넘긴다.
- B는 리포트 화면에서 `evaluation_reports.status`와 `GET /ai/jobs/{processLogId}/status` 결과를 함께 표시한다.
- E는 guardrail PASS/REGENERATED 전에는 `evaluation_reports`, `report_scores`, `report_evidences`, `question_bank`, `evaluation_criteria`에 최종 저장하지 않는다.
- E는 `transcript`를 실제 답변 텍스트 전용으로 유지한다. 실제 음성 인식 실패로 transcript가 없는 답변은 `evaluationStatus=STT_UNAVAILABLE`, `transcriptUnavailableReason`으로 사유를 분리하고, 답변별 NCS 점수와 최종 리포트 점수는 `NULL`로 유지한다. 평가 근거와 가짜 0점 `ReportScore`는 생성하지 않는다.
- `STT_RETRYABLE` worker 자동 재시도와 provider timeout/실패는 지원자 재답변 횟수에 포함하지 않는다. `REANSWER_REQUIRED`만 지원자 재답변 대상으로 투영하고 같은 답변에 한 번만 허용한다.
- 과거 `STT_UNAVAILABLE_TEMP_ZERO` 데이터는 조회 호환만 유지한다. 신규 worker/API/mock provider는 해당 rubric 또는 0점 행을 생성하지 않는다.
