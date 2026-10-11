'use client'
import { use } from 'react'
import { redirect } from 'next/navigation'

export default function SocialRoot({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = use(params)
  redirect(`/app/${ws}/social/accounts`)
}
