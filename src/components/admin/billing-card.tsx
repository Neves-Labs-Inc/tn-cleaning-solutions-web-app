"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, FilePlus2, ReceiptText, Wallet } from "lucide-react";

import MarkPaidDialog from "@/components/invoices/mark-paid-dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PaymentStatePill from "@/components/ui/payment-state-pill";
import type { AppointmentStatus } from "@/lib/appointments/lifecycle";
import type {
  AppointmentBilling,
  BillingPrice,
} from "@/lib/invoices/appointment-billing";
import type { MarkPaidAppointment } from "@/lib/invoices/mark-paid";
import { formatCents, UNPRICED_LABEL } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

import BillingSteps from "./billing-steps";

export type BillingCardAppointment = {
  id: string;
  clientId: string;
  clientName: string;
  status: AppointmentStatus;
  scheduledDate: string;
  jobName: string;
};

type BillingCardProps = {
  appointment: BillingCardAppointment;
  // null when the billing reads failed.
  billing: AppointmentBilling | null;
  businessDate: string;
};

const NEW_INVOICE_PATH = "/solutions/invoices/new";
const INVOICES_PATH = "/solutions/invoices";
const CARD_CLASS = "gap-4 p-4 text-sm sm:p-5";
const ACTION_CLASS =
  "w-full transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98]";
const OUTLINE_ACTION_CLASS = cn(ACTION_CLASS, "active:bg-muted");

function createInvoiceHref(clientId: string, appointmentId: string): string {
  const params = new URLSearchParams({ client: clientId, visits: appointmentId });
  return `${NEW_INVOICE_PATH}?${params.toString()}`;
}

function priceValue(price: BillingPrice): string {
  let value = "Unavailable";
  if (price.kind === "amount") {
    value = formatCents(price.cents);
  } else if (price.kind === "unpriced") {
    value = UNPRICED_LABEL;
  }
  return value;
}

function CardHeading({ children }: { children?: React.ReactNode }): React.ReactNode {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold">Billing</h2>
      {children}
    </div>
  );
}

// The appointment page's Billing card: Payment state, steps, price and the actions that state allows.
export default function BillingCard({
  appointment,
  billing,
  businessDate,
}: BillingCardProps): React.ReactNode {
  const router = useRouter();
  const [dialogAppointments, setDialogAppointments] = useState<MarkPaidAppointment[]>([]);

  if (!billing) {
    return (
      <Card className={CARD_CLASS}>
        <CardHeading />
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Couldn&apos;t load billing</AlertTitle>
          <AlertDescription>
            The payment state for this appointment couldn&apos;t be loaded.
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          className={cn(OUTLINE_ACTION_CLASS, "sm:w-fit")}
          onClick={() => router.refresh()}
        >
          Try again
        </Button>
      </Card>
    );
  }

  if (appointment.status === "cancelled") {
    return (
      <Card className={CARD_CLASS}>
        <CardHeading />
        <p className="text-muted-foreground">Cancelled appointments aren&apos;t billed.</p>
      </Card>
    );
  }

  const { state, claim, price } = billing;
  const invoiceHref = claim ? `${INVOICES_PATH}/${claim.id}` : null;
  const isIssued = claim?.status === "issued";
  const canMarkPaid = state !== "paid";
  // Unbilled leads with Create invoice, so Mark paid steps back to outline there.
  const isMarkPaidPrimary = state === "billed";
  const markPaidAppointment: MarkPaidAppointment = {
    id: appointment.id,
    scheduledDate: appointment.scheduledDate,
    jobName: appointment.jobName,
    status: appointment.status,
    livePriceCents: billing.livePriceCents,
    claim,
    claimTotalCents: billing.claimTotalCents,
  };

  return (
    <Card className={CARD_CLASS}>
      <CardHeading>
        <PaymentStatePill state={state} className="shrink-0" />
      </CardHeading>

      {state === null ? (
        <p className="text-muted-foreground">
          No payment state until the appointment is completed or put on an invoice. You can still
          mark it paid as a prepayment.
        </p>
      ) : null}

      <BillingSteps status={appointment.status} state={state} claim={claim} />

      <p className="flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground">
          {price.kind === "amount" && price.isBilledAmount ? "Billed amount" : "Live price"}
        </span>
        <span className="font-semibold tabular-nums">{priceValue(price)}</span>
      </p>

      <div className="flex flex-col gap-2">
        {state === "unbilled" ? (
          <Button
            className={ACTION_CLASS}
            nativeButton={false}
            render={<Link href={createInvoiceHref(appointment.clientId, appointment.id)} />}
          >
            <FilePlus2 aria-hidden="true" />
            Create invoice
          </Button>
        ) : null}
        {canMarkPaid ? (
          <Button
            variant={isMarkPaidPrimary ? "default" : "outline"}
            className={isMarkPaidPrimary ? ACTION_CLASS : OUTLINE_ACTION_CLASS}
            onClick={() => setDialogAppointments([markPaidAppointment])}
          >
            <Wallet aria-hidden="true" />
            {isIssued ? "Record payment" : "Mark paid"}
          </Button>
        ) : null}
        {invoiceHref ? (
          <Button
            variant="outline"
            className={OUTLINE_ACTION_CLASS}
            nativeButton={false}
            render={<Link href={invoiceHref} />}
          >
            <ReceiptText aria-hidden="true" />
            Open invoice
          </Button>
        ) : null}
      </div>

      <MarkPaidDialog
        appointments={dialogAppointments}
        clientId={appointment.clientId}
        clientName={appointment.clientName}
        methods={billing.methods}
        businessDate={businessDate}
        onClose={() => setDialogAppointments([])}
      />
    </Card>
  );
}
