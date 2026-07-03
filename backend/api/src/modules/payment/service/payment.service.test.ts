import assert from "node:assert/strict";
import { describe, it } from "@jest/globals";
import type { CurrentUser } from "@init/common";

import {
  PaymentService,
  type ConfirmPaymentInput,
  type CreatePaymentOrderInput,
  type PaymentProviderPort,
  type PaymentRepositoryPort,
  type PaymentOrderRecord,
  type PaymentCustomerRecord,
} from "./payment.service";
import type {
  CandidateMockInterviewPassPort,
  CandidateMockInterviewPassSummary,
} from "./candidate-mock-interview-pass.service";

const companyUser: CurrentUser = {
  userId: 1,
  userType: "COMPANY",
  companyId: 7,
  candidateId: null,
};

const candidateUser: CurrentUser = {
  userId: 2,
  userType: "CANDIDATE",
  companyId: null,
  candidateId: 3,
};

const baseCustomer: PaymentCustomerRecord = {
  paymentCustomerId: 11,
  userId: 1,
  companyId: 7,
  candidateId: null,
  provider: "TOSS",
  customerKey: "company_7",
  createdAt: new Date("2026-07-03T00:00:00.000Z"),
  updatedAt: new Date("2026-07-03T00:00:00.000Z"),
};

const baseCandidateCustomer: PaymentCustomerRecord = {
  paymentCustomerId: 12,
  userId: 2,
  companyId: null,
  candidateId: 3,
  provider: "TOSS",
  customerKey: "candidate_3",
  createdAt: new Date("2026-07-03T00:00:00.000Z"),
  updatedAt: new Date("2026-07-03T00:00:00.000Z"),
};

const readyOrder: PaymentOrderRecord = {
  paymentOrderId: 21,
  paymentCustomerId: 11,
  companyId: 7,
  candidateId: null,
  provider: "TOSS",
  orderId: "pay_7_fixed",
  paymentKey: null,
  productCode: "COMPANY_AI_INTERVIEW_CREDIT_30",
  orderName: "기업 후원 AI 면접 크레딧 30회",
  type: "ONE_TIME",
  status: "READY",
  amount: 99000,
  currency: "KRW",
  method: null,
  receiptUrl: null,
  failureCode: null,
  failureMessage: null,
  providerPayload: null,
  requestedAt: null,
  approvedAt: null,
  failedAt: null,
  createdAt: new Date("2026-07-03T00:00:00.000Z"),
  updatedAt: new Date("2026-07-03T00:00:00.000Z"),
};

const candidateReadyOrder: PaymentOrderRecord = {
  ...readyOrder,
  paymentOrderId: 31,
  paymentCustomerId: 12,
  companyId: null,
  candidateId: 3,
  orderId: "pay_candidate_3_fixed",
  productCode: "CANDIDATE_MOCK_INTERVIEW_PASS_1",
  orderName: "AI 모의면접 1회 이용권",
  amount: 4900,
};

