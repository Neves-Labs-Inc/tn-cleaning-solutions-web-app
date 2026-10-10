import { formatBusinessTime } from "@/lib/schedule/business-time";

type ClockTimeProps = {
  instant: string | null;
};

// A clock as "h:mm AM" in business time, or a muted dash when there is none.
export default function ClockTime({ instant }: ClockTimeProps): React.ReactNode {
  if (instant === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="font-mono tabular-nums">
      {formatBusinessTime(new Date(instant))}
    </span>
  );
}
