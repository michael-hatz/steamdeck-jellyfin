// Dienste-Menü (Taste X): Kacheln für Jellyfin und die Streaming-Seiten.
// gamepad.js leitet Eingaben hierher um, solange das Menü offen ist.
(() => {
    'use strict';

    const COLUMNS = 4;
    const services = self.JellyfinDeckServices.list;
    const currentService = self.JellyfinDeckServices.forUrl(location.href);

    let root = null;
    let index = 0;

    function build() {
        root = document.createElement('div');
        root.id = 'jellyfin-deck-switcher';
        root.innerHTML = `
            <div class="jds-panel">
                <div class="jds-title">Dienst wählen</div>
                <div class="jds-grid"></div>
                <div class="jds-hints">
                    <span><b>A</b> Öffnen</span>
                    <span><b>B</b> / <b>X</b> Schließen</span>
                </div>
            </div>`;
        const grid = root.querySelector('.jds-grid');
        services.forEach((s, i) => {
            const tile = document.createElement('div');
            tile.className = 'jds-tile';
            tile.style.setProperty('--jds-color', s.color);
            tile.innerHTML = '<span class="jds-name"></span><span class="jds-current">Aktuell</span>';
            tile.querySelector('.jds-name').textContent = s.name;
            if (currentService && currentService.id === s.id) tile.classList.add('jds-is-current');
            tile.addEventListener('click', () => {
                index = i;
                select();
            });
            grid.appendChild(tile);
        });
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
        if (root) root.classList.remove('jds-open');
    }

    function isOpen() {
        return !!root && root.classList.contains('jds-open');
    }

    function select() {
        const service = services[index];
        close();
        if (currentService && currentService.id === service.id) return;
        chrome.runtime.sendMessage({ type: 'switch', service: service.id });
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

    window.JellyfinDeckSwitcher = { open, close, isOpen, handle };
})();
