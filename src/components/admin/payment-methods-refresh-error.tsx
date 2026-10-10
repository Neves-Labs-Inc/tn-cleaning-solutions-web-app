"use client";

import { useRouter } from "next/navigation";

import PaymentMethodsLoadError from "@/components/admin/payment-methods-load-error";

export default function PaymentMethodsRefreshError(): React.ReactNode {
  const router = useRouter();
  return <PaymentMethodsLoadError onRetry={() => router.refresh()} />;
}
