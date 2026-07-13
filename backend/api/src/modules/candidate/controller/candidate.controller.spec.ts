import "reflect-metadata";
import { strict as assert } from "node:assert";
import { HttpException, RequestMethod, type INestApplication } from "@nestjs/common";
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { CandidateController } from "./candidate.controller";
import { candidateApiRoutePrefix, candidateApiRoutes } from "../candidate.routes";
import { InMemoryCandidateRepository } from "../repository/in-memory-candidate.repository";
import { CANDIDATE_REPOSITORY, CandidateService, DEV_CANDIDATE_USER, MAX_DOCUMENT_SIZE_BYTES } from "../service/candidate.service";
import { CANDIDATE_DOCUMENT_STORAGE, InMemoryCandidateDocumentStorageAdapter } from "../service/candidate-document-storage.adapter";

type CandidateControllerRoute =
  | "getProfile"
  | "updateProfile"
  | "listJobs"
  | "getJobDetail"
  | "getApplyView"
  | "submitApplication"
  | "uploadResume"
  | "createPortfolioLink"
  | "listFolders"
  | "createFolder"
  | "getFolder"
  | "updateFolder"
  | "deleteFolder"
  | "listApplications"
  | "getInterviewGuide"
  | "saveInterviewConsent";

function assertRoute(
  methodName: CandidateControllerRoute,
  expectedPath: string,
  expectedMethod: RequestMethod,
  expectedStatusCode?: number,
) {
  const handler = CandidateController.prototype[methodName];

  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), expectedPath);
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), expectedMethod);
  if (expectedStatusCode) {
    assert.equal(Reflect.getMetadata(HTTP_CODE_METADATA, handler), expectedStatusCode);
  }
}

assert.equal(Reflect.getMetadata(PATH_METADATA, CandidateController), candidateApiRoutePrefix);
assertRoute("getProfile", candidateApiRoutes.profile, RequestMethod.GET);
assertRoute("updateProfile", candidateApiRoutes.profile, RequestMethod.PUT);
assertRoute("listJobs", candidateApiRoutes.jobs, RequestMethod.GET);
assertRoute("getJobDetail", candidateApiRoutes.jobDetail, RequestMethod.GET);
assertRoute("getApplyView", candidateApiRoutes.applyView, RequestMethod.GET);
assertRoute("submitApplication", candidateApiRoutes.submitApplication, RequestMethod.POST, 201);
assertRoute("uploadResume", candidateApiRoutes.resume, RequestMethod.POST, 201);
assertRoute("createPortfolioLink", candidateApiRoutes.portfolioLinks, RequestMethod.POST, 201);
assertRoute("listFolders", candidateApiRoutes.folders, RequestMethod.GET);
assertRoute("createFolder", candidateApiRoutes.folders, RequestMethod.POST, 201);
assertRoute("getFolder", candidateApiRoutes.folderDetail, RequestMethod.GET);
assertRoute("updateFolder", candidateApiRoutes.folderDetail, RequestMethod.PATCH);
assertRoute("deleteFolder", candidateApiRoutes.folderDetail, RequestMethod.DELETE, 204);
assertRoute("listApplications", candidateApiRoutes.applications, RequestMethod.GET);
assertRoute("getInterviewGuide", candidateApiRoutes.interviewGuide, RequestMethod.GET);
assertRoute("saveInterviewConsent", candidateApiRoutes.interviewConsent, RequestMethod.POST);

const validCandidateRequest = {
  headers: {},
  currentUser: { ...DEV_CANDIDATE_USER, companyId: null },
};

const validSubmitApplication = {
  candidateName: "Kim",
  email: "kim@example.com",
  phone: "010-0000-0000",
  githubUrl: "https://github.com/kim",
  blogUrl: "https://blog.example.com/kim",
  portfolioUrl: "https://portfolio.example.com/kim",
  motivation: "지원 동기입니다.",
  additionalInfo: "추가 설명입니다.",
};

const missingCandidateRequest = {
  headers: {},
  currentUser: undefined,
} as never;

async function assertCandidateHttpError(
  action: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode: string,
) {
  try {
    await action();
    assert.fail(`Expected ${expectedCode}`);
  } catch (error) {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), expectedStatus);

    const response = error.getResponse() as { code?: string; details?: unknown[] };
    assert.equal(response.code, expectedCode);
    assert.ok(Array.isArray(response.details));
  }
}

