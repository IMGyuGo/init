import type { PaymentOrder } from "./types";

const TOSS_SCRIPT_SRC = "https://js.tosspayments.com/v1/payment";

export type TossPaymentRequest = {
  amount: number;
  orderId: string;
  orderName: string;
  customerName: string;
  successUrl: string;
  failUrl: string;
};

type TossPaymentsInstance = {
  requestPayment(method: string, request: TossPaymentRequest): Promise<void>;
};

type TossPaymentsFactory = (clientKey: string) => TossPaymentsInstance;

declare global {
  interface Window {
    TossPayments?: TossPaymentsFactory;
  }
}

export function buildTossPaymentRequest(order: Pick<PaymentOrder, "amount" | "orderId" | "orderName" | "customerKey" | "successUrl" | "failUrl">): TossPaymentRequest {
  if (!order.customerKey || !order.successUrl || !order.failUrl) {
    throw new Error("결제 요청 정보가 올바르지 않습니다.");
  }

  return {
    amount: order.amount,
    orderId: order.orderId,
    orderName: order.orderName,
    customerName: order.customerKey,
    successUrl: order.successUrl,
    failUrl: order.failUrl,
  };
}

export async function requestTossCardPayment(clientKey: string, order: PaymentOrder) {
  const tossPayments = await loadTossPayments(clientKey);
  return tossPayments.requestPayment("카드", buildTossPaymentRequest(order));
}

async function loadTossPayments(clientKey: string): Promise<TossPaymentsInstance> {
  if (!clientKey.trim()) {
    throw new Error("토스페이먼츠 client key가 설정되지 않았습니다.");
  }

  await loadTossScript();
  if (!window.TossPayments) {
    throw new Error("토스페이먼츠 SDK를 불러오지 못했습니다.");
  }
  return window.TossPayments(clientKey);
}

function loadTossScript() {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${TOSS_SCRIPT_SRC}"]`);
  if (existing) {
    if (existing.dataset.loaded === "true") return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("토스페이먼츠 SDK 로드에 실패했습니다.")), { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TOSS_SCRIPT_SRC;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", () => reject(new Error("토스페이먼츠 SDK 로드에 실패했습니다.")), { once: true });
    document.head.appendChild(script);
  });
}
