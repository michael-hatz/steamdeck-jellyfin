#!/usr/bin/env bash
# Installiert "Jellyfin Deck" auf dem Steam Deck (im Desktop-Modus ausführen).
#
#   ./install.sh http://192.168.178.20:8096
#   ./install.sh            (erneut: übernimmt die gespeicherte Adresse)
set -euo pipefail

APP_ID="org.chromium.Chromium"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/jellyfin-deck"
INSTALL_DIR="$HOME/.local/share/jellyfin-deck"
DATA_DIR="$HOME/.var/app/$APP_ID/data/jellyfin-deck"
DESKTOP_FILE="$HOME/.local/share/applications/jellyfin-deck.desktop"
SYSTEMD_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

URL="${1:-}"
if [ -z "$URL" ] && [ -f "$CONFIG_DIR/config" ]; then
    URL="$(grep '^JELLYFIN_URL=' "$CONFIG_DIR/config" | cut -d= -f2- | tr -d '"')"
    [ -n "$URL" ] && echo "==> Verwende gespeicherte Adresse $URL"
fi
if [ -z "$URL" ]; then
    read -rp "Jellyfin-Adresse (z. B. http://192.168.178.20:8096): " URL
fi
# Abschließende Slashes und ein evtl. mitkopiertes /web/... entfernen
URL="${URL%%/web/*}"
URL="${URL%/}"
URL="${URL%/web}"
case "$URL" in
    http://*|https://*) ;;
    *) URL="http://$URL" ;;
esac

echo "==> Prüfe Jellyfin unter $URL ..."
if curl -sf -m 5 "$URL/System/Info/Public" >/dev/null; then
    echo "    Server erreichbar."
else
    echo "    WARNUNG: Server nicht erreichbar – Installation wird trotzdem fortgesetzt."
fi

echo "==> Chromium (Flatpak) ..."
if flatpak info "$APP_ID" >/dev/null 2>&1; then
    echo "    bereits installiert."
else
    flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
    flatpak install -y --user flathub "$APP_ID"
fi

echo "==> Kopiere Dateien ..."
mkdir -p "$CONFIG_DIR" "$INSTALL_DIR" "$DATA_DIR" "$(dirname "$DESKTOP_FILE")"
rm -rf "$DATA_DIR/extension"
cp -r "$SRC_DIR/extension" "$DATA_DIR/extension"
install -m 755 "$SRC_DIR/jellyfin-deck.sh" "$INSTALL_DIR/jellyfin-deck.sh"
install -m 755 "$SRC_DIR/update.sh" "$INSTALL_DIR/update.sh"

# Lädt uBlock Origin Lite und SponsorBlock (und prüft auf ein Chromium-Update)
"$INSTALL_DIR/update.sh"

echo "==> Automatische Updates (täglich) ..."
mkdir -p "$SYSTEMD_DIR"
install -m 644 "$SRC_DIR/systemd/jellyfin-deck-update.service" "$SRC_DIR/systemd/jellyfin-deck-update.timer" "$SYSTEMD_DIR/"
if systemctl --user daemon-reload 2>/dev/null && systemctl --user enable --now jellyfin-deck-update.timer 2>/dev/null; then
    echo "    eingerichtet."
else
    echo "    WARNUNG: Timer konnte nicht aktiviert werden – Updates dann über ./install.sh."
fi

if [ -f "$CONFIG_DIR/config" ] && grep -q '^SCALE=' "$CONFIG_DIR/config"; then
    SCALE="$(grep '^SCALE=' "$CONFIG_DIR/config" | cut -d= -f2- | tr -d '"')"
else
    SCALE="1"
fi
cat > "$CONFIG_DIR/config" <<EOF
# Adresse des Jellyfin-Servers (ohne /web)
JELLYFIN_URL="$URL"
# Zoomfaktor der Oberfläche, z. B. 1.25 wenn alles zu klein ist
SCALE="$SCALE"
EOF

ICON="video-display"
if curl -sf -m 5 -o "$INSTALL_DIR/icon.png" "$URL/web/touchicon.png" 2>/dev/null \
    || curl -sf -m 5 -o "$INSTALL_DIR/icon.png" "$URL/web/favicon.png" 2>/dev/null; then
    ICON="$INSTALL_DIR/icon.png"
fi

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Jellyfin
Comment=Jellyfin im TV-Modus mit Controller-Steuerung
Exec=$INSTALL_DIR/jellyfin-deck.sh
Icon=$ICON
Categories=AudioVideo;Video;Player;
Terminal=false
EOF
chmod +x "$DESKTOP_FILE"
update-desktop-database "$(dirname "$DESKTOP_FILE")" >/dev/null 2>&1 || true

# Nicht-Steam-Spiele stehen in userdata/<Konto>/config/shortcuts.vdf (Binärformat, Pfade im Klartext)
in_steam() {
    grep -qas "jellyfin-deck" "$HOME"/.local/share/Steam/userdata/*/config/shortcuts.vdf \
        "$HOME"/.steam/steam/userdata/*/config/shortcuts.vdf 2>/dev/null
}

echo "==> Zu Steam hinzufügen ..."
if in_steam; then
    echo "    \"Jellyfin\" ist bereits in Steam eingetragen."
elif command -v steamos-add-to-steam >/dev/null 2>&1 && pgrep -x steam >/dev/null; then
    steamos-add-to-steam "$DESKTOP_FILE"
    echo "    Steam sollte jetzt einen Eintrag \"Jellyfin\" anlegen."
else
    cat <<EOF
    Automatisches Hinzufügen nicht möglich. Bitte manuell:
      Steam öffnen → "Spiele" → "Ein Nicht-Steam-Spiel zu meiner Bibliothek hinzufügen"
      → "Jellyfin" anhaken → "Ausgewählte Programme hinzufügen"
EOF
fi

cat <<EOF

Fertig! Wechsle in den Gaming-Modus und starte "Jellyfin" aus der Bibliothek
(Bereich "Nicht-Steam").

Einstellungen: $CONFIG_DIR/config
EOF
