import { cn } from '@/lib/utils'

export default function PageHeader({
  title,
  description,
  className,
  children,
}: {
  title: string
  description?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-3',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  )
}
