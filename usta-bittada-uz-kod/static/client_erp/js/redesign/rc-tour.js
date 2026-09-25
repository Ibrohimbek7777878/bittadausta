/* client_erp/js/redesign/rc-tour.js — TANISHTIRUV (onboarding tour), 2026-08-05

   Foydalanuvchi talabi: «o'yinga kirganda yoki Uzum/AliExpress/PUBG'da
   kirganda o'ynashni o'rgatadi — o'shanaqa qilib qo'sh».

   BU NIMA
     Coach-marks + Product tour. Ekran qoraytiriladi, FAQAT bitta element
     yoritiladi, yonida izoh chiqadi: «bu nima, nega kerak». Keyingi →
     keyingi element. Qadam-baqadam.

   RC-HINT'DAN FARQI
     rc-hint  — passiv, foydalanuvchi O'ZI bosadi (unutganda qaraydi)
     rc-tour  — faol, birinchi kirishda O'ZI boshlanadi (hammaga ko'rsatadi)
     Ikkalasi birga ishlaydi.

   QANDAY ISHLAYDI
     1. Sahifa ochilganda: shu sahifa uchun tur ko'rilganmi? (localStorage)
     2. Ko'rilmagan bo'lsa — 1.2 s kutib (sahifa chizilishi uchun) boshlanadi
     3. Har qadamda: elementga scroll → yoritish → izoh
     4. Element topilmasa — qadam O'TKAZIB YUBORILADI (hech qachon yiqilmaydi)
     5. «O'tkazib yuborish» yoki oxirigacha → ko'rilgan deb belgilanadi

   QAYTA KO'RISH
     RcTour.restart('finance')  — bitta sahifani
     RcTour.reset()             — hammasini (sinov uchun)

   XAVFSIZLIK
     Butun kod try/catch ichida. Tur ishlamay qolsa ilova NORMAL ishlayveradi.
*/
(function () {
  'use strict';

  var LS_KEY = 'rcTourDone_v1';
  var Z = 100000;                 // FAB (75) va sheet (9999) dan yuqori

  /* ── Qadamlar. sel — CSS selektor; element topilmasa qadam o'tkaziladi ── */
  var TOURS = {

    finance: [
      // ── 2026-08-25: Kassa bloki va `#fin-stats [data-metric=sof|balance]`
      // qadamlar OLIB TASHLANDI — o'sha elementlar endi yo'q (Kassa bloki
      // yashirildi, `sof` kartasi eng tepadagi asosiy kartaga ko'chdi).
      // O'rniga yangi ikkita katakcha tanishtiriladi.
      {
        sel: '.fin-cell[data-cell="kassa"]',
        title: '💰 Kassa ostatka',
        text: 'Hozir <b>hamyoningizda</b> turgan pul.<br><br>'
            + 'Bosing — qayerdan qanday chiqqani ochiladi: o\'tgan oydan '
            + 'qolgani, bu oy kirgani, ketgani va ustalarga berilgani.',
      },
      {
        sel: '.fin-cell[data-cell="sof"]',
        title: '📁 Zakazlardan qolgan foyda',
        text: 'Tugatilgan zakazlardan <b>ishlab topgan</b> foydangiz.<br>'
            + 'Har zakazda: shartnoma puli − sarflangan pul.<br><br>'
            + 'Bosing — qaysi mijozdan qancha foyda qolgani ko\'rinadi.<br><br>'
            + '⚠️ Bu hamyondagi pul emas — bir qismi hali kelmagan bo\'lishi mumkin.',
      },
      {
        sel: '.fin-tab[data-tab="contracts"]',
        title: '📄 Shartnomalar',
        text: 'Har buyurtma <b>alohida hisob</b> bo\'lib ko\'rinadi — chekga o\'xshab:<br><br>'
            + 'Kelishdik → Oldik → Mijoz qarzi → Sarfladik → <b>FOYDA</b><br><br>'
            + 'Qaysi ish qancha foyda berayotganini shu yerda ko\'rasiz.',
      },
      {
        sel: '.fin-tab[data-tab="debts"]',
        title: '🔴 Qarzlar',
        text: '<b>Kim sizga qancha qarzdor</b> — tizim o\'zi hisoblaydi '
            + '(kelishdik − oldik). Yozish shart emas.<br><br>'
            + 'Mijoz bilan muddat kelishsangiz — «Muddatli qarz» qilib yozasiz.',
      },
      {
        sel: '#fin-add-in',
        title: '➕ Kirim va Chiqim',
        text: 'Mijoz pul berdi → <b>Kirim</b>.<br>'
            + 'Material oldingiz → <b>Chiqim</b>.<br><br>'
            + '⚠️ Har yozuvni <b>buyurtmaga bog\'lang</b> — aks holda foyda '
            + 'noto\'g\'ri hisoblanadi.',
      },
      {
        sel: '#rc-glive-fab',
        title: '✨ AI yordamchi',
        text: 'Istalgan savolni bering:<br>'
            + '• «Balans nima?»<br>'
            + '• «Nega foydam kam?» — <b>ma\'lumotingizni tekshiradi</b><br>'
            + '• «Kim menga qarzdor?»<br><br>'
            + 'Bosilsa yozishma ochiladi, ichida 🎤 — ovozli rejim.',
      },
    ],

    clients: [
      {
        sel: '#rc-cl-add',
        title: '➕ Yangi mijoz',
        text: 'Har buyurtmaga mijoz biriktirilishi kerak.<br><br>'
            + '<b>Nega muhim:</b> mijozsiz buyurtmada qarzdorni ism bilan '
            + 'ko\'rsatib bo\'lmaydi va mijoz tarixi to\'planmaydi.',
      },
      {
        sel: '#rc-cl-search',
        title: '🔍 Qidiruv',
        text: 'Ism yoki telefon raqami bo\'yicha toping. '
            + 'Raqamning oxirgi bir necha sonini yozsangiz ham topadi.',
      },
      {
        sel: '#rc-cl-list',
        title: '👤 Mijoz kartochkasi',
        text: 'Bosing — mijozning barcha buyurtmalari, to\'lovlari va '
            + 'qarzi ochiladi. Kim ko\'p ish beryapti, kim qarzdor — '
            + 'shu yerdan ko\'rasiz.',
      },
    ],

    orders: [
      {
        sel: '#rc-order-add',
        title: '➕ Yangi buyurtma',
        text: 'Mijoz, nom va <b>kelishilgan summa</b> kiritiladi.<br><br>'
            + '⚠️ <b>Summa eng muhimi</b> — foyda shundan hisoblanadi. '
            + 'Kiritilmasa foyda 0 chiqadi.',
      },
      {
        sel: '#rc-order-tabs',
        title: '🔖 Holat bo\'yicha',
        text: 'Yangi · Kutilmoqda · Jarayonda · Tayyor · Topshirildi.<br><br>'
            + '<b>«Topshirildi»</b> — eng muhim holat: aynan shunda foyda '
            + 'hisoblanadi va Moliyaga yoziladi.',
      },
      {
        sel: '#rc-orders-list',
        title: '📋 Buyurtma kartasi',
        text: 'Bosing — etaplar, xarajatlar, foyda va ustalar ulushi ochiladi.<br><br>'
            + 'Har etapni bajarib belgilaysiz, oxirida «Topshirildi» bosasiz.',
      },
    ],

    analytics: [
      {
        sel: '#rc-revenue-chart, #rc-profit-chart',
        title: '📈 Grafiklar',
        text: 'Oylar bo\'yicha daromad va foyda o\'zgarishi. '
            + 'O\'sayapsizmi yoki pasayayapsizmi — shu yerdan ko\'rinadi.',
      },
      {
        sel: '#rc-category-chart, #rc-status-chart',
        title: '🥧 Taqsimot',
        text: 'Pul qaysi kategoriyaga ko\'p ketyapti va buyurtmalar '
            + 'qaysi holatda to\'planib qolgani.',
      },
      {
        sel: '#rc-ai-btn',
        title: '🤖 AI tahlil',
        text: 'Bosing — sun\'iy intellekt ma\'lumotingizni o\'qib '
            + '<b>biznes tahlil</b> yozib beradi: nima yaxshi, nima yomon, '
            + 'nima qilish kerak.',
      },
    ],

    mebelcity: [
      {
        sel: '[data-page="/mebelcity"]',
        title: '🏭 Buyurtmalarim',
        text: 'MebelCity sizga yasayotgan buyurtmalar.<br><br>'
            + '⚠️ Bu <b>sizning mijozlaringiz</b> emas — bu siz '
            + 'MebelCity\'ga bergan buyurtmalaringiz.',
      },
      {
        sel: '.rc-card',
        title: '⚙️ Ishlab chiqarish bosqichi',
        text: 'Har buyurtmada bosqichlar ko\'rinadi:<br>'
            + 'Kesish → Kromka → Prisadka → Yig\'ish → Tayyor<br><br>'
            + 'Foiz bilan qay bosqichda ekani ko\'rsatiladi.',
      },
    ],

    oldiberdi: [
      {
        sel: '#ob-period',
        title: '📅 Davr',
        text: 'Barchasi · Shu oy · O\'tgan oy · Shu yil.<br><br>'
            + '<b>Qarzdorlik</b> esa davrga bog\'liq emas — u hozirgi holat.',
      },
      {
        sel: '.rc-stat',
        title: '💰 Qarzdorlik',
        text: 'MebelCity\'ga <b>qancha qarzdorsiz</b>.<br><br>'
            + '⚠️ Bu <b>Moliya bo\'limidagi qarz emas</b>. U yerda mijozlar '
            + 'sizga qarzdor, bu yerda siz MebelCity\'ga.',
      },
      {
        sel: '#ob-tabs',
        title: '🔖 To\'rt bo\'lim',
        text: '<b>Sotuvlar</b> — olgan materialingiz<br>'
            + '<b>Qaytarish</b> — qaytarganingiz<br>'
            + '<b>Qarzlar</b> — ochiq qarzlar<br>'
            + '<b>To\'lovlar</b> — to\'lagan pulingiz',
      },
      {
        sel: '.ob-sale',
        title: '🧾 Chek tafsiloti',
        text: 'Chekni bosing — <b>nega qarz bo\'lgani</b> ochiladi:<br><br>'
            + 'nima olingan, qancha to\'langan, qancha qoldiq, '
            + 'to\'lovlar tarixi.',
      },
    ],

    team: [
      {
        sel: '#btn-create-team, #team-content',
        title: '👥 Jamoa',
        text: 'Ustalaringizni qo\'shasiz va foydani ular bilan bo\'lishasiz.<br><br>'
            + 'A\'zo qo\'shilgach unga buyurtma ulashishingiz va ulush '
            + 'berishingiz mumkin.',
      },
      {
        sel: '#btn-invite, #team-inv-q',
        title: '✉️ Taklif qilish',
        text: 'Ism yoki telefon bo\'yicha qidirib taklif yuborasiz. '
            + 'A\'zo qabul qilgach jamoada paydo bo\'ladi.<br><br>'
            + '⚠️ Ulush faqat <b>ro\'yxatdan o\'tgan</b> a\'zolarga beriladi.',
      },
    ],

    tarif: [
      {
        sel: '.rc-card',
        title: '👑 Tarif',
        text: 'Qaysi imkoniyatlar ochiq ekani shu yerda. '
            + 'Hozircha hamma narsa <b>bepul</b>.',
      },
      {
        sel: '[data-page="/tanga"]',
        title: '🪙 Tanga hamyoni',
        text: 'AI yordamchi tanga bilan ishlaydi. Ovozli suhbat '
            + 'boshlaganingizda yechiladi.<br><br>'
            + 'Har suhbat oxirida qancha sarflanganini ko\'rasiz.',
      },
    ],

    dashboard: [
      {
        sel: '.rc-stat, .rc-kpi',
        title: '📊 Umumiy holat',
        text: 'Boshidan beri qancha kirim bo\'lgani va qancha foyda '
            + 'qilganingiz. Bu yerda <b>davr filtri yo\'q</b> — hamma vaqt.',
      },
      {
        // Navigatsiya `data-page` atributi bilan chiziladi
        // (redesign-app.js:navlink) — eng ishonchli selektor shu.
        sel: '[data-page="/orders"]',
        title: '📋 Buyurtmalar',
        text: 'Barcha zakazlaringiz shu yerda. Har birining etaplari, '
            + 'foydasi va mijozi ko\'rinadi.',
      },
      {
        sel: '[data-page="/finance"]',
        title: '💵 Moliya',
        text: 'Pul hisobi: kassa, foyda, qarzlar, shartnomalar.<br>'
            + 'Eng ko\'p ishlatiladigan bo\'lim.<br><br>'
            + 'Shu bo\'limga kirsangiz — batafsil tanishtiruv boshlanadi.',
      },
    ],
  };

  function done() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function markDone(name) {
    try {
      var d = done(); d[name] = 1;
      localStorage.setItem(LS_KEY, JSON.stringify(d));
    } catch (e) { /* noop */ }
  }

  var state = { steps: [], i: 0, name: '', el: null, timer: null };

  function injectStyle() {
    if (document.getElementById('rc-tour-style')) return;
    var css =
      '#rc-tour-hole{position:fixed;z-index:' + Z + ';border-radius:16px;' +
      'box-shadow:0 0 0 9999px rgba(0,0,0,.78);pointer-events:none;' +
      'transition:all .28s cubic-bezier(.4,0,.2,1);border:2px solid var(--acc,#DCF262)}' +
      '#rc-tour-box{position:fixed;z-index:' + (Z + 1) + ';max-width:340px;width:calc(100% - 32px);' +
      'background:var(--sfc,#1E1D24);border:1px solid var(--brd2,rgba(255,255,255,.15));' +
      'border-radius:16px;padding:15px 16px;box-shadow:0 20px 50px rgba(0,0,0,.5);' +
      'transition:all .28s cubic-bezier(.4,0,.2,1)}' +
      '#rc-tour-box{position:fixed}' +
      '#rc-tour-x{position:absolute;top:8px;right:9px;width:26px;height:26px;' +
      'border-radius:50%;border:none;background:var(--sfc2,rgba(255,255,255,.08));' +
      'color:var(--mut,#9B9AA3);font-size:17px;line-height:1;cursor:pointer;' +
      'padding:0!important;display:flex;align-items:center;justify-content:center}' +
      '#rc-tour-box h4{padding-right:30px;margin:0 0 7px;font-size:15px;font-weight:800;color:var(--txt,#F5F4F7)}' +
      '#rc-tour-box p{margin:0;font-size:12.5px;line-height:1.65;color:var(--mut,#9B9AA3)}' +
      '#rc-tour-foot{display:flex;align-items:center;gap:8px;margin-top:14px}' +
      '#rc-tour-num{font-size:11px;color:var(--mut,#9B9AA3);font-weight:700;flex:none}' +
      '#rc-tour-dots{display:flex;gap:4px;flex:1}' +
      '.rc-tour-dot{width:6px;height:6px;border-radius:50%;background:var(--brd2,rgba(255,255,255,.2))}' +
      '.rc-tour-dot.on{background:var(--acc,#DCF262)}' +
      '#rc-tour-box button{border:none;border-radius:10px;font-family:inherit;' +
      'font-size:12.5px;font-weight:700;cursor:pointer;padding:8px 15px}' +
      '#rc-tour-skip{background:none;color:var(--mut,#9B9AA3)!important;padding:8px 6px!important}' +
      '#rc-tour-next{background:var(--acc,#DCF262);color:var(--acc-ink,#1B1A20)}' +
      // ── MOBIL DOK (2026-08-07) ───────────────────────────────────────
      // Muammo: yoritilgan element ekran pastida bo'lsa oyna ekrandan
      // chiqib ketardi — matnni ham, «O'tkazib yuborish» tugmasini ham
      // bosib bo'lmasdi. Yechim: tor ekranda oyna ELEMENTGA emas,
      // EKRANGA yopishadi (yuqoriga yoki pastga — element qayerdaligiga
      // qarab teskari tomonga), pastki navigatsiya balandligi hisobga
      // olinadi va matn uzun bo'lsa ichida skroll bo'ladi.
      '#rc-tour-box.rc-tour-dock{left:12px!important;right:12px!important;' +
      'width:auto!important;max-width:none!important}' +
      '#rc-tour-box.rc-tour-dock-bottom{bottom:calc(var(--rc-tour-navh,0px) + 12px)!important;top:auto!important}' +
      '#rc-tour-box.rc-tour-dock-top{top:calc(env(safe-area-inset-top,0px) + 12px)!important;bottom:auto!important}' +
      '#rc-tour-box p{max-height:38vh;overflow-y:auto;-webkit-overflow-scrolling:touch}' +
      // Tugmalar hech qachon siqilib ketmasin
      '#rc-tour-foot{flex-wrap:wrap}' +
      '#rc-tour-next{flex:none;min-width:92px}' +
      '@media (max-width:380px){#rc-tour-dots{width:100%;order:3;justify-content:center;margin-top:4px}}';
    var st = document.createElement('style');
    st.id = 'rc-tour-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  /* Tinglovchilar — faqat tur ochiq turganda ulanadi */
  var _listening = false;
  function _onReflow() { reflow(); }
  function _onKey(e) { if (e.key === 'Escape') finish(); }
  function _onNav() { finish(); }          // sahifa almashsa tur yopiladi

  function listen(on) {
    if (on === _listening) return;
    _listening = on;
    var m = on ? 'addEventListener' : 'removeEventListener';
    window[m]('resize', _onReflow);
    window[m]('orientationchange', _onReflow);
    window[m]('scroll', _onReflow, true);
    window[m]('hashchange', _onNav);
    document[m]('keydown', _onKey);
  }

  function cleanup() {
    listen(false);
    state.el = null;
    // ⚠️ Kutayotgan taymerni BEKOR QILISH shart (2026-08-05 sinovda topildi):
    // tur ochiqligida sahifa qayta chizilsa yoki boshqa sahifaga o'tilsa,
    // `render` ichidagi setTimeout keyinroq ishga tushib, allaqachon
    // o'chirilgan oynaga murojaat qilardi → `Cannot set properties of null`.
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    ['rc-tour-hole', 'rc-tour-box'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
    state.steps = []; state.i = 0;
  }

  /* Keyingi MAVJUD qadamni topadi (yo'q elementlar o'tkaziladi) */
  function findNext(from) {
    for (var i = from; i < state.steps.length; i++) {
      var s = state.steps[i];
      var el = null;
      try { el = document.querySelector(s.sel); } catch (e) { el = null; }
      if (el && el.offsetParent !== null) return { i: i, el: el, step: s };
    }
    return null;
  }

  /* Pastki navigatsiya balandligi — mobil dokda oyna uni yopib qolmasin */
  function navHeight() {
    var n = document.getElementById('rc-bottomnav');
    if (!n) return 0;
    var st = window.getComputedStyle(n);
    if (st.display === 'none' || st.visibility === 'hidden') return 0;
    return n.offsetHeight || 0;
  }

  /* Oynani joylashtirish.
     Keng ekran  → element yoniga (eski xatti-harakat).
     Tor ekran   → EKRANGA dok: element yuqori yarmida bo'lsa oyna pastga,
                   pastki yarmida bo'lsa yuqoriga. Shunda yoritilgan joy ham,
                   oyna ham, tugmalar ham bir vaqtda ko'rinadi. */
  function position(box, r) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var navh = navHeight();
    box.classList.remove('rc-tour-dock', 'rc-tour-dock-top', 'rc-tour-dock-bottom');
    box.style.bottom = '';

    var bh = box.offsetHeight || 190;
    var bw = box.offsetWidth || 320;
    var below = r.bottom + 14;
    var fitsBelow = (below + bh) < (vh - navh - 10);
    var fitsAbove = (r.top - bh - 14) > 10;

    // Tor ekran YOKI ikki tomonga ham sig'masa → dok rejimi
    if (vw <= 560 || (!fitsBelow && !fitsAbove)) {
      box.classList.add('rc-tour-dock');
      // Element ekranning qaysi yarmida? Oyna teskari tomonga boradi.
      var mid = r.top + r.height / 2;
      if (mid < vh / 2) box.classList.add('rc-tour-dock-bottom');
      else box.classList.add('rc-tour-dock-top');
      box.style.setProperty('--rc-tour-navh', navh + 'px');
      box.style.left = ''; box.style.top = '';
      return;
    }

    var top = fitsBelow ? below : Math.max(10, r.top - bh - 14);
    box.style.top = top + 'px';
    box.style.left = Math.min(Math.max(12, r.left + r.width / 2 - bw / 2), vw - bw - 12) + 'px';
  }

  /* Ekran o'lchami/skroll o'zgarsa — teshik va oynani qayta joylashtirish */
  function reflow() {
    var hole = document.getElementById('rc-tour-hole');
    var box = document.getElementById('rc-tour-box');
    if (!hole || !box || !state.el) return;
    var r = state.el.getBoundingClientRect();
    var pad = 6;
    hole.style.left = (r.left - pad) + 'px';
    hole.style.top = (r.top - pad) + 'px';
    hole.style.width = (r.width + pad * 2) + 'px';
    hole.style.height = (r.height + pad * 2) + 'px';
    position(box, r);
  }

  function render(found) {
    state.i = found.i;
    var el = found.el, s = found.step;
    state.el = el;
    var hole = document.getElementById('rc-tour-hole');
    var box = document.getElementById('rc-tour-box');
    if (!hole) {
      hole = document.createElement('div'); hole.id = 'rc-tour-hole';
      document.body.appendChild(hole);
    }
    if (!box) {
      box = document.createElement('div'); box.id = 'rc-tour-box';
      document.body.appendChild(box);
    }

    el.scrollIntoView({ block: 'center', behavior: 'smooth' });

    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(function () {
      state.timer = null;
      // Oyna hali joyidami? (cleanup bo'lgan bo'lishi mumkin)
      if (!document.body.contains(box) || !document.body.contains(hole)) return;
      var r = el.getBoundingClientRect();
      var pad = 6;
      hole.style.left = (r.left - pad) + 'px';
      hole.style.top = (r.top - pad) + 'px';
      hole.style.width = (r.width + pad * 2) + 'px';
      hole.style.height = (r.height + pad * 2) + 'px';

      var total = state.steps.length;
      var dots = '';
      for (var k = 0; k < total; k++) {
        dots += '<span class="rc-tour-dot' + (k === state.i ? ' on' : '') + '"></span>';
      }
      var isLast = !findNext(state.i + 1);
      box.innerHTML =
        // ✕ — istalgan qadamda yopish (mobil: «O'tkazib yuborish» ga
        // yetib bormasdan ham chiqib ketish mumkin bo'lsin)
        // 2026-09-23: sarlavha/matn/tugmalar T() orqali — tanlangan tilda
        '<button id="rc-tour-x" aria-label="' + T('Yopish') + '">&times;</button>'
        + '<h4>' + T(s.title) + '</h4>'
        + '<p>' + T(s.text) + '</p>'
        + '<div id="rc-tour-foot">'
        +   '<div id="rc-tour-dots">' + dots + '</div>'
        +   '<button id="rc-tour-skip">' + T('O\'tkazib yuborish') + '</button>'
        +   '<button id="rc-tour-next">' + (isLast ? T('Tugatdim') : T('Keyingi')) + '</button>'
        + '</div>';

      position(box, r);

      var bSkip = document.getElementById('rc-tour-skip');
      var bNext = document.getElementById('rc-tour-next');
      if (!bSkip || !bNext) return;          // oyna o'chirilgan — jim chiqamiz
      bSkip.onclick = finish;
      bNext.onclick = function () {
        var nx = findNext(state.i + 1);
        if (nx) render(nx); else finish();
      };
      var bX = document.getElementById('rc-tour-x');
      if (bX) bX.onclick = finish;
      listen(true);
    }, 320);
  }

  function finish() {
    if (state.name) markDone(state.name);
    cleanup();
  }

  /* Turni boshlash. force=true — ko'rilgan bo'lsa ham qayta ko'rsatadi. */
  function start(name, force) {
    try {
      var steps = TOURS[name];
      if (!steps || !steps.length) return;
      if (!force && done()[name]) return;
      injectStyle();
      cleanup();
      state.name = name; state.steps = steps;
      var first = findNext(0);
      if (!first) return;              // birorta element yo'q — tur ochilmaydi
      render(first);
    } catch (e) { /* tur ishlamasa ilova normal ishlayveradi */ }
  }

  /* Sahifa ochilganda avtomatik — chizilishi uchun biroz kutamiz */
  function auto(name, delay) {
    try {
      if (done()[name]) return;
      setTimeout(function () { start(name); }, delay || 1200);
    } catch (e) { /* noop */ }
  }

  window.RcTour = {
    start: start,
    auto: auto,
    restart: function (name) { start(name, true); },
    reset: function () { try { localStorage.removeItem(LS_KEY); } catch (e) {} },
    TOURS: TOURS,
  };
})();
