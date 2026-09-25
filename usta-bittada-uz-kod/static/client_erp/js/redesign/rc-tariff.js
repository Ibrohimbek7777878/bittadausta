/* client_erp/js/redesign/rc-tariff.js — Tarif / Feature-gate qatlami (redesign).

   Ikki global beradi:
     window.Features  — funksiya-ochish tekshiruvi (has/gate). Ro'yxat
       __USER_DATA__.features'da keladi; ro'yxat YO'Q bo'lsa hammasi ochiq deb
       hisoblanadi (backend tarif joriy qilgunча regress bo'lmasin).
     window.RcTariff  — #/tarif sahifasi (joriy tarif + mavjud tariflar) va
       bloklangan funksiya uchun "upgrade" bottom-sheet.

   Mavjud global (Router, WS, Toast, RcSheet, Utils, Skeleton, RC_PAGES) ga
   tayanadi. Backend page.tarif hodisasi HALI bo'lmasligi mumkin — shuning uchun
   har WS xatosi/bo'sh javob CRASH emas, "Tariflar tez orada" ko'rinishi bilan
   yumshoq tugaydi. */
window.RC_PAGES = window.RC_PAGES || {};

/* ═══════════════════════════════════════════════════════════════════════
   FEATURES — funksiya-ochish (feature flag)
   ═══════════════════════════════════════════════════════════════════════ */
