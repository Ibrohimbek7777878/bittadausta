/* pwa-install.js — Ilovani bosh ekranga qo'yish (2026-08-24)
 *
 * Foydalanuvchi talabi: «botga bir marta kirgandan so'ng avtomatik ilova
 * ko'rinishida o'zi ekranga qo'yilishi kerak … userdan ham so'rash kerak
 * … ruxsat bermasa Bluetooth ishlamasin, qolgan hammasi ishlasin».
 *
 * NEGA: Telegram WebView'da Web Bluetooth YO'Q (Telegram cheklovi).
 * Lazer faqat Chrome dvigatelida ishlaydi. PWA — ayni shu, lekin
 * foydalanuvchi uchun oddiy ilova ko'rinishida.
 *
 * ⚠️ BUTUN FAYL try/catch ichida — xato bo'lsa JIM o'tadi, ilova
 *    avvalgidek ishlayveradi. Hech qanday mavjud funksiyaga tegmaydi.
 */
(function (w, d) {
  'use strict';
  if (w.PWA) return;

  var KEY = 'pwa_ask';           // never | later:<ms> | installed
  var LATER_DAYS = 7;
  var MAX_REFUSE = 3;
  var KEY_N = 'pwa_refused';

  function ls(k, v) {
    try {
      if (v === undefined) return w.localStorage.getItem(k);
      w.localStorage.setItem(k, v);
    } catch (e) { return null; }
  }

  var ua = navigator.userAgent || '';
  var PWA = {
    _prompt: null,             // beforeinstallprompt hodisasi
    _wait: null,               // boshqa oyna yopilishini kutish taymeri
    isAndroid: /Android/i.test(ua),
    isIOS: /iPhone|iPad|iPod/i.test(ua),
    // ⚠️ 2026-08-25: kompyuterda ham har kirganda oyna chiqardi. Taklifning
    // butun ma'nosi — TELEFONDA lazer ishlashi. Kompyuterda Bluetooth
    // allaqachon ishlaydi va o'rnatish tugmasi brauzerning o'zida bor.
    isMobile: /Android|iPhone|iPad|iPod/i.test(ua)
              || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)),
    // Telegram ichki brauzeri/WebView — ishonchli belgilar
    inTelegram: !!(w.TelegramWebviewProxy || w.TelegramWebview
                || (w.Telegram && w.Telegram.WebApp && w.Telegram.WebApp.initData)),

    /** Ilova bosh ekrandan ochilganmi? */
    installed: function () {
      try {
        if (w.matchMedia && w.matchMedia('(display-mode: standalone)').matches) return true;
        if (w.navigator.standalone === true) return true;   // iOS
      } catch (e) {}
      return ls(KEY) === 'installed';
    },

    /** Bluetooth (lazer) shu muhitda ishlay oladimi? */
    canBluetooth: function () { return !!navigator.bluetooth; },

    /** Lazer tugmasi ko'rsatilsinmi? */
    showLaser: function () {
      if (PWA.canBluetooth()) return true;        // Chrome/PWA — ishlaydi
      if (PWA.isIOS) return false;                // iPhone — hech qachon
      if (ls(KEY) === 'never') return false;      // user rad etgan
      return true;                                // taklif qilish uchun
    },

    /** Nega ishlamasligini bir jumlada aytadi */
    laserWhy: function () {
      if (PWA.canBluetooth()) return '';
      if (PWA.isIOS) return 'iPhone Bluetooth o‘lchagichni qo‘llamaydi (Apple cheklovi). '
                          + 'Android telefon yoki kompyuter kerak.';
      if (PWA.inTelegram) return 'Telegram ichida Bluetooth ishlamaydi. '
                               + 'Ilovani bosh ekranga qo‘ysangiz lazer ishlaydi.';
      return 'Bu brauzer Bluetooth’ni qo‘llamaydi — Chrome kerak.';
    },

    // ── Taklif oynasi ──────────────────────────────────────────────
    shouldAsk: function () {
      if (PWA.installed()) return false;
      // Faqat telefonda so'raymiz (yuqoridagi izohga qarang)
      if (!PWA.isMobile) return false;
      var st = ls(KEY);
      if (st === 'never' || st === 'installed') return false;
      if (st && st.indexOf('later:') === 0) {
        var t = parseInt(st.slice(6), 10) || 0;
        if (Date.now() - t < LATER_DAYS * 864e5) return false;
      }
      return true;
    },

    /** Boshqa oyna (birinchi kirish qo'llanmasi, modal) ochiqmi? */
    _busy: function () {
      try {
        return !!(d.getElementById('rc-tour-box')      // qo'llanma turi
               || d.getElementById('rc-tour-hole')
               || d.querySelector('.modal.show, .rc-modal.open, .ce-modal.open'));
      } catch (e) { return false; }
    },

    ask: function (force) {
      // ⚠️ 2026-08-24: birinchi kirishda «qo'llanma» turi ham ochiladi.
      // U BIZDAN KEYIN paydo bo'lishi mumkin, shuning uchun bir marta
      // tekshirish yetmaydi — TINCH bo'lgunicha kutamiz.
      try {
        if (!force && !PWA.shouldAsk()) return;
        if (d.getElementById('pwa-ask')) return;
        if (PWA._wait) return;

        var quiet = 0, tries = 0;
        PWA._wait = setInterval(function () {
          try {
            tries++;
            if (PWA._busy()) { quiet = 0; }
            else { quiet++; }
            // 3 marta ketma-ket tinch (≈2.4 s) → endi ko'rsatamiz
            if (quiet >= 3) {
              clearInterval(PWA._wait); PWA._wait = null;
              PWA._render(force);
              return;
            }
            if (tries > 220) {           // ≈3 daqiqa — cheksiz aylanmasin
              clearInterval(PWA._wait); PWA._wait = null;
            }
          } catch (e) {
            clearInterval(PWA._wait); PWA._wait = null;
          }
        }, 800);
      } catch (e) { PWA._log('ask', e); }
    },

    _render: function (force) {
      try {
        if (!force && !PWA.shouldAsk()) return;
        if (d.getElementById('pwa-ask')) return;
        var iOS = PWA.isIOS;

        var body = iOS
          ? '<div class="pwa-step"><b>1.</b> Pastdagi <b>&#x2934;</b> (Ulashish) tugmasini bosing</div>'
          + '<div class="pwa-step"><b>2.</b> <b>&laquo;Bosh ekranga qo‘shish&raquo;</b> ni tanlang</div>'
          + '<div class="pwa-step"><b>3.</b> <b>&laquo;Qo‘shish&raquo;</b> ni bosing</div>'
          + '<div class="pwa-warn">⚠️ iPhone’da Bluetooth lazer ishlamaydi '
          + '(Apple cheklovi). Qolgan hamma narsa ishlaydi.</div>'
          : '<div class="pwa-li">📡 <b>Bluetooth lazer o‘lchagich ishlaydi</b></div>'
          + '<div class="pwa-li">⚡ Tezroq ochiladi, to‘liq ekran</div>'
          + '<div class="pwa-li">🔓 Telegram orqali o‘tish shart emas</div>';

        var btns = iOS
          ? '<button class="pwa-b pwa-b2" data-a="later">Tushunarli</button>'
          : '<button class="pwa-b pwa-b1" data-a="yes">Ekranga qo‘yish</button>'
          + '<button class="pwa-b pwa-b2" data-a="later">Hozir emas</button>';

        var el = d.createElement('div');
        el.id = 'pwa-ask';
        el.innerHTML =
          '<style>'
          + '#pwa-ask{position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-end;'
          + 'justify-content:center;background:rgba(0,0,0,.55);animation:pwaIn .18s ease}'
          + '#pwa-ask .pwa-card{width:100%;max-width:460px;background:#1b1f24;color:#e9e6e0;'
          + 'border-radius:18px 18px 0 0;padding:22px 20px 26px;box-shadow:0 -8px 40px rgba(0,0,0,.5);'
          + 'font-family:system-ui,-apple-system,sans-serif;animation:pwaUp .22s ease}'
          + '@media(min-width:600px){#pwa-ask{align-items:center}'
          + '#pwa-ask .pwa-card{border-radius:18px}}'
          + '@keyframes pwaIn{from{opacity:0}to{opacity:1}}'
          + '@keyframes pwaUp{from{transform:translateY(30px)}to{transform:none}}'
          + '#pwa-ask .pwa-ico{width:56px;height:56px;border-radius:14px;display:block;margin:0 auto 12px}'
          + '#pwa-ask h3{margin:0 0 6px;text-align:center;font-size:1.15rem}'
          + '#pwa-ask .pwa-sub{text-align:center;color:#9aa0a6;font-size:.88rem;margin-bottom:16px;line-height:1.5}'
          + '#pwa-ask .pwa-li,#pwa-ask .pwa-step{padding:9px 12px;margin-bottom:7px;border-radius:10px;'
          + 'background:rgba(255,255,255,.05);font-size:.9rem;line-height:1.45}'
          + '#pwa-ask .pwa-warn{margin-top:10px;padding:10px 12px;border-radius:10px;'
          + 'background:rgba(255,170,0,.12);color:#ffcf7a;font-size:.83rem;line-height:1.5}'
          + '#pwa-ask .pwa-btns{display:flex;gap:10px;margin-top:18px}'
          + '#pwa-ask .pwa-b{flex:1;border:0;border-radius:12px;padding:14px;font-size:.95rem;'
          + 'font-weight:600;cursor:pointer;font-family:inherit}'
          + '#pwa-ask .pwa-b1{background:#d2e83f;color:#14171b}'
          + '#pwa-ask .pwa-b2{background:rgba(255,255,255,.09);color:#e9e6e0}'
          + '</style>'
          + '<div class="pwa-card">'
          + '<img class="pwa-ico" src="/static/client_erp/pwa/icon-192.png" alt="">'
          + '<h3>Ilovani bosh ekranga qo‘yamizmi?</h3>'
          + '<div class="pwa-sub">Bosh ekranda alohida ikonka paydo bo‘ladi — '
          + 'oddiy ilova kabi ochiladi.</div>'
          + body
          + '<div class="pwa-btns">' + btns + '</div>'
          + '</div>';
        d.body.appendChild(el);

        el.addEventListener('click', function (e) {
          var b = e.target.closest && e.target.closest('[data-a]');
          if (!b) { if (e.target === el) PWA._later(); return; }
          if (b.getAttribute('data-a') === 'yes') PWA.install();
          else PWA._later();
        });
      } catch (e) { PWA._log('render', e); }
    },

    _close: function () {
      try {
        var el = d.getElementById('pwa-ask');
        if (el) el.remove();
      } catch (e) {}
    },

    _later: function () {
      PWA._close();
      try {
        var n = (parseInt(ls(KEY_N), 10) || 0) + 1;
        ls(KEY_N, String(n));
        ls(KEY, n >= MAX_REFUSE ? 'never' : 'later:' + Date.now());
      } catch (e) {}
      // Talab: rad etsa Bluetooth ishlamasin — lazer tugmasi yo'qoladi
      try { if (w.BLE && BLE._updateTopbar) BLE._updateTopbar(); } catch (e) {}
    },

    // ── O'rnatish ──────────────────────────────────────────────────
    install: function () {
      try {
        // 1) Chrome tayyor bo'lsa — TIZIM oynasi darhol chiqadi
        if (PWA._prompt) {
          PWA._close();
          PWA._prompt.prompt();
          PWA._prompt.userChoice.then(function (r) {
            if (r && r.outcome === 'accepted') {
              ls(KEY, 'installed');
              PWA._toast('Ilova bosh ekranga qo‘yildi ✅');
            } else {
              PWA._later();
            }
            PWA._prompt = null;
          }).catch(function () { PWA._prompt = null; });
          return;
        }
        // 2) Telegram ichida — `beforeinstallprompt` HECH QACHON chiqmaydi.
        //    Chrome'da ochamiz; u yerda oyna o'zi chiqadi (auto=1 bilan).
        //    ⚠️ FAQAT TELEFONDA. Kompyuterda yangi oyna ochish kerak emas —
        //    aynan shundan «qayta register» halqasi kelib chiqqan edi.
        if (PWA.isMobile && (PWA.inTelegram || !PWA.canBluetooth())) {
            PWA._toChrome(); return;
        }
        // 3) Kompyuter yoki brauzer hali tayyor emas — HECH QAYERGA
        //    yubormaymiz, brauzerning o'z tugmasini ko'rsatamiz.
        PWA._close();
        PWA._toast('Manzil satridagi ⊕ «O‘rnatish» tugmasini bosing');
      } catch (e) { PWA._log('install', e); }
    },

    /** Telegram → Chrome: mavjud `/mini/auto/<token>/` bilan, QAYTA LOGIN YO'Q */
    _toChrome: function () {
      PWA._close();
      var go = function (url) {
        try {
          if (w.Telegram && w.Telegram.WebApp && w.Telegram.WebApp.openLink) {
            try { w.Telegram.WebApp.openLink(url, { try_browser: 'chrome' }); }
            catch (e2) { w.Telegram.WebApp.openLink(url); }
            PWA._toast('Chrome ochildi — u yerda &laquo;Bosh ekranga qo‘shish&raquo; ni tasdiqlang');
            return;
          }
        } catch (e) {}
        // ⚠️ `intent://` ISHLATILMAYDI — Telegram WebView uni bilmaydi va
        //    butun ilovani ERR_UNKNOWN_URL_SCHEME bilan yiqitadi (24.08).
        try { w.open(url, '_blank'); } catch (e) {}
      };
      var x = new XMLHttpRequest();
      x.open('GET', '/mini/api/pwa/open-link/');
      x.withCredentials = true;
      x.timeout = 8000;
      // ⚠️ 2026-08-25 TUZATILDI: zaxira havola `location.origin + '/'` edi.
      // usta.bittada.uz da nginx `location = /` ni **301 bilan `/login/`**
      // ga yuboradi — natijada foydalanuvchi QAYTA REGISTRATSIYA sahifasiga
      // tushardi va halqa hosil bo'lardi (foydalanuvchi xabari).
      // Endi zaxira — AYNAN SHU sahifa, sessiya saqlanadi.
      var fallback = function () {
        var u = location.href.split('#')[0];
        u += (u.indexOf('?') < 0 ? '?' : '&') + 'src=pwa&auto=1';
        go(u);
      };
      x.onload = function () {
        try {
          var j = JSON.parse(x.responseText || '{}');
          if (j && j.url) { go(j.url); return; }
        } catch (e) {}
        if (window.ErrLog) ErrLog.push('fetch', 'PWA open-link javobi yaroqsiz',
          { req_url: '/mini/api/pwa/open-link/', req_status: x.status });
        fallback();
      };
      x.onerror = x.ontimeout = fallback;
      x.send();
    },

    _toast: function (m) {
      try {
        if (w.Toast && w.Toast.info) { w.Toast.info(m.replace(/&laquo;|&raquo;/g, '"')); return; }
        var t = d.createElement('div');
        t.textContent = m.replace(/&laquo;|&raquo;/g, '"');
        t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);'
          + 'background:#22262c;color:#e9e6e0;padding:12px 18px;border-radius:12px;z-index:99999;'
          + 'font:14px system-ui;box-shadow:0 6px 24px rgba(0,0,0,.4);max-width:88%;text-align:center';
        d.body.appendChild(t);
        setTimeout(function () { try { t.remove(); } catch (e) {} }, 4000);
      } catch (e) {}
    },

    _log: function (step, err) {
      try {
        if (w.ErrLog) w.ErrLog.push('js', 'PWA ' + step + ': '
          + ((err && err.message) || err), { source: 'pwa-install.js' });
      } catch (e) {}
    }
  };
  w.PWA = PWA;

  // ── Chrome: o'rnatish mumkinligini aytadi ────────────────────────
  try {
    w.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      PWA._prompt = e;
      // Chrome'ga PWA orqali kelgan bo'lsa (`auto=1`) — darhol so'raymiz
      try {
        if (/[?&]auto=1/.test(location.search) && !PWA.installed()) {
          setTimeout(function () { PWA.install(); }, 400);
          return;
        }
      } catch (x) {}
      if (PWA.shouldAsk()) setTimeout(function () { PWA.ask(); }, 1500);
    });
    w.addEventListener('appinstalled', function () {
      ls(KEY, 'installed');
      PWA._toast('Ilova bosh ekranga qo‘yildi ✅');
    });
  } catch (e) {}

  // ── Service worker ro'yxatdan o'tkazish ──────────────────────────
  // ⚠️ SW hech narsa keshlamaydi — `?v=N` tizimi buzilmasin.
  try {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      w.addEventListener('load', function () {
        var base = location.pathname.indexOf('/mini/') === 0 ? '/mini' : '';
        navigator.serviceWorker.register(base + '/sw.js', { scope: base + '/' })
          .catch(function (e) { PWA._log('sw', e); });
      });
    }
  } catch (e) {}

  // ── Birinchi kirishda taklif ─────────────────────────────────────
  try {
    d.addEventListener('DOMContentLoaded', function () {
      if (PWA.installed()) { ls(KEY, 'installed'); return; }
      // Telegram ichida `beforeinstallprompt` chiqmaydi — o'zimiz so'raymiz
      if ((PWA.inTelegram || PWA.isIOS) && PWA.shouldAsk()) {
        setTimeout(function () { PWA.ask(); }, 1200);
      }
    });
  } catch (e) {}
})(window, document);
