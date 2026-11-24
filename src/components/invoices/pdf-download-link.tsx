import { FileDown } from 'lucide-react'

import { OUTLINE_PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PdfDownloadLinkProps = {
  href: string
  // Always the accessible name, whether or not the text shows.
  label: string
  // 'header' is an outline button that shows its text from sm up; 'row' is a ghost icon button.
  variant: 'header' | 'row'
}

// A plain link to the PDF route, so the browser does the download. The icon stays 44px at every
// width (DESIGN.md §8 would shrink it at md; the touch target wins here).
export default function PdfDownloadLink({ href, label, variant }: PdfDownloadLinkProps) {
  const isHeader = variant === 'header'

  return (
    <Button
      variant={isHeader ? 'outline' : 'ghost'}
      size="icon"
      nativeButton={false}
      render={<a href={href} download />}
      aria-label={label}
      className={cn(
        OUTLINE_PRESS_CLASS_NAME,
        'size-11 animate-in fade-in-0 duration-base ease-out-quart',
        isHeader && 'sm:w-auto sm:gap-1.5 sm:px-4',
        !isHeader && 'md:hover:bg-muted'
      )}
    >
      <FileDown aria-hidden="true" />
      {isHeader ? <span className="hidden sm:inline">Download PDF</span> : null}
    </Button>
  )
}
