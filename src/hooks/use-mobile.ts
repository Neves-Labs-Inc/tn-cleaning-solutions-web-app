import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribeToViewport(notify: () => void): () => void {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", notify)
  return () => mql.removeEventListener("change", notify)
}

function getIsMobileSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT
}

// The server has no viewport, so it renders desktop (matches the old default).
function getIsMobileServerSnapshot(): boolean {
  return false
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribeToViewport,
    getIsMobileSnapshot,
    getIsMobileServerSnapshot
  )
}
