import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

import { PAYMENT_PRODUCT_CODES, type PaymentProductCode } from "../payment-products";

export class CreatePaymentOrderDto {
  @ApiProperty({ enum: PAYMENT_PRODUCT_CODES, example: "COMPANY_AI_INTERVIEW_CREDIT_30" })
  @IsIn(PAYMENT_PRODUCT_CODES)
  productCode!: PaymentProductCode;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1)
  quantity?: number;
}

export class ConfirmPaymentDto {
  @ApiProperty({ example: "tgen_20260703..." })
  @IsString()
  paymentKey!: string;

  @ApiProperty({ example: "pay_7_20260703_abcd1234" })
  @IsString()
  orderId!: string;

  @ApiProperty({ example: 99000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;
}

export class RecordPaymentFailureDto {
  @ApiProperty({ example: "PAY_PROCESS_CANCELED" })
  @IsString()
  code!: string;

  @ApiProperty({ example: "사용자가 결제를 취소했습니다." })
  @IsString()
  message!: string;
}

export class GrantCandidateMockInterviewDevPassDto {
  @ApiPropertyOptional({ example: 5, default: 5, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  passAmount?: number;
}

export class PaymentOrderListQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: ["READY", "IN_PROGRESS", "DONE", "FAILED", "CANCELED", "PARTIAL_CANCELED"] })
  @IsOptional()
  @IsIn(["READY", "IN_PROGRESS", "DONE", "FAILED", "CANCELED", "PARTIAL_CANCELED"])
  status?: "READY" | "IN_PROGRESS" | "DONE" | "FAILED" | "CANCELED" | "PARTIAL_CANCELED";
}

export class PaymentOrderResponseDto {
  @ApiProperty({ example: 1 })
  paymentOrderId!: number;

  @ApiProperty({ example: "pay_7_20260703_abcd1234" })
  orderId!: string;

  @ApiProperty({ example: "기업 후원 AI 면접 크레딧 30회" })
  orderName!: string;

  @ApiProperty({ example: "COMPANY_AI_INTERVIEW_CREDIT_30" })
  productCode!: string;

  @ApiProperty({ example: "ONE_TIME" })
  type!: string;

  @ApiProperty({ example: "READY" })
  status!: string;

  @ApiProperty({ example: 99000 })
  amount!: number;

  @ApiProperty({ example: 30 })
  creditAmount!: number;

  @ApiProperty({ example: 3300 })
  unitPrice!: number;

  @ApiProperty({ example: "KRW" })
  currency!: string;

  @ApiPropertyOptional({ example: "company_7" })
  customerKey?: string;

  @ApiPropertyOptional({ example: "http://localhost:3000/company/billing/success" })
  successUrl?: string;

  @ApiPropertyOptional({ example: "http://localhost:3000/company/billing/fail" })
  failUrl?: string;

  @ApiPropertyOptional({ example: "tgen_20260703...", nullable: true })
  paymentKey!: string | null;

  @ApiPropertyOptional({ example: "CARD", nullable: true })
  method!: string | null;

  @ApiPropertyOptional({ example: "https://dashboard.tosspayments.com/receipt/test", nullable: true })
  receiptUrl!: string | null;

  @ApiPropertyOptional({ example: "PAY_PROCESS_CANCELED", nullable: true })
  failureCode!: string | null;

  @ApiPropertyOptional({ example: "사용자가 결제를 취소했습니다.", nullable: true })
  failureMessage!: string | null;

  @ApiPropertyOptional({ example: "2026-07-03T00:03:00.000Z", nullable: true })
  approvedAt!: string | null;

  @ApiProperty({ example: "2026-07-03T00:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-07-03T00:00:00.000Z" })
  updatedAt!: string;
}

export class CandidateMockInterviewPassSummaryDto {
  @ApiProperty({ example: 1 })
  candidateId!: number;

  @ApiProperty({ example: 3 })
  availablePasses!: number;

  @ApiProperty({ example: 3 })
  grantedPasses!: number;

  @ApiProperty({ example: 0 })
  usedPasses!: number;

  @ApiProperty({ example: 3 })
  freePasses!: number;

  @ApiProperty({ example: 0 })
  paidPasses!: number;

  @ApiPropertyOptional({ example: "2026-08-02T00:00:00.000Z", nullable: true })
  freeExpiresAt!: string | null;

  @ApiProperty({ example: "2026-07-03T00:00:00.000Z" })
  updatedAt!: string;
}
