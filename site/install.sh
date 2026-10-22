#!/bin/bash
# Installe (ou met à jour) Lumière sur macOS : télécharge la dernière version pour ce Mac
# (puce Apple ou Intel), la copie dans Applications et l'ouvre.
#   curl -fsSL https://timal-o.github.io/lumiere/install.sh | bash
set -euo pipefail

REPO="timal-o/lumiere"
APP="Lumière.app"
DEST="${LUMIERE_INSTALL_DIR:-/Applications}"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Ce script est pour Mac. Pour Windows et Linux : https://timal-o.github.io/lumiere/"
  exit 1
fi

case "$(uname -m)" in
  arm64) ARCH="aarch64" ;;
  *) ARCH="x64" ;;
esac

echo "→ Recherche de la dernière version de Lumière…"
URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -o "\"browser_download_url\": *\"[^\"]*_${ARCH}\.dmg\"" | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')
if [ -z "$URL" ]; then
  echo "Impossible de trouver le fichier à télécharger. Essayez : https://github.com/$REPO/releases/latest"
  exit 1
fi

TMP=$(mktemp -d)
trap 'hdiutil detach "$TMP/mnt" -quiet 2>/dev/null || true; rm -rf "$TMP"' EXIT

echo "→ Téléchargement : $(basename "$URL")"
curl -fL --progress-bar -o "$TMP/lumiere.dmg" "$URL"

echo "→ Installation dans Applications…"
hdiutil attach "$TMP/lumiere.dmg" -nobrowse -readonly -quiet -mountpoint "$TMP/mnt"
osascript -e 'quit app "Lumière"' >/dev/null 2>&1 || true
if [ -w "$DEST" ]; then
  rm -rf "$DEST/$APP"
  ditto "$TMP/mnt/$APP" "$DEST/$APP"
else
  echo "  (mot de passe administrateur demandé pour écrire dans Applications)"
  sudo rm -rf "$DEST/$APP"
  sudo ditto "$TMP/mnt/$APP" "$DEST/$APP"
fi
# Une copie téléchargée avec un navigateur garde une marque de quarantaine : on la retire.
xattr -dr com.apple.quarantine "$DEST/$APP" 2>/dev/null || true

echo "✓ Lumière est installé dans $DEST."
[ -n "${LUMIERE_NO_OPEN:-}" ] || open "$DEST/$APP"
