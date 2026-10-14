// Crée l'accès admin de Flow (une seule fois) : mot de passe provisoire aléatoire, copié dans le presse-papiers du Mac
// (jamais affiché), à changer à la première connexion. Usage : node scripts/admin-init.mjs [--reinitialiser]
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
if (!(await db.storage.getBucket('admin')).data) await db.storage.createBucket('admin', { public: false })
const existe = (await db.storage.from('admin').download('compte.json')).data
if (existe && !process.argv.includes('--reinitialiser')) { console.log('Le compte admin existe déjà (rien changé). --reinitialiser pour remettre un mot de passe provisoire.'); process.exit(0) }
const mdp = randomBytes(12).toString('base64url') + '7a'
const sel = randomBytes(16).toString('hex')
const compte = { email: 'aymenfadil264@gmail.com', sel, hash: scryptSync(mdp, sel, 64).toString('hex'), doitChanger: true, maj: new Date().toISOString() }
const { error } = await db.storage.from('admin').upload('compte.json', new Blob([JSON.stringify(compte)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' })
if (error) { console.error(error.message); process.exit(1) }
execFileSync('pbcopy', { input: mdp })
console.log('Compte admin prêt : mot de passe provisoire copié dans le presse-papiers (à changer à la première connexion).')
