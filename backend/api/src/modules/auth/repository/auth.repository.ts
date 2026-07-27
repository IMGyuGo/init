import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared/prisma.service";

type CreateCandidateAccountInput = {
  email: string;
  passwordHash: string;
  name: string;
};

type CreateCompanyAccountInput = CreateCandidateAccountInput & {
  companyName: string;
  businessRegistrationNumber: string;
};

type CreateGoogleCandidateInput = {
  email: string;
  name: string;
  providerUserId: string;
};

@Injectable()
export class AuthRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(userId: bigint) {
    return this.prisma.user.findUnique({ where: { userId } });
  }

  createCandidateAccount(input: CreateCandidateAccountInput) {
    const now = new Date();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          userType: "CANDIDATE",
          name: input.name,
          phone: null,
          status: "ACTIVE",
          authProvider: "LOCAL",
          providerUserId: null,
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.candidateProfile.create({
        data: {
          userId: user.userId,
          defaultResumeFileId: null,
          portfolioUrl: null,
          githubUrl: null,
          summary: null,
          createdAt: now,
          updatedAt: now,
        },
      });

      return user;
    });
  }

  createCompanyAccount(input: CreateCompanyAccountInput) {
    const now = new Date();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          userType: "COMPANY",
          name: input.name,
          phone: null,
          status: "ACTIVE",
          authProvider: "LOCAL",
          providerUserId: null,
          createdAt: now,
          updatedAt: now,
        },
      });

      const company = await tx.company.create({
        data: {
          ownerUserId: user.userId,
          name: input.companyName,
          businessRegistrationNumber: input.businessRegistrationNumber,
          verificationStatus: "PENDING",
          industry: null,
          profile: null,
          talentProfile: null,
          evaluationPolicy: null,
          createdAt: now,
          updatedAt: now,
        },
      });

      return { user, company };
    });
  }

  updatePasswordHash(email: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { email },
      data: { passwordHash, updatedAt: new Date() },
    });
  }

  findCompanyByOwnerUserId(ownerUserId: bigint) {
    return this.prisma.company.findFirst({ where: { ownerUserId } });
  }

  findCandidateProfileByUserId(userId: bigint) {
    return this.prisma.candidateProfile.findUnique({ where: { userId } });
  }

  createGoogleCandidate(input: CreateGoogleCandidateInput) {
    const now = new Date();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: null,
          userType: "CANDIDATE",
          name: input.name,
          phone: null,
          status: "ACTIVE",
          authProvider: "GOOGLE",
          providerUserId: input.providerUserId,
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.candidateProfile.create({
        data: {
          userId: user.userId,
          defaultResumeFileId: null,
          portfolioUrl: null,
          githubUrl: null,
          summary: null,
          createdAt: now,
          updatedAt: now,
        },
      });

      return user;
    });
  }
}
