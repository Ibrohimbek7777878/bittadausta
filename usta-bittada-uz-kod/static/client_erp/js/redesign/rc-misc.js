/* client_erp/js/redesign/rc-misc.js — 5 ta ekran redesign reskini (BASIC).
   Ko'rinish qatlami yangi (rc-* dizayn tizimi). Ma'lumot/WS mavjud sahifalardan:
     RcMebelcity  → 'page.mebelcity'    (pages/mebelcity.js)
     RcVizual     → 'page.vizualizatsiya'(pages/vizualizatsiya.js) — pending repoll 5s
     RcZamers     → 'page.zamers'        (pages/zamers.js)
     RcOldiberdi  → 'page.oldi_berdi' + 'oldi_berdi.load_more' (pages/oldi-berdi.js)
     RcTeam       → 'page.team' + team.* (pages/team.js)
   Interaktiv amallar: RcSheet mavjud bo'lsa sheet, aks holda Toast.info('Tez orada').
   Iframe/tashqi oqimlar — mavjud URL'lar qayta ishlatiladi. */
window.RC_PAGES = window.RC_PAGES || {};

/* ── umumiy yordamchilar ── */
function rcProg(pct) {
  pct = Math.max(0, Math.min(100, parseInt(pct) || 0));
  return '<div style="display:flex;align-items:center;gap:8px">' +
    '<div class="rc-progress"><div class="rc-progress-fill" style="width:' + pct + '%"></div></div>' +
    '<span style="font-size:11px;font-weight:700;color:var(--mut);flex:none">' + pct + '%</span></div>';
}
function rcHeader(title, right) {
  return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
    '<div style="font-weight:800;font-size:18px">' + title + '</div>' + (right || '') + '</div>';
}
function rcEmpty(icon, title, sub) {
  return '<div class="rc-empty"><div class="rc-empty-ic">' + icon + '</div>' +
    '<div style="font-weight:800;font-size:15px;color:var(--txt)">' + title + '</div>' +
    (sub ? '<div style="margin-top:4px">' + sub + '</div>' : '') + '</div>';
}

/* ── RcFrame — to'liq ekran iframe overlay (rc tokenlar bilan) ── */
var RcFrame = {
  _onClose: null,
  open: function (url, title, onClose) {
    RcFrame._onClose = onClose || null;
    var ov = document.createElement('div');
    ov.className = 'rc-frame-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:300;background:var(--bg);display:flex;flex-direction:column';
    ov.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--brd);flex:none;background:var(--sfc)">' +
        '<button class="rc-btn-ghost" style="width:38px;height:38px;padding:0" id="rc-frame-back"><i class="fas fa-arrow-left"></i></button>' +
        '<div style="font-weight:800;font-size:15px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + Utils.esc(title || '') + '</div>' +
        '<button class="rc-btn-ghost" style="width:38px;height:38px;padding:0" id="rc-frame-close"><i class="fas fa-times"></i></button>' +
      '</div>' +
      '<div style="flex:1;position:relative;min-height:0">' +
        '<div id="rc-frame-load" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><div class="rc-skel" style="width:44px;height:44px;border-radius:50%"></div></div>' +
        // `allow="bluetooth"` — busiz iframe ichida `navigator.bluetooth`
        // butunlay bloklanadi va zamer redaktoridagi lazer ishlamaydi
        // (2026-08-15 topildi).
        '<iframe src="' + url + '" allow="bluetooth; serial; usb" ' +
        'style="width:100%;height:100%;border:0;position:relative" frameborder="0"></iframe>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.classList.add('modal-open');
    var iframe = ov.querySelector('iframe'), load = ov.querySelector('#rc-frame-load');
    iframe.onload = function () { if (load) load.style.display = 'none'; };
    function close() {
      ov.remove();
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', esc);
      var f = RcFrame._onClose; RcFrame._onClose = null;
      if (f) f();
    }
    ov.querySelector('#rc-frame-back').onclick = close;
    ov.querySelector('#rc-frame-close').onclick = close;
    var esc = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    return ov;
  }
};
window.RcFrame = RcFrame;

/* ═══════════════════════════════════════════════════════════════
   1) MebelCity buyurtmalar — 'page.mebelcity'
   ═══════════════════════════════════════════════════════════════ */
