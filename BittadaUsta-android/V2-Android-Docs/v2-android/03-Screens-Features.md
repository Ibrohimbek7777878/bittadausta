# 03 — Ekranlar va funksiyalar (Bittada Usta v2)

> Android ilova quruvchi uchun **ekran-ekran spetsifikatsiya**.
> Manba: `static/client_erp/js/redesign/rc-*.js` + `redesign-app.js`.
> Dizayn tizimi (ranglar/komponentlar) → `02-Design-System.md`.

---

## 0. Umumiy arxitektura

### 0.1 Ma'lumot qatlami — WebSocket (`WS.send`)
Barcha ma'lumot **WebSocket** orqali. Universal chaqiruv:
```js
WS.send(actionName, payloadObj, function(msg){ /* msg.ok, msg.data, msg.error */ }, timeoutMs)
```
- Javob: `{ ok: bool, data: {...}, error: "..." }`.
- Xato → `Toast.error(msg.error)`.
- Ba'zi oqimlar **stream** (AI tahlil): `WS.on('ai.chunk'|'ai.done'|'ai.error', cb)` + `WS.off(...)`.
- Real-time broadcast: boshqa a'zo buyurtmani o'zgartirsa → sahifa avto-yangilanadi
  (order detailda `handleBroadcast` debounce reload).
- Bir nechta REST endpoint ham bor (fayl yuklash, AI rasm, VR, shartnoma) — quyida belgilangan.

