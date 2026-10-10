import { CreditCard } from "lucide-react";
import Link from "next/link";

import PaymentMethodsHeader from "@/components/admin/payment-methods-header";
import PaymentMethodsList from "@/components/admin/payment-methods-list";
import PaymentMethodsRefreshError from "@/components/admin/payment-methods-refresh-error";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InvoiceLedger } from "@/lib/invoices/ledger";
import { createClient } from "@/lib/supabase/server";

export default async function PaymentMethodsPage(): Promise<React.ReactNode> {
  const ledger = new InvoiceLedger(await createClient());
  const result = await ledger.listPaymentMethods();

  return (
    <div className="max-w-2xl space-y-6 lg:space-y-8">
      <PaymentMethodsHeader />
      <div className="animate-in fade-in-0 duration-slow">
        {!result.ok ? (
          <PaymentMethodsRefreshError />
        ) : result.data.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CreditCard aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No payment methods yet</EmptyTitle>
              <EmptyDescription>
                A method you type while recording a payment joins this list.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                className="active:scale-[0.98]"
                render={<Link href="/solutions/invoices" />}
                nativeButton={false}
              >
                Go to Invoices
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <PaymentMethodsList methods={result.data} />
        )}
      </div>
    </div>
  );
}
