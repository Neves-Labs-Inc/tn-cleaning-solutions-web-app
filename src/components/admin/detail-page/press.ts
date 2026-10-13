// Press feedback for buttons (DESIGN.md §13). The one home of these classes for admin pages.

// Filled (`default` variant) buttons. Tailwind v4 `scale-*` sets the CSS `scale` property, so that is what transitions.
export const PRESS_CLASS_NAME =
  "transition-[background-color,scale,translate,box-shadow] duration-fast ease-out-quart active:scale-[0.98]";

// Outline and ghost buttons: the primitive has no pressed background of its own.
export const OUTLINE_PRESS_CLASS_NAME = `${PRESS_CLASS_NAME} active:bg-muted`;
