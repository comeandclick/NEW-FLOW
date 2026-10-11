#!/bin/bash
# Fabrique « Flow-Studio-Installer.dmg » (macOS) : une application à double-cliquer dans une image disque.
# Usage : FLOW_ORIGIN=https://mon-site.com installer/build-mac.sh   (défaut : adresse de production actuelle)
# Signature (facultative mais conseillée : supprime l'avertissement de macOS) :
#   SIGN_IDENTITY="Developer ID Application: Nom (TEAMID)" NOTARY_PROFILE=mon-profil installer/build-mac.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/.." && pwd)"
ORIGIN="${FLOW_ORIGIN:-https://new-flow-dashboard.vercel.app}"
OUT="$ROOT/public/studio/Flow-Studio-Installer.dmg"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
APP="$W/stage/Flow Studio.app"; mkdir -p "$W/stage" "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$HERE/mac/runner.sh" "$APP/Contents/MacOS/FlowStudio"; chmod +x "$APP/Contents/MacOS/FlowStudio"
printf '%s' "$ORIGIN" > "$APP/Contents/Resources/origin.txt"
# icône
ICON_SRC="${ICON_PNG:-$HERE/icon.png}"
if [ -f "$ICON_SRC" ]; then
  IS="$W/icon.iconset"; mkdir -p "$IS"
  for s in 16 32 128 256 512; do sips -z $s $s "$ICON_SRC" --out "$IS/icon_${s}x${s}.png" >/dev/null; sips -z $((s*2)) $((s*2)) "$ICON_SRC" --out "$IS/icon_${s}x${s}@2x.png" >/dev/null; done
  iconutil -c icns "$IS" -o "$APP/Contents/Resources/AppIcon.icns"
fi
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>FlowStudio</string>
<key>CFBundleIdentifier</key><string>site.flow.studio</string>
<key>CFBundleName</key><string>Flow Studio</string>
<key>CFBundleDisplayName</key><string>Flow Studio</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>2.0.0</string>
<key>CFBundleVersion</key><string>2.0.0</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>11.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
# signature : Developer ID si fournie, sinon signature locale (évite le message « endommagé »)
if [ -n "${SIGN_IDENTITY:-}" ]; then codesign --force --deep --options runtime --timestamp -s "$SIGN_IDENTITY" "$APP"; else codesign --force --deep -s - "$APP"; fi
cp "$HERE/mac/LISEZ-MOI.txt" "$W/stage/LISEZ-MOI.txt" 2>/dev/null || true
rm -f "$OUT"
hdiutil create -volname "Flow Studio" -srcfolder "$W/stage" -fs HFS+ -format UDZO -ov "$OUT" >/dev/null
if [ -n "${SIGN_IDENTITY:-}" ]; then
  codesign --force -s "$SIGN_IDENTITY" --timestamp "$OUT"
  if [ -n "${NOTARY_PROFILE:-}" ]; then xcrun notarytool submit "$OUT" --keychain-profile "$NOTARY_PROFILE" --wait && xcrun stapler staple "$OUT"; fi
fi
echo "OK : $OUT ($(du -h "$OUT" | cut -f1)) — site : $ORIGIN"
