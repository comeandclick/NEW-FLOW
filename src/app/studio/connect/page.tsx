import type { Metadata } from 'next'
import { ConnectClient } from './connect-client'

export const metadata: Metadata = { title: 'Relier ce Mac à Flow', robots: { index: false } }

export default function ConnectPage() { return <ConnectClient /> }
