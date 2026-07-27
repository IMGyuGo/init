import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { CurrentUser, UserType } from "./current-user";

type HeaderBag = Record<string, string | string[] | undefined>;

@Injectable()
export class DevAuthAdapter {
  parse(headers: HeaderBag): CurrentUser {
    const userId = this.numberHeader(headers, "x-dev-user-id");
    const userType = this.stringHeader(headers, "x-dev-user-type") as UserType | undefined;

    if (!userId || !userType) {
      throw new UnauthorizedException({
        code: "COMMON_UNAUTHORIZED",
        message: "Dev auth headers are required."
      });
    }

    if (!["ADMIN", "COMPANY", "CANDIDATE"].includes(userType)) {
      throw new ForbiddenException({
        code: "COMMON_FORBIDDEN",
        message: "Unsupported dev user type."
      });
    }

    const currentUser: CurrentUser = {
      userId,
      userType
    };

    const companyId = this.numberHeader(headers, "x-dev-company-id");
    const candidateId = this.numberHeader(headers, "x-dev-candidate-id");

    if (companyId) {
      currentUser.companyId = companyId;
    }

    if (candidateId) {
      currentUser.candidateId = candidateId;
    }

    return currentUser;
  }

  assertCompany(currentUser: CurrentUser): void {
    if (currentUser.userType !== "COMPANY" || !currentUser.companyId) {
      throw new ForbiddenException({
        code: "COMMON_FORBIDDEN",
        message: "Company user is required."
      });
    }
  }

  assertCandidate(currentUser: CurrentUser): void {
    if (currentUser.userType !== "CANDIDATE" || !currentUser.candidateId) {
      throw new ForbiddenException({
        code: "COMMON_FORBIDDEN",
        message: "Candidate user is required."
      });
    }
  }

  assertAdmin(currentUser: CurrentUser): void {
    if (currentUser.userType !== "ADMIN") {
      throw new ForbiddenException({
        code: "COMMON_FORBIDDEN",
        message: "Admin user is required."
      });
    }
  }

  private stringHeader(headers: HeaderBag, name: string): string | undefined {
    const value = headers[name] ?? headers[this.titleCaseHeader(name)];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private numberHeader(headers: HeaderBag, name: string): number | undefined {
    const value = this.stringHeader(headers, name);
    if (!value) {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  private titleCaseHeader(name: string): string {
    return name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("-");
  }
}
