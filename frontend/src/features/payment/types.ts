export const COMPANY_AI_INTERVIEW_CREDIT_PACKAGES = [
  {
    productCode: "COMPANY_AI_INTERVIEW_CREDIT_10",
    orderName: "기업 후원 AI 면접 크레딧 10회",
    creditAmount: 10,
    amount: 39000,
    unitPrice: 3900,
    label: "파일럿",
  },
  {
    productCode: "COMPANY_AI_INTERVIEW_CREDIT_30",
    orderName: "기업 후원 AI 면접 크레딧 30회",
    creditAmount: 30,
    amount: 99000,
    unitPrice: 3300,
    label: "추천",
  },
  {
    productCode: "COMPANY_AI_INTERVIEW_CREDIT_100",
    orderName: "기업 후원 AI 면접 크레딧 100회",
    creditAmount: 100,
    amount: 290000,
    unitPrice: 2900,
    label: "후원",
  },
] as const;

export const CANDIDATE_MOCK_INTERVIEW_PASS_PRODUCT = {
  productCode: "CANDIDATE_MOCK_INTERVIEW_PASS_1",
  orderName: "AI 모의면접 1회 이용권",
  creditAmount: 1,
  amount: 4900,
  unitPrice: 4900,
  label: "1회권",
} as const;

export const CANDIDATE_FREE_MOCK_INTERVIEW_POLICY = {
  freePasses: 3,
  expiresInDays: 30,
} as const;

export const PAYMENT_HISTORY_PAGE_LIMIT = 5;

export type PaymentOrderPageMeta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
};

export const EMPTY_PAYMENT_ORDER_PAGE: PaymentOrderPageMeta = {
  page: 1,
  limit: PAYMENT_HISTORY_PAGE_LIMIT,
  totalItems: 0,
  totalPages: 0,
  hasNext: false,
};

export type PaymentProductCode =
  | (typeof COMPANY_AI_INTERVIEW_CREDIT_PACKAGES)[number]["productCode"]
  | typeof CANDIDATE_MOCK_INTERVIEW_PASS_PRODUCT.productCode;
export type PaymentOrderStatus = "READY" | "IN_PROGRESS" | "DONE" | "FAILED" | "CANCELED" | "PARTIAL_CANCELED";

export type PaymentOrder = {
  paymentOrderId: number;
  orderId: string;
  orderName: string;
  productCode: PaymentProductCode;
  type: "ONE_TIME" | "SUBSCRIPTION_INITIAL" | "SUBSCRIPTION_RENEWAL";
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
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentOrderListQuery = {
  page?: number;
  limit?: number;
  status?: PaymentOrderStatus;
};

export type PaymentOrderListResult = {
  items: PaymentOrder[];
  page: PaymentOrderPageMeta;
};

export type CandidateMockInterviewPassSummary = {
  candidateId: number;
  availablePasses: number;
  grantedPasses: number;
  usedPasses: number;
  freePasses: number;
  paidPasses: number;
  freeExpiresAt: string | null;
  updatedAt: string;
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
