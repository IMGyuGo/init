import assert from "node:assert/strict";

import { PrismaCandidateReportRepository } from "./prisma-candidate-report.repository";

describe("PrismaCandidateReportRepository", () => {
  it("maps the internal fact clarification reason for report generation", async () => {
    const prisma = {
      followUpQuestion: {
        async findMany() {
          return [{
            followUpId: 8n,
            answerId: 21n,
            content: "C에서 다형성을 어떤 방식으로 구현했나요?",
            generationStatus: "INSERTED",
            policy: "RECRUITING",
            reason: "FACT_CLARIFICATION",
            createdAt: new Date("2026-07-15T12:00:00.000Z"),
          }];
        },
      },
    };
    const repository = new PrismaCandidateReportRepository(prisma as never);

    const followUps = await repository.listFollowUpQuestionsByAnswerIds([21]);

    assert.equal(followUps[0]?.reason, "FACT_CLARIFICATION");
  });

  it("omits incomplete NCS aggregate rows from candidate-facing scores", async () => {
    const prisma = {
      evaluationReport: {
        async findFirst() {
          return {
            reportId: 501n,
            applicationId: 77n,
            sessionId: 901n,
            reportType: "RECRUITING_REPORT",
            status: "COMPLETED",
            totalScore: null,
            summary: null,
            generatedAt: new Date("2026-07-14T00:00:00.000Z"),
            failureCategory: null,
            failureReason: null,
            scores: [
              {
                scoreId: 1n,
                criterionId: null,
                score: null,
                rationale: "NCS evaluation is incomplete.",
                criterion: null,
                evidences: [],
              },
              {
                scoreId: 2n,
                criterionId: 10n,
                score: 82,
                rationale: "Stored candidate feedback score.",
                criterion: { tag: { name: "문제 해결력" } },
                evidences: [],
              },
            ],
          };
        },
      },
    };
    const repository = new PrismaCandidateReportRepository(prisma as never);

    const report = await repository.findLatestReportByApplication(77, 901);

    assert.deepEqual(report?.scores, [
      {
        scoreId: 2,
        criterionId: 10,
        criterionName: "문제 해결력",
        score: 82,
        rationale: "Stored candidate feedback score.",
        evidences: [],
      },
    ]);
  });
});
