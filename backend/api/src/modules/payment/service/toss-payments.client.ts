import { Injectable } from "@nestjs/common";

import type { ConfirmPaymentInput, PaymentProviderConfirmResult, PaymentProviderPort } from "./payment.service";

type TossPaymentResponse = {
  paymentKey?: string;
  orderId?: string;
  totalAmount?: number;
  method?: string;
  receipt?: {
    url?: string;
  };
  approvedAt?: string;
};

@Injectable()
export class TossPaymentsClient implements PaymentProviderPort {
  async confirmPayment(input: ConfirmPaymentInput): Promise<PaymentProviderConfirmResult> {
    const secretKey = process.env.TOSS_SECRET_KEY;
    if (!secretKey) {
      throw new Error("TOSS_SECRET_KEY is required.");
    }

    const response = await fetch(`${this.apiBaseUrl()}/v1/payments/confirm`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amount,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as TossPaymentResponse & { code?: string; message?: string };
    if (!response.ok) {
      throw new Error(payload.message ?? payload.code ?? "Toss payment confirm failed.");
    }

    return {
      paymentKey: payload.paymentKey ?? input.paymentKey,
      orderId: payload.orderId ?? input.orderId,
      amount: payload.totalAmount ?? input.amount,
      method: payload.method ?? null,
      receiptUrl: payload.receipt?.url ?? null,
      approvedAt: payload.approvedAt ? new Date(payload.approvedAt) : null,
      rawPayload: sanitizeTossPayload(payload),
    };
  }

  private apiBaseUrl() {
    return (process.env.TOSS_API_BASE_URL ?? "https://api.tosspayments.com").replace(/\/+$/, "");
  }
}

function sanitizeTossPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  const cloned = { ...(payload as Record<string, unknown>) };
  delete cloned.card;
  delete cloned.virtualAccount;
  delete cloned.mobilePhone;
  return cloned;
}
