"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type ClientsErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

// Catches what the page's inline read errors don't: an unexpected throw.
export default function ClientsError({
  error,
  unstable_retry,
}: ClientsErrorProps): React.ReactNode {
  useEffect(() => {
    console.error("Clients failed to render:", error);
  }, [error]);

  return (
    <Alert
      variant="destructive"
      className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart has-data-[slot=alert-action]:pr-28"
    >
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Couldn&apos;t load clients</AlertTitle>
      <AlertDescription>
        Something went wrong loading the client list. Try again in a moment.
      </AlertDescription>
      <AlertAction>
        <Button
          type="button"
          variant="outline"
          className="text-foreground"
          onClick={() => unstable_retry()}
        >
          Try again
        </Button>
      </AlertAction>
    </Alert>
  );
}
