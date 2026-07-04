import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { ERROR_CODES, type CurrentUser, type ErrorCode } from "@init/common";

import { ApiException } from "../../../shared/api-exception";
import { findPaymentProduct, PAYMENT_PRODUCTS, type PaymentProduct, type PaymentProductCode } from "../payment-products";
import type {
  CandidateMockInterviewPassPort,
  CandidateMockInterviewPassSummary,
} from "./candidate-mock-interview-pass.service";

export type PaymentProvider = "TOSS";
export type { PaymentProductCode } from "../payment-products";
export type PaymentOrderType = "ONE_TIME" | "SUBSCRIPTION_INITIAL" | "SUBSCRIPTION_RENEWAL";
export type PaymentOrderStatus = "READY" | "IN_PROGRESS" | "DONE" | "FAILED" | "CANCELED" | "PARTIAL_CANCELED";

export type PaymentCustomerRecord = {
  paymentCustomerId: number;
  userId: number;
  companyId: number | null;
  candidateId: number | null;
  provider: PaymentProvider;
  customerKey: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentOrderRecord = {
  paymentOrderId: number;
  paymentCustomerId: number;
  companyId: number | null;
  candidateId: number | null;
  provider: PaymentProvider;
  orderId: string;
  paymentKey: string | null;
  productCode: PaymentProductCode;
  orderName: string;
  type: PaymentOrderType;
  status: PaymentOrderStatus;
  amount: number;
  currency: "KRW";
  method: string | null;
  receiptUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  providerPayload: unknown | null;
  requestedAt: Date | null;
  approvedAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePaymentOrderInput = {
  productCode: PaymentProductCode;
  quantity?: number;
};

export type ConfirmPaymentInput = {
  paymentKey: string;
  orderId: string;
  amount: number;
};

export type RecordPaymentFailureInput = {
  code: string;
  message: string;
};

export type GrantCandidateMockInterviewDevPassInput = {
  passAmount?: number;
};

export type CreatePaymentCustomerRepositoryInput = {
  userId: number;
  companyId: number | null;
  candidateId: number | null;
  provider: PaymentProvider;
  customerKey: string;
};

export type CreatePaymentOrderRepositoryInput = {
  paymentCustomerId: number;
  companyId: number | null;
  candidateId: number | null;
  provider: PaymentProvider;
  orderId: string;
  productCode: PaymentProductCode;
  orderName: string;
  type: PaymentOrderType;
  amount: number;
  currency: "KRW";
};

export type MarkPaymentOrderDoneInput = {
  paymentKey: string;
  method: string | null;
  receiptUrl: string | null;
  approvedAt: Date | null;
  providerPayload: unknown;
};

export type MarkPaymentOrderFailedInput = {
  failureCode: string;
  failureMessage: string;
  paymentKey?: string;
};

export type PaymentRepositoryPort = {
  findCustomerByOwner(provider: PaymentProvider, owner: PaymentOwnerContext): Promise<PaymentCustomerRecord | null>;
  createCustomer(input: CreatePaymentCustomerRepositoryInput): Promise<PaymentCustomerRecord>;
  createOrder(input: CreatePaymentOrderRepositoryInput): Promise<PaymentOrderRecord>;
  findOrderByOrderId(provider: PaymentProvider, orderId: string): Promise<PaymentOrderRecord | null>;
  listOrders(owner: PaymentOwnerContext, status?: PaymentOrderStatus): Promise<{ items: PaymentOrderRecord[]; totalItems: number }>;
  markOrderInProgress(orderId: string, paymentKey: string): Promise<PaymentOrderRecord | null>;
  markOrderDone(orderId: string, input: MarkPaymentOrderDoneInput): Promise<PaymentOrderRecord>;
  markOrderFailed(orderId: string, input: MarkPaymentOrderFailedInput): Promise<PaymentOrderRecord>;
};

export type PaymentProviderConfirmResult = {
  paymentKey: string;
  orderId: string;
  amount: number;
  method: string | null;
  receiptUrl: string | null;
  approvedAt: Date | null;
  rawPayload: unknown;
};

export type PaymentProviderPort = {
  confirmPayment(input: ConfirmPaymentInput): Promise<PaymentProviderConfirmResult>;
};

export type PaymentServiceConfig = {
  frontendBaseUrl?: string;
  orderIdFactory?: (owner: PaymentOwnerContext) => string;
};

export type PaymentOrderResponse = {
  paymentOrderId: number;
  orderId: string;
  orderName: string;
  productCode: PaymentProductCode;
  type: PaymentOrderType;
  status: PaymentOrderStatus;
  amount: number;
  creditAmount: number;
  unitPrice: number;
  currency: "KRW";
  customerKey?: string;
  successUrl?: string;
  failUrl?: string;
  paymentKey: string | null;
  method: string | null;
  receiptUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentOrderListResult = {
  items: PaymentOrderResponse[];
  page: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
  };
};

export type PaymentOwnerContext = {
  buyerType: "COMPANY" | "CANDIDATE";
  ownerId: number;
  companyId: number | null;
  candidateId: number | null;
};

const PAYMENT_PROVIDER: PaymentProvider = "TOSS";
const PAYMENT_ERROR_CODES = {
  PAYMENT_INVALID_PRODUCT: "PAYMENT_INVALID_PRODUCT" as ErrorCode,
  PAYMENT_ORDER_NOT_FOUND: "PAYMENT_ORDER_NOT_FOUND" as ErrorCode,
  PAYMENT_AMOUNT_MISMATCH: "PAYMENT_AMOUNT_MISMATCH" as ErrorCode,
  PAYMENT_INVALID_STATUS: "PAYMENT_INVALID_STATUS" as ErrorCode,
  PAYMENT_PROVIDER_FAILED: "PAYMENT_PROVIDER_FAILED" as ErrorCode,
};
class PaymentException extends ApiException {
  constructor(status: number, code: ErrorCode, message: string, details: Array<Record<string, unknown>> = []) {
    super(code, message, status, details);
  }
}

@Injectable()
export class PaymentService {
  constructor(
    private readonly repository: PaymentRepositoryPort,
    private readonly provider: PaymentProviderPort,
    private readonly config: PaymentServiceConfig = {},
    private readonly candidateMockInterviewPasses?: CandidateMockInterviewPassPort,
  ) {}

  async createOrder(user: CurrentUser, input: CreatePaymentOrderInput): Promise<PaymentOrderResponse> {
    const owner = requirePaymentOwner(user);
    const product = getPaymentProduct(input.productCode);
    if (product.buyerType !== owner.buyerType) {
      throw new PaymentException(403, ERROR_CODES.COMMON_FORBIDDEN, "현재 계정 유형으로 구매할 수 없는 결제 상품입니다.");
    }
    const quantity = input.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity !== 1) {
      throw new PaymentException(400, PAYMENT_ERROR_CODES.PAYMENT_INVALID_PRODUCT, "지원하지 않는 결제 수량입니다.", [
        { field: "quantity", reason: "UNSUPPORTED_QUANTITY" },
      ]);
    }

    const customer = await this.findOrCreateCustomer(user.userId, owner);
    const order = await this.repository.createOrder({
      paymentCustomerId: customer.paymentCustomerId,
      companyId: owner.companyId,
      candidateId: owner.candidateId,
      provider: PAYMENT_PROVIDER,
      orderId: this.createOrderId(owner),
      productCode: product.productCode,
      orderName: product.orderName,
      type: "ONE_TIME",
      amount: product.amount,
      currency: "KRW",
    });

    return {
      ...toPaymentOrderResponse(order),
      customerKey: customer.customerKey,
      successUrl: `${this.frontendBaseUrl()}${owner.buyerType === "COMPANY" ? "/company" : "/candidate"}/billing/success`,
      failUrl: `${this.frontendBaseUrl()}${owner.buyerType === "COMPANY" ? "/company" : "/candidate"}/billing/fail`,
    };
  }

  async listOrders(user: CurrentUser, query: { page?: number; limit?: number; status?: PaymentOrderStatus } = {}): Promise<PaymentOrderListResult> {
    const owner = requirePaymentOwner(user);
    const page = normalizePositiveInteger(query.page, 1);
    const limit = Math.min(normalizePositiveInteger(query.limit, 20), 100);
    const { items } = await this.repository.listOrders(owner, query.status);
    const visibleItems = query.status ? items : items.filter(isVisiblePaymentHistoryOrder);
    const pagedItems = visibleItems.slice((page - 1) * limit, page * limit).map(toPaymentOrderResponse);
    const totalItems = visibleItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    return {
      items: pagedItems,
      page: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
      },
    };
  }

  async getOrder(user: CurrentUser, orderId: string): Promise<PaymentOrderResponse> {
    const owner = requirePaymentOwner(user);
    const order = await this.findOwnedOrder(owner, orderId);
    return toPaymentOrderResponse(order);
  }

  async confirmPayment(user: CurrentUser, input: ConfirmPaymentInput): Promise<PaymentOrderResponse> {
    const owner = requirePaymentOwner(user);
    const order = await this.findOwnedOrder(owner, input.orderId);

    if (order.amount !== input.amount) {
      throw new PaymentException(400, PAYMENT_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH, "결제 요청 금액이 주문 금액과 일치하지 않습니다.", [
        { field: "amount", expected: order.amount, actual: input.amount },
      ]);
    }

    const existingResult = await this.resolveExistingConfirmResult(order, input.paymentKey);
    if (existingResult) {
      return existingResult;
    }

    const inProgress = await this.repository.markOrderInProgress(order.orderId, input.paymentKey);
    if (!inProgress) {
      const latest = await this.findOwnedOrder(owner, input.orderId);
      const latestResult = await this.resolveExistingConfirmResult(latest, input.paymentKey);
      if (latestResult) {
        return latestResult;
      }
      throw new PaymentException(409, PAYMENT_ERROR_CODES.PAYMENT_INVALID_STATUS, "결제 주문 상태가 이미 변경되었습니다.", [
        { status: latest.status },
      ]);
    }

    try {
      const confirmed = await this.provider.confirmPayment(input);
      const done = await this.repository.markOrderDone(inProgress.orderId, {
        paymentKey: confirmed.paymentKey,
        method: confirmed.method,
        receiptUrl: confirmed.receiptUrl,
        approvedAt: confirmed.approvedAt,
        providerPayload: confirmed.rawPayload,
      });
      await this.grantCandidateMockPassIfNeeded(done);
      return toPaymentOrderResponse(done);
    } catch (error) {
      const failed = await this.repository.markOrderFailed(inProgress.orderId, {
        failureCode: "PROVIDER_CONFIRM_FAILED",
        failureMessage: error instanceof Error ? error.message : "토스 결제 승인에 실패했습니다.",
        paymentKey: input.paymentKey,
      });
      return toPaymentOrderResponse(failed);
    }
  }

  async recordFailure(user: CurrentUser, orderId: string, input: RecordPaymentFailureInput): Promise<PaymentOrderResponse> {
    const owner = requirePaymentOwner(user);
    const order = await this.findOwnedOrder(owner, orderId);
    if (!["READY", "IN_PROGRESS"].includes(order.status)) {
      return toPaymentOrderResponse(order);
    }
    const failed = await this.repository.markOrderFailed(orderId, {
      failureCode: normalizeFailureText(input.code, "UNKNOWN_PAYMENT_FAILURE"),
      failureMessage: normalizeFailureText(input.message, "결제가 완료되지 않았습니다."),
    });
    return toPaymentOrderResponse(failed);
  }

  async getCandidateMockInterviewPassSummary(user: CurrentUser): Promise<CandidateMockInterviewPassSummary> {
    const owner = requirePaymentOwner(user);
    if (owner.buyerType !== "CANDIDATE" || !owner.candidateId) {
      throw new PaymentException(403, ERROR_CODES.COMMON_FORBIDDEN, "지원자 계정만 모의면접 이용권을 조회할 수 있습니다.");
    }
    if (!this.candidateMockInterviewPasses) {
      throw new PaymentException(409, ERROR_CODES.COMMON_CONFLICT, "모의면접 이용권 장부가 준비되지 않았습니다.");
    }
    return this.candidateMockInterviewPasses.ensureInitialFreePasses(owner.candidateId);
  }

  async grantCandidateMockInterviewDevPasses(
    user: CurrentUser,
    input: GrantCandidateMockInterviewDevPassInput = {},
  ): Promise<CandidateMockInterviewPassSummary> {
    const owner = requirePaymentOwner(user);
    if (owner.buyerType !== "CANDIDATE" || !owner.candidateId) {
      throw new PaymentException(403, ERROR_CODES.COMMON_FORBIDDEN, "지원자 계정만 모의면접 테스트 이용권을 받을 수 있습니다.");
    }
    if (!isDevelopmentPaymentToolEnabled()) {
      throw new PaymentException(403, ERROR_CODES.COMMON_FORBIDDEN, "개발용 모의면접 이용권 지급은 local/dev/test 환경에서만 사용할 수 있습니다.");
    }
    if (!this.candidateMockInterviewPasses?.grantDevelopmentPasses) {
      throw new PaymentException(409, ERROR_CODES.COMMON_CONFLICT, "모의면접 이용권 장부가 준비되지 않았습니다.");
    }

    return this.candidateMockInterviewPasses.grantDevelopmentPasses(
      owner.candidateId,
      normalizeBoundedPositiveInteger(input.passAmount, 5, 20),
    );
  }

  private async findOrCreateCustomer(userId: number, owner: PaymentOwnerContext): Promise<PaymentCustomerRecord> {
    const existing = await this.repository.findCustomerByOwner(PAYMENT_PROVIDER, owner);
    if (existing) return existing;
    return this.repository.createCustomer({
      userId,
      companyId: owner.companyId,
      candidateId: owner.candidateId,
      provider: PAYMENT_PROVIDER,
      customerKey: `${owner.buyerType === "COMPANY" ? "company" : "candidate"}_${owner.ownerId}`,
    });
  }

  private async findOwnedOrder(owner: PaymentOwnerContext, orderId: string): Promise<PaymentOrderRecord> {
    const order = await this.repository.findOrderByOrderId(PAYMENT_PROVIDER, orderId);
    if (!order || order.companyId !== owner.companyId || order.candidateId !== owner.candidateId) {
      throw new PaymentException(404, PAYMENT_ERROR_CODES.PAYMENT_ORDER_NOT_FOUND, "결제 주문을 찾을 수 없습니다.");
    }
    return order;
  }

  private createOrderId(owner: PaymentOwnerContext) {
    return this.config.orderIdFactory?.(owner) ?? `pay_${owner.buyerType.toLowerCase()}_${owner.ownerId}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  }

  private async grantCandidateMockPassIfNeeded(order: PaymentOrderRecord): Promise<void> {
    if (
      order.status !== "DONE" ||
      !this.candidateMockInterviewPasses ||
      !order.candidateId ||
      order.productCode !== "CANDIDATE_MOCK_INTERVIEW_PASS_1"
    ) {
      return;
    }

    const product = findPaymentProduct(order.productCode);
    await this.candidateMockInterviewPasses.grantPurchasedPasses(
      order.candidateId,
      order.paymentOrderId,
      product?.creditAmount ?? 1,
      order.approvedAt ?? new Date(),
    );
  }

  private async resolveExistingConfirmResult(order: PaymentOrderRecord, paymentKey: string): Promise<PaymentOrderResponse | null> {
    if (order.status === "DONE") {
      if (order.paymentKey === paymentKey) {
        await this.grantCandidateMockPassIfNeeded(order);
        return toPaymentOrderResponse(order);
      }
      throw new PaymentException(400, PAYMENT_ERROR_CODES.PAYMENT_INVALID_STATUS, "이미 다른 결제 키로 승인된 주문입니다.");
    }

    if (order.status === "IN_PROGRESS") {
      if (order.paymentKey === paymentKey) {
        return toPaymentOrderResponse(order);
      }
      throw new PaymentException(400, PAYMENT_ERROR_CODES.PAYMENT_INVALID_STATUS, "이미 다른 결제 키로 승인 처리 중인 주문입니다.");
    }

    if (order.status !== "READY") {
      throw new PaymentException(400, PAYMENT_ERROR_CODES.PAYMENT_INVALID_STATUS, "현재 상태에서는 결제를 승인할 수 없습니다.", [
        { status: order.status },
      ]);
    }

    return null;
  }

  private frontendBaseUrl() {
    return (this.config.frontendBaseUrl ?? process.env.APP_FRONTEND_URL ?? process.env.FRONTEND_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");
  }
}

function requirePaymentOwner(user: CurrentUser): PaymentOwnerContext {
  if (user.userType === "COMPANY" && user.companyId) {
    return {
      buyerType: "COMPANY",
      ownerId: user.companyId,
      companyId: user.companyId,
      candidateId: null,
    };
  }

  if (user.userType === "CANDIDATE" && user.candidateId) {
    return {
      buyerType: "CANDIDATE",
      ownerId: user.candidateId,
      companyId: null,
      candidateId: user.candidateId,
    };
  }

  throw new PaymentException(403, ERROR_CODES.COMMON_FORBIDDEN, "결제 기능에 접근할 수 없는 계정입니다.");
}

function getPaymentProduct(productCode: PaymentProductCode): PaymentProduct {
  const product = PAYMENT_PRODUCTS[productCode];
  if (!product) {
    throw new PaymentException(400, PAYMENT_ERROR_CODES.PAYMENT_INVALID_PRODUCT, "지원하지 않는 결제 상품입니다.", [
      { field: "productCode", reason: "UNKNOWN_PRODUCT" },
    ]);
  }
  return product;
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizeBoundedPositiveInteger(value: number | undefined, fallback: number, max: number) {
  const normalized = normalizePositiveInteger(value, fallback);
  return Math.min(normalized, max);
}

function normalizeFailureText(value: string | undefined, fallback: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

function isDevelopmentPaymentToolEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.PAYMENT_DEV_PASS_GRANT_ENABLED !== "false";
}

function isVisiblePaymentHistoryOrder(order: PaymentOrderRecord) {
  return !["READY", "IN_PROGRESS"].includes(order.status);
}

function toPaymentOrderResponse(order: PaymentOrderRecord): PaymentOrderResponse {
  const product = findPaymentProduct(order.productCode);

  return {
    paymentOrderId: order.paymentOrderId,
    orderId: order.orderId,
    orderName: order.orderName,
    productCode: order.productCode,
    type: order.type,
    status: order.status,
    amount: order.amount,
    creditAmount: product?.creditAmount ?? 0,
    unitPrice: product?.unitPrice ?? 0,
    currency: order.currency,
    paymentKey: order.paymentKey,
    method: order.method,
    receiptUrl: order.receiptUrl,
    failureCode: order.failureCode,
    failureMessage: order.failureMessage,
    approvedAt: order.approvedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
