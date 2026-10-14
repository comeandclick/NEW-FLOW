import { NextResponse } from 'next/server'
import { fermerSession } from '@/lib/admin/auth'
export const runtime = 'nodejs'
export async function POST() { await fermerSession(); return NextResponse.json({ ok: true }) }
