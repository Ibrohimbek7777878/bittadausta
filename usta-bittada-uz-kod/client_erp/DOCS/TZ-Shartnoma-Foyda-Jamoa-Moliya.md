# TZ — Shartnoma-asosli Foyda va Mukammal Jamoa Moliyasi

> Versiya: **2.0 (XAVF AUDITI BILAN)** | Sana: 2026-08-03 | Loyiha: Bittada Usta (client_erp)
> Holat: 🟢 **BARCHA 73 FAOL AKKAUNTGA JORIY QILINDI** (2026-08-04, 2-urinish).
> 1-urinish order#132'da manfiy foydaga olib kelib rollback qilingan edi
> (§0.9) — xavfsizlik to'ri (`contract_profit`ga auto-fallback) qo'shilib,
> barcha 67ta topshirilgan buyurtma qayta tekshirilib, 0 ta yangi
> manfiy-regressiya bilan qayta joriy qilindi. Real pul (Balans/Kirim/
> Chiqim/Kassa) 73 akkauntning HECH birida o'zgarmadi — faqat "Sof foyda"
> displeyi (kontrakt-asosli) ba'zi akkauntlarda to'g'irlandi. F8 (cross-
> akkaunt real o'tkazma) hali qolganicha (§0.4-B/C/E xavflari yopilmagan).
> Holat jadvali — 0.8-bo'limda.

## 0.10 — F8.2 (2026-08-04): Bildirishnoma tuzatildi + F9-b (oy-oxiri eslatma, PUL O'TKAZMAYDI)

**F8.2 — bildirishnoma/real-kirim mos kelmasligi tuzatildi:** `handle_profit_withdraw`da avval bildirishnoma (`_notify`) `ClientTeamMember` nom-mosligidan, real kirim esa `ClientOrderPermission` nom-mosligidan (`_matched_user`) MUSTAQIL tuzilardi — ikkalasi turli natija berishi mumkin edi (kimdir xabar olib pul olmagan, kimdir pul olib xabar olmagan). Endi bildirishnoma FAQAT haqiqatda `_matched_user`ga kirim yaratilganda, xuddi shu joyda yig'iladi — ikkalasi HAR DOIM mos keladi. Yangi `notify_team_share_received()` — foiz + summani ko'rsatadi ("Ulushingiz: 35% · 6 769 700 so'm").

**F9-b — oy-oxiri eslatma (foydalanuvchi so'rovi bilan):** foydalanuvchi "tizim o'zi avtomatik yechib yuborsin" deb so'radi — H6 (bekor qilish) hali yo'qligi sababli PUL HARAKATINI avtomatlashtirish rad etildi, o'rniga xavfsiz muqobil tanlandi: yangi `run_month_end_profit_reminders` (`--loop`, `bittada-usta-month-end-reminders.service`, soatiga bir tekshiradi) — oyning oxirgi 3 kunida, agar egada shu oy topshirilgan, foyda taqsimoti bor, lekin to'liq yechilmagan buyurtma bo'lsa — bitta Telegram eslatma yuboradi ("N ta buyurtmada jami X so'm hali yechilmagan"). **Pul yozmaydi, faqat eslatadi.** Oyiga bir marta (`ClientMonthEndReminderLog` bilan idempotent). Jonli tekshiruv: `ibrohim_cl` uchun to'g'ri topdi (1 buyurtma, 19 342 000 — rasmda ko'rsatilgan "Ustalar foydasi" bilan mos).

---

## 0.9 — 🔴→🟢 72 akkauntga joriy qilish: 1-urinish muvaffaqiyatsiz (rollback), 2-urinish muvaffaqiyatli (2026-08-04)

**Nima bo'ldi:** foydalanuvchi so'rovi bilan `FINANCE_V2_USER_IDS`/
`TEAM_FINANCE_BETA_USER_IDS` barcha 73 faol akkauntga kengaytirildi, deploy
qilindi. Snapshot (`before_rollout72` → `after_rollout72`) **0 farq**
ko'rsatdi — LEKIN bu yolg'on xotirjamlik edi: `finance_snapshot`ning
`sof_foyda` maydoni O'ZINING mustaqil eski-formula hisobidan foydalanadi,
LIVE `contract_profit`ni chaqirmaydi — shuning uchun UI'da haqiqatda
ko'rinadigan raqam o'zgarishini ko'rsatmaydi.

