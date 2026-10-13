// Räumliche Navigation für Seiten ohne eigene TV-Oberfläche (Mediatheken, YouTube, Netflix …):
// Das D-Pad springt zum nächstgelegenen bedienbaren Element in der gewünschten Richtung.
// Ein eigener Rahmen zeigt den Fokus, weil viele Seiten den Fokus-Rahmen ausblenden.
(() => {
    'use strict';

    const SELECTOR = [
        'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'video',
        '[tabindex]:not([tabindex="-1"])', '[role="button"]', '[role="link"]', '[role="tab"]',
        '[role="menuitem"]', '[role="option"]', '[role="checkbox"]', '[role="switch"]', '[contenteditable="true"]'
    ].join(',');
    const MIN_SIZE = 6;
    const OWN_UI = '#jellyfin-deck-osk, #jellyfin-deck-switcher, #jellyfin-deck-quit';

    let current = null;
    let ring = null;

    // Durchsucht auch offene Shadow-DOMs (z. B. Cookie-Banner)
    function collect(root, out) {
        for (const el of root.querySelectorAll('*')) {
            if (el.matches(SELECTOR)) out.push(el);
            if (el.shadowRoot) collect(el.shadowRoot, out);
        }
        return out;
    }

    function usable(el) {
        if (el.disabled || el.closest(OWN_UI) || el.closest('[inert], [aria-hidden="true"]')) return false;
        const r = el.getBoundingClientRect();
        if (r.width < MIN_SIZE || r.height < MIN_SIZE) return false;
        const style = getComputedStyle(el);
        return style.visibility !== 'hidden' && style.pointerEvents !== 'none' && Number(style.opacity) > 0.05;
    }

    // Ist ein Dialog offen (Cookie-Banner, Profilauswahl …), bleibt die Navigation darin
    function scope() {
        const dialogs = [...document.querySelectorAll('dialog[open], [aria-modal="true"], [role="dialog"], [role="alertdialog"]')]
            .filter((d) => {
                const r = d.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && getComputedStyle(d).visibility !== 'hidden';
            });
        return dialogs.length ? dialogs[dialogs.length - 1] : document;
    }

    function candidates() {
        const root = scope();
        const list = collect(root, []).filter(usable);
        // Elemente, die nur ein anderes Element umhüllen (z. B. <div tabindex><a>), nicht doppelt anspringen
        const set = new Set(list);
        const wrappers = new Set();
        for (const el of list) {
            let parent = el.parentElement;
            for (let i = 0; parent && i < 3; i++, parent = parent.parentElement) {
                if (set.has(parent) && sameRect(parent, el)) wrappers.add(parent);
            }
        }
        return list.filter((el) => !wrappers.has(el));
    }

    function sameRect(a, b) {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return Math.abs(ra.left - rb.left) < 4 && Math.abs(ra.top - rb.top) < 4
            && Math.abs(ra.width - rb.width) < 4 && Math.abs(ra.height - rb.height) < 4;
    }

    function inViewport(r) {
        return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    }

    // Abstand in Bewegungsrichtung + doppelt gewichteter seitlicher Versatz
    function score(from, to, dir) {
        const horizontal = dir === 'left' || dir === 'right';
        let gap;
        switch (dir) {
            case 'up': gap = from.top - to.bottom; break;
            case 'down': gap = to.top - from.bottom; break;
            case 'left': gap = from.left - to.right; break;
            case 'right': gap = to.left - from.right; break;
        }
        const fromCenter = horizontal ? (from.top + from.bottom) / 2 : (from.left + from.right) / 2;
        const toCenter = horizontal ? (to.top + to.bottom) / 2 : (to.left + to.right) / 2;
        // Überlappende Elemente gelten erst als „dahinter“, wenn ihr Mittelpunkt weiter liegt
        if (gap < 0) {
            const fromMid = horizontal ? (from.left + from.right) / 2 : (from.top + from.bottom) / 2;
            const toMid = horizontal ? (to.left + to.right) / 2 : (to.top + to.bottom) / 2;
            const ahead = dir === 'down' || dir === 'right' ? toMid - fromMid : fromMid - toMid;
            if (ahead <= 1 || gap < -Math.min(horizontal ? from.width : from.height, 30)) return Infinity;
            gap = 0;
        }
        const [lo1, hi1, lo2, hi2] = horizontal
            ? [from.top, from.bottom, to.top, to.bottom]
            : [from.left, from.right, to.left, to.right];
        const sideGap = Math.max(0, lo2 - hi1, lo1 - hi2);
        return gap + sideGap * 2 + Math.abs(fromCenter - toCenter) * 0.3;
    }

    function hasCurrent() {
        return !!current && current.isConnected && usable(current);
    }

    function focus(el) {
        current = el;
        if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        update();
    }

    // Erstes sichtbares Element in Leserichtung
    function focusFirst() {
        const list = candidates().filter((el) => inViewport(el.getBoundingClientRect()));
        list.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return Math.abs(ra.top - rb.top) > 10 ? ra.top - rb.top : ra.left - rb.left;
        });
        if (list.length) focus(list[0]);
        return list.length > 0;
    }

    function scrollPage(dir) {
        const amount = innerHeight * 0.4;
        const delta = { up: [0, -amount], down: [0, amount], left: [-amount, 0], right: [amount, 0] }[dir];
        scrollBy({ left: delta[0], top: delta[1], behavior: 'smooth' });
    }

    function move(dir) {
        if (!hasCurrent()) {
            // Fokus der Seite übernehmen (z. B. nach einem Klick), sonst neu beginnen
            const active = document.activeElement;
            if (active && active !== document.body && active.matches(SELECTOR) && usable(active)) current = active;
            else if (focusFirst()) return;
        }
        if (!current) {
            scrollPage(dir);
            return;
        }
        const from = current.getBoundingClientRect();
        let best = null;
        let bestScore = Infinity;
        for (const el of candidates()) {
            if (el === current) continue;
            const s = score(from, el.getBoundingClientRect(), dir);
            if (s < bestScore) {
                bestScore = s;
                best = el;
            }
        }
        if (best) focus(best);
        else scrollPage(dir);
    }

    function update() {
        if (!ring) {
            ring = document.createElement('div');
            ring.id = 'jellyfin-deck-focus';
            document.documentElement.appendChild(ring);
        }
        const show = hasCurrent() && !document.fullscreenElement;
        ring.classList.toggle('jdf-open', show);
        if (!show) return;
        const r = current.getBoundingClientRect();
        Object.assign(ring.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
    }

    function hide() {
        current = null;
        update();
    }

    window.JellyfinDeckNav = { move, focusFirst, update, hide, current: () => (hasCurrent() ? current : null) };
})();
