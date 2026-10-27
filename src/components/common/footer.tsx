import Container from '@/components/common/container'

export default function Footer() {
  return (
    <footer className="mt-auto border-t py-6 text-sm text-muted-foreground">
      <Container>&copy; {new Date().getFullYear()} QuoteKit</Container>
    </footer>
  )
}
