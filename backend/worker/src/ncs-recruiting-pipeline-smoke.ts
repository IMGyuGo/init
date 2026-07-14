import assert from "node:assert/strict";
import path from "node:path";
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { PrismaClient } from "../../api/node_modules/@prisma/client";
import { NCS_PROFILE_VERSION } from "./ncs-text-evaluation.types";
import { SqsAiJobQueue } from "./queue";
import { createWorkerRuntime } from "./worker-bootstrap";
import { loadWorkerEnv } from "./worker-env";
import { AiWorkerJob } from "./worker.types";

type ProviderMode = "mock" | "openai";
type CanonicalProfileId = "JOB_TECHNICAL" | "COLLABORATION_COMMUNICATION" | "PROBLEM_SOLVING";
type QuestionMode = "EXPERIENCE_BEHAVIOR" | "TECHNICAL_KNOWLEDGE" | "SITUATIONAL_DESIGN";

interface SmokeCriterion {
  criterionId: bigint;
  title: string;
  category: string;
  weight: number;
  profileId: CanonicalProfileId;
  questionMode: QuestionMode;
}

interface SmokeAnswer {
  answerId: bigint;
  sessionQuestionId: bigint;
  criterion: SmokeCriterion;
  question: string;
  transcript: string;
  sortOrder: number;
}

const DEFAULT_DATABASE_URL = "postgresql://init:init@localhost:5432/init_ncs_readiness?schema=public";
const DEFAULT_AWS_ENDPOINT = "http://localhost:14566";
const DEFAULT_AWS_REGION = "ap-northeast-2";
const DEFAULT_S3_BUCKET = "init-local-assets";
const FOLLOW_UP_BASE_INDEX = 4;

