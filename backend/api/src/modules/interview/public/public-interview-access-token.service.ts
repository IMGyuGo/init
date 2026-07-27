import { Injectable } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { ERROR_CODES } from "@init/common";
import { ApiException } from "../../../shared/api-exception";

export const PUBLIC_INTERVIEW_TOKEN_TYPE = "PUBLIC_INTERVIEW" as const;

export interface PublicInterviewAccess {
  tokenType: typeof PUBLIC_INTERVIEW_TOKEN_TYPE;
  applicationId: number;
  sessionId: number;
  candidateId: number;
  userId: number;
}

type PublicInterviewJwtPayload = PublicInterviewAccess & {
  sub: number;
};

@Injectable()
export class PublicInterviewAccessTokenService {
  issue(access: Omit<PublicInterviewAccess, "tokenType">): string {
    const payload: PublicInterviewJwtPayload = {
      tokenType: PUBLIC_INTERVIEW_TOKEN_TYPE,
      sub: access.candidateId,
      ...access,
    };

    return jwt.sign(payload, this.secret(), {
      expiresIn: this.ttlSeconds(),
    });
  }

  verify(token: string): PublicInterviewAccess {
    try {
      const payload = jwt.verify(token, this.secret()) as Partial<PublicInterviewJwtPayload>;
      if (payload.tokenType !== PUBLIC_INTERVIEW_TOKEN_TYPE) {
        throw new Error("token type mismatch");
      }

      const applicationId = Number(payload.applicationId);
      const sessionId = Number(payload.sessionId);
      const candidateId = Number(payload.candidateId);
      const userId = Number(payload.userId);
      if (![applicationId, sessionId, candidateId, userId].every((value) => Number.isInteger(value) && value > 0)) {
        throw new Error("token payload is invalid");
      }

      return {
        tokenType: PUBLIC_INTERVIEW_TOKEN_TYPE,
        applicationId,
        sessionId,
        candidateId,
        userId,
      };
    } catch {
      throw new ApiException(ERROR_CODES.COMMON_UNAUTHORIZED, "Public interview access token is invalid.", 401);
    }
  }

  private ttlSeconds(): number {
    const value = Number(process.env.PUBLIC_INTERVIEW_ACCESS_TOKEN_TTL_SECONDS ?? 60 * 60);
    return Number.isInteger(value) && value > 0 ? value : 60 * 60;
  }

  private secret(): string {
    return process.env.PUBLIC_INTERVIEW_ACCESS_TOKEN_SECRET ?? process.env.JWT_SECRET ?? "local-dev-jwt-secret-change-me";
  }
}
