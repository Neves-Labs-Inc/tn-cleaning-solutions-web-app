"use client";

import { useEffect, useRef, useState } from "react";

import {
  getFixButtonId,
  getSessionFocusId,
} from "@/components/admin/time-sheets/session-panel-ids";

// The appointment page's crew list keeps one panel (fix form or history) open at a time, the
// same rule as the drill-down, and returns focus when a fix panel closes.

export type CrewPanelKind = "history" | "fix";
type OpenPanel = { sessionId: string; kind: CrewPanelKind } | null;

export type CrewPanels = {
  isOpen: (sessionId: string, kind: CrewPanelKind) => boolean;
  toggle: (sessionId: string, kind: CrewPanelKind) => void;
  closeFix: (sessionId: string) => void;
};

export function useCrewPanels(): CrewPanels {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const focusAfterFix = useRef<string | null>(null);

  const isOpen = (sessionId: string, kind: CrewPanelKind) =>
    openPanel?.sessionId === sessionId && openPanel.kind === kind;

  // Opening one Cleaner's panel replaces any other; the same toggle closes it.
  const toggle = (sessionId: string, kind: CrewPanelKind) =>
    setOpenPanel((current) =>
      current?.sessionId === sessionId && current.kind === kind
        ? null
        : { sessionId, kind },
    );

  // A save that resolves after the admin opened another panel must not close that one.
  const closeFix = (sessionId: string) =>
    setOpenPanel((current) => {
      const isOwn = current?.sessionId === sessionId && current.kind === "fix";
      if (!isOwn) return current;

      focusAfterFix.current = sessionId;
      return null;
    });

  // Focus returns to the fix button, or to the Cleaner's card when the save removed it.
  useEffect(() => {
    const sessionId = focusAfterFix.current;
    if (!sessionId || openPanel !== null) return;

    focusAfterFix.current = null;
    const element =
      document.getElementById(getFixButtonId(sessionId, "card")) ??
      document.getElementById(getSessionFocusId(sessionId, "card"));
    element?.focus();
  }, [openPanel]);

  return { isOpen, toggle, closeFix };
}
