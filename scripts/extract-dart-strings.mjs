#!/usr/bin/env node
/**
 * Lists the user-facing strings hard-coded in a Flutter project (Text('…'), title:, label:, hintText:…)
 * and writes a Flow translation set (`*.l10n.json`, source language = fr).
 *   node scripts/extract-dart-strings.mjs ~/kalimat2/lib out.l10n.json
 * Read-only on the project. Strings with interpolation ($x, ${…}) become {x} placeholders.
 */
import fs from 'node:fs'
import path from 'node:path'

const [root, out = 'extracted.l10n.json'] = process.argv.slice(2)
if (!root) { console.error('usage: extract-dart-strings.mjs <lib dir> [out.json]'); process.exit(1) }

const PROPS = ['title', 'label', 'hintText', 'hint', 'subtitle', 'message', 'content', 'text', 'description', 'tooltip', 'semanticsLabel', 'child: Text', 'Text']
const re = new RegExp(`(?:\\b(?:${PROPS.map((p) => p.replace(/[:\s]/g, '\\$&')).join('|')})\\s*[:(]\\s*)(?:const\\s+)?(?:Text\\()?\\s*'((?:[^'\\\\\\n]|\\\\.)+)'`, 'g')
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'generated' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.dart') ? [path.join(d, e.name)] : []))
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32)
const looksLikeText = (s) => /\p{L}{2,}/u.test(s) && /[\s'’!?.:]|[À-ÿ]/u.test(s) && !/^(https?:|assets\/|package:|[a-z_]+\.[a-z_.]+$|[A-Za-z0-9_]+$)/.test(s) && !/^[a-z]+([A-Z][a-z]+)+$/.test(s)

const keys = {}
const seen = new Map()
for (const f of walk(root)) {
  const rel = path.relative(root, f).replace(/\.dart$/, '').split(path.sep)
  const area = (rel[0] === 'features' ? rel[1] : rel[0]).replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(re)) {
    let raw = m[1].replace(/\\'/g, '’').replace(/\\n/g, '\n').replace(/\\\$/g, '$')
    if (!looksLikeText(raw)) continue
    const text = raw.replace(/\$\{([^}]+)\}/g, (_, x) => `{${x.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'x'}}`).replace(/\$([A-Za-z_]\w*)/g, '{$1}')
    if (seen.has(text)) continue
    let key = `${area}.${slug(text)}`
    for (let i = 2; keys[key]; i++) key = `${area}.${slug(text)}_${i}`
    seen.set(text, key)
    keys[key] = { v: { fr: text }, note: `${path.relative(root, f)}`, u: new Date().toISOString() }
  }
}
fs.writeFileSync(out, JSON.stringify({ version: 1, source: 'fr', locales: ['fr', 'en', 'ar'], keys }, null, 1))
console.log(`${Object.keys(keys).length} strings from ${walk(root).length} files → ${out}`)
