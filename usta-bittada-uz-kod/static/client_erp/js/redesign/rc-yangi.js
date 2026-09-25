/* client_erp/js/redesign/rc-yangi.js — «Yangiliklar» sahifasi (2026-08-04).

   Nima uchun: qo'shilgan funksiyalar ko'p, ular turli sahifalarda chiqadi.
   Foydalanuvchi ularni qidirib yurmasin — bitta havola (#/yangi) barchasini
   ro'yxat qilib beradi va har biridan TO'G'RIDAN-TO'G'RI o'sha sahifaga
   o'tkazadi.

   Bu SAHIFA (kartochka emas) — yopilmaydi, yo'qolmaydi, istalgan vaqt
   qayta ochiladi. */
window.RC_PAGES = window.RC_PAGES || {};

var RcYangi = {

  /* Har bir yangilik: qaysi sahifada chiqadi + o'sha sahifaga havola.
     `go` — Router yo'li; `note` — qanday holatda ko'rinishi. */
  GROUPS: [
    {
      title: 'Bosh sahifa', icon: '🏠', go: '/',
      items: [
        { ic: '📊', name: 'Ulush bildirishnomasi',
          note: 'Foyda taqsimlanganda ikkala tomonda chiqadi. Summa katta shriftda, zakaz nomi bilan.',
          extra: 'Yopib bo‘lmaydi — pul o‘tkazilgunicha turadi.' },
        { ic: '💰', name: '«Kutilmoqda» ko‘rsatkichi',
          note: 'Ulashilgan zakazdan hali yechilmagan ulush bo‘lsa chiqadi.',
          extra: 'Kirim va Foydadan alohida — pul hali boshqa odamda.' },
      ],
    },
    {
      title: 'Buyurtma yaratish', icon: '📋', go: '/orders',
      items: [
        { ic: '📋', name: 'Shablon majburiy',
          note: '«+ Yangi» → shablonsiz saqlashga urinsangiz tushuntiruvchi oyna chiqadi.',
          extra: 'Yozilgan sarlavha yo‘qolmaydi — oyna yopilgach qaytadi.' },
      ],
    },
    {
      title: 'Buyurtma → Moliya tabi', icon: '📦', go: null,
      items: [
        { ic: '📄', name: 'Shartnomasiz kirim bloklanadi',
          note: 'Shartnoma summasi yo‘q buyurtmaga pul qo‘shib bo‘lmaydi.',
          extra: 'Oynadagi tugma shartnoma oynasini o‘zi ochib beradi.' },
        { ic: '🚚', name: 'Shartnomasiz «Topshirildi» bo‘lmaydi',
          note: 'Aynan shu daqiqada foyda hisoblanadi — asos bo‘lishi shart.' },
        { ic: '📈', name: 'Foyda = shartnoma − chiqim',
          note: 'Kelgan puldan emas, kelishilgan summadan hisoblanadi.',
          extra: 'Karta ostida «📄 shartnoma bo‘yicha» yozuvi turadi.' },
        { ic: '➕', name: '«Qo‘shimcha daromad»',
          note: 'Kelgan pul shartnomadan ko‘p bo‘lsa — alohida ko‘rsatiladi.',
          extra: 'Foydaga qo‘shilmaydi, lekin yo‘qolmaydi ham.' },
        { ic: '🧑‍💼', name: 'Foyda taqsimlash — kontakt bo‘yicha',
          note: 'Ism yozilmaydi — ro‘yxatdan tanlanadi. Qidiruv ism yoki telefon bo‘yicha.',
          extra: 'Yuqorida «Men (buyurtma egasi)» qatori — o‘chirilmaydi.' },
        { ic: '💸', name: 'Pul yechish — kontakt bo‘yicha',
          note: 'Ism faqat-o‘qish. Tugma ikki marta bosilsa ham bitta yozuv.' },
        { ic: '⏳', name: 'Pul rozilikdan keyin o‘tadi',
          note: 'Yechilgach egadan chiqadi, a‘zoning hisobiga u qabul qilgach tushadi.' },
        { ic: '↩️', name: 'Bekor qilish',
          note: 'Jamoa tabi → «Pul yechish tarixi». Sabab majburiy.',
          extra: 'Eski yozuv o‘chmaydi — «bekor qilingan» bo‘lib qoladi.' },
      ],
    },
    {
      title: 'Moliya sahifasi', icon: '💵', go: '/finance',
      items: [
        { ic: '✅', name: '«Sizga ulush kelmoqda» — qabul qilish',
          note: 'A‘zoda chiqadi. «Hozir → Qabul qilsangiz» hisobi ko‘rsatiladi.',
          extra: '✅ Qabul qilaman — pul qo‘shiladi · ❌ Olmadim — egaga qaytadi.' },
        { ic: '💰', name: '«Kutilayotgan foyda» kartasi',
          note: 'Ilgari bu summa jimgina Balansga qo‘shilardi — bir pul ikki kishida ko‘rinardi.',
          extra: 'Endi Balans/Kassa/Kirimdan chiqarilgan.' },
        { ic: '🔔', name: '«Foyda taqsimlanmagan» eslatmasi',
          note: 'Topshirilgan zakazda foyda bor, lekin hali bo‘lishilmagan bo‘lsa.' },
        { ic: '👷', name: 'Ustalar foydasi — ⚠️ belgisi',
          note: 'Eski, akkauntga bog‘lanmagan ulushlar ajratib ko‘rsatiladi.' },
        { ic: '🤝', name: 'Tranzaksiya belgilari',
          note: '«🤝 jamoa ulushi» va «↩️ bekor» — oddiy kirim bilan aralashmasin.' },
      ],
    },
    {
      title: 'Ko‘rinmaydigan himoyalar', icon: '🛡️', go: null, quiet: true,
      items: [
        { ic: '🛡️', name: 'Atomiklik',
          note: 'Pul yechishda yarim yozuv qolmaydi — yo hammasi, yo hech narsa.' },
        { ic: '🔁', name: 'Takrorlanishga qarshi',
          note: 'Bir xil so‘rov ikki marta kelsa, baza ikkinchisini qabul qilmaydi.' },
        { ic: '🔒', name: 'Ism qulfi',
          note: 'Ro‘yxatdan o‘tgach ism o‘zgartirilmaydi — ulushni o‘zlashtirishga qarshi.' },
        { ic: '🔍', name: 'Kunlik nazorat',
          note: 'Har kuni 07:00 da moliya invariantlari tekshiriladi.',
          extra: 'Muammo topilsa adminlarga Telegram xabar boradi.' },
      ],
    },
  ],

  /* Bitta zakazni 0 → 100 ga olib borish: har qadamda nima ko'rinadi. */
  STEPS: [
    { do: 'Buyurtmalar → «+ Yangi», shablonni tanlamasdan «Yaratish»',
      see: '📋 Shablon majburiy oynasi chiqadi (tushuntirish bilan)' },
    { do: 'Ro‘yxatdan shablon tanlab, buyurtmani yarating',
      see: 'Sarlavha saqlanadi, etaplar avtomatik qo‘shiladi' },
    { do: 'Moliya tabi → «Kirim» (masalan 10 000 000)',
      see: '📄 «Shartnoma summasini kiriting» oynasi bloklaydi' },
    { do: 'Oynadagi tugmadan shartnoma summasini yozing (12 000 000)',
      see: 'Endi kirim qabul qilinadi' },
    { do: '«Chiqim» qo‘shing (2 000 000) → status «Topshirildi»',
      see: '📈 Foyda = 12 000 000 − 2 000 000 = 10 000 000 · «📄 shartnoma bo‘yicha»' },
    { do: '«Foyda taqsimlash» → «+ Kontakt qo‘shish»',
      see: '🧑‍💼 «Men» qatori + kontakt ro‘yxati (qidiruv ism/telefon bo‘yicha)' },
    { do: 'Foizlarni yozing (jami 100%) → «Saqlash»',
      see: '📊 Ikkala tomonga bildirishnoma: «ulush belgilandi»' },
    { do: '«Pul yechish» → tugmani tez 3 marta bosing',
      see: '💸 Faqat 1 ta yozuv · a‘zoda ✅ «Qabul qilaman» kartasi chiqadi' },
    { do: 'Jamoa tabi → «Pul yechish tarixi» → «↩️ Bekor qilish»',
      see: 'Pul kassaga qaytadi, yozuv «bekor qilingan» bo‘lib qoladi' },
  ],

  render: function () {
    var app = document.getElementById('app');
    var esc = Utils.esc, h = '<div data-screen>';

    // Sarlavha
    h += '<div class="rc-card rc-card-lg" style="display:flex;align-items:center;gap:13px">';
    h += '<div style="width:46px;height:46px;border-radius:14px;background:var(--acc);'
      + 'display:flex;align-items:center;justify-content:center;font-size:22px;flex:none">✨</div>';
    h += '<div style="flex:1;min-width:0">'
      + '<div style="font-weight:800;font-size:16px">Yangi imkoniyatlar</div>'
      + '<div style="font-size:12px;color:var(--mut);margin-top:2px">'
      + 'Har biri o‘z sahifasida chiqadi — «Ko‘rish» tugmasi o‘sha yerga olib boradi</div></div>';
    h += '</div>';

    // ── 🧪 BITTA ZAKAZ BILAN HAMMASINI SINASH ──
    // Foydalanuvchi savoli: «bitta zakazni 0 dan 100 gacha ko'tarsam
    // hammasini ko'ramanmi?» — HA. Quyida aynan shu yo'l.
    h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:10px;'
      + 'border:1px solid var(--brd2);border-left:3px solid var(--cyan);padding:14px">';
    h += '<div style="display:flex;align-items:center;gap:9px">'
      + '<span style="font-size:17px">🧪</span>'
      + '<div style="flex:1;font-weight:800;font-size:14px">Bitta zakaz bilan hammasini sinash</div>'
      + '<button class="rc-btn rc-btn-sm rc-yn-go" data-go="/orders" '
      + 'style="flex:none;height:30px;padding:0 12px;font-size:12px">Boshlash →</button></div>';
    h += '<div style="font-size:11.5px;color:var(--mut);line-height:1.55">'
      + 'Bitta buyurtmani boshidan oxirigacha olib borsangiz — quyidagi 9 qadamda '
      + 'barcha yangi funksiyani ko‘rasiz. Jamoa qismi uchun ikkinchi akkaunt kerak.</div>';
    RcYangi.STEPS.forEach(function (st, i) {
      h += '<div style="display:flex;gap:10px;padding:9px 11px;background:var(--sfc2);'
        + 'border-radius:11px;align-items:flex-start">'
        + '<div style="width:21px;height:21px;border-radius:50%;background:var(--cyan);'
        + 'color:var(--acc-ink);display:flex;align-items:center;justify-content:center;'
        + 'font-size:11px;font-weight:800;flex:none;margin-top:1px">' + (i + 1) + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:12.5px;font-weight:700">' + esc(st.do) + '</div>'
        + '<div style="font-size:11.5px;color:var(--acc-text);margin-top:2px;line-height:1.5">'
        + '→ ' + esc(st.see) + '</div></div></div>';
    });
    h += '</div>';

    RcYangi.GROUPS.forEach(function (g) {
      h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:11px;'
        + (g.quiet ? 'opacity:.92;' : '') + 'padding:14px">';

      // Guruh sarlavhasi + «Ko'rish» tugmasi
      h += '<div style="display:flex;align-items:center;gap:9px">'
        + '<span style="font-size:17px">' + g.icon + '</span>'
        + '<div style="flex:1;font-weight:800;font-size:14px">' + esc(g.title) + '</div>';
      if (g.go) {
        h += '<button class="rc-btn rc-btn-sm rc-yn-go" data-go="' + esc(g.go) + '" '
          + 'style="flex:none;height:30px;padding:0 12px;font-size:12px">Ko‘rish →</button>';
      }
      h += '</div>';

      // Yangiliklar
      g.items.forEach(function (it) {
        // Guruhda havola bo'lsa — HAR BAND ham bosiladi (o'sha sahifaga o'tadi).
        // Buyurtma-ichidagi funksiyalar uchun `/orders` ga olib boramiz.
        var _go = g.go || (g.quiet ? '' : '/orders');
        h += '<div' + (_go ? ' class="rc-yn-item rc-yn-go" data-go="' + esc(_go) + '"' : '')
          + ' style="display:flex;gap:10px;padding:10px 11px;background:var(--sfc2);'
          + 'border-radius:12px' + (_go ? ';cursor:pointer' : '') + '">';
        h += '<span style="font-size:15px;flex:none;line-height:1.4">' + it.ic + '</span>';
        h += '<div style="flex:1;min-width:0">';
        h += '<div style="font-size:12.5px;font-weight:700;color:var(--txt)">' + esc(it.name) + '</div>';
        h += '<div style="font-size:11.5px;color:var(--mut);margin-top:2px;line-height:1.55">'
          + esc(it.note) + '</div>';
        if (it.extra) {
          h += '<div style="font-size:11px;color:var(--acc-text);margin-top:3px;line-height:1.5">'
            + esc(it.extra) + '</div>';
        }
        h += '</div>';
        if (_go) {
          h += '<i class="fas fa-chevron-right" style="color:var(--mut);font-size:11px;'
            + 'flex:none;align-self:center;opacity:.6"></i>';
        }
        h += '</div>';
      });

      h += '</div>';
    });

    // Buyurtma detali uchun alohida eslatma (u yerga to'g'ridan-to'g'ri
    // o'tib bo'lmaydi — avval buyurtma tanlanadi)
    h += '<div style="font-size:11.5px;color:var(--mut);text-align:center;padding:4px 12px;line-height:1.6">'
      + '«Buyurtma → Moliya tabi» bo‘limidagilarni ko‘rish uchun '
      + '<b style="color:var(--txt)">Buyurtmalar</b>dan bittasini oching</div>';

    h += '</div>';
    app.innerHTML = h;

    document.querySelectorAll('.rc-yn-go').forEach(function (b) {
      b.onclick = function () { Router.go(b.dataset.go); };
    });
    window.scrollTo(0, 0);
  },
};

window.RcYangi = RcYangi;
RC_PAGES['/yangi'] = function () { RcYangi.render(); };
