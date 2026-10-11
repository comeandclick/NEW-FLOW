export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Script d'installation du pont Flow sur un Mac. L'adresse du site est injectée : le même code marche sur n'importe quel domaine. */
export async function GET(req: Request) {
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')
  const origin = `${proto}://${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`
  const script = `#!/usr/bin/env bash
# Flow Studio : installe le pont entre ce Mac et Flow (${origin}). Sûr à relancer.
set -e
ORIGIN="${origin}"
DIR="$HOME/.flow-bridge"
say() { printf '\\n\\033[1m%s\\033[0m\\n' "$1"; }
say "Flow Studio : installation sur ce Mac"

# 1. Node.js 20+
if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then say "Installation de Node.js (Homebrew)…"; brew install node
  else echo "Node.js est requis : installe la version LTS depuis https://nodejs.org puis relance cette commande."; exit 1; fi
fi
if [ "$(node -p "process.versions.node.split('.')[0]")" -lt 20 ]; then echo "Node.js 20 ou plus est requis (installé : $(node -v))."; exit 1; fi

# 2. Le pont
mkdir -p "$DIR"
curl -fsSL "$ORIGIN/studio/flow-bridge.mjs" -o "$DIR/flow-bridge.mjs"
FLOW_SERVER_URL="$ORIGIN" node -e "const fs=require('fs'),p=process.env.HOME+'/.flow-bridge/config.json';let c={};try{c=JSON.parse(fs.readFileSync(p,'utf8'))}catch{};c.server=process.env.FLOW_SERVER_URL;fs.writeFileSync(p,JSON.stringify(c,null,2),{mode:384})"

# 3. Claude Code, connecté à ton compte
if ! command -v claude >/dev/null 2>&1; then
  say "Installation de Claude Code…"
  npm install -g @anthropic-ai/claude-code || { echo "Installation impossible automatiquement. Installe Claude Code (https://claude.com/claude-code) puis relance cette commande."; exit 1; }
fi
if ! claude auth status 2>/dev/null | grep -q '"loggedIn": true'; then
  say "Connexion à ton compte Claude (une page s'ouvre dans le navigateur)…"
  claude auth login || { echo "Connexion non terminée. Lance « claude » une fois, tape /login, puis relance cette commande."; exit 1; }
fi

# 4. Liaison avec Flow : un code s'affiche, tu l'entres sur Flow
say "Liaison avec Flow"
node "$DIR/flow-bridge.mjs" connect

# 5. Démarrage automatique (le Mac reste éveillé tant que le pont tourne)
node "$DIR/flow-bridge.mjs" install
say "Terminé. Retourne sur Flow : ton Mac est relié."
`
  return new Response(script, { headers: { 'Content-Type': 'text/x-shellscript; charset=utf-8', 'Cache-Control': 'no-store' } })
}
