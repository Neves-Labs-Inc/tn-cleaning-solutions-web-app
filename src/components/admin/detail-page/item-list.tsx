import { AlertCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// Row text never truncates; it wraps.
export const ITEM_PRIMARY_CLASS_NAME =
  "text-base font-medium text-foreground break-words";
export const ITEM_SECONDARY_CLASS_NAME =
  "text-sm leading-6 text-foreground break-words";
// Meta and notes. Add `whitespace-pre-line` for multi-line notes.
export const ITEM_META_CLASS_NAME =
  "text-sm leading-6 text-muted-foreground break-words";

// Rows aren't links: no hover, press or pointer. Callers key rows by a stable id, so only new rows fade in.
const ROW_LAYOUT_CLASS_NAME =
  "flex flex-col gap-3 animate-in fade-in-0 duration-base sm:flex-row sm:items-start sm:justify-between sm:gap-4";
const ROW_TEXT_CLASS_NAME = "min-w-0 space-y-1 sm:flex-1";

type ItemListCardProps = {
  children: React.ReactNode;
  ariaLabel: string;
};

export function ItemListCard({
  children,
  ariaLabel,
}: ItemListCardProps): React.ReactNode {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <ul aria-label={ariaLabel} className="divide-y divide-border">
        {children}
      </ul>
    </Card>
  );
}

type ItemRowProps = {
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export function ItemRow({ children, actions }: ItemRowProps): React.ReactNode {
  return (
    <li className={`min-h-16 px-4 py-3 ${ROW_LAYOUT_CLASS_NAME}`}>
      <div className={ROW_TEXT_CLASS_NAME}>{children}</div>
      {actions}
    </li>
  );
}

type ItemGroupRowProps = {
  title: React.ReactNode;
  children: React.ReactNode;
};

// One record with several entries under it; `children` are ItemSubRows.
export function ItemGroupRow({
  title,
  children,
}: ItemGroupRowProps): React.ReactNode {
  return (
    <li className="min-h-16 space-y-3 px-4 py-3 animate-in fade-in-0 duration-base">
      <p className={ITEM_PRIMARY_CLASS_NAME}>{title}</p>
      <ul className="divide-y divide-border">{children}</ul>
    </li>
  );
}

type ItemSubRowProps = {
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export function ItemSubRow({
  children,
  actions,
}: ItemSubRowProps): React.ReactNode {
  return (
    <li className={`py-3 first:pt-0 last:pb-0 ${ROW_LAYOUT_CLASS_NAME}`}>
      <div className={ROW_TEXT_CLASS_NAME}>{children}</div>
      {actions}
    </li>
  );
}

type RowActionsProps = {
  children: React.ReactNode;
};

// One or two buttons: one is full width and two are equal halves on phones, without counting children.
export function RowActions({ children }: RowActionsProps): React.ReactNode {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-2 sm:flex sm:shrink-0">
      {children}
    </div>
  );
}

type ItemListEmptyProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
};

export function ItemListEmpty({
  icon: Icon,
  title,
  description,
  action,
}: ItemListEmptyProps): React.ReactNode {
  return (
    <Empty className="rounded-lg bg-card ring-1 ring-foreground/10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription className="text-sm">{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

type TabLoadErrorProps = {
  title: string;
  description: string;
  // Keeps the current `?tab=`: build it with `tabSearch`.
  retryHref: string;
};

export function TabLoadError({
  title,
  description,
  retryHref,
}: TabLoadErrorProps): React.ReactNode {
  return (
    <Alert variant="destructive" className="has-data-[slot=alert-action]:pr-28">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      <AlertAction>
        <Button
          variant="outline"
          className="text-foreground"
          render={<Link href={retryHref} />}
          nativeButton={false}
        >
          Try again
        </Button>
      </AlertAction>
    </Alert>
  );
}
