#!/usr/bin/env bash
# Entfernt "Jellyfin Deck". Chromium selbst bleibt installiert.
set -euo pipefail

APP_ID="org.chromium.Chromium"
SYSTEMD_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

systemctl --user disable --now jellyfin-deck-update.timer 2>/dev/null || true
rm -f "$SYSTEMD_DIR/jellyfin-deck-update.service" "$SYSTEMD_DIR/jellyfin-deck-update.timer"
systemctl --user daemon-reload 2>/dev/null || true

rm -rf "$HOME/.local/share/jellyfin-deck" \
       "$HOME/.var/app/$APP_ID/data/jellyfin-deck" \
       "${XDG_CONFIG_HOME:-$HOME/.config}/jellyfin-deck"
rm -f "$HOME/.local/share/applications/jellyfin-deck.desktop"

echo "Entfernt. Den Eintrag \"Jellyfin\" in Steam bitte manuell löschen"
echo "(Bibliothek → Jellyfin → Zahnrad → Verwalten → Nicht-Steam-Spiel entfernen)."
echo "Chromium deinstallieren (optional): flatpak uninstall $APP_ID"
