import type { CurrentCandidateUser } from "./candidate.types";

export const DEV_CANDIDATE_USER: CurrentCandidateUser = {
  userId: 2,
  candidateId: 1,
  userType: "CANDIDATE",
};

export const FORBIDDEN_FILE_PAYLOAD_FIELDS = ["file", "buffer", "content", "base64", "binary", "stream"] as const;
