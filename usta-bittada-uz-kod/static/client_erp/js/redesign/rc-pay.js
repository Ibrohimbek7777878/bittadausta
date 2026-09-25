/* client_erp/js/redesign/rc-pay.js — 💳 To'lov (payment) qatlami (redesign).

   Bitta global beradi:
     window.RcPay — to'lov helperi (sahifa EMAS, shuning uchun RC_PAGES'ga
       yozilmaydi). Tanga paketi (rc-wallet.js) yoki tarif (rc-tariff.js)
       tugmalari keyin RcPay.buy(...) ni chaqiradi.

   Oqim:
     RcPay.buy(purpose, targetId, label)
        → provayder tanlash bottom-sheet (Payme / Click / Octobank / Multicard)
        → RcPay.start(provider, purpose, targetId, label)
        → WS 'pay.start' → checkout_url:
            • '/mini/pay/sandbox/…'  → sandbox tasdiq sheet → 'pay.sandbox_confirm'
              → Toast.success + Wallet.set(balance) + (agar #/tanga|#/tarif) reload
            • aks holda (real provayder) → window.location = checkout_url

   Barcha WS yo'q / xato holatida Toast.error, hech qachon CRASH emas. RcSheet
   yo'q bo'lsa Toast bilan yumshoq tugaydi. Backend 'pay.*' hodisalari HALI
   bo'lmasligi mumkin — WS.send callback {ok:false,...} qaytarsa ham xato
   Toast'i ko'rsatiladi, dastur yiqilmaydi.

   Mavjud global (WS, Toast, RcSheet, Wallet, Router, STATE, Utils) ga tayanadi. */
