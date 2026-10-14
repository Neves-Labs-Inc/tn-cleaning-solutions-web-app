"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type PayPeriodErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function PayPeriodError({
  error,
  unstable_retry,
}: PayPeriodErrorProps): React.ReactNode {
  useEffect(() => {
    console.error("Pay period failed to render:", error);
  }, [error]);

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Couldn&apos;t load this pay period</AlertTitle>
        <AlertDescription>
          Something went wrong loading its Pay runs. Try again in a moment.
        </AlertDescription>
      </Alert>
      <Button variant="outline" onClick={() => unstable_retry()}>
        Try again
      </Button>
    </div>
  );
}
