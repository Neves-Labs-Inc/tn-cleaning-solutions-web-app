"use client";

import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type ClientsLoadErrorProps = {
  title: string;
  description: string;
};

// A failed read on the clients overview; Try again re-renders the page on
// the server.
export default function ClientsLoadError({
  title,
  description,
}: ClientsLoadErrorProps): React.ReactNode {
  const router = useRouter();

  return (
    <Alert
      variant="destructive"
      className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart has-data-[slot=alert-action]:pr-28"
    >
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      <AlertAction>
        <Button
          type="button"
          variant="outline"
          className="text-foreground"
          onClick={() => router.refresh()}
        >
          Try again
        </Button>
      </AlertAction>
    </Alert>
  );
}