async function runControllerRuntimeAssertions() {
  const documentStorage = new InMemoryCandidateDocumentStorageAdapter();
  const controller = new CandidateController(new CandidateService(new InMemoryCandidateRepository(), documentStorage));

  const listResponse = await controller.listJobs(validCandidateRequest, {
    page: 1,
    limit: 20,
    sort: "createdAt",
    order: "desc",
  });
  assert.equal(listResponse.data.items.length, 2);
  assert.equal(listResponse.data.items.some((job) => job.postingStatus === "CLOSED"), false);

  await assertCandidateHttpError(
    () => controller.listJobs(missingCandidateRequest, { page: 1, limit: 20, sort: "createdAt", order: "desc" }),
    401,
    "COMMON_UNAUTHORIZED",
  );

  await assertCandidateHttpError(
    () => controller.getJobDetail(validCandidateRequest, "3"),
    404,
    "COMMON_NOT_FOUND",
  );

  await assertCandidateHttpError(
    () =>
      controller.uploadResume(validCandidateRequest, {
        storageKey: "candidate/1/resume.exe",
        originalName: "resume.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 1000,
      }),
    400,
    "FILE_INVALID_TYPE",
  );

  await assertCandidateHttpError(
    () =>
      controller.uploadResume(validCandidateRequest, {
        storageKey: "candidate/1/resume.pdf",
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        sizeBytes: 20 * 1024 * 1024 + 1,
      }),
    400,
    "FILE_SIZE_EXCEEDED",
  );

  const multipartResume = await controller.uploadResume(
    validCandidateRequest,
    {} as never,
    {
      originalname: "controller-uploaded-resume.pdf",
      mimetype: "application/pdf",
      size: 1000,
      buffer: Buffer.from("pdf"),
    },
  );
  assert.match(multipartResume.data.storageKey, /^candidate\/1\/documents\/\d+-controller-uploaded-resume\.pdf$/);
  assert.equal(documentStorage.objects[0]?.key, multipartResume.data.storageKey);

  const koreanResumeName = "김민철 이력서.pdf";
  const mojibakeResumeName = Buffer.from(koreanResumeName, "utf8").toString("latin1");
  const koreanMultipartResume = await controller.uploadResume(
    validCandidateRequest,
    {} as never,
    {
      originalname: mojibakeResumeName,
      mimetype: "application/pdf",
      size: 1000,
      buffer: Buffer.from("pdf"),
    },
  );
  assert.equal(koreanMultipartResume.data.originalName, koreanResumeName);

  const resume = await controller.uploadResume(validCandidateRequest, {
    storageKey: "candidate/1/controller-resume.pdf",
    originalName: "controller-resume.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1000,
  });

  const portfolioPdf = await controller.uploadResume(validCandidateRequest, {
    storageKey: "candidate/1/controller-portfolio.pdf",
    originalName: "controller-portfolio.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2000,
  });

  const createdFolder = await controller.createFolder(validCandidateRequest, {
    name: "네이버 백엔드 지원 세트",
    githubUrl: "https://github.com/init/backend",
    blogUrl: "https://blog.example.com/init",
    portfolioUrl: "https://portfolio.example.com/init",
    resumeFileId: resume.data.fileId,
    portfolioFileId: portfolioPdf.data.fileId,
    motivation: "대규모 트래픽 API를 만들고 싶습니다.",
    extraNote: "NestJS와 Prisma 프로젝트 경험이 있습니다.",
  });
  assert.equal(createdFolder.data.name, "네이버 백엔드 지원 세트");
  assert.equal(createdFolder.data.resumeFileId, resume.data.fileId);
  assert.equal(createdFolder.data.resumeFileName, "controller-resume.pdf");
  // #272 P1-2: 세트에 포트폴리오 PDF 저장/조회
  assert.equal(createdFolder.data.portfolioFileId, portfolioPdf.data.fileId);
  assert.equal(createdFolder.data.portfolioFileName, "controller-portfolio.pdf");
  assert.equal(createdFolder.data.githubUrl, "https://github.com/init/backend");

  const folders = await controller.listFolders(validCandidateRequest);
  assert.equal(folders.data.items.length, 1);
  assert.equal(folders.data.items[0]?.id, createdFolder.data.id);
  assert.equal(folders.data.items[0]?.resumeFileName, "controller-resume.pdf");

  const folderDetail = await controller.getFolder(validCandidateRequest, String(createdFolder.data.id));
  assert.equal(folderDetail.data.motivation, "대규모 트래픽 API를 만들고 싶습니다.");
  assert.equal(folderDetail.data.resumeFileName, "controller-resume.pdf");

  const updatedFolder = await controller.updateFolder(validCandidateRequest, String(createdFolder.data.id), {
    name: "쿠팡 백엔드 지원 세트",
    portfolioUrl: null,
  });
  assert.equal(updatedFolder.data.name, "쿠팡 백엔드 지원 세트");
  assert.equal(updatedFolder.data.portfolioUrl, null);
  assert.equal(updatedFolder.data.resumeFileName, "controller-resume.pdf");

  await controller.deleteFolder(validCandidateRequest, String(createdFolder.data.id));
  const foldersAfterDelete = await controller.listFolders(validCandidateRequest);
  assert.equal(foldersAfterDelete.data.items.length, 0);

  // #272 프로필(내 정보) 조회·수정
  const profile = await controller.getProfile(validCandidateRequest);
  assert.equal(typeof profile.data.email, "string");
  const updatedProfile = await controller.updateProfile(validCandidateRequest, {
    githubUrl: "https://github.com/controller-test",
    blogUrl: "  ",
  });
  assert.equal(updatedProfile.data.githubUrl, "https://github.com/controller-test");
  assert.equal(updatedProfile.data.blogUrl, null);
  const reloadedProfile = await controller.getProfile(validCandidateRequest);
  assert.equal(reloadedProfile.data.githubUrl, "https://github.com/controller-test");

  await assertCandidateHttpError(
    () =>
      controller.submitApplication(validCandidateRequest, "1", {
        ...validSubmitApplication,
        resumeFileId: resume.data.fileId,
        consentTypes: ["PRIVACY_COLLECTION"],
      }),
    400,
    "COMMON_VALIDATION_FAILED",
  );

  const submitted = await controller.submitApplication(validCandidateRequest, "1", {
    ...validSubmitApplication,
    resumeFileId: resume.data.fileId,
    consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
  });

  const applications = await controller.listApplications(validCandidateRequest);
  assert.equal(applications.data.items.length, 1);
  assert.equal(applications.data.items[0]?.applicationId, submitted.data.application.applicationId);
  assert.equal(applications.data.items[0]?.interviewStatus, "NOT_READY");
  assert.equal(applications.data.items[0]?.reportStatus, "PENDING");
  assert.equal(applications.data.items[0]?.canStartInterview, false);

  const guide = await controller.getInterviewGuide(
    validCandidateRequest,
    String(submitted.data.application.applicationId),
  );
  assert.equal(guide.data.applicationId, submitted.data.application.applicationId);
  assert.equal(guide.data.sessionId, applications.data.items[0]?.sessionId);
  assert.equal(guide.data.canStart, false);

  const consent = await controller.saveInterviewConsent(
    validCandidateRequest,
    String(submitted.data.application.applicationId),
    { consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS", "AI_INTERVIEW_RECORDING"] },
  );
  assert.equal(consent.data.applicationId, submitted.data.application.applicationId);
  assert.equal(consent.data.sessionId, applications.data.items[0]?.sessionId);
  assert.equal(consent.data.consentCompleted, true);
  assert.equal(consent.data.deviceCheckCompleted, false);

  await assertCandidateHttpError(
    () =>
      controller.submitApplication(validCandidateRequest, "1", {
        ...validSubmitApplication,
        resumeFileId: resume.data.fileId,
        consentTypes: ["PRIVACY_COLLECTION", "AI_DOCUMENT_ANALYSIS"],
      }),
    409,
    "APPLICATION_ALREADY_SUBMITTED",
  );
}

test("candidate controller contract", async () => {
  await runControllerRuntimeAssertions();
});

test("candidate resume multipart upload rejects oversized files before storage", async () => {
  const documentStorage = new InMemoryCandidateDocumentStorageAdapter();
  const app = await createCandidateHttpTestApp(documentStorage);

  try {
    const response = await request(app.getHttpServer())
      .post(`/${candidateApiRoutePrefix}/${candidateApiRoutes.resume}`)
      .set("x-dev-user-id", String(DEV_CANDIDATE_USER.userId))
      .set("x-dev-user-type", DEV_CANDIDATE_USER.userType)
      .set("x-dev-candidate-id", String(DEV_CANDIDATE_USER.candidateId))
      .attach("file", Buffer.alloc(MAX_DOCUMENT_SIZE_BYTES + 1), {
        filename: "oversized-resume.pdf",
        contentType: "application/pdf",
      })
      .expect(400);

    assert.equal(response.body.error.code, "FILE_SIZE_EXCEEDED");
    assert.equal(documentStorage.objects.length, 0);
  } finally {
    await app.close();
  }
});

async function createCandidateHttpTestApp(
  documentStorage: InMemoryCandidateDocumentStorageAdapter,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [CandidateController],
    providers: [
      {
        provide: CANDIDATE_REPOSITORY,
        useValue: new InMemoryCandidateRepository(),
      },
      {
        provide: CANDIDATE_DOCUMENT_STORAGE,
        useValue: documentStorage,
      },
      CandidateService,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