function createRepository(seed: { customer?: PaymentCustomerRecord | null; orders?: PaymentOrderRecord[] } = {}) {
  let customer = seed.customer ?? null;
  const orders = [...(seed.orders ?? [])];
  const calls: {
    createOrder?: unknown;
    confirmOrder?: unknown;
    failOrder?: unknown;
  } = {};

  const repository: PaymentRepositoryPort = {
    async findCustomerByOwner(provider, owner) {
      return customer &&
        customer.provider === provider &&
        customer.companyId === owner.companyId &&
        customer.candidateId === owner.candidateId
        ? customer
        : null;
    },
    async createCustomer(input) {
      customer = {
        paymentCustomerId: 11,
        userId: input.userId,
        companyId: input.companyId,
        candidateId: input.candidateId,
        provider: input.provider,
        customerKey: input.customerKey,
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
        updatedAt: new Date("2026-07-03T00:00:00.000Z"),
      };
      return customer;
    },
    async createOrder(input) {
      calls.createOrder = input;
      const order: PaymentOrderRecord = {
        paymentOrderId: 21 + orders.length,
        paymentCustomerId: input.paymentCustomerId,
        companyId: input.companyId,
        candidateId: input.candidateId,
        provider: input.provider,
        orderId: input.orderId,
        paymentKey: null,
        productCode: input.productCode,
        orderName: input.orderName,
        type: input.type,
        status: "READY",
        amount: input.amount,
        currency: input.currency,
        method: null,
        receiptUrl: null,
        failureCode: null,
        failureMessage: null,
        providerPayload: null,
        requestedAt: null,
        approvedAt: null,
        failedAt: null,
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
        updatedAt: new Date("2026-07-03T00:00:00.000Z"),
      };
      orders.push(order);
      return order;
    },
    async findOrderByOrderId(provider, orderId) {
      return orders.find((order) => order.provider === provider && order.orderId === orderId) ?? null;
    },
    async listOrders(owner, status) {
      const ownedOrders = orders.filter((order) => order.companyId === owner.companyId && order.candidateId === owner.candidateId);
      const filteredOrders = status ? ownedOrders.filter((order) => order.status === status) : ownedOrders;
      return {
        items: filteredOrders,
        totalItems: filteredOrders.length,
      };
    },
    async markOrderInProgress(orderId, paymentKey) {
      const order = requireOrder(orders, orderId);
      order.status = "IN_PROGRESS";
      order.paymentKey = paymentKey;
      order.requestedAt = new Date("2026-07-03T00:01:00.000Z");
      return order;
    },
    async markOrderDone(orderId, input) {
      calls.confirmOrder = input;
      const order = requireOrder(orders, orderId);
      order.status = "DONE";
      order.paymentKey = input.paymentKey;
      order.method = input.method;
      order.receiptUrl = input.receiptUrl;
      order.providerPayload = input.providerPayload;
      order.approvedAt = input.approvedAt;
      order.updatedAt = new Date("2026-07-03T00:03:00.000Z");
      return order;
    },
    async markOrderFailed(orderId, input) {
      calls.failOrder = input;
      const order = requireOrder(orders, orderId);
      order.status = "FAILED";
      order.failureCode = input.failureCode;
      order.failureMessage = input.failureMessage;
      order.failedAt = new Date("2026-07-03T00:02:00.000Z");
      return order;
    },
  };

  return { repository, calls, get orders() { return orders; } };
}

function createProvider(options: { failure?: Error } = {}) {
  const calls: ConfirmPaymentInput[] = [];
  const provider: PaymentProviderPort = {
    async confirmPayment(input) {
      calls.push(input);
      if (options.failure) throw options.failure;
      return {
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amount,
        method: "CARD",
        receiptUrl: "https://dashboard.tosspayments.com/receipt/test",
        approvedAt: new Date("2026-07-03T00:03:00.000Z"),
        rawPayload: { paymentKey: input.paymentKey, orderId: input.orderId },
      };
    },
  };
  return { provider, calls };
}

function createPassService() {
  const summary: CandidateMockInterviewPassSummary = {
    candidateId: 3,
    availablePasses: 4,
    grantedPasses: 4,
    usedPasses: 0,
    freePasses: 3,
    paidPasses: 1,
    freeExpiresAt: new Date("2026-08-02T00:00:00.000Z"),
    updatedAt: new Date("2026-07-03T00:00:00.000Z"),
  };
  const calls: Array<{ fn: string; candidateId: number; paymentOrderId?: number; passAmount?: number }> = [];
  const service: CandidateMockInterviewPassPort = {
    async ensureInitialFreePasses(candidateId) {
      calls.push({ fn: "ensureInitialFreePasses", candidateId });
      return { ...summary, candidateId };
    },
    async grantPurchasedPasses(candidateId, paymentOrderId, passAmount) {
      calls.push({ fn: "grantPurchasedPasses", candidateId, paymentOrderId, passAmount });
      return { ...summary, candidateId, availablePasses: summary.availablePasses + passAmount };
    },
    async grantDevelopmentPasses(candidateId, passAmount) {
      calls.push({ fn: "grantDevelopmentPasses", candidateId, passAmount });
      return { ...summary, candidateId, availablePasses: summary.availablePasses + passAmount };
    },
    async consumePass(candidateId, passAmount = 1) {
      calls.push({ fn: "consumePass", candidateId, passAmount });
      return { ...summary, candidateId, availablePasses: summary.availablePasses - passAmount, usedPasses: summary.usedPasses + passAmount };
    },
  };
  return { service, calls };
}

function createService(seed: { customer?: PaymentCustomerRecord | null; orders?: PaymentOrderRecord[]; providerFailure?: Error } = {}) {
  const { repository, calls, orders } = createRepository(seed);
  const { provider, calls: providerCalls } = createProvider({ failure: seed.providerFailure });
  const { service: passService, calls: passCalls } = createPassService();
  const service = new PaymentService(repository, provider, {
    frontendBaseUrl: "http://localhost:3000",
    orderIdFactory: () => "pay_7_fixed",
  }, passService);
  return { service, calls, orders, providerCalls, passCalls };
}

