import Link from "next/link";
import { CalendarX2 } from "lucide-react";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function PayPeriodNotFound(): React.ReactNode {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarX2 aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>This pay period doesn&apos;t exist</EmptyTitle>
        <EmptyDescription>
          Payroll starts with the period of Oct 5–18, 2026.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          className={OUTLINE_PRESS_CLASS_NAME}
          nativeButton={false}
          render={<Link href="/solutions/payroll" />}
        >
          Back to Pay periods
        </Button>
      </EmptyContent>
    </Empty>
  );
}
