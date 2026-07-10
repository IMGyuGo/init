import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CurrentUser } from "@init/common";

import { ok, okList, type RequestLike } from "../../../shared/response-envelope";
import { ApiEnvelopeResponse, ApiErrorResponses, ApiListEnvelopeResponse, ApiOperationId } from "../../../swagger/swagger.decorators";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import {
  ConfirmPaymentDto,
  CandidateMockInterviewPassSummaryDto,
  CreatePaymentOrderDto,
  GrantCandidateMockInterviewDevPassDto,
  PaymentOrderListQueryDto,
  PaymentOrderResponseDto,
  RecordPaymentFailureDto,
} from "../dto/payment.dto";
import { PaymentService, type PaymentOrderResponse } from "../service/payment.service";
import type { CandidateMockInterviewPassSummary } from "../service/candidate-mock-interview-pass.service";

type PaymentRequest = RequestLike & { currentUser: CurrentUser };

@UseGuards(JwtAuthGuard)
@ApiTags("Payments")
@ApiBearerAuth("bearer")
@ApiErrorResponses()
@Controller("payments")
export class PaymentController {
  constructor(@Inject(PaymentService) private readonly paymentService: PaymentService) {}

  @Post("orders")
  @ApiOperationId("API-PAY-001")
  @ApiOperation({ summary: "결제 주문 생성" })
  @ApiEnvelopeResponse(PaymentOrderResponseDto, 201)
  async createOrder(
    @Req() request: PaymentRequest,
    @Body() dto: CreatePaymentOrderDto,
  ) {
    const data = await this.paymentService.createOrder(request.currentUser, dto);
    return ok(request, serializePaymentOrder(data));
  }

  @Get("orders")
  @ApiOperationId("API-PAY-002")
  @ApiOperation({ summary: "결제 주문 목록 조회" })
  @ApiListEnvelopeResponse(PaymentOrderResponseDto)
  async listOrders(
    @Req() request: PaymentRequest,
    @Query() query: PaymentOrderListQueryDto,
  ) {
    const result = await this.paymentService.listOrders(request.currentUser, query);
    return okList(request, result.items.map(serializePaymentOrder), result.page);
  }

  @Get("orders/:orderId")
  @ApiOperationId("API-PAY-003")
  @ApiOperation({ summary: "결제 주문 단건 조회" })
  @ApiEnvelopeResponse(PaymentOrderResponseDto)
  async getOrder(
    @Req() request: PaymentRequest,
    @Param("orderId") orderId: string,
  ) {
    const data = await this.paymentService.getOrder(request.currentUser, orderId);
    return ok(request, serializePaymentOrder(data));
  }

  @Post("confirm")
  @ApiOperationId("API-PAY-004")
  @ApiOperation({ summary: "토스 결제 승인" })
  @ApiEnvelopeResponse(PaymentOrderResponseDto)
  async confirmPayment(
    @Req() request: PaymentRequest,
    @Body() dto: ConfirmPaymentDto,
  ) {
    const data = await this.paymentService.confirmPayment(request.currentUser, dto);
    return ok(request, serializePaymentOrder(data));
  }

  @Post("orders/:orderId/fail")
  @ApiOperationId("API-PAY-005")
  @ApiOperation({ summary: "결제창 실패 기록" })
  @ApiEnvelopeResponse(PaymentOrderResponseDto)
  async recordFailure(
    @Req() request: PaymentRequest,
    @Param("orderId") orderId: string,
    @Body() dto: RecordPaymentFailureDto,
  ) {
    const data = await this.paymentService.recordFailure(request.currentUser, orderId, dto);
    return ok(request, serializePaymentOrder(data));
  }

  @Get("candidate/mock-interview-passes")
  @ApiOperationId("API-PAY-006")
  @ApiOperation({ summary: "지원자 모의면접 이용권 보유 현황 조회" })
  @ApiEnvelopeResponse(CandidateMockInterviewPassSummaryDto)
  async getCandidateMockInterviewPassSummary(@Req() request: PaymentRequest) {
    const data = await this.paymentService.getCandidateMockInterviewPassSummary(request.currentUser);
    return ok(request, serializeCandidateMockInterviewPassSummary(data));
  }

  @Post("candidate/mock-interview-passes/dev-grant")
  @ApiOperationId("API-PAY-007")
  @ApiOperation({ summary: "테스트용 지원자 모의면접 이용권 지급" })
  @ApiEnvelopeResponse(CandidateMockInterviewPassSummaryDto)
  async grantCandidateMockInterviewDevPasses(
    @Req() request: PaymentRequest,
    @Body() dto: GrantCandidateMockInterviewDevPassDto,
  ) {
    const data = await this.paymentService.grantCandidateMockInterviewDevPasses(request.currentUser, dto);
    return ok(request, serializeCandidateMockInterviewPassSummary(data));
  }
}

function serializePaymentOrder(order: PaymentOrderResponse) {
  return {
    ...order,
    approvedAt: order.approvedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function serializeCandidateMockInterviewPassSummary(summary: CandidateMockInterviewPassSummary) {
  return {
    ...summary,
    freeExpiresAt: summary.freeExpiresAt?.toISOString() ?? null,
    updatedAt: summary.updatedAt.toISOString(),
  };
}
