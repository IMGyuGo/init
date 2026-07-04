export const COMPANY_AI_INTERVIEW_CREDIT_PRODUCTS = [
  {
    productCode: "COMPANY_AI_INTERVIEW_CREDIT_10",
    orderName: "기업 후원 AI 면접 크레딧 10회",
    amount: 39000,
    creditAmount: 10,
    unitPrice: 3900,
    buyerType: "COMPANY",
  },
  {
    productCode: "COMPANY_AI_INTERVIEW_CREDIT_30",
    orderName: "기업 후원 AI 면접 크레딧 30회",
    amount: 99000,
    creditAmount: 30,
    unitPrice: 3300,
    buyerType: "COMPANY",
  },
  {
    productCode: "COMPANY_AI_INTERVIEW_CREDIT_100",
    orderName: "기업 후원 AI 면접 크레딧 100회",
    amount: 290000,
    creditAmount: 100,
    unitPrice: 2900,
    buyerType: "COMPANY",
  },
  {
    productCode: "CANDIDATE_MOCK_INTERVIEW_PASS_1",
    orderName: "AI 모의면접 1회 이용권",
    amount: 4900,
    creditAmount: 1,
    unitPrice: 4900,
    buyerType: "CANDIDATE",
  },
] as const;

export type PaymentProduct = (typeof COMPANY_AI_INTERVIEW_CREDIT_PRODUCTS)[number];
export type PaymentProductCode = PaymentProduct["productCode"];

export const PAYMENT_PRODUCT_CODES = COMPANY_AI_INTERVIEW_CREDIT_PRODUCTS.map((product) => product.productCode) as [
  PaymentProductCode,
  ...PaymentProductCode[],
];

export const PAYMENT_PRODUCTS = COMPANY_AI_INTERVIEW_CREDIT_PRODUCTS.reduce(
  (products, product) => {
    products[product.productCode] = product;
    return products;
  },
  {} as Record<PaymentProductCode, PaymentProduct>,
);

export function findPaymentProduct(productCode: string): PaymentProduct | undefined {
  return PAYMENT_PRODUCTS[productCode as PaymentProductCode];
}
