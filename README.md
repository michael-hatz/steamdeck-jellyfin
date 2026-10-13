# Jellyfin Deck

Jellyfin als „Fernseher-App“ auf dem Steam Deck: startet aus dem Gaming-Modus direkt im Vollbild
und lässt sich komplett mit dem Controller bedienen.

Das Programm nutzt den eingebauten **TV-Modus** von Jellyfin (der auch auf Smart-TVs läuft) und
startet ihn in einem eigenen Chromium-Profil im Kiosk-Modus. Eine kleine Browser-Erweiterung
übersetzt die Controller-Eingaben in Fernbedienungs-Befehle und bringt eine eigene
Bildschirmtastatur mit.

Über das **Dienste-Menü** (Taste **X**) wechselst du außerdem zu ARD Mediathek, ZDF Mediathek,
YouTube, ARTE, RTL+, Netflix, Joyn und Plex. Jeder Dienst läuft in einem eigenen Tab; beim Zurückwechseln
bist du wieder an derselben Stelle (die Wiedergabe wird beim Wechseln pausiert). Für YouTube werden
**uBlock Origin Lite** (Werbeblocker) und **SponsorBlock** (überspringt Sponsoren-Abschnitte)
mitinstalliert.

## Installation

1. Steam Deck in den **Desktop-Modus** schalten.
2. Konsole öffnen und ausführen (Adresse durch deinen Jellyfin-Server ersetzen, ohne `/web`):

   ```bash
   git clone https://github.com/michael-hatz/steamdeck-jellyfin.git
   cd steamdeck-jellyfin
   ./install.sh http://192.168.178.20:8096
   ```

3. Wenn Steam läuft, wird „Jellyfin“ automatisch als Nicht-Steam-Spiel eingetragen. Sonst:
   Steam → *Spiele* → *Ein Nicht-Steam-Spiel zu meiner Bibliothek hinzufügen* → „Jellyfin“.
4. Zurück in den Gaming-Modus und „Jellyfin“ aus der Bibliothek starten.

Beim ersten Start meldest du dich einmal an. Die Anmeldung bleibt gespeichert – das gilt auch
für die Streaming-Dienste (Netflix, RTL+, Joyn …), dort einmal über die Webseite anmelden.

### Automatische Updates

Chromium, uBlock Origin Lite und SponsorBlock werden **täglich automatisch** aktualisiert
(systemd-Timer, läuft auch im Gaming-Modus). Ein neues Chromium gilt ab dem nächsten Start von
Jellyfin; läuft Jellyfin gerade, werden die Erweiterungen beim nächsten Durchlauf getauscht.

```bash
journalctl --user -u jellyfin-deck-update          # Protokoll ansehen
systemctl --user start jellyfin-deck-update         # sofort aktualisieren
```

Wurde Chromium systemweit über Discover installiert, kann das Update ohne Rechte fehlschlagen –
dann im Desktop-Modus über Discover aktualisieren.

### Jellyfin Deck selbst aktualisieren

```bash
cd steamdeck-jellyfin
git pull
./install.sh
```

Die gespeicherte Server-Adresse wird übernommen. Dabei werden auch uBlock Origin Lite und SponsorBlock auf den neuesten Stand gebracht. Der
Steam-Eintrag bleibt, wie er ist (samt Controller-Einstellung).

## Steuerung

**Überall:**

| Taste                 | Funktion                                       |
|-----------------------|------------------------------------------------|
| X                     | Dienste-Menü (Jellyfin, ARD, ZDF, YouTube, ARTE, RTL+, Netflix, Joyn, Plex) |
| Start (≡)             | Wiedergabe: Play/Pause                         |
| LB / RB               | Wiedergabe: 10 s zurück / 30 s vor             |
| View + Start halten   | Beenden (1,5 s gedrückt halten)                |

**In Jellyfin:**

| Taste                 | Funktion                                       |
|-----------------------|------------------------------------------------|
| D-Pad / linker Stick  | Navigieren (gedrückt halten zum Scrollen)      |
| A                     | Auswählen; in Textfeldern öffnet sich die Tastatur |
| B                     | Zurück                                         |
| Y                     | Suche                                          |
| View (⧉)              | Startseite                                     |

**Auf den anderen Seiten** (Mediatheken, YouTube, Netflix …):

