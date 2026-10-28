import type { ReactNode } from 'react'
import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components'
import { emailTailwindConfig } from './theme'

type EmailLayoutProps = {
  businessName: string
  /** Inbox preview text. */
  preview: string
  /** Large title above the message. */
  heading: string
  children: ReactNode
}

/**
 * The shell every email shares: wordmark, heading, content, footer. An email
 * supplies its heading and content and nothing else.
 */
export function EmailLayout({
  businessName,
  preview,
  heading,
  children,
}: EmailLayoutProps) {
  return (
    <Tailwind config={emailTailwindConfig}>
      <Html lang="en">
        <Head />
        <Preview>{preview}</Preview>
        <Body className="bg-page m-0 p-0 font-sans">
          <Container
            style={{ maxWidth: 560 }}
            className="mx-auto my-6 rounded-lg bg-card"
          >
            <Section className="px-8 pt-8">
              <Text className="text-ink-2 m-0 text-sm font-bold">
                {businessName}
              </Text>
            </Section>
            <Section className="px-8 pt-6 pb-10">
              <Text className="text-ink m-0 text-[28px] leading-9 font-bold">
                {heading}
              </Text>
              <Section className="mt-6">{children}</Section>
            </Section>
            <Section className="border-line border-t px-8 py-6">
              <Text className="text-ink-3 m-0 text-xs">
                Sent by {businessName}.
              </Text>
              <Text className="text-ink-3 m-0 mt-1 text-xs">
                Powered by{' '}
                <Link
                  href="https://neranjana.me/projects/quoteflare"
                  className="text-ink-3"
                >
                  Quoteflare
                </Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  )
}
