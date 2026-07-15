'use strict';

let currentTabId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  setupTabs();
  setupEditorToggle();
  await refreshAll();

  // перерисовываем списки при новых событиях из background
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'wm:stateUpdated') refreshAll();
  });
});

function setupTabs() {
  document.querySelectorAll('.wm-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.wm-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.wm-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function setupEditorToggle() {
  document.getElementById('toggle-editor').addEventListener('click', async () => {
    await browser.tabs.sendMessage(currentTabId, { type: 'wm:toggleSelector' });
    window.close(); // закрываем popup, чтобы не мешал работе на странице
  });
}

async function refreshAll() {
  const { media, api } = await browser.runtime.sendMessage({ type: 'wm:getTabState', tabId: currentTabId });
  renderMedia(media);
  renderApi(api);
  const collections = await browser.runtime.sendMessage({ type: 'wm:getCollections' });
  renderCollections(collections);
}

// ---------- Медиа ----------

function renderMedia(items) {
  const list = document.getElementById('media-list');
  if (!items.length) {
    list.innerHTML = '<p class="wm-empty">Пока ничего не найдено. Обновите страницу или проиграйте видео/аудио.</p>';
    return;
  }
  list.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'wm-list-item';
    row.innerHTML = `
      <div class="wm-item-title" title="${escapeHtml(item.url)}">
        ${item.isHls ? '📡 HLS-поток' : (item.contentType.startsWith('video') ? '🎬 Видео' : '🎵 Аудио')}
        <div class="wm-item-url">${escapeHtml(shorten(item.url))}</div>
      </div>
      <button class="wm-btn-download">Скачать</button>
    `;
    row.querySelector('.wm-btn-download').addEventListener('click', () => downloadMedia(item));
    list.appendChild(row);
  });
}

async function downloadMedia(item) {
  if (item.isHls) {
    alert(
      'Это HLS-поток (.m3u8). Для склейки сегментов в единый файл требуется ffmpeg.wasm — ' +
      'см. раздел «Проблемы и решения» в документации. Сейчас ссылка на плейлист будет скачана как есть.'
    );
  }
  await browser.runtime.sendMessage({ type: 'wm:downloadMedia', url: item.url });
}

// ---------- API ----------

function renderApi(items) {
  const list = document.getElementById('api-list');
  if (!items.length) {
    list.innerHTML = '<p class="wm-empty">Пока не перехвачено ни одного XHR/fetch запроса.</p>';
    return;
  }
  list.innerHTML = '';
  items
    .slice()
    .sort((a, b) => b.startedAt - a.startedAt)
    .forEach(item => {
      const row = document.createElement('div');
      row.className = 'wm-list-item wm-api-item';
      row.innerHTML = `
        <div class="wm-item-title">
          <span class="wm-method wm-method-${(item.method || 'GET').toLowerCase()}">${item.method}</span>
          <span class="wm-item-url" title="${escapeHtml(item.url)}">${escapeHtml(shorten(item.url))}</span>
          ${item.status ? `<span class="wm-status">${item.status}</span>` : ''}
        </div>
        <div class="wm-api-actions">
          <button class="wm-btn-json">JSON</button>
          <button class="wm-btn-curl">cURL</button>
        </div>
        <pre class="wm-json-view" hidden></pre>
      `;
      row.querySelector('.wm-btn-json').addEventListener('click', () => {
        const pre = row.querySelector('.wm-json-view');
        pre.hidden = !pre.hidden;
        if (!pre.hidden) pre.textContent = formatBody(item.responseBody);
      });
      row.querySelector('.wm-btn-curl').addEventListener('click', () => {
        navigator.clipboard.writeText(buildCurl(item));
      });
      list.appendChild(row);
    });
}

function formatBody(body) {
  if (!body) return '(тело ответа недоступно)';
  try { return JSON.stringify(JSON.parse(body), null, 2); }
  catch { return body; }
}

function buildCurl(item) {
  let cmd = `curl -X ${item.method} '${item.url}'`;
  (item.requestHeaders || []).forEach(h => {
    cmd += ` \\\n  -H '${h.name}: ${h.value}'`;
  });
  if (item.requestBody) {
    cmd += ` \\\n  --data-raw '${item.requestBody.replace(/'/g, "'\\''")}'`;
  }
  return cmd;
}

// ---------- Коллекции ----------

function renderCollections(items) {
  const list = document.getElementById('collections-list');
  if (!items || !items.length) {
    list.innerHTML = '<p class="wm-empty">Коллекция пуста. Кликните по элементу на странице → «Сохранить в коллекцию».</p>';
    return;
  }
  list.innerHTML = '';
  items
    .slice()
    .sort((a, b) => b.savedAt - a.savedAt)
    .forEach(item => {
      const row = document.createElement('div');
      row.className = 'wm-list-item';
      row.innerHTML = `
        <div class="wm-item-title">
          ⭐ ${escapeHtml(item.description || item.selector)}
          <div class="wm-item-url">${escapeHtml(shorten(item.url))}</div>
        </div>
        <button class="wm-btn-delete">✕</button>
      `;
      row.querySelector('.wm-btn-delete').addEventListener('click', async () => {
        await browser.runtime.sendMessage({ type: 'wm:deleteCollectionItem', savedAt: item.savedAt });
        refreshAll();
      });
      list.appendChild(row);
    });
}

// ---------- Утилиты ----------

function shorten(url, max = 60) {
  return url.length > max ? url.slice(0, max - 1) + '…' : url;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
