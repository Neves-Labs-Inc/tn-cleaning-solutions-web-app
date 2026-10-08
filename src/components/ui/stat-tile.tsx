import { cn } from "@/lib/utils";

type StatTileProps = {
  label: string;
  value: string;
  caption?: string;
  icon?: React.ReactNode;
  className?: string;
};

export default function StatTile({
  label,
  value,
  caption,
  icon,
  className,
}: StatTileProps): React.ReactNode {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl bg-card p-4 shadow-sm ring-1 ring-foreground/10",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl">
        {value}
      </p>
      {caption ? (
        <p className="text-xs text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );
}
