// DOM ids for a session's panels and focus targets. The drill-down renders every session twice
// (card list and xl table), so each id carries its layout.

export type SessionLayout = "row" | "card";

// Takes focus when a closed panel leaves no fix button to return to.
export function getSessionFocusId(sessionId: string, layout: SessionLayout): string {
  return `session-${layout}-${sessionId}`;
}

export function getFixButtonId(sessionId: string, layout: SessionLayout): string {
  return `fix-button-${layout}-${sessionId}`;
}

export function getFixPanelId(sessionId: string, layout: SessionLayout): string {
  return `fix-panel-${layout}-${sessionId}`;
}
