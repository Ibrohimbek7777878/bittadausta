/* errlog.js — BRAUZERDAGI HAR QANDAY XATONI USHLAYDI (2026-08-24)
 *
 * Foydalanuvchi so'zi: «kod tomondan qilganda to'g'rilab ketaveryapsan,
 * lekin qo'lda real ishlatib ko'rganda xatolar to'xtovsiz chiqayapti —
 * har qanday turdagi errorni ushlaydigan bo'lsin».
 *
 * Ushlaydi:
 *   1. window.onerror              — oddiy JS xatolari
 *   2. unhandledrejection         — ushlanmagan promise (async/await)
 *   3. fetch()                    — tarmoq xatosi va 4xx/5xx javoblar
 *   4. XMLHttpRequest             — eski so'rovlar
 *   5. WebSocket                  — uzilish va xato
 *   6. console.error              — kod o'zi yozgan xatolar
 *   7. resurs yuklanmasligi       — <img>, <script>, <link>
 *   8. ErrLog.push(...)           — qo'lda (BLE, kamera, 3D)
 *
 * Xususiyatlari:
 *   · Paket qilib yuboradi (3 soniyada bir marta) — server bosilmasin
 *   · Bir xil xato takrorlansa bir marta yuboriladi (`count` serverda oshadi)
 *   · Jurnalning O'ZI hech qachon xato bermaydi (hammasi try/catch ichida)
 *   · Cheksiz aylanish yo'q — o'z so'rovi jurnalga tushmaydi
 */
