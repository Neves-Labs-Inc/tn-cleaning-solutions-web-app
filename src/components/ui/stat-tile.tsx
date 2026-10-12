import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
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
  // The tile whose view is showing: a primary ring, and aria-current on its Link.
  isActive?: boolean;
  className?: string;
};

const TILE_CLASSES = "flex flex-col gap-1 rounded-xl bg-card p-4 shadow-sm ring-1 ring-foreground/10";

export default function StatTile({
  label,
  value,
  caption,
  icon,
  href,
  fitValue = false,
  isActive = false,
  className,
}: StatTileProps): React.ReactNode {
  const rootClassName = cn(
    TILE_CLASSES,
    fitValue && "@container",
    href &&
      "cursor-pointer outline-none transition-[background-color,box-shadow] duration-fast ease-out-quart active:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
    href && !isActive && "md:hover:ring-foreground/20",
    isActive && "ring-2 ring-primary",
    className,
  );
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        {/* Wraps rather than truncates: a long label in a narrow grid tile must stay readable. */}
        <p className="min-w-0 text-balance break-words text-xs font-medium tracking-wider text-muted-foreground uppercase">
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
      <Link
        href={href}
        aria-current={isActive ? "true" : undefined}
        className={rootClassName}
      >
        {content}
      </Link>
    );
  }
  return <div className={rootClassName}>{content}</div>;
}

type StatTileSkeletonProps = {
  icon?: boolean;
  caption?: boolean;
  fitValue?: boolean;
  // Hold two lines for the label or the caption until the tile is wide enough for one, as the
  // loaded text wraps in narrow tiles. Need fitValue, whose container the widths are read from.
  reserveLabelWrap?: boolean;
  reserveCaptionWrap?: boolean;
  className?: string;
};

// Each bar fills the line box of the real text and runs the same container queries, so the
// loading tile is exactly as tall as the loaded one at every width.
export function StatTileSkeleton({
  icon = false,
  caption = false,
  fitValue = false,
  reserveLabelWrap = false,
  reserveCaptionWrap = false,
  className,
}: StatTileSkeletonProps): React.ReactNode {
  return (
    <div className={cn(TILE_CLASSES, fitValue && "@container", className)}>
      {/* The 20px icon sets the label row's height when there is one. */}
      <div
        className={cn(
          "flex items-center",
          icon ? "h-5" : "h-4",
          reserveLabelWrap && "h-8 @[10.5rem]:h-5",
        )}
      >
        <Skeleton className="h-full w-20" />
      </div>
      <Skeleton
        className={cn(
          "w-24",
          fitValue ? "h-7 @[8.5rem]:h-8 @[11rem]:h-9" : "h-8 sm:h-9",
        )}
      />
      {caption ? (
        <Skeleton
          className={cn("h-4 w-28", reserveCaptionWrap && "h-8 @[11.5rem]:h-4")}
        />
      ) : null}
    </div>
  );
}
