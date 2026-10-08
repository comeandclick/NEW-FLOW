'use client'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { getDb } from '@/lib/supabase/client'
import { isDemoBrowser } from '@/lib/demo/runtime'
import { useT } from '@/i18n/provider'

export function ContactForm() {
  const t = useT()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [f, setF] = useState({ name: '', email: '', message: '' })
  async function submit(e: FormEvent) {
    e.preventDefault(); setState('busy')
    if (isDemoBrowser()) { setState('done'); return }
    const { error } = await getDb().from('contact_messages').insert({ name: f.name.trim(), email: f.email.trim(), message: f.message.trim() })
    setState(error ? 'error' : 'done')
  }
  if (state === 'done') return <p className="max-w-md rounded-xl border border-border bg-surface p-6 text-[15px]" role="status">{t('s.contact.thanks')}</p>
  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <Field label={t('s.contact.name')}><Input required maxLength={200} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
      <Field label={t('s.contact.email')}><Input type="email" required maxLength={320} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
      <Field label={t('s.contact.message')} error={state === 'error' ? t('s.contact.error') : null}><Textarea required rows={6} maxLength={4000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
      <Button type="submit" variant="primary" size="lg" loading={state === 'busy'}>{t('s.contact.send')}</Button>
    </form>
  )
}
