/* Haki Shield popup — our own UI logic. */

(function () {
  'use strict';

  var state = null;
  var siteCounts = Object.create(null);
  var host = '';

  function countForHost() {
    return (host && siteCounts[host]) || 0;
  }

  function render() {
    if (!state) return;
    var status = document.getElementById('status');
    status.textContent = state.enabled ? 'ON' : 'OFF';
    status.classList.toggle('off', !state.enabled);

    document.querySelectorAll('[data-toggle]').forEach(function (row) {
      var key = row.getAttribute('data-toggle');
      row.classList.toggle('on', !!state[key]);
    });

    document.getElementById('blocked').textContent = countForHost();

    var siteOff = false;
    var list = state.disabledSites || [];
    for (var i = 0; i < list.length; i++) {
      var s = String(list[i] || '').toLowerCase().replace(/^www\./, '');
      if (host && (host === s || host.endsWith('.' + s))) { siteOff = true; break; }
    }
    document.getElementById('siteDot').classList.toggle('off', siteOff);
    document.getElementById('siteBtn').textContent = siteOff ? 'Enable on this site' : 'Disable on this site';
  }

  function adopt(res) {
    if (!res) return;
    state = res.state || state;
    siteCounts = res.siteCounts || siteCounts;
    render();
  }

  function set(patch) {
    chrome.runtime.sendMessage({ type: 'set-state', patch: patch }, adopt);
  }

  function load() {
    chrome.runtime.sendMessage({ type: 'get-state' }, adopt);
  }

  document.querySelectorAll('[data-toggle]').forEach(function (row) {
    row.addEventListener('click', function () {
      var key = row.getAttribute('data-toggle');
      var patch = {};
      patch[key] = !state[key];
      set(patch);
    });
  });

  document.getElementById('siteBtn').addEventListener('click', function () {
    if (!host) return;
    var list = (state.disabledSites || []).slice();
    var i = -1;
    for (var k = 0; k < list.length; k++) {
      var s = String(list[k] || '').toLowerCase().replace(/^www\./, '');
      if (host === s || host.endsWith('.' + s)) { i = k; break; }
    }
    if (i >= 0) list.splice(i, 1); else list.push(host);
    set({ disabledSites: list });
  });

  document.getElementById('openSettings').addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
  });

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    try {
      var url = new URL((tabs[0] && tabs[0].url) || '');
      host = url.hostname.toLowerCase().replace(/^www\./, '');
    } catch (e) {
      host = '';
    }
    if (!host || /^(chrome|brave|edge|moz-extension):/.test(host)) {
      document.getElementById('host').textContent = 'Browser page';
      document.getElementById('siteBtn').disabled = true;
      host = '';
    } else {
      document.getElementById('host').textContent = host;
    }
    render();
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'haki-shield-state') adopt(msg);
  });

  load();
})();
