import { createFileRoute } from '@tanstack/react-router'
import Container from '@/components/common/container'
import PageHeader from '@/components/common/page-header'

export const Route = createFileRoute('/_site/about/')({
  component: About,
})

function About() {
  return (
    <Container>
      <PageHeader
        title="About"
        description="QuoteKit runs on Cloudflare Workers with TanStack Start."
      />
    </Container>
  )
}
