"use client";

import { useLayoutEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import SubmitButton from "@/components/ui/submit-button";
import { useIsMobile } from "@/hooks/use-mobile";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  keepLabel: string;
  onConfirm: () => Promise<void>;
  // Where focus goes on close; defaults to the element focused when the dialog opened. Pass it when
  // that element is gone by then (a More item).
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  // Destructive unless the confirmed action isn't (a bulk Mark complete).
  confirmVariant?: "destructive" | "default";
  // The body between the description and the footer (a scope choice, a preview). Disabled while
  // the confirm runs.
  children?: React.ReactNode;
  confirmDisabled?: boolean;
};

type KeepButtonProps = {
  label: string;
  isMobile: boolean;
  keepRef: React.RefObject<HTMLButtonElement | null>;
};

// Lives inside the form so useFormStatus can disable it while the confirm runs.
function KeepButton({ label, isMobile, keepRef }: KeepButtonProps): React.ReactNode {
  const { pending } = useFormStatus();

  if (isMobile) {
    return (
      <DrawerClose asChild>
        <Button ref={keepRef} type="button" variant="outline" size="lg" disabled={pending} autoFocus>
          {label}
        </Button>
      </DrawerClose>
    );
  }

  return (
    <AlertDialogCancel ref={keepRef} disabled={pending}>
      {label}
    </AlertDialogCancel>
  );
}

// Disables native controls in the body while the confirm runs. Base UI radios are spans, so a radio
// group reads useFormStatus itself.
function PendingFieldset({ children }: { children: React.ReactNode }): React.ReactNode {
  const { pending } = useFormStatus();

  return (
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      {children}
    </fieldset>
  );
}

// DESIGN.md §9 / §10: a centered AlertDialog from md up, a bottom Drawer on phones.
// Destructive by default; Keep takes initial focus so Enter never confirms by accident.
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  keepLabel,
  onConfirm,
  returnFocusRef,
  confirmVariant = "destructive",
  children,
  confirmDisabled = false,
}: ConfirmDialogProps): React.ReactNode {
  const isMobile = useIsMobile();
  const keepRef = useRef<HTMLButtonElement>(null);
  // The element focused when the dialog opened: the fallback return target. Captured in a layout
  // effect, before the drawer's content mounts and Keep takes focus.
  const openerRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (open) openerRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  // Radix's own restore is unreliable inside vaul, so focus goes back explicitly: to the given ref,
  // else to whatever was focused when the dialog opened.
  function handleCloseAutoFocus(event: Event): void {
    const target = returnFocusRef?.current ?? openerRef.current;
    if (target?.isConnected) {
      event.preventDefault();
      target.focus();
    }
  }

  if (isMobile) {
    return (
      // vaul defaults autoFocus to false, which loses focus to <body> on close.
      <Drawer open={open} onOpenChange={onOpenChange} direction="bottom" autoFocus>
        <DrawerContent onCloseAutoFocus={handleCloseAutoFocus}>
          {/* The header scrolls away with a tall body; the footer stays pinned. */}
          <form action={onConfirm} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
                <DrawerTitle>{title}</DrawerTitle>
                <DrawerDescription>{description}</DrawerDescription>
              </DrawerHeader>
              {children ? (
                <div className="px-4">
                  <PendingFieldset>{children}</PendingFieldset>
                </div>
              ) : null}
            </div>
            {/* A body can scroll under the footer, so its top edge marks where the cut is. */}
            <DrawerFooter className={`pb-[calc(1rem+var(--safe-bottom))] ${children ? "border-t" : ""}`}>
              <SubmitButton
                variant={confirmVariant}
                size="lg"
                label={confirmLabel}
                pendingLabel={pendingLabel}
                disabled={confirmDisabled}
              />
              <KeepButton label={keepLabel} isMobile keepRef={keepRef} />
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        initialFocus={keepRef}
        finalFocus={returnFocusRef ?? true}
        className={`data-open:duration-base data-open:ease-out-quart data-closed:duration-[140ms] data-closed:ease-in-quart ${children ? "data-[size=default]:sm:max-w-md" : ""}`}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={onConfirm} className="contents">
          {children ? <PendingFieldset>{children}</PendingFieldset> : null}
          <AlertDialogFooter>
            <KeepButton label={keepLabel} isMobile={false} keepRef={keepRef} />
            <SubmitButton
              variant={confirmVariant}
              label={confirmLabel}
              pendingLabel={pendingLabel}
              disabled={confirmDisabled}
            />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
