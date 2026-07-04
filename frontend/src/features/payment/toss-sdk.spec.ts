import { buildTossPaymentRequest } from "./toss-sdk";

const request = buildTossPaymentRequest({
  orderId: "pay_7_fixed",
  orderName: "기업 후원 AI 면접 크레딧 30회",
  amount: 99000,
  customerKey: "company_7",
  successUrl: "http://localhost:3000/company/billing/success",
  failUrl: "http://localhost:3000/company/billing/fail",
});

if (request.orderId !== "pay_7_fixed") {
  throw new Error("Toss payment request should keep the server-generated order id.");
}

if (request.amount !== 99000) {
  throw new Error("Toss payment request should keep the server-generated amount.");
}

if (request.customerName !== "company_7") {
  throw new Error("Toss payment request should pass customerKey as customerName for one-time checkout.");
}
