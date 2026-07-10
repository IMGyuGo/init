import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RecruitmentResponseDto {
  @ApiProperty({ example: 101 })
  recruitmentId!: number;

  @ApiProperty({ example: 101 })
  postingId!: number;

  @ApiProperty({ example: 1 })
  companyId!: number;

  @ApiProperty({ example: "2026 신입 백엔드 채용" })
  title!: string;

  @ApiProperty({ example: "Backend Developer" })
  jobRole!: string;

  @ApiPropertyOptional({ nullable: true, example: "NestJS와 PostgreSQL 기반 API 개발" })
  jobDescription!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "경력 3년 이상" })
  careerRequirement!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "대졸 이상" })
  educationRequirement!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "연봉 4,000만원 이상" })
  salaryInfo!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "판교" })
  workLocation!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "정규직" })
  employmentType!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "2026-06-29" })
  startsOn!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "2026-07-15" })
  endsOn!: string | null;

  @ApiProperty({ enum: ["DRAFT", "OPEN", "CLOSING_SOON", "CLOSED", "ARCHIVED"], example: "OPEN" })
  status!: string;

  @ApiProperty({ example: 3 })
  applicantCount!: number;

  @ApiProperty({ example: "2026-06-29T00:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-06-29T00:00:00.000Z" })
  updatedAt!: string;
}

export class PublicRecruitmentResponseDto {
  @ApiProperty({ example: 101 })
  recruitmentId!: number;

  @ApiProperty({ example: 101 })
  postingId!: number;

  @ApiProperty({ example: "크래프톤" })
  companyName!: string;

  @ApiProperty({ example: "2026 신입 백엔드 채용" })
  title!: string;

  @ApiProperty({ example: "Backend Developer" })
  jobRole!: string;

  @ApiPropertyOptional({ nullable: true, example: "NestJS와 PostgreSQL 기반 API 개발" })
  jobDescription!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "경력무관" })
  careerRequirement!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "학력무관" })
  educationRequirement!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "회사 내규에 따름" })
  salaryInfo!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "서울" })
  workLocation!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "정규직" })
  employmentType!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "2026-06-29" })
  startsOn!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "2026-07-15" })
  endsOn!: string | null;

  @ApiProperty({ enum: ["OPEN"], example: "OPEN" })
  status!: string;
}

export class PublicApplicationResponseDto {
  @ApiProperty({ example: 77 })
  applicationId!: number;

  @ApiProperty({ example: 101 })
  recruitmentId!: number;

  @ApiProperty({ example: "candidate@example.com" })
  email!: string;

  @ApiProperty({ example: "SUBMITTED" })
  applicationStatus!: string;

  @ApiProperty({ enum: ["PENDING"], example: "PENDING" })
  emailVerificationStatus!: string;

  @ApiProperty({ enum: ["CHECK_EMAIL"], example: "CHECK_EMAIL" })
  nextAction!: string;

  @ApiProperty({ example: true })
  temporary!: boolean;

  @ApiPropertyOptional({ nullable: true, example: null })
  temporaryBoundary!: string | null;

  @ApiProperty({ enum: ["SENT", "FAILED", "NOT_SENT_TEMPORARY"], example: "SENT" })
  magicLinkDeliveryStatus!: string;

  @ApiProperty({ example: 604800 })
  magicLinkExpiresInSeconds!: number;
}

export class PublicApplicationAccessLinkResponseDto {
  @ApiProperty({ example: 101 })
  recruitmentId!: number;

  @ApiProperty({ example: "candidate@example.com" })
  email!: string;

  @ApiProperty({ enum: ["PENDING"], example: "PENDING" })
  emailVerificationStatus!: string;

  @ApiProperty({ enum: ["CHECK_EMAIL"], example: "CHECK_EMAIL" })
  nextAction!: string;

  @ApiProperty({ enum: ["SENT", "FAILED"], example: "SENT" })
  magicLinkDeliveryStatus!: string;

  @ApiProperty({ example: 604800 })
  magicLinkExpiresInSeconds!: number;
}

export class PublicInterviewEntryResponseDto {
  @ApiProperty({ example: "/public/applications/77/interview" })
  href!: string;

  @ApiProperty({ enum: ["면접 시작", "면접 이어가기", "면접 완료"], example: "면접 시작" })
  label!: string;

  @ApiProperty({ example: true })
  enabled!: boolean;

  @ApiProperty({ enum: ["D_PUBLIC_CONTEXT_PENDING"], example: "D_PUBLIC_CONTEXT_PENDING" })
  integrationStatus!: string;

  @ApiProperty({ example: true })
  temporary!: boolean;

  @ApiProperty({ example: "B_MODULE_PUBLIC_INTERVIEW_ADAPTER" })
  temporaryBoundary!: string;

  @ApiProperty({ example: "면접 시작은 D public interview access context 연동 후 활성화됩니다." })
  message!: string;
}

export class PublicApplicationStatusResponseDto {
  @ApiProperty({ example: 77 })
  applicationId!: number;

  @ApiProperty({ example: 101 })
  recruitmentId!: number;

  @ApiProperty({ example: "candidate@example.com" })
  email!: string;

  @ApiProperty({ example: "김지원" })
  name!: string;

  @ApiProperty({ example: "Backend Developer" })
  jobRole!: string;

