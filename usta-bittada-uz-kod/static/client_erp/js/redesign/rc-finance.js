/* client_erp/js/redesign/rc-finance.js — Redesign Moliya (real page.finance).
   Ko'rinish qatlami yangi; ma'lumot/WS mavjud finance.js bilan bir xil manba:
     WS.send('page.finance', {period, [date_from,date_to]})  → {stats, records, debts, monthly, months, ...}
   Interaktiv amal (Kirim/Chiqim, Yechish, To'lash, detal) — RcSheet bo'lsa
   o'sha bilan, bo'lmasa Toast.info('Tez orada') bilan degrade qiladi. */
window.RC_PAGES = window.RC_PAGES || {};

var RcFinance = {
  _data: null,
  _st: null,       // RcPeriod holati {period, ym, date_from, date_to}
  _tab: 'records',
  _tabOpen: true,     // aktiv tab tanasi ochiqmi (qayta bosilsa yopiladi)
  _cPage: 1,          // shartnomalar sahifasi (5 tadan)
  _search: '',

  // record_type → ko'rinish (ikon + kvadrat rangi + ishora)
  TYPES: {
    income:        { label: 'Kirim',          ic: '↓',  bg: 'var(--acc)',  pos: true },
    expense:       { label: 'Chiqim',         ic: '↑',  bg: 'var(--pch)',  pos: false },
    withdrawal:    { label: 'Pul yechish',    ic: '💰', bg: 'var(--lav)',  pos: false },
    debt_given:    { label: 'Qarz berish',    ic: '📤', bg: 'var(--pch)',  pos: false },
    debt_received: { label: 'Qarz olish',     ic: '📥', bg: 'var(--cyan)', pos: true },
    debt_paid:     { label: "Qarz to‘lash", ic: '✅', bg: 'var(--acc)', pos: true },
  },
  CAT: { material: 'Material', service: 'Xizmat', transport: 'Transport', furniture: 'Furnitura', mebelcity: 'MebelCity', other: 'Boshqa', income_return: '↩ Kirim qaytarish', expense_return: '↩ Chiqim qaytarish' },
  PAY: { cash: 'Naqd', card: 'Karta', transfer: "O‘tkazma" },
  DEBT: { active: ['Faol', 'var(--danger)'], partial: ['Qisman', 'var(--pch)'], paid: ["To‘langan", 'var(--acc)'], written_off: ['Hisobdan chiqarilgan', 'var(--mut)'] },
  PERIODS: [ ['all', 'Hammasi'], ['today', 'Bugun'], ['week', 'Hafta'], ['month', 'Oy'] ],
  _MONTHS: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],

  _periodLabel: function (p) {
    for (var i = 0; i < RcFinance.PERIODS.length; i++) if (RcFinance.PERIODS[i][0] === p) return RcFinance.PERIODS[i][1];
    return 'Hammasi';
  },

  render: function () {
    var app = document.getElementById('app');
    app.innerHTML = Skeleton.list(4);
    RcFinance._st = RcPeriod.init();
    // 2026-09-04: standart "Shu oy" dan "Hammasi"ga o'zgartirilgan edi
    // (oy boshida "Shu oy" 0 ko'rsatib chalkashtirgan). 2026-09-08 —
    // foydalanuvchi qaytarishni so'radi: standart yana "Shu oy"
    // (`RcPeriod.init()` bilan bir xil, qo'shimcha override kerak emas).
    // `RcPeriod.init()` o'zi 'month' qaytaradi — shu bois bu yerda
    // qo'shimcha qator YO'Q, faqat izoh saqlanadi (tarix uchun).
    RcFinance._tab = 'records';
    RcFinance._tabOpen = true;
    RcFinance._cPage = 1;
    RcFinance._cOpen = {};
    RcFinance._search = '';
    RcFinance._reload();
  },

  // Davr almashtirish — hammasi BACKEND'dan qayta yuklanadi (kassa/sof foyda/band
  // pul/records aggregate to'liq). page.finance action o'zgarmaydi.
  _reload: function () {
    RcFinance._search = '';
    RcFinance._cPage = 1;              // davr almashsa — birinchi sahifadan
    WS.send('page.finance', RcPeriod.query(RcFinance._st), function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      RcFinance._data = msg.data;
      STATE.finance = msg.data;
      RcFinance._paint();
    });
  },

  _paint: function () {
    var app = document.getElementById('app');
    app.innerHTML = RcFinance.template(RcFinance._data);
    RcFinance.bind();
  },

  template: function (d) {
    var s = d.stats || {};
    var h = '<div data-screen>';

    // ── H7 (2026-08-04): QABUL QILISH KUTILAYOTGAN ULUSH ──
    // Egasi pulni yechdi, lekin siz hali «Qabul qilaman» bosmagansiz.
    // Kartada: hozirgi balans → qabul qilgandan keyin qancha bo'lishi.
    h += RcFinance._pendingAcceptHtml(d.pending_accept);

    // ── ESLATMA: taqsimlanmagan foyda (2026-08-04) ──
    // Topshirilgan buyurtmada foyda bor, lekin hali bo'lishilmagan.
    // Faqat eslatadi — pul harakatini avtomatlashtirmaydi (H6 bo'lsa ham,
    // avtomatik o'tkazma hali xavfli deb baholangan).
    var uh = d.undistributed_hint;
    if (uh && uh.count) {
      h += '<div id="fin-undist-hint" style="display:flex;align-items:center;gap:12px;'
        + 'padding:12px 14px;background:var(--sfc2);border-radius:16px;cursor:pointer;'
        + 'border-left:3px solid var(--acc)">'
        + '<span style="font-size:22px">💰</span>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-weight:800;font-size:13.5px;color:var(--txt)">Foyda taqsimlanmagan</div>'
        + '<div style="font-size:11.5px;color:var(--mut);margin-top:2px;line-height:1.5">'
        + uh.count + ' ta topshirilgan buyurtmada jami <b>' + Utils.money(uh.total)
        + ' so‘m</b> foyda bor, hali bo‘lishilmagan</div></div>'
        + '<i class="fas fa-chevron-right" style="color:var(--mut);font-size:12px"></i></div>';
    }

    // Professional davr filtri
    h += RcPeriod.html(RcFinance._st, d.months);

    // ── ASOSIY KARTA — 3 katakcha: kirim-chiqim, zakazlardan qolgan foyda,
    // kassa (2026-08-25, foydalanuvchi tasdiqlagan chizma bo'yicha: davr
    // filtridan darhol keyin, «Pul yechish» bilan birga; qolgan bloklarga
    // — hint/Topshirilgan buyurtmalar/Ustalar foydasi — tegilmaydi).
    // Qiymatlar MAVJUD manbadan olinadi — hisob TAKRORLANMAYDI.
    var _sofT = parseInt((d.sof_foyda && d.sof_foyda.total) || 0) || 0;
    var _sofN = (d.sof_foyda && d.sof_foyda.count) || 0;
    // 2026-08-25 (3): «Kirimdan chiqim ayrilgani» pastdagi fin-stats
    // qatoridan BU YERGA ko'chdi — foydalanuvchi talabi bo'yicha uchta
    // katakcha: 1) kirim−chiqim, 2) zakazlardan qolgan foyda, 3) kassa.
    var _flowT = (parseInt(s.total_income) || 0) - (parseInt(s.total_expense) || 0);

    h += '<div class="rc-card rc-card-lg fin-main" style="padding:0;overflow:hidden">';

    // ── TEPA: uchta asosiy raqam (foydalanuvchi belgilagan tartib) ──
    h += '<div style="display:flex;flex-wrap:wrap">';
    h += RcFinance._mainCell('flow', '=', 'Kirim-chiqimdan ayrilgan summa',
          'kirim − chiqim', Utils.money(_flowT),
          _flowT >= 0 ? 'var(--acc-text)' : 'var(--danger)', 'row3');
    h += RcFinance._mainCell('sof', '📁', 'Zakazlardan qolgan foyda',
          _sofN ? (_sofN + ' ta topshirilgan') : 'topshirilgan yo‘q',
          Utils.money(_sofT), _sofT >= 0 ? 'var(--acc-text)' : 'var(--danger)', 'row3');
    // 2026-09-09 (v3, foydalanuvchi tasdiqlagan): Kassa ostatka endi YANA
    // `d.kassa.closing`ga qaytarildi. v2 (_flowT − _sofT, "erkin foyda")
    // BEKOR QILINDI — sabab: bu ikkalasi (Kirim-chiqim va Zakazdan qolgan
    // foyda) FARAZGA asoslangan edi ("butun foyda ustalarga tegishli" deb),
    // haqiqiy yechim yozuvlariga emas. Natijada, agar shu davrda butun
    // foyda allaqachon yechilgan bo'lsa, ikkalasi TASODIFAN teng chiqib,
    // Kassa ostatka "0" ko'rsatardi — garchi jismonan kassada ancha pul
    // (masalan 55 815 000) qolgan bo'lsa ham. `kassa.closing` esa HAQIQIY
    // yechim yozuvlarini (ClientFinanceRecord record_type='withdrawal')
    // ayiradi — shuning uchun tasodifiy nolga tushib qolmaydi, real pul
    // holatini ko'rsatadi. Davr bo'yicha to'g'ri hisoblanadi (backend
    // `kassa` bloki — opening+kirim-chiqim-yechim = closing).
    var _kassaClosing = (d.kassa && d.kassa.closing != null) ? parseInt(d.kassa.closing) || 0 : _flowT - _sofT;
    h += RcFinance._mainCell('kassa', '💰', 'Kassa ostatka',
          'Hozir hamyoningizda bor', Utils.money(_kassaClosing) + ' so‘m',
          _kassaClosing >= 0 ? 'var(--acc-text)' : 'var(--danger)', 'row3');
    h += '</div>';

    // Bosilganda shu yerda ochiladigan sodda tushuntirish
    h += '<div id="fin-main-exp" style="display:none"></div>';
    h += '</div>';

    h += '<div style="display:flex;gap:8px;margin-top:10px">';
    h += '<button class="rc-btn-ghost" id="fin-withdraw" style="flex:1" title="Pul yechish">\uD83D\uDCB0 Pul yechish</button>';
    h += '</div>';

    // ── KASSA kartasi — 2026-08-25: YASHIRILDI (foydalanuvchi talabi) ──
    // Ayni raqamlar eng tepadagi asosiy kartada va u bosilganda ochiladigan
    // sodda tushuntirishda bor edi — bu blok ularni TAKRORLAR edi.
    // `_kassaHtml` funksiyasi kodda qoldi, faqat CHAQIRILMAYDI —
    // qaytarish kerak bo'lsa shu qatorni ochish kifoya.
    // h += RcFinance._kassaHtml(d.kassa || {});

    // ── 👥 SHERIKLIKDAGI FOYDA — bosh ekrandan «Sherikli hisob» tabiga
    // KO'CHIRILDI (2026-08-15, foydalanuvchi qarori): sheriklik bilan
    // bog'liq hamma narsa bitta joyda tursin, bosh ekran tozalansin.
    // Karta o'zi o'zgarmadi — faqat joyi (`_splitHtml` ichida).

    // ── Kartalar qatori: Kirim / Chiqim / Kirimdan chiqim ayrilgani ──────
    // 2026-08-25: «Zakazlardan qolgan foyda» kartasi BU YERDAN olib
    // tashlandi — u endi eng tepadagi asosiy kartada turibdi (takror
    // bo'lmasin). Qolgan uchtasi avvalgidek shu yerda.
    h += RcFinance._statsHtml(s, d.sof_foyda);

    // 2026-08-25: kartalar (hint bilan) va «Topshirilgan buyurtmalar»
    // bloki bir-biriga yopishib turardi — orada joy yo'q edi.
    h += '<div style="height:6px"></div>';

    // ── Sof foyda tafsiloti: qaysi zakazlardan yig'ilgan ──
    h += RcFinance._sofFoydaHtml(d.sof_foyda || {}, d.wip);
    // 👷 Ustalar foydasi drill-down (team.profit.detail)

    h += '<button class="rc-btn-ghost" id="fin-ustalar" style="width:100%"><i class="fas fa-users"></i> 👷 Ustalar foydasi</button>';
    h += '<div id="fin-breakdown" style="display:none"></div>';

    // ── DUBLIKAT TEKSHIRUVI (2026-08-07) ──────────────────────────────
    // Bir xil summa ikki marta yozilgan bo'lsa foyda/balans buziladi.
    // Bu yerda faqat OGOHLANTIRAMIZ — hech narsa avtomatik o'chirilmaydi,
    // qaysi biri ortiqchaligini faqat egasi biladi.
    h += '<div id="fin-dup-slot"></div>';

    // Asosiy tab: Tranzaksiyalar / Shartnomalar / Qarzlar
    // «Shartnomalar» — faqat bayroq yoqilgan akkauntda (backend `contracts`
    // kalitini yubormasa tab umuman chizilmaydi).
    // ── TELEFON (2026-08-17): tab 5 taga yetdi va 360px ekranda siqilib
    // o'qilmas bo'lib qolardi. Endi qator GORIZONTAL SURILADI, har tab
    // o'z matni bo'yicha joy oladi (`flex:none`), sig'sa markazga cho'ziladi.
    h += '<div class="fin-tabbar" style="display:flex;gap:8px;overflow-x:auto;'
      + 'scrollbar-width:none;-ms-overflow-style:none;padding-bottom:2px">';
    h += '<button class="rc-tab fin-tab' + (RcFinance._tab === 'records' ? ' active' : '') + '" data-tab="records" style="flex:1 0 auto;white-space:nowrap;justify-content:center">Tranzaksiyalar</button>';
    if (d.contracts) {
      h += '<button class="rc-tab fin-tab' + (RcFinance._tab === 'contracts' ? ' active' : '') + '" data-tab="contracts" style="flex:1 0 auto;white-space:nowrap;justify-content:center">Shartnomalar <span class="rc-badge" style="background:var(--sfc2);color:var(--mut)">' + (d.contracts.count || 0) + '</span></button>';
    }
    // Badge = hisoblangan qarzdorlar + rasmiy qarzlar.
    // ⚠️ Ilgari FAQAT rasmiy qarzlar sanalardi — tabda «0» turib, ichida
    // 1 ta qarz ko'rinardi (foydalanuvchi 2026-08-05 da xabar berdi).
    var _dn = ((d.contracts && d.contracts.debtors && d.contracts.debtors.length) || 0)
            + ((d.debts && d.debts.length) || 0);
    h += '<button class="rc-tab fin-tab' + (RcFinance._tab === 'debts' ? ' active' : '') + '" data-tab="debts" style="flex:1 0 auto;white-space:nowrap;justify-content:center">Dagovordan qolgan qarzlar <span class="rc-badge" style="background:var(--sfc2);color:' + (_dn ? 'var(--danger)' : 'var(--mut)') + '">' + _dn + '</span></button>';
    // (2026-08-15, moliya TZ §8-S2) YANGI TAB — sheriksiz / sherikli hisob
    if (d.partner_split) {
      // Raqam = sherikli buyurtmalar soni (boshqa tablar bilan bir xil uslub)
      var _sn = (d.partner_split.partner && d.partner_split.partner.count) || 0;
      h += '<button class="rc-tab fin-tab' + (RcFinance._tab === 'split' ? ' active' : '') + '" data-tab="split" style="flex:1 0 auto;white-space:nowrap;justify-content:center">👥 Sherikli hisob <span class="rc-badge" style="background:var(--sfc2);color:' + (_sn ? 'var(--lav-text)' : 'var(--mut)') + '">' + _sn + '</span></button>';
    }
    // 🧰 Ustalar qarzi — o'z tabi (Moliya sahifasining o'zida)
    var _cn = ((d.creditor && d.creditor.items) || []).length;
    h += '<button class="rc-tab fin-tab' + (RcFinance._tab === 'creditor' ? ' active' : '') + '" data-tab="creditor" style="flex:1 0 auto;white-space:nowrap;justify-content:center">🧰 Ustalar qarzi <span class="rc-badge" style="background:var(--sfc2);color:' + (_cn ? 'var(--danger)' : 'var(--mut)') + '">' + _cn + '</span></button>';
    h += '</div>';

    // ── Sheriksiz / Sherikli tab ──
    // ⚠️ Boshqa tablar kabi DOIMO chiziladi va `#tab-split` orqali
    // ko'rsatiladi/yashiriladi. Ilgari faqat `_tab === 'split'` bo'lganda
    // chizilardi, lekin tab bosilganda `_paintTabs()` faqat display'ni
    // o'zgartiradi (qayta render QILMAYDI) — natijada tab yashil bo'lib
    // yonardi-yu, ichi bo'sh qolardi (2026-08-15 foydalanuvchi xabari).
    if (d.partner_split) {
      h += '<div id="tab-split"' + (RcFinance._tab === 'split' ? '' : ' style="display:none"') + '>';
      h += RcFinance._splitHtml(d.partner_split);
      h += '</div>';
    }

    // ── Tranzaksiyalar tab ──
    // ⚠️ 2026-08-05: ICHKI AKKORDEON OLIB TASHLANDI.
    // Ilgari ro'yxat «💵 Kirim va chiqimlar» yig'iladigan blokining ichida
    // edi va holati `localStorage`da saqlanardi. Kimdir bir marta yopsa —
    // Tranzaksiyalar tabini bosganda faqat sarlavha ko'rinib, ro'yxat
    // chiqmasdi → «tab ishlamayapti» bo'lib tuyulardi (foydalanuvchi xabari).
    // Endi tabning O'ZI yig'iladi (fin-tab), ikkinchi qavat kerak emas.
    h += '<div id="tab-records"' + (RcFinance._tab === 'records' ? '' : ' style="display:none"') + '>';
    var _recs = RcFinance._filtered();
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
      + '<span style="font-weight:800;font-size:13.5px">💵 Kirim va chiqimlar</span>'
      + '<span style="flex:1;height:1px;background:var(--line)"></span>'
      + '<span class="rc-chip" id="recs-count" style="flex:none;background:var(--sfc2);color:var(--mut)">' + _recs.length + ' ta</span></div>';
    // Qidiruv
    h += '<div class="rc-search" style="margin-bottom:12px"><i class="fas fa-search" style="color:var(--mut);font-size:13px"></i>';
    h += '<input id="fin-search" type="text" placeholder="Qidiruv: izoh, turi, mijoz, buyurtma..." value="' + Utils.esc(RcFinance._search) + '"></div>';
    // Ro'yxat
    h += '<div id="fin-records" style="display:flex;flex-direction:column;gap:10px">';
    h += RcFinance._recordsHtml(_recs);
    h += '</div>';
    h += '</div>';       // #tab-records

    // ── Shartnomalar tab (2026-08-04) ──
    if (d.contracts) {
      h += '<div id="tab-contracts"' + (RcFinance._tab === 'contracts' ? '' : ' style="display:none"') + '>';
      h += RcFinance._contractsHtml(d.contracts);
      h += '</div>';
    }

    // ── Qarzlar tab ──
    h += '<div id="tab-debts"' + (RcFinance._tab === 'debts' ? '' : ' style="display:none"') + '>';
    h += RcFinance._autoDebtsHtml(d.contracts);
    // ── Rasmiy qarzlar ──
    var _fd = d.debts || [];
    h += '<div style="margin-top:20px;margin-bottom:8px;display:flex;align-items:center;gap:8px">'
      + '<span style="font-weight:800;font-size:13.5px">📝 Muddatli qarzlar</span>'
      + '<span style="flex:1;height:1px;background:var(--line)"></span>'
      + '<span class="rc-chip" style="flex:none;background:var(--sfc2);color:var(--mut)">' + _fd.length + ' ta</span></div>';
    h += '<div style="font-size:11px;color:var(--mut);margin-bottom:10px;line-height:1.5">'
      + '<span style="color:var(--pch-text);font-weight:700">Sariq</span> — buni <b>siz yozasiz</b>: '
      + 'mijoz, summa, muddat. Qisman to\'lasa qoldiq hisoblanadi.</div>';
    if (_fd.length) {
      h += '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:10px">' + RcFinance._debtsHtml(_fd) + '</div>';
    } else {
      h += '<div style="font-size:12px;color:var(--mut);padding:10px 2px">Hozircha yo\'q</div>';
    }
    h += '<button class="rc-btn-ghost rc-btn-sm" id="fin-add-debt" style="width:100%"><i class="fas fa-plus"></i> Muddatli qarz yozish</button>';

    h += '</div>';

    // ── 🧰 USTALAR QARZI — ALOHIDA TAB (2026-08-15 talabi: «ustalar qarzi
    // moliya sahifasida bo'lsin»). Ilgari «Qarzlar» tabining ichida edi va
    // pastda ko'rinmay qolardi.
    h += '<div id="tab-creditor"' + (RcFinance._tab === 'creditor' ? '' : ' style="display:none"') + '>';
    h += RcFinance._creditorHtml(d.creditor);
    h += '</div>';

    h += '</div>';
    return h;
  },

  // ── USTALAR QARZI: BIZ kimga qarzdormiz (do'kon / ustanovchik / shaxs) ──
  // Yuqoridagi «Muddatli qarzlar» — MIJOZ bizga qarzdor (debitor).
  // Bu blok teskari yo'nalish (kreditor) — kassaga/balansga QO'SHILMAYDI,
  // faqat ko'rsatiladi (TZ-Moliya-Qayta-Qurish-2026-08-15 §F4/§F5).
  _creditorHtml: function (cr) {
    var money = Utils.money;
    cr = cr || { total: '0', items: [] };
    var items = cr.items || [];
    var ICON = { dokon: '🏪', ustanovchik: '🔧', shaxs: '👤', boshqa: '📌' };
    var h = '<div style="margin-top:22px;margin-bottom:8px;display:flex;align-items:center;gap:8px">'
      + '<span style="font-weight:800;font-size:13.5px">🧰 Ustalar qarzi</span>'
      + '<span style="flex:1;height:1px;background:var(--line)"></span>'
      + '<span class="rc-chip" style="flex:none;background:var(--sfc2);color:var(--mut)">' + items.length + ' ta</span></div>';
    h += '<div style="font-size:11px;color:var(--mut);margin-bottom:10px;line-height:1.5">'
      + '<b>Siz</b> kimdan qarz olgansiz — do\'kon, ustanovchik yoki shaxs. '
      + 'Bu <b>kassaga qo\'shilmaydi</b>, alohida hisob.</div>';

    // Jami kreditor qarz
    h += '<div class="rc-card" style="padding:12px 14px;margin-bottom:10px;display:flex;'
      + 'justify-content:space-between;align-items:center">'
      + '<span style="font-size:12.5px;color:var(--mut);font-weight:600">Jami qarzim</span>'
      + '<span style="font-weight:800;font-size:17px;color:var(--danger)">' + money(cr.total) + '</span></div>';

    if (items.length) {
      h += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">';
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var paid = parseInt(it.paid) || 0;
        h += '<div class="rc-card" style="padding:11px 13px">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">'
          + '<div style="min-width:0;flex:1">'
          + '<div style="font-weight:700;font-size:13.5px">' + (ICON[it.type] || '📌') + ' ' + Utils.esc(it.name)
          + (it.is_auto ? ' <span class="rc-chip" style="font-size:9.5px;padding:1px 6px;background:var(--sfc);color:var(--mut)">avtomatik</span>' : '') + '</div>'
          // kimdan · NIMA UCHUN · QACHON · qaysi zakaz (2026-08-15 talabi)
          + '<div style="font-size:11px;color:var(--mut);margin-top:3px;line-height:1.6">'
          + Utils.esc(it.type_label)
          + (it.taken_date ? ' · 📅 ' + Utils.date(it.taken_date) : '')
          + (paid ? ' · to\'landi ' + money(paid) : '')
          + (it.note ? '<br>💬 ' + Utils.esc(it.note) : '')
          + (it.order_id ? '<br>📦 <span style="color:var(--acc-text)">#' + it.order_id + ' ' + Utils.esc(it.order_title || '') + '</span>' : '')
          + '</div>'
          + '</div>'
          + '<div style="text-align:right;flex:none">'
          + '<div style="font-weight:800;font-size:14px;color:var(--danger)">' + money(it.remaining) + '</div>'
          + (paid ? '<div style="font-size:10.5px;color:var(--mut)">' + money(it.amount) + ' dan</div>' : '')
          + '</div></div>'
          + '<div style="display:flex;gap:6px;margin-top:9px">'
          + '<button class="rc-btn-ghost rc-btn-sm cr-pay" data-id="' + it.id + '" data-name="' + Utils.esc(it.name)
          + '" data-rem="' + it.remaining + '" style="flex:1"><i class="fas fa-hand-holding-usd"></i> To\'lash</button>'
          + '<button class="rc-btn-ghost rc-btn-sm cr-del" data-id="' + it.id + '" data-name="' + Utils.esc(it.name)
          + '" style="flex:none;color:var(--danger)"><i class="fas fa-trash"></i></button>'
          + '</div></div>';
      }
      h += '</div>';
    } else {
      h += '<div style="font-size:12px;color:var(--mut);padding:10px 2px">Qarzingiz yo\'q</div>';
    }
    h += '<button class="rc-btn-ghost rc-btn-sm" id="fin-add-creditor" style="width:100%">'
      + '<i class="fas fa-plus"></i> Qarz qo\'shish</button>';
    return h;
  },

  // ── KASSA: oy boshi qoldiq → +kirim −chiqim −yechim → oy oxiri (o'tadi) ──
  _kassaHtml: function (k) {
    var money = Utils.money;
    var row = function (label, val, clr, sign) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:13px">' +
        '<span style="color:var(--mut)">' + label + '</span>' +
        '<span style="font-weight:700;color:' + (clr || 'var(--txt)') + '">' + (sign || '') + money(val) + '</span></div>';
    };
    var h = '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:0">';
    h += '<div style="font-weight:800;font-size:14px">🏦 Kassa — ' + RcPeriod.label(RcFinance._st) + '</div>';
    // (2026-08-13) Kassaning Kirim/Chiqimi pastdagi statistika-kartalaridan
    // (Kirim/Chiqim/Sof foyda) FARQ QILISHI mumkin — foydalanuvchi buni
    // "eski kesh" deb o'ylab chalkashgan edi. Sabab: Kassa = HAQIQIY kassadagi
    // pul (o'chirilgan buyurtma puli ham shu ichida — pul jismonan qaytmagan),
    // pastdagi kartalar esa faqat FAOL buyurtmalarni sanaydi. Endi shu farq
    // ochiq tushuntiriladi, izlab yurish shart emas.
    h += '<div style="font-size:11px;color:var(--mut);margin-bottom:6px">Jami (o\'chirilgan buyurtmalar puli ham qo\'shilgan)</div>';
    // ── 2026-08-25: qator faqat NOLDAN FARQLI bo'lsa ko'rsatiladi ──────
    // Iyuldagi 4 ta zakaz avgustga ko'chirilgandan keyin bu qiymat 0 bo'ldi.
    // Nol qator ekranni chalkashtiradi — «bu nima?» degan savol tug'diradi.
    // Kelajakda oldingi oydan qoldiq bo'lsa — o'zi qayta paydo bo'ladi.
    if ((parseInt(k.opening) || 0) !== 0) {
      h += row('O\u2018tgan oydagi kassadan yechilmay qolib ketgan pul', k.opening, 'var(--mut)');
    }
    h += '<div style="height:1px;background:var(--brd)"></div>';
    h += row('Kirim', k.income, 'var(--acc-text)', '+');
    h += row('Chiqim', k.expense, 'var(--pch-text)', '−');
    // ── «Pul o'zgarishi» → «Kirim − Chiqim» (2026-08-13) ──────────────────
    // "Pul o'zgarishi" nomi o'zi nima ekanini aytmasdi (o'zgarish — nimadan
    // nimaga?). Endi nom formula bilan bir xil — o'qigan zahoti tushunarli,
    // hint (izoh) bosish shart emas.
    var _delta = (parseInt(k.income) || 0) - (parseInt(k.expense) || 0);
    h += '<div style="display:flex;justify-content:space-between;align-items:center;'
      + 'padding:7px 0;font-size:13px;border-top:1px dashed var(--brd)">'
      + '<span style="color:var(--mut)">🔄 Kirim − Chiqim <span style="font-size:10px;opacity:.7">(foyda emas)</span></span>'
      + '<span style="font-weight:700;color:' + (_delta >= 0 ? 'var(--acc-text)' : 'var(--danger)') + '">'
      + (_delta >= 0 ? '+' : '−') + money(Math.abs(_delta)) + '</span></div>';
    h += row('Pul yechish', k.withdrawal, 'var(--lav-text)', '−');
    h += '<div style="height:1px;background:var(--brd)"></div>';
    // "Oy oxiri qoldiq" → "Kassa ostatka" (2026-08-13, nom); 2026-09-05:
    // izoh TUZATILDI — bu raqam ENDI DAVRGA QARAB FARQLANADI (masalan
    // "O'tgan oy" tanlansa o'sha oy OXIRIDAGI qoldiq, joriy holat emas).
    // Ilgari "har doim joriy balans bilan bir xil" deb yozilgan edi — bu faqat
    // joriy (tugamagan) davr uchun to'g'ri, o'tgan davrlarda FARQ QILADI.
    h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0 2px">' +
      '<span style="font-weight:800;font-size:14px">Kassa ostatka</span>' +
      '<span style="font-weight:800;font-size:16px;color:var(--acc-text)">' + money(k.closing) + " so‘m</span></div>";
    h += '<div style="font-size:11px;color:var(--mut)">Hozir hamyoningizda shuncha pul bor</div>';
    // (2026-08-15, moliya TZ) «Balans» nomi «Kassa ostatka»ga o'zgardi va
    // pastdagi kartalar qatoridan olib tashlandi — endi FAQAT shu yerda.
    // Manfiy qoldiq — buzilish EMAS, tushuntirish kerak (2026-08-06)
    if ((parseInt(k.closing) || 0) < 0) {
      h += '<div style="margin-top:8px;padding:9px 11px;border-radius:10px;background:var(--sfc2);'
        + 'border:1px dashed var(--pch);font-size:11px;color:var(--mut);line-height:1.55">'
        + '⚠️ <b style="color:var(--txt)">Qoldiq manfiy</b> — bu xato emas.<br>'
        + 'Tizimga <b>kirim qilinmagan</b> pulingizdan sarflagansiz (masalan o\'z '
        + 'jamg\'armangizdan material olgansiz). Kirimni yozsangiz to\'g\'rilanadi.</div>';
    }
    h += (window.RcHint ? RcHint.html('money_change') : '');
    h += '</div>';
    return h;
  },

  // ── H7: QABUL QILISH KUTILAYOTGAN ULUSHLAR ───────────────────────────────
  _pendingAcceptHtml: function (p) {
    if (!p || !p.items || !p.items.length) return '';
    var money = Utils.money, esc = Utils.esc;
    // 2026-08-04: IXCHAM dizayn — ilgari 2px ramka + katta tugmalar bilan
    // qo'pol ko'rinardi. Endi boshqa kartalar bilan bir uslubda: nozik
    // ramka + chap laym chiziq.
    var h = '<div class="rc-card" style="display:flex;flex-direction:column;gap:9px;'
      + 'border:1px solid var(--brd2);border-left:3px solid var(--acc);padding:13px 14px">';
    h += '<div style="display:flex;align-items:center;gap:9px">'
      + '<span style="font-size:16px">💰</span>'
      + '<div style="font-weight:800;font-size:13.5px">Sizga ulush kelmoqda</div></div>';

    p.items.forEach(function (it) {
      h += '<div style="background:var(--sfc2);border-radius:12px;padding:10px 11px;'
        + 'display:flex;flex-direction:column;gap:8px">';
      // Zakaz + summa
      h += '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">'
        + '<div style="min-width:0;flex:1">'
        + '<div style="font-size:12.5px;font-weight:700;overflow:hidden;'
        + 'text-overflow:ellipsis;white-space:nowrap">📦 ' + esc(it.order_title) + '</div>'
        + '<div style="font-size:10.5px;color:var(--mut);margin-top:1px">'
        + esc(it.from_name) + ' · ' + it.percent + '%</div></div>'
        + '<div style="font-size:15px;font-weight:800;color:var(--acc-text);white-space:nowrap">'
        + money(it.amount) + '</div></div>';
      // Hozir → keyin (bir qatorda, ixcham)
      h += '<div style="display:flex;align-items:center;gap:8px;font-size:11.5px;'
        + 'color:var(--mut);padding-top:1px">'
        + '<span>Hozir <b style="color:var(--txt);font-weight:700">' + money(p.balance_now) + '</b></span>'
        + '<span style="color:var(--acc-text)">→</span>'
        + '<span>Qabul qilsangiz <b style="color:var(--acc-text);font-weight:800">'
        + money(p.balance_after) + '</b></span></div>';
      // Tugmalar — ixcham
      h += '<div style="display:flex;gap:7px">'
        + '<button class="rc-btn rc-btn-sm rc-pa-ok" data-id="' + it.line_id + '" '
        + 'style="flex:1;height:34px">✅ Qabul qilaman</button>'
        + '<button class="rc-btn-ghost rc-btn-sm rc-pa-no" data-id="' + it.line_id + '" '
        + 'style="flex:none;height:34px;color:var(--danger);padding:0 12px">Olmadim</button></div>';
      h += '</div>';
    });
    h += '</div>';
    return h;
  },

  // ── 💰 KUTILAYOTGAN FOYDA (H8) ───────────────────────────────────────────
  // Ulashilgan zakazlardan sizga tegishli, lekin hali qo'lingizga tegmagan
  // ulush. ATAYLAB Balans/Kassa/Kirimdan TASHQARIDA — u boshqa odamning
  // kassasida turibdi. Pul yechilgach real Kirim yozuviga aylanadi.
  // Pending bo'lmasa — karta umuman chizilmaydi (bo'sh joy egallamaydi).
  _pendingHtml: function (p) {
    var total = parseFloat(p.total || 0);
    if (!(total > 0)) return '';
    var money = Utils.money;
    var orders = p.orders || [];

    var h = '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:8px;' +
      'border-left:3px solid var(--lav)">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">' +
      // (2026-08-15) Nom «Kutilayotgan foyda» → «Sheriklikdagi foyda»:
      // bu pul aynan SHERIKLI zakazlardan tushadigan ulush, «kutilayotgan»
      // so'zi esa nima ekanini aytmasdi.
      '<div style="font-weight:800;font-size:14px">👥 Sheriklikdagi foyda</div>' +
      '<div style="font-weight:800;font-size:16px;color:var(--lav-text);white-space:nowrap">' +
      money(total) + " so‘m</div></div>";
    h += '<div style="font-size:11.5px;color:var(--mut);line-height:1.55">' +
      'Sherik bo‘lgan zakazlardan sizga tegishli ulush. Pul hali <b>boshqa odamning kassasida</b> — ' +
      'shuning uchun Balans/Kassaga qo‘shilmaydi. Yechilgach Kirim bo‘lib tushadi.</div>';

    if (orders.length) {
      h += '<div style="display:flex;flex-direction:column;gap:6px;margin-top:2px">';
      orders.forEach(function (o) {
        h += '<div class="rc-pend-row" data-oid="' + o.order_id + '" ' +
          'style="display:flex;justify-content:space-between;align-items:center;gap:8px;' +
          'padding:8px 10px;background:var(--sfc2);border-radius:10px;cursor:pointer">' +
          '<span style="font-size:12.5px;color:var(--mut)">Zakaz #' + o.order_id +
          (o.delivered_at ? ' · ' + Utils.date(o.delivered_at) : '') + '</span>' +
          '<span style="font-weight:700;font-size:13px;color:var(--lav-text)">' + money(o.amount) + '</span>' +
          '</div>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  },

  // ── SOF FOYDA: topshirilgan buyurtmalar (kirim − barcha xarajat) + Band pul (WIP) ──
  _sofFoydaHtml: function (sf, wip) {
    var money = Utils.money, esc = Utils.esc;
    var orders = sf.orders || [];
    // 2026-07-25: ochilib-yopiladigan qilindi — ro'yxat uzun (35 zakaz) bo'lib
    // sahifani cho'zib yuborardi. Sarlavha + jami chip HAR DOIM ko'rinadi.
    var h = '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:10px">';
    // ⚠️ 2026-08-05: nomi «Sof foyda» dan «Topshirilgan buyurtmalar» ga
    // o'zgartirildi. Sabab: «Sof foyda» endi KARTALAR qatorida turibdi —
    // ikkalasi bir xil nomda bo'lib, ekranda takrorlanardi.
    // Kartada — RAQAM, bu panelda — o'sha raqam QAYSI zakazlardan
    // yig'ilgani. Bosilganda karta shu panelni ochadi.
    h += RcFinance._accHead('sof', false,
        '<div style="font-weight:800;font-size:14px">📋 Topshirilgan buyurtmalar</div>',
        '<span class="rc-chip-acc rc-chip" style="flex:none">' + (sf.count || 0) + ' ta · ' + money(sf.total) + '</span>');
    h += '<div id="acc-body-sof"' + (RcFinance._accOpen('sof', false) ? '' : ' style="display:none"') + '>';
    h += '<div style="font-size:11px;color:var(--mut);margin-bottom:10px">Topshirilgan buyurtma foydasi shu oyga yoziladi (boshlangan oy emas)</div>';
    h += '<div style="display:flex;flex-direction:column;gap:10px">';
    orders.forEach(function (o) {
      var pf = parseInt(o.profit) || 0;
      h += '<div onclick="Router.go(\'/orders/' + o.id + '\')" style="display:flex;align-items:center;gap:10px;background:var(--sfc2);border-radius:14px;padding:10px 12px;cursor:pointer">';
      h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</div>';
      // Foyda qaysi usulda hisoblanganini KO'RSATAMIZ — aks holda foydalanuvchi
      // ikki xil raqamni ko'rib «qaysi biri to'g'ri?» deb qoladi (TZ §F2).
      var _src = o.by_contract
        ? '📄 shartnoma ' + money(o.contract_amount)
        : '⚠️ eski usul (shartnomasiz)';
      h += '<div style="font-size:11px;color:var(--mut);margin-top:2px">↓' + money(o.income) + ' · ↑' + money(o.expense) + '</div>';
      h += '<div style="font-size:10.5px;color:var(--mut);margin-top:2px;opacity:.85">' + _src + '</div></div>';
      h += '<span style="font-size:14px;font-weight:800;color:' + (pf >= 0 ? 'var(--acc)' : 'var(--danger)') + '">' + money(pf) + '</span></div>';
    });
    if (!orders.length) {
      // Bo'sh holat FOYDALI bo'lsin: nega 0 ekanini va nima qilishni aytadi.
      // Ilgari shunchaki «topshirilgan buyurtma yo'q» deb turardi —
      // foydalanuvchi buni XATO deb o'ylardi.
      h += '<div style="font-size:12.5px;color:var(--mut);line-height:1.6">'
        + 'Bu davrda hech qanday buyurtma topshirilmagan — shuning uchun 0.<br>'
        + '<b style="color:var(--txt)">Bu xato emas.</b> Foyda buyurtma '
        + '<b>topshirilganda</b> yoziladi.<br><br>'
        + 'Oldingi foydangizni ko\'rish uchun tepadagi davr filtridan '
        + '<b>«O\'tgan oy»</b> yoki <b>«Hammasi»</b> ni tanlang.'
        + '</div>';
    }

    // ── 🧑‍💼 MENGA QOLDI (2026-08-05, TZ-Foyda-Egaga-Qolgan-Ulush.md) ──
    // Sof foyda — «qancha ishlab topdim». Undan ustalarga berilgani
    // ayirilsa — «menga qancha qoldi». Ikkalasi alohida raqam.
    var _dist = parseInt(sf.distributed) || 0;
    var _left = parseInt(sf.owner_left) || 0;
    if (_dist !== 0 || _left !== 0) {
      h += '<div style="height:1px;background:var(--line);margin:10px 0 6px"></div>';
      h += RcFinance._cLine('Zakazlardan qolgan foyda', money(sf.total), 'var(--acc-text)');
      // Foyda foizi (2026-08-06): har 100 so'mlik ishdan qancha foyda
      if (sf.margin_pct != null) {
        h += '<div style="font-size:10.5px;color:var(--mut);margin:-2px 0 4px;text-align:right">'
          + 'shartnoma ' + money(sf.contract_total) + ' → <b style="color:var(--acc-text)">'
          + sf.margin_pct + '%</b> foyda</div>';
      }
      h += RcFinance._cLine('Ustalarga berildi', money(_dist), 'var(--lav-text)', false, '👷');
      h += '<div style="height:2px;background:var(--brd2);margin:7px 0"></div>';
      h += RcFinance._cLine('MENGA QOLDI', money(_left),
        _left >= 0 ? 'var(--cyan-text)' : 'var(--danger)', true, '🧑‍💼');
      if (_left < 0) {
        h += '<div style="font-size:10.5px;color:var(--mut);margin-top:5px;line-height:1.5">'
          + '⚠️ Bu davrda foydadan ko\'proq yechilgan — farq oldingi oylar '
          + 'foydasidan olingan. Xato emas.</div>';
      }
      h += (window.RcHint ? RcHint.html('owner_left') : '');
    }

    // ── «Qo'shimcha daromad» — shartnomadan ORTIQ kelgan pul ──
    // Foydaga qo'shilmaydi (qoida: foyda faqat shartnomadan), lekin
    // YO'QOLMAYDI ham — aks holda foydalanuvchi «pulim qayoqqa ketdi?» deydi.
    var _extra = parseInt(sf.extra_income) || 0;
    if (_extra > 0) {
      h += '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--sfc2);border-radius:14px;padding:10px 12px;margin-top:2px;border-left:3px solid var(--cyan)">';
      h += '<div style="font-size:12px;color:var(--mut)">➕ Qo‘shimcha daromad<br><span style="font-size:10px">shartnomadan ortiq kelgan pul · foydaga qo‘shilmaydi</span></div>';
      h += '<span style="font-size:14px;font-weight:800;color:var(--cyan)">' + money(_extra) + '</span></div>';
    }
    // Band pul (WIP)
    if (wip && parseInt(wip) > 0) {
      h += '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--sfc2);border-radius:14px;padding:10px 12px;margin-top:2px">';
      h += '<div style="font-size:12px;color:var(--mut)">🔧 Jarayonda band pul<br><span style="font-size:10px">tugamagan ishlarga ketgan xarajat</span></div>';
      h += '<span style="font-size:14px;font-weight:800;color:var(--cyan)">' + money(wip) + '</span></div>';
    }
    h += '</div>';       // gap-konteyner
    h += '</div>';       // #acc-body-sof
    h += '</div>';       // rc-card
    return h;
  },

  // ── Sheriksiz / Sherikli hisob (2026-08-15, qo'lyozma 1- va 2-blok) ──
  // Chapda sheriksiz, o'ngda sherikli. Har tomonda:
  //   jami shartnoma summasi − jami xarajat = foyda
  _splitHtml: function (ps) {
    var money = Utils.money, esc = Utils.esc;
    function col(title, icon, g, accent, note) {
      var pr = parseInt(g.profit) || 0;
      // `min-width:230px` — 360px ekranda ikki ustun sig'maydi, shuning
      // uchun `flex-wrap` ishga tushib ustma-ust tushadi (2026-08-17).
      var h = '<div style="flex:1 1 230px;min-width:0;background:var(--sfc2);border-radius:14px;padding:12px">';
      h += '<div style="font-weight:800;font-size:13.5px;margin-bottom:2px">' + icon + ' ' + title + '</div>';
      h += '<div style="font-size:11px;color:var(--mut);margin-bottom:' + (note ? '4px' : '10px') + '">' + (g.count || 0) + ' ta buyurtma</div>';
      // «Sherikli» ustunidagi foyda — buyurtmaning TO'LIQ foydasi (100%),
      // ya'ni sherikning ulushi ham ichida. Yuqoridagi karta esa faqat
      // sizga tegadiganini ko'rsatadi — farqi shu yerda aytiladi.
      if (note) h += '<div style="font-size:10.5px;color:var(--mut);margin-bottom:8px;line-height:1.45">' + note + '</div>';
      h += '<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0">'
         + '<span style="color:var(--mut)">Jami shartnoma</span><b>' + money(g.contract) + '</b></div>';
      h += '<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0">'
         + '<span style="color:var(--mut)">− Jami xarajat</span><b style="color:var(--pch-text)">' + money(g.expense) + '</b></div>';
      h += '<div style="display:flex;justify-content:space-between;font-size:14px;padding:8px 0 2px;'
         + 'border-top:1px solid var(--brd);margin-top:6px">'
         + '<span style="font-weight:800">= Foyda</span>'
         + '<b style="color:' + (pr >= 0 ? accent : 'var(--danger)') + ';font-size:15px">' + money(pr) + '</b></div>';
      return h + '</div>';
    }

    // ── YAGONA «MENGA TEGISHLI FOYDA» KARTASI (2026-08-15) ────────────────
    // Ilgari ikki alohida blok bor edi va foydalanuvchi ularni solishtirib
    // chalkashdi:
    //   • «Sheriklikdagi foyda» — BOSHQANING zakazidagi MENING ulushim
    //   • «Sherikli» ustuni     — MENING zakazlarimning TO'LIQ foydasi (100%)
    // Ikkovi ham to'g'ri edi, lekin turli narsani o'lchardi. Endi ikkalasi
    // bitta kartada, «pul menda / pul unda» deb ajratilgan holda.
    var pend = (RcFinance._data && RcFinance._data.pending_profit) || {};
    var pendTotal = parseFloat(pend.total || 0) || 0;
    var mineTotal = parseInt(ps.my_share || 0) || 0;
    var h = '';
    h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:8px;'
       + 'border-left:3px solid var(--lav)">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">'
       + '<div style="font-weight:800;font-size:14px">👥 Menga tegishli foyda</div>'
       + '<div style="font-weight:800;font-size:17px;color:var(--lav-text);white-space:nowrap">'
       + money(mineTotal + pendTotal) + ' so‘m</div></div>';
    h += '<div style="font-size:11.5px;color:var(--mut);line-height:1.55">'
       + 'Sherikli zakazlarning <b>hammasidan</b> sizga tegadigan ulush — '
       + 'o‘z zakazlaringiz ham, boshqaning zakazidagi ulushingiz ham.</div>';

    var srow = function (icon, label, val, note, clr) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;'
        + 'padding:9px 11px;background:var(--sfc2);border-radius:10px">'
        + '<div style="min-width:0"><div style="font-size:12.5px;font-weight:700">' + icon + ' ' + label + '</div>'
        + '<div style="font-size:10.5px;color:var(--mut);margin-top:2px">' + note + '</div></div>'
        + '<b style="font-size:13.5px;color:' + clr + ';white-space:nowrap">' + money(val) + '</b></div>';
    };
    h += '<div style="display:flex;flex-direction:column;gap:6px;margin-top:2px">';
    h += srow('🏠', "O‘z zakazlarimdan", mineTotal,
              'Pul <b>sizda</b> — kassangizga allaqachon tushgan', 'var(--acc-text)');
    h += srow('🤝', 'Boshqaning zakazidan', pendTotal,
              'Pul hali <b>unda</b> — yechilgach Kirim bo‘lib tushadi', 'var(--lav-text)');
    h += '</div>';

    // Boshqaning zakazidagi ulush — qaysi zakazdan qancha (bosilsa o'sha zakaz)
    if ((pend.orders || []).length) {
      h += '<div style="font-size:11px;color:var(--mut);font-weight:700;margin-top:6px">🤝 Boshqaning zakazlari</div>';
      (pend.orders || []).forEach(function (o) {
        h += '<div class="rc-pend-row" data-oid="' + o.order_id + '" '
          + 'style="display:flex;justify-content:space-between;align-items:center;gap:8px;'
          + 'padding:7px 10px;background:var(--sfc2);border-radius:10px;cursor:pointer">'
          + '<span style="font-size:12px;color:var(--mut)">Zakaz #' + o.order_id
          + (o.delivered_at ? ' · ' + Utils.date(o.delivered_at) : '') + '</span>'
          + '<span style="font-weight:700;font-size:12.5px;color:var(--lav-text)">' + money(o.amount) + '</span></div>';
      });
    }
    h += '</div>';

    h += '<div class="rc-card" style="margin-top:12px">';
    h += '<div style="display:flex;gap:10px;flex-wrap:wrap">';
    h += col('Sheriksiz', '🧍', ps.solo, 'var(--acc-text)', 'Hammasi sizniki');
    h += col('Sherikli', '👥', ps.partner, 'var(--acc-text)',
             '<b>To‘liq foyda</b> — sherikning ulushi ham ichida');
    h += '</div>';

    // Sherikli foydaning ulushlarga bo'linishi
    // Har sherik uchun: shartnoma ulushi − rasxod ulushi = foyda ulushi
    // (2026-08-15: «kiritilgan foizga qarab rasxod ham, foyda ham bo'linadi»)
    if (ps.shares && ps.shares.length) {
      h += '<div style="font-weight:800;font-size:13px;margin:14px 0 6px">Sherikli hisob — kimga qancha</div>';
      ps.shares.forEach(function (r) {
        var pr = parseInt(r.amount) || 0;
        h += '<div style="padding:9px 11px;background:var(--sfc2);border-radius:10px;margin-bottom:6px">'
           + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px">'
           + '<b>' + esc(r.name) + '</b>'
           + '<b style="color:' + (pr >= 0 ? 'var(--acc-text)' : 'var(--danger)') + '">' + money(pr) + '</b></div>'
           + (r.contract !== undefined
             ? '<div style="font-size:11px;color:var(--mut);margin-top:3px">shartnoma ' + money(r.contract)
               + ' − rasxod ' + money(r.expense) + ' = foyda</div>'
             : '')
           + '</div>';
      });
    }

    // Har tomondagi buyurtmalar ro'yxati
    function list(title, g) {
      if (!g.orders || !g.orders.length) return '';
      var s = '<div style="font-weight:800;font-size:12.5px;margin:12px 0 6px">' + title + '</div>';
      g.orders.forEach(function (o) {
        var p = parseInt(o.profit) || 0;
        s += '<div onclick="Router.go(\'/orders/' + o.id + '\')" style="padding:8px 10px;'
           + 'background:var(--sfc2);border-radius:10px;margin-bottom:5px;font-size:12px;cursor:pointer">'
           + '<div style="display:flex;justify-content:space-between;align-items:center">'
           + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title || '—') + '</span>'
           + '<span style="color:var(--mut);margin:0 8px">' + money(o.contract) + ' − ' + money(o.expense) + '</span>'
           + '<b style="color:' + (p >= 0 ? 'var(--acc-text)' : 'var(--danger)') + '">' + money(p) + '</b></div>'
           // 🔻 Sherik chiqarilgan bo'lsa — zakaz nega yolg'iz ekani shu yerda
           // ko'rinadi (2026-08-15 §S4), bosilsa buyurtmaga o'tadi.
           + ((o.removed || []).length
             ? '<div style="font-size:10.5px;color:var(--pch-text);margin-top:4px;line-height:1.5">'
               + (o.removed || []).map(function (r) {
                   return '🔻 ' + esc(r.name) + ' chiqarilgan · ' + Utils.date(r.at)
                     + (r.reason ? ' · ' + esc(r.reason) : '')
                     + (r.was ? ' <span style="color:var(--mut)">(' + esc(r.was) + ')</span>' : '');
                 }).join('<br>')
               + '</div>'
             : '')
           + '</div>';
      });
      return s;
    }
    h += list('🧍 Sheriksiz buyurtmalar', ps.solo);
    h += list('👥 Sherikli buyurtmalar', ps.partner);
    return h + '</div>';
  },

  _statsHtml: function (s, sof) {
    var money = Utils.money;
    var pl = RcPeriod.label(RcFinance._st);
    var sofTotal = parseInt((sof || {}).total) || 0;
    var sofCount = ((sof || {}).count) || 0;
    var cards = [
      // (2026-08-13) "Kirim"/"Chiqim" nomi Kassa blokidagi bir xil nomli
      // qatorlar bilan CHALKASHARDI (bu yerda o'chirilgan buyurtma puli
      // istisno, Kassada esa yo'q — ikkisi boshqa-boshqa raqam edi, lekin
      // bir xil nom bilan). Endi nomlar o'zi farqni ko'rsatadi — tushuntirish
      // paragrafini o'qish shart emas.
      { key: 'income',  label: 'Kirim (zaklad)',  val: money(s.total_income),  clr: 'var(--acc-text)', sub: pl },
      { key: 'expense', label: 'Chiqim (rasxod)', val: money(s.total_expense), clr: 'var(--pch-text)', sub: pl },
      // 2026-08-25 (4): foydalanuvchi talabi — «Kirim-chiqimdan ayrilgan
      // summa» ham TEPADA (asosiy katta kartada), ham PASTDA (shu yerda,
      // o'z eski joyida) tursin. Ikkalasi BIR XIL manbadan (`s.total_income
      // − s.total_expense`) — hisob TAKRORLANMAYDI, faqat ikki joyda
      // ko'rsatiladi. «Zakazlardan qolgan foyda» (sof) esa faqat tepada
      // qoladi — u haqida alohida so'ralmadi.
      { key: 'flow', label: 'Kirim-chiqimdan ayrilgan summa',
        val: money((parseInt(s.total_income) || 0) - (parseInt(s.total_expense) || 0)),
        clr: ((parseInt(s.total_income) || 0) - (parseInt(s.total_expense) || 0)) >= 0 ? 'var(--acc-text)' : 'var(--danger)',
        sub: 'kirim − chiqim' },
    ];
    var h = '<div id="fin-stats" class="rc-grid rc-grid-auto">';
    cards.forEach(function (c, i) {
      h += '<div class="rc-stat fin-stat" data-metric="' + c.key + '" style="cursor:pointer;animation-delay:' + (i * 0.05) + 's">';
      h += '<div class="rc-stat-label">' + c.label + ' <span style="opacity:.5">›</span></div>';
      h += '<div class="rc-stat-val" style="color:' + c.clr + '">' + c.val + '</div>';
      h += '<div class="rc-stat-sub">' + c.sub + '</div>';
      h += '</div>';
    });
    h += '</div>';
    // Uch raqam farqi — kartalar ostida (2026-08-05)
    h += (window.RcHint ? RcHint.html('three_numbers') : '');
    return h;
  },

  // ── ASOSIY KARTA KATAKCHASI (2026-08-25) ─────────────────────────────
  // `big`: true (eski 2-ustunli, 46%) | 'row3' (yangi 3-ustunli, ~31%) | false (kichik, 30%)
  _mainCell: function (key, icon, title, sub, val, clr, big) {
    var flexBasis = big === 'row3' ? '31%' : (big ? '46%' : '30%');
    var minW = big === 'row3' ? '112px' : (big ? '150px' : '108px');
    var pad = big === 'row3' ? '12px 10px' : (big ? '14px 16px' : '11px 13px');
    var labelSize = big === 'row3' ? '10.5px' : (big ? '12px' : '11px');
    var valSize = big === 'row3' ? '16px' : (big ? '20px' : '15px');
    var valMargin = big === 'row3' ? '5px' : (big ? '6px' : '4px');
    return '<div class="fin-cell" data-cell="' + key + '" style="flex:1 1 '
      + flexBasis + ';min-width:' + minW
      + ';padding:' + pad + ';cursor:pointer;'
      + 'position:relative;box-shadow:inset 1px 0 0 var(--line)">'
      + '<div style="font-size:' + labelSize + ';color:var(--mut);'
      + 'font-weight:700;display:flex;align-items:center;gap:4px">'
      + '<span>' + icon + '</span><span>' + title + '</span>'
      + '<span class="fin-cell-arr" style="opacity:.45;margin-left:auto;font-size:13px">›</span></div>'
      + '<div style="font-weight:800;font-size:' + valSize + ';color:' + clr
      + ';white-space:nowrap;margin-top:' + valMargin + '">' + val + '</div>'
      + '<div style="font-size:10px;color:var(--mut);margin-top:2px">' + sub + '</div>'
      + '</div>';
  },

  // ── SODDA TUSHUNTIRISH (bosilganda ochiladi) ─────────────────────────
  // Talab: «3-sinf bolasi ham, 60 yoshli otaxon ham tushunsin».
  // Shuning uchun: bitta jonli jumla + raqamlar qaydan kelgani qatorma-qator.
  _cellExplain: function (key) {
    var d = RcFinance._data || {};
    var s = d.stats || {}, k = d.kassa || {}, sf = d.sof_foyda || {};
    var M = Utils.money;
    var inc = parseInt(s.total_income) || 0, exp = parseInt(s.total_expense) || 0;

    function line(t, v, c, bold, sub) {
      return '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;'
        + 'padding:7px 0;' + (bold ? 'border-top:1px solid var(--line);margin-top:4px;' : '')
        + '"><div style="min-width:0"><div style="color:' + (bold ? 'var(--txt)' : 'var(--mut)') + ';font-size:12px;'
        + (bold ? 'font-weight:800' : '') + '">' + t + '</div>'
        + (sub ? '<div style="color:var(--mut);font-size:10.5px;opacity:.8;margin-top:1px">' + sub + '</div>' : '') + '</div>'
        + '<span style="font-weight:' + (bold ? '800' : '700') + ';font-size:12px;white-space:nowrap;flex:none;'
        + (c ? 'color:' + c : '') + '">' + v + '</span></div>';
    }
    function say(txt) {
      return '<div style="font-size:12px;line-height:1.65;color:var(--txt);'
        + 'background:var(--sfc2);border-radius:10px;padding:10px 12px;margin-bottom:8px">'
        + txt + '</div>';
    }

    var h = '';
    if (key === 'kassa') {
      // 2026-09-09 (v3, foydalanuvchi tasdiqlagan): YANA `k.opening/income/
      // expense/withdrawal/closing`ga (real to'lov sanasi, HAQIQIY yechim
      // yozuvlari) qaytarildi. v2 (Kirim-chiqim − Zakazdan qolgan foyda)
      // BEKOR QILINDI — bu ikkalasi FARAZGA asoslangan edi ("butun foyda
      // ustalarga tegishli"), HAQIQIY yechim yozuvlariga emas. Agar davrda
      // butun foyda allaqachon yechilgan bo'lsa, ikkalasi TASODIFAN teng
      // chiqib, "0" ko'rsatardi — garchi jismonan kassada pul qolgan bo'lsa
      // ham. Endi HAQIQIY yechim summasi (`k.withdrawal`) ayiriladi —
      // tasodifiy nolga tushib qolmaydi.
      h += say('Bu — <b>hozir hamyoningizda turgan haqiqiy pul</b>. '
        + 'Qanday hisoblanadi: o‘tgan oydan qolgan pulga bu oy kirgan pulni '
        + 'qo‘shib, ketgan va ustalarga bergan pulni ayiramiz.');
      h += line('O‘tgan oydan qolgan', M(k.opening), null, false,
        'O‘tgan oy tugaganda hamyonda qolgan pul');
      h += line('+ Bu oy kirgan pul', '+' + M(k.income), 'var(--acc-text)', false,
        'Mijozlar bergan zaklad va to‘lovlar');
      h += line('− Bu oy ketgan pul', '−' + M(k.expense), 'var(--pch-text)', false,
        'Material, transport va boshqa xarajatlar');
      h += line('− Ustalarga bergan pul', '−' + M(k.withdrawal), 'var(--pch-text)', false,
        'Foyda taqsimlanganda ustalarga jo‘natilgan HAQIQIY summa');
      h += line('= Kassa ostatka', M(k.closing) + ' so‘m', (parseInt(k.closing) || 0) >= 0 ? 'var(--acc-text)' : 'var(--danger)', true);
    } else if (key === 'sof') {
      // 2026-08-25: «yanada tushunarli qil» — har zakaz nomining ostiga
      // aynan QANDAY hisoblanganini yozamiz: shartnoma − xarajat = foyda.
      h += say('Bu — <b>tugatilgan zakazlardan ishlab topgan foydangiz</b>. '
        + 'Hamyondagi pul emas: bir qismi hali kelmagan bo‘lishi mumkin.<br>'
        + 'Har zakazda: <b>shartnoma puli − sarflangan pul = foyda</b>.');
      var ords = (sf.orders || []).slice(0, 8);
      if (!ords.length) h += line('Tugatilgan zakaz yo‘q', '0');
      ords.forEach(function (o) {
        var nm = (o.customer || o.title || ('Zakaz #' + o.id));
        var ca = (o.contract_amount != null) ? M(o.contract_amount) : null;
        var ex = M(o.expense);
        var detail = ca ? (ca + ' − ' + ex) : ('Xarajat: ' + ex);
        h += line(String(nm).slice(0, 26), M(o.profit), 'var(--acc-text)', false, detail);
      });
      if ((sf.orders || []).length > 8)
        h += line('… yana ' + ((sf.orders || []).length - 8) + ' ta', '');
      h += line('= Hammasi qo‘shilib', M(sf.total), 'var(--acc-text)', true);
    } else if (key === 'income') {
      h += say('Bu — <b>bu oyda qo‘lingizga kirgan pul</b>: mijozlar bergan '
        + 'zaklad va to‘lovlar. Zakaz tugagan-tugamaganining farqi yo‘q.');
      h += line('Bu oy kirgan pul', M(inc), 'var(--acc-text)', true);
      h += '<div style="font-size:11px;color:var(--mut);margin-top:6px">'
        + 'Batafsil ro‘yxat: pastdagi «Tranzaksiyalar» bo‘limida.</div>';
    } else if (key === 'expense') {
      h += say('Bu — <b>bu oyda qo‘lingizdan ketgan pul</b>: material, transport, '
        + 'ish haqi va boshqa xarajatlar.');
      h += line('Bu oy ketgan pul', M(exp), 'var(--pch-text)', true);
      h += '<div style="font-size:11px;color:var(--mut);margin-top:6px">'
        + 'Batafsil ro‘yxat: pastdagi «Tranzaksiyalar» bo‘limida.</div>';
    } else if (key === 'flow') {
      // 2026-08-25 (3): tepaga ko'chgach — «Kirim» va «Chiqim» kartalari
      // (§income/§expense) kabi TO'LIQ TARIX ko'rsatamiz: har bir yozuv
      // (kirim + chiqim aralash, xronologik), qayerdan/kimdan va sanasi.
      h += say('Kirgan puldan ketgan pulni ayirsak — shu qoladi. '
        + '<b>Bu foyda emas</b>: tugamagan zakazlarning zakladi ham ichida bor. '
        + 'Haqiqiy foyda — yuqoridagi «Zakazlardan qolgan foyda».');
      var flowRecs = ((d.records) || [])
        .filter(function (t) { return t.record_type === 'income' || t.record_type === 'expense'; });
      if (!flowRecs.length) {
        h += line('Yozuv yo‘q', '0');
      } else {
        var flowTotal = 0;
        flowRecs.forEach(function (t) {
          var raw = parseInt(t.amount) || 0;
          var v = (t.record_type === 'expense') ? -raw : raw;
          flowTotal += v;
          var dt = t.date ? Utils.date(t.date) : '';
          var src = t.customer_name || t.order_title || t.recipient_name
            || RcFinance._catLabel(t.category) || t.description || '—';
          var vClr = t.record_type === 'income' ? 'var(--acc-text)' : 'var(--pch-text)';
          var sign = t.record_type === 'income' ? '+' : '−';
          h += line(String(src).slice(0, 26), sign + M(raw), vClr, false, '📅 ' + dt);
        });
        h += line('= Qoldi', M(flowTotal), flowTotal >= 0 ? 'var(--acc-text)' : 'var(--danger)', true);
      }
    }
    return h;
  },

  _toggleCell: function (key) {
    var box = document.getElementById('fin-main-exp');
    if (!box) return;
    var open = box.style.display !== 'none' && box.dataset.cell === key;
    document.querySelectorAll('.fin-cell').forEach(function (c) {
      var on = !open && c.dataset.cell === key;
      c.style.background = on ? 'var(--sfc2)' : '';
      var a = c.querySelector('.fin-cell-arr');
      if (a) { a.textContent = on ? '⌄' : '›'; a.style.opacity = on ? '.9' : '.45'; }
    });
    if (open) { box.style.display = 'none'; box.dataset.cell = ''; return; }
    box.dataset.cell = key;
    box.style.display = '';
    box.style.cssText = 'display:block;border-top:1px solid var(--line);'
      + 'padding:12px 14px 14px;background:var(--sfc)';
    box.innerHTML = RcFinance._cellExplain(key);
  },

  // ── Oylik breakdown (stat karta bosilganda) — 'monthly' aggregate'dan ──
  _toggleBreakdown: function (metric) {
    var panel = document.getElementById('fin-breakdown');
    if (!panel) return;
    RcFinance._highlightStat(metric === panel.dataset.metric ? null : metric);
    if (panel.style.display !== 'none' && panel.dataset.metric === metric) {
      panel.style.display = 'none'; panel.dataset.metric = ''; return;
    }
    var monthly = (RcFinance._data && RcFinance._data.monthly) || {};
    var keys = Object.keys(monthly).sort().reverse();
    var meta = {
      income:  ['↓', 'Kirim',  'var(--acc)'],
      expense: ['↑', 'Chiqim', 'var(--pch)'],
      balance: ['⚖', 'Balans', ''],
      // 2026-08-25: nom «Kirim-chiqimdan ayrilgan summa»ga mos qilindi
      flow: ['=', 'Kirim-chiqimdan ayrilgan summa', ''],
    };
    // ── Har ko'rsatkich uchun bir og'iz izoh (2026-08-05) ──
    // Foydalanuvchi «bu raqam nima?» deb chalkashmasin. Ayniqsa
    // «Pul o'zgarishi» — u FOYDA EMAS, buni ochiq aytish shart.
    var HINT = {
      income:  "Bu davrda mijozlardan HAQIQATAN kelgan pul. Shartnoma summasi emas.",
      expense: "Bu davrda material, transport va ish haqiga ketgan pul.",
      balance: "Hozir qo'lingizda turgan pul. Oy filtriga bog'liq emas — "
             + "mijoz qarzi va kutilayotgan ulush bunga kirmaydi.",
      flow: "Kirim − chiqim. Bu FOYDA EMAS — shartnoma bo'yicha foyda "
          + "alohida kartada. Bu shunchaki pulning kelib-ketishi.",
    };
    var lb = meta[metric] || ['', '', ''];
    function num(x) { return parseInt(x) || 0; }
    function val(m) {
      if (metric === 'income')  return num(m.income);
      if (metric === 'expense') return num(m.expense);
      if (metric === 'profit')  return num(m.income) - num(m.expense);
      if (metric === 'flow')     return num(m.income) - num(m.expense);
      return num(m.income) - num(m.expense) - num(m.withdrawal);
    }
    function clrOf(v) {
      if (metric === 'income') return 'var(--acc-text)';
      if (metric === 'expense') return 'var(--pch-text)';
      return v >= 0 ? 'var(--acc-text)' : 'var(--danger)';
    }
    var total = 0;
    var h = '<div class="rc-card" style="display:flex;flex-direction:column;gap:2px">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
    // 2026-08-25: «sodda, tarix bo'lsin va qayerdan kelgani ham bo'lsin»
    // — income/expense uchun endi OYLIK YIG'INDI emas, HAR BIR yozuv
    // (sana + kimdan/qayerdan + summa) ko'rsatiladi. balance/flow — bular
    // yig'indi tushunchasi (bitta nuqta-vaqt), shuning uchun oylik
    // ko'rinishda qoladi.
    // 2026-08-25 (2): «Pul kirim-chiqim» (flow) uchun ham «buni ham» —
    // xuddi shu tarix ko'rinishi, lekin ikkala turi (kirim/chiqim)
    // ARALASH, xronologik, har biri o'z belgisi (+/−) va rangi bilan.
    var isTxn = (metric === 'income' || metric === 'expense');
    var isFlow = (metric === 'flow');
    h += '<div style="font-weight:800;font-size:14px">' + lb[0] + ' ' + lb[1]
      + ((isTxn || isFlow) ? ' — tarix' : ' — oylar bo‘yicha') + '</div>';
    h += '<button id="fin-bd-close" class="rc-btn-ghost rc-btn-sm" style="border:none;background:none;color:var(--mut);height:auto;padding:2px 6px">✕</button></div>';
    if (HINT[metric]) {
      h += '<div style="font-size:11px;color:var(--mut);line-height:1.5;margin-bottom:10px;'
        + 'padding:8px 10px;border-radius:10px;background:var(--sfc2);'
        + (metric === 'profit' ? 'border:1px dashed var(--pch)' : 'border:1px dashed var(--brd)')
        + '">' + HINT[metric] + '</div>';
    }
    if (isTxn || isFlow) {
      // ── Har bir yozuv: sana, qayerdan/kimdan, summa ──────────────────
      // `isFlow`da IKKALA turi (kirim + chiqim) birga, xronologik.
      var recs = ((RcFinance._data && RcFinance._data.records) || [])
        .filter(function (t) {
          if (isFlow) return t.record_type === 'income' || t.record_type === 'expense';
          return t.record_type === metric;
        });
      if (!recs.length) {
        h += '<div style="font-size:12px;color:var(--mut)">Yozuv yo‘q</div>';
      } else {
        recs.forEach(function (t) {
          var raw = parseInt(t.amount) || 0;
          // flow'da chiqim MANFIY hisoblanadi (jamiga to'g'ri qo'shilsin)
          var v = (isFlow && t.record_type === 'expense') ? -raw : raw;
          total += v;
          var dt = t.date ? Utils.date(t.date) : '';
          var src = t.customer_name || t.order_title || t.recipient_name
            || RcFinance._catLabel(t.category) || t.description || '—';
          var vClr = isFlow
            ? (t.record_type === 'income' ? 'var(--acc-text)' : 'var(--pch-text)')
            : clrOf(v);
          var sign = isFlow ? (t.record_type === 'income' ? '+' : '−') : '';
          h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;'
            + 'gap:10px;padding:7px 0;border-bottom:1px solid var(--brd);font-size:13px">';
          h += '<div style="min-width:0"><div style="font-weight:600">' + Utils.esc(String(src).slice(0, 28)) + '</div>'
            + '<div style="color:var(--mut);font-size:11px;margin-top:1px">📅 ' + dt + '</div></div>';
          h += '<span style="font-weight:700;flex:none;color:' + vClr + '">' + sign + Utils.money(raw) + '</span></div>';
        });
        h += '<div style="display:flex;justify-content:space-between;padding:10px 0 2px;font-weight:800;font-size:13px"><span>Jami</span><span style="color:' + clrOf(total) + '">' + Utils.money(total) + '</span></div>';
      }
    } else if (!keys.length) {
      h += '<div style="font-size:12px;color:var(--mut)">Ma’lumot yo‘q</div>';
    } else {
      keys.forEach(function (m) {
        var p = m.split('-');
        var lbl = (RcFinance._MONTHS[parseInt(p[1], 10) - 1] || p[1]) + ' ' + p[0];
        var v = val(monthly[m]); total += v;
        h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--brd);font-size:13px">';
        h += '<span style="color:var(--mut)">📅 ' + lbl + '</span>';
        h += '<span style="font-weight:700;color:' + clrOf(v) + '">' + Utils.money(v) + '</span></div>';
      });
      h += '<div style="display:flex;justify-content:space-between;padding:10px 0 2px;font-weight:800;font-size:13px"><span>Jami</span><span style="color:' + clrOf(total) + '">' + Utils.money(total) + '</span></div>';
    }
    h += '</div>';
    panel.innerHTML = h;
    panel.style.display = '';
    panel.dataset.metric = metric;
    var cl = document.getElementById('fin-bd-close');
    if (cl) cl.onclick = function () { panel.style.display = 'none'; panel.dataset.metric = ''; RcFinance._highlightStat(null); };
  },

  _highlightStat: function (metric) {
    document.querySelectorAll('.fin-stat').forEach(function (el) {
      var on = el.dataset.metric === metric;
      el.style.borderColor = on ? 'var(--brd2)' : '';
      el.style.boxShadow = on ? 'var(--glow)' : '';
    });
  },

  _recordsHtml: function (records) {
    if (!records.length) {
      return '<div class="rc-empty"><div class="rc-empty-ic">💸</div><div style="font-weight:700;color:var(--txt)">Tranzaksiya topilmadi</div></div>';
    }
    var h = '';
    records.forEach(function (t, i) { h += RcFinance._txCard(t, i); });
    return h;
  },

  // H10 (2026-08-04): jamoa ulushi / bekor qilish belgisi.
  // Migratsiya SHART EMAS — `source_line` FK allaqachon bor, backend shu
  // orqali `is_team_share` / `is_reversal` bayrog'ini yuboradi.
  _txBadge: function (t) {
    if (t.is_reversal) {
      return ' <span style="font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:20px;'
        + 'background:var(--sfc2);border:1px solid var(--brd2);color:var(--mut)">↩️ bekor</span>';
    }
    if (t.is_team_share) {
      return ' <span style="font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:20px;'
        + 'background:var(--sfc2);border:1px solid var(--lav);color:var(--lav-text)">🤝 jamoa ulushi</span>';
    }
    return '';
  },

  _txCard: function (t, i) {
    var esc = Utils.esc, money = Utils.money;
    var ty = RcFinance.TYPES[t.record_type] || { label: t.record_type, ic: '•', bg: 'var(--sfc2)', pos: true };
    var payLabel = RcFinance.PAY[t.payment_method] || t.payment_method || '';
    var catLabel = RcFinance._catLabel(t.category);

    // Asosiy nom: izoh > buyurtma > oluvchi > tur nomi
    var name = t.description || t.order_title || t.recipient_name || ty.label;
    // Ostki qator: tur + (kategoriya) + (to'lov usuli)
    var subParts = [];
    if (name !== ty.label) subParts.push(ty.label);
    if (catLabel && catLabel !== ty.label) subParts.push(catLabel);
    if (payLabel) subParts.push(payLabel);
    var sub = subParts.join(' · ');

    var amtClr = ty.pos ? 'var(--acc-text)' : 'var(--danger)';
    var h = '<div class="rc-card fin-tx" data-id="' + t.id + '" style="cursor:pointer;display:flex;align-items:center;gap:12px;padding:12px 14px;animation-delay:' + Math.min(i * 0.03, 0.3) + 's">';
    h += '<div style="width:40px;height:40px;border-radius:14px;background:' + ty.bg + ';color:var(--acc-ink);display:flex;align-items:center;justify-content:center;font-size:16px;flex:none">' + ty.ic + '</div>';
    h += '<div style="flex:1;min-width:0">';
    h += '<div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
       + esc(name) + RcFinance._txBadge(t) + '</div>';
    if (sub) h += '<div style="font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(sub) + '</div>';
    h += '</div>';
    h += '<div style="text-align:right;flex:none">';
    h += '<div style="font-size:13px;font-weight:800;color:' + amtClr + '">' + (ty.pos ? '+' : '-') + money(t.amount) + '</div>';
    h += '<div style="font-size:10px;color:var(--mut)">' + Utils.timeAgo(t.created_at || t.date) + '</div>';
    h += '</div></div>';
    return h;
  },

  // ══════════════════════════════════════════════════════════════════════
  //  SHARTNOMALAR — «CHEK» KO'RINISHI (2026-08-05, foydalanuvchi tanlovi)
  //
  //  Nega qayta yozildi: avval tepada 2 ta shartnoma QO'SHIB ko'rsatilardi
  //  («Shartnoma summasi 70 000 000»). Foydalanuvchi: «2ta shartnomani
  //  umumiy qilib hisoblayapti, bu bo'lmaydi — soddaroq qil, usta ham
  //  tushunadigan bo'lsin». Shuning uchun:
  //    • umumiy yig'indi qutisi BUTUNLAY olib tashlandi
  //    • har shartnoma do'kon chekiga o'xshab tepadan pastga o'qiladi
  //    • atamalar oddiy so'zga almashtirildi:
  //      Kelishdik / Oldik / Mijoz qarzi / Sarfladik / Foyda
  //  Backend O'ZGARMADI — faqat ko'rinish.
  // ══════════════════════════════════════════════════════════════════════
  _cOpen: {},        // {order_id: true} — ochilgan kartalar

  // Chek satri. big=asosiy raqam (kattaroq shrift — yoshi katta usta ham o'qisin)
  _cLine: function (label, val, color, big, ic) {
    return '<div style="display:flex;align-items:baseline;gap:6px;padding:' + (big ? '5px' : '3px') + ' 0">'
      + '<span style="font-size:' + (big ? '13px' : '12.5px') + ';color:' + (big ? 'var(--txt)' : 'var(--mut)')
      + ';font-weight:' + (big ? '700' : '500') + '">' + (ic ? ic + ' ' : '') + label + '</span>'
      + '<span style="flex:1;border-bottom:1px dotted var(--brd);min-width:8px"></span>'
      + '<span style="font-size:' + (big ? '17px' : '14px') + ';font-weight:800;color:' + color
      + ';font-variant-numeric:tabular-nums;white-space:nowrap">' + val + '</span></div>';
  },

  _BADGE: {
    confirmed: { ic: '✅', col: 'var(--acc-text)', txt: 'Shartnoma tasdiqlangan' },
    sent:      { ic: '🟡', col: 'var(--pch-text)', txt: 'Mijoz hali tasdiqlamagan' },
    informal:  { ic: '⚪', col: 'var(--mut)',      txt: 'Rasmiy shartnomasiz' },
    none:      { ic: '⚠️', col: 'var(--danger)',   txt: 'Summa kiritilmagan' },
  },

  _contractsHtml: function (c) {
    var money = Utils.money, esc = Utils.esc;
    var h = '';

    // Nomuvofiqlik ogohlantirishi — JIMGINA YASHIRILMAYDI
    if (Math.abs(parseFloat(c.mismatch) || 0) > 1) {
      h += '<div class="rc-card" style="padding:12px 14px;margin-bottom:12px;border:1px solid var(--danger)">'
        + '<div style="font-weight:800;font-size:13px;color:var(--danger)">⚠️ Hisobda nomuvofiqlik: ' + money(c.mismatch) + '</div>'
        + '<div style="font-size:11.5px;color:var(--mut);margin-top:3px">Texnik xizmatga xabar bering.</div>'
        + '</div>';
    }

    // ── Sahifalash: 5 tadan (2026-08-05, foydalanuvchi talabi) ──
    // «20 ta shartnoma bo'lsa juda uzun bo'lib ketadi — 5 tadan keyin
    //  next bo'lib o'tib ketishi kerak».
    var PER = 5;
    h += (window.RcHint ? RcHint.html('contracts_tab') : '');
    var items = c.items || [];
    var pages = Math.max(1, Math.ceil(items.length / PER));
    if (RcFinance._cPage > pages) RcFinance._cPage = pages;
    if (RcFinance._cPage < 1) RcFinance._cPage = 1;
    var pg = RcFinance._cPage;
    var slice = items.slice((pg - 1) * PER, pg * PER);

    if (!items.length) {
      h += '<div class="rc-empty"><div class="rc-empty-ic">📄</div><div style="font-weight:700;color:var(--txt)">Shartnoma yo\'q</div>'
        + '<div style="font-size:12px;color:var(--mut);margin-top:4px">Bu davrda harakat bo\'lgan shartnoma topilmadi</div></div>';
    } else {
      h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
        + '<span style="font-size:11px;color:var(--mut);line-height:1.45;flex:1">'
        + 'Har bir shartnoma alohida hisoblanadi. Raqamlar shartnoma boshidan beri.</span>'
        + (pages > 1 ? '<span class="rc-chip" style="flex:none;background:var(--sfc2);color:var(--mut)">'
            + ((pg - 1) * PER + 1) + '–' + Math.min(pg * PER, items.length) + ' / ' + items.length + '</span>' : '')
        + '</div>';
      h += '<div style="display:flex;flex-direction:column;gap:12px">';
      slice.forEach(function (s) { h += RcFinance._contractCard(s); });
      h += '</div>';
    }

    // Sahifa tugmalari
    if (pages > 1) {
      h += '<div style="display:flex;align-items:center;gap:8px;margin-top:12px">';
      h += '<button class="rc-btn-ghost rc-btn-sm c-page-btn" data-page="' + (pg - 1) + '"'
        + (pg <= 1 ? ' disabled style="flex:1;opacity:.35"' : ' style="flex:1"') + '>'
        + '<i class="fas fa-chevron-left"></i> Oldingi</button>';
      h += '<span style="flex:none;font-size:12px;font-weight:700;color:var(--mut);min-width:52px;text-align:center">'
        + pg + ' / ' + pages + '</span>';
      h += '<button class="rc-btn-ghost rc-btn-sm c-page-btn" data-page="' + (pg + 1) + '"'
        + (pg >= pages ? ' disabled style="flex:1;opacity:.35"' : ' style="flex:1"') + '>'
        + 'Keyingi <i class="fas fa-chevron-right"></i></button>';
      h += '</div>';
    }
    if (c.has_more) {
      h += '<div style="text-align:center;font-size:11.5px;color:var(--mut);margin-top:10px">'
        + '… yana ' + c.has_more + ' ta shartnoma (ro\'yxat cheklangan)</div>';
    }

    // 🤝 Boshqaning zakazidan sizga tegadigan pul — ALOHIDA bo'lim.
    // Backend faqat PUL TEGADIGANLARINI yuboradi (shunchaki ko'rish uchun
    // ulashilganlar chiqmaydi — aks holda egasining foydasi «sizniki» bo'lib
    // ko'rinardi).
    var sh = c.shared || [];
    if (sh.length) {
      h += '<div style="margin-top:20px;margin-bottom:9px;display:flex;align-items:center;gap:8px">'
        + '<span style="font-weight:800;font-size:13.5px">🤝 Boshqaning zakazidan</span>'
        + '<span style="flex:1;height:1px;background:var(--line)"></span>'
        + '<span class="rc-chip" style="flex:none;background:var(--sfc2);color:var(--mut)">' + sh.length + ' ta</span></div>';
      sh.forEach(function (s) {
        h += '<div class="rc-card" style="padding:14px;border-left:3px solid var(--lav);margin-bottom:10px">'
          + '<div style="font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          + '#' + s.order_id + ' · ' + esc(s.title || '') + '</div>'
          + '<div style="font-size:11.5px;color:var(--mut);margin:2px 0 10px">'
          + esc(s.owner || '—') + 'ning zakazi'
          + (s.share_percent != null ? ' · sizning ulushingiz ' + s.share_percent + '%' : '') + '</div>'
          + RcFinance._cLine('Zakaz foydasi', money(s.profit), 'var(--mut)')
          + '<div style="height:2px;background:var(--brd2);margin:7px 0"></div>'
          + RcFinance._cLine('SIZGA TEGADI', money(s.my_share), 'var(--lav-text)', true, '💰')
          + '<div style="font-size:11px;color:var(--mut);margin-top:6px;line-height:1.45">'
          + (s.is_waiting
              ? '⏳ Pul hali ' + esc(s.owner || 'egasi') + 'ning kassasida. U yechib berganda sizga tushadi.'
              : '✅ Bu pul allaqachon sizga o\'tgan.')
          + '</div></div>';
      });
      if (sh.length > 1) {
        h += '<div class="rc-card" style="padding:12px 14px;background:var(--sfc2)">'
          + RcFinance._cLine('Jami sizga tegadi', money(c.shared_total), 'var(--lav-text)', true, '💰')
          + '</div>';
      }
    }

    // 🔵 Zakazga bog'lanmagan pul
    var o = c.orphan || {};
    if ((o.count || 0) > 0) {
      h += '<div class="rc-card" style="padding:12px 14px;margin-top:18px">'
        + '<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="font-weight:800;font-size:13px">🔵 Zakazsiz pul</span>'
        + '<span style="flex:1"></span>'
        + '<span class="rc-chip" style="flex:none;background:var(--sfc2);color:var(--mut)">' + o.count + ' yozuv</span></div>'
        + '<div style="font-size:12px;color:var(--mut);margin-top:7px">'
        + (parseFloat(o.income || 0) ? 'Kirim ' + money(o.income) + ' · ' : '')
        + (parseFloat(o.expense || 0) ? 'Chiqim ' + money(o.expense) + ' · ' : '')
        + (parseFloat(o.distributed || 0) ? 'Yechilgan ' + money(o.distributed) : '')
        + '</div>'
        + '<div style="font-size:10.5px;color:var(--mut);margin-top:5px">Hech qaysi zakazga bog\'lanmagan</div>'
        + '</div>';
    }

    // Zakazga bog'lanmagan taqsimot — «ulushim qayerda?» savolini oldini oladi
    if (parseFloat(c.unlinked_withdrawal || 0) > 0) {
      h += '<div style="font-size:10.5px;color:var(--mut);margin-top:14px;line-height:1.5;padding:0 4px">'
        + 'ⓘ Sizda <b>' + money(c.unlinked_withdrawal) + '</b> so\'m taqsimot hech qaysi '
        + 'buyurtmaga bog\'lanmagan — shuning uchun yuqoridagi kartalarda ko\'rinmaydi. '
        + 'Umumiy hisob «Topshirilgan buyurtmalar» bo\'limida («Menga qoldi»).'
        + '</div>';
    }

    // Kichik izoh — «Kirim» kartasidagi farq (faqat bekor qilingan yozuv bo'lsa)
    if (parseFloat(c.reversal_income || 0) > 0) {
      h += '<div style="font-size:10.5px;color:var(--mut);margin-top:14px;line-height:1.5;padding:0 4px">'
        + 'ⓘ Tepadagi «Kirim» kartasi bekor qilingan ulushning qaytishini ham sanaydi ('
        + money(c.reversal_income) + '). Bu mijozdan kelgan pul emas, shuning uchun bu yerda yo\'q.'
        + '</div>';
    }
    return h;
  },

  _contractCard: function (s) {
    var money = Utils.money, esc = Utils.esc;
    var b = RcFinance._BADGE[s.badge] || RcFinance._BADGE.informal;
    var debt = parseFloat(s.remaining || 0) + parseFloat(s.debt_open || 0);
    var over = parseFloat(s.overpaid || 0);
    var open = !!RcFinance._cOpen[s.order_id];
    var loss = parseFloat(s.profit || 0) < 0;

    var h = '<div class="rc-card c-card" data-oid="' + s.order_id + '" style="padding:14px;cursor:pointer'
      + (debt > 0 ? ';border-left:3px solid var(--danger)' : '') + '">';

    // ── Sarlavha: zakaz + mijoz ──
    h += '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:11px">';
    h += '<div style="flex:1;min-width:0">'
      + '<div style="font-weight:800;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
      + '#' + s.order_id + ' · ' + esc(s.title || '') + '</div>'
      + '<div style="font-size:11.5px;color:var(--mut);margin-top:2px">Mijoz: '
      + (s.customer ? esc(s.customer) : 'ko\'rsatilmagan') + '</div></div>';
    h += '<div style="flex:none;font-size:15px" title="' + esc(b.txt) + '">' + b.ic + '</div>';
    h += '</div>';

    // ── CHEK ──
    h += RcFinance._cLine('Kelishdik', money(s.contract_amount), 'var(--txt)');
    h += RcFinance._cLine('Oldik', money(s.received), 'var(--acc-text)');
    h += '<div style="height:1px;background:var(--line);margin:6px 0"></div>';
    if (debt > 0) {
      h += RcFinance._cLine('MIJOZ QARZI', money(debt), 'var(--danger)', true, '🔴');
    } else if (over > 0) {
      h += RcFinance._cLine('ORTIQCHA OLDIK', money(over), 'var(--cyan-text)', true, '🔵');
    } else {
      h += RcFinance._cLine('QARZ YO\'Q', '0', 'var(--mut)', true, '✅');
    }
    h += '<div style="height:6px"></div>';
    h += RcFinance._cLine('Sarfladik', money(s.expense), 'var(--pch-text)');
    h += '<div style="height:2px;background:var(--brd2);margin:7px 0"></div>';
    h += RcFinance._cLine(loss ? 'ZARAR' : 'FOYDA', money(s.profit),
      loss ? 'var(--danger)' : 'var(--acc-text)', true, loss ? '⚠️' : '✅');
    if (s.profit_pct != null) {
      h += '<div style="text-align:right;font-size:10.5px;color:var(--mut);margin-top:-2px">'
        + 'har 100 so\'mdan ' + Math.round(s.profit_pct) + ' so\'m foyda</div>';
    }

    // ── Ochilgan tafsilot ──
    if (open) {
      h += '<div style="height:1px;background:var(--line);margin:12px 0 9px"></div>';
      h += '<div style="font-size:11px;color:var(--mut);font-weight:700;margin-bottom:5px">Nimalarga sarfladik</div>';
      var cats = s.expense_by_cat || {};
      var keys = Object.keys(cats);
      if (!keys.length) {
        h += '<div style="font-size:12px;color:var(--mut);padding:3px 0">Xarajat yozilmagan</div>';
      }
      keys.forEach(function (k) {
        h += '<div style="display:flex;gap:8px;padding:2.5px 0 2.5px 10px">'
          + '<span style="font-size:12px;color:var(--mut)">• ' + RcFinance._catLabel(k) + '</span>'
          + '<span style="flex:1"></span>'
          + '<span style="font-size:12.5px;color:var(--txt);font-variant-numeric:tabular-nums">' + money(cats[k]) + '</span></div>';
      });
      if (parseFloat(s.distributed || 0) > 0) {
        h += '<div style="height:1px;background:var(--line);margin:9px 0"></div>';
        h += RcFinance._cLine('Ulushga berdik', money(s.distributed), 'var(--lav-text)');
        h += RcFinance._cLine('Sizga qoldi', money(s.left), 'var(--cyan-text)', true, '👛');
      }
      if (parseFloat(s.debt_open || 0) > 0) {
        h += '<div style="height:1px;background:var(--line);margin:9px 0"></div>';
        h += RcFinance._cLine('Rasmiy qarz yozuvi (' + s.debt_count + ')', money(s.debt_open), 'var(--danger)');
        if (s.debt_due) h += '<div style="font-size:10.5px;color:var(--mut);text-align:right">muddat: ' + Utils.date(s.debt_due) + '</div>';
      }
      // «Buyurtmani ochish» tugmasi ATAYLAB olib tashlandi (2026-08-05):
      // u `location.hash`ni o'zgartirib butun ekranni almashtirardi —
      // foydalanuvchi «ekran ochilib yonayapti» dedi. Buyurtmaga Buyurtmalar
      // bo'limidan kiriladi; bu yer faqat HISOB ko'rsatadi.
      h += '<div style="font-size:10.5px;color:var(--mut);margin-top:9px">' + (s.record_count || 0) + ' ta pul yozuvi</div>';
    } else {
      h += '<div style="text-align:center;color:var(--mut);font-size:11px;margin-top:9px">'
        + '<i class="fas fa-chevron-down"></i> tafsilot uchun bosing</div>';
    }
    h += '</div>';
    return h;
  },


  // ══════════════════════════════════════════════════════════════════════
  //  HISOBLANGAN QARZ (2026-08-05) — «kim bizdan qancha qarz»
  //  Manba: shartnoma − olingan pul. YOZUV YARATILMAYDI — faqat hisoblanadi.
  //  Nega yozuv emas: `ClientDebt.customer` majburiy, lekin zakazlarning
  //  26% ida mijoz yo'q (o'lchandi) — aynan qarzdor zakazlar saqlanmasdi.
  //  Bundan tashqari qo'lda ham yozilgan bo'lsa qarz ikki marta ko'rinardi.
  //  Davr filtridan MUSTAQIL — qarz nuqta-vaqt holati (backend izohiga qarang).
  // ══════════════════════════════════════════════════════════════════════
  _autoDebtsHtml: function (c) {
    var money = Utils.money, esc = Utils.esc;
    var list = (c && c.debtors) || [];

    var h = '<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">'
      + '<span style="font-weight:800;font-size:13.5px">🔴 Kim bizga qarzdor</span>'
      + '<span style="flex:1;height:1px;background:var(--line)"></span>'
      + '<span class="rc-chip" style="flex:none;background:var(--sfc2);color:'
      + (list.length ? 'var(--danger)' : 'var(--mut)') + '">' + list.length + ' ta</span></div>';

    if (!list.length) {
      h += '<div class="rc-card" style="padding:16px;text-align:center">'
        + '<div style="font-size:26px">✅</div>'
        + '<div style="font-weight:700;font-size:13.5px;margin-top:5px">Hamma to\'lagan</div>'
        + '<div style="font-size:11.5px;color:var(--mut);margin-top:3px">Kelishilgan pul to\'liq olingan</div></div>';
      return h;
    }

    h += '<div style="font-size:11px;color:var(--mut);margin-bottom:10px;line-height:1.5">'
      + '<span style="color:var(--danger);font-weight:700">Qizil</span> — tizim o\'zi hisoblagan '
      + '(kelishdik − oldik). Yozish shart emas.</div>';
    h += (window.RcHint ? RcHint.html('debtors') : '');

    // ── MIJOZ bo'yicha guruhlash (2026-08-05) ──
    // «kim bizdan qancha qarzligi ko'rinishi kerak va qaysi zakazdan
    //  ekanligi ham» — bitta mijozning bir necha zakazi bo'lsa, qarzi
    //  QO'SHILIB bitta kartada chiqadi, ichida zakazlar ro'yxati bilan.
    var groups = [];
    var byKey = {};
    list.forEach(function (dt) {
      // customer_id yo'q bo'lsa har zakaz alohida (mijozni aralashtirmaymiz)
      var key = dt.customer_id ? ('c' + dt.customer_id) : ('o' + dt.order_id);
      if (!byKey[key]) {
        byKey[key] = { name: dt.customer || '', has_customer: !!dt.customer_id, total: 0, orders: [] };
        groups.push(byKey[key]);
      }
      byKey[key].total += parseFloat(dt.remaining || 0);
      byKey[key].orders.push(dt);
    });
    groups.sort(function (a, b) { return b.total - a.total; });   // ko'p qarzdor tepada

    // Jami — 2 va undan ko'p bo'lsa
    if (groups.length > 1) {
      h += '<div class="rc-card" style="padding:13px 14px;margin-bottom:10px;border-left:3px solid var(--danger)">'
        + RcFinance._cLine('JAMI BIZGA QARZ', money(c.debtors_total), 'var(--danger)', true, '🔴')
        + '</div>';
    }

    h += '<div style="display:flex;flex-direction:column;gap:10px">';
    groups.forEach(function (g, gi) {
      h += '<div class="rc-card" style="padding:13px 14px;border-left:3px solid var(--danger)">';
      // Kim — eng katta sarlavha
      h += '<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="width:30px;height:30px;border-radius:50%;background:var(--danger);color:#fff;'
        + 'display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex:none">'
        + (g.has_customer ? esc((g.name || '?').trim().charAt(0).toUpperCase()) : '?') + '</span>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-weight:800;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
        + (g.has_customer ? esc(g.name) : '<span style="color:var(--mut)">Mijoz belgilanmagan</span>') + '</div>'
        + '<div style="font-size:11px;color:var(--mut)">' + g.orders.length + ' ta zakaz</div>'
        + '</div></div>';

      // Qancha qarz — katta
      h += '<div style="height:2px;background:var(--brd2);margin:9px 0 5px"></div>';
      h += RcFinance._cLine('QARZI', money(g.total), 'var(--danger)', true, '🔴');

      // Qaysi zakazdan — har biri alohida qatorda
      h += '<div style="margin-top:9px;padding-top:8px;border-top:1px dashed var(--brd)">';
      h += '<div style="font-size:10.5px;color:var(--mut);font-weight:700;margin-bottom:4px">QAYSI ZAKAZDAN</div>';
      g.orders.forEach(function (dt) {
        var camt = parseFloat(dt.contract_amount || 0);
        var recv = parseFloat(dt.received || 0);
        var pct = camt > 0 ? Math.min(Math.round(recv / camt * 100), 100) : 0;
        h += '<div style="padding:6px 0">'
          + '<div style="display:flex;align-items:baseline;gap:6px">'
          + '<span style="font-size:12px;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          + '#' + dt.order_id + ' · ' + esc(dt.title || '') + '</span>'
          + '<span style="flex:1;border-bottom:1px dotted var(--brd);min-width:8px"></span>'
          + '<span style="font-size:13.5px;font-weight:800;color:var(--danger);font-variant-numeric:tabular-nums;white-space:nowrap">'
          + money(dt.remaining) + '</span></div>'
          + '<div style="display:flex;align-items:center;gap:7px;margin-top:4px">'
          + '<div style="flex:1;height:4px;background:var(--sfc2);border-radius:99px;overflow:hidden">'
          + '<div style="height:100%;width:' + pct + '%;background:var(--cyan);border-radius:99px"></div></div>'
          + '<span style="font-size:10px;color:var(--mut);flex:none;white-space:nowrap">'
          + money(dt.received) + ' / ' + money(dt.contract_amount) + '</span></div>'
          + '</div>';
      });
      h += '</div></div>';
    });
    h += '</div>';
    return h;
  },

  _debtsHtml: function (debts) {
    if (!debts.length) {
      return '<div class="rc-empty"><div class="rc-empty-ic">📝</div><div style="font-weight:700;color:var(--txt)">Qarz yo‘q</div></div>';
    }
    var h = '';
    debts.forEach(function (dbt, i) { h += RcFinance._debtCard(dbt, i); });
    return h;
  },

  // Muddatli (qo'lda yozilgan) qarz — ATAYLAB SARIQ rangda.
  // Tizim hisoblagan qarz QIZIL. Ikkalasi bir sahifada turgani uchun
  // rang bilan ajratiladi (foydalanuvchi talabi, 2026-08-05).
  _debtCard: function (dbt, i) {
    var esc = Utils.esc, money = Utils.money;
    var orig = parseInt(dbt.original_amount) || 0;
    var paid = parseInt(dbt.paid_amount) || 0;
    var rem = parseInt(dbt.remaining) || 0;
    var pct = orig > 0 ? Math.min(100, Math.round(paid / orig * 100)) : 0;
    var name = (dbt.customer && dbt.customer.name) || 'Mijoz';

    var h = '<div class="rc-card fin-debt" style="padding:13px 14px;border-left:3px solid var(--pch);'
      + 'animation-delay:' + Math.min(i * 0.04, 0.3) + 's">';
    // Kim
    h += '<div style="display:flex;align-items:center;gap:8px">'
      + '<span style="width:30px;height:30px;border-radius:50%;background:var(--pch);color:var(--acc-ink);'
      + 'display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex:none">'
      + esc((name || '?').trim().charAt(0).toUpperCase()) + '</span>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-weight:800;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
      + esc(name) + '</div>'
      + '<div style="font-size:11px;color:var(--mut)">'
      + (dbt.due_date ? '📅 muddat: ' + Utils.date(dbt.due_date) : 'muddat belgilanmagan') + '</div>'
      + '</div></div>';
    // Chek
    h += '<div style="height:2px;background:var(--brd2);margin:9px 0 5px"></div>';
    h += RcFinance._cLine('Kelishilgan', money(orig), 'var(--txt)');
    h += RcFinance._cLine("To'ladi", money(paid), 'var(--acc-text)');
    h += '<div style="height:1px;background:var(--line);margin:6px 0"></div>';
    h += RcFinance._cLine('QOLDIQ', money(rem), rem > 0 ? 'var(--pch-text)' : 'var(--mut)', true,
      rem > 0 ? '🟠' : '✅');
    // Progress
    h += '<div style="margin-top:9px">'
      + '<div style="height:5px;background:var(--sfc2);border-radius:99px;overflow:hidden">'
      + '<div style="height:100%;width:' + pct + '%;background:var(--pch);border-radius:99px"></div></div>'
      + '<div style="font-size:10.5px;color:var(--mut);margin-top:4px;text-align:right">' + pct + "% to'langan</div>"
      + '</div>';
    if (rem > 0) {
      h += '<button class="rc-btn rc-btn-sm fin-pay-debt" data-id="' + dbt.id + '" style="width:100%;margin-top:9px">'
        + "To'lov qabul qilish</button>";
    }
    h += '</div>';
    return h;
  },

  // ── Faqat qidiruv (matn) frontend filtri; davr filtri backendda ──
  _filtered: function () {
    var records = (RcFinance._data && RcFinance._data.records) || [];
    var q = (RcFinance._search || '').toLowerCase().trim();
    if (!q) return records;
    return records.filter(function (t) {
      var ty = RcFinance.TYPES[t.record_type];
      var parts = [
        ty ? ty.label : t.record_type,
        RcFinance._catLabel(t.category),
        RcFinance.PAY[t.payment_method] || t.payment_method || '',
        t.description || '', t.order_title || '', t.customer_name || '',
        t.recipient_name || '', t.stage_name || '',
      ].join(' ').toLowerCase();
      return parts.indexOf(q) !== -1;
    });
  },

  // Tab tanasini ko'rsatish/yashirish — bitta joyda (takrorlanmasin)
  _paintTabs: function () {
    var map = { records: 'tab-records', debts: 'tab-debts', contracts: 'tab-contracts',
                split: 'tab-split', creditor: 'tab-creditor' };
    Object.keys(map).forEach(function (k) {
      var el = document.getElementById(map[k]);
      if (el) el.style.display = (RcFinance._tabOpen && RcFinance._tab === k) ? '' : 'none';
    });
    document.querySelectorAll('.fin-tab').forEach(function (b) {
      b.classList.toggle('active', RcFinance._tabOpen && b.dataset.tab === RcFinance._tab);
    });
  },

  bind: function () {
    // Yangi funksiya izohlari (rc-hint.js) — har chizilgandan keyin
    if (window.RcHint && RcHint.bind) { try { RcHint.bind(); } catch (e) {} }
    // Tanishtiruv (rc-tour.js) — BIRINCHI kirishda o'zi boshlanadi.
    // Ko'rilgan bo'lsa hech narsa qilmaydi (localStorage).
    if (window.RcTour && RcTour.auto) { try { RcTour.auto('finance'); } catch (e) {} }

    // ── Asosiy tab (2026-08-05) ──
    // Aktiv tabni QAYTA bosish uni YOPADI (akkordeon). Uchala tabda ham
    // bir xil ishlaydi — foydalanuvchi talabi: «shartnoma tabini bosganda
    // tab yopilishi kerak, bu narsa Tranzaksiyalar va Qarzlarda ham ishlasin».
    document.querySelectorAll('.fin-tab').forEach(function (btn) {
      btn.onclick = function () {
        var t = btn.dataset.tab;
        if (RcFinance._tab === t) {
          RcFinance._tabOpen = !RcFinance._tabOpen;   // o'sha tab — yopib/ochib qo'yamiz
        } else {
          RcFinance._tab = t;
          RcFinance._tabOpen = true;                  // boshqa tab — ochiladi
        }
        RcFinance._paintTabs();
      };
    });
    RcFinance._paintTabs();

    // ── Shartnoma kartasi: bosilsa tafsilot ochiladi/yopiladi ──
    document.querySelectorAll('.c-card').forEach(function (el) {
      el.onclick = function () {
        var oid = el.dataset.oid;
        RcFinance._cOpen[oid] = !RcFinance._cOpen[oid];
        RcFinance._paint();                            // _tab / _cPage saqlanadi
      };
    });

    // ── Sahifalash: 5 tadan (2026-08-05) ──
    document.querySelectorAll('.c-page-btn').forEach(function (el) {
      el.onclick = function (ev) {
        ev.stopPropagation();
        RcFinance._cPage = parseInt(el.dataset.page, 10) || 1;
        RcFinance._paint();
        var top = document.getElementById('tab-contracts');
        if (top) top.scrollIntoView({ block: 'start', behavior: 'smooth' });
      };
    });

    // Professional davr filtri (RcPeriod) → o'zgarsa qayta yuklash
    RcPeriod.bind(document.getElementById('app'), RcFinance._st, (RcFinance._data || {}).months, function () {
      RcFinance._reload();
    });

    // 💰 Taqsimlanmagan foyda eslatmasi → «Ustalar foydasi» → taqsimlanmaganlar
    // (2026-08-12 tuzatish: ilgari qattiq 450ms setTimeout bilan chaqirilardi —
    // WS javobi shundan sekin kelsa (`_ustaData` hali yo'q), `_openUndistributed`
    // jim to'xtar edi va tugma "ishlamaydi" bo'lib ko'rinardi. Endi `_loadUstalar`
    // ning callback'i orqali — ma'lumot AYNAN kelgan zahoti ochiladi, poyga-holat
    // yo'q. Hech qachon o'rnatilmagan o'lik `_ustaOpen` o'zgaruvchisi ham olib
    // tashlandi — panel har bosilganda yangidan yuklanadi, eskirgan holat qolmaydi.)
    var uhBtn = document.getElementById('fin-undist-hint');
    if (uhBtn) uhBtn.onclick = function () {
      var panel = document.getElementById('fin-breakdown');
      if (!panel) return;
      RcFinance._highlightStat(null);
      panel.dataset.metric = 'ustalar';
      panel.style.display = '';
      panel.innerHTML = '<div class="rc-card" style="padding:18px;text-align:center;color:var(--mut);font-size:12px">👷 Yuklanmoqda...</div>';
      RcFinance._loadUstalar(function () { RcFinance._openUndistributed(); });
    };

    // H7: Qabul qilish / Olmadim
    function _pa(id, accept, btn) {
      if (btn.dataset.busy === '1') return;
      btn.dataset.busy = '1'; btn.disabled = true;
      var _t = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      WS.send('profit.accept', { line_id: id, accept: accept }, function (m) {
        if (!m.ok) {
          btn.dataset.busy = ''; btn.disabled = false; btn.innerHTML = _t;
          return Toast.error(m.error || 'Xatolik');
        }
        Toast.success(accept ? 'Qabul qilindi — pul hisobingizga qo‘shildi'
                             : 'Rad etildi — summa egasiga qaytarildi');
        RcFinance._reload();
      }, 30000);
    }
    document.querySelectorAll('.rc-pa-ok').forEach(function (b) {
      b.onclick = function () { _pa(parseInt(b.dataset.id), true, b); };
    });
    document.querySelectorAll('.rc-pa-no').forEach(function (b) {
      b.onclick = function () {
        if (!window.RcSheet || !RcSheet.confirm) return _pa(parseInt(b.dataset.id), false, b);
        RcSheet.confirm('Ulushni olmayapsizmi?',
          'Summa buyurtma egasining kassasiga qaytariladi va unga xabar boradi.',
          function () { _pa(parseInt(b.dataset.id), false, b); });
      };
    });

    // 💰 Kutilayotgan foyda qatorlari → shu zakazga o'tish (H8)
    document.querySelectorAll('.rc-pend-row').forEach(function (row) {
      row.onclick = function () {
        var oid = row.dataset.oid;
        if (oid) Router.go('/orders/' + oid);
      };
    });

    // ── Asosiy karta katakchalari → sodda tushuntirish (2026-08-25) ──
    document.querySelectorAll('.fin-cell').forEach(function (c) {
      c.onclick = function () { RcFinance._toggleCell(c.dataset.cell); };
    });

    // Stat kartalar → oylik breakdown
    RcFinance._loadDups();
    var ustBtn = document.getElementById('fin-ustalar');
    if (ustBtn) ustBtn.onclick = function () { RcFinance._toggleUstalar(); };
    document.querySelectorAll('.fin-stat').forEach(function (card) {
      card.onclick = function () {
        // «Sof foyda» kartasi — oylik breakdown emas, MAVJUD Sof foyda
        // panelini ochadi (17 ta zakaz ro'yxati o'sha yerda, 2026-08-05).
        if (card.dataset.metric === 'sof') {
          var body = document.getElementById('acc-body-sof');
          var arr = document.getElementById('acc-arr-sof');
          var isOpen = body && body.style.display !== 'none';
          if (!isOpen) RcFinance._accToggle('sof', false);
          var head = document.getElementById('acc-arr-sof');
          if (head && !isOpen) {
            head.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
          return;
        }
        RcFinance._toggleBreakdown(card.dataset.metric);
      };
    });

    // Qidiruv (frontend)
    var se = document.getElementById('fin-search');
    if (se) se.oninput = Utils.debounce(function () {
      RcFinance._search = se.value;
      var rows = RcFinance._filtered();
      var box = document.getElementById('fin-records');
      if (box) { box.innerHTML = RcFinance._recordsHtml(rows); RcFinance._bindTx(); }
      // Sarlavhadagi "N ta" chipini ham yangilaymiz (qidiruvda son o'zgaradi)
      var cnt = document.getElementById('recs-count');
      if (cnt) cnt.textContent = rows.length + ' ta';
    }, 200);

    // Amal tugmalari
    var addIn = document.getElementById('fin-add-in');
    if (addIn) addIn.onclick = function () { RcFinance._addSheet('income'); };
    var addEx = document.getElementById('fin-add-ex');
    if (addEx) addEx.onclick = function () { RcFinance._addSheet('expense'); };
    var wdBtn = document.getElementById('fin-withdraw');
    if (wdBtn) wdBtn.onclick = function () { RcFinance._withdrawSheet(); };

    // Yangi qarz qo'shish
    var debtAddBtn = document.getElementById('fin-add-debt');
    if (debtAddBtn) debtAddBtn.onclick = function () { RcFinance._debtSheet(); };

    // Qarz to'lash (qaysi qarz — data-id)
    document.querySelectorAll('.fin-pay-debt').forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); RcFinance._payDebtSheet(parseInt(b.dataset.id)); };
    });

    // ── Ustalar qarzi (kreditor) ──
    var crAdd = document.getElementById('fin-add-creditor');
    if (crAdd) crAdd.onclick = function () { RcFinance._creditorSheet(); };
    document.querySelectorAll('.cr-pay').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        RcFinance._creditorPaySheet(parseInt(b.dataset.id), b.dataset.name, b.dataset.rem);
      };
    });
    document.querySelectorAll('.cr-del').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        RcFinance._creditorDelete(parseInt(b.dataset.id), b.dataset.name);
      };
    });

    RcFinance._bindTx();
  },

  _bindTx: function () {
    document.querySelectorAll('.fin-tx').forEach(function (card) {
      card.onclick = function () {
        var id = parseInt(card.dataset.id);
        var recs = (RcFinance._data && RcFinance._data.records) || [];
        var t = recs.filter(function (r) { return r.id === id; })[0];
        if (t) RcFinance._showDetail(t);
      };
    });
  },

  _showDetail: function (t) {
    var esc = Utils.esc;
    var ty = RcFinance.TYPES[t.record_type] || { label: t.record_type, pos: true };
    var amtClr = ty.pos ? 'var(--acc-text)' : 'var(--danger)';
    var rows = [];
    rows.push(['Sana va vaqt', Utils.datetime(t.created_at || t.date)]);
    if (t.category) rows.push(['Kategoriya', RcFinance._catLabel(t.category)]);
    rows.push(["To‘lov usuli", RcFinance.PAY[t.payment_method] || t.payment_method || '—']);
    if (t.description) rows.push(['Izoh', esc(t.description)]);
    if (t.order_title) rows.push(['Buyurtma', '📦 ' + esc(t.order_title)]);
    if (t.stage_name) rows.push(['Etap', esc(t.stage_name)]);
    if (t.customer_name) rows.push(['Mijoz', esc(t.customer_name)]);
    if (t.recipient_name) rows.push(['Oluvchi', '👤 ' + esc(t.recipient_name)]);

    var body = '<div style="text-align:center;margin-bottom:14px">';
    body += '<div style="font-size:26px;font-weight:800;color:' + amtClr + '">' + (ty.pos ? '+' : '-') + Utils.money(t.amount) + " so‘m</div>";
    body += '<div style="font-size:13px;color:var(--mut);margin-top:4px">' + esc(ty.label) + '</div></div>';
    body += '<div class="rc-card" style="padding:4px 14px">';
    rows.forEach(function (r, i) {
      body += '<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;' + (i < rows.length - 1 ? 'border-bottom:1px solid var(--brd)' : '') + '">';
      body += '<span style="font-size:12px;color:var(--mut)">' + r[0] + '</span>';
      body += '<span style="font-size:12px;font-weight:600;text-align:right;max-width:62%">' + r[1] + '</span></div>';
    });
    body += '</div>';

    if (window.RcSheet && typeof RcSheet.open === 'function') {
      RcSheet.open(ty.label, body, {});
    } else {
      Toast.info(ty.label + ' · ' + (ty.pos ? '+' : '-') + Utils.money(t.amount));
    }
  },

  // ── Forma qurish yordamchilari (rc- uslub) ──
  _txt: function (label, name, ph) {
    return '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">' + label + '</div>' +
      '<input name="' + name + '" class="rc-input" type="text" placeholder="' + (ph || '') + '"></div>';
  },
  _money: function (label, name) {
    return '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">' + label + '</div>' +
      '<input name="' + name + '" class="rc-input ce-money-input" type="text" inputmode="numeric" placeholder="0"></div>';
  },
  _sel: function (label, name, opts) {
    var o = opts.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + '</option>'; }).join('');
    return '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">' + label + '</div>' +
      '<select name="' + name + '" class="rc-input">' + o + '</select></div>';
  },

  // ── Vizual tanlash (radio-karta) — oddiy select o'rniga; dark/light theme-safe.
  // opts: [[value, label, iconHtml, activeColor, checked], ...]
  // Faol karta = pastel to'ldirish + qora ink (badge kabi — ikkala temada o'qiladi).
  _choice: function (label, name, opts) {
    var items = opts.map(function (o) {
      return '<label data-clr="' + o[3] + '" onclick="RcFinance._pickChoice(this)" ' +
        'style="flex:1;min-width:0;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:13px 6px;border-radius:14px;cursor:pointer;border:1.5px solid var(--brd);background:var(--sfc2);color:var(--mut);transition:all .15s;-webkit-tap-highlight-color:transparent">' +
        '<input type="radio" name="' + name + '" value="' + o[0] + '"' + (o[4] ? ' checked' : '') + ' style="position:absolute;opacity:0;width:0;height:0;pointer-events:none">' +
        '<span style="font-size:19px;line-height:1">' + o[2] + '</span>' +
        '<span style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">' + o[1] + '</span></label>';
    }).join('');
    return '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">' + label + '</div>' +
      '<div style="display:flex;gap:8px">' + items + '</div></div>';
  },
  _pickChoice: function (el) {
    var input = el.querySelector('input[type=radio]');
    if (!input) return;
    input.checked = true;
    document.querySelectorAll('input[name="' + input.name + '"]').forEach(function (r) {
      RcFinance._paintChoice(r.closest('label'), r.checked);
    });
  },
  _paintChoice: function (lab, active) {
    if (!lab) return;
    var clr = lab.getAttribute('data-clr') || 'var(--acc)';
    if (active) {
      lab.style.background = clr;
      lab.style.color = 'var(--acc-ink)';
      lab.style.borderColor = 'transparent';
      lab.style.boxShadow = 'var(--shadow-sm)';
      lab.style.transform = 'translateY(-1px)';
    } else {
      lab.style.background = 'var(--sfc2)';
      lab.style.color = 'var(--mut)';
      lab.style.borderColor = 'var(--brd)';
      lab.style.boxShadow = 'none';
      lab.style.transform = 'none';
    }
  },
  _paintAllChoices: function () {
    document.querySelectorAll('label[data-clr] input[type=radio]').forEach(function (r) {
      RcFinance._paintChoice(r.closest('label[data-clr]'), r.checked);
    });
  },

  // Kategoriya nomi (built-in yoki custom) — data.expense_cats birinchi, keyin CAT.
  _catLabel: function (key) {
    if (!key) return '';
    var cats = (RcFinance._data && RcFinance._data.expense_cats) || [];
    for (var i = 0; i < cats.length; i++) { if (cats[i].key === key) return cats[i].name; }
    return RcFinance.CAT[key] || key;
  },

  // Kategoriya kartalari (kichik, o'ralib ketadigan grid) — FAQAT chiqimda.
  _catCards: function (cats, selKey) {
    var esc = Utils.esc;
    var items = (cats || []).map(function (c, i) {
      var sel = selKey ? (c.key === selKey) : (i === 0);
      return '<label data-clr="' + c.color + '" onclick="RcFinance._pickChoice(this)" ' +
        'style="flex:0 0 auto;min-width:74px;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:9px 10px;border-radius:12px;cursor:pointer;border:1.5px solid var(--brd);background:var(--sfc2);color:var(--mut);transition:all .15s;-webkit-tap-highlight-color:transparent">' +
        '<input type="radio" name="category" value="' + esc(c.key) + '"' + (sel ? ' checked' : '') + ' style="position:absolute;opacity:0;width:0;height:0;pointer-events:none">' +
        '<span style="font-size:17px;line-height:1">' + (c.icon || '📦') + '</span>' +
        '<span style="font-size:11px;font-weight:700;white-space:nowrap">' + esc(c.name) + '</span></label>';
    }).join('');
    return '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">Kategoriya</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:7px">' + items + '</div></div>';
  },

  // ── Kirim / Chiqim qo'shish (WS: finance.create) ──
  _addSheet: function (preType) {
    if (!(window.RcSheet && RcSheet.open)) { Toast.info('Tez orada'); return; }
    preType = preType === 'expense' ? 'expense' : 'income';
    var isExp = preType === 'expense';
    var cats = (RcFinance._data && RcFinance._data.expense_cats) || [];
    var pay = RcFinance._choice("To‘lov turi", 'payment_method', [
      ['cash', 'Naqd', '<i class="fas fa-money-bill-wave"></i>', 'var(--acc)', true],
      ['card', 'Karta', '<i class="fas fa-credit-card"></i>', 'var(--cyan)', false],
      ['transfer', "O‘tkazma", '<i class="fas fa-exchange-alt"></i>', 'var(--lav)', false],
    ]);
    // Chiqim: Summa + Kategoriya (kartalar) + Izoh + To'lov turi
    // Kirim: faqat Summa + Izoh + To'lov turi (kategoriyasiz)
    var body = '<div style="display:flex;flex-direction:column;gap:14px;padding-top:2px">' +
      RcFinance._money('Summa *', 'amount') +
      (isExp ? RcFinance._catCards(cats, 'other') : '') +
      RcFinance._txt('Izoh', 'description', 'Izoh (ixtiyoriy)') +
      pay +
      '</div>';
    RcSheet.open(isExp ? '➖ Chiqim qo‘shish' : '➕ Kirim qo‘shish', body,
      { footer: '<button class="rc-btn rc-btn-sm" id="fin-save">Saqlash</button>' });
    Utils.bindMoneyInputs();
    RcFinance._paintAllChoices();
    var btn = document.getElementById('fin-save');
    if (btn) btn.onclick = function () {
      var f = RcSheet.getFormData();
      var amt = Utils.rawMoney(f.amount);
      if (amt <= 0) return Toast.error('Summa kiriting');
      btn.disabled = true;
      // DUBLIKAT OLDINI OLISH (2026-08-07): backend 60 soniya ichidagi bir xil
      // summani sezsa `dup_confirm` qaytaradi — tasdiqlansagina qayta yuboramiz.
      var _allowExtra = false;
      var sendExtra = function () { _allowExtra = true; send(true); };
      var send = function (confirmDup) {
        WS.send('finance.create', {
          type: preType, amount: amt, description: f.description || '',
          payment_method: f.payment_method,
          category: (preType === 'expense' ? (f.category || 'other') : ''),
          confirm_dup: !!confirmDup,
          allow_extra: _allowExtra,
        }, function (msg) {
          if (!msg.ok && msg.dup_confirm) {
            btn.disabled = false;
            if (confirm('\u26A0\uFE0F ' + msg.error)) send(true);
            return;
          }
          // 2026-08-08: shartnoma to'lib bo'lgan — rad etmaymiz, so'raymiz.
          // Bu yo'lda (Moliya sahifasi) buyurtma oynasi yo'q, shuning uchun
          // qisqa tasdiq: pul «Qo'shimcha daromad» bo'lib o'tadi.
          if (!msg.ok && msg.over_contract) {
            btn.disabled = false;
            var oc = msg.over_contract;
            var q = 'Shartnoma summasi to\u2018lib bo\u2018lgan.\n\n'
              + 'Shartnoma: ' + Utils.money(oc.contract) + '\n'
              + 'Kelgan: ' + Utils.money(oc.already) + '\n'
              + 'Ortiq: ' + Utils.money(oc.extra) + '\n\n'
              + 'Bu qo\u2018shimcha ish uchunmi? Ha desangiz «Qo\u2018shimcha daromad» '
              + 'bo\u2018lib yoziladi (foydaga qo\u2018shilmaydi).';
            if (confirm(q)) sendExtra();
            return;
          }
          if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); btn.disabled = false; return; }
          RcSheet.close(); Toast.success('Saqlandi'); RcFinance._reload();
        });
      };
      send(false);
    };
  },

  // ══════════════════════════════════════════════════════════════════
  // DUBLIKAT TEKSHIRUVI (2026-08-07)
  // Muammo: bitta kirim/chiqim ikki marta yozilib qolgan (masalan tugma
  // ikki marta bosilgan). Natijada balans va foyda noto'g'ri chiqadi.
  // Yechim: shubhali juftlarni ko'rsatamiz, qaror foydalanuvchida.
  // ══════════════════════════════════════════════════════════════════
  _dups: null,

  _loadDups: function () {
    if (!document.getElementById('fin-dup-slot')) return;
    WS.send('finance.duplicates', {}, function (msg) {
      var d = (msg && msg.ok && msg.data) || null;
      if (!d || !d.count) return;
      RcFinance._dups = d;
      var el = document.getElementById('fin-dup-slot');
      if (!el) return;
      var high = (d.groups || []).filter(function (g) { return g.risk === 'high'; }).length;
      el.innerHTML = '<div class="rc-card" id="fin-dup-btn" style="cursor:pointer;'
        + 'padding:12px 14px;border:1px solid var(--pch);background:var(--sfc2)">'
        + '<div style="display:flex;align-items:center;gap:10px">'
        + '<div style="font-size:20px">\u26A0\uFE0F</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-weight:800;font-size:13px;color:var(--txt)">'
        + d.count + ' ta shubhali takror yozuv</div>'
        + '<div style="font-size:11px;color:var(--mut);margin-top:2px">Ortiqcha '
        + Utils.money(d.total_extra) + ' so\u2018m'
        + (high ? ' \u00B7 ' + high + ' tasi juda shubhali' : '') + '</div>'
        + '</div><i class="fas fa-chevron-right" style="color:var(--mut)"></i></div></div>';
      var b = document.getElementById('fin-dup-btn');
      if (b) b.onclick = RcFinance._dupSheet;
    });
  },

  _dupSheet: function () {
    var d = RcFinance._dups;
    if (!d || !d.groups || !d.groups.length) return;
    var esc = Utils.esc, money = Utils.money;
    var RISK = { high: ['\uD83D\uDD34', 'Juda shubhali', 'var(--danger)'],
                 medium: ['\uD83D\uDFE1', 'Shubhali', 'var(--pch)'],
                 low: ['\u26AA', 'Ehtimol to\u2018g\u2018ri', 'var(--mut)'] };
    var body = '<div style="font-size:11.5px;color:var(--mut);line-height:1.6;'
      + 'padding:10px 12px;background:var(--sfc2);border-radius:10px;margin-bottom:12px">'
      + 'Quyidagi yozuvlar <b style="color:var(--txt)">bir xil summa, bir xil kun</b> '
      + 'bilan takrorlangan \u2014 ehtimol tugma ikki marta bosilgan.<br><br>'
      + '<b style="color:var(--txt)">Hech narsa avtomatik o\u2018chirilmaydi.</b> '
      + 'Ortiqcha yozuv yonidagi \uD83D\uDDD1 ni bossangiz \u2014 o\u2018sha bittasi '
      + 'o\u2018chadi (bazadan yo\u2018qolmaydi, faqat hisobdan chiqadi). '
      + 'Agar ikkalasi ham haqiqiy bo\u2018lsa \u2014 \u00ABIkkalasi to\u2018g\u2018ri\u00BB.</div>';
    body += '<div style="display:flex;flex-direction:column;gap:10px">';
    d.groups.forEach(function (g) {
      var r = RISK[g.risk] || RISK.low;
      var gids = (g.items || []).map(function (it) { return it.id; }).join(',');
      body += '<div class="rc-card" data-dupg="' + esc(g.key) + '" style="padding:11px 12px">';
      body += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:7px">'
        + '<span style="font-size:11px;font-weight:800;color:' + r[2] + '">' + r[0] + ' ' + r[1] + '</span>'
        + '<span style="flex:1"></span>'
        + '<span style="font-size:13px;font-weight:800;color:'
        + (g.record_type === 'income' ? 'var(--acc-text)' : 'var(--danger)') + '">'
        + (g.record_type === 'income' ? '+' : '\u2212') + money(g.amount) + '</span></div>';
      body += '<div style="font-size:11px;color:var(--mut);margin-bottom:6px">'
        + esc(g.order_title || ('#' + g.order_id)) + ' \u00B7 ' + esc(g.date || '')
        + ' \u00B7 ' + g.count + ' marta \u00B7 orasi ' + g.gap_sec + ' soniya</div>';
      (g.items || []).forEach(function (it) {
        body += '<div style="display:flex;align-items:center;gap:8px;font-size:11.5px;'
          + 'padding:5px 8px;background:var(--sfc2);border-radius:8px;margin-bottom:4px">'
          + '<span style="color:var(--mut);font-variant-numeric:tabular-nums">'
          + esc((it.created_at || '').slice(11, 16)) + '</span>'
          + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;'
          + 'white-space:nowrap">' + esc(it.note || '\u2014') + '</span>'
          + '<button class="dup-act" data-act="delete" data-key="' + esc(g.key)
          + '" data-ids="' + gids + '" data-rid="' + it.id + '"'
          + ' title="Shu yozuvni hisobdan chiqarish"'
          + ' style="background:none;border:0;cursor:pointer;color:var(--danger);'
          + 'font-size:13px;padding:0 2px">\uD83D\uDDD1</button>'
          + '</div>';
      });
      body += '<button class="rc-btn-ghost dup-act" data-act="keep" data-key="' + esc(g.key)
        + '" data-ids="' + gids + '" style="width:100%;margin-top:6px;font-size:11.5px">'
        + '\u2705 Ikkalasi ham to\u2018g\u2018ri</button>';
      body += '</div>';
    });
    body += '</div>';
    RcSheet.open('\u26A0\uFE0F Takror yozuvlar (' + d.count + ')', body);
    Array.prototype.forEach.call(document.querySelectorAll('.dup-act'), function (b) {
      b.onclick = function () {
        var act = b.dataset.act, key = b.dataset.key;
        var ids = (b.dataset.ids || '').split(',').map(Number).filter(Boolean);
        if (act === 'delete' && !confirm('Shu yozuv hisobdan chiqariladi. Davom etamizmi?')) return;
        b.disabled = true;
        var payload = { action: act, group_ids: ids };
        if (act === 'delete') payload.record_id = parseInt(b.dataset.rid);
        WS.send('finance.duplicate.resolve', payload, function (m) {
          if (!m || !m.ok) { Toast.error((m && m.error) || 'Xatolik'); b.disabled = false; return; }
          var card = document.querySelector('[data-dupg="' + key + '"]');
          if (card) card.remove();
          Toast.success(act === 'delete' ? 'Hisobdan chiqarildi' : 'Belgilandi');
          if (!document.querySelector('[data-dupg]')) RcSheet.close();
          RcFinance._reload();
        });
      };
    });
  },

  // ── Pul yechish (WS: finance.withdrawal) — foyda-share ommaviy + oluvchi chiplari ──
  _withdrawSheet: function () {
    var esc = Utils.esc, money = Utils.money;
    var d = RcFinance._data || {};
    var recipients = d.withdrawal_recipients || [];
    var shares = d.last_profit_shares || [];
    var balance = (d.stats && parseInt(d.stats.balance)) || 0;
    var top = '';
    if (shares.length) {
      top += '<div style="font-size:12px;font-weight:700">💰 Foyda taqsimotidan yechish:</div>';
      top += '<div style="display:flex;flex-direction:column;gap:4px">';
      shares.forEach(function (s, i) {
        var amt = Math.round(balance * s.percent / 100);
        top += '<label style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--sfc2);border-radius:var(--radius-sm)"><input type="checkbox" class="rc-wd-chk" data-i="' + i + '" checked><span style="flex:1;font-size:13px;font-weight:600">' + esc(s.name) + '</span><span style="font-size:11px;color:var(--mut)">' + s.percent + '%</span><span style="font-size:13px;font-weight:700;color:var(--acc-text)">' + money(Math.abs(amt)) + '</span></label>';
      });
      top += '</div>';
      top += '<button class="rc-btn" id="rc-wd-all" style="width:100%"><i class="fas fa-check-double"></i> Barchasini yechish</button>';
      top += '<div style="font-size:12px;color:var(--mut);text-align:center;border-top:1px solid var(--brd);padding-top:10px">yoki alohida yechish:</div>';
    }
    var chips = recipients.length ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">' + recipients.map(function (n) { return '<span class="rc-wd-chip" style="font-size:11px;padding:5px 11px;border-radius:var(--pill);background:var(--sfc2);cursor:pointer;border:1px solid var(--brd)">' + esc(n) + '</span>'; }).join('') + '</div>' : '';
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' + top +
      '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">Kim yechadi *</div>' + chips + '<input id="rc-wd-recip" class="rc-input" placeholder="Ism kiriting"></div>' +
      '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">Summa *</div><input id="rc-wd-amt" class="rc-input ce-money-input" inputmode="numeric" placeholder="0"></div>' +
      '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">Izoh</div><input id="rc-wd-desc" class="rc-input" placeholder="Ixtiyoriy"></div>' +
      '<button class="rc-btn" id="rc-wd-save" style="width:100%">Yechish</button></div>';
    RcSheet.open('Pul yechish', body, {});
    var allBtn = document.getElementById('rc-wd-all');
    if (allBtn) allBtn.onclick = function () {
      var lines = [];
      document.querySelectorAll('.rc-wd-chk').forEach(function (chk) { if (chk.checked) { var s = shares[parseInt(chk.dataset.i)]; lines.push({ name: s.name, amount: Math.round(balance * s.percent / 100) }); } });
      if (!lines.length) return Toast.error('Kamida 1 ta tanlang');
      var total = lines.reduce(function (a, l) { return a + l.amount; }, 0);
      RcSheet.confirm('Tasdiqlash', lines.length + ' ta xodimga jami ' + money(total) + ' yechiladi. Davom etasizmi?', function () {
        var done = 0;
        lines.forEach(function (ln) {
          WS.send('finance.withdrawal', { amount: ln.amount, recipient_name: ln.name, description: 'Foyda taqsimoti', payment_method: 'cash' }, function () {
            done++;
            if (done === lines.length) { Toast.success(lines.length + ' ta yozuv yaratildi'); RcFinance._reload(); }
          });
        });
      });
    };
    document.querySelectorAll('.rc-wd-chip').forEach(function (chip) {
      chip.onclick = function () {
        document.getElementById('rc-wd-recip').value = chip.textContent;
        document.querySelectorAll('.rc-wd-chip').forEach(function (c) { c.style.background = 'var(--sfc2)'; c.style.color = ''; });
        chip.style.background = 'var(--acc)'; chip.style.color = 'var(--acc-ink)';
      };
    });
    document.getElementById('rc-wd-save').onclick = function () {
      var recip = (document.getElementById('rc-wd-recip').value || '').trim();
      if (!recip) return Toast.error('Kim yechishini kiriting');
      var amt = Utils.rawMoney(document.getElementById('rc-wd-amt').value);
      if (amt <= 0) return Toast.error('Summa kiriting');
      WS.send('finance.withdrawal', { amount: amt, recipient_name: recip, description: (document.getElementById('rc-wd-desc').value || '').trim(), payment_method: 'cash' }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success('Pul yechildi'); RcFinance._reload();
      });
    };
  },

  // ── Yangi qarz (WS: debt.create) ──
  // ── Muddatli qarz yozish (2026-08-05 qayta yozildi) ──
  //  Qo'shildi: mijozni ISM yoki TELEFON bo'yicha qidirish + to'lov muddati
  //  (kalendar). Ilgari oddiy <select> edi — mijoz ko'p bo'lsa topib
  //  bo'lmasdi, muddat esa umuman yo'q edi.
  _debtSheet: function () {
    if (!(window.RcSheet && RcSheet.open)) { Toast.info('Tez orada'); return; }
    var esc = Utils.esc;
    RcFinance._debtPick = null;                   // tanlangan mijoz

    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">'
      // ── Mijoz qidiruv ──
      + '<div id="fin-debt-cl">'
      +   '<div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">Mijoz *</div>'
      +   '<div class="rc-search" style="margin-bottom:6px">'
      +     '<i class="fas fa-search" style="color:var(--mut);font-size:13px"></i>'
      +     '<input id="fin-debt-q" type="text" placeholder="Ism yoki telefon raqami...">'
      +   '</div>'
      +   '<div id="fin-debt-picked" style="display:none"></div>'
      +   '<div id="fin-debt-res" style="max-height:190px;overflow-y:auto;display:flex;flex-direction:column;gap:6px"></div>'
      + '</div>'
      + '<button type="button" id="fin-debt-newcl" class="rc-btn-ghost rc-btn-sm" style="align-self:flex-start">'
      +   '<i class="fas fa-user-plus"></i> Yangi mijoz</button>'
      + '<div id="fin-debt-ncl" style="display:none;flex-direction:column;gap:8px">'
      +   '<input id="fin-ncl-name" class="rc-input" placeholder="Mijoz ismi *">'
      +   '<input id="fin-ncl-phone" class="rc-input ce-phone-input" type="tel" inputmode="tel" placeholder="93 042 15 02">'
      + '</div>'
      + RcFinance._money('Summa *', 'amount')
      // ── Muddat (kalendar) ──
      + '<div>'
      +   '<div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">📅 To\'lov muddati</div>'
      +   '<input name="due_date" id="fin-debt-due" class="rc-input" type="date">'
      +   '<div style="display:flex;gap:6px;margin-top:7px;flex-wrap:wrap">'
      +     '<button type="button" class="rc-chip fin-due-q" data-d="7" style="flex:none;cursor:pointer">1 hafta</button>'
      +     '<button type="button" class="rc-chip fin-due-q" data-d="14" style="flex:none;cursor:pointer">2 hafta</button>'
      +     '<button type="button" class="rc-chip fin-due-q" data-d="30" style="flex:none;cursor:pointer">1 oy</button>'
      +     '<button type="button" class="rc-chip fin-due-q" data-d="0" style="flex:none;cursor:pointer">Tozalash</button>'
      +   '</div>'
      + '</div>'
      + RcFinance._txt('Izoh', 'description', 'Izoh (ixtiyoriy)')
      + '</div>';

    RcSheet.open('Muddatli qarz yozish', body,
      { footer: '<button class="rc-btn rc-btn-sm" id="fin-debt-save">Saqlash</button>' });
    Utils.bindMoneyInputs(); Utils.bindPhoneInputs();

    // ── Mijoz qidiruv: ISM yoki TELEFON ──
    var resEl = document.getElementById('fin-debt-res');
    var pickEl = document.getElementById('fin-debt-picked');
    var qEl = document.getElementById('fin-debt-q');

    function renderRes(q) {
      var all = (window.STATE && STATE.clients) || [];
      q = (q || '').toLowerCase().trim();
      var digits = q.replace(/\D/g, '');
      var hit = all.filter(function (c) {
        var nm = (c.name || '').toLowerCase();
        var ph = (c.phone || '').replace(/\D/g, '');
        if (!q) return true;
        if (nm.indexOf(q) !== -1) return true;
        return !!(digits && ph.indexOf(digits) !== -1);
      }).slice(0, 30);

      if (!all.length) {
        resEl.innerHTML = '<div style="font-size:11.5px;color:var(--mut);padding:6px 2px">'
          + 'Mijoz yo\'q — pastdan yangi qo\'shing 👇</div>';
        return;
      }
      if (!hit.length) {
        resEl.innerHTML = '<div style="font-size:11.5px;color:var(--mut);padding:6px 2px">Topilmadi</div>';
        return;
      }
      resEl.innerHTML = hit.map(function (c) {
        return '<div class="fin-debt-opt" data-id="' + c.id + '" data-name="' + esc(c.name || '') + '" '
          + 'style="display:flex;align-items:center;gap:9px;padding:8px 10px;background:var(--sfc2);'
          + 'border-radius:10px;cursor:pointer">'
          + '<span style="width:26px;height:26px;border-radius:50%;background:var(--pch);color:var(--acc-ink);'
          + 'display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex:none">'
          + esc((c.name || '?').trim().charAt(0).toUpperCase()) + '</span>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          + esc(c.name || '') + '</div>'
          + (c.phone ? '<div style="font-size:10.5px;color:var(--mut)">' + esc(c.phone) + '</div>' : '')
          + '</div></div>';
      }).join('');
      resEl.querySelectorAll('.fin-debt-opt').forEach(function (el) {
        el.onclick = function () {
          RcFinance._debtPick = { id: el.dataset.id, name: el.dataset.name };
          pickEl.style.display = '';
          pickEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:9px 11px;'
            + 'background:var(--sfc2);border:1px solid var(--pch);border-radius:10px;margin-bottom:6px">'
            + '<i class="fas fa-check-circle" style="color:var(--pch-text)"></i>'
            + '<span style="flex:1;font-size:13px;font-weight:700">' + esc(el.dataset.name) + '</span>'
            + '<button type="button" id="fin-debt-clr" style="background:none;border:none;color:var(--mut);'
            + 'cursor:pointer;font-size:16px;line-height:1">&times;</button></div>';
          resEl.style.display = 'none';
          if (qEl) qEl.style.display = 'none';
          var clr = document.getElementById('fin-debt-clr');
          if (clr) clr.onclick = function () {
            RcFinance._debtPick = null;
            pickEl.style.display = 'none';
            resEl.style.display = '';
            if (qEl) { qEl.style.display = ''; qEl.value = ''; qEl.focus(); }
            renderRes('');
          };
        };
      });
    }
    if (qEl) qEl.oninput = function () { renderRes(qEl.value); };
    renderRes('');

    // ── Muddat tez tugmalari ──
    var dueEl = document.getElementById('fin-debt-due');
    document.querySelectorAll('.fin-due-q').forEach(function (el) {
      el.onclick = function () {
        var dd = parseInt(el.dataset.d, 10) || 0;
        if (!dueEl) return;
        if (!dd) { dueEl.value = ''; return; }
        var t = new Date(); t.setDate(t.getDate() + dd);
        dueEl.value = t.getFullYear() + '-'
          + String(t.getMonth() + 1).padStart(2, '0') + '-'
          + String(t.getDate()).padStart(2, '0');
      };
    });

    // ── Yangi mijoz rejimi ──
    var newMode = false;
    var newBtn = document.getElementById('fin-debt-newcl');
    var nclFields = document.getElementById('fin-debt-ncl');
    var clWrap = document.getElementById('fin-debt-cl');
    function setNew(on) {
      newMode = on;
      if (nclFields) nclFields.style.display = on ? 'flex' : 'none';
      if (clWrap) clWrap.style.display = on ? 'none' : '';
      if (newBtn) newBtn.innerHTML = on
        ? '<i class="fas fa-list"></i> Mavjud mijoz'
        : '<i class="fas fa-user-plus"></i> Yangi mijoz';
      if (on) Utils.bindPhoneInputs();
    }
    if (newBtn) newBtn.onclick = function () { setNew(!newMode); };
    if (!((window.STATE && STATE.clients) || []).length) setNew(true);

    // ── Saqlash ──
    var btn = document.getElementById('fin-debt-save');
    if (btn) btn.onclick = function () {
      var f = RcSheet.getFormData();
      var amt = Utils.rawMoney(f.amount);
      if (amt <= 0) return Toast.error('Summa kiriting');
      var due = (dueEl && dueEl.value) || '';
      btn.disabled = true;
      var makeDebt = function (customerId) {
        WS.send('debt.create', {
          customer_id: parseInt(customerId), amount: amt,
          description: f.description || '', due_date: due,
        }, function (msg) {
          if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); btn.disabled = false; return; }
          RcSheet.close(); Toast.success('Qarz saqlandi'); RcFinance._reload();
        });
      };
      if (newMode) {
        var nm = (((document.getElementById('fin-ncl-name') || {}).value) || '').trim();
        if (!nm) { Toast.error('Mijoz ismini kiriting'); btn.disabled = false; return; }
        var ph = Utils.rawPhone(((document.getElementById('fin-ncl-phone') || {}).value) || '');
        WS.send('client.create', { name: nm, phone: ph }, function (msg) {
          if (!msg || !msg.ok || !msg.data) { Toast.error((msg && msg.error) || 'Mijoz qo‘shilmadi'); btn.disabled = false; return; }
          var c = msg.data;
          if (window.STATE) {
            STATE.clients = STATE.clients || [];
            STATE.clients.push({ id: c.id, name: c.name || c.full_name, phone: c.phone });
          }
          makeDebt(c.id);
        });
      } else {
        if (!RcFinance._debtPick) { Toast.error('Mijoz tanlang'); btn.disabled = false; return; }
        makeDebt(RcFinance._debtPick.id);
      }
    };
  },

  // ── Qarz to'lash (WS: debt.pay) ──
  _payDebtSheet: function (debtId) {
    if (!(window.RcSheet && RcSheet.open)) { Toast.info('Tez orada'); return; }
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      RcFinance._money('Summa *', 'amount') +
      '</div>';
    RcSheet.open("Qarz to‘lash", body, { footer: '<button class="rc-btn rc-btn-sm" id="fin-pay-save">To‘lash</button>' });
    Utils.bindMoneyInputs();
    var btn = document.getElementById('fin-pay-save');
    if (btn) btn.onclick = function () {
      var f = RcSheet.getFormData();
      var amt = Utils.rawMoney(f.amount);
      if (amt <= 0) return Toast.error('Summa kiriting');
      btn.disabled = true;
      WS.send('debt.pay', { id: debtId, amount: amt }, function (msg) {
        if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); btn.disabled = false; return; }
        RcSheet.close(); Toast.success("To‘lov saqlandi"); RcFinance._reload();
      });
    };
  },

  // ── USTALAR QARZI: qo'shish / to'lash / o'chirish (TZ §F4) ────────────
  _today: function () {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  },

  _creditorSheet: function (orderId) {
    RcFinance._crOrderId = orderId || null;
    if (!(window.RcSheet && RcSheet.open)) { Toast.info('Tez orada'); return; }
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">'
      + RcFinance._txt('Kimdan? *', 'creditor_name', "Do'kon nomi yoki ism")
      + RcFinance._sel('Turi', 'creditor_type', [
        ['dokon', "🏪 Do'kon"], ['ustanovchik', '🔧 Ustanovchik'],
        ['shaxs', '👤 Shaxs'], ['boshqa', '📌 Boshqa']])
      + RcFinance._money('Summa *', 'amount')
      + RcFinance._txt('Nima uchun? *', 'note', 'Masalan: LDSP va furnitura olindi')
      + '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">Qachon olingan</div>'
      + '<input name="taken_date" class="rc-input" type="date" value="' + RcFinance._today() + '"></div>'
      + '</div>';
    RcSheet.open('Qarz qo\'shish', body,
      { footer: '<button class="rc-btn rc-btn-sm" id="fin-cr-save">Saqlash</button>' });
    Utils.bindMoneyInputs();
    var btn = document.getElementById('fin-cr-save');
    if (btn) btn.onclick = function () {
      var f = RcSheet.getFormData();
      var amt = Utils.rawMoney(f.amount);
      if (!(f.creditor_name || '').trim()) return Toast.error('Kimdan olganingizni yozing');
      if (amt <= 0) return Toast.error('Summa kiriting');
      if (!(f.note || '').trim()) return Toast.error('Nima uchun qarz olganingizni yozing');
      btn.disabled = true;
      WS.send('supplierdebt.create', {
        creditor_name: f.creditor_name, creditor_type: f.creditor_type,
        amount: amt, note: f.note || '', taken_date: f.taken_date || null,
        order_id: RcFinance._crOrderId || null
      }, function (msg) {
        if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); btn.disabled = false; return; }
        RcSheet.close(); Toast.success('Qarz qo\'shildi'); RcFinance._reload();
      });
    };
  },

  _creditorPaySheet: function (id, name, rem) {
    if (!(window.RcSheet && RcSheet.open)) { Toast.info('Tez orada'); return; }
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">'
      + '<div style="font-size:12.5px;color:var(--mut)">' + Utils.esc(name || '')
      + ' — qoldiq <b style="color:var(--danger)">' + Utils.money(rem) + '</b></div>'
      + RcFinance._money('Summa *', 'amount') + '</div>';
    RcSheet.open("Qarzni to‘lash", body,
      { footer: '<button class="rc-btn rc-btn-sm" id="fin-crpay-save">To‘lash</button>' });
    Utils.bindMoneyInputs();
    var btn = document.getElementById('fin-crpay-save');
    if (btn) btn.onclick = function () {
      var amt = Utils.rawMoney(RcSheet.getFormData().amount);
      if (amt <= 0) return Toast.error('Summa kiriting');
      btn.disabled = true;
      WS.send('supplierdebt.pay', { id: id, amount: amt }, function (msg) {
        if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); btn.disabled = false; return; }
        RcSheet.close(); Toast.success("To‘landi"); RcFinance._reload();
      });
    };
  },

  _creditorDelete: function (id, name) {
    if (!confirm((name || 'Qarz') + " — o‘chirilsinmi?")) return;
    WS.send('supplierdebt.delete', { id: id }, function (msg) {
      if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); return; }
      Toast.success("O‘chirildi"); RcFinance._reload();
    });
  },
};

