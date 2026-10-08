'use client'
import { useEffect } from 'react'
import { startDemo } from '@/lib/demo/runtime'
import { Spinner } from '@/components/ui/spinner'

export default function DemoPage() {
  useEffect(() => {
    startDemo()
    window.location.replace('/app/demo')
  }, [])
  return <div className="flex min-h-dvh items-center justify-center text-text-3"><Spinner className="size-5" /></div>
}
