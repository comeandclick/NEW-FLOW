'use client'
import { useMemo, useState } from 'react'
import { ClipboardList, Copy, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, Textarea } from '@/components/ui/input'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { buildDigest, type DTask } from '@/lib/digest'
import { useI18n } from '@/i18n/provider'
import type { Conversation } from '@/lib/types'

/** "Daily update" for stand-ups: built from your own tasks, editable, copied or posted to a channel. */
export function DigestButton({ tasks }: { tasks: (DTask & { id: string })[] }) {
  const { t, locale } = useI18n()
  const { ws, me, canWrite } = useWorkspace()
  const { userId } = useSession()
  const channels = useLive<Conversation>('conversations', { eq: { workspace_id: ws.id, type: 'channel' }, order: ['name', true] })
  const [open, setOpen] = useState(false)
  const [edited, setEdited] = useState<string | null>(null)
  const [channel, setChannel] = useState('')
  const generated = useMemo(() => (open && userId ? buildDigest(tasks, userId, me?.full_name?.split(' ')[0] ?? '', locale === 'en' ? 'en' : 'fr') : ''), [open, tasks, userId, me?.full_name, locale])
  const text = edited ?? generated
  const general = channels.data.find((c) => c.name === 'general')?.id ?? ''

  async function post() {
    const target = channel || general
    if (!userId || !target) return
    const { error } = await getDb().from('messages').insert({ conversation_id: target, user_id: userId, kind: 'text', content: text })
    if (error) toast.error(t('common.error')); else { toast.success(t('rel.posted')); setOpen(false) }
  }
  return (
    <>
      <Button onClick={() => { setEdited(null); setOpen(true) }}><ClipboardList className="size-4" />{t('digest.button')}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('digest.title')} footer={<>
        <Button onClick={async () => { await navigator.clipboard.writeText(text); toast.success(t('rel.copied')) }}><Copy className="size-4" />{t('rel.copy')}</Button>
        {canWrite && <Button variant="primary" onClick={post} disabled={!(channel || general)}><Send className="size-4" />{t('rel.post')}</Button>}</>}>
        <div className="space-y-3">
          <Textarea aria-label={t('digest.title')} rows={11} className="font-mono text-[13px] leading-relaxed" value={text} onChange={(e) => setEdited(e.target.value)} />
          {canWrite && channels.data.length > 0 && <Select aria-label={t('rel.channel')} value={channel || general} onChange={(e) => setChannel(e.target.value)}>{channels.data.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}</Select>}
        </div>
      </Dialog>
    </>
  )
}
