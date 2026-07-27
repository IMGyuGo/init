import type { CurrentUser, UserType } from "@init/common";

export type TokenPair = {
  accessToken: string;
  user: CurrentUser & {
    email: string;
    name: string;
  };
};

export type JwtPayload = {
  sub: number;
  userType: UserType;
  companyId: number | null;
  candidateId: number | null;
  tokenType: "access" | "refresh";
};

export type VerificationPurpose = "SIGNUP" | "PASSWORD_RESET";
