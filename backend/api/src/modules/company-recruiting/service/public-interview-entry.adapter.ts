import { Injectable } from "@nestjs/common";

import type { ApplicantRecord } from "../company-recruiting.types";

export type PublicInterviewEntry = {
  href: `/public/applications/${number}/interview`;
  label: "면접 시작" | "면접 이어가기" | "면접 완료";
  enabled: boolean;
  integrationStatus: "D_PUBLIC_CONTEXT_PENDING";
  temporary: true;
  temporaryBoundary: "B_MODULE_PUBLIC_INTERVIEW_ADAPTER";
  message: string;
};

export type PublicInterviewEntryAdapterPort = {
  buildEntry(application: ApplicantRecord): PublicInterviewEntry;
};

@Injectable()
export class DeferredPublicInterviewEntryAdapter implements PublicInterviewEntryAdapterPort {
  buildEntry(application: ApplicantRecord): PublicInterviewEntry {
    return {
      href: `/public/applications/${application.applicationId}/interview`,
      label: buildLabel(application.interviewStatus),
      enabled: application.interviewStatus !== "COMPLETED",
      integrationStatus: "D_PUBLIC_CONTEXT_PENDING",
      temporary: true,
      temporaryBoundary: "B_MODULE_PUBLIC_INTERVIEW_ADAPTER",
      message: "면접 시작은 D public interview access context 연동 후 활성화됩니다.",
    };
  }
}

function buildLabel(interviewStatus: string): PublicInterviewEntry["label"] {
  if (interviewStatus === "COMPLETED") {
    return "면접 완료";
  }
  if (interviewStatus === "IN_PROGRESS") {
    return "면접 이어가기";
  }
  return "면접 시작";
}
