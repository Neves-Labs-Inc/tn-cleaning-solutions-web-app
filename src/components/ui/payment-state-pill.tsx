import StatusBadge, { paymentStateBadge } from "@/components/ui/status-badge";
import type { PaymentState } from "@/lib/invoices/payment-state";
import { cn } from "@/lib/utils";

type PaymentStatePillProps = {
  state: PaymentState | null;
  className?: string;
};

// The Payment state pill: tone, icon and label from paymentStateBadge. No state renders nothing.
// Keyed on the state so a change re-enters once in its new tone.
export default function PaymentStatePill({
  state,
  className,
}: PaymentStatePillProps): React.ReactNode {
  if (!state) return null;

  const spec = paymentStateBadge(state);
  return (
    <StatusBadge
      key={state}
      tone={spec.tone}
      icon={spec.icon}
      className={cn(
        "animate-in fade-in-0 zoom-in-95 duration-base ease-out-quart",
        className,
      )}
    >
      {spec.label}
    </StatusBadge>
  );
}
