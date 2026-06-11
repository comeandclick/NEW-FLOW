'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BackButtonProps {
  label: string
  href?: string
}

export function BackButton({ label, href }: BackButtonProps) {
  const router = useRouter()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 text-xs text-muted-foreground h-7 -ml-1"
      onClick={() => href ? router.push(href) : router.back()}
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}
