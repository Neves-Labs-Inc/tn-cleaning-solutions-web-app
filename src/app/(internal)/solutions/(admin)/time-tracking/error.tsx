"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type TimeSheetsErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function TimeSheetsError({
  error,
  unstable_retry,
}: TimeSheetsErrorProps): React.ReactNode {
  useEffect(() => {
    console.error("Time sheets failed to render:", error);
  }, [error]);

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Couldn&apos;t load time sheets</AlertTitle>
        <AlertDescription>
          Something went wrong loading hours. Try again in a moment.
        </AlertDescription>
      </Alert>
      <Button variant="outline" onClick={() => unstable_retry()}>
        Try again
      </Button>
    </div>
  );
}
