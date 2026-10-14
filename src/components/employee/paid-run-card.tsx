'use client'

import { ChevronDown } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { formatCents } from '@/lib/pricing/money'
import type { MyPaidRun } from '@/lib/payroll/my-pay'

import { PaidRunLines } from './paid-run-lines'

type PaidRunCardProps = {
  run: MyPaidRun
  defaultOpen?: boolean
}

// One paid Pay run on My pay: period, paid line and total; tap to see its lines and Adjustments.
export function PaidRunCard({ run, defaultOpen = false }: PaidRunCardProps): React.ReactNode {
  return (
    <Card className="gap-0 overflow-hidden rounded-xl p-0 py-0">
      <Collapsible defaultOpen={defaultOpen}>
        <CollapsibleTrigger className="group grid min-h-16 w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 px-4 py-3 text-left outline-none transition-[background-color] duration-fast focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-muted md:hover:bg-muted">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-base font-semibold text-foreground">{run.periodLabel}</span>
              {run.isOffCycle ? <Badge variant="outline">Off-cycle</Badge> : null}
            </span>
            <span className="block text-sm wrap-break-word text-muted-foreground">{run.paidLabel}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="text-lg font-semibold text-foreground tabular-nums">{formatCents(run.totalCents)}</span>
            <ChevronDown
              aria-hidden="true"
              className="size-5 text-muted-foreground transition-transform duration-fast ease-out-quart group-data-panel-open:rotate-180"
            />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border bg-muted/40 p-4 transition-opacity duration-base ease-out-quart data-ending-style:opacity-0 data-ending-style:duration-fast data-ending-style:ease-in-quart data-starting-style:opacity-0">
          <PaidRunLines run={run} />
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
