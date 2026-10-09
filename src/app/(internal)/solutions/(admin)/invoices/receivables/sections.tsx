import Link from 'next/link'
import { CalendarCheck, CircleCheck, Clock, Mail, Phone, Wallet } from 'lucide-react'

import UnbilledVisitList from '@/components/invoices/unbilled-visit-list'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import StatusBadge from '@/components/ui/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { InvoiceListRow, UnbilledVisitRow } from '@/lib/invoices/queries'
import {
  contactLinks,
  daysOverdue,
  formatDateOnly,
  invoiceLabel,
  unbilledSummary,
  type ClientBalance,
  type UnbilledGroup,
} from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'

const CLIENTS_PATH = '/solutions/clients'
const INVOICES_PATH = '/solutions/invoices'
const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function oldestDueLabel(balance: ClientBalance): string {
  return balance.oldestDue ? `Oldest due ${formatDateOnly(balance.oldestDue)}` : 'No due date'
}

type SectionProps = {
  id: string
  title: string
  description: string
  children: React.ReactNode
}

function Section({ id, title, description, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-20 space-y-3">
      <div className="space-y-1">
        <h2 id={`${id}-heading`} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

type EmptyBlockProps = { icon: React.ReactNode; title: string; description: string }

function EmptyBlock({ icon, title, description }: EmptyBlockProps) {
  return (
    <Card className="border border-dashed py-0 shadow-none">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">{icon}</EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Card>
  )
}

export function ByClientSection({ balances }: { balances: ClientBalance[] }) {
  return (
    <Section id="by-client" title="By client" description="Unpaid invoices per client, overdue first.">
      {balances.length === 0 ? (
        <EmptyBlock
          icon={<Wallet aria-hidden="true" />}
          title="Nobody owes anything"
          description="Issued invoices that aren't paid show up here."
        />
      ) : (
        <>
          <Card className="gap-0 py-0 md:hidden">
            <ul className="divide-y divide-border">
              {balances.map((balance) => (
                <li key={balance.clientId}>
                  <Link
                    href={`${CLIENTS_PATH}/${balance.clientId}`}
                    className={`flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-fast active:bg-muted focus-visible:ring-inset ${FOCUS_RING}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold break-words">{balance.name}</p>
                      <p className="text-sm text-muted-foreground">{oldestDueLabel(balance)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <p className="text-sm font-semibold tabular-nums">{formatCents(balance.owedCents)}</p>
                      {balance.overdueCents > 0 ? (
                        <StatusBadge tone="warning">{formatCents(balance.overdueCents)} overdue</StatusBadge>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <div className="hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Owed</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead>Oldest due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((balance) => (
                  <TableRow key={balance.clientId}>
                    <TableCell className="whitespace-normal">
                      <Link
                        href={`${CLIENTS_PATH}/${balance.clientId}`}
                        className={`cursor-pointer rounded-sm text-sm font-medium underline-offset-4 transition-colors duration-fast hover:underline ${FOCUS_RING}`}
                      >
                        {balance.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(balance.owedCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {balance.overdueCents > 0 ? (
                        <StatusBadge tone="warning">{formatCents(balance.overdueCents)}</StatusBadge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{balance.oldestDue ? formatDateOnly(balance.oldestDue) : 'No due date'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Section>
  )
}

function ContactButtons({ client }: { client: { name: string; phone: string | null; email: string | null } | null }) {
  const { phone, phoneHref, emailHref } = contactLinks(client)
  const name = client?.name ?? 'client'

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {phone && phoneHref ? (
        <Button
          variant="outline"
          className="max-w-full cursor-pointer active:scale-[0.98] active:bg-muted"
          nativeButton={false}
          render={<a href={phoneHref} aria-label={`Call ${name} at ${phone}`} />}
        >
          <Phone aria-hidden="true" data-icon="inline-start" />
          {phone}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">No phone on file</p>
      )}
      {emailHref ? (
        <Button
          variant="outline"
          className="cursor-pointer active:scale-[0.98] active:bg-muted"
          nativeButton={false}
          render={<a href={emailHref} aria-label={`Email ${name}`} />}
        >
          <Mail aria-hidden="true" data-icon="inline-start" />
          Email
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">No email on file</p>
      )}
    </div>
  )
}

type OverdueSectionProps = { invoices: InvoiceListRow[]; businessDate: string }

export function OverdueSection({ invoices, businessDate }: OverdueSectionProps) {
  return (
    <Section
      id="overdue"
      title="Overdue follow-up"
      description="Oldest first. Follow up by phone or email; nothing is recorded here."
    >
      {invoices.length === 0 ? (
        <EmptyBlock
          icon={<CircleCheck aria-hidden="true" />}
          title="Nothing overdue"
          description="Invoices past their due date show up here, oldest first."
        />
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y divide-border">
            {invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-col gap-3 px-4 py-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center lg:gap-4"
              >
                <div className="flex items-start justify-between gap-3 lg:block">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-words">{invoice.clients?.name ?? 'Unknown client'}</p>
                    <Link
                      href={`${INVOICES_PATH}/${invoice.id}`}
                      className={`cursor-pointer rounded-sm text-sm text-muted-foreground underline-offset-4 transition-colors duration-fast hover:underline ${FOCUS_RING}`}
                    >
                      {invoiceLabel(invoice)}
                    </Link>
                  </div>
                  <p className="shrink-0 text-base font-semibold tabular-nums lg:hidden">
                    {formatCents(invoice.total_cents)}
                  </p>
                </div>
                <div>
                  <StatusBadge tone="warning" icon={Clock}>
                    {pluralize(daysOverdue(invoice, businessDate), 'day')} overdue
                  </StatusBadge>
                </div>
                <p className="hidden text-right text-base font-semibold tabular-nums lg:block">
                  {formatCents(invoice.total_cents)}
                </p>
                <ContactButtons client={invoice.clients} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Section>
  )
}

type UnbilledSectionProps = {
  groups: Array<UnbilledGroup<UnbilledVisitRow>>
  shownCount: number
  totalCount: number
}

export function UnbilledSection({ groups, shownCount, totalCount }: UnbilledSectionProps) {
  const isTruncated = totalCount > shownCount

  return (
    <Section
      id="unbilled"
      title="Unbilled visits"
      description="Completed visits on no invoice. Bill opens a new invoice for that client."
    >
      {isTruncated ? (
        <p className="text-sm text-muted-foreground">
          Showing the first {shownCount} of {totalCount} unbilled visits, oldest first.
        </p>
      ) : null}
      {groups.length === 0 ? (
        <EmptyBlock
          icon={<CalendarCheck aria-hidden="true" />}
          title="Every visit is billed"
          description="Completed visits that aren't on an invoice show up here."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          {groups.map((group) => {
            const summary = unbilledSummary(group.visits)
            return (
              <Card key={group.clientId} className="gap-0 py-0">
                <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`${CLIENTS_PATH}/${group.clientId}`}
                      className={`cursor-pointer rounded-sm text-sm font-semibold break-words underline-offset-4 hover:underline ${FOCUS_RING}`}
                    >
                      {group.clientName}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {pluralize(summary.count, 'visit')} · {formatCents(summary.pricedCents)}
                      {summary.unpricedCount > 0 ? ` · ${summary.unpricedCount} unpriced` : ''}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="shrink-0 cursor-pointer active:scale-[0.98] active:bg-muted"
                    nativeButton={false}
                    render={
                      <Link href={`${INVOICES_PATH}/new?client=${group.clientId}`} aria-label={`Bill ${group.clientName}`} />
                    }
                  >
                    Bill
                  </Button>
                </div>
                <UnbilledVisitList visits={group.visits} />
              </Card>
            )
          })}
        </div>
      )}
    </Section>
  )
}
