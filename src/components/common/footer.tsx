import PoweredBy from '@/components/common/powered-by'

export default function Footer({ businessName }: { businessName: string }) {
  return (
    <footer className="mt-auto border-t py-6 text-sm text-muted-foreground">
      <div className="container flex items-center justify-between gap-4">
        <span>
          &copy; {new Date().getFullYear()} {businessName || 'Quoteflare'}
        </span>
        <PoweredBy />
      </div>
    </footer>
  )
}
