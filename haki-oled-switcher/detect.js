
(function () {
  'use strict';

  var root = document.documentElement;
  var SITES_KEY = 'sitesEnabled';
  var GRAY_KEY = 'graySites';
  var EXCLUDE_KEY = 'excludedSites';
  var BG_ATTR = 'data-haki-bgmedia';
  var enabled = true;
  var graySites = [];
  var excludedSites = [];

  var appliedMode = null;
  var inFrame = window.self !== window.top;
  var parentDark = null;
  var shadowStyleId = 'haki-shadow-media';
  var SHADOW_CSS = 'video,img,canvas,picture,source,embed,object,[style*="background-image"],[data-haki-bgmedia]' +
    '{filter:invert(1) hue-rotate(180deg) contrast(0.625) !important}';

  
  function nativeDarkHost() {
    var h = location.hostname;
    return /(^|\.)youtube\.com$|(^|\.)twitch\.tv$|(^|\.)dailymotion\.com$|(^|\.)vimeo\.com$/i.test(h);
  }

  function normalizeDomain(value) {
    var s = String(value || '').trim().toLowerCase();
    if (!s) return '';
    if (s.indexOf('://') === -1) s = 'https://' + s;
    try { s = new URL(s).hostname.toLowerCase(); }
    catch (e) { return ''; }
    return s.replace(/^www\./, '').replace(/^\.+|\.+$/g, '');
  }

  function hostInList(list) {
    var host = location.hostname.toLowerCase().replace(/^www\./, '');
    for (var i = 0; i < list.length; i++) {
      var d = normalizeDomain(list[i]);
      if (d && (host === d || host.slice(-(d.length + 1)) === '.' + d)) return true;
    }
    return false;
  }

  function hostInGrayList() { return hostInList(graySites); }
  function hostInExcludeList() { return hostInList(excludedSites); }

  function luminance(color) {
    if (!color || color.indexOf('rgb') !== 0) return null;
    var m = color.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    
    if (m.length > 3 && Number(m[3]) < 0.15) return null;
    return (0.2126 * Number(m[0]) + 0.7152 * Number(m[1]) + 0.0722 * Number(m[2])) / 255;
  }

  function applyFrame(parentIsDark) {
    parentDark = !!parentIsDark;
    strip();
    if (!enabled) return;
    if (parentDark) root.classList.add(nativeDarkHost() ? 'haki-frame-native' : 'haki-frame-media');
  }

  
  function eachShadowRoot(node, cb, depth) {
    if (!node || !node.querySelectorAll || depth > 5) return;
    var hosts = node.querySelectorAll('*');
    for (var i = 0; i < hosts.length; i++) {
      var sr = hosts[i].shadowRoot;
      if (!sr) continue;
      cb(sr);
      eachShadowRoot(sr, cb, depth + 1);
    }
  }

  function injectShadowStyles() {
    if (!enabled || !root.classList.contains('haki-force-dark')) return;
    function put(sr) {
      if (sr.getElementById && sr.getElementById(shadowStyleId)) return;
      var s = document.createElement('style');
      s.id = shadowStyleId;
      s.textContent = SHADOW_CSS;
      (sr.head || sr).appendChild(s);
    }
    eachShadowRoot(document, put, 0);
  }

  
  var taggedBg = [];
  function tagBackgroundMedia() {
    if (!enabled || !root.classList.contains('haki-force-dark')) return;
    function scan(node) {
      var els = node.querySelectorAll ? node.querySelectorAll('*') : [];
      for (var i = 0; i < els.length && i < 6000; i++) {
        var el = els[i];
        if (el.hasAttribute && el.hasAttribute(BG_ATTR)) continue;
        var st = getComputedStyle(el);
        if (!st.backgroundImage || st.backgroundImage === 'none') continue;
        var r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 12) continue;
        el.setAttribute(BG_ATTR, '1');
        taggedBg.push(el);
      }
    }
    scan(document.body || document);
    eachShadowRoot(document, scan, 0);
  }

  function untagBackgroundMedia() {
    for (var i = 0; i < taggedBg.length; i++) taggedBg[i].removeAttribute(BG_ATTR);
    taggedBg = [];
  }

  
  var fixedColors = [];
  function normalizeColors() {
    if (!enabled || !root.classList.contains('haki-force-dark')) return;
    var plan = [];
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
      plan.push({ el: el, bg: el.style.backgroundColor, color: el.style.color });
    }
    for (var j = 0; j < plan.length; j++) {
      var f = plan[j];
      fixedColors.push(f);
      f.el.style.setProperty('background-color', '#fff', 'important');
      f.el.style.setProperty('color', '#000', 'important');
      f.el.setAttribute('data-haki-color-fix', '1');
    }
    tagBackgroundMedia();
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
    if (invert) tagBackgroundMedia();
    var plan = [];
    var els = document.querySelectorAll('body *');
    for (var i = 0; i < els.length && i < 8000; i++) {
      var el = els[i];
      if (el.hasAttribute('data-haki-surface')) continue;
      var isMedia = SKIP_TAGS.test(el.tagName);

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

      if (bg && bgRaw.a > 0.15 && bg.spread <= 16 && bg.mx >= 10 && bg.mx <= 110) {
        if (!(s.backdropFilter && s.backdropFilter !== 'none')) {
          changes.push({ prop: 'background-color', val: invert ? '#ffffff' : '#000000' });
        }
      }

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
      var saved = { el: el, changes: changes };
      for (var j = 0; j < changes.length; j++) {
        c = changes[j];
        saved[c.prop] = el.style.getPropertyValue(c.prop);
      }
      plan.push(saved);
    }
    for (var m = 0; m < plan.length; m++) {
      var f = plan[m];
      for (var n = 0; n < f.changes.length; n++) {
        f.el.style.setProperty(f.changes[n].prop, f.changes[n].val, 'important');
      }
      surfaceFixes.push(f);
      f.el.setAttribute('data-haki-surface', '1');
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

  
  function clearApplied() {
    restoreColors();
    restoreSurfaceFix();
    untagBackgroundMedia();
    root.classList.remove('haki-force-dark', 'haki-gray');
    appliedMode = null;
  }

  function strip() {
    clearApplied();
    root.classList.remove('haki-youtube', 'haki-twitch', 'haki-rezka',
      'haki-frame-media', 'haki-frame-native');
    ['haki-youtube-oled', 'haki-twitch-oled'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    eachShadowRoot(document, function (sr) {
      var s = sr.getElementById ? sr.getElementById(shadowStyleId) : sr.querySelector('#' + shadowStyleId);
      if (s && s.parentNode) s.parentNode.removeChild(s);
    }, 0);
  }

  
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
      
      'html .carousel-player-nav-arrow__container, html .carousel-metadata,',
      'html [class*="ScLayoutCssVars"] { background-color: #000 !important; }',
      
      'html.haki-twitch [class*="side-nav"],',
      'html.haki-twitch [class*="channel-root__left-column"],',
      'html.haki-twitch [class*="channel-root__right-column"],',
      'html.haki-twitch section[class*="chat-room"],',
      'html.haki-twitch [class*="chat-room__content"],',
      'html.haki-twitch [class*="chat-wysiwyg"],',
      'html.haki-twitch [class*="chat-input"],',
      'html.haki-twitch [class*="chat-input__textarea"],',
      'html.haki-twitch [class*="chat-input__textarea"] * { background-color: #000 !important; }',
      'html.haki-twitch [class*="chat-wysiwyg-input-box"],',
      'html.haki-twitch [class*="chat-input__textarea"] {',
      '  box-shadow: 0 0 0 1px rgba(255,255,255,.08) inset !important;',
      '  border-color: rgba(255,255,255,.08) !important;',
      '}',
      'html.haki-twitch [class*="chat-room__viewer-card"],',
      'html.haki-twitch [class*="chat-room__notifications"],',
      'html.haki-twitch [class*="celebration__overlay"] {',
      '  background-color: transparent !important;',
      '  box-shadow: none !important;',
      '}',
      'html.haki-twitch [class*="side-nav-card"] { background-color: #000 !important; }',
      'html.haki-twitch [class*="side-nav-card"]:hover,',
      'html.haki-twitch [class*="side-nav-card"]:focus { background-color: #0a0a0a !important; }',
      'html.haki-twitch [class*="community-highlight"],',
      'html.haki-twitch [class*="community-highlight-stack"],',
      'html.haki-twitch [class*="highlight__card"],',
      'html.haki-twitch [class*="chat-line__message-highlight"],',
      'html.haki-twitch [class*="chat-line__message-container"],',
      'html.haki-twitch [class*="announcement-line"],',
      'html.haki-twitch [class*="chat-line__status"] {',
      '  background-color: transparent !important;',
      '  box-shadow: none !important;',
      '  border-color: rgba(255,255,255,.06) !important;',
      '}',
      'html.haki-twitch [class*="chat-line__message"] {',
      '  background-color: transparent !important;',
      '  box-shadow: none !important;',
      '  font-weight: 400 !important; opacity: 1 !important;',
      '}',
      'html.haki-twitch [class*="player-controls"] button,',
      'html.haki-twitch button[aria-label*="Play"],',
      'html.haki-twitch button[aria-label*="Mute"],',
      'html.haki-twitch button[aria-label*="Unmute"],',
      'html.haki-twitch button[aria-label*="Settings"],',
      'html.haki-twitch button[aria-label*="Theatre"],',
      'html.haki-twitch button[aria-label*="Fullscreen"],',
      'html.haki-twitch button[aria-label*="Captions"],',
      'html.haki-twitch button[aria-label*="Quality"] {',
      '  background-color: transparent !important;',
      '  box-shadow: none !important;',
      '  border-color: transparent !important;',
      '}',
      'html.haki-twitch [class*="player-controls"] button:hover,',
      'html.haki-twitch [class*="player-controls"] button:focus,',
      'html.haki-twitch button[aria-label*="Play"]:hover,',
      'html.haki-twitch button[aria-label*="Mute"]:hover,',
      'html.haki-twitch button[aria-label*="Unmute"]:hover,',
      'html.haki-twitch button[aria-label*="Settings"]:hover,',
      'html.haki-twitch button[aria-label*="Theatre"]:hover,',
      'html.haki-twitch button[aria-label*="Fullscreen"]:hover {',
      '  background-color: transparent !important;',
      '}',
      'html.haki-twitch [class*="player-controls"] button svg,',
      'html.haki-twitch [class*="player-controls"] button path,',
      'html.haki-twitch [class*="player-controls"] [class*="ButtonIconFigure"],',
      'html.haki-twitch button[aria-label*="Play"] svg,',
      'html.haki-twitch button[aria-label*="Mute"] svg,',
      'html.haki-twitch button[aria-label*="Unmute"] svg,',
      'html.haki-twitch button[aria-label*="Settings"] svg,',
      'html.haki-twitch button[aria-label*="Theatre"] svg,',
      'html.haki-twitch button[aria-label*="Fullscreen"] svg {',
      '  fill: #fff !important;',
      '  color: #fff !important;',
      '  background-color: transparent !important;',
      '}'
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'haki-twitch-oled';
    style.textContent = css;
    (document.head || root || document).appendChild(style);
  }

  
  function runDetection() {
    strip();

    /* "Never darken" wins over special handling and auto detection. */
    if (hostInExcludeList()) {
      notifyFrames(false);
      return;
    }

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

    if (hostInExcludeList()) {
      if (appliedMode !== 'excluded') {
        clearApplied();
        appliedMode = 'excluded';
      }
      root.classList.remove('haki-force-dark', 'haki-gray');
      notifyFrames(false);
      return;
    }

    var scheme = getComputedStyle(root).colorScheme || '';
    /* "light dark" is the browser's preference, not the site's own dark theme.
       Only an explicit "dark" declaration gets native-dark protection. */
    var schemeDark = scheme.indexOf('dark') !== -1 && scheme.indexOf('light') === -1;
    var grayListed = hostInGrayList();
    var vis = visibleBackgrounds();
    var samples = backgrounds().concat(vis);
    var isLight = samples.some(function (c) {
      var l = luminance(c);
      return l !== null && l > 0.58;
    });

    /* A page that already declares a dark scheme keeps its own palette.
       An explicit gray-list entry still wins. */
    if (schemeDark && !grayListed) {
      clearApplied();
      notifyFrames(false);
      return;
    }

    var isGray = grayListed || (vis.length > 0 && vis.every(function (c) {
      var l = luminance(c);
      return l !== null && l >= 0.02 && l <= 0.36;
    }));

    var fallbackLight = vis.length === 0 && !schemeDark;

    /* An explicit gray-list entry wins over light detection too. */
    if (grayListed) {
      var wasGrayListed = root.classList.contains('haki-gray');
      root.classList.remove('haki-force-dark');
      root.classList.add('haki-gray');
      appliedMode = 'gray';
      if (!wasGrayListed) applySurfaceFix('gray');
    } else if (isLight || fallbackLight) {
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
      clearApplied();
    }
    if (root.classList.contains('haki-force-dark') && final) applySurfaceFix('invert');
    notifyFrames(root.classList.contains('haki-force-dark'));
  }

  function retry() {
    if (!enabled) return;
    evaluate(false);
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
  window.setTimeout(finish, 3000);
  window.setTimeout(injectShadowStyles, 4000);

  
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

  
  var query = {};
  query[SITES_KEY] = true;
  query[GRAY_KEY] = true;
  query[EXCLUDE_KEY] = true;
  chrome.storage.local.get(query, function (data) {
    graySites = Array.isArray(data[GRAY_KEY]) ? data[GRAY_KEY] : [];
    excludedSites = Array.isArray(data[EXCLUDE_KEY]) ? data[EXCLUDE_KEY] : [];
    setEnabled(data[SITES_KEY] !== false);
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg) return;
    if (msg.type === 'haki-sites-changed') setEnabled(!!msg.enabled);
    if (msg.type === 'haki-gray-list-changed') {
      graySites = Array.isArray(msg.sites) ? msg.sites : [];
      if (enabled) runDetection();
    }
    if (msg.type === 'haki-excluded-list-changed') {
      excludedSites = Array.isArray(msg.sites) ? msg.sites : [];
      if (enabled) runDetection();
    }
    if (msg.type === 'haki-recheck' && enabled) runDetection();
  });

  
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
