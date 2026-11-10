// Startseite: zeigt das Dienste-Menü und, falls ein Dienst nicht geladen werden konnte
// (background.js leitet dann hierher um), den Grund. Prüft, ob Jellyfin erreichbar ist.
(() => {
    'use strict';

    const CHECK_INTERVAL = 5000;
    const CHECK_TIMEOUT = 4000;

    const Services = self.JellyfinDeckServices;
    const switcher = window.JellyfinDeckSwitcher;
    const jellyfinUrl = (self.JD_JELLYFIN_URL || '').replace(/\/+$/, '');

    function errorMessage(params) {
        const error = params.get('error');
        if (!error) return '';
        const service = Services.byId(params.get('service'));
        if (service && service.id === 'jellyfin') {
            return `Jellyfin unter ${jellyfinUrl} ist nicht erreichbar (${error}). ` +
                'Hat sich die Adresse geändert? Dann im Desktop-Modus ./install.sh <neue Adresse> ausführen.';
        }
        const name = service ? service.name : 'Die Seite';
        return `${name} konnte nicht geladen werden (${error}). Bitte die Internetverbindung prüfen.`;
    }

    async function checkJellyfin() {
        if (!jellyfinUrl || document.hidden) return;
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), CHECK_TIMEOUT);
        let ok = false;
        try {
            const res = await fetch(`${jellyfinUrl}/System/Info/Public`, { signal: abort.signal, cache: 'no-store' });
            ok = res.ok;
        } catch (e) {
            ok = false;
        } finally {
            clearTimeout(timer);
        }
        switcher.setNote('jellyfin', ok ? '' : 'nicht erreichbar');
    }

    const params = new URLSearchParams(location.search);
    switcher.setMessage(errorMessage(params));
    switcher.open();
    checkJellyfin();
    setInterval(checkJellyfin, CHECK_INTERVAL);
})();
