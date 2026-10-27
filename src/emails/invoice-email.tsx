import {
  Body,
  Button,
  Container,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export type InvoiceEmailProps = {
  /** Message text with placeholders already filled. Blank lines split paragraphs. */
  body: string
  buttonLabel: string
  url: string
  preview: string
}

const font = 'Arial, Helvetica, sans-serif'

export function InvoiceEmail({
  body,
  buttonLabel,
  url,
  preview,
}: InvoiceEmailProps) {
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim())
  return (
    <Html lang="en">
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#f4f4f5', fontFamily: font, margin: 0 }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            maxWidth: 520,
            margin: '24px auto',
            padding: 32,
            borderRadius: 8,
          }}
        >
          {paragraphs.map((paragraph, i) => (
            <Text
              key={i}
              style={{
                fontSize: 15,
                lineHeight: '24px',
                color: '#111111',
                margin: '0 0 16px',
                whiteSpace: 'pre-line',
              }}
            >
              {paragraph}
            </Text>
          ))}
          <Section style={{ marginTop: 24 }}>
            <Button
              href={url}
              style={{
                backgroundColor: '#111111',
                color: '#ffffff',
                fontSize: 15,
                padding: '12px 20px',
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              {buttonLabel}
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

InvoiceEmail.PreviewProps = {
  body: 'Invoice INV-0001 from Your business is ready.\n\nAmount due: USD 1,100.00\nDue date: 2026-12-01',
  buttonLabel: 'View the invoice',
  url: 'https://example.com/i/abc',
  preview: 'Invoice INV-0001 from Your business',
} satisfies InvoiceEmailProps