var RcMebelcity = {
  STATE_LABEL: { draft: 'Qoralama', pending: 'Kutilmoqda', in_progress: 'Jarayonda', done: 'Tugallangan', cancel: 'Bekor', completed: 'Tugallangan', cancelled: 'Bekor' },
  STATE_COLOR: { draft: 'var(--mut)', pending: 'var(--pch)', in_progress: 'var(--acc)', done: 'var(--ok)', cancel: 'var(--danger)', completed: 'var(--ok)', cancelled: 'var(--danger)' },
  DL_LABEL: { not_ready: 'Tayyor emas', ready: 'Ishlab chiqarish tayyor', packing: 'Qadoqlanmoqda', packed: 'Qadoqlangan', on_route: "Yo'lda", delivered: 'Yetkazildi', installed: 'Montaj qilindi', returned: 'Qaytarildi', on_hold: "To'xtatildi" },
  DL_COLOR: { ready: 'var(--cyan)', packing: 'var(--pch)', packed: 'var(--lav)', on_route: 'var(--pch)', delivered: 'var(--ok)', installed: 'var(--ok)', returned: 'var(--danger)', on_hold: 'var(--mut)' },

  _st: null,
  _months: null,
  // Holat-tab'lari — "Zakaz" sahifasidagi (RcOrders.TABS) uslubi bilan bir
  // xil: yuqorida bosiladigan tab'lar, har birida son (2026-08-28,
  // foydalanuvchi: shu ko'rinishda sanab tursin).
  _tab: 'all',
  _q: '',
  TABS: [
    { f: 'all', label: 'Hammasi' },
    { f: 'done', label: 'Tugallangan' },
    { f: 'cancel', label: 'Bekor' },
  ],

  render: function () {
    // 2026-08-25: Moliya sahifasidagi davr filtri (RcPeriod) TO'LIQ
    // ko'chirildi — bir xil PRESETS, bir xil «Aniq oy…» va «Davr» tanlovi.
    // Boshqa hech narsa o'zgartirilmadi.
    if (!RcMebelcity._st) RcMebelcity._st = RcPeriod.init();
    RcMebelcity._tab = 'all';
    RcMebelcity._q = '';
    RcMebelcity._reload();
  },

  // Ism/loyiha nomi/avtor/sana bo'yicha qidiruv — "Zakaz" sahifasidagi
  // RcOrders._normalize bilan bir xil kirill↔lotin naqsh (2026-08-28,
  // foydalanuvchi: shu qidiruv kerak).
  _filtered: function (orders) {
    var q = (RcMebelcity._q || '').trim();
    if (!q) return orders;
    var parts = RcOrders._normalize(q).split('|');
    return orders.filter(function (o) {
      var hay = RcOrders._normalize(
        (o.project_name || '') + ' ' + (o.partner_name || '') + ' ' +
        (o.owner_name || '') + ' ' + (o.created_at || '').slice(0, 10) +
        ' ' + (o.linked_order ? o.linked_order.title : '')
      );
      return parts.some(function (p) { return p && hay.indexOf(p) !== -1; });
    });
  },

  _reload: function () {
    var app = document.getElementById('app');
    app.innerHTML = Skeleton.list(4);
    WS.send('page.mebelcity', RcPeriod.query(RcMebelcity._st), function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      STATE.mcOrders = (msg.data && msg.data.orders) || [];
      RcMebelcity._months = (msg.data && msg.data.months) || {};
      app.innerHTML = RcMebelcity.template(STATE.mcOrders);
      RcMebelcity.bind();
    });
  },

  template: function (allOrders) {
    var h = '<div data-screen>';
    h += rcHeader('🏭 MebelCity buyurtmalar (' + allOrders.length + ')');
    h += RcPeriod.html(RcMebelcity._st, RcMebelcity._months);
    if (!allOrders.length) { h += rcEmpty('🏭', 'MebelCity buyurtmalari yo\'q'); return h + '</div>'; }

    // Holat-tab'lari — "Zakaz" sahifasidagi (RcOrders.TABS) bilan bir xil
    // uslub: Hammasi/Tugallangan/Bekor, har birida son (2026-08-28,
    // foydalanuvchi: shu ko'rinishda sanab tursin).
    var esc = Utils.esc;
    var counts = { all: allOrders.length, done: 0, cancel: 0 };
    allOrders.forEach(function (o) { if (counts[o.state] !== undefined) counts[o.state]++; });
    h += '<div class="rc-tabs" id="rc-mc-tabs">';
    RcMebelcity.TABS.forEach(function (t) {
      var active = (t.f === RcMebelcity._tab) ? ' active' : '';
      h += '<button class="rc-tab' + active + '" data-filter="' + t.f + '">' +
           esc(t.label) + ' <span style="opacity:.55">' + (counts[t.f] || 0) + '</span></button>';
    });
    h += '</div>';

    // Qidiruv — ism, loyiha nomi, avtor, sana bo'yicha (2026-08-28,
    // foydalanuvchi talabi).
    h += '<div class="rc-search" style="margin-top:4px"><i class="fas fa-search" style="color:var(--mut);font-size:13px"></i>' +
      '<input id="rc-mc-search" type="text" placeholder="Qidiruv (ism, loyiha, avtor, sana)..." autocomplete="off" value="' + esc(RcMebelcity._q) + '"></div>';

    var orders = RcMebelcity._tab === 'all' ? allOrders : allOrders.filter(function (o) { return o.state === RcMebelcity._tab; });
    orders = RcMebelcity._filtered(orders);

    // Ulangan/ulanmagan ajratib ko'rsatish — "Zakaz" sahifasidagi bilan mos
    // (2026-08-28 TZ). Ulangan bo'limda usta o'z zakazining nomi+statusi
    // ko'rinadi (MebelCity'ning o'z holati emas — ustaga o'z ishi muhimroq).
    var linked = orders.filter(function (o) { return o.is_linked; });
    var unlinked = orders.filter(function (o) { return !o.is_linked; });

    if (!orders.length) {
      var qq = (RcMebelcity._q || '').trim();
      h += rcEmpty('🔍', qq ? 'Topilmadi: "' + esc(qq) + '"' : 'Bu holatda buyurtma yo\'q');
      return h + '</div>';
    }

    if (linked.length) {
      h += '<div style="font-weight:800;font-size:15px;padding:6px 2px 4px">🔗 Ulangan (' + linked.length + ')</div>';
      linked.forEach(function (o) { h += RcMebelcity._card(o); });
    }
    if (unlinked.length) {
      h += '<div style="font-weight:800;font-size:15px;padding:10px 2px 4px">○ Ulanmagan (' + unlinked.length + ')</div>';
      h += '<div style="font-size:11px;color:var(--mut);padding:0 2px 6px">Bular hali sizning hech qaysi zakazingizga ulanmagan — "Zakaz" sahifasidan ulashingiz mumkin</div>';
      unlinked.forEach(function (o) { h += RcMebelcity._card(o); });
    }
    return h + '</div>';
  },

  _card: function (o) {
    var esc = Utils.esc, money = Utils.money;
    var st = o.state || 'pending';
    var stLabel = o.state_label || RcMebelcity.STATE_LABEL[st] || st;
    var stColor = RcMebelcity.STATE_COLOR[st] || 'var(--sfc2)';
    var steps = o.steps || [];
    var totalN = o.total_steps || 0, doneN = o.done_steps || 0;
    var hasSteps = steps.length > 0;
    var isDone = (st === 'done' || st === 'completed');
    var h = '<div class="rc-card mc-order-card" data-hash="' + esc(o.order_hash) + '" style="' + (hasSteps ? 'cursor:pointer;' : '') + 'display:flex;flex-direction:column;gap:11px;margin-bottom:12px;overflow:hidden">';

    // ── Sarlavha + BITTA badge (2026-08-25, soddalashtirish) ─────────────
    // Ilgari 2 ta badge (ishlab chiqarish holati + yetkazish holati) yonma-
    // yon turardi — ikkalasi ham «tayyor» degan ma'noni bersa ham chalkash
    // ko'rinardi. Endi: agar yetkazish holati bor bo'lsa — U aniqroq va
    // KEYINGI qadam, shuning uchun UNI ko'rsatamiz. Bo'lmasa — ishlab
    // chiqarish holati.
    h += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">';
    h += '<div style="min-width:0">';
    // Sarlavha — mijoz ismi (project_name) ASOSIY, hash EMAS ("0YM820" o'rniga
    // "Begzod aka" — usta uchun tanish). Firma nomi (Big One) pastda, kichik,
    // yaratgan xodim + manba (Bazis/qo'lda) bilan birga — barchasi aniq
    // ko'rinsin, lekin sarlavha sodda qolsin (2026-08-28, foydalanuvchi).
    var mcName = o.project_name || o.partner_name || ('Buyurtma #' + o.order_hash);
    h += '<div style="font-weight:800;font-size:15px;display:flex;align-items:center;gap:6px">' + (o.is_urgent ? '🔥' : '🏭') + ' ' + esc(mcName) + '</div>';
    var subMeta = [];
    if (o.partner_name) subMeta.push(esc(o.partner_name));
    if (o.owner_name) subMeta.push('👤 ' + esc(o.owner_name));
    if (o.source_label) subMeta.push(esc(o.source_label));
    if (subMeta.length) h += '<div style="font-size:11px;color:var(--mut);margin-top:2px">' + subMeta.join(' · ') + '</div>';
    // Ulangan bo'lsa — usta o'z zakazining nomi + STATUSI (Zakaz sahifasidagi
    // bilan bir xil rang/label — RcStatus.badge), MebelCity holati emas.
    if (o.is_linked && o.linked_order) {
      h += '<div style="font-size:11px;color:var(--acc-text);margin-top:3px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">';
      h += '<span>🔗 ' + esc(o.linked_order.title || '') + '</span>';
      if (window.RcStatus && o.linked_order.status) h += RcStatus.badge(o.linked_order.status);
      h += '</div>';
    }
    h += '</div>';
    var hasDelivery = o.delivery_state && o.delivery_state !== 'not_ready';
    var badgeLabel, badgeColor;
    if (hasDelivery) {
      badgeLabel = '🚚 ' + (o.delivery_label || RcMebelcity.DL_LABEL[o.delivery_state] || o.delivery_state);
      badgeColor = RcMebelcity.DL_COLOR[o.delivery_state] || 'var(--mut)';
    } else {
      badgeLabel = stLabel;
      badgeColor = stColor;
    }
    h += '<span class="rc-badge" style="background:' + badgeColor + ';color:var(--acc-ink);flex:none">' + esc(badgeLabel) + '</span>';
    h += '</div>';

    // ── Bekor qilindi — alohida qizil ogohlantirish (2026-09-02 TZ) ──────
    // Faqat 2026-09-01dan keyingi zakazlar uchun: MebelCity'da bekor
    // qilingan bo'lsa, usta buni bitta rangli belgidan emas, katta va aniq
    // ko'rsin — puli/mahsuloti bo'yicha adashmasin.
    if (o.is_new_scope && st === 'cancel') {
      h += '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--danger) 15%,transparent);border:1px solid var(--danger)">' +
        '<span style="font-size:18px">🚫</span>' +
        '<span style="font-size:13px;font-weight:800;color:var(--danger)">Bu buyurtma bekor qilindi</span></div>';
    }

    // ── "Ehtimol shu buyurtmangiz?" taklif (2026-09-02 TZ) ───────────────
    // Faqat 2026-09-01dan keyingi, hali ulanmagan buyurtmalar uchun: telefon
    // yoki ism mos kelmagani uchun avtomatik ulanmagan, lekin shu MebelCity
    // xodimi yaratgan boshqa buyurtma allaqachon ustaning bir zakaziga
    // ulangan bo'lsa — o'sha zakazni taklif qilamiz. Usta faqat "Ha, bu
    // meniki" tugmasini bosadi — tizim hech qachon o'zi ulamaydi.
    if (o.is_new_scope && !o.is_linked && o.suggested_link) {
      h += '<div style="display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:var(--radius-sm);background:var(--sfc2);border:1px dashed var(--acc-text)">' +
        '<div style="font-size:13px;font-weight:700;color:var(--txt)">⭐ Bu sizning "' + esc(o.suggested_link.title || '') + '" zakazingiz bo\'lishi mumkin</div>' +
        '<button class="rc-btn rc-btn-sm" style="width:100%" onclick="event.stopPropagation();RcMebelcity.confirmSuggestion(' + o.id + ')">' +
        '<i class="fas fa-check"></i> Ha, bu meniki</button></div>';
    }

    if (o.total_sum) h += '<div style="font-size:16px;font-weight:800;color:var(--acc-text)">' + money(o.total_sum) + ' so\'m</div>';

    // ── Progress: tugagan bo'lsa sodda «Tayyor», bo'lmasa foiz + bosqich ──
    // Raqamlar (masalan «7/7») OLIB TASHLANDI — holat o'zi yetarli.
    if (totalN) {
      h += '<div>';
      if (isDone || doneN >= totalN) {
        h += '<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#16a34a;font-weight:700">'
          + '<i class="fas fa-check-circle"></i> Ishlab chiqarish tayyor</div>';
      } else {
        h += '<div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--mut);margin-bottom:5px;gap:8px">';
        h += '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (o.current_step ? '🏭 Hozir: <b style="color:var(--txt)">' + esc(o.current_step) + '</b>' : 'Ishlab chiqarish') + '</span>';
        h += '<span style="flex:none">' + (o.progress || 0) + '%</span></div>';
        h += rcProg(o.progress || 0);
      }
      h += '</div>';
    }

    // ── Ishlab chiqarish bosqichlari (yashirin, bosilganda ochiladi) ──
    if (hasSteps) {
      h += '<div class="mc-steps" style="display:none;background:var(--sfc2);border-radius:var(--radius-sm);padding:13px 15px">';
      h += '<div style="font-size:10px;font-weight:700;color:var(--mut);letter-spacing:.05em;margin-bottom:12px">🏭 ISHLAB CHIQARISH BOSQICHLARI</div>';
      steps.forEach(function (s, i) {
        var last = i === steps.length - 1;
        var dotBg = s.done ? '#16a34a' : (s.active ? 'var(--acc)' : 'var(--bg2)');
        var dotBd = s.done ? '#16a34a' : (s.active ? 'var(--acc)' : 'var(--brd2)');
        var ico = s.done ? '<span style="color:#fff;font-size:11px;font-weight:800">✓</span>'
          : (s.active ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--acc-ink)"></span>' : '');
        var nmClr = s.active ? 'var(--acc-text)' : (s.done ? 'var(--txt)' : 'var(--mut)');
        var subTxt = s.done ? 'Tugallandi' : (s.active ? 'Jarayonda…' : 'Kutilmoqda');
        var subClr = s.done ? '#16a34a' : (s.active ? 'var(--acc-text)' : 'var(--mut)');
        var cnt = s.count > 1 ? ' <span style="font-size:10px;color:var(--mut);font-weight:600">(' + s.done_count + '/' + s.count + ')</span>' : '';
        h += '<div style="position:relative;display:flex;gap:12px;padding-bottom:' + (last ? '0' : '15px') + '">';
        if (!last) h += '<div style="position:absolute;left:12px;top:27px;bottom:0;width:2px;background:' + (s.done ? '#16a34a' : 'var(--brd)') + '"></div>';
        h += '<div style="width:26px;height:26px;min-width:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:' + dotBg + ';border:2px solid ' + dotBd + ';z-index:1' + (s.active ? ';box-shadow:0 0 0 4px color-mix(in srgb,var(--acc) 25%,transparent)' : '') + '">' + ico + '</div>';
        h += '<div style="flex:1;min-width:0;padding-top:3px">';
        h += '<div style="font-size:13px;font-weight:' + (s.active ? '800' : '600') + ';color:' + nmClr + '">' + esc(s.name) + cnt + '</div>';
        h += '<div style="font-size:11px;color:' + subClr + '">' + subTxt + '</div>';
        h += '</div></div>';
      });
      h += '</div>';
    }

    // ── Chek mahsulotlari — YIG'ILGAN qator, bosilganda batafsil ochiladi ──
    // (2026-08-25, soddalashtirish: 8 qatorlik texnik ro'yxat o'rniga
    // «N ta mahsulot — summasi», tafsilot yashirin bo'ladi)
    if (o.sale_brief && ((o.sale_brief.lines && o.sale_brief.lines.length) || (o.sale_brief.services && o.sale_brief.services.length))) {
      var sb = o.sale_brief;
      var _lines = sb.lines || [], _services = sb.services || [];
      var _itemCount = _lines.length + _services.length;
      var _nch = (sb.sale_ids && sb.sale_ids.length) || 1;
      h += '<div class="mc-items-toggle" style="display:flex;align-items:center;justify-content:space-between;gap:8px;'
        + 'background:var(--sfc2);border-radius:var(--radius-sm);padding:10px 12px;cursor:pointer">';
      h += '<span style="font-size:12px;font-weight:600;color:var(--txt)"><i class="fas fa-receipt" style="opacity:.6;margin-right:4px"></i>'
        + _itemCount + ' ta mahsulot/xizmat'
        + (_nch > 1 ? ' <span style="color:var(--pch);font-size:10.5px">· ' + _nch + ' ta chek</span>' : '') + '</span>';
      h += '<span style="display:flex;align-items:center;gap:6px;flex:none">'
        + '<b style="font-size:12px;color:var(--acc-text)">' + (o.total_sum ? money(o.total_sum) : '') + '</b>'
        + '<i class="fas fa-chevron-down mc-items-arr" style="font-size:9px;color:var(--mut)"></i></span>';
      h += '</div>';

      h += '<div class="mc-items-body" style="display:none;background:var(--sfc2);border-radius:var(--radius-sm);padding:10px;margin-top:-4px">';
      _lines.forEach(function (l) {
        h += '<div style="display:flex;gap:6px;font-size:11px;padding:2px 0"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(l.name) + '</span>' +
          '<span style="color:var(--mut);white-space:nowrap;font-size:10px">' + (l.price ? Math.round(l.price).toLocaleString('ru-RU') : '') + '</span>' +
          '<span style="font-weight:700;color:var(--acc-text);white-space:nowrap">' + Math.ceil(l.qty) + ' ' + esc(l.unit) + '</span>' +
          '<span style="color:var(--pch);white-space:nowrap;font-weight:700;font-size:10px">' + (l.total ? Math.round(l.total).toLocaleString('ru-RU') : '') + '</span></div>';
      });
      _services.forEach(function (s) {
        h += '<div style="display:flex;gap:6px;font-size:11px;padding:2px 0"><span style="flex:1;min-width:0;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><i class="fas fa-wrench" style="font-size:8px;opacity:.6"></i> ' + esc(s.name) + '</span>' +
          '<span style="color:var(--mut);white-space:nowrap;font-size:10px">' + (s.price ? Math.round(s.price).toLocaleString('ru-RU') : '') + '</span>' +
          '<span style="font-weight:600;color:var(--pch);white-space:nowrap">' + Math.ceil(s.qty) + ' ' + esc(s.unit) + '</span>' +
          '<span style="color:var(--pch);white-space:nowrap;font-weight:700;font-size:10px">' + (s.total ? Math.round(s.total).toLocaleString('ru-RU') : '') + '</span></div>';
      });
      h += '</div>';
    }

    // ── Fayllar — YIG'ILGAN, bosilganda ro'yxat ochiladi ──────────────────
    if (o.files_info && o.files_info.length) {
      h += '<div class="mc-files-toggle" style="display:flex;align-items:center;gap:8px;cursor:pointer">'
        + '<span class="rc-chip"><i class="fas fa-paperclip" style="font-size:9px"></i> '
        + o.files_info.length + ' ta fayl <i class="fas fa-chevron-down mc-files-arr" style="font-size:8px;margin-left:2px;opacity:.6"></i></span></div>';
      h += '<div class="mc-files-body" style="display:none;flex-wrap:wrap;gap:5px">';
      o.files_info.forEach(function (f) {
        var qtyBadge = (f.ext === 'gibcut' && f.qty) ? ' · ' + f.qty + ' list' : '';
        h += '<span class="rc-chip"><i class="fas fa-file-alt" style="font-size:8px"></i> ' + esc(f.name) + qtyBadge + '</span>';
      });
      h += '</div>';
    }

    var meta = [];
    if (o.deadline) meta.push('📅 ' + Utils.date(o.deadline));
    if (o.created_at) meta.push(Utils.timeAgo(o.created_at));
    if (meta.length) h += '<div style="font-size:11px;color:var(--mut)">' + meta.join(' · ') + '</div>';

    // Bosqichlarni ochish/yopish (iframe emas — inline timeline, tez/yengil)
    if (hasSteps) {
      h += '<div class="mc-expand" style="text-align:center;font-size:12px;font-weight:700;color:var(--acc-text);border-top:1px solid var(--brd);padding-top:10px;margin-top:1px"><i class="fas fa-chevron-down" style="font-size:10px"></i> Bosqichlarni ko\'rish</div>';
    }

    // To'liq ko'rish — MebelCity'ning O'Z (katta ERP) jamoat kuzatuv
    // sahifasiga (login talab qilmaydi) to'g'ridan-to'g'ri o'tkazadi
    // (2026-08-28, foydalanuvchi: "katta ERPga o'tkazib yuborish kere").
    // Iframe EMAS — oddiy sahifa-almashtirish, brauzerning o'z "Orqaga"
    // tugmasi bilan Bittada Ustaga qaytadi (qo'shimcha kod shart emas).
    h += '<a class="rc-btn-ghost rc-btn-sm" style="width:100%;margin-top:6px;display:block;text-align:center;text-decoration:none" href="https://mebelcity.bittada.uz/order/' + esc(o.order_hash) + '/" onclick="event.stopPropagation()">' +
      '<i class="fas fa-external-link-alt"></i> To\'liq ko\'rish</a>';

    // Ulash/Uzish tugmasi — shu sahifadan ham amal qilish mumkin bo'lsin
    // (2026-08-28, foydalanuvchi: "#/mebelcity"da ham ulash/uzish menyu
    // chiqishi kerak). Karta bosilib bosqichlar ochilib ketmasin —
    // stopPropagation.
    h += '<button class="rc-btn-ghost rc-btn-sm" style="width:100%" onclick="event.stopPropagation();RcMebelcity.linkMenu(' + o.id + ')">' +
      (o.is_linked ? '<i class="fas fa-unlink"></i> Uzish / boshqasiga ulash' : '<i class="fas fa-link"></i> Zakazga ulash') + '</button>';

    return h + '</div>';
  },

  bind: function () {
    // Tanishtiruv + izohlar (2026-08-06)
    if (window.RcTour && RcTour.auto) { try { RcTour.auto('mebelcity'); } catch (e) {} }
    if (window.RcHint && RcHint.bind) { try { RcHint.bind(); } catch (e) {} }
    // Professional davr filtri (RcPeriod) → o'zgarsa qayta yuklash
    // (2026-08-25, Moliya sahifasidagi bilan bir xil naqsh)
    RcPeriod.bind(document.getElementById('app'), RcMebelcity._st, RcMebelcity._months, function () {
      RcMebelcity._reload();
    });
    // Holat-tab'lari — bosilsa qayta serverga so'rov yubormasdan, mavjud
    // STATE.mcOrders'ni qayta chizadi (tez, "Zakaz" sahifasidagi kabi).
    var tabsEl = document.getElementById('rc-mc-tabs');
    if (tabsEl) {
      tabsEl.querySelectorAll('.rc-tab').forEach(function (btn) {
        btn.onclick = function () {
          RcMebelcity._tab = btn.dataset.filter;
          var app = document.getElementById('app');
          app.innerHTML = RcMebelcity.template(STATE.mcOrders || []);
          RcMebelcity.bind();
        };
      });
    }
    // Qidiruv — debounce bilan, fokus yo'qolmasin deb butun ekranni qayta
    // chizmasdan faqat kerakli qismini yangilashning o'rniga (bu sahifa
    // ancha murakkab — ulangan/ulanmagan bo'limlar), oddiy re-render
    // qulaylik uchun yetarli (2026-08-28, foydalanuvchi talabi).
    var mcSearch = document.getElementById('rc-mc-search');
    if (mcSearch) {
      mcSearch.focus();
      var _val = mcSearch.value;
      mcSearch.setSelectionRange(_val.length, _val.length);
      var mcDeb;
      mcSearch.oninput = function () {
        var v = mcSearch.value;
        clearTimeout(mcDeb);
        mcDeb = setTimeout(function () {
          RcMebelcity._q = v;
          var app = document.getElementById('app');
          app.innerHTML = RcMebelcity.template(STATE.mcOrders || []);
          RcMebelcity.bind();
        }, 200);
      };
    }
    document.querySelectorAll('.mc-order-card').forEach(function (card) {
      card.onclick = function () {
        var steps = card.querySelector('.mc-steps');
        var hint = card.querySelector('.mc-expand');
        if (!steps) return;
        var open = steps.style.display !== 'none';
        steps.style.display = open ? 'none' : 'block';
        if (hint) hint.innerHTML = open
          ? '<i class="fas fa-chevron-down" style="font-size:10px"></i> Bosqichlarni ko\'rish'
          : '<i class="fas fa-chevron-up" style="font-size:10px"></i> Yopish';
      };
      // ── 2026-08-25: soddalashtirilgan «N ta mahsulot» va «N ta fayl»
      // qatorlari o'z ichida bosiladi — butun kartochkani (bosqichlar)
      // OCHIB YUBORMASLIGI uchun stopPropagation shart.
      var itemsTgl = card.querySelector('.mc-items-toggle');
      if (itemsTgl) {
        itemsTgl.onclick = function (e) {
          e.stopPropagation();
          var body = card.querySelector('.mc-items-body');
          var arr = card.querySelector('.mc-items-arr');
          if (!body) return;
          var open = body.style.display !== 'none';
          body.style.display = open ? 'none' : 'block';
          if (arr) arr.className = 'fas ' + (open ? 'fa-chevron-down' : 'fa-chevron-up') + ' mc-items-arr';
        };
      }
      var filesTgl = card.querySelector('.mc-files-toggle');
      if (filesTgl) {
        filesTgl.onclick = function (e) {
          e.stopPropagation();
          var body = card.querySelector('.mc-files-body');
          var arr = card.querySelector('.mc-files-arr');
          if (!body) return;
          var open = body.style.display !== 'none';
          body.style.display = open ? 'none' : 'flex';
          if (arr) arr.className = 'fas ' + (open ? 'fa-chevron-down' : 'fa-chevron-up') + ' mc-files-arr';
        };
      }
    });
  },

  // To'liq MebelCity bosqichlar ko'rinishi — WS 'mebelcity_order_detail'
  // orqali (usta.bittada.uz ICHIDA, tashqi domenga chiqmasdan — sabab
  // yuqorida, 2026-08-28). Screenshot'dagi katta ERP sahifasiga o'xshash:
  // har bosqich nomi, holati, boshlangan/tugagan sana, ishchi ismi.
  showDetail: function (mcId) {
    var body = '<div style="text-align:center;padding:24px"><div class="rc-skel" style="width:36px;height:36px;border-radius:50%;margin:0 auto"></div></div>';
    RcSheet.open('🏭 MebelCity buyurtma', body, {});
    WS.send('mebelcity_order_detail', { id: mcId }, function (msg) {
      var wrap = document.querySelector('.rc-sheet-body') || document.querySelector('.rc-sheet');
      if (!msg.ok || !msg.data) {
        if (wrap) wrap.innerHTML = '<div style="text-align:center;padding:20px;color:var(--mut)">' + (msg.error || 'Xatolik') + '</div>';
        return;
      }
      var d = msg.data, esc = Utils.esc;
      var h = '<div style="font-weight:800;font-size:15px">' + esc(d.project_name || d.partner_name || '') + '</div>';
      h += '<div style="font-size:12px;color:var(--mut);margin-top:2px">' + esc(d.state_label || '') + '</div>';
      if (d.deadline) h += '<div style="font-size:12px;color:var(--mut);margin-top:6px">🏁 Muddat: ' + Utils.date(d.deadline) + '</div>';

      var steps = d.steps || [];
      var doneN = steps.filter(function (s) { return s.state === 'done'; }).length;
      var pct = steps.length ? Math.round(doneN * 100 / steps.length) : 0;
      if (steps.length) {
        // Progress-bar to'ldirilishi animatsiyalangan (rc-bargrowx — loyihada
        // mavjud, chapdan o'ngga o'sadi).
        h += '<div style="display:flex;align-items:center;gap:8px;margin-top:12px">' +
          '<div class="rc-progress"><div class="rc-progress-fill" style="width:' + pct + '%;transform-origin:left;animation:rc-bargrowx .6s cubic-bezier(.2,.8,.3,1) backwards"></div></div>' +
          '<span style="font-size:11px;font-weight:700;color:var(--mut);flex:none">' + pct + '%</span></div>';
      }

      // Vertikal timeline — mc-steps (ilova ichidagi "Bosqichlarni ko'rish")
      // bilan bir xil uslub: nuqta+chiziq, tugagan=yashil ✓, joriy=lime halqa.
      // Har qator ketma-ket paydo bo'ladi (rc-screenin + delay), joriy
      // bosqich nuqtasi sekin pulsatsiya qiladi (rc-pulse) — 2026-08-28,
      // foydalanuvchi: animatsiya qo'sh.
      h += '<div style="background:var(--sfc2);border-radius:var(--radius-sm);padding:13px 15px;margin-top:12px">';
      steps.forEach(function (s, i) {
        var last = i === steps.length - 1;
        var done = s.state === 'done';
        var active = s.state === 'in_progress' || s.state === 'check' || s.state === 'fix';
        var dotBg = done ? '#16a34a' : (active ? 'var(--acc)' : 'var(--bg2)');
        var dotBd = done ? '#16a34a' : (active ? 'var(--acc)' : 'var(--brd2)');
        var ico = done ? '<span style="color:#fff;font-size:11px;font-weight:800">✓</span>'
          : (active ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--acc-ink);animation:rc-pulse 1.4s ease-in-out infinite"></span>' : '');
        var nmClr = active ? 'var(--acc-text)' : (done ? 'var(--txt)' : 'var(--mut)');
        var subClr = done ? '#16a34a' : (active ? 'var(--acc-text)' : 'var(--mut)');
        var dly = Math.min(i, 10) * 0.05;
        h += '<div style="position:relative;display:flex;gap:12px;padding-bottom:' + (last ? '0' : '15px') + ';animation:rc-screenin .32s cubic-bezier(.2,.8,.3,1) backwards;animation-delay:' + dly + 's">';
        if (!last) h += '<div style="position:absolute;left:12px;top:27px;bottom:0;width:2px;background:' + (done ? '#16a34a' : 'var(--brd)') + '"></div>';
        h += '<div style="width:26px;height:26px;min-width:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:' + dotBg + ';border:2px solid ' + dotBd + ';z-index:1' + (active ? ';box-shadow:0 0 0 4px color-mix(in srgb,var(--acc) 25%,transparent)' : '') + '">' + ico + '</div>';
        h += '<div style="flex:1;min-width:0;padding-top:3px">';
        h += '<div style="font-size:13px;font-weight:' + (active ? '800' : '600') + ';color:' + nmClr + '">' + esc(s.name) + '</div>';
        h += '<div style="font-size:11px;color:' + subClr + '">' + esc(s.state_label) + '</div>';
        var meta = [];
        if (s.worker_name) meta.push('👤 ' + esc(s.worker_name));
        if (s.start_date) meta.push('📅 ' + Utils.date(s.start_date));
        if (s.end_date) meta.push('✅ ' + Utils.date(s.end_date));
        if (meta.length) h += '<div style="font-size:10px;color:var(--mut);margin-top:2px">' + meta.join(' · ') + '</div>';
        h += '</div></div>';
      });
      if (!steps.length) h += '<div style="text-align:center;padding:12px;color:var(--mut);font-size:12px">Bosqichlar yo\'q</div>';
      h += '</div>';
      if ((d.files_info || []).length) {
        h += '<div style="font-size:11px;font-weight:700;color:var(--mut);margin-top:14px;margin-bottom:6px">📎 FAYLLAR (' + d.files_info.length + ')</div>';
        h += '<div style="display:flex;flex-wrap:wrap;gap:5px">';
        d.files_info.forEach(function (f) { h += '<span class="rc-chip">' + esc(f.name || 'Fayl') + '</span>'; });
        h += '</div>';
      }
      if (wrap) wrap.innerHTML = h;
    });
  },

  // "#/mebelcity" sahifasidan bevosita ulash/uzish (2026-08-28, foydalanuvchi
  // talabi: bu sahifada ham menyu bo'lishi kerak). Ulangan bo'lsa — Uzish/
  // Boshqasiga ulash; ulanmagan bo'lsa — qaysi zakazga ulaymiz, deb so'raydi.
  // RcOrders'dagi bilan bir xil sodda ko'rinish (faqat ism+sana, "Tavsiya").
  linkMenu: function (mcId) {
    var mo = (STATE.mcOrders || []).filter(function (m) { return m.id === mcId; })[0];
    if (!mo) return;
    var esc = Utils.esc;
    if (mo.is_linked && mo.linked_order) {
      var body = '<div style="font-size:14px;font-weight:700;margin-bottom:16px">🔗 ' + esc(mo.linked_order.title || '') + '</div>';
      body += '<div style="display:flex;flex-direction:column;gap:10px">';
      body += '<button class="rc-btn-ghost" id="rc-mc-swap" style="width:100%;padding:14px;font-size:15px"><i class="fas fa-exchange-alt"></i> Boshqasiga ulash</button>';
      body += '<button class="rc-btn-ghost" id="rc-mc-unlink" style="width:100%;padding:14px;font-size:15px;color:var(--danger)"><i class="fas fa-unlink"></i> Uzish</button>';
      body += '</div>';
      RcSheet.open('🔗 MebelCity bilan bog\'lanish', body, {});
      document.getElementById('rc-mc-unlink').onclick = function () {
        WS.send('order_link_mebelcity', { order_id: mo.linked_order.id, mebelcity_order_id: null }, function (msg) {
          if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
          RcSheet.close();
          Toast.success('Uzildi');
          RcMebelcity._reload();
        });
      };
      document.getElementById('rc-mc-swap').onclick = function () {
        RcSheet.close();
        RcMebelcity._pickOrderForMc(mo);
      };
    } else {
      RcMebelcity._pickOrderForMc(mo);
    }
  },

  // "Ha, bu meniki" tugmasi — taklif qilingan ClientOrder'ga bitta bosishda
  // ulaydi (2026-09-02 TZ). Mavjud 'order_link_mebelcity' WS action — qo'lda
  // ulash bilan bir xil yo'l, faqat usta oldindan qidirmasdan tasdiqlaydi.
  confirmSuggestion: function (mcId) {
    var mo = (STATE.mcOrders || []).filter(function (m) { return m.id === mcId; })[0];
    if (!mo || !mo.suggested_link) return;
    WS.send('order_link_mebelcity', { order_id: mo.suggested_link.id, mebelcity_order_id: mo.id }, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      Toast.success('Ulandi');
      RcMebelcity._reload();
    });
  },

  _pickOrderForMc: function (mo) {
    var esc = Utils.esc;
    var candidates = (STATE.orders || []).filter(function (o) { return o.status !== 'delivered' && o.status !== 'cancelled'; });
    var scored = candidates.map(function (o) {
      return { o: o, score: (window.RcOrders ? RcOrders._nameScore(mo.project_name || mo.partner_name || '', o.title || '') : 0) };
    }).sort(function (a, b) { return b.score - a.score; });
    var moName = mo.project_name || mo.partner_name || ('Buyurtma #' + mo.order_hash);
    var body = '<div style="font-size:14px;font-weight:700;margin-bottom:12px">🏭 ' + esc(moName) + '</div>';
    body += '<div style="display:flex;flex-direction:column;gap:8px;max-height:380px;overflow-y:auto" id="rc-mc-pick-list">';
    if (!scored.length) {
      body += '<div style="text-align:center;padding:16px;color:var(--mut);font-size:13px">Zakaz topilmadi</div>';
    }
    scored.forEach(function (s) {
      var suggested = s.score >= 0.35;
      body += '<div class="rc-mc-pick-item" data-id="' + s.o.id + '" style="padding:14px;border:2px solid ' + (suggested ? 'var(--acc-text)' : 'var(--brd)') + ';border-radius:var(--radius-sm);cursor:pointer;background:var(--sfc2)">';
      body += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">';
      body += '<span style="font-size:15px;font-weight:700">' + esc(s.o.title) + '</span>';
      if (suggested) body += '<span style="font-size:11px;padding:2px 8px;border-radius:5px;background:var(--acc);color:var(--acc-ink);font-weight:700">Tavsiya</span>';
      body += '</div></div>';
    });
    body += '</div>';
    RcSheet.open('🔗 Qaysi zakazga ulaymiz?', body, {});
    document.querySelectorAll('#rc-mc-pick-list .rc-mc-pick-item').forEach(function (el) {
      el.onclick = function () {
        var orderId = parseInt(el.dataset.id);
        WS.send('order_link_mebelcity', { order_id: orderId, mebelcity_order_id: mo.id }, function (msg) {
          if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
          RcSheet.close();
          Toast.success('Ulandi');
          RcMebelcity._reload();
        });
      };
    });
  },

};
window.RcMebelcity = RcMebelcity;
RC_PAGES['/mebelcity'] = function () { RcMebelcity.render(); };

