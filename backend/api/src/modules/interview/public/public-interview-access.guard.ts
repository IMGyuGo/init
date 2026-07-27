import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@init/common";
import { ApiException } from "../../../shared/api-exception";
import {
  PublicInterviewAccess,
  PublicInterviewAccessTokenService,
} from "./public-interview-access-token.service";

export type PublicInterviewRequest = {
  headers: Record<string, string | string[] | undefined>;
  publicInterviewAccess: PublicInterviewAccess;
  currentUser: {
    userId: number;
    userType: "CANDIDATE";
    companyId: null;
    candidateId: number;
  };
};

@Injectable()
export class PublicInterviewAccessGuard implements CanActivate {
  constructor(private readonly accessTokenService: PublicInterviewAccessTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<PublicInterviewRequest>();
    const token = this.readBearerToken(request.headers.authorization);
    if (!token) {
      throw new ApiException(ERROR_CODES.COMMON_UNAUTHORIZED, "Public interview access token is required.", 401);
    }

    const access = this.accessTokenService.verify(token);
    request.publicInterviewAccess = access;
    request.currentUser = {
      userId: access.userId,
      userType: "CANDIDATE",
      companyId: null,
      candidateId: access.candidateId,
    };
    return true;
  }

  private readBearerToken(header: string | string[] | undefined): string | null {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value?.startsWith("Bearer ")) return null;
    const token = value.slice("Bearer ".length).trim();
    return token || null;
  }
}
