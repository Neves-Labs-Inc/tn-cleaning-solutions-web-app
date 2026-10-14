"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  type LucideIcon,
} from "lucide-react";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFileDownload } from "@/hooks/use-file-download";
import { cn } from "@/lib/utils";

type ExportItem = { label: string; href: string; icon: LucideIcon };

type DownloadExportMenuProps = {
  periodStart: string;
  // The period has a finalized or paid run.
  canExport: boolean;
};

const DISABLED_REASON = "Finalize a run to export";

// Every item uses this class (ticket 12 adds "Summary (PDF)"): 44px on phones via the control
// height.
const ITEM_CLASS_NAME =
  "min-h-(--control-height) cursor-pointer gap-2 px-3 text-sm transition-colors duration-fast active:bg-muted [&_svg]:size-4";

// Overrides the primitive's 100ms: enter 200ms ease-out, exit 140ms ease-in.
const MENU_MOTION_CLASS_NAME =
  "data-open:duration-base data-open:ease-out-quart data-closed:duration-[140ms] data-closed:ease-in-quart";

function getExportItems(periodStart: string): ExportItem[] {
  const base = `/solutions/payroll/${encodeURIComponent(periodStart)}`;
  return [
    {
      label: "Spreadsheet (.xlsx)",
      href: `${base}/export.xlsx`,
      icon: FileSpreadsheet,
    },
  ];
}

export default function DownloadExportMenu({
  periodStart,
  canExport,
}: DownloadExportMenuProps): React.ReactNode {
  const router = useRouter();
  const captionId = useId();
  const { download, pendingHref } = useFileDownload();
  const isPending = pendingHref !== null;
  const isDisabled = !canExport || isPending;
  const items = getExportItems(periodStart);

  function handleSelect(href: string): void {
    void download(href, { onNotFound: () => router.refresh() });
  }

  const trigger = (
    <DropdownMenuTrigger
      disabled={isDisabled}
      aria-busy={isPending || undefined}
      aria-describedby={canExport ? undefined : captionId}
      render={
        <Button
          variant="outline"
          className={cn(
            "w-full cursor-pointer sm:w-auto sm:min-w-44",
            OUTLINE_PRESS_CLASS_NAME,
          )}
        />
      }
    >
      {isPending ? (
        <Spinner data-icon="inline-start" aria-hidden="true" />
      ) : (
        <Download data-icon="inline-start" aria-hidden="true" />
      )}
      {isPending ? "Preparing…" : "Download export"}
      <ChevronDown
        data-icon="inline-end"
        aria-hidden="true"
        className="ml-auto transition-transform duration-fast ease-out-quart group-aria-expanded/button:rotate-180"
      />
    </DropdownMenuTrigger>
  );

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
      <DropdownMenu>
        {canExport ? (
          trigger
        ) : (
          // A disabled button gets no pointer events, so the wrapper carries the tooltip.
          <Tooltip>
            <TooltipTrigger
              render={
                <span tabIndex={0} className="inline-flex w-full sm:w-auto" />
              }
            >
              {trigger}
            </TooltipTrigger>
            <TooltipContent className="max-md:hidden">
              {DISABLED_REASON}
            </TooltipContent>
          </Tooltip>
        )}
        <DropdownMenuContent
          align="end"
          className={cn("min-w-56", MENU_MOTION_CLASS_NAME)}
        >
          {items.map((item) => (
            <DropdownMenuItem
              key={item.href}
              className={ITEM_CLASS_NAME}
              onClick={() => handleSelect(item.href)}
            >
              <item.icon aria-hidden="true" />
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {canExport ? null : (
        <p id={captionId} className="text-xs text-muted-foreground md:hidden">
          {DISABLED_REASON}
        </p>
      )}
    </div>
  );
}