/* ═══════════════════════════════════════════════════════════════
   2) Vizualizatsiya — 'page.vizualizatsiya' (pending repoll 5s)
   ═══════════════════════════════════════════════════════════════ */
var RcVizual = {
  _galleries: [],
  _pollTimer: null,

  render: function () {
    RcVizual._stopPoll();
    document.getElementById('app').innerHTML = Skeleton.list(3);
    RcVizual._load();
  },

  _load: function () {
    WS.send('page.vizualizatsiya', {}, function (msg) {
      if (STATE.currentPage !== '/vizualizatsiya') return;
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      RcVizual._galleries = (msg.data && msg.data.galleries) || [];
      document.getElementById('app').innerHTML = RcVizual.template(RcVizual._galleries);
      RcVizual.bind();
      RcVizual._scheduleRepoll();
    });
  },

  _scheduleRepoll: function () {
    RcVizual._stopPoll();
    var pending = RcVizual._galleries.some(function (g) { return g.pending; });
    if (!pending) return;
    RcVizual._pollTimer = setTimeout(function () {
      if (STATE.currentPage !== '/vizualizatsiya') return;
      RcVizual._load();
    }, 5000);
  },
  _stopPoll: function () { if (RcVizual._pollTimer) { clearTimeout(RcVizual._pollTimer); RcVizual._pollTimer = null; } },

  template: function (galleries) {
    var esc = Utils.esc;
    var h = '<div data-screen>';
    // 2026-09-04: "Havola qo'sh" tugmasi — tashqi VR sayt (ShapeSpark va h.k.)
    // linkini fayl yuklamasdan qo'shish uchun, mavjud "Yuklash" tugmasi yonida.
    h += rcHeader('🌐 Vizualizatsiya', '<div style="display:flex;gap:6px;flex:none">' +
      '<button class="rc-btn-ghost rc-btn-sm" id="vz-link-btn"><i class="fas fa-link"></i> Havola</button>' +
      '<button class="rc-btn rc-btn-sm" id="vz-upload-btn"><i class="fas fa-plus"></i> Yuklash</button></div>');
    if (!galleries.length) { h += rcEmpty('🌐', '360° panoramalar hali yo\'q', 'Yuklash uchun yuqoridagi tugmani bosing'); return h + '</div>'; }

    h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">';
    galleries.forEach(function (g) {
      h += '<div class="vz-card rc-card" data-uuid="' + esc(g.uuid) + '"' + (g.pending ? ' data-pending="1"' : '') + ' style="padding:0;overflow:hidden;cursor:' + (g.pending ? 'default' : 'pointer') + '">';
      // thumb
      h += '<div style="position:relative;aspect-ratio:1;background:var(--sfc2)">';
      if (g.pending) {
        h += '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">' +
          '<div class="rc-skel" style="width:34px;height:34px;border-radius:50%"></div>' +
          '<div style="font-size:10px;font-weight:700;color:var(--mut)">Yaratilmoqda...</div></div>';
      } else if (g.is_link) {
        // 2026-09-04: tashqi VR havola — real thumbnail yo'q, ikonka bilan
        h += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--acc-ink);font-size:34px;background:var(--lav)"><i class="fas fa-vr-cardboard"></i></div>';
      } else if (g.thumbnail) {
        h += '<img src="' + esc(g.thumbnail) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">';
      } else {
        h += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:34px"><i class="fas fa-globe-americas"></i></div>';
      }
      h += g.is_link
        ? '<span class="rc-badge" style="position:absolute;top:6px;left:6px;background:var(--lav);color:var(--acc-ink)">🔗 Havola</span>'
        : '<span class="rc-badge" style="position:absolute;top:6px;left:6px;background:var(--acc);color:var(--acc-ink)">360°</span>';
      if (g.panorama_count > 1) h += '<span class="rc-chip" style="position:absolute;bottom:6px;right:6px;background:var(--sfc)"><i class="fas fa-images" style="font-size:9px"></i> ' + g.panorama_count + '</span>';
      h += '</div>';
      // info
      h += '<div style="padding:8px 10px">';
      h += '<div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(g.name || 'Panorama') + '</div>';
      var meta = [];
      if (g.order_hash) meta.push('#' + esc(g.order_hash));
      if (g.designer_name) meta.push(esc(g.designer_name));
      if (g.created_at) meta.push(Utils.timeAgo(g.created_at));
      if (meta.length) h += '<div style="font-size:11px;color:var(--mut);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + meta.join(' · ') + '</div>';

      if (g.order_hash || g.client_order_id) {
        h += '<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">';
        if (g.order_hash) h += '<button class="vz-btn-mc rc-chip" data-hash="' + esc(g.order_hash) + '" style="border:none;cursor:pointer;color:var(--lav)"><i class="fas fa-industry" style="font-size:8px"></i> #' + esc(g.order_hash) + '</button>';
        if (g.client_order_id) h += '<button class="vz-btn-erp rc-chip" data-id="' + g.client_order_id + '" style="border:none;cursor:pointer;color:var(--acc-text)"><i class="fas fa-clipboard-list" style="font-size:8px"></i> ' + esc(g.client_order_title || 'Buyurtma') + '</button>';
        h += '</div>';
      }
      if (!g.client_order_id) h += '<button class="vz-btn-link rc-chip" data-uuid="' + esc(g.uuid) + '" style="border:1px dashed var(--brd2);background:transparent;cursor:pointer;color:var(--mut);margin-top:6px"><i class="fas fa-link" style="font-size:8px"></i> Bog\'lash</button>';
      if (g.is_own && !g.pending) {
        h += '<div style="display:flex;gap:4px;margin-top:6px">';
        h += '<button class="vz-btn-edit rc-chip" data-uuid="' + esc(g.uuid) + '" data-name="' + esc(g.name || '') + '" style="border:none;cursor:pointer;color:var(--mut)"><i class="fas fa-pen" style="font-size:8px"></i> Tahrirlash</button>';
        h += '<button class="vz-btn-del rc-chip" data-uuid="' + esc(g.uuid) + '" style="border:none;cursor:pointer;color:var(--danger)"><i class="fas fa-trash" style="font-size:8px"></i> O\'chirish</button>';
        h += '</div>';
      }
      h += '</div></div>';
    });
    h += '</div></div>';
    return h;
  },

  bind: function () {
    document.querySelectorAll('.vz-card').forEach(function (card) {
      card.onclick = function (e) {
        if (e.target.closest('.vz-btn-mc') || e.target.closest('.vz-btn-erp') || e.target.closest('.vz-btn-link') ||
            e.target.closest('.vz-btn-edit') || e.target.closest('.vz-btn-del')) return;
        if (card.dataset.pending) return;
        var uuid = card.dataset.uuid; if (uuid) RcVizual.openViewer(uuid);
      };
    });
    document.querySelectorAll('.vz-btn-mc').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); RcFrame.open('/order/' + b.dataset.hash + '/', '#' + b.dataset.hash); }; });
    document.querySelectorAll('.vz-btn-erp').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); Router.go('/orders/' + b.dataset.id); }; });
    document.querySelectorAll('.vz-btn-link').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); RcVizual._linkSheet(b.dataset.uuid); }; });
    document.querySelectorAll('.vz-btn-edit').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); RcVizual._renamePrompt(b.dataset.uuid, b.dataset.name); }; });
    document.querySelectorAll('.vz-btn-del').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); RcVizual._deleteConfirm(b.dataset.uuid); }; });
    var up = document.getElementById('vz-upload-btn');
    if (up) up.onclick = function () { RcVizual.openUpload(); };
    var lb = document.getElementById('vz-link-btn');
    if (lb) lb.onclick = function () { RcVizual.openAddLink(); };
  },

  _renamePrompt: function (uuid, currentName) {
    var name = prompt("Galereya nomi:", currentName || '');
    if (name == null) return;
    name = name.trim();
    if (!name) return;
    WS.send('viz.rename', { gallery_uuid: uuid, name: name }, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      Toast.success('Saqlandi');
      RcVizual.render();
    });
  },

  _deleteConfirm: function (uuid) {
    if (!confirm("Galereyani butunlay o'chirasizmi? Bu amalni qaytarib bo'lmaydi.")) return;
    WS.send('viz.delete', { gallery_uuid: uuid }, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      Toast.success("O'chirildi");
      RcVizual.render();
    });
  },

  openViewer: function (uuid) {
    // 2026-09-04: tashqi VR havola (external_url) bo'lsa ichki panorama-
    // viewer'ga TUSHMAYDI — to'g'ridan-to'g'ri o'sha tashqi saytga o'tadi
    // (foydalanuvchi so'rovi: "oddiy brauzerga o'tkazib yuborsa bo'ld").
    var g = RcVizual._galleries.find(function (x) { return x.uuid === uuid; });
    if (g && g.is_link && g.external_url) { window.location.href = g.external_url; return; }
    var u = STATE.user && STATE.user.username; if (!u) return;
    window.location.href = '/mini/' + encodeURIComponent(u) + '/panorama/' + encodeURIComponent(uuid) + '/';
  },
  openUpload: function () {
    var u = STATE.user && STATE.user.username; if (!u) return;
    window.location.href = '/mini/' + encodeURIComponent(u) + '/panorama/upload/';
  },

  _linkSheet: function (galleryUuid) {
    RcLink.open('panorama.link', { gallery_uuid: galleryUuid }, 'gallery_uuid', function () { RcVizual.render(); });
  },

  // ── Tashqi VR/3D havola qo'shish (2026-09-04, masalan ShapeSpark) ──────
  // Haqiqiy panorama fayl yuklamasdan, faqat URL saqlanadi — ro'yxatda
  // 🔗 kartochka sifatida chiqadi, bosilganda to'g'ridan-to'g'ri o'sha
  // saytga o'tadi (openViewer, yuqorida).
  openAddLink: function () {
    var body = '<div style="display:flex;flex-direction:column;gap:10px;padding-top:2px">' +
      '<input type="text" id="vz-link-name" placeholder="Nomi (masalan: VR 3D model)" style="padding:10px 12px;border-radius:12px;border:1px solid var(--brd);background:var(--sfc2);color:var(--txt);font-size:13px">' +
      '<input type="url" id="vz-link-url" placeholder="https://..." style="padding:10px 12px;border-radius:12px;border:1px solid var(--brd);background:var(--sfc2);color:var(--txt);font-size:13px">' +
      '<button class="rc-btn" id="vz-link-save" style="width:100%"><i class="fas fa-check"></i> Saqlash</button></div>';
    RcSheet.open('🔗 VR havola qo\'shish', body, {});
    document.getElementById('vz-link-save').onclick = function () {
      var url = (document.getElementById('vz-link-url').value || '').trim();
      var name = (document.getElementById('vz-link-name').value || '').trim();
      if (!url) { Toast.error('Havola kiriting'); return; }
      if (!/^https?:\/\//i.test(url)) { Toast.error('Havola http:// yoki https:// bilan boshlanishi kerak'); return; }
      var btn = document.getElementById('vz-link-save');
      btn.disabled = true;
      WS.send('panorama.link_add', { url: url, name: name }, function (msg) {
        btn.disabled = false;
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        Toast.success('Havola qo\'shildi');
        RcSheet.close();
        RcVizual.render();
      });
    };
  }
};
window.RcVizual = RcVizual;
RC_PAGES['/vizualizatsiya'] = function () { RcVizual.render(); };

