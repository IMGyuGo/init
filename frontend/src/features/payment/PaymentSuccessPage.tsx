"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { confirmPayment } from "./api";
import { formatWon } from "./CompanyBillingPage";
import { clearPaymentResultQuery } from "./payment-result-url";
import styles from "./PaymentPages.module.css";
import type { PaymentOrder } from "./types";

export function PaymentSuccessPage({
  billingHomeHref = "/company/billing",
}: {
  billingHomeHref?: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [message, setMessage] = useState("결제 승인 처리 중입니다.");
  const handledResultKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const paymentKey = searchParams.get("paymentKey");
    const orderId = searchParams.get("orderId");
    const amount = Number(searchParams.get("amount"));

    if (!paymentKey || !orderId || !Number.isInteger(amount) || amount < 1) {
      if (handledResultKeyRef.current) return;
      setMessage("결제 승인 정보가 올바르지 않습니다.");
      return;
    }

    const resultKey = `${orderId}:${paymentKey}:${amount}`;
    if (handledResultKeyRef.current === resultKey) return;
    handledResultKeyRef.current = resultKey;

    void confirmPayment({ paymentKey, orderId, amount })
      .then((result) => {
        if (!mountedRef.current) return;
        setOrder(result);
        setMessage(successMessage(result));
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        setMessage(error instanceof Error ? error.message : "결제 승인에 실패했습니다.");
      })
      .finally(() => {
        if (!mountedRef.current) return;
        clearPaymentResultQuery(pathname);
      });
  }, [pathname, searchParams]);

  const badgeTone = resultBadgeTone(order);
  const badgeLabel = resultBadgeLabel(order);

  return (
    <section className={`app-page ${styles.billingResultPage}`}>
      <div className={`panel ${styles.billingResultPanel}`}>
        <span className={`badge ${badgeTone}`}>{badgeLabel}</span>
        <h1>{message}</h1>
        {order ? (
          <dl className={styles.billingResultList}>
            <dt>주문명</dt>
            <dd>{order.orderName}</dd>
            <dt>결제 금액</dt>
            <dd>{formatWon(order.amount)}</dd>
            <dt>크레딧</dt>
            <dd>{order.creditAmount > 0 ? `${order.creditAmount}회 · 회당 ${formatWon(order.unitPrice)}` : "-"}</dd>
            <dt>결제수단</dt>
            <dd>{order.method ?? "-"}</dd>
          </dl>
        ) : null}
        <div className="form-actions">
          {order?.receiptUrl ? (
            <a className="btn secondary" href={order.receiptUrl} target="_blank" rel="noreferrer">
              영수증 보기
            </a>
          ) : null}
          <Link className="btn primary" href={billingHomeHref}>
            결제 정보로 이동
          </Link>
        </div>
      </div>
    </section>
  );
}

function successMessage(order: PaymentOrder) {
  if (order.status === "DONE") return "결제가 승인되었습니다.";
  if (order.status === "IN_PROGRESS") return "결제 승인 요청이 처리 중입니다. 잠시 후 결제 내역에서 상태를 확인해 주세요.";
  if (order.status === "FAILED") return order.failureMessage ?? "결제 승인에 실패했습니다.";
  return "결제 상태를 확인했습니다.";
}

function resultBadgeTone(order: PaymentOrder | null) {
  if (order?.status === "DONE") return "success";
  if (order?.status === "FAILED") return "danger";
  return "warning";
}

function resultBadgeLabel(order: PaymentOrder | null) {
  if (order?.status === "DONE") return "승인 완료";
  if (order?.status === "FAILED") return "승인 실패";
  if (order?.status === "IN_PROGRESS") return "승인 중";
  return "처리 중";
}
