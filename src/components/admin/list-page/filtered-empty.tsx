import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

type FilteredEmptyProps = {
  title: string;
  description: string;
  onClear: () => void;
};

// Shown in place of ResponsiveList when filters hide every row.
export default function FilteredEmpty({
  title,
  description,
  onClear,
}: FilteredEmptyProps): React.ReactNode {
  return (
    <Empty className="rounded-lg border animate-in fade-in-0 duration-base ease-out-quart">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      </EmptyContent>
    </Empty>
  );
}
