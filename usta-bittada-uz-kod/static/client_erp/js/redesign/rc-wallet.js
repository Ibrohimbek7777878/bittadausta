/* client_erp/js/redesign/rc-wallet.js — 🪙 Tanga (wallet) qatlami (redesign).

   Uch global beradi:
     window.Wallet   — joriy balans + header'dagi 🪙 pill (#rc-wallet-pill).
       __USER_DATA__.coins'dan boshlanadi. Wallet.set(n) balansni yangilaydi va
       pill'ni qayta chizadi (element bo'lmasa jim o'tadi).
     window.RcWallet — #/tanga sahifasi (balans + tanga paketlari + tarix).
     window.Coins    — AI/aksiya funksiyalari «tanga yetarli emas» qaytarganda
       chaqiriladi ({error:'coins', need, balance}) — upsell bottom-sheet ochadi.

   Mavjud global (Router, WS, Toast, RcSheet, Utils, Skeleton, RC_PAGES) ga
   tayanadi. Backend page.tanga hodisasi HALI bo'lmasligi mumkin — har WS
   xatosi/bo'sh javob CRASH emas: «Tanga paketlari tez orada» ko'rinishi bilan
   yumshoq tugaydi, balans esa baribir ko'rsatiladi. */
window.RC_PAGES = window.RC_PAGES || {};

/* ═══════════════════════════════════════════════════════════════════════
   WALLET — joriy balans + header pill
   ═══════════════════════════════════════════════════════════════════════ */
