/* client_erp/js/redesign/rc-orders.js — Redesign Buyurtmalar (real page.orders).
   Ko'rinish qatlami yangi (rc-* dizayn tizimi). Ma'lumot/WS mavjud koddan olindi:
   WS 'page.orders' → {orders[], shared_orders[], templates[], clients[], statuses[]}.
   Filtrlash JSda (kirill/lotin normalizatsiya). Kartaga bosilsa /orders/:id. */
window.RC_PAGES = window.RC_PAGES || {};

var RcOrders = {
  _tab: 'all',
  _q: '',
  _st: null,       // RcPeriod holati {period, ym, date_from, date_to} — default: Shu oy
  _trash: [],      // o'chirilgan buyurtmalar keshi (orders.deleted)

  TABS: [
    { f: 'all',         label: 'Hammasi' },
    { f: 'new',         label: 'Yangi' },
    { f: 'waiting',     label: 'Kutilmoqda' },
    { f: 'in_progress', label: 'Jarayonda' },
    { f: 'ready',       label: 'Tayyor' },
    { f: 'delivered',   label: 'Topshirildi' },
    // 2026-09-11: MebelCity (katta ERP) bilan bog'lanish holati — `status`
    // emas, `is_linked` (boolean) bo'yicha filtrlanadi, shuning uchun
    // `_tabsHtml`/`_filtered` da alohida ishlov beriladi (pastda).
    { f: 'linked',      label: 'Ulangan' },
    { f: 'unlinked',    label: 'Ulanmagan' },
  ],

  // ── Kirill ↔ Lotin normalizatsiya (mavjud orders.js dan) ──
  _toLatin: {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z','и':'i',
    'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
    'у':'u','ф':'f','х':'x','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'i',
    'ь':'','э':'e','ю':'yu','я':'ya','ў':'o\'','қ':'q','ғ':'g\'','ҳ':'h'
  },
  _toCyrillic: {
    'sh':'ш','ch':'ч','yo':'ё','yu':'ю','ya':'я','ts':'ц','shch':'щ',
    'a':'а','b':'б','v':'в','g':'г','d':'д','e':'е','j':'ж','z':'з','i':'и',
    'y':'й','k':'к','l':'л','m':'м','n':'н','o':'о','p':'п','r':'р','s':'с','t':'т',
    'u':'у','f':'ф','x':'х','q':'қ','h':'ҳ'
  },
  _normalize: function (str) {
    if (!str) return '';
    var s = String(str).toLowerCase().trim();
    var lat = '', cyr = '';
    var map = RcOrders._toLatin;
    for (var i = 0; i < s.length; i++) { lat += (map[s[i]] !== undefined ? map[s[i]] : s[i]); }
    var rmap = RcOrders._toCyrillic;
    var keys = Object.keys(rmap).sort(function (a, b) { return b.length - a.length; });
    var j = 0;
    while (j < s.length) {
      var found = false;
      for (var k = 0; k < keys.length; k++) {
        if (s.substr(j, keys[k].length) === keys[k]) { cyr += rmap[keys[k]]; j += keys[k].length; found = true; break; }
      }
      if (!found) { cyr += s[j]; j++; }
    }
    return s + '|' + lat + '|' + cyr;
  },

  // ── Davr filtri yordamchilari (RcPeriod bilan; filtr client-side) ──

  // "Aniq oy" dropdown uchun buyurtmalar created_at dan oylar to'plami
  _monthsObj: function () {
    var mo = {};
    (STATE.orders || []).forEach(function (o) {
      var mk = (o.created_at || '').slice(0, 7);
      if (mk) mo[mk] = (mo[mk] || 0) + 1;
    });
    return mo;
  },

  // RcPeriod.query asosida sana chegaralari (YYYY-MM-DD) — created_at ni filtrlash uchun.
  _bounds: function (st) {
    var q = RcPeriod.query(st);        // {ym} | {period:'custom',date_from,date_to} | {period}
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
    if (q.ym) {
      var p = q.ym.split('-'), yy = parseInt(p[0], 10), mm = parseInt(p[1], 10) - 1;
      return { from: ymd(new Date(yy, mm, 1)), to: ymd(new Date(yy, mm + 1, 0)) };
    }
    if (q.period === 'custom') return { from: q.date_from || null, to: q.date_to || null };
    if (q.period === 'year')   return { from: y + '-01-01', to: y + '-12-31' };
    if (q.period === 'last_month') return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    if (q.period === 'all')    return { from: null, to: null };
    // month (default / Shu oy)
    return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
  },

  // Ko'rinish JORIY oyni bildiradimi? (carry-over shu holatda ishlaydi)
  _isCurMonth: function (st) {
    var now = new Date();
    var cur = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
    if (st.ym) return st.ym === cur;
    return st.period === 'month';
  },

  // Davr bo'yicha ko'rinish:
  //  • TUGAMAGAN buyurtma joriy oyda DOIM chiqadi (carry-over — o'tgan oyda
  //    ochilgan bo'lsa ham, chunki ish hali davom etyapti).
  //  • TUGAGAN buyurtma esa TOPSHIRILGAN sanasi bo'yicha filtrlanadi
  //    (topshirilmagan bo'lsa — ochilgan sanasi bo'yicha).
  // ⚠️ 2026-08-18 TUZATILDI: ilgari tugagan buyurtma `created_at` bo'yicha
  // filtrlanardi. Natijada iyulda ochilib AVGUSTDA topshirilgan #296
  // «Jafar aka jizzax» avgust ro'yxatidan tushib qolgan edi — foydalanuvchi
  // «16 ta bo'lishi kerak, 15 ta turibdi, zakaz qayerga yo'qoldi» dedi.
  // Zakaz shu oyda TUGATILGAN bo'lsa — shu oyning ishi hisoblanadi.
  _periodDate: function (o) {
    var finished = (o.status === 'delivered' || o.status === 'cancelled');
    if (finished && o.delivered_at) return (o.delivered_at || '').slice(0, 10);
    return (o.created_at || '').slice(0, 10);
  },
  _inPeriod: function (o) {
    var st = RcOrders._st;
    if (!st) return true;
    var finished = (o.status === 'delivered' || o.status === 'cancelled');
    if (RcOrders._isCurMonth(st) && !finished) return true;   // carry-over
    var b = RcOrders._bounds(st);
    if (!b.from && !b.to) return true;                        // "Hammasi"
    var cd = RcOrders._periodDate(o);
    if (!cd) return false;
    if (b.from && cd < b.from) return false;
    if (b.to && cd > b.to) return false;
    return true;
  },

  render: function () {
    var app = document.getElementById('app');
    // 2026-09-10 (foydalanuvchi so'rovi): buyurtma ichiga kirib ORQAGA
    // qaytilganda (yoki sidebar'dan qayta bosilganda) — ilgari HAR SAFAR
    // filtr/tab/qidiruv NOLGA tushirilib, butun ro'yxat serverdan QAYTA
    // so'ralardi (ko'p trafik, sekin internetda muammo, joy/filtr yo'qolib
    // qolardi). Endi: agar ro'yxat ALLAQACHON xotirada bo'lsa (bu sessiyada
    // avval yuklangan) — qayta so'ramasdan, saqlangan filtr/tab bilan
    // DARHOL (skeletonsiz) ko'rsatiladi; fon-fon'da esa yangilanish uchun
    // jim WS so'rovi yuboriladi (ekranni bloklamaydi, tugagach ro'yxat
    // yangilanadi, scroll/filtr holati BUZILMAYDI).
    var _hasCache = Array.isArray(STATE.orders) && STATE.orders.length > 0;
    if (!_hasCache) {
      app.innerHTML = Skeleton.list(5);
      RcOrders._tab = RcOrders._tab || 'all';
      RcOrders._q = RcOrders._q || '';
      RcOrders._st = RcOrders._st || RcPeriod.init();   // default: Shu oy
    } else {
      app.innerHTML = RcOrders.template();
      RcOrders.bind();
      if (Router && Router.restoreScrollFor) Router.restoreScrollFor('/orders');
    }
    // 2026-09-10 (2): agar keshdan chizilgan bo'lsa, ma'lumot HAQIQATDA
    // o'zgarganda GINA qayta chizamiz (oldin har doim qayta chizardi —
    // deyarli har doim aynan bir xil ma'lumot bo'lgani uchun ekran
    // "ikki marta yuklangandek" chaqnab turardi — foydalanuvchi shikoyati).
    var _prevSnapshot = _hasCache ? JSON.stringify(STATE.orders) : null;
    // Eslatma: page.orders period QABUL QILMAYDI → davr filtri client-side (_inPeriod).
    WS.send('page.orders', {}, function (msg) {
      if (!msg.ok) { if (!_hasCache) Toast.error(msg.error || 'Xatolik'); return; }
      var _newOrders = msg.data.orders || [];

      // Ko'rsatilish tartibi (view-only): joriy oy topshirilgan tepada, keyin eng yangisi.
      var now = new Date();
      var curM = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
      _newOrders.sort(function (a, b) {
        var at = (a.status === 'delivered' && RcOrders._periodDate(a).slice(0, 7) === curM) ? 1 : 0;
        var bt = (b.status === 'delivered' && RcOrders._periodDate(b).slice(0, 7) === curM) ? 1 : 0;
        if (at !== bt) return bt - at;
        return (b.created_at || '').localeCompare(a.created_at || '');
      });

      var _changed = !_hasCache || _prevSnapshot !== JSON.stringify(_newOrders);

      STATE.orders = _newOrders;
      STATE.sharedOrders = msg.data.shared_orders || [];
      STATE.unlinkedMcOrders = msg.data.unlinked_mc_orders || [];
      STATE.templates = msg.data.templates || [];
      STATE.orderClients = msg.data.clients || [];
      STATE.orderStatuses = msg.data.statuses || [];

      if (!_changed) return;   // aynan bir xil — qayta chizishga hojat yo'q
      // Faqat sahifa hozir HAM /orders bo'lsa qayta chizamiz (fon-yangilanish
      // paytida foydalanuvchi boshqa sahifaga o'tib ketgan bo'lishi mumkin).
      if (STATE.currentPage !== '/orders') return;
      var _y = window.scrollY;
      app.innerHTML = RcOrders.template();
      RcOrders.bind();
      if (_hasCache) window.scrollTo(0, _y);
      else if (Router && Router.restoreScrollFor) Router.restoreScrollFor('/orders');
    });
  },

  template: function () {
    var h = '<div data-screen>';

    // Sarlavha + qidiruv + "Yangi"
    h += '<div style="display:flex;align-items:center;gap:10px">';
    h += '<div class="rc-search" style="flex:1"><i class="fas fa-search" style="color:var(--mut);font-size:13px"></i>' +
         '<input id="rc-order-search" type="text" placeholder="Qidiruv (nom, mijoz)..." autocomplete="off"></div>';
    h += '<button class="rc-btn-ghost" id="rc-order-trash" style="flex:none" title="O‘chirilgan buyurtmalar"><i class="fas fa-trash"></i></button>';
    h += '<button class="rc-btn" id="rc-order-add" style="flex:none"><i class="fas fa-plus"></i> Yangi</button>';
    h += '</div>';

    // Professional davr filtri (default: Shu oy) — oylar buyurtma created_at dan
    h += RcPeriod.html(RcOrders._st, RcOrders._monthsObj());

    // Status tab'lari (hisoblar joriy davr bo'yicha)
    h += '<div class="rc-tabs" id="rc-order-tabs">' + RcOrders._tabsHtml() + '</div>';

    // Buyurtmalar ro'yxati
    h += '<div id="rc-orders-list">' + RcOrders._listHtml() + '</div>';

    // Ulashilgan buyurtmalar — 2026-09-04: yashirish/ko'rsatish tugmasi
    // qo'shildi (foydalanuvchi so'rovi). Blok o'CHIRILMAYDI, faqat CSS bilan
    // yashiriladi; holat localStorage'da saqlanadi (qurilma-lokal, backendga
    // tegmaydi). Standart — ko'rsatilgan (ilgari qanday bo'lsa shunday).
    var shared = STATE.sharedOrders || [];
    if (shared.length) {
      var _sharedHidden = RcOrders._sharedHidden();
      h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 2px 0">';
      h += '<div style="font-weight:800;font-size:15px">🤝 Ulashilgan buyurtmalar</div>';
      h += '<button class="rc-btn-ghost rc-btn-sm" id="rc-shared-toggle">' +
           (_sharedHidden ? '<i class="fas fa-eye"></i> Ko‘rsatish' : '<i class="fas fa-eye-slash"></i> Yashirish') +
           '</button>';
      h += '</div>';
      h += '<div id="rc-shared-list"' + (_sharedHidden ? ' style="display:none"' : '') + '>';
      shared.forEach(function (so) { h += RcOrders._sharedCard(so); });
      h += '</div>';
    }

    // Eslatma: "Ulanmagan MebelCity buyurtmalar" bo'limi bu yerdan (2026-08-28)
    // "#/mebelcity" sahifasiga ko'chirildi — foydalanuvchi: MebelCity bilan
    // bog'liq hamma narsa (ulangan/ulanmagan/qidiruv) shu bitta sahifada
    // bo'lsin, "Zakaz" faqat ustaning o'z ish ro'yxati bo'lib qolsin.

    h += '</div>';
    return h;
  },

  _unlinkedMcCard: function (mo) {
    var esc = Utils.esc;
    return '<div class="rc-card" style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;padding:12px 14px">' +
      '<div style="min-width:0">' +
      '<div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🏭 #' + esc(mo.order_hash) + (mo.project_name ? ' · ' + esc(mo.project_name) : '') + '</div>' +
      '<div style="font-size:11px;color:var(--mut);margin-top:2px">' + (mo.created_at ? Utils.date(mo.created_at) : '') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
      // "To'liq ko'rish" — ulanmagan bo'lsa ham katta ERP'ning o'z (login
      // talab qilmaydigan) jamoat sahifasiga o'tish kerak (2026-08-28,
      // foydalanuvchi: "faqat ulanganlarda ishlaydi, umumiy qil").
      '<a class="rc-btn-ghost rc-btn-sm" style="flex:1;text-align:center;text-decoration:none" href="https://mebelcity.bittada.uz/order/' + esc(mo.order_hash) + '/"><i class="fas fa-external-link-alt"></i> To\'liq ko\'rish</a>' +
      '<button class="rc-btn-ghost rc-btn-sm" style="flex:1" onclick="RcOrders.linkUnlinkedMc(' + mo.id + ')"><i class="fas fa-link"></i> Ulash</button>' +
      '</div>' +
      '</div>';
  },

  // "Ulanmagan MebelCity buyurtmalar" bo'limidan — teskari yo'nalish: bu
  // MebelCity buyurtmaga qaysi zakazni ulaymiz, deb so'raydi (fuzzy taklif bilan).
  linkUnlinkedMc: function (mcId) {
    var mo = (STATE.unlinkedMcOrders || []).filter(function (m) { return m.id === mcId; })[0];
    if (!mo) return;
    var candidates = (STATE.orders || []).filter(function (o) { return o.status !== 'delivered' && o.status !== 'cancelled'; });
    var scored = candidates.map(function (o) {
      return { o: o, score: RcOrders._nameScore(mo.project_name || '', o.title || '') };
    }).sort(function (a, b) { return b.score - a.score; });
    var esc = Utils.esc;
    var moName = mo.project_name || mo.partner_name || ('Buyurtma #' + mo.order_hash);
    var body = '<div style="font-size:14px;font-weight:700;margin-bottom:12px">🏭 ' + esc(moName) + '</div>';
    body += '<div style="display:flex;flex-direction:column;gap:8px;max-height:380px;overflow-y:auto" id="rc-link-order-list">';
    scored.forEach(function (s) {
      var suggested = s.score >= 0.35;
      body += '<div class="rc-link-order-item" data-id="' + s.o.id + '" style="padding:14px;border:2px solid ' + (suggested ? 'var(--acc-text)' : 'var(--brd)') + ';border-radius:var(--radius-sm);cursor:pointer;background:var(--sfc2)">';
      body += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">';
      body += '<span style="font-size:15px;font-weight:700">' + esc(s.o.title) + '</span>';
      if (suggested) body += '<span style="font-size:11px;padding:2px 8px;border-radius:5px;background:var(--acc);color:var(--acc-ink);font-weight:700">Ehtimol shu</span>';
      body += '</div></div>';
    });
    body += '</div>';
    RcSheet.open('🔗 Qaysi zakazga ulaymiz?', body, {});
    document.querySelectorAll('#rc-link-order-list .rc-link-order-item').forEach(function (el) {
      el.onclick = function () {
        var orderId = parseInt(el.dataset.id);
        WS.send('order_link_mebelcity', { order_id: orderId, mebelcity_order_id: mcId }, function (msg) {
          if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
          RcSheet.close();
          Toast.success('Ulandi');
          STATE.orders = null; RcOrders.render();
        });
      };
    });
  },

  // Ulangan zakazdan MebelCity buyurtmani uzish (yoki uzib, boshqasiga ulash).
  // Sodda 2 ta katta tugma — ustalar texnik ko'rinishni yoqtirmaydi (2026-08-28).
  unlinkMc: function (orderId) {
    var o = (STATE.orders || []).filter(function (x) { return x.id === orderId; })[0];
    if (!o) return;
    var esc = Utils.esc;
    var body = '<div style="font-size:14px;font-weight:700;margin-bottom:16px">' + esc(o.title) + '</div>';
    body += '<div style="display:flex;flex-direction:column;gap:10px">';
    body += '<button class="rc-btn-ghost" id="rc-unlink-swap" style="width:100%;padding:14px;font-size:15px"><i class="fas fa-exchange-alt"></i> Boshqasiga ulash</button>';
    body += '<button class="rc-btn-ghost" id="rc-unlink-only" style="width:100%;padding:14px;font-size:15px;color:var(--danger)"><i class="fas fa-unlink"></i> Uzish</button>';
    body += '</div>';
    RcSheet.open('🔗 MebelCity bilan bog\'lanish', body, {});
    document.getElementById('rc-unlink-only').onclick = function () {
      WS.send('order_link_mebelcity', { order_id: orderId, mebelcity_order_id: null }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close();
        Toast.success('Uzildi');
        STATE.orders = null; RcOrders.render();
      });
    };
    document.getElementById('rc-unlink-swap').onclick = function () {
      RcSheet.close();
      RcOrders._pickMcForOrder(o);
    };
  },

  // "Boshqasiga ulash" — o'sha usta zakaziga MebelCity buyurtmalar ro'yxatini
  // (Ulanmagan + joriy ulangan) ko'rsatib, tanlatadi. linkUnlinkedMc bilan bir
  // xil sodda ko'rinish (faqat ism+sana, "Tavsiya" belgisi bilan).
  _pickMcForOrder: function (o) {
    var esc = Utils.esc;
    var pool = (STATE.unlinkedMcOrders || []).slice();
    var scored = pool.map(function (mo) {
      return { mo: mo, score: RcOrders._nameScore(mo.project_name || '', o.title || '') };
    }).sort(function (a, b) { return b.score - a.score; });
    var body = '<div style="font-size:14px;font-weight:700;margin-bottom:12px">' + esc(o.title) + '</div>';
    body += '<div style="display:flex;flex-direction:column;gap:8px;max-height:380px;overflow-y:auto" id="rc-pick-mc-list">';
    if (!scored.length) {
      body += '<div style="text-align:center;padding:16px;color:var(--mut);font-size:13px">Ulanmagan MebelCity buyurtma topilmadi</div>';
    }
    scored.forEach(function (s) {
      var suggested = s.score >= 0.35;
      var name = s.mo.project_name || s.mo.partner_name || ('Buyurtma #' + s.mo.order_hash);
      body += '<div class="rc-pick-mc-item" data-id="' + s.mo.id + '" style="padding:14px;border:2px solid ' + (suggested ? 'var(--acc-text)' : 'var(--brd)') + ';border-radius:var(--radius-sm);cursor:pointer;background:var(--sfc2)">';
      body += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">';
      body += '<span style="font-size:15px;font-weight:700">' + esc(name) + '</span>';
      if (suggested) body += '<span style="font-size:11px;padding:2px 8px;border-radius:5px;background:var(--acc);color:var(--acc-ink);font-weight:700">Tavsiya</span>';
      body += '</div>';
      if (s.mo.created_at) body += '<div style="font-size:12px;color:var(--mut);margin-top:4px">📅 ' + Utils.date(s.mo.created_at) + '</div>';
      body += '</div>';
    });
    body += '</div>';
    RcSheet.open('🔗 Qaysi buyurtmaga ulaymiz?', body, {});
    document.querySelectorAll('#rc-pick-mc-list .rc-pick-mc-item').forEach(function (el) {
      el.onclick = function () {
        var mcId = parseInt(el.dataset.id);
        WS.send('order_link_mebelcity', { order_id: o.id, mebelcity_order_id: mcId }, function (msg) {
          if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
          RcSheet.close();
          Toast.success('Ulandi');
          STATE.orders = null; RcOrders.render();
        });
      };
    });
  },

  // Oddiy so'z-kesishuv balli (backend name_match.match_score bilan bir xil
  // g'oya, faqat client-side — modal ochilishi uchun round-trip kerak emas).
  _nameScore: function (a, b) {
    var stop = { 'big': 1, 'one': 1, '0299': 1, 'oshxona': 1, 'ака': 1, 'aka': 1, 'опа': 1, 'opa': 1 };
    function words(s) {
      return RcOrders._normalize(s).split('|')[1].split(/[^a-z0-9]+/).filter(function (w) { return w.length > 1 && !stop[w]; });
    }
    var wa = words(a), wb = words(b);
    if (!wa.length || !wb.length) return 0;
    var setA = {}; wa.forEach(function (w) { setA[w] = 1; });
    var inter = 0; var setB = {};
    wb.forEach(function (w) { setB[w] = 1; if (setA[w]) inter++; });
    var union = Object.keys(setA).length + Object.keys(setB).length - inter;
    return union ? inter / union : 0;
  },

  // Status tab'lari HTML (hisoblar davr bo'yicha — tab/qidiruvga bog'liq emas)
  _tabsHtml: function () {
    var esc = Utils.esc;
    var inPeriod = (STATE.orders || []).filter(function (o) { return RcOrders._inPeriod(o); });
    var counts = { all: inPeriod.length };
    RcOrders.TABS.forEach(function (t) { if (t.f !== 'all') counts[t.f] = 0; });
    inPeriod.forEach(function (o) {
      if (counts[o.status] !== undefined) counts[o.status]++;
      // `linked`/`unlinked` — `status`dan mustaqil, `is_linked` bo'yicha.
      if (o.is_linked) counts.linked++; else counts.unlinked++;
    });
    var h = '';
    RcOrders.TABS.forEach(function (t) {
      var active = (t.f === RcOrders._tab) ? ' active' : '';
      h += '<button class="rc-tab' + active + '" data-filter="' + t.f + '">' +
           esc(t.label) + ' <span style="opacity:.55">' + (counts[t.f] || 0) + '</span></button>';
    });
    return h;
  },

  _filtered: function () {
    var orders = STATE.orders || [];
    var tab = RcOrders._tab;
    var q = (RcOrders._q || '').trim();
    var parts = q ? RcOrders._normalize(q).split('|') : null;
    return orders.filter(function (o) {
      if (!RcOrders._inPeriod(o)) return false;
      if (tab === 'linked' && !o.is_linked) return false;
      if (tab === 'unlinked' && o.is_linked) return false;
      if (tab !== 'all' && tab !== 'linked' && tab !== 'unlinked' && o.status !== tab) return false;
      if (!parts) return true;
      var hay = RcOrders._normalize((o.title || '') + ' ' + (o.customer_name || ''));
      return parts.some(function (p) { return p && hay.indexOf(p) !== -1; });
    });
  },

  _listHtml: function () {
    var list = RcOrders._filtered();
    if (!(STATE.orders || []).length) {
      return '<div class="rc-empty"><div class="rc-empty-ic">📦</div>' +
        '<div style="font-weight:800;font-size:15px;color:var(--txt)">Hali buyurtma yo\'q</div>' +
        '<div style="margin-top:4px">Birinchi buyurtmani qo\'shing</div></div>';
    }
    if (!list.length) {
      var q = (RcOrders._q || '').trim();
      return '<div class="rc-empty"><div class="rc-empty-ic">🔍</div>' +
        '<div style="font-weight:800;font-size:15px;color:var(--txt)">' +
        (q ? 'Topilmadi: "' + Utils.esc(q) + '"' : 'Bu bo\'limda buyurtma yo\'q') + '</div></div>';
    }
    var h = '';
    for (var i = 0; i < list.length; i++) h += RcOrders._card(list[i], i);
    return h;
  },

  _card: function (o, i) {
    var esc = Utils.esc, money = Utils.money;
    var pct = Math.max(0, Math.min(100, parseInt(o.overall_progress) || 0));
    var st = (window.RcStatus ? RcStatus.badge(o.status) : '<span class="rc-badge" style="background:var(--sfc2)">' + esc(o.status) + '</span>');
    var dly = (i ? Math.min(i, 8) * 0.04 : 0);

    var h = '<div onclick="Router.go(\'/orders/' + o.id + '\')" class="rc-card" ' +
      'style="cursor:pointer;display:flex;flex-direction:column;gap:10px;margin-bottom:10px;animation:rc-screenin .34s cubic-bezier(.2,.8,.3,1) backwards;animation-delay:' + dly + 's">';

    // Sarlavha + status
    h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
      '<div style="font-weight:700;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</div>' + st + '</div>';

    // Mijoz + narx
    h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
      '<span style="font-size:12px;color:var(--mut);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><i class="fas fa-user" style="font-size:10px;opacity:.7"></i> ' + esc(o.customer_name || '—') + '</span>' +
      '<span style="font-size:14px;font-weight:800;flex:none">' + money(o.total_income) + ' so\'m</span></div>';

    // Kutilmoqda izohi
    if (o.status === 'waiting' && o.waiting_note) {
      h += '<div style="font-size:11px;color:var(--pch);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(o.waiting_note) + '">💬 ' + esc(o.waiting_note) + '</div>';
    }

    // Progress
    h += '<div style="display:flex;align-items:center;gap:10px">' +
      '<div class="rc-progress"><div class="rc-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<span style="font-size:11px;font-weight:700;color:var(--mut);flex:none">' + pct + '%</span></div>';

    // Chip'lar: ulanish + zamer + vaqt
    h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">';
    if (o.is_linked) {
      // Bosilsa — uzish/qayta ulash so'raladi (kartani ochib yubormasin: stopPropagation).
      h += '<span class="rc-chip" style="color:var(--acc-text);cursor:pointer" onclick="event.stopPropagation();RcOrders.unlinkMc(' + o.id + ')">🔗 Ulangan</span>';
    } else {
      h += '<span class="rc-chip" style="color:var(--mut)">○ Ulanmagan</span>';
    }
    if (o.has_zamer === true) {
      h += '<span class="rc-chip" style="color:var(--acc-text)">✓ Zamer</span>';
    }
    if (o.profit_pct !== undefined && o.profit_pct !== null) {
      h += '<span class="rc-chip" style="color:' + (o.profit_pct < 0 ? 'var(--danger)' : 'var(--acc-text)') + '">💹 ' + o.profit_pct + '% foyda</span>';
    }
    // ── Bazis oblaka / VR 3D havolasi — 2026-09-08, foydalanuvchi so'rovi:
    // "zakazni ichiga kirmasdan trub korish kere". Bosilganda kartani
    // ochmasdan (stopPropagation) to'g'ridan-to'g'ri yangi oynada ochiladi.
    // 2026-09-08 (2): faqat ikonka tushunarsiz edi — matn qo'shildi, chip
    // boshqalardan sal kattaroq (font-size/padding oshirilgan).
    if (o.bazis_link_url) {
      h += '<a href="' + esc(o.bazis_link_url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="rc-chip" style="color:var(--acc-text);text-decoration:none;font-size:12px;padding:5px 10px" title="Bazis oblaka">☁️ Bazis</a>';
    }
    if (o.vr_link_url) {
      h += '<a href="' + esc(o.vr_link_url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="rc-chip" style="color:var(--acc-text);text-decoration:none;font-size:12px;padding:5px 10px" title="VR 3D model">🎮 VR</a>';
    }
    h += '<span style="font-size:11px;color:var(--mut);margin-left:auto">' + Utils.timeAgo(o.created_at) + '</span>';
    h += '</div>';

    // MebelCity ishlab chiqarish progressi — ulangan bo'lsa, "Ulangan" chipdan
    // pastda, qaysi bosqichda ekanini ko'rsatadi (usta zakaz ichiga kirmasdan
    // biladi). Ulanmagan bo'lsa hech narsa chiqmaydi.
    // 2026-08-29: svetofor rangi — foydalanuvchi: "hamma shu rangni tanigan",
    // 3 bosqich: qizil (0-33%, hali ko'p ish bor) → sariq (34-66%, jarayonda)
    // → yashil (67-100%, deyarli/to'liq tayyor). Ixcham o'lcham saqlanadi.
    if (o.is_linked && o.mc_progress) {
      var mp = o.mc_progress;
      var mpPct = mp.progress || 0;
      // Aniq svetofor HEX (qizil/sariq/yashil) — palitraning --ok (lime) va
      // --pch (shaftoli) ranglari "haqiqiy" qizil/sariq/yashil bermaydi,
      // foydalanuvchi tanish svetofor ranglarini so'radi.
      var mpColor = mpPct >= 67 ? '#22c55e' : (mpPct >= 34 ? '#f59e0b' : '#ef4444');
      h += '<div style="display:flex;align-items:center;gap:5px;background:color-mix(in srgb,' + mpColor + ' 16%,var(--sfc2));border:1px solid color-mix(in srgb,' + mpColor + ' 45%,transparent);color:' + mpColor + ';border-radius:6px;padding:3px 8px;font-size:10.5px;font-weight:700">';
      h += '<span style="flex:none">🏭</span>';
      h += '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">' + esc(mp.current_step || (mpPct >= 100 ? 'Tayyor' : 'Ishlab chiqarilmoqda')) + '</span>';
      h += '<span style="flex:none">' + mpPct + '%</span>';
      h += '</div>';
    }

    h += '</div>';
    return h;
  },

  _sharedCard: function (so) {
    var esc = Utils.esc;
    var o = so.order || {};
    var pct = Math.max(0, Math.min(100, parseInt(o.overall_progress) || 0));
    var roleMap = { viewer: 'Ko\'ruvchi', worker: 'Ishchi', manager: 'Menejer', owner: 'Egasi' };
    var role = roleMap[so.role] || so.role || '';
    var profitChip = (o.profit_pct !== undefined && o.profit_pct !== null)
      ? '<span class="rc-chip" style="color:' + (o.profit_pct < 0 ? 'var(--danger)' : 'var(--acc-text)') + '">💹 ' + o.profit_pct + '% foyda</span>'
      : '';
    return '<div onclick="Router.go(\'/orders/' + o.id + '\')" class="rc-card" style="cursor:pointer;display:flex;flex-direction:column;gap:10px;margin-bottom:10px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
      '<div style="font-weight:700;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</div>' +
      '<span class="rc-chip rc-chip-acc">' + esc(role) + '</span></div>' +
      '<div style="display:flex;align-items:center;gap:10px">' +
      '<div class="rc-progress"><div class="rc-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<span style="font-size:11px;font-weight:700;color:var(--mut)">' + pct + '%</span></div>' +
      (profitChip ? '<div style="display:flex">' + profitChip + '</div>' : '') + '</div>';
  },

  _renderList: function () {
    var el = document.getElementById('rc-orders-list');
    if (el) el.innerHTML = RcOrders._listHtml();
  },

  // Davr o'zgarganda butun ekran qayta chiziladi (davr bar active holati,
  // tab hisoblari va ro'yxat birga yangilanadi) — rc-finance uslubida.
  _repaint: function () {
    var app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = RcOrders.template();
    RcOrders.bind();
  },

  bind: function () {
    // Tanishtiruv + izohlar (2026-08-06)
    if (window.RcTour && RcTour.auto) { try { RcTour.auto('orders'); } catch (e) {} }
    if (window.RcHint && RcHint.bind) { try { RcHint.bind(); } catch (e) {} }

    // Qidiruv
    var s = document.getElementById('rc-order-search');
    if (s) {
      s.value = RcOrders._q;
      var deb;
      s.oninput = function () {
        clearTimeout(deb);
        deb = setTimeout(function () { RcOrders._q = s.value; RcOrders._renderList(); }, 150);
      };
    }

    // Status tab'lar
    RcOrders._bindTabs();

    // Professional davr filtri (RcPeriod) → o'zgarsa butun ekran qayta chiziladi
    RcPeriod.bind(document.getElementById('app'), RcOrders._st, RcOrders._monthsObj(), function () {
      RcOrders._repaint();
    });

    // "Yangi" tugma
    var add = document.getElementById('rc-order-add');
    if (add) add.onclick = function () { RcOrders.showCreate(); };

    // O'chirilgan buyurtmalar (savat)
    var trash = document.getElementById('rc-order-trash');
    if (trash) trash.onclick = function () { RcOrders._showTrash(); };

    // Ulashilgan buyurtmalar — yashirish/ko'rsatish (2026-09-04)
    var sharedToggle = document.getElementById('rc-shared-toggle');
    if (sharedToggle) {
      sharedToggle.onclick = function () {
        var hidden = !RcOrders._sharedHidden();
        try { localStorage.setItem('rc_shared_orders_hidden', hidden ? '1' : '0'); } catch (e) {}
        var list = document.getElementById('rc-shared-list');
        if (list) list.style.display = hidden ? 'none' : '';
        sharedToggle.innerHTML = hidden ? '<i class="fas fa-eye"></i> Ko‘rsatish' : '<i class="fas fa-eye-slash"></i> Yashirish';
      };
    }
  },

  // Ulashilgan buyurtmalar blokining yashirin/ko'rinish holati (qurilma-lokal)
  _sharedHidden: function () {
    try { return localStorage.getItem('rc_shared_orders_hidden') === '1'; } catch (e) { return false; }
  },

  // ── O'chirilgan buyurtmalar (WS: orders.deleted + order.restore) ──
  _showTrash: function () {
    if (!(window.RcSheet && RcSheet.open)) { Toast.info('Tez orada'); return; }
    var body = '<div class="rc-search" style="margin-bottom:10px"><i class="fas fa-search" style="color:var(--mut);font-size:13px"></i>' +
      '<input id="rc-trash-q" type="text" placeholder="Qidirish (nom, mijoz)..."></div>' +
      '<div id="rc-trash-list" style="max-height:56vh;overflow-y:auto">' + Skeleton.list(3) + '</div>';
    RcSheet.open('🗑 O‘chirilgan buyurtmalar', body, {});
    WS.send('orders.deleted', {}, function (msg) {
      if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); return; }
      RcOrders._trash = (msg.data && msg.data.orders) || [];
      RcOrders._renderTrash(RcOrders._trash);
      var q = document.getElementById('rc-trash-q');
      if (q) q.oninput = function () {
        var qq = q.value.toLowerCase().trim();
        RcOrders._renderTrash(RcOrders._trash.filter(function (o) {
          return !qq || ((o.title || '') + ' ' + (o.customer_name || '')).toLowerCase().indexOf(qq) !== -1;
        }));
      };
    });
  },

  _renderTrash: function (orders) {
    var list = document.getElementById('rc-trash-list'); if (!list) return;
    var esc = Utils.esc;
    if (!orders.length) { list.innerHTML = '<div class="rc-empty"><div class="rc-empty-ic">📭</div><div style="color:var(--mut)">O‘chirilgan buyurtma yo‘q</div></div>'; return; }
    var h = '';
    orders.forEach(function (o) {
      var when = o.deleted_at ? Utils.timeAgo(o.deleted_at) : '';
      h += '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px;border-radius:var(--radius-sm);margin-bottom:6px;background:var(--sfc2)">';
      h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</div>';
      var meta = [];
      if (o.customer_name) meta.push(esc(o.customer_name));
      if (when) meta.push('🗑 ' + when);
      if (meta.length) h += '<div style="font-size:11px;color:var(--mut);margin-top:2px">' + meta.join(' · ') + '</div>';
      if (o.delete_note) h += '<div style="font-size:11px;color:var(--danger);margin-top:4px">💬 ' + esc(o.delete_note) + '</div>';
      h += '</div>';
      h += '<button class="rc-btn rc-btn-sm rc-trash-restore" data-id="' + o.id + '" style="flex:none"><i class="fas fa-undo"></i> Tiklash</button>';
      h += '</div>';
    });
    list.innerHTML = h;
    list.querySelectorAll('.rc-trash-restore').forEach(function (b) {
      b.onclick = function () {
        var id = parseInt(b.dataset.id);
        b.disabled = true; b.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        WS.send('order.restore', { id: id }, function (msg) {
          if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); b.disabled = false; b.innerHTML = '<i class="fas fa-undo"></i> Tiklash'; return; }
          Toast.success('Buyurtma tiklandi');
          RcOrders._trash = RcOrders._trash.filter(function (x) { return x.id !== id; });
          if (RcSheet.close) RcSheet.close();
          STATE.orders = null; RcOrders.render();
        });
      };
    });
  },

  _bindTabs: function () {
    document.querySelectorAll('#rc-order-tabs .rc-tab').forEach(function (btn) {
      btn.onclick = function () {
        RcOrders._tab = btn.getAttribute('data-filter');
        document.querySelectorAll('#rc-order-tabs .rc-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        RcOrders._renderList();
      };
    });
  },

  // ── Yangi buyurtma (RcSheet bo'lsa — sheet; bo'lmasa degrade) ──
  showCreate: function () {
    if (!window.RcSheet || !RcSheet.open) { Toast.info('Tez orada'); return; }

    var esc = Utils.esc;
    var clients = STATE.orderClients || [];
    var tmpls = STATE.templates || [];

    var body = '';
    body += '<div style="display:flex;flex-direction:column;gap:14px">';
    body += '<div style="font-weight:800;font-size:16px">Yangi buyurtma</div>';

    // Sarlavha
    body += '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Sarlavha *</div>' +
      '<input id="rc-no-title" class="rc-input" type="text" placeholder="Buyurtma nomi"></div>';

    // Mijoz
    body += '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Mijoz</div>' +
      '<select id="rc-no-client" class="rc-input"><option value="">Mijozsiz</option>';
    clients.forEach(function (c) {
      body += '<option value="' + c.id + '">' + esc(c.name) + (c.phone ? ' · ' + esc(c.phone) : '') + '</option>';
    });
    body += '</select>';
    body += '<button type="button" id="rc-no-newcl" class="rc-btn-ghost rc-btn-sm" style="margin-top:6px"><i class="fas fa-user-plus"></i> Yangi mijoz</button>';
    body += '<div id="rc-no-newcl-box" style="display:none;margin-top:8px;padding:10px;background:var(--sfc2);border-radius:var(--radius-sm);flex-direction:column;gap:8px">' +
      '<input id="rc-no-cl-name" class="rc-input" placeholder="Mijoz ismi">' +
      '<input id="rc-no-cl-phone" class="rc-input ce-phone-input" type="tel" inputmode="tel" placeholder="93 042 15 02">' +
      '<button type="button" id="rc-no-cl-add" class="rc-btn rc-btn-sm">Qo\'shish</button></div>';
    body += '</div>';

    // Shablon — MAJBURIY (2026-08-04). Ilgari "Shablonsiz" varianti bor edi,
    // lekin bosqichsiz buyurtma barcha hisobotlardan tushib qolardi.
    body += '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Etap shabloni *</div>' +
      '<select id="rc-no-tmpl" class="rc-input"><option value="">— Tanlang —</option>';
    tmpls.forEach(function (t) { body += '<option value="' + t.id + '">' + esc(t.name) + '</option>'; });
    body += '</select>';
    body += '<div style="font-size:11px;color:var(--mut);margin-top:5px">' +
      'Shablon — buyurtmaning bosqichlari ro‘yxati. ' +
      '<a href="#" id="rc-no-tmpl-help" style="color:var(--acc-text);font-weight:700">Bu nima?</a></div>';
    body += '</div>';

    // ── SHARTNOMA SUMMASI — ixtiyoriy (2026-09-03, MAJBURIYLIK olib
    // tashlandi). 2026-08-15dan 09-03gacha majburiy edi — endi bo'sh
    // qoldirilsa ogohlantirish chiqadi, lekin bloklamaydi (_sumConfirm).
    body += '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Shartnoma summasi</div>' +
      '<input id="rc-no-sum" class="rc-input ce-money-input" type="text" inputmode="numeric" placeholder="0"></div>';
    body += '<div style="font-size:11px;color:var(--mut);margin-top:-6px">' +
      'Foyda shu summadan hisoblanadi. Keyingi qadamda <b>foyda ulushi (foiz)</b> so‘raladi.</div>';

    // ── Izoh — ixtiyoriy (2026-09-03) ──────────────────────────────────
    body += '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Izoh (ixtiyoriy)</div>' +
      '<textarea id="rc-no-desc" class="rc-input" rows="2" style="resize:vertical" placeholder="Masalan: summa keyin aniqlanadi..."></textarea></div>';

    body += '<button class="rc-btn" id="rc-no-save" style="width:100%;margin-top:4px"><i class="fas fa-check"></i> Yaratish</button>';
    body += '</div>';

    RcSheet.open('Yangi buyurtma', body, {});

    setTimeout(function () {
      // Summa/telefon maydonlari formatlanishi uchun (mingliklar bo'shlig'i)
      if (Utils.bindMoneyInputs) Utils.bindMoneyInputs();
      if (Utils.bindPhoneInputs) Utils.bindPhoneInputs();
      var titleEl = document.getElementById('rc-no-title');
      var save = document.getElementById('rc-no-save');

      // ── Qoralamani tiklash (2026-08-04) ──
      // Shablon-tushuntirish oynasi ochilib yopilgach, foydalanuvchi yozgan
      // sarlavha/mijoz va tanlangan shablon qaytariladi — qaytadan yozmasin.
      var _d = RcOrders._draft;
      if (_d) {
        if (titleEl && _d.title) titleEl.value = _d.title;
        var cEl = document.getElementById('rc-no-client');
        if (cEl && _d.client) cEl.value = _d.client;
        RcOrders._draft = null;
      }
      if (RcOrders._pendingTmpl) {
        var tEl = document.getElementById('rc-no-tmpl');
        if (tEl) tEl.value = RcOrders._pendingTmpl;
        RcOrders._pendingTmpl = null;
      }

      if (titleEl && !titleEl.value) titleEl.focus();
      // Inline yangi mijoz
      var newBtn = document.getElementById('rc-no-newcl');
      var newBox = document.getElementById('rc-no-newcl-box');
      if (newBtn) newBtn.onclick = function () {
        newBox.style.display = newBox.style.display === 'none' ? 'flex' : 'none';
        var n = document.getElementById('rc-no-cl-name'); if (n) n.focus();
      };
      var addCl = document.getElementById('rc-no-cl-add');
      if (addCl) addCl.onclick = function () {
        var name = ((document.getElementById('rc-no-cl-name') || {}).value || '').trim();
        if (!name) return Toast.error('Ism kiriting');
        var phone = Utils.rawPhone(((document.getElementById('rc-no-cl-phone') || {}).value) || '');
        addCl.disabled = true;
        WS.send('client.create', { name: name, phone: phone }, function (msg) {
          addCl.disabled = false;
          if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
          var c = msg.data;
          if (STATE.orderClients) STATE.orderClients.push(c);
          var sel = document.getElementById('rc-no-client');
          var opt = document.createElement('option');
          opt.value = c.id; opt.textContent = c.name + (c.phone ? ' · ' + c.phone : ''); opt.selected = true;
          sel.appendChild(opt);
          newBox.style.display = 'none';
          Toast.success('Mijoz qo\'shildi: ' + c.name);
        });
      };
      if (!save) return;
      // «Bu nima?» — shablon tushuntirishi (sodda til)
      var helpLink = document.getElementById('rc-no-tmpl-help');
      if (helpLink) helpLink.onclick = function (e) {
        e.preventDefault();
        RcOrders._tmplHelp();
      };

      save.onclick = function () {
        var title = (document.getElementById('rc-no-title') || {}).value || '';
        var cid = (document.getElementById('rc-no-client') || {}).value || '';
        var tid = (document.getElementById('rc-no-tmpl') || {}).value || '';
        if (!title.trim()) return Toast.error('Sarlavha kiritilmagan');
        // ── SHABLON MAJBURIY (2026-08-04) ──
        // Toast emas, TUSHUNTIRUVCHI oyna: usta «nega bo'lmayapti?» deb
        // qolmasin, shu yerning o'zida shablonni tanlab yoki yaratib ketsin.
        if (!tid) return RcOrders._tmplRequired();
        // ── SHARTNOMA SUMMASI — ixtiyoriy (2026-09-03) ──────────────────
        // Bo'sh/0 bo'lsa endi BLOKLAMAYDI — faqat ogohlantirib tasdiqlatadi
        // (_sumConfirm). Majburiylik 2026-08-15dan 09-03gacha bor edi.
        var sumEl = document.getElementById('rc-no-sum');
        var sum = Utils.rawMoney((sumEl || {}).value || '');
        var desc = ((document.getElementById('rc-no-desc') || {}).value || '').trim();
        if (!sum || sum <= 0) {
          return RcOrders._sumConfirm(title, cid, tid, desc);
        }
        RcOrders._createOrder(title, cid, tid, sum, desc);
      };
    }, 0);
  },

  // Shartnoma summasisiz ochish tasdig'i (2026-09-03) — bloklamaydi, faqat
  // ogohlantiradi: usta xohlasa keyinroq buyurtma ichida to'ldirishi mumkin.
  _sumConfirm: function (title, cid, tid, desc) {
    if (!window.RcSheet || !RcSheet.open) return RcOrders._createOrder(title, cid, tid, 0, desc);
    var h = '<div style="text-align:center;margin-bottom:14px">'
      + '<div style="font-size:40px">⚠️</div>'
      + '<div style="font-weight:800;font-size:16px;color:var(--txt);margin-top:8px">Shartnoma summasisiz ochilsinmi?</div>'
      + '<div style="font-size:13px;color:var(--mut);margin-top:4px">Summani keyin buyurtma ichida qo\'shishingiz mumkin. Foyda summasiz hisoblanmaydi.</div>'
      + '</div>';
    h += '<div style="display:flex;flex-direction:column;gap:8px">'
      + '<button class="rc-btn" id="rc-sum-yes" style="width:100%">Ha, summasiz ochish</button>'
      + '<button class="rc-btn-ghost" id="rc-sum-no" style="width:100%">Orqaga, summa kiritaman</button>'
      + '</div>';
    RcSheet.open('Diqqat', h, {});
    var yes = document.getElementById('rc-sum-yes');
    var no = document.getElementById('rc-sum-no');
    if (yes) yes.onclick = function () { RcOrders._createOrder(title, cid, tid, 0, desc); };
    if (no) no.onclick = function () {
      RcOrders._draft = { title: title, client: cid };
      RcOrders._pendingTmpl = tid;
      RcSheet.close();
      RcOrders.showCreate();
    };
  },

  _createOrder: function (title, cid, tid, sum, desc) {
    WS.send('order.create', {
      title: title.trim(),
      customer_id: cid ? parseInt(cid) : null,
      template_id: tid ? parseInt(tid) : null,
      zaklad_amount: sum || 0,
      description: desc || ''
    }, function (msg) {
      if (!msg.ok) return Toast.error(msg.error);
      if (RcSheet.close) RcSheet.close();
      Toast.success('Buyurtma yaratildi');
      // Foiz kiritish MAJBURIY — detal sahifasi ochilgach «Foyda
      // taqsimlash» o'zi ochiladi (rc-order-detail.js `_forceProfit`).
      try { sessionStorage.setItem('rc_force_profit', String(msg.data.id)); } catch (e) {}
      Router.go('/orders/' + msg.data.id);
    });
  },
  // ══════════════════════════════════════════════════════════════════════
  //  SHABLON TUSHUNTIRISHI (2026-08-04)
  //  Usta «shablon» so'zini bilmasligi mumkin — shuning uchun oddiy,
  //  jaydari tilda, o'z ishidan misol bilan tushuntiramiz.
  // ══════════════════════════════════════════════════════════════════════
  _tmplExplainHtml: function () {
    return ''
      + '<div style="font-size:13.5px;line-height:1.7;color:var(--txt)">'
      +   '<b>Shablon</b> — bu buyurtmaning <b>bosqichlari ro‘yxati</b>. '
      +   'Ya‘ni ishni boshidan oxirigacha qanday qadamlar bilan bajarasiz.'
      + '</div>'
      + '<div style="margin-top:12px;padding:12px 14px;background:var(--sfc2);border-radius:14px">'
      +   '<div style="font-size:11.5px;color:var(--mut);font-weight:700;margin-bottom:8px">MISOL</div>'
      +   '<div style="font-size:13px;line-height:2">'
      +     '📏 O‘lchov olish<br>'
      +     '🪚 Kesish<br>'
      +     '🔧 Yig‘ish<br>'
      +     '🎨 Bo‘yash<br>'
      +     '🚚 Yetkazish'
      +   '</div>'
      + '</div>'
      + '<div style="font-size:13px;line-height:1.7;color:var(--txt);margin-top:12px">'
      +   'Shablonni tanlasangiz — tizim shu bosqichlarni <b>o‘zi qo‘shib beradi</b>. '
      +   'Har birini qo‘lda yozib o‘tirmaysiz. Ish qaysi bosqichda turganini '
      +   'ko‘rib turasiz, mijozga ham ko‘rsatasiz.'
      + '</div>'
      + '<div style="font-size:12.5px;line-height:1.7;color:var(--mut);margin-top:10px">'
      +   'Tayyor shablon bo‘lmasa — <b>Sozlamalar → Etap shablonlari</b> bo‘limidan '
      +   'o‘zingiz yaratib olasiz. Bir marta yaratasiz, keyin hamma buyurtmaga ishlatasiz.'
      + '</div>';
  },

  // «Bu nima?» havolasi — faqat tushuntirish
  _tmplHelp: function () {
    if (!window.RcSheet || !RcSheet.open) return;
    var h = '<div style="text-align:center;margin-bottom:14px"><div style="font-size:40px">📋</div></div>'
      + RcOrders._tmplExplainHtml()
      + '<button class="rc-btn" id="rc-tmpl-help-ok" style="width:100%;margin-top:16px">Tushunarli</button>';
    RcSheet.open('Shablon nima?', h, {});
    setTimeout(function () {
      var b = document.getElementById('rc-tmpl-help-ok');
      if (b) b.onclick = function () { RcSheet.close(); };
    }, 0);
  },

  // Saqlashda shablon tanlanmagan bo'lsa — tushuntirish + SHU YERDA tanlash
  _tmplRequired: function () {
    if (!window.RcSheet || !RcSheet.open) { Toast.error('Etap shablonini tanlang'); return; }
    var esc = Utils.esc;
    var tmpls = STATE.templates || [];

    // Yozilgan ma'lumot YO'QOLMASIN — oyna qayta ochilganda tiklanadi.
    RcOrders._draft = {
      title: (document.getElementById('rc-no-title') || {}).value || '',
      client: (document.getElementById('rc-no-client') || {}).value || '',
    };

    var h = '<div style="text-align:center;margin-bottom:14px">'
      + '<div style="font-size:40px">📋</div>'
      + '<div style="font-weight:800;font-size:16px;color:var(--txt);margin-top:8px">Iltimos, shablon tanlang</div>'
      + '<div style="font-size:13px;color:var(--mut);margin-top:4px">Shablonsiz buyurtma yarata olmaysiz</div>'
      + '</div>';

    if (tmpls.length) {
      // Foydalanuvchi orqaga qaytmasin — shu yerning o'zida tanlasin
      h += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">';
      tmpls.forEach(function (t) {
        h += '<button class="rc-tmpl-pick" data-tid="' + t.id + '" '
          + 'style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;'
          + 'padding:12px 14px;border:1.5px solid var(--brd);border-radius:14px;'
          + 'background:var(--sfc2);color:var(--txt);cursor:pointer;font-family:inherit">'
          + '<span style="font-size:18px">📋</span>'
          + '<span style="flex:1;min-width:0"><b style="font-size:13.5px">' + esc(t.name) + '</b>'
          + ((t.items && t.items.length) ? '<br><span style="font-size:11px;color:var(--mut)">' + t.items.length + ' ta bosqich</span>' : '')
          + '</span>'
          + '<i class="fas fa-chevron-right" style="color:var(--mut);font-size:12px"></i></button>';
      });
      h += '</div>';
    } else {
      h += '<div style="padding:12px 14px;background:var(--sfc2);border-radius:14px;'
        + 'font-size:13px;color:var(--txt);margin-bottom:16px;line-height:1.6">'
        + '⚠️ Sizda hali shablon yo‘q. <b>Sozlamalar → Etap shablonlari</b> bo‘limidan '
        + 'bittasini yaratib oling.</div>';
    }

    h += '<div style="height:1px;background:var(--brd);margin:4px 0 14px"></div>';
    h += RcOrders._tmplExplainHtml();

    RcSheet.open('Shablon kerak', h, {});
    setTimeout(function () {
      document.querySelectorAll('.rc-tmpl-pick').forEach(function (b) {
        b.onclick = function () {
          var sel = document.getElementById('rc-no-tmpl');
          // Tanlovni asosiy formaga qaytaramiz. RcSheet bitta oyna bilan
          // ishlagani uchun, tushuntirish yopilgach forma qayta ochiladi.
          RcOrders._pendingTmpl = b.dataset.tid;
          RcSheet.close();
          Toast.success('Shablon tanlandi — «Yaratish» tugmasini bosing');
          setTimeout(function () { RcOrders.showCreate(); }, 60);
        };
      });
    }, 0);
  },
};

window.RcOrders = RcOrders;
RC_PAGES['/orders'] = function () { RcOrders.render(); };
