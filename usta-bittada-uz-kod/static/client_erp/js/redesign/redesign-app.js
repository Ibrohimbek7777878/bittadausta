/* client_erp/js/redesign/redesign-app.js — Redesign shell + router override.
   Mavjud WS/STATE/Router._match/Utils qayta ishlatiladi; faqat ko'rinish + route
   registry yangi. Rc<Page> obyektlari real WS ma'lumot bilan ishlaydi. */

/* ── Billing (monetizatsiya) LIVE bayrog'i ──────────────────────────────────
   TRUE (2026-07-15): Payme MERCHANT KASSA ulandi (callback + checkout ishlaydi).
   🪙 Tanga hamyoni va to'lov UI ko'rinadi. To'lov usuli — FAQAT Payme
   (rc-pay.js filtri; boshqa provayderlar hali ulanmagan).
   Muhit: BILLING_LIVE=0 → checkout.test.paycom.uz (TEST, pul yo'q). */
window.RC_BILLING_LIVE = true;

/* ── RcToast (rc- dizayn) — Toast global alias ── */
var RcToast = {
  _c: function () {
    var c = document.getElementById('rc-toasts');
    if (!c) { c = document.createElement('div'); c.id = 'rc-toasts'; c.className = 'rc-toasts'; document.body.appendChild(c); }
    return c;
  },
  show: function (msg, kind, dur) {
    var t = document.createElement('div');
    t.className = 'rc-toast ' + (kind === 'error' ? 'rc-toast-err' : kind === 'success' ? 'rc-toast-ok' : '');
    var ic = kind === 'success' ? '✅ ' : kind === 'error' ? '❌ ' : kind === 'xp' ? '⭐ ' : '';
    t.innerHTML = ic + msg;
    this._c().appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 300); }, dur || 3000);
  },
  success: function (m) { this.show(m, 'success'); },
  error: function (m) { this.show(m, 'error', 5000); },
  info: function (m) { this.show(m, 'info'); },
  warning: function (m) { this.show(m, 'warning', 4000); },
  xp: function (xp, coins) { var s = ''; if (xp > 0) s += '+' + xp + ' XP'; if (coins > 0) s += (s ? ' | ' : '') + '+' + coins + ' tanga'; if (s) this.show(s, 'xp', 4000); },
  xpLost: function () {},
};
window.Toast = RcToast;

/* ── RcSkeleton — oddiy yuklanish ── */
var RcSkeleton = {
  list: function (n) {
    var h = '';
    for (var i = 0; i < (n || 4); i++) h += '<div class="rc-skel" style="height:76px"></div>';
    return '<div style="display:flex;flex-direction:column;gap:12px;max-width:720px;margin:0 auto">' + h + '</div>';
  },
};
window.Skeleton = window.Skeleton || RcSkeleton;

