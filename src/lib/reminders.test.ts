import { describe, expect, it } from 'vitest'
import { reminderFor } from './reminders'

const today = '2026-06-15'

describe('reminderFor', () => {
  it.each([
    ['sent', '2026-06-18', 'due_soon'],
    ['sent', '2026-06-16', 'due_soon'],
    ['sent', '2026-06-15', 'due_soon'],
    ['sent', '2026-06-19', null],
    ['overdue', '2026-06-12', 'overdue_3'],
    ['overdue', '2026-06-06', 'overdue_3'],
    ['overdue', '2026-06-05', 'overdue_10'],
    ['overdue', '2026-01-01', 'overdue_10'],
    ['overdue', '2026-06-13', null],
    ['overdue', '2026-06-14', null],
  ] as const)('%s due %s gets %s', (status, dueDate, expected) => {
    expect(reminderFor(status, dueDate, today)).toBe(expected)
  })

  it.each(['draft', 'paid', 'void'] as const)(
    'never reminds a %s invoice',
    (status) => {
      expect(reminderFor(status, '2026-06-16', today)).toBeNull()
      expect(reminderFor(status, '2026-06-01', today)).toBeNull()
    },
  )
})
