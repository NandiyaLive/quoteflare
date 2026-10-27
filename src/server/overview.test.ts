import { describe, expect, it } from 'vitest'
import type { InvoiceListRow } from './invoices'
import { buildOverview } from './overview'
import type { QuoteRow } from './quotes'
import type { RecurringRow } from './recurring'

const invoice = (over: Partial<InvoiceListRow>): InvoiceListRow => ({
  id: over.number ?? 'i',
  number: 'INV-1',
  clientId: 'c',
  clientName: 'Acme',
  clientCompany: '',
  status: 'sent',
  issueDate: '2026-10-01',
  dueDate: '2026-10-15',
  currency: 'LKR',
  subtotal: 0,
  discountAmount: 0,
  taxAmount: 0,
  total: 1000,
  ...over,
})

const quote = (over: Partial<QuoteRow>): QuoteRow =>
  ({
    id: 'q',
    contactName: 'Sam',
    contactEmail: 's@x.com',
    message: '',
    selection: [],
    breakdown: null,
    currency: 'LKR',
    total: 500,
    status: 'new',
    createdAt: '2026-10-20T10:00:00.000Z',
    ...over,
  }) as QuoteRow

const base = { quotes: [], schedules: [], currency: 'LKR', today: '2026-10-27' }

describe('buildOverview', () => {
  it('counts a sent invoice past its due date as overdue', () => {
    const overview = buildOverview({
      ...base,
      invoices: [
        invoice({ number: 'A', status: 'sent', dueDate: '2026-10-20' }),
        invoice({ number: 'B', status: 'sent', dueDate: '2026-11-05' }),
        invoice({ number: 'C', status: 'overdue', dueDate: '2026-09-01' }),
        invoice({ number: 'D', status: 'paid' }),
      ],
    })
    expect(overview.outstanding).toEqual({ amount: 3000, count: 3 })
    expect(overview.overdue).toEqual({ amount: 2000, count: 2 })
    expect(overview.unpaid.map((i) => i.number)).toEqual(['C', 'A', 'B'])
  })

  it('ignores records in another currency', () => {
    const overview = buildOverview({
      ...base,
      invoices: [invoice({ currency: 'USD' })],
      quotes: [quote({ currency: 'USD' })],
    })
    expect(overview.outstanding.count).toBe(0)
    expect(overview.newQuotes.count).toBe(0)
  })

  it('builds six months ending at the current one, across a year boundary', () => {
    const overview = buildOverview({
      ...base,
      today: '2026-02-10',
      invoices: [
        invoice({ number: 'A', status: 'paid', issueDate: '2025-12-30' }),
        invoice({ number: 'B', status: 'sent', issueDate: '2025-12-31' }),
        invoice({ number: 'C', status: 'void', issueDate: '2026-02-01' }),
        invoice({ number: 'D', status: 'draft', issueDate: '2026-02-01' }),
      ],
    })
    expect(overview.months.map((m) => m.month)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
    expect(overview.months[3]).toMatchObject({ invoiced: 2000, paid: 1000 })
    expect(overview.months[5]).toMatchObject({ invoiced: 0, paid: 0 })
  })

  it('lists only new quotes and active schedules', () => {
    const schedule = (over: Partial<RecurringRow>): RecurringRow => ({
      id: 's',
      clientId: 'c',
      clientName: 'Acme',
      clientCompany: '',
      interval: 'monthly',
      nextRunDate: '2026-11-01',
      autoSend: false,
      active: true,
      items: [],
      total: 100,
      currency: 'LKR',
      ...over,
    })
    const overview = buildOverview({
      ...base,
      invoices: [],
      quotes: [quote({ id: 'a' }), quote({ id: 'b', status: 'dismissed' })],
      schedules: [schedule({ id: 'x' }), schedule({ id: 'y', active: false })],
    })
    expect(overview.quotes.map((q) => q.id)).toEqual(['a'])
    expect(overview.schedules.map((s) => s.id)).toEqual(['x'])
  })
})