/* ── Shell helper: nav guruhlari, topbar sarlavha, drawer, theme ── */
var RcShell = {
  NAV: [
    { name: 'Asosiy', items: [
      { p: '/', ic: 'fa-home', label: 'Bosh sahifa' },
      { p: '/clients', ic: 'fa-users', label: 'Mijozlarim' },
      { p: '/orders', ic: 'fa-clipboard-list', label: 'Buyurtmalar' },
      { p: '/finance', ic: 'fa-coins', label: 'Moliya' },
      { p: '/analytics', ic: 'fa-chart-bar', label: 'Analitika' },
    ] },
    { name: 'MebelCity', items: [
      { p: '/mebelcity', ic: 'fa-industry', label: 'Buyurtmalarim' },
      { p: '/vizualizatsiya', ic: 'fa-vr-cardboard', label: 'Vizualizatsiya' },
      { p: '/oldi-berdi', ic: 'fa-exchange-alt', label: 'Oldi-Berdi' },
    ] },
    { name: 'Jamoa', items: [ { p: '/team', ic: 'fa-users-cog', label: 'Jamoa' } ] },
    { name: 'Qurilma', items: [
      { ic: 'fa-satellite-dish', label: 'BLE lazer', key: 'ble', onclick: 'BLE.togglePanel()' },
      // Modul-katalog (fayl yuklash + 3D xonalar) — ALOHIDA band.
      // Ilgari «BLE lazer»ning ustidan ochilardi va Bluetooth panelini
      // bosib qo'yardi (2026-08-15 tuzatildi).
      { ic: 'fa-cubes', label: '3D xona / modullar', key: 'mcat', onclick: 'ModuleCatalog.open()' },
    ] },
    { name: 'Obuna', items: [
      { p: '/tarif', ic: 'fa-crown', label: 'Tarif' },
      { p: '/tanga', ic: 'fa-coins', label: 'Tanga hamyoni' },
    ] },
    { name: 'Boshqa', items: [
      { p: '/yangi', ic: 'fa-magic', label: 'Yangi imkoniyatlar' },
      { p: '/settings', ic: 'fa-cog', label: 'Sozlamalar' },
    ] },
  ],
  BOTTOM: [
    { p: '/', ic: 'fa-home', label: 'Bosh' },
    { p: '/clients', ic: 'fa-users', label: 'Mijoz' },
    { p: '/orders', ic: 'fa-clipboard-list', label: 'Zakaz' },
    { p: '/analytics', ic: 'fa-chart-bar', label: 'Analitik' },
    { p: '/finance', ic: 'fa-coins', label: 'Moliya' },
  ],
  TITLES: {
    '/': 'Bosh sahifa', '/clients': 'Mijozlarim', '/orders': 'Buyurtmalar', '/finance': 'Moliya',
    '/analytics': 'Analitika', '/mebelcity': 'Buyurtmalarim', '/vizualizatsiya': 'Vizualizatsiya',
    '/zamers': '3D Zamerlar', '/oldi-berdi': 'Oldi-Berdi', '/team': 'Jamoa', '/settings': 'Sozlamalar',
    '/tarif': 'Tarif', '/tanga': 'Tanga hamyoni', '/portfolio': 'Portfolio',
    '/yangi': 'Yangi imkoniyatlar',
  },

  navlink: function (n, mobile) {
    // n.onclick berilsa — route emas, maxsus amal (masalan BLE.togglePanel()).
    var action = n.onclick ? n.onclick : ("Router.go('" + n.p + "')");
    // Modul-katalog (BLE lazer BILAN — yangi sahifaning o'zida allaqachon
    // BLE integratsiyasi bor, shuning uchun eski BLE.togglePanel() panelini
    // ALOHIDA ochmaymiz — ikkalasi ustma-ust chiqib, tugmalarni bosib
    // bo'lmay qolgan edi (2026-08-14 aniqlangan bug). HOZIRCHA faqat
    // bigone_cl2 sinov-akkauntida (TZ-Usta-Bittada-Modul-Tanlash.md §7).
    // Tekshiruv BOSISH PAYTIDA (sidebar sahifa yuklanishida, STATE.user
    // hali WS'dan kelmasdan turib bir marta render bo'ladi — shu payt
    // tekshirilsa doim yolg'on chiqadi, shuning uchun onclick ICHIDA).
    // ⚠️ 2026-08-15: «BLE lazer» tugmasi ASLIGA qaytarildi — u FAQAT
    // Bluetooth panelini ochadi. Bir muddat u modul-katalogni ochib qo'ygan
    // edi va natijada lazerga ulanib bo'lmay qoldi (foydalanuvchi xabari).
    // Modul-katalog endi ALOHIDA menyu bandi: «3D xona / modullar».
    var dp = n.p ? (' data-page="' + n.p + '"') : '';
    // «Tarif» yonida joriy tarifni ko'rsatamiz (kuzatib turish uchun).
    var extra = '';
    if (n.p === '/tarif') {
      var pl = (window.__USER_DATA__ && window.__USER_DATA__.plan) || null;
      var nm = (pl && pl.name) ? String(pl.name) : 'Bepul';
      var paid = nm.toLowerCase() !== 'bepul';
      extra = '<span class="rc-plan-badge" style="flex:none;font-size:10px;font-weight:800;padding:2px 9px;' +
        'border-radius:999px;white-space:nowrap;' +
        (paid ? 'background:var(--acc);color:var(--acc-ink)' : 'background:var(--sfc2);color:var(--mut)') +
        '">' + nm.replace(/</g, '&lt;') + '</span>';
    }
    return '<button class="rc-navlink"' + dp + ' onclick="' + action + '">' +
      '<span class="rc-navic"><i class="fas ' + n.ic + '"></i></span>' +
      '<span style="flex:1;text-align:left">' + T(n.label) + '</span>' + extra + '</button>';
  },
  sidebarHtml: function () {
    var u = STATE.user || {};
    // Joriy tarif nishoni (logo yonida — kuzatib turish uchun)
    var _pl = (window.__USER_DATA__ && window.__USER_DATA__.plan) || null;
    var _pnm = (_pl && _pl.name) ? String(_pl.name) : 'Bepul';
    var _paid = _pnm.toLowerCase() !== 'bepul';
    var _plBadge = '<button class="rc-plan-badge" onclick="Router.go(\'/tarif\')" title="Tarifni ko\'rish" ' +
      'style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;border:none;cursor:pointer;' +
      'font-size:10px;font-weight:800;padding:2px 9px;border-radius:999px;' +
      (_paid ? 'background:var(--acc);color:var(--acc-ink)' : 'background:var(--sfc2);color:var(--mut)') +
      '"><i class="fas fa-crown" style="font-size:9px"></i> ' + _pnm.replace(/</g, '&lt;') + '</button>';
    var h = '<div class="rc-logo"><div class="rc-logo-mark" style="overflow:hidden;padding:0"><img src="/static/client_erp/img/logo.png" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px"></div><div><div style="font-weight:800;font-size:15px">Bittada Usta</div><div style="font-size:11px;color:var(--mut)">' + T('Mebelchi ustalar uchun') + '</div>' + _plBadge + '</div></div>';
    RcShell.NAV.forEach(function (g) {
      h += '<div class="rc-navgroup"><div class="rc-navgroup-label"><span>' + T(g.name) + '</span><div class="rc-line"></div></div>';
      g.items.forEach(function (n) {
        // Billing hali LIVE emas — Tanga hamyoni yashirin (real chek tayyor bo'lmaguncha)
        if (n.p === '/tanga' && !window.RC_BILLING_LIVE) return;
        h += RcShell.navlink(n);
      });
      h += '</div>';
    });
    // Pastki blok: scroll konteynerda tabiiy oqadi (margin-top:auto OLIB TASHLANDI —
    // overflow-y:auto bilan tugma osilib qolardi). Nav oxirida ixcham joylashadi.
    h += '<div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">';
    h += '<button class="rc-btn" onclick="Router.go(\'/orders\')"><i class="fas fa-plus"></i> ' + T('Yangi buyurtma') + '</button>';
    h += '<a href="/mini/logout/" class="rc-navlink" style="color:var(--danger)"><span class="rc-navic"><i class="fas fa-sign-out-alt"></i></span> ' + T('Chiqish') + '</a>';
    h += '</div>';
    return h;
  },
  bottomHtml: function () {
    return RcShell.BOTTOM.map(function (n) {
      return '<button class="rc-bnav" data-page="' + n.p + '" onclick="Router.go(\'' + n.p + '\')"><i class="fas ' + n.ic + '"></i><span>' + T(n.label) + '</span></button>';
    }).join('');
  },

  openDrawer: function () {
    var bd = document.createElement('div'); bd.className = 'rc-drawer-backdrop'; bd.id = 'rc-drawer-bd';
    bd.onclick = RcShell.closeDrawer;
    var dr = document.createElement('div'); dr.className = 'rc-drawer';
    dr.innerHTML = RcShell.sidebarHtml();
    bd.appendChild(dr); document.body.appendChild(bd);
    RcShell.highlight(STATE.currentPage);
  },
  closeDrawer: function () { var b = document.getElementById('rc-drawer-bd'); if (b) b.remove(); },

  highlight: function (path) {
    document.querySelectorAll('[data-page]').forEach(function (el) {
      var pg = el.getAttribute('data-page');
      el.classList.toggle('active', path === pg || (pg !== '/' && path.indexOf(pg + '/') === 0));
    });
  },
  setTitle: function (path) {
    var raw = RcShell.TITLES[path] || (path.indexOf('/orders/') === 0 ? 'Buyurtma' : 'Bittada Usta');
    var t = T(raw);
    var el = document.getElementById('rc-title'); if (el) el.textContent = t;
    var back = document.getElementById('rc-back');
    var top = RcShell.TITLES.hasOwnProperty(path);
    if (back) back.style.display = top ? 'none' : 'inline-flex';
  },

  initTheme: function () {
    var saved = null; try { saved = localStorage.getItem('rc-theme'); } catch (e) {}
    document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : 'dark');
    RcShell.syncThemeBtn();
  },
  toggleTheme: function () {
    var cur = document.documentElement.getAttribute('data-theme');
    var next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('rc-theme', next); } catch (e) {}
    RcShell.syncThemeBtn();
  },
  syncThemeBtn: function () {
    var b = document.getElementById('rc-theme-btn'); if (!b) return;
    var dark = document.documentElement.getAttribute('data-theme') !== 'light';
    b.innerHTML = dark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  },
};

