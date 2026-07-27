import { Injectable } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { CandidateDomainError } from "../../candidate";

export const PUBLIC_APPLICATION_ACCESS_VERIFIER = Symbol("PUBLIC_APPLICATION_ACCESS_VERIFIER");

export interface VerifiedPublicApplicationAccess {
  applicationId: number;
}

export interface PublicApplicationAccessVerifier {
  verifyApplicationToken(token: string): Promise<VerifiedPublicApplicationAccess>;
}

type MagicTokenPayload = {
  tokenType?: string;
  applicationId?: number;
};

@Injectable()
export class DefaultPublicApplicationAccessVerifier implements PublicApplicationAccessVerifier {
  async verifyApplicationToken(token: string): Promise<VerifiedPublicApplicationAccess> {
    if (!token.trim()) {
      throw this.unauthorized("token is required");
    }

    const remoteResult = await this.verifyWithRemoteAdapter(token);
    if (remoteResult) return remoteResult;

    const jwtResult = this.verifySignedToken(token);
    if (jwtResult) return jwtResult;

    const devResult = this.verifyDevToken(token);
    if (devResult) return devResult;

    throw this.unauthorized("token could not be verified");
  }

  private async verifyWithRemoteAdapter(token: string): Promise<VerifiedPublicApplicationAccess | undefined> {
    const verifyUrl = process.env.PUBLIC_APPLICATION_TOKEN_VERIFY_URL;
    if (!verifyUrl) return undefined;

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (process.env.PUBLIC_APPLICATION_TOKEN_VERIFY_SECRET) {
      headers["x-public-application-verify-secret"] = process.env.PUBLIC_APPLICATION_TOKEN_VERIFY_SECRET;
    }

    const response = await fetch(verifyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      throw this.unauthorized("remote token verification failed");
    }

    const payload = (await response.json().catch(() => ({}))) as {
      applicationId?: unknown;
      data?: { applicationId?: unknown };
    };
    return this.toVerifiedAccess(payload.applicationId ?? payload.data?.applicationId);
  }

  private verifySignedToken(token: string): VerifiedPublicApplicationAccess | undefined {
    try {
      const payload = jwt.verify(token, this.jwtSecret()) as MagicTokenPayload;
      if (!["PUBLIC_APPLICATION", "APPLICATION_MAGIC", "MAGIC_LINK"].includes(String(payload.tokenType))) {
        return undefined;
      }
      return this.toVerifiedAccess(payload.applicationId);
    } catch {
      return undefined;
    }
  }

  private verifyDevToken(token: string): VerifiedPublicApplicationAccess | undefined {
    if (!["local", "development", "test"].includes(process.env.NODE_ENV ?? "development")) {
      return undefined;
    }

    const match = token.match(/^(?:application|applicationId|public-application):(\d+)$/i);
    if (!match) return undefined;
    return this.toVerifiedAccess(Number(match[1]));
  }

  private toVerifiedAccess(value: unknown): VerifiedPublicApplicationAccess {
    const applicationId = Number(value);
    if (!Number.isInteger(applicationId) || applicationId < 1) {
      throw this.unauthorized("verified applicationId is invalid");
    }
    return { applicationId };
  }

  private jwtSecret(): string {
    return process.env.PUBLIC_APPLICATION_TOKEN_SECRET ?? process.env.JWT_SECRET ?? "local-dev-jwt-secret-change-me";
  }

  private unauthorized(reason: string): CandidateDomainError {
    return new CandidateDomainError("COMMON_UNAUTHORIZED", "Public application token is invalid.", 401, [
      { field: "token", reason },
    ]);
  }
}
