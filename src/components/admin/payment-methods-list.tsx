"use client";

import { useState } from "react";

import PaymentMethodRow from "@/components/admin/payment-method-row";
import { Card } from "@/components/ui/card";
import type { PaymentMethod } from "@/lib/invoices/ledger";

type PaymentMethodsListProps = {
  methods: PaymentMethod[];
};

export default function PaymentMethodsList({
  methods,
}: PaymentMethodsListProps): React.ReactNode {
  // One row in edit at a time: opening another drops the first one's unsaved text.
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Card className="gap-0 p-0">
      <ul className="divide-y divide-border">
        {methods.map((method) => (
          <PaymentMethodRow
            key={method.id}
            method={method}
            methods={methods}
            isEditing={editingId === method.id}
            onEdit={() => setEditingId(method.id)}
            onClose={() => setEditingId(null)}
          />
        ))}
      </ul>
    </Card>
  );
}
