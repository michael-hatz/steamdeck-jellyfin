#!/usr/bin/env python3
"""Hinterlegt Bibliotheksbilder (Cover, Banner, Hero, Logo) für den Steam-Eintrag "Jellyfin".

Sucht in allen Steam-Konten den Nicht-Steam-Eintrag, dessen Programm jellyfin-deck.sh ist,
und kopiert die Bilder nach userdata/<Konto>/config/grid/. Vorhandene Bilder (z. B. selbst
gewählte) werden nicht überschrieben.

    python3 set-artwork.py <Ordner mit capsule.png, wide.png, hero.png, logo.png>
"""
import glob
import os
import shutil
import struct
import sys
import zlib

MARKER = "jellyfin-deck"
# Bild im Ordner -> Dateiname in grid/ (nach der App-ID)
ARTWORK = {
    "capsule.png": "p.png",    # Hochformat-Cover in der Bibliothek
    "wide.png": ".png",        # Querformat (zuletzt gespielt)
    "hero.png": "_hero.png",   # Hintergrund der Spielseite
    "logo.png": "_logo.png",   # Logo über dem Hintergrund
}


def parse_map(data, pos):
    """Liest eine Map aus Steams binärem VDF-Format ab pos; gibt (dict, neue Position) zurück."""
    result = {}
    while True:
        kind = data[pos]
        pos += 1
        if kind == 0x08:
            return result, pos
        end = data.index(b"\0", pos)
        key = data[pos:end].decode("utf-8", "replace").lower()
        pos = end + 1
        if kind == 0x00:
            result[key], pos = parse_map(data, pos)
        elif kind == 0x01:
            end = data.index(b"\0", pos)
            result[key] = data[pos:end].decode("utf-8", "replace")
            pos = end + 1
        elif kind == 0x02:
            result[key] = struct.unpack_from("<I", data, pos)[0]
            pos += 4
        else:
            raise ValueError(f"unbekannter VDF-Typ {kind:#x}")


def app_ids(vdf_path):
    with open(vdf_path, "rb") as f:
        shortcuts, _ = parse_map(f.read(), 0)
    for entry in shortcuts.get("shortcuts", {}).values():
        exe = entry.get("exe", "")
        if MARKER not in exe:
            continue
        appid = entry.get("appid")
        if not appid:
            # Ältere Steam-Versionen speichern keine appid; dann wird sie so berechnet
            appid = zlib.crc32((exe + entry.get("appname", "")).encode()) | 0x80000000
        yield appid


def main():
    src = sys.argv[1]
    home = os.path.expanduser("~")
    configs = set()
    for pattern in (".local/share/Steam/userdata/*/config", ".steam/steam/userdata/*/config"):
        configs.update(os.path.realpath(p) for p in glob.glob(os.path.join(home, pattern)))

    found = False
    for config in sorted(configs):
        vdf = os.path.join(config, "shortcuts.vdf")
        if not os.path.isfile(vdf):
            continue
        try:
            ids = list(app_ids(vdf))
        except (ValueError, IndexError, struct.error) as e:
            print(f"    WARNUNG: {vdf} nicht lesbar ({e}).")
            continue
        grid = os.path.join(config, "grid")
        for appid in ids:
            found = True
            os.makedirs(grid, exist_ok=True)
            for name, suffix in ARTWORK.items():
                target = os.path.join(grid, f"{appid}{suffix}")
                if not os.path.exists(target):
                    shutil.copyfile(os.path.join(src, name), target)
    return 0 if found else 1


if __name__ == "__main__":
    sys.exit(main())
