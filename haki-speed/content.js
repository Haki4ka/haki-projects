(() => {
  'use strict';

  // Exactly one live controller per document. The marker lives on <html>, so
  // repeated injection (extension update, hotkey toggles) cannot duplicate it.
  const root = document.documentElement || document;
  const hasMarker = typeof root.getAttribute === 'function' && root.getAttribute('data-haki-speed-active') === '1';
  if (hasMarker && globalThis.__hakiSpeedReady) {
    // Already running: only discard orphan hosts with no live panel.
    document.querySelectorAll('#haki-speed-host').forEach(function (el) {
      if (!el.shadowRoot || !el.shadowRoot.querySelector('.floating')) el.remove();
    });
    return;
  }
  if (typeof root.setAttribute === 'function') root.setAttribute('data-haki-speed-active', '1');
  globalThis.__hakiSpeedReady = true;

  // Take over from an older build: remove its panel before creating ours.
  document.querySelectorAll('#haki-speed-host').forEach(function (el) { el.remove(); });

  const COMBO = globalThis.HAKI_SPEED_COMBO;
  const MIGRATE = globalThis.HAKI_SPEED_MIGRATE;
  const GLOBAL_KEY = '__global__';

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .floating {
    --fill: 12,12,18; --fg: #ececf3; --muted: #9a9aab;
    position: fixed; z-index: 2147483647; width: 208px; padding: 10px 10px 9px;
    border-radius: 16px; background: rgba(var(--fill), var(--hs-alpha, .9));
    color: var(--fg); border: 1px solid rgba(169,112,255,.28);
    box-shadow: 0 14px 38px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.07);
    backdrop-filter: blur(16px) saturate(160%); -webkit-backdrop-filter: blur(16px) saturate(160%);
    font: 500 12px/1.25 Inter, "Segoe UI", system-ui, -apple-system, sans-serif;
    letter-spacing: .01em; user-select: none;
    /* The host is pointer-events:none so it never blocks the site. Each panel
       must opt back in, otherwise clicks and dragging pass straight through. */
    pointer-events: auto; touch-action: none;
    overflow: hidden; isolation: isolate;
    transition: opacity .18s ease, transform .18s ease;
  }
  .floating.light { --fill: 255,255,255; --fg: #16161d; --muted: #656574;
    border-color: rgba(109,40,217,.24);
    box-shadow: 0 12px 34px rgba(20,10,50,.18), inset 0 1px 0 rgba(255,255,255,.9); }
  .floating.compact { width: 168px; padding: 8px; border-radius: 13px; }
  .floating.large { width: 246px; padding: 12px; border-radius: 19px; }
  .floating.dragging { transform: scale(1.02); transition: none; }
  .floating.empty { opacity: .55; }
  .head { display:flex; align-items:center; gap:6px; cursor:grab; padding:0 2px 8px; }
  .head:active { cursor:grabbing; }
  .dot { width:8px; height:8px; border-radius:50%; flex:none;
    background:linear-gradient(135deg,#a970ff,#4cc9f0); box-shadow:0 0 10px rgba(169,112,255,.7); }
  .brand { font-size:9px; font-weight:800; letter-spacing:.14em; color:var(--muted); white-space:nowrap; }
  .mini { margin-left:auto; font-size:11px; font-variant-numeric:tabular-nums; color:#c9a7ff; display:none; }
  .floating.collapsed .mini { display:block; }
  .icon { margin-left:auto; width:20px; height:20px; border:0; border-radius:6px; background:transparent;
    color:var(--muted); cursor:pointer; font-size:14px; line-height:1; }
  .floating.collapsed .icon { margin-left:6px; }
  .icon:hover { background:rgba(169,112,255,.16); color:var(--fg); }
  .body { display:flex; align-items:center; justify-content:center; gap:8px; }
  .round { width:34px; height:34px; flex:none; border:1px solid rgba(169,112,255,.35); border-radius:11px;
    background:rgba(169,112,255,.10); color:var(--fg); font-size:20px; cursor:pointer; transition:.15s; }
  .round:hover { background:linear-gradient(135deg,#a970ff,#6d28d9); color:#fff; border-color:transparent; transform:translateY(-1px); }
  .round:active { transform:scale(.94); }
  .value { min-width:74px; text-align:center; font-size:23px; font-weight:750;
    font-variant-numeric:tabular-nums; letter-spacing:-.02em; }
  .value small { font-size:12px; color:var(--muted); margin-left:1px; }
  .range { width:100%; margin:10px 0 9px; accent-color:#a970ff; height:4px; cursor:pointer; }
  .chips { display:flex; flex-wrap:wrap; gap:4px; justify-content:center; }
  .chips button { border:1px solid transparent; border-radius:999px; padding:3px 7px; font-size:10px;
    font-weight:650; background:rgba(127,127,150,.14); color:var(--muted); cursor:pointer; }
  .chips button:hover { color:var(--fg); border-color:rgba(169,112,255,.45); }
  .chips button.active { background:linear-gradient(135deg,rgba(169,112,255,.95),rgba(109,40,217,.95)); color:#fff; }
  .foot { display:flex; justify-content:space-between; margin-top:8px; padding-top:7px;
    border-top:1px solid rgba(127,127,150,.16); }
  .foot button { border:0; background:transparent; color:var(--muted); font-size:10px; cursor:pointer; padding:2px 3px; }
  .foot button:hover { color:#c9a7ff; }
  .floating.collapsed .body, .floating.collapsed .range, .floating.collapsed .chips, .floating.collapsed .foot { display:none; }
  .floating.collapsed { width:auto; min-width:112px; padding:7px 9px; }

  /* Slow colour drift behind the controls, plus a canvas filled with
     slow-moving liquid ripples. Neither layer can catch a click. */
  .floating > *, .dock > * { position: relative; z-index: 2; }
  .floating::before, .dock::before {
    content: ''; position: absolute; inset: -35%; border-radius: inherit;
    pointer-events: none; z-index: 0;
    background:
      radial-gradient(58% 52% at 16% 24%, rgba(169,112,255,.42), transparent 72%),
      radial-gradient(54% 58% at 84% 76%, rgba(76,201,240,.30), transparent 74%),
      radial-gradient(48% 44% at 54% 8%, rgba(109,40,217,.30), transparent 70%);
    background-size: 180% 180%;
    filter: blur(13px);
    opacity: .5;
    animation: hakiAurora 15s ease-in-out infinite alternate;
  }
  .floating > canvas.liquid, .dock > canvas.liquid {
    position: absolute; inset: 0; z-index: 1; display: block;
    width: 100%; height: 100%; border-radius: inherit; pointer-events: none;
    mix-blend-mode: screen;
  }
  .floating.light > canvas.liquid, .dock.light > canvas.liquid { mix-blend-mode: multiply; }
  .floating.no-ambient::before, .dock.no-ambient::before,
  .floating.no-ambient > canvas.liquid, .dock.no-ambient > canvas.liquid { display: none; }
  @keyframes hakiAurora {
    0%   { transform: translate3d(-6%, -4%, 0) scale(1);    background-position: 0% 20%;  opacity: .40; }
    50%  { transform: translate3d(4%,  3%, 0) scale(1.12); background-position: 70% 80%; opacity: .70; }
    100% { transform: translate3d(-2%, 6%, 0) scale(1.04); background-position: 100% 40%; opacity: .46; }
  }

  /* Flat player bar: visible only while the pointer is over the video. */
  .dock {
    --dock-fg: #efe8ff;
    --dock-accent: #a970ff;
    position: fixed; z-index: 2147483646; display: flex; align-items: center; gap: 4px;
    height: 32px; padding: 4px 5px; border-radius: 11px;
    background:
      linear-gradient(135deg, rgba(38,24,64,var(--hs-dock-alpha,.88)), rgba(10,8,18,var(--hs-dock-alpha,.92)));
    border: 1px solid rgba(169,112,255,.34);
    box-shadow: 0 10px 30px rgba(0,0,0,.52),
                inset 0 1px 0 rgba(255,255,255,.09),
                0 0 20px rgba(169,112,255,.14);
    backdrop-filter: blur(18px) saturate(165%); -webkit-backdrop-filter: blur(18px) saturate(165%);
    color: var(--dock-fg);
    font: 600 11px/1 Inter, "Segoe UI", system-ui, sans-serif;
    user-select: none; opacity: 0; transform: translateY(5px) scale(.97);
    transition: opacity .16s ease, transform .16s ease;
    pointer-events: none; overflow: hidden; isolation: isolate;
  }
  .dock.show { opacity: 1; transform: none; pointer-events: auto; }
  .dock.light { --dock-fg: #201a2e;
    background: linear-gradient(135deg, rgba(244,238,255,var(--hs-dock-alpha,.93)), rgba(255,255,255,var(--hs-dock-alpha,.92)));
    border-color: rgba(109,40,217,.28);
    box-shadow: 0 10px 28px rgba(28,14,60,.18), inset 0 1px 0 rgba(255,255,255,.9); }
  .dock button { width: 23px; height: 23px; flex: none; display: grid; place-items: center;
    border: 1px solid rgba(169,112,255,.20); border-radius: 7px;
    background: rgba(169,112,255,.11); color: inherit;
    font: 600 14px/1 Inter, "Segoe UI", sans-serif; cursor: pointer; padding: 0;
    transition: background .14s ease, color .14s ease, transform .12s ease; }
  .dock.light button { border-color: rgba(109,40,217,.18); background: rgba(109,40,217,.07); }
  .dock button:hover { background: linear-gradient(135deg,#a970ff,#6d28d9); color:#fff;
    border-color: transparent; transform: translateY(-1px); }
  .dock button:active { transform: scale(.93); }
  .dock button.gear { font-size: 12px; opacity: .78; }
  .dock .dval { min-width: 48px; text-align: center; font-size: 11px; font-weight: 750;
    font-variant-numeric: tabular-nums; letter-spacing: -.01em;
    color: #d9c2ff; text-shadow: 0 0 12px rgba(169,112,255,.45); }
  .dock.light .dval { color: #5b21b6; text-shadow: none; }
  `;

  const FLOAT_HTML = `
  <canvas class="liquid"></canvas>
  <div class="head">
    <span class="dot"></span>
    <span class="brand">HAKI SPEED</span>
    <span class="mini" id="mini">1.00×</span>
    <button class="icon" data-act="collapse" title="Collapse">⌄</button>
  </div>
  <div class="body">
    <button class="round" data-act="minus" title="Slower">−</button>
    <div class="value" id="val">1.00<small>×</small></div>
    <button class="round" data-act="plus" title="Faster">+</button>
  </div>
  <input class="range" id="range" type="range" min="0.25" max="4" step="0.05" value="1">
  <div class="chips">
    <button data-rate="0.5">0.5×</button><button data-rate="1">1×</button>
    <button data-rate="1.25">1.25×</button><button data-rate="1.5">1.5×</button>
    <button data-rate="2">2×</button><button data-rate="3">3×</button>
  </div>
  <div class="foot">
    <button data-act="reset">Reset</button>
    <button data-act="settings">Settings</button>
  </div>
  `;

  const DOCK_HTML = `
  <canvas class="liquid"></canvas>
  <button data-dock="minus" title="Slower">−</button>
  <span class="dval" id="dval">1.00×</span>
  <button data-dock="plus" title="Faster">+</button>
  <button data-dock="settings" class="gear" title="Settings">⚙</button>
  `;

  let settings = MIGRATE(null);
  let speeds = {};
  let scopeKey = '';
  let target = 1;
  let applyingUntil = 0;
  let applySeq = 0;
  let hostEl = null;
  let shadow = null;
  let floating = null;
  let dock = null;
  let valueEl = null;
  let miniEl = null;
  let dockValueEl = null;
  let rangeEl = null;
  let drag = null;
  let dockVideo = null;
  let dockHideTimer = 0;
  let idleTimer = 0;
  let pointerX = 0;
  let pointerY = 0;
  const videos = new Set();
  const scannedRoots = new WeakSet();
  let activeVideo = null;

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  function normalizeRate(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.round(clamp(n, Number(settings.min) || 0.25, Number(settings.max) || 4) * 100) / 100;
  }

  function rateStep() { return clamp(Number(settings.step) || 0.25, 0.05, 1); }

  function speedKey() { return settings.syncAll ? GLOBAL_KEY : scopeKey; }

  function makeScope() {
    if (settings.syncAll) return GLOBAL_KEY;
    const host = (location.hostname || '').replace(/^www\./i, '');
    if (settings.scope === 'path') return host + (location.pathname || '').replace(/\/+$/, '');
    return host;
  }

  function safeSet(data) {
    try { chrome.storage.local.set(data); } catch (e) { /* extension reloaded */ }
  }

  function saveSettings() { safeSet({ settings: settings }); }

  function saveSpeed(rate) {
    if (!settings.remember && !settings.syncAll) return;
    speeds[speedKey()] = rate;
    safeSet({ speeds: speeds });
  }

  function buildUI() {
    if (hostEl) return;
    hostEl = document.createElement('div');
    hostEl.id = 'haki-speed-host';
    hostEl.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    shadow = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    floating = document.createElement('div');
    floating.className = 'floating';
    floating.innerHTML = FLOAT_HTML;
    shadow.appendChild(floating);

    dock = document.createElement('div');
    dock.className = 'dock';
    dock.innerHTML = DOCK_HTML;
    shadow.appendChild(dock);

    (document.fullscreenElement || document.documentElement || document.body).appendChild(hostEl);

    valueEl = floating.querySelector('#val');
    miniEl = floating.querySelector('#mini');
    rangeEl = floating.querySelector('#range');
    dockValueEl = dock.querySelector('#dval');

    bindFloating();
    bindDock();
    bindLiquid(floating);
    bindLiquid(dock);
  }

  // The panel is treated as a shallow body of liquid. Two very slow pools keep
  // breathing inside it; moving the pointer leaves a wake of soft ripples that
  // expand and dissolve over roughly 1.5 s instead of a hard cursor glow.
  function bindLiquid(el) {
    const canvas = el.querySelector('canvas.liquid');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0, h = 0, dpr = 1;
    let ripples = [];
    let raf = 0;
    let lastTs = 0;
    let inside = false;

    function resize() {
      const nw = Math.max(1, canvas.clientWidth || el.clientWidth);
      const nh = Math.max(1, canvas.clientHeight || el.clientHeight);
      const nd = Math.min(window.devicePixelRatio || 1, 2);
      if (nw === w && nh === h && nd === dpr) return;
      w = nw; h = nh; dpr = nd;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function pool(x, y, radius, rgb, alpha) {
      if (alpha <= 0 || radius <= 0) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, 'rgba(' + rgb + ',' + alpha.toFixed(3) + ')');
      g.addColorStop(0.42, 'rgba(' + rgb + ',' + (alpha * 0.42).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    function frame(ts) {
      resize();
      if (document.hidden) { raf = 0; lastTs = 0; return; }
      lastTs = lastTs ? Math.min(ts - lastTs, 60) : 16;
      const seconds = ts / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = el.classList.contains('light') ? 'multiply' : 'screen';

      // Liquid body: broad, barely visible pools sliding under the controls.
      const reach = Math.max(w, h) * 0.9;
      pool(w * (0.30 + 0.14 * Math.sin(seconds * 0.21)),
           h * (0.42 + 0.24 * Math.cos(seconds * 0.17)),
           reach, '169,112,255', 0.09 + 0.025 * Math.sin(seconds * 0.33));
      pool(w * (0.72 + 0.12 * Math.cos(seconds * 0.16)),
           h * (0.56 + 0.22 * Math.sin(seconds * 0.25)),
           reach * 0.9, '76,201,240', 0.075 + 0.025 * Math.cos(seconds * 0.29));

      // The wake: each ripple grows slowly, drifts and fades like a wave.
      ripples = ripples.filter(function (rp) {
        const age = ts - rp.born;
        if (age > rp.life) return false;
        const k = age / rp.life;
        const ease = 1 - Math.pow(1 - k, 2);
        const radius = 18 + ease * reach * 1.15;
        const drift = Math.sin(seconds * 0.8 + rp.phase) * 7 * k;
        const alpha = (1 - k) * (1 - k) * 0.26;
        pool(rp.x + drift, rp.y + drift * 0.45, radius, '169,112,255', alpha);
        pool(rp.x - drift, rp.y - drift * 0.35, radius * 0.72, '76,201,240', alpha * 0.7);
        return true;
      });

      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (!raf && !document.hidden) { lastTs = 0; raf = requestAnimationFrame(frame); }
    }

    function track(e) {
      if (el.classList.contains('no-ambient')) return;
      resize();
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      const now = performance.now();
      const previous = track.pt;
      const moved = !previous || Math.abs(p.x - previous.x) + Math.abs(p.y - previous.y) > 9;
      if (moved && (!track.at || now - track.at > 32)) {
        ripples.push({ x: p.x, y: p.y, born: now, life: 1500, phase: Math.random() * 6.28 });
        if (ripples.length > 20) ripples.shift();
        track.at = now;
        track.pt = p;
      }
      start();
    }

    el.addEventListener('pointerenter', function (e) { inside = true; track(e); }, { passive: true });
    el.addEventListener('pointermove', track, { passive: true });
    el.addEventListener('pointerleave', function () { inside = false; track.pt = null; }, { passive: true });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
    start();
  }

  function bindFloating() {
    const head = floating.querySelector('.head');
    head.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      const r = floating.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, last: null };
      head.setPointerCapture(e.pointerId);
      floating.classList.add('dragging');
    });
    head.addEventListener('pointermove', function (e) {
      if (!drag) return;
      const x = clamp(e.clientX - drag.dx, 0, Math.max(0, innerWidth - floating.offsetWidth));
      const y = clamp(e.clientY - drag.dy, 0, Math.max(0, innerHeight - floating.offsetHeight));
      floating.style.left = x + 'px';
      floating.style.top = y + 'px';
      floating.style.right = '';
      floating.style.bottom = '';
      drag.last = { x: x, y: y };
    });
    const endDrag = function () {
      if (!drag) return;
      settings.corner = 'custom';
      settings.pos = drag.last || {
        x: parseFloat(floating.style.left) || 0,
        y: parseFloat(floating.style.top) || 0
      };
      drag = null;
      floating.classList.remove('dragging');
      saveSettings();
    };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);

    floating.addEventListener('click', function (e) {
      const rateAttr = e.target.getAttribute('data-rate');
      if (rateAttr) { setRate(Number(rateAttr)); return; }
      const act = e.target.getAttribute('data-act');
      if (!act) return;
      if (act === 'minus') adjust(-rateStep());
      else if (act === 'plus') adjust(rateStep());
      else if (act === 'reset') setRate(1);
      else if (act === 'collapse') {
        settings.collapsed = !settings.collapsed;
        saveSettings();
        applySettings();
      } else if (act === 'settings') openSettings();
    });

    rangeEl.addEventListener('input', function () { setRate(Number(rangeEl.value)); });
  }

  function bindDock() {
    dock.addEventListener('click', function (e) {
      // The centre readout is a silent reset button: same look, no new frame.
      if (e.target === dockValueEl || (e.target.closest && e.target.closest('.dval'))) {
        setRate(1);
        return;
      }
      const act = e.target.getAttribute('data-dock');
      if (!act) return;
      if (act === 'minus') adjust(-rateStep());
      else if (act === 'plus') adjust(rateStep());
      else if (act === 'settings') openSettings();
    });
    dock.addEventListener('pointerenter', function () {
      if (dockHideTimer) { clearTimeout(dockHideTimer); dockHideTimer = 0; }
      resetIdleTimer();
    });
    dock.addEventListener('pointerleave', function () {
      if (!pointInsideVideo()) scheduleDockHide();
    });
  }

  function overOurPanels(e) {
    if (!hostEl) return false;
    const path = e.composedPath ? e.composedPath() : [];
    return path.indexOf(hostEl) !== -1;
  }

  // One dispatcher for every recorded input: keys, wheel and mouse buttons.
  // Wheel and button combos are limited to our panels and videos so the rest
  // of the site keeps normal scrolling and clicking.
  function hotkeyAllowed(e) {
    if (settings.enabled === false) return false;
    const t = e.target;
    if (e.type === 'keydown') {
      return !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
    }
    // Never steal clicks on our own controls or on links/fields of the site.
    // composedPath is needed because shadow-DOM targets are retargeted to the host.
    if (e.type === 'mousedown') {
      const path = e.composedPath ? e.composedPath() : [t];
      const interactive = path.some(function (n) {
        return n && n.nodeType === 1 && n.matches &&
          n.matches('button, input, select, textarea, a, .dval, [role="button"]');
      });
      if (interactive) return false;
    }
    return overOurPanels(e) || !!videoAtCoords(e.clientX, e.clientY);
  }

  function modifierMatches(e, mod) {
    if (mod === 'off') return false;
    if (mod === 'none') return true;
    const held = { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey };
    if (!held[mod]) return false;
    return Object.keys(held).every(function (k) { return k === mod || !held[k]; });
  }

  function onInput(e) {
    if (!hotkeyAllowed(e)) return;
    const combo = COMBO(e);
    let action = '';
    for (const name of ['up', 'down', 'reset', 'toggle']) {
      if (settings.keys && settings.keys[name] && settings.keys[name] === combo) {
        action = name;
        break;
      }
    }
    // A recorded combination always wins, so Shift+wheel is never applied
    // twice when it is both a hotkey and the quick modifier.
    if (!action && e.type !== 'wheel') return;
    if (!action && !modifierMatches(e, settings.wheelModifier || 'shift')) return;
    if (e.type === 'wheel' || e.type === 'mousedown') {
      e.preventDefault();
      e.stopPropagation();
    } else {
      e.preventDefault();
    }
    if (e.type === 'wheel' && dock && dock.classList.contains('show')) resetIdleTimer();
    if (action === 'up') adjust(rateStep());
    else if (action === 'down') adjust(-rateStep());
    else if (action === 'reset') setRate(1);
    else if (action === 'toggle') doAction('toggle-panel');
    else adjust(e.deltaY < 0 ? rateStep() : -rateStep());
  }
  document.addEventListener('keydown', onInput);
  document.addEventListener('wheel', onInput, { passive: false, capture: true });
  document.addEventListener('mousedown', onInput, { capture: true });

  function openSettings() {
    try { chrome.runtime.sendMessage({ type: 'haki-speed-open-options' }); }
    catch (e) { /* extension reloaded */ }
  }

  function updateFloatingPosition() {
    if (!floating) return;
    floating.style.left = '';
    floating.style.right = '';
    floating.style.top = '';
    floating.style.bottom = '';
    const ox = Number(settings.offsetX) || 0;
    const oy = Number(settings.offsetY) || 0;
    if (settings.corner === 'custom' && settings.pos) {
      floating.style.left = clamp(Number(settings.pos.x) || 0, 0, Math.max(0, innerWidth - floating.offsetWidth)) + 'px';
      floating.style.top = clamp(Number(settings.pos.y) || 0, 0, Math.max(0, innerHeight - floating.offsetHeight)) + 'px';
    } else if (settings.corner === 'top-left' || settings.corner === 'tl') {
      floating.style.left = ox + 'px'; floating.style.top = oy + 'px';
    } else if (settings.corner === 'top-right' || settings.corner === 'tr') {
      floating.style.right = ox + 'px'; floating.style.top = oy + 'px';
    } else if (settings.corner === 'bottom-left' || settings.corner === 'bl') {
      floating.style.left = ox + 'px'; floating.style.bottom = oy + 'px';
    } else {
      floating.style.right = ox + 'px'; floating.style.bottom = oy + 'px';
    }
  }

  function floatingShouldShow() {
    return settings.enabled !== false && !!settings.panelVisible &&
      (settings.autoShow === false || videos.size > 0);
  }

  function applySettings() {
    if (!floating || !dock) return;
    floating.classList.toggle('light', settings.theme === 'light');
    floating.classList.toggle('compact', settings.size === 'compact');
    floating.classList.toggle('large', settings.size === 'large');
    floating.classList.toggle('collapsed', !!settings.collapsed);
    floating.classList.toggle('no-ambient', settings.ambient === false);
    dock.classList.toggle('light', settings.theme === 'light');
    dock.classList.toggle('no-ambient', settings.ambient === false);
    const alpha = clamp(Number(settings.opacity) || 90, 40, 100) / 100;
    floating.style.setProperty('--hs-alpha', String(alpha));
    dock.style.setProperty('--hs-dock-alpha', String(clamp(alpha + 0.02, 0, 1)));
    rangeEl.min = String(settings.min);
    rangeEl.max = String(settings.max);
    rangeEl.step = '0.05';
    floating.querySelector('[data-act="collapse"]').textContent = settings.collapsed ? '⌃' : '⌄';
    floating.querySelector('.brand').style.display = settings.showLabel ? '' : 'none';
    updateFloatingPosition();
    floating.style.display = floatingShouldShow() ? '' : 'none';
    dock.style.display = settings.dockEnabled !== false && settings.enabled !== false ? '' : 'none';
    if (dock.style.display === 'none') dock.classList.remove('show');
    else placeDock();
    updateUI();
  }

  function updateUI() {
    if (!valueEl) return;
    const shown = normalizeRate(target);
    valueEl.firstChild.nodeValue = shown.toFixed(2);
    miniEl.textContent = shown.toFixed(2) + '×';
    dockValueEl.textContent = shown.toFixed(2) + '×';
    rangeEl.value = String(shown);
    floating.classList.toggle('empty', videos.size === 0);
    floating.querySelectorAll('[data-rate]').forEach(function (btn) {
      btn.classList.toggle('active', Math.abs(Number(btn.getAttribute('data-rate')) - shown) < 0.005);
    });
  }

  // Every video on the page gets the same speed - also when several are
  // playing at once. activeVideo / dockVideo only drive hover-bar placement.
  function videoList() { return Array.from(videos); }

  function applyToVideos(rate, list) {
    const r = normalizeRate(rate);
    applyingUntil = Date.now() + 250;
    list.forEach(function (v) {
      try { if (v.playbackRate !== r) v.playbackRate = r; } catch (e) { /* site-controlled media */ }
    });
    return r;
  }

  function setRate(rate) {
    const r = normalizeRate(rate);
    const list = videoList();
    const seq = ++applySeq;
    if (list.length) {
      applyToVideos(r, list);
      setTimeout(function () {
        if (seq !== applySeq || target !== r) return;
        list.forEach(function (v) {
          if (v.playbackRate !== r) { try { v.playbackRate = r; } catch (e) { /* ignore */ } }
        });
      }, 300);
    }
    target = r;
    saveSpeed(r);
    updateUI();
    return r;
  }

  // Used for cross-tab synchronisation: adopt a speed without writing it back.
  function adopt(rate) {
    const r = normalizeRate(rate);
    if (Math.abs(r - target) < 0.005) return;
    target = r;
    const list = videoList();
    if (list.length) applyToVideos(r, list);
    updateUI();
  }

  function adjust(delta) { return setRate(target + Number(delta)); }

  function doAction(action) {
    if (action === 'speed-up') adjust(rateStep());
    else if (action === 'speed-down') adjust(-rateStep());
    else if (action === 'speed-reset') setRate(1);
    else if (action === 'toggle-panel') {
      settings.panelVisible = !settings.panelVisible;
      saveSettings();
      applySettings();
    }
  }

  function register(video) {
    if (!(video instanceof HTMLVideoElement) || videos.has(video)) return;
    videos.add(video);
    video.addEventListener('loadedmetadata', function () {
      if (video.playbackRate !== target) setRate(target);
    }, true);
    video.addEventListener('play', function () {
      activeVideo = video;
      if (video.playbackRate !== target) setRate(target);
      applySettings();
    }, true);
    video.addEventListener('ratechange', function () {
      const r = video.playbackRate;
      if (Date.now() < applyingUntil) {
        if (r !== target && target !== 1) {
          setTimeout(function () {
            if (target !== 1 && video.playbackRate !== target) setRate(target);
          }, 200);
        }
        return;
      }
      if (settings.followSite === false) {
        if (r !== target) setRate(target);
        return;
      }
      if (r === 1 && target !== 1) {
        setRate(target);
        return;
      }
      target = normalizeRate(r);
      saveSpeed(target);
      updateUI();
    }, true);
    if (!video.paused) activeVideo = video;
    if (video.readyState >= 1 && video.playbackRate !== target) {
      try { video.playbackRate = target; } catch (e) { /* ignore */ }
    }
    applySettings();
  }

  // Some players silently reset playbackRate after a buffer event or a seek.
  // Reassert the chosen speed on every video, even when several are playing.
  setInterval(function () {
    if (settings.enabled === false || !videos.size) return;
    const r = normalizeRate(target);
    const stale = Array.from(videos).filter(function (v) {
      return v.isConnected && v.playbackRate !== r;
    });
    if (stale.length) applyToVideos(r, stale);
  }, 1200);

  function scan(node) {
    if (!node || !node.querySelectorAll) return;
    node.querySelectorAll('video').forEach(register);
    node.querySelectorAll('*').forEach(function (el) {
      if (el.shadowRoot && !scannedRoots.has(el.shadowRoot)) {
        scannedRoots.add(el.shadowRoot);
        scan(el.shadowRoot);
      }
    });
  }

  const observer = new MutationObserver(function (mutations) {
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'VIDEO') register(node);
        else {
          if (node.querySelectorAll) node.querySelectorAll('video').forEach(register);
          if (node.shadowRoot) scan(node.shadowRoot);
        }
      });
    }
  });

  /* ---------- player bar ---------- */

  function bestVideo() {
    if (activeVideo && activeVideo.isConnected) return activeVideo;
    let best = null;
    let area = 0;
    videos.forEach(function (v) {
      const r = v.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > area && r.width > 40) { area = a; best = v; }
    });
    return best;
  }

  function insideRect(v, x, y) {
    if (!v || !v.isConnected) return false;
    const r = v.getBoundingClientRect();
    if (r.width < 40 || r.height < 30) return false;
    const px = x === undefined ? pointerX : x;
    const py = y === undefined ? pointerY : y;
    return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
  }

  function pointInsideVideo() { return insideRect(dockVideo); }

  function videoAtCoords(x, y) {
    if (insideRect(dockVideo, x, y)) return dockVideo;
    // With several players the hovered one may not be the "active" or the
    // largest video, so test every connected video at the pointer position.
    let found = null;
    videos.forEach(function (v) {
      if (!found && insideRect(v, x, y)) found = v;
    });
    return found;
  }

  function videoAtPointer() { return videoAtCoords(pointerX, pointerY); }

  function placeDock() {
    if (!dock || !dockVideo || !dockVideo.isConnected) return;
    const r = dockVideo.getBoundingClientRect();
    if (r.width < 40 || r.height < 30) return;
    const w = dock.offsetWidth || 112;
    const h = dock.offsetHeight || 30;
    const pad = clamp(Number(settings.dockOffset) || 0, 0, Math.max(0, Math.min(r.width, r.height) / 2));
    let x;
    let y;
    switch (settings.dockPosition) {
      case 'top-left': x = r.left + pad; y = r.top + pad; break;
      case 'top-center': x = r.left + (r.width - w) / 2; y = r.top + pad; break;
      case 'top-right': x = r.right - w - pad; y = r.top + pad; break;
      case 'bottom-left': x = r.left + pad; y = r.bottom - h - pad; break;
      case 'bottom-center': x = r.left + (r.width - w) / 2; y = r.bottom - h - pad; break;
      default: x = r.right - w - pad; y = r.bottom - h - pad;
    }
    dock.style.left = clamp(x, 4, Math.max(4, innerWidth - w - 4)) + 'px';
    dock.style.top = clamp(y, 4, Math.max(4, innerHeight - h - 4)) + 'px';
  }

  function hideDock() {
    if (dock) dock.classList.remove('show');
  }

  // The bar behaves like native controls: it falls asleep shortly after the
  // pointer stops moving and comes back on the next movement.
  function resetIdleTimer() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
    if (!dock || !dock.classList.contains('show')) return;
    idleTimer = setTimeout(function () {
      idleTimer = 0;
      hideDock();
    }, 2500);
  }

  function scheduleDockHide() {
    if (dockHideTimer) clearTimeout(dockHideTimer);
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
    dockHideTimer = setTimeout(function () {
      dockHideTimer = 0;
      if (!pointInsideVideo()) hideDock();
    }, 420);
  }

  function evaluateHover() {
    if (!dock || settings.dockEnabled === false || settings.enabled === false) return;
    const v = videoAtPointer();
    if (v) {
      dockVideo = v;
      if (dockHideTimer) { clearTimeout(dockHideTimer); dockHideTimer = 0; }
      placeDock();
      if (!dock.classList.contains('show')) dock.classList.add('show');
      resetIdleTimer();
    } else if (dock.classList.contains('show')) scheduleDockHide();
  }

  // Evaluate directly instead of coalescing through requestAnimationFrame:
  // a pending frame from a backgrounded tab can otherwise swallow every later
  // mousemove, leaving the bar stuck invisible until an unrelated frame fires.
  document.addEventListener('mousemove', function (e) {
    pointerX = e.clientX;
    pointerY = e.clientY;
    evaluateHover();
  }, { passive: true });

  document.addEventListener('mouseout', function (e) {
    if (!e.relatedTarget) scheduleDockHide();
  }, { passive: true });

  /* ---------- extension events ---------- */

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.settings) {
      const before = settings;
      const next = changes.settings.newValue || {};
      settings = MIGRATE(next);
      if (!before.syncAll && settings.syncAll) {
        // Turning sync on keeps the current speed instead of jumping to 1x.
        scopeKey = GLOBAL_KEY;
        if (speeds[GLOBAL_KEY] === undefined) {
          speeds[GLOBAL_KEY] = normalizeRate(target);
          safeSet({ speeds: speeds });
        } else adopt(speeds[GLOBAL_KEY]);
      } else if (before.syncAll !== settings.syncAll || before.scope !== settings.scope) {
        scopeKey = makeScope();
        adopt(speeds[scopeKey] || 1);
      }
      applySettings();
    }
    if (changes.speeds) {
      speeds = changes.speeds.newValue || {};
      adopt(speeds[speedKey()] || 1);
    }
  });

  chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
    if (!msg || !msg.type) return;
    if (msg.type === 'haki-speed-state') {
      reply({
        host: makeScope(),
        rate: normalizeRate(target),
        hasVideo: videos.size > 0,
        visible: floatingShouldShow(),
        enabled: settings.enabled !== false,
        syncAll: !!settings.syncAll,
        count: videos.size
      });
    } else if (msg.type === 'haki-speed-adj') {
      reply({ rate: adjust(msg.delta) });
    } else if (msg.type === 'haki-speed-set') {
      reply({ rate: setRate(msg.rate) });
    } else if (msg.type === 'haki-speed-command') {
      doAction(msg.command);
      reply({ ok: true });
    }
    return true;
  });

  document.addEventListener('fullscreenchange', function () {
    if (!hostEl) return;
    (document.fullscreenElement || document.documentElement).appendChild(hostEl);
    if (dock.classList.contains('show')) requestAnimationFrame(placeDock);
  });

  window.addEventListener('resize', function () {
    updateFloatingPosition();
    placeDock();
  });

  function refreshScan() { scan(document); updateUI(); }
  window.addEventListener('pageshow', refreshScan);
  window.addEventListener('load', refreshScan);
  document.addEventListener('DOMContentLoaded', refreshScan);

  // Flush the saved speed when the page is closed or navigated away.
  window.addEventListener('pagehide', function () {
    if (settings.remember || settings.syncAll) safeSet({ speeds: speeds });
  });

  try {
    chrome.storage.local.get(['settings', 'speeds'], function (data) {
      settings = MIGRATE(data.settings || {});
      speeds = data.speeds || {};
      scopeKey = makeScope();
      target = normalizeRate(speeds[scopeKey] || 1);
      buildUI();
      applySettings();
      scan(document);
      observer.observe(document.documentElement || document, { childList: true, subtree: true });
    });
  } catch (e) { /* extension context was reloaded */ }
})();
