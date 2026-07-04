import { Suspense } from "react";

import { PaymentSuccessPage } from "@/features/payment/PaymentSuccessPage";

export default function Page() {
  return (
    <Suspense fallback={<section className="app-page"><p className="empty">결제 승인 정보를 확인하는 중입니다.</p></section>}>
      <PaymentSuccessPage billingHomeHref="/candidate/billing" />
    </Suspense>
  );
}