  @ApiProperty({ example: "SUBMITTED" })
  applicationStatus!: string;

  @ApiProperty({ example: "NOT_SUBMITTED" })
  documentStatus!: string;

  @ApiProperty({ example: "NOT_READY" })
  interviewStatus!: string;

  @ApiProperty({ example: "PENDING" })
  reportStatus!: string;

  @ApiProperty({ type: PublicInterviewEntryResponseDto })
  interviewEntry!: PublicInterviewEntryResponseDto;

  @ApiPropertyOptional({ nullable: true, example: "2026-06-29T00:00:00.000Z" })
  submittedAt!: string | null;

  @ApiProperty({ example: "2026-06-29T00:00:00.000Z" })
  updatedAt!: string;
}

export class PublicApplicationTokenVerificationResponseDto {
  @ApiProperty({ example: 77 })
  applicationId!: number;
}

export class JdImageUploadResponseDto {
  @ApiProperty({ example: 123 })
  fileId!: number;

  @ApiProperty({ example: 1 })
  ownerUserId!: number;

  @ApiProperty({ example: "company/1/jd-images/uuid-culture.webp" })
  storageKey!: string;

  @ApiProperty({ example: "culture.webp" })
  originalName!: string;

  @ApiProperty({ enum: ["image/png", "image/jpeg", "image/webp"], example: "image/webp" })
  mimeType!: string;

  @ApiProperty({ example: 245760 })
  sizeBytes!: number;

  @ApiProperty({ example: "ACTIVE" })
  status!: string;

  @ApiProperty({ example: "2026-07-02T00:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "https://cdn.example.com/company/1/jd-images/uuid-culture.webp" })
  url!: string;
}

export class InterviewSessionSummaryDto {
  @ApiProperty({ example: 10 })
  sessionId!: number;

  @ApiProperty({ enum: ["NOT_READY", "READY", "IN_PROGRESS", "COMPLETED", "FAILED"], example: "READY" })
  status!: string;

  @ApiProperty({ enum: ["MOCK", "RECRUITING"], example: "RECRUITING" })
  interviewType!: string;

  @ApiPropertyOptional({ nullable: true, example: "2026-06-30T09:00:00.000Z" })
  startedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, example: null })
  completedAt!: string | null;
}

export class ReportSummaryDto {
  @ApiProperty({ example: 501 })
  reportId!: number;

  @ApiProperty({ enum: ["PENDING", "GENERATING", "COMPLETED", "FAILED"], example: "COMPLETED" })
  status!: string;

  @ApiPropertyOptional({ nullable: true, example: 82 })
  totalScore!: number | null;

  @ApiPropertyOptional({ nullable: true, example: "지원 직무와 경험이 잘 맞습니다." })
  summary!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "2026-06-30T08:00:00.000Z" })
  generatedAt!: string | null;
}

export class ApplicantResponseDto {
  @ApiProperty({ example: 77 })
  applicantId!: number;

  @ApiProperty({ example: 77 })
  applicationId!: number;

  @ApiProperty({ example: 101 })
  recruitmentId!: number;

  @ApiProperty({ example: 44 })
  candidateId!: number;

  @ApiProperty({ example: "김지원" })
  name!: string;

  @ApiProperty({ example: "candidate@example.com" })
  email!: string;

  @ApiPropertyOptional({ nullable: true, example: "010-0000-0000" })
  phone!: string | null;

  @ApiProperty({ example: "Backend Developer" })
  jobRole!: string;

  @ApiProperty({ example: "SUBMITTED" })
  applicationStatus!: string;

  @ApiProperty({ example: "NOT_SUBMITTED" })
  documentStatus!: string;

  @ApiProperty({ example: "NOT_READY" })
  interviewStatus!: string;

  @ApiProperty({ example: "PENDING" })
  reportStatus!: string;

  @ApiProperty({ enum: ["UNDECIDED", "PASS", "HOLD", "FAIL"], example: "UNDECIDED" })
  screeningDecision!: string;

  @ApiPropertyOptional({ nullable: true, example: "추가 확인 필요" })
  screeningMemo!: string | null;

  @ApiPropertyOptional({ type: InterviewSessionSummaryDto, nullable: true })
  interviewSession!: InterviewSessionSummaryDto | null;

  @ApiPropertyOptional({ type: ReportSummaryDto, nullable: true })
  report!: ReportSummaryDto | null;

  @ApiProperty({ example: "2026-06-29T00:00:00.000Z" })
  updatedAt!: string;
}

export class ApplicantEvaluationResponseDto {
  @ApiProperty({ type: ApplicantResponseDto })
  applicant!: ApplicantResponseDto;

  @ApiProperty({ type: Object })
  recruitment!: Record<string, unknown>;

  @ApiProperty({ type: Object })
  statuses!: Record<string, unknown>;

  @ApiProperty({ type: Object })
  screening!: Record<string, unknown>;

  @ApiProperty({ type: Object })
  submission!: Record<string, unknown>;

  @ApiProperty({ enum: ["AVAILABLE", "NONE_OR_GENERATING"], example: "AVAILABLE" })
  reportAvailability!: string;

  @ApiProperty({ type: [Object] })
  answers!: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ type: ReportSummaryDto, nullable: true })
  report!: ReportSummaryDto | null;
}
