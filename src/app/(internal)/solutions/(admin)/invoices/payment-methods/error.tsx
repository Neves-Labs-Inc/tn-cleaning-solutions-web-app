"use client";

import { useEffect } from "react";

import PaymentMethodsHeader from "@/components/admin/payment-methods-header";
import PaymentMethodsLoadError from "@/components/admin/payment-methods-load-error";

type PaymentMethodsErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function PaymentMethodsError({
  error,
  unstable_retry,
}: PaymentMethodsErrorProps): React.ReactNode {
  useEffect(() => {
    console.error("Payment methods failed to render:", error);
  }, [error]);

  return (
    <div className="max-w-2xl space-y-6 lg:space-y-8">
      <PaymentMethodsHeader />
      <PaymentMethodsLoadError onRetry={() => unstable_retry()} />
    </div>
  );
}
