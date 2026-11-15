import { createFileRoute } from '@tanstack/react-router'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
      <Tabs defaultValue="general" className="gap-6">
        <TabsList
          variant="line"
          className="w-full justify-start gap-4 border-b p-0 group-data-[orientation=horizontal]/tabs:h-auto"
        >
          {['general', 'invoicing', 'leads'].map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-auto flex-none px-0 pt-1 pb-1 font-semibold capitalize group-data-[orientation=horizontal]/tabs:after:-bottom-0.5 group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=horizontal]/tabs:after:bg-primary data-active:text-primary"
            >
              {value}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general" className="flex max-w-3xl flex-col gap-6">
          <SettingsForm initial={settings.values} section="general" />
          {settings.logoStorage && <LogoUpload logoKey={settings.logoKey} />}
        </TabsContent>
        <TabsContent
          value="invoicing"
          className="flex max-w-3xl flex-col gap-6"
        >
          <SettingsForm initial={settings.values} section="invoicing" />
          <InvoiceEmailEditor initial={emailTemplate} />
        </TabsContent>
        <TabsContent value="leads" className="flex max-w-3xl flex-col gap-6">
          <SettingsForm initial={settings.values} section="leads" />
          <PushNotifications publicKey={pushPublicKey} />
        </TabsContent>
      </Tabs>
    </>
  )
}
