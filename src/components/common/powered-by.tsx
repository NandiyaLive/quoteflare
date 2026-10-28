export default function PoweredBy({ className }: { className?: string }) {
  return (
    <p className={className}>
      Powered by{' '}
      <a
        href="https://neranjana.me/projects/quoteflare"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4 hover:text-foreground"
      >
        Quoteflare
      </a>
    </p>
  )
}
