/**
 * content.js
 * Работает в контексте страницы. Отвечает за:
 *  - режим "визуального выбора" элементов (hover-подсветка)
 *  - контекстное меню действий по клику
 *  - сами DOM-манипуляции (замена картинки, текст, стиль, скрытие, удаление, копирование)
 *  - поддержку SPA (MutationObserver) — подсветка не "залипает" на удалённых узлах
 */

(function () {
  'use strict';

  const NS = 'wm'; // префикс для всех наших классов/id, чтобы не конфликтовать со страницей

  let selectorActive = false;
  let hoveredEl = null;
  let overlayEl = null;
  let menuEl = null;
  let stylePanelEl = null;

  // ---------- 1. Оверлей подсветки ----------

  function createOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.id = `${NS}-overlay`;
    document.documentElement.appendChild(overlayEl);
    return overlayEl;
  }

  function positionOverlay(el) {
    if (!overlayEl || !el) return;
    const rect = el.getBoundingClientRect();
    overlayEl.style.top = `${rect.top + window.scrollY}px`;
    overlayEl.style.left = `${rect.left + window.scrollX}px`;
    overlayEl.style.width = `${rect.width}px`;
    overlayEl.style.height = `${rect.height}px`;
    overlayEl.style.display = 'block';
  }

  function hideOverlay() {
    if (overlayEl) overlayEl.style.display = 'none';
  }

  // ---------- 2. Генератор уникального CSS-селектора для элемента ----------

  function getUniqueSelector(el) {
    if (!(el instanceof Element)) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;

    const path = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
      let selector = node.tagName.toLowerCase();
      if (node.classList.length) {
        selector += '.' + Array.from(node.classList).map(c => CSS.escape(c)).join('.');
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === node.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(node) + 1;
          selector += `:nth-of-type(${idx})`;
        }
      }
      path.unshift(selector);
      node = parent;
    }
    return path.join(' > ');
  }

  // ---------- 3. Режим выбора: hover + click ----------

  function onMouseOver(e) {
    if (!selectorActive) return;
    if (isOwnUi(e.target)) return;
    hoveredEl = e.target;
    createOverlay();
    positionOverlay(hoveredEl);
  }

  function onScrollOrResize() {
    if (selectorActive && hoveredEl) positionOverlay(hoveredEl);
  }

  function isOwnUi(el) {
    return !!el.closest(`#${NS}-overlay, #${NS}-menu, #${NS}-style-panel`);
  }

  function onClick(e) {
    if (!selectorActive) return;
    if (isOwnUi(e.target)) return; // клики внутри своего UI не перехватываем
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e.target, e.clientX, e.clientY);
  }

  // ---------- 4. Контекстное меню действий ----------

  const ACTIONS = [
    { id: 'replace-image', label: '🖼 Заменить картинку' },
    { id: 'edit-text', label: '✏️ Изменить текст' },
    { id: 'edit-style', label: '🎨 Изменить стиль' },
    { id: 'hide', label: '🙈 Скрыть элемент' },
    { id: 'delete', label: '🗑 Удалить элемент' },
    { id: 'copy', label: '📋 Скопировать HTML/CSS' },
    { id: 'save-collection', label: '⭐ Сохранить в коллекцию' },
  ];

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    if (stylePanelEl) { stylePanelEl.remove(); stylePanelEl = null; }
  }

  function openContextMenu(target, x, y) {
    closeMenu();
    menuEl = document.createElement('div');
    menuEl.id = `${NS}-menu`;

    ACTIONS.forEach(action => {
      const item = document.createElement('button');
      item.className = `${NS}-menu-item`;
      item.textContent = action.label;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        runAction(action.id, target);
        if (action.id !== 'edit-style') closeMenu();
      });
      menuEl.appendChild(item);
    });

    document.documentElement.appendChild(menuEl);

    // позиционируем в пределах вьюпорта
    const menuRect = menuEl.getBoundingClientRect();
    let left = x, top = y;
    if (left + menuRect.width > window.innerWidth) left = window.innerWidth - menuRect.width - 8;
    if (top + menuRect.height > window.innerHeight) top = window.innerHeight - menuRect.height - 8;
    menuEl.style.left = `${left + window.scrollX}px`;
    menuEl.style.top = `${top + window.scrollY}px`;
  }

  document.addEventListener('click', (e) => {
    if (menuEl && !menuEl.contains(e.target)) closeMenu();
  }, true);

  // ---------- 5. Реализация действий ----------

  function runAction(actionId, el) {
    switch (actionId) {
      case 'replace-image': return actionReplaceImage(el);
      case 'edit-text': return actionEditText(el);
      case 'edit-style': return actionEditStyle(el);
      case 'hide': return actionHide(el);
      case 'delete': return actionDelete(el);
      case 'copy': return actionCopy(el);
      case 'save-collection': return actionSaveCollection(el);
    }
  }

  function actionReplaceImage(el) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    // Небольшое всплывающее окошко: либо загрузить файл, либо вставить URL
    const url = prompt('Вставьте URL картинки (или нажмите Отмена, чтобы выбрать файл с компьютера):');
    if (url) {
      applyImage(el, url);
      return;
    }
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => applyImage(el, reader.result);
      reader.readAsDataURL(file);
    });
    input.click();
  }

  function applyImage(el, src) {
    if (el.tagName === 'IMG') {
      el.src = src;
    } else {
      el.style.backgroundImage = `url("${src}")`;
      el.style.backgroundSize = 'cover';
    }
  }

  function actionEditText(el) {
    el.setAttribute('contenteditable', 'true');
    el.focus();
    const onBlur = () => {
      el.removeAttribute('contenteditable');
      el.removeEventListener('blur', onBlur);
    };
    el.addEventListener('blur', onBlur);
  }

  function actionHide(el) {
    el.style.setProperty('display', 'none', 'important');
  }

  function actionDelete(el) {
    el.remove();
  }

  function actionCopy(el) {
    const html = el.outerHTML;
    const css = Array.from(getComputedStyle(el))
      .map(prop => `${prop}: ${getComputedStyle(el).getPropertyValue(prop)};`)
      .join('\n');
    const text = `/* HTML */\n${html}\n\n/* CSS (computed) */\n${css}`;
    navigator.clipboard.writeText(text).catch(() => {
      // fallback для страниц с ограничениями Clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    });
  }

  function actionSaveCollection(el) {
    const selector = getUniqueSelector(el);
    const description = prompt('Краткое описание блока (для поиска в коллекции):', '') || '';
    browser.runtime.sendMessage({
      type: 'wm:saveToCollection',
      payload: {
        selector,
        description,
        url: location.href,
        title: document.title,
        html: el.outerHTML.slice(0, 5000),
        savedAt: Date.now(),
      },
    });
  }

  function actionEditStyle(el) {
    if (stylePanelEl) stylePanelEl.remove();
    stylePanelEl = document.createElement('div');
    stylePanelEl.id = `${NS}-style-panel`;

    const cs = getComputedStyle(el);
    stylePanelEl.innerHTML = `
      <div class="${NS}-style-row">
        <label>Цвет текста</label>
        <input type="color" data-prop="color" value="${rgbToHex(cs.color)}">
      </div>
      <div class="${NS}-style-row">
        <label>Фон</label>
        <input type="color" data-prop="background-color" value="${rgbToHex(cs.backgroundColor)}">
      </div>
      <div class="${NS}-style-row">
        <label>Размер шрифта</label>
        <input type="range" min="8" max="72" data-prop="font-size" value="${parseInt(cs.fontSize)}">
      </div>
      <button class="${NS}-style-close">Готово</button>
    `;
    document.documentElement.appendChild(stylePanelEl);

    stylePanelEl.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        const prop = input.dataset.prop;
        const value = prop === 'font-size' ? `${input.value}px` : input.value;
        el.style.setProperty(prop, value, 'important');
      });
    });
    stylePanelEl.querySelector(`.${NS}-style-close`).addEventListener('click', closeMenu);
  }

  function rgbToHex(rgb) {
    const m = rgb.match(/\d+/g);
    if (!m) return '#000000';
    return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
  }

  // ---------- 6. Вкл/выкл режима (hotkey из background.js) ----------

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'wm:toggleSelector') {
      selectorActive = !selectorActive;
      document.body.classList.toggle(`${NS}-selector-active`, selectorActive);
      if (!selectorActive) { hideOverlay(); closeMenu(); }
    }
  });

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('click', onClick, true);
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  // MutationObserver — если подсвеченный элемент исчез из DOM (SPA перерисовала страницу),
  // снимаем подсветку, чтобы не указывать "в никуда"
  const mo = new MutationObserver(() => {
    if (hoveredEl && !document.contains(hoveredEl)) {
      hoveredEl = null;
      hideOverlay();
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