describe("PaymentService", () => {
  it("creates a sponsored company interview credit order from the server-side product catalog", async () => {
    const { service, calls } = createService();
    const input: CreatePaymentOrderInput = { productCode: "COMPANY_AI_INTERVIEW_CREDIT_30", quantity: 1 };

    const result = await service.createOrder(companyUser, input);

    assert.equal(result.orderId, "pay_7_fixed");
    assert.equal(result.orderName, "기업 후원 AI 면접 크레딧 30회");
    assert.equal(result.amount, 99000);
    assert.equal(result.creditAmount, 30);
    assert.equal(result.unitPrice, 3300);
    assert.equal(result.currency, "KRW");
    assert.equal(result.customerKey, "company_7");
    assert.equal(result.status, "READY");
    assert.equal(result.successUrl, "http://localhost:3000/company/billing/success");
    assert.equal(result.failUrl, "http://localhost:3000/company/billing/fail");
    assert.deepEqual(calls.createOrder, {
      paymentCustomerId: 11,
      companyId: 7,
      candidateId: null,
      provider: "TOSS",
      orderId: "pay_7_fixed",
      productCode: "COMPANY_AI_INTERVIEW_CREDIT_30",
      orderName: "기업 후원 AI 면접 크레딧 30회",
      type: "ONE_TIME",
      amount: 99000,
      currency: "KRW",
    });
  });

  it("creates a candidate mock interview one-time pass order", async () => {
    const { service, calls } = createService();
    const input: CreatePaymentOrderInput = { productCode: "CANDIDATE_MOCK_INTERVIEW_PASS_1", quantity: 1 };

    const result = await service.createOrder(candidateUser, input);

    assert.equal(result.orderId, "pay_7_fixed");
    assert.equal(result.orderName, "AI 모의면접 1회 이용권");
    assert.equal(result.amount, 4900);
    assert.equal(result.creditAmount, 1);
    assert.equal(result.unitPrice, 4900);
    assert.equal(result.customerKey, "candidate_3");
    assert.equal(result.successUrl, "http://localhost:3000/candidate/billing/success");
    assert.equal(result.failUrl, "http://localhost:3000/candidate/billing/fail");
    assert.deepEqual(calls.createOrder, {
      paymentCustomerId: 11,
      companyId: null,
      candidateId: 3,
      provider: "TOSS",
      orderId: "pay_7_fixed",
      productCode: "CANDIDATE_MOCK_INTERVIEW_PASS_1",
      orderName: "AI 모의면접 1회 이용권",
      type: "ONE_TIME",
      amount: 4900,
      currency: "KRW",
    });
  });

  it("rejects the old individual AI report product from company billing", async () => {
    const { service } = createService();

    await assert.rejects(
      () => service.createOrder(companyUser, { productCode: "AI_REPORT_ONE_TIME" as CreatePaymentOrderInput["productCode"], quantity: 1 }),
      (error) => hasCode(error, "PAYMENT_INVALID_PRODUCT"),
    );
  });

  it("rejects candidate users buying company credit products", async () => {
    const { service } = createService();

    await assert.rejects(
      () => service.createOrder(candidateUser, { productCode: "COMPANY_AI_INTERVIEW_CREDIT_10", quantity: 1 }),
      (error) => hasCode(error, "COMMON_FORBIDDEN"),
    );
  });

  it("rejects company users buying candidate mock interview passes", async () => {
    const { service } = createService();

    await assert.rejects(
      () => service.createOrder(companyUser, { productCode: "CANDIDATE_MOCK_INTERVIEW_PASS_1", quantity: 1 }),
      (error) => hasCode(error, "COMMON_FORBIDDEN"),
    );
  });

  it("rejects confirm when redirect amount differs from the stored order amount", async () => {
    const { service, providerCalls } = createService({ customer: baseCustomer, orders: [{ ...readyOrder }] });

    await assert.rejects(
      () => service.confirmPayment(companyUser, { orderId: readyOrder.orderId, paymentKey: "tgen_wrong", amount: 98000 }),
      (error) => hasCode(error, "PAYMENT_AMOUNT_MISMATCH"),
    );
    assert.equal(providerCalls.length, 0);
  });

  it("confirms a ready order through the provider and stores the approval result", async () => {
    const { service, calls, providerCalls } = createService({ customer: baseCustomer, orders: [{ ...readyOrder }] });

    const result = await service.confirmPayment(companyUser, {
      orderId: readyOrder.orderId,
      paymentKey: "tgen_approved",
      amount: 99000,
    });

    assert.equal(providerCalls.length, 1);
    assert.equal(result.status, "DONE");
    assert.equal(result.paymentKey, "tgen_approved");
    assert.equal(result.method, "CARD");
    assert.equal(result.receiptUrl, "https://dashboard.tosspayments.com/receipt/test");
    assert.deepEqual(calls.confirmOrder, {
      paymentKey: "tgen_approved",
      method: "CARD",
      receiptUrl: "https://dashboard.tosspayments.com/receipt/test",
      approvedAt: new Date("2026-07-03T00:03:00.000Z"),
      providerPayload: { paymentKey: "tgen_approved", orderId: readyOrder.orderId },
    });
  });

  it("omits transient ready and in-progress orders from the default payment history", async () => {
    const doneOrder: PaymentOrderRecord = {
      ...readyOrder,
      paymentOrderId: 22,
      orderId: "pay_done",
      status: "DONE",
      paymentKey: "tgen_done",
      method: "CARD",
      receiptUrl: "https://dashboard.tosspayments.com/receipt/test",
      approvedAt: new Date("2026-07-03T00:03:00.000Z"),
    };
    const failedOrder: PaymentOrderRecord = {
      ...readyOrder,
      paymentOrderId: 23,
      orderId: "pay_failed",
      status: "FAILED",
      failureCode: "PROVIDER_CONFIRM_FAILED",
      failureMessage: "카드 승인 한도를 초과했습니다.",
      failedAt: new Date("2026-07-03T00:04:00.000Z"),
    };
    const inProgressOrder: PaymentOrderRecord = {
      ...readyOrder,
      paymentOrderId: 24,
      orderId: "pay_in_progress",
      status: "IN_PROGRESS",
      paymentKey: "tgen_pending",
      requestedAt: new Date("2026-07-03T00:01:00.000Z"),
    };
    const { service } = createService({
      customer: baseCustomer,
      orders: [{ ...readyOrder }, inProgressOrder, doneOrder, failedOrder],
    });

    const result = await service.listOrders(companyUser);

    assert.deepEqual(result.items.map((order) => order.orderId), ["pay_done", "pay_failed"]);
    assert.equal(result.page.totalItems, 2);
    assert.equal(result.page.totalPages, 1);
  });

  it("keeps explicit ready status lookup available for payment operations", async () => {
    const { service } = createService({ customer: baseCustomer, orders: [{ ...readyOrder }] });

    const result = await service.listOrders(companyUser, { status: "READY" });

    assert.deepEqual(result.items.map((order) => order.orderId), [readyOrder.orderId]);
    assert.equal(result.page.totalItems, 1);
  });

  it("grants a candidate mock interview pass after candidate payment approval", async () => {
    const { service, passCalls } = createService({ customer: baseCandidateCustomer, orders: [{ ...candidateReadyOrder }] });

    const result = await service.confirmPayment(candidateUser, {
      orderId: candidateReadyOrder.orderId,
      paymentKey: "tgen_candidate_pass",
      amount: 4900,
    });

    assert.equal(result.status, "DONE");
    assert.deepEqual(passCalls, [
      {
        fn: "grantPurchasedPasses",
        candidateId: 3,
        paymentOrderId: 31,
        passAmount: 1,
      },
    ]);
  });

  it("returns the failed order when provider approval fails", async () => {
    const { service, calls, passCalls } = createService({
      customer: baseCandidateCustomer,
      orders: [{ ...candidateReadyOrder }],
      providerFailure: new Error("카드 승인 한도를 초과했습니다."),
    });

    const result = await service.confirmPayment(candidateUser, {
      orderId: candidateReadyOrder.orderId,
      paymentKey: "tgen_candidate_pass",
      amount: 4900,
    });

    assert.equal(result.status, "FAILED");
    assert.equal(result.failureCode, "PROVIDER_CONFIRM_FAILED");
    assert.equal(result.failureMessage, "카드 승인 한도를 초과했습니다.");
    assert.deepEqual(calls.failOrder, {
      failureCode: "PROVIDER_CONFIRM_FAILED",
      failureMessage: "카드 승인 한도를 초과했습니다.",
    });
    assert.deepEqual(passCalls, []);
  });

  it("returns candidate mock interview pass summary after ensuring free passes", async () => {
    const { service, passCalls } = createService();

    const result = await service.getCandidateMockInterviewPassSummary(candidateUser);

    assert.equal(result.availablePasses, 4);
    assert.equal(result.freePasses, 3);
    assert.deepEqual(passCalls, [{ fn: "ensureInitialFreePasses", candidateId: 3 }]);
  });

  it("grants development mock interview passes for local candidate QA", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDevGrantFlag = process.env.PAYMENT_DEV_PASS_GRANT_ENABLED;
    process.env.NODE_ENV = "development";
    delete process.env.PAYMENT_DEV_PASS_GRANT_ENABLED;
    try {
      const { service, passCalls } = createService();

      const result = await service.grantCandidateMockInterviewDevPasses(candidateUser, { passAmount: 5 });

      assert.equal(result.availablePasses, 9);
      assert.deepEqual(passCalls, [{ fn: "grantDevelopmentPasses", candidateId: 3, passAmount: 5 }]);
    } finally {
      restoreEnv("NODE_ENV", previousNodeEnv);
      restoreEnv("PAYMENT_DEV_PASS_GRANT_ENABLED", previousDevGrantFlag);
    }
  });

  it("rejects development mock interview pass grants in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { service, passCalls } = createService();

      await assert.rejects(
        () => service.grantCandidateMockInterviewDevPasses(candidateUser, { passAmount: 5 }),
        (error) => hasCode(error, "COMMON_FORBIDDEN"),
      );
      assert.deepEqual(passCalls, []);
    } finally {
      restoreEnv("NODE_ENV", previousNodeEnv);
    }
  });

  it("returns an already approved order for a duplicate confirm with the same payment key", async () => {
    const doneOrder: PaymentOrderRecord = {
      ...readyOrder,
      status: "DONE",
      paymentKey: "tgen_done",
      method: "CARD",
      receiptUrl: "https://dashboard.tosspayments.com/receipt/test",
      approvedAt: new Date("2026-07-03T00:03:00.000Z"),
    };
    const { service, providerCalls } = createService({ customer: baseCustomer, orders: [doneOrder] });

    const result = await service.confirmPayment(companyUser, {
      orderId: doneOrder.orderId,
      paymentKey: "tgen_done",
      amount: 99000,
    });

    assert.equal(providerCalls.length, 0);
    assert.equal(result.status, "DONE");
    assert.equal(result.paymentKey, "tgen_done");
  });

  it("does not downgrade an already approved order when a stale fail redirect is recorded", async () => {
    const doneOrder: PaymentOrderRecord = {
      ...readyOrder,
      status: "DONE",
      paymentKey: "tgen_done",
      method: "CARD",
      receiptUrl: "https://dashboard.tosspayments.com/receipt/test",
      approvedAt: new Date("2026-07-03T00:03:00.000Z"),
    };
    const { service, calls, orders } = createService({ customer: baseCustomer, orders: [doneOrder] });

    const result = await service.recordFailure(companyUser, doneOrder.orderId, {
      code: "PAY_PROCESS_CANCELED",
      message: "사용자가 결제를 취소했습니다.",
    });

    assert.equal(result.status, "DONE");
    assert.equal(orders[0]?.status, "DONE");
    assert.equal(calls.failOrder, undefined);
  });

  it("does not call the provider again for a duplicate in-progress confirm with the same payment key", async () => {
    const inProgressOrder: PaymentOrderRecord = {
      ...readyOrder,
      status: "IN_PROGRESS",
      paymentKey: "tgen_pending",
      requestedAt: new Date("2026-07-03T00:01:00.000Z"),
    };
    const { service, providerCalls } = createService({ customer: baseCustomer, orders: [inProgressOrder] });

    const result = await service.confirmPayment(companyUser, {
      orderId: inProgressOrder.orderId,
      paymentKey: "tgen_pending",
      amount: 99000,
    });

    assert.equal(result.status, "IN_PROGRESS");
    assert.equal(result.paymentKey, "tgen_pending");
    assert.equal(providerCalls.length, 0);
  });
});

function requireOrder(orders: PaymentOrderRecord[], orderId: string) {
  const order = orders.find((item) => item.orderId === orderId);
  assert.ok(order);
  return order;
}

function hasCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === code;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
