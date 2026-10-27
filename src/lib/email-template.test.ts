import { describe, expect, it } from 'vitest'
import {
  fillTemplate,
  invoiceEmailTemplateSchema,
  SAMPLE_VARIABLES,
} from './email-template'

describe('fillTemplate', () => {
  it('fills known placeholders and leaves unknown ones', () => {
    expect(
      fillTemplate('{{number}} / {{ total }} / {{nope}}', SAMPLE_VARIABLES),
    ).toBe('INV-0001 / USD 1,100.00 / {{nope}}')
  })
})

describe('invoiceEmailTemplateSchema', () => {
  it('accepts empty fields as "use the default"', () => {
    expect(
      invoiceEmailTemplateSchema.safeParse({
        subject: '',
        body: '',
        button: '',
      }).success,
    ).toBe(true)
  })

  it('rejects unknown placeholders', () => {
    const result = invoiceEmailTemplateSchema.safeParse({
      subject: 'Hi {{name}}',
      body: '',
      button: '',
    })
    expect(result.success).toBe(false)
  })
})
