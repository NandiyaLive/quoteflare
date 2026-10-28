import { Button, Section, Text } from '@react-email/components'
import { EmailLayout } from './email-layout'

export type InvoiceEmailProps = {
  businessName: string
  heading: string
  /** Message text with placeholders already filled. Blank lines split paragraphs. */
  body: string
  buttonLabel: string
  url: string
  preview: string
}

export function InvoiceEmail({
  businessName,
  heading,
  body,
  buttonLabel,
  url,
  preview,
}: InvoiceEmailProps) {
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim())
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
      <Section className="mt-6">
        <Button
          href={url}
          className="bg-ink inline-block rounded-md px-5 py-3 text-[15px] text-white no-underline"
        >
          {buttonLabel}
        </Button>
      </Section>
    </EmailLayout>
  )
}

InvoiceEmail.PreviewProps = {
  businessName: 'Your business',
  heading: 'Invoice INV-0001',
  body: 'Invoice INV-0001 from Your business is ready.\n\nAmount due: USD 1,100.00\nDue date: 2026-12-01',
  buttonLabel: 'View the invoice',
  url: 'https://example.com/i/abc',
  preview: 'Invoice INV-0001 from Your business',
} satisfies InvoiceEmailProps
