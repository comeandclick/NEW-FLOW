import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LiveClient } from './live-client'

export const metadata: Metadata = { title: 'En direct', robots: { index: false } }

export default function LivePage() { return <Suspense fallback={null}><LiveClient /></Suspense> }
