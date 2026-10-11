#!/bin/bash
# Flow Studio — exécuté par l'application « Installer Flow Studio » (aucune commande à taper).
# Prépare Node.js si besoin (sans droits administrateur), récupère le pont depuis le site, puis lance l'assistant graphique.
set -u
RES="$(cd "$(dirname "$0")" && pwd)"
DIR="$HOME/.flow-bridge"
mkdir -p "$DIR" && chmod 700 "$DIR"
exec >>"$DIR/installer.log" 2>&1
echo "=== $(date) — installation ==="
GUI="$DIR/gui.txt"
status() { printf 'phase=%s\nstep=%s\npct=%s\n' "$1" "$2" "$3" > "$GUI"; }
fail() { printf 'phase=error\nerror=%s\n' "$1" > "$GUI"; echo "ERREUR : $1"; exit 1; }

# --- Adresse du site : celle d'où le .dmg a été téléchargé (vérifiée), sinon celle prévue dans l'application ---
ORIGIN="$(tr -d '\n\r ' < "$RES/origin.txt" 2>/dev/null)"
if [ -n "${FLOW_INSTALLER_ORIGIN:-}" ]; then ORIGIN="$FLOW_INSTALLER_ORIGIN"; else
  VOL="$(cd "$RES/../../.." 2>/dev/null && pwd)"
  IMG="$(/usr/bin/hdiutil info 2>/dev/null | /usr/bin/awk -v vol="$VOL" '/image-path/ {p=$0; sub(/^[^:]*: */, "", p)} index($0, vol) {print p; exit}')"
  if [ -n "$IMG" ] && [ -f "$IMG" ]; then
    URL="$(/usr/bin/mdls -raw -name kMDItemWhereFroms "$IMG" 2>/dev/null | /usr/bin/grep -Eo 'https://[A-Za-z0-9.-]+(:[0-9]+)?/studio/Flow-Studio-Installer\.dmg' | head -1)"
    [ -n "$URL" ] && ORIGIN="${URL%/studio/Flow-Studio-Installer.dmg}"
  fi
fi
case "$ORIGIN" in https://*|http://localhost*|http://127.0.0.1*) ;; *) fail "Adresse du site invalide." ;; esac
echo "site : $ORIGIN"

# --- Node.js 20+ (téléchargement officiel vérifié, installé dans ton dossier, sans mot de passe) ---
status prepare "Vérification de Node.js…" 2
export PATH="$DIR/node/bin:$PATH"
NODE=""
for c in "$DIR/node/bin/node" "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -x "$c" ] && [ "$("$c" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 20 ] && NODE="$c" && break
done
if [ -z "$NODE" ]; then
  status prepare "Téléchargement de Node.js…" 4
  ARCH="$(uname -m)"; [ "$ARCH" = "arm64" ] && NARCH="arm64" || NARCH="x64"
  VER="$(/usr/bin/curl -fsSL --proto '=https' --tlsv1.2 https://nodejs.org/dist/index.json | tr '}' '\n' | grep -v '"lts":false' | grep -o '"version":"v[0-9.]*"' | head -1 | cut -d'"' -f4)"
  [ -n "$VER" ] || fail "Impossible de trouver la version de Node.js."
  TAR="node-$VER-darwin-$NARCH.tar.gz"
  /usr/bin/curl -fsSL --proto '=https' --tlsv1.2 "https://nodejs.org/dist/$VER/$TAR" -o "$DIR/$TAR" || fail "Téléchargement de Node.js impossible."
  WANT="$(/usr/bin/curl -fsSL --proto '=https' --tlsv1.2 "https://nodejs.org/dist/$VER/SHASUMS256.txt" | grep " $TAR\$" | cut -d' ' -f1)"
  GOT="$(/usr/bin/shasum -a 256 "$DIR/$TAR" | cut -d' ' -f1)"
  [ -n "$WANT" ] && [ "$WANT" = "$GOT" ] || { rm -f "$DIR/$TAR"; fail "Somme de contrôle de Node.js incorrecte : fichier refusé."; }
  rm -rf "$DIR/node"; mkdir -p "$DIR/node"
  /usr/bin/tar -xzf "$DIR/$TAR" -C "$DIR/node" --strip-components 1 || fail "Décompression de Node.js impossible."
  rm -f "$DIR/$TAR"
  NODE="$DIR/node/bin/node"
fi
echo "node : $NODE"

# --- Le pont ---
status prepare "Téléchargement de Flow Studio…" 6
/usr/bin/curl -fsSL --proto '=https,http' --tlsv1.2 "$ORIGIN/studio/flow-bridge.mjs" -o "$DIR/flow-bridge.mjs" || fail "Téléchargement de Flow Studio impossible. Vérifie ta connexion Internet."
FLOW_SERVER_URL="$ORIGIN" "$NODE" -e "const fs=require('fs'),p=process.env.HOME+'/.flow-bridge/config.json';let c={};try{c=JSON.parse(fs.readFileSync(p,'utf8'))}catch{};c.server=process.env.FLOW_SERVER_URL;fs.writeFileSync(p,JSON.stringify(c,null,2),{mode:384})"

# --- Assistant graphique (il écrit son état dans gui.txt : l'application l'affiche) ---
"$NODE" "$DIR/flow-bridge.mjs" setup --gui
CODE=$?
if ! grep -q '^phase=\(done\|error\)' "$GUI" 2>/dev/null; then fail "L'installation s'est arrêtée (code $CODE). Détails : $DIR/installer.log"; fi
