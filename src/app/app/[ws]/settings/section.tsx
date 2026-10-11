export function Section({ title, hint, children, tone }: { title: string; hint?: string; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <section className={`mb-6 rounded-2xl border bg-surface p-4 sm:p-5 ${tone === 'danger' ? 'border-danger/40' : 'border-border'}`}>
      <h2 className={`text-sm font-semibold ${tone === 'danger' ? 'text-danger' : ''}`}>{title}</h2>
      {hint && <p className="mt-0.5 text-[13px] text-text-3">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

export function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0"><div className="text-sm font-medium">{title}</div>{hint && <div className="text-xs text-text-3">{hint}</div>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
