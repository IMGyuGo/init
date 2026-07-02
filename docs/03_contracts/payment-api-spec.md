# Payment API Spec Addendum

Status: implementation-ready draft  
Date: 2026-07-03  
Primary owner: A/Auth-Common with PM contract review  
Base URL: `/api/v1`

This document records the payment API surface that will be added for Toss
Payments one-time checkout. The endpoints are intentionally isolated under
`/payments` so the feature can be removed without touching recruiting,
interview, report, or GNB code.

## Contract Rules

- Auth: company user only, using the existing bearer token contract.
- Response envelope: same as `docs/03_contracts/api-spec.md`.
- Amounts: integer KRW amounts in won.
- The client never sends a trusted price. The server resolves price from a
  fixed product catalog.
- Toss `successUrl` query values are not trusted until the backend compares
  `amount` with the stored order amount.
- Toss secret key is backend-only.
- Toss client key is frontend public config.

## Environment Variables

Backend:

| Name | Required | Purpose |
| --- | --- | --- |
| `TOSS_SECRET_KEY` | yes | Basic-auth secret key for Toss confirm calls |
| `TOSS_API_BASE_URL` | yes | Defaults to `https://api.tosspayments.com` |
| `APP_FRONTEND_URL` | yes | Origin used to build payment redirect URLs |

Frontend:

| Name | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | yes | Public client key used by Toss JS SDK |

## Enums

### PaymentProductCode

| Value | Meaning |
| --- | --- |
| `AI_REPORT_ONE_TIME` | One-time AI report or payment demo pass |

### PaymentOrderType

| Value | Meaning |
| --- | --- |
| `ONE_TIME` | Current MVP one-time payment |
| `SUBSCRIPTION_INITIAL` | Reserved for future subscription signup payment |
| `SUBSCRIPTION_RENEWAL` | Reserved for future automatic billing renewal |

### PaymentOrderStatus

| Value | Meaning |
| --- | --- |
| `READY` | Order created locally, Toss checkout not confirmed |
| `IN_PROGRESS` | Confirm request is being processed |
| `DONE` | Toss payment approved and stored |
| `FAILED` | Checkout or confirm failed |
| `CANCELED` | Payment was canceled after approval |
| `PARTIAL_CANCELED` | Partial cancel was processed after approval |

## API-PAY-001 Create One-Time Payment Order

`POST /payments/orders`

Creates a local payment order and returns Toss checkout parameters for the
frontend redirect flow.

### Request

```json
{
  "productCode": "AI_REPORT_ONE_TIME",
  "quantity": 1
}
```

### Response `201 Created`

```json
{
  "data": {
    "paymentOrderId": 1,
    "orderId": "pay_1_20260703_9f4a2b",
    "orderName": "AI report one-time pass",
    "productCode": "AI_REPORT_ONE_TIME",
    "type": "ONE_TIME",
    "status": "READY",
    "amount": 1000,
    "currency": "KRW",
    "customerKey": "company_1",
    "successUrl": "http://localhost:3000/company/billing/success",
    "failUrl": "http://localhost:3000/company/billing/fail",
    "createdAt": "2026-07-03T00:00:00.000Z"
  }
}
```

### Errors

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `PAYMENT_INVALID_PRODUCT` | Product code is not available |
| 403 | `COMMON_FORBIDDEN` | Current user is not a company user |

## API-PAY-002 List Payment Orders

`GET /payments/orders?page=1&limit=20&status=DONE`

Lists the current company's payment orders.

### Response `200 OK`

```json
{
  "data": {
    "items": [
      {
        "paymentOrderId": 1,
        "orderId": "pay_1_20260703_9f4a2b",
        "orderName": "AI report one-time pass",
        "productCode": "AI_REPORT_ONE_TIME",
        "type": "ONE_TIME",
        "status": "DONE",
        "amount": 1000,
        "currency": "KRW",
        "method": "CARD",
        "approvedAt": "2026-07-03T00:03:00.000Z",
        "createdAt": "2026-07-03T00:00:00.000Z"
      }
    ]
  },
  "meta": {
    "page": {
      "page": 1,
      "limit": 20,
      "totalItems": 1,
      "totalPages": 1,
      "hasNext": false
    }
  }
}
```

