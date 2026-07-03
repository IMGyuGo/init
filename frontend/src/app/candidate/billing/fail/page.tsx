import { Suspense } from "react";

import { PaymentFailPage } from "@/features/payment/PaymentFailPage";

export default function Page() {
  return (
    <Suspense fallback={<section className="app-page"><p className="empty">결제 실패 정보를 확인하는 중입니다.</p></section>}>
      <PaymentFailPage billingHomeHref="/candidate/billing" />
    </Suspense>
  );
}

