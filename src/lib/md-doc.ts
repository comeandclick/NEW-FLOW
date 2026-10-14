/** Minimal Markdown → TipTap document (headings, bullet, numbered and task lists, paragraphs, **gras**, *italique*). Dependency-free. */
type Doc = { type: 'doc'; content: unknown[] }
export function mdToDoc(md: string): Doc {
  const out: unknown[] = []
  let list: { kind: 'bullet' | 'task' | 'ordered'; items: unknown[] } | null = null
  const flush = () => {
    if (!list) return
    out.push(list.kind === 'bullet' ? { type: 'bulletList', content: list.items } : list.kind === 'ordered' ? { type: 'orderedList', attrs: { start: 1 }, content: list.items } : { type: 'taskList', content: list.items })
    list = null
  }
  const text = (t: string) => ({ type: 'paragraph', content: t ? inline(t) : [] })
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd()
    const task = line.match(/^- \[( |x)\] (.*)$/)
    const bullet = line.match(/^[-*•] (.*)$/)
    const ordered = line.match(/^\s*\d+[.)°] (.*)$/)
    const h = line.match(/^(#{1,3}) (.*)$/)
    if (task) {
      if (!list || list.kind !== 'task') { flush(); list = { kind: 'task', items: [] } }
      list.items.push({ type: 'taskItem', attrs: { checked: task[1] === 'x' }, content: [text(task[2])] })
    } else if (bullet) {
      if (!list || list.kind !== 'bullet') { flush(); list = { kind: 'bullet', items: [] } }
      list.items.push({ type: 'listItem', content: [text(bullet[1])] })
    } else if (ordered) {
      if (!list || list.kind !== 'ordered') { flush(); list = { kind: 'ordered', items: [] } }
      list.items.push({ type: 'listItem', content: [text(ordered[1])] })
    } else {
      flush()
      if (h) out.push({ type: 'heading', attrs: { level: h[1].length }, content: inline(h[2].replace(/\*\*/g, '')) })
      else if (line.trim()) out.push(text(line))
    }
  }
  flush()
  return { type: 'doc', content: out }
}

/** Texte avec **gras** et *italique* → nœuds texte TipTap. */
function inline(t: string): unknown[] {
  const out: unknown[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g
  let i = 0, m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    if (m.index > i) out.push({ type: 'text', text: t.slice(i, m.index) })
    out.push({ type: 'text', text: m[1] ?? m[2], marks: [{ type: m[1] ? 'bold' : 'italic' }] })
    i = m.index + m[0].length
  }
  if (i < t.length) out.push({ type: 'text', text: t.slice(i) })
  return out
}
