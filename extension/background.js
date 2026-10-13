// Hintergrund-Dienst der Erweiterung:
//  - Dienste-Menü: wechselt zwischen den Tabs der Streaming-Dienste (ein Tab je Dienst,
//    damit Anmeldung und Position erhalten bleiben)
//  - Echte („vertrauenswürdige“) Klicks, Tasten und Vollbild über die Debugger-Schnittstelle.
//    Viele Seiten reagieren nicht auf per Skript erzeugte Klicks, und Vollbild ist nur nach
//    einer Nutzeraktion erlaubt. Die Debugger-Leiste blendet --silent-debugger-extension-api aus.
//  - Beenden (View + Start halten): schließt alle Fenster, Steam kehrt in die Bibliothek zurück.
importScripts('config.js', 'services.js');

const Services = self.JellyfinDeckServices;
const attached = new Set();

// Dienst → Tab-ID. In storage.session, weil der Service-Worker jederzeit neu starten kann.
async function serviceTabs() {
    const { serviceTabs } = await chrome.storage.session.get('serviceTabs');
    return serviceTabs || {};
}

async function rememberServiceTab(serviceId, tabId) {
    const map = await serviceTabs();
    map[serviceId] = tabId;
    await chrome.storage.session.set({ serviceTabs: map });
}

async function findServiceTab(serviceId) {
    const tabs = await chrome.tabs.query({});
    const map = await serviceTabs();
    const remembered = tabs.find((t) => t.id === map[serviceId]);
    if (remembered) return remembered;
    // z. B. der Jellyfin-Starttab oder ein Tab, den eine Seite selbst geöffnet hat
    return tabs
        .filter((t) => Services.forUrl(t.url || t.pendingUrl)?.id === serviceId)
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
}

async function switchTo(serviceId) {
    const service = Services.byId(serviceId);
    if (!service) return;
    const tab = await findServiceTab(serviceId);
    if (tab) {
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        await rememberServiceTab(serviceId, tab.id);
    } else {
        const created = await chrome.tabs.create({ url: service.url, active: true });
        await rememberServiceTab(serviceId, created.id);
    }
}

async function cdp(tabId, method, params) {
    if (!attached.has(tabId)) {
        try {
            await chrome.debugger.attach({ tabId }, '1.3');
        } catch (e) {
            // Nach einem Neustart des Service-Workers sind wir eventuell noch verbunden
            if (!String(e.message).includes('already attached')) throw e;
        }
        attached.add(tabId);
    }
    return chrome.debugger.sendCommand({ tabId }, method, params);
}

chrome.debugger.onDetach.addListener((source) => attached.delete(source.tabId));
chrome.tabs.onRemoved.addListener((tabId) => attached.delete(tabId));

async function click(tabId, x, y) {
    const base = { x, y, button: 'left', clickCount: 1 };
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
}

async function hover(tabId, x, y) {
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
}

const KEY_CODES = { Enter: 13, Escape: 27 };

async function pressKey(tabId, key) {
    const params = { key, code: key, windowsVirtualKeyCode: KEY_CODES[key], nativeVirtualKeyCode: KEY_CODES[key] };
    await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params });
    if (key === 'Enter') await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'char', text: '\r', ...params });
    await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}

// gamepad.js markiert den Player mit data-jd-fullscreen; mit userGesture gilt das als Nutzeraktion
async function requestFullscreen(tabId) {
    await cdp(tabId, 'Runtime.evaluate', {
        expression: "document.querySelector('[data-jd-fullscreen]')?.requestFullscreen()",
        userGesture: true
    });
}

async function quit() {
    const windows = await chrome.windows.getAll();
    for (const w of windows) chrome.windows.remove(w.id);
}

// Von einer Seite geöffnete Tabs schließen (B ohne Verlauf); der vorherige Tab wird wieder aktiv
async function closeOpenedTab(tabId) {
    const tab = await chrome.tabs.get(tabId);
    const tabs = await chrome.tabs.query({});
    if (!tab.openerTabId || tabs.length < 2) return;
    try {
        await chrome.tabs.update(tab.openerTabId, { active: true });
    } catch (e) {
        // Ursprungstab gibt es nicht mehr – Chromium wählt selbst einen anderen
    }
    await chrome.tabs.remove(tabId);
}

const handlers = {
    'switch': (m) => switchTo(m.service),
    'click': (m, tabId) => click(tabId, m.x, m.y),
    'hover': (m, tabId) => hover(tabId, m.x, m.y),
    'key': (m, tabId) => pressKey(tabId, m.key),
    'fullscreen': (m, tabId) => requestFullscreen(tabId),
    'close-tab': (m, tabId) => closeOpenedTab(tabId),
    'quit': () => quit()
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Altes Format aus Version 1.0
    if (message === 'jellyfin-deck:quit') message = { type: 'quit' };
    const handler = message && handlers[message.type];
    if (!handler) return false;
    handler(message, sender.tab && sender.tab.id)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => {
            console.warn('[jellyfin-deck]', message.type, e);
            sendResponse({ ok: false, error: String(e.message || e) });
        });
    return true;
});

// Andere Erweiterungen (z. B. SponsorBlock) öffnen bei der Installation eine Willkommensseite.
// Im Kiosk-Modus käme man dort nicht mehr weg – also gleich wieder schließen.
chrome.tabs.onUpdated.addListener((tabId, change) => {
    const url = change.url || '';
    if (url.startsWith('chrome-extension://') && !url.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
        chrome.tabs.remove(tabId);
    }
});