/* ═══════════════════════════════════════════════════════════════
   Portfolio — buyurtmalarga yuklangan rasmlar galereyasi
   ═══════════════════════════════════════════════════════════════ */
var RcPortfolio = {
  _items: [],
  _viewed: {},

  render: function () {
    document.getElementById('app').innerHTML = Skeleton.list(3);
    WS.send('page.portfolio', {}, function (msg) {
      if (STATE.currentPage !== '/portfolio') return;
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      RcPortfolio._items = (msg.data && msg.data.items) || [];
      document.getElementById('app').innerHTML = RcPortfolio.template(RcPortfolio._items);
      RcPortfolio.bind();
    });
  },

  template: function (items) {
    var esc = Utils.esc;
    var h = '<div data-screen>';
    h += rcHeader('🖼️ Portfolio', '');
    if (!items.length) {
      h += rcEmpty('🖼️', 'Hali rasm yo\'q', 'Buyurtmalaringizga rasm yuklansa, shu yerda ko\'rinadi');
      return h + '</div>';
    }
    h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">';
    items.forEach(function (it) {
      h += '<div class="pf-card rc-card" data-id="' + it.id + '" style="padding:0;overflow:hidden;cursor:pointer">';
      h += '<div style="position:relative;aspect-ratio:1;background:var(--sfc2)">';
      if (it.thumbnail) h += '<img src="' + esc(it.thumbnail) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">';
      else h += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:34px"><i class="fas fa-image"></i></div>';
      h += '</div>';
      h += '<div style="padding:8px 10px;font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.order_title || '') + '</div>';
      h += '</div>';
    });
    h += '</div></div>';
    return h;
  },

  bind: function () {
    document.querySelectorAll('.pf-card').forEach(function (card) {
      card.onclick = function () {
        var id = card.dataset.id;
        var it = RcPortfolio._items.find(function (x) { return String(x.id) === id; });
        if (!it) return;
        if (window.Gallery && Gallery.open) {
          Gallery.open([{ file_url: it.url || it.thumbnail, file_type: 'image', file_name: it.caption || 'rasm.jpg', file_size: 0 }], 0);
        } else {
          window.open(it.url || it.thumbnail, '_blank');
        }
        if (!RcPortfolio._viewed[id]) {
          RcPortfolio._viewed[id] = true;
          WS.send('portfolio.view', { file_id: id }, function () {});
        }
      };
    });
  }
};
window.RcPortfolio = RcPortfolio;
RC_PAGES['/portfolio'] = function () { RcPortfolio.render(); };

/* ═══════════════════════════════════════════════════════════════
   🛍️ Mahsulotlar vitrinasi — kichkina oynacha (RcSheet), 50 ta eng
   ko'p sotilgan/trend mahsulot (katta ERP katalogidan, haftalik yangilanadi)
   ═══════════════════════════════════════════════════════════════ */
var RcCatalog = {
  _items: [],
  _viewed: {},
  _q: '',
  _cat: '',

  open: function () {
    if (!(window.RcSheet && RcSheet.open)) { if (window.Toast && Toast.info) Toast.info('Tez orada'); return; }
    RcCatalog._q = '';
    RcCatalog._cat = '';
    var body = '<input id="rc-cat-search" class="rc-input" placeholder="🔎 Mahsulot qidirish..." style="margin-bottom:10px">' +
      '<div id="rc-cat-filters" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:4px"></div>' +
      '<div id="rc-catalog-body">' + Skeleton.list(2) + '</div>';
    RcSheet.open('🛍️ Top mahsulotlar', body, {});
    var sEl = document.getElementById('rc-cat-search');
    if (sEl) sEl.oninput = function () { RcCatalog._q = sEl.value.trim().toLowerCase(); RcCatalog._renderBody(); };
    WS.send('page.catalog', {}, function (msg) {
      if (!msg.ok) { var b = document.getElementById('rc-catalog-body'); if (b) b.innerHTML = '<div style="text-align:center;color:var(--mut);padding:20px 0">Yuklab bo\'lmadi</div>'; return; }
      RcCatalog._items = (msg.data && msg.data.items) || [];
      RcCatalog._renderFilters();
      RcCatalog._renderBody();
    });
  },

  _renderFilters: function () {
    var box = document.getElementById('rc-cat-filters');
    if (!box) return;
    var esc = Utils.esc;
    var counts = {};
    RcCatalog._items.forEach(function (it) {
      var c = it.category || 'Boshqa';
      counts[c] = (counts[c] || 0) + 1;
    });
    var cats = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var h = '<button class="rc-chip cat-filter-chip" data-cat="" style="flex:none;border:none;cursor:pointer;font-weight:800;background:' + (RcCatalog._cat === '' ? 'var(--acc)' : 'var(--sfc2)') + ';color:' + (RcCatalog._cat === '' ? 'var(--acc-ink)' : 'var(--txt)') + '">Barchasi</button>';
    cats.forEach(function (c) {
      var active = RcCatalog._cat === c;
      h += '<button class="rc-chip cat-filter-chip" data-cat="' + esc(c) + '" style="flex:none;border:none;cursor:pointer;font-weight:700;background:' + (active ? 'var(--acc)' : 'var(--sfc2)') + ';color:' + (active ? 'var(--acc-ink)' : 'var(--txt)') + '">' + esc(c) + ' (' + counts[c] + ')</button>';
    });
    box.innerHTML = h;
    box.querySelectorAll('.cat-filter-chip').forEach(function (b) {
      b.onclick = function () { RcCatalog._cat = b.dataset.cat; RcCatalog._renderFilters(); RcCatalog._renderBody(); };
    });
  },

  _renderBody: function () {
    var box = document.getElementById('rc-catalog-body');
    if (!box) return;
    var items = RcCatalog._items;
    if (RcCatalog._cat) {
      items = items.filter(function (it) { return (it.category || 'Boshqa') === RcCatalog._cat; });
    }
    if (RcCatalog._q) {
      items = items.filter(function (it) { return (it.name || '').toLowerCase().indexOf(RcCatalog._q) !== -1; });
    }
    box.innerHTML = RcCatalog.template(items);
    RcCatalog.bind();
  },

  template: function (items) {
    if (!items.length) return rcEmpty('🛍️', 'Mahsulot topilmadi', RcCatalog._q ? "Boshqa nom bilan qidirib ko'ring" : 'Tez orada to\'ldiriladi');
    // Kategoriya bo'yicha guruhlash (Kromka, Zapchast, ЛДСП va h.k. — alohida bo'lim)
    var groups = {}, order = [];
    items.forEach(function (it) {
      var cat = it.category || 'Boshqa';
      if (!groups[cat]) { groups[cat] = []; order.push(cat); }
      groups[cat].push(it);
    });
    var esc = Utils.esc;
    var h = '<div style="max-height:56vh;overflow-y:auto">';
    order.forEach(function (cat) {
      h += '<div style="font-size:12px;font-weight:800;color:var(--mut);margin:12px 0 8px;text-transform:uppercase;letter-spacing:.03em">' + esc(cat) + ' <span style="color:var(--mut);font-weight:600">(' + groups[cat].length + ')</span></div>';
      h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:6px">';
      h += RcCatalog._cardsHtml(groups[cat]);
      h += '</div>';
    });
    h += '</div>';
    return h;
  },

  _cardsHtml: function (items) {
    var esc = Utils.esc, money = Utils.money ? Utils.money : function (v) { return (parseFloat(v) || 0).toLocaleString('ru-RU'); };
    var h = '';
    items.forEach(function (it) {
      h += '<div class="cat-card rc-card" data-id="' + it.id + '" style="padding:0;overflow:hidden;cursor:pointer">';
      h += '<div style="position:relative;aspect-ratio:1;background:var(--sfc2)">';
      if (it.image) h += '<img src="' + esc(it.image) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">';
      else h += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:30px"><i class="fas fa-box"></i></div>';
      if (it.top_seller) h += '<span class="rc-chip" style="position:absolute;top:6px;left:6px;background:var(--acc);color:var(--acc-ink);font-weight:800">🔥 Ko\'p sotilgan</span>';
      h += '<span class="rc-chip" style="position:absolute;bottom:6px;right:6px;background:' + (it.in_stock ? 'var(--sfc)' : 'rgba(245,139,139,.85)') + ';color:' + (it.in_stock ? 'var(--txt)' : '#fff') + ';font-size:10px">' + (it.in_stock ? 'Bor' : "Yo'q") + '</span>';
      h += '</div>';
      h += '<div style="padding:8px 10px">';
      h += '<div style="font-size:12px;font-weight:600;line-height:1.3;max-height:2.6em;overflow:hidden">' + esc(it.name) + '</div>';
      h += '<div style="font-size:13px;font-weight:800;color:var(--acc-text);margin-top:4px">' + money(it.sale_price) + (it.unit ? ' / ' + esc(it.unit) : '') + '</div>';
      h += '</div></div>';
    });
    return h;
  },

  bind: function () {
    document.querySelectorAll('.cat-card').forEach(function (card) {
      card.onclick = function () {
        var id = card.dataset.id;
        if (!RcCatalog._viewed[id]) {
          RcCatalog._viewed[id] = true;
          WS.send('catalog.view', { product_id: id }, function () {});
        }
      };
    });
  }
};
window.RcCatalog = RcCatalog;

/* ═══════════════════════════════════════════════════════════════
   🎁 Do'stni taklif qilish — Telegram share (Sozlamalar + Bosh sahifa
   topshirig'idan bir xil chaqiriladi, sahifaga navigatsiya qilmaydi)
   ═══════════════════════════════════════════════════════════════ */
var RcReferral = {
  share: function () {
    var code = (STATE.user && STATE.user.referral_code) || '';
    // Xom sayt havolasi emas — bot havolasi (t.me/...) ishonchliroq ko'rinadi va
    // Telegram ichida ochiladi. Bot /start ref_<code> ni ushlab, ro'yxatdan
    // o'tish havolasini (ref bilan) foydalanuvchiga o'zi yuboradi.
    var link = 'https://t.me/mebelcity_bittada_bot?start=ref_' + encodeURIComponent(code);
    var text = "Bittada Usta — mebel ustalari uchun bepul ilova! Mening havolam orqali qo'shiling:";
    var tgUrl = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text);
    window.open(tgUrl, '_blank');
    if (window.WS && WS.send) WS.send('referral.share', {}, function () {});
  }
};
window.RcReferral = RcReferral;

