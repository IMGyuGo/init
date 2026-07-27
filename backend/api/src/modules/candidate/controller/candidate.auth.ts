import type { CurrentUser } from "@init/common";
import { CandidateDomainError } from "../candidate.errors";
import type { CurrentCandidateUser } from "../candidate.types";

export function resolveCurrentCandidate(
  currentUser: CurrentUser | CurrentCandidateUser | undefined,
): CurrentCandidateUser {
  if (!currentUser?.userId) {
    throw new CandidateDomainError("COMMON_UNAUTHORIZED", "Login is required.", 401);
  }

  if (currentUser.userType !== "CANDIDATE" || !currentUser.candidateId) {
    throw new CandidateDomainError("COMMON_FORBIDDEN", "Candidate permission is required.", 403);
  }

  return {
    userId: currentUser.userId,
    candidateId: currentUser.candidateId,
    userType: "CANDIDATE",
  };
}
