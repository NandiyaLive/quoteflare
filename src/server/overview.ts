import { DEFAULT_CURRENCY } from '#/lib/settings'
import type { Db } from '#/db'
import { invoiceStatuses, type InvoiceStatus } from '#/db/schema'
import { listInvoices, type InvoiceListRow } from './invoices'
import { listQuotes, type QuoteRow } from './quotes'
import { listSchedules, type RecurringRow } from './recurring'

const CHART_MONTHS = 6
const LIST_SIZE = 5

type OverviewInvoice = {
  id: string
  number: string
  clientName: string
  total: number
  dueDate: string
  overdue: boolean
}

type OverviewQuote = {
  id: string
  contactName: string
  total: number
  createdAt: string
}

type OverviewSchedule = {
  id: string
  clientName: string
  interval: RecurringRow['interval']
  nextRunDate: string
  total: number
  autoSend: boolean
}

type OverviewStatus = {
  status: InvoiceStatus
  count: number
  amount: number
}

export type Overview = {
  currency: string
  outstanding: { amount: number; count: number }
  overdue: { amount: number; count: number }
  drafts: { amount: number; count: number }
  newQuotes: { amount: number; count: number }
  months: { month: string; invoiced: number; paid: number }[]
  statuses: OverviewStatus[]
  unpaid: OverviewInvoice[]
  quotes: OverviewQuote[]
  schedules: OverviewSchedule[]
}

const sum = (rows: { total: number }[]) =>
  rows.reduce((acc, row) => acc + row.total, 0)

const tally = (rows: { total: number }[]) => ({
  amount: sum(rows),
  count: rows.length,
})

function lastMonths(today: string, count: number) {
  const [year, month] = today.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1))
    return date.toISOString().slice(0, 7)
  })
}

/**
 * Amounts only include records in the business currency, so totals in
 * different currencies are never added together. Invoices have no paid date,
 * so the chart buckets paid invoices by issue month.
 */
export function buildOverview(input: {
  invoices: InvoiceListRow[]
  quotes: QuoteRow[]
  schedules: RecurringRow[]
  currency: string
  today: string
}): Overview {
  const { currency, today } = input
  const invoices = input.invoices.filter((i) => i.currency === currency)
  const isOverdue = (i: InvoiceListRow) =>
    i.status === 'overdue' || (i.status === 'sent' && i.dueDate < today)

  const unpaid = invoices.filter(
    (i) => i.status === 'sent' || i.status === 'overdue',
  )
  const newQuotes = input.quotes.filter(
    (q) =>
      q.status === 'new' &&
      q.source === 'calculator' &&
      q.currency === currency,
  )

  const months = lastMonths(today, CHART_MONTHS).map((month) => {
    const issued = invoices.filter(
      (i) => i.issueDate.startsWith(month) && i.status !== 'draft',
    )
    return {
      month,
      invoiced: sum(issued.filter((i) => i.status !== 'void')),
      paid: sum(issued.filter((i) => i.status === 'paid')),
    }
  })

  const statuses = invoiceStatuses
    .map((status) => ({
      status,
      ...tally(invoices.filter((i) => i.status === status)),
    }))
    .filter((s) => s.count > 0)

  return {
    currency,
    outstanding: tally(unpaid),
    overdue: tally(unpaid.filter(isOverdue)),
    drafts: tally(invoices.filter((i) => i.status === 'draft')),
    newQuotes: tally(newQuotes),
    months,
    statuses,
    unpaid: [...unpaid]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, LIST_SIZE)
      .map((i) => ({
        id: i.id,
        number: i.number,
        clientName: i.clientName,
        total: i.total,
        dueDate: i.dueDate,
        overdue: isOverdue(i),
      })),
    quotes: newQuotes.slice(0, LIST_SIZE).map((q) => ({
      id: q.id,
      contactName: q.contactName,
      total: q.total,
      createdAt: q.createdAt,
    })),
    schedules: input.schedules
      .filter((s) => s.active && s.currency === currency)
      .slice(0, LIST_SIZE)
      .map((s) => ({
        id: s.id,
        clientName: s.clientName,
        interval: s.interval,
        nextRunDate: s.nextRunDate,
        total: s.total,
        autoSend: s.autoSend,
      })),
  }
}

export async function loadOverview(db: Db, today: string): Promise<Overview> {
  const [invoices, quotes, schedules, settings] = await Promise.all([
    listInvoices(db),
    listQuotes(db, 'all'),
    listSchedules(db),
    db.query.settings.findFirst(),
  ])
  return buildOverview({
    invoices,
    quotes,
    schedules,
    currency: settings?.currency ?? DEFAULT_CURRENCY,
    today,
  })
}