/* ── Ortak "buyurtmaga bog'lash" sheet (vizual + zamer) ── */
var RcLink = {
  _orders: [],
  _sel: null,
  // action: WS action, base: qo'shimcha payload, cb: muvaffaqiyatdan keyin
  open: function (action, base, _unused, cb) {
    if (!window.RcSheet || !RcSheet.open) { Toast.info('Tez orada'); return; }
    RcLink._orders = []; RcLink._sel = null;
    var body = '<div class="rc-search" style="margin-bottom:10px"><i class="fas fa-search" style="color:var(--mut);font-size:13px"></i><input id="rc-link-q" type="text" placeholder="Qidirish..."></div>' +
      '<div id="rc-link-list" style="max-height:52vh;overflow-y:auto">' + Skeleton.list(3) + '</div>';
    RcSheet.open('Buyurtmaga bog\'lash', body, {
      footer: '<button class="rc-btn-ghost rc-btn-sm" onclick="RcSheet.close()">Bekor</button><button class="rc-btn rc-btn-sm" id="rc-link-save" disabled style="opacity:.5">Bog\'lash</button>'
    });
    var save = document.getElementById('rc-link-save');
    if (save) save.onclick = function () {
      if (!RcLink._sel) return Toast.error('Buyurtma tanlang');
      save.disabled = true; save.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      var payload = { client_order_id: RcLink._sel };
      for (var k in base) payload[k] = base[k];
      WS.send(action, payload, function (msg) {
        if (msg.ok) { Toast.success('Bog\'landi!'); RcSheet.close(); if (cb) cb(); }
        else { Toast.error(msg.error || 'Xatolik'); save.disabled = false; save.textContent = 'Bog\'lash'; }
      });
    };
    var q = document.getElementById('rc-link-q');
    if (q) q.oninput = function () { RcLink._render(RcLink._filter(q.value)); };
    WS.send('page.orders', {}, function (msg) {
      if (!msg.ok) return;
      RcLink._orders = (msg.data && msg.data.orders) || [];
      RcLink._render(RcLink._orders);
    });
  },
  _filter: function (query) {
    var qq = (query || '').toLowerCase().trim();
    return RcLink._orders.filter(function (o) {
      if (!qq) return true;
      var txt = (o.title + ' ' + (o.customer ? o.customer.name : '')).toLowerCase();
      return txt.indexOf(qq) !== -1;
    });
  },
  _render: function (orders) {
    var list = document.getElementById('rc-link-list'); if (!list) return;
    if (!orders.length) { list.innerHTML = rcEmpty('🔍', 'Buyurtma topilmadi'); return; }
    var h = '';
    orders.forEach(function (o) {
      var sel = RcLink._sel === o.id;
      var badge = window.RcStatus ? RcStatus.badge(o.status) : '';
      h += '<div class="rc-link-item" data-id="' + o.id + '" style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:var(--radius-sm);cursor:pointer;margin-bottom:6px;border:2px solid ' + (sel ? 'var(--acc)' : 'transparent') + ';background:var(--sfc2)">';
      h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + Utils.esc(o.title) + '</div>';
      var meta = [];
      if (o.customer && o.customer.name) meta.push(Utils.esc(o.customer.name));
      if (o.created_at) meta.push(Utils.timeAgo(o.created_at));
      if (meta.length) h += '<div style="font-size:11px;color:var(--mut);margin-top:1px">' + meta.join(' · ') + '</div>';
      h += '</div>' + badge + (sel ? '<i class="fas fa-check-circle" style="color:var(--acc-text)"></i>' : '') + '</div>';
    });
    list.innerHTML = h;
    list.querySelectorAll('.rc-link-item').forEach(function (item) {
      item.onclick = function () {
        RcLink._sel = parseInt(item.dataset.id);
        var save = document.getElementById('rc-link-save');
        if (save) { save.disabled = false; save.style.opacity = '1'; }
        var q = document.getElementById('rc-link-q');
        RcLink._render(RcLink._filter(q ? q.value : ''));
      };
    });
  }
};
window.RcLink = RcLink;

/* ═══════════════════════════════════════════════════════════════
   3) 3D Zamerlar — 'page.zamers'
   ═══════════════════════════════════════════════════════════════ */
var RcZamers = {
  _zamers: [],

  render: function () {
    document.getElementById('app').innerHTML = Skeleton.list(3);
    WS.send('page.zamers', {}, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      RcZamers._zamers = (msg.data && msg.data.zamers) || [];
      document.getElementById('app').innerHTML = RcZamers.template(RcZamers._zamers);
      RcZamers.bind();
    });
  },

  template: function (zamers) {
    var esc = Utils.esc;
    var right = '<div style="display:flex;gap:6px;flex:none">' +
      '<button class="rc-btn-ghost rc-btn-sm" id="zm-ble-btn"><i class="fas fa-satellite-dish"></i> BLE</button>' +
      '<button class="rc-btn rc-btn-sm" id="zm-new-btn"><i class="fas fa-plus"></i> Yangi</button></div>';
    var h = '<div data-screen>';
    h += rcHeader('<i class="fas fa-ruler-combined" style="color:var(--acc-text)"></i> 3D Zamerlar', right);
    if (!zamers.length) { h += rcEmpty('📐', 'Zamerlar hali yo\'q', '"Yangi" tugmasini bosing'); return h + '</div>'; }

    h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">';
    zamers.forEach(function (z) {
      h += '<div class="zm-card rc-card" data-id="' + z.id + '" style="padding:0;overflow:hidden;cursor:pointer">';
      h += '<div style="position:relative;aspect-ratio:1;background:var(--sfc2)">';
      if (z.thumbnail) h += '<img src="' + esc(z.thumbnail) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">';
      else h += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:34px"><i class="fas fa-cube"></i></div>';
      h += '<span class="rc-badge" style="position:absolute;top:6px;left:6px;background:var(--acc);color:var(--acc-ink)">3D</span>';
      if (z.blocks_count > 0) h += '<span class="rc-chip" style="position:absolute;bottom:6px;right:6px;background:var(--sfc)"><i class="fas fa-cubes" style="font-size:9px"></i> ' + z.blocks_count + '</span>';
      h += '</div><div style="padding:8px 10px">';
      h += '<div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(z.room_name || 'Xona #' + z.id) + '</div>';
      var dims = [];
      if (z.width) dims.push(Math.ceil(z.width));
      if (z.height) dims.push(Math.ceil(z.height));
      if (z.depth) dims.push(Math.ceil(z.depth));
      var meta = [];
      if (dims.length) meta.push(dims.join(' × ') + ' mm');
      if (z.order_hash) meta.push('#' + esc(z.order_hash));
      if (z.created_at) meta.push(Utils.timeAgo(z.created_at));
      if (meta.length) h += '<div style="font-size:11px;color:var(--mut);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + meta.join(' · ') + '</div>';

      if (z.order_hash || z.client_order_id) {
        h += '<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">';
        if (z.order_hash) h += '<button class="zm-btn-mc rc-chip" data-hash="' + esc(z.order_hash) + '" style="border:none;cursor:pointer;color:var(--lav)"><i class="fas fa-industry" style="font-size:8px"></i> #' + esc(z.order_hash) + '</button>';
        if (z.client_order_id) h += '<button class="zm-btn-erp rc-chip" data-id="' + z.client_order_id + '" style="border:none;cursor:pointer;color:var(--acc-text)"><i class="fas fa-clipboard-list" style="font-size:8px"></i> ' + esc(z.client_order_title || 'Buyurtma') + '</button>';
        h += '</div>';
      }
      if (!z.client_order_id) h += '<button class="zm-btn-link rc-chip" data-zid="' + z.id + '" style="border:1px dashed var(--brd2);background:transparent;cursor:pointer;color:var(--mut);margin-top:6px"><i class="fas fa-link" style="font-size:8px"></i> Bog\'lash</button>';
      h += '</div></div>';
    });
    h += '</div></div>';
    return h;
  },

  bind: function () {
    var newBtn = document.getElementById('zm-new-btn');
    if (newBtn) newBtn.onclick = function () { RcZamers._openNew(); };
    var bleBtn = document.getElementById('zm-ble-btn');
    if (bleBtn) bleBtn.onclick = function () { if (typeof BLE !== 'undefined') BLE.togglePanel(); else Toast.error('BLE moduli yuklanmagan'); };

    document.querySelectorAll('.zm-card').forEach(function (card) {
      card.onclick = function (e) {
        if (e.target.closest('.zm-btn-mc') || e.target.closest('.zm-btn-erp') || e.target.closest('.zm-btn-link')) return;
        var zid = parseInt(card.dataset.id), z = null;
        for (var i = 0; i < RcZamers._zamers.length; i++) { if (RcZamers._zamers[i].id === zid) { z = RcZamers._zamers[i]; break; } }
        if (z && z.zamer_url) RcFrame.open(z.zamer_url, z.room_name || 'Zamer #' + z.id, function () { RcZamers.render(); });
        else if (z) RcZamers._detailSheet(z);
      };
    });
    document.querySelectorAll('.zm-btn-mc').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); RcFrame.open('/order/' + b.dataset.hash + '/', '#' + b.dataset.hash); }; });
    document.querySelectorAll('.zm-btn-erp').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); Router.go('/orders/' + b.dataset.id); }; });
    document.querySelectorAll('.zm-btn-link').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); RcLink.open('zamer.link', { zamer_id: parseInt(b.dataset.zid) }, 'zamer_id', function () { RcZamers.render(); }); }; });
  },

  _openNew: function () {
    fetch('/mini/api/zamer-new/', { method: 'GET', credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.ok && d.iframe_url) RcFrame.open(d.iframe_url, 'Yangi zamer', function () { RcZamers.render(); }); else Toast.error('Xatolik'); })
      .catch(function () { Toast.error('Server xatolik'); });
  },

  _detailSheet: function (z) {
    if (!window.RcSheet || !RcSheet.open) { Toast.info('Tez orada'); return; }
    var esc = Utils.esc, body = '';
    if (z.thumbnail) body += '<div style="text-align:center;margin-bottom:12px"><img src="' + esc(z.thumbnail) + '" style="max-width:100%;max-height:200px;border-radius:var(--radius-sm);object-fit:contain"></div>';
    var dims = [];
    if (z.width) dims.push(['Eni', Math.ceil(z.width)]);
    if (z.height) dims.push(['Bo\'yi', Math.ceil(z.height)]);
    if (z.depth) dims.push(['Chuqurligi', Math.ceil(z.depth)]);
    if (z.length) dims.push(['Uzunligi', Math.ceil(z.length)]);
    if (dims.length) {
      body += '<div class="rc-grid rc-grid-auto" style="margin-bottom:10px">';
      dims.forEach(function (d) { body += '<div class="rc-stat" style="padding:10px"><div class="rc-stat-label">' + d[0] + '</div><div class="rc-stat-val" style="font-size:15px">' + d[1] + ' mm</div></div>'; });
      body += '</div>';
    }
    if (z.blocks_count) body += '<div style="font-size:12px;color:var(--mut);margin-bottom:6px"><i class="fas fa-cubes"></i> ' + z.blocks_count + ' ta mebel blok</div>';
    if (z.note) body += '<div style="font-size:12px;color:var(--mut);padding:10px;background:var(--sfc2);border-radius:var(--radius-sm)">' + esc(z.note) + '</div>';
    RcSheet.open(esc(z.room_name || 'Zamer #' + z.id), body || '<div style="color:var(--mut)">Ma\'lumot yo\'q</div>', {});
  }
};
window.RcZamers = RcZamers;
RC_PAGES['/zamers'] = function () { RcZamers.render(); };

/* ═══════════════════════════════════════════════════════════════
   4) Oldi-Berdi — 'page.oldi_berdi' + 'oldi_berdi.load_more'
   ═══════════════════════════════════════════════════════════════ */
