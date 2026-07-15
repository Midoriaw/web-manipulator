# Web Manipulator — Firefox Extension (MVP)

## Пошаговый план реализации

1. **День 1–2: скелет и визуальный редактор.**
   Загрузить `manifest.json` + `content.js` + `content.css` через `about:debugging → This Firefox →
   Load Temporary Add-on → manifest.json`. Проверить hover-подсветку, контекстное меню, замену
   картинки и текста на 2–3 реальных сайтах (статический сайт, SPA на React, сайт с CSP).

2. **День 3–4: background + мониторинг сети.**
   Подключить `background.js`. Проверить, что медиа-файлы (mp4/mp3/m3u8) действительно попадают
   в `state`, что `filterResponseData` не роняет страницу (некоторые сайты используют
   Service Worker / Cache API, туда `webRequest` не всегда достаёт).

3. **День 5: popup UI.**
   Подключить `popup/`. Проверить обновление списков в реальном времени
   (`runtime.sendMessage('wm:stateUpdated')`), экспорт в cURL, скачивание через
   `browser.downloads`.

4. **День 6–7: коллекции.**
   `browser.storage.local` для метаданных, при необходимости — `IndexedDB` для скриншотов
   (сделать через `browser.tabs.captureVisibleTab` в background, т.к. content script не может
   сделать скриншот всей страницы).

5. **Тестирование в Firefox:**
   - `about:debugging#/runtime/this-firefox` → `Load Temporary Add-on`.
   - `web-ext run` (пакет `web-ext` от Mozilla) — авто-перезагрузка при изменении файлов,
     подсветка ошибок манифеста, симуляция разных версий Firefox.
   - `web-ext lint` — обязательная проверка перед публикацией на AMO.

6. **Публикация на AMO (addons.mozilla.org):**
   - Зарегистрировать аккаунт разработчика на AMO.
   - `web-ext build` → получить `.zip`.
   - Загрузить через `Submit a New Add-on`, выбрать "Listed" (публичный листинг) или
     "Unlisted" (для self-distribution).
   - Пройти автоматическую + иногда ручную проверку (AMO особенно придирчив к
     `webRequestBlocking`, `<all_urls>` и работе с чужим контентом — в описании обязательно
     объяснить назначение каждого разрешения).
   - Указать политику приватности (обязательна, т.к. расширение читает трафик пользователя).

## Проблемы и решения

### Ограничения WebExtensions API
- `browser.webRequest.filterResponseData` (чтение/изменение тела ответа) — **только Firefox**,
  в Chrome MV3 такого нет вообще (Chrome сильно урезал `webRequest` в пользу `declarativeNetRequest`,
  который не даёт читать тело ответа). Это одновременно наше конкурентное преимущество для Firefox
  и главный барьер при портировании на Chrome.
- `webRequest` не видит запросы, отданные из **Service Worker Cache API** или **HTTP/2 Server Push** —
  для таких сайтов список найденных медиа/API будет неполным.
- Content script не имеет доступа к JS-переменным страницы (изолированный "world") — если сайт
  генерирует картинку через `canvas.toDataURL()` без реального `<img>`, "Заменить картинку"
  не сработает штатно; нужен отдельный `page-injected script` через `<script>`-тег с обменом
  через `window.postMessage`.

### CORS при скачивании медиа
`browser.downloads.download()` скачивает файл **на уровне браузера**, а не через `fetch` со страницы —
поэтому обычный CORS (который относится к JS `fetch`/`XHR`) на скачивание не влияет. Проблема
возникает только для HLS (`.m3u8`): нужно скачать плейлист и все `.ts`-сегменты, затем
склеить — для этого сегменты приходится тянуть через `fetch` в background/offscreen-документе,
и тогда CORS уже актуален. Решение: делать запросы из **background script** (у него более
широкие сетевые права, чем у content script/страницы), а не с самой страницы; при необходимости
слать заголовки `Origin`/`Referer` как у оригинальной страницы.

### HLS → единый файл
Сегменты `.ts` скачиваются по очереди (`fetch` в background), затем через `ffmpeg.wasm`
(WebAssembly-сборка ffmpeg, работает в обычном JS-контексте) выполняется `concat` в `mp4`.
Важно: `ffmpeg.wasm` требует `SharedArrayBuffer`, что означает необходимость заголовков
`Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` **для страницы, где выполняется сборка**
— проще всего вынести эту работу в отдельную `background`-страницу расширения, а не в popup.

### SPA и динамический контент
Решается через `MutationObserver` (уже в `content.js`): если подсвеченный/выбранный элемент
пропал из DOM после ре-рендера React/Vue, подсветка снимается, а не "зависает в воздухе".
Для меню важно закрывать его при любых значимых DOM-изменениях под ним же.

### Отличия Chrome vs Firefox (на будущее портирование)
| Аспект | Firefox (MV2, сейчас) | Chrome (потребуется) |
|---|---|---|
| Background | persistent background page | MV3 service worker (нет постоянного состояния, нужно хранить всё в `storage`) |
| API namespace | `browser.*` (Promise) | `chrome.*` (callback, либо полифилл `webextension-polyfill`) |
| Чтение тела ответа | `webRequest.filterResponseData` | недоступно → придётся перехватывать через **инъекцию в `fetch`/`XMLHttpRequest.prototype`** на странице (page-script), что менее надёжно и не видит запросы вне JS-контекста страницы |
| webRequest blocking | доступен | сильно ограничен в MV3 (`declarativeNetRequest`) |
| Манифест | `manifest_version: 2`, `browser_specific_settings` | `manifest_version: 3`, `background.service_worker` |

Рекомендация: использовать `webextension-polyfill` с первого дня, даже разрабатывая только под
Firefox — это уже 70% готовности к порту.

## Монетизация и развитие

**Free:**
- Визуальный редактор (замена картинок/текста/стиля), скрытие/удаление элементов.
- Скачивание прямых mp4/mp3 (без HLS-склейки).
- До 20 сохранённых блоков в коллекции.

**Pro (подписка через внешний сайт + лицензионный ключ, т.к. AMO не даёт In-App Purchases):**
- Склейка HLS/DASH в единый файл (реальная "боль" многих пользователей).
- Безлимитные коллекции + "рецепты" (макросы из нескольких действий, воспроизводимые одной кнопкой).
- Экспорт коллекции блоков в готовый HTML/CSS-сниппет или Zapier/Make-совместимый JSON.
- Массовый экспорт всех перехваченных API в Postman-коллекцию одним файлом.
- Приоритетная поддержка + облачная синхронизация коллекций между устройствами.

**Продвижение на AMO:**
- Чёткие скриншоты "было/стало" в листинге (визуальная разница — лучший маркетинг для такого тула).
- SEO по названию: "download video firefox", "edit any website", "no-code page editor".
- Публикация коротких демо-видео (замена картинки на живом сайте за 5 секунд) в Reddit r/firefox,
  r/webdev, Product Hunt.
- Явное и честное описание permissions в листинге — снижает отклонения на ревью и повышает доверие.

**Портирование на Chrome:**
- Переход на MV3 + `webextension-polyfill`.
- Замена `filterResponseData` на инъекцию перехватчика `fetch`/`XHR` через `content_scripts` с
  `world: "MAIN"` (Chrome 111+) для чтения ответов на уровне страницы.
- Замена `persistent background` на событийную модель service worker + `chrome.storage.session`
  для временного state вместо переменных в памяти.