## API-PAY-003 Get Payment Order

`GET /payments/orders/{orderId}`

Returns one order owned by the current company.

### Response `200 OK`

```json
{
  "data": {
    "paymentOrderId": 1,
    "orderId": "pay_1_20260703_9f4a2b",
    "orderName": "AI report one-time pass",
    "productCode": "AI_REPORT_ONE_TIME",
    "type": "ONE_TIME",
    "status": "DONE",
    "amount": 1000,
    "currency": "KRW",
    "paymentKey": "tgen_20260703...",
    "method": "CARD",
    "receiptUrl": "https://dashboard.tosspayments.com/receipt/redirection?transactionId=...",
    "approvedAt": "2026-07-03T00:03:00.000Z",
    "failureCode": null,
    "failureMessage": null,
    "createdAt": "2026-07-03T00:00:00.000Z",
    "updatedAt": "2026-07-03T00:03:00.000Z"
  }
}
```

### Errors

| Status | Code | Meaning |
| --- | --- | --- |
| 404 | `PAYMENT_ORDER_NOT_FOUND` | Order does not exist or belongs to another company |

## API-PAY-004 Confirm Payment

`POST /payments/confirm`

Confirms Toss checkout after the browser returns to the success redirect URL.
The backend verifies the order, amount, owner, and current status before calling
Toss `/v1/payments/confirm`.

### Request

```json
{
  "paymentKey": "tgen_20260703...",
  "orderId": "pay_1_20260703_9f4a2b",
  "amount": 1000
}
```

### Response `200 OK`

```json
{
  "data": {
    "paymentOrderId": 1,
    "orderId": "pay_1_20260703_9f4a2b",
    "status": "DONE",
    "amount": 1000,
    "currency": "KRW",
    "paymentKey": "tgen_20260703...",
    "method": "CARD",
    "receiptUrl": "https://dashboard.tosspayments.com/receipt/redirection?transactionId=...",
    "approvedAt": "2026-07-03T00:03:00.000Z"
  }
}
```

### Idempotency

- If the order is already `DONE` with the same `paymentKey`, return the stored
  approved order.
- If the order is `DONE` with a different `paymentKey`, return an error.
- If the stored amount differs from the request amount, do not call Toss.

### Errors

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `PAYMENT_AMOUNT_MISMATCH` | Request amount differs from stored order amount |
| 400 | `PAYMENT_INVALID_STATUS` | Order cannot be confirmed from its current status |
| 404 | `PAYMENT_ORDER_NOT_FOUND` | Order does not exist or belongs to another company |
| 502 | `PAYMENT_PROVIDER_FAILED` | Toss confirm failed or returned an unexpected response |

## API-PAY-005 Record Checkout Failure

`POST /payments/orders/{orderId}/fail`

Records a Toss fail redirect so the company can see failed attempts in the
billing page. This endpoint does not call Toss.

### Request

```json
{
  "code": "PAY_PROCESS_CANCELED",
  "message": "Payment was canceled by the customer."
}
```

### Response `200 OK`

```json
{
  "data": {
    "paymentOrderId": 1,
    "orderId": "pay_1_20260703_9f4a2b",
    "status": "FAILED",
    "failureCode": "PAY_PROCESS_CANCELED",
    "failureMessage": "Payment was canceled by the customer."
  }
}
```

## Reserved Future Subscription APIs

These are not implemented in the one-time payment phase. The table and service
names are reserved so future automatic billing can reuse the payment customer
and provider adapter.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/payments/billing-authorizations` | Start Toss billing-key authorization |
| POST | `/payments/billing-keys/confirm` | Store issued billing key |
| POST | `/payments/subscriptions` | Create subscription using a stored billing key |
| PATCH | `/payments/subscriptions/{subscriptionId}/cancel` | Cancel future renewals |

