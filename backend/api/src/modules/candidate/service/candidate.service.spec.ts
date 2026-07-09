import { strict as assert } from "node:assert";
import { resolveCurrentCandidate } from "../controller/candidate.auth";
import {
  CandidateDomainError,
  CandidateService,
  DEV_CANDIDATE_USER,
} from "./candidate.service";
import { InMemoryCandidateDocumentStorageAdapter } from "./candidate-document-storage.adapter";
import { createCandidateValidationException } from "../candidate.validation";
import { InMemoryCandidateRepository } from "../repository/in-memory-candidate.repository";

async function run() {
  const service = new CandidateService(new InMemoryCandidateRepository());

  const currentUser = DEV_CANDIDATE_USER;
  assert.deepEqual(resolveCurrentCandidate(currentUser), currentUser);
  assert.throws(
    () =>
      resolveCurrentCandidate({
        userId: 1,
        userType: "COMPANY",
        companyId: 1,
        candidateId: null,
      }),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_FORBIDDEN",
  );

  const validationException = createCandidateValidationException([
    {
      property: "resumeFileId",
      constraints: {
        isInt: "resumeFileId must be an integer number",
      },
      children: [],
    },
  ]);
  const validationResponse = validationException.getResponse() as { error?: { code?: string }; meta?: unknown };
  assert.equal(validationResponse.error?.code, "COMMON_VALIDATION_FAILED");
  assert.ok(validationResponse.meta);

  const repository = new InMemoryCandidateRepository();
  await repository.createApplication({
    postingId: 1,
    candidateId: 99,
    resumeFileId: 1,
    consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
  });
  await assert.rejects(
    () =>
      repository.createApplication({
        postingId: 1,
        candidateId: 99,
        resumeFileId: 1,
        consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
      }),
    (error) => error instanceof CandidateDomainError && error.code === "APPLICATION_ALREADY_SUBMITTED",
  );

  const repositoryFileAsset = await repository.createFileAsset({
    ownerUserId: 99,
    storageKey: "candidate/99/resume.pdf",
    originalName: "resume.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1000,
  });
  assert.equal("content" in repositoryFileAsset, false);

  await assert.rejects(
    () =>
      repository.createFileAsset({
        ownerUserId: 99,
        storageKey: "candidate/99/resume.pdf",
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        content: "raw-file-payload",
      } as never),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  const invalidFileRepository = new InMemoryCandidateRepository();
  const invalidFileService = new CandidateService(invalidFileRepository);
  const invalidFileAsset = await invalidFileRepository.createFileAsset({
    ownerUserId: currentUser.userId,
    storageKey: "candidate/1/profile.png",
    originalName: "profile.png",
    mimeType: "image/png",
    sizeBytes: 1000,
  });
  await assert.rejects(
    () =>
      invalidFileService.submitApplication(
        1,
        {
          candidateName: "Kim",
          email: "kim@example.com",
          phone: "010-0000-0000",
          resumeFileId: invalidFileAsset.fileId,
          portfolioUrl: "https://portfolio.example.com/kim",
          consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
        },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "FILE_INVALID_TYPE",
  );
  await assert.rejects(
    () =>
      invalidFileService.createPortfolioLink(
        { url: "https://portfolio.example.com/kim", fileId: invalidFileAsset.fileId },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "FILE_INVALID_TYPE",
  );
  const wrongPrefixFileAsset = await invalidFileRepository.createFileAsset({
    ownerUserId: currentUser.userId,
    storageKey: "candidate/2/resume.pdf",
    originalName: "resume.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1000,
  });
  await assert.rejects(
    () =>
      invalidFileService.submitApplication(
        1,
        {
          candidateName: "Kim",
          email: "kim@example.com",
          phone: "010-0000-0000",
          resumeFileId: wrongPrefixFileAsset.fileId,
          portfolioUrl: "https://portfolio.example.com/kim",
          consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
        },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  const macosAudioInterviewFile = await service.createInterviewFileAsset(
    {
      storageKey: "candidate/1/interviews/mock-answer.m4a",
      originalName: "mock-answer.m4a",
      mimeType: "audio/mp4",
      sizeBytes: 12 * 1024,
    },
    currentUser,
  );
  assert.equal(macosAudioInterviewFile.mimeType, "audio/mp4");
  assert.equal(macosAudioInterviewFile.storageKey, "candidate/1/interviews/mock-answer.m4a");

  const defaultJobs = await service.listJobs({} as never);
  assert.equal(defaultJobs.meta.page.page, 1);
  assert.equal(defaultJobs.meta.page.limit, 20);
  assert.equal(defaultJobs.data.items.length, 2);
  assert.equal(defaultJobs.data.items[0]?.companyLogoUrl, null);

  const allJobs = await service.listJobs({ page: 1, limit: 20, sort: "createdAt", order: "desc" });
  assert.equal(allJobs.data.items.length, 2);
  assert.equal(allJobs.data.items.some((job) => job.postingStatus === "CLOSED"), false);
  assert.equal(allJobs.data.items.some((job) => job.jobId === 4), false);

  const httpQueryJobs = await service.listJobs({
    page: "1",
    limit: "20",
    sort: "createdAt",
    order: "desc",
  } as never);
  assert.equal(httpQueryJobs.meta.page.page, 1);
  assert.equal(httpQueryJobs.meta.page.limit, 20);
  assert.equal(httpQueryJobs.data.items.length, 2);

  const jobs = await service.listJobs({ page: 1, limit: 20, jobRole: "Android", sort: "createdAt", order: "desc" });
  assert.equal(jobs.data.items.length, 1);
  assert.equal(jobs.data.items[0]?.jobRole, "Android");
  assert.equal(jobs.data.items[0]?.jobGroup, "Engineering");
  assert.equal(jobs.meta.page.totalItems, 1);

  const filteredJobs = await service.listJobs({
    page: 1,
    limit: 20,
    q: "android",
    jobGroup: "Engineering",
    location: "경기",
    careerMinYears: 0,
    careerMaxYears: 1,
    postingStatus: "CLOSING_SOON",
    sort: "endsOn",
    order: "asc",
  });
  assert.equal(filteredJobs.data.items.length, 1);
  assert.equal(filteredJobs.data.items[0]?.jobId, 2);

  const jobRolesFiltered = await service.listJobs({
    page: 1,
    limit: 20,
    jobRoles: ["안드로이드", "프론트엔드"],
    sort: "createdAt",
    order: "desc",
  });
  assert.equal(jobRolesFiltered.data.items.length, 1);
  assert.equal(jobRolesFiltered.data.items[0]?.jobId, 2);

  await assert.rejects(
    () => service.listJobs({ page: 0, limit: 20, sort: "createdAt", order: "desc" }),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () => service.listJobs({ page: 1, limit: 101, sort: "createdAt", order: "desc" }),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () => service.listJobs({ page: 1, limit: 20, q: 42, sort: "createdAt", order: "desc" } as never),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () => service.listJobs({ page: 1, limit: 20, postingStatus: "CLOSED", sort: "createdAt", order: "desc" } as never),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () => service.listJobs({ page: 1, limit: 20, sort: "updatedAt", order: "desc" } as never),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () => service.listJobs({ page: 1, limit: 20, sort: "createdAt", order: "latest" } as never),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  const detail = await service.getJobDetail(2, currentUser);
  assert.equal(detail.data.companyName, "Jungle Works");
  assert.equal(detail.data.companyLogoUrl, null);
  assert.equal(detail.data.companyIndustry, "Mobile Platform");
  assert.equal(detail.data.canApply, true);
  assert.equal(detail.data.alreadyApplied, false);
  assert.ok(detail.data.companyProfile.includes("모바일"));

  const applyView = await service.getApplyView(2, currentUser);
  assert.equal(applyView.data.job.jobId, 2);
  assert.equal(applyView.data.job.companyLogoUrl, null);
  assert.equal(applyView.data.documentPolicy.storageProvider, "S3");
  assert.equal(applyView.data.documentPolicy.metadataOnly, false);
  assert.equal(applyView.data.documentPolicy.maxSizeBytes, 20 * 1024 * 1024);
  assert.equal(applyView.data.documentPolicy.storageKeyPrefix, "candidate/1/");
  assert.deepEqual(applyView.data.requiredConsentTypes, ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"]);
  assert.equal(applyView.data.portfolioRequired, true);

  await assert.rejects(
    () => service.getJobDetail(Number.NaN, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () =>
      service.submitApplication(
        0,
        {
          candidateName: "Kim",
          email: "kim@example.com",
          phone: "010-0000-0000",
          resumeFileId: 1,
          portfolioUrl: "https://portfolio.example.com/kim",
          consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
        },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () =>
      service.submitApplication(
        1,
        {
          email: "kim@example.com",
          phone: "010-0000-0000",
          resumeFileId: 1,
          portfolioUrl: "https://portfolio.example.com/kim",
          consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
        } as never,
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () =>
      service.submitApplication(
        1,
        {
          candidateName: "Kim",
          email: "not-an-email",
          phone: "010-0000-0000",
          resumeFileId: 1,
          portfolioUrl: "https://portfolio.example.com/kim",
          consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
        },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () =>
      service.submitApplication(
        1,
        {
          candidateName: "Kim",
          email: "kim@example.com",
          phone: "010-0000-0000",
          resumeFileId: 1,
          portfolioFileId: -1,
          consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
        },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () =>
      service.submitApplication(
        1,
        {
          candidateName: "Kim",
          email: "kim@example.com",
          phone: "010-0000-0000",
          resumeFileId: 1,
          portfolioUrl: "https://portfolio.example.com/kim",
        } as never,
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () =>
      service.submitApplication(
        1,
        {
          candidateName: "Kim",
          email: "kim@example.com",
          phone: "010-0000-0000",
          resumeFileId: 1,
          portfolioUrl: "https://portfolio.example.com/kim",
          consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "MARKETING_OPT_IN" as never],
        },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  const resume = await service.uploadResume({
    storageKey: "candidate/1/resume.pdf",
    originalName: "resume.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1000,
  }, currentUser);
  assert.equal(resume.data.storageKey, "candidate/1/resume.pdf");
  assert.equal("content" in resume.data, false);
  assert.equal("buffer" in resume.data, false);
  assert.equal("base64" in resume.data, false);

  const documentStorage = new InMemoryCandidateDocumentStorageAdapter();
  const uploadService = new CandidateService(new InMemoryCandidateRepository(), documentStorage);
  const uploadedResume = await uploadService.uploadResumeFile({
    originalName: "uploaded-resume.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1000,
    buffer: Buffer.from("pdf"),
  }, currentUser);
  assert.match(uploadedResume.data.storageKey, /^candidate\/1\/documents\/\d+-uploaded-resume\.pdf$/);
  assert.equal(documentStorage.objects[0]?.key, uploadedResume.data.storageKey);
  assert.equal(documentStorage.objects[0]?.contentType, "application/pdf");

  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(
      () =>
        service.uploadResume({
          storageKey: "candidate/1/metadata-only.pdf",
          originalName: "metadata-only.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1000,
        }, currentUser),
      (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
    );
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }

  await assert.rejects(
    () =>
      service.submitApplication(
        1,
        {
          candidateName: "Kim",
          email: "kim@example.com",
          phone: "010-0000-0000",
          resumeFileId: 999,
          portfolioUrl: "https://portfolio.example.com/kim",
          consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
        },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_NOT_FOUND",
  );

  await assert.rejects(
    () =>
      service.submitApplication(
        1,
        {
          candidateName: "Kim",
          email: "kim@example.com",
          phone: "010-0000-0000",
          resumeFileId: resume.data.fileId,
          consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
        },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  const submitted = await service.submitApplication(
    1,
    {
      candidateName: "Kim",
      email: "kim@example.com",
      phone: "010-0000-0000",
      resumeFileId: resume.data.fileId,
      portfolioUrl: "https://portfolio.example.com/kim",
      consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
    },
    currentUser,
  );
  assert.equal(submitted.data.application.applicationStatus, "SUBMITTED");
  assert.equal(submitted.data.application.documentStatus, "SUBMITTED");
  assert.equal(submitted.data.application.interviewStatus, "NOT_READY");
  assert.equal(submitted.data.application.postingId, 1);
  assert.equal(submitted.data.application.candidateId, currentUser.candidateId);
  assert.equal(submitted.data.documents.length, 1);
  assert.equal(submitted.data.documents[0]?.applicationId, submitted.data.application.applicationId);
  assert.equal(submitted.data.documents[0]?.fileId, resume.data.fileId);
  assert.equal(submitted.data.documents[0]?.documentType, "RESUME");
  assert.equal(submitted.data.documents[0]?.parseStatus, "SUBMITTED");
  assert.equal(submitted.data.consents.length, 2);
  assert.equal(submitted.data.consents[0]?.applicationId, submitted.data.application.applicationId);
  assert.equal(submitted.data.consents[0]?.agreed, true);
  assert.equal(submitted.data.portfolioLink?.applicationId, submitted.data.application.applicationId);
  assert.equal(submitted.data.portfolioLink?.linkType, "PORTFOLIO");

  const submittedJobDetail = await service.getJobDetail(1, currentUser);
  assert.equal(submittedJobDetail.data.alreadyApplied, true);
  assert.equal(submittedJobDetail.data.canApply, false);

  const submittedJobList = await service.listJobs({ page: 1, limit: 20, sort: "createdAt", order: "desc" }, currentUser);
  const submittedJobSummary = submittedJobList.data.items.find((job) => job.jobId === 1);
  assert.equal(submittedJobSummary?.alreadyApplied, true);
  assert.equal(submittedJobSummary?.canApply, false);

  const submittedApplyView = await service.getApplyView(1, currentUser);
  assert.equal(submittedApplyView.data.job.alreadyApplied, true);
  assert.equal(submittedApplyView.data.job.canApply, false);

  const applicationList = await service.listApplications(currentUser);
  assert.equal(applicationList.data.items.length, 1);
  assert.equal(applicationList.data.items[0]?.applicationId, submitted.data.application.applicationId);
  assert.equal(applicationList.data.items[0]?.applicationStatus, "SUBMITTED");
  assert.equal(applicationList.data.items[0]?.documentStatus, "SUBMITTED");
  assert.equal(applicationList.data.items[0]?.interviewStatus, "NOT_READY");
  assert.equal(applicationList.data.items[0]?.reportStatus, "PENDING");
  assert.equal(applicationList.data.items[0]?.consentCompleted, false);
  assert.equal(applicationList.data.items[0]?.deviceCheckCompleted, false);
  assert.equal(applicationList.data.items[0]?.canStartInterview, false);
  assert.equal(applicationList.data.items[0]?.sessionId, 1);

  const otherCandidateUser = { userId: 2, candidateId: 2, userType: "CANDIDATE" as const };
  const otherCandidateApplications = await service.listApplications(otherCandidateUser);
  assert.equal(otherCandidateApplications.data.items.length, 0);
  await assert.rejects(
    () => service.getInterviewGuide(submitted.data.application.applicationId, otherCandidateUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_FORBIDDEN",
  );

  const guide = await service.getInterviewGuide(submitted.data.application.applicationId, currentUser);
  assert.equal(guide.data.applicationId, submitted.data.application.applicationId);
  assert.equal(guide.data.sessionId, applicationList.data.items[0]?.sessionId);
  assert.equal(guide.data.interviewType, "RECRUITING");
  assert.equal(guide.data.consentCompleted, false);
  assert.equal(guide.data.deviceCheckCompleted, false);
  assert.equal(guide.data.canStart, false);
  assert.ok(guide.data.method.length > 0);
  assert.ok(guide.data.requiredPreparations.length > 0);

  await assert.rejects(
    () => service.startInterview(submitted.data.application.applicationId, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_CONFLICT",
  );

  const consentSaved = await service.saveInterviewConsent(
    submitted.data.application.applicationId,
    { consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"] },
    currentUser,
  );
  assert.equal(consentSaved.data.applicationId, submitted.data.application.applicationId);
  assert.equal(consentSaved.data.consentCompleted, true);
  assert.equal(consentSaved.data.deviceCheckCompleted, false);
  assert.equal(consentSaved.data.canStart, false);
  assert.equal(consentSaved.data.consents.some((consent) => consent.consentType === "AI_INTERVIEW_RECORDING"), true);

  const pendingRuntime = await service.getInterviewRuntime(submitted.data.application.applicationId, currentUser);
  assert.equal(pendingRuntime.data.status, "NOT_READY");
  assert.equal(pendingRuntime.data.canRecord, false);

  await assert.rejects(
    () => service.startInterview(submitted.data.application.applicationId, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_CONFLICT",
  );

  await assert.rejects(
    () =>
      service.saveDeviceCheck(
        consentSaved.data.sessionId,
        { cameraGranted: false, microphoneGranted: true, networkStable: true },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "DEVICE_PERMISSION_DENIED",
  );

  const deviceChecked = await service.saveDeviceCheck(
    consentSaved.data.sessionId,
    { cameraGranted: true, microphoneGranted: true, networkStable: true },
    currentUser,
  );
  assert.equal(deviceChecked.data.applicationId, submitted.data.application.applicationId);
  assert.equal(deviceChecked.data.deviceCheckCompleted, true);
  assert.equal(deviceChecked.data.consentCompleted, true);
  assert.equal(deviceChecked.data.canStart, true);

  const readyApplications = await service.listApplications(currentUser);
  assert.equal(readyApplications.data.items[0]?.interviewStatus, "READY");
  assert.equal(readyApplications.data.items[0]?.interviewSessionStatus, "READY");

  const deviceFirstRepository = new InMemoryCandidateRepository();
  const deviceFirstService = new CandidateService(deviceFirstRepository);
  const deviceFirstSubmission = await deviceFirstRepository.createApplication({
    postingId: 1,
    candidateId: currentUser.candidateId,
    resumeFileId: 1,
    consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
  });
  const deviceFirstSession = await deviceFirstRepository.findInterviewSessionByApplication(
    deviceFirstSubmission.application.applicationId,
  );
  assert.ok(deviceFirstSession);
  await deviceFirstService.saveDeviceCheck(
    deviceFirstSession.sessionId,
    { cameraGranted: true, microphoneGranted: true, networkStable: true },
    currentUser,
  );
  await deviceFirstRepository.updateInterviewSessionStatus(deviceFirstSession.sessionId, "READY");
  const deviceFirstConsent = await deviceFirstService.saveInterviewConsent(
    deviceFirstSubmission.application.applicationId,
    { consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"] },
    currentUser,
  );
  assert.equal(deviceFirstConsent.data.canStart, true);
  const deviceFirstApplications = await deviceFirstService.listApplications(currentUser);
  assert.equal(deviceFirstApplications.data.items[0]?.interviewStatus, "READY");
  assert.equal(deviceFirstApplications.data.items[0]?.interviewSessionStatus, "READY");

  await assert.rejects(
    () =>
      service.getInterviewGuide(submitted.data.application.applicationId, {
        userId: 3,
        candidateId: 999,
        userType: "CANDIDATE",
      }),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_FORBIDDEN",
  );

  const startedInterview = await service.startInterview(submitted.data.application.applicationId, currentUser);
  assert.equal(startedInterview.data.applicationId, submitted.data.application.applicationId);
  assert.equal(startedInterview.data.sessionId, consentSaved.data.sessionId);
  assert.equal(startedInterview.data.interviewStatus, "IN_PROGRESS");
  assert.equal(startedInterview.data.sessionStatus, "IN_PROGRESS");
  assert.equal(startedInterview.data.interviewUrl, `/candidate/applications/${submitted.data.application.applicationId}/interview`);

  const resumedInterview = await service.startInterview(submitted.data.application.applicationId, currentUser);
  assert.equal(resumedInterview.data.applicationId, submitted.data.application.applicationId);
  assert.equal(resumedInterview.data.sessionId, consentSaved.data.sessionId);
  assert.equal(resumedInterview.data.interviewStatus, "IN_PROGRESS");
  assert.equal(resumedInterview.data.sessionStatus, "IN_PROGRESS");
  assert.equal(resumedInterview.data.interviewUrl, `/candidate/applications/${submitted.data.application.applicationId}/interview`);

  const runtime = await service.getInterviewRuntime(submitted.data.application.applicationId, currentUser);
  assert.equal(runtime.data.applicationId, submitted.data.application.applicationId);
  assert.equal(runtime.data.sessionId, consentSaved.data.sessionId);
  assert.equal(runtime.data.status, "IN_PROGRESS");
  assert.equal(runtime.data.showQuestionText, true);
  assert.equal(runtime.data.canRecord, true);
  assert.deepEqual(runtime.data.timePolicy, {
    preparationTimeSec: 0,
    answerTimeSec: 90,
    retryAllowed: false,
  });

  const expiredRepository = new InMemoryCandidateRepository();
  const expiredService = new CandidateService(expiredRepository);
  const expiredSubmission = await expiredRepository.createApplication({
    postingId: 1,
    candidateId: currentUser.candidateId,
    resumeFileId: 1,
    consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
  });
  const expiredSession = await expiredRepository.findInterviewSessionByApplication(
    expiredSubmission.application.applicationId,
  );
  assert.ok(expiredSession);
  expiredSession.windowEndsAt = "2000-01-01T00:00:00.000Z";
  await assert.rejects(
    () => expiredService.getInterviewGuide(expiredSubmission.application.applicationId, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "INTERVIEW_SESSION_EXPIRED",
  );

  const completedRepository = new InMemoryCandidateRepository();
  const completedService = new CandidateService(completedRepository);
  const completedSubmission = await completedRepository.createApplication({
    postingId: 1,
    candidateId: currentUser.candidateId,
    resumeFileId: 1,
    consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
  });
  const completedSession = await completedRepository.findInterviewSessionByApplication(
    completedSubmission.application.applicationId,
  );
  assert.ok(completedSession);
  await completedService.saveInterviewConsent(
    completedSubmission.application.applicationId,
    { consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"] },
    currentUser,
  );
  await completedService.saveDeviceCheck(
    completedSession.sessionId,
    { cameraGranted: true, microphoneGranted: true, networkStable: true },
    currentUser,
  );
  await completedService.startInterview(completedSubmission.application.applicationId, currentUser);
  await completedRepository.updateApplicationInterviewStatus(completedSubmission.application.applicationId, "COMPLETED");
  await completedRepository.updateInterviewSessionStatus(completedSession.sessionId, "COMPLETED");
  await assert.rejects(
    () => completedService.startInterview(completedSubmission.application.applicationId, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_CONFLICT",
  );

  await assert.rejects(
    () =>
      service.submitApplication(
        1,
        {
          candidateName: "Kim",
          email: "kim@example.com",
          phone: "010-0000-0000",
          resumeFileId: resume.data.fileId,
          portfolioUrl: "https://portfolio.example.com/kim",
          consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
        },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "APPLICATION_ALREADY_SUBMITTED",
  );

  await assert.rejects(
    () =>
      service.uploadResume({
        storageKey: "candidate/1/resume.exe",
        originalName: "resume.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 1000,
      }, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "FILE_INVALID_TYPE",
  );

  await assert.rejects(
    () =>
      service.uploadResume({
        storageKey: "candidate/1/resume.pdf",
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        sizeBytes: 20 * 1024 * 1024 + 1,
      }, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "FILE_SIZE_EXCEEDED",
  );

  await assert.rejects(
    () =>
      service.uploadResume({
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
      } as never, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () =>
      service.uploadResume({
        storageKey: "candidate/1/resume.pdf",
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        sizeBytes: 0,
      }, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () =>
      service.uploadResume({
        storageKey: "candidate/1/resume.pdf",
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        content: "raw-file-payload",
      } as never, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () =>
      service.uploadResume({
        storageKey: "candidate/2/resume.pdf",
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
      }, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  const portfolioFile = await service.uploadResume({
    storageKey: "candidate/1/portfolio.pdf",
    originalName: "portfolio.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1000,
  }, currentUser);
  await assert.rejects(
    () =>
      service.submitApplication(
        2,
        {
          candidateName: "Kim",
          email: "kim@example.com",
          phone: "010-0000-0000",
          resumeFileId: resume.data.fileId,
          portfolioUrl: "ftp://example.com/portfolio",
          consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
        },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );
  const secondSubmitted = await service.submitApplication(
    2,
    {
      candidateName: "Kim",
      email: "kim@example.com",
      phone: "010-0000-0000",
      resumeFileId: resume.data.fileId,
      portfolioFileId: portfolioFile.data.fileId,
      portfolioUrl: "https://github.com/example",
      consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
    },
    currentUser,
  );
  assert.equal(secondSubmitted.data.documents.length, 2);
  assert.equal(secondSubmitted.data.application.postingId, 2);
  assert.equal(secondSubmitted.data.documents[0]?.applicationId, secondSubmitted.data.application.applicationId);
  assert.equal(secondSubmitted.data.documents[0]?.fileId, resume.data.fileId);
  assert.equal(secondSubmitted.data.documents[0]?.parseStatus, "SUBMITTED");
  assert.equal(secondSubmitted.data.documents[1]?.applicationId, secondSubmitted.data.application.applicationId);
  assert.equal(secondSubmitted.data.documents[1]?.fileId, portfolioFile.data.fileId);
  assert.equal(secondSubmitted.data.documents[1]?.parseStatus, "SUBMITTED");
  assert.equal(secondSubmitted.data.portfolioLink?.applicationId, secondSubmitted.data.application.applicationId);
  assert.equal(secondSubmitted.data.portfolioLink?.linkType, "GITHUB");
  assert.equal(secondSubmitted.data.portfolioLink?.url, "https://github.com/example");
  assert.equal(secondSubmitted.data.documents[0]?.documentType, "RESUME");
  assert.equal(secondSubmitted.data.documents[1]?.documentType, "PORTFOLIO");
  assert.notEqual(secondSubmitted.data.documents[0]?.documentId, secondSubmitted.data.documents[1]?.documentId);

  await assert.rejects(
    () => service.getJobDetail(3, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_NOT_FOUND",
  );

  await assert.rejects(
    () => service.getJobDetail(4, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_NOT_FOUND",
  );

  await assert.rejects(
    () =>
      service.submitApplication(
        2,
        {
          candidateName: "Kim",
          email: "kim@example.com",
          phone: "010-0000-0000",
          resumeFileId: resume.data.fileId,
          portfolioUrl: "https://portfolio.example.com/kim",
          consentTypes: ["PRIVACY_COLLECTION"],
        },
        currentUser,
      ),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  const portfolio = await service.createPortfolioLink(
    { linkType: "GITHUB", url: "https://github.com/example", description: "GitHub" },
    currentUser,
  );
  assert.equal(portfolio.data.candidateId, currentUser.candidateId);
  assert.equal(portfolio.data.applicationId, undefined);
  assert.equal(portfolio.data.linkType, "GITHUB");

  await assert.rejects(
    () => service.createPortfolioLink({ description: "Missing URL" } as never, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () => service.createPortfolioLink({ linkType: "BLOG" as never, url: "https://example.com" }, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () => service.createPortfolioLink({ url: "https://example.com", fileId: -1 }, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () => service.createPortfolioLink({ url: "ftp://example.com" }, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );

  await assert.rejects(
    () => service.createPortfolioLink({ linkType: "GITHUB", url: "https://example.com/not-github" }, currentUser),
    (error) => error instanceof CandidateDomainError && error.code === "COMMON_VALIDATION_FAILED",
  );
}

test("candidate service contract", async () => {
  await run();
});