var RcOldiberdi = {
  _data: null,
  _tab: 'sales',
  _period: 'all',
  _offsets: {},

  PERIODS: [['all', 'Barchasi'], ['month', 'Shu oy'], ['last_month', "O'tgan oy"], ['year', 'Shu yil']],
  TABS: [['sales', 'Sotuvlar'], ['returns', 'Qaytarish'], ['debts', 'Qarzlar'], ['operations', "To'lovlar"]],

  render: function () { RcOldiberdi._tab = 'sales'; RcOldiberdi._reload('all'); },

  _reload: function (period) {
    RcOldiberdi._period = period || 'all';
    RcOldiberdi._offsets = { sales: 20, returns: 20, operations: 20 };
    document.getElementById('app').innerHTML = Skeleton.list(5);
    WS.send('page.oldi_berdi', { period: RcOldiberdi._period }, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      RcOldiberdi._data = msg.data;
      document.getElementById('app').innerHTML = RcOldiberdi.template(msg.data);
      RcOldiberdi.bind();
    });
  },

  _fmtUsd: function (v) { return (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },

  template: function (d) {
    var esc = Utils.esc, money = Utils.money;
    if (!d.linked) {
      return '<div data-screen>' + rcEmpty('🔗', 'Hisob ulanmagan', 'Sizning hisobingiz MebelCity tizimiga ulanmagan. Admin bilan bog\'laning.') + '</div>';
    }
    var h = '<div data-screen>';
    h += rcHeader('Oldi-Berdi', '<button class="rc-btn-ghost rc-btn-sm" id="ob-refresh" title="Yangilash" style="flex:none"><i class="fas fa-sync-alt"></i></button>');
    if (d.client_name) h += '<div style="font-size:12px;color:var(--mut);margin-top:-6px">' + esc(d.client_name) + '</div>';

    // Period chip'lar
    h += '<div class="rc-tabs" id="ob-period">';
    RcOldiberdi.PERIODS.forEach(function (p) {
      h += '<button class="rc-tab' + (RcOldiberdi._period === p[0] ? ' active' : '') + '" data-period="' + p[0] + '">' + p[1] + '</button>';
    });
    h += '</div>';

    // ── Qarzdorlik + Xulosa — 2026-08-25: soddalashtirish talabi bo'yicha
    // 6 ta katta karta (ustma-ust) o'rniga IKKI ta IXCHAM qator. Barcha
    // raqamlar joyida — hech biri yashirilmagan/o'zgarmagan, faqat kamroq
    // joy egallaydi va bir qarashda o'qiladi.
    var debtU = parseFloat(d.balance.uzs) || 0, debtD = parseFloat(d.balance.usd) || 0;
    // Katta summalar kichik kartada kesilib qolmasin — label ustida,
    // qiymat pastda 2 QATORGA bo'linadi (son alohida, summa alohida).
    var miniCard = function (label, val, clr) {
      return '<div style="flex:1;min-width:0;background:var(--sfc2);border-radius:12px;padding:9px 11px">'
        + '<div style="font-size:10px;color:var(--mut);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + label + '</div>'
        + '<div style="font-size:13.5px;font-weight:800;color:' + clr + ';margin-top:2px;line-height:1.3;word-break:break-word">' + val + '</div>'
        + '</div>';
    };
    h += '<div style="display:flex;gap:7px">';
    h += miniCard('Qarzdorlik UZS', debtU > 0 ? money(d.balance.uzs) : "Qarz yo'q", debtU > 0 ? 'var(--danger)' : 'var(--acc-text)');
    h += miniCard('Qarzdorlik USD', debtD > 0 ? '$' + RcOldiberdi._fmtUsd(d.balance.usd) : "Qarz yo'q", debtD > 0 ? 'var(--danger)' : 'var(--acc-text)');
    h += '</div>';

    // 4 ta xulosa — soni va summasi ALOHIDA qatorda (bitta uzun qatorda
    // kesilib qolmasligi uchun), 2x2 grid'da to'liq sig'adi.
    var sumMini = function (label, count, total, clr) {
      return '<div style="flex:1 1 44%;min-width:92px;background:var(--sfc2);border-radius:12px;padding:9px 11px">'
        + '<div style="font-size:10px;color:var(--mut);font-weight:600">' + label + '</div>'
        + '<div style="font-size:15px;font-weight:800;color:' + clr + ';margin-top:2px">' + count + '</div>'
        + '<div style="font-size:10.5px;color:var(--mut);margin-top:1px;line-height:1.3">' + total + '</div>'
        + '</div>';
    };
    var sm = d.summary;
    h += '<div style="display:flex;gap:7px;margin-top:7px;flex-wrap:wrap">';
    h += sumMini('Sotuvlar', sm.sales_count, money(sm.total_sales), 'var(--acc-text)');
    h += sumMini('Qaytarish', sm.returns_count, money(sm.total_returns), 'var(--pch-text)');
    h += sumMini('Qarzlar', sm.debts_count, money(sm.total_debt), 'var(--danger)');
    h += sumMini("To'lovlar", sm.operations_count, money(sm.total_payments), 'var(--lav-text)');
    h += '</div>';

    // Tab'lar
    h += '<div class="rc-tabs" id="ob-tabs">';
    var cur = RcOldiberdi._tab || 'sales';
    RcOldiberdi.TABS.forEach(function (t) { h += '<button class="rc-tab' + (cur === t[0] ? ' active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; });
    h += '</div>';

    // Tab kontent
    h += RcOldiberdi._tabContent('sales', d.sales, RcOldiberdi._saleCard, d.has_more.sales, cur === 'sales');
    h += RcOldiberdi._tabContent('returns', d.returns, RcOldiberdi._returnCard, d.has_more.returns, cur === 'returns');
    h += RcOldiberdi._tabContent('debts', d.debts, RcOldiberdi._debtCard, false, cur === 'debts');
    h += RcOldiberdi._tabContent('operations', d.operations, RcOldiberdi._opCard, d.has_more.operations, cur === 'operations');

    return h + '</div>';
  },

  _sumCard: function (label, count, total, color) {
    return '<div class="rc-stat"><div class="rc-stat-label">' + label + '</div>' +
      '<div class="rc-stat-val" style="color:' + color + '">' + count + '</div>' +
      '<div class="rc-stat-sub">' + total + '</div></div>';
  },

  _tabContent: function (tab, items, renderer, hasMore, show) {
    var h = '<div id="ob-tab-' + tab + '" style="display:' + (show ? '' : 'none') + '">';
    if (!items.length) {
      var em = { sales: 'Sotuv', returns: 'Qaytarish', debts: 'Qarz', operations: "To'lov" };
      h += rcEmpty('📭', 'Hali ' + (em[tab] || '') + ' yo\'q');
    } else {
      h += '<div id="ob-list-' + tab + '">';
      items.forEach(function (it) { h += renderer(it); });
      h += '</div>';
      if (hasMore) h += '<div style="text-align:center;margin-top:10px" id="ob-more-' + tab + '"><button class="rc-btn-ghost rc-btn-sm ob-load-more" data-section="' + tab + '">Ko\'proq yuklash</button></div>';
    }
    return h + '</div>';
  },

  _saleCard: function (s) {
    var esc = Utils.esc, money = Utils.money;
    // 2026-08-06: bosilsa tafsilot ochiladi («nega qarz bo'lgan»)
    var h = '<div class="rc-card ob-sale" data-sid="' + s.id + '" '
          + 'style="margin-bottom:8px;display:flex;flex-direction:column;gap:6px;cursor:pointer">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">';
    h += '<div style="min-width:0"><div style="font-size:13px;font-weight:700">' + esc(s.doc_number || '—') + '</div>' +
      '<div style="font-size:11px;color:var(--mut)">' + Utils.datetime(s.date) + (s.warehouse ? ' · ' + esc(s.warehouse) : '') + '</div></div>';
    h += '<div style="text-align:right;flex:none"><div style="font-size:14px;font-weight:800;color:var(--acc-text)">' + money(s.total_uzs) + '</div>' +
      (s.total_usd ? '<div style="font-size:10px;color:var(--mut)">$' + RcOldiberdi._fmtUsd(s.total_usd) + '</div>' : '') + '</div></div>';
    var paid = parseInt(s.paid_uzs) || 0, total = parseInt(s.total_uzs) || 0, debt = parseInt(s.debt_uzs) || 0;
    // ── 2026-08-25: soddalashtirish — progress-bar va foiz matni OLIB
    // TASHLANDI (vizual bezak, raqamning o'zi kifoya). «Ortiqcha to'lov»
    // ogohlantirishi (2026-08-06 topilma) SAQLANADI — bu muhim ma'lumot,
    // ma'lumotning o'zi o'zgarmagan/yashirilmagan.
    if (total > 0 && paid > 0) {
      var isDebtFree = debt <= 0;
      h += '<div style="font-size:11px;color:var(--mut)">To\'langan: <b style="color:var(--acc-text)">' + money(paid) + '</b>'
        + (isDebtFree ? '  ·  Qarz yo\'q' : '  ·  <span style="color:var(--danger)">Qarz: ' + money(debt) + '</span>') + '</div>';
      if (paid > total) {
        h += '<div style="font-size:10px;color:var(--pch-text);line-height:1.45">⚠️ Ortiqcha: '
           + money(paid - total) + ' — bu to\'lov boshqa cheklarga tegishli bo\'lishi mumkin</div>';
      }
    }
    else if (debt > 0) h += '<div style="font-size:11px;color:var(--danger)">Qarz: ' + money(debt) + '</div>';
    h += '<div style="font-size:9.5px;color:var(--mut);text-align:right">tafsilot uchun bosing ›</div>';
    return h + '</div>';
  },

  _returnCard: function (r) {
    var esc = Utils.esc, money = Utils.money;
    return '<div class="rc-card" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px">' +
      '<div style="min-width:0"><div style="font-size:13px;font-weight:700">' + esc(r.doc_number || '—') + '</div>' +
      '<div style="font-size:11px;color:var(--mut)">' + Utils.datetime(r.date) + (r.warehouse ? ' · ' + esc(r.warehouse) : '') + '</div></div>' +
      '<div style="text-align:right;flex:none"><div style="font-size:14px;font-weight:800;color:var(--pch)">' + money(r.total_uzs) + '</div>' +
      (r.total_usd ? '<div style="font-size:10px;color:var(--mut)">$' + RcOldiberdi._fmtUsd(r.total_usd) + '</div>' : '') + '</div></div>';
  },

  _debtCard: function (d) {
    var esc = Utils.esc, money = Utils.money;
    var h = '<div class="rc-card" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px"><div style="min-width:0">';
    h += '<div style="font-size:14px;font-weight:800;color:var(--danger)">' + money(d.remaining || d.amount) + '</div>';
    if (d.ref_number) h += '<div style="font-size:11px;color:var(--mut)">' + esc(d.ref_number) + '</div>';
    var dates = [];
    if (d.recorded_date) dates.push('Yozilgan: ' + Utils.date(d.recorded_date));
    if (d.due_date) dates.push('Muddat: ' + Utils.date(d.due_date));
    if (dates.length) h += '<div style="font-size:11px;color:var(--mut)">' + dates.join(' · ') + '</div>';
    h += '</div>';
    if (parseInt(d.amount) > 0 && parseInt(d.remaining) < parseInt(d.amount)) h += '<div style="font-size:11px;color:var(--mut);flex:none">Qoldiq: ' + Math.round(parseInt(d.remaining) / parseInt(d.amount) * 100) + '%</div>';
    return h + '</div>';
  },

  _opCard: function (o) {
    var esc = Utils.esc, money = Utils.money;
    var color = o.is_income ? 'var(--acc)' : 'var(--lav)';
    var h = '<div class="rc-card" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div style="min-width:0">';
    h += '<div style="font-size:13px;font-weight:700">' + esc(o.doc_number || o.doc_type || '—') + '</div>';
    var meta = [];
    if (o.payment_method) meta.push(esc(o.payment_method));
    if (o.date) meta.push(Utils.datetime(o.date));
    if (meta.length) h += '<div style="font-size:11px;color:var(--mut)">' + meta.join(' · ') + '</div>';
    if (o.note) h += '<div style="font-size:10px;color:var(--mut)">' + esc(String(o.note).substring(0, 80)) + '</div>';
    if (o.related_doc) h += '<div style="font-size:10px;color:var(--mut)">Bog\'liq: ' + esc(o.related_doc) + '</div>';
    h += '</div><div style="text-align:right;flex:none"><div style="font-size:14px;font-weight:800;color:' + color + '">' + (o.is_income ? '+' : '-') + money(o.total_uzs) + '</div>' +
      (o.total_usd ? '<div style="font-size:10px;color:var(--mut)">$' + RcOldiberdi._fmtUsd(o.total_usd) + '</div>' : '') + '</div></div>';
    return h;
  },

  // ══════════════════════════════════════════════════════════════════
  //  SOTUV TAFSILOTI (2026-08-06) — «nima uchun va nimaga qarz bo'lgan»
  //  Ma'lumot FAQAT bosilganda serverdan olinadi (`oldi_berdi.detail`) —
  //  ro'yxat og'irlashmasin (37 sotuv × qarz × to'lov so'rovi bo'lardi).
  // ══════════════════════════════════════════════════════════════════
  _openDetail: function (saleId) {
    if (!(window.WS && WS.send)) return;
    var esc = Utils.esc, money = Utils.money;
    var ov = document.getElementById('ob-detail');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'ob-detail';
    // 2026-08-25: pastdan chiqadigan sheet o'rniga O'RTADA (markazda)
    // ochiladigan modal — foydalanuvchi talabi.
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.62);'
      + 'backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = '<div style="background:var(--sfc);width:100%;max-width:520px;padding:22px;'
      + 'border-radius:20px;text-align:center;color:var(--mut);font-size:12.5px">Yuklanmoqda…</div>';
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);

    WS.send('oldi_berdi.detail', { sale_id: saleId }, function (msg) {
      if (!msg || !msg.ok) { ov.remove(); Toast.error((msg && msg.error) || 'Topilmadi'); return; }
      var d = msg.data, s = d.sale, dbt = d.debt;
      var row = function (lbl, val, clr, big) {
        return '<div style="display:flex;align-items:baseline;gap:8px;padding:4px 0">'
          + '<span style="font-size:12.5px;color:var(--mut)">' + lbl + '</span>'
          + '<span style="flex:1;border-bottom:1px dotted var(--brd)"></span>'
          + '<span style="font-size:' + (big ? '16px' : '13.5px') + ';font-weight:800;color:' + clr
          + ';font-variant-numeric:tabular-nums">' + val + '</span></div>';
      };
      var h = '<div style="background:var(--sfc);width:100%;max-width:520px;max-height:85vh;'
        + 'overflow-y:auto;border-radius:20px;padding:18px 18px 24px">';
      h += '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px">'
        + '<div style="flex:1;min-width:0"><div style="font-weight:800;font-size:17px">' + esc(s.doc_number) + '</div>'
        + '<div style="font-size:11.5px;color:var(--mut)">' + Utils.datetime(s.date)
        + (s.warehouse ? ' · ' + esc(s.warehouse) : '') + ' · ' + esc(s.status) + '</div></div>'
        + '<button id="ob-det-x" style="background:none;border:none;color:var(--mut);font-size:22px;'
        + 'cursor:pointer;line-height:1">&times;</button></div>';

      // ── Hisob ──
      h += '<div style="background:var(--sfc2);border-radius:14px;padding:12px 14px;margin-bottom:14px">';
      h += row('Mahsulot summasi', money(s.total), 'var(--txt)');
      h += row("To'langan", money(s.paid), 'var(--acc-text)');
      h += '<div style="height:2px;background:var(--brd2);margin:7px 0"></div>';
      h += (parseFloat(s.debt) > 0)
        ? row('🔴 QARZ', money(s.debt), 'var(--danger)', true)
        : row("✅ QARZ YO'Q", '0', 'var(--mut)', true);
      if (parseFloat(s.overpaid) > 0) {
        h += '<div style="margin-top:9px;font-size:11px;color:var(--pch-text);line-height:1.55">'
          + '⚠️ <b>Ortiqcha to\'lov: ' + money(s.overpaid) + '</b><br>'
          + 'Bu chekka kerakidan ko\'p pul biriktirilgan — ehtimol to\'lov boshqa '
          + 'cheklarga taqsimlanishi kerak edi. MebelCity bilan tekshiring.</div>';
      }
      h += '</div>';

      // ── Nega qarz bo'lgan ──
      h += '<div style="font-weight:800;font-size:13.5px;margin-bottom:6px">Nega qarz bo\'lgan?</div>';
      h += '<div style="font-size:12.5px;color:var(--mut);line-height:1.7;margin-bottom:14px">';
      if (dbt) {
        h += 'Mahsulot olinganda pul to\'liq to\'lanmagan — shuning uchun <b style="color:var(--txt)">'
          + money(dbt.original) + '</b> so\'mlik qarz yozuvi ochilgan'
          + (dbt.created_at ? ' (' + Utils.date(dbt.created_at) + ')' : '') + '.<br>'
          + (dbt.is_paid
             ? '✅ Qarz <b style="color:var(--acc-text)">to\'liq yopilgan</b>'
               + (dbt.paid_at ? ' — ' + Utils.date(dbt.paid_at) : '') + '.'
             : 'Hozircha <b style="color:var(--danger)">' + money(dbt.remaining) + '</b> so\'m qoldiq bor.')
          + (dbt.due_date ? '<br>📅 Muddat: ' + Utils.date(dbt.due_date) : '');
      } else {
        h += 'Bu chek bo\'yicha qarz yozuvi ochilmagan — mahsulot <b style="color:var(--txt)">darhol '
          + 'to\'langan</b> yoki qarz boshqa hujjatga yozilgan.';
      }
      h += '</div>';

      // ── To'lovlar ──
      if (d.payments && d.payments.length) {
        h += '<div style="font-weight:800;font-size:13.5px;margin-bottom:6px">To\'lovlar ('
          + d.payments.length + ')</div><div style="margin-bottom:14px">';
        d.payments.forEach(function (p) {
          h += '<div style="display:flex;gap:8px;padding:8px 11px;background:var(--sfc2);'
            + 'border-radius:11px;margin-bottom:5px"><div style="flex:1;min-width:0">'
            + '<div style="font-size:12px">' + Utils.date(p.date) + '</div>'
            + (p.note ? '<div style="font-size:10.5px;color:var(--mut);overflow:hidden;'
              + 'text-overflow:ellipsis;white-space:nowrap">' + esc(p.note) + '</div>' : '')
            + '</div><div style="font-weight:800;font-size:13px;color:var(--acc-text);'
            + 'white-space:nowrap">' + money(p.amount) + '</div></div>';
        });
        h += '</div>';
      }

      // ── Nima olingan ──
      if (d.lines && d.lines.length) {
        h += '<div style="font-weight:800;font-size:13.5px;margin-bottom:6px">Nima olingan ('
          + d.lines_count + ')</div>';
        d.lines.forEach(function (l) {
          h += '<div style="display:flex;gap:9px;padding:6px 0;border-bottom:1px solid var(--brd)">'
            + '<div style="flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;'
            + 'white-space:nowrap">' + esc(l.name || '—') + '</div>'
            + '<div style="font-size:11px;color:var(--mut);white-space:nowrap">' + esc(l.qty) + '</div>'
            + '<div style="font-size:12px;font-weight:700;white-space:nowrap">' + money(l.total) + '</div></div>';
        });
      }
      h += '</div>';
      ov.innerHTML = h;
      var x = document.getElementById('ob-det-x');
      if (x) x.onclick = function () { ov.remove(); };
    });
  },

  bind: function () {
    // Tanishtiruv + izohlar (2026-08-06)
    if (window.RcTour && RcTour.auto) { try { RcTour.auto('oldiberdi'); } catch (e) {} }
    if (window.RcHint && RcHint.bind) { try { RcHint.bind(); } catch (e) {} }
    // Sotuv kartasi → tafsilot (2026-08-06)
    document.querySelectorAll('.ob-sale').forEach(function (el) {
      el.onclick = function () { RcOldiberdi._openDetail(el.dataset.sid); };
    });
    document.querySelectorAll('#ob-tabs .rc-tab').forEach(function (btn) {
      btn.onclick = function () {
        document.querySelectorAll('#ob-tabs .rc-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var tab = btn.dataset.tab; RcOldiberdi._tab = tab;
        ['sales', 'returns', 'debts', 'operations'].forEach(function (t) {
          var el = document.getElementById('ob-tab-' + t); if (el) el.style.display = (t === tab) ? '' : 'none';
        });
      };
    });
    document.querySelectorAll('#ob-period .rc-tab').forEach(function (btn) {
      btn.onclick = function () { if (btn.dataset.period === RcOldiberdi._period) return; RcOldiberdi._reload(btn.dataset.period); };
    });
    document.querySelectorAll('.ob-load-more').forEach(function (btn) { btn.onclick = function () { RcOldiberdi._loadMore(btn.dataset.section); }; });
    var ref = document.getElementById('ob-refresh');
    if (ref) ref.onclick = function () { RcOldiberdi._reload(RcOldiberdi._period); };
  },

  _loadMore: function (section) {
    var offset = RcOldiberdi._offsets[section] || 20;
    var btn = document.querySelector('.ob-load-more[data-section="' + section + '"]');
    if (btn) btn.textContent = 'Yuklanmoqda...';
    WS.send('oldi_berdi.load_more', { section: section, offset: offset, limit: 20, period: RcOldiberdi._period }, function (msg) {
      if (!msg.ok) { if (btn) btn.textContent = "Ko'proq yuklash"; return Toast.error(msg.error); }
      var renderers = { sales: RcOldiberdi._saleCard, returns: RcOldiberdi._returnCard, operations: RcOldiberdi._opCard };
      var renderer = renderers[section]; if (!renderer) return;
      var list = document.getElementById('ob-list-' + section);
      if (list && msg.data.items.length) { var html = ''; msg.data.items.forEach(function (it) { html += renderer(it); }); list.insertAdjacentHTML('beforeend', html); }
      RcOldiberdi._offsets[section] = offset + msg.data.items.length;
      if (!msg.data.has_more) { var m = document.getElementById('ob-more-' + section); if (m) m.style.display = 'none'; }
      else if (btn) btn.textContent = "Ko'proq yuklash";
    });
  }
};
window.RcOldiberdi = RcOldiberdi;
RC_PAGES['/oldi-berdi'] = function () { RcOldiberdi.render(); };

/* ═══════════════════════════════════════════════════════════════
   5) Jamoa — 'page.team' + team.*
   ═══════════════════════════════════════════════════════════════ */
var RcTeam = {
  _data: null,
  _tab: 'members',
  ROLES: { owner: 'Egasi', admin: 'Admin', worker: 'Ishchi', viewer: 'Ko\'ruvchi' },
  // Rol: ikonka + rang + qisqa capability izohi (kartada + modalda ko'rsatiladi)
  ROLE_META: {
    owner:  { label: 'Egasi',    icon: '👑', color: '#DCF262', can: 'Hammasi' },
    admin:  { label: 'Admin',    icon: '🛡️', color: '#A6E6F2', can: 'Pul · xarajat · etap · jamoa' },
    worker: { label: 'Ishchi',   icon: '🔧', color: '#8EE063', can: 'Etap tugatish' },
    viewer: { label: "Ko'ruvchi", icon: '👁️', color: '#9b9aa3', can: 'Faqat ko\'rish' },
  },
  MSTATUS: { invited: 'Taklif', active: 'Faol', blocked: 'Bloklangan' },
  MSTATUS_COLOR: { invited: 'var(--pch)', active: 'var(--ok)', blocked: 'var(--danger)' },
  TABS: [['members', 'A\'zolar'], ['orders', '📦 Buyurtmalar'], ['profit', 'Foyda shabloni'], ['settings', 'Sozlamalar'], ['member_teams', 'A\'zo jamolar']],

  render: function () {
    document.getElementById('app').innerHTML = Skeleton.list(4);
    WS.send('page.team', {}, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      RcTeam._data = msg.data;
      document.getElementById('app').innerHTML = RcTeam.template(msg.data);
      RcTeam.bind();
    });
  },

  template: function (d) {
    var esc = Utils.esc;
    var h = '<div data-screen>';
    if (!d.team) {
      h += rcEmpty('👥', 'Jamoa yaratilmagan', 'Jamoa yarating va hamkorlarni taklif qiling');
      h += '<button class="rc-btn" id="btn-create-team" style="align-self:center"><i class="fas fa-plus"></i> Jamoa yaratish</button>';
      return h + '</div>';
    }
    var t = d.team;
    h += rcHeader('👥 ' + esc(t.name), '<button class="rc-btn rc-btn-sm" id="btn-invite" style="flex:none"><i class="fas fa-user-plus"></i> Taklif</button>');
    h += '<div style="font-size:12px;color:var(--mut);margin-top:-6px">' + t.members.length + ' a\'zo</div>';

    // Tab'lar
    h += '<div class="rc-tabs">';
    RcTeam.TABS.forEach(function (tb) {
      var extra = '';
      if (tb[0] === 'orders' && (d.team_orders || []).length) extra = ' <span style="opacity:.6">' + d.team_orders.length + '</span>';
      if (tb[0] === 'member_teams' && (d.member_teams || []).length) extra = ' <span style="opacity:.6">' + d.member_teams.length + '</span>';
      h += '<button class="rc-tab team-tab' + (RcTeam._tab === tb[0] ? ' active' : '') + '" data-tab="' + tb[0] + '">' + tb[1] + extra + '</button>';
    });
    h += '</div>';

    h += '<div id="team-content">';
    if (RcTeam._tab === 'members') h += RcTeam._membersTab(t);
    else if (RcTeam._tab === 'orders') h += RcTeam._ordersTab(d);
    else if (RcTeam._tab === 'profit') h += RcTeam._profitTab(d);
    else if (RcTeam._tab === 'settings') h += RcTeam._settingsTab(t);
    else if (RcTeam._tab === 'member_teams') h += RcTeam._memberTeamsTab(d);
    h += '</div>';
    return h + '</div>';
  },

  _membersTab: function (t) {
    var esc = Utils.esc, h = '';
    var members = t.members || [];

    // ── Foyda taqsimoti indikatori (jami % + qolgan; 100% oshsa qizil) ──
    var total = members.reduce(function (a, m) { return a + (parseFloat(m.profit_percent) || 0); }, 0);
    total = Math.round(total * 100) / 100;
    var over = total > 100, remain = Math.max(0, 100 - total);
    h += '<div class="rc-card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;padding:12px 14px">' +
      '<div><div style="font-size:11px;color:var(--mut);font-weight:600">Foyda taqsimoti</div>' +
      '<div style="font-size:16px;font-weight:800;color:' + (over ? 'var(--danger)' : 'var(--txt)') + '">' + total + '%</div></div>' +
      '<div style="text-align:right"><div style="font-size:11px;color:var(--mut);font-weight:600">' + (over ? 'Oshib ketdi' : 'Qolgan') + '</div>' +
      '<div style="font-size:16px;font-weight:800;color:' + (over ? 'var(--danger)' : 'var(--acc)') + '">' + (over ? '+' + Math.round((total - 100) * 100) / 100 : remain) + '%</div></div></div>';
    h += '<div style="height:6px;border-radius:6px;background:var(--sfc2);overflow:hidden;margin:0 2px 14px"><div style="height:100%;width:' + Math.min(100, total) + '%;background:' + (over ? 'var(--danger)' : 'var(--acc)') + ';transition:width .4s"></div></div>';

    // ── A'zo kartalari ──
    members.forEach(function (m) {
      var rm = RcTeam.ROLE_META[m.role] || { label: m.role, icon: '•', color: 'var(--mut)', can: '' };
      var invited = m.status === 'invited';
      h += '<div class="rc-card" style="margin-bottom:8px;padding:12px 14px;display:flex;flex-direction:column;gap:10px">';
      // yuqori qator: avatar + ism/telefon + holat
      h += '<div style="display:flex;align-items:center;gap:12px">' +
        '<div class="rc-avatar" style="width:44px;height:44px;font-size:16px;flex:none">' + esc((m.name || '?')[0].toUpperCase()) + '</div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:14.5px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(m.name) + '</div>' +
        '<div style="font-size:11px;color:var(--mut)">' + esc(m.phone || m.username || '') + '</div></div>' +
        '<span style="flex:none;font-size:11px;font-weight:700;color:' + (RcTeam.MSTATUS_COLOR[m.status] || 'var(--mut)') + '">' + (invited ? '🟡' : '🟢') + ' ' + (RcTeam.MSTATUS[m.status] || m.status) + '</span></div>';
      // o'rta qator: rol-badge + foyda% + capability
      h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span class="rc-chip" style="background:color-mix(in srgb,' + rm.color + ' 20%,transparent);color:' + rm.color + ';font-weight:700;border:1px solid color-mix(in srgb,' + rm.color + ' 42%,transparent)">' + rm.icon + ' ' + rm.label + '</span>' +
        (m.profit_percent > 0 ? '<span class="rc-chip" style="background:var(--sfc2);color:var(--acc-text);font-weight:800">💰 ' + m.profit_percent + '%</span>' : '') +
        (rm.can ? '<span style="font-size:10.5px;color:var(--mut);flex:1;min-width:70px;text-align:right">' + esc(rm.can) + '</span>' : '') + '</div>';
      // amallar (owner emas)
      if (m.role !== 'owner') {
        h += '<div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--brd);padding-top:8px">' +
          '<button class="btn-member-edit rc-btn-ghost rc-btn-sm" data-uid="' + m.user_id + '"><i class="fas fa-pen" style="font-size:10px"></i> Tahrir</button>' +
          '<button class="btn-member-del rc-btn-ghost rc-btn-sm" data-uid="' + m.user_id + '" style="color:var(--danger)"><i class="fas fa-user-minus" style="font-size:11px"></i> ' + (invited ? 'Bekor' : 'Chiqarish') + '</button></div>';
      }
      h += '</div>';
    });

    // ── Kutilayotgan takliflar (alohida ro'yxat bo'lsa) ──
    if (t.invitations && t.invitations.length) {
      h += '<div style="font-size:12px;color:var(--mut);font-weight:700;margin:14px 0 8px">⏳ Kutilayotgan takliflar</div>';
      t.invitations.forEach(function (inv) {
        h += '<div class="rc-card" style="margin-bottom:6px;display:flex;align-items:center;gap:10px;opacity:.85;padding:10px 14px"><span style="font-size:18px">⏳</span>' +
          '<div style="flex:1;font-size:13px;font-weight:600">' + esc(inv.name) + '</div><span class="rc-chip" style="color:var(--pch)">Yuborilgan</span></div>';
      });
    }

    // ── Ro'yxatdan o'tmaganlarga takliflar (2026-09-23) ──
    if (t.pending && t.pending.length) {
      h += '<div style="font-size:12px;color:var(--mut);font-weight:700;margin:14px 0 8px">⏳ Ro‘yxatdan o‘tishi kutilmoqda</div>';
      t.pending.forEach(function (p) {
        h += '<div class="rc-card" style="margin-bottom:6px;display:flex;align-items:center;gap:10px;padding:10px 14px"><span style="font-size:18px">📩</span>' +
          '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">' + esc(p.name) + '</div>' +
          '<div style="font-size:11px;color:var(--mut)">' + esc(p.phone) + '</div>' +
          '<div style="font-size:11px;color:var(--pch,#f59e0b)">Sherigingiz hali ham ro‘yxatdan o‘tmadi — kutilmoqda</div></div>' +
          '<button class="btn-pending-del rc-btn-ghost rc-btn-sm" data-id="' + p.id + '" style="color:var(--danger);flex:none">✕</button></div>';
      });
    }

    // ── Rollar va ruxsatlar legendasi ──
    h += '<div class="rc-card" style="margin-top:14px;padding:12px 14px"><div style="font-size:11px;color:var(--mut);font-weight:700;letter-spacing:.05em;margin-bottom:8px">ROLLAR VA RUXSATLAR</div>';
    ['admin', 'worker', 'viewer'].forEach(function (rk) {
      var rm = RcTeam.ROLE_META[rk];
      h += '<div style="display:flex;gap:10px;align-items:center;font-size:12px;padding:4px 0"><span style="flex:none;width:92px;color:' + rm.color + ';font-weight:700">' + rm.icon + ' ' + rm.label + '</span><span style="color:var(--mut)">' + rm.can + '</span></div>';
    });
    h += '</div>';
    return h;
  },

  _ordersTab: function (d) {
    var esc = Utils.esc, money = Utils.money;
    var list = d.team_orders || [];
    if (!list.length) return rcEmpty('📦', 'Jamoaga ulashilgan buyurtma yo\'q');
    var vis = { full: '', limited: ' 🔒', finance_hidden: ' 💰🔒' };
    var h = '';
    list.forEach(function (to) {
      var st = window.RcStatus ? RcStatus.badge(to.order.status) : '';
      h += '<div onclick="Router.go(\'/orders/' + to.order.id + '\')" class="rc-card" style="cursor:pointer;margin-bottom:8px;display:flex;flex-direction:column;gap:8px">';
      h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div style="font-size:13px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(to.order.title) + '</div>' + st + '</div>';
      if (to.visibility !== 'finance_hidden') h += '<div style="font-size:13px;font-weight:800;color:var(--acc-text)">' + money(to.order.total_income) + '</div>';
      h += '<div style="font-size:10px;color:var(--mut)">' + esc(to.team_name) + (vis[to.visibility] || '') + '</div>';
      h += rcProg(to.order.overall_progress) + '</div>';
    });
    return h;
  },

  _profitTab: function (d) {
    var esc = Utils.esc;
    var templates = d.profit_templates || [];
    var h = '<button class="rc-btn rc-btn-sm" id="btn-add-tmpl" style="margin-bottom:12px"><i class="fas fa-plus"></i> Yangi shablon</button>';
    if (!templates.length) h += rcEmpty('📄', 'Hali shablon yo\'q');
    templates.forEach(function (tmpl) {
      h += '<div class="rc-card" style="margin-bottom:8px">';
      h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:14px;font-weight:700">' + esc(tmpl.name) + (tmpl.is_default ? ' <span class="rc-chip rc-chip-acc">default</span>' : '') + '</div>' +
        '<button class="btn-del-tmpl rc-btn-ghost rc-btn-sm" data-id="' + tmpl.id + '" style="width:32px;height:28px;padding:0;color:var(--danger)"><i class="fas fa-trash" style="font-size:10px"></i></button></div>';
      tmpl.lines.forEach(function (ln) {
        h += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--brd)"><span>' + esc(ln.role_label) + '</span><span style="font-weight:700">' + ln.percent + '%</span></div>';
      });
      h += '</div>';
    });
    return h;
  },

  _settingsTab: function (t) {
    var esc = Utils.esc;
    var h = '<div class="rc-card" style="display:flex;flex-direction:column;gap:12px">';
    h += '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Jamoa nomi</div><input type="text" id="team-name" class="rc-input" value="' + esc(t.name) + '"></div>';
    h += '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Tavsif</div><textarea id="team-desc" class="rc-input" rows="3">' + esc(t.description || '') + '</textarea></div>';
    h += '<button class="rc-btn rc-btn-sm" id="btn-team-save" style="align-self:flex-start">Saqlash</button>';
    h += '</div>';
    // 🔁 Yangi buyurtmalarni avto-ulashish (faqat jamoa egasi)
    if (t.is_owner) {
      h += '<div class="rc-card" style="margin-top:12px"><div style="font-size:14px;font-weight:800;margin-bottom:10px">🔁 Yangi buyurtmalarni avto-ulashish</div>';
      h += '<div id="team-autoshare-wrap"><div style="font-size:12px;color:var(--mut)">Yuklanmoqda...</div></div></div>';
    }
    return h;
  },
  _loadAutoShare: function () {
    var wrap = document.getElementById('team-autoshare-wrap');
    if (!wrap || !window.RcOrderDetail || !RcOrderDetail._autoShareCard) return;
    WS.send('team.autoshare_get', {}, function (msg) {
      wrap = document.getElementById('team-autoshare-wrap'); if (!wrap) return;
      if (!msg.ok) { wrap.innerHTML = '<div style="font-size:12px;color:var(--danger)">' + Utils.esc(msg.error || 'Xatolik') + '</div>'; return; }
      var teams = (msg.data && msg.data.teams) || [];
      if (!teams.length) { wrap.innerHTML = '<div style="font-size:12px;color:var(--mut)">Jamoa topilmadi</div>'; return; }
      var h = ''; teams.forEach(function (t) { h += RcOrderDetail._autoShareCard(t); });
      h += '<div style="font-size:11px;color:var(--mut);margin:4px 0 10px">Yoqilsa — har bir yangi buyurtmangiz jamoa a\'zolariga avtomatik ochiladi (eski buyurtmalarga tegilmaydi)</div>';
      h += '<button class="rc-btn rc-btn-sm" id="btn-autoshare-save">Saqlash</button>';
      wrap.innerHTML = h;
      RcOrderDetail._bindAutoShare(wrap);
      document.getElementById('btn-autoshare-save').onclick = function () {
        var cards = wrap.querySelectorAll('.rc-as-card'); var left = cards.length, failed = null;
        if (!left) return;
        cards.forEach(function (card) {
          WS.send('team.autoshare_set', RcOrderDetail._autoShareCollect(card), function (res) {
            if (!res.ok) failed = res.error || 'Xatolik';
            left--;
            if (left === 0) { if (failed) return Toast.error(failed); Toast.success('Avto-ulashish saqlandi'); }
          });
        });
      };
    });
  },

  _memberTeamsTab: function (d) {
    var esc = Utils.esc;
    var list = d.member_teams || [];
    if (!list.length) return rcEmpty('🤝', 'Hali boshqa jamoaga qo\'shilmagansiz');
    var h = '';
    list.forEach(function (tm) {
      h += '<div class="rc-card" style="margin-bottom:10px">';
      h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px"><div style="min-width:0"><div style="font-size:15px;font-weight:700">👥 ' + esc(tm.name) + '</div>' +
        '<div style="font-size:11px;color:var(--mut)">Egasi: ' + esc(tm.owner_name) + ' · ' + ((tm.members || []).length) + ' a\'zo</div></div>' +
        '<div style="text-align:right;flex:none"><div style="font-size:11px;color:var(--acc-text);font-weight:700">' + (RcTeam.ROLES[tm.my_role] || tm.my_role) + '</div>' +
        (tm.my_percent > 0 ? '<div style="font-size:14px;font-weight:800">' + tm.my_percent + '%</div>' : '') + '</div></div>';
      if (tm.members && tm.members.length) {
        h += '<div style="border-top:1px solid var(--brd);padding-top:8px;display:flex;flex-direction:column;gap:4px">';
        tm.members.forEach(function (mm) {
          h += '<div style="display:flex;justify-content:space-between;font-size:12px"><span>' + esc(mm.name) + ' <span style="color:var(--mut)">(' + (RcTeam.ROLES[mm.role] || mm.role) + ')</span></span>' +
            '<span style="color:var(--mut)">' + (mm.profit_percent > 0 ? mm.profit_percent + '%' : '') + '</span></div>';
        });
        h += '</div>';
      }
      // Jamoadan chiqish (egasi bo'lmasa) — o'zi bu jamoani tark etadi
      if (tm.my_role !== 'owner') {
        h += '<div style="border-top:1px solid var(--brd);padding-top:8px;margin-top:8px;text-align:right">' +
          '<button class="btn-team-leave rc-btn-ghost rc-btn-sm" data-tid="' + tm.id + '" data-tname="' + esc(tm.name) + '" style="color:var(--danger)"><i class="fas fa-sign-out-alt" style="font-size:11px"></i> Jamoadan chiqish</button></div>';
      }
      h += '</div>';
    });
    return h;
  },

  bind: function () {
    // Tanishtiruv + izohlar (2026-08-06)
    if (window.RcTour && RcTour.auto) { try { RcTour.auto('team'); } catch (e) {} }
    if (window.RcHint && RcHint.bind) { try { RcHint.bind(); } catch (e) {} }
    var d = RcTeam._data;
    var createBtn = document.getElementById('btn-create-team');
    if (createBtn) createBtn.onclick = function () { RcTeam._createSheet(); };
    var invBtn = document.getElementById('btn-invite');
    if (invBtn) invBtn.onclick = function () { RcTeam._inviteSheet(); };

    document.querySelectorAll('.team-tab').forEach(function (btn) { btn.onclick = function () { RcTeam._tab = btn.dataset.tab; RcTeam.render(); }; });

    // Sozlamalar tabida — avto-ulashish blokini yuklash
    if (RcTeam._tab === 'settings') RcTeam._loadAutoShare();

    document.querySelectorAll('.btn-member-edit').forEach(function (btn) { btn.onclick = function () { RcTeam._editMember(parseInt(btn.dataset.uid)); }; });
    document.querySelectorAll('.btn-member-del').forEach(function (btn) {
      btn.onclick = function () {
        (window.RcSheet ? RcSheet : Modal).confirm("A'zoni chiqarish", "Rostdan ham chiqarasizmi?", function () {
          WS.send('team.remove_member', { user_id: parseInt(btn.dataset.uid) }, function (msg) {
            if (!msg.ok) return Toast.error(msg.error);
            Toast.success("A'zo chiqarildi"); RcTeam.render();
          });
        });
      };
    });

    // Kutilayotgan taklifni bekor qilish (2026-09-23)
    document.querySelectorAll('.btn-pending-del').forEach(function (btn) {
      btn.onclick = function () {
        (window.RcSheet ? RcSheet : Modal).confirm('Taklifni bekor qilish', 'Rostdan ham bekor qilasizmi?', function () {
          WS.send('team.pending_cancel', { pending_id: parseInt(btn.dataset.id) }, function (msg) {
            if (!msg.ok) return Toast.error(msg.error);
            Toast.success('Taklif bekor qilindi'); RcTeam.render();
          });
        });
      };
    });

    // Jamoadan chiqish (A'zo jamolar tabidagi kartalar)
    document.querySelectorAll('.btn-team-leave').forEach(function (btn) {
      btn.onclick = function () {
        var tid = parseInt(btn.dataset.tid, 10);
        var tname = btn.dataset.tname || 'jamoa';
        (window.RcSheet ? RcSheet : Modal).confirm('Jamoadan chiqish',
          '«' + tname + '» jamoasidan chiqasizmi? Sizga ulashilgan buyurtmalar endi ko\'rinmaydi.',
          function () {
            WS.send('team.leave', { team_id: tid }, function (msg) {
              if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
              Toast.success('Jamoadan chiqdingiz'); RcTeam.render();
            });
          });
      };
    });

    var saveBtn = document.getElementById('btn-team-save');
    if (saveBtn) saveBtn.onclick = function () {
      var name = (document.getElementById('team-name') || {}).value || '';
      var desc = (document.getElementById('team-desc') || {}).value || '';
      if (!name.trim()) return Toast.error('Nom kiritilmagan');
      WS.send('team.update', { name: name.trim(), description: desc.trim() }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error);
        Toast.success('Saqlandi'); RcTeam.render();
      });
    };

    var addTmpl = document.getElementById('btn-add-tmpl');
    if (addTmpl) addTmpl.onclick = function () { RcTeam._addTemplate(); };
    // Foyda shablonini o'chirish (backend handle_team_delete_template — 2026-07-12 qo'shildi)
    document.querySelectorAll('.btn-del-tmpl').forEach(function (btn) {
      btn.onclick = function () {
        RcSheet.confirm("O'chirish", "Foyda shablonini o'chirasizmi?", function () {
          WS.send('team.delete_template', { id: parseInt(btn.dataset.id) }, function (msg) {
            if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
            Toast.success("O'chirildi"); RcTeam.render();
          });
        });
      };
    });
  },

  _createSheet: function () {
    if (!window.RcSheet || !RcSheet.open) { Toast.info('Tez orada'); return; }
    RcSheet.open('Jamoa yaratish',
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Jamoa nomi *</div><input type="text" name="name" class="rc-input" placeholder="Masalan: BigOne jamoasi"></div>' +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Tavsif</div><textarea name="description" class="rc-input" rows="2"></textarea></div></div>',
      { footer: '<button class="rc-btn-ghost rc-btn-sm" onclick="RcSheet.close()">Bekor</button><button class="rc-btn rc-btn-sm" id="btn-do-create">Yaratish</button>' });
    var b = document.getElementById('btn-do-create');
    if (b) b.onclick = function () {
      var f = RcSheet.getFormData();
      if (!f.name || !f.name.trim()) return Toast.error('Nom kiritilmagan');
      WS.send('team.create', { name: f.name, description: f.description || '' }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error);
        RcSheet.close(); Toast.success('Jamoa yaratildi!'); RcTeam.render();
      });
    };
  },

  _inviteSheet: function () {
    if (!window.RcSheet || !RcSheet.open) { Toast.info('Tez orada'); return; }
    RcSheet.open('A\'zo taklif qilish',
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div style="font-size:12px;color:var(--mut);line-height:1.7">1️⃣ Sherik avval <b>ro‘yxatdan o‘tsin</b> (ilova/bot)<br>2️⃣ Telefonini kiriting<br>3️⃣ Yuboring</div>' +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Telefon yoki username *</div>' +
      '<input type="text" id="team-inv-q" class="rc-input ce-phone-input" inputmode="tel" placeholder="93 042 15 02"></div>' +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Ism (ro‘yxatdan o‘tmagan bo‘lsa)</div>' +
      '<input type="text" id="team-inv-name" class="rc-input" placeholder="Sherik ismi"></div>' +
      '<div style="font-size:12px;color:var(--mut);font-weight:600;margin-top:2px">Rol va ruxsatlar</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' + RcTeam._rolePicker('worker') + '</div>' +
      '<div style="margin-top:6px"><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Foyda foizi (%)</div>' +
      '<input type="number" name="percent" class="rc-input" value="20" min="0" max="100"></div></div>',
      { footer: '<button class="rc-btn-ghost rc-btn-sm" onclick="RcSheet.close()">Bekor</button><button class="rc-btn rc-btn-sm" id="btn-do-invite">Yuborish</button>' });
    Utils.bindPhoneInputs();
    RcTeam._bindRolePicker();
    var b = document.getElementById('btn-do-invite');
    if (b) b.onclick = function () {
      var qEl = document.getElementById('team-inv-q');
      var nEl = document.getElementById('team-inv-name');
      var raw = (qEl && qEl.value || '').trim();
      if (!raw) return Toast.error('Telefon yoki username kiritilmagan');
      // Raqam bo'lsa → normallashtiramiz (+998...); username bo'lsa o'z holicha.
      var query = /\d/.test(raw) && !/[a-zA-Z]/.test(raw) ? Utils.rawPhone(raw) : raw;
      var role = (document.querySelector('input[name=role]:checked') || {}).value || 'worker';
      var pct = parseFloat((document.querySelector('input[name=percent]') || {}).value) || 0;
      WS.send('team.invite', { query: query, name: (nEl && nEl.value || '').trim(), role: role, profit_percent: pct }, function (msg) {
        if (msg.ok) { RcSheet.close(); Toast.success('Taklif yuborildi!'); RcTeam.render(); return; }
        // Ro'yxatdan o'tmagan — taklif havolasi oynasi (2026-09-23)
        if (msg.code === 'USER_NOT_REGISTERED' && msg.invite) { RcTeam._inviteResultSheet(msg.invite); return; }
        Toast.error(msg.error);
      });
    };
  },

  // Ro'yxatdan o'tmagan odamga taklif havolasi (2026-09-23).
  // Odam QO'SHILMAYDI — faqat havola ulashiladi (SMS/Telegram/bot).
  _inviteResultSheet: function (inv) {
    if (!window.RcSheet || !RcSheet.open) { Toast.error('Kechirasiz, bu foydalanuvchi tizimdan ro‘yxatdan o‘tmagan'); return; }
    var esc = Utils.esc;
    var text = inv.text || '';
    var links = inv.links || {};
    var smsHref = 'sms:?body=' + encodeURIComponent(text);
    var tgHref = 'https://t.me/share/url?url=' + encodeURIComponent(links.play || '') + '&text=' + encodeURIComponent(text);
    RcSheet.open('Do‘stingizni taklif qiling',
      '<div style="text-align:center;padding:4px 0 12px"><div style="font-size:38px;margin-bottom:8px">📩</div>' +
      '<div style="font-size:14px;font-weight:800;margin-bottom:6px;color:var(--pch,#f59e0b)">Kechirasiz, bu foydalanuvchi tizimdan ro‘yxatdan o‘tmagan</div>' +
      '<div style="font-size:12px;color:var(--mut);line-height:1.7">Ro‘yxatdan o‘tmaguncha jamoaga qo‘sha olmaysiz.<br>Taklif havolasini yuboring — ro‘yxatdan o‘tsa,<br>avtomatik jamoangizga qo‘shiladi.</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<a href="' + smsHref + '" class="rc-btn rc-btn-sm" style="text-align:center;text-decoration:none;padding:11px">📩 SMS orqali yuborish</a>' +
      '<a href="' + tgHref + '" target="_blank" class="rc-btn rc-btn-sm" style="text-align:center;text-decoration:none;padding:11px;background:#229ED9">✈️ Telegram orqali yuborish</a>' +
      '<a href="' + esc(links.bot || '') + '" target="_blank" class="rc-btn-ghost rc-btn-sm" style="text-align:center;text-decoration:none;padding:11px">🤖 Botni ochish</a>' +
      '</div>',
      { footer: '<button class="rc-btn-ghost rc-btn-sm" id="btn-inv-close">Yopish</button>' });
    var c = document.getElementById('btn-inv-close');
    if (c) c.onclick = function () { RcSheet.close(); RcTeam.render(); };
  },

  // Rol tanlash kartalari (radio + capability) — tahrir va taklifда qayta ishlatiladi
  _rolePicker: function (current) {
    return ['admin', 'worker', 'viewer'].map(function (rk) {
      var rm = RcTeam.ROLE_META[rk];
      var on = current === rk;
      return '<label class="rc-role-opt" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid ' + (on ? rm.color : 'var(--brd)') + ';border-radius:12px;cursor:pointer">' +
        '<input type="radio" name="role" value="' + rk + '"' + (on ? ' checked' : '') + ' style="accent-color:' + rm.color + '">' +
        '<span style="font-size:17px">' + rm.icon + '</span>' +
        '<div style="flex:1"><div style="font-size:13px;font-weight:700;color:' + rm.color + '">' + rm.label + '</div>' +
        '<div style="font-size:11px;color:var(--mut)">' + rm.can + '</div></div></label>';
    }).join('');
  },

  _editMember: function (userId) {
    if (!window.RcSheet || !RcSheet.open) { Toast.info('Tez orada'); return; }
    var d = RcTeam._data; if (!d || !d.team) return;
    var m = d.team.members.find(function (x) { return x.user_id === userId; });
    if (!m) return;
    RcSheet.open("A'zo — " + Utils.esc(m.name),
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div style="font-size:12px;color:var(--mut);font-weight:600">Rol va ruxsatlar</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' + RcTeam._rolePicker(m.role) + '</div>' +
      '<div style="margin-top:6px"><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Foyda foizi (%)</div>' +
      '<input type="number" name="percent" class="rc-input" value="' + (m.profit_percent || 0) + '" min="0" max="100"></div></div>',
      { footer: '<button class="rc-btn-ghost rc-btn-sm" onclick="RcSheet.close()">Bekor</button><button class="rc-btn rc-btn-sm" id="btn-do-edit-m">Saqlash</button>' });
    RcTeam._bindRolePicker();
    var b = document.getElementById('btn-do-edit-m');
    if (b) b.onclick = function () {
      var role = (document.querySelector('input[name=role]:checked') || {}).value || m.role;
      var pct = parseFloat((document.querySelector('input[name=percent]') || {}).value) || 0;
      WS.send('team.update_member', { user_id: userId, role: role, profit_percent: pct }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error);
        RcSheet.close(); Toast.success('Saqlandi'); RcTeam.render();
      });
    };
  },

  // Radio tanlanganда tanlangan kartaning ramkasini yoritadi
  _bindRolePicker: function () {
    var opts = document.querySelectorAll('.rc-role-opt');
    opts.forEach(function (lb) {
      var r = lb.querySelector('input[name=role]');
      if (!r) return;
      r.addEventListener('change', function () {
        opts.forEach(function (x) {
          var xr = x.querySelector('input[name=role]');
          var rm = RcTeam.ROLE_META[xr && xr.value] || {};
          x.style.borderColor = (xr && xr.checked) ? (rm.color || 'var(--acc)') : 'var(--brd)';
        });
      });
    });
  },

  _addTemplate: function () {
    if (!window.RcSheet || !RcSheet.open) { Toast.info('Tez orada'); return; }
    var lines = [{ role_label: 'Usta', percent: 35 }, { role_label: 'Ishchi', percent: 20 }, { role_label: 'Ishchi', percent: 20 }, { role_label: 'Ishchi', percent: 20 }];
    RcSheet.open('Foyda shabloni',
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Shablon nomi</div><input type="text" name="tmpl_name" class="rc-input" value="Standart"></div>' +
      '<div id="tmpl-lines"></div>' +
      '<button class="rc-btn-ghost rc-btn-sm" id="btn-tmpl-add-line" style="align-self:flex-start">+ Qator</button></div>',
      { footer: '<button class="rc-btn-ghost rc-btn-sm" onclick="RcSheet.close()">Bekor</button><button class="rc-btn rc-btn-sm" id="btn-tmpl-save">Saqlash</button>' });
    function renderLines() {
      var h = '';
      lines.forEach(function (ln, i) {
        h += '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center"><input type="text" class="rc-input tl-label" data-i="' + i + '" value="' + Utils.esc(ln.role_label) + '" placeholder="Lavozim" style="flex:2">' +
          '<input type="number" class="rc-input tl-pct" data-i="' + i + '" value="' + ln.percent + '" style="width:70px;text-align:center"><span style="font-size:12px;color:var(--mut)">%</span></div>';
      });
      var el = document.getElementById('tmpl-lines'); if (el) el.innerHTML = h;
    }
    renderLines();
    var addLine = document.getElementById('btn-tmpl-add-line');
    if (addLine) addLine.onclick = function () { lines.push({ role_label: '', percent: 0 }); renderLines(); };
    var save = document.getElementById('btn-tmpl-save');
    if (save) save.onclick = function () {
      document.querySelectorAll('.tl-label').forEach(function (el) { lines[parseInt(el.dataset.i)].role_label = el.value; });
      document.querySelectorAll('.tl-pct').forEach(function (el) { lines[parseInt(el.dataset.i)].percent = parseFloat(el.value) || 0; });
      var nameEl = document.querySelector('[name="tmpl_name"]');
      var name = (nameEl && nameEl.value.trim()) || 'Standart';
      WS.send('team.save_template', { name: name, lines: lines }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error);
        RcSheet.close(); Toast.success('Shablon saqlandi'); RcTeam.render();
      });
    };
  }
};
window.RcTeam = RcTeam;
RC_PAGES['/team'] = function () { RcTeam.render(); };
