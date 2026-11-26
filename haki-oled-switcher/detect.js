/* Haki OLED — розумне визначення: інвертуємо світлі сторінки,
   але не чіпаємо ті, що вже темні.

   Важливо (виправлено 2026-11-23): багато сайтів накладають CSS із затримкою.
   У момент DOMContentLoaded фон <body> ще прозорий, тому старий детектор
   вирішував «не біле» і нічого не робив (наприклад, Kleinanzeigen).
   Тепер ми повторюємо перевірку до повного завантаження сторінки. */
(function () {
  'use strict';

  var root = document.documentElement;
  var SITES_KEY = 'sitesEnabled';
  var enabled = true;

  /* Зняття затемнення: наші CSS працюють ТІЛЬКИ під цими класами,
     тому достатньо прибрати класи й вставлені <style>. Сторінку не перезавантажуємо. */
  function strip() {
    root.classList.remove('haki-force-dark', 'haki-youtube', 'haki-twitch', 'haki-rezka');
    ['haki-youtube-oled', 'haki-twitch-oled'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  /* YouTube — особливий випадок (додано 25.11.2026).
     Сайт сам темний (#0f0f0f), тому загальна інверсія не потрібна.
     Ми перевизначаємо його власні кольорові змінні на чистий чорний.
     CSS вбудовано сюди, а не в manifest.json: Brave позначає unpacked-
     розширення як «потребує перезавантаження», коли міняти manifest,
     а зміни detect.js підхоплює автоматично. */
  function injectYouTubeCss() {
    if (document.getElementById('haki-youtube-oled')) return;
    var css = [
      'html {',
      '  color-scheme: dark !important;',
      '  background-color: #000 !important;',
      '  --yt-sys-color-baseline--base-background: #000 !important;',
      '  --yt-sys-color-baseline--raised-background: #0a0a0a !important;',
      '  --yt-sys-color-baseline--surface-container: #0a0a0a !important;',
      '  --yt-sys-color-baseline--menu-background: #0a0a0a !important;',
      '  --yt-sys-color-baseline--static-black: #000 !important;',
      '  --yt-sys-color-baseline--static-dark-grey: #0a0a0a !important;',
      '  --yt-sys-color-baseline--solid-background-inverse: #000 !important;',
      '  --yt-sys-color-baseline--overlay-solid-background-inverse: #000 !important;',
      '  --yt-sys-color-baseline--frosted-glass-desktop: rgba(0,0,0,.85) !important;',
      '  --yt-sys-color-baseline--frosted-glass-mobile: rgba(0,0,0,.8) !important;',
      '  --yt-sys-color-baseline--frost-container-heavy: rgba(0,0,0,.9) !important;',
      '  --yt-sys-color-baseline--frost-container-light: rgba(0,0,0,.3) !important;',
      '  --yt-sys-color-baseline--frost-container-medium: rgba(0,0,0,.6) !important;',
      '  --yt-sys-color-baseline--frost-container-semi-heavy: rgba(0,0,0,.75) !important;',
      '  --yt-sys-color-baseline--scrim-background-gradient-2: rgba(0,0,0,.3) !important;',
      '  --yt-sys-color-baseline--scrim-background-gradient-3: rgba(0,0,0,.6) !important;',
      '  --yt-sys-color-baseline--scrim-background-gradient-4: rgba(0,0,0,.9) !important;',
      '  --yt-sys-color-baseline--scrim-background-gradient-5: #000 !important;',
      '  --yt-deprecated-general-background-a: #000 !important;',
      '  --yt-deprecated-general-background-b: #000 !important;',
      '  --yt-deprecated-general-background-c: #000 !important;',
      '  --yt-deprecated-black-1: #0a0a0a !important;',
      '  --yt-deprecated-black-2: #080808 !important;',
      '  --yt-deprecated-black-3: #050505 !important;',
      '  --yt-deprecated-black-4: #000 !important;',
      '  --yt-deprecated-dark-surface-100: hsl(0,0%,0%) !important;',
      '  --yt-deprecated-luna-black: hsl(0,0%,0%) !important;',
      '  --paper-dialog-background-color: #0a0a0a !important;',
      '  --paper-listbox-background-color: #0a0a0a !important;',
      '  --paper-menu-background-color: #0a0a0a !important;',
      '  --yt-live-chat-background-color: #000 !important;',
      '  --yt-live-chat-header-background-color: #000 !important;',
      '  --yt-live-chat-ninja-message-background-color: #000 !important;',
      '}',
      'html, html body, html ytd-app { background-color: #000 !important; }',
      'html #masthead, html #background, html #skip-navigation, html #guide,',
      'html tp-yt-app-drawer, html #frosted-glass,',
      'html .ytSearchboxComponentInputBox, html .ytSearchboxComponentSuggestionsContainer,',
      'html ytd-miniplayer, html .ytdMiniplayerComponentContent,',
      'html ytd-miniplayer-info-bar, html yt-popover, html tp-yt-paper-dialog,',
      'html tp-yt-paper-material#expand-button, html ytd-refresh#refresh,',
      'html ytd-permission-role-bottom-bar-renderer, html #items.playlist-items {',
      '  background-color: #000 !important;',
      '}',
      'html ytd-button-renderer.style-scope.ytd-feed-filter-chip-bar-renderer,',
      'html .button-container.style-scope.ytd-rich-shelf-renderer,',
      'html .header.style-scope.ytd-playlist-panel-renderer,',
      'html .ytCollectionsStackCollectionStack1,',
      'html .ytCollectionsStackCollectionStack2, html .skeleton-bg-color {',
      '  background-color: #0a0a0a !important;',
      '}',
      'html .ytChipShapeActive, html #like-bar, html .ytSpecButtonShapeNextFilled {',
      '  background-color: #1c1c1c !important; color: #f1f1f1 !important;',
      '}',
      'html ytd-guide-entry-renderer:hover, html ytd-compact-link-renderer:hover {',
      '  background-color: #101010 !important;',
      '}',
      /* YouTube Music: плеєр має дуже специфічні правила сайту, тому підсилюємо селектори */
      '#player-bar-background#player-bar-background#player-bar-background,',
      'html body ytmusic-player-bar, html body ytmusic-app-layout,',
      'html body ytmusic-app-layout ytmusic-av-toggle,',
      'html body ytmusic-av-toggle .av-toggle,',
      'html body ytmusic-av-toggle .song-button,',
      'html body ytmusic-av-toggle .video-button,',
      'html body ytmusic-player-page ytmusic-info-panel-overview-view-model,',
      'html body ytmusic-player-bar #expanding-menu,',
      'html body ytmusic-player-bar #hover-time-info,',
      'html ytmusic-mealbar-promo-renderer, html ytmusic-popup-container {',
      '  background-color: #0a0a0a !important;',
      '}'
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'haki-youtube-oled';
    style.textContent = css;
    (document.head || root || document).appendChild(style);

    /* YouTube підвантажує свої таблиці стилів ПІСЛЯ нашого document_start,
       тому з однаковою специфічністю перемагає його правило. Після load
       перевішуємо наш style у кінець <head> — тоді каскад на нашому боці. */
    function bump() {
      if (!enabled || !root.classList.contains('haki-youtube')) return;
      if (!style.parentNode) return;
      style.parentNode.removeChild(style);
      (document.head || root || document).appendChild(style);
    }
    if (document.readyState === 'complete') bump();
    else {
      window.addEventListener('load', bump, { once: true });
      window.setTimeout(bump, 1500);
    }
  }

  /* Twitch — окремий випадок (додано 25.11.2026).
     Сайт темний сам, але його сірі поверхні (#0e0e10 / #18181b / #26262c)
     на OLED виглядають сірим. Перевизначаємо його власні кольорові змінні.
     Фірмові фіолетові кнопки, червоні індикатори й картинки не чіпаємо —
     інакше сайт втратить вигляд. */
  function injectTwitchCss() {
    if (!enabled) return;
    if (document.getElementById('haki-twitch-oled')) return;
    var css = [
      'html {',
      '  color-scheme: dark !important;',
      '  --color-background-body: #000 !important;',
      '  --color-background-base: #0a0a0a !important;',
      '  --color-background-alt: #0a0a0a !important;',
      '  --color-background-chat: #000 !important;',
      '  --color-background-pill: #0a0a0a !important;',
      '  --color-background-placeholder-walk: #0a0a0a !important;',
      '  --color-background-ftue-tooltip: #0a0a0a !important;',
      '  --color-background-snackbar-info: #0a0a0a !important;',
      '  --color-background-modal-mask: rgba(0,0,0,.9) !important;',
      '  --color-background-selectable: rgba(255,255,255,.05) !important;',
      '  --color-background-selectable-hover: rgba(255,255,255,.1) !important;',
      '  --color-background-segmented-button: rgba(255,255,255,.05) !important;',
      '  --color-background-tag-default: rgba(255,255,255,.05) !important;',
      '  --color-background-tag-hover: rgba(255,255,255,.1) !important;',
      '  --color-background-input-disabled: rgba(255,255,255,.05) !important;',
      '  --color-background-button-disabled: rgba(255,255,255,.06) !important;',
      '  --color-background-button-secondary-hover: rgba(255,255,255,.08) !important;',
      '  --color-background-button-secondary-active: rgba(255,255,255,.12) !important;',
      '  --color-background-button-text-hover: rgba(255,255,255,.08) !important;',
      '  --color-background-button-text-active: rgba(255,255,255,.12) !important;',
      '  --color-background-button-icon-primary-hover: rgba(255,255,255,.08) !important;',
      '  --color-background-interactable-hover: rgba(255,255,255,.08) !important;',
      '  --color-background-interactable-active: rgba(255,255,255,.12) !important;',
      '  --color-background-overlay-placeholder: rgba(255,255,255,.06) !important;',
      '  --color-background-range: rgba(255,255,255,.08) !important;',
      '  --color-border-base: rgba(255,255,255,.08) !important;',
      '  --color-border-tab: rgba(255,255,255,.08) !important;',
      '  --color-border-selectable-hover: rgba(255,255,255,.1) !important;',
      '  --color-border-keyboard-prompt: rgba(255,255,255,.1) !important;',
      '  --color-border-bottom-sheet-item: rgba(255,255,255,.1) !important;',
      '  --color-opac-gd-3: rgba(255,255,255,.08) !important;',
      '}',
      'html, html body, html #root { background-color: #000 !important; }',
      /* Жорстко задані сірі поверхні, які не слухаються змінних */
      'html .carousel-player-nav-arrow__container, html .carousel-metadata,',
      'html [class*="ScLayoutCssVars"] { background-color: #0a0a0a !important; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'haki-twitch-oled';
    style.textContent = css;
    (document.head || root || document).appendChild(style);
  }

  /* Rezka — особливий випадок (додано 2026-11-23).
     Сайт сам має нічну тему з темно-синім фоном. Загальна інверція робила
     її яскраво-білою. Для rezka-ua.pub та дзеркал замість інверсії
     підключаємо окремий rezka.css, який сам стежить за класом body. */
  function runDetection() {
    strip();

  if (/(^|\.)rezka/i.test(location.hostname)) {
    root.classList.remove('haki-force-dark');
    root.classList.add('haki-rezka');
    return;
  }

  if (/(^|\.)youtube\.com$/i.test(location.hostname)) {
    root.classList.remove('haki-force-dark');
    root.classList.add('haki-youtube');
    injectYouTubeCss();
    return;
  }

  if (/(^|\.)twitch\.tv$/i.test(location.hostname)) {
    root.classList.remove('haki-force-dark');
    root.classList.add('haki-twitch');
    injectTwitchCss();
    return;
  }

  var loaded = false;
  var ticks = 0;

  function luminance(color) {
    if (!color || color.indexOf('rgb') !== 0) return null;
    var m = color.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    return (0.2126 * Number(m[0]) + 0.7152 * Number(m[1]) + 0.0722 * Number(m[2])) / 255;
  }

  function backgrounds() {
    var list = [root, document.body];
    if (document.body) {
      var kids = document.body.children;
      for (var i = 0; i < Math.min(4, kids.length); i++) list.push(kids[i]);
    }
    return list.map(function (el) {
      return el ? getComputedStyle(el).backgroundColor : null;
    });
  }

  function evaluate(final) {
    if (!enabled || !root || !document.body) return;

    var scheme = getComputedStyle(root).colorScheme || '';
    if (scheme.indexOf('dark') !== -1) {
      // Сайт сам темний — скасовуємо інверсію, якщо вона вже ввімкнулась.
      root.classList.remove('haki-force-dark');
      return;
    }

    var isLight = backgrounds().some(function (c) {
      var l = luminance(c);
      return l !== null && l > 0.55;
    });

    if (isLight) {
      root.classList.add('haki-force-dark');
    } else if (final) {
      root.classList.remove('haki-force-dark');
    }
  }

  function retry() {
    if (!enabled) return;
    evaluate(false);          // до завантаження тільки додаємо, не знімаємо
    ticks++;
    if (!loaded && ticks < 25) window.setTimeout(retry, 100);
  }

  function finish() {
    if (!enabled) return;
    loaded = true;
    evaluate(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', retry, { once: true });
  } else {
    retry();
  }
  window.addEventListener('load', finish, { once: true });
  window.setTimeout(finish, 3000); // страхування, якщо load не спрацює

  /* НЕ додаємо MutationObserver на class/style!
     2026-11-23: спостерігач реагував на тисячі змін атрибутів Kleinanzeigen
     і кожного разу викликав getComputedStyle (forced reflow). Це підвішувало
     сторінку. Повторних перевірок вище (до load + через 3 сек) достатньо. */
  }

  function setEnabled(on) {
    enabled = on;
    if (on) runDetection();
    else strip();
  }

  /* Початковий стан лежить у chrome.storage_local — ним керують окремо
     сторінка налаштувань, контекстне меню й гаряча клавіша. */
  var query = {};
  query[SITES_KEY] = true;
  chrome.storage.local.get(query, function (data) {
    setEnabled(data[SITES_KEY] !== false);
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'haki-sites-changed') setEnabled(!!msg.enabled);
  });
})();
