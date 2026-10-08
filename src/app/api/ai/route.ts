import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5'

type Msg = { role: 'user' | 'assistant'; content: string }

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'no_key' }, { status: 501 })
  let body: { messages?: Msg[]; context?: unknown; locale?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const messages = (body.messages ?? []).slice(-12).filter((m) => typeof m.content === 'string' && m.content.length < 4000)
  if (!messages.length || messages[messages.length - 1].role !== 'user') return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const system = `You are Flow's built-in workspace assistant. Answer in ${body.locale === 'en' ? 'English' : 'French'}, concisely.
You can propose actions by appending one or more lines of the exact form <action>{"type":"create_task","title":"..."}</action>, <action>{"type":"create_note","title":"...","body":"..."}</action> or <action>{"type":"create_event","title":"...","at":"ISO-8601"}</action>. Only emit an action when the user clearly asks for it.
Workspace snapshot (JSON): ${JSON.stringify(body.context ?? {}).slice(0, 12000)}`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, system, messages }),
    })
    if (!r.ok) return NextResponse.json({ error: 'upstream', status: r.status }, { status: 502 })
    const data = await r.json()
    const text = (data.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n')
    return NextResponse.json({ text })
  } catch {
    return NextResponse.json({ error: 'network' }, { status: 502 })
  }
}
