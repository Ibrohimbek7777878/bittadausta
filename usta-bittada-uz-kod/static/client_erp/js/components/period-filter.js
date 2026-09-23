/* client_erp/js/components/period-filter.js — Professional davr filtri (ESKI "Craft
   Light" dizayn, ce- uslub). v2 dagi RcPeriod'ning egizagi.
   Shu oy (default) / O'tgan oy / Aniq oy (YYYY-MM) / Davr (sanadan-sanagacha) / Yil / Hammasi.

   API:
     var st = PeriodFilter.init();                       // {period:'month', ym, date_from, date_to}
     el.innerHTML = PeriodFilter.html(st, monthsObj);    // ce- uslub HTML
     PeriodFilter.bind(container, st, monthsObj, onChange);
     WS.send('page.x', PeriodFilter.query(st), cb);      // backend parametri (finance/analytics)
     PeriodFilter.inRange('2026-07-03', st)              // client-side filtr (orders/clients)
*/
var PeriodFilter = {
  MN: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  MNS: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'],
  PRESETS: [['month', 'Shu oy'], ['last_month', "O‘tgan oy"], ['year', 'Yil'], ['all', 'Hammasi']],

  init: function () { return { period: 'month', ym: null, date_from: null, date_to: null }; },

  _pad: function (n) { return (n < 10 ? '0' : '') + n; },
  _ymd: function (dt) { return dt.getFullYear() + '-' + PeriodFilter._pad(dt.getMonth() + 1) + '-' + PeriodFilter._pad(dt.getDate()); },
  mlabel: function (ym, short) { var p = ym.split('-'); return (short ? PeriodFilter.MNS : PeriodFilter.MN)[parseInt(p[1], 10) - 1] + ' ' + p[0]; },

  label: function (st) {
    if (st.ym) return PeriodFilter.mlabel(st.ym);
    if (st.period === 'custom') return (st.date_from || '?') + ' — ' + (st.date_to || '?');
    return { month: 'Shu oy', last_month: "O‘tgan oy", year: 'Shu yil', all: 'Hammasi' }[st.period] || 'Shu oy';
  },

  // Backend parametri (finance/analytics get_period_bounds bilan mos)
  query: function (st) {
    if (st.ym) return { ym: st.ym };
    if (st.period === 'custom') return { period: 'custom', date_from: st.date_from, date_to: st.date_to };
    return { period: st.period };
  },

  // Client-side chegara (YYYY-MM-DD) — orders/clients JS filtri uchun. {start,end} yoki null.
  bounds: function (st) {
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    var mstart = function (yy, mm) { return new Date(yy, mm, 1); };
    var mend = function (yy, mm) { var e = new Date(yy, mm + 1, 0); return e > now ? now : e; };
    if (st.ym) { var p = st.ym.split('-'); var yy = +p[0], mm = +p[1] - 1; return { start: PeriodFilter._ymd(mstart(yy, mm)), end: PeriodFilter._ymd(mend(yy, mm)) }; }
    if (st.period === 'all') return null;
    if (st.period === 'custom') return { start: st.date_from, end: st.date_to };
    if (st.period === 'year') return { start: y + '-01-01', end: PeriodFilter._ymd(now) };
    if (st.period === 'last_month') { var lm = m - 1, ly = y; if (lm < 0) { lm = 11; ly = y - 1; } return { start: PeriodFilter._ymd(mstart(ly, lm)), end: PeriodFilter._ymd(mend(ly, lm)) }; }
    // month (default)
    return { start: PeriodFilter._ymd(mstart(y, m)), end: PeriodFilter._ymd(mend(y, m)) };
  },

  // Sana (ISO yoki YYYY-MM-DD) tanlangan davrga tushadimi?
  inRange: function (dateStr, st) {
    var b = PeriodFilter.bounds(st);
    if (!b) return true; // Hammasi
    var d = (dateStr || '').slice(0, 10);
    if (!d) return false;
    return d >= b.start && d <= b.end;
  },
  // Joriy davr — SHU OY (yoki last_month/ym) mi? (tugamagan buyurtma carry-over uchun)
  isCurrentMonth: function (st) {
    if (st.period !== 'month' || st.ym) return false;
    return true;
  },

  html: function (st, monthsObj) {
    var h = '<div class="pf-bar" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;align-items:center">';
    PeriodFilter.PRESETS.forEach(function (p) {
      var on = !st.ym && st.period === p[0];
      h += '<button class="ce-btn ce-btn-sm pf-preset' + (on ? ' ce-btn-primary' : ' ce-btn-secondary') + '" data-per="' + p[0] + '" style="font-size:12px;padding:6px 12px;white-space:nowrap">' + p[1] + '</button>';
    });
    var ms = Object.keys(monthsObj || {}).sort().reverse();
    if (ms.length) {
      h += '<select class="ce-input pf-month" style="font-size:12px;padding:6px 8px;width:auto;flex:none;' + (st.ym ? 'border-color:var(--accent);color:var(--accent)' : '') + '">';
      h += '<option value="">Aniq oy…</option>';
      ms.forEach(function (m) { h += '<option value="' + m + '"' + (st.ym === m ? ' selected' : '') + '>' + PeriodFilter.mlabel(m, true) + '</option>'; });
      h += '</select>';
    }
    var con = st.period === 'custom';
    h += '<button class="ce-btn ce-btn-sm pf-custom' + (con ? ' ce-btn-primary' : ' ce-btn-secondary') + '" style="font-size:12px;padding:6px 10px;white-space:nowrap">📅 ' + (con ? PeriodFilter.label(st) : 'Davr') + '</button>';
    h += '</div>';
    return h;
  },

  bind: function (container, st, monthsObj, onChange) {
    var root = container || document;
    root.querySelectorAll('.pf-preset').forEach(function (b) {
      b.onclick = function () { st.period = b.dataset.per; st.ym = null; st.date_from = st.date_to = null; onChange(); };
    });
    var sel = root.querySelector('.pf-month');
    if (sel) sel.onchange = function () {
      if (sel.value) { st.ym = sel.value; st.period = 'month'; } else { st.ym = null; st.period = 'month'; }
      onChange();
    };
    var cb = root.querySelector('.pf-custom');
    if (cb) cb.onclick = function () { PeriodFilter._custom(st, onChange); };
  },

  _custom: function (st, onChange) {
    var today = PeriodFilter._ymd(new Date());
    var f = st.date_from || today, t = st.date_to || today;
    var body = '<div style="margin-bottom:10px"><label style="font-size:12px;color:var(--text-muted)">Boshlanish</label>' +
      '<input type="date" id="pf-from" class="ce-input" value="' + f + '" style="width:100%"></div>' +
      '<div style="margin-bottom:6px"><label style="font-size:12px;color:var(--text-muted)">Tugash</label>' +
      '<input type="date" id="pf-to" class="ce-input" value="' + t + '" style="width:100%"></div>';
    if (typeof Modal !== 'undefined' && Modal.open) {
      Modal.open('Davrni tanlash', body, { footer: '<button class="ce-btn ce-btn-primary" id="pf-apply">Qo\'llash</button>' });
      setTimeout(function () {
        var ap = document.getElementById('pf-apply');
        if (ap) ap.onclick = function () {
          var fv = (document.getElementById('pf-from') || {}).value, tv = (document.getElementById('pf-to') || {}).value;
          if (!fv || !tv) { Toast.error('Ikkala sanani tanlang'); return; }
          if (fv > tv) { var x = fv; fv = tv; tv = x; }
          st.period = 'custom'; st.ym = null; st.date_from = fv; st.date_to = tv;
          Modal.close(); onChange();
        };
      }, 50);
    }
  },
};