// ═══════════ 👷 USTALAR FOYDASI (team.profit.detail + profit.save) ═══════════
RcFinance._ustaPalette = ['#DCF262', '#A6E6F2', '#C9B4F7', '#F5A48B', '#8ED6A0', '#F2C94C'];
RcFinance._ustaColor = function (idx) { return RcFinance._ustaPalette[idx % RcFinance._ustaPalette.length]; };
RcFinance._ustaInitial = function (name) { return (name || '?').trim().charAt(0).toUpperCase(); };
RcFinance._ustaStatusLabels = { new: 'Yangi', in_progress: 'Jarayonda', at_mebelcity: 'MebelCity da', ready: 'Tayyor', delivered: 'Topshirildi' };

RcFinance._toggleUstalar = function () {
  var panel = document.getElementById('fin-breakdown');
  if (!panel) return;
  if (panel.style.display !== 'none' && panel.dataset.metric === 'ustalar') {
    panel.style.display = 'none'; panel.dataset.metric = ''; return;
  }
  RcFinance._highlightStat(null);
  panel.dataset.metric = 'ustalar';
  panel.style.display = '';
  panel.innerHTML = '<div class="rc-card" style="padding:18px;text-align:center;color:var(--mut);font-size:12px">👷 Yuklanmoqda...</div>';
  RcFinance._loadUstalar();
};
RcFinance._loadUstalar = function (cb) {
  WS.send('team.profit.detail', RcPeriod.query(RcFinance._st), function (msg) {
    var panel = document.getElementById('fin-breakdown');
    if (!panel) return;
    if (!msg.ok) { panel.innerHTML = '<div class="rc-card" style="padding:16px;text-align:center;color:var(--danger);font-size:12px">Xatolik</div>'; return; }
    RcFinance._ustaData = msg.data;
    if (typeof cb === 'function') cb(); else RcFinance._renderUstalarList();
  });
};
// ── Ochilib-yopiladigan bo'lim (accordion) — 2026-07-25 ──
// Sarlavhaga bosilsa ochiladi/yopiladi. Holat localStorage'da saqlanadi, chunki
// WS yangilanishida sahifa qayta render bo'ladi — aks holda har yangilanishda
// foydalanuvchi yopgan bo'lim qaytadan ochilib ketardi.
RcFinance._accOpen = function (key, def) {
  try {
    var v = localStorage.getItem('rcFinAcc_' + key);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch (e) { /* localStorage yo'q — default */ }
  return !!def;
};
RcFinance._accToggle = function (key, def) {
  var now = !RcFinance._accOpen(key, def);
  try { localStorage.setItem('rcFinAcc_' + key, now ? '1' : '0'); } catch (e) {}
  var body = document.getElementById('acc-body-' + key);
  var arr  = document.getElementById('acc-arr-' + key);
  if (body) body.style.display = now ? '' : 'none';
  if (arr)  arr.textContent = now ? '▾' : '▸';
};
// Sarlavha qatori: [▸/▾] Nom .......... [o'ng tomondagi chip]
RcFinance._accHead = function (key, def, titleHtml, rightHtml) {
  var open = RcFinance._accOpen(key, def);
  return '<div onclick="RcFinance._accToggle(\'' + key + '\',' + (def ? 'true' : 'false') + ')" '
       + 'style="display:flex;align-items:center;justify-content:space-between;gap:8px;'
       + 'cursor:pointer;-webkit-user-select:none;user-select:none">'
       + '<div style="display:flex;align-items:center;gap:8px;min-width:0">'
       + '<span id="acc-arr-' + key + '" style="font-size:13px;color:var(--mut);flex:none;width:12px">'
       + (open ? '▾' : '▸') + '</span>' + titleHtml + '</div>'
       + (rightHtml || '') + '</div>';
};

// Ustaning hisob holati — "qoldiq −26 904 045" o'rniga kundalik so'z bilan.
// Manfiy = ishlaganidan ko'p olgan, musbat = unga berilishi kerak.
//
// 2026-07-31: `remaining` endi backend'da UMUMIY (butun tarix) qoldiq —
// jami ishlab topdi − jami oldi. Ilgari davr ichida solishtirilardi
// (iyul foydasi ↔ iyulda olingan pul) va soxta qizil chiqardi: usta iyulda
// iyunda topshirilgan zakaz uchun ham pul oladi, avans ham oladi.
// Shu sababli qator "(umumiy hisob)" deb belgilanadi — davr kartalari bilan
// adashtirmaslik uchun.
RcFinance._hisobQatori = function (m, fs) {
  var money = Utils.money;
  var r = Number(m.remaining) || 0;
  var ltW = (m.lt_withdrawn == null) ? Number(m.withdrawn) || 0 : Number(m.lt_withdrawn) || 0;
  if (!ltW && !r) return '';                   // hali pul olmagan — yozadigan narsa yo'q
  var size = fs || 11;
  var ikon, matn, rang;
  if (r < -1000)      { ikon = '🔴'; matn = money(Math.abs(r)) + ' ortiqcha olgan'; rang = 'var(--danger)'; }
  else if (r > 1000)  { ikon = '🟢'; matn = money(r) + ' berilishi kerak';          rang = 'var(--acc-text)'; }
  else                { ikon = '⚪'; matn = 'Hisob teng';                            rang = 'var(--mut)'; }
  return '<div style="font-size:' + size + 'px;font-weight:700;color:' + rang + ';margin-top:3px">'
       + ikon + ' ' + matn
       + '<span style="font-weight:600;color:var(--mut);font-size:' + (size - 1) + 'px"> · umumiy hisob</span></div>';
};

RcFinance._renderUstalarList = function () {
  var panel = document.getElementById('fin-breakdown'); if (!panel) return;
  var esc = Utils.esc, money = Utils.money;
  var d = RcFinance._ustaData || { people: [] };
  var people = d.people || [];
  var maxCalc = 1; people.forEach(function (m) { if (Math.abs(m.calculated) > maxCalc) maxCalc = Math.abs(m.calculated); });
  var h = '<div class="rc-card" style="padding:14px;overflow:hidden">';
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">';
  h += '<div><div style="font-size:15px;font-weight:800">👷 Ustalar foydasi — ' + esc(RcPeriod.label(RcFinance._st)) + '</div>';
  h += '<div style="font-size:11px;color:var(--mut);margin-top:2px">Jami taqsimlangan: <b style="color:var(--acc-text)">' + money(d.total_profit || 0) + '</b>' + (d.total_withdrawn ? ' · olindi <b style="color:var(--lav)">' + money(d.total_withdrawn) + '</b>' : '') + '</div></div>';
  h += '<div id="fin-bd-close2" style="cursor:pointer;color:var(--mut);font-size:18px;line-height:1">✕</div></div>';
  // Izoh — "Pul o'zgarishi" bilan bu raqam NEGA teng emasligini tushuntiradi.
  // Pul o'zgarishi = butun pul oqimi (tugamagan zakaz avansi + o'chirilgan zakaz ham),
  // bu esa faqat TOPSHIRILGAN (delivered/ready) zakazlar foydasi. Foydalanuvchi
  // ikkalasini solishtirib chalkashmasin (2026-07-25).
  h += '<div style="font-size:10px;color:var(--mut);line-height:1.45;margin:6px 0 10px;padding:7px 9px;'
     + 'border-radius:10px;background:var(--sfc2);border:1px dashed var(--brd)">'
     + 'ℹ️ Bu — faqat <b>topshirilgan</b> zakazlar foydasi. «Pul o\'zgarishi»dan kam bo'
     + 'lishi normal: tugamagan ishlarning oldindan olingan puli hali foyda emas.'
     + '<br>Zakaz <b>topshirilgan</b> oyga yoziladi (ochilgan oyga emas).</div>';
  if (!people.length) {
    h += '<div style="text-align:center;padding:20px;color:var(--mut);font-size:12px">Hali foyda taqsimlanmagan</div>';
  } else {
    // Bog'lanmagan (eski) yozuvlar bormi — tushuntirish chiqaramiz
    var _nUnlinked = people.filter(function (x) { return x.is_linked === false; }).length;
    if (_nUnlinked) {
      h += '<div style="display:flex;gap:9px;padding:10px 12px;margin-bottom:10px;background:var(--sfc);'
        + 'border:1px solid var(--brd);border-radius:12px;font-size:11.5px;color:var(--mut);line-height:1.6">'
        + '<span style="font-size:14px">⚠️</span><span><b style="color:var(--txt)">' + _nUnlinked + ' ta ulush</b> '
        + 'eski usulda — qo‘lda yozilgan ism, Bittada akkauntiga bog‘lanmagan. '
        + 'Ularga pul avtomatik o‘tkazilmaydi. Bog‘lash uchun buyurtmani ochib '
        + '«Foyda taqsimlash»dan kontaktni qayta tanlang.</span></div>';
    }
    people.forEach(function (m, idx) {
      var color = RcFinance._ustaColor(idx);
      var barW = Math.max(4, Math.round(Math.abs(m.calculated) / maxCalc * 100));
      h += '<div class="usta-row" data-idx="' + idx + '" style="display:flex;align-items:center;gap:11px;padding:10px 12px;margin-bottom:8px;border-radius:14px;background:var(--sfc2);cursor:pointer">';
      h += '<div style="width:40px;height:40px;border-radius:50%;background:' + color + ';color:var(--acc-ink);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0">' + RcFinance._ustaInitial(m.name) + '</div>';
      // H1 to'liq (2026-08-04): kontaktga bog'langan ulush «Ism · ...1234»
      // ko'rinishida; ESKI, erkin-matn yozuvlar ⚠️ bilan ajratiladi — ular
      // real akkauntga tegishli emas, pul avtomatik o'tkazilmaydi.
      var _lbl = m.label || m.name;
      var _unlinked = (m.is_linked === false);
      h += '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
        + '<span style="font-size:14px;font-weight:700">' + esc(_lbl) + '</span>';
      if (m.percent) h += '<span style="font-size:10px;color:var(--acc-ink);background:' + color + ';padding:1px 8px;border-radius:20px;font-weight:700">' + m.percent + '%</span>';
      if (_unlinked) h += '<span class="usta-unlinked" title="Eski yozuv — Bittada akkauntiga bog\'lanmagan" '
        + 'style="font-size:9.5px;color:var(--mut);background:var(--sfc);padding:1px 7px;border-radius:20px;'
        + 'border:1px solid var(--brd)">⚠️ bog‘lanmagan</span>';
      h += '</div>';
      h += '<div style="height:6px;border-radius:20px;background:var(--brd);margin-top:7px;overflow:hidden"><div style="height:100%;width:' + barW + '%;background:' + color + ';border-radius:20px"></div></div>';
      // 2026-07-25: "qoldiq −26 904 045" tushunarsiz edi (nimadan nima ayirilgani
      // ko'rinmasdi). Endi kundalik so'z bilan: nima oldi + qancha ortiqcha.
      // Backend TEGILMAGAN — o'sha `calculated/withdrawn/remaining` ishlatiladi.
      h += '<div style="font-size:10px;color:var(--mut);margin-top:5px">📦 ' + m.orders_count + ' zakaz'
         + (m.withdrawn ? ' · kassadan oldi <b>' + money(m.withdrawn) + '</b>' : '') + '</div>';
      h += RcFinance._hisobQatori(m, 11);
      h += '</div>';
      h += '<div style="text-align:right;flex-shrink:0"><div style="font-size:15px;font-weight:800;color:' + color + '">' + money(m.calculated) + '</div><div style="font-size:15px;color:var(--mut);line-height:1;margin-top:2px">›</div></div></div>';
    });
  }
  /* Arxivlangan (ishdan bo'shagan) ustaning ESKI ulushi — ismsiz, faqat jami.
     Bo'lmasa panel raqamlari jamlanmaydi (ko'rinadigan + taqsimlanmagan ≠ foyda). */
  if ((d.archived_hidden || 0) > 0 || (d.archived_withdrawn || 0) > 0) {
    h += '<div style="display:flex;align-items:center;gap:11px;padding:9px 12px;margin-top:4px;'
       + 'border-radius:14px;background:var(--sfc2);opacity:.72">'
       + '<div style="width:40px;height:40px;border-radius:50%;background:var(--brd);color:var(--mut);'
       + 'display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🗄</div>'
       + '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:var(--mut)">Arxivlangan ustalar</div>'
       + '<div style="font-size:10px;color:var(--mut);margin-top:3px">ishdan bo\'shagan — ro\'yxatda ko\'rsatilmaydi'
       + ((d.archived_withdrawn || 0) > 0 ? ' · kassadan oldi <b>' + money(d.archived_withdrawn) + '</b>' : '')
       + '</div></div>'
       + '<div style="text-align:right;flex-shrink:0;font-size:14px;font-weight:800;color:var(--mut)">'
       + money(d.archived_hidden || 0) + '</div></div>';
  }
  /* ── Ustalar ro'yxatini boshqarish (dinamik) — TZ-Ustalar-Dinamik.md §2.3 ── */
  h += '<div id="usta-roster" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--brd)"></div>';
  if ((d.undistributed_count || 0) > 0) {
    h += '<div id="usta-undist" style="display:flex;align-items:center;gap:11px;padding:11px 12px;margin-top:4px;border-radius:14px;background:var(--sfc2);border:1px dashed var(--pch);cursor:pointer">';
    h += '<div style="width:40px;height:40px;border-radius:50%;background:var(--pch);color:var(--acc-ink);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;flex-shrink:0">⚠</div>';
    h += '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700">Taqsimlanmagan</div>';
    h += '<div style="font-size:10px;color:var(--mut);margin-top:3px">' + d.undistributed_count + ' ta zakaz foydasi bo\'linmagan · bosing → bo\'lib yuboring</div></div>';
    h += '<div style="text-align:right;flex-shrink:0"><div style="font-size:15px;font-weight:800;color:var(--pch)">' + money(d.total_undistributed || 0) + '</div><div style="font-size:15px;color:var(--pch);line-height:1;margin-top:2px">›</div></div></div>';
  }
  h += '</div>';
  panel.innerHTML = h;
  var cl = document.getElementById('fin-bd-close2');
  if (cl) cl.onclick = function () { panel.style.display = 'none'; panel.dataset.metric = ''; };
  var undBtn = document.getElementById('usta-undist');
  if (undBtn) undBtn.onclick = function () { RcFinance._openUndistributed(); };
  panel.querySelectorAll('.usta-row').forEach(function (row) { row.onclick = function () { RcFinance._openUsta(parseInt(row.dataset.idx)); }; });
  RcFinance._loadRoster();
};

/* ═══════════════════════════════════════════════════════════════════════
   USTALAR RO'YXATI — to'liq dinamik (qo'shish / tahrirlash / o'chirish)
   Backend: profit.people.* (consumers.py). MOLIYAGA TEGMAYDI.
   ═══════════════════════════════════════════════════════════════════════ */
RcFinance._roster = [];
RcFinance._loadRoster = function () {
  WS.send('profit.people.list', { all: true }, function (msg) {
    if (!msg || !msg.ok) return;
    RcFinance._roster = msg.people || [];
    RcFinance._renderRoster();
  });
};
RcFinance._renderRoster = function () {
  var box = document.getElementById('usta-roster'); if (!box) return;
  var esc = Utils.esc;
  var faol = RcFinance._roster.filter(function (p) { return p.is_active; });
  var arxiv = RcFinance._roster.filter(function (p) { return !p.is_active; });
  var h = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">'
        + '<div style="font-size:12px;font-weight:800;color:var(--mut)">USTALAR RO\'YXATI</div>'
        + '<button id="usta-add" class="rc-btn-ghost rc-btn-sm">+ Usta qo\'shish</button></div>';
  if (!faol.length) {
    h += '<div style="font-size:11px;color:var(--mut);padding:6px 0">Ro\'yxat bo\'sh — usta qo\'shing</div>';
  }
  faol.forEach(function (p) {
    h += '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;margin-bottom:5px;'
       + 'border-radius:10px;background:var(--sfc2)">'
       + '<span style="flex:1;font-size:13px;font-weight:600">' + esc(p.name) + '</span>'
       + '<button class="usta-edit rc-btn-ghost rc-btn-sm" data-id="' + p.id + '" data-name="' + esc(p.name) + '" title="Nomini o\'zgartirish">✏️</button>'
       + '<button class="usta-arch rc-btn-ghost rc-btn-sm" data-id="' + p.id + '" data-name="' + esc(p.name) + '" title="Ro\'yxatdan olib tashlash" style="color:var(--danger)">🗑</button>'
       + '</div>';
  });
  if (arxiv.length) {
    h += '<div style="font-size:10px;color:var(--mut);margin:8px 0 5px">ARXIV (ko\'rsatilmaydi)</div>';
    arxiv.forEach(function (p) {
      h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;margin-bottom:4px;'
         + 'border-radius:10px;background:var(--sfc2);opacity:.55">'
         + '<span style="flex:1;font-size:12px">' + esc(p.name) + '</span>'
         + '<button class="usta-rest rc-btn-ghost rc-btn-sm" data-id="' + p.id + '" title="Ro\'yxatga qaytarish">↩︎</button></div>';
    });
  }
  h += '<div style="font-size:10px;color:var(--mut);line-height:1.45;margin-top:6px">'
     + 'Arxivlangan usta bu hisobotda ko\'rinmaydi. Uning pul harakati '
     + '<b>Tranzaksiyalar</b> bo\'limida to\'liq turadi — kassa raqamlari o\'zgarmaydi.</div>';
  box.innerHTML = h;

  var add = document.getElementById('usta-add');
  if (add) add.onclick = function () {
    var nm = prompt('Yangi usta ismi:');
    if (!nm || !nm.trim()) return;
    WS.send('profit.people.add', { name: nm.trim() }, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      Toast.success('Qo\'shildi'); RcFinance._loadRoster();
    });
  };
  box.querySelectorAll('.usta-edit').forEach(function (b) {
    b.onclick = function () {
      var nm = prompt('Yangi ism:', b.dataset.name);
      if (!nm || !nm.trim()) return;
      WS.send('profit.people.update', { id: parseInt(b.dataset.id), name: nm.trim() }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        Toast.success('O\'zgartirildi'); RcFinance._loadRoster();
      });
    };
  });
  box.querySelectorAll('.usta-arch').forEach(function (b) {
    b.onclick = function () {
      if (!confirm('«' + b.dataset.name + '» ro\'yxatdan olib tashlansinmi?\n\n'
                 + 'Eski zakazlardagi ulushi va pul yozuvlari O\'CHMAYDI — '
                 + 'faqat bu hisobotda ko\'rinmaydi.')) return;
      WS.send('profit.people.delete', { id: parseInt(b.dataset.id) }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        Toast.success(msg.mode === 'archived' ? 'Arxivga o\'tkazildi' : 'O\'chirildi');
        RcFinance._loadRoster();
        RcFinance._loadUstalar();
      });
    };
  });
  box.querySelectorAll('.usta-rest').forEach(function (b) {
    b.onclick = function () {
      WS.send('profit.people.archive', { id: parseInt(b.dataset.id), restore: true }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        Toast.success('Ro\'yxatga qaytarildi');
        RcFinance._loadRoster(); RcFinance._loadUstalar();
      });
    };
  });
};
RcFinance._openUsta = function (idx) {
  var panel = document.getElementById('fin-breakdown');
  if (!panel || !RcFinance._ustaData) return;
  var esc = Utils.esc, money = Utils.money;
  var m = RcFinance._ustaData.people[idx]; if (!m) return;
  var color = RcFinance._ustaColor(idx);
  var maxAmt = 1; (m.orders || []).forEach(function (o) { if (Math.abs(o.amount) > maxAmt) maxAmt = Math.abs(o.amount); });
  var h = '<div class="rc-card" style="padding:14px;overflow:hidden">';
  h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">';
  h += '<button class="usta-back" style="font-size:16px;line-height:1;padding:6px 11px;border-radius:10px;border:none;background:var(--sfc2);color:var(--mut);cursor:pointer">←</button>';
  h += '<div style="width:40px;height:40px;border-radius:50%;background:' + color + ';color:var(--acc-ink);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0">' + RcFinance._ustaInitial(m.name) + '</div>';
  h += '<div style="flex:1;min-width:0"><div style="font-size:16px;font-weight:800">' + esc(m.name) + '</div><div style="font-size:11px;color:var(--mut)">📦 ' + m.orders_count + ' zakaz' + (m.percent ? ' · ' + m.percent + '%' : '') + '</div></div></div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:14px">';
  // 2026-07-25: so'zlar kundalik tilga o'tkazildi ("Jami foyda/Olindi" →
  // "Ishlab topdi/Kassadan oldi"). Raqamlar O'ZGARMAGAN — backend'dan
  // o'sha `calculated/withdrawn` keladi.
  // «Berilishi kerak (umumiy)» karta 2026-09-02 olib tashlandi (foydalanuvchi so'rovi).
  h += '<div style="padding:10px;background:var(--sfc2);border-radius:12px;text-align:center"><div style="font-size:10px;color:var(--mut)">Ishlab topdi</div><div style="font-weight:800;color:' + color + ';font-size:13px;margin-top:2px">' + money(m.calculated) + '</div></div>';
  h += '<div style="padding:10px;background:var(--sfc2);border-radius:12px;text-align:center"><div style="font-size:10px;color:var(--mut)">Kassadan oldi</div><div style="font-weight:800;color:var(--lav);font-size:13px;margin-top:2px">' + money(m.withdrawn) + '</div></div></div>';
  // Holat bir qatorda — kartalarni o'qimasdan ham darhol tushunarli bo'lsin
  h += RcFinance._hisobQatori(m, 13);
  h += '<div style="font-size:11px;color:var(--mut);line-height:1.45;margin:8px 0 12px;padding:8px 10px;'
     + 'border-radius:10px;background:var(--sfc2);border:1px dashed var(--brd)">'
     + '💡 <b>Ishlab topdi</b> — shu davrdagi zakazlardan tushgan ulushi.<br>'
     + '<b>Kassadan oldi</b> — shu davrda hamyondan olgan puli.</div>';
  h += '<div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--mut)">Qaysi zakazlardan tushgan</div>';
  (m.orders || []).forEach(function (o) {
    var barW = Math.max(4, Math.round(Math.abs(o.amount) / maxAmt * 100));
    h += '<div style="padding:10px 12px;margin-bottom:7px;background:var(--sfc2);border-radius:12px;border-left:3px solid ' + color + '">';
    /* Ulashilgan zakaz — «🤝 ulashilgan» belgisi (boshqa akkaunt zakazi).
       `order_profit === null` → finance_hidden: zakaz foydasi KO'RSATILMAYDI. */
    var shBadge = o.is_shared
      ? '<span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:20px;'
        + 'background:var(--lav);color:var(--acc-ink);margin-left:6px;flex-shrink:0">🤝 ulashilgan</span>'
      : '';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(o.client_name) + shBadge + '</span><span style="font-size:14px;font-weight:800;color:' + color + ';flex-shrink:0">' + money(o.amount) + '</span></div>';
    h += '<div style="height:4px;border-radius:20px;background:var(--brd);margin-top:6px;overflow:hidden"><div style="height:100%;width:' + barW + '%;background:' + color + ';border-radius:20px;opacity:.7"></div></div>';
    var profTxt = (o.order_profit === null || o.order_profit === undefined)
      ? 'ulushingiz ' + o.percent + '%'                       // finance_hidden
      : 'zakaz foydasi ' + money(o.order_profit) + ' × ' + o.percent + '%';
    h += '<div style="display:flex;justify-content:space-between;margin-top:5px;font-size:10px;color:var(--mut)"><span>' + profTxt + '</span><span>' + (o.date || '') + '</span></div></div>';
  });
  h += '</div>';
  panel.innerHTML = h;
  var bk = panel.querySelector('.usta-back'); if (bk) bk.onclick = function () { RcFinance._renderUstalarList(); };
};
RcFinance._openUndistributed = function () {
  var panel = document.getElementById('fin-breakdown');
  if (!panel || !RcFinance._ustaData) return;
  var esc = Utils.esc, money = Utils.money;
  var d = RcFinance._ustaData, list = d.undistributed || [];
  var h = '<div class="rc-card" style="padding:14px;overflow:hidden">';
  h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">';
  h += '<button class="usta-back" style="font-size:16px;line-height:1;padding:6px 11px;border-radius:10px;border:none;background:var(--sfc2);color:var(--mut);cursor:pointer">←</button>';
  h += '<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:800">⚠️ Taqsimlanmagan</div>';
  h += '<div style="font-size:11px;color:var(--mut)">Jami <b style="color:var(--pch)">' + money(d.total_undistributed || 0) + '</b> · ' + list.length + ' zakaz</div></div></div>';
  h += '<div style="font-size:11px;color:var(--mut);margin:8px 0 12px">Zakazni bosib foydani ustalarga bo\'ling — hisobotga darhol tushadi.</div>';
  list.forEach(function (o) {
    var fin = (o.status === 'delivered' || o.status === 'ready');
    var badgeC = fin ? 'var(--acc)' : 'var(--pch)';
    var stLbl = RcFinance._ustaStatusLabels[o.status] || o.status;
    h += '<div class="undist-row" data-id="' + o.order_id + '" style="padding:11px 12px;margin-bottom:8px;background:var(--sfc2);border-radius:12px;border-left:3px solid ' + badgeC + ';cursor:pointer">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(o.client_name) + '</span><span style="font-size:14px;font-weight:800;color:var(--pch);flex-shrink:0">' + money(o.unassigned_amount) + '</span></div>';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:10px;color:var(--mut)"><span><span style="color:' + badgeC + ';font-weight:700">' + stLbl + '</span> · foyda ' + money(o.profit) + (o.unassigned_pct < 100 ? ' · ' + o.unassigned_pct + '% qolgan' : '') + '</span><span style="color:var(--acc-text);font-weight:700">Bo\'lish →</span></div></div>';
  });
  if (!list.length) h += '<div style="text-align:center;padding:18px;color:var(--acc-text);font-size:12px">✅ Hammasi taqsimlangan</div>';
  h += '</div>';
  panel.innerHTML = h;
  var bk = panel.querySelector('.usta-back'); if (bk) bk.onclick = function () { RcFinance._renderUstalarList(); };
  panel.querySelectorAll('.undist-row').forEach(function (row) { row.onclick = function () { RcFinance._openDistributeModal(parseInt(row.dataset.id)); }; });
};
/* Ustalar ro'yxati — FAQAT DB'dagi dinamik ro'yxatdan (profit.people).
   2026-08-04: qattiq yozilgan zaxira ro'yxat ('Oybek aka / Ganisher /
   Rustam aka') OLIB TASHLANDI — u bitta akkauntning ustalari edi, lekin
   BUTUN tizimga, hamma foydalanuvchiga chiqardi. Ro'yxat bo'sh bo'lsa —
   bo'sh qator qaytariladi, foydalanuvchi o'zi kiritadi.
   FOIZLAR HAR DOIM BO'SH — foydalanuvchi o'zi yozadi. */
