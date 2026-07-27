import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { ERROR_CODES, isUserType, type CurrentUser } from "@init/common";
import { ApiException } from "../../shared/api-exception";
import type { JwtPayload } from "./auth.types";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

    if (bearerToken) {
      request.currentUser = this.toCurrentUser(this.verifyToken(bearerToken, "access"));
      return true;
    }

    const devUser = this.readDevAuth(request.headers);
    if (devUser) {
      request.currentUser = devUser;
      return true;
    }

    const demoCandidate = this.readCandidateDemoAuth(request);
    if (demoCandidate) {
      request.currentUser = demoCandidate;
      return true;
    }

    throw new ApiException(ERROR_CODES.COMMON_UNAUTHORIZED, "로그인이 필요합니다.", 401);
  }

  verifyToken(token: string, tokenType: "access" | "refresh"): JwtPayload {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET ?? "local-dev-jwt-secret-change-me") as unknown as JwtPayload;
      if (decoded.tokenType !== tokenType) throw new Error("token type mismatch");
      return decoded;
    } catch {
      throw new ApiException(ERROR_CODES.COMMON_UNAUTHORIZED, "토큰이 유효하지 않습니다.", 401);
    }
  }

  private readDevAuth(headers: Record<string, string | undefined>): CurrentUser | null {
    if (!["local", "development", "test"].includes(process.env.NODE_ENV ?? "development")) return null;
    const userId = Number(headers["x-dev-user-id"]);
    const userType = headers["x-dev-user-type"];
    if (!userId || !isUserType(userType)) return null;
    return {
      userId,
      userType,
      companyId: headers["x-dev-company-id"] ? Number(headers["x-dev-company-id"]) : null,
      candidateId: headers["x-dev-candidate-id"] ? Number(headers["x-dev-candidate-id"]) : null,
    };
  }

  private readCandidateDemoAuth(request: { originalUrl?: string; url?: string }): CurrentUser | null {
    if (!["local", "development", "test"].includes(process.env.NODE_ENV ?? "development")) return null;
    if (process.env.CANDIDATE_DEMO_NO_AUTH !== "true") return null;

    const url = request.originalUrl ?? request.url ?? "";
    if (!url.includes("/candidate")) return null;

    return {
      userId: 2,
      userType: "CANDIDATE",
      companyId: null,
      candidateId: 1,
    };
  }

  private toCurrentUser(payload: JwtPayload): CurrentUser {
    return {
      userId: payload.sub,
      userType: payload.userType,
      companyId: payload.companyId,
      candidateId: payload.candidateId,
    };
  }
}
