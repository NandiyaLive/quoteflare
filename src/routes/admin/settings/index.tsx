import { createFileRoute } from '@tanstack/react-router'
import PageHeader from '@/components/common/page-header'
import { getSettings } from '#/server/settings-actions'
import { LogoUpload } from './-components/logo-upload'
import { SettingsForm } from './-components/settings-form'

export const Route = createFileRoute('/admin/settings/')({
  staticData: { breadcrumb: 'Settings' },
  loader: () => getSettings(),
  component: SettingsPage,
})

function SettingsPage() {
  const settings = Route.useLoaderData()
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
      </div>
    </>
  )
}
