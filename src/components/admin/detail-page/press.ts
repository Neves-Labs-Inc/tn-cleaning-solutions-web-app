// Press feedback for buttons (DESIGN.md §13). The one home of these classes for admin pages.

// Filled (`default` variant) buttons. Tailwind v4 `scale-*` sets the CSS `scale` property, so that is what transitions.
export const PRESS_CLASS_NAME =
  "transition-[background-color,scale,translate,box-shadow] duration-fast ease-out-quart active:scale-[0.98]";

// Below md, hovering an outline/ghost button keeps its resting background: hover tints from md only.
// - max-md:active re-asserts the press tint, which the hover reset would otherwise hide.
// - Outline's resting dark:bg-input/30 already outranks every hover rule, so dark needs nothing more.
// - Ghost's dark:hover:bg-muted/50 outranks a plain hover reset, so the borderless (ghost) button gets
//   its own dark reset, skipped while pressed so the press still shows.
const PHONE_HOVER_RESET_CLASS_NAME =
  "max-md:hover:bg-transparent max-md:active:bg-muted max-md:dark:[&.border-transparent:hover:not(:active)]:bg-transparent";

// Outline and ghost buttons: the primitive has no pressed background of its own.
export const OUTLINE_PRESS_CLASS_NAME = `${PRESS_CLASS_NAME} active:bg-muted ${PHONE_HOVER_RESET_CLASS_NAME}`;
