"use client";

import { AlertCircle } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type PaymentMethodsLoadErrorProps = {
  onRetry: () => void;
};

// Shared by the page (refresh) and error.tsx (reset), which differ only in how they retry.
export default function PaymentMethodsLoadError({
  onRetry,
}: PaymentMethodsLoadErrorProps): React.ReactNode {
  return (
    <Alert
      variant="destructive"
      className="animate-in fade-in-0 duration-fast has-data-[slot=alert-action]:pr-3"
    >
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Couldn&apos;t load payment methods</AlertTitle>
      <AlertDescription>Check your connection and try again.</AlertDescription>
      <AlertAction className="static col-span-2 mt-2">
        <Button
          type="button"
          variant="outline"
          className="active:scale-[0.98]"
          onClick={onRetry}
        >
          Try again
        </Button>
      </AlertAction>
    </Alert>
  );
}
