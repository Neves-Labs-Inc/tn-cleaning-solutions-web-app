import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";

type DetailHeaderProps = {
  backHref: string;
  backLabel: string;
  title: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
};

// The header of an admin detail page: back link, title with its actions, then the badge row.
export default function DetailHeader({
  backHref,
  backLabel,
  title,
  badges,
  actions,
}: DetailHeaderProps): React.ReactNode {
  return (
    <div className="min-w-0 space-y-3">
      <Button
        variant="ghost"
        className={`-ml-3 w-fit ${OUTLINE_PRESS_CLASS_NAME}`}
        render={<Link href={backHref} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" data-icon="inline-start" />
        {backLabel}
      </Button>
      <PageHeader
        title={title}
        action={
          actions ? (
            // Grid cells stretch the buttons, so one is full width and two are equal halves on phones.
            <div className="grid w-full auto-cols-fr grid-flow-col gap-2 sm:flex sm:w-auto">
              {actions}
            </div>
          ) : null
        }
      />
      {badges ? (
        <div className="flex flex-wrap items-center gap-2">{badges}</div>
      ) : null}
    </div>
  );
}
