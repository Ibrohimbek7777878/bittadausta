# Mini ERP Redesign — Implement rejasi

**Sana:** 2026-07-10 · **Manba dizayn:** `Mini-ERP-Redesign.dc.html` (Claude Design)
**Qaror (foydalanuvchi):** hammasini qurib, bir yo'la almashtirish · qorong'i default + light toggle

## Dizayn tizimi (manbadan ajratilgan)

**Mavzular** (CSS o'zgaruvchilar):
- **Dark (default)**: `--bg #141318` (body `#0D0C10`), `--sfc #1E1D24`, `--sfc2 #29282F`,
  `--txt #F5F4F7`, `--mut #9B9AA3`, `--brd rgba(255,255,255,.08)`
- **Light**: `--bg #F3F1EA`, `--sfc #FFFFFF`, `--txt #1B1A20`, `--mut #6E6C76`
- **Accent (ikkala mavzu)**: lime `--acc #DCF262` (ustidagi matn `#1B1A20`);
  pastel: peach `--pch #F5A48B`, cyan `--cyan #A6E6F2`, lavender `--lav #C9B4F7`
- **Shrift**: Plus Jakarta Sans (400-800)
- **Radiuslar**: karta 18-22px, tugma/input 14px, chip/pill 999px
- **Soyalar**: yumshoq, qatlamli; accent tugmada glow
- **Animatsiyalar**: screenin, popin, bargrowx (progress), sheetup (bottom-sheet),
  toastin, coinpop, fabbob

**Ekranlar (dizaynda 7 ta, qolganlari shu tizimdan yig'iladi):**
Dashboard · Buyurtmalar · Buyurtma detali (**tab: Umumiy/Moliya/Etap/Fayl/Jamoa**) ·
Moliya · Analitika · Mijozlar · Sozlamalar.
Qolgan mavjud ekranlar (MebelCity, Vizualizatsiya, Zamerlar, Oldi-Berdi, Jamoa,
BOM-settings) — xuddi shu dizayn tili bilan bo'yaladi.

**Shell:** desktop chap sidebar (logo B, guruhli nav, "Yangi buyurtma" CTA, profil
kartasi); mobil topbar (burger/back, sarlavha, 🪙 coins pill, avatar) + drawer +
pastki nav; bottom-sheet (modal o'rniga); toast; coin-burst; Laylo FAB.

## Isolyatsiya strategiyasi (jonli ilova xavfsiz)

Repo git EMAS — branch yo'q. Shuning uchun **parallel v2 fayllar + preview route**:
- Yangi CSS: `static/client_erp/css/redesign.css` (dizayn tokenlar + `rc-` komponent klasslar).
- Yangi shell: `template/client_erp/spa_redesign.html` (preview shell, `rc-` dizayn).
- Reskin sahifalar: har `pages/<x>.js` ning yangi dizayn varianti `pages/redesign/<x>.js`
  (yoki bosqichma-bosqich, mavjud faylni buzsiz). Real ma'lumot/WS/logika **o'zgarmaydi** —
  faqat `template()` HTML/stil qayta yoziladi.
- Preview route: `/mini/<username>/v2/` → `spa_redesign.html` (dashboard.py da variant view).
  Jonli `/mini/<username>/spa/` **tegilmaydi**.
- Test: tg_1586130864 (test akkaunt) da `/v2/` orqali ko'riladi.
- **Almashtirish (yakuniy, bitta qadam)**: tayyor bo'lgach `mini_spa` view'ini
  `spa_redesign.html`ga o'tkazish (yoki redesign→spa.html ko'chirish) + versiya bump.

## Fazalar

- **Faza 0** — Poydevor: `redesign.css` (tokenlar dark+light + `rc-` komponent klasslar:
  card/btn/chip/stat/tab/badge/progress/sheet/fab/avatar) + Plus Jakarta Sans. ← HOZIR
- **Faza 1** — Shell: `spa_redesign.html` (sidebar/topbar/drawer/bottom-nav/theme-toggle) +
  preview route `/v2/`.
- **Faza 2** — Dashboard (profil, quick cards, stat, quests, faol buyurtmalar, e'lon).
- **Faza 3** — Buyurtmalar + Buyurtma detali (tab strukturaga).
- **Faza 4** — Moliya + Analitika (grafiklar yangi dizayn tili bilan).
- **Faza 5** — Mijozlar, Sozlamalar + qolgan ekranlar (MebelCity/Vizualizatsiya/Zamer/
  Oldi-Berdi/Team/BOM) dizayn tiliga.
- **Faza 6** — Komponentlar: modal→bottom-sheet, toast, coin-burst, Laylo FAB restyle.
- **Faza 7** — Yakuniy almashtirish (route flip) + collectstatic + restart.

## Muhim qoidalar
- Real ma'lumot oqimi/WS/router/gamifikatsiya mantiqi **o'zgarmaydi** — faqat ko'rinish.
- Har faza test akkauntda ko'riladi.
- Static o'zgarsa `collectstatic` + versiya; jonli almashtirish oxirida.