Android: bitta WebSocket menejeri (reconnect + so'rov/javob korrelyatsiya id bilan) + Toast.

### 0.2 Router (hash-based)
`#/path`. Marshrutlar (`redesign-app.js` → `Router.routes`):

| Route | Ekran | Sarlavha |
|-------|-------|----------|
| `/` | Bosh sahifa (Dashboard) | Bosh sahifa |
| `/clients` | Mijozlar ro'yxati | Mijozlarim |
| `/clients/:id` | Mijoz detali | Mijoz |
| `/orders` | Buyurtmalar ro'yxati | Buyurtmalar |
| `/orders/:id` | **Buyurtma detali** (5 tab) | Buyurtma |
| `/finance` | Moliya (+Ustalar foydasi) | Moliya |
| `/analytics` | Analitika (+AI tahlil) | Analitika |
| `/mebelcity` | MebelCity buyurtmalar | Buyurtmalarim |
| `/vizualizatsiya` | 360° panoramalar | Vizualizatsiya |
| `/zamers` | 3D Zamerlar | 3D Zamerlar |
| `/oldi-berdi` | Oldi-Berdi (hisob-kitob) | Oldi-Berdi |
| `/team` | Jamoa | Jamoa |
| `/settings` | Sozlamalar | Sozlamalar |
| `/tarif` | Tarif rejalari | Tarif |
| `/tanga` | Tanga hamyoni | Tanga hamyoni |

Android: `Navigation Component` / Compose Navigation — shu route'lar.

### 0.3 Davr filtri (RcPeriod) — ko'p ekranda umumiy
Bosh komponent: **Shu oy (default)** / O'tgan oy / Yil / Hammasi + "Aniq oy…"
dropdown (mavjud oylar) + "📅 Davr" (custom sana-oralig'i, bottom-sheet).
- `RcPeriod.query(st)` → backendga: `{period}` yoki `{ym}` yoki `{period:'custom',date_from,date_to}`.
- Moliya/Analitika/Oldi-Berdi → davr o'zgarsa **backend qayta yuklanadi**.
- Buyurtma/Mijoz → davr filtri **client-side** (backend davr qabul qilmaydi).
- Android: gorizontal chip qatori + "Aniq oy" spinner + "Davr" date-range picker.

---

## 1. Bosh sahifa (Dashboard) — `#/`
**WS:** `page.dashboard` → `{user, stats, team_invite, daily_quests, active_orders, shared_tasks, announcements}`

Ko'rsatadi (yuqoridan pastga):
1. **Profil hero karta** — avatar (VIP emoji/initials), "Salom, {ism} 👋", chiplar:
   👑 VIP daraja · ⭐ XP · 🔥 streak kun.
2. **Jamoa taklifi** (agar bor) — kim/qaysi jamoa + **Qabul** / **Rad etish** tugmalari.
   - Qabul → `team.accept` · Rad → `team.decline`.
3. **3 tez-karta** (gradient) — Buyurtmalar (`/orders`), MebelCity (`/mebelcity`),
   Mijozlar (`/clients`) — har birida son + strelka.
4. **Stat kartalar** — Kirim, Foyda (±rangli), Qarz (agar >0).
5. **Kunlik topshiriqlar (quests)** — har biri: ikon + nom + progress bar + `progress/target`
   + XP mukofoti chip / ✅.
6. **Faol buyurtmalar** — buyurtma kartalari (nom, status badge, mijoz, narx, progress).
   "Hammasi →" → `/orders`.
7. **🤝 Vazifalarim** — menga ulashilgan buyurtmalar (rol + faol etaplar).
8. **E'lonlar** — peach karta (sarlavha + matn + chegirma %).

**Amallar:** karta bosish → tegishli sahifa/buyurtma. Coins pill topbar'da yangilanadi.

---

## 2. Mijozlar — `#/clients`
**WS:** `page.clients` → `{clients:[{id,name,phone,address,order_count,order_months[],last_order_at}]}`

Ko'rsatadi:
- **Qidiruv** (rc-search) + **➕ Yangi mijoz** tugma (44px kvadrat).
- **Davr filtri** (RcPeriod) — "shu davrda buyurtma bergan" mijozlar (client-side,
  `order_months` bo'yicha). Default: shu oy. Sarhisob: mijozlar soni + davr yorlig'i.
- **Mijoz kartalari** — avatar (rang aylanadi), ism, 📦 buyurtma soni chip, telefon/manzil,
  o'ngda **📞 qo'ng'iroq** (`tel:`) + **🗑 o'chirish**.

**Amallar:**
- Karta bosish → `/clients/:id`.
- Yangi mijoz (bottom-sheet: Ism* / Telefon / Manzil) → `client.create` `{name, phone, address}`.
  - Yangi mijoz filtrda yashirinmasligi uchun "Hammasi"ga o'tadi.
- O'chirish (tasdiq sheet) → `client.delete` `{id}` (karta swipe-out animatsiya).
- 📞 → telefon dialer (`tel:`).

### 2.1 Mijoz detali — `#/clients/:id`
**WS:** `page.client_detail` `{id}` → `{customer, orders[], stats}`
Ko'rsatadi:
- **Hero karta** — avatar + ism + telefon/manzil, o'ngda 📞 + **✏️ tahrirlash**.
- **2 stat** — Buyurtmalar soni, Jami kirim (buyurtmalardan hisoblanadi).
- **Buyurtmalari** — buyurtma kartalari (status, progress, vaqt, MebelCity chip, narx).

**Amallar:**
- Tahrirlash (sheet: Ism* / Telefon) → `client.update` `{id, name, phone}`.
- Buyurtma karta → `/orders/:id`. 📞 → dialer.

---

## 3. Buyurtmalar — `#/orders`
**WS:** `page.orders` → `{orders[], shared_orders[], templates[], clients[], statuses[]}`

Ko'rsatadi:
- **Qidiruv** (nom/mijoz, **kirill↔lotin normalizatsiya**) + **🗑 savat** (o'chirilganlar)
  + **➕ Yangi** tugma.
- **Davr filtri** (RcPeriod, default shu oy — client-side). Joriy oy ko'rinishida
  **tugamagan** buyurtmalar o'tgan oyda ochilgan bo'lsa ham chiqadi (carry-over).
- **Status tab'lari** (hisob bilan): Hammasi / Yangi / Kutilmoqda / Jarayonda / Tayyor / Topshirildi.
- **Buyurtma kartalari** — nom + status badge, 👤 mijoz + narx, "kutilmoqda" izohi (peach),
  progress bar, chiplar: 🔗 Ulangan/○ Ulanmagan · ✓ Zamer/✗ Zamer yo'q · vaqt.
- **🤝 Ulashilgan buyurtmalar** — rol chip bilan.

**Amallar:**
- Karta → `/orders/:id`.
- Yangi (bottom-sheet: Sarlavha* / Mijoz select [+ inline yangi mijoz `client.create`] /
  Etap shabloni select) → `order.create` `{title, customer_id, template_id}` → yangi
  buyurtmaga o'tadi.
- Savat → `orders.deleted` (ro'yxat) → har birida **Tiklash** → `order.restore` `{id}`.
- Tab/qidiruv → client-side filtr (WS qayta so'ramaydi).

---

## 4. ⭐ Buyurtma detali — `#/orders/:id` (ENG BATAFSIL)
**WS:** `page.order` `{id}` → to'liq serializatsiya (`serialize_order_full`): `{id, title,
status, overall_progress, customer, created_at, deadline, delivered_at, description,
zaklad_amount, total_income, total_expense, stages[], transactions[], files[], notes[],
timeline[], permissions[], profit_shares[], shares[], templates[], bom, money_hidden,
is_owner, user_role, can_add_expense, can_complete_stage, ...}`

### 4.0 Sarlavha kartasi (barcha tab ustida)
- Nom + mijoz havolasi (📞 telefon bilan) + **status badge** (owner/manager bosib
  o'zgartiradi → `changeStatus`).
- Progress bar (`rc-progress-lg`) + %.
- Sanalar: 📅 yaratilgan, 🏁 deadline, ✅ topshirilgan.

### 4.0.1 Tab qatori (`rc-tabs`)
**Umumiy · Moliya · Etaplar · Fayllar · Jamoa** — tab almashish WS qayta so'ramaydi
(kesh'dan chiziladi), scroll yuqoriga.

### 4.1 Tab: **Umumiy**
- **Ma'lumot** ro'yxati — Holat / Mijoz / Telefon / Manzil / Yaratilgan / Deadline / Jarayon%.
- **📄 Tavsif** (agar bor).
- **📝 Eslatmalar** — ro'yxat (matn + muallif + vaqt) + **➕ qo'shish**. O'ziniki bo'lsa
  ✏️/🗑.
  - Qo'shish → `note.create` `{order_id, text}` · Tahrir → `note.update` `{note_id, text}`
    · O'chirish → `note.delete` `{note_id}`.
- **Tarix (timeline)** — hodisalar (matn + vaqt).
- **Buyurtmani o'chirish** (owner) — sheet (sabab*) → `order.delete` `{id, note}` → `/orders`.

**Status o'zgartirish** (`changeStatus`, sheet): status select + "waiting" tanlanса
**sabab*** maydoni → `order.update` `{id, fields:{status}, [status_note]}`.

### 4.2 Tab: **Moliya**
> `money_hidden` bo'lsa → 🔒 "Moliya yopiq" (ruxsat yo'q).
- **5 stat karta:** Shartnoma (lav, owner bosib tahrir) · Kirim (acc) · Qarz (pch/acc)
  · Chiqim (danger) · **Foyda** (owner/manager bosib taqsimot).
  - Qarz = `shartnoma − kirim` (agar shartnoma > 0).
- **Amal tugmalari** (ruxsatga qarab):
  - **➕ Kirim** (owner/manager) → sheet (Summa* / Izoh / To'lov turi) → `order.income`
    `{order_id, amount, description, payment_method, customer_id}`.
  - **➖ Chiqim** (owner/manager/can_add_expense) → sheet (Summa* / Izoh / Kategoriya
    [material/service/transport/other] / **Etap** select / To'lov turi) → `order.expense`
    `{order_id, amount, description, payment_method, category, stage_id}`.
  - **📄 Shartnoma** (owner) → mijoz portali (quyida 4.6).
  - **🔗 Ulashish** (owner) → jamoaga ulashish (quyida 4.5).
  - **💰 Foyda yechish** (agar taqsimot bor) → `withdrawProfit` (checkbox lines) →
    `profit.withdraw` `{order_id, lines[], total_profit}`.
  - **↩ Kirim/Chiqim qaytarish** (faqat `can_revert_finance`, ya'ni `bigone_cl2`) →
    `finance.revert` `{order_id, type:'income'|'expense', amount}`.
- **Shartnoma summasi** (owner, `setZaklad`) → `order.update` `{id, fields:{zaklad_amount}}`.
- **Foyda taqsimot** (`openProfit`): agar taqsimlangan → o'qish sheet; aks holda tahrir —
  ism+foiz qatorlari (jami 100%), standart 35/20/20/25 → `profit.save` `{order_id, shares[]}`.
- **Tranzaksiyalar** — kirim (↗ acc) / chiqim (↘ pch) kartalar (nom, izoh, summa, sana).

### 4.3 Tab: **Etaplar**
- Owner/manager → **➕ Yangi etap** (sheet: Nom* / Emoji / Rang / Taxminiy xarajat / Izoh
  / Checklist (qatorma-qator) / **🏭 MebelCity etapi** toggle [MC buyurtma tanlash]) →
  `stage.create` `{order_id, title, icon, color, note, estimated_cost, is_mebelcity,
  mebelcity_order_id, checklist[]}`.
- **Etap kartalari** — rangli chap chiziq + emoji + nom + status badge (Bajarildi/O'tkazildi/Jarayonda),
  biriktirilgan xodim, chiqim (💰 real/taxminiy), **checklist** (bosiladigan ✅/⬜),
  izoh, bajargan kishi.
  - Amal tugmalari (ruxsatga qarab):
    - **✅ Tugatish** (`stage.complete {id}`) — XP/tanga beriladi (CoinBurst).
    - **⏭ O'tkazish** (tasdiq → `stage.skip {id}`)
    - **↩ Qayta ochish** (`stage.reopen {id}`)
    - **🔗 Buyurtma** (MebelCity etap → MC buyurtma ulash, quyida 4.7)
    - **🗑 o'chirish** (`stage.delete {id}`)
  - **Checklist band** bosish → `stage.check {stage_id, item_id}`.
- **MebelCity ichki karta** (cyan) — `mc_info`: 🏭 #hash, progress %, joriy qadam, summa.
- Etap yo'q → shablon qo'llash (`template.apply {template_id, order_id}`) yoki qo'lda qo'shish.

### 4.4 Tab: **Fayllar**
- **Bazis smeta (BOM)** — `.b3d` fayldan avto hisoblangan smeta kartasi (`BomCard`,
  `d.bom`). Hali hisoblanmasa "⏳ hisoblanmoqda" (2.5s retry).
- **Fayl plitkalari** (3 ustun grid) — rasm → thumbnail; boshqa → gradient + ikon
  (📐 b3d, 📄 pdf, 📊 xls, 🎬 video...). Har plitkada 🔗 ulashish; owner/manager → 🗑.
- **➕ Qo'shish** plitka (dashed) — sheet: 📁 Fayl / 📷 Surat (kamera) / 🎬 Video, ko'p
  fayl, progress bar. Katta fayllar **chunk** (5MB) bilan.
  - REST: `/mini/api/file-upload/` (kichik) · `/mini/api/chunk-upload/` (katta, `upload_id`).

**Faylni ko'rish (`viewFile`):**
- Rasm → **lightbox** (to'liq ekran). Owner/manager uchun ichida:
  - **✨ AI tahrir** (`aiEdit`) → sheet (nima o'zgartirilsin) → REST
    `POST /mini/api/ai-image-edit/ {file_id, prompt}` → poll `?task_id=` → tayyor fayl qo'shiladi (fal.ai).
  - **🥽 360° VR** (`makeVr`) → provayder tanlash (PanoPulse / Fal Hunyuan) → REST
    `POST /mini/api/panorama-generate/ {file_id, provider, prompt}` → poll → viewer ochiladi.
    > Eslatma: "VR" = **360° panorama** (widget_panorama), fayl turi emas.
- Boshqa fayl → yangi tabda ochiladi.
- **Ulashish** (`shareFile`) — `navigator.share` / clipboard / yangi tab. Android: `Intent.ACTION_SEND`.

### 4.5 Tab: **Jamoa** + ulashish/ruxsat
- **Jamoa a'zolari** — avatar + ism + rol. Owner → **👤+ qo'shish** (`openPerm`, quyida).
- **💰 Foyda taqsimot** (agar bor, pul ko'rinsa) — split-bar + ism/foiz/summa.
- **Ruxsatlar** (owner) — har a'zo: rol select (viewer/worker/manager) + 3 toggle:
  💰 Pul ko'rish / ➖ Chiqim / ✅ Etap tugatish + ✕ o'chirish.
  - Toggle → `perm.save` (to'liq payload, o'zgargan maydon bilan).
  - Rol → `perm.save` `{order_id, user_id, role, ...}`.
  - O'chirish → `perm.delete` `{id}`.

**A'zo qo'shish / ruxsat (`openPerm`, sheet):**
- Segment: **👤 Shaxs** yoki **👥 Jamoa**.
- Shaxs: foydalanuvchi qidirish (`user.search {q}`), rol, 3 checkbox (chiqim/tugatish/pul),
  **ulashish turi** (Bir martalik / Har doim). → `perm.save` `{order_id, user_id, role,
  can_add_expense, can_complete_stage, can_see_money, always, stages:[]}`.
  - "Har doim ulashiladiganlar" ro'yxati (`standing.list`) — tahrir (`standing.update`) /
    o'chirish (`standing.delete`).
- Jamoa: avto-ulashish kartalari (`team.autoshare_get`) — "🔁 yangi buyurtmalar avto-ochilsin"
  + rol + ruxsatlar → `team.autoshare_set {team_id, auto_*}`.

**Buyurtma ulashish (`shareOrder`, owner, sheet):**
- Mavjud ulashishlar (jamoa nomi + ko'rinish) + ✕ (`order.unshare {order_id, team_id}`).
- Yangi: ko'rinish darajasi (To'liq / Cheklangan / Moliya yashirin) + 3 checkbox
  (Tahrirlash / Tugatish / Chiqim) → `order.share` `{order_id, visibility, can_edit,
  can_complete, can_add_expense}`.

### 4.6 Mijoz shartnomasi (`openContract`, owner)
Sheet: Dogovor summasi* + shartnoma matni → REST `POST /mini/api/contracts/ {order_id,
amount, terms}` → mijoz portal havolasi (`portal_url`, `uuid`):
- Havola nusxa, **SMS** (`POST /mini/api/contracts/{uuid}/send-sms/`), **Telegram**,
  **WhatsApp** ulashish, **QR** rasm (`/mini/portal/{uuid}/qr/`).
Android: matn/QR + Intent share (SMS/TG/WA).

### 4.7 MebelCity buyurtma ulash (`linkMc`, MebelCity etap)
Sheet: MC buyurtmalar ro'yxati (`mebelcity_orders_for_stage`) — qidiruv + tanlash →
`stage.link_order` `{stage_id, mebelcity_order_id}`.

### 4.8 Real-time
Boshqa a'zo etap/moliya/fayl o'zgartirса → `handleBroadcast` (400ms debounce) → `page.order`
qayta so'raladi, joriy tab saqlanadi. Android: WS event listener → reload.

---

## 5. Moliya — `#/finance`
**WS:** `page.finance` `RcPeriod.query(st)` → `{stats, kassa, sof_foyda, wip, records[],
debts[], monthly{}, months{}, withdrawal_recipients[], last_profit_shares[]}`
> Davr o'zgarsa **backenddan to'liq qayta yuklanadi**.

Ko'rsatadi:
1. **➕ Kirim/Chiqim** + **💰 Yechish** tugmalari.
2. **Davr filtri** (RcPeriod).
3. **🏦 Kassa karta** — oy boshi qoldiq → +Kirim −Chiqim −Yechim → **Oy oxiri qoldiq**
   (keyingi oyga o'tadi).
4. **💰 Sof foyda** — topshirilgan buyurtmalar foydasi (har biri bosiladi → buyurtma) +
   🔧 jarayonda band pul (WIP).
5. **4 stat** (bosiladi → oylik breakdown): Kirim / Chiqim / Kassa foyda / Balans.
6. **👷 Ustalar foydasi** tugma → drill-down (quyida 5.1).
7. **Tab: Tranzaksiyalar / Qarzlar.**
   - Tranzaksiyalar: qidiruv + tx kartalar (tur ikon+rang, izoh, ±summa). Bosilsa detal sheet.
     Turlar: income↓ · expense↑ · withdrawal💰 · debt_given📤 · debt_received📥 · debt_paid✅.
   - Qarzlar: qarz kartalar (mijoz, to'langan/jami, progress, qoldiq) + **To'lash**.

**Amallar:**
- Kirim/Chiqim (sheet: Turi / Summa* / Izoh / Kategoriya / To'lov turi) → `finance.create`
  `{type, amount, description, payment_method, category}`.
- Yechish (sheet: foyda-share checkbox lines yoki oluvchi chip + Summa*) → `finance.withdrawal`
  `{amount, recipient_name, description, payment_method}` (har line alohida).
- Yangi qarz (sheet: Mijoz* / Summa* / Izoh) → `debt.create` `{customer_id, amount, description}`.
- Qarz to'lash (sheet: Summa*) → `debt.pay` `{id, amount}`.
- Oylik breakdown → `monthly{}` dan (kirim/chiqim/foyda/balans oylar kesimi).

### 5.1 👷 Ustalar foydasi (drill-down)
**WS:** `team.profit.detail` `RcPeriod.query(st)` → `{people[], total_profit, total_withdrawn,
undistributed[], undistributed_count, total_undistributed, people_names[]}`
- **Ro'yxat** — har usta: avatar (rang), ism + %, progress bar, 📦 zakaz soni, hisoblangan
  summa. Bosilsa → **usta detali** (jami foyda / olindi / qoldiq + qaysi zakazlardan).
- **⚠ Taqsimlanmagan** karta — bo'linmagan zakaz foydalari. Bosilsa → ro'yxat → zakaz
  bosish → **foydani bo'lish** sheet (ism+foiz qatorlari, standart 35/25/20/20
  Oybek/Ganisher/Nursulton/Rustam) → `profit.save` `{order_id, shares[]}`.

---

## 6. Analitika — `#/analytics`
**WS:** `page.analytics` `RcPeriod.query(st)` → `{summary, totals, chart, profit_monthly,
status_distribution, expense_categories, top_customers, deliveries, stage_performance,
payment_data_income, payment_data_expense, months}` + AI: `analytics.ai_history`,
`analytics.ai` (stream).

Ko'rsatadi:
- **Davr filtri.**
- **4 summary stat** — Kirim / Chiqim / Foyda / Buyurtmalar (o'zgarish % ▲▼ rangli).
- **✅ Topshirilgan buyurtmalar** — shartnoma + deadline → topshirilgan sana; vaqtida/kech badge.
- **⚠️ Muddati o'tgan** (overdue) — aktiv, kun soni.
- **📊 Bajarilgan bosqichlar** — bar.
- **Kirim/Chiqim to'lov usullari** — bar.
- **🤖 AI Biznes Tahlil** karta — **✨ Tahlil (50🪙)** tugma → stream (`analytics.ai`) →
  bo'limlar + tavsiyalar + tanga sarfi. **Oldingi tahlillar** tarixi (`analytics.ai_history`).
- **Grafiklar (custom SVG):** Kirim/Chiqim bar, Oylik sof foyda bar (nol chiziqli),
  Buyurtma holati **donut**, Chiqim turlari horizontal bar, Top mijozlar bar.
- **Footer grid** — Jami kirim/chiqim/foyda/balans/qarzlar/buyurtmalar/bajarilgan/mijozlar.

**Android:** grafiklar uchun MPAndroidChart yoki Compose canvas; ranglar `PALETTE`
(cyan/acc/lav/pch/danger...). AI stream → WS chunk'lar UI ga.

---

## 7. MebelCity buyurtmalar — `#/mebelcity`
**WS:** `page.mebelcity` → `{orders[]}` (fabrika buyurtmalari)
- **Buyurtma kartalari** — #hash, hamkor/egasi, holat badge (draft/pending/in_progress/done...),
  yetkazish holati chip, summa, progress, **chek mahsulotlari** (lines+services, `Math.ceil` miqdor),
  fayllar chip, shoshilinch/deadline meta.
- Karta bosish → **to'liq ekran iframe** (`RcFrame.open('/order/{hash}/')`).
  - Android: WebView ekran (yoki native detail — hozircha web iframe).

---

## 8. Vizualizatsiya (360° panorama) — `#/vizualizatsiya`
**WS:** `page.vizualizatsiya` → `{galleries[]}` (pending bo'lsa 5s repoll)
- Sarlavha + **➕ Yuklash**.
- **2 ustun grid** — panorama kartalar: thumbnail (yoki "Yaratilmoqda…" skeleton), 360° badge,
  panorama soni, nom + meta, **🏭 #hash** / **📋 buyurtma** chiplari yoki **🔗 Bog'lash**.
- Karta → viewer (`/mini/{username}/panorama/{uuid}/`).
- Yuklash → `/mini/{username}/panorama/upload/`.
- Bog'lash → `RcLink` sheet (buyurtma tanlash) → `panorama.link` `{gallery_uuid, client_order_id}`.
- Android: viewer/upload — WebView; grid — native.

---

## 9. 3D Zamerlar — `#/zamers`
**WS:** `page.zamers` → `{zamers[]}`
- Sarlavha + **BLE** (lazer o'lchagich) + **➕ Yangi**.
- **2 ustun grid** — zamer kartalar: thumbnail/3D ikon, 3D badge, blok soni, xona nomi,
  o'lchamlar (mm, `Math.ceil`), #hash, meta, 🏭/📋 chip yoki 🔗 Bog'lash.
- Karta → zamer editor iframe (`zamer_url`) yoki detal sheet.
- Yangi → REST `GET /mini/api/zamer-new/` → `iframe_url` (editor).
- BLE → `BLE.togglePanel()` (bluetooth lazer o'lchagich). Android: BLE adapter native.
- Bog'lash → `RcLink` → `zamer.link` `{zamer_id, client_order_id}`.

---

## 10. Oldi-Berdi (MebelCity hisob-kitob) — `#/oldi-berdi`
**WS:** `page.oldi_berdi` `{period}` → `{linked, client_name, balance{uzs,usd}, summary,
sales[], returns[], debts[], operations[], has_more{}}` + `oldi_berdi.load_more`
- Hisob ulanmagan bo'lsa → 🔗 "Hisob ulanmagan".
- **Davr chiplari** (Barchasi/Shu oy/O'tgan oy/Shu yil) + 🔄 yangilash.
- **Qarzdorlik** UZS/USD kartalar.
- **Summary** — Sotuvlar / Qaytarish / Qarzlar / To'lovlar (soni + summa).
- **Tab:** Sotuvlar / Qaytarish / Qarzlar / To'lovlar — kartalar (doc №, sana, ombor,
  summa UZS/USD, to'langan/qarz, progress). "Ko'proq yuklash" (`oldi_berdi.load_more
  {section, offset, limit, period}`).
> Faqat o'qish (MebelCity tizimi ma'lumoti oynasi). Android: native ro'yxatlar.

---

## 11. Jamoa — `#/team`
**WS:** `page.team` → `{team, team_orders[], profit_templates[], member_teams[]}` + `team.*`
- Jamoa yo'q → "Jamoa yaratish" (`team.create {name, description}`).
- Sarlavha + a'zo soni + **👤+ Taklif** (`team.invite {query, role, profit_percent}`).
- **Tab:** A'zolar / 📦 Buyurtmalar / Foyda shabloni / Sozlamalar / A'zo jamolar.
  - **A'zolar** — avatar + ism + telefon, status/rol/foiz, ✏️/✕ (owner emas).
    - Tahrir → `team.update_member {user_id, role, profit_percent}`.
    - O'chirish → `team.remove_member {user_id}`.
    - Kutilayotgan takliflar.
  - **Buyurtmalar** — jamoaga ulashilgan buyurtmalar (status, narx, ko'rinish, progress) → detal.
  - **Foyda shabloni** — shablonlar (rol+foiz qatorlar) + **➕ Yangi** (`team.save_template
    {name, lines[]}`) + o'chirish (`team.delete_template {id}`).
  - **Sozlamalar** — nom/tavsif (`team.update`) + 🔁 avto-ulashish (`team.autoshare_get/set`).
  - **A'zo jamolar** — men a'zo bo'lgan boshqa jamolar (rol, foiz, a'zolar).

---

## 12. Sozlamalar — `#/settings`
**WS:** `page.settings` → user obyekti; `template.list` → etap shablonlar
- **Profil karta** — avatar, ism, @username, chiplar (VIP/XP/🪙tanga/streak), telefon, tashkilot.
- **📋 Etap shablonlari** — ro'yxat (ikon, nom, meta: etap/xarajat/checklist/MC) + **➕ Yangi**.
  - Tahrir/Yangi → **shablon muharriri** sheet (nom + etaplar akkordeoni: nom/emoji/rang/
    xarajat/izoh/checklist/MC toggle, tartib o'zgartirish) → `template.save {id, name, items[]}`.
  - Tizim shabloni (`is_default`) tahrirlanmaydi. O'chirish → `template.delete {id}`.
- **🔒 Parolni o'zgartirish** — hozirgi/yangi/takror → `settings.password {current, new}`.
- **🔴 Xavfli zona** — akkaunt o'chirish (inline ikki qavat: parol + "OCHIRISH" yozish) →
  `settings.delete_account {password}` → `/mini/logout/`.

---

## 13. Tarif — `#/tarif`
**WS:** `page.tarif` → `{plans[], current}` (backend hali bo'lmasligi mumkin → "Tez orada")
- **Joriy tarif** karta (👑, amal muddati).
- **Mavjud tariflar** — narx (so'm), davr, funksiya chiplari (✓), **Tanlash/Yangilash** tugma.
  - Tanlash → `RcPay.buy('plan_purchase', planId, label)` (to'lov oqimi, quyida 15).
- **Feature-gate (`Features`):** funksiya ro'yxati `__USER_DATA__.features`. Yo'q bo'lsa
  hammasi ochiq. `Features.gate(key)` — ruxsat yo'q bo'lsa "🔒 upgrade" sheet ochib false.

---

## 14. Tanga hamyoni — `#/tanga`
**WS:** `page.tanga` → `{balance/coins, packs[], ledger[]}` (bo'lmasa "Tez orada", balans baribir)
- **Balans hero** — 🪙 katta raqam (`Wallet.balance`).
- **Tanga paketlari** — nom, tanga soni (+bonus chip), narx (so'm), **Sotib olish**
  → `RcPay.buy('coin_topup', packId, label)`.
- **Tarix** — ledger (±tanga, sabab, sana).
- `window.Wallet.set(n)` — balansni yangilaydi (topbar pill + karta). `window.Coins.need(...)`
  — AI "tanga yetarli emas" upsell sheet.

---

## 15. To'lov oqimi (RcPay — ekran emas, helper)
`RcPay.buy(purpose, targetId, label)`:
1. Provayder tanlash sheet: **Payme / Click / Octobank / Multicard**.
2. → `RcPay.start(provider, purpose, target_id)` → `pay.start` → `checkout_url`:
   - Sandbox (`/mini/pay/sandbox/`) → tasdiq sheet → `pay.sandbox_confirm {payment_id}`
     → Toast + `Wallet.set(balance)` + CoinBurst + sahifa reload.
   - Real provayder → `window.location = checkout_url` (Android: Custom Tabs / WebView).
3. Ixtiyoriy `pay.status {payment_id}` polling (paid/failed).

---

## 16. Gemini Live — ovozli boshqaruv (RcGLive FAB)
🎙️ FAB (bo'lim `02` §7.4). Oqim:
1. `glive.start {page}` → `{token, model, system}` (tarif/tanga yetmasa upgrade xato).
2. Mikrofon (getUserMedia) → PCM16 16kHz → Gemini Live WSS (Google BidiGenerateContent).
3. Gemini javob audio (24kHz) ijro + **tool-call** → `RcActions.run(name, args)` → frontend amal.
   - **Amallar (`GEMINI_TOOLS` / `RcActions`):** `navigate {page}`, `open_order {order_id}`,
     `open_page {name}`, `complete_stage {stage_id}`, `check_item {stage_id, item_id}`,
     `add_stage`, `change_status`, `add_income`, `add_expense`, `go_back`, `current_context`.
   - Ya'ni foydalanuvchi ovoz bilan "buyurtmalarни och", "etap 5 ni tugat", "kirim qo'sh"
     deyishi mumkin → tegishli ekran/amal.
4. Barge-in (foydalanuvchi gapirsa ijro to'xtaydi). Holatlar: idle/connecting/listening/speaking.

**Android:** `WebSocket` (Gemini) + `AudioRecord` (16kHz PCM) + `AudioTrack` (24kHz ijro) +
tool-call → native navigatsiya/amal. Mikrofon ruxsati SHART. Ephemeral token backenddan.

---

## 17. Laylo AI — chat yordamchi (FAB)
🤖 FAB (`laylo-popup-fab`, accent gradient) → chat popup (matn + ovozli xabar + TTS tinglash).
AI yordamchi (savol-javob). Android: chat ekran/bottom-sheet + ovoz yozib yuborish.

---

## 18. Umumiy Android eslatmalari
- **Miqdorlar butun** — `Math.ceil` (stock/qty). So'm formati `ru-RU` (`1 234 567`).
- **Kirill↔Lotin qidiruv** buyurtmalarda — Androidda ham normalizatsiya qiling.
- **Ruxsat modeli:** `is_owner` / `user_role` (viewer/worker/manager) / `can_add_expense` /
  `can_complete_stage` / `can_see_money` (`money_hidden`) / `can_revert_finance` — UI shu
  bo'yicha tugmalarni ko'rsatadi/yashiradi. Serverga ishoning, lekin UI'ni ham gate qiling.
- **Real-time:** WS broadcast → ochiq ekranni yangilash (buyurtma detali, ro'yxatlar).
- **Bottom-sheet forma pattern:** `RcSheet.open` + maydonlar + `getFormData` → `WS.send`.
  Android: `ModalBottomSheet` + state → WS.
- **XP/tanga geymifikatsiya:** etap tugatish/kunlik quest → XP+tanga (Toast.xp + CoinBurst).
- **Iframe ekranlar** (MebelCity buyurtma, Zamer editor, Panorama viewer) — hozircha WebView.
  Kelajakda native. Fayl yuklash/AI/VR/shartnoma — REST endpointlar (yuqorida belgilangan).