**To'g'ridan-to'g'ri tekshiruv** (`order.profit` vs `order.contract_profit`,
barcha 67ta topshirilgan buyurtma bo'yicha) 12 ta buyurtmada farq topdi,
shulardan biri **KATASTROFIK**:

> `order #132` (owner=3, `bigone_cl2`, "Ulugbek aka"): eski foyda
> **4 848 000** → yangi **−19 852 000** (manfiy!). Bu TEST-REJA'ning o'z
> rollback-qoidasi ("foyda manfiy chiqsa — DARHOL TO'XTATISH").

**Ildiz sabab (yangi topilma, TZ §6-1 ochiq savolga aniq javob):**
`order.contract_amount` property avval TASDIQLANGAN `ClientContract`ni
qidiradi, topilsa — ustuvor, `zaklad_amount`dan KATTA-KICHIKLIGIga
qaramasdan. Order #132da `zaklad_amount=43 200 000`, lekin tasdiqlangan
`ClientContract.contract_amount=18 500 000` — ikkalasi HAM >0 bo'lgani
uchun **grandfathering ISHLAMAYDI** (u faqat `contract_amount=0` holatini
himoya qiladi). Natija: eskirgan/xato kichik shartnoma summasi ustuvor
bo'lib, real xarajatdan kam chiqib, foyda manfiyga tushib ketdi.

**Qabul qilingan chora:** `TEAM_FINANCE_BETA_USER_IDS`/`FINANCE_V2_USER_IDS`
darhol `{2, 82}`ga qaytarildi (bir necha daqiqa ichida, foydalanuvchiga
ko'rinishdan OLDIN topilib tuzatildi). `after_rollback` snapshot dastlabki
`before_session2` bilan **bit-bit bir xil** ekani tasdiqlandi.

**Keyingi urinishdan OLDIN majburiy tuzatish:**
1. `finance_snapshot`ga LIVE `order.contract_profit`ni ham yozish (haqiqiy
   ko'rinadigan raqamni solishtirish uchun, faqat mustaqil-formula emas).
2. TZ §6-1 savoliga qaror: `ClientContract` vs `zaklad_amount` — ESKI
   (ko'proq YAQINDA yangilangan) yoki KATTA qiymat ustuvor bo'lishi kerak,
   YOKI ikkalasi farq qilsa ogohlantirish chiqarilib qo'lda tasdiqlash
   so'ralsin.
3. Har akkauntda deploy'dan OLDIN xuddi shu to'g'ridan-to'g'ri
   `profit` vs `contract_profit` tekshiruvi (72 hisobda) o'tkazilib,
   MANFIY yoki katta farq chiqqan buyurtmalar oldindan qo'lda ko'rib
   chiqilsin (bu safar avtomatlashtiriladi).

### ✅ 2-urinish (2026-08-04, xuddi shu kuni) — muvaffaqiyatli

TZ §6-1 savolining "qat'iy qaror"i o'rniga **kodga xavfsizlik to'ri**
qo'shildi (buni butun akkaunt-darajasida qo'lda hal qilishdan ko'ra ancha
tezroq va xavfsizroq, chunki 6-savolga "to'g'ri" javob har bir aniq
buyurtma uchun boshqacha bo'lishi mumkin):

- **`models/order.py:contract_profit`**: agar yangi (shartnoma-asosli)
  formula MANFIYga tushib, eski (naqd) formula ≥0 bo'lsa — avtomatik ESKI
  formulaga qaytadi + `logger.warning(...)` yozadi (ko'rib chiqish uchun).
  Bu — TEST-REJA'ning o'z yozma qoidasini ("foyda manfiy chiqsa — bug
  belgisi") kod darajasida doimiy, avtomatik qoidaga aylantiradi.
- **`finance_snapshot`**: endi LIVE `order.contract_profit`ni ham yozadi
  (`sof_foyda_live`) va MANFIY buyurtmalarni "OLDIN"gi snapshot bilan
  solishtirib, faqat YANGI regressiyani "🔴 DARHOL TO'XTATING" deb
  belgilaydi — oldindan ma'lum (masalan #259 «Office», haqiqiy zarar
  keltirgan ish) holatlarni soxta signal sifatida ko'rsatmaydi.

**Natija (qayta tekshiruv, barcha 67 topshirilgan buyurtma):** 0 ta yangi
manfiy-regressiya. Deploy qilindi, snapshot (`before_rollout72_v2` →
`after_rollout72_v2`): faqat `sof_foyda_live` 8 akkauntda o'zgardi (kutilgan
— kontrakt-asosli formula endi to'g'ri hisoblanadi), **`income`/`expense`/
`withdrawal`/`balance`/`pending` — 73 akkauntning BIRIDA HAM o'zgarmadi**.
80ta buyurtma + 73 akkauntning dashboard/moliya sahifasi jonli
serializatsiyada 0 xatolik bilan tasdiqlandi.

---

## 0.8 — 🔧 Amalga oshirish holati (2026-08-04 yangilandi)

**Qamrov: FAQAT `ibrohim_cl` (id=82)** — `scope.py:FINANCE_V2_USER_IDS = {82}`.
Boshqa 72 akkauntda eski (naqd-asosli) formula o'zgarishsiz ishlayapti —
snapshot bilan har safar tasdiqlanadi (`manage.py finance_snapshot --diff`).

| Band | Holat | Izoh |
|---|---|---|
| H8 (arvoh pul) | ✅ Tayyor (2026-08-03) | `pending` endi Balans/Kirim/Kassadan chiqarilgan, alohida `pending_profit` |
| H8-b (shartnoma teshigi) | ✅ Tayyor (2026-08-03) | `handle_finance_create` endi shartnoma limitini tekshiradi (FINANCE_V2) |
| H2 (ism — bir marta) | ✅ Tayyor (2026-08-03) | `handle_onboarding_accept` gate |
| H3 (idempotentlik) | 🟡 Vaqtinchalik | 60s server-side to'siq + tugma disable. **`client_request_id` UUID + unique constraint hali yo'q** |
| H4 (atomic) | ✅ Tayyor (2026-08-03) | `handle_profit_withdraw` butunlay `transaction.atomic` ichida |
| F1 (shartnoma majburiy) | ✅ Tayyor (2026-08-03) | `delivered` gate + shablon majburiy (FINANCE_V2) |
| F2/F3 (formula, yagona manba) | ✅ Tayyor (2026-08-03) | `ClientOrder.contract_profit` — 6 joyning barchasi shunga yo'naltirilgan |
| Grandfathering + "Qo'shimcha daromad" | ✅ Tayyor (2026-08-03) | `uses_contract_profit`, `extra_income` property |
| F7 (Kutilayotgan foyda UI) | ✅ Tayyor (2026-08-03) | Dashboard kartasi (`rc-dashboard.js`) |
| F9 (foiz-o'zgartirish ogohlantirish) | ✅ Tayyor (2026-08-04) | `handle_profit_save` — oldingi yechimlar bo'lsa ogohlantiradi |
| F5 ("Men" egasi qatori) | ✅ Tayyor (2026-08-04) | `rc-order-detail.js` — statik, o'chirib bo'lmaydigan qator. **Global** (formulaga tegmaydi, hamma uchun) |
| F8.1 (Pul yechish tarixi UI) | ✅ Tayyor (2026-08-04) | Jamoa tabida "💸 Pul yechish tarixi" bo'limi |
| H1 (audit-trail FK) | 🟡 Qisman (2026-08-04) | `WithdrawalLine.user` FK qo'shildi, avtomatik to'ldiriladi (fuzzy-match, **global**). Lekin UI hali **erkin matn + datalist** — qat'iy `<select>` emas |
| H5 (reversal FK bog'lovchi) | ❌ Yo'q | F8 income yozuvi bilan WithdrawalLine orasida bog'lovchi FK yo'q — avtomatik teskari yozuv hali imkonsiz |
| H6 (bekor qilish/reversal) | ❌ Yo'q | **Eng yuqori xavf** — real pulni qaytarish logikasi. Alohida diqqat bilan qilinishi kerak |
| H7 (a'zo roziligi, Telegram ikki bosqich) | ❌ Yo'q | Hozir F8 income darhol yoziladi (`confirmed=True`), a'zo tasdiqlashi so'ralmaydi. Telegram bot oqimi kerak |
| F4 (Tugallangan shartnomalar hisoboti) | ❌ Yo'q | Yangi sahifa/WS action hali yozilmagan |
| H9 (feature flag + reconciliation cron) | 🟡 Qisman | Feature-flag bor (`FINANCE_V2_USER_IDS`), lekin kunlik avtomatik reconciliation cron hali yo'q — qo'lda `finance_snapshot` bilan tekshirilmoqda |

**Nega H6/H7/F4 hali qilinmagan:** bular eng yuqori murakkablik/xavf
(real pulni qaytarish, yangi Telegram bot oqimi, yangi hisobot sahifasi) —
avtomatik test yo'q muhitda shoshib yozish real moliyaviy xato xavfini
oshiradi. Tavsiya: keyingi navbatda H5→H6 (reversal poydevori), keyin H7,
F4 oxirida (hisobot, moliyaviy xavf yo'q).

---

# 0. 🔴 XAVF AUDITI — MAJBURIY O'QISH

**Savol:** «Bu TZ qo'llansa umumiy moliyaga ziyon yetmaydimi?»
**Javob:** Hozirgi ko'rinishida — **HA, jiddiy ziyon yetadi.** Quyida raqamlar
va kod-dalillar. Barchasi jonli `tenant_mebelcity` bazasi va kod bo'yicha
tekshirilgan (nazariy emas).

## 0.1 — ⚠️ ENG MUHIM: bug HOZIR productionda MAVJUD (TZ'gacha)

`client_erp/services/scope.py` faylining o'z sarlavhasidagi QAT'IY QOIDA:

> ❌ **ISHLATILMAYDI (fizik pul):** • Kassa bloki (oy boshi/oxiri) • **Balans** • **Kirim/chiqim jami**
> SABAB: ulashilgan zakazning puli BOSHQA odamning kassasida. Uni balansga
> qo'shsak — **kassada bo'lmagan pul ko'rinadi va butun moliya buziladi.**

**Lekin `serializers.py` aynan shu taqiqni buzayapti** (tekshirildi):

| Fayl:qator | Kod | Buzilgan qoida |
|---|---|---|
| `serializers.py:798-799` | `income = income + _pending_period` | ❌ Kirim jami |
| `serializers.py:822-823` | `all_income = all_income + _pending_all` | ❌ |
| `serializers.py:923` | `'balance': all_income − all_expense − all_withdrawal` | ❌ **Balans** |
| `serializers.py:866-869` | `opening = base + pend_before` → `closing` | ❌ **Kassa bloki** |
| `serializers.py:620-623` | Dashboard `total_income += _pending_total` | ❌ |

**Natija — «ARVOH PUL»:** bitta ulashilgan zakazda pul EGASINING kassasida
turadi, lekin A'ZONING Balansida ham ko'rinadi. Tizim bo'yicha jami
egasi(16 820 000) + a'zo(5 887 000) = **22 707 000**, haqiqiy naqd esa
**16 820 000**. Farq **5 887 000 so'm — hech kim to'lamagan pul**.

Hozir bu faqat 2 ta beta-akkauntda (`TEAM_FINANCE_BETA_USER_IDS = {2, 82}` —
`artom_cl`, `ibrohim_cl`). **TZ'ning F8 bandi shu cheklovni olib tashlaydi →
bug 73 ta akkauntga tarqaladi** (144 ta foyda-ulush yozuvi × pending).

> 📌 **Bu TZ'dan mustaqil ravishda, DARHOL tuzatilishi kerak (H8).**

## 0.2 — Formula o'zgarishining raqamli ta'siri (jonli baza, 67 topshirilgan zakaz)

| Ssenariy | Jami foyda | Manfiy zakazlar |
|---|---|---|
| Hozirgi (eski) usul | 293 441 539 | 0 |
| 🔴 Yangi usul, **himoyasiz** | 135 291 539 | **14 ta** |
| ✅ Yangi usul, **grandfathering bilan** | 298 291 539 | 1 ta |

- **Himoyasiz: −158 150 000 (−54%)** — barcha foydalanuvchining foyda hisoboti
  yarmiga tushadi, 14 zakaz «zarar keltirgan» bo'lib ko'rinadi. **FALOKAT.**
- **Grandfathering bilan: +4 850 000 (+1.7%)** — foyda hatto biroz oshadi
  (chunki ba'zi zakazlarda shartnoma real kirimdan katta — IFRS bo'yicha to'g'ri).
- ⇒ **Grandfathering (2-bo'limdagi qoida) — shart emas, HAYOTIY ZARURAT.**

**Grandfathering'dan keyin ham qoladigan 2 muammo:**

1. **`artom_cl` real −13 350 000 yo'qotadi.** «Faqat shartnoma» qoidasi tufayli
   shartnomadan ortiq kelgan pul foydadan chiqadi:

   | Zakaz | Ega | Shartnoma | Real kirim | Farq |
   |---|---|---|---|---|
   | #179 «Test» | artom_cl | 48 900 000 | 61 500 000 | −12 600 000 |
   | #90 «Oozod aka mahhala» | bigone_cl2 | 4 500 000 | 7 605 000 | −3 105 000 |
   | #253 «Rustam aka» | artom_cl | 25 000 000 | 25 750 000 | −750 000 |
   | #137 «Shaxnoza opa» | bigone_cl2 | 2 100 000 | 2 400 000 | −300 000 |

   ⇒ **Majburiy yechim:** ortiqcha kirim yo'qotilmasin, alohida
   **«Qo'shimcha daromad»** satrida ko'rsatilsin (F2'ga majburiy qo'shiladi).

2. **`#259 «Office»`** (tg_5914822661): shartnoma 600 000, xarajat 2 862 222 →
   **−2 262 222**. Migratsiyadan oldin qo'lda tekshirilsin.

**Qo'shimcha teshik (tekshirildi):** `handle_order_income` (buyurtma detalidagi
«Kirim») shartnomadan oshishni **bloklaydi**, lekin `handle_finance_create`
(Moliya sahifasidagi «Kirim», `order_id` bilan) — **bloklamaydi**. Yuqoridagi
4 ta zakaz shu teshik orqali oshib ketgan. **Teshik yopilmasa «faqat shartnoma»
qoidasi baribir ishlamaydi.**

## 0.3 — TZ 3 ta joyni aytgan, aslida 34 ta

Audit `client_erp` bo'ylab foyda hisoblanadigan **21 backend + 13 frontend**
nuqta topdi. TZ v1.0 da faqat 3 tasi sanalgan edi.

### 🔴 KRITIK (real pul yoki matematik ziddiyat)

| # | Joy | Nima buziladi |
|---|---|---|
| **K1** | `rc-order-detail.js:579-636` `withdrawProfit()` **+ v1 `pages/order-detail.js:1047-1078`** | Ustaga to'lanadigan **haqiqiy summa JS'da tug'iladi**. Tuzatilmasa: ekranda 23 mln, to'lanadi 8 mln. **v1 dizayn hali jonli** (`urls.py:128`) |
| **K2** | `consumers.py:3186,3203-3222` — `total_profit`/`amount` **brauzerdan keladi**, server qayta hisoblamaydi | JS'ning har qanday eski/o'zgartirilgan versiyasi bazaga ixtiyoriy summa yozadi |
| **K3** | `consumers.py:3481-3499` `_pf_lifetime_totals` | `calculated` yangi / `remaining` eski → panelda **matematik mumkin bo'lmagan** «Topdi 5M, Oldi 3M, Qoldiq −1.2M» |
| **K4** | `consumers.py:3193-3201` + `4164-4174` balans nazorati | Tizim **o'zi ko'rsatgan foydani o'zi rad etadi**: «23 mln bo'l» → *«Balans yetarli emas (mavjud: 8 mln)»*. **TZ'da bu savol umuman yo'q** |
| **K5** | `services/scope.py:174-211` `profit_claim_pending` | F8 buni 73 akkauntga yoyadi, lekin formulani yangilamaydi → panelda yangi, Balansda eski raqam |

### 🟠 YUQORI (sahifalar aro ziddiyat)

`serialize_dashboard.stats.profit` (bosh sahifa «Foyda») · `summary.profit` +
`totals.profit` (Analitika KPI ≠ o'z grafigi) · `orders_detail[].profit` →
**AI promptiga** (4 eski + 1 yangi ko'rsatkich → pulli, ishonilgan, **noto'g'ri
AI xulosasi**) · `serialize_order_full:206` + `ClientOrder.profit` property ·
`deliveries` bloki (**F3 mavjud hisobotni bilmay dublikat quradi**) ·
`undistributed` bloki (`Σulush + taqsimlanmagan ≠ zakaz foydasi`).

### ⚪ Ta'sir YO'Q (tasdiqlandi)
**Gamifikatsiya/XP/tanga** — hodisa-asosli, foyda summasiga bog'lanmagan.

## 0.4 — F8 (cross-akkaunt Kirim) — 5 xavfdan 3 tasi KRITIK

> 📌 **Muhim:** F8 **allaqachon kodda yozilgan** (`consumers.py:3228-3247`),
> faqat `TEAM_FINANCE_BETA_USER_IDS` bilan yopilgan. TZ uni «quradi» emas —
> **cheklovni ochadi**. Ya'ni quyidagi xavflar allaqachon 2 akkauntda tirik.

| Xavf | Daraja | Kod-dalil | Bir hodisada soxta pul |
|---|---|---|---|
| **A. Ikki marta hisoblash** | 🔴 KRITIK | `scope.py:166` aynan-ism (fuzzy YO'Q); `scope.py:206` `pending>0` klampi manfiy tuzatishni **o'chiradi** | 5 887 000 |
| **B. Idempotentlik YO'Q** | 🔴 KRITIK | `models/team.py:144` constraint yo'q · `consumers.py:3203` shartsiz `create()` · **`transaction.atomic` = 0 ta** (butun `consumers.py` da!) · `mini-erp.js:127` 15s timeout < Telegram 4×10s | **33 000 000 + 11 550 000** |
| **C. Qaytarib bo'lmaslik** | 🔴 KRITIK | Moliya yozuviga `is_deleted=True` qiladigan kod **umuman yo'q** · `finance.revert` faqat `bigone_cl2` uchun (`consumers.py:2051`) va `order` majburiy, F8 yozuvi esa `order=None` → **target qilib bo'lmaydi** | cheksiz (abadiy qoladi) |
| **D. Ism to'qnashuvi** | 🟠 YUQORI | `full_name` **unique emas**, bazada `dilshod` ×2 (id 31/35) · `consumers.py:3232` `order_by` yo'q + `break` → **nondeterministik** · **26% ismlar typo** (`gʻanisher`, `iibrohim`, `nrsulton`…) | 8 000 000 |
| **E. Arvoh pul** | 🔴 KRITIK | 0.1-bo'limga qarang + F8 income a'zoning yechish limitini oshiradi (`consumers.py:4168`) | 144 ProfitShare potensiali |

### 🚨 D — INSIDER FRAUD vektori (tasdiqlandi)

`handle_onboarding_accept` (`consumers.py:377-398`) da **«bir marta» gate YO'Q**
— istalgan foydalanuvchi istalgan paytda `WS.send('onboarding.accept',
{full_name:'...'})` yuborib **ismini o'zgartira oladi**.

| Qadam | Amal |
|---|---|
| 1 | `oybek aka` — bazadagi eng ko'p ProfitShare ismi (**36 ta**), akkauntga bog'lanmagan |
| 2 | Ganisher (akkaunti bor ishchi) zakazga `can_see_money=True` bilan ulangan (`ClientTeam.auto_can_see_money` **default=True**, bazada 37/101) |
| 3 | Konsoldan: `WS.send('onboarding.accept', {full_name:'Oybek aka'})` |
| 4 | Egasi odatdagidek yechadi → `name='Oybek aka'` mos keldi → **Ganisher balansiga +8 000 000** |
| 5 | Ganisher ismini qaytaradi. Haqiqiy Oybek aka naqd pulini baribir oladi |

**`ClientProfitWithdrawalLine` da `user` FK YO'Q** — kimga tushgani **bazada
umuman qayd etilmagan**. Hech kim sezmaydi.

---

# 0.5 — 🛡️ MAJBURIY HIMOYA CHORALARI (H1–H10)

Bular **kod yozishdan oldin** TZ'ga kiritilgan hisoblanadi.

| # | Chora | Yopadigan xavf |
|---|---|---|
| **H1** | **Ism-moslashtirishni butunlay tashlash** → `ClientOrderProfitShare.member` FK majburiy (hozir 144/144 NULL). Yechish oynasida erkin matn emas — `<select>` (user_id / person_id). `ClientProfitWithdrawalLine` ga **`user` FK** qo'shilsin | D, A |
| **H2** | `handle_onboarding_accept` ga **«bir marta» gate** (`if u.oferta_accepted: ism o'zgarmasin`) + ism o'zgarsa audit yozuvi. **`full_name` pul-mantig'ida umuman ishlatilmasin** | D |
| **H3** | **`client_request_id` (UUID) + `unique_together('order', client_request_id)`** + `get_or_create` + frontend tugma bloki | B |
| **H4** | **`transaction.atomic(using=db_alias)`** butun `_withdraw()` bloki uchun (hozir 0 ta!) + **Telegram bildirishnomasi `on_commit`ga chiqarilsin** (15s timeout sababi) | B |
| **H5** | F8 Kirim yozuviga **`source_line = FK(ClientProfitWithdrawalLine, unique=True)`** — takror DB darajasida imkonsiz, reversal avtomatlashadi | A, C, E |
| **H6** | **`profit.withdraw.reverse`** — F8 bilan **BIR PAKETDA** yozilsin. O'chirish emas — teskari yozuv (append-only), majburiy izoh, a'zoga Telegram xabar. A'zo pulni allaqachon yechgan bo'lsa — bloklansin | C |
| **H7** | **A'zoning roziligi (two-phase)**: `ClientProfitWithdrawalLine.confirmed` **allaqachon bor** (`team.py:155`), hozir so'zsiz `True`. Yangi oqim: a'zoga Telegram «✅ Oldim / ❌ Olmadim» → faqat tasdiqlangach `income` yoziladi | C, D, E |
| **H8** | 🔥 **ENG SHOSHILINCH — TZ'dan mustaqil:** `profit_claim_pending` ni **Balans/Kassa/Kirim'dan chiqarish** (`serializers.py:798,822,866,923,620`). Pending alohida `'pending_profit'` maydoni bo'lsin → UI'da alohida «💰 Kutilayotgan foyda» kartasi (F7 aynan shuni so'rayapti) | A, E — **hozirgi bug** |
| **H9** | **Bosqichma-bosqich**: BETA cheklov darhol olib tashlanmasin → feature flag, whitelist. **Kunlik reconciliation cron** (`Σ ega-withdrawal ↔ Σ a'zo-income`, farq bo'lsa 🔔). Migratsiyadan oldin **5 ta typo qo'lda tuzatilsin**, `dilshod_cl`/`dilshod_cl2` ajratilsin | hammasi |
| **H10** | `category='profit_share'` ni `EXPENSE_CATEGORIES` ga tiqmang (choices buziladi) — alohida `is_profit_share` bulean yoki `INCOME_CATEGORIES` | E.6 |

## 0.6 — Tavsiya etilgan KETMA-KETLIK (o'zgartirilgan)

```
0-BOSQICH (TZ'dan MUSTAQIL, darhol):
   H8 — arvoh pulni Balans/Kassa/Kirim'dan chiqarish  ← hozirgi bug
   handle_finance_create teshigini yopish (shartnoma limiti)

1-BOSQICH (poydevor, F8'dan OLDIN):
   H1 + H2 — member FK majburiy, full_name pul-mantig'idan uzilgan
   H3 + H4 + H5 — idempotentlik, atomic, bog'lovchi FK

2-BOSQICH (formula):
   ClientOrder.contract_profit — YAGONA property (grandfathering ichida)
   34 nuqtaning barchasi shunga yo'naltirilsin (inline formula TAQIQ)
   «Qo'shimcha daromad» satri (shartnomadan ortiq kirim yo'qolmasin)
   K4 savoliga javob olingach — balans nazorati qoidasi

3-BOSQICH (F8 + jamoa):
   H6 (reversal) + H7 (a'zo roziligi) — F8 bilan BIR PAKETDA
   H9 (feature flag + reconciliation cron)
   H10
```

## 0.7 — ❓ Javob kutilayotgan KRITIK savol (K4)

**Naqd hali kelmagan shartnoma-foydani ustalarga bo'lishga ruxsat berilsinmi?**

Misol: shartnoma 25 mln, mijoz 10 mln to'lagan, xarajat 2 mln → yangi formula
bo'yicha foyda **23 mln**, lekin kassada **8 mln**. Usta 35% (8 mln) so'rasa —
tizim hozir **rad etadi** («Balans yetarli emas»).

Variantlar: (a) faqat naqd bo'lgan qismini bo'lish (hozirgi xatti-harakat,
xavfsiz); (b) to'liq foydani bo'lishga ruxsat → kassa manfiyga tushadi;
(c) «kutilayotgan ulush» sifatida yozib qo'yish, pul kelgach avtomatik to'lash.

**Bu savolga javob berilmasa 2-bosqich boshlanmaydi.**

---

> Quyidagi 1–6 bo'limlar — TZ v1.0 ning asl matni. Ular yuqoridagi audit
> nuqtai nazaridan **to'ldirilishi shart** (ayniqsa F2 «3 joy» → 34 joy,
> F8 → H1–H10 himoyalari bilan).

---

## 0. Nima uchun bu TZ kerak (muammo)

Hozirgi holat (2026-08-03 gacha, kod tekshirildi — `client_erp/serializers.py`,
`client_erp/consumers.py`, `client_erp/models/team.py`, `client_erp/models/contract.py`):

1. **"Sof foyda"** (Moliya sahifasi, Analitika, Ustalar foydasi, oylik trend) —
   barchasi **real Kirim yozuvlaridan** (`ClientFinanceRecord.record_type='income'`)
   hisoblanadi. **Shartnoma summasi** (`ClientContract.contract_amount` /
   `ClientOrder.zaklad_amount`) hech qayerda foyda hisobiga ishtirok etmaydi —
   faqat "kelishilgan narx" sifatida ko'rsatiladi.
2. **Etap shabloni** buyurtma yaratishda ixtiyoriy (`rc-orders.js`: default
   "Shablonsiz") — majburiy emas.
3. **Foyda taqsimoti** (`ClientOrderProfitShare`) faqat ISM (matn maydoni) bo'yicha
   — real akkauntga (`ClientTeamMember`) bog'lanishi ixtiyoriy (`member` FK
   ko'pincha bo'sh).
4. **"Pul yechish"** (`handle_profit_withdraw`) — barcha xodimlar uchun ham
   faqat BUYURTMA EGASINING o'z kassasidan chiqim yoziladi
   (`ClientFinanceRecord(owner=self.user, record_type='withdrawal')`). Qabul
   qiluvchining (agar u ham tizim foydalanuvchisi bo'lsa) shaxsiy moliyasiga
   HECH NARSA yozilmaydi.
5. Shu bilan bir vaqtda — kodda `client_erp/services/scope.py` ichida **BETA
   rejim** allaqachon mavjud (`TEAM_FINANCE_BETA_USER_IDS = {2, 82}`,
   ya'ni faqat `artom_cl`/`ibrohim_cl`): ulashilgan zakazdan nom-mos ulush
   hisoblanib, "hali yechilmagan ulush" sifatida foydalanuvchining O'Z
   Kirim/Balans/Kassasiga real vaqtda qo'shiladi. **Bu TZ — aynan shu
   mexanizmni umumiy (barcha foydalanuvchilar uchun) productionga chiqarish
   va to'liq jamoa-moliya tizimiga aylantirish haqida.**

---

## 1. Xalqaro moliya standarti konteksti (nega bunday qilinadi)

Haqiqiy buxgalteriya standartlarida (IFRS/GAAP) bitta emas, **UCH XIL hisobot**
bir vaqtda yuritiladi va ular ATAYLAB bir-biriga teng emas:

| Standart hisobot | Bizdagi analogi | Asos |
|---|---|---|
| **Cash Flow Statement** (IAS 7) — "qo'lda hozir qancha pul bor" | Kirim / Chiqim / Kassa / **Balans** | Real pul harakati, kelishilgan narxdan qat'i nazar |
| **Income Statement / P&L** (IFRS 15 — Revenue Recognition) — "shu davrda qancha ISHLADIK" | **Sof foyda**, Ustalar foydasi, oylik trend | Daromad **kelishuv (shartnoma) bo'yicha**, ish yakunlangan (topshirilgan) paytda tan olinadi — pul hali to'liq kelmagan bo'lsa ham |
| **Balance Sheet** (qarz/debitorlik) | **Qarz (Debt)** tizimi | Mijoz hali to'lamagan, lekin ishlash bo'yicha "unga qarzdor" qismi |

Bizning buyurtmalarimiz — qisqa muddatli (kunlar/haftalar), mijozga moslashtirilgan
(alternativ ishlatilishi yo'q) buyum ishlab chiqarish shartnomalari. Bunday
qisqa-muddatli loyihalar uchun **"Completed-Contract" usuli** (ish TO'LIQ
tugagach — bizda "Topshirildi" holatida — butun shartnoma summasi bitta safar
daromad sifatida tan olinadi) xalqaro amaliyotda **to'liq qonuniy va eng oddiy**
yondashuv hisoblanadi (uzoq muddatli — oylab/yillab davom etadigan — qurilish
loyihalarida "Percentage-of-Completion" ustunroq, lekin qisqa muddatli ishlarda
ikkala usul deyarli bir xil natija beradi, shuning uchun sodda usul tanlanadi).

**Xulosa (qamrov bo'yicha qaror):** Kirim/Chiqim/Kassa/Balans — **O'ZGARMAYDI**,
real pul asosida qoladi (Cash Flow Statement roli). Faqat **Sof foyda** va undan
kelib chiqadigan barcha hisobotlar (Ustalar foydasi, oylik foyda trendi,
Tugallangan-shartnomalar hisoboti) — **shartnoma summasiga** o'tadi (Income
Statement roli). Bu ikkisi bir-biriga zid EMAS — bu xalqaro standartning o'zi
shunday tuzilgan (uch hisobot bir vaqtda, har xil asosda yuritiladi).

---

## 2. Qaror qilingan tamoyillar (jamlanma)

| # | Savol | Qaror |
|---|---|---|
| 1 | Shartnoma summasi kiritilmasa "Topshirildi"ga o'tish mumkinmi? | **YO'Q — bloklanadi.** Majburiy maydon. |
| 2 | Real Kirim shartnomadan oshsa nima bo'ladi? | **Har doim faqat Shartnoma summasi** ishlatiladi asosiy Sof foyda uchun. |
| 3 | Qamrov — Kirim ham o'zgarishi kerakmi? | **YO'Q, tor qamrov** — faqat Sof foyda va undan olingan hisobotlar (1-bo'limdagi standart asos bilan). |
| 4 | Cross-akkaunt Kirim kimlarga? | **Faqat ro'yxatdan o'tgan, akkaunti bor jamoa a'zolariga** (`ClientTeamMember`). |

### ⚠️ Muhim ziddiyat va yechimi (eski ma'lumotlar bilan)

2-qaror ("har doim faqat shartnoma") **eski, allaqachon topshirilgan
buyurtmalar** bilan to'qnashadi: masalan haqiqiy misolda ko'rilgan "oshxona
mebeli" buyurtmasi — shartnoma summasi **0** (hech qachon kiritilmagan), lekin
real Kirim **50 000 000** yozilgan va buyurtma allaqachon "Topshirildi".

Agar yangi formula (`Foyda = Shartnoma − Chiqim`) SHU YOZUVGA ham qo'llansa:
`0 − 30 658 000 = −30 658 000` — **mantiqsiz, manfiy foyda** chiqadi.

**Yechim — ikki qatlamli qoida (grandfathering):**
```
agar order.contract_amount kiritilgan (>0):
    Foyda = contract_amount − total_expense        # YANGI qoida
aks holda (eski, migratsiyadan oldingi yozuvlar):
    Foyda = total_income − total_expense           # ESKI qoida, o'zgarmaydi
    (hisobotda "⚠ shartnomasiz (eski usul)" belgisi bilan ko'rsatiladi)
```
Bu qoida FAQAT vaqtinchalik — 3-band (F1, majburiy shartnoma) ishga tushgach,
YANGI topshiriladigan buyurtmalarda `contract_amount` har doim >0 bo'ladi
(chunki topshirib bo'lmaydi), shuning uchun "eski qoida" filiali vaqt o'tishi
bilan faqat tarixiy yozuvlarga tegishli bo'lib qoladi. Bitta martalik
migratsiya skripti orqali eski topshirilgan buyurtmalarga backfill qilish ham
tavsiya etiladi (pastda F1.3).

---

## 3. Funksional talablar

### F1 — Shartnoma summasi majburiy (topshirish gate)

**Qayerda:** `RcOrderDetail.deliverOrder()` (frontend) + `order.update`
handler (backend, `status='delivered'` ga o'tishda).

**Qoida:** Buyurtma statusi `ready` dan `delivered` ga o'zgartirilmoqchi bo'lsa:
- Backend tekshiradi: `order.zaklad_amount` (yoki tasdiqlangan `ClientContract.
  contract_amount`) bo'sh/0 bo'lsa → `{'ok': False, 'error': "Avval shartnoma
  summasini kiriting (Moliya tabi → Shartnoma)"}`.
- Frontend: "Buyurtmani topshirish" tugmasi bosilganda, agar summa yo'q bo'lsa,
  darhol Shartnoma-sheet (`setZaklad()`) ochiladi ("Avval shartnoma summasini
  belgilang" izohi bilan) — foydalanuvchi qo'shimcha bosishga majbur bo'lmaydi.

**F1.1 — Qaysi summa "rasmiy shartnoma" hisoblanadi?**
Ikki manba bor: `ClientOrder.zaklad_amount` (tez, "Shartnoma" tugmasidan qo'lda
kiritiladi) va `ClientContract.contract_amount` (rasmiy, mijozga yuborilgan,
`confirmed` statusli hujjat). Qoida: agar tasdiqlangan (`status='confirmed'`)
`ClientContract` bo'lsa — o'sha ustuvor; bo'lmasa `zaklad_amount` ishlatiladi.
Ikkalasi ham bo'lmasa — topshirish bloklanadi.

**F1.2 — Etap shabloni ham majburiy (siz so'ragan qo'shimcha):**
`order.create` da `template_id` endi **majburiy** parametr bo'ladi
(`rc-orders.js` dagi "Shablonsiz" varianti olib tashlanadi). Sabab: barcha
kelgusi hisobotlar (F4, F5) bosqichlar/muddat izchilligiga tayanadi —
shablonsiz buyurtmada bosqich yo'q bo'lib, "Bajarilgan bosqichlar" statistikasi
va muddat-nazorati ishlamay qoladi.

**F1.3 — Eski (migratsiyadan oldingi) ma'lumotlar bilan ishlash:**
Bir martalik `manage.py` buyrug'i taklif etiladi:
`backfill_contract_amounts` — barcha `status='delivered'` va
`zaklad_amount` bo'sh/0 buyurtmalarga, `zaklad_amount = total_income` (o'sha
paytgacha yig'ilgan real kirim) qo'yib chiqadi, va bu yozuvlarga
`legacy_contract=True` bayrog'i (yangi BooleanField) qo'yiladi — hisobotlarda
"⚠ eski usul bilan hisoblangan" deb ko'rsatish uchun.

---

### F2 — Sof foyda formulasi yangilanishi

**O'zgaradigan kod nuqtalari (`client_erp/serializers.py`):**

1. `serialize_finance_page()` — "B. SOF FOYDA" bloki (`dq` querysetidagi
   `_full_p = _i - _e` qatori) → `_full_p = (order.contract_amount or _i) - _e`
   (grandfathering qoidasi bilan).
2. `serialize_analytics()` — `profit_monthly` hisoblovchi blok — xuddi shu
   formula bilan yangilanadi (hozir `_inc - _exp`, endi
   `contract_amount_or_fallback - _exp`).
3. `handle_team_profit_detail()` (Ustalar foydasi) — bugungi "buyurtma foydasi"
   hisoblovchi joy ham xuddi shu formulaga o'tadi (chunki taqsimot shu foydadan
   qilinadi).
4. **Tugallangan shartnomalar hisoboti** (F4, yangi) ham shu formuladan
   foydalanadi.

**Diqqat — Kirim/Kassa/Balans O'ZGARMAYDI** (2-bo'limdagi qamrov qarori
bo'yicha) — faqat yuqoridagi 3 joy o'zgaradi.

**UI o'zgarishi:** Moliya va Analitika sahifalarida "Sof foyda" qatorlari
yonida kichik belgi: `📄 shartnoma bo'yicha` (yangi usul) yoki
`⚠ eski usul (shartnomasiz)` (agar `legacy_contract=True`).

---

### F3 — Tugallangan shartnomalar hisoboti (yangi bo'lim)

Yangi WS action: `WS.send('page.contracts_report', {period})` →
`serialize_contracts_report()`.

Har bir topshirilgan buyurtma qatori:

| Ustun | Manba |
|---|---|
| Mijoz | `order.customer.full_name` |
| Shartnoma summasi | `order.contract_amount` (yoki `⚠ eski`) |
| Xarajat | `total_expense` |
| **Sof foyda** | `contract_amount − total_expense` |
| Foyda % (marja) | `foyda / shartnoma × 100` |
| Muddat holati | "vaqtida" / "N kun kech" (mavjud `days_late` mantiqi) |
| Topshirilgan sana | `delivered_at` |

Filtrlar: davr (mavjud `RcPeriod`), mijoz, "faqat kechikkanlar" toggle.
Pastda — jami qator: jami shartnoma, jami xarajat, jami sof foyda, o'rtacha
marja %.

---

### F4 — Oylik foyda trendida shartnoma-asosli foyda

`serialize_analytics()` dagi `profit_monthly` (Analitika sahifasi grafigi,
"Oylik sof foyda" bar-chart) — F2.2 formulasi bilan avtomatik to'g'irlanadi
(alohida kod o'zgarishi shart emas, F2 bajarilgach bu ham to'g'ri chiqadi).
Faqat grafik tooltip/izohiga "shartnoma bo'yicha hisoblangan" degan matn
qo'shiladi (foydalanuvchi tushunmovchiligini oldini olish uchun).

---

### F5 — Jamoa moliyasi: kim nima ko'radi (ko'rinish qoidalari)

Hozirgi mavjud mexanizm (`ClientOrderShare.visibility`,
`ClientOrderPermission.can_see_money`) asosida, quyidagi ANIQ jadval TZ
sifatida qat'iylashtiriladi (hozir qisman qoida bor, lekin bitta joyda
hujjatlashtirilmagan):

| Rol / visibility | Buyurtma umumiy ma'lumoti | Zakaz FOYDASI (jami) | O'z ulushi (%) va summasi | Boshqa a'zolarning ulushi | Kirim/Chiqim tafsiloti qo'sha oladimi |
|---|---|---|---|---|---|
| **Egasi (owner)** | ✅ hammasi | ✅ | ✅ | ✅ | ✅ |
| **Menejer (manager)** | ✅ | ✅ (agar `can_see_money`) | ✅ | ✅ | ✅ (agar `can_add_expense`) |
| **Ishchi, visibility=`full`** | ✅ | ✅ (agar `can_see_money`) | ✅ | ✅ | faqat `can_add_expense` bo'lsa |
| **Ishchi, visibility=`finance_hidden`** | ✅ | ❌ (zakaz umumiy foydasi YASHIRIN) | ✅ (faqat o'ziniki) | ❌ | faqat `can_add_expense` bo'lsa |
| **Ko'ruvchi (viewer)** | ✅ (faqat holat/bosqich) | ❌ | ❌ | ❌ | ❌ |

**Yangi qo'shiladigan ustun — "Kutilayotgan foyda" (F6 bilan bog'liq):** har bir
a'zo, agar ulushi bo'lsa, **hali yechilmagan** ulushini "kutilayotgan foyda"
sifatida o'z Dashboard/Jamoa sahifasida ko'radi (F7 bandiga qarang) — bu ham
yuqoridagi jadvaldagi "O'z ulushi" ustuniga bo'ysunadi (ya'ni finance_hidden
buyurtmada ham o'z ulushini ko'radi, faqat umumiy zakaz foydasini ko'rmaydi).

---

### F6 — Foyda taqsimlash modalida "O'zim" ulushi

Hozirgi holat (skrinshotdan ko'ringanidek): faqat jamoa a'zolari qatori bor
("Oybek aka", "Ganisher", "Rustam aka"), buyurtma egasi uchun alohida qator
yo'q — agar 3 tasi 100%ni to'liq olsa, egaga hech narsa qolmaydi (bu ba'zan
to'g'ri, ba'zan xato bo'lishi mumkin).

**Yangi UI:** "Foyda taqsimlash" oynasida yuqorida statik (o'chirib
bo'lmaydigan) qator: **"🧑‍💼 Men (buyurtma egasi)"** — foiz maydoni bilan
(default 0%, egasi o'zi kiritadi). Qoldiq % hisobi o'zgarmaydi (jami 100%
bo'lishi shart), faqat endi "Men" qatori ham shu 100% ichiga kiradi — shu bilan
"egasi tasodifan hech narsa olmay qolish" xatosi oldini oladi (majburiy emas,
lekin har doim ko'zga ko'rinadi, 0% qoldirilsa ham ongli tanlov bo'ladi).

---

### F7 — "Kutilayotgan foyda" ko'rsatkichi (jamoa a'zosi uchun)

Har bir jamoa a'zosi (agar shu buyurtmada `ClientOrderProfitShare` orqali
ulushi bo'lsa va u hali `ClientProfitWithdrawalLine` orqali yechilmagan bo'lsa)
o'z tomonida ko'radi:

- **Dashboard**da yangi karta/qator: "💰 Kutilayotgan foyda: N so'm (M ta
  buyurtmadan)" — bosilsa tafsilot (qaysi buyurtmadan qancha).
- **Jamoa sahifasi**da, agar foydalanuvchi biror jamoaning a'zosi bo'lsa —
  "Mening ulushlarim" degan yangi kichik bo'lim.

Bu — `services/scope.py` dagi mavjud `profit_claim_pending()` funksiyasining
UI'ga chiqarilgan versiyasi (hozir faqat Moliya sahifasining ichki hisobiga
kiradi, alohida ko'rinish yo'q).

---

### F8 — Pul yechishda cross-akkaunt Kirim yozuvi (asosiy o'zgarish)

**Hozirgi mexanizm** (`handle_profit_withdraw`) — har bir taqsimot qatori
uchun FAQAT `ClientFinanceRecord(owner=egasi, record_type='withdrawal')`
yaratadi.

**Yangi mexanizm:**

```
har bir taqsimot qatori (name, percent, amount) uchun:
    1. ClientFinanceRecord(owner=EGASI, record_type='withdrawal', amount=amount,
       order=order, recipient_name=name)   # O'ZGARMAYDI — egadan pul chiqishi
       real, har doim yoziladi.

    2. Agar `name` shu buyurtmaga bog'liq FAOL ClientTeamMember bilan mos
       kelsa (ism yoki username bo'yicha, `services/scope.py` dagi mavjud
       fuzzy-match mantig'i asosida):
           ClientFinanceRecord(owner=A'ZONING O'ZI, record_type='income',
               order=None, description=f"«{order.title}» buyurtmasidan
               foyda ulushi ({percent}%)", category='profit_share')
           # A'ZONING shaxsiy Kirim/Balansiga darhol qo'shiladi.

    Agar `name` hech qanday faol a'zoga mos kelmasa (oddiy nom-yozuv, akkaunti
    yo'q usta) — faqat 1-qadam bajariladi (hozirgidek, o'zgarishsiz).
```

Bu — `TEAM_FINANCE_BETA_USER_IDS` orqali faqat 2 ta test-akkauntda ishlayotgan
`profit_claim_*` funksiyalarining **umumiy productionga chiqarilgan, lekin
teskari yo'nalishdagi** (u yerda "hali yechilmagan"ni oldindan ko'rsatish edi,
bu yerda "yechilgach real yozib qo'yish") versiyasi. **BETA cheklovi olib
tashlanadi** — barcha foydalanuvchilar uchun ishlaydi.

**Yangi maydon:** `ClientFinanceRecord.category` ga `'profit_share'` qiymati
qo'shiladi (hisobot/filtrlashda "boshqa kimningdir buyurtmasidan tushgan
ulush" ekanini ajratish uchun).

**Jamoaviy ko'rinish (F8.1):** Buyurtma detali → Jamoa tab → yangi bo'lim
"💸 Pul yechish tarixi": kim, qachon, qancha oldi (mavjud
`ClientProfitWithdrawalLine` yozuvlaridan — bu ma'lumot allaqachon bazada bor,
faqat UI'ga chiqarilmagan).

---

### F9 — Nazorat / audit mexanizmi

Mavjud `ClientProfitWithdrawal` + `ClientProfitWithdrawalLine` modellari
ALLAQACHON to'liq audit-trail (kim, qachon, qancha % va summa) — bu hech
qachon o'zgartirilmaydi/o'chirilmaydi (append-only).

**Qo'shiladigan tekshiruv:** `handle_profit_save` (ulush foizini
o'zgartirish) — agar shu buyurtma bo'yicha **allaqachon pul yechilgan** bo'lsa
(`ClientProfitWithdrawal.objects.filter(order=order).exists()`), ogohlantirish
ko'rsatiladi: *"Bu buyurtmadan avval N marta pul yechilgan (jami X so'm).
Foizni o'zgartirish faqat KEYINGI yechishlarga ta'sir qiladi, avvalgi
yozuvlar o'zgarmaydi."* — bu shaffoflik uchun, xato tushunmovchilikni oldini
olish uchun kerak (foydalanuvchi "nega eski summalar o'zgarmadi" deb
so'ramasin).

---

## 4. Bosqichlar (implementatsiya ketma-ketligi)

| Faza | Ish | Qamrov |
|---|---|---|
| **F1** | Model: `legacy_contract` BooleanField, migratsiya skripti (backfill) | Model |
| **F2** | Order-delivery gate (shartnoma majburiy) + shablon majburiy | Backend+Frontend |
| **F3** | Sof foyda formulasi (3 joyda) yangilanishi + grandfathering | Backend |
| **F4** | Tugallangan shartnomalar hisoboti (yangi sahifa) | Backend+Frontend |
| **F5** | "Men" ulush qatori (Foyda taqsimlash modalida) | Frontend |
| **F6** | Cross-akkaunt Kirim yozuvi (Pul yechishda) + `category='profit_share'` | Backend |
| **F7** | "Kutilayotgan foyda" — Dashboard va Jamoa sahifasida | Backend+Frontend |
| **F8** | Pul yechish tarixi (Jamoa tab, yangi bo'lim) | Frontend |
| **F9** | Foiz-o'zgartirish ogohlantirishi | Backend+Frontend |

---

## 5. Tegishli fayllar (o'zgaradigan)

| Fayl | O'zgarish |
|---|---|
| `client_erp/models/order.py` | `legacy_contract` field |
| `client_erp/models/finance.py` | `category='profit_share'` qiymati |
| `client_erp/serializers.py` | `serialize_finance_page`, `serialize_analytics`, yangi `serialize_contracts_report` |
| `client_erp/consumers.py` | `handle_order_create` (shablon majburiy), `order.update`→delivered gate, `handle_profit_withdraw` (cross-akkaunt), `handle_profit_save` (ogohlantirish) |
| `client_erp/services/scope.py` | `profit_claim_*` — BETA cheklovi olib tashlanadi, umumiy qilinadi |
| `static/client_erp/js/redesign/rc-order-detail.js` | `deliverOrder()`, `_profitEdit()` ("Men" qatori) |
| `static/client_erp/js/redesign/rc-orders.js` | shablon dropdown majburiy qilish |
| `static/client_erp/js/redesign/rc-finance.js` | Sof foyda belgilar (📄/⚠) |
| `static/client_erp/js/redesign/rc-dashboard.js` | "Kutilayotgan foyda" kartasi |
| `static/client_erp/js/redesign/rc-misc.js` (RcTeam) | Pul yechish tarixi bo'limi, "Mening ulushlarim" |
| `manage.py management command` (yangi) | `backfill_contract_amounts` |

---

## 6. Ochiq savollar (hali hal qilinmagan, muhokama kerak)

1. **`ClientContract` (rasmiy, mijoz tasdiqlagan) vs `zaklad_amount` (qo'lda
   kiritilgan) — qaysi biri asosiy manba bo'lishi kerak, agar ikkalasi ham bor
   va FARQLI summada bo'lsa?**
2. **Shablon majburiy qilinganda — agar foydalanuvchida hali birorta ham
   shablon yo'q bo'lsa (yangi akkaunt), nima bo'ladi?** Taklif: tizim
   standart 1 ta "Umumiy" shablonni avtomatik yaratib beradi (birinchi marta).
3. **F8 (cross-akkaunt Kirim) — agar bir xil ism ikki xil jamoada/ikki xil
   akkauntda uchrasa (ism to'qnashuvi)?** Hozirgi fuzzy-match ism+username
   bo'yicha ishlaydi — buyurtmaga ULASHILGAN (`ClientOrderPermission`) real
   a'zolar ro'yxati bilan cheklab, xato-moslashishni oldini olish kerak.
4. **Backfill migratsiyasi qachon ishga tushiriladi va kimga ko'rinadi?**
   (test muhitida avval sinash tavsiya etiladi.)