(function () {
  'use strict';

  var RcPay = {
    // Qo'llab-quvvatlanadigan to'lov provayderlari
    PROVIDERS: [
      { slug: 'payme',     name: 'Payme',     color: '#33b2e6' },
      { slug: 'click',     name: 'Click',     color: '#00a3e0' },
      { slug: 'octobank',  name: 'Octobank',  color: '#e11b22' },
      { slug: 'multicard', name: 'Multicard', color: '#1a1a2e' }
    ],

    _esc: function (s) {
      if (window.Utils && Utils.esc) return Utils.esc(s);
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },

    _toastErr: function (m) {
      if (window.Toast && Toast.error) Toast.error(m);
    },

    /* ── buy(purpose, targetId, label) — provayder tanlash oynasi ──────────
       purpose  — nima uchun to'lov ('coins' | 'tariff' | ...), backendga uzatiladi
       targetId — paket/reja id (target_id sifatida uzatiladi)
       label    — ko'rsatish uchun summa matni, masalan "150 000 so'm" (ixtiyoriy) */
    buy: function (purpose, targetId, label) {
      var self = this;

      // RcSheet yo'q — yumshoq tugat
      if (!(window.RcSheet && RcSheet.open)) {
        if (window.Toast && Toast.info) Toast.info('To\'lov oynasi hozircha ochilmadi');
        return;
      }

      var body = '<div>';
      body += '<div style="text-align:center;margin-bottom:16px">';
      if (label) {
        body += '<div style="font-size:12px;color:var(--mut);font-weight:700;letter-spacing:.02em">To\'lov summasi</div>';
        body += '<div style="font-weight:800;font-size:24px;color:var(--acc-text);margin-top:2px">' + self._esc(label) + '</div>';
      }
      body += '<div style="font-size:12px;color:var(--mut);margin-top:6px">To\'lov usulini tanlang</div>';
      body += '</div>';

      // FAQAT Payme ulangan (Merchant kassa). Click/Octobank/Multicard hali
      // integratsiya qilinmagan — ular ulangach shu filtr olib tashlanadi.
      var provs = self.PROVIDERS.filter(function (p) { return p.slug === 'payme'; });
      body += '<div style="display:flex;flex-direction:column;gap:10px">';
      provs.forEach(function (pv) {
        body += '<button class="rc-pay-prov" data-slug="' + self._esc(pv.slug) + '" ' +
          'style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:13px 15px;' +
          'border-radius:14px;border:1px solid var(--brd);background:var(--sfc);cursor:pointer;font:inherit">' +
          '<span style="width:38px;height:38px;border-radius:11px;flex:none;display:flex;align-items:center;' +
            'justify-content:center;font-weight:800;font-size:16px;color:#fff;background:' + self._esc(pv.color) + '">' +
            self._esc(String(pv.name).charAt(0)) + '</span>' +
          '<span style="flex:1;font-weight:700;font-size:15px;color:var(--txt)">' + self._esc(pv.name) + '</span>' +
          '<i class="fas fa-chevron-right" style="color:var(--mut);font-size:12px"></i>' +
          '</button>';
      });
      body += '</div>';

      RcSheet.open('To\'lov usuli', body, {});

      // Provayder tugmalarini ulash
      document.querySelectorAll('.rc-pay-prov').forEach(function (btn) {
        btn.onclick = function () {
          var slug = btn.getAttribute('data-slug');
          self.start(slug, purpose, targetId, label);
        };
      });
    },

    /* ── start(provider, purpose, targetId, label) ─────────────────────────
       WS 'pay.start' → checkout_url. Sandbox bo'lsa tasdiq sheet, aks holda
       real provayderga yo'naltirish. */
    start: function (provider, purpose, targetId, label) {
      var self = this;

      if (!(window.WS && WS.send)) {
        self._toastErr('Server bilan aloqa yo\'q');
        return;
      }

      WS.send('pay.start', {
        provider: provider,
        purpose: purpose,
        target_id: targetId
      }, function (msg) {
        if (!msg || !msg.ok) {
          self._toastErr((msg && msg.error) || 'To\'lovni boshlab bo\'lmadi');
          return;
        }
        var d = msg.data || {};
        var url = d.checkout_url;
        if (!url) {
          self._toastErr('To\'lov havolasi olinmadi');
          return;
        }
        // Sandbox (test) — real pul yo'q
        if (String(url).indexOf('/mini/pay/sandbox/') === 0) {
          self._sandbox(d, label);
          return;
        }
        // Real provayder (Payme va h.k.) — checkout sahifasini YANGI oynada ochamiz
        // va to'lov holatini poll qilamiz (receipts.check). SPA holati saqlanadi.
        var win = null;
        try { win = window.open(url, '_blank'); } catch (e) { win = null; }
        if (!win) {
          // Popup bloklandi yoki Telegram webview — to'g'ridan-to'g'ri yo'naltiramiz.
          try { window.location.href = url; return; } catch (e2) {
            self._toastErr('To\'lov sahifasi ochilmadi'); return;
          }
        }
        if (window.Toast && Toast.info) Toast.info('To\'lov oynasi ochildi — to\'lovni yakunlang');
        // ~3 daqiqa davomida har 3s da tekshiramiz. To'langach pollStatus o'zi
        // Wallet.set + sahifa reload qiladi.
        self.pollStatus(d.payment_id, function (paid) {
          if (paid && window.Toast && Toast.success) Toast.success('To\'lov muvaffaqiyatli qabul qilindi!');
        }, { max: 60, interval: 3000 });
      });
    },

    // Sandbox tasdiq oynasi
    _sandbox: function (d, label) {
      var self = this;
      var pid = d.payment_id;

      // RcSheet yo'q — to'g'ridan-to'g'ri tasdiqlaymiz
      if (!(window.RcSheet && RcSheet.open)) {
        self._sandboxConfirm(pid);
        return;
      }

      var body = '<div style="text-align:center;padding:2px 0 4px">';
      body += '<div style="font-size:40px;margin-bottom:8px">🧪</div>';
      body += '<div style="font-weight:800;font-size:16px;color:var(--txt)">Sandbox to\'lov</div>';
      body += '<div style="font-size:12px;color:var(--mut);margin-top:4px">test — real pul yo\'q</div>';
      if (label) {
        body += '<div style="font-weight:800;font-size:20px;color:var(--acc-text);margin-top:12px">' + self._esc(label) + '</div>';
      }
      body += '</div>';

      RcSheet.open('🧪 Sandbox to\'lov', body, {
        footer: '<button class="rc-btn-ghost rc-btn-sm" onclick="RcSheet.close()">Bekor</button>' +
          '<button class="rc-btn rc-btn-sm" id="rc-pay-sandbox-ok">To\'ldirishni tasdiqlash</button>'
      });

      var ok = document.getElementById('rc-pay-sandbox-ok');
      if (ok) ok.onclick = function () {
        ok.disabled = true;
        ok.textContent = 'Tasdiqlanmoqda…';
        self._sandboxConfirm(pid);
      };
    },

    // Sandbox to'lovni tasdiqlash (backendda balansni to'ldiradi)
    _sandboxConfirm: function (pid) {
      var self = this;

      if (!(window.WS && WS.send)) {
        self._toastErr('Server bilan aloqa yo\'q');
        return;
      }

      WS.send('pay.sandbox_confirm', { payment_id: pid }, function (msg) {
        if (!msg || !msg.ok) {
          self._toastErr((msg && msg.error) || 'Tasdiqlab bo\'lmadi');
          return;
        }
        var d = msg.data || {};

        if (window.Toast && Toast.success) Toast.success(d.message || 'To\'lov muvaffaqiyatli');

        // Balans qaytsa — pill + karta yangilanadi
        if (d.balance != null && window.Wallet && Wallet.set) Wallet.set(d.balance);

        // Tanga qo'shilgan bo'lsa — coin animatsiyasi (ixtiyoriy)
        var added = parseInt(d.coins_added, 10) || 0;
        if (added > 0 && window.CoinBurst && CoinBurst.award) {
          try { CoinBurst.award(added); } catch (e) {}
        }

        if (window.RcSheet && RcSheet.close) RcSheet.close();

        // #/tanga yoki #/tarif ochiq bo'lsa — sahifani qayta yuklab yangilaymiz
        self._reloadPayPage();
      });
    },

    // Joriy sahifa #/tanga yoki #/tarif bo'lsa — qayta render
    _reloadPayPage: function () {
      var cur = (window.STATE && STATE.currentPage) ||
        (location.hash ? location.hash.slice(1) : '');
      if (cur !== '/tanga' && cur !== '/tarif') return;
      if (window.Router && Router.navigate) Router.navigate(cur, true);
      else if (window.Router && Router.go) Router.go(cur);
    },

    /* ── pollStatus(paymentId, onDone, opts) — ixtiyoriy holat tekshiruvi ───
       Real provayder qaytgach (webhook) to'lov holatini so'rab turadi.
       onDone(paid<bool>, msg) chaqiriladi. */
    pollStatus: function (paymentId, onDone, opts) {
      var self = this;
      opts = opts || {};
      var max = parseInt(opts.max, 10) || 20;
      var interval = parseInt(opts.interval, 10) || 3000;
      var n = 0;

      if (!(window.WS && WS.send)) {
        if (onDone) onDone(false, null);
        return;
      }

      function tick() {
        n++;
        WS.send('pay.status', { payment_id: paymentId }, function (msg) {
          var st = (msg && msg.ok && msg.data && msg.data.status) || null;
          if (st === 'paid' || st === 'success' || st === 'confirmed') {
            var d = msg.data || {};
            if (d.balance != null && window.Wallet && Wallet.set) Wallet.set(d.balance);
            self._reloadPayPage();
            if (onDone) onDone(true, msg);
            return;
          }
          if (st === 'failed' || st === 'cancelled' || st === 'canceled') {
            if (onDone) onDone(false, msg);
            return;
          }
          if (n >= max) { if (onDone) onDone(false, msg); return; }
          setTimeout(tick, interval);
        });
      }
      tick();
    }
  };

  window.RcPay = RcPay;
})();
