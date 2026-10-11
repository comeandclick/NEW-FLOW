/* Minimal TipTap JSON → Markdown, for API consumers that cannot render ProseMirror documents. */
type N = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: N[]; marks?: { type: string }[] }

const inline = (n: N): string => {
  if (n.type === 'hardBreak') return '\n'
  let t = n.text ?? (n.content ?? []).map(inline).join('')
  for (const m of n.marks ?? []) {
    if (m.type === 'bold') t = `**${t}**`
    else if (m.type === 'italic') t = `*${t}*`
    else if (m.type === 'code') t = `\`${t}\``
  }
  return t
}

const block = (n: N, depth = 0): string => {
  const kids = n.content ?? []
  const pad = '  '.repeat(depth)
  switch (n.type) {
    case 'heading': return `${'#'.repeat(Number(n.attrs?.level ?? 1))} ${kids.map(inline).join('')}`
    case 'bulletList': return kids.map((k) => `${pad}- ${(k.content ?? []).map((c) => block(c, depth + 1)).join('\n').trimStart()}`).join('\n')
    case 'orderedList': return kids.map((k, i) => `${pad}${i + 1}. ${(k.content ?? []).map((c) => block(c, depth + 1)).join('\n').trimStart()}`).join('\n')
    case 'taskList': return kids.map((k) => `${pad}- [${k.attrs?.checked ? 'x' : ' '}] ${(k.content ?? []).map((c) => block(c, depth + 1)).join('\n').trimStart()}`).join('\n')
    case 'blockquote': return kids.map((k) => `> ${block(k)}`).join('\n')
    case 'codeBlock': return '```\n' + kids.map(inline).join('') + '\n```'
    case 'horizontalRule': return '---'
    default: return kids.length && !n.text ? kids.map(inline).join('') : inline(n)
  }
}

export function docToMarkdown(doc: unknown): string {
  const d = doc as N | null
  if (!d || !Array.isArray(d.content)) return ''
  return d.content.map((n) => block(n)).join('\n\n').trim()
}
