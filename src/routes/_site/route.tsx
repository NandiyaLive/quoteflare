import { Outlet, createFileRoute } from '@tanstack/react-router'
import Footer from '@/components/common/footer'
import Header from '@/components/common/header'
import { getBranding } from '#/server/settings-actions'

export const Route = createFileRoute('/_site')({
  loader: () => getBranding(),
  component: SiteLayout,
})

function SiteLayout() {
  const branding = Route.useLoaderData()
  return (
    <div className="flex min-h-screen flex-col">
      <Header branding={branding} />
      <main className="flex-1 py-8 sm:py-12">
        <Outlet />
      </main>
      <Footer businessName={branding.name} />
    </div>
  )
}