| Taste                 | Funktion                                       |
|-----------------------|------------------------------------------------|
| D-Pad / linker Stick  | Zum nächsten Element springen (blauer Rahmen); im Video-Vollbild 10 s zurück/vor |
| A                     | Anklicken; in Textfeldern öffnet sich die Tastatur |
| B                     | Vollbild verlassen / Zurück                    |
| Y                     | Im Video: Vollbild an/aus; sonst Suche         |
| View (⧉)              | Startseite des Dienstes                        |
| Rechter Stick         | Mauszeiger – A klickt dann an der Zeigerposition (für alles, was das D-Pad nicht erreicht) |

Die Webseiten sind nicht für Controller gebaut. Das D-Pad springt zum nächstgelegenen
anklickbaren Element; klappt das irgendwo nicht (z. B. bei manchen Cookie-Bannern oder
Karussells), hilft der Mauszeiger auf dem rechten Stick.

**Bildschirmtastatur** (öffnet sich mit A in einem Textfeld, z. B. Suche oder Login):

| Taste      | Funktion                     |
|------------|------------------------------|
| D-Pad      | Taste wählen                 |
| A          | Tippen                       |
| X          | Löschen                      |
| Y          | Leerzeichen                  |
| LB         | Umschalt (Großbuchstaben/Sonderzeichen) |
| Start      | Fertig (auf Webseiten wird die Eingabe abgeschickt, z. B. die Suche) |
| B          | Schließen                    |

Alternativ funktioniert auch die Steam-Tastatur (Xbox-Taste + X).

## Einstellungen

`~/.config/jellyfin-deck/config`:

```bash
JELLYFIN_URL="http://192.168.178.20:8096"
SCALE="1"      # z. B. 1.25 oder 1.5, wenn die Oberfläche am TV zu klein ist
```

## Fehlerbehebung

- **Controller reagiert nicht oder bewegt die Maus:** In Steam bei „Jellyfin“ auf das
  Controller-Symbol → Layout **„Gamepad“** wählen (nicht „Webbrowser“ oder „Maus“).
- **Oberfläche ist nicht im TV-Modus:** Wird beim Start automatisch gesetzt. Notfalls in Jellyfin
  unter *Einstellungen → Anzeige → Anzeigemodus* „TV“ wählen.
- **Video ruckelt:** Jellyfin transkodiert dann wahrscheinlich. In der Wiedergabe unter
  *Einstellungen → Qualität* eine niedrigere Bitrate wählen oder den Server prüfen.
- **Netflix, RTL+ oder Joyn zeigen einen Abspielfehler (DRM):** Diese Dienste brauchen das
  Kopierschutz-Modul *Widevine*. Chromium lädt es normalerweise selbst nach – nach dem ersten
  Start ein paar Minuten warten und neu starten. Netflix spielt in Linux-Browsern höchstens in 720p.
- **YouTube zeigt doch Werbung / SponsorBlock fehlt:** `systemctl --user start jellyfin-deck-update`
  ausführen (oder `./install.sh` erneut); dabei werden uBlock Origin Lite und SponsorBlock in der
  neuesten Version geladen. (Das klassische
  uBlock Origin läuft im aktuellen Chromium nicht mehr, daher die Lite-Version.)
- **Neue Server-Adresse:** `./install.sh <neue-adresse>` erneut ausführen.

## Deinstallation

```bash
./uninstall.sh
```

Danach den Eintrag „Jellyfin“ in Steam entfernen.

## Dateien

| Datei                    | Zweck                                              |
|--------------------------|----------------------------------------------------|
| `install.sh`             | Installiert Chromium (Flatpak), uBlock Origin Lite, SponsorBlock, Launcher, Steam-Eintrag |
| `jellyfin-deck.sh`       | Launcher: startet Chromium im Kiosk-Modus           |
| `update.sh`              | Aktualisiert Chromium und die Erweiterungen         |
| `systemd/*`              | Timer, der `update.sh` täglich ausführt             |
| `extension/services.js`  | Liste der Dienste im Dienste-Menü                   |
| `extension/config.js`    | Jellyfin-Adresse (schreibt der Launcher bei jedem Start) |
| `extension/prelude.js`   | Erzwingt den TV-Modus von Jellyfin                  |
| `extension/gamepad.js`   | Controller-Eingaben → Jellyfin bzw. Webseiten       |
| `extension/spatnav.js`   | D-Pad-Navigation auf normalen Webseiten             |
| `extension/switcher.js`  | Dienste-Menü (X)                                    |
| `extension/osk.js/.css`  | Bildschirmtastatur                                  |
| `extension/deck.css`     | Dienste-Menü, Fokus-Rahmen, Mauszeiger              |
| `extension/background.js`| Tab-Wechsel, echte Klicks/Vollbild, Beenden         |
