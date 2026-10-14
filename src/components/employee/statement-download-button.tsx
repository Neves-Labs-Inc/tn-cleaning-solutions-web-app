'use client'

import { Download } from 'lucide-react'

import { OUTLINE_PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import { buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useFileDownload, type FileDownloadMessages } from '@/hooks/use-file-download'
import { cn } from '@/lib/utils'

type StatementDownloadButtonProps = {
  href: string
}

export const STATEMENT_DOWNLOAD_MESSAGES: FileDownloadMessages = {
  notFound: "This statement isn't available.",
  failed: "Couldn't download your statement. Try again.",
}

// Downloads a paid run's Pay statement PDF. A plain link, so it still downloads without JS; with JS
// the shared hook fetches it, so a 404 becomes a toast instead of an error page.
export function StatementDownloadButton({ href }: StatementDownloadButtonProps): React.ReactNode {
  const { download, pendingHref } = useFileDownload()
  const isPending = pendingHref === href

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault()
    if (isPending) return
    void download(href, { messages: STATEMENT_DOWNLOAD_MESSAGES })
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-busy={isPending}
      aria-disabled={isPending}
      className={cn(
        buttonVariants({ variant: 'outline' }),
        OUTLINE_PRESS_CLASS_NAME,
        'w-full sm:w-auto sm:min-w-[12rem]',
        isPending && 'pointer-events-none',
      )}
    >
      {isPending ? <Spinner className="size-4" data-icon="inline-start" role={undefined} aria-label={undefined} aria-hidden /> : <Download data-icon="inline-start" aria-hidden />}
      {isPending ? 'Preparing…' : 'Download statement'}
    </a>
  )
}
