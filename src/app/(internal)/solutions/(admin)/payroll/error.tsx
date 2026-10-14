"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type PayPeriodsErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function PayPeriodsError({
  error,
  unstable_retry,
}: PayPeriodsErrorProps): React.ReactNode {
  useEffect(() => {
    console.error("Pay periods failed to render:", error);
  }, [error]);

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Couldn&apos;t load pay periods</AlertTitle>
        <AlertDescription>
          Something went wrong loading Payroll. Try again in a moment.
        </AlertDescription>
      </Alert>
      <Button variant="outline" onClick={() => unstable_retry()}>
        Try again
      </Button>
    </div>
  );
}
