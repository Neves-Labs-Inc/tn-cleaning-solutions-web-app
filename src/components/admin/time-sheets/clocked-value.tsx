import { formatMinutes } from "@/components/admin/time-sheets/format-minutes";

type ClockedValueProps = {
  minutes: number | null;
};

export default function ClockedValue({
  minutes,
}: ClockedValueProps): React.ReactNode {
  if (minutes === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="font-mono tabular-nums">{formatMinutes(minutes)}</span>;
}