window.Features = {
  // __USER_DATA__ backenddan keladi; ro'yxat yo'q (null) = cheklovsiz (hamma ochiq)
  _list: (window.__USER_DATA__ && window.__USER_DATA__.features) || null,
  _plan: (window.__USER_DATA__ && window.__USER_DATA__.plan) || null,

  // Funksiya ruxsat berilganmi? Ro'yxat bo'lmasa — doim ha.
  has: function (key) {
    if (!this._list) return true;
    return this._list.indexOf(key) >= 0;
  },

  // Ruxsat bo'lsa true; bo'lmasa upgrade oynasini ochib false qaytaradi.
  // Ishlatish: if (!Features.gate('ai_analytics')) return;
  gate: function (key) {
    if (this.has(key)) return true;
    RcTariff.upgradeSheet(key);
    return false;
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   RC TARIFF — #/tarif sahifasi + upgrade sheet
   ═══════════════════════════════════════════════════════════════════════ */
var RcTariff = {
  // Funksiya kalitlari uchun ko'rsatiladigan chiroyli nomlar (fallback: kalitning o'zi)
  FEATURE_LABELS: {
    ai_analytics: 'AI tahlil',
    analytics: 'Tahlil (analitika)',
    finance: 'Moliya',
    team: 'Jamoa',
    mebelcity: 'MebelCity ulanishi',
    templates: 'Shablonlar',
    export: 'Eksport',
    unlimited_orders: 'Cheksiz buyurtma'
  },

  _label: function (key) {
    return this.FEATURE_LABELS[key] || key;
  },

  // Limit kaliti uchun mos emoji (fallback: 📊)
  _limitIcon: function (key) {
    var m = {
      orders_month: '📦', orders: '📦',
      customers: '👤', clients: '👤',
      team_members: '👥', team: '👥', members: '👥',
      storage: '💾', files: '📁'
    };
    return m[key] || '📊';
  },

  _money: function (v) {
    if (window.Utils && Utils.money) return Utils.money(v);
    return (parseInt(v, 10) || 0).toLocaleString('ru-RU');
  },

  _esc: function (s) {
    if (window.Utils && Utils.esc) return Utils.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  },

  // ── Sahifa ─────────────────────────────────────────────────────────────
  render: function () {
    var app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = (window.Skeleton && Skeleton.list) ? Skeleton.list(3) : '';

    // Backend page.tarif HALI bo'lmasligi mumkin — xato/bo'sh bo'lsa yumshoq tugat.
    if (!(window.WS && WS.send)) {
      app.innerHTML = RcTariff._soon();
      return;
    }
    var done = false;
    var safety = setTimeout(function () {
      if (!done) { done = true; app.innerHTML = RcTariff._soon(); }
    }, 8000);

    WS.send('page.tarif', {}, function (msg) {
      if (done) return;
      done = true; clearTimeout(safety);
      if (!msg || !msg.ok || !msg.data) {
        app.innerHTML = RcTariff._soon();
        return;
      }
      var d = msg.data;
      var plans = (d && d.plans) || [];
      var current = (d && d.current) || Features._plan || null;
      var usage = (d && d.usage) || [];
      if (!plans.length) {
        app.innerHTML = RcTariff._soon(current);
        return;
      }
      app.innerHTML = RcTariff.template(plans, current, usage);
      RcTariff.bind();
    });
  },

  // "Tez orada" holati (xato yoki bo'sh) — joriy tarif bo'lsa ko'rsatamiz
  _soon: function (current) {
    current = current || Features._plan || null;
    var h = '<div data-screen>';
    h += '<div style="font-weight:800;font-size:15px;padding:0 2px">Tarif</div>';
    if (current) h += RcTariff._currentCard(current);
    h += '<div class="rc-empty"><div class="rc-empty-ic">🏷️</div>' +
      '<div style="font-weight:700;color:var(--txt)">Tariflar tez orada</div>' +
      '<div style="margin-top:4px">Tarif rejalari hozircha tayyorlanmoqda</div></div>';
    h += '</div>';
    return h;
  },

  template: function (plans, current, usage) {
    var h = '<div data-screen>';

    // Joriy tarif kartasi
    h += '<div style="font-weight:800;font-size:15px;padding:0 2px">Joriy tarif</div>';
    h += RcTariff._currentCard(current);

    // Joriy foydalanish paneli (kvota) — cheklangan limitlar bo'lsa
    h += RcTariff._usagePanel(usage);

    // Mavjud tariflar
    h += '<div style="font-weight:800;font-size:15px;padding:8px 2px 0">Mavjud tariflar</div>';
    plans.forEach(function (p, i) { h += RcTariff._planCard(p, current, i); });

    h += '</div>';
    return h;
  },

  // ── Joriy foydalanish paneli ────────────────────────────────────────────
  // usage: [{ key,label,unit,limit,used,remaining,unlimited,exceeded }]
  // Faqat cheklangan (unlimited:false) limitlar progress-bar bilan ko'rsatiladi.
  // Barcha limit cheksiz bo'lsa panel umuman chizilmaydi (backward-safe).
  _usagePanel: function (usage) {
    if (!usage || !usage.length) return '';
    var esc = RcTariff._esc;
    var limited = [];
    for (var k = 0; k < usage.length; k++) {
      if (usage[k] && !usage[k].unlimited) limited.push(usage[k]);
    }
    if (!limited.length) return '';

    var h = '<div style="font-weight:800;font-size:15px;padding:10px 2px 0">📊 Joriy foydalanish</div>';
    h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:14px">';

    limited.forEach(function (u) {
      var used = parseInt(u.used, 10) || 0;
      var limit = parseInt(u.limit, 10) || 0;
      var exceeded = !!u.exceeded || (limit > 0 && used > limit);
      var pct = (limit > 0) ? Math.min(100, Math.round((used / limit) * 100)) : (used > 0 ? 100 : 0);
      var barCol = exceeded ? 'var(--red,var(--danger,#e5484d))'
                            : (pct >= 85 ? '#f5a524' : 'var(--acc)');
      var unit = u.unit ? (' ' + esc(u.unit)) : '';

      h += '<div>';
      // Sarlavha qatori: label + used / limit
      h += '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:5px">';
      h += '<span style="font-size:13px;font-weight:600;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(u.label || u.key || '') + '</span>';
      h += '<span style="font-size:12px;font-weight:700;flex:none;color:' + (exceeded ? 'var(--red,var(--danger,#e5484d))' : 'var(--mut)') + '">' +
        used + ' / ' + limit + unit + '</span>';
      h += '</div>';
      // Progress-bar
      h += '<div style="height:7px;border-radius:5px;background:var(--card2,var(--line));overflow:hidden">';
      h += '<div style="height:100%;width:' + pct + '%;border-radius:5px;background:' + barCol + ';transition:width .3s"></div>';
      h += '</div>';
      h += '</div>';
    });

    h += '</div>';
    return h;
  },

  _currentCard: function (current) {
    var esc = RcTariff._esc;
    if (!current) {
      return '<div class="rc-card rc-card-lg" style="display:flex;align-items:center;gap:14px">' +
        '<div class="rc-avatar" style="width:48px;height:48px;font-size:20px">🏷️</div>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:800;font-size:16px">Bepul (Start)</div>' +
        '<div style="font-size:12px;color:var(--mut);margin-top:3px">Boshlang\'ich reja</div></div></div>';
    }
    var name = current.name || 'Start';
    var expires = current.expires || current.expires_at || '';
    var h = '<div class="rc-card rc-card-lg" style="display:flex;align-items:center;gap:14px;border-color:color-mix(in srgb,var(--acc) 45%,var(--brd))">';
    h += '<div class="rc-avatar" style="width:48px;height:48px;font-size:20px;background:var(--acc)">👑</div>';
    h += '<div style="flex:1;min-width:0">';
    h += '<div style="font-weight:800;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(name) + '</div>';
    if (expires) {
      h += '<div style="font-size:12px;color:var(--mut);margin-top:3px">⏳ Amal qiladi: ' + esc(expires) + '</div>';
    } else {
      h += '<div style="font-size:12px;color:var(--mut);margin-top:3px">Faol reja</div>';
    }
    h += '</div>';
    h += '<span class="rc-chip-acc rc-chip" style="flex:none">Faol</span>';
    h += '</div>';
    return h;
  },

  _planCard: function (p, current, i) {
    var esc = RcTariff._esc;
    var dly = Math.min((i || 0) * 0.05, 0.4);
    var curName = current && current.name;
    var isCurrent = curName && p.name && (String(curName) === String(p.name) || p.id != null && current.id != null && p.id === current.id);

    var days = parseInt(p.period_days, 10) || 0;
    var period = days ? (days % 30 === 0 ? (days / 30) + ' oy' : days + ' kun') : '';

    var h = '<div class="rc-card" style="display:flex;flex-direction:column;gap:12px;' +
      (isCurrent ? 'border-color:color-mix(in srgb,var(--acc) 55%,var(--brd));' : '') +
      'animation:rc-screenin .38s cubic-bezier(.2,.8,.3,1) both;animation-delay:' + dly + 's">';

    // Sarlavha + narx
    h += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">';
    h += '<div style="min-width:0"><div style="font-weight:800;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.name) + '</div>';
    if (period) h += '<div style="font-size:11px;color:var(--mut);margin-top:2px">' + esc(period) + '</div>';
    h += '</div>';
    h += '<div style="text-align:right;flex:none"><div style="font-weight:800;font-size:17px;color:var(--acc-text)">' + RcTariff._money(p.price_uzs) + '</div>' +
      '<div style="font-size:11px;color:var(--mut)">so\'m</div></div>';
    h += '</div>';

    // Funksiya chiplari
    var feats = p.features || p.feature_labels || [];
    if (feats.length) {
      h += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
      feats.forEach(function (f) {
        var label = (typeof f === 'string') ? (RcTariff.FEATURE_LABELS[f] || f) : (f && (f.label || f.name || f.key)) || '';
        if (label) h += '<span class="rc-chip">✓ ' + esc(label) + '</span>';
      });
      h += '</div>';
    }

    // Limit (kvota) chiplari — p.limits massividan (backward-safe: yo'q bo'lsa o'tkazib yuboriladi)
    var lims = p.limits || [];
    if (lims.length) {
      h += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
      lims.forEach(function (lim) {
        if (!lim) return;
        var ic = RcTariff._limitIcon(lim.key);
        var lbl = esc(lim.label || lim.key || '');
        var txt;
        if (lim.unlimited || parseInt(lim.limit, 10) === -1) {
          txt = '♾️ ' + lbl + ': Cheksiz';
        } else {
          var unit = lim.unit ? (' ' + esc(lim.unit)) : '';
          txt = ic + ' ' + lbl + ': ' + (parseInt(lim.limit, 10) || 0) + unit;
        }
        h += '<span class="rc-chip" style="background:var(--card2,var(--card));border-color:var(--line)">' + txt + '</span>';
      });
      h += '</div>';
    }

    // Tugma
    if (isCurrent) {
      h += '<button class="rc-btn-ghost rc-btn-sm" disabled style="width:100%;opacity:.7">Joriy reja</button>';
    } else {
      var pid = (p.id != null) ? p.id : '';
      h += '<button class="rc-btn rc-btn-sm rc-tariff-pick" data-id="' + esc(pid) + '" data-name="' + esc(p.name) + '" style="width:100%">' +
        (curName ? 'Yangilash' : 'Tanlash') + '</button>';
    }

    h += '</div>';
    return h;
  },

  bind: function () {
    // Tanishtiruv + izohlar (2026-08-06)
    if (window.RcTour && RcTour.auto) { try { RcTour.auto('tarif'); } catch (e) {} }
    if (window.RcHint && RcHint.bind) { try { RcHint.bind(); } catch (e) {} }
    document.querySelectorAll('.rc-tariff-pick').forEach(function (btn) {
      btn.onclick = function () {
        var pid = parseInt(btn.dataset.id) || 0;
        var label = btn.dataset.name || 'Tarif';
        if (window.RcPay && RcPay.buy) RcPay.buy('plan_purchase', pid, label);
        else if (window.Toast) Toast.info('Tez orada');
      };
    });
  },

  // ── Upgrade sheet — bloklangan funksiya bosilganda ──────────────────────
  upgradeSheet: function (key) {
    var name = RcTariff._label(key);
    if (!(window.RcSheet && RcSheet.open)) {
      if (window.Toast && Toast.info) Toast.info('🔒 «' + name + '» tarifingizda yo\'q');
      return;
    }
    var body = '<div style="text-align:center;padding:6px 0 4px">' +
      '<div style="font-size:38px;margin-bottom:10px">🔒</div>' +
      '<div style="font-weight:800;font-size:16px">Bu funksiya tarifingizda yo\'q</div>' +
      '<div style="font-size:13px;color:var(--acc-text);font-weight:700;margin-top:6px">' + RcTariff._esc(name) + '</div>' +
      '<div style="font-size:12px;color:var(--mut);margin:8px 0 18px">Yuqoriroq tarifga o\'tib bu imkoniyatni oching</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="rc-btn-ghost" id="rc-tariff-cancel" style="flex:1">Yopish</button>' +
        '<button class="rc-btn" id="rc-tariff-go" style="flex:1"><i class="fas fa-crown"></i> Tariflar</button>' +
      '</div></div>';
    RcSheet.open('Tarif', body, {});
    var go = document.getElementById('rc-tariff-go');
    var cancel = document.getElementById('rc-tariff-cancel');
    if (go) go.onclick = function () {
      if (RcSheet.close) RcSheet.close();
      if (window.Router && Router.go) Router.go('/tarif');
    };
    if (cancel) cancel.onclick = function () { if (RcSheet.close) RcSheet.close(); };
  }
};

window.RcTariff = RcTariff;
RC_PAGES['/tarif'] = function () { RcTariff.render(); };
