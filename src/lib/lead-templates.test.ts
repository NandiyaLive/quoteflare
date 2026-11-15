import { describe, expect, it } from 'vitest'
import { fillLeadTemplate, leadTemplateSchema } from './lead-templates'

describe('fillLeadTemplate', () => {
  it('fills the name and handle', () => {
    expect(
      fillLeadTemplate('Hi {{name}} ({{ handle }})', {
        name: 'Sam',
        handle: 'studio_x',
      }),
    ).toBe('Hi Sam (studio_x)')
  })

  it('uses the handle when the lead has no name', () => {
    expect(
      fillLeadTemplate('Hi {{name}}', { name: '  ', handle: 'studio_x' }),
    ).toBe('Hi studio_x')
  })

  it('returns an empty string for an empty template', () => {
    expect(fillLeadTemplate('  ', { name: 'Sam', handle: 'a' })).toBe('')
  })

  it('leaves unknown placeholders as written', () => {
    expect(fillLeadTemplate('Hi {{city}}', { name: '', handle: 'a' })).toBe(
      'Hi {{city}}',
    )
  })
})

describe('leadTemplateSchema', () => {
  it('accepts empty text and the two variables', () => {
    expect(leadTemplateSchema.safeParse('').success).toBe(true)
    expect(leadTemplateSchema.safeParse('Hi {{name}} {{handle}}').success).toBe(
      true,
    )
  })

  it('rejects unknown variables and long text', () => {
    expect(leadTemplateSchema.safeParse('Hi {{total}}').success).toBe(false)
    expect(leadTemplateSchema.safeParse('x'.repeat(1001)).success).toBe(false)
  })
})
