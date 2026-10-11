import { asUser, json } from '@/lib/studio/server/http'
import { answerQuestion } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = asUser(async (req, user, { params }) => {
  const b = (await req.json().catch(() => null)) as { questionId?: string; answer?: string } | null
  if (!b?.questionId || !b.answer) return json({ error: 'invalid' }, 400)
  await answerQuestion(user.id, (await params).id, b.questionId, b.answer)
  return json({ ok: true })
})