const QUESTION_FIXTURES: ReadonlyArray<{
  profileId: CanonicalProfileId;
  title: string;
  category: string;
  weight: number;
  questionMode: QuestionMode;
  questions: readonly [
    { question: string; transcript: string },
    { question: string; transcript: string },
  ];
}> = [
  {
    profileId: "JOB_TECHNICAL",
    title: "직무·기술 역량",
    category: "NCS 직무 평가",
    weight: 30,
    questionMode: "TECHNICAL_KNOWLEDGE",
    questions: [
      {
        question: "Redis 캐시의 동작 원리와 선택 이유, API에 적용한 구조, 장애 위험을 검증한 방법을 설명해 주세요.",
        transcript:
          "Redis는 메모리에 값을 저장하고 TTL이 지나면 만료시키기 때문에 반복 조회를 줄일 수 있습니다. 저는 상품 API에 cache-aside 구조를 설계하고 구현했습니다. 캐시 미스와 stale 데이터 위험을 확인하려고 부하 테스트와 hit ratio 모니터링을 수행했고, 장애 때는 DB fallback과 timeout으로 복구하도록 검증했습니다.",
      },
      {
        question: "SQS 비동기 처리의 동작 구조와 적용 이유, 실패와 중복 처리 위험을 테스트한 방법을 설명해 주세요.",
        transcript:
          "SQS는 producer와 worker를 큐로 분리해 비동기로 동작하기 때문에 긴 AI 작업이 API 요청을 막지 않습니다. 저는 report job을 큐에 넣고 worker가 idempotency key로 처리하도록 구현했습니다. 중복 수신과 timeout 실패 위험은 재시도 테스트, DLQ 모니터링, 트랜잭션 검증으로 확인했습니다.",
      },
    ],
  },
  {
    profileId: "COLLABORATION_COMMUNICATION",
    title: "협업·의사소통 역량",
    category: "NCS 협업 평가",
    weight: 30,
    questionMode: "EXPERIENCE_BEHAVIOR",
    questions: [
      {
        question: "협업 갈등 상황에서 상대에게 핵심 근거를 구조적으로 설명하고 이해와 합의를 확인한 경험을 말해 주세요.",
        transcript:
          "당시 개발팀과 기획팀이 배포 범위를 두고 갈등했습니다. 저는 먼저 목표와 제약을 요약하고, 다음으로 로그 근거와 선택지를 순서대로 설명했습니다. 기획자 눈높이에 맞춰 기술 용어를 사용자 영향으로 바꿨고, 질문과 피드백을 받아 합의 내용을 다시 확인했습니다. 결과적으로 핵심 기능부터 배포했고 이후 회고에서 같은 방식을 공유했습니다.",
      },
      {
        question: "비전문가 이해관계자에게 기술 문제를 설명하고 피드백으로 상호 이해를 확인한 협업 경험을 말해 주세요.",
        transcript:
          "프로젝트에서 고객 담당자에게 장애 배경과 핵심 원인을 먼저 요약했습니다. 저는 비전문가 상대의 수준에 맞춰 캐시를 임시 보관함으로 설명하고 근거 지표를 다음 순서로 전달했습니다. 중간마다 질문을 받고 상대의 말을 재확인해 합의를 기록했습니다. 결과적으로 우선순위가 정리됐고 다음 장애 대응 문서에도 피드백을 반영했습니다.",
      },
    ],
  },
  {
    profileId: "PROBLEM_SOLVING",
    title: "문제 해결 역량",
    category: "NCS 문제 해결 평가",
    weight: 40,
    questionMode: "SITUATIONAL_DESIGN",
    questions: [
      {
        question: "Redis 장애 문제의 원인을 분석하고 제약에 맞는 대안을 비교해 선택한 뒤 결과를 검증하는 대응 방안을 설명해 주세요.",
        transcript:
          "먼저 로그와 지표를 확인해 Redis TTL 만료가 반복되는 원인이라고 분석했습니다. 서비스 중단을 줄이는 목표와 DB 부하 제약을 정리한 뒤 TTL 조정을 우선 적용했습니다.",
      },
      {
        question: "API 지연 문제의 원인을 확인하고 여러 대안을 비교해 실행 계획을 세운 뒤 결과를 측정하는 방법을 설명해 주세요.",
        transcript:
          "먼저 APM 지표와 쿼리 로그를 확인해 인덱스 누락을 원인으로 분석하고 p95 300ms 목표와 배포 제약을 정리했습니다. 인덱스 추가, 캐시 적용, 쿼리 분리 대안을 비용과 효과 기준으로 비교해 인덱스를 선택했습니다. 다음으로 staging 테스트 후 단계적으로 적용했고, 실패 시 롤백하도록 계획했습니다. 배포 뒤 p95가 900ms에서 180ms로 개선됐는지 모니터링해 결과를 검증했습니다.",
      },
    ],
  },
];

async function main(): Promise<void> {
  const providerMode = providerModeOf(providerArgument() ?? process.env.AI_PROVIDER_MODE);
  const databaseUrl = process.env.NCS_SMOKE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
  assertIsolatedDatabase(databaseUrl);
  process.env.DATABASE_URL = databaseUrl;

  const endpoint = process.env.AWS_ENDPOINT_URL?.trim() || DEFAULT_AWS_ENDPOINT;
  const region = process.env.AWS_REGION?.trim() || DEFAULT_AWS_REGION;
  const queueName = `init-ncs-readiness-${providerMode}-smoke`;
  const sqsClient = new SQSClient({
    endpoint,
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() || "test",
    },
  });
  const queueUrl = await createIsolatedQueue(sqsClient, queueName);
  const queue = new SqsAiJobQueue(sqsClient, queueUrl);
  const prisma = new PrismaClient();
  const runtime = await createWorkerRuntime(queue, loadWorkerEnv({
    ...process.env,
    AI_SQS_QUEUE_URL: queueUrl,
    AWS_ENDPOINT_URL: endpoint,
    AWS_REGION: region,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME?.trim() || DEFAULT_S3_BUCKET,
    AI_PROVIDER_MODE: providerMode,
    AI_STT_PROVIDER: "mock",
    WORKER_REPOSITORY_MODE: "prisma",
    WORKER_BATCH_SIZE: "1",
    PRISMA_CLIENT_MODULE: path.resolve(__dirname, "..", "..", "api", "node_modules", "@prisma", "client"),
  }));

  try {
    await prisma.$connect();
    const fixture = await createFixture(prisma);
    const followUpQuestion = await runFollowUpJob(prisma, queue, runtime.runner.processBatch.bind(runtime.runner), fixture);
    const followUpAnswerId = await createFollowUpAnswer(prisma, fixture, followUpQuestion.content);
    const reportJob = await createReportJob(prisma, fixture, followUpAnswerId);
    await queue.publish(reportJob);
    assert.equal(await runtime.runner.processBatch(), 1, "report job was not consumed from SQS");
    const summary = await verifyPipeline(prisma, sqsClient, queueUrl, fixture, followUpAnswerId, providerMode);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await runtime.disconnect?.();
    await prisma.$disconnect();
    sqsClient.destroy();
  }
}

