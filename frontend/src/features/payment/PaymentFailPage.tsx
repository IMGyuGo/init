"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { recordPaymentFailure } from "./api";
import { clearPaymentResultQuery } from "./payment-result-url";
import styles from "./PaymentPages.module.css";
import type { PaymentOrder } from "./types";

export function PaymentFailPage({
  billingHomeHref = "/company/billing",
}: {
  billingHomeHref?: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [message, setMessage] = useState(searchParams.get("message") ?? "결제가 완료되지 않았습니다.");
  const [orderStatus, setOrderStatus] = useState<PaymentOrder["status"] | null>(null);
  const handledResultKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const orderId = searchParams.get("orderId");
    const code = searchParams.get("code") ?? "UNKNOWN_PAYMENT_FAILURE";
    const failureMessage = searchParams.get("message") ?? "결제가 완료되지 않았습니다.";

    if (!orderId) {
      if (handledResultKeyRef.current) return;
      return;
    }

    const resultKey = `${orderId}:${code}:${failureMessage}`;
    if (handledResultKeyRef.current === resultKey) return;
    handledResultKeyRef.current = resultKey;

    void recordPaymentFailure(orderId, { code, message: failureMessage })
      .then((result) => {
        if (!mountedRef.current) return;
        setOrderStatus(result.status);
        setMessage(result.status === "DONE" ? "이미 승인된 결제입니다." : result.failureMessage ?? failureMessage);
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        setMessage(error instanceof Error ? error.message : failureMessage);
      })
      .finally(() => {
        if (!mountedRef.current) return;
        clearPaymentResultQuery(pathname);
      });
  }, [pathname, searchParams]);

  const approved = orderStatus === "DONE";

  return (
    <section className={`app-page ${styles.billingResultPage}`}>
      <div className={`panel ${styles.billingResultPanel}`}>
        <span className={`badge ${approved ? "success" : "danger"}`}>{approved ? "승인 완료" : "결제 실패"}</span>
        <h1>{message}</h1>
        <p>{approved ? "결제 정보에서 승인 내역을 확인할 수 있습니다." : "결제 정보를 확인한 뒤 다시 시도할 수 있습니다."}</p>
        <div className="form-actions">
          <Link className="btn primary" href={billingHomeHref}>
            {approved ? "결제 정보로 이동" : "다시 결제하기"}
          </Link>
        </div>
      </div>
    </section>
  );
}
