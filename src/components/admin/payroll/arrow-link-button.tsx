import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { Button } from "@/components/ui/button";

type ArrowLinkButtonProps = {
  href: string;
  children: React.ReactNode;
};

// "Fix on Time Sheets", "Add Pay rate": an outline button that leaves Payroll in the same tab.
export default function ArrowLinkButton({
  href,
  children,
}: ArrowLinkButtonProps): React.ReactNode {
  return (
    <Button
      variant="outline"
      className={OUTLINE_PRESS_CLASS_NAME}
      nativeButton={false}
      render={<Link href={href} />}
    >
      {children}
      <ArrowRight data-icon="inline-end" aria-hidden="true" />
    </Button>
  );
}
