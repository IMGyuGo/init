import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";

import type { CandidateRecruitingReportView } from "./api";

const require = createRequire(import.meta.url);
require.extensions[".css"] = (module) => {
  const styles = new Proxy({}, { get: (_target, property) => String(property) });
  module.exports = { __esModule: true, default: styles };
};

const { CandidateScreeningResult } = require("./CandidateScreeningResult") as typeof import("./CandidateScreeningResult");

function renderResult(
  screeningDecision: string,
  status: CandidateRecruitingReportView["status"] = "COMPLETED",
): string {
  const report = {
    applicationId: 17,
    sessionId: 24,
    reportType: "RECRUITING_REPORT",
    status,
    applicationStatus: "COMPLETED",
    interviewStatus: "COMPLETED",
    resultPublicationStatus: "CONFIRMED",
    screeningDecision,
    screeningResultConfirmedAt: "2026-07-20T10:00:00.000Z",
    companyName: "Init Labs",
    jobTitle: "백엔드 엔지니어",
    generatedAt: "2026-07-20T10:00:00.000Z",
    candidateMessage: "지원자용 결과입니다.",
    nextStepLabel: "지원현황 보기",
    scores: [],
    answers: [],
    visibilityPolicy: {
      candidateFacingOnly: true,
      excludesDetailedScores: true,
      excludesEvaluationEvidence: true,
      excludesInternalMemo: true,
      excludesManualEvaluation: true,
    },
  } as CandidateRecruitingReportView;

  return renderToStaticMarkup(
    <CandidateScreeningResult
      report={report}
      formatDateTime={() => "2026. 7. 20. 오전 10:00"}
      statusView={<span>완료</span>}
    />,
  );
}

const retryMarkup = renderResult("RETRY", "FAILED");
assert.match(retryMarkup, /결과 확인 중/);
assert.match(retryMarkup, /면접 결과를 다시 확인하고 있습니다/);
assert.match(retryMarkup, /처리가 완료되면 이 화면에서 결과를 안내해드릴게요/);
assert.doesNotMatch(retryMarkup, /결과 생성일/);
assert.doesNotMatch(retryMarkup, /합격했습니다|전형은 종료되었습니다|결과가 보류/);

const unknownMarkup = renderResult("PENDING_REVIEW");
assert.match(unknownMarkup, /결과 확인 중/);
assert.match(unknownMarkup, /전형 결과를 확인하고 있습니다/);
assert.doesNotMatch(unknownMarkup, /결과 생성일/);

const holdMarkup = renderResult("HOLD");
assert.match(holdMarkup, /자동 판정 결과가 보류 구간에 있어 추가 검토가 필요합니다/);
assert.match(holdMarkup, /결과 생성일/);
