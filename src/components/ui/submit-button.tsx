"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type SubmitButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "children" | "type"
> & {
  label: string;
  pendingLabel: string;
};

export default function SubmitButton({
  label,
  pendingLabel,
  disabled,
  ...rest
}: SubmitButtonProps): React.ReactNode {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      data-pending={pending || undefined}
      {...rest}
    >
      {/* Both labels share one grid cell so the button is always as wide as the wider label. */}
      <span className="grid [&>*]:col-start-1 [&>*]:row-start-1">
        <span
          className={cn(
            "inline-flex items-center justify-center gap-2",
            pending ? "visible" : "invisible",
          )}
          aria-hidden={!pending}
        >
          <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
          {pendingLabel}
        </span>
        <span
          className={cn(
            "inline-flex items-center justify-center",
            pending ? "invisible" : "visible",
          )}
          aria-hidden={pending}
        >
          {label}
        </span>
      </span>
    </Button>
  );
}
