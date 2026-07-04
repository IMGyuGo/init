"use client";

import { useCallback, useEffect, useState } from "react";

import { createPaymentOrder, listPaymentOrders } from "./api";
import styles from "./PaymentPages.module.css";
import { requestTossCardPayment } from "./toss-sdk";
import {
  COMPANY_AI_INTERVIEW_CREDIT_PACKAGES,
  EMPTY_PAYMENT_ORDER_PAGE,
  PAYMENT_HISTORY_PAGE_LIMIT,
  type PaymentOrder,
  type PaymentOrderPageMeta,
  type PaymentProductCode,
} from "./types";

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";

export function CompanyBillingPage() {
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [orderPage, setOrderPage] = useState<PaymentOrderPageMeta>(EMPTY_PAYMENT_ORDER_PAGE);
  const [loading, setLoading] = useState(false);
  const [payingProductCode, setPayingProductCode] = useState<PaymentProductCode | null>(null);
  const [message, setMessage] = useState("");
  const paying = payingProductCode !== null;

  const loadOrders = useCallback(async (page = 1) => {
    setLoading(true);
    setMessage("");
    try {
      const data = await listPaymentOrders({ page, limit: PAYMENT_HISTORY_PAGE_LIMIT });
      setOrders(data.items);
      setOrderPage(data.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "결제 내역을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function handlePayment(productCode: PaymentProductCode) {
    setPayingProductCode(productCode);
    setMessage("");
    try {
      const order = await createPaymentOrder({ productCode, quantity: 1 });
      await requestTossCardPayment(TOSS_CLIENT_KEY, order);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "결제창을 열지 못했습니다.");
      setPayingProductCode(null);
    }
  }

  return (
    <section className="app-page">
      <div className="page-head">
        <div>
          <h1>결제 정보</h1>
          <p className="page-sub">기업이 지원자에게 제공할 AI 면접 크레딧을 결제합니다.</p>
        </div>
        <button className="btn secondary" type="button" onClick={() => void loadOrders(orderPage.page)} disabled={loading || paying}>
          새로고침
        </button>
      </div>

      {message ? <p className="notice danger">{message}</p> : null}

      <div className={styles.billingLayout}>
        <section className={`panel ${styles.billingProductPanel}`}>
          <div className="panel-head">
            <div>
              <h2>AI 면접 크레딧 패키지</h2>
              <p>공고별 예상 응시 인원에 맞춰 필요한 만큼 선결제합니다.</p>
            </div>
            <span className="badge info">후원 크레딧</span>
          </div>
          <div className={styles.billingPackageList}>
            {COMPANY_AI_INTERVIEW_CREDIT_PACKAGES.map((item) => (
              <article className={styles.billingPackage} key={item.productCode}>
                <div className={styles.billingPackageHeader}>
                  <div>
                    <h3>{item.creditAmount}회 크레딧</h3>
                    <p>지원자 {item.creditAmount}명의 AI 면접과 리포트</p>
                  </div>
                  <span className={`badge ${item.label === "추천" ? "success" : "neutral"}`}>{item.label}</span>
                </div>
                <div className={styles.billingPrice}>
                  <strong>{formatWon(item.amount)}</strong>
                  <span>회당 {formatWon(item.unitPrice)} · VAT 포함</span>
                </div>
                <button
                  className={`btn primary ${styles.billingPayButton}`}
                  type="button"
                  onClick={() => void handlePayment(item.productCode)}
                  disabled={paying}
                >
                  {payingProductCode === item.productCode ? "결제창 여는 중" : "토스페이먼츠로 결제"}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>최근 결제 내역</h2>
              <p>승인, 실패, 진행 중인 주문을 확인합니다.</p>
            </div>
          </div>
          {loading ? <p className="empty">결제 내역을 불러오는 중입니다.</p> : <PaymentOrderList orders={orders} />}
          {!loading ? (
            <PaymentOrderPagination page={orderPage} disabled={paying} onPageChange={(nextPage) => void loadOrders(nextPage)} />
          ) : null}
        </section>
      </div>
    </section>
  );
}

export function PaymentOrderPagination({
  page,
  disabled = false,
  onPageChange,
}: {
  page: PaymentOrderPageMeta;
  disabled?: boolean;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(page.totalPages, 1);
  const pageNumbers = buildPaymentPaginationRange(page.page, totalPages);

  if (page.totalItems <= page.limit && totalPages <= 1) {
    return null;
  }

  return (
    <div className="pagination" aria-label="결제 내역 페이지네이션">
      <div className="pagination-summary">
        총 {page.totalItems}건 · {page.page}/{totalPages}페이지
      </div>
      <div className="pagination-actions">
        <button className="btn secondary compact" type="button" disabled={disabled || page.page <= 1} onClick={() => onPageChange(page.page - 1)}>
          이전
        </button>
        {pageNumbers.map((pageNumber) => (
          <button
            className={`page-button ${pageNumber === page.page ? "active" : ""}`}
            key={pageNumber}
            type="button"
            aria-current={pageNumber === page.page ? "page" : undefined}
            disabled={disabled}
            onClick={() => onPageChange(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button className="btn secondary compact" type="button" disabled={disabled || !page.hasNext} onClick={() => onPageChange(page.page + 1)}>
          다음
        </button>
      </div>
    </div>
  );
}

function PaymentOrderList({ orders }: { orders: PaymentOrder[] }) {
  if (orders.length === 0) {
    return <p className="empty">아직 결제 내역이 없습니다.</p>;
  }

  return (
    <div className={styles.billingOrderList}>
      {orders.map((order) => (
        <article className={styles.billingOrder} key={order.orderId}>
          <div>
            <h3>{order.orderName}</h3>
            <p>{order.creditAmount > 0 ? `${order.creditAmount}회 크레딧` : "결제 주문"}</p>
          </div>
          <strong>{formatWon(order.amount)}</strong>
          <span className={`badge ${statusTone(order.status)}`}>{statusLabel(order.status)}</span>
          <time>{formatDateTime(order.approvedAt ?? order.createdAt)}</time>
        </article>
      ))}
    </div>
  );
}

export function formatWon(amount: number) {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(amount);
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(status: PaymentOrder["status"]) {
  const labels: Record<PaymentOrder["status"], string> = {
    READY: "대기",
    IN_PROGRESS: "승인 중",
    DONE: "승인 완료",
    FAILED: "실패",
    CANCELED: "취소",
    PARTIAL_CANCELED: "부분 취소",
  };
  return labels[status];
}

function statusTone(status: PaymentOrder["status"]) {
  if (status === "DONE") return "success";
  if (status === "FAILED" || status === "CANCELED") return "danger";
  if (status === "READY" || status === "IN_PROGRESS") return "warning";
  return "neutral";
}

function buildPaymentPaginationRange(page: number, totalPages: number) {
  if (totalPages <= 0) {
    return [];
  }

  const visibleCount = 5;
  const current = clampPaymentPage(page, 1, totalPages);
  const start = clampPaymentPage(current - 2, 1, Math.max(1, totalPages - visibleCount + 1));
  const end = Math.min(totalPages, start + visibleCount - 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function clampPaymentPage(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
