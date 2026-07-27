import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { randomInt, randomUUID } from "crypto";
import { ERROR_CODES, type CurrentUser, type UserType } from "@init/common";
import { ApiException } from "../../../shared/api-exception";
import { MailService } from "../../mail/mail.service";
import { JwtAuthGuard } from "../jwt-auth.guard";
import { AuthRepository } from "../repository/auth.repository";
import type { JwtPayload, TokenPair, VerificationPurpose } from "../auth.types";
import { VerificationCodeStore } from "../verification-code.store";

type SignupCandidateInput = {
  email: string;
  code: string;
  password: string;
  passwordConfirm: string;
  name: string;
  termsAgreed: boolean;
};

type SignupCompanyInput = SignupCandidateInput & {
  companyName: string;
  businessRegistrationNumber?: string;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthRepository) private readonly authRepository: AuthRepository,
    @Inject(VerificationCodeStore) private readonly codeStore: VerificationCodeStore,
    @Inject(MailService) private readonly mailer: MailService,
    @Inject(JwtAuthGuard) private readonly jwtGuard: JwtAuthGuard,
  ) {}

  async login(input: { email: string; password: string; userType: UserType }): Promise<TokenPair & { refreshToken: string }> {
    const email = this.normalizeEmail(input.email);
    const localUser = this.localNoDbUser(email, input.userType);
    if (localUser) {
      if ((input.password ?? "") !== "Password123") {
        throw new ApiException(ERROR_CODES.AUTH_INVALID_CREDENTIALS, "이메일 또는 비밀번호를 확인해 주세요.", HttpStatus.UNAUTHORIZED);
      }
      return this.issueLocalLogin(localUser);
    }

    const user = await this.authRepository.findUserByEmail(email);
    if (!user || user.status !== "ACTIVE" || user.userType !== input.userType || !user.passwordHash) {
      throw new ApiException(ERROR_CODES.AUTH_INVALID_CREDENTIALS, "이메일 또는 비밀번호를 확인해 주세요.", HttpStatus.UNAUTHORIZED);
    }
    const matched = await bcrypt.compare(input.password ?? "", user.passwordHash);
    if (!matched) {
      throw new ApiException(ERROR_CODES.AUTH_INVALID_CREDENTIALS, "이메일 또는 비밀번호를 확인해 주세요.", HttpStatus.UNAUTHORIZED);
    }
    return this.issueLogin(user);
  }

  async sendEmailCode(emailInput: string) {
    const email = this.normalizeEmail(emailInput);
    await this.ensureEmailAvailable(email);
    await this.sendCode(email, "SIGNUP");
    return { sent: true };
  }

  async verifyEmailCode(emailInput: string, code: string) {
    const email = this.normalizeEmail(emailInput);
    await this.verifyCode(email, "SIGNUP", code);
    return { verified: true };
  }

  async signupCandidate(input: SignupCandidateInput) {
    const email = this.normalizeEmail(input.email);
    this.validateSignupInput(input);
    await this.ensureEmailAvailable(email);
    await this.ensureVerified(email, "SIGNUP", input.code);
    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await this.authRepository.createCandidateAccount({
      email,
      passwordHash,
      name: input.name.trim(),
    });
    await this.codeStore.delete(email, "SIGNUP");
    return { userId: Number(user.userId), userType: "CANDIDATE" };
  }

  async signupCompany(input: SignupCompanyInput) {
    const email = this.normalizeEmail(input.email);
    this.validateSignupInput(input);
    if (!input.companyName?.trim()) {
      throw new ApiException(ERROR_CODES.COMMON_VALIDATION_FAILED, "회사명을 입력해 주세요.", HttpStatus.BAD_REQUEST);
    }
    await this.ensureEmailAvailable(email);
    await this.ensureVerified(email, "SIGNUP", input.code);
    const passwordHash = await bcrypt.hash(input.password, 12);

    const { user, company } = await this.authRepository.createCompanyAccount({
      email,
      passwordHash,
      name: input.name.trim(),
      companyName: input.companyName.trim(),
      businessRegistrationNumber: this.normalizeBusinessNumber(input.businessRegistrationNumber),
    });
    await this.codeStore.delete(email, "SIGNUP");
    return { userId: Number(user.userId), companyId: Number(company.companyId), userType: "COMPANY" };
  }

  async sendPasswordCode(emailInput: string) {
    const email = this.normalizeEmail(emailInput);
    await this.requirePasswordResetAccount(email);
    await this.sendCode(email, "PASSWORD_RESET");
    return { sent: true };
  }

  async verifyPasswordCode(emailInput: string, code: string) {
    const email = this.normalizeEmail(emailInput);
    await this.requirePasswordResetAccount(email);
    await this.verifyCode(email, "PASSWORD_RESET", code);
    return { verified: true };
  }

  async resetPassword(input: { email: string; code: string; password: string; passwordConfirm: string }) {
    const email = this.normalizeEmail(input.email);
    this.validatePasswordPair(input.password, input.passwordConfirm);
    await this.requirePasswordResetAccount(email);
    await this.ensureVerified(email, "PASSWORD_RESET", input.code);
    const passwordHash = await bcrypt.hash(input.password, 12);
    await this.authRepository.updatePasswordHash(email, passwordHash);
    await this.codeStore.delete(email, "PASSWORD_RESET");
    return { reset: true };
  }

  async me(currentUser: CurrentUser) {
    const localUser = this.localNoDbUserByCurrentUser(currentUser);
    if (localUser) return localUser;

    const user = await this.authRepository.findUserById(BigInt(currentUser.userId));
    if (!user) throw new ApiException(ERROR_CODES.COMMON_UNAUTHORIZED, "사용자를 찾을 수 없습니다.", HttpStatus.UNAUTHORIZED);
    return { ...currentUser, email: user.email, name: user.name };
  }

  async refresh(refreshToken: string | undefined): Promise<TokenPair & { refreshToken: string }> {
    if (!refreshToken) {
      throw new ApiException(ERROR_CODES.COMMON_UNAUTHORIZED, "refreshToken이 필요합니다.", HttpStatus.UNAUTHORIZED);
    }
    const payload = this.jwtGuard.verifyToken(refreshToken, "refresh");
    const user = await this.authRepository.findUserById(BigInt(payload.sub));
    if (!user || user.status !== "ACTIVE") {
      throw new ApiException(ERROR_CODES.COMMON_UNAUTHORIZED, "세션을 갱신할 수 없습니다.", HttpStatus.UNAUTHORIZED);
    }
    return this.issueLogin(user);
  }

  async googleLoginStart(userType: UserType) {
    if (userType !== "CANDIDATE") {
      throw new ApiException(ERROR_CODES.AUTH_USER_TYPE_MISMATCH, "기업 계정은 Google 로그인을 사용할 수 없습니다.", HttpStatus.FORBIDDEN);
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL;
    if (!clientId || !callbackUrl) {
      throw new ApiException(ERROR_CODES.COMMON_VALIDATION_FAILED, "Google OAuth 환경변수가 설정되지 않았습니다.", HttpStatus.BAD_REQUEST);
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: "openid email profile",
      state: "CANDIDATE",
      prompt: "select_account",
    });
    return { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  }

  async googleCallback(code: string | undefined, state: string | undefined): Promise<TokenPair & { refreshToken: string }> {
    if (state !== "CANDIDATE") {
      throw new ApiException(ERROR_CODES.AUTH_USER_TYPE_MISMATCH, "지원자 계정만 Google OAuth를 사용할 수 있습니다.", HttpStatus.FORBIDDEN);
    }
    if (!code) throw new ApiException(ERROR_CODES.COMMON_VALIDATION_FAILED, "Google 인증 코드가 필요합니다.", HttpStatus.BAD_REQUEST);
    const profile = await this.fetchGoogleProfile(code);
    let user = await this.authRepository.findUserByEmail(profile.email);
    if (user && user.userType !== "CANDIDATE") {
      throw new ApiException(ERROR_CODES.AUTH_USER_TYPE_MISMATCH, "기업 계정은 Google 로그인을 사용할 수 없습니다.", HttpStatus.FORBIDDEN);
    }
    if (user && (user.status !== "ACTIVE" || user.authProvider !== "GOOGLE" || user.providerUserId !== profile.sub)) {
      throw new ApiException(ERROR_CODES.COMMON_UNAUTHORIZED, "Google 계정으로 로그인할 수 없습니다.", HttpStatus.UNAUTHORIZED);
    }
    if (!user) {
      user = await this.authRepository.createGoogleCandidate({
        email: profile.email,
        name: profile.name,
        providerUserId: profile.sub,
      });
    }
    return this.issueLogin(user);
  }

  private async sendCode(email: string, purpose: VerificationPurpose) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const issueId = randomUUID();
    if (!await this.codeStore.issue(email, purpose, code, issueId)) {
      throw new ApiException(ERROR_CODES.COMMON_RATE_LIMITED, "인증 코드는 60초 후 다시 요청할 수 있습니다.", HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      await this.mailer.send({
        kind: purpose === "PASSWORD_RESET" ? "PASSWORD_RESET_VERIFICATION" : "SIGNUP_VERIFICATION",
        to: email,
        subject: purpose === "PASSWORD_RESET" ? "INIT 비밀번호 재설정 인증 코드" : "INIT 이메일 인증 코드",
        text: `인증 코드는 ${code} 입니다. 5분 안에 입력해 주세요.`,
      });
    } catch {
      await this.codeStore.clearIfOwned(email, purpose, issueId);
      throw new ApiException(
        ERROR_CODES.MAIL_DELIVERY_FAILED,
        "이메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async verifyCode(email: string, purpose: VerificationPurpose, code: string) {
    const record = await this.codeStore.get(email, purpose);
    if (!record || record.attempts >= 5) {
      throw new ApiException(ERROR_CODES.AUTH_EMAIL_CODE_INVALID, "인증 코드가 만료되었거나 유효하지 않습니다.", HttpStatus.BAD_REQUEST);
    }
    if (record.code !== code) {
      await this.codeStore.incrementAttempts(email, purpose, record);
      throw new ApiException(ERROR_CODES.AUTH_EMAIL_CODE_INVALID, "인증 코드를 확인해 주세요.", HttpStatus.BAD_REQUEST);
    }
    if (!await this.codeStore.markVerified(email, purpose, record)) {
      throw new ApiException(ERROR_CODES.AUTH_EMAIL_CODE_INVALID, "인증 코드가 변경되었습니다. 다시 확인해 주세요.", HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureVerified(email: string, purpose: VerificationPurpose, code: string) {
    const record = await this.codeStore.get(email, purpose);
    if (!record || !record.verified || record.code !== code) {
      throw new ApiException(ERROR_CODES.AUTH_EMAIL_CODE_INVALID, "이메일 인증을 완료해 주세요.", HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureEmailAvailable(email: string) {
    const exists = await this.authRepository.findUserByEmail(email);
    if (exists) throw new ApiException(ERROR_CODES.AUTH_EMAIL_DUPLICATED, "이미 가입된 이메일입니다.", HttpStatus.CONFLICT);
  }

  private async requirePasswordResetAccount(email: string) {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user || user.status !== "ACTIVE" || user.authProvider !== "LOCAL" || !user.passwordHash) {
      throw new ApiException(ERROR_CODES.COMMON_NOT_FOUND, "가입된 이메일을 확인해 주세요.", HttpStatus.NOT_FOUND);
    }
    return user;
  }

  private validateSignupInput(input: SignupCandidateInput) {
    if (!input.name?.trim()) throw new ApiException(ERROR_CODES.COMMON_VALIDATION_FAILED, "이름을 입력해 주세요.", HttpStatus.BAD_REQUEST);
    if (!input.termsAgreed) throw new ApiException(ERROR_CODES.COMMON_VALIDATION_FAILED, "필수 약관에 동의해 주세요.", HttpStatus.BAD_REQUEST);
    this.validatePasswordPair(input.password, input.passwordConfirm);
  }

  private validatePasswordPair(password: string, passwordConfirm: string) {
    if (password !== passwordConfirm) {
      throw new ApiException(ERROR_CODES.COMMON_VALIDATION_FAILED, "비밀번호 확인이 일치하지 않습니다.", HttpStatus.BAD_REQUEST);
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d)\S{8,}$/.test(password ?? "")) {
      throw new ApiException(ERROR_CODES.COMMON_VALIDATION_FAILED, "비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.", HttpStatus.BAD_REQUEST);
    }
  }

  private normalizeEmail(email: string) {
    const normalized = (email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new ApiException(ERROR_CODES.COMMON_VALIDATION_FAILED, "이메일 형식을 확인해 주세요.", HttpStatus.BAD_REQUEST);
    }
    return normalized;
  }

  private normalizeBusinessNumber(input?: string) {
    const digits = (input ?? "").replace(/\D/g, "");
    if (digits.length === 10) return digits;
    return String(Date.now()).slice(-10).padStart(10, "0");
  }

  private async issueLogin(user: { userId: bigint; email: string; name: string; userType: string }) {
    const current = await this.currentUserFor(user);
    const accessToken = this.signToken(current, "access");
    const refreshToken = this.signToken(current, "refresh");
    return { accessToken, refreshToken, user: { ...current, email: user.email, name: user.name } };
  }

  private issueLocalLogin(user: CurrentUser & { email: string; name: string }) {
    const current: CurrentUser = {
      userId: user.userId,
      userType: user.userType,
      companyId: user.companyId,
      candidateId: user.candidateId,
    };
    return {
      accessToken: this.signToken(current, "access"),
      refreshToken: this.signToken(current, "refresh"),
      user,
    };
  }

  private localNoDbUser(email: string, userType: UserType): (CurrentUser & { email: string; name: string }) | null {
    if (process.env.DISABLE_PRISMA_CONNECT !== "true") return null;
    if (userType === "CANDIDATE" && email === "dev.candidate@example.com") {
      return {
        userId: 2,
        userType: "CANDIDATE",
        companyId: null,
        candidateId: 1,
        email,
        name: "Dev Candidate User",
      };
    }
    if (userType === "COMPANY" && email === "dev.company@example.com") {
      return {
        userId: 1,
        userType: "COMPANY",
        companyId: 1,
        candidateId: null,
        email,
        name: "Dev Company User",
      };
    }
    return null;
  }

  private localNoDbUserByCurrentUser(currentUser: CurrentUser): (CurrentUser & { email: string; name: string }) | null {
    if (process.env.DISABLE_PRISMA_CONNECT !== "true") return null;
    if (currentUser.userType === "CANDIDATE" && currentUser.userId === 2 && currentUser.candidateId === 1) {
      return {
        ...currentUser,
        email: "dev.candidate@example.com",
        name: "Dev Candidate User",
      };
    }
    if (currentUser.userType === "COMPANY" && currentUser.userId === 1 && currentUser.companyId === 1) {
      return {
        ...currentUser,
        email: "dev.company@example.com",
        name: "Dev Company User",
      };
    }
    return null;
  }

  private signToken(current: CurrentUser, tokenType: "access" | "refresh") {
    const expiresIn = tokenType === "access" ? process.env.JWT_ACCESS_TOKEN_TTL ?? "15m" : process.env.JWT_REFRESH_TOKEN_TTL ?? "14d";
    const payload: JwtPayload = {
      sub: current.userId,
      userType: current.userType,
      companyId: current.companyId,
      candidateId: current.candidateId,
      tokenType,
    };
    return jwt.sign(payload, process.env.JWT_SECRET ?? "local-dev-jwt-secret-change-me", { expiresIn } as SignOptions);
  }

  private async currentUserFor(user: { userId: bigint; userType: string }): Promise<CurrentUser> {
    const userId = Number(user.userId);
    const userType = user.userType as UserType;
    const company = userType === "COMPANY" ? await this.authRepository.findCompanyByOwnerUserId(user.userId) : null;
    const candidate = userType === "CANDIDATE" ? await this.authRepository.findCandidateProfileByUserId(user.userId) : null;
    return {
      userId,
      userType,
      companyId: company ? Number(company.companyId) : null,
      candidateId: candidate ? Number(candidate.candidateId) : null,
    };
  }

  private async fetchGoogleProfile(code: string): Promise<{ sub: string; email: string; name: string }> {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: process.env.GOOGLE_CALLBACK_URL ?? "",
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) {
      throw new ApiException(ERROR_CODES.COMMON_UNAUTHORIZED, "Google 인증에 실패했습니다.", HttpStatus.UNAUTHORIZED);
    }
    const tokenJson = (await tokenResponse.json()) as { access_token?: string };
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!profileResponse.ok) {
      throw new ApiException(ERROR_CODES.COMMON_UNAUTHORIZED, "Google 계정 정보를 가져오지 못했습니다.", HttpStatus.UNAUTHORIZED);
    }
    const profile = (await profileResponse.json()) as { sub: string; email: string; name?: string };
    return { sub: profile.sub, email: this.normalizeEmail(profile.email), name: profile.name ?? profile.email };
  }
}
