import { Button, Section, Text } from '@react-email/components'
import { EmailLayout } from './email-layout'

export type QuoteEmailLine = {
  description: string
  quantity: number
  amount: string
}

export type QuoteEmailProps = {
  businessName: string
  heading: string
  /** Blank lines split paragraphs. */
  intro: string
  lines: QuoteEmailLine[]
  total: string
  buttonLabel?: string
  url?: string
  preview: string
}

export function QuoteEmail({
  businessName,
  heading,
  intro,
  lines,
  total,
  buttonLabel,
  url,
  preview,
}: QuoteEmailProps) {
  const paragraphs = intro.split(/\n{2,}/).filter((p) => p.trim())
  return (
    <EmailLayout
      businessName={businessName}
      heading={heading}
      preview={preview}
    >
      {paragraphs.map((paragraph, i) => (
        <Text
          key={i}
          className="text-ink-2 m-0 mb-4 text-[15px] leading-6 whitespace-pre-line"
        >
          {paragraph}
        </Text>
      ))}
      {lines.map((line, i) => (
        <Text
          key={i}
          className="text-ink-2 m-0 mb-1 text-[15px] leading-6 whitespace-pre-line"
        >
          {line.description} x {line.quantity}: {line.amount}
        </Text>
      ))}
      <Text className="text-ink m-0 mt-3 text-[15px] leading-6 font-bold">
        Total: {total}
      </Text>
      {url && buttonLabel && (
        <Section className="mt-6">
          <Button
            href={url}
            className="bg-ink inline-block rounded-md px-5 py-3 text-[15px] text-white no-underline"
          >
            {buttonLabel}
          </Button>
        </Section>
      )}
      {url && buttonLabel && (
        <Text className="text-ink-2 m-0 mt-4 text-[13px] leading-5">
          This link is private to you. Anyone you forward it to can view and
          respond to this quote.
        </Text>
      )}
    </EmailLayout>
  )
}

QuoteEmail.PreviewProps = {
  businessName: 'Your business',
  heading: 'Quote QUO-0001',
  intro: 'Thanks for your request. We will reply within two business days.',
  lines: [{ description: 'Logo design', quantity: 1, amount: 'USD 500.00' }],
  total: 'USD 550.00',
  preview: 'We received your quote request',
} satisfies QuoteEmailProps
