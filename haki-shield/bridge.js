/* Haki Shield — bridge between extension storage and the page world.
   Written by us. Runs in the isolated content-script world. */

(function () {
  'use strict';

  var KEYS = ['enabled', 'networkAds', 'videoAds', 'banners', 'disabledSites'];

  function isSiteDisabled(list, host) {
    if (!Array.isArray(list)) return false;
    for (var i = 0; i < list.length; i++) {
      var s = String(list[i] || '').toLowerCase().replace(/^www\./, '');
      if (!s) continue;
      if (host === s || host.endsWith('.' + s)) return true;
    }
    return false;
  }

  function publish(cfg) {
    var host = location.hostname.toLowerCase();
    var siteOff = isSiteDisabled(cfg.disabledSites, host);
    var payload = {
      source: 'haki-shield',
      type: 'config',
      master: cfg.enabled !== false,
      networkAds: cfg.networkAds !== false && !siteOff,
      videoAds: cfg.videoAds !== false && !siteOff,
      banners: cfg.banners !== false && !siteOff,
      siteOff: siteOff,
      host: host
    };
    try {
      window.postMessage(payload, '*');
    } catch (e) {
      void e;
    }
  }

  function refresh() {
    chrome.storage.local.get(KEYS, function (cfg) {
      publish(cfg || {});
    });
  }

  refresh();
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local') refresh();
  });

  /* twitch.js runs in MAIN world and cannot use chrome.* directly. It posts
     one message per newly detected ad; we forward it to the background. */
  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data || e.data.source !== 'haki-shield') return;
    if (e.data.type !== 'blocked') return;
    var n = parseInt(e.data.count, 10) || 1;
    try {
      chrome.runtime.sendMessage({ type: 'haki-blocked', host: location.hostname, count: n });
    } catch (err) {
      void err;
    }
  });
})();
