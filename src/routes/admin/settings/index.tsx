import { createFileRoute } from '@tanstack/react-router'
import PageHeader from '@/components/common/page-header'
import { getPushPublicKey } from '#/server/push-actions'
import { getInvoiceEmailTemplate, getSettings } from '#/server/settings-actions'
import { InvoiceEmailEditor } from './-components/invoice-email-editor'
import { LogoUpload } from './-components/logo-upload'
import { PushNotifications } from './-components/push-notifications'
import { SettingsForm } from './-components/settings-form'

export const Route = createFileRoute('/admin/settings/')({
  staticData: { breadcrumb: 'Settings' },
  loader: async () => ({
    settings: await getSettings(),
    emailTemplate: await getInvoiceEmailTemplate(),
    pushPublicKey: await getPushPublicKey(),
  }),
  component: SettingsPage,
})

function SettingsPage() {
  const { settings, emailTemplate, pushPublicKey } = Route.useLoaderData()
  return (
    <>
      <PageHeader
        title="Settings"
        description={
          settings.logoStorage
            ? 'Your business details, invoice numbering and logo.'
            : 'Your business details and invoice numbering.'
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SettingsForm initial={settings.values} />
        </div>
        <div className="flex flex-col gap-6">
          {settings.logoStorage && <LogoUpload logoKey={settings.logoKey} />}
          <PushNotifications publicKey={pushPublicKey} />
        </div>
        <div className="xl:col-span-2">
          <InvoiceEmailEditor initial={emailTemplate} />
        </div>
      </div>
    </>
  )
}
