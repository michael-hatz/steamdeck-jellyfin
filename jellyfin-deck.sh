#!/usr/bin/env bash
# Startet Chromium im Vollbild (Kiosk) mit Controller-Erweiterung. Erste Seite ist das
# Dienste-Menü, damit es auch ohne (erreichbaren) Jellyfin-Server weitergeht.
# Wird von Steam als "Nicht-Steam-Spiel" aufgerufen.
set -u

CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/jellyfin-deck/config"
APP_ID="org.chromium.Chromium"
DATA_DIR="$HOME/.var/app/$APP_ID/data/jellyfin-deck"
ARTWORK_DIR="$HOME/.local/share/jellyfin-deck/steam"
# Feste ID der eigenen Erweiterung (aus "key" in extension/manifest.json)
EXTENSION_ID="lekpkojeghpjmpbgibcabipeoikhannn"

JELLYFIN_URL=""
SCALE="1"
# shellcheck source=/dev/null
[ -f "$CONFIG" ] && . "$CONFIG"

# Bilder für den Steam-Eintrag nachtragen, falls er bei der Installation noch fehlte
[ -f "$ARTWORK_DIR/set-artwork.py" ] && python3 -I "$ARTWORK_DIR/set-artwork.py" "$ARTWORK_DIR" >/dev/null 2>&1 &

# Adresse für das Dienste-Menü an die Erweiterung weitergeben (leer: Jellyfin fehlt im Menü)
printf "self.JD_JELLYFIN_URL = '%s';\n" "${JELLYFIN_URL//\'/}" > "$DATA_DIR/extension/config.js"

# Eigene Erweiterung plus Werbeblocker (uBlock Origin Lite), SponsorBlock und
# enhanced-h264ify (H.264 statt VP9/AV1 auf YouTube), falls installiert
EXTENSIONS="$DATA_DIR/extension"
for ext in ublock sponsorblock h264ify; do
    [ -f "$DATA_DIR/$ext/manifest.json" ] && EXTENSIONS="$EXTENSIONS,$DATA_DIR/$ext"
done

# /run/udev: Ohne die udev-Datenbank erkennt Chromium in der Flatpak-Sandbox nur Controller,
# die erst nach dem Start verbunden werden – nicht die, die beim Start schon da sind
exec flatpak run --filesystem=/run/udev:ro "$APP_ID" \
    --user-data-dir="$DATA_DIR/profile" \
    --load-extension="$EXTENSIONS" \
    --silent-debugger-extension-api \
    --disable-features=DisableLoadExtensionCommandLineSwitch,Translate,MediaRouter \
    --enable-features=VaapiVideoDecoder,VaapiVideoDecodeLinuxGL,AcceleratedVideoDecodeLinuxGL \
    --kiosk \
    --start-fullscreen \
    --force-device-scale-factor="$SCALE" \
    --autoplay-policy=no-user-gesture-required \
    --no-first-run \
    --no-default-browser-check \
    --disable-session-crashed-bubble \
    --hide-crash-restore-bubble \
    --password-store=basic \
    "chrome-extension://$EXTENSION_ID/start.html"
