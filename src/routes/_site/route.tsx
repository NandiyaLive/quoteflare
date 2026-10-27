import { Outlet, createFileRoute } from '@tanstack/react-router'
import Footer from '@/components/common/footer'
import Header from '@/components/common/header'

export const Route = createFileRoute('/_site')({
  component: SiteLayout,
})

function SiteLayout() {
  return (
    <>
      <Header />
      <Outlet />
      <Footer />
    </>
  )
}
