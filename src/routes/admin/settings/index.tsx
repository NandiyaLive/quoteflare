import { createFileRoute } from '@tanstack/react-router'
import PageHeader from '@/components/common/page-header'
import { getInvoiceEmailTemplate, getSettings } from '#/server/settings-actions'
import { InvoiceEmailEditor } from './-components/invoice-email-editor'
import { LogoUpload } from './-components/logo-upload'
import { SettingsForm } from './-components/settings-form'

export const Route = createFileRoute('/admin/settings/')({
  staticData: { breadcrumb: 'Settings' },
  loader: async () => ({
    settings: await getSettings(),
    emailTemplate: await getInvoiceEmailTemplate(),
  }),
  component: SettingsPage,
})

function SettingsPage() {
  const { settings, emailTemplate } = Route.useLoaderData()
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your business details, invoice numbering and logo."
      />
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SettingsForm initial={settings.values} />
        </div>
        <LogoUpload logoKey={settings.logoKey} />
        <div className="xl:col-span-2">
          <InvoiceEmailEditor initial={emailTemplate} />
        </div>
      </div>
    </>
  )
}
