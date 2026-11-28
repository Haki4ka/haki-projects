(function () {
  'use strict';

  var themeRow = document.getElementById('themeRow');
  var sitesRow = document.getElementById('sitesRow');
  var themeToggle = document.getElementById('themeToggle');
  var sitesToggle = document.getElementById('sitesToggle');
  var statusText = document.getElementById('statusText');
  var statusDot = document.getElementById('statusDot');
  var grayInput = document.getElementById('grayInput');
  var grayAdd = document.getElementById('grayAdd');
  var excludedInput = document.getElementById('excludedInput');
  var excludedAdd = document.getElementById('excludedAdd');
  var recheckBtn = document.getElementById('recheckBtn');

  var state = {
    theme: false,
    sites: false,
    themeAvailable: true,
    graySites: [],
    excludedSites: []
  };
  var locked = false;

  function render() {
    themeToggle.checked = state.theme;
    sitesToggle.checked = state.sites;

    themeRow.classList.toggle('on', state.theme);
    sitesRow.classList.toggle('on', state.sites);
    themeRow.classList.toggle('unavailable', !state.themeAvailable);

    themeToggle.disabled = !state.themeAvailable || locked;
    sitesToggle.disabled = locked;

    if (!state.themeAvailable) {
      statusText.textContent = 'Theme not found — sites still work';
      statusDot.className = 'dot part';
    } else if (state.theme && state.sites) {
      statusText.textContent = 'Deep black everywhere';
      statusDot.className = 'dot full';
    } else if (state.theme) {
      statusText.textContent = 'Black theme, normal sites';
      statusDot.className = 'dot part';
    } else if (state.sites) {
      statusText.textContent = 'Sites darkened only';
      statusDot.className = 'dot part';
    } else {
      statusText.textContent = 'All off';
      statusDot.className = 'dot';
    }

    renderChips('gray', document.getElementById('grayList'), document.getElementById('grayEmpty'), state.graySites);
    renderChips('excluded', document.getElementById('excludedList'), document.getElementById('excludedEmpty'), state.excludedSites);
  }

  function renderChips(kind, container, empty, sites) {
    while (container.firstChild) container.removeChild(container.firstChild);
    if (!sites.length) {
      container.appendChild(empty);
      return;
    }
    sites.forEach(function (site) {
      var chip = document.createElement('span');
      chip.className = 'gray-chip';
      var label = document.createElement('span');
      label.textContent = site;
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Remove ' + site;
      remove.setAttribute('aria-label', 'Remove ' + site);
      remove.addEventListener('click', function () { saveSite(kind, site, false); });
      chip.appendChild(label);
      chip.appendChild(remove);
      container.appendChild(chip);
    });
  }

  function ask(type) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: type }, function (res) {
        void chrome.runtime.lastError;
        resolve(res);
      });
    });
  }

  function askSet(type, enabled) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: type, enabled: enabled }, function (res) {
        void chrome.runtime.lastError;
        resolve(res);
      });
    });
  }

  function askPayload(type, payload) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(Object.assign({ type: type }, payload), function (res) {
        void chrome.runtime.lastError;
        resolve(res);
      });
    });
  }

  async function refresh() {
    var t = await ask('haki-theme-get');
    var s = await ask('haki-sites-get');
    var g = await ask('haki-gray-get');
    var x = await ask('haki-excluded-get');
    state.themeAvailable = !!(t && t.enabled !== null && t.enabled !== undefined);
    state.theme = state.themeAvailable ? !!t.enabled : false;
    state.sites = !s || s.enabled !== false;
    state.graySites = Array.isArray(g && g.sites) ? g.sites : [];
    state.excludedSites = Array.isArray(x && x.sites) ? x.sites : [];
    render();
  }

  async function saveSite(kind, site, add) {
    if (locked) return;
    var key = kind === 'gray' ? 'graySites' : 'excludedSites';
    var msgType = kind === 'gray' ? 'haki-gray-set' : 'haki-excluded-set';
    var list = state[key].slice();
    var idx = list.indexOf(site);
    if (add && idx === -1) list.push(site);
    if (!add && idx !== -1) list.splice(idx, 1);
    if (list.length === state[key].length && idx === -1) return;
    var res = await askPayload(msgType, { sites: list });
    if (res && Array.isArray(res.sites)) state[key] = res.sites;
    render();
  }

  function normalize(raw) {
    if (!raw) return '';
    if (raw.indexOf('://') === -1) raw = 'https://' + raw;
    var site;
    try { site = new URL(raw).hostname.toLowerCase(); }
    catch (e) { return ''; }
    return site.replace(/^www\./, '').replace(/^\.+|\.+$/g, '');
  }

  function submit(kind) {
    var input = kind === 'gray' ? grayInput : excludedInput;
    var site = normalize(input.value.trim().toLowerCase());
    input.value = '';
    if (!site) return;
    void saveSite(kind, site, true);
  }

  grayAdd.addEventListener('click', function () { submit('gray'); });
  excludedAdd.addEventListener('click', function () { submit('excluded'); });

  grayInput.addEventListener('input', function () { grayAdd.disabled = !grayInput.value.trim(); });
  excludedInput.addEventListener('input', function () { excludedAdd.disabled = !excludedInput.value.trim(); });

  [grayInput, excludedInput].forEach(function (input, index) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submit(index === 0 ? 'gray' : 'excluded');
    });
  });

  recheckBtn.addEventListener('click', async function () {
    if (locked) return;
    var old = recheckBtn.textContent;
    recheckBtn.textContent = 'Checking…';
    await ask('haki-recheck');
    recheckBtn.textContent = 'Checked';
    recheckBtn.classList.add('done');
    window.setTimeout(function () {
      recheckBtn.textContent = old;
      recheckBtn.classList.remove('done');
    }, 1400);
  });

  async function flip(which, next) {
    if (locked) return;
    locked = true;
    if (which === 'theme') themeRow.classList.add('busy');
    else sitesRow.classList.add('busy');
    render();

    try {
      if (which === 'theme') {
        var tr = await askSet('haki-theme-set', next);
        if (tr && tr.enabled !== undefined) state.theme = !!tr.enabled;
      } else {
        var sr = await askSet('haki-sites-set', next);
        if (sr && sr.enabled !== undefined) state.sites = !!sr.enabled;
      }
    } catch (e) {
      void e;
    }

    themeRow.classList.remove('busy');
    sitesRow.classList.remove('busy');
    locked = false;
    render();
  }

  themeToggle.addEventListener('change', function () {
    flip('theme', themeToggle.checked);
  });

  sitesToggle.addEventListener('change', function () {
    flip('sites', sitesToggle.checked);
  });

  /* Pick up changes made elsewhere (context menu / Alt+Shift+D)
     while the popup is open. */
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && (msg.type === 'haki-sites-state' || msg.type === 'haki-all-changed' ||
        msg.type === 'haki-gray-list-changed' || msg.type === 'haki-excluded-list-changed')) refresh();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.close();
  });

  refresh();
})();
