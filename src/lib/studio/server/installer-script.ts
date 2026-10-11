import 'server-only'

/** Script d'installation (Terminal). Le HTTPS est imposé hors localhost. */
export function installScript(origin: string): string {
  const secure = origin.startsWith('https://') ? "--proto '=https' --tlsv1.2 " : ''
  return `#!/usr/bin/env bash
# Flow Studio : installe le pont entre ce Mac et Flow (${origin}). Sûr à relancer.
set -e
ORIGIN="${origin}"
DIR="$HOME/.flow-bridge"
say() { printf '\\n\\033[1m%s\\033[0m\\n' "$1"; }
say "Flow Studio : installation sur ce Mac"
[ "$(uname -s)" = "Darwin" ] || { echo "Pour l'instant, Flow Studio fonctionne sur Mac uniquement."; exit 1; }

# 1. Node.js 20+
if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then say "Installation de Node.js (Homebrew)…"; brew install node
  else echo "Node.js est requis : installe la version LTS depuis https://nodejs.org puis relance cette commande."; exit 1; fi
fi
if [ "$(node -p "process.versions.node.split('.')[0]")" -lt 20 ]; then echo "Node.js 20 ou plus est requis (installé : $(node -v))."; exit 1; fi

# 2. Le pont (dossier privé à ton utilisateur)
mkdir -p "$DIR" && chmod 700 "$DIR"
curl -fsSL ${secure}"$ORIGIN/studio/flow-bridge.mjs" -o "$DIR/flow-bridge.mjs"
FLOW_SERVER_URL="$ORIGIN" node -e "const fs=require('fs'),p=process.env.HOME+'/.flow-bridge/config.json';let c={};try{c=JSON.parse(fs.readFileSync(p,'utf8'))}catch{};c.server=process.env.FLOW_SERVER_URL;fs.writeFileSync(p,JSON.stringify(c,null,2),{mode:384})"

# 3. Assistant de configuration : vérifie ce Mac et installe ce qui manque (moteur de motion design au choix :
#    EffectCraft gratuit, After Effects avec abonnement Adobe payant, Remotion ; puis Claude Code, ffmpeg, méthodes de motion…).
#    L'état de chaque étape s'affiche ici et sur Flow.
say "Vérification des logiciels"
node "$DIR/flow-bridge.mjs" setup

# 4. Liaison avec Flow : un code s'affiche, tu l'entres sur Flow
say "Liaison avec Flow"
node "$DIR/flow-bridge.mjs" connect

# 5. Démarrage automatique (le Mac reste éveillé tant que le pont tourne)
node "$DIR/flow-bridge.mjs" install
say "Terminé. Retourne sur Flow : ton Mac est relié."
`
}
