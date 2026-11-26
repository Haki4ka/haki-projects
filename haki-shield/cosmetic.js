/* Haki Shield v1.7.0 — banner hiding. Our own CSS, nothing imported. */

(function () {
  'use strict';

  var STYLE_ID = 'haki-shield-cosmetic';
  var CSS = [
    'ins.adsbygoogle, iframe[src*="doubleclick.net"], iframe[src*="googlesyndication"] { display:none !important; }',
    '[id^="google_ads_iframe"], [id^="div-gpt-ad"], [id^="ad_iframe"], [data-ad-slot] { display:none !important; }',
    '.adsbygoogle, .ad-banner, .ads-banner, .banner-ad, .advertisement, [aria-label="Advertisement"], [aria-label="Ad"] { display:none !important; }',
    '[class~="ad-container"], [id~="ad-container"], [class*="advertisement-wrapper"] { display:none !important; }',
    /* v1.6.1 — a few structural, high-confidence ad placeholders only.
       No wholesale import of public cosmetic filters: those break layouts. */
    'iframe[src*="googleadservices.com"], iframe[src*="adnxs.com"], iframe[src*="amazon-adsystem.com"] { display:none !important; }',
    'ins[data-ad-client], [data-ad-format] { display:none !important; }',
    '[class~="ad-slot"], [id~="ad-slot"], [class~="ad-placeholder"], [id~="ad-placeholder"] { display:none !important; }',
    '#twilight-sticky-footer-root { display:none !important; }',
    /* Twitch's own discounted Gift Subs callout — first-party marketing. */
    'html body div[class*="giftExpirationCallout"] { display:none !important; }'
  ].join('\n');

  /* TradingView: the chart-ad toast and its own promo popups/banners.
     Third-party ads there already go through Google Ad Manager (rules 1-3). */
  var TV_CSS = [
    'html body #charting-ad, html body li:has(#charting-ad) { display:none !important; }',
    'html body div[class*="dialog-"]:has(a[href*="/black-friday/"]), html body div[class*="dialogWrapper-"]:has(a[href*="/black-friday/"]) { display:none !important; }',
    'html body.i-no-scroll:has(a[href*="/black-friday/"]) { overflow:auto !important; }',
    'html body .tv-header__offer-button-container--blackfriday, html body a.tv-header__offer-button[href*="/black-friday/"] { display:none !important; }',
    'html body .js-main-page-promo, html body .tv-header-promo-backdrop { display:none !important; }'
  ].join('\n');

  var on = true;

  function apply() {
    var old = document.getElementById(STYLE_ID);
    if (on) {
      if (old) return;
      var style = document.createElement('style');
      style.id = STYLE_ID;
      var tv = /(^|\.)tradingview\.com$/.test(location.hostname.toLowerCase());
      style.textContent = CSS + (tv ? '\n' + TV_CSS : '');
      (document.head || document.documentElement).appendChild(style);
    } else if (old && old.parentNode) {
      old.parentNode.removeChild(old);
    }
  }

  function read() {
    chrome.storage.local.get(['enabled', 'banners', 'disabledSites'], function (cfg) {
      cfg = cfg || {};
      var host = location.hostname.toLowerCase();
      var off = false;
      var list = cfg.disabledSites || [];
      for (var i = 0; i < list.length; i++) {
        var s = String(list[i] || '').toLowerCase().replace(/^www\./, '');
        if (s && (host === s || host.endsWith('.' + s))) { off = true; break; }
      }
      on = cfg.enabled !== false && cfg.banners !== false && !off;
      apply();
    });
  }

  read();
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local') read();
  });
  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data || e.data.source !== 'haki-shield' || e.data.type !== 'config') return;
    on = e.data.master !== false && e.data.banners !== false && !e.data.siteOff;
    apply();
  });

  /* Count cosmetic blocks once per element, without MutationObserver (that
     used to cause reflow loops). A cheap scan every 5 s is enough. */
  var COUNT_SELECTORS = [
    'ins.adsbygoogle',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication"]',
    '[id^="google_ads_iframe"]',
    '[id^="div-gpt-ad"]',
    '[id^="ad_iframe"]',
    '[data-ad-slot]',
    '.adsbygoogle',
    '.ad-banner',
    '.ads-banner',
    '.banner-ad',
    '.advertisement',
    '[aria-label="Advertisement"]',
    '[aria-label="Ad"]',
    '[class~="ad-container"]',
    '[id~="ad-container"]',
    '[class*="advertisement-wrapper"]',
    'iframe[src*="googleadservices.com"]',
    'iframe[src*="adnxs.com"]',
    'iframe[src*="amazon-adsystem.com"]',
    'ins[data-ad-client]',
    '[data-ad-format]',
    '[class~="ad-slot"]',
    '[id~="ad-slot"]',
    '[class~="ad-placeholder"]',
    '[id~="ad-placeholder"]',
    '#twilight-sticky-footer-root',
    'div[class*="giftExpirationCallout"]',
    '#charting-ad',
    '.tv-header__offer-button-container--blackfriday',
    'a.tv-header__offer-button[href*="/black-friday/"]',
    '.js-main-page-promo',
    '.tv-header-promo-backdrop'
  ].join(',');

  function countBanners() {
    if (!on) return;
    var found;
    try { found = document.querySelectorAll(COUNT_SELECTORS); } catch (e) { return; }
    var n = 0;
    for (var i = 0; i < found.length; i++) {
      var el = found[i];
      if (!el.hasAttribute('data-haki-counted')) {
        el.setAttribute('data-haki-counted', '1');
        n++;
      }
    }
    if (!n) return;
    try {
      chrome.runtime.sendMessage({ type: 'haki-blocked', host: location.hostname, count: n });
    } catch (e) {
      void e;
    }
  }

  setInterval(countBanners, 5000);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', countBanners, { once: true });
  } else {
    countBanners();
  }
})();
