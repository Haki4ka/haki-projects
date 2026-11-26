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
  /* Рішення липке: після перефарбування сірого сайту в #000 повторна
     перевірка бачить уже чорний фон і без цього зняла б клас. */
  var appliedMode = null;
  var inFrame = window.self !== window.top;
  var parentDark = null;
  var shadowStyleId = 'haki-shadow-media';
  var SHADOW_CSS = 'video,img,canvas,picture,source,embed,object,[style*="background-image"]' +
    '{filter:invert(1) hue-rotate(180deg) contrast(0.625) !important}';

  /* iframe не інвертуємо вдруге — батько вже це робить. Проте медіа всередині
     треба інвертувати, бо батьківський фільтр перевертає і їх.
     Темні сайти всередині iframe, навпаки, скасовують батьківську інверсію. */
  function nativeDarkHost() {
    var h = location.hostname;
    return /(^|\.)youtube\.com$|(^|\.)twitch\.tv$|(^|\.)dailymotion\.com$|(^|\.)vimeo\.com$/i.test(h);
  }

  function luminance(color) {
    if (!color || color.indexOf('rgb') !== 0) return null;
    var m = color.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    /* Прозорий фон не є «темним» — інакше сайти з прозорим <body>
       (Pexels, Pixabay) ніколи не затемнювались. */
    if (m.length > 3 && Number(m[3]) < 0.15) return null;
    return (0.2126 * Number(m[0]) + 0.7152 * Number(m[1]) + 0.0722 * Number(m[2])) / 255;
  }

  function applyFrame(parentIsDark) {
    parentDark = !!parentIsDark;
    strip();
    if (!enabled) return;
    if (parentDark) root.classList.add(nativeDarkHost() ? 'haki-frame-native' : 'haki-frame-media');
  }

  /* Стиль для shadow DOM: звичайний CSS батьківського документа не діє
     всередині shadow root, тому відео там лишалось інвертованим. */
  function injectShadowStyles() {
    if (!enabled || !root.classList.contains('haki-force-dark')) return;
    var hosts = document.querySelectorAll('*');
    for (var i = 0; i < hosts.length; i++) {
      var sr = hosts[i].shadowRoot;
      if (!sr || sr.getElementById(shadowStyleId)) continue;
      var s = document.createElement('style');
      s.id = shadowStyleId;
      s.textContent = SHADOW_CSS;
      (sr.head || sr).appendChild(s);
    }
  }

  /* Темні плашки з білим текстом (кнопки, підписи поверх відео, бейджі)
     після загальної інверсії ставали БІЛИМИ. Перефарбовуємо їх до білого
     до інверсії — тоді після неї вони чорні зі світлим текстом.
     Кольорові акценти, картинки й медіа не чіпаємо. Один прохід, без
     спостерігача: getComputedStyle тут викликається один раз на елемент. */
  var fixedColors = [];
  function normalizeColors() {
    if (!enabled || !root.classList.contains('haki-force-dark')) return;
    var els = document.querySelectorAll('body *');
    for (var i = 0; i < els.length && i < 4000; i++) {
      var el = els[i];
      if (el.hasAttribute('data-haki-color-fix')) continue;
      if (/^(VIDEO|IMG|CANVAS|SVG|PICTURE|IFRAME|SOURCE|EMBED|OBJECT)$/.test(el.tagName)) continue;
      var s = getComputedStyle(el);
      var bg = s.backgroundColor;
      var l = luminance(bg);
      if (l === null || l > 0.28) continue;
      var p = (bg.match(/[\d.]+/g) || []).map(Number);
      if (p.length >= 3 && (Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2])) > 18) continue;
      var cl = luminance(s.color);
      if (cl === null || cl < 0.5) continue;
      if (s.backgroundImage && s.backgroundImage !== 'none') continue;
      if (s.backdropFilter && s.backdropFilter !== 'none') continue;
      var r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 12) continue;
      fixedColors.push({ el: el, bg: el.style.backgroundColor, color: el.style.color });
      el.style.setProperty('background-color', '#fff', 'important');
      el.style.setProperty('color', '#000', 'important');
      el.setAttribute('data-haki-color-fix', '1');
    }
  }
  function restoreColors() {
    for (var i = 0; i < fixedColors.length; i++) {
      var f = fixedColors[i];
      f.el.style.removeProperty('background-color');
      f.el.style.removeProperty('color');
      if (f.bg) f.el.style.backgroundColor = f.bg;
      if (f.color) f.el.style.color = f.color;
      f.el.removeAttribute('data-haki-color-fix');
    }
    fixedColors = [];
  }

  /* === УНІВЕРСАЛЬНИЙ ШАР (v3.3) ===========================================
     Багато сайтів не білі й не чорні, а СІРІ: #1f1f1f (jut.su), #161617
     (Yandex), #222428 (Google), #222 (yummyani.me). Інверсія їх псує,
     а старий детектор взагалі нічого не робив. Треба третій стан:
     не інвертувати, а перефарбувати сірі поверхні в чистий #000 і
     зробити текст щільним білим. Один прохід, без спостерігача атрибутів. */
  var surfaceFixes = [];
  function rgb(color) {
    if (!color || color.indexOf('rgb') !== 0) return null;
    var m = color.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 };
  }
  function gray(c) {
    if (!c) return null;
    var mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
    return { mx: mx, mn: mn, spread: mx - mn, l: (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 };
  }
  var SKIP_TAGS = /^(VIDEO|IMG|CANVAS|SVG|PICTURE|SOURCE|EMBED|OBJECT|IFRAME|SCRIPT|STYLE|NOSCRIPT)$/;

  function applySurfaceFix(mode) {
    if (!enabled) return;
    var invert = mode === 'invert';
    var cls = invert ? 'haki-force-dark' : 'haki-gray';
    if (!root.classList.contains(cls)) return;
    var els = document.querySelectorAll('body *');
    for (var i = 0; i < els.length && i < 8000; i++) {
      var el = els[i];
      if (el.hasAttribute('data-haki-surface')) continue;
      var isMedia = SKIP_TAGS.test(el.tagName);
      /* IMG не чіпаємо вміст, але його сірий фон — це та сама сіра
         плашка, що й у звичайного блоку (наприклад, постер yummyani.me). */
      if (isMedia && el.tagName !== 'IMG') continue;
      var s = getComputedStyle(el);
      var bgRaw = rgb(s.backgroundColor);
      var bg = gray(bgRaw);
      var fgRaw = rgb(s.color);
      var fg = gray(fgRaw);
      var r = el.getBoundingClientRect();
      if (r.width < 18 || r.height < 9) continue;
      var changes = [];
      var c;
      /* Колір/вагу/прозорість міняємо ТІЛЬКИ на елементах із власним
         текстом. Інакше opacity:1 знімає анімації й напівпрозорі серпанки
         усього контейнера — це ламає вигляд Google/Yandex. */
      var hasText = false;
      if (!isMedia) {
        var nodes = el.childNodes;
        for (var k = 0; k < nodes.length; k++) {
          if (nodes[k].nodeType === 3 && nodes[k].nodeValue && nodes[k].nodeValue.trim()) {
            hasText = true;
            break;
          }
        }
      }

      /* Сірі поверхні. На неінвертованих сайтах — просто в чорний.
         На інвертованих — у білий ДО інверсії (після неї стане чорним). */
      if (bg && bgRaw.a > 0.15 && bg.spread <= 16 && bg.mx >= 10 && bg.mx <= 110) {
        /* Картинку/градієнт не чіпаємо — міняємо тільки колір тла під нею.
           backdrop-filter лишаємо: він може бути частиною скляної панелі. */
        if (!(s.backdropFilter && s.backdropFilter !== 'none')) {
          c = { prop: 'background-color', val: invert ? '#ffffff' : '#000000' };
          changes.push(c);
        }
      }

      /* Сірий текст: тонкий, напівпрозорий або темно-сірий.
         Інвертовані сайти: чорний ДО інверсії = білий після.
         Сірі сайти: одразу щільний білий #eaeaea. */
      if (hasText && fg && fg.spread <= 32) {
        var needColor = false;
        if (invert) {
          needColor = fg.l > 0.12 || fgRaw.a < 0.92;
          if (needColor) changes.push({ prop: 'color', val: '#000000' });
        } else {
          needColor = fg.l < 0.92 || fgRaw.a < 0.92;
          if (needColor) changes.push({ prop: 'color', val: '#eaeaea' });
        }
        var op = parseFloat(s.opacity);
        if (!isNaN(op) && op < 0.85) changes.push({ prop: 'opacity', val: '1' });
        var w = parseInt(s.fontWeight, 10);
        if (!isNaN(w) && w > 0 && w < 400) changes.push({ prop: 'font-weight', val: '400' });
      }

      if (!changes.length) continue;
      var saved = { el: el };
      for (var j = 0; j < changes.length; j++) {
        c = changes[j];
        saved[c.prop] = el.style.getPropertyValue(c.prop);
        el.style.setProperty(c.prop, c.val, 'important');
      }
      surfaceFixes.push(saved);
      el.setAttribute('data-haki-surface', '1');
    }
  }

  function restoreSurfaceFix() {
    for (var i = 0; i < surfaceFixes.length; i++) {
      var f = surfaceFixes[i];
      ['background-color', 'color', 'opacity', 'font-weight'].forEach(function (prop) {
        f.el.style.removeProperty(prop);
        if (f[prop]) f.el.style.setProperty(prop, f[prop]);
      });
      f.el.removeAttribute('data-haki-surface');
    }
    surfaceFixes = [];
  }

  /* Зняття затемнення: наші CSS працюють ТІЛЬКИ під цими класами,
     тому достатньо прибрати класи й вставлені <style>. Сторінку не перезавантажуємо. */
  function strip() {
    restoreColors();
    restoreSurfaceFix();
    root.classList.remove('haki-force-dark', 'haki-gray', 'haki-youtube', 'haki-twitch', 'haki-rezka',
      'haki-frame-media', 'haki-frame-native');
    ['haki-youtube-oled', 'haki-twitch-oled'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    var hosts = document.querySelectorAll('*');
    for (var i = 0; i < hosts.length; i++) {
      var sr = hosts[i].shadowRoot;
      if (!sr) continue;
      var s = sr.getElementById ? sr.getElementById(shadowStyleId) : sr.querySelector('#' + shadowStyleId);
      if (s && s.parentNode) s.parentNode.removeChild(s);
    }
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
      'html [class*="ScLayoutCssVars"] { background-color: #000 !important; }',
      /* Ліва панель (стріми/підписки) і правий чат були сірими: #0e0e10 і #18181b.
         Перекриваємо й сам контейнер, і всі проміжні обгортки. */
      'html.haki-twitch [class*="side-nav"],',
      'html.haki-twitch [class*="channel-root__left-column"],',
      'html.haki-twitch [class*="channel-root__right-column"],',
      /* НЕ чіпаємо `[class*="chat-room"]` цілком! до нього входить
         `chat-room__viewer-card` — невидимий шар профілю користувача з
         `pointer-events:none`, що займає ВЕСЬ чат. Якщо дати йому чорне
         тло, він перекриває всі повідомлення (DOM є, а око нічого не бачить). */
      'html.haki-twitch section[class*="chat-room"],',
      'html.haki-twitch [class*="chat-room__content"],',
      'html.haki-twitch [class*="chat-wysiwyg"],',
      'html.haki-twitch [class*="chat-input"] { background-color: #000 !important; }',
      'html.haki-twitch [class*="chat-room__viewer-card"],',
      'html.haki-twitch [class*="chat-room__notifications"],',
      'html.haki-twitch [class*="celebration__overlay"] { background-color: transparent !important; }',
      'html.haki-twitch [class*="side-nav-card"] { background-color: #000 !important; }',
      'html.haki-twitch [class*="side-nav-card"]:hover,',
      'html.haki-twitch [class*="side-nav-card"]:focus { background-color: #0a0a0a !important; }',
      /* НЕ перекриваємо кольори в чаті! v3.2.0 ставила #d3d3d9 на всі
         дочірні елементи — імена, емодзі й посилання злились в одну сіру
         масу, а на деяких стрімах чат виглядав порожньою чорною панеллю.
         Лишаємо рідні кольори Twitch недоторканими. Тільки трохи
         збільшуємо вагу тексту, щоб він не був «прозорим». */
      'html.haki-twitch [class*="chat-line__message"] {',
      '  background-color: transparent !important;',
      '  font-weight: 400 !important; opacity: 1 !important;',
      '}'
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

    if (inFrame) {
      window.parent.postMessage({ type: 'haki-frame-request' }, '*');
      if (parentDark === null) {
        window.setTimeout(function () {
          if (parentDark === null) applyFrame(enabled);
        }, 1200);
      }
      return;
    }

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

  function backgrounds() {
    var list = [root, document.body];
    if (document.body) {
      var kids = document.body.children;
      for (var i = 0; i < Math.min(5, kids.length); i++) list.push(kids[i]);
    }
    return list.map(function (el) {
      return el ? getComputedStyle(el).backgroundColor : null;
    });
  }

  /* Дивимось на те, що реально видно у вікні: elementFromPoint + найближчий
     непрозорий предок. Це ловить білі сайти, у яких body прозорий, а фон
     заданий глибше (раніше такі сторінки лишались білими). */
  function visibleBackgrounds() {
    var pts = [[0.5, 0.45], [0.12, 0.2], [0.88, 0.2], [0.5, 0.85], [0.12, 0.72], [0.88, 0.72]];
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var el = document.elementFromPoint(innerWidth * pts[i][0], innerHeight * pts[i][1]);
      var guard = 0;
      while (el && guard++ < 12) {
        var c = getComputedStyle(el).backgroundColor;
        if (luminance(c) !== null) { out.push(c); break; }
        el = el.parentElement;
      }
    }
    return out;
  }

  function notifyFrames(on) {
    if (inFrame) return;
    try {
      for (var i = 0; i < window.frames.length; i++) {
        window.frames[i].postMessage({ type: 'haki-frame-state', enabled: !!on }, '*');
      }
    } catch (e) {}
  }

  function evaluate(final) {
    if (!enabled || !root || !document.body) return;

    var scheme = getComputedStyle(root).colorScheme || '';
    var schemeDark = scheme.indexOf('dark') !== -1;
    var vis = visibleBackgrounds();
    var samples = backgrounds().concat(vis);
    var isLight = samples.some(function (c) {
      var l = luminance(c);
      return l !== null && l > 0.58;
    });
    /* Сірі сайти: фон не білий, але й не чорний (#161617 … #555).
       Їх не інвертуємо — просто перефарбовуємо поверхні в #000. */
    var isGray = vis.length > 0 && vis.every(function (c) {
      var l = luminance(c);
      return l !== null && l >= 0.02 && l <= 0.36;
    });

    /* Якщо непрозорого фону не знайдено, браузер малює біле полотно —
       це теж світла сторінка (наприклад, example.com). */
    var fallbackLight = vis.length === 0 && !schemeDark;

    if (isLight || fallbackLight) {
      var wasOn = root.classList.contains('haki-force-dark');
      root.classList.remove('haki-gray');
      root.classList.add('haki-force-dark');
      appliedMode = 'force';
      if (!wasOn) normalizeColors();
      injectShadowStyles();
    } else if (isGray || appliedMode === 'gray') {
      var wasGray = root.classList.contains('haki-gray');
      root.classList.remove('haki-force-dark');
      root.classList.add('haki-gray');
      appliedMode = 'gray';
      if (!wasGray) applySurfaceFix('gray');
    } else if (final && !appliedMode) {
      root.classList.remove('haki-force-dark', 'haki-gray');
    }
    if (root.classList.contains('haki-force-dark') && final) applySurfaceFix('invert');
    notifyFrames(root.classList.contains('haki-force-dark'));
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
    window.setTimeout(function () {
      if (root.classList.contains('haki-force-dark')) {
        normalizeColors();
        applySurfaceFix('invert');
      } else if (root.classList.contains('haki-gray')) {
        applySurfaceFix('gray');
      }
    }, 1400);
    window.setTimeout(function () {
      if (root.classList.contains('haki-gray')) applySurfaceFix('gray');
      else if (root.classList.contains('haki-force-dark')) applySurfaceFix('invert');
    }, 4500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', retry, { once: true });
  } else {
    retry();
  }
  window.addEventListener('load', finish, { once: true });
  window.setTimeout(finish, 3000); // страхування, якщо load не спрацює
  window.setTimeout(injectShadowStyles, 4000);

  /* Вузький спостерігач ТІЛЬКИ на додані вузли з shadow root.
     Не читає getComputedStyle і не дивиться на class/style — саме це
     2026-11-23 підвішувало Kleinanzeigen. Тут лише пошук нових хостів
     і відкладене вставлення одного <style>. */
  if (window.MutationObserver && !inFrame) {
    var shadowTimer = null;
    var shadowObserver = new MutationObserver(function (list) {
      if (!enabled || !root.classList.contains('haki-force-dark')) return;
      var found = false;
      for (var i = 0; i < list.length && !found; i++) {
        var nodes = list[i].addedNodes;
        for (var j = 0; j < nodes.length && j < 200 && !found; j++) {
          var n = nodes[j];
          if (n.nodeType !== 1) continue;
          if (n.shadowRoot) { found = true; break; }
          if (n.querySelectorAll) {
            var kids = n.querySelectorAll('*');
            for (var k = 0; k < kids.length && k < 200; k++) {
              if (kids[k].shadowRoot) { found = true; break; }
            }
          }
        }
      }
      if (found) {
        if (shadowTimer) window.clearTimeout(shadowTimer);
        shadowTimer = window.setTimeout(injectShadowStyles, 300);
      }
    });
    shadowObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* НЕ додаємо MutationObserver на class/style!
     2026-11-23: спостерігач реагував на тисячі змін атрибутів Kleinanzeigen
     і кожного разу викликав getComputedStyle (forced reflow). Це підвішувало
     сторінку. Повторних перевірок вище (до load + через 3 сек) достатньо. */
  }

  function setEnabled(on) {
    enabled = on;
    if (on) runDetection();
    else {
      appliedMode = null;
      strip();
      notifyFrames(false);
    }
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

  /* Домовленість між сторінкою та iframe: батько повідомляє, чи він
     інвертує. Без цього вбудовані темні сайти ставали білими. */
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!d || typeof d !== 'object') return;
    if (inFrame && d.type === 'haki-frame-state') {
      applyFrame(!!d.enabled);
    } else if (!inFrame && d.type === 'haki-frame-request') {
      try {
        e.source.postMessage({
          type: 'haki-frame-state',
          enabled: enabled && root.classList.contains('haki-force-dark')
        }, '*');
      } catch (err) {}
    }
  });
})();
