#!/usr/bin/env bash
# Hält Chromium (Flatpak), uBlock Origin Lite, SponsorBlock und enhanced-h264ify aktuell.
# Läuft täglich über den systemd-User-Timer "jellyfin-deck-update.timer" und bei ./install.sh.
#
#   Protokoll ansehen: journalctl --user -u jellyfin-deck-update
set -uo pipefail

APP_ID="org.chromium.Chromium"
DATA_DIR="$HOME/.var/app/$APP_ID/data/jellyfin-deck"
mkdir -p "$DATA_DIR"

# Nicht gleichzeitig mit einem zweiten Lauf (Timer + install.sh)
exec 9>"$DATA_DIR/.update.lock"
flock -n 9 || { echo "Update läuft bereits."; exit 0; }

# Nach dem Aufwachen aus dem Standby braucht das WLAN manchmal etwas
for _ in $(seq 1 30); do
    curl -sf -m 5 -o /dev/null https://api.github.com && break
    sleep 2
done

echo "==> Chromium ..."
if flatpak info --user "$APP_ID" >/dev/null 2>&1; then
    flatpak update -y --noninteractive --user "$APP_ID" || echo "    WARNUNG: Update fehlgeschlagen."
elif flatpak info --system "$APP_ID" >/dev/null 2>&1; then
    # Systemweit (z. B. über Discover) installiert – braucht ggf. Rechte, dann bleibt nur Discover
    flatpak update -y --noninteractive --system "$APP_ID" \
        || echo "    WARNUNG: Update fehlgeschlagen – bitte im Desktop-Modus über Discover aktualisieren."
else
    echo "    WARNUNG: $APP_ID ist nicht installiert."
fi

# Lädt die neueste Version einer Erweiterung von GitHub und entpackt sie nach $DATA_DIR/<name>.
# Ist diese Version schon installiert, passiert nichts.
#   $1 Zielname  $2 GitHub-Repo  $3 Muster des Release-Dateinamens (leer: neuester Quellstand,
#   für Repos ohne Releases)
fetch_extension() {
    local name="$1" repo="$2" pattern="$3" url tmp root=""
    if [ -n "$pattern" ]; then
        url="$(curl -sf -m 20 "https://api.github.com/repos/$repo/releases/latest" \
            | grep -o '"browser_download_url": *"[^"]*"' | cut -d'"' -f4 | grep -E "$pattern" | head -n1)" || true
    else
        url="$(curl -sf -m 20 "https://api.github.com/repos/$repo/commits/HEAD" \
            | grep -m1 -o '"sha": *"[0-9a-f]*"' | cut -d'"' -f4)" || true
        [ -n "$url" ] && url="https://codeload.github.com/$repo/zip/$url"
    fi
    if [ -z "$url" ]; then
        echo "    WARNUNG: $name konnte nicht gefunden werden (keine Internetverbindung?)."
        return 1
    fi
    if [ -f "$DATA_DIR/$name/manifest.json" ] && [ "$(cat "$DATA_DIR/$name/.source" 2>/dev/null)" = "$url" ]; then
        echo "    $name: aktuell ($(basename "$url"))"
        return 0
    fi
    tmp="$(mktemp -d)"
    if curl -sfL -m 120 -o "$tmp/ext.zip" "$url" && { unzip -q "$tmp/ext.zip" -d "$tmp/ext" 2>/dev/null || python3 -m zipfile -e "$tmp/ext.zip" "$tmp/ext"; }; then
        # Quellstand-Archive haben noch einen Ordner <repo>-<commit>/ obendrüber
        root="$tmp/ext"
        [ -f "$root/manifest.json" ] || root="$(dirname "$(ls "$tmp"/ext/*/manifest.json 2>/dev/null | head -n1)")"
    fi
    if [ -f "$root/manifest.json" ]; then
        echo "$url" > "$root/.source"
        rm -rf "$DATA_DIR/$name"
        mv "$root" "$DATA_DIR/$name"
        echo "    $name: $(basename "$url")"
    else
        echo "    WARNUNG: $name konnte nicht installiert werden."
    fi
    rm -rf "$tmp"
}

echo "==> Werbeblocker für YouTube & Co. ..."
if pgrep -f "jellyfin-deck/profile" >/dev/null; then
    # Erweiterungen nicht unter dem laufenden Browser austauschen – beim nächsten Lauf
    echo "    Jellyfin läuft gerade – Erweiterungen werden beim nächsten Mal aktualisiert."
else
    # uBlock Origin Lite: uBlock Origin selbst (Manifest V2) läuft im aktuellen Chromium nicht mehr.
    fetch_extension ublock uBlockOrigin/uBOL-home '\.chromium\.zip$' || true
    fetch_extension sponsorblock ajayyy/SponsorBlock '/ChromeExtension\.zip$' || true
    # enhanced-h264ify: YouTube liefert H.264 statt VP9/AV1 – deren Hardware-Dekodierung (VA-API)
    # erzeugt auf dem Deck Bildfehler. Keine Releases, daher der neueste Quellstand.
    fetch_extension h264ify alextrv/enhanced-h264ify '' || true
fi
