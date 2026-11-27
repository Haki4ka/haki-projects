/* Haki Shield — Twitch in-stream ad removal (v1.9.2).
   Our own implementation. Twitch fetches HLS playlists inside a blob Worker,
   so the hook must be installed BEFORE that worker's importScripts() runs.
   Bounded breaks are removed; for pre-rolls the real segment bytes stay intact
   (Twitch decodes them in WASM) but the declared EXTINF/DATERANGE duration is
   compressed to 0.1 s, so the player starts at once instead of waiting 15 s.
   A null TS remains only as a last-resort fallback for cached ad URLs. */

(function () {
  'use strict';

  var enabled = true;
  var videoEnabled = true;
  var stats = { tokens: 0, backups: 0, backupAttempts: 0, backupFailures: 0, timeouts: 0,
    playlists: 0, segmentsRemoved: 0, adRequests: 0, workers: 0,
    lastBackupType: null, lastBackupAt: 0 };
  var workers = [];
  var pageAdUris = Object.create(null);
  var pageLiveUri = null;

  /* MAIN world cannot call chrome.runtime. bridge.js forwards these to the
     per-site counter in the background service worker. */
  function reportBlocked(count) {
    var n = parseInt(count, 10) || 0;
    if (!n) return;
    try {
      window.postMessage({ source: 'haki-shield', type: 'blocked', count: n }, '*');
    } catch (e) {
      void e;
    }
  }

  /* A valid MPEG-TS stream made of null packets. Used instead of an ad
     segment so the player keeps appending data and does not stall. */
  function makeBlankTs() {
    if (self.__hakiBlankTs) return self.__hakiBlankTs;
    var data = new Uint8Array(188 * 16);
    for (var i = 0, cc = 0; i < data.length; i += 188) {
      /* Correct null packet: sync 0x47, PID 0x1FFF, adaptation-field-only. */
      data[i] = 0x47; data[i + 1] = 0x1f; data[i + 2] = 0xff;
      data[i + 3] = 0x10 | (cc++ & 0x0f);
      for (var j = 4; j < 188; j++) data[i + j] = 0xff;
    }
    self.__hakiBlankTs = data;
    return data;
  }
  /* Twitch media playlists have no .m3u8 in the URL:
     playlist.ttvnw.net/v1/playlist/<hash>. Recognise every HLS URL shape. */
  function playlistUrl(url) {
    return /\.m3u8(\?|$)|usher\.ttvnw\.net|playlist\.ttvnw\.net|live-video\.net/i.test(String(url || ''));
  }

  /* Remove a bounded ad break from the playlist so playback starts at once.
     Only remove when the break has an explicit end marker, is small and the
     playlist still has live segments; otherwise keep the segment and let the
     fetch hook substitute a live segment. */
  function cleanHls(text, cache, stat) {
    if (!text || text.indexOf('#EXTM3U') === -1) return text;
    /* Fast path for ordinary live playlists: no Twitch ad markers means there
       is nothing to rewrite. Keep the cached live segment fresh first, because
       an unbounded ad break later depends on it. */
    if (!/stitched-ad|maf-ad|CUE-OUT|adsquared|\/_404\/|processing|Amazon\||DCM,/i.test(text)) {
      var fastLines = text.split(/\r?\n/);
      var fastInf = null;
      var fastPdt = null;
      var fastUri = null;
      for (var fi = 0; fi < fastLines.length; fi++) {
        var fl = fastLines[fi];
        if (/^#EXTINF:/i.test(fl)) fastInf = fl;
        if (/^#EXT-X-PROGRAM-DATE-TIME:/i.test(fl)) fastPdt = fl;
        if (fl.trim() && !/^#/.test(fl)) fastUri = fl;
      }
      /* A master playlist's last line is another .m3u8, not a media segment.
         Caching it would make every ad substitution fetch a playlist as video. */
      if (fastUri && !/\.m3u8(\?|$)|playlist\.ttvnw\.net|\/v1\/playlist/i.test(fastUri)) {
        try {
          self.__hakiLiveUri = fastUri;
          self.__hakiLiveInf = fastInf;
          self.__hakiLivePdt = fastPdt;
        } catch (e) { void e; }
        if (typeof self.postMessage === 'function' && self.__hakiShieldReport) {
          self.postMessage({ __hakiLiveUri: fastUri });
        }
      }
      return text;
    }
    cache = cache || {};
    stat = stat || { playlists: 0, segmentsRemoved: 0 };
    var lines = text.split(/\r?\n/);
    var out = [];
    var inAd = false;
    var started = false;
    var ended = false;
    var changed = false;
    var removed = 0;
    /* A pre-roll has no live segment before it in the playlist. Reuse the
       last known live segment from an earlier refresh instead of leaving the
       ad in place (that is what produced a 30-second stall). */
    var liveUri = (typeof self !== 'undefined' && self.__hakiLiveUri) || null;
    var liveInf = (typeof self !== 'undefined' && self.__hakiLiveInf) || null;
    var livePdt = (typeof self !== 'undefined' && self.__hakiLivePdt) || null;
    var adSeen = 0;
    var adSlots = [];
    var pendingAdTitle = false;

    function cacheKey(uri) {
      try {
        var u = new URL(uri, self.location ? self.location.href : undefined);
        return u.origin + u.pathname;
      } catch (e) { return uri; }
    }

    function remember(uri) {
      if (!uri || /^#/.test(uri)) return;
      try { cache[cacheKey(uri)] = { t: Date.now(), uri: uri }; } catch (e) { void e; }
      removed++;
      if (typeof self.postMessage === 'function' && self.__hakiShieldReport) {
        self.postMessage({ __hakiAdUri: uri });
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      /* Twitch marks ad segments in the EXTINF title: #EXTINF:2.000,Amazon|<id>.
         Their URLs are ordinary CloudFront segment URLs, so the title is the
         only reliable way to tell them from live segments. */
      var adTitleTag = /^#EXTINF:/i.test(line) &&
        /,(Amazon\||DCM|Ad|Advertisement)/i.test(line);

      /* Remember the last real live segment. An ad break without an explicit
         end marker cannot be deleted safely, so later we clone this segment
         (with its normal duration) over the ad slot instead of waiting out
         a 30-second EXTINF. Never cache an ad's own duration as "live". */
      if (!inAd && !adTitleTag && /^#EXTINF:/i.test(line)) liveInf = line;
      if (/^#EXTINF:/i.test(line) && !adTitleTag) pendingAdTitle = false;
      if (!inAd && /^#EXT-X-PROGRAM-DATE-TIME:/i.test(line)) livePdt = line;

      if (/^#EXT-X-DATERANGE:/i.test(line) &&
          (/CLASS="twitch-stitched-ad"/i.test(line) ||
           /CLASS="twitch-maf-ad"/i.test(line) ||
           /X-TV-TWITCH-AD-AD-SESSION-ID=/i.test(line) ||
           /X-TV-TWITCH-AD-RADS-TOKEN=/i.test(line))) {
        inAd = true;
        started = true;
        changed = true;
        adSeen = 0;
        continue;
      }
      if (/^#EXT-X-DATERANGE:/i.test(line) && /CLASS="twitch-stream-source"/i.test(line)) {
        if (!/Amazon\||DCM,|adsquared/i.test(line)) {
          if (inAd) ended = true;
          inAd = false;
        }
      }
      if (/^#EXT-X-CUE-OUT\b/i.test(line)) { inAd = true; started = true; changed = true; adSeen = 0; continue; }
      if (/^#EXT-X-CUE-IN\b/i.test(line)) { if (inAd) ended = true; inAd = false; changed = true; continue; }

      if (inAd && (/^#EXT-X-PART\b/i.test(line) ||
                   /^#EXT-X-TWITCH-PREFETCH\b/i.test(line) ||
                   /^#EXT-X-PRELOAD-HINT\b/i.test(line))) {
        changed = true;
        continue;
      }

      if (adTitleTag) {
        pendingAdTitle = true;
        /* Keep the real ad segment bytes: Twitch decodes them in a WASM worker
           and any substituted TS breaks it. Compress the declared duration
           instead, so the player runs through the pod without a 15-s wait.
           Edit THIS line, not the previous one: the previous line is usually
           #EXT-X-PROGRAM-DATE-TIME. */
        var shortInf = line.replace(/^#EXTINF:\s*[\d.]+/i, '#EXTINF:0.1');
        if (shortInf !== line) {
          line = shortInf;
          changed = true;
        }
      }

      if (!/^#/.test(line) && line.trim()) {
        var adTitle = pendingAdTitle;
        pendingAdTitle = false;
        var adPattern = /\/adsquared\/|\/_404\/|\/processing|Amazon\||DCM,/i.test(line);
        var liveAgain = false;
        if (inAd && liveUri && !adPattern) {
          try {
            liveAgain = new URL(line, self.location ? self.location.href : undefined).hostname ===
              new URL(liveUri, self.location ? self.location.href : undefined).hostname;
          } catch (e) { void e; }
        }
        if (adTitle) {
          /* Real bytes stay in the playlist; only the timing was shortened. */
          inAd = false;
        } else if (adPattern || (inAd && !liveAgain)) {
          var adIndex = out.length;
          var infIndex = out.length - 1;
          var pdtIndex = out.length - 2;
          remember(line);
          out.push({
            ad: line,
            adIndex: adIndex,
            inf: liveInf,
            infIndex: out[infIndex] && /^#EXTINF:/i.test(out[infIndex]) ? infIndex : -1,
            pdt: livePdt,
            pdtIndex: out[pdtIndex] && /^#EXT-X-PROGRAM-DATE-TIME:/i.test(out[pdtIndex]) ? pdtIndex : -1,
            live: liveUri
          });
          adSlots.push(adIndex);
          adSeen++;
          /* A break without a closing marker must not swallow the whole
             stream: real Twitch breaks are well under this limit. */
          if (adSeen >= 12) inAd = false;
          continue;
        }
        if (liveAgain) inAd = false;
        if (!adTitle) liveUri = line;
      }
      out.push(line);
    }

    if (liveUri && !/\.m3u8(\?|$)|playlist\.ttvnw\.net|\/v1\/playlist/i.test(liveUri)) {
      try {
        self.__hakiLiveUri = liveUri;
        self.__hakiLiveInf = liveInf;
        self.__hakiLivePdt = livePdt;
      } catch (e) { void e; }
      if (typeof self.postMessage === 'function' && self.__hakiShieldReport) {
        self.postMessage({ __hakiLiveUri: liveUri });
      }
    }

    /* Never empty a playlist and never remove an unbounded/suspicious break. */
    if (adSlots.length && started && ended && adSlots.length <= 12 &&
        (out.length - adSlots.length) > 3) {
      var final = [];
      var droppedLeading = 0;
      var kept = false;
      for (var j = 0; j < out.length; j++) {
        var item = out[j];
        if (item && item.ad) {
          while (final.length && (/^#EXTINF:/i.test(final[final.length - 1]) ||
                 /^#EXT-X-PROGRAM-DATE-TIME:/i.test(final[final.length - 1]))) final.pop();
          if (!kept) droppedLeading++;
          continue;
        }
        kept = true;
        final.push(item);
      }
      if (droppedLeading) {
        final = final.map(function (ln) {
          if (/^#EXT-X-MEDIA-SEQUENCE:/i.test(ln) || /^#EXT-X-TWITCH-LIVE-SEQUENCE:/i.test(ln)) {
            return ln.replace(/\d+/, function (n) { return String(parseInt(n, 10) + droppedLeading); });
          }
          return ln;
        });
      }
      out = final;
      changed = true;
    } else {
      /* Unbounded break: keep the line count, but replace the ad URL AND its
         long EXTINF/PDT with the last live segment. The player sees ordinary
         live timing, so it starts at once; the cached ad URL is still covered
         by the fetch hook as a safety net. */
      for (var k = 0; k < out.length; k++) {
        var item = out[k];
        if (!item || !item.ad) continue;
        var fixed = false;
        if (item.live && item.live !== item.ad && item.inf && item.infIndex >= 0) {
          if (item.pdt && item.pdtIndex >= 0) out[item.pdtIndex] = item.pdt;
          out[item.infIndex] = item.inf;
          out[k] = item.live;
          fixed = true;
          changed = true;
        }
        if (!fixed) {
          out[k] = item.ad;
          /* Pre-roll has no live segment to clone. Shorten the slot's EXTINF
             instead of leaving a 2-second ad duration: the player runs through
             the break in a fraction of a second and starts the stream at once.
             The cached ad URL is still answered with a null TS by the fetch
             hook, so no ad picture is ever shown. */
          if (item.infIndex >= 0 && /^#EXTINF:/i.test(out[item.infIndex] || '')) {
            var shortened = out[item.infIndex].replace(/^#EXTINF:\s*[\d.]+/i, '#EXTINF:0.1');
            if (shortened !== out[item.infIndex]) {
              out[item.infIndex] = shortened;
              changed = true;
            }
          }
        }
      }
    }

    /* The player counts down the break from the DATERANGE DURATION, not from
       our EXTINF values. Shorten ad-break metadata as well, otherwise it still
       waits out the whole 10-second (or longer) break before starting. */
    if (changed || removed) {
      for (var m = 0; m < out.length; m++) {
        var tag = out[m];
        if (typeof tag === 'string' && /^#EXT-X-DATERANGE:/i.test(tag) &&
            /CLASS="twitch-(stitched-ad|ad-quartile)"/i.test(tag) &&
            /DURATION=[\d.]+/i.test(tag)) {
          out[m] = tag.replace(/DURATION=[\d.]+/i, 'DURATION=0.1');
        }
      }
    }

    if (!changed && !removed) return text;
    stat.playlists = (stat.playlists || 0) + 1;
    stat.segmentsRemoved = (stat.segmentsRemoved || 0) + removed;
    return out.join('\n');
  }

  /* Runs inside the Worker. All state lives on `self` because this function
     is stringified and injected into a blob worker. */
  function installWorkerHooks() {
    if (self.__hakiPatched) return;
    self.__hakiPatched = true;
    self.__hakiShieldReport = true;
    self.__hakiCache = self.__hakiCache || {};
    self.__hakiStats = self.__hakiStats || { playlists: 0, segmentsRemoved: 0, adRequests: 0 };
    self.__hakiLastReported = 0;

    /* The page can turn video blocking off at any time. Without this
       listener a running worker keeps its start-up state forever. */
    self.addEventListener('message', function (e) {
      if (e.data && e.data.__hakiShieldConfig) {
        self.__hakiEnabled = e.data.enabled !== false;
        if (!self.__hakiEnabled) self.__hakiCache = {};
      }
    });
    setInterval(function () {
      Object.keys(self.__hakiCache).forEach(function (k) {
        if (Date.now() - self.__hakiCache[k].t > 30000) delete self.__hakiCache[k];
      });
    }, 60000);

    function cacheKey(url) {
      try {
        var u = new URL(url, self.location && self.location.href);
        return u.origin + u.pathname;
      } catch (e) { return url; }
    }
    function cachedHit(url) {
      var hit = self.__hakiCache[url] || self.__hakiCache[cacheKey(url)];
      return hit && Date.now() - hit.t < 30000 ? hit : null;
    }
    function cleanUrl(url) {
      try {
        var u = new URL(url, self.location && self.location.href);
        if (u.searchParams.has('acmb')) u.searchParams.delete('acmb');
        if (u.searchParams.has('parent_domains')) u.searchParams.delete('parent_domains');
        return u.toString();
      } catch (e) { return url; }
    }

    function playlistUrl(url) {
      return /\.m3u8(\?|$)|usher\.ttvnw\.net|playlist\.ttvnw\.net|live-video\.net/i.test(String(url || ''));
    }

    var originalFetch = self.fetch;
    self.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (self.__hakiEnabled === false) return originalFetch.call(self, input, init);

      if (/ads\.twitch\.tv/i.test(url)) {
        self.__hakiStats.adRequests++;
        try { self.postMessage({ __hakiShieldStats: true, adRequests: 1 }); } catch (e) { void e; }
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      var adHit = cachedHit(url);
      if (adHit) {
        var live = self.__hakiLiveUri;
        if (live && live !== adHit.uri && live !== url) {
          return originalFetch.call(self, live, init).catch(function () {
            return new Response(self.__hakiBlank(), {
              status: 200, headers: { 'content-type': 'video/mp2t' }
            });
          });
        }
        return Promise.resolve(new Response(self.__hakiBlank(), {
          status: 200, headers: { 'content-type': 'video/mp2t' }
        }));
      }

      if (/\.m3u8(\?|$)|usher\.ttvnw\.net/i.test(url)) {
        var nextUrl = cleanUrl(url);
        if (nextUrl !== url) {
          input = typeof input === 'string' ? nextUrl : new Request(nextUrl, input);
        }
      }
      var promise = originalFetch.call(self, input, init);
      if (!playlistUrl(url)) return promise;

      return promise.then(function (res) {
        if (!res || !res.clone) return res;
        return res.clone().text().then(function (text) {
          var clean = self.__hakiClean(text, self.__hakiCache, self.__hakiStats);
          if (clean === text) return res;
          var headers = new Headers(res.headers);
          ['content-length', 'content-encoding', 'etag', 'last-modified', 'transfer-encoding'].forEach(function (h) {
            try { headers.delete(h); } catch (e) { void e; }
          });
          try { headers.set('content-type', 'application/vnd.apple.mpegurl'); } catch (e) { void e; }
          var delta = self.__hakiStats.segmentsRemoved - self.__hakiLastReported;
          self.__hakiLastReported = self.__hakiStats.segmentsRemoved;
          self.postMessage({ __hakiShieldStats: true, playlists: 1, segmentsRemoved: delta });
          return new Response(clean, {
            status: res.status, statusText: res.statusText, headers: headers
          });
        }).catch(function () { return res; });
      });
    };

    /* HLS may use XHR instead of fetch. Patch responseText on load. */
    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__hakiUrl = String(url || '');
      return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      if (self.__hakiEnabled !== false && playlistUrl(this.__hakiUrl || '')) {
        this.addEventListener('load', function () {
          try {
            var text = xhr.responseText;
            var clean = self.__hakiClean(text, self.__hakiCache, self.__hakiStats);
            if (clean !== text) {
              Object.defineProperty(xhr, 'responseText', {
                configurable: true, get: function () { return clean; }
              });
              var delta = self.__hakiStats.segmentsRemoved - self.__hakiLastReported;
              self.__hakiLastReported = self.__hakiStats.segmentsRemoved;
              self.postMessage({ __hakiShieldStats: true, playlists: 1, segmentsRemoved: delta });
            }
          } catch (e) { void e; }
        });
      }
      return originalSend.apply(this, arguments);
    };
  }

  function workerSource(original) {
    return 'self.__hakiEnabled=' + (videoEnabled ? 'true' : 'false') + ';\n' +
      'self.__hakiClean=' + cleanHls.toString() + ';\n' +
      'self.__hakiBlank=' + makeBlankTs.toString() + ';\n' +
      '(' + installWorkerHooks.toString() + ')();\n' +
      original;
  }

  /* Page world: GQL token rewrite, ad URI fallback, worker patching. */
  workerHookPage();

  function adKey(url) {
    try {
      var u = new URL(String(url), location.href);
      return u.origin + u.pathname;
    } catch (e) {
      return String(url || '');
    }
  }

  /* Ad URLs can arrive from the worker in a different form than the one the
     page later fetches. Match on origin+path too, not only on the full URL. */
  function isPageAd(url) {
    var hit = pageAdUris[url];
    if (hit && Date.now() - hit.t < 30000) return true;
    var key = adKey(url);
    for (var k in pageAdUris) {
      if (adKey(k) === key && Date.now() - pageAdUris[k].t < 30000) return true;
    }
    return false;
  }

  function workerHookPage() {
    var patchedFetch = window.fetch;
    var pageCache = Object.create(null);

    function tokenOf(json) {
      if (!json) return null;
      if (json.data && json.data.streamPlaybackAccessToken) return json.data.streamPlaybackAccessToken;
      if (json.streamPlaybackAccessToken) return json.streamPlaybackAccessToken;
      return null;
    }
    function adsOn(token) { return !!(token && (token.show_ads || token.server_ads)); }

    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';

      if (videoEnabled && isPageAd(url)) {
        if (pageLiveUri && pageLiveUri !== url) {
          return patchedFetch.call(this, pageLiveUri, init).catch(function () {
            return new Response(makeBlankTs(), {
              status: 200, headers: { 'content-type': 'video/mp2t' }
            });
          });
        }
        return Promise.resolve(new Response(makeBlankTs(), {
          status: 200, headers: { 'content-type': 'video/mp2t' }
        }));
      }

      var originalBody = init && typeof init.body === 'string' ? init.body : null;
      var isToken = !!(enabled && /gql\.twitch\.tv\/gql/i.test(url) && originalBody &&
        (/PlaybackAccessToken/i.test(originalBody) || originalBody.indexOf(TOKEN_HASH) !== -1));
      if (isToken) {
        var next = rewriteToken(originalBody);
        if (next !== originalBody) {
          init = Object.assign({}, init, { body: next });
          stats.tokens++;
        }
      }

      var promise = patchedFetch.call(this, input, init);

      /* Some player builds read playlists on the main thread instead of the
         blob worker. Clean those too, with the same universal routine. */
      if (videoEnabled && playlistUrl(url)) {
        return promise.then(function (res) {
          if (!res || !res.clone) return res;
          return res.clone().text().then(function (text) {
            var clean = cleanHls(text, pageCache, stats);
            if (clean === text) return res;
            var headers = new Headers(res.headers);
            ['content-length', 'content-encoding', 'etag', 'last-modified', 'transfer-encoding'].forEach(function (h) {
              try { headers.delete(h); } catch (err) { void err; }
            });
            try { headers.set('content-type', 'application/vnd.apple.mpegurl'); } catch (err) { void err; }
            return new Response(clean, {
              status: res.status, statusText: res.statusText, headers: headers
            });
          }).catch(function () { return res; });
        });
      }

      if (!isToken) return promise;

      /* popout alone no longer clears server ads. Ask for a different player
         type and use the first token without show_ads/server_ads. */
      return promise.then(function (res) {
        if (!res || !res.clone) return res;
        return res.clone().text().then(function (text) {
          var json;
          try { json = JSON.parse(text); } catch (e) { return res; }
          if (adsOn(tokenOf(json))) {
            /* Twitch's own token is left untouched. Rewriting playerType sent
               some streams through a slow server-side ad hand-off (10-30 s
               before the first frame). Playlist hooks still remove ad
               segments if Twitch inserts them in the stream. */
            reportBlocked(1);
          }
          return res;
        }).catch(function () { return res; });
      });
    };

    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__hakiUrl = String(url || '');
      return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      var xhr = this;
      if (enabled && /gql\.twitch\.tv\/gql/i.test(this.__hakiUrl || '') && typeof body === 'string') {
        var next = rewriteToken(body);
        if (next !== body) { body = next; stats.tokens++; }
      }
      if (videoEnabled && playlistUrl(this.__hakiUrl || '')) {
        this.addEventListener('load', function () {
          try {
            var text = xhr.responseText;
            var clean = cleanHls(text, pageCache, stats);
            if (clean !== text) {
              Object.defineProperty(xhr, 'responseText', { configurable: true, get: function () { return clean; } });
            }
          } catch (e) { void e; }
        });
      }
      if (videoEnabled && isPageAd(this.__hakiUrl)) {
        this.addEventListener('load', function () {
          try {
            if (xhr.responseType === 'arraybuffer' || xhr.responseType === 'blob') {
              Object.defineProperty(xhr, 'response', { configurable: true, get: function () { return makeBlankTs(); } });
            } else {
              Object.defineProperty(xhr, 'responseText', { configurable: true, get: function () { return ''; } });
            }
          } catch (e) { void e; }
        });
      }
      return originalSend.call(this, body);
    };
  }

  var TOKEN_HASH = 'ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9';
  /* Kept as a hook point only: every playerType rewrite we tried
     (popout/embed/autoplay) sent some channels through a slow server-side ad
     hand-off. The untouched token starts those channels in ~1 s. */
  function rewriteToken(body) {
    return body;
  }

  /* Patch blob workers BEFORE importScripts runs. */
  var OriginalWorker = window.Worker;
  window.Worker = function (url, options) {
    try {
      var src = String(url);
      var original = null;
      if (/^blob:/i.test(src)) {
        /* A synchronous XHR must NOT have a timeout: Brave throws
           InvalidAccessError on open() and the whole worker patch is skipped.
           Blob URLs are local, so this read is fast without a timeout. */
        var x = new XMLHttpRequest();
        x.open('GET', src, false);
        x.send();
        original = x.responseText || '';
      } else if (/^https?:/i.test(src)) {
        original = 'importScripts(' + JSON.stringify(src) + ');';
      } else if (/^data:/i.test(src)) {
        var payload = src.slice(src.indexOf(',') + 1);
        original = /;base64,/i.test(src) ? decodeURIComponent(escape(window.atob(payload))) : decodeURIComponent(payload);
      }
      if (original) {
        var blob = new Blob([workerSource(original)], { type: 'application/javascript' });
        var objUrl = URL.createObjectURL(blob);
        var w = new OriginalWorker(objUrl, options);
        setTimeout(function () { URL.revokeObjectURL(objUrl); }, 10000);
        stats.workers++;
        w.addEventListener('message', function (e) {
          var d = e && e.data;
          if (!d) return;
          if (d.__hakiAdUri) {
            var uri = d.__hakiAdUri;
            var key = adKey(uri);
            if (!pageAdUris[uri] && !pageAdUris[key]) reportBlocked(1);
            pageAdUris[uri] = { t: Date.now() };
            pageAdUris[key] = { t: Date.now() };
          }
          if (d.__hakiLiveUri && !/\.m3u8(\?|$)|playlist\.ttvnw\.net|\/v1\/playlist/i.test(d.__hakiLiveUri)) {
            pageLiveUri = d.__hakiLiveUri;
          }
          if (d.__hakiShieldStats) {
            if (d.playlists) stats.playlists += d.playlists;
            if (d.segmentsRemoved) stats.segmentsRemoved += d.segmentsRemoved;
            if (d.adRequests) stats.adRequests += d.adRequests;
          }
        });
        workers.push(w);
        return w;
      }
    } catch (e) { void e; }
    return new OriginalWorker(url, options);
  };
  window.Worker.prototype = OriginalWorker.prototype;
  try { Object.setPrototypeOf(window.Worker, OriginalWorker); } catch (e) { void e; }

  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data) return;
    var d = e.data;
    /* cleanHls() also runs on the main thread now; accept its local notices. */
    if (d.__hakiAdUri) {
      var uri = d.__hakiAdUri;
      var key = adKey(uri);
      if (!pageAdUris[uri] && !pageAdUris[key]) reportBlocked(1);
      pageAdUris[uri] = { t: Date.now() };
      pageAdUris[key] = { t: Date.now() };
    }
    if (d.__hakiLiveUri && !/\.m3u8(\?|$)|playlist\.ttvnw\.net|\/v1\/playlist/i.test(d.__hakiLiveUri)) pageLiveUri = d.__hakiLiveUri;
    if (d.source !== 'haki-shield' || d.type !== 'config') return;
    enabled = d.master !== false && !d.siteOff;
    videoEnabled = enabled && d.videoAds !== false;
    for (var i = 0; i < workers.length; i++) {
      try { workers[i].postMessage({ __hakiShieldConfig: true, enabled: videoEnabled }); } catch (err) { void err; }
    }
  });

  window.__hakiShield = {
    version: '1.9.2',
    stats: stats,
    cleanHls: cleanHls,
    adUris: pageAdUris,
    adKeys: function () { return Object.keys(pageAdUris); },
    isEnabled: function () { return enabled; },
    isVideoEnabled: function () { return videoEnabled; },
    /* Lightweight diagnostics only: no console output, no network calls. */
    diag: function () {
      return {
        version: '1.9.2',
        enabled: enabled,
        videoEnabled: videoEnabled,
        adUriCount: Object.keys(pageAdUris).length,
        stats: stats,
        lastBackupType: stats.lastBackupType,
        lastBackupAt: stats.lastBackupAt,
        workerPatches: stats.workers
      };
    }
  };
})();
