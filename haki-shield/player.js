/* Haki Shield v1.9.2 — universal in-player ad guard.
   Runs in the page's MAIN world so it can stop a player from
   swapping the real video source for an ad creative. Nothing imported. */

(function () {
  'use strict';

  var PROTECTED = ['twitch.tv', 'tradingview.com', 'youtube.com', 'kleinanzeigen.de'];
  var host = (location.hostname || '').toLowerCase().replace(/^www\./, '');
  for (var p = 0; p < PROTECTED.length; p += 1) {
    if (host === PROTECTED[p] || host.endsWith('.' + PROTECTED[p])) return;
  }

  var on = true;
  var videoOn = true;
  var siteOff = false;
  var baseline = Object.create(null);
  var tainted = Object.create(null);
  var vastSeen = false;
  var pending = 0;

  function hostOf(url) {
    try { return new URL(String(url), location.href).hostname.toLowerCase(); }
    catch (e) { return ''; }
  }

  function ownHost(h) {
    return !!h && (h === host || h.endsWith('.' + host) || host.endsWith('.' + h));
  }

  function isVastUrl(url) {
    return /\/do2\/[0-9a-f]{8,}\//i.test(url) ||
      /\/vast([?#]|$)/i.test(url) ||
      /\/(adtag|vasttag|vmap)([/?#]|$)/i.test(url);
  }

  function isJsonAdApi(url) {
    return /\/api\/models\/vsat\/|\/smartpop\//i.test(url);
  }

  /* High-confidence ad shapes. Deliberately NOT remote_control.php: on the
     site testing showed that endpoint is part of the real stream control and
     blocking it stops the content too. */
  function strongAd(url) {
    return /\/video\/ol_[0-9a-f]{12,}[.]mp4/i.test(url) ||
      /\/(pre|mid|post)roll([/_.-]|$)/i.test(url) ||
      /(?:^|[?&])(adurl|ad_url|adSrc|vasturl|creative_url)=/i.test(url);
  }

  function suspect(url) {
    var s = String(url || '');
    if (!s || /^(blob|data):/i.test(s)) return false;
    if (tainted[s]) return true;
    if (strongAd(s)) return true;
    if (vastSeen) {
      var h = hostOf(s);
      if (h && !ownHost(h) && !baseline[h]) return true;
    }
    return false;
  }

  function report() {
    pending += 1;
  }

  setInterval(function () {
    if (!pending) return;
    var n = pending;
    pending = 0;
    try {
      window.postMessage({ source: 'haki-shield', type: 'blocked', count: n }, '*');
    } catch (e) { void e; }
  }, 2000);

  function guard(media, value) {
    if (!on || !videoOn || siteOff) return value;
    var s = String(value || '');
    if (suspect(s)) {
      report();
      return media.__hakiLastGood || 'about:blank';
    }
    var h = hostOf(s);
    if (h) baseline[h] = true;
    media.__hakiLastGood = s;
    return value;
  }

  var desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  if (desc && desc.set) {
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      configurable: true,
      enumerable: desc.enumerable,
      get: function () { return desc.get.call(this); },
      set: function (value) { return desc.set.call(this, guard(this, value)); }
    });
  }

  var sourceDesc = Object.getOwnPropertyDescriptor(HTMLSourceElement.prototype, 'src');
  if (sourceDesc && sourceDesc.set) {
    Object.defineProperty(HTMLSourceElement.prototype, 'src', {
      configurable: true,
      enumerable: sourceDesc.enumerable,
      get: function () { return sourceDesc.get.call(this); },
      set: function (value) { return sourceDesc.set.call(this, guard(this, value)); }
    });
  }

  var oldSet = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    var n = String(name).toLowerCase();
    if (n === 'src' && (this.tagName === 'VIDEO' || this.tagName === 'SOURCE')) {
      value = guard(this, value);
    }
    return oldSet.call(this, name, value);
  };

  function extractMediaUrls(text) {
    var out = [];
    var re = /https?:\/\/[^\s"'<>\\]+/g;
    var m;
    while ((m = re.exec(String(text || ''))) !== null) {
      var u = m[0].replace(/&amp;/g, '&');
      if (/[.](mp4|m3u8|webm)([?#]|$)/i.test(u) || /\/video\/[0-9a-z_]+\.mp4/i.test(u)) {
        out.push(u);
      }
    }
    return out;
  }

  function inspect(url, text) {
    var hit = isVastUrl(url) || /<VAST[\s>]/i.test(String(text || ''));
    if (!hit) return;
    vastSeen = true;
    var urls = extractMediaUrls(text);
    for (var i = 0; i < urls.length; i += 1) tainted[urls[i]] = true;
  }

  var originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (isVastUrl(url)) {
        vastSeen = true;
        return Promise.resolve(new Response('', {
          status: 200,
          headers: { 'content-type': 'application/xml' }
        }));
      }
      if (isJsonAdApi(url)) vastSeen = true;
      return originalFetch.apply(this, arguments).then(function (res) {
        try {
          if (isVastUrl(url) || isJsonAdApi(url) || /xml|json|text/.test(
            (res.headers && res.headers.get('content-type')) || '')) {
            res.clone().text().then(function (t) { inspect(url, t); }).catch(function () { void 0; });
          }
        } catch (e) { void e; }
        return res;
      });
    };
  }

  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var u = String(url || '');
    this.__hakiVast = isVastUrl(u);
    if (this.__hakiVast || isJsonAdApi(u)) vastSeen = true;
    var self = this;
    this.addEventListener('load', function () {
      try { inspect(u, originalText.call(self)); } catch (e) { void e; }
    }, { once: true });
    return originalOpen.apply(this, arguments);
  };

  var originalTextDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
  function originalText(xhr) {
    return originalTextDescriptor && originalTextDescriptor.get
      ? originalTextDescriptor.get.call(xhr)
      : xhr.responseText;
  }
  if (originalTextDescriptor && originalTextDescriptor.get) {
    Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
      configurable: true,
      enumerable: originalTextDescriptor.enumerable,
      get: function () {
        if (this.__hakiVast) return '';
        return originalTextDescriptor.get.call(this);
      }
    });
  }

  var STYLE_ID = 'haki-shield-playerads';
  function ensureStyle() {
    if (!document.head || document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      'video[src*="/video/ol_"],video[src*="adtag"],video[src*="/vast"]' +
      '{display:none !important}';
    document.head.appendChild(style);
  }
  if (document.head) ensureStyle();
  else document.addEventListener('DOMContentLoaded', ensureStyle, { once: true });

  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data || e.data.source !== 'haki-shield') return;
    if (e.data.type !== 'config') return;
    on = e.data.master !== false;
    videoOn = e.data.videoAds !== false;
    siteOff = !!e.data.siteOff;
    if (on && videoOn && !siteOff) ensureStyle();
  });
})();
