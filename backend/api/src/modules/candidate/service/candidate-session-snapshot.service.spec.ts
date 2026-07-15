import assert from "node:assert/strict";
import { CandidateDomainError } from "../candidate.errors";
import type { InterviewQuestionSnapshotResult } from "../candidate.types";
import { DEV_CANDIDATE_USER } from "../candidate.constants";
import { InMemoryCandidateRepository } from "../repository/in-memory-candidate.repository";
import { CandidateService } from "./candidate.service";

class SnapshotReadinessRepository extends InMemoryCandidateRepository {
  constructor(private readonly readiness: InterviewQuestionSnapshotResult["readiness"]) {
    super();
  }

  override async prepareInterviewSessionQuestionSnapshot(
    applicationId: number,
  ): Promise<InterviewQuestionSnapshotResult | undefined> {
    const base = await super.prepareInterviewSessionQuestionSnapshot(applicationId);
    if (!base) return undefined;
    return {
      ...base,
      readiness: this.readiness,
      expectedCommonQuestionCount: 6,
      expectedPersonalizedQuestionCount: 2,
      commonQuestionCount: this.readiness === "COMMON_QUESTIONS_NOT_READY" ? 5 : 6,
      personalizedQuestionCount: this.readiness === "PERSONALIZED_QUESTIONS_NOT_READY" ? 0 : 2,
      snapshotValidationErrors:
        this.readiness === "NCS_SNAPSHOT_INVALID"
          ? ["BINDING_METADATA_INVALID"]
          : undefined,
    };
  }
}

async function createReadyCandidateService(readiness: InterviewQuestionSnapshotResult["readiness"]) {
  const repository = new SnapshotReadinessRepository(readiness);
  const service = new CandidateService(repository);
  const submission = await repository.createApplication({
    postingId: 1,
    candidateId: DEV_CANDIDATE_USER.candidateId,
    resumeFileId: 1,
    consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
  });
  const session = await repository.findInterviewSessionByApplication(submission.application.applicationId);
  assert.ok(session);
  await service.saveInterviewConsent(
    submission.application.applicationId,
    { consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"] },
    DEV_CANDIDATE_USER,
  );
  await service.saveDeviceCheck(
    session.sessionId,
    { cameraGranted: true, microphoneGranted: true, networkStable: true },
    DEV_CANDIDATE_USER,
  );
  return { service, applicationId: submission.application.applicationId };
}

describe("CandidateService recruiting snapshot gate", () => {
  it("blocks API-065 while personalized questions are not ready", async () => {
    const fixture = await createReadyCandidateService("PERSONALIZED_QUESTIONS_NOT_READY");

    await assert.rejects(
      () => fixture.service.startInterview(fixture.applicationId, DEV_CANDIDATE_USER),
      (error) => error instanceof CandidateDomainError &&
        error.code === "INTERVIEW_PERSONALIZED_QUESTIONS_NOT_READY",
    );
  });

  it("blocks API-065 when the active common set count is invalid", async () => {
    const fixture = await createReadyCandidateService("COMMON_QUESTIONS_NOT_READY");

    await assert.rejects(
      () => fixture.service.startInterview(fixture.applicationId, DEV_CANDIDATE_USER),
      (error) => error instanceof CandidateDomainError &&
        error.code === "INTERVIEW_QUESTION_COUNT_INVALID",
    );
  });

  it("blocks API-065 when an immutable NCS session snapshot is invalid", async () => {
    const fixture = await createReadyCandidateService("NCS_SNAPSHOT_INVALID");

    await assert.rejects(
      () => fixture.service.startInterview(fixture.applicationId, DEV_CANDIDATE_USER),
      (error) => error instanceof CandidateDomainError &&
        error.code === "INTERVIEW_NCS_SNAPSHOT_INVALID" &&
        error.statusCode === 409,
    );
  });
});
