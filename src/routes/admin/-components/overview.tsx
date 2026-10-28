import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import PageHeader from '@/components/common/page-header'
import { formatDate } from '@/lib/format'
import { formatMinor } from '#/lib/decimal'
import { invoiceStatuses, type InvoiceStatus } from '#/db/schema'
import { INVOICE_STATUS_LABELS } from '#/lib/invoices'
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

const monthLabel = (month: string) =>
  formatDate(`${month}-01T00:00:00`, {
    day: undefined,
    year: undefined,
    month: 'short',
  })

const compact = (minor: number) =>
  new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(minor / 100)

function MonthlyChart({ overview }: { overview: Overview }) {
  const config = {
    paid: { label: 'Paid', color: 'var(--chart-3)' },
    unpaid: { label: 'Unpaid', color: 'var(--chart-1)' },
  } satisfies ChartConfig
  const data = overview.months.map((m) => ({
    month: m.month,
    paid: m.paid,
    unpaid: m.invoiced - m.paid,
  }))
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Invoiced by month</CardTitle>
        <CardDescription>
          Sent and paid invoices by issue date, split into paid and unpaid.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-52 w-full">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickFormatter={monthLabel}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={compact}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, items) =>
                    monthLabel(String(items[0]?.payload.month))
                  }
                  formatter={(value, name) => (
                    <div className="flex flex-1 justify-between gap-4">
                      <span className="text-muted-foreground">
                        {config[name as keyof typeof config]?.label}
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatMinor(Number(value), overview.currency)}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="paid" stackId="a" fill="var(--color-paid)" />
            <Bar
              dataKey="unpaid"
              stackId="a"
              fill="var(--color-unpaid)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  paid: 'var(--chart-3)',
  sent: 'var(--chart-2)',
  overdue: 'var(--destructive)',
  draft: 'var(--chart-1)',
  void: 'var(--chart-4)',
}

function StatusChart({ overview }: { overview: Overview }) {
  const config = Object.fromEntries(
    invoiceStatuses.map((status) => [
      status,
      { label: INVOICE_STATUS_LABELS[status], color: STATUS_COLORS[status] },
    ]),
  ) satisfies ChartConfig
  const data = overview.statuses.map((s) => ({
    ...s,
    fill: `var(--color-${s.status})`,
  }))
  const total = data.reduce((acc, s) => acc + s.count, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoices by status</CardTitle>
        <CardDescription>Number of invoices in each status.</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            No invoices yet.
          </p>
        ) : (
          <>
            <ChartContainer
              config={config}
              className="mx-auto aspect-square h-48"
            >
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name, item) => (
                        <div className="flex flex-1 justify-between gap-4">
                          <span className="text-muted-foreground">
                            {config[name as keyof typeof config]?.label}
                          </span>
                          <span className="font-mono tabular-nums">
                            {value} ·{' '}
                            {formatMinor(
                              item.payload.amount,
                              overview.currency,
                            )}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="status"
                  innerRadius="58%"
                  outerRadius="100%"
                  strokeWidth={2}
                >
                  <Label
                    content={({ viewBox }) =>
                      viewBox && 'cx' in viewBox ? (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) - 6}
                            className="fill-foreground text-2xl font-semibold"
                          >
                            {total}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) + 14}
                            className="fill-muted-foreground text-xs"
                          >
                            invoices
                          </tspan>
                        </text>
                      ) : null
                    }
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
            <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
              {data.map((d) => (
                <li key={d.status} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-xs"
                    style={{ background: STATUS_COLORS[d.status] }}
                  />
                  {INVOICE_STATUS_LABELS[d.status]}
                </li>
              ))}
            </ul>
          </>
        )}
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

      <div className="grid gap-4 lg:grid-cols-3">
        <MonthlyChart overview={overview} />
        <StatusChart overview={overview} />
      </div>

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
