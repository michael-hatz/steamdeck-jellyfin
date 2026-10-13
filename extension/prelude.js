// Läuft vor jellyfin-web: TV-Layout erzwingen (D-Pad-Navigation, große Kacheln)
// und die eingebaute Gamepad-Unterstützung abschalten, damit Eingaben nicht
// doppelt verarbeitet werden – das übernimmt gamepad.js.
(() => {
    const service = self.JellyfinDeckServices.forUrl(location.href);
    if (!service || service.id !== 'jellyfin') return;
    try {
        localStorage.setItem('layout', 'tv');
        localStorage.setItem('enableGamepad', 'false');
    } catch (e) {
        console.warn('[jellyfin-deck] localStorage nicht verfügbar', e);
    }
})();
