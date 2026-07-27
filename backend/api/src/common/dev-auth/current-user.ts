export type UserType = "ADMIN" | "COMPANY" | "CANDIDATE";

export interface CurrentUser {
  userId: number;
  userType: UserType;
  companyId?: number;
  candidateId?: number;
}
