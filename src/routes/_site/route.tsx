import { Outlet, createFileRoute } from '@tanstack/react-router'
import Footer from '@/components/common/footer'
import Header from '@/components/common/header'

export const Route = createFileRoute('/_site')({
  component: SiteLayout,
})

function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 py-8 sm:py-12">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
