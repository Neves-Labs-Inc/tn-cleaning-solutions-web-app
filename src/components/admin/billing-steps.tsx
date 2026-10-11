import { Check } from "lucide-react";

import type { AppointmentStatus } from "@/lib/appointments/lifecycle";
import type { PaymentClaim, PaymentState } from "@/lib/invoices/payment-state";
import { cn } from "@/lib/utils";

type BillingStepsProps = {
  status: AppointmentStatus;
  state: PaymentState | null;
  claim: PaymentClaim | null;
};

type Step = { label: string; isDone: boolean };

// Completed → Billed → Paid as the facts say, never forced in order: a prepaid Upcoming
// appointment is Paid with Completed not done.
function stepsFor({ status, state, claim }: BillingStepsProps): Step[] {
  return [
    { label: "Completed", isDone: status === "completed" },
    {
      label: claim ? `Billed · ${claim.number ?? "Draft"}` : "Billed",
      isDone: claim !== null,
    },
    { label: "Paid", isDone: state === "paid" },
  ];
}

export default function BillingSteps(props: BillingStepsProps): React.ReactNode {
  const steps = stepsFor(props);
  const lastDoneIndex = steps.findLastIndex((step) => step.isDone);

  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className="flex items-center gap-3 text-sm"
          aria-current={index === lastDoneIndex ? "step" : undefined}
        >
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-base",
              step.isDone
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground",
            )}
            aria-hidden="true"
          >
            {step.isDone ? <Check className="size-3.5" /> : null}
          </span>
          <span
            className={
              step.isDone ? "font-medium text-foreground" : "text-muted-foreground"
            }
          >
            {step.label}
            <span className="sr-only">{step.isDone ? ", done" : ", not yet"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
