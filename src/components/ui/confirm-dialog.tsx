"use client";

import { useRef } from "react";
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

// DESIGN.md §9 / §10: a centered AlertDialog from md up, a bottom Drawer on phones.
// Destructive-only by design; Keep takes initial focus so Enter never confirms by accident.
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  keepLabel,
  onConfirm,
}: ConfirmDialogProps): React.ReactNode {
  const isMobile = useIsMobile();
  const keepRef = useRef<HTMLButtonElement>(null);

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
        <DrawerContent>
          <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <form action={onConfirm}>
            <DrawerFooter className="pb-[calc(1rem+var(--safe-bottom))]">
              <SubmitButton
                variant="destructive"
                size="lg"
                label={confirmLabel}
                pendingLabel={pendingLabel}
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
        className="data-open:duration-base data-open:ease-out-quart data-closed:duration-[140ms] data-closed:ease-in-quart"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={onConfirm}>
          <AlertDialogFooter>
            <KeepButton label={keepLabel} isMobile={false} keepRef={keepRef} />
            <SubmitButton variant="destructive" label={confirmLabel} pendingLabel={pendingLabel} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
