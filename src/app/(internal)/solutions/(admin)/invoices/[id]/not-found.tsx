import Link from 'next/link'
import { FileX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

export default function InvoiceNotFound() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileX aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>This invoice doesn&apos;t exist</EmptyTitle>
        <EmptyDescription>It may have been a draft that was emptied and deleted.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          className="active:scale-[0.98]"
          nativeButton={false}
          render={<Link href="/solutions/invoices" />}
        >
          Back to invoices
        </Button>
      </EmptyContent>
    </Empty>
  )
}