(function (w) {
  'use strict';
  if (w.ErrLog) return;

  var ENDPOINT = '/mini/api/client-error/';
  var FLUSH_MS = 3000;
  var MAX_QUEUE = 30;
  var MAX_PER_SESSION = 200;      // bir sessiyada ko'pi bilan

  var queue = [];
  var seen = {};                  // barmoq izi → yuborilganmi
  var sent = 0;
  var timer = null;

  function platform() {
    try {
      if (w.Telegram && Telegram.WebApp && Telegram.WebApp.platform)
        return 'telegram/' + Telegram.WebApp.platform;
      var ua = navigator.userAgent || '';
      if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
      if (/Android/.test(ua)) return /Chrome/.test(ua) ? 'android-chrome' : 'android';
      if (/Firefox/.test(ua)) return 'firefox';
      if (/Edg\//.test(ua)) return 'edge';
      if (/Chrome/.test(ua)) return 'chrome';
      return 'other';
    } catch (e) { return '?'; }
  }

  function username() {
    try {
      return (w.STATE && STATE.user && STATE.user.username)
          || (w.__USER_DATA__ && __USER_DATA__.username) || '';
    } catch (e) { return ''; }
  }

  function fp(kind, msg, src) {
    return kind + '|' + String(msg || '').replace(/\d+/g, 'N').slice(0, 200)
               + '|' + String(src || '').slice(0, 80);
  }

  function flush() {
    timer = null;
    if (!queue.length) return;
    var items = queue.splice(0, MAX_QUEUE);
    try {
      var body = JSON.stringify({ username: username(), items: items });
      // sendBeacon — sahifa yopilayotganda ham yetib boradi
      if (navigator.sendBeacon) {
        var ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
        if (ok) return;
      }
      var x = new XMLHttpRequest();
      x.open('POST', ENDPOINT, true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.__errlog = true;                 // o'z so'rovimiz — qayta ushlanmasin
      x.send(body);
    } catch (e) { /* jim */ }
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(flush, FLUSH_MS);
  }

  // ── IZ (breadcrumb) — «Script error.» kabi bo'sh xabarlarda ham
  //    NIMA QILGANDA yuz berganini bilish uchun (2026-08-24).
  var crumb = { click: '', hash: '', at: 0 };
  try {
    document.addEventListener('click', function (e) {
      try {
        var t = e && e.target;
        if (!t || !t.tagName) return;
        var d = t.tagName.toLowerCase();
        if (t.id) d += '#' + t.id;
        else if (t.className && typeof t.className === 'string')
          d += '.' + t.className.trim().split(/\s+/).slice(0, 2).join('.');
        var txt = (t.textContent || '').trim().slice(0, 40);
        if (txt) d += ' «' + txt + '»';
        crumb.click = d.slice(0, 120);
        crumb.at = Date.now();
      } catch (x) {}
    }, true);
  } catch (e) {}

  function withCrumb(extra) {
    try {
      var o = {};
      for (var k in (extra || {})) if (extra.hasOwnProperty(k)) o[k] = extra[k];
      if (crumb.click) o._click = crumb.click;
      o._hash = String(location.hash || '').slice(0, 80);
      if (crumb.at) o._ms = Date.now() - crumb.at;   // bosishdan keyin necha ms
      return o;
    } catch (e) { return extra || null; }
  }

  var ErrLog = {
    /** kind: js|promise|fetch|ws|ble|media|console|manual */
    push: function (kind, message, opt) {
      try {
        if (sent >= MAX_PER_SESSION) return;
        opt = opt || {};
        var msg = String(message == null ? '' : message).slice(0, 2000);
        if (!msg) return;
        var key = fp(kind, msg, opt.source);
        if (seen[key]) return;           // shu sessiyada allaqachon yuborilgan
        seen[key] = 1;
        sent++;
        queue.push({
          kind: kind || 'js',
          message: msg,
          stack: String(opt.stack || '').slice(0, 4000),
          page: String(location.href || '').slice(0, 300),
          source: String(opt.source || '').slice(0, 300),
          req_url: String(opt.req_url || '').slice(0, 300),
          req_status: (typeof opt.req_status === 'number') ? opt.req_status : null,
          platform: platform(),
          screen: (screen.width + 'x' + screen.height),
          extra: withCrumb(opt.extra)
        });
        schedule();
      } catch (e) { /* jurnalning o'zi yiqilmasin */ }
    },
    flush: flush,
    _state: function () { return { queued: queue.length, sent: sent }; }
  };
  w.ErrLog = ErrLog;

  // ── 1. Oddiy JS xatolari ────────────────────────────────────────────
  w.addEventListener('error', function (e) {
    try {
      // Resurs yuklanmadi (<img>, <script>, <link>) — `e.target` element bo'ladi
      if (e && e.target && e.target !== w && e.target.tagName) {
        var src = e.target.src || e.target.href || '';
        if (src) {
          ErrLog.push('fetch', 'Resurs yuklanmadi: ' + e.target.tagName,
                      { req_url: src });
          return;
        }
      }
      var msg = (e && e.message) || 'Noma\'lum JS xatosi';
      var ex = {};
      // «Script error.» — brauzer boshqa domendagi skript tafsilotini
      // bermaydi. Hech bo'lmasa qaysi tashqi skriptlar borligini yozamiz.
      if (/^Script error/i.test(msg)) {
        try {
          var ext = [];
          var ss = document.getElementsByTagName('script');
          for (var i = 0; i < ss.length; i++) {
            var u = ss[i].src || '';
            if (u && u.indexOf(location.host) < 0) ext.push(u.slice(0, 80));
          }
          ex._ext = ext.slice(0, 5);
        } catch (x) {}
      }
      ErrLog.push('js', msg, {
        source: ((e && e.filename) || '') + ':' + ((e && e.lineno) || 0),
        stack: (e && e.error && e.error.stack) || '',
        extra: ex
      });
    } catch (x) {}
  }, true);

  // ── 2. Ushlanmagan promise ──────────────────────────────────────────
  w.addEventListener('unhandledrejection', function (e) {
    try {
      var r = e && e.reason;
      ErrLog.push('promise',
        (r && (r.message || r.toString && r.toString())) || 'Promise rad etildi',
        { stack: (r && r.stack) || '' });
    } catch (x) {}
  });

  // ── 3. fetch() ──────────────────────────────────────────────────────
  if (w.fetch) {
    var _fetch = w.fetch;
    w.fetch = function (input, init) {
      var url = '';
      try { url = (typeof input === 'string') ? input : (input && input.url) || ''; } catch (e) {}
      if (url.indexOf(ENDPOINT) >= 0) return _fetch.apply(this, arguments);
      return _fetch.apply(this, arguments).then(function (res) {
        try {
          if (res && !res.ok) {
            ErrLog.push('fetch', 'So\'rov ' + res.status + ': ' + url,
                        { req_url: url, req_status: res.status });
          }
        } catch (e) {}
        return res;
      }).catch(function (err) {
        try {
          ErrLog.push('fetch', 'Tarmoq xatosi: ' + ((err && err.message) || err),
                      { req_url: url, stack: (err && err.stack) || '' });
        } catch (e) {}
        throw err;
      });
    };
  }

  // ── 4. XMLHttpRequest ───────────────────────────────────────────────
  try {
    var _open = XMLHttpRequest.prototype.open;
    var _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) {
      this.__url = u || '';
      return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      var self = this;
      if (!self.__errlog && String(self.__url || '').indexOf(ENDPOINT) < 0) {
        self.addEventListener('load', function () {
          try {
            if (self.status >= 400) {
              ErrLog.push('fetch', 'XHR ' + self.status + ': ' + self.__url,
                          { req_url: self.__url, req_status: self.status });
            }
          } catch (e) {}
        });
        self.addEventListener('error', function () {
          try { ErrLog.push('fetch', 'XHR tarmoq xatosi: ' + self.__url,
                            { req_url: self.__url }); } catch (e) {}
        });
        self.addEventListener('timeout', function () {
          try { ErrLog.push('fetch', 'XHR vaqti tugadi: ' + self.__url,
                            { req_url: self.__url }); } catch (e) {}
        });
      }
      return _send.apply(this, arguments);
    };
  } catch (e) {}

  // ── 5. WebSocket ────────────────────────────────────────────────────
  try {
    var _WS = w.WebSocket;
    if (_WS) {
      w.WebSocket = function (url, proto) {
        var s = proto ? new _WS(url, proto) : new _WS(url);
        try {
          s.addEventListener('error', function () {
            ErrLog.push('ws', 'WebSocket xatosi', { req_url: String(url).slice(0, 200) });
          });
          s.addEventListener('close', function (ev) {
            // 1000/1001 — odatiy yopilish, jurnalga yozilmaydi
            if (ev && ev.code && ev.code !== 1000 && ev.code !== 1001) {
              ErrLog.push('ws', 'WebSocket uzildi: kod ' + ev.code
                          + (ev.reason ? (' — ' + ev.reason) : ''),
                          { req_url: String(url).slice(0, 200) });
            }
          });
        } catch (e) {}
        return s;
      };
      w.WebSocket.prototype = _WS.prototype;
      ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k, i) {
        try { w.WebSocket[k] = i; } catch (e) {}
      });
    }
  } catch (e) {}

  // ── 6. console.error ────────────────────────────────────────────────
  try {
    var _ce = console.error;
    console.error = function () {
      try {
        var parts = [];
        for (var i = 0; i < arguments.length; i++) {
          var a = arguments[i];
          parts.push(a && a.message ? a.message : String(a));
        }
        ErrLog.push('console', parts.join(' ').slice(0, 1000), {
          stack: (arguments[0] && arguments[0].stack) || ''
        });
      } catch (e) {}
      return _ce.apply(console, arguments);
    };
  } catch (e) {}

  // Sahifa yopilayotganda navbatdagilarni yuboramiz
  w.addEventListener('pagehide', flush);
  w.addEventListener('beforeunload', flush);
})(window);
