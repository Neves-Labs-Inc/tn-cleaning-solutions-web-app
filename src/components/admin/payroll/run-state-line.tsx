import { Lock } from "lucide-react";

import type { RunStateLine as RunStateLineValue } from "@/lib/payroll/format";
import { cn } from "@/lib/utils";

type RunStateLineProps = {
  line: RunStateLineValue;
  // For a disabled button's aria-describedby.
  id?: string;
};

const TONE_CLASS_NAMES: Record<RunStateLineValue["tone"], string> = {
  muted: "text-muted-foreground",
  destructive: "text-destructive",
  warning: "text-status-warning-foreground",
  paid: "text-foreground",
};

// The one line a run's action area shows about where it stands.
export default function RunStateLine({
  line,
  id,
}: RunStateLineProps): React.ReactNode {
  return (
    <p
      id={id}
      className={cn(
        "flex items-center gap-2 text-sm",
        TONE_CLASS_NAMES[line.tone],
      )}
    >
      {line.tone === "paid" ? (
        <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : null}
      {line.text}
    </p>
  );
}