async function createIsolatedQueue(client: SQSClient, queueName: string): Promise<string> {
  const result = await client.send(new CreateQueueCommand({ QueueName: queueName }));
  assert(result.QueueUrl, "LocalStack did not return a queue URL");
  try {
    await client.send(new PurgeQueueCommand({ QueueUrl: result.QueueUrl }));
  } catch (error) {
    if (!String(error).includes("PurgeQueueInProgress")) throw error;
  }
  return result.QueueUrl;
}

async function createFixture(prisma: PrismaClient): Promise<{
  applicationId: bigint;
  sessionId: bigint;
  reportId: bigint;
  criteria: SmokeCriterion[];
  answers: SmokeAnswer[];
}> {
  const company = await prisma.company.findFirst({ select: { companyId: true } });
  const candidate = await prisma.candidateProfile.findFirst({ select: { candidateId: true } });
  assert(company, "seeded company is required");
  assert(candidate, "seeded candidate is required");

  const baseId = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 100));
  const postingId = baseId + 1n;
  const applicationId = baseId + 2n;
  const sessionId = baseId + 3n;
  const reportId = baseId + 4n;
  const criteria: SmokeCriterion[] = [];
  const answers: SmokeAnswer[] = [];

  await prisma.$transaction(async (transaction) => {
    await transaction.posting.create({
      data: {
        postingId,
        companyId: company.companyId,
        title: `[NCS smoke] Backend Engineer ${baseId}`,
        jobRole: "Backend Engineer",
        jobDescription: "NestJS, PostgreSQL, Redis, SQS 기반 API를 설계하고 협업하며 장애를 해결하는 백엔드 엔지니어",
        status: "OPEN",
      },
    });
    await transaction.application.create({
      data: {
        applicationId,
        postingId,
        candidateId: candidate.candidateId,
        applicationStatus: "SUBMITTED",
        interviewStatus: "COMPLETED",
        reportStatus: "PENDING",
        submittedAt: new Date(),
      },
    });
    await transaction.interviewSession.create({
      data: {
        sessionId,
        applicationId,
        candidateId: candidate.candidateId,
        interviewType: "RECRUITING",
        status: "COMPLETED",
        preparationTimeSecSnapshot: 30,
        answerTimeSecSnapshot: 90,
        ncsScoringVersion: "ncs-5point-v1",
        startedAt: new Date(Date.now() - 10 * 60 * 1000),
        completedAt: new Date(),
      },
    });

    for (const [criterionIndex, fixture] of QUESTION_FIXTURES.entries()) {
      const tagId = baseId + BigInt(100 + criterionIndex);
      const criterionId = baseId + BigInt(200 + criterionIndex);
      await transaction.criterionTag.create({
        data: {
          tagId,
          jobRole: "Backend Engineer",
          name: fixture.title,
          description: `${fixture.title} 통합 스모크 기준`,
          category: fixture.category,
          sortOrder: criterionIndex + 1,
          ncsProfileId: fixture.profileId,
          defaultNcsQuestionMode: fixture.questionMode,
          ncsProfileVersion: NCS_PROFILE_VERSION,
        },
      });
      await transaction.evaluationCriterion.create({
        data: {
          criterionId,
          postingId,
          tagId,
          description: `${fixture.title}의 행동 포인트와 논리 구조를 평가합니다.`,
          weight: fixture.weight,
          passScore: 60,
          sortOrder: criterionIndex + 1,
          ncsProfileId: fixture.profileId,
          ncsQuestionMode: fixture.questionMode,
          ncsProfileVersion: NCS_PROFILE_VERSION,
        },
      });
      const criterion: SmokeCriterion = {
        criterionId,
        title: fixture.title,
        category: fixture.category,
        weight: fixture.weight,
        profileId: fixture.profileId,
        questionMode: fixture.questionMode,
      };
      criteria.push(criterion);
      await transaction.interviewSessionNcsPolicy.create({
        data: {
          sessionId,
          ncsProfileId: fixture.profileId,
          criterionId,
          criterionTitleSnapshot: fixture.title,
          weight: fixture.weight,
          minimumAverageScore: 3,
          requiredQuestionCount: 2,
          ncsProfileVersion: NCS_PROFILE_VERSION,
        },
      });

      for (const [questionIndex, questionFixture] of fixture.questions.entries()) {
        const globalIndex = criterionIndex * 2 + questionIndex;
        const sessionQuestionId = baseId + BigInt(300 + globalIndex);
        const answerId = baseId + BigInt(400 + globalIndex);
        await transaction.interviewSessionQuestion.create({
          data: {
            sessionQuestionId,
            sessionId,
            criterionId,
            criterionTitleSnapshot: fixture.title,
            questionType: questionTypeOf(fixture.questionMode),
            content: questionFixture.question,
            ncsProfileId: fixture.profileId,
            ncsQuestionMode: fixture.questionMode,
            ncsProfileVersion: NCS_PROFILE_VERSION,
            alignmentStatus: "ALIGNED",
            alignmentScore: 1,
            alignmentReason: "integration smoke fixture",
            evaluatorVersion: "ncs-smoke-v1",
            sortOrder: globalIndex + 1,
          },
        });
        await transaction.sessionQuestionNcsBinding.create({
          data: {
            sessionQuestionId,
            criterionId,
            criterionTitleSnapshot: fixture.title,
            ncsProfileId: fixture.profileId,
            ncsProfileVersion: NCS_PROFILE_VERSION,
            alignmentStatus: "ALIGNED",
            alignmentScore: 1,
            alignmentReason: "integration smoke fixture",
            evaluatorVersion: "ncs-smoke-v1",
            bindingOrder: 1,
          },
        });
        await transaction.interviewAnswer.create({
          data: {
            answerId,
            sessionId,
            sessionQuestionId,
            transcript: questionFixture.transcript,
            durationSeconds: 75,
            submittedAt: new Date(),
          },
        });
        answers.push({
          answerId,
          sessionQuestionId,
          criterion,
          question: questionFixture.question,
          transcript: questionFixture.transcript,
          sortOrder: globalIndex + 1,
        });
      }
    }
  });

  return { applicationId, sessionId, reportId, criteria, answers };
}