/* ── Route registry: SELF-REGISTRATION ──
   Har rc-<page>.js o'zini ro'yxatga qo'yadi:
     RC_PAGES['/finance'] = function(p){ RcFinance.render(); };
   Shu tufayli build-agentlar redesign-app.js'ga TEGMAYDI (konflikt yo'q). */
window.RC_PAGES = window.RC_PAGES || {};

function rcPlaceholder(title) {
  return function () {
    document.getElementById('app').innerHTML =
      '<div data-screen><div class="rc-empty"><div class="rc-empty-ic">🚧</div>' +
      '<div style="font-weight:800;font-size:16px;color:var(--txt)">' + title + '</div>' +
      '<div style="margin-top:6px">Bu sahifa redesignda tez orada</div></div></div>';
  };
}

/* ── Router override (mavjud Router._match/go qayta ishlatiladi) ── */
Router.init = function () {
  var P = window.RC_PAGES;
  var titles = RcShell.TITLES;
  function r(path, title) { return P[path] || rcPlaceholder(title); }
  this.routes = {
    '/':               r('/', 'Bosh sahifa'),
    '/clients':        r('/clients', 'Mijozlarim'),
    '/clients/:id':    r('/clients/:id', 'Mijoz'),
    '/orders':         r('/orders', 'Buyurtmalar'),
    '/orders/:id':     r('/orders/:id', 'Buyurtma'),
    '/finance':        r('/finance', 'Moliya'),
    '/analytics':      r('/analytics', 'Analitika'),
    '/mebelcity':      r('/mebelcity', 'Buyurtmalarim'),
    '/vizualizatsiya': r('/vizualizatsiya', 'Vizualizatsiya'),
    '/portfolio':      r('/portfolio', 'Portfolio'),
    '/zamers':         r('/zamers', '3D Zamerlar'),
    '/oldi-berdi':     r('/oldi-berdi', 'Oldi-Berdi'),
    '/team':           r('/team', 'Jamoa'),
    '/settings':       r('/settings', 'Sozlamalar'),
    '/tarif': r('/tarif', 'Tarif'),
    '/tanga': r('/tanga', 'Tanga hamyoni'),
    // «Yangiliklar» — qo'shilgan funksiyalar ro'yxati (2026-08-04)
    '/yangi': r('/yangi', 'Yangi imkoniyatlar'),
  };
  var self = this;
  window.addEventListener('hashchange', function () { self._onHashChange(); });
  this._onHashChange();
};

Router._onHashChange = function () { this.navigate(location.hash.slice(1) || '/'); };

Router.navigate = function (path, force) {
  if (!force && path === STATE.currentPage) return;
  // 2026-09-10: scroll holatini saqlash (mini-erp.js dagi eski Router'da bor
  // edi, redesign qayta yozilganda BU CHAQIRUV tushib qolgan — natijada
  // `RcOrders.render()` ichidagi `restoreScrollFor('/orders')` hech qachon
  // ishlamasdi, chunki saqlangan qiymat umuman yo'q edi. Foydalanuvchi:
  // "buyurtmaga kirib orqaga qaytsam ro'yxat eng tepasiga otib qolayabdi".
  if (STATE.currentPage && this.saveScroll) this.saveScroll(STATE.currentPage);
  var handler = null, params = {};
  for (var pattern in this.routes) {
    var m = this._match(pattern, path);
    if (m !== null) { handler = this.routes[pattern]; params = m; break; }
  }
  if (!handler) { handler = this.routes['/']; params = {}; }
  STATE.currentPage = path;
  RcShell.highlight(path);
  RcShell.setTitle(path);
  RcShell.closeDrawer();
  var app = document.getElementById('app');
  if (app) { handler(params); window.scrollTo(0, 0); }
};
