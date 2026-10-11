/** Minimal Markdown → TipTap document (headings, bullet and task lists, paragraphs). Dependency-free. */
type Doc = { type: 'doc'; content: unknown[] }
export function mdToDoc(md: string): Doc {
  const out: unknown[] = []
  let list: { kind: 'bullet' | 'task'; items: unknown[] } | null = null
  const flush = () => {
    if (!list) return
    out.push(list.kind === 'bullet' ? { type: 'bulletList', content: list.items } : { type: 'taskList', content: list.items })
    list = null
  }
  const text = (t: string) => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] })
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd()
    const task = line.match(/^- \[( |x)\] (.*)$/)
    const bullet = line.match(/^- (.*)$/)
    const h = line.match(/^(#{1,3}) (.*)$/)
    if (task) {
      if (!list || list.kind !== 'task') { flush(); list = { kind: 'task', items: [] } }
      list.items.push({ type: 'taskItem', attrs: { checked: task[1] === 'x' }, content: [text(task[2])] })
    } else if (bullet) {
      if (!list || list.kind !== 'bullet') { flush(); list = { kind: 'bullet', items: [] } }
      list.items.push({ type: 'listItem', content: [text(bullet[1])] })
    } else {
      flush()
      if (h) out.push({ type: 'heading', attrs: { level: h[1].length }, content: [{ type: 'text', text: h[2] }] })
      else if (line.trim()) out.push(text(line))
    }
  }
  flush()
  return { type: 'doc', content: out }
}