window.Wallet = {
  balance: (window.__USER_DATA__ && window.__USER_DATA__.coins) || 0,

  // Balansni o'rnat va pill'ni yangila. render() ochiq bo'lsa balans kartasi
  // ham yangilanadi.
  set: function (n) {
    this.balance = parseInt(n, 10) || 0;
    this.paint();
    var big = document.getElementById('rc-wallet-balance');
    if (big) big.textContent = this.balance;
    return this.balance;
  },

  // Header'dagi 🪙 pill (mavjud #rc-coins / #rc-coins-val + ixtiyoriy #rc-wallet-pill)
  paint: function () {
    // Billing LIVE emas — tanga pill ko'rsatilmaydi (real chek tayyor bo'lmaguncha)
    if (!window.RC_BILLING_LIVE) { var cx = document.getElementById('rc-coins'); if (cx) cx.style.display = 'none'; return; }
    var el = document.getElementById('rc-wallet-pill');
    if (el) el.innerHTML = '🪙 ' + (this.balance || 0);
    var cv = document.getElementById('rc-coins-val');
    if (cv) cv.textContent = (this.balance || 0);
    var cp = document.getElementById('rc-coins');
    if (cp) cp.style.display = '';
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   RC WALLET — #/tanga sahifasi
   ═══════════════════════════════════════════════════════════════════════ */
var RcWallet = {
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

  _when: function (v) {
    if (!v) return '';
    if (window.Utils && Utils.datetime) {
      var t = Utils.datetime(v);
      if (t) return t;
    }
    return RcWallet._esc(v);
  },

  // ── Sahifa ─────────────────────────────────────────────────────────────
  render: function () {
    var app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = (window.Skeleton && Skeleton.list) ? Skeleton.list(3) : '';

    // Backend page.tanga HALI bo'lmasligi mumkin — WS yo'q bo'lsa yumshoq tugat
    // (balans baribir ko'rinadi).
    if (!(window.WS && WS.send)) {
      app.innerHTML = RcWallet._soon();
      return;
    }
    var done = false;
    var safety = setTimeout(function () {
      if (!done) { done = true; app.innerHTML = RcWallet._soon(); }
    }, 8000);

    WS.send('page.tanga', {}, function (msg) {
      if (done) return;
      done = true; clearTimeout(safety);
      if (!msg || !msg.ok || !msg.data) {
        app.innerHTML = RcWallet._soon();
        return;
      }
      var d = msg.data;
      // Backend joriy balansni qaytarsa — sinxronlaymiz (pill + karta)
      if (d.balance != null) Wallet.set(d.balance);
      else if (d.coins != null) Wallet.set(d.coins);

      var packs = (d && d.packs) || [];
      if (!packs.length) {
        app.innerHTML = RcWallet._soon(d);
        return;
      }
      app.innerHTML = RcWallet.template(packs, d);
      RcWallet.bind();
    });
  },

  // Balans katta kartasi (har doim ko'rsatiladi)
  _balanceCard: function () {
    return '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;align-items:center;gap:6px;' +
      'border-color:color-mix(in srgb,var(--acc) 45%,var(--brd));' +
      'background:radial-gradient(120% 140% at 50% -20%,color-mix(in srgb,var(--acc) 16%,var(--sfc)),var(--sfc))">' +
      '<div style="font-size:12px;color:var(--mut);font-weight:700;letter-spacing:.02em">Sizning balans</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:34px;line-height:1">🪙</span>' +
        '<span id="rc-wallet-balance" style="font-weight:800;font-size:38px;line-height:1;color:var(--acc-text)">' + (Wallet.balance || 0) + '</span>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--mut)">tanga</div>' +
      '</div>';
  },

  // «Tez orada» holati (xato/bo'sh) — balans baribir ko'rsatiladi
  _soon: function (d) {
    var h = '<div data-screen>';
    h += '<div style="font-weight:800;font-size:15px;padding:0 2px">🪙 Tanga</div>';
    h += RcWallet._balanceCard();
    h += '<div class="rc-empty"><div class="rc-empty-ic">🪙</div>' +
      '<div style="font-weight:700;color:var(--txt)">Tanga paketlari tez orada</div>' +
      '<div style="margin-top:4px">Tanga sotib olish tez orada ochiladi</div></div>';
    h += RcWallet._ledger(d);
    h += '</div>';
    return h;
  },

  template: function (packs, d) {
    var h = '<div data-screen>';

    // Balans
    h += '<div style="font-weight:800;font-size:15px;padding:0 2px">🪙 Tanga</div>';
    h += RcWallet._balanceCard();

    // Paketlar
    h += '<div style="font-weight:800;font-size:15px;padding:8px 2px 0">Tanga paketlari</div>';
    packs.forEach(function (p, i) { h += RcWallet._packCard(p, i); });

    // Tarix (ixtiyoriy)
    h += RcWallet._ledger(d);

    h += '</div>';
    return h;
  },

  _packCard: function (p, i) {
    var esc = RcWallet._esc;
    var dly = Math.min((i || 0) * 0.05, 0.4);
    var color = p.color || 'var(--acc)';
    var bonus = parseInt(p.bonus_coins, 10) || 0;
    var base = parseInt(p.coins, 10) || 0;
    var total = (p.total_coins != null) ? (parseInt(p.total_coins, 10) || 0) : (base + bonus);
    var pid = (p.id != null) ? p.id : '';

    var h = '<div class="rc-card" style="display:flex;flex-direction:column;gap:12px;' +
      'animation:rc-screenin .38s cubic-bezier(.2,.8,.3,1) both;animation-delay:' + dly + 's">';

    // Sarlavha + narx
    h += '<div style="display:flex;align-items:center;gap:12px">';
    h += '<div style="width:44px;height:44px;border-radius:14px;flex:none;display:flex;align-items:center;justify-content:center;font-size:22px;background:' + esc(color) + ';color:var(--acc-ink)">🪙</div>';
    h += '<div style="flex:1;min-width:0">';
    h += '<div style="font-weight:800;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.name || (total + ' tanga')) + '</div>';
    h += '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">';
    h += '<span style="font-size:13px;font-weight:800;color:var(--acc-text)">🪙 ' + total + '</span>';
    if (bonus > 0) h += '<span class="rc-chip-acc rc-chip" style="font-size:10px">+' + bonus + ' bonus</span>';
    h += '</div></div>';
    h += '<div style="text-align:right;flex:none"><div style="font-weight:800;font-size:16px">' + RcWallet._money(p.price_uzs) + '</div>' +
      '<div style="font-size:11px;color:var(--mut)">so\'m</div></div>';
    h += '</div>';

    // Tugma
    h += '<button class="rc-btn rc-btn-sm rc-wallet-buy" data-id="' + esc(pid) + '" data-name="' + esc(p.name || '') + '" style="width:100%">Sotib olish</button>';

    h += '</div>';
    return h;
  },

  // Tarix — cb.data.ledger[] bo'lsa oxirgi 10 harakat
  _ledger: function (d) {
    var rows = (d && d.ledger) || [];
    if (!rows.length) return '';
    var esc = RcWallet._esc;
    var h = '<div style="font-weight:800;font-size:15px;padding:8px 2px 0">Tarix</div>';
    h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:0;padding:4px 0">';
    rows.slice(0, 10).forEach(function (r, i) {
      var amt = parseInt(r.amount, 10) || 0;
      var pos = amt >= 0;
      var sign = pos ? '+' : '−';
      var clr = pos ? 'var(--acc)' : 'var(--pch)';
      h += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px' + (i ? ';border-top:1px solid var(--brd)' : '') + '">';
      h += '<div style="width:32px;height:32px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;font-size:14px;background:var(--sfc2)">' + (pos ? '🪙' : '💸') + '</div>';
      h += '<div style="flex:1;min-width:0">';
      h += '<div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.reason || r.kind || '—') + '</div>';
      var meta = RcWallet._when(r.created_at || r.date || r.when);
      if (meta) h += '<div style="font-size:11px;color:var(--mut);margin-top:2px">' + meta + '</div>';
      h += '</div>';
      h += '<div style="font-weight:800;font-size:14px;color:' + clr + ';flex:none">' + sign + Math.abs(amt) + '</div>';
      h += '</div>';
    });
    h += '</div>';
    return h;
  },

  bind: function () {
    document.querySelectorAll('.rc-wallet-buy').forEach(function (btn) {
      btn.onclick = function () {
        var pid = parseInt(btn.dataset.id) || 0;
        var label = btn.dataset.name || 'Tanga paketi';
        if (window.RcPay && RcPay.buy) RcPay.buy('coin_topup', pid, label);
        else if (window.Toast) Toast.info('Tez orada');
      };
    });
  }
};

window.RcWallet = RcWallet;
RC_PAGES['/tanga'] = function () {
  // Billing LIVE emas — tanga sahifasi ochilmaydi (real chek tayyor bo'lmaguncha)
  if (!window.RC_BILLING_LIVE) { if (window.Router) Router.go('/'); return; }
  RcWallet.render();
};

/* ═══════════════════════════════════════════════════════════════════════
   COINS — «tanga yetarli emas» upsell (AI funksiya {error:'coins',...} qaytarsa)
   ═══════════════════════════════════════════════════════════════════════ */
window.Coins = {
  // need(action, cost, balance): cost — kerakli tanga, balance — mavjud (yo'q
  // bo'lsa Wallet.balance). RcSheet bo'lmasa Toast bilan yumshoq tugaydi.
  need: function (action, cost, balance) {
    var c = parseInt(cost, 10) || 0;
    var b = (balance != null) ? (parseInt(balance, 10) || 0) : (window.Wallet ? Wallet.balance : 0);
    var msg = 'Bu amal uchun ' + c + ' tanga kerak (sizda ' + b + ').';

    if (!(window.RcSheet && RcSheet.open)) {
      if (window.Toast && Toast.info) Toast.info('🪙 Tanga yetarli emas — ' + msg);
      return;
    }
    RcSheet.open('🪙 Tanga yetarli emas',
      '<div style="text-align:center;padding:4px 0 2px">' +
        '<div style="font-size:38px;margin-bottom:10px">🪙</div>' +
        '<div style="font-size:13px;color:var(--txt)">' + RcWallet._esc(msg) + '</div>' +
      '</div>',
      { footer: '<button class="rc-btn-ghost rc-btn-sm" onclick="RcSheet.close()">Yopish</button>' +
        '<button class="rc-btn rc-btn-sm" onclick="RcSheet.close();Router.go(\'/tanga\')">Tanga sotib olish</button>' }
    );
  }
};
