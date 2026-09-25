/* client_erp/js/redesign/rc-period.js — Professional davr filtri (barcha sahifa uchun).
   Shu oy (default) / O'tgan oy / Aniq oy (YYYY-MM) / Davr (sanadan-sanagacha) / Yil / Hammasi.
   Foydalanish:
     var st = RcPeriod.init();                    // {period:'month', ym, date_from, date_to}
     html += RcPeriod.html(st, monthsObj);        // panelga qo'shiladi
     RcPeriod.bind(containerEl, st, monthsObj, onChange);  // onChange() → qayta yuklash
     WS.send('page.x', RcPeriod.query(st), cb);   // backend'ga to'g'ri parametr
*/
window.RcPeriod = {
  MN: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  MNS: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'],
  PRESETS: [['month', 'Shu oy'], ['last_month', "O‘tgan oy"], ['year', 'Yil'], ['all', 'Hammasi']],

  init: function () { return { period: 'month', ym: null, date_from: null, date_to: null }; },

  _months: function (mo) { return Object.keys(mo || {}).sort().reverse(); },
  mlabel: function (ym, short) {
    var p = ym.split('-');
    return T((short ? RcPeriod.MNS : RcPeriod.MN)[parseInt(p[1], 10) - 1]) + ' ' + p[0];
  },
  label: function (st) {
    if (st.ym) return RcPeriod.mlabel(st.ym);
    if (st.period === 'custom') return (st.date_from || '?') + ' — ' + (st.date_to || '?');
    var m = { month: 'Shu oy', last_month: "O‘tgan oy", year: 'Shu yil', all: 'Hammasi' };
    return T(m[st.period] || 'Shu oy');
  },
  query: function (st) {
    if (st.ym) return { ym: st.ym };
    if (st.period === 'custom') return { period: 'custom', date_from: st.date_from, date_to: st.date_to };
    return { period: st.period };
  },

  html: function (st, monthsObj) {
    var h = '<div class="rc-tabs rc-period-bar">';
    RcPeriod.PRESETS.forEach(function (p) {
      var on = !st.ym && st.period === p[0];
      h += '<button class="rc-tab rc-per"' + (on ? ' data-on="1"' : '') + ' data-per="' + p[0] + '">' + T(p[1]) + '</button>';
    });
    var ms = RcPeriod._months(monthsObj);
    if (ms.length) {
      h += '<select class="rc-per-month" style="flex:none;height:38px;border-radius:var(--pill);border:1px solid var(--brd);background:' +
           (st.ym ? 'var(--acc);color:var(--acc-ink)' : 'var(--sfc);color:var(--txt)') + ';font-size:13px;font-weight:700;padding:0 12px;cursor:pointer">';
      h += '<option value="">' + T('Aniq oy…') + '</option>';
      ms.forEach(function (m) { h += '<option value="' + m + '"' + (st.ym === m ? ' selected' : '') + '>' + RcPeriod.mlabel(m, true) + '</option>'; });
      h += '</select>';
    }
    var con = st.period === 'custom';
    h += '<button class="rc-tab rc-per-custom"' + (con ? ' data-on="1"' : '') + '>📅 ' + (con ? RcPeriod.label(st) : T('Davr')) + '</button>';
    h += '</div>';
    return h;
  },

  bind: function (container, st, monthsObj, onChange) {
    (container || document).querySelectorAll('.rc-per').forEach(function (b) {
      b.classList.toggle('active', !st.ym && st.period === b.dataset.per);
      b.onclick = function () {
        st.period = b.dataset.per; st.ym = null; st.date_from = st.date_to = null;
        onChange();
      };
    });
    var sel = (container || document).querySelector('.rc-per-month');
    if (sel) sel.onchange = function () {
      if (sel.value) { st.ym = sel.value; st.period = 'month'; }
      else { st.ym = null; st.period = 'month'; }
      onChange();
    };
    var cb = (container || document).querySelector('.rc-per-custom');
    if (cb) { cb.classList.toggle('active', st.period === 'custom'); cb.onclick = function () { RcPeriod._customSheet(st, onChange); }; }
  },

  _customSheet: function (st, onChange) {
    var today = new Date().toISOString().slice(0, 10);
    var f = st.date_from || today, t = st.date_to || today;
    var body = '<div style="display:flex;flex-direction:column;gap:12px">';
    body += '<div><label style="font-size:12px;color:var(--mut);display:block;margin-bottom:4px">Boshlanish sanasi</label>';
    body += '<input type="date" id="rc-per-from" class="rc-input" value="' + f + '"></div>';
    body += '<div><label style="font-size:12px;color:var(--mut);display:block;margin-bottom:4px">Tugash sanasi</label>';
    body += '<input type="date" id="rc-per-to" class="rc-input" value="' + t + '"></div>';
    body += '<button class="rc-btn" id="rc-per-apply" style="width:100%">Qo‘llash</button></div>';
    if (window.RcSheet && RcSheet.open) {
      RcSheet.open('Davrni tanlash', body, {});
      setTimeout(function () {
        var ap = document.getElementById('rc-per-apply');
        if (ap) ap.onclick = function () {
          var fv = (document.getElementById('rc-per-from') || {}).value;
          var tv = (document.getElementById('rc-per-to') || {}).value;
          if (!fv || !tv) { Toast.error('Ikkala sanani tanlang'); return; }
          if (fv > tv) { var x = fv; fv = tv; tv = x; }
          st.period = 'custom'; st.ym = null; st.date_from = fv; st.date_to = tv;
          if (RcSheet.close) RcSheet.close();
          onChange();
        };
      }, 50);
    } else {
      Toast.info('Davr tanlash uchun RcSheet kerak');
    }
  },
};
