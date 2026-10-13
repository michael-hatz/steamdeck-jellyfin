// Liste der Dienste im Dienste-Menü (X). Wird von background.js und den Content-Scripts geladen.
(() => {
    'use strict';

    const jellyfinUrl = (self.JD_JELLYFIN_URL || '').replace(/\/+$/, '');

    const services = [
        { id: 'jellyfin', name: 'Jellyfin', url: `${jellyfinUrl}/web/index.html`, color: '#00a4dc' },
        { id: 'ard', name: 'ARD Mediathek', url: 'https://www.ardmediathek.de/', hosts: ['ardmediathek.de'], color: '#003480' },
        { id: 'zdf', name: 'ZDF Mediathek', url: 'https://www.zdf.de/', hosts: ['zdf.de'], color: '#fa7d19' },
        { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', hosts: ['youtube.com'], color: '#ff0000' },
        { id: 'arte', name: 'ARTE', url: 'https://www.arte.tv/de/', hosts: ['arte.tv'], color: '#fd4600' },
        { id: 'rtlplus', name: 'RTL+', url: 'https://plus.rtl.de/', hosts: ['plus.rtl.de'], color: '#e4002b' },
        { id: 'netflix', name: 'Netflix', url: 'https://www.netflix.com/browse', hosts: ['netflix.com'], color: '#b20710' },
        { id: 'joyn', name: 'Joyn', url: 'https://www.joyn.de/', hosts: ['joyn.de'], color: '#5b2bd8' },
        { id: 'plex', name: 'Plex', url: 'https://app.plex.tv/desktop/', hosts: ['plex.tv'], color: '#e5a00d' }
    ];

    function hostMatches(host, domain) {
        return host === domain || host.endsWith(`.${domain}`);
    }

    function serviceForUrl(url) {
        if (!url) return null;
        if (jellyfinUrl && url.startsWith(`${jellyfinUrl}/`)) return services[0];
        let host;
        try {
            host = new URL(url).hostname;
        } catch (e) {
            return null;
        }
        return services.find((s) => s.hosts && s.hosts.some((d) => hostMatches(host, d))) || null;
    }

    self.JellyfinDeckServices = { list: services, byId: (id) => services.find((s) => s.id === id), forUrl: serviceForUrl };
})();
