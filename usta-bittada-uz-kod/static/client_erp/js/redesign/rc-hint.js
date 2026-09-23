/* client_erp/js/redesign/rc-hint.js — YANGI FUNKSIYA IZOHLARI (2026-08-05)

   Foydalanuvchi talabi:
     «qo'shilgan funksiyalarni kirgan odamga huddi ko'rsatkichday tushuntirib
      berish va ko'rsatish kerak — oynaga kirganda qanday ishlashi va nima
      qilishni o'rgatadi. Har bir yangi funksiya tagida yozilgan bo'lsin,
      tushunarli va sodda qilib.»

   QANDAY ISHLAYDI
     1. Har yangi funksiya tagida kichik izoh qatori chiqadi:
            ⓘ Bu nima? — bir og'iz tushuntirish
        Bosilsa to'liq matn ochiladi (nima, nega, qanday ishlatish).
     2. Har izoh BIR MARTA «yangi» belgisi bilan chiqadi (🆕 nuqta).
        Foydalanuvchi o'qigach — belgi o'chadi (localStorage).
     3. Izohni butunlay yopish mumkin — «Tushundim» tugmasi.

   NEGA localStorage
     Server yozuvi kerak emas — bu shaxsiy o'qildi/o'qilmadi holati,
     moliyaga aloqasi yo'q. Brauzer tozalansa izoh qayta chiqadi (zarari yo'q).

   YANGI IZOH QO'SHISH
     HINTS ga bitta yozuv qo'shiladi, keyin kerakli joyda:
        RcHint.html('kalit')
     chaqiriladi. Boshqa hech narsa kerak emas.
*/
(function () {
  'use strict';

  var LS_KEY = 'rcHintSeen_v1';

  /* ── Izohlar bazasi ──────────────────────────────────────────────────
     title — qisqa savol ko'rinishida (foydalanuvchi shu bilan tanishadi)
     body  — to'liq javob: nima, nega, qanday ishlatish
     date  — qo'shilgan sana (yangi-eskini ajratish uchun)              */
  var HINTS = {

    contracts_tab: {
      title: 'Shartnomalar bo\'limi nima?',
      body:
        '<b>Nima:</b> har bir buyurtma alohida hisob-kitob bo\'lib ko\'rinadi — '
        + 'do\'kon chekiga o\'xshab.<br><br>'
        + '<b>Nega kerak:</b> «Tranzaksiyalar»da hamma zakazning puli aralash '
        + 'yotadi. Bu yerda esa har zakaz o\'zicha: qancha kelishdingiz, qancha '
        + 'oldingiz, qancha sarfladingiz, qancha foyda.<br><br>'
        + '<b>Qanday o\'qiladi:</b><br>'
        + 'Kelishdik → Oldik → Mijoz qarzi → Sarfladik → <b>FOYDA</b><br><br>'
        + '<b>Kartani bosing</b> — xarajat qaysi kategoriyaga ketgani ochiladi.',
      date: '2026-08-04',
    },

    debtors: {
      title: 'Kim bizga qarzdor — bu qayerdan?',
      body:
        '<b>Nima:</b> mijoz kelishilgan pulni to\'liq bermagan bo\'lsa, '
        + 'tizim buni <b>o\'zi hisoblaydi</b>. Siz hech narsa yozmaysiz.<br><br>'
        + '<b>Formula:</b> Kelishdik − Oldik = Qarz<br><br>'
        + '<b>Ikki xil qarz bor:</b><br>'
        + '🔴 <b>Qizil</b> — tizim hisoblagani (muddat yo\'q)<br>'
        + '🟠 <b>Sariq</b> — siz yozgan muddatli qarz (sana bilan)<br><br>'
        + 'Mijoz bilan muddat kelishsangiz «Muddatli qarz yozish» tugmasidan '
        + 'yozing — shunda tizim muddatni kuzatadi.',
      date: '2026-08-05',
    },

    money_change: {
      title: 'Pul o\'zgarishi nima? (avval «Kassa foyda» edi)',
      body:
        '<b>Nima:</b> bu oy hamyoningizga pul qo\'shildimi yoki kamaydimi.<br>'
        + 'Formula: kelgan pul − ketgan pul<br><br>'
        + '<b>⚠️ Bu FOYDA EMAS.</b> Nomi shuning uchun o\'zgartirildi.<br><br>'
        + '<b>Nega foyda emas:</b> mijoz bergan zaklad — hali <b>ishlanmagan</b> '
        + 'pul, siz uni mebel bilan qaytarasiz. Material esa boshqa zakazga '
        + 'ketgan bo\'lishi mumkin.<br><br>'
        + '<b>Haqiqiy foyda:</b> «Zakazlardan qolgan foyda» kartasi yoki «Shartnomalar» bo\'limi.',
      date: '2026-08-05',
    },

    owner_left: {
      title: 'Menga qoldi — bu nima?',
      body:
        '<b>Nima:</b> foydadan ustalarga bergandan keyin sizga qolgan qism.<br><br>'
        + '<b>Formula:</b><br>'
        + 'Zakazlardan qolgan foyda − Ustalarga berildi = <b>Menga qoldi</b><br><br>'
        + '<b>Nega ikki raqam:</b> «Zakazlardan qolgan foyda» — qancha <b>ishlab topdingiz</b>. '
        + '«Menga qoldi» — shundan qanchasi <b>sizniki</b>. Ikkalasi ham kerak.<br><br>'
        + 'Manfiy chiqsa — bu davrda foydadan ko\'proq yechilgan degani '
        + '(farq oldingi oylardan). Xato emas.',
      date: '2026-08-05',
    },

    three_numbers: {
      title: 'Foyda, Menga qoldi, Balans — nega har xil?',
      body:
        'Bu <b>uchta boshqa-boshqa</b> raqam. Har xil bo\'lishi <b>normal</b>.<br><br>'
        + '<b>💰 Zakazlardan qolgan foyda</b> — «bu davrda qancha <u>ishlab topdim</u>».<br>'
        + 'Formula: shartnoma − xarajat. Faqat <b>topshirilgan</b> zakazlar.<br><br>'
        + '<b>🧑‍💼 Menga qoldi</b> — «shundan qanchasi <u>menga tegdi</u>».<br>'
        + 'Formula: Zakazlardan qolgan foyda − ustalarga berilgan.<br><br>'
        + '<b>⚖ Balans</b> — «hozir <u>hamyonimda</u> qancha bor».<br>'
        + 'Formula: barcha kirim − chiqim − yechim. Oy filtriga bog\'liq emas.<br><br>'
        + '<b>Misol:</b> 111 mln ishlab topdingiz, 99 mln ustalarga berdingiz → '
        + 'sizga 12 mln qoldi, hamyonda esa 32 mln (boshqa harakatlar bilan).<br><br>'
        + '<b>Bosh sahifadagi «Foyda»</b> — boshidan beri, faqat o\'z '
        + 'zakazlaringiz. Moliyadagi «Hammasi» esa ulashilganlarni ham sanaydi — '
        + 'shuning uchun kattaroq.',
      date: '2026-08-05',
    },

    ai_chat: {
      title: 'AI yordamchi nima qila oladi?',
      body:
        '<b>✨ tugmani bosing</b> — yozishmali chat ochiladi.<br>'
        + 'Ichidagi 🎤 tugma — ovozli rejim.<br><br>'
        + '<b>Nima so\'rash mumkin:</b><br>'
        + '• «Balans nima?» — tushuntirib beradi<br>'
        + '• «Nega foydam kam?» — <b>ma\'lumotingizni tekshirib</b> muammoni '
        + 'ko\'rsatadi<br>'
        + '• «Kim menga qarzdor?» — ro\'yxat beradi<br>'
        + '• «Moliya sahifasini och» — o\'zi ochadi<br><br>'
        + '<b>Muhim:</b> AI raqamlarni <b>o\'zidan to\'qimaydi</b> — '
        + 'hammasi sizning haqiqiy ma\'lumotingizdan olinadi.',
      date: '2026-08-05',
    },
  };

  function seen() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function markSeen(key) {
    try {
      var s = seen(); s[key] = 1;
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch (e) { /* localStorage yo'q — zarari yo'q */ }
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* Izoh qatorini qaytaradi (HTML). Kalit topilmasa — bo'sh satr. */
  function html(key) {
    var hi = HINTS[key];
    if (!hi) return '';
    var isNew = !seen()[key];
    return '<div class="rc-hint" data-hint="' + esc(key) + '">'
      + '<button type="button" class="rc-hint-btn">'
      +   (isNew ? '<span class="rc-hint-dot"></span>' : '')
      +   '<i class="fas fa-info-circle"></i> ' + esc(T(hi.title))
      + '</button>'
      + '<div class="rc-hint-body" style="display:none">'
      +   T(hi.body)
      +   '<button type="button" class="rc-hint-ok">' + T('Tushundim') + '</button>'
      + '</div></div>';
  }

  /* Sahifa chizilgandan keyin chaqiriladi — hodisalarni bog'laydi. */
  function bind(root) {
    var scope = root || document;
    scope.querySelectorAll('.rc-hint').forEach(function (el) {
      var key = el.dataset.hint;
      var btn = el.querySelector('.rc-hint-btn');
      var body = el.querySelector('.rc-hint-body');
      var ok = el.querySelector('.rc-hint-ok');
      if (!btn || !body) return;
      btn.onclick = function () {
        var open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        if (!open) {
          markSeen(key);
          var dot = btn.querySelector('.rc-hint-dot');
          if (dot) dot.remove();
        }
      };
      if (ok) ok.onclick = function (e) {
        e.stopPropagation();
        body.style.display = 'none';
        markSeen(key);
        var dot = btn.querySelector('.rc-hint-dot');
        if (dot) dot.remove();
      };
    });
  }

  function injectStyle() {
    if (document.getElementById('rc-hint-style')) return;
    var css =
      '.rc-hint{margin:8px 0 2px}' +
      '.rc-hint-btn{display:inline-flex;align-items:center;gap:6px;background:none;' +
      'border:none;cursor:pointer;color:var(--mut,#9B9AA3);font-size:11.5px;' +
      'font-family:inherit;padding:3px 0;text-align:left;position:relative}' +
      '.rc-hint-btn:hover{color:var(--acc-text,#DCF262)}' +
      '.rc-hint-dot{width:6px;height:6px;border-radius:50%;background:var(--pch,#F5A48B);' +
      'flex:none;animation:rcHintPulse 1.8s ease-in-out infinite}' +
      '@keyframes rcHintPulse{0%,100%{opacity:1}50%{opacity:.35}}' +
      '.rc-hint-body{margin-top:7px;padding:11px 13px;border-radius:12px;' +
      'background:var(--sfc2,#29282F);border:1px dashed var(--brd,rgba(255,255,255,.12));' +
      'font-size:12px;line-height:1.65;color:var(--txt,#F5F4F7)}' +
      '.rc-hint-ok{display:block;margin-top:10px;padding:7px 16px;border:none;' +
      'border-radius:9px;background:var(--acc,#DCF262);color:var(--acc-ink,#1B1A20);' +
      'font-weight:700;font-size:12px;cursor:pointer;font-family:inherit}';
    var st = document.createElement('style');
    st.id = 'rc-hint-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  try { injectStyle(); } catch (e) { /* noop */ }

  window.RcHint = {
    html: html,
    bind: bind,
    HINTS: HINTS,
    /* Barcha izohlarni «yangi» holatiga qaytarish (sinov uchun) */
    reset: function () { try { localStorage.removeItem(LS_KEY); } catch (e) {} },
  };
})();
