/* ═══════════════════════════════════════════════════════════════════════
   client_erp/js/i18n/i18n.js — Ko'p tillilik yadrosi (UZ / RU / EN)
   ───────────────────────────────────────────────────────────────────────
   QAROR (2026-08-07): KALIT = O'ZBEKCHA MATNNING O'ZI.

   Sabab: UI ning 95% i JS ichida quriladi va ~900 ta matn allaqachon
   o'zbekcha qattiq yozilgan. Sun'iy kalit ('finance.net_profit') o'ylab
   topish — 900 marta xato qilish imkoniyati. Matnning o'zini kalit qilsak:
     • ko'chirish MEXANIK bo'ladi:  'Sof foyda'  →  T('Sof foyda')
     • tarjima topilmasa O'ZBEKCHA qaytadi — hech qachon bo'sh/singan matn
       ko'rinmaydi (eng yomon holat = hozirgi holat)
     • yangi matn qo'shilganda ilova sinmaydi, faqat tarjimasi kutiladi

   ISHLATILISHI
     T('Saqlash')                       → 'Сохранить' / 'Save'
     T('Bugun: {0}/{1}', 3, 10)         → 'Сегодня: 3/10'
     T.n(3, 'kun', 'kunlar')            → son-shakl (RU/EN uchun muhim)

   TIL ALMASHTIRISH
     I18n.set('ru')   → localStorage + serverga saqlaydi + sahifani qayta chizadi
     I18n.lang()      → 'uz' | 'ru' | 'en'

   ⚠️ Bu fayl BOSHQA barcha rc-*.js dan OLDIN yuklanishi shart.
   ═══════════════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  var LS_KEY = 'rc_lang';
  var DEFAULT = 'uz';
  var SUPPORTED = ['uz', 'ru', 'en'];

  // Lug'atlar uz.js / ru.js / en.js tomonidan to'ldiriladi
  var DICT = { uz: {}, ru: {}, en: {} };

  var _lang = DEFAULT;
  var _missing = {};          // tarjimasiz kalitlar (konsolga bir marta)

  /* ── Tilni aniqlash: localStorage → server (data-lang) → brauzer → uz ── */
  function detect() {
    try {
      var saved = localStorage.getItem(LS_KEY);
      if (saved && SUPPORTED.indexOf(saved) >= 0) return saved;
    } catch (e) { /* private mode */ }
    var srv = document.documentElement.getAttribute('data-lang');
    if (srv && SUPPORTED.indexOf(srv) >= 0) return srv;
    var nav = (navigator.language || '').slice(0, 2).toLowerCase();
    if (SUPPORTED.indexOf(nav) >= 0) return nav;
    return DEFAULT;
  }

  /* ── Asosiy tarjima funksiyasi ──────────────────────────────────────── */
  function T(key) {
    if (key === null || key === undefined) return '';
    var s = String(key);
    var out;

    if (_lang === DEFAULT) {
      // O'zbekcha — kalitning o'zi (lug'atda bo'lsa ham undan olamiz,
      // chunki uz.js da imlo tuzatilgan variant bo'lishi mumkin)
      out = DICT.uz[s] || s;
    } else {
      out = DICT[_lang] && DICT[_lang][s];
      if (out === undefined) out = byPattern(s) === null ? undefined : byPattern(s);
      if (out === undefined) {
        // Tarjimasiz — o'zbekchasini qaytaramiz (ilova sinmaydi)
        if (!_missing[s]) {
          _missing[s] = 1;
          if (w.console && console.debug) console.debug('[i18n] tarjimasiz:', s);
        }
        out = s;
      }
    }

    // {0}, {1} … o'rin egallovchilar
    if (arguments.length > 1) {
      for (var i = 1; i < arguments.length; i++) {
        out = out.split('{' + (i - 1) + '}').join(String(arguments[i]));
      }
    }
    return out;
  }

  /* ── Son shakli. RU: 1 kun / 2 kunа / 5 kunов; EN: 1 day / 2 days ──── */
  T.n = function (count, one, many) {
    var n = Math.abs(parseInt(count, 10) || 0);
    if (_lang === 'ru') {
      var m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return T(one);
      return T(many);
    }
    if (_lang === 'en') return n === 1 ? T(one) : T(many);
    return T(one);           // o'zbekchada son-shakl o'zgarmaydi
  };

  /* ══ FORMATLASH — har tilning O'Z qoidasi ═══════════════════════════ */

  var FMT = {
    uz: {
      // Mingliklar bo'shliq bilan: 1 250 000
      group: ' ', decimal: ',',
      quote: ['«', '»'],          // «...»
      currency: function (s) { return s + ' so‘m'; },
      dateLocale: 'ru-RU',                   // 07.08.2026
      timeLocale: 'ru-RU',                   // 14:30
      and: 'va',
    },
    ru: {
      group: ' ', decimal: ',',
      quote: ['«', '»'],
      currency: function (s) { return s + ' сум'; },
      dateLocale: 'ru-RU',
      timeLocale: 'ru-RU',
      and: 'и',
    },
    en: {
      // Vergul bilan: 1,250,000
      group: ',', decimal: '.',
      quote: ['“', '”'],          // "..."
      currency: function (s) { return s + ' UZS'; },
      dateLocale: 'en-US',                   // Aug 7, 2026
      timeLocale: 'en-US',                   // 2:30 PM
      and: 'and',
    },
  };

  function fmt() { return FMT[_lang] || FMT.uz; }

  /* Butun son — tilga mos ajratgich bilan */
  function num(val) {
    var n = parseInt(val, 10) || 0;
    var neg = n < 0;
    var s = String(Math.abs(n));
    var g = fmt().group;
    var out = '';
    for (var i = s.length; i > 0; i -= 3) {
      out = s.slice(Math.max(0, i - 3), i) + (out ? g + out : '');
    }
    return (neg ? '−' : '') + out;
  }

  /* Qo'shtirnoq — tilga mos */
  function quote(s) { var q = fmt().quote; return q[0] + s + q[1]; }

  /* Ro'yxat: «a, b va c» / «a, b и c» / «a, b and c» */
  function list(arr) {
    if (!arr || !arr.length) return '';
    if (arr.length === 1) return String(arr[0]);
    return arr.slice(0, -1).join(', ') + ' ' + fmt().and + ' ' + arr[arr.length - 1];
  }

  function dateStr(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    if (_lang === 'en') {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return d.toLocaleDateString(fmt().dateLocale);
  }

  function timeStr(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString(fmt().timeLocale, { hour: '2-digit', minute: '2-digit' });
  }

  /* ── Til o'rnatish ──────────────────────────────────────────────────── */
  function setLang(code, skipRerender) {
    if (SUPPORTED.indexOf(code) < 0) return;
    if (code === _lang) return;
    _lang = code;
    try { localStorage.setItem(LS_KEY, code); } catch (e) { /* noop */ }
    document.documentElement.setAttribute('lang', code);
    document.documentElement.setAttribute('data-lang', code);

    // Serverda ham saqlaymiz — Telegram xabarlari, PDF va server matnlari uchun.
    // Xato bo'lsa jim o'tamiz: til baribir localStorage da qoldi.
    try {
      if (w.WS && WS.send) WS.send('user.set_language', { language: code }, function () {});
    } catch (e) { /* noop */ }

    if (!skipRerender) {
      // Avval mavjud DOM ni qayta tarjima (topbar, drawer — qayta chizilmaydi),
      // keyin sahifani qayta chizamiz (yangi tugunlarni kuzatuvchi ushlaydi).
      try { tr(document.body); } catch (e) { /* noop */ }
      rerender();
    }
  }

  /* Sahifani qayta chizish — to'liq reload EMAS (holat yo'qolmasin) */
  function rerender() {
    try {
      if (w.RcShell && RcShell.mount) RcShell.mount();
      if (w.Router && Router.navigate) {
        Router.navigate(w.STATE ? (STATE.currentPage || '/') : (location.hash.slice(1) || '/'), true);
      } else {
        location.reload();
      }
    } catch (e) { location.reload(); }
  }

  /* ── Lug'at ro'yxatga olish (uz.js / ru.js / en.js chaqiradi) ───────── */
  function register(code, dict) {
    if (!DICT[code]) DICT[code] = {};
    for (var k in dict) { if (dict.hasOwnProperty(k)) DICT[code][k] = dict[k]; }
  }

  _lang = detect();
  try {
    document.documentElement.setAttribute('lang', _lang);
    document.documentElement.setAttribute('data-lang', _lang);
  } catch (e) { /* noop */ }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { observe(); tr(document.body); });
  } else {
    observe(); tr(document.body);
  }

  /* ══════════════════════════════════════════════════════════════════
     DOM-TARJIMON (2026-08-07)

     MUAMMO: UI ning 95% i JS ichida `h += '<div>Sof foyda</div>'` tarzida
     quriladi — 750+ joy. Har birini qo'lda T() ga o'rash = 750 ta xato
     imkoniyati va haftalar ish.

     YECHIM: sahifa chizilgandan KEYIN DOM bo'ylab yurib, lug'atda AYNAN
     mos keladigan matnlarni almashtiramiz. Bitta joyda — butun ilovaga.

     XAVFSIZLIK:
       • faqat MATN tugunlari (element/atribut tuzilishi tegilmaydi)
       • faqat AYNAN mos kelgan matn almashadi (qisman moslik YO'Q)
       • `input`, `textarea`, `script`, `style` ichiga kirilmaydi
       • `data-notr` belgisi bo'lgan element va uning ichi o'tkaziladi
       • o'zbek tilida umuman ishlamaydi (bo'sh yurish ham yo'q)
       • bir marta tarjima qilingan tugun qayta ishlanmaydi

     ⚠️ CHEKLOV: mijoz ismi lug'at kalitiga AYNAN teng bo'lsa (masalan
     mijoz nomi «Yangi») u ham tarjima bo'ladi. Shunday joylarni
     `data-notr` bilan belgilash kerak.
     ══════════════════════════════════════════════════════════════════ */
  var SKIP_TAGS = { INPUT: 1, TEXTAREA: 1, SCRIPT: 1, STYLE: 1, CODE: 1, PRE: 1 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'data-tooltip'];

  function _skip(node) {
    for (var el = node.parentNode; el && el !== document.body; el = el.parentNode) {
      if (el.nodeType !== 1) continue;
      if (SKIP_TAGS[el.tagName]) return true;
      if (el.hasAttribute && el.hasAttribute('data-notr')) return true;
    }
    return false;
  }

  function _dict() { return DICT[_lang] || {}; }

  /* ══════════════════════════════════════════════════════════════════
     NAQSH QOIDALARI (2026-08-08)

     MUAMMO: matnlarning bir qismi kodda BIRLASHTIRIB quriladi —
         '📈 ' + pct + '% foyda'      → «100% foyda»
         money(v) + ' so‘m'           → «7 200 000 so‘m»
         n + ' ta buyurtma'           → «5 ta buyurtma»
     Bunday matn lug'atdagi kalitga AYNAN teng emas, shuning uchun
     DOM-tarjimon uni topa olmasdi va rus/ingliz tilida o'zbekcha
     bo'lib qolardi (skrinshotda ko'rilgan, 2026-08-08).

     YECHIM: aynan-moslik topilmasa NAQSH bo'yicha almashtiramiz.
     Naqshlar `^…$` bilan langarlangan — matnning O'RTASIDAN tasodifiy
     bo'lak almashib ketmaydi. Raqamlar `$1` orqali saqlanadi.
     ══════════════════════════════════════════════════════════════════ */
  var PATTERNS = {
    ru: [
      [/^(.+?)\s+so['‘’]m$/, '$1 сум'],
      [/^([\d\s.,\u00a0]+)%\s+foyda$/, '$1% прибыли'],
      [/^(.+?)\s+foyda$/, '$1 прибыли'],
      [/^([\d\s.,\u00a0]+)\s+ta\s+buyurtma$/, '$1 заказ(ов)'],
      [/^([\d\s.,\u00a0]+)\s+ta\s+mijoz$/, '$1 клиент(ов)'],
      [/^([\d\s.,\u00a0]+)\s+ta$/, '$1 шт'],
      [/^([\d\s.,\u00a0]+)\s+kun$/, '$1 дн'],
      [/^([\d\s.,\u00a0]+)\s+tanga$/, '$1 монет'],
      [/^([\d\s.,\u00a0]+)\s+min\s+oldin$/, '$1 мин назад'],
      [/^([\d\s.,\u00a0]+)\s+soat\s+oldin$/, '$1 ч назад'],
      [/^([\d\s.,\u00a0]+)\s+kun\s+oldin$/, '$1 дн назад'],
      [/^Zamer\s+#(\d+)$/, 'Замер #$1'],
      [/^Buyurtma\s+#(\d+)$/, 'Заказ #$1'],
      [/^Etap\s+#(\d+)$/, 'Этап #$1'],
      [/^Xatolik:\s*(.*)$/, 'Ошибка: $1'],
      [/^([\d\s.,\u00a0]+)\s+etap$/, '$1 этап'],
    ],
    en: [
      [/^(.+?)\s+so['‘’]m$/, '$1 UZS'],
      [/^([\d\s.,\u00a0]+)%\s+foyda$/, '$1% profit'],
      [/^(.+?)\s+foyda$/, '$1 profit'],
      [/^([\d\s.,\u00a0]+)\s+ta\s+buyurtma$/, '$1 orders'],
      [/^([\d\s.,\u00a0]+)\s+ta\s+mijoz$/, '$1 clients'],
      [/^([\d\s.,\u00a0]+)\s+ta$/, '$1 pcs'],
      [/^([\d\s.,\u00a0]+)\s+kun$/, '$1 d'],
      [/^([\d\s.,\u00a0]+)\s+tanga$/, '$1 coins'],
      [/^([\d\s.,\u00a0]+)\s+min\s+oldin$/, '$1 min ago'],
      [/^([\d\s.,\u00a0]+)\s+soat\s+oldin$/, '$1 h ago'],
      [/^([\d\s.,\u00a0]+)\s+kun\s+oldin$/, '$1 d ago'],
      [/^Zamer\s+#(\d+)$/, 'Measurement #$1'],
      [/^Buyurtma\s+#(\d+)$/, 'Order #$1'],
      [/^Etap\s+#(\d+)$/, 'Stage #$1'],
      [/^Xatolik:\s*(.*)$/, 'Error: $1'],
      [/^([\d\s.,\u00a0]+)\s+etap$/, '$1 stages'],
    ],
  };

  /* Lug'atda yo'q matnni naqsh bo'yicha tarjima. Topilmasa null. */
  function byPattern(key) {
    var list = PATTERNS[_lang];
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i][0].test(key)) return key.replace(list[i][0], list[i][1]);
    }
    return null;
  }

  /* Bitta element (va uning ichi) tarjimasi */
  function tr(root) {
    if (_lang === DEFAULT && !Object.keys(DICT.uz).length) return;
    if (!root || root.nodeType === undefined) return;
    var dict = _dict();
    if (!dict || !Object.keys(dict).length) return;

    // 1) Matn tugunlari
    try {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      var n, batch = [];
      while ((n = walker.nextNode())) batch.push(n);
      for (var i = 0; i < batch.length; i++) {
        n = batch[i];
        // ASL matn saqlanadi — UZ→RU→EN ketma-ket almashtirilganda manba
        // sifatida hamisha o'zbekchasi ishlatiladi (RU matnidan EN topilmaydi).
        var raw = (n._trOrig !== undefined) ? n._trOrig : n.nodeValue;
        if (!raw) continue;
        if (n._trLang === _lang) continue;      // shu tilda allaqachon
        var key = raw.trim();
        if (!key || key.length > 160) { n._trLang = _lang; continue; }
        if (_skip(n)) { n._trLang = _lang; continue; }
        var hit = dict[key];
        if (hit === undefined) hit = byPattern(key);      // birlashtirilgan matn
        if (hit === undefined || hit === null) {
          // ── Emoji/belgi PREFIKSLI matn (2026-08-12) ──────────────────────
          // Ko'p joyda emoji lug'at kalitiga QO'SHIB yozilgan ("○ Ulanmagan",
          // "💹 41% foyda") — bu aynan-moslikni ("Ulanmagan") ham, naqshni ham
          // ("^\d+% foyda$") buzardi (matn raqam bilan emas, emoji bilan
          // boshlangani uchun), shuning uchun ruscha/inglizcha tanlanganda
          // ko'p qatorlar o'zbekcha bo'lib qolardi. Prefiksni vaqtincha ajratib
          // qolgan qismni qayta sinaymiz, prefiks o'zgarishsiz qaytariladi.
          var _pm = key.match(/^([^\wа-яёА-ЯЁ0-9]{1,4}\s)(.+)$/);
          if (_pm) {
            var _rest = _pm[2];
            var _rh = dict[_rest];
            if (_rh === undefined) _rh = byPattern(_rest);
            if (_rh !== undefined && _rh !== null && _rh !== _rest) hit = _pm[1] + _rh;
          }
        }
        if (hit === undefined || hit === null || hit === key) {
          // Tarjimasi yo'q — asl holatga qaytaramiz (til orqaga almashsa)
          if (n._trOrig !== undefined && n.nodeValue !== raw) n.nodeValue = raw;
          n._trLang = _lang;
          continue;
        }
        if (n._trOrig === undefined) n._trOrig = raw;
        // Atrofdagi bo'shliqlarni saqlaymiz (joylashuv buzilmasin)
        n.nodeValue = raw.replace(key, hit);
        n._trLang = _lang;
      }
    } catch (e) { /* tarjima ilovani hech qachon sindirmasin */ }

    // 2) Atributlar (placeholder, title, …)
    try {
      var els = root.nodeType === 1 ? [root] : [];
      if (root.querySelectorAll) {
        els = els.concat(Array.prototype.slice.call(root.querySelectorAll('*')));
      }
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        if (el._trAttrLang === _lang) continue;
        if (el.hasAttribute && el.hasAttribute('data-notr')) { el._trAttrLang = _lang; continue; }
        if (!el._trAttrOrig) el._trAttrOrig = {};
        for (var a = 0; a < ATTRS.length; a++) {
          if (!el.getAttribute) continue;
          var nm = ATTRS[a];
          var cur = el.getAttribute(nm);
          if (cur === null) continue;
          var src = (el._trAttrOrig[nm] !== undefined) ? el._trAttrOrig[nm] : cur;
          var t2 = dict[String(src).trim()];
          if (t2 !== undefined && t2 !== String(src).trim()) {
            if (el._trAttrOrig[nm] === undefined) el._trAttrOrig[nm] = cur;
            el.setAttribute(nm, t2);
          } else if (el._trAttrOrig[nm] !== undefined && cur !== src) {
            el.setAttribute(nm, src);          // asliga qaytarish
          }
        }
        el._trAttrLang = _lang;
      }
    } catch (e) { /* noop */ }
  }

  /* Kuzatuvchi: sahifalar WS javobidan KEYIN chiziladi, shuning uchun
     Router hodisasiga suyanish yetarli emas — DOM o'zgarishini kuzatamiz. */
  var _obsTimer = null, _pending = [];
  function observe() {
    if (!w.MutationObserver || !document.body) return;
    var obs = new MutationObserver(function (muts) {
      if (_lang === DEFAULT && !Object.keys(DICT.uz).length) return;
      for (var i = 0; i < muts.length; i++) {
        var mu = muts[i];
        // ── (2026-08-12) `characterData` mutatsiyalari ham kuzatiladi ──────
        // Ilgari faqat YANGI tugun qo'shilganda (to'liq innerHTML almashtirish)
        // ishlardi. Lekin WS broadcast ba'zi joyda MAVJUD matn-tugunning
        // qiymatini to'g'ridan-to'g'ri yangilaydi (masalan Kassa/WS live
        // yangilanish) — bu holda YANGI tugun qo'shilmaydi, faqat qiymat
        // o'zgaradi, shuning uchun tarjima "real vaqtda" ishlamay qolardi.
        if (mu.type === 'characterData') { _pending.push(mu.target); continue; }
        var added = mu.addedNodes;
        for (var k = 0; k < added.length; k++) {
          if (added[k].nodeType === 1 || added[k].nodeType === 3) _pending.push(added[k]);
        }
      }
      if (!_pending.length || _obsTimer) return;
      // Debounce — bitta render'da yuzlab tugun qo'shiladi, hammasini
      // birdan emas, bir marta ishlaymiz (tezlik uchun).
      _obsTimer = setTimeout(function () {
        _obsTimer = null;
        var list = _pending; _pending = [];
        for (var i = 0; i < list.length; i++) {
          var node = list[i];
          if (node.nodeType === 3) {
            // Yakka matn tuguni — ota-onasi orqali ishlaymiz
            if (node.parentNode) tr(node.parentNode);
          } else {
            tr(node);
          }
        }
      }, 40);
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /* Topbar 🌐 tugmasi ochadigan ixcham ro'yxat (Sozlamalarga kirmasdan) */
  function menu() {
    var old = document.getElementById('rc-lang-menu');
    if (old) { old.remove(); return; }
    var btn = document.getElementById('rc-lang-btn');
    var box = document.createElement('div');
    box.id = 'rc-lang-menu';
    box.setAttribute('data-notr', '1');           // o'z nomlari tarjima bo'lmasin
    var r = btn ? btn.getBoundingClientRect() : { bottom: 52, right: 100 };
    box.style.cssText = 'position:fixed;z-index:9000;top:' + (r.bottom + 8) + 'px;' +
      'right:' + Math.max(8, window.innerWidth - r.right - 4) + 'px;' +
      'background:var(--sfc,#1E1D24);border:1px solid var(--brd2,rgba(255,255,255,.15));' +
      'border-radius:14px;padding:6px;box-shadow:0 18px 44px rgba(0,0,0,.45);' +
      'display:flex;flex-direction:column;gap:2px;min-width:158px';
    var html = '';
    for (var i = 0; i < w.I18n.LANGS.length; i++) {
      var L = w.I18n.LANGS[i], on = (L.code === _lang);
      html += '<button data-lc="' + L.code + '" style="display:flex;align-items:center;gap:9px;' +
        'border:none;background:' + (on ? 'var(--sfc2,rgba(255,255,255,.08))' : 'transparent') + ';' +
        'color:var(--txt,#F5F4F7);font-family:inherit;font-size:13px;font-weight:' + (on ? '800' : '600') + ';' +
        'padding:9px 11px;border-radius:10px;cursor:pointer;text-align:left;white-space:nowrap">' +
        '<span style="font-size:15px">' + L.flag + '</span>' +
        '<span style="flex:1">' + L.name + '</span>' +
        (on ? '<span style="color:var(--acc-text,#DCF262)">✓</span>' : '') + '</button>';
    }
    box.innerHTML = html;
    document.body.appendChild(box);

    Array.prototype.forEach.call(box.querySelectorAll('[data-lc]'), function (b) {
      b.onclick = function () { box.remove(); setLang(b.dataset.lc); };
    });
    // Tashqariga bosilsa yopiladi
    setTimeout(function () {
      var off = function (e) {
        if (box.contains(e.target) || (btn && btn.contains(e.target))) return;
        box.remove(); document.removeEventListener('click', off, true);
      };
      document.addEventListener('click', off, true);
    }, 0);
  }

  w.I18n = {
    tr: tr,
    menu: menu,
    T: T,
    lang: function () { return _lang; },
    set: setLang,
    register: register,
    num: num,
    quote: quote,
    list: list,
    date: dateStr,
    time: timeStr,
    currency: function (v) { return fmt().currency(num(v)); },
    supported: SUPPORTED,
    /* Tarjimasiz kalitlar ro'yxati — tekshiruv uchun:  I18n.missing()  */
    missing: function () { return Object.keys(_missing).sort(); },
    LANGS: [
      { code: 'uz', flag: '🇺🇿', name: 'O‘zbekcha' },
      { code: 'ru', flag: '🇷🇺', name: 'Русский' },
      { code: 'en', flag: '🇬🇧', name: 'English' },
    ],
  };
  w.T = T;          // qisqa global — har faylda qayta e'lon qilinmasin
})(window);
