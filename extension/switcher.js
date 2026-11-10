// Dienste-Menü (Taste X): Kacheln für Jellyfin und die Streaming-Seiten.
// gamepad.js leitet Eingaben hierher um, solange das Menü offen ist.
// Auf der Startseite (start.html) ist das Menü immer offen und lässt sich nicht schließen.
(() => {
    'use strict';

    const COLUMNS = 4;
    const services = self.JellyfinDeckServices.list;
    const currentService = self.JellyfinDeckServices.forUrl(location.href);
    const startPage = !!window.JD_START_PAGE;

    let root = null;
    let index = 0;

    function build() {
        root = document.createElement('div');
        root.id = 'jellyfin-deck-switcher';
        root.innerHTML = `
            <div class="jds-panel">
                <div class="jds-title">Dienst wählen</div>
                <div class="jds-message"></div>
                <div class="jds-grid"></div>
                <div class="jds-hints">
                    <span><b>A</b> Öffnen</span>
                    ${startPage
                        ? '<span><b>View</b> + <b>Start</b> halten: Beenden</span>'
                        : '<span><b>B</b> / <b>X</b> Schließen</span>'}
                </div>
            </div>`;
        const grid = root.querySelector('.jds-grid');
        services.forEach((s, i) => {
            const tile = document.createElement('div');
            tile.className = 'jds-tile';
            tile.style.setProperty('--jds-color', s.color);
            tile.dataset.service = s.id;
            tile.innerHTML = '<span class="jds-name"></span><span class="jds-current">Aktuell</span><span class="jds-note"></span>';
            tile.querySelector('.jds-name').textContent = s.name;
            if (currentService && currentService.id === s.id) tile.classList.add('jds-is-current');
            tile.addEventListener('click', () => {
                index = i;
                select();
            });
            grid.appendChild(tile);
        });
        if (startPage) root.classList.add('jds-start');
        root.addEventListener('click', (e) => {
            if (e.target === root) close();
        });
        document.documentElement.appendChild(root);
    }

    function render() {
        root.querySelectorAll('.jds-tile').forEach((t, i) => t.classList.toggle('jds-focus', i === index));
    }

    function open() {
        if (!root) build();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        const cur = currentService ? services.indexOf(currentService) : 0;
        index = Math.max(0, cur);
        root.classList.add('jds-open');
        render();
    }

    function close() {
        if (startPage) return;
        if (root) root.classList.remove('jds-open');
    }

    function isOpen() {
        return !!root && root.classList.contains('jds-open');
    }

    function select() {
        const service = services[index];
        if (!service) return;
        close();
        if (currentService && currentService.id === service.id) return;
        // Von der Startseite aus wird ihr Tab zum Tab des Dienstes
        chrome.runtime.sendMessage({ type: 'switch', service: service.id, replace: startPage });
    }

    function move(delta) {
        index = Math.min(services.length - 1, Math.max(0, index + delta));
        render();
    }

    function handle(action) {
        switch (action) {
            case 'up': move(-COLUMNS); break;
            case 'down': move(COLUMNS); break;
            case 'left': move(-1); break;
            case 'right': move(1); break;
            case 'select': select(); break;
            case 'back': close(); break;
        }
    }

    // Kurzer Hinweis auf einer Kachel, z. B. „nicht erreichbar“ (leer: ausblenden)
    function setNote(serviceId, text) {
        if (!root) build();
        const tile = root.querySelector(`.jds-tile[data-service="${serviceId}"]`);
        if (tile) tile.querySelector('.jds-note').textContent = text || '';
    }

    // Meldung über den Kacheln, z. B. warum ein Dienst nicht geladen werden konnte
    function setMessage(text) {
        if (!root) build();
        root.querySelector('.jds-message').textContent = text || '';
    }

    window.JellyfinDeckSwitcher = { open, close, isOpen, handle, setNote, setMessage };
})();
