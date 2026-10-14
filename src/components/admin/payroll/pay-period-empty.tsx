import { Wallet } from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

type PayPeriodEmptyProps = {
  isEnded: boolean;
  // An ended period's single action: Add Cleaner.
  action?: React.ReactNode;
};

// A period with no runs.
export default function PayPeriodEmpty({
  isEnded,
  action = null,
}: PayPeriodEmptyProps): React.ReactNode {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Wallet aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No pay this period</EmptyTitle>
        <EmptyDescription>
          {isEnded
            ? "No Cleaner clocked a shift or had a clock problem in this period."
            : "Drafts show up here as Cleaners clock shifts."}
        </EmptyDescription>
      </EmptyHeader>
      {action === null ? null : <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
