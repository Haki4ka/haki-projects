/* Haki Shield options page — our own UI logic. */

(function () {
  'use strict';

  var state = null;

  function render() {
    if (!state) return;
    document.querySelectorAll('[data-toggle]').forEach(function (row) {
      row.classList.toggle('on', !!state[row.getAttribute('data-toggle')]);
    });
    document.getElementById('blocked').textContent = state.blockedToday || 0;
    document.getElementById('rulesets').textContent =
      (state.enabledRulesets && state.enabledRulesets.length)
        ? state.enabledRulesets.join(' + ')
        : 'none';

    var errorBox = document.getElementById('rulesetError');
    if (state.rulesetError) {
      errorBox.textContent = 'Filter set error: ' + state.rulesetError;
      errorBox.hidden = false;
    } else {
      errorBox.textContent = '';
      errorBox.hidden = true;
    }

    var list = document.getElementById('siteList');
    list.textContent = '';
    (state.disabledSites || []).forEach(function (site, index) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.textContent = site;
      var remove = document.createElement('button');
      remove.textContent = 'Remove';
      remove.addEventListener('click', function () {
        var next = (state.disabledSites || []).slice();
        next.splice(index, 1);
        set({ disabledSites: next });
      });
      li.appendChild(name);
      li.appendChild(remove);
      list.appendChild(li);
    });
    if (!(state.disabledSites || []).length) {
      var empty = document.createElement('li');
      empty.textContent = 'No sites added';
      list.appendChild(empty);
    }
  }

  function adopt(res) {
    if (!res || !res.state) return;
    state = res.state;
    state.blockedToday = res.blockedToday || 0;
    state.enabledRulesets = res.enabledRulesets || [];
    state.rulesetError = res.rulesetError || '';
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
      if (!state) return;
      var key = row.getAttribute('data-toggle');
      var patch = {};
      patch[key] = !state[key];
      set(patch);
    });
  });

  document.getElementById('addSite').addEventListener('click', function () {
    var raw = document.getElementById('siteInput').value.trim().toLowerCase();
    if (!raw) return;
    var site = raw.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!site || site.indexOf('.') === -1) return;
    var next = (state && state.disabledSites || []).slice();
    if (next.indexOf(site) === -1) next.push(site);
    set({ disabledSites: next });
    document.getElementById('siteInput').value = '';
  });

  document.getElementById('siteInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('addSite').click();
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'haki-shield-state') adopt(msg);
  });

  load();
})();
