import Link from 'next/link'
import { AlertTriangle, ArrowRight, CalendarCheck2 } from 'lucide-react'

import { PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import LinkPendingIcon from '@/components/ui/link-pending-icon'
import type { BannerLine } from '@/lib/payroll/period-summary'
import { cn } from '@/lib/utils'

const WARNING_CLASS_NAME = 'border-status-warning-border bg-status-warning text-status-warning-foreground'
const INFO_CLASS_NAME = 'border-status-info-border bg-status-info text-status-info-foreground'

// One line per Pay period ready to review; warning tone when some drafts are blocked.
export default function PayrollBanner({ lines }: { lines: BannerLine[] }) {
    return (
        <section aria-label="Payroll" className="space-y-2 animate-in fade-in-0 duration-slow">
            {lines.map((line) => {
                const isBlocked = line.blockedCount > 0
                const Icon = isBlocked ? AlertTriangle : CalendarCheck2
                return (
                    <Alert
                        key={line.href}
                        role="status"
                        className={cn(
                            'flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center',
                            isBlocked ? WARNING_CLASS_NAME : INFO_CLASS_NAME,
                        )}
                    >
                        <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
                            <Icon className="size-5 shrink-0" aria-hidden="true" />
                            <AlertTitle className="font-medium break-words text-pretty">{line.text}</AlertTitle>
                        </div>
                        <Link
                            href={line.href}
                            className={cn(buttonVariants(), PRESS_CLASS_NAME, 'w-full sm:w-auto sm:shrink-0')}
                        >
                            Review
                            <span className="sr-only"> Pay period {line.label}</span>
                            <LinkPendingIcon icon={<ArrowRight aria-hidden="true" data-icon="inline-end" />} />
                        </Link>
                    </Alert>
                )
            })}
        </section>
    )
}
