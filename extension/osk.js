// Bildschirmtastatur (QWERTZ), komplett per Controller bedienbar.
// gamepad.js leitet Eingaben hierher um, solange die Tastatur offen ist.
(() => {
    'use strict';

    const ROWS_LOWER = [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'ß'],
        ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'],
        ['y', 'x', 'c', 'v', 'b', 'n', 'm', '-', '.', '@', '_']
    ];
    const ROWS_UPPER = [
        ['!', '"', '§', '$', '%', '&', '/', '(', ')', '=', '?'],
        ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P', 'Ü'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ö', 'Ä'],
        ['Y', 'X', 'C', 'V', 'B', 'N', 'M', ',', ':', '#', '\'']
    ];
    // Sondertasten in der letzten Reihe: [Aktion, Beschriftung, Spaltenbreite]
    const SPECIAL_ROW = [
        ['shift', '⇧ Umschalt', 2],
        ['space', 'Leerzeichen', 5],
        ['backspace', '⌫ Löschen', 2],
        ['done', '✓ Fertig', 2]
    ];

    const SUGGESTION_LISTS = '.ytSearchboxComponentSuggestionsContainer, .sbdd_a, .sbsb_a';
    const SUGGESTION_OPTIONS = '[role="option"], .ytSearchboxComponentSuggestion, .sbsb_c';

    const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const nativeTextareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;

    let root = null;
    let preview = null;
    let grid = null;
    let target = null;
    let onDone = null;
    let shift = false;
    let row = 0;
    let col = 0;
    // Suchvorschläge der Seite (z. B. YouTube); Zeile -1 = Vorschlagszeile über den Tasten
    let suggestions = [];
    let suggestionTimer = null;
    let suggestionBar = null;

    function rows() {
        return (shift ? ROWS_UPPER : ROWS_LOWER).concat([SPECIAL_ROW]);
    }

    function build() {
        root = document.createElement('div');
        root.id = 'jellyfin-deck-osk';
        root.innerHTML = `
            <div class="jdo-preview"></div>
            <div class="jdo-suggestions"></div>
            <div class="jdo-grid"></div>
            <div class="jdo-hints">
                <span><b>A</b> Tippen</span>
                <span><b>X</b> Löschen</span>
                <span><b>Y</b> Leerzeichen</span>
                <span><b>LB</b> Umschalt</span>
                <span><b>Start</b> Fertig</span>
                <span><b>B</b> Schließen</span>
            </div>`;
        preview = root.querySelector('.jdo-preview');
        grid = root.querySelector('.jdo-grid');
        suggestionBar = root.querySelector('.jdo-suggestions');
        // Maus/Touch (z. B. abgedockt am Deck-Display)
        root.addEventListener('mousedown', (e) => e.preventDefault());
        root.addEventListener('click', (e) => {
            const key = e.target.closest('.jdo-key');
            if (!key) return;
            row = Number(key.dataset.row);
            col = Number(key.dataset.col);
            press();
        });
        document.documentElement.appendChild(root);
    }

    function render() {
        if (row < 0 && !suggestions.length) row = 0;
        suggestionBar.innerHTML = '';
        suggestions.forEach((text, ci) => {
            const el = document.createElement('div');
            el.className = 'jdo-key jdo-suggestion';
            el.textContent = text;
            if (row < 0 && ci === col) el.classList.add('jdo-focus');
            el.dataset.row = -1;
            el.dataset.col = ci;
            suggestionBar.appendChild(el);
        });
        const focused = suggestionBar.querySelector('.jdo-focus');
        if (focused) {
            // horizontal mitscrollen, ohne die Seite zu bewegen
            const bar = suggestionBar.getBoundingClientRect();
            const r = focused.getBoundingClientRect();
            if (r.left < bar.left) suggestionBar.scrollLeft -= bar.left - r.left + 20;
            else if (r.right > bar.right) suggestionBar.scrollLeft += r.right - bar.right + 20;
        }
        grid.innerHTML = '';
        rows().forEach((r, ri) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'jdo-row';
            r.forEach((k, ci) => {
                const special = Array.isArray(k);
                const el = document.createElement('div');
                el.className = 'jdo-key' + (special ? ' jdo-special' : '');
                el.textContent = special ? k[1] : k;
                if (special) el.style.flexGrow = k[2];
                if (special && k[0] === 'shift' && shift) el.classList.add('jdo-active');
                if (ri === row && ci === col) el.classList.add('jdo-focus');
                el.dataset.row = ri;
                el.dataset.col = ci;
                rowEl.appendChild(el);
            });
            grid.appendChild(rowEl);
        });
        renderPreview();
    }

    function renderPreview() {
        const value = target ? target.value : '';
        const shown = target && target.type === 'password' ? '•'.repeat(value.length) : value;
        preview.textContent = shown;
        preview.dataset.placeholder = (target && (target.placeholder || target.getAttribute('aria-label'))) || '';
    }

    function setValue(value) {
        const setter = target instanceof HTMLTextAreaElement ? nativeTextareaSetter : nativeValueSetter;
        setter.call(target, value);
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        renderPreview();
    }

    function type(text) {
        if (!target) return;
        const max = target.maxLength > 0 ? target.maxLength : Infinity;
        if (target.value.length + text.length > max) return;
        setValue(target.value + text);
    }

    function backspace() {
        if (target && target.value.length) setValue(target.value.slice(0, -1));
    }

    function toggleShift() {
        shift = !shift;
        render();
    }

    function press() {
        if (row < 0) {
            chooseSuggestion(suggestions[col]);
            return;
        }
        const k = rows()[row][col];
        if (!Array.isArray(k)) {
            type(k);
            return;
        }
        switch (k[0]) {
            case 'shift': toggleShift(); break;
            case 'space': type(' '); break;
            case 'backspace': backspace(); break;
            case 'done': finish(); break;
        }
    }

    function move(dr, dc) {
        const all = rows();
        const first = suggestions.length ? -1 : 0;
        if (dr !== 0) {
            const next = row + dr < first ? all.length - 1 : row + dr >= all.length ? first : row + dr;
            if (row < 0) {
                // aus der Vorschlagszeile: Tastenzeile in der Mitte
                col = Math.floor(all[next].length / 2);
            } else if (next >= 0) {
                // relative Position beibehalten, da die Sonderreihe weniger Tasten hat
                const rel = (col + 0.5) / all[row].length;
                col = Math.min(all[next].length - 1, Math.floor(rel * all[next].length));
            } else {
                col = 0;
            }
            row = next;
        } else {
            const len = row < 0 ? suggestions.length : all[row].length;
            col = (col + dc + len) % len;
        }
        render();
    }

    // Vorschlagsliste, die zum Textfeld gehört (ARIA-Combobox, YouTube-Suche …)
    function readSuggestions() {
        if (!target || target.type === 'password') return [];
        const lists = [];
        for (const attr of ['aria-controls', 'aria-owns']) {
            for (const id of (target.getAttribute(attr) || '').split(/\s+/)) {
                const el = id && document.getElementById(id);
                if (el) lists.push(el);
            }
        }
        if (!lists.length) {
            // Kein Verweis gesetzt: sichtbare Listbox in der Nähe des Felds
            let box = target.parentElement;
            for (let i = 0; box && i < 6 && !lists.length; i++, box = box.parentElement) {
                lists.push(...box.querySelectorAll('[role="listbox"]'));
            }
        }
        // YouTube hängt die Liste je nach Version ohne Verweis ins Dokument
        if (!lists.length) lists.push(...document.querySelectorAll(SUGGESTION_LISTS));
        const texts = [];
        for (const list of lists) {
            for (const option of list.querySelectorAll(SUGGESTION_OPTIONS)) {
                const r = option.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) continue;
                // erste Zeile: ohne „Entfernen“-Knöpfe o. Ä.
                const text = (option.innerText || option.textContent || '').trim().split('\n')[0].trim();
                if (text && !texts.includes(text)) texts.push(text);
            }
        }
        return texts;
    }

    function refreshSuggestions() {
        const next = readSuggestions();
        if (next.join('\n') === suggestions.join('\n')) return;
        suggestions = next;
        if (row < 0) col = Math.min(col, Math.max(0, suggestions.length - 1));
        render();
    }

    function chooseSuggestion(text) {
        if (!text) return;
        setValue(text);
        finish();
    }

    // done: wird bei „Fertig“ aufgerufen (nicht bei B), z. B. um eine Suche abzuschicken
    function open(input, done) {
        if (!root) build();
        target = input;
        onDone = done || null;
        shift = false;
        row = 1;
        col = 0;
        suggestions = [];
        root.classList.add('jdo-open');
        render();
        clearInterval(suggestionTimer);
        suggestionTimer = setInterval(refreshSuggestions, 300);
    }

    function close() {
        if (!root) return;
        clearInterval(suggestionTimer);
        suggestionTimer = null;
        root.classList.remove('jdo-open');
        if (target) target.focus();
        target = null;
        onDone = null;
    }

    function finish() {
        const done = onDone;
        close();
        if (done) done();
    }

    function isOpen() {
        return !!root && root.classList.contains('jdo-open');
    }

    // Wird von gamepad.js mit abstrakten Aktionen aufgerufen
    function handle(action) {
        switch (action) {
            case 'up': move(-1, 0); break;
            case 'down': move(1, 0); break;
            case 'left': move(0, -1); break;
            case 'right': move(0, 1); break;
            case 'select': press(); break;
            case 'backspace': backspace(); break;
            case 'space': type(' '); break;
            case 'shift': toggleShift(); break;
            case 'done': finish(); break;
            case 'back': close(); break;
        }
    }

    window.JellyfinDeckOSK = { open, close, isOpen, handle };
})();
