// Classes shared by the Mark paid and Edit payout sheets.

// Sticky, not fixed, so the buttons stay in reach however long the form is. Below md the drawer
// body pads its bottom (1rem + safe area); the footer takes that padding over so it sits flush
// with the sheet's edge and nothing scrolls visibly beneath it.
export const STICKY_FOOTER_CLASS =
  "sticky bottom-0 -mx-4 border-t bg-popover/95 px-4 py-3 backdrop-blur max-md:bottom-[calc(-1rem-var(--safe-bottom))] max-md:-mb-[calc(1rem+var(--safe-bottom))] max-md:pb-[calc(1.75rem+var(--safe-bottom))]";

export const ERROR_MOTION_CLASS =
  "animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart";

// DESIGN.md input hover, for inputs whose primitive doesn't carry it.
export const INPUT_HOVER_CLASS =
  "transition-[border-color,box-shadow] duration-fast hover:border-foreground/30";
