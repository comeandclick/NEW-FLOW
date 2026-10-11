#!/usr/bin/env node
/**
 * Tiny CLI for the Flow API (no dependency). Reads FLOW_API_KEY and FLOW_API_URL from the environment
 * (e.g. `set -a; . ./.env.flow; set +a`).
 *
 *   flow tasks [status]            list tasks (default: todo + in_progress)
 *   flow start <id|prefix>         mark a task in progress
 *   flow done <id|prefix>          mark a task done (emits the progress alert)
 *   flow add "title" [priority]    create a task
 *   flow note "title" < file.md    create a note from stdin (markdown)
 *   flow say <channel> "text"      post a message
 *   flow alert <type> "title" [body]
 *   flow changelog [days]          release notes from finished tasks
 */
const key = process.env.FLOW_API_KEY, base = (process.env.FLOW_API_URL ?? 'https://new-flow-dashboard.vercel.app/api/v1').replace(/\/$/, '')
if (!key) { console.error('FLOW_API_KEY is not set'); process.exit(1) }

async function api(path, method = 'GET', body) {
  const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { console.error(`${r.status} ${j.error?.message ?? 'error'}`); process.exit(1) }
  return j
}
async function resolveId(prefix) {
  if (/^[0-9a-f-]{36}$/i.test(prefix)) return prefix
  const { data } = await api('/tasks?limit=200')
  const hits = data.filter((t) => t.id.startsWith(prefix))
  if (hits.length !== 1) { console.error(hits.length ? `ambiguous prefix (${hits.length} matches)` : 'no task with this id'); process.exit(1) }
  return hits[0].id
}
const [cmd, ...a] = process.argv.slice(2)
const show = (t) => console.log(`${t.id.slice(0, 8)}  ${String(t.status).padEnd(11)} ${String(t.priority).padEnd(6)} ${t.title}`)

switch (cmd) {
  case 'tasks': {
    const statuses = a[0] ? [a[0]] : ['in_progress', 'todo']
    for (const s of statuses) (await api(`/tasks?status=${s}&limit=100`)).data.forEach(show)
    break
  }
  case 'start': case 'done': {
    const t = (await api(`/tasks/${await resolveId(a[0])}`, 'PATCH', { status: cmd === 'start' ? 'in_progress' : 'done' })).data
    show(t); break
  }
  case 'add': { show((await api('/tasks', 'POST', { title: a[0], priority: a[1] ?? 'medium' })).data); break }
  case 'note': {
    const chunks = []; for await (const c of process.stdin) chunks.push(c)
    const n = (await api('/notes', 'POST', { title: a[0], markdown: Buffer.concat(chunks).toString('utf8') })).data
    console.log(`note ${n.id.slice(0, 8)} ${n.title}`); break
  }
  case 'say': { await api('/messages', 'POST', { channel: a[0], text: a[1] }); console.log('sent'); break }
  case 'alert': { const r = await api('/alerts', 'POST', { type: a[0], title: a[1], body: a[2] }); console.log(r.data.skipped ? 'route disabled' : `sent to #${r.data.channel}`); break }
  case 'changelog': { const days = Number(a[0]) || 14; console.log((await api(`/changelog?since=${new Date(Date.now() - days * 864e5).toISOString()}`)).data.markdown); break }
  default: console.error('usage: flow tasks|start|done|add|note|say|alert|changelog — see the header of this file'); process.exit(cmd ? 1 : 0)
}
