import { createFileRoute } from '@tanstack/react-router'
import { getSettings } from '#/server/settings-actions'
import { LogoUpload } from './components/logo-upload'
import { SettingsForm } from './components/settings-form'

export const Route = createFileRoute('/admin/settings/')({
  loader: () => getSettings(),
  component: SettingsPage,
})

function SettingsPage() {
  const settings = Route.useLoaderData()
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      <LogoUpload logoKey={settings.logoKey} />
      <SettingsForm initial={settings.values} />
    </main>
  )
}
