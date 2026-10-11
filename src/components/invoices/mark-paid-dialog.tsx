"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import ResponsiveDialog from "@/components/ui/responsive-dialog";
import type { PaymentMethod } from "@/lib/invoices/ledger";
import {
  isRecordPayment,
  type MarkPaidAppointment,
} from "@/lib/invoices/mark-paid";

import ClaimPaymentForm from "./claim-payment-form";
import MarkPaidForm from "./mark-paid-form";

type MarkPaidDialogProps = {
  // Empty means closed. Every one is the client's; a single one on an issued invoice switches the
  // sheet to Record payment for that invoice.
  appointments: MarkPaidAppointment[];
  clientId: string;
  clientName: string;
  methods: PaymentMethod[];
  businessDate: string;
  onClose: () => void;
  // After a successful payment, before onClose: lets a caller tell success from cancel.
  onSuccess?: () => void;
};

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export default function MarkPaidDialog({
  appointments,
  clientId,
  clientName,
  methods,
  businessDate,
  onClose,
  onSuccess,
}: MarkPaidDialogProps): React.ReactNode {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  // A refusal means the page behind may be stale, so closing re-reads it.
  const hasRefusalRef = useRef(false);

  const isOpen = appointments.length > 0;
  const claim = isRecordPayment(appointments) ? appointments[0].claim : null;
  const title = claim ? "Record payment" : "Mark paid";
  const description = claim
    ? `${clientName} · ${claim.number ?? ""}`
    : `${clientName} · ${pluralize(appointments.length, "appointment")}`;

  function handleClose(): void {
    if (hasRefusalRef.current) router.refresh();
    hasRefusalRef.current = false;
    onClose();
  }

  function handleSuccess(): void {
    hasRefusalRef.current = false;
    onSuccess?.();
    onClose();
    router.refresh();
  }

  const formProps = {
    methods,
    businessDate,
    onCancel: handleClose,
    onSuccess: handleSuccess,
    onRefusal: () => {
      hasRefusalRef.current = true;
    },
    onPendingChange: setIsPending,
  };

  return (
    <ResponsiveDialog
      open={isOpen}
      onOpenChange={(open) => (open ? null : handleClose())}
      title={title}
      description={description}
      isPending={isPending}
    >
      {claim ? (
        <ClaimPaymentForm
          key={claim.id}
          invoiceId={claim.id}
          invoiceNumber={claim.number ?? ""}
          totalCents={appointments[0].claimTotalCents}
          {...formProps}
        />
      ) : isOpen ? (
        <MarkPaidForm
          // Remount per selection so the amounts prefill again.
          key={appointments.map((appointment) => appointment.id).join(",")}
          clientId={clientId}
          appointments={appointments}
          {...formProps}
        />
      ) : null}
    </ResponsiveDialog>
  );
}
