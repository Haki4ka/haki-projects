(function () {
  'use strict';

  var themeRow = document.getElementById('themeRow');
  var sitesRow = document.getElementById('sitesRow');
  var themeToggle = document.getElementById('themeToggle');
  var sitesToggle = document.getElementById('sitesToggle');
  var statusText = document.getElementById('statusText');
  var statusDot = document.getElementById('statusDot');

  var state = { theme: false, sites: false, themeAvailable: true };
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

  async function refresh() {
    var t = await ask('haki-theme-get');
    var s = await ask('haki-sites-get');
    state.themeAvailable = !!(t && t.enabled !== null && t.enabled !== undefined);
    state.theme = state.themeAvailable ? !!t.enabled : false;
    state.sites = !s || s.enabled !== false;
    render();
  }

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
    if (msg && (msg.type === 'haki-sites-state' || msg.type === 'haki-all-changed')) refresh();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.close();
  });

  refresh();
})();
