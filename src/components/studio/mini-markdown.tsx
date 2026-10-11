import { Fragment, type ReactNode } from 'react'

/** Affiche le compte rendu de livraison (Markdown simple : titres, listes, gras, tableaux, liens, code) sans HTML brut. */
const inline = (text: string): ReactNode[] => text.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)]+)/g).filter(Boolean).map((p, i) => {
  if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
  if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[12px]">{p.slice(1, -1)}</code>
  if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer noopener" className="break-all text-accent-ink underline underline-offset-2">{p}</a>
  return <Fragment key={i}>{p}</Fragment>
})

export function MiniMarkdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '')).split('\n')
  const out: ReactNode[] = []
  let list: ReactNode[] = []
  const flush = () => { if (list.length) { out.push(<ul key={`u${out.length}`} className="my-1.5 list-disc space-y-0.5 pl-5">{list}</ul>); list = [] } }
  lines.forEach((raw, i) => {
    const l = raw.trimEnd()
    if (!l.trim()) { flush(); return }
    const h = /^(#{1,4})\s+(.*)/.exec(l)
    if (h) { flush(); out.push(<p key={i} className={h[1].length <= 1 ? 'mt-1 text-[15px] font-semibold text-text' : 'mt-3 text-[13px] font-semibold text-text'}>{inline(h[2])}</p>); return }
    const li = /^\s*[-*]\s+(.*)/.exec(l)
    if (li) { list.push(<li key={i}>{inline(li[1])}</li>); return }
    if (/^\|[\s:|-]+\|?$/.test(l)) return
    if (l.startsWith('|')) { flush(); out.push(<p key={i} className="text-[13px] text-text-2">{inline(l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).join('  ·  '))}</p>); return }
    flush(); out.push(<p key={i} className="text-[13px] text-text-2">{inline(l)}</p>)
  })
  flush()
  return <div className={className ?? 'space-y-1 text-[13px] text-text-2'}>{out}</div>
}
