import { Module } from "@nestjs/common";
import { PrismaService } from "../../shared/prisma.service";
import { AuthController } from "./controller/auth.controller";
import { AuthRepository } from "./repository/auth.repository";
import { AuthService } from "./service/auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { MailModule } from "../mail/mail.module";
import { VerificationCodeStore } from "./verification-code.store";

@Module({
  imports: [MailModule],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, JwtAuthGuard, PrismaService, VerificationCodeStore],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
