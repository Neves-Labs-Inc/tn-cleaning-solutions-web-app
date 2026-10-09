import Link from "next/link";

import { cn } from "@/lib/utils";

type StatTileProps = {
  label: string;
  value: string;
  caption?: string;
  icon?: React.ReactNode;
  // With href the whole tile is a Link; visuals stay the same.
  href?: string;
  // Sizes the value to the tile's width, for dense grids where money values could overflow.
  fitValue?: boolean;
  className?: string;
};

export default function StatTile({
  label,
  value,
  caption,
  icon,
  href,
  fitValue = false,
  className,
}: StatTileProps): React.ReactNode {
  const rootClassName = cn(
    "flex flex-col gap-1 rounded-xl bg-card p-4 shadow-sm ring-1 ring-foreground/10",
    fitValue && "@container",
    href &&
      "cursor-pointer outline-none transition-[background-color,box-shadow] duration-fast ease-out-quart active:bg-muted md:hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "font-semibold tracking-tight text-foreground tabular-nums",
          fitValue
            ? "text-lg @[7rem]:text-xl @[8.5rem]:text-2xl @[11rem]:text-3xl"
            : "text-2xl sm:text-3xl",
        )}
      >
        {value}
      </p>
      {caption ? (
        <p className="text-xs text-muted-foreground">{caption}</p>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={rootClassName}>
        {content}
      </Link>
    );
  }
  return <div className={rootClassName}>{content}</div>;
}
