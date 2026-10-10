"use client";

import { useLayoutEffect, useRef } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

type ResponsiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  // The body, usually a <form>. It scrolls when taller than the sheet.
  children: React.ReactNode;
  // A submit is in flight: Escape, the overlay and a swipe can't close the sheet until it settles.
  isPending?: boolean;
  // Where focus goes on close; defaults to the element focused when the sheet opened. Pass it when
  // that element is gone by then (a More item).
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  // False while handing off to another sheet, so this one doesn't pull focus back as it unmounts.
  shouldRestoreFocus?: boolean;
};

// DESIGN.md §10: a bottom Drawer on phones, a Dialog from md up. The non-destructive counterpart
// of ConfirmDialog, for forms and pickers.
export default function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  isPending = false,
  returnFocusRef,
  shouldRestoreFocus = true,
}: ResponsiveDialogProps): React.ReactNode {
  const isMobile = useIsMobile();
  // The element focused when the sheet opened: the fallback return target. Captured in a layout
  // effect, before the drawer's content mounts and takes focus.
  const openerRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (open) openerRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  function handleOpenChange(isOpen: boolean): void {
    if (!isOpen && isPending) return;
    onOpenChange(isOpen);
  }

  // Radix's own restore is unreliable inside vaul, so focus goes back explicitly: to the given ref,
  // else to whatever was focused when the sheet opened.
  function handleCloseAutoFocus(event: Event): void {
    if (!shouldRestoreFocus) {
      event.preventDefault();
      return;
    }
    const target = returnFocusRef?.current ?? openerRef.current;
    if (target?.isConnected) {
      event.preventDefault();
      target.focus();
    }
  }

  if (isMobile) {
    return (
      // vaul defaults autoFocus to false, which leaves focus behind the sheet and loses it on close.
      <Drawer
        open={open}
        onOpenChange={handleOpenChange}
        dismissible={!isPending}
        direction="bottom"
        autoFocus
      >
        <DrawerContent onCloseAutoFocus={handleCloseAutoFocus}>
          <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description ? <DrawerDescription>{description}</DrawerDescription> : null}
          </DrawerHeader>
          <div className="min-h-0 overflow-y-auto px-4 pb-[calc(1rem+var(--safe-bottom))]">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        finalFocus={shouldRestoreFocus ? (returnFocusRef ?? true) : false}
        className="flex max-h-[85vh] flex-col text-sm data-open:duration-base data-open:ease-out-quart data-closed:duration-[140ms] data-closed:ease-in-quart sm:max-w-md"
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-sm leading-6">{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="-mx-4 min-h-0 overflow-y-auto px-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
