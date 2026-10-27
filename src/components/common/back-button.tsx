import { ArrowLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function BackButton({
  link,
  children,
}: {
  link: React.ReactElement
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2.5 self-start"
      nativeButton={false}
      render={link}
    >
      <ArrowLeftIcon />
      {children}
    </Button>
  )
}
