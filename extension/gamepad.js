// Übersetzt Controller-Eingaben (Gamepad-API, Standard-Mapping wie Xbox).
//
// Überall:
//   X                     Dienste-Menü (Jellyfin, Mediatheken, YouTube, Netflix …)
//   Start (≡)             Wiedergabe: Play/Pause
//   LB / RB               Wiedergabe: 10 s zurück / 30 s vor
//   View + Start halten   Beenden
//
// Jellyfin (TV-Layout, Tastatur-Navigation von jellyfin-web):
//   D-Pad / linker Stick  Navigation (mit Wiederholung beim Halten)
//   A                     Auswählen / Bildschirmtastatur in Textfeldern
//   B                     Zurück
//   Y                     Suche
//   View (⧉)              Startseite
//
// Andere Seiten (räumliche Navigation aus spatnav.js, echte Klicks über background.js):
//   D-Pad / linker Stick  Navigation; im Video-Vollbild: 10 s zurück / vor
//   A                     Anklicken (bzw. an der Zeigerposition klicken)
//   B                     Vollbild verlassen / Zurück
//   Y                     Video: Vollbild an/aus; sonst Suche
//   View (⧉)              Startseite des Dienstes
//   Rechter Stick         Mauszeiger (für alles, was die Navigation nicht erreicht)
(() => {
    'use strict';

    const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
    // Lösen beim Drücken aus; View und Start erst beim Loslassen (wegen der Beenden-Kombination)
    const PRESS_BUTTONS = [BTN.A, BTN.B, BTN.X, BTN.Y, BTN.LB, BTN.RB];
    const RELEASE_BUTTONS = [BTN.VIEW, BTN.START];
    const STICK_THRESHOLD = 0.6;
    const CURSOR_DEADZONE = 0.2;
    const CURSOR_SPEED = 22;
    const CURSOR_HIDE = 4000;
    const REPEAT_DELAY = 350;
    const REPEAT_INTERVAL = 110;
    const SEEK_BACK = 10;
    const SEEK_FORWARD = 30;
    const QUIT_HOLD = 1500;
    const AUTOFOCUS_INTERVAL = 500;

    const KEYS = {
        up: ['ArrowUp', 38],
        down: ['ArrowDown', 40],
        left: ['ArrowLeft', 37],
        right: ['ArrowRight', 39],
        enter: ['Enter', 13],
        back: ['Escape', 27]
    };

    const osk = window.JellyfinDeckOSK;
    const switcher = window.JellyfinDeckSwitcher;
    const nav = window.JellyfinDeckNav;
    const service = self.JellyfinDeckServices.forUrl(location.href);
    const isJellyfin = !!service && service.id === 'jellyfin';
    const prev = {};
    const repeat = { dir: null, next: 0 };
    const quit = { since: 0, sent: false, combo: false, overlay: null };
    const cursor = { el: null, x: innerWidth / 2, y: innerHeight / 2, lastMove: 0 };

    function send(message) {
        try {
            return chrome.runtime.sendMessage(message);
        } catch (e) {
            // Erweiterung wurde neu geladen – Seite muss neu geladen werden
            console.warn('[jellyfin-deck]', message.type, e);
            return Promise.resolve({ ok: false });
        }
    }

    function sendKey(name) {
        const [key, keyCode] = KEYS[name];
        const target = document.activeElement || document.body;
        const init = { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true };
        const down = new KeyboardEvent('keydown', init);
        target.dispatchEvent(down);
        target.dispatchEvent(new KeyboardEvent('keyup', init));
        return down.defaultPrevented;
    }

    function isTextInput(el) {
        if (!el) return false;
        if (el.tagName === 'TEXTAREA') return true;
        if (el.tagName !== 'INPUT') return false;
        return ['text', 'search', 'password', 'email', 'url', 'tel', 'number', ''].includes(el.type);
    }

    function isVisible(el) {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden';
    }

    function activeMedia() {
        const media = [...document.querySelectorAll('video, audio')].filter((m) => m.currentSrc);
        return media.find((m) => !m.paused) || media[0] || null;
    }

    function clickVisible(selector) {
        const el = [...document.querySelectorAll(selector)].find(isVisible);
        if (el) el.click();
        return !!el;
    }

    function seek(media, delta) {
        media.currentTime = Math.min(media.duration || Infinity, Math.max(0, media.currentTime + delta));
    }

    // ---------- Jellyfin ----------

    function hasFocus() {
        const el = document.activeElement;
        return !!el && el !== document.body && el !== document.documentElement && isVisible(el);
    }

    function focusFirst() {
        const candidates = document.querySelectorAll('.card, button, a[href], input, [tabindex="0"]');
        for (const c of candidates) {
            if (isVisible(c) && !c.disabled && !c.closest('#jellyfin-deck-osk, #jellyfin-deck-switcher')) {
                c.focus();
                return true;
            }
        }
        return false;
    }

    // Rückfall, falls beim Tastendruck nichts fokussiert ist: erst fokussieren, nicht weiterbewegen
    function ensureFocus() {
        if (hasFocus()) return true;
        focusFirst();
        return false;
    }

    // Hält immer ein Element fokussiert, damit schon der erste D-Pad-Druck navigiert.
    // Während der Wiedergabe nicht, sonst würde das ausgeblendete Player-Menü aufgehen.
    function autoFocus() {
        if (document.hidden || osk.isOpen() || switcher.isOpen() || activeMedia() || hasFocus()) return;
        focusFirst();
    }

    const jellyfin = {
        navigate(dir) {
            if (!ensureFocus()) return;
            sendKey(dir);
        },
        a() {
            const el = document.activeElement;
            if (isTextInput(el)) {
                osk.open(el);
                return;
            }
            if (!ensureFocus()) return;
            if (!sendKey('enter') && el && el !== document.body) el.click();
        },
        b() {
            sendKey('back');
        },
        y() {
            if (!clickVisible('.headerSearchButton')) location.hash = '#/search.html';
        },
        view() {
            if (!clickVisible('.headerHomeButton')) location.hash = '#/home.html';
        }
    };

    // ---------- Andere Seiten ----------

    function videoFullscreen() {
        const fs = document.fullscreenElement;
        return !!fs && (fs.tagName === 'VIDEO' || !!fs.querySelector('video'));
    }

    // Größtes Element um das Video herum, das kaum größer ist – meist der Player mit Bedienleiste
    function playerContainer(video) {
        const vr = video.getBoundingClientRect();
        let el = video;
        for (let p = video.parentElement; p && p !== document.body; p = p.parentElement) {
            const r = p.getBoundingClientRect();
            if (r.width > vr.width * 1.15 + 20 || r.height > vr.height * 1.3 + 20) break;
            el = p;
        }
        return el;
    }

    // Vollbild-Taste des Players – damit passt die Seite ihre Darstellung selbst an
    const FULLSCREEN_BUTTONS = [
        '.ytp-fullscreen-button', '[data-uia^="control-fullscreen"]',
        'button[aria-label*="vollbild" i]', 'button[title*="vollbild" i]',
        'button[aria-label*="fullscreen" i]', 'button[title*="fullscreen" i]', 'button[aria-label*="full screen" i]',
        '[role="button"][aria-label*="vollbild" i]', '[role="button"][aria-label*="fullscreen" i]'
    ].join(',');

    function toggleFullscreen(media) {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
            return;
        }
        const button = [...document.querySelectorAll(FULLSCREEN_BUTTONS)].find((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });
        if (button) {
            trustedClick(button);
            return;
        }
        document.querySelectorAll('[data-jd-fullscreen]').forEach((el) => el.removeAttribute('data-jd-fullscreen'));
        playerContainer(media).setAttribute('data-jd-fullscreen', '');
        send({ type: 'fullscreen' });
    }

    function focusSearch() {
        const selectors = [
            'input[type="search"]', 'input[name*="search" i]', 'input[placeholder*="such" i]', 'input[placeholder*="search" i]',
            'button[aria-label*="such" i]', 'a[aria-label*="such" i]', 'button[aria-label*="search" i]', 'a[aria-label*="search" i]',
            'a[href*="/suche"]', 'a[href*="/search"]'
        ];
        for (const sel of selectors) {
            const el = [...document.querySelectorAll(sel)].find(isVisible);
            if (!el) continue;
            if (isTextInput(el)) {
                el.focus();
                openKeyboard(el);
            } else {
                trustedClick(el);
            }
            return;
        }
    }

    function openKeyboard(input) {
        // „Fertig“ schickt die Eingabe mit einem echten Enter ab (z. B. YouTube-Suche)
        osk.open(input, () => send({ type: 'key', key: 'Enter' }));
    }

    // Echter Klick in die Mitte des Elements; per Skript erzeugte Klicks ignorieren viele Seiten
    async function trustedClick(el) {
        const r = el.getBoundingClientRect();
        const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
        const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
        const res = await send({ type: 'click', x, y });
        if (!res || !res.ok) el.click();
        afterClick();
    }

    // Hat der Klick ein Textfeld fokussiert, gleich die Tastatur öffnen
    function afterClick() {
        setTimeout(() => {
            const el = document.activeElement;
            if (isTextInput(el) && !osk.isOpen()) openKeyboard(el);
        }, 200);
    }

    function cursorVisible() {
        return !!cursor.el && cursor.el.classList.contains('jdc-open');
    }

    function hideCursor() {
        if (cursor.el) cursor.el.classList.remove('jdc-open');
    }

    function moveCursor(s, now) {
        const mag = Math.hypot(s.rx, s.ry);
        if (mag < CURSOR_DEADZONE) {
            if (cursorVisible() && now - cursor.lastMove > CURSOR_HIDE) hideCursor();
            return;
        }
        if (!cursor.el) {
            cursor.el = document.createElement('div');
            cursor.el.id = 'jellyfin-deck-cursor';
            document.documentElement.appendChild(cursor.el);
        }
        // quadratische Kennlinie: feinfühlig bei leichtem Ausschlag, schnell bei vollem
        const speed = CURSOR_SPEED * mag * mag;
        cursor.x = Math.min(innerWidth - 1, Math.max(0, cursor.x + (s.rx / mag) * speed));
        cursor.y = Math.min(innerHeight - 1, Math.max(0, cursor.y + (s.ry / mag) * speed));
        cursor.el.style.left = `${cursor.x}px`;
        cursor.el.style.top = `${cursor.y}px`;
        cursor.el.classList.add('jdc-open');
        nav.hide();
        // Hover auslösen (Menüs, Vorschaubilder), aber nicht bei jedem Frame
        if (now - cursor.lastMove > 100) send({ type: 'hover', x: cursor.x, y: cursor.y });
        cursor.lastMove = now;
    }

    const generic = {
        navigate(dir) {
            hideCursor();
            const media = activeMedia();
            if (media && videoFullscreen()) {
                if (dir === 'left') seek(media, -SEEK_BACK);
                if (dir === 'right') seek(media, SEEK_BACK);
                return;
            }
            nav.move(dir);
        },
        a() {
            if (cursorVisible()) {
                cursor.lastMove = performance.now();
                send({ type: 'click', x: cursor.x, y: cursor.y }).then(afterClick);
                return;
            }
            const el = nav.current();
            if (!el) {
                nav.focusFirst();
                return;
            }
            if (isTextInput(el)) openKeyboard(el);
            else trustedClick(el);
        },
        b() {
            hideCursor();
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            } else if (history.length > 1) {
                nav.hide();
                history.back();
            } else {
                send({ type: 'close-tab' });
            }
        },
        y() {
            const media = activeMedia();
            if (media && media.tagName === 'VIDEO') toggleFullscreen(media);
            else focusSearch();
        },
        view() {
            nav.hide();
            if (service) location.href = service.url;
        }
    };

    const mode = isJellyfin ? jellyfin : generic;

    // ---------- Gemeinsam ----------

    function navigate(dir) {
        if (osk.isOpen()) osk.handle(dir);
        else if (switcher.isOpen()) switcher.handle(dir);
        else mode.navigate(dir);
    }

    function onPress(btn) {
        if (osk.isOpen()) {
            switch (btn) {
                case BTN.A: osk.handle('select'); break;
                case BTN.B: osk.handle('back'); break;
                case BTN.X: osk.handle('backspace'); break;
                case BTN.Y: osk.handle('space'); break;
                case BTN.LB: osk.handle('shift'); break;
            }
            return;
        }
        if (switcher.isOpen()) {
            switch (btn) {
                case BTN.A: switcher.handle('select'); break;
                case BTN.B:
                case BTN.X: switcher.handle('back'); break;
            }
            return;
        }

        const media = activeMedia();
        switch (btn) {
            case BTN.A: mode.a(); break;
            case BTN.B: mode.b(); break;
            case BTN.X:
                hideCursor();
                switcher.open();
                break;
            case BTN.Y: mode.y(); break;
            case BTN.LB:
                if (media) seek(media, -SEEK_BACK);
                break;
            case BTN.RB:
                if (media) seek(media, SEEK_FORWARD);
                break;
        }
    }

    function onRelease(btn) {
        if (osk.isOpen()) {
            if (btn === BTN.START) osk.handle('done');
            return;
        }
        if (switcher.isOpen()) return;
        if (btn === BTN.VIEW) {
            mode.view();
        } else if (btn === BTN.START) {
            const media = activeMedia();
            if (media) media.paused ? media.play() : media.pause();
        }
    }

    function showQuitOverlay(progress) {
        if (!quit.overlay) {
            quit.overlay = document.createElement('div');
            quit.overlay.id = 'jellyfin-deck-quit';
            quit.overlay.innerHTML = '<div class="jdq-label">Zum Beenden gedrückt halten …</div><div class="jdq-bar"><div></div></div>';
            document.documentElement.appendChild(quit.overlay);
        }
        quit.overlay.classList.add('jdq-open');
        quit.overlay.querySelector('.jdq-bar > div').style.width = `${Math.min(100, progress * 100)}%`;
    }

    function hideQuitOverlay() {
        if (quit.overlay) quit.overlay.classList.remove('jdq-open');
    }

    function requestQuit() {
        quit.overlay.querySelector('.jdq-label').textContent = 'Wird beendet …';
        send({ type: 'quit' });
    }

    function handleQuitCombo(s, now) {
        if (s.buttons[BTN.VIEW] && s.buttons[BTN.START]) {
            if (!quit.since) {
                quit.since = now;
                // Im Vollbild wäre die Anzeige nicht zu sehen
                if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            }
            quit.combo = true;
            const progress = (now - quit.since) / QUIT_HOLD;
            showQuitOverlay(progress);
            if (progress >= 1 && !quit.sent) {
                quit.sent = true;
                requestQuit();
            }
        } else if (quit.since) {
            quit.since = 0;
            quit.sent = false;
            hideQuitOverlay();
        }
    }

    function strongest(a, b) {
        return Math.abs(b || 0) > Math.abs(a) ? b : a;
    }

    function readPads() {
        // Alle verbundenen Pads zusammenführen (Steam stellt ggf. mehrere virtuelle bereit)
        const state = { buttons: [], x: 0, y: 0, rx: 0, ry: 0 };
        for (const pad of navigator.getGamepads()) {
            if (!pad || !pad.connected) continue;
            pad.buttons.forEach((b, i) => { state.buttons[i] = state.buttons[i] || b.pressed; });
            state.x = strongest(state.x, pad.axes[0]);
            state.y = strongest(state.y, pad.axes[1]);
            state.rx = strongest(state.rx, pad.axes[2]);
            state.ry = strongest(state.ry, pad.axes[3]);
        }
        return state;
    }

    function currentDirection(s) {
        if (s.buttons[BTN.UP] || s.y < -STICK_THRESHOLD) return 'up';
        if (s.buttons[BTN.DOWN] || s.y > STICK_THRESHOLD) return 'down';
        if (s.buttons[BTN.LEFT] || s.x < -STICK_THRESHOLD) return 'left';
        if (s.buttons[BTN.RIGHT] || s.x > STICK_THRESHOLD) return 'right';
        return null;
    }

    function poll() {
        if (document.hidden) return;
        const s = readPads();
        const now = performance.now();

        handleQuitCombo(s, now);

        const dir = currentDirection(s);
        if (dir !== repeat.dir) {
            repeat.dir = dir;
            repeat.next = now + REPEAT_DELAY;
            if (dir) navigate(dir);
        } else if (dir && now >= repeat.next) {
            repeat.next = now + REPEAT_INTERVAL;
            navigate(dir);
        }

        if (!isJellyfin && !osk.isOpen() && !switcher.isOpen()) moveCursor(s, now);

        for (const btn of PRESS_BUTTONS) {
            const pressed = !!s.buttons[btn];
            if (pressed && !prev[btn]) onPress(btn);
            prev[btn] = pressed;
        }
        for (const btn of RELEASE_BUTTONS) {
            const pressed = !!s.buttons[btn];
            if (!pressed && prev[btn] && !quit.combo) onRelease(btn);
            prev[btn] = pressed;
        }
        // Kombination gilt als beendet, sobald beide Tasten losgelassen sind
        if (!s.buttons[BTN.VIEW] && !s.buttons[BTN.START]) quit.combo = false;

        if (!isJellyfin) nav.update();
    }

    // Beim Wechsel des Dienstes läuft die Wiedergabe im Hintergrund-Tab sonst weiter
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) return;
        for (const m of document.querySelectorAll('video, audio')) {
            if (!m.paused) m.pause();
        }
    });

    // Der Browser meldet den Controller erst beim ersten Tastendruck – dann sofort auswerten,
    // damit auch ein sehr kurzer Druck nicht zwischen zwei Abfragen verloren geht.
    window.addEventListener('gamepadconnected', poll);
    setInterval(poll, 16);
    if (isJellyfin) setInterval(autoFocus, AUTOFOCUS_INTERVAL);
})();
