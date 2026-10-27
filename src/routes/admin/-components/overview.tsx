import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import PageHeader from '@/components/common/page-header'
import { formatDate } from '@/lib/format'
import { formatMinor } from '#/lib/decimal'
import { RECURRING_INTERVAL_LABELS } from '#/lib/recurring'
import type { Overview } from '#/server/overview'

const day = (date: string) =>
  formatDate(`${date}T00:00:00`, { month: 'short', year: undefined })

function Stat({
  label,
  value,
  detail,
  to,
  tone,
}: {
  label: string
  value: string
  detail: string
  to: '/admin/invoices' | '/admin/quotes'
  tone?: 'danger'
}) {
  return (
    <Link to={to} className="block rounded-xl focus-visible:outline-2">
      <Card size="sm" className="h-full transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle
            className={`text-2xl tabular-nums ${tone === 'danger' ? 'text-destructive' : ''}`}
          >
            {value}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">{detail}</CardContent>
      </Card>
    </Link>
  )
}

function Panel({
  title,
  description,
  action,
  empty,
  children,
}: {
  title: string
  description: string
  action: ReactNode
  empty: string
  children: ReactNode[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction className="text-sm">{action}</CardAction>
      </CardHeader>
      <CardContent>
        {children.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">{children}</ul>
        )}
      </CardContent>
    </Card>
  )
}

const Row = ({ children, amount }: { children: ReactNode; amount: string }) => (
  <li className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
    <div className="flex min-w-0 flex-col">{children}</div>
    <span className="shrink-0 tabular-nums">{amount}</span>
  </li>
)

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

function MonthlyChart({ overview }: { overview: Overview }) {
  const max = Math.max(1, ...overview.months.map((m) => m.invoiced))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoiced by month</CardTitle>
        <CardDescription>
          Sent and paid invoices by issue date. The darker bar is the paid part.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-6 gap-3">
          {overview.months.map((m) => (
            <li key={m.month} className="flex flex-col items-center gap-2">
              <div
                className="flex h-36 w-full items-end"
                role="img"
                aria-label={`${formatDate(`${m.month}-01T00:00:00`, { day: undefined, month: 'long' })}: ${formatMinor(m.invoiced, overview.currency)} invoiced, ${formatMinor(m.paid, overview.currency)} paid`}
              >
                <div
                  className="relative w-full overflow-hidden rounded-t-md bg-primary/25"
                  style={{ height: `${(m.invoiced / max) * 100}%` }}
                >
                  <div
                    className="absolute inset-x-0 bottom-0 bg-primary"
                    style={{
                      height: `${m.invoiced ? (m.paid / m.invoiced) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDate(`${m.month}-01T00:00:00`, {
                  day: undefined,
                  year: undefined,
                  month: 'short',
                })}
              </span>
              <span className="text-xs tabular-nums">
                {formatMinor(m.invoiced, overview.currency)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function OverviewPage({
  overview,
  email,
}: {
  overview: Overview
  email: string
}) {
  const { currency } = overview
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={
          <>
            Signed in as <span data-testid="admin-email">{email}</span>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Outstanding"
          value={formatMinor(overview.outstanding.amount, currency)}
          detail={`${count(overview.outstanding.count, 'unpaid invoice')}`}
          to="/admin/invoices"
        />
        <Stat
          label="Overdue"
          value={formatMinor(overview.overdue.amount, currency)}
          detail={`${count(overview.overdue.count, 'invoice')} past due`}
          to="/admin/invoices"
          tone={overview.overdue.count > 0 ? 'danger' : undefined}
        />
        <Stat
          label="Drafts"
          value={formatMinor(overview.drafts.amount, currency)}
          detail={`${count(overview.drafts.count, 'draft invoice')} not sent`}
          to="/admin/invoices"
        />
        <Stat
          label="New quotes"
          value={formatMinor(overview.newQuotes.amount, currency)}
          detail={`${count(overview.newQuotes.count, 'request')} to review`}
          to="/admin/quotes"
        />
      </div>

      <MonthlyChart overview={overview} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Awaiting payment"
          description="Oldest due date first."
          action={
            <Link
              to="/admin/invoices"
              className="underline-offset-4 hover:underline"
            >
              All invoices
            </Link>
          }
          empty="No unpaid invoices."
        >
          {overview.unpaid.map((invoice) => (
            <Row key={invoice.id} amount={formatMinor(invoice.total, currency)}>
              <Link
                to="/admin/invoices/$invoiceId"
                params={{ invoiceId: invoice.id }}
                className="truncate font-medium underline-offset-4 hover:underline"
              >
                {invoice.number} · {invoice.clientName}
              </Link>
              <span className="flex items-center gap-2 text-muted-foreground">
                Due {day(invoice.dueDate)}
                {invoice.overdue && (
                  <Badge variant="destructive">Overdue</Badge>
                )}
              </span>
            </Row>
          ))}
        </Panel>

        <Panel
          title="New quote requests"
          description="Waiting for you to convert or dismiss."
          action={
            <Link
              to="/admin/quotes"
              className="underline-offset-4 hover:underline"
            >
              All quotes
            </Link>
          }
          empty="No new quote requests."
        >
          {overview.quotes.map((quote) => (
            <Row key={quote.id} amount={formatMinor(quote.total, currency)}>
              <Link
                to="/admin/quotes/$quoteId"
                params={{ quoteId: quote.id }}
                className="truncate font-medium underline-offset-4 hover:underline"
              >
                {quote.contactName}
              </Link>
              <span className="text-muted-foreground">
                Received {day(quote.createdAt.slice(0, 10))}
              </span>
            </Row>
          ))}
        </Panel>

        <Panel
          title="Upcoming recurring invoices"
          description="Active schedules, next run first."
          action={
            <Link
              to="/admin/recurring"
              className="underline-offset-4 hover:underline"
            >
              All schedules
            </Link>
          }
          empty="No active schedules."
        >
          {overview.schedules.map((schedule) => (
            <Row
              key={schedule.id}
              amount={formatMinor(schedule.total, currency)}
            >
              <Link
                to="/admin/recurring/$scheduleId"
                params={{ scheduleId: schedule.id }}
                className="truncate font-medium underline-offset-4 hover:underline"
              >
                {schedule.clientName}
              </Link>
              <span className="text-muted-foreground">
                {RECURRING_INTERVAL_LABELS[schedule.interval]}, next{' '}
                {day(schedule.nextRunDate)}
                {schedule.autoSend ? ', sent automatically' : ''}
              </span>
            </Row>
          ))}
        </Panel>
      </div>
    </div>
  )
}
