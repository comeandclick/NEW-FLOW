import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LiveClient } from './live-client'

export const metadata: Metadata = { title: 'Flow Studio', robots: { index: false } }

export default function LivePage() { return <Suspense fallback={null}><LiveClient /></Suspense> }
