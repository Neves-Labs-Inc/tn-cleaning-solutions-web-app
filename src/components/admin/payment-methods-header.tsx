import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";

const DESCRIPTION =
  "What the Record payment picker offers. Renaming or hiding a method never changes past payments.";

// Shared by the page and error.tsx so a failed load still has a way back.
export default function PaymentMethodsHeader(): React.ReactNode {
  return (
    <>
      <Button
        variant="ghost"
        className="-ml-3 w-fit active:scale-[0.98]"
        render={<Link href="/solutions/invoices" />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Invoices
      </Button>
      <PageHeader title="Payment methods" description={DESCRIPTION} />
    </>
  );
}
