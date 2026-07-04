import { Module } from "@nestjs/common";

import { PrismaService } from "../../shared/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { PaymentController } from "./controller/payment.controller";
import { PrismaPaymentRepository } from "./repository/payment.repository";
import { CandidateMockInterviewPassService } from "./service/candidate-mock-interview-pass.service";
import { PaymentService, type PaymentProviderPort, type PaymentRepositoryPort } from "./service/payment.service";
import { TossPaymentsClient } from "./service/toss-payments.client";

@Module({
  imports: [AuthModule],
  controllers: [PaymentController],
  providers: [
    PrismaService,
    PrismaPaymentRepository,
    CandidateMockInterviewPassService,
    TossPaymentsClient,
    {
      provide: PaymentService,
      useFactory: (
        repository: PaymentRepositoryPort,
        provider: PaymentProviderPort,
        candidateMockInterviewPasses: CandidateMockInterviewPassService,
      ) => new PaymentService(repository, provider, {}, candidateMockInterviewPasses),
      inject: [PrismaPaymentRepository, TossPaymentsClient, CandidateMockInterviewPassService],
    },
  ],
  exports: [CandidateMockInterviewPassService],
})
export class PaymentModule {}