async function runFollowUpJob(
  prisma: PrismaClient,
  queue: SqsAiJobQueue,
  processBatch: () => Promise<number>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<{ content: string }> {
  const baseAnswer = fixture.answers[FOLLOW_UP_BASE_INDEX];
  assert(baseAnswer, "follow-up base answer fixture is missing");
  const processLogId = fixture.reportId + 100n;
  const inputRef = JSON.stringify({
    kind: "RECRUITING_FOLLOW_UP",
    payload: {
      sessionId: numberOf(fixture.sessionId),
      answerId: numberOf(baseAnswer.answerId),
      sessionQuestionId: numberOf(baseAnswer.sessionQuestionId),
      previousQuestion: baseAnswer.question,
      transcript: baseAnswer.transcript,
      jobDescription: "NestJS, PostgreSQL, Redis, SQS 기반 API의 안정성을 개선합니다.",
      answerTimeSec: 90,
      ncsQuestionMode: baseAnswer.criterion.questionMode,
      ncsBindings: [bindingPayload(baseAnswer.criterion)],
    },
  });
  const job = await createProcessJob(prisma, {
    processLogId,
    applicationId: fixture.applicationId,
    sessionId: fixture.sessionId,
    processType: "FOLLOW_UP",
    inputRef,
  });
  await queue.publish(job);
  assert.equal(await processBatch(), 1, "follow-up job was not consumed from SQS");
  const processLog = await prisma.aiProcessLog.findUnique({ where: { processLogId } });
  assert.equal(processLog?.status, "COMPLETED", processLog?.failureReason ?? "follow-up process did not complete");
  const followUp = await prisma.followUpQuestion.findUnique({
    where: { answerIdPolicy: { answerId: baseAnswer.answerId, policy: "RECRUITING" } },
    select: { content: true },
  });
  if (!followUp?.content.trim()) {
    throw new Error("follow-up question was not saved");
  }
  return followUp;
}

async function createFollowUpAnswer(
  prisma: PrismaClient,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  generatedQuestion: string,
): Promise<bigint> {
  const answerId = fixture.reportId + 200n;
  await prisma.interviewAnswer.create({
    data: {
      answerId,
      sessionId: fixture.sessionId,
      transcript: [
        `생성된 꼬리질문은 '${generatedQuestion}'이었습니다.`,
        "DB 부하 제약을 기준으로 TTL 조정, circuit breaker, 캐시 우회 대안을 비교했습니다.",
        "복구 시간과 데이터 일관성 장단점을 검토해 circuit breaker와 DB fallback을 선택했습니다.",
        "먼저 staging 부하 테스트를 실행하고 다음으로 점진 배포했으며 실패 시 롤백하도록 계획했습니다.",
        "적용 뒤 p95 응답 시간과 오류율을 모니터링해 40% 개선 결과를 검증했고 재발 방지 알림을 추가했습니다.",
      ].join(" "),
      durationSeconds: 90,
      submittedAt: new Date(),
    },
  });
  return answerId;
}

async function createReportJob(
  prisma: PrismaClient,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  followUpAnswerId: bigint,
): Promise<AiWorkerJob> {
  const inputRef = JSON.stringify({
    kind: "RECRUITING_REPORT_GENERATE",
    payload: {
      reportId: numberOf(fixture.reportId),
      applicationId: numberOf(fixture.applicationId),
      sessionId: numberOf(fixture.sessionId),
      reportType: "RECRUITING_REPORT",
      companyName: "init smoke company",
      jobTitle: "Backend Engineer",
      jobDescription: "NestJS, PostgreSQL, Redis, SQS 기반 API를 설계하고 협업하며 장애를 해결하는 백엔드 엔지니어",
      criteria: fixture.criteria.map((criterion) => ({
        criterionId: numberOf(criterion.criterionId),
        name: criterion.title,
        category: criterion.category,
        weight: criterion.weight,
      })),
      ncsSessionPolicy: fixture.criteria.map((criterion) => ({
        ncsProfileId: criterion.profileId,
        criterionId: numberOf(criterion.criterionId),
        criterionTitleSnapshot: criterion.title,
        weight: criterion.weight,
        minimumAverageScore: 3,
        requiredQuestionCount: 2,
        ncsProfileVersion: NCS_PROFILE_VERSION,
      })),
      answers: [
        ...fixture.answers.map((answer) => ({
          answerId: numberOf(answer.answerId),
          sessionQuestionId: numberOf(answer.sessionQuestionId),
          question: answer.question,
          questionType: questionTypeOf(answer.criterion.questionMode),
          sortOrder: answer.sortOrder,
          transcript: answer.transcript,
          evaluationStatus: "EVALUATED",
          ncsQuestionMode: answer.criterion.questionMode,
          ncsBindings: [bindingPayload(answer.criterion)],
        })),
        {
          answerId: numberOf(followUpAnswerId),
          transcript: (await prisma.interviewAnswer.findUniqueOrThrow({
            where: { answerId: followUpAnswerId },
            select: { transcript: true },
          })).transcript,
          evaluationStatus: "EVALUATED",
          isFollowUpAnswer: true,
          parentAnswerId: numberOf(fixture.answers[FOLLOW_UP_BASE_INDEX]!.answerId),
          sortOrder: fixture.answers.length + 1,
        },
      ],
    },
  });
  return createProcessJob(prisma, {
    processLogId: fixture.reportId + 101n,
    applicationId: fixture.applicationId,
    sessionId: fixture.sessionId,
    processType: "REPORT_GENERATE",
    inputRef,
  });
}

async function createProcessJob(
  prisma: PrismaClient,
  input: {
    processLogId: bigint;
    applicationId: bigint;
    sessionId: bigint;
    processType: "FOLLOW_UP" | "REPORT_GENERATE";
    inputRef: string;
  },
): Promise<AiWorkerJob> {
  await prisma.aiProcessLog.create({
    data: {
      processLogId: input.processLogId,
      applicationId: input.applicationId,
      sessionId: input.sessionId,
      processType: input.processType,
      status: "PENDING",
      inputRef: input.inputRef,
    },
  });
  return {
    processLogId: numberOf(input.processLogId),
    processType: input.processType,
    inputRef: input.inputRef,
    attempt: 1,
  };
}

async function verifyPipeline(
  prisma: PrismaClient,
  sqsClient: SQSClient,
  queueUrl: string,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  followUpAnswerId: bigint,
  providerMode: ProviderMode,
): Promise<Record<string, unknown>> {
  const reportProcessLogId = fixture.reportId + 101n;
  const reportProcess = await prisma.aiProcessLog.findUnique({ where: { processLogId: reportProcessLogId } });
  assert.equal(reportProcess?.status, "COMPLETED", reportProcess?.failureReason ?? "report process did not complete");
  if (providerMode === "openai") {
    assert((reportProcess.inputTokens ?? 0) > 0, "OpenAI smoke did not record input tokens");
    assert((reportProcess.outputTokens ?? 0) > 0, "OpenAI smoke did not record output tokens");
  }

  const report = await prisma.evaluationReport.findUnique({
    where: { reportId: fixture.reportId },
    include: {
      scores: true,
      ncsAnswerEvaluations: { include: { evidences: true } },
    },
  });
  assert(report, "evaluation report was not saved");
  assert.equal(report.status, "COMPLETED");
  assert.equal(report.ncsCompletionStatus, "COMPLETE");
  assert.notEqual(report.totalScore, null);
  assert.equal(report.ncsAnswerEvaluations.length, fixture.answers.length);
  assert(report.ncsAnswerEvaluations.every((evaluation) => evaluation.scoreStatus === "SCORED"));
  assert(report.ncsAnswerEvaluations.every((evaluation) => evaluation.evidences.length > 0));

  const profileScores = report.scores.filter((score) => score.ncsProfileId !== null);
  assert.equal(profileScores.length, QUESTION_FIXTURES.length);
  assert(profileScores.every((score) => (score.validQuestionCount ?? 0) >= 2));
  assert(profileScores.every((score) => score.weight !== null && score.weight > 0));
  const baseAnswer = fixture.answers[FOLLOW_UP_BASE_INDEX]!;
  const reevaluated = report.ncsAnswerEvaluations.find((evaluation) => evaluation.answerId === baseAnswer.answerId);
  assert(reevaluated?.followUpApplied, "base answer was not reevaluated with its follow-up answer");
  assert((reevaluated.effectiveScore ?? 0) >= (reevaluated.baseScore ?? 0));
  assert(reevaluated.evidences.some((evidence) => evidence.sourceAnswerId === followUpAnswerId));

  const application = await prisma.application.findUnique({ where: { applicationId: fixture.applicationId } });
  assert.equal(application?.reportStatus, "COMPLETED");
  const attributes = await sqsClient.send(new GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
  }));
  assert.equal(attributes.Attributes?.ApproximateNumberOfMessages ?? "0", "0");
  assert.equal(attributes.Attributes?.ApproximateNumberOfMessagesNotVisible ?? "0", "0");

  return {
    providerMode,
    applicationId: numberOf(fixture.applicationId),
    sessionId: numberOf(fixture.sessionId),
    reportId: numberOf(fixture.reportId),
    reportStatus: report.status,
    completionStatus: report.ncsCompletionStatus,
    thresholdResult: report.ncsThresholdResult,
    aiDecision: report.ncsAiDecision,
    totalScore: report.totalScore,
    profileScores: profileScores.map((score) => ({
      ncsProfileId: score.ncsProfileId,
      averageScore: score.averageScore?.toString(),
      normalizedScore: score.normalizedScore,
      weight: score.weight,
      weightedScore: score.weightedScore?.toString(),
      validQuestionCount: score.validQuestionCount,
    })),
    answerEvaluationCount: report.ncsAnswerEvaluations.length,
    followUpReevaluationApplied: reevaluated.followUpApplied,
    evidenceCount: report.ncsAnswerEvaluations.reduce((sum, evaluation) => sum + evaluation.evidences.length, 0),
    modelName: reportProcess.modelName,
    inputTokens: reportProcess.inputTokens,
    outputTokens: reportProcess.outputTokens,
  };
}

