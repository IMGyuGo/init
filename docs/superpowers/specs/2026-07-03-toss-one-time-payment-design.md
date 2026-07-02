# Toss One-Time Payment Design

Date: 2026-07-03  
Branch: `codex/toss-one-time-payment`  
Status: approved design, implementation pending user review  
Primary references:

- `docs/03_contracts/payment-api-spec.md`
- `docs/02_architecture/payment-erd.md`

## Goal

Add a Toss Payments redirect-based one-time payment system that is easy to
remove later and can evolve into subscription or automatic billing. The first
implementation must not modify the GNB. Users reach the billing surface by
direct route, not by adding a navigation entry.

## Decisions

- Start with one-time payments only.
- Use Toss redirect checkout and backend payment confirm.
- Keep all payment code isolated under a new payment domain.
- Do not trust redirect query parameters until the backend verifies the stored
  order amount and owner.
- Prepare data model names for future billing keys and subscriptions, but do
  not implement automatic billing in phase 1.
- Before implementation work begins, stay on a `codex/...` branch.

## Approaches Considered

1. One-time payment now, subscription-ready domain boundary later.
   This is the selected approach because it keeps the MVP small and removable
   while preserving a clean future path.
2. Full Toss widget and richer billing UI now.
   This improves polish but adds frontend surface that conflicts with the
   removable MVP constraint.
3. One-time plus automatic billing now.
   This creates too many policy decisions for the current need, including
   billing-key storage, renewal timing, cancellation, retry, and dunning rules.

## Backend Architecture

Add `PaymentModule` under `backend/api/src/modules/payment`.

Expected boundaries:

- Controller: HTTP API under `/api/v1/payments`.
- Service: product catalog, order creation, amount verification, idempotent
  confirm handling.
- Repository: Prisma access for payment customers and payment orders.
- Provider client: Toss API calls only, behind a local interface.
- DTOs: request and response contracts matching the payment API addendum.

The provider adapter keeps Toss-specific auth, URLs, response parsing, and
error mapping away from core business logic. Future subscription support can add
billing-key methods to the same adapter without rewriting one-time payments.

## Frontend Architecture

Add standalone company billing routes:

- `/company/billing`
- `/company/billing/success`
- `/company/billing/fail`

No GNB or shared navigation changes are included in phase 1. The billing page
loads current orders, creates a new order, then calls the Toss JS SDK with the
server-generated order data and frontend public client key.

## Data Flow

1. Company user opens `/company/billing`.
2. Frontend calls `POST /payments/orders`.
3. Backend creates or reuses the company's payment customer, generates an
   order id, stores a `READY` order, and returns checkout parameters.
4. Frontend opens Toss checkout with `orderId`, `orderName`, `amount`,
   `customerKey`, `successUrl`, and `failUrl`.
5. Toss redirects to `/company/billing/success` with `paymentKey`, `orderId`,
   and `amount`.
6. Success page calls `POST /payments/confirm`.
7. Backend checks company ownership, stored amount, status, and idempotency.
8. Backend calls Toss `/v1/payments/confirm` with the secret key.
9. Backend stores the sanitized approval result and returns the approved order.

Failure redirect flow records failure details through
`POST /payments/orders/{orderId}/fail` so failed attempts are visible in the
billing page.

## Error Handling

- Amount mismatch returns `PAYMENT_AMOUNT_MISMATCH` and never calls Toss.
- Unknown or cross-company order returns `PAYMENT_ORDER_NOT_FOUND`.
- Invalid order state returns `PAYMENT_INVALID_STATUS`.
- Toss failures are mapped to `PAYMENT_PROVIDER_FAILED` and the local order is
  marked `FAILED` when appropriate.
- Successful duplicate confirm with the same `paymentKey` returns the stored
  approved order.

## Future Subscription Path

Phase 2 adds:

- Billing authorization route to issue a Toss billing key.
- Encrypted billing-key storage.
- Subscription table with plan state and next billing time.
- Renewal worker or scheduled job that creates `SUBSCRIPTION_RENEWAL`
  `payment_orders`.

The existing `payment_customers` and `payment_orders` tables remain valid.
Subscriptions add rows rather than changing one-time order semantics.

## Documentation Outputs

- API addendum: `docs/03_contracts/payment-api-spec.md`
- ERD addendum: `docs/02_architecture/payment-erd.md`
- Local ignored sandbox folder: `docs/_local/payment-sandbox/`

`docs/_local/payment-sandbox/` is for local Toss sandbox screenshots, temporary
JSON responses, manual receipts, and debugging payloads. It is ignored so
secrets or noisy local artifacts are not committed.

## Testing Plan

- Backend unit tests for order creation, amount mismatch, idempotent confirm,
  provider failure mapping, and company ownership checks.
- Provider client tests with mocked Toss responses.
- Frontend typecheck for billing pages and payment API client.
- Manual local sandbox test with Toss test keys.
- Final project harness:
  `powershell -ExecutionPolicy Bypass -File scripts\check-local.ps1 -Role A`.

## Removal Plan

To remove the feature, delete the payment module, billing routes, payment API
client files, payment Prisma models and migrations, and payment docs. Because
GNB and existing recruiting/interview/report domains are not touched, removal
does not require layout or navigation cleanup.

