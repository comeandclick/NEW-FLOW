'use client'
 
import { use, useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Logo } from '@/components/ui/logo'
import { LanguageToggle, ThemeToggle } from '@/components/ui/toggles'
import { getDb } from '@/lib/supabase/client'
import { useT } from '@/i18n/provider'
import type { FormRow } from '@/lib/types'

export default function PublicForm({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const t = useT()
  const [form, setForm] = useState<FormRow | null | undefined>(undefined)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  useEffect(() => { getDb().from('forms').select('*').eq('slug', slug).eq('is_public', true).is('deleted_at', null).maybeSingle().then(({ data }) => setForm((data as FormRow) ?? null)) }, [slug])
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!form) return
    setBusy(true)
    const { error } = await getDb().from('form_responses').insert({ workspace_id: form.workspace_id, form_id: form.id, answers })
    setBusy(false); if (!error) setDone(true)
  }
  return (
    <div className="min-h-dvh px-4 py-8">
      <div className="mx-auto mb-6 flex max-w-lg items-center justify-between"><Logo size={28} /><div className="flex"><LanguageToggle /><ThemeToggle /></div></div>
      <main className="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-md">
        {form === undefined ? <div className="skeleton h-40" /> : form === null ? <p className="py-10 text-center text-text-2">{t('forms.notFound')}</p>
          : done ? <div className="flex flex-col items-center gap-3 py-10 text-center"><CheckCircle2 className="size-10 text-success" /><p className="text-sm text-text-2">{t('forms.thanks')}</p></div>
          : <form onSubmit={submit} className="space-y-4"><div><h1 className="text-xl font-semibold tracking-tight">{form.title}</h1>{form.description && <p className="mt-1 text-sm text-text-2">{form.description}</p>}</div>
            {form.fields.map((f) => (
              <label key={f.id} className="block space-y-1.5"><span className="text-[13px] font-medium text-text-2">{f.label}{f.required && <span className="text-danger"> *</span>}</span>
                {f.type === 'textarea' ? <Textarea required={f.required} rows={4} onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })} />
                  : f.type === 'select' ? <Select required={f.required} defaultValue="" onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}><option value="" disabled>—</option>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}</Select>
                  : <Input type={f.type === 'text' ? 'text' : f.type} required={f.required} onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })} />}</label>))}
            <Button type="submit" variant="primary" className="w-full" loading={busy}>{t('forms.submit')}</Button></form>}
      </main>
    </div>
  )
}