RcFinance._stdRows = function () {
  var roster = (RcFinance._roster || []).filter(function (p) { return p.is_active; });
  if (roster.length) {
    return roster.map(function (p) { return { name: p.name, percent: 0 }; });
  }
  return [{ name: '', percent: 0 }];
};
RcFinance._openDistributeModal = function (orderId) {
  var d = RcFinance._ustaData || {};
  var o = (d.undistributed || []).filter(function (x) { return x.order_id === orderId; })[0];
  if (!o) return;
  var esc = Utils.esc, money = Utils.money;
  var names = d.people_names || [];
  RcFinance._distOrderId = orderId;
  RcFinance._distRows = (o.shares && o.shares.length) ? o.shares.map(function (s) { return { name: s.name || '', percent: s.percent || 0 }; }) : RcFinance._stdRows();
  var dl = '<datalist id="rc-dist-names">' + names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
  var body = '<div style="display:flex;flex-direction:column;gap:10px;padding-top:2px">' + dl +
    '<div style="font-size:12px;color:var(--mut);padding:8px 10px;background:var(--sfc2);border-radius:8px">📦 <b>' + esc(o.client_name) + '</b> · foyda <b style="color:var(--acc-text)">' + money(o.profit) + '</b></div>' +
    '<div id="rc-dist-rows"></div>' +
    '<div style="display:flex;gap:6px"><button type="button" id="rc-dist-add" class="rc-btn-ghost rc-btn-sm">+ Odam</button><button type="button" id="rc-dist-std" class="rc-btn-ghost rc-btn-sm">Ustalar ro\'yxati</button></div>' +
    '<div style="font-size:11px;color:var(--mut)">Foizlarni o\'zingiz kiritasiz — jami 100% bo\'lsin</div>' +
    '<div id="rc-dist-total" style="font-size:12px;font-weight:700"></div>' +
    '<button class="rc-btn" id="rc-dist-save" style="width:100%"><i class="fas fa-check"></i> Saqlash → hisobotga</button></div>';
  RcSheet.open("Foydani bo'lish", body, {});
  RcFinance._renderDistRows();
  document.getElementById('rc-dist-add').onclick = function () { RcFinance._distRows.push({ name: '', percent: 0 }); RcFinance._renderDistRows(); };
  document.getElementById('rc-dist-std').onclick = function () { RcFinance._distRows = RcFinance._stdRows(); RcFinance._renderDistRows(); };
  document.getElementById('rc-dist-save').onclick = function () { RcFinance._saveDistribute(o); };
};
RcFinance._renderDistRows = function () {
  var box = document.getElementById('rc-dist-rows'); if (!box) return;
  var esc = Utils.esc, h = '';
  RcFinance._distRows.forEach(function (r, i) {
    h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">';
    h += '<input list="rc-dist-names" class="rc-input rc-dist-name" data-i="' + i + '" value="' + esc(r.name) + '" placeholder="Ism" style="flex:1;padding:8px">';
    h += '<input type="number" class="rc-input rc-dist-pct" data-i="' + i + '" value="' + (r.percent || '') + '" min="0" max="100" style="width:66px;padding:8px;text-align:center">';
    h += '<span style="font-size:11px;color:var(--mut);width:14px">%</span>';
    h += '<button type="button" class="rc-dist-del" data-i="' + i + '" style="border:none;background:none;color:var(--danger);cursor:pointer;font-size:16px;line-height:1">✕</button></div>';
  });
  box.innerHTML = h;
  box.querySelectorAll('.rc-dist-name').forEach(function (el) { el.oninput = function () { RcFinance._distRows[parseInt(el.dataset.i)].name = el.value; }; });
  box.querySelectorAll('.rc-dist-pct').forEach(function (el) { el.oninput = function () { RcFinance._distRows[parseInt(el.dataset.i)].percent = parseFloat(el.value) || 0; RcFinance._updateDistTotal(); }; });
  box.querySelectorAll('.rc-dist-del').forEach(function (el) { el.onclick = function () { RcFinance._distRows.splice(parseInt(el.dataset.i), 1); RcFinance._renderDistRows(); }; });
  RcFinance._updateDistTotal();
};
RcFinance._updateDistTotal = function () {
  var el = document.getElementById('rc-dist-total'); if (!el) return;
  var sum = RcFinance._distRows.reduce(function (s, r) { return s + (parseFloat(r.percent) || 0); }, 0);
  var ok = Math.abs(sum - 100) < 0.5;
  var color = ok ? 'var(--acc)' : (sum > 100 ? 'var(--danger)' : 'var(--pch)');
  el.innerHTML = 'Jami: <span style="color:' + color + '">' + sum + '%</span> ' + (ok ? '✅' : (sum > 100 ? '⚠️ 100% dan oshdi' : '(100% bo\'lsin)'));
};
RcFinance._saveDistribute = function (o) {
  var rows = RcFinance._distRows.map(function (r) { return { name: (r.name || '').trim(), percent: parseFloat(r.percent) || 0 }; }).filter(function (r) { return r.name && r.percent > 0; });
  if (!rows.length) return Toast.error('Ism va foiz kiriting');
  var sum = rows.reduce(function (s, r) { return s + r.percent; }, 0);
  if (sum > 100.5) return Toast.error('Jami 100% dan oshib ketdi (' + sum + '%)');
  WS.send('profit.save', { order_id: RcFinance._distOrderId, shares: rows }, function (msg) {
    if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
    RcSheet.close(); Toast.success("Foyda bo'lindi va hisobotga tushdi");
    RcFinance._loadUstalar(function () { RcFinance._openUndistributed(); });
  });
};

window.RcFinance = RcFinance;
RC_PAGES['/finance'] = function () { RcFinance.render(); };
