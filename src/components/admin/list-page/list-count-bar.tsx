import { Button } from "@/components/ui/button";

type ListCountBarProps = {
  count: number;
  // [singular, plural], e.g. ["item", "items"].
  noun: [string, string];
  showClear: boolean;
  onClear: () => void;
  size: "default" | "sm";
};

// No wrapper of its own: ResponsiveList's toolbar rows lay it out.
export default function ListCountBar({
  count,
  noun,
  showClear,
  onClear,
  size,
}: ListCountBarProps): React.ReactNode {
  const [singular, plural] = noun;

  return (
    <>
      <p
        aria-live="polite"
        className="text-sm text-muted-foreground tabular-nums"
      >
        {count} {count === 1 ? singular : plural}
      </p>
      {showClear ? (
        <Button
          type="button"
          variant="ghost"
          size={size}
          className="animate-in fade-in-0 duration-fast ease-out-quart"
          onClick={onClear}
        >
          Clear filters
        </Button>
      ) : null}
    </>
  );
}
