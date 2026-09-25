/* client_erp/js/redesign/rc-clients.js — Redesign Mijozlar (page.clients) +
   Mijoz detali (page.client_detail). Ko'rinish qatlami yangi; WS/ma'lumot mavjud
   koddan (clients.js / client-detail.js) qayta ishlatiladi.

   Davr filtri (RcPeriod): default SHU OY. Backend page.clients davr QABUL QILMAYDI
   (har mijozda order_months[YYYY-MM] + last_order_at qaytaradi), shuning uchun filtr
   CLIENT-SIDE: "shu davrda buyurtma bergan" mijozlar order_months bo'yicha ajratiladi.
   Aniq oy dropdown'i barcha mijozlar order_months birlashmasidan quriladi. */
window.RC_PAGES = window.RC_PAGES || {};

/* Avatar rang paletkasi (id bo'yicha barqaror tanlanadi) */
var RC_CL_AVA = ['var(--acc)', 'var(--cyan)', 'var(--lav)', 'var(--pch)'];

/* ═══════════════════════════════════════════════════════════════════════
   MIJOZLAR RO'YXATI
   ═══════════════════════════════════════════════════════════════════════ */
var RcClients = {
  _st: null,       // RcPeriod holati {period, ym, date_from, date_to}
  _search: '',     // qidiruv matni (davr almashganda saqlanadi)

  _v: function (id) { var el = document.getElementById(id); return el ? (el.value || '') : ''; },

  render: function () {
    var app = document.getElementById('app');
    app.innerHTML = Skeleton.list(5);
    // 2026-08-26: standart "Shu oy" edi — bosh sahifadagi mijozlar soni
    // (barchasi, davrsiz) bilan mos kelmasdi (foydalanuvchi shikoyati:
    // bosh sahifada 46, bu yerda 3-4). Endi ochilganda "Hammasi" faol —
    // ikkalasi bir xil sonni ko'rsatadi. Davr tugmalari (Shu oy/O'tgan
    // oy/Yil) joyida, xohlasa qo'lda torList qiladi.
    RcClients._st = RcPeriod.init();
    RcClients._st.period = 'all';
    RcClients._search = '';
    RcClients._load();
  },

  // page.clients (davrsiz) — barcha mijozlar bir marta yuklanadi, keyin client-side filtr
  _load: function () {
    WS.send('page.clients', {}, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      STATE.clients = msg.data.clients || [];
      RcClients._paint();
    });
  },

  _paint: function () {
    var app = document.getElementById('app');
    app.innerHTML = RcClients.template();
    RcClients.bind();
  },

  // ── Davr yordamchilari ─────────────────────────────────────────────────
  _ym: function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); },

  // Aniq oy dropdown uchun: barcha mijozlar order_months birlashmasi {ym: count}
  _monthsObj: function (clients) {
    var mo = {};
    (clients || []).forEach(function (c) {
      (c.order_months || []).forEach(function (m) { mo[m] = (mo[m] || 0) + 1; });
    });
    return mo;
  },

  // 'YYYY-MM-DD'..'YYYY-MM-DD' → oralig'idagi ['YYYY-MM', ...] (inklyuziv)
  _monthRange: function (from, to) {
    var a = (from || '').slice(0, 7), b = (to || '').slice(0, 7);
    if (!a || !b) return [];
    if (a > b) { var x = a; a = b; b = x; }
    var p = a.split('-'), y = parseInt(p[0], 10), m = parseInt(p[1], 10), out = [], guard = 0;
    while (guard++ < 600) {
      var cur = y + '-' + ('0' + m).slice(-2);
      out.push(cur);
      if (cur === b) break;
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  },

  // "Shu davrda buyurtma bergan"mi? order_months (buyurtma yaratilgan oylar) bo'yicha
  _inPeriod: function (c, st) {
    if (!st || st.period === 'all') return true;
    // Buyurtma oylari + mijoz QO'SHILGAN oyi (buyurtmasiz yangi mijoz ham ko'rinsin).
    var months = (c.order_months || []).slice();
    if (c.created_month && months.indexOf(c.created_month) < 0) months.push(c.created_month);
    if (!months.length) return false;                    // sanasiz → davrga kirmaydi
    if (st.ym) return months.indexOf(st.ym) >= 0;        // aniq oy
    if (st.period === 'year') {
      var yr = String(new Date().getFullYear());
      return months.some(function (m) { return m.slice(0, 4) === yr; });
    }
    if (st.period === 'custom' && st.date_from && st.date_to) {
      var range = RcClients._monthRange(st.date_from, st.date_to);
      return months.some(function (m) { return range.indexOf(m) >= 0; });
    }
    // month (default = shu oy) yoki last_month (o'tgan oy)
    var d = new Date(); d.setDate(1);
    if (st.period === 'last_month') d.setMonth(d.getMonth() - 1);
    return months.indexOf(RcClients._ym(d)) >= 0;
  },

  _periodClients: function () {
    var st = RcClients._st;
    return (STATE.clients || []).filter(function (c) { return RcClients._inPeriod(c, st); });
  },

  template: function () {
    var all = STATE.clients || [];
    var clients = RcClients._periodClients();
    var months = RcClients._monthsObj(all);
    var h = '<div data-screen>';

    // Qidiruv + Qo'shish
    h += '<div style="display:flex;gap:10px;align-items:center">';
    h += '<div class="rc-search" style="flex:1">';
    h += '<i class="fas fa-search" style="color:var(--mut);font-size:13px"></i>';
    h += '<input id="rc-cl-search" placeholder="Mijoz qidirish..." value="' + Utils.esc(RcClients._search) + '">';
    h += '</div>';
    h += '<button class="rc-btn" id="rc-cl-add" style="width:44px;padding:0;flex:none;display:flex!important" title="Yangi mijoz qo\'shish"><i class="fas fa-plus"></i></button>';
    h += '</div>';

    // Professional davr filtri (default SHU OY) — "shu davrda buyurtma berganlar"
    h += RcPeriod.html(RcClients._st, months);

    // Sarhisob (davrga mos mijozlar soni)
    h += '<div style="display:flex;align-items:center;gap:8px;padding:0 2px">';
    h += '<span style="font-weight:800;font-size:15px">Mijozlarim</span>';
    h += '<span class="rc-chip">' + clients.length + '</span>';
    if (RcClients._st && (RcClients._st.ym || RcClients._st.period !== 'all')) {
      h += '<span style="font-size:11px;color:var(--mut)">· ' + RcPeriod.label(RcClients._st) + '</span>';
    }
    h += '</div>';

    // Ro'yxat
    h += '<div id="rc-cl-list" style="display:flex;flex-direction:column;gap:10px">';
    if (!all.length) {
      h += '<div class="rc-empty"><div class="rc-empty-ic">👥</div><div style="font-weight:700;color:var(--txt)">Hali mijoz yo\'q</div><div style="margin-top:4px">Birinchi mijozingizni qo\'shing</div></div>';
    } else if (!clients.length) {
      h += '<div class="rc-empty"><div class="rc-empty-ic">📅</div><div style="font-weight:700;color:var(--txt)">Bu davrda buyurtma bergan mijoz yo\'q</div><div style="margin-top:4px">Boshqa davrni yoki «Hammasi»ni tanlang</div></div>';
    } else {
      clients.forEach(function (c, i) { h += RcClients._card(c, i); });
      h += '<div id="rc-cl-noresult" class="rc-empty" style="display:none"><div class="rc-empty-ic">🔍</div><div>Hech narsa topilmadi</div></div>';
    }
    h += '</div>';

    h += '</div>';
    return h;
  },

  _card: function (c, i) {
    var esc = Utils.esc;
    var ava = RC_CL_AVA[(c.id || i) % RC_CL_AVA.length];
    var dly = Math.min((i || 0) * 0.04, 0.4);
    var hay = ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.address || '')).toLowerCase();

    var cnt = c.order_count
      ? '<span class="rc-chip-acc rc-chip" style="flex:none">📦 ' + c.order_count + '</span>'
      : '';

    var sub = '';
    if (c.phone) sub += '<span style="white-space:nowrap"><i class="fas fa-phone" style="font-size:9px"></i> ' + esc(c.phone) + '</span>';
    if (c.address) {
      if (sub) sub += '<span style="opacity:.4"> · </span>';
      sub += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><i class="fas fa-location-dot" style="font-size:9px"></i> ' + esc(c.address) + '</span>';
    }
    if (!sub) sub = '<span style="opacity:.6">Ma\'lumot yo\'q</span>';

    var call = c.phone
      ? '<a href="tel:' + esc(c.phone) + '" onclick="event.stopPropagation()" style="width:40px;height:40px;border-radius:14px;background:var(--acc);color:var(--acc-ink);display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:var(--glow);flex:none"><i class="fas fa-phone"></i></a>'
      : '';
    var del = '<button onclick="event.stopPropagation();RcClients._del(' + c.id + ')" class="rc-btn-ghost" style="width:40px;height:40px;padding:0;color:var(--danger);flex:none" title="O\'chirish"><i class="fas fa-trash"></i></button>';

    return '<div class="rc-card rc-cl-card" data-id="' + c.id + '" data-search="' + esc(hay) + '" ' +
      'onclick="Router.go(\'/clients/' + c.id + '\')" ' +
      'style="cursor:pointer;display:flex;align-items:center;gap:12px;animation:rc-screenin .38s cubic-bezier(.2,.8,.3,1) both;animation-delay:' + dly + 's">' +
      '<div class="rc-avatar" style="width:46px;height:46px;font-size:15px;background:' + ava + '">' + esc(Utils.initials(c.name)) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<span style="font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.name) + '</span>' + cnt +
        '</div>' +
        '<div style="font-size:11px;color:var(--mut);margin-top:3px;display:flex;align-items:center;gap:4px;min-width:0">' + sub + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex:none">' + call + del + '</div>' +
    '</div>';
  },

  bind: function () {
    // Tanishtiruv + izohlar (2026-08-06)
    if (window.RcTour && RcTour.auto) { try { RcTour.auto('clients'); } catch (e) {} }
    if (window.RcHint && RcHint.bind) { try { RcHint.bind(); } catch (e) {} }

    var add = document.getElementById('rc-cl-add');
    if (add) add.onclick = function () { RcClients._openAdd(); };
    var si = document.getElementById('rc-cl-search');
    if (si) si.oninput = Utils.debounce(RcClients._filter, 200);

    // Davr filtri (RcPeriod) → o'zgarsa client-side qayta chizish (WS reload YO'Q)
    RcPeriod.bind(document.getElementById('app'), RcClients._st, RcClients._monthsObj(STATE.clients), function () {
      RcClients._paint();
    });

    // Davr almashgach saqlangan qidiruvni qayta qo'llash
    if (RcClients._search) RcClients._filter();
  },

  _filter: function () {
    var si = document.getElementById('rc-cl-search');
    RcClients._search = si ? si.value : '';
    var q = RcClients._search.trim().toLowerCase();
    var shown = 0;
    document.querySelectorAll('.rc-cl-card').forEach(function (card) {
      var hay = card.getAttribute('data-search') || '';
      var ok = !q || hay.indexOf(q) >= 0;
      card.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    var nr = document.getElementById('rc-cl-noresult');
    if (nr) nr.style.display = shown ? 'none' : '';
  },

  _openAdd: function () {
    if (!(window.RcSheet && RcSheet.open)) { Toast.info('Tez orada'); return; }
    var fld = function (label, id, type, ph) {
      var cls = 'rc-input' + (type === 'tel' ? ' ce-phone-input' : '');
      var im = type === 'tel' ? ' inputmode="tel"' : '';
      return '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">' + label + '</div>' +
        '<input id="' + id + '" class="' + cls + '"' + im + ' type="' + (type || 'text') + '" placeholder="' + ph + '"></div>';
    };
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      fld('Ism *', 'rc-cl-name', 'text', 'Mijoz ismi') +
      fld('Telefon', 'rc-cl-phone', 'tel', '93 042 15 02') +
      fld('Manzil', 'rc-cl-addr', 'text', 'Manzil') +
      '<button class="rc-btn" id="rc-cl-save" style="width:100%;margin-top:4px"><i class="fas fa-check"></i> Saqlash</button>' +
    '</div>';
    RcSheet.open('Yangi mijoz', body, {});
    var nm = document.getElementById('rc-cl-name');
    if (nm) nm.focus();
    var btn = document.getElementById('rc-cl-save');
    if (btn) btn.onclick = function () {
      var name = RcClients._v('rc-cl-name').trim();
      if (!name) return Toast.error('Ism kiritilmagan');
      btn.disabled = true;
      WS.send('client.create', { name: name, phone: Utils.rawPhone(RcClients._v('rc-cl-phone')), address: RcClients._v('rc-cl-addr').trim() }, function (m) {
        if (!m.ok) { Toast.error(m.error || 'Xatolik'); btn.disabled = false; return; }
        if (RcSheet.close) RcSheet.close();
        Toast.success("Mijoz qo'shildi");
        // Yangi mijoz (hali buyurtmasiz) davr filtrida yashirinmasligi uchun «Hammasi»ga o'tamiz
        RcClients._st = { period: 'all', ym: null, date_from: null, date_to: null };
        RcClients._search = '';
        RcClients._load();
      });
    };
  },

  _del: function (id) {
    var c = null;
    if (STATE.clients) {
      for (var i = 0; i < STATE.clients.length; i++) {
        if (STATE.clients[i].id === parseInt(id, 10)) { c = STATE.clients[i]; break; }
      }
    }
    var name = c ? c.name : 'Mijoz';
    function doDel() {
      WS.send('client.delete', { id: parseInt(id, 10) }, function (m) {
        if (!m.ok) return Toast.error(m.error || 'Xatolik');
        if (STATE.clients) STATE.clients = STATE.clients.filter(function (x) { return x.id !== parseInt(id, 10); });
        var card = document.querySelector('.rc-cl-card[data-id="' + id + '"]');
        if (card) { card.style.transition = 'all .3s'; card.style.opacity = '0'; card.style.transform = 'translateX(24px)'; setTimeout(function () { card.remove(); }, 300); }
        Toast.success("Mijoz o'chirildi");
      });
    }
    if (window.RcSheet && RcSheet.open) {
      var body = '<div style="text-align:center;padding:6px 0 4px">' +
        '<div style="font-size:34px;margin-bottom:8px">🗑️</div>' +
        '<div style="font-weight:800;font-size:15px">' + Utils.esc(name) + '</div>' +
        '<div style="font-size:12px;color:var(--mut);margin:6px 0 16px">Bu mijozni o\'chirasizmi?</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="rc-btn-ghost" id="rc-cl-delno" style="flex:1">Bekor</button>' +
          '<button class="rc-btn rc-btn-danger" id="rc-cl-delyes" style="flex:1">O\'chirish</button>' +
        '</div></div>';
      RcSheet.open("O'chirish", body, {});
      var yes = document.getElementById('rc-cl-delyes'), no = document.getElementById('rc-cl-delno');
      if (yes) yes.onclick = function () { if (RcSheet.close) RcSheet.close(); doDel(); };
      if (no) no.onclick = function () { if (RcSheet.close) RcSheet.close(); };
    } else if (window.confirm("Bu mijozni o'chirasizmi?")) {
      doDel();
    }
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   MIJOZ DETALI
   ═══════════════════════════════════════════════════════════════════════ */
var RcClientDetail = {
  _customer: {},

  render: function (id) {
    var app = document.getElementById('app');
    app.innerHTML = Skeleton.list(3);
    WS.send('page.client_detail', { id: parseInt(id, 10) }, function (msg) {
      if (!msg.ok) {
        app.innerHTML = '<div data-screen><div class="rc-empty"><div class="rc-empty-ic">😕</div>' +
          '<div style="font-weight:700;color:var(--txt)">' + Utils.esc(msg.error || 'Xatolik') + '</div>' +
          '<div style="margin-top:12px"><button class="rc-btn-ghost rc-btn-sm" onclick="Router.go(\'/clients\')">← Mijozlar</button></div></div></div>';
        return;
      }
      RcClientDetail._customer = msg.data.customer || {};
      app.innerHTML = RcClientDetail.template(msg.data);
    });
  },

  template: function (d) {
    var esc = Utils.esc, money = Utils.money;
    var c = d.customer || {};
    var orders = d.orders || [];
    var stats = d.stats || { count: 0 };

    // Jami kirim — buyurtmalardan hisoblanadi (real ma'lumot)
    var income = 0;
    orders.forEach(function (o) { income += parseInt(o.total_income, 10) || 0; });

    var h = '<div data-screen>';

    // Mijoz kartasi
    h += '<div class="rc-card rc-card-lg" style="display:flex;align-items:center;gap:14px">';
    h += '<div class="rc-avatar" style="width:56px;height:56px;font-size:19px">' + esc(Utils.initials(c.name)) + '</div>';
    h += '<div style="flex:1;min-width:0">';
    h += '<div style="font-weight:800;font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.name) + '</div>';
    var meta = '';
    if (c.phone) meta += '<span style="white-space:nowrap"><i class="fas fa-phone" style="font-size:10px"></i> ' + esc(c.phone) + '</span>';
    if (c.address) meta += '<span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px"><i class="fas fa-location-dot" style="font-size:10px"></i> ' + esc(c.address) + '</span>';
    h += '<div style="font-size:12px;color:var(--mut);margin-top:6px">' + (meta || '<span style="opacity:.6">Ma\'lumot yo\'q</span>') + '</div>';
    h += '</div>';
    h += '<div style="display:flex;flex-direction:column;gap:8px;flex:none">';
    if (c.phone) h += '<a href="tel:' + esc(c.phone) + '" style="width:40px;height:40px;border-radius:14px;background:var(--acc);color:var(--acc-ink);display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:var(--glow)"><i class="fas fa-phone"></i></a>';
    h += '<button class="rc-btn-ghost" style="width:40px;height:40px;padding:0" onclick="RcClientDetail._openEdit()" title="Tahrirlash"><i class="fas fa-pen"></i></button>';
    h += '</div>';
    h += '</div>';

    // 2 rc-stat
    h += '<div class="rc-grid rc-grid-auto">';
    h += '<div class="rc-stat"><div class="rc-stat-label">Buyurtmalar</div><div class="rc-stat-val">' + (stats.count || orders.length) + '</div></div>';
    h += '<div class="rc-stat" style="animation-delay:.05s"><div class="rc-stat-label">Jami kirim</div><div class="rc-stat-val" style="color:var(--acc-text)">' + money(income) + '</div><div class="rc-stat-sub">so\'m</div></div>';
    h += '</div>';

    // Buyurtmalari
    h += '<div style="font-weight:800;font-size:15px;padding:0 2px;margin-top:2px">Buyurtmalari</div>';
    if (!orders.length) {
      h += '<div class="rc-empty"><div class="rc-empty-ic">📦</div><div>Bu mijozda buyurtma yo\'q</div></div>';
    } else {
      orders.forEach(function (o, i) { h += RcClientDetail._orderCard(o, i); });
    }

    h += '</div>';
    return h;
  },

  _orderCard: function (o, i) {
    var esc = Utils.esc, money = Utils.money;
    var st = RcStatus.badge(o.status);
    var pct = o.overall_progress || 0;
    var dly = Math.min((i || 0) * 0.04, 0.4);

    var mc = o.is_linked ? '<span class="rc-chip" style="flex:none">🏭 MebelCity</span>' : '';
    var inc = (parseInt(o.total_income, 10) || 0)
      ? '<span style="font-size:13px;font-weight:800">' + money(o.total_income) + ' so\'m</span>'
      : '';

    return '<div onclick="Router.go(\'/orders/' + o.id + '\')" class="rc-card" ' +
      'style="cursor:pointer;display:flex;flex-direction:column;gap:10px;animation:rc-screenin .38s cubic-bezier(.2,.8,.3,1) both;animation-delay:' + dly + 's">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
        '<div style="font-weight:700;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</div>' + st +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="rc-progress"><div class="rc-progress-fill" style="width:' + pct + '%"></div></div>' +
        '<span style="font-size:11px;font-weight:700;color:var(--mut)">' + pct + '%</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
        '<span style="font-size:11px;color:var(--mut)">🕒 ' + esc(Utils.timeAgo(o.created_at)) + '</span>' +
        '<span style="display:flex;align-items:center;gap:8px">' + mc + inc + '</span>' +
      '</div>' +
    '</div>';
  },

  _openEdit: function () {
    var c = RcClientDetail._customer || {};
    if (!(window.RcSheet && RcSheet.open)) { Toast.info('Tez orada'); return; }
    var fld = function (label, id, val, type, ph) {
      return '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">' + label + '</div>' +
        '<input id="' + id + '" class="rc-input" type="' + (type || 'text') + '" placeholder="' + ph + '" value="' + Utils.esc(val || '') + '"></div>';
    };
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      fld('Ism *', 'rc-ced-name', c.name, 'text', 'Mijoz ismi') +
      fld('Telefon', 'rc-ced-phone', c.phone, 'tel', '+998...') +
      '<button class="rc-btn" id="rc-ced-save" style="width:100%;margin-top:4px"><i class="fas fa-check"></i> Saqlash</button>' +
    '</div>';
    RcSheet.open('Mijozni tahrirlash', body, {});
    var btn = document.getElementById('rc-ced-save');
    if (btn) btn.onclick = function () {
      var name = ((document.getElementById('rc-ced-name') || {}).value || '').trim();
      var phone = ((document.getElementById('rc-ced-phone') || {}).value || '').trim();
      if (!name) return Toast.error('Ism kiritilmagan');
      btn.disabled = true;
      WS.send('client.update', { id: c.id, name: name, phone: phone }, function (m) {
        if (!m.ok) { Toast.error(m.error || 'Xatolik'); btn.disabled = false; return; }
        if (RcSheet.close) RcSheet.close();
        Toast.success('Saqlandi');
        RcClientDetail.render(c.id);
      });
    };
  },
};

window.RcClients = RcClients;
window.RcClientDetail = RcClientDetail;
RC_PAGES['/clients'] = RcClients.render;
RC_PAGES['/clients/:id'] = function (p) { RcClientDetail.render(p.id); };
