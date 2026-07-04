import { apiFetch, apiFetchEnvelope } from "../../api/client";
import type {
  CandidateMockInterviewPassSummary,
  ConfirmPaymentInput,
  CreatePaymentOrderInput,
  GrantCandidateMockInterviewDevPassInput,
  PaymentOrder,
  PaymentOrderListQuery,
  PaymentOrderListResult,
  PaymentOrderPageMeta,
  RecordPaymentFailureInput,
} from "./types";

export async function createPaymentOrder(input: CreatePaymentOrderInput) {
  return apiFetch<PaymentOrder>("/payments/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listPaymentOrders(query: PaymentOrderListQuery = {}): Promise<PaymentOrderListResult> {
  const queryString = toQueryString(query);
  const envelope = await apiFetchEnvelope<{ items: PaymentOrder[] }, { page: PaymentOrderPageMeta }>(
    `/payments/orders${queryString}`,
  );

  return {
    items: envelope.data.items,
    page: envelope.meta.page,
  };
}

export async function getCandidateMockInterviewPassSummary() {
  return apiFetch<CandidateMockInterviewPassSummary>("/payments/candidate/mock-interview-passes");
}

export async function grantCandidateMockInterviewDevPasses(input: GrantCandidateMockInterviewDevPassInput = {}) {
  return apiFetch<CandidateMockInterviewPassSummary>("/payments/candidate/mock-interview-passes/dev-grant", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getPaymentOrder(orderId: string) {
  return apiFetch<PaymentOrder>(`/payments/orders/${encodeURIComponent(orderId)}`);
}

export async function confirmPayment(input: ConfirmPaymentInput) {
  return apiFetch<PaymentOrder>("/payments/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function recordPaymentFailure(orderId: string, input: RecordPaymentFailureInput) {
  return apiFetch<PaymentOrder>(`/payments/orders/${encodeURIComponent(orderId)}/fail`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

function toQueryString(query: PaymentOrderListQuery) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  });

  const suffix = params.toString();
  return suffix ? `?${suffix}` : "";
}
