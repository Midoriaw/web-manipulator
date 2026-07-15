/**
 * background.js
 * Persistent background page (Manifest V2, НЕ service worker — так и должно быть для Firefox).
 * Отвечает за:
 *  - обнаружение медиафайлов (video/audio/hls) в сетевом трафике
 *  - перехват XHR/fetch запросов вместе с телом ответа (через browser.webRequest.filterResponseData —
 *    это Firefox-специфичное API, которого нет в Chrome)
 *  - скачивание медиа через browser.downloads
 *  - переключение режима визуального редактора по хоткею
 *  - хранение коллекций в browser.storage.local
 */

'use strict';

// state[tabId] = { media: Map<url, info>, api: Map<requestId, info> }
const state = new Map();

const MEDIA_EXT_RE = /\.(mp4|webm|m3u8|mp3|m4a|ogg|mov|ts)(\?|$)/i;
const MEDIA_CONTENT_TYPE_RE = /^(video|audio)\//i;

function ensureTabState(tabId) {
  if (!state.has(tabId)) {
    state.set(tabId, { media: new Map(), api: new Map() });
  }
  return state.get(tabId);
}

// ---------- 1. Обнаружение медиа ----------

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const headers = details.responseHeaders || [];
    const contentType = (headers.find(h => h.name.toLowerCase() === 'content-type') || {}).value || '';

    const looksLikeMedia =
      MEDIA_CONTENT_TYPE_RE.test(contentType) ||
      contentType.includes('mpegurl') || // m3u8
      MEDIA_EXT_RE.test(details.url);

    if (looksLikeMedia) {
      const tabState = ensureTabState(details.tabId);
      tabState.media.set(details.url, {
        url: details.url,
        contentType,
        method: details.method,
        isHls: contentType.includes('mpegurl') || details.url.includes('.m3u8'),
        foundAt: Date.now(),
      });
      notifyPopup();
    }
  },
  { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'other'] },
  ['responseHeaders']
);

// ---------- 2. Перехват API-запросов (XHR/fetch) + тело ответа ----------

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    if (details.type !== 'xmlhttprequest') return;

    const tabState = ensureTabState(details.tabId);
    let requestBody = null;
    if (details.requestBody) {
      if (details.requestBody.raw) {
        try {
          requestBody = new TextDecoder('utf-8').decode(
            new Uint8Array(details.requestBody.raw[0].bytes)
          );
        } catch (e) { requestBody = '[binary]'; }
      } else if (details.requestBody.formData) {
        requestBody = JSON.stringify(details.requestBody.formData);
      }
    }

    tabState.api.set(details.requestId, {
      url: details.url,
      method: details.method,
      requestBody,
      startedAt: Date.now(),
      responseBody: null,
      responseHeaders: null,
    });

    // --- Чтение тела ответа через StreamFilter (только Firefox!) ---
    try {
      const filter = browser.webRequest.filterResponseData(details.requestId);
      const chunks = [];
      filter.ondata = (event) => {
        chunks.push(new Uint8Array(event.data));
        filter.write(event.data); // пропускаем данные дальше без изменений
      };
      filter.onstop = () => {
        filter.close();
        try {
          const total = chunks.reduce((n, c) => n + c.length, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) { merged.set(c, offset); offset += c.length; }
          const text = new TextDecoder('utf-8').decode(merged);
          const entry = tabState.api.get(details.requestId);
          if (entry) {
            // Храним только текстовые/JSON ответы разумного размера, чтобы не раздувать память
            entry.responseBody = text.length > 200000 ? text.slice(0, 200000) + '…[обрезано]' : text;
            notifyPopup();
          }
        } catch (e) { /* бинарные ответы игнорируем */ }
      };
    } catch (e) {
      // filterResponseData недоступен (например, страница из привилегированного контекста) — молча пропускаем
    }
  },
  { urls: ['<all_urls>'], types: ['xmlhttprequest'] },
  ['requestBody', 'blocking']
);

browser.webRequest.onSendHeaders.addListener(
  (details) => {
    const tabState = state.get(details.tabId);
    const entry = tabState && tabState.api.get(details.requestId);
    if (entry) entry.requestHeaders = details.requestHeaders;
  },
  { urls: ['<all_urls>'], types: ['xmlhttprequest'] },
  ['requestHeaders']
);

browser.webRequest.onCompleted.addListener(
  (details) => {
    const tabState = state.get(details.tabId);
    const entry = tabState && tabState.api.get(details.requestId);
    if (entry) {
      entry.status = details.statusCode;
      entry.responseHeaders = details.responseHeaders;
      notifyPopup();
    }
  },
  { urls: ['<all_urls>'], types: ['xmlhttprequest'] },
  ['responseHeaders']
);

// Чистим состояние при закрытии/обновлении вкладки
browser.tabs.onRemoved.addListener((tabId) => state.delete(tabId));
browser.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) state.delete(details.tabId);
});

// ---------- 3. Уведомление popup о новых данных ----------

function notifyPopup() {
  browser.runtime.sendMessage({ type: 'wm:stateUpdated' }).catch(() => {
    // popup может быть закрыт — это нормально, просто игнорируем ошибку
  });
}

// ---------- 4. Обработчики сообщений от content.js и popup.js ----------

browser.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.type) {
    case 'wm:getTabState': {
      const tabId = msg.tabId;
      const tabState = state.get(tabId) || { media: new Map(), api: new Map() };
      return Promise.resolve({
        media: Array.from(tabState.media.values()),
        api: Array.from(tabState.api.values()),
      });
    }

    case 'wm:downloadMedia': {
      return browser.downloads.download({
        url: msg.url,
        filename: msg.filename || undefined,
        saveAs: true,
      });
    }

    case 'wm:saveToCollection': {
      return saveToCollection(msg.payload);
    }

    case 'wm:getCollections': {
      return browser.storage.local.get('collections').then(r => r.collections || []);
    }

    case 'wm:deleteCollectionItem': {
      return browser.storage.local.get('collections').then(r => {
        const list = (r.collections || []).filter(i => i.savedAt !== msg.savedAt);
        return browser.storage.local.set({ collections: list });
      });
    }
  }
});

async function saveToCollection(item) {
  const { collections = [] } = await browser.storage.local.get('collections');
  collections.push(item);
  await browser.storage.local.set({ collections });
  return { ok: true };
}

// ---------- 5. Хоткей переключения режима редактора ----------

browser.commands.onCommand.addListener((command) => {
  if (command === 'toggle-selector') {
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs[0]) browser.tabs.sendMessage(tabs[0].id, { type: 'wm:toggleSelector' });
    });
  }
});

// ---------- 6. Контекстное меню правой кнопкой мыши (доп. точка входа) ----------

browser.contextMenus.create({
  id: 'wm-toggle-selector',
  title: 'Включить визуальный редактор',
  contexts: ['page'],
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'wm-toggle-selector' && tab) {
    browser.tabs.sendMessage(tab.id, { type: 'wm:toggleSelector' });
  }
});
