import { Button, Section, Text } from '@react-email/components'
import { EmailLayout } from './email-layout'

export type LeadDigestGroup = {
  title: string
  count: number
  /** Handles shown in the email, at most 10. */
  handles: string[]
}

export type LeadDigestEmailProps = {
  businessName: string
  heading: string
  groups: LeadDigestGroup[]
  url: string
  preview: string
}

export function LeadDigestEmail({
  businessName,
  heading,
  groups,
  url,
  preview,
}: LeadDigestEmailProps) {
  return (
    <EmailLayout
      businessName={businessName}
      heading={heading}
      preview={preview}
    >
      {groups.map((group) => (
        <Section key={group.title} className="mb-4">
          <Text className="text-ink m-0 text-[15px] leading-6 font-bold">
            {group.title} ({group.count})
          </Text>
          {group.handles.map((handle) => (
            <Text key={handle} className="text-ink-2 m-0 text-[15px] leading-6">
              {handle}
            </Text>
          ))}
          {group.count > group.handles.length && (
            <Text className="text-ink-3 m-0 text-[13px] leading-5">
              and {group.count - group.handles.length} more
            </Text>
          )}
        </Section>
      ))}
      <Section className="mt-6">
        <Button
          href={url}
          className="bg-ink inline-block rounded-md px-5 py-3 text-[15px] text-white no-underline"
        >
          Open today&apos;s leads
        </Button>
      </Section>
    </EmailLayout>
  )
}

LeadDigestEmail.PreviewProps = {
  businessName: 'Your business',
  heading: '3 leads due today',
  groups: [
    { title: 'Send first message', count: 2, handles: ['studio_x', 'acme.co'] },
    { title: 'Follow up', count: 1, handles: ['jane.doe'] },
  ],
  url: 'https://example.test/admin/leads',
  preview: '3 leads due today',
} satisfies LeadDigestEmailProps
