import type { RecruitmentStatus } from "./types";

export type CompanyPostingAction = "manage";

const postingActionsByStatus: Record<RecruitmentStatus, readonly CompanyPostingAction[]> = {
  DRAFT: ["manage"],
  OPEN: ["manage"],
  CLOSING_SOON: ["manage"],
  CLOSED: ["manage"],
  ARCHIVED: ["manage"],
};

export function getCompanyPostingActions(posting: { status: RecruitmentStatus }): readonly CompanyPostingAction[] {
  return postingActionsByStatus[posting.status];
}
