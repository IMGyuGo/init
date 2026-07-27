import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { InMemoryReportRepository } from "../src/modules/report/repository/in-memory-report.repository";
import { AiReportPipelineService } from "../src/modules/report/service/ai-report-pipeline.service";
import { GuardrailService } from "../src/modules/report/service/guardrail.service";
import { MockAiReportProvider } from "../src/modules/report/service/mock-ai-report.provider";
import { GenerateReportRequest } from "../src/modules/report/report.types";

interface SmokeInput {
  reportId?: number;
  body: GenerateReportRequest;
}

const defaultInput: SmokeInput = {
  reportId: 201,
  body: {
    reportType: "RECRUITING_REPORT",
    jobDescription: "NestJS backend developer",
    criteria: [
      {
        criterionId: 1,
        name: "Problem solving",
        weight: 50
      },
      {
        criterionId: 2,
        name: "Backend design",
        weight: 50
      }
    ],
    answers: [
      {
        answerId: 10,
        question: "Tell me about an outage.",
        transcript:
          "I found an N+1 query from logs and query plans, optimized the query, and added cache."
      }
    ],
    documentText: "Candidate has NestJS, PostgreSQL, and Redis experience."
  }
};

async function main(): Promise<void> {
  const input = loadInput(process.argv[2]);
  const service = new AiReportPipelineService(
    new MockAiReportProvider(),
    new GuardrailService(),
    new InMemoryReportRepository()
  );

  const result = await service.generate({
    currentUser: {
      userId: 1,
      userType: "COMPANY",
      companyId: 1
    },
    reportId: input.reportId ?? 201,
    body: input.body
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function loadInput(inputPath: string | undefined): SmokeInput {
  if (!inputPath) {
    return defaultInput;
  }

  return JSON.parse(readFileSync(resolve(inputPath), "utf8")) as SmokeInput;
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
