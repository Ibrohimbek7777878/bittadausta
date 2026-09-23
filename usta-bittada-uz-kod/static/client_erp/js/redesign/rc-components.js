/* client_erp/js/redesign/rc-components.js — Umumiy redesign komponentlar.
   Boshqa rc-* sahifalar ishlatadi:
     window.RcSheet  — pastdan chiquvchi bottom-sheet (modal o'rniga)
     window.Modal    — eski modal.js API'siga mos alias (open/close/confirm/getFormData)
     window.RcCoinBurst / window.CoinBurst — 🪙 coin animatsiya (XP award/revoke)
   redesign.css: .rc-sheet-backdrop/.rc-sheet/.rc-sheet-handle + @keyframes rc-coinpop.
   spa_redesign.html modal.js/coin-burst.js YUKLAMAYDI — shu fayl ularni ta'minlaydi. */
(function () {
  'use strict';

  /* ═══════════════ RcSheet — bottom sheet ═══════════════ */
  var RcSheet = {
    _el: null,
    _onClose: null,
    _esc: null,

    open: function (title, bodyHtml, opts) {
      opts = opts || {};
      this.close();
      var bd = document.createElement('div');
      bd.className = 'rc-sheet-backdrop';
      bd.id = 'rc-sheet-bd';
      var footer = opts.footer
        ? '<div class="rc-sheet-footer" style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">' + opts.footer + '</div>'
        : '';
      var head = title
        ? '<div style="font-weight:800;font-size:16px;margin-bottom:12px;color:var(--txt)">' + title + '</div>'
        : '';
      bd.innerHTML = '<div class="rc-sheet" role="dialog" aria-modal="true">' +
        '<div class="rc-sheet-handle"></div>' + head +
        '<div class="rc-sheet-body">' + bodyHtml + '</div>' + footer +
        '</div>';
      // `opts.locked` — MAJBURIY oyna (2026-08-15): fon bosilganda ham,
      // Escape bosilganda ham yopilmaydi. Faqat ish tugagach kod o'zi
      // `RcSheet.close()` chaqiradi. Yangi buyurtmada foyda foizini
      // kiritish majburiy bo'lgani uchun kerak.
      if (!opts.locked) {
        bd.addEventListener('click', function (e) { if (e.target === bd) RcSheet.close(); });
      }
      document.body.appendChild(bd);
      document.body.classList.add('modal-open');
      this._el = bd;
      this._onClose = opts.onClose || null;
      if (!opts.locked) {
        this._esc = function (e) { if (e.key === 'Escape') RcSheet.close(); };
        document.addEventListener('keydown', this._esc);
      }
      requestAnimationFrame(function () {
        if (opts.autofocus === false) return;
        var inp = bd.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select');
        if (inp) inp.focus();
      });
      return bd;
    },

    close: function () {
      if (!this._el) return;
      this._el.remove();
      this._el = null;
      document.body.classList.remove('modal-open');
      if (this._esc) { document.removeEventListener('keydown', this._esc); this._esc = null; }
      var oc = this._onClose; this._onClose = null;
      if (oc) oc();
    },

    // Modal.confirm mosligi
    confirm: function (title, msg, onConfirm) {
      this.open(title, '<p style="font-size:14px;color:var(--txt);margin:0">' + msg + '</p>', {
        footer: '<button class="rc-btn-ghost rc-btn-sm" onclick="RcSheet.close()">Bekor</button>' +
          '<button class="rc-btn rc-btn-sm" id="rc-sheet-ok">Tasdiqlash</button>'
      });
      var ok = document.getElementById('rc-sheet-ok');
      if (ok) ok.onclick = function () { RcSheet.close(); if (onConfirm) onConfirm(); };
    },

    // Modal.getFormData mosligi — [name] maydonlarni yig'adi
    getFormData: function () {
      if (!this._el) return {};
      var d = {};
      this._el.querySelectorAll('[name]').forEach(function (el) {
        if (el.type === 'checkbox') d[el.name] = el.checked;
        else if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; }
        else d[el.name] = el.value;
      });
      return d;
    }
  };

  window.RcSheet = RcSheet;
  // Eski Modal API alias — modal.js redesignda yuklanmaydi
  if (!window.Modal) window.Modal = RcSheet;

  /* ═══════════════ RcCoinBurst — 🪙 coin animatsiya ═══════════════ */
  var RcCoinBurst = {
    _origin: function () {
      var c = document.getElementById('rc-coins') || document.getElementById('rc-toasts');
      if (c) { var r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      return { x: window.innerWidth / 2, y: 60 };
    },

    _spawn: function (n, lost) {
      var o = this._origin();
      var layer = document.createElement('div');
      layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:500;overflow:hidden';
      document.body.appendChild(layer);
      var count = Math.max(6, Math.min(18, parseInt(n) || 8));
      for (var i = 0; i < count; i++) {
        (function (i) {
          var el = document.createElement('div');
          el.textContent = '🪙';
          var dx = (Math.random() * 2 - 1) * 90;
          var dur = 720 + Math.random() * 520;
          el.style.cssText = 'position:absolute;left:' + o.x + 'px;top:' + o.y + 'px;' +
            'margin-left:' + dx + 'px;font-size:' + (16 + Math.random() * 10) + 'px;' +
            'transform:translate(-50%,-50%);will-change:transform,opacity;' +
            'animation:rc-coinpop ' + dur + 'ms cubic-bezier(.2,.8,.3,1) forwards';
          if (lost) el.style.animationDirection = 'reverse';
          var delay = i * 45;
          setTimeout(function () { layer.appendChild(el); }, delay);
          setTimeout(function () { if (el.parentNode) el.remove(); }, delay + dur + 100);
        })(i);
      }
      setTimeout(function () { if (layer.parentNode) layer.remove(); }, count * 45 + 1600);
    },

    award: function (n) { this._spawn(n, false); },
    lost: function (n) { this._spawn(n, true); }
  };

  window.RcCoinBurst = RcCoinBurst;
  // mini-erp.js xp.awarded/xp.revoked'da `CoinBurst.award()/lost()` chaqiradi —
  // redesignda coin-burst.js yo'q, shuning uchun alias beramiz.
  if (!window.CoinBurst) window.CoinBurst = RcCoinBurst;

  // Qo'shimcha: WS listener ulash (mavjud coin-burst.js uslubi). mini-erp.js
  // xp.* ni _listeners'gacha yetmasdan qayta ishlaydi, shuning uchun bu odatda
  // ishga tushmaydi — lekin xavfsizlik uchun (double-fire early-return bilan yo'q).
  if (window.WS && WS.on) {
    WS.on('xp.awarded', function (m) { RcCoinBurst.award((m.data && m.data.coins) || 8); });
    WS.on('xp.revoked', function (m) { RcCoinBurst.lost((m.data && m.data.coins) || 8); });
  }
})();
