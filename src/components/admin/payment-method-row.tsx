"use client";

import { AlertCircle, EyeOff, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import PaymentMethodHideForm from "@/components/admin/payment-method-hide-form";
import PaymentMethodRenameForm from "@/components/admin/payment-method-rename-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/ui/status-badge";
import type { PaymentMethod } from "@/lib/invoices/ledger";

type PaymentMethodRowProps = {
  method: PaymentMethod;
  methods: PaymentMethod[];
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
};

export default function PaymentMethodRow({
  method,
  methods,
  isEditing,
  onEdit,
  onClose,
}: PaymentMethodRowProps): React.ReactNode {
  const renameRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const [isHiding, setIsHiding] = useState(false);
  const [hasHideFailed, setHasHideFailed] = useState(false);

  // Closing an edit (save, cancel, Escape) hands focus back to this row's Rename button.
  useEffect(() => {
    if (wasEditing.current && !isEditing) renameRef.current?.focus();
    wasEditing.current = isEditing;
  }, [isEditing]);

  if (isEditing) {
    return (
      <li className="min-h-16 px-4 py-3">
        <PaymentMethodRenameForm
          method={method}
          methods={methods}
          onClose={onClose}
        />
      </li>
    );
  }

  return (
    <li className="flex min-h-16 flex-col gap-3 px-4 py-3 animate-in fade-in-0 duration-fast sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-1 sm:basis-0">
        <span className="text-base font-medium break-words text-foreground">
          {method.name}
        </span>
        {method.is_hidden ? (
          <StatusBadge
            tone="neutral"
            icon={EyeOff}
            className="shrink-0 animate-in fade-in-0 zoom-in-95 duration-base"
          >
            Hidden
          </StatusBadge>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
        <Button
          ref={renameRef}
          type="button"
          variant="outline"
          className="active:scale-[0.98]"
          disabled={isHiding}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" />
          Rename
        </Button>
        <PaymentMethodHideForm
          method={method}
          onPendingChange={setIsHiding}
          onFailedChange={setHasHideFailed}
        />
      </div>
      {hasHideFailed ? (
        <Alert
          variant="destructive"
          className="animate-in fade-in-0 duration-fast sm:basis-full"
        >
          <AlertCircle aria-hidden="true" />
          <AlertTitle>
            {`Couldn't ${method.is_hidden ? "unhide" : "hide"} "${method.name}"`}
          </AlertTitle>
          <AlertDescription>Try again.</AlertDescription>
        </Alert>
      ) : null}
    </li>
  );
}
