import { useEffect, useRef } from "react";

// Moves focus once a submit settles. While pending, a sheet's inputs and buttons are disabled and
// a focus() call on them does nothing, so the target waits until isPending turns false.
export function useFocusAfterPending(
  isPending: boolean,
): (target: HTMLElement | null) => void {
  const targetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isPending) return;

    targetRef.current?.focus();
    targetRef.current = null;
  }, [isPending]);

  return (target) => {
    targetRef.current = target;
  };
}