function bindingPayload(criterion: SmokeCriterion): Record<string, unknown> {
  return {
    criterionId: numberOf(criterion.criterionId),
    criterionTitleSnapshot: criterion.title,
    ncsProfileId: criterion.profileId,
    ncsProfileVersion: NCS_PROFILE_VERSION,
    alignmentStatus: "ALIGNED",
    alignmentScore: 1,
    evaluatorVersion: "ncs-smoke-v1",
    bindingOrder: 1,
  };
}

function providerModeOf(value: string | undefined): ProviderMode {
  if (!value?.trim() || value === "mock") return "mock";
  if (value === "openai") return "openai";
  throw new Error("AI_PROVIDER_MODE must be mock or openai for the NCS smoke test");
}

function providerArgument(): string | undefined {
  return process.argv.find((value) => value.startsWith("--provider="))?.slice("--provider=".length);
}

function assertIsolatedDatabase(databaseUrl: string): void {
  if (process.env.NCS_SMOKE_ALLOW_NON_ISOLATED_DB === "true") return;
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (databaseName !== "init_ncs_readiness") {
    throw new Error(
      `NCS smoke refuses database '${databaseName}'. Use init_ncs_readiness or explicitly set NCS_SMOKE_ALLOW_NON_ISOLATED_DB=true.`,
    );
  }
}

function questionTypeOf(mode: QuestionMode): "TECHNICAL" | "EXPERIENCE" | "SITUATION" {
  if (mode === "TECHNICAL_KNOWLEDGE") return "TECHNICAL";
  if (mode === "EXPERIENCE_BEHAVIOR") return "EXPERIENCE";
  return "SITUATION";
}

function numberOf(value: bigint): number {
  const result = Number(value);
  assert(Number.isSafeInteger(result), `BigInt ${value} is outside the JavaScript safe integer range`);
  return result;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
