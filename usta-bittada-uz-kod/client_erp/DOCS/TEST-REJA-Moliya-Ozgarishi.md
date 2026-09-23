# TEST REJA — Moliya o'zgarishini qanday tekshirish

> Qo'llanma: [[TZ-Shartnoma-Foyda-Jamoa-Moliya.md]] joriy qilingandan keyin.
> Sana: 2026-08-03 | Har bosqich alohida test qilinadi, hammasi birdan EMAS.

---

## ⚠️ 0. ASOSIY QOIDA — avval SNAPSHOT, keyin deploy

**Moliya o'zgarishida eng katta xato — "ko'rinishi to'g'ri" deb ishonish.**
Raqam to'g'ri ko'rinishi mumkin, lekin boshqa foydalanuvchida buzilgan bo'ladi.

Shuning uchun **deploy qilishdan OLDIN** barcha 73 akkauntning asosiy raqamlari
faylga yozib olinadi. Deploy'dan keyin qayta o'lchanadi va **farq jadvali**
chiqariladi. **Kutilmagan farq = bug.**

```
Deploy OLDIDAN:   snapshot_before.json   (73 akkaunt × 6 ko'rsatkich)
Deploy KEYIN:     snapshot_after.json
Solishtirish:     faqat KUTILGAN farqlar bo'lishi kerak
```

Kutilgan farq (0-bosqichda): faqat `artom_cl` va `ibrohim_cl` Balansi
kamayadi (arvoh pul olib tashlanadi). **Boshqa 71 akkauntda 0 farq bo'lishi
SHART.** Agar boshqasida ham o'zgarsa — darhol to'xtatish.

Snapshot skriptini men tayyorlab beraman — siz faqat "snapshot ol" desangiz
kifoya.

---

## 1. QAYERDA TEST QILINADI

| | Akkaunt | Nima uchun |
|---|---|---|
| ✅ **Asosiy test** | `tg_1586130864` (id=56) | Test akkaunt. Unda **6 ta shartnomasiz topshirilgan zakaz** bor (#230–235) — grandfathering uchun ideal |
| ✅ **Ikkinchi test** | Yangi ochilgan test akkaunt | Toza holat — yangi oqimni tekshirish |
| ⚠️ **Ehtiyot bilan** | `artom_cl`, `ibrohim_cl` | Arvoh pul shularda. Faqat **o'qish** testlari |
| 🔴 **TEGILMASIN** | `bigone_cl2` va real mijozlar | Haqiqiy pul. Faqat snapshot solishtirish |

---

## 2. TESTLAR — bosqich bo'yicha

### 🔹 0-BOSQICH: Arvoh pul tuzatilishi (H8)

**Nima o'zgaradi:** ulashilgan zakazdan "hali yechilmagan ulush" endi
Balans/Kassa/Kirimga qo'shilmaydi, alohida "💰 Kutilayotgan foyda" kartasida
ko'rsatiladi.

| # | Qadam | Kutilgan natija | ❌ Bug belgisi |
|---|---|---|---|
| 0.1 | `ibrohim_cl` bilan kiring → Moliya | Balans **kamaydi** (arvoh olib tashlandi) | O'zgarmasa — tuzatish ishlamagan |
| 0.2 | Shu sahifada "💰 Kutilayotgan foyda" kartasi | Yangi karta paydo bo'ldi, ichida kamaygan summa | Karta yo'q → pul "yo'qoldi" deb ko'rinadi |
| 0.3 | **Matematik tekshiruv:** eski Balans = yangi Balans + Kutilayotgan foyda | Aynan teng | Teng emas → hisob buzilgan |
| 0.4 | "Pul yechish" bosing, Balansdagi summani kiriting | **Qabul qiladi** (ilgari "Balans yetarli emas" derdi) | Rad etsa — UI↔backend hali zid |
| 0.5 | Boshqa 71 akkauntdan 3 tasini oching | Raqamlar **umuman o'zgarmagan** | O'zgargan bo'lsa — DARHOL TO'XTATISH |

**Qo'shimcha:** `handle_finance_create` teshigi yopilgan bo'lishi kerak —
Moliya sahifasidan `order_id` bilan shartnomadan ortiq kirim qo'shib
ko'ring → **rad etilishi shart**.

---

### 🔹 1-BOSQICH: Idempotentlik va poydevor (H1–H5)

**Eng muhim test — "ikki marta bosish" testi.**

| # | Qadam | Kutilgan natija | ❌ Bug belgisi |
|---|---|---|---|
| 1.1 | Test zakazda "Foyda yechish" → tugmani **tez 3 marta** bosing | Faqat **1 ta** yozuv yaratiladi. Tugma birinchi bosishda **o'chadi (disabled)** | 2–3 ta yozuv → idempotentlik ishlamayapti |
| 1.2 | Yechishdan keyin Moliya → Tranzaksiyalar | Chiqim **1 marta** ko'rinadi | Takror → soxta kamayish |
| 1.3 | Internetni uzib (Wi-Fi o'chirib) yechishga urining, keyin yoqib qayta uring | Faqat 1 ta yozuv | 2 ta → reconnect-queue muammosi |
| 1.4 | Yechish oynasida ism maydoni | Endi **erkin matn emas**, ro'yxatdan tanlanadi | Erkin matn qolsa — H1 bajarilmagan |
| 1.5 | Ro'yxatda faqat akkаunti bor a'zolar + ustalar ro'yxati | Boshqa ism yozib bo'lmaydi | — |
| 1.6 | Sozlamalar → ism o'zgartirishga urinish (2-marta) | **Rad etiladi** (bir marta gate) | Ruxsat bersa — fraud vektori ochiq |

**Chuqur tekshiruv (men bajaraman):** bazada `client_request_id` unique
constraint bormi, `transaction.atomic` qo'shilganmi.

---

### 🔹 2-BOSQICH: Formula (shartnoma-asosli foyda)

**Bu eng ko'p raqam o'zgaradigan bosqich — snapshot solishtirish MAJBURIY.**

#### A) Grandfathering testi (eski zakazlar buzilmasligi)

| # | Qadam | Kutilgan natija | ❌ Bug belgisi |
|---|---|---|---|
| 2.1 | `tg_1586130864` → Moliya → Sof foyda | 6 ta eski zakaz **avvalgi foydasi bilan** turibdi | Manfiy chiqsa — grandfathering ishlamagan 🔴 |
| 2.2 | Har qatorda belgi | `⚠ eski usul (shartnomasiz)` | Belgi yo'q → foydalanuvchi farqni bilmaydi |
| 2.3 | Analitika → Oylik foyda grafigi | Eski oylar **o'zgarmagan** | O'zgarsa — tarix buzilgan |

#### B) Yangi oqim testi (to'liq sikl)

| # | Qadam | Kutilgan natija |
|---|---|---|
| 2.4 | Yangi buyurtma yaratish, shablonni **tanlamasdan** saqlashga urinish | **Rad etiladi** — shablon majburiy |
| 2.5 | Shablon tanlab yaratish | Yaratildi, etaplar avtomatik qo'shildi |
| 2.6 | Kirim 10 000 000 qo'shish, shartnoma **kiritmasdan** | Kirim qabul qilindi |
| 2.7 | Statusni "Tayyor" → **"Topshirildi"** qilish | 🔴 **BLOKLANADI**: "Avval shartnoma summasini kiriting" |
| 2.8 | Shartnoma 15 000 000 kiritish | Saqlandi |
| 2.9 | Endi "Topshirildi" qilish | ✅ O'tdi |
| 2.10 | Chiqim 4 000 000 qo'shish |  |
| 2.11 | Moliya → Sof foyda | **11 000 000** (15M − 4M), Kirim 10M ga **qaramasdan** |
| 2.12 | Qatordagi belgi | `📄 shartnoma bo'yicha` |

#### C) Ortiqcha to'lov testi (siz tanlagan qoida)

| # | Qadam | Kutilgan natija | ❌ Bug belgisi |
|---|---|---|---|
| 2.13 | Shu zakazga yana 8 000 000 kirim (jami 18M > shartnoma 15M) | Qabul qilinadi yoki bloklanadi (qaror bo'yicha) | — |
| 2.14 | Sof foyda | Hali ham **11 000 000** (shartnoma asos) | 14M chiqsa — qoida buzilgan |
| 2.15 | **"Qo'shimcha daromad"** satri | **3 000 000** alohida ko'rinadi | Yo'q bo'lsa — pul "yo'qolgan" ko'rinadi 🔴 |
| 2.16 | Balans | 18M − 4M = **14 000 000** (real pul, o'zgarmagan) | 11M chiqsa — naqd nazorati buzilgan 🔴 |

#### D) Izchillik testi (eng muhim — 34 nuqta)

**Bitta zakazning foydasi 6 xil joyda BIR XIL bo'lishi shart:**

| # | Qayerda | Kutilgan |
|---|---|---|
| 2.17 | Buyurtma detali → Moliya tabi → "Foyda" kartasi | 11 000 000 |
| 2.18 | Moliya sahifasi → Sof foyda → shu zakaz qatori | 11 000 000 |
| 2.19 | Analitika → oylik foyda grafigi (shu oy) | 11 000 000 |
| 2.20 | Bosh sahifa → "Foyda" kartasi | 11 000 000 |
| 2.21 | Ustalar foydasi → "Jami taqsimlangan" | 11 000 000 |
| 2.22 | Buyurtma → Jamoa tabi → "Foyda taqsimot" | 11 000 000 |

🔴 **Bittasi ham farq qilsa — deploy to'xtatiladi.** Bu aynan auditda topilgan
34 nuqta muammosi.

#### E) Ovozli AI testi

| # | Qadam | Kutilgan |
|---|---|---|
| 2.23 | ✨ AI tugmasi → "bu zakazning foydasi qancha?" | **11 000 000** aytadi |
| 2.24 | Analitika → "✨ Tahlil" (50 tanga) | Xulosada raqamlar **o'zaro zid emas** |

---

### 🔹 3-BOSQICH: Jamoa moliyasi (F8 + reversal + rozilik)

**Eng xavfli bosqich — 2 ta akkaunt kerak** (masalan test akkaunt + ikkinchi
test akkaunt, real odam EMAS).

#### A) Asosiy oqim

| # | Qadam | Kutilgan natija |
|---|---|---|
| 3.1 | A-akkauntda zakaz yarating, B-akkauntni jamoaga qo'shing | Taklif keldi, B qabul qildi |
| 3.2 | Zakazni B'ga ulashing (`pul ko'rinadi` yoqilgan) | B zakazni ko'radi |
| 3.3 | Foyda taqsimlash: **"🧑‍💼 Men" 60%**, B 40% | Jami 100%, saqlandi |
| 3.4 | **B-akkauntda:** Bosh sahifa | "💰 Kutilayotgan foyda" kartasi paydo bo'ldi |
| 3.5 | **B-akkauntda:** Balans | **O'zgarmagan** (pul hali kelmagan) 🔴 muhim |
| 3.6 | A-akkauntda "Pul yechish" → tasdiqlash | Yozuv yaratildi |
| 3.7 | **B-akkauntga Telegram xabar** | "✅ Oldim / ❌ Olmadim" tugmalari |
| 3.8 | B **"✅ Oldim"** bosadi | B Moliya → **Kirim +40% summa** paydo bo'ldi |
| 3.9 | B Balansi | Endi oshdi (real pul) |
| 3.10 | B "Kutilayotgan foyda" | Endi 0 (real pulga aylandi) |

#### B) Rad etish testi

| # | Qadam | Kutilgan natija |
|---|---|---|
| 3.11 | Yangi yechish → B **"❌ Olmadim"** bosadi | B Kirimiga **hech narsa yozilmaydi** |
| 3.12 | A-akkauntda ko'rinish | "Tasdiqlanmagan" holati |

#### C) Bekor qilish (reversal) testi

| # | Qadam | Kutilgan natija |
|---|---|---|
| 3.13 | A: xato yechilgan yozuvni "Bekor qilish" | Izoh so'raydi (majburiy) |
| 3.14 | Tasdiqlash | A kassasiga pul **qaytdi**, B Kirimidan **teskari yozuv** |
| 3.15 | B'ga Telegram xabar | "Ulush bekor qilindi" |
| 3.16 | Audit: eski yozuv | **O'chirilmagan**, `status='reversed'` bo'lgan 🔴 muhim |
| 3.17 | Agar B pulni allaqachon yechgan bo'lsa → bekor qilishga urinish | **Bloklanadi**: "a'zo bilan kelishing" |

#### D) Fraud testi (xavfsizlik)

| # | Qadam | Kutilgan natija |
|---|---|---|
| 3.18 | B-akkauntda ismni boshqa ustanikiga o'zgartirishga urinish | **Rad etiladi** (H2 gate) |
| 3.19 | Yechish oynasida ism ro'yxatdan tanlangan | Erkin matn kiritib bo'lmaydi |
| 3.20 | Bazada `WithdrawalLine.user` FK | **To'ldirilgan** (kimga tushgani qayd etilgan) |

---

## 3. MATEMATIK TEKSHIRUV (reconciliation)

Har bosqichdan keyin **3 ta tenglik** tekshiriladi. Bularni men skript bilan
bajaraman, siz faqat natijani ko'rasiz:

| # | Tenglik | Buzilsa nima degani |
|---|---|---|
| R1 | `Σ(barcha akkauntlar Balansi)` = `Σ(real ClientFinanceRecord)` | Arvoh pul bor |
| R2 | `Σ(ega chiqimi)` = `Σ(a'zolar kirimi)` (profit_share bo'yicha) | Pul yo'qolgan yoki ikkilangan |
| R3 | `Σ(ustalar ulushi)` + `taqsimlanmagan` = `zakaz foydasi` | Taqsimot hisobi buzuq |

---

## 4. 🚨 QACHON DARHOL TO'XTATISH (rollback signali)

Quyidagilardan **bittasi** bo'lsa ham — deploy orqaga qaytariladi:

1. Snapshot solishtirishda **kutilmagan akkauntda** raqam o'zgargan
2. Biror zakazda foyda **manfiy** chiqdi (grandfathering ishlamagan)
3. Bitta zakaz foydasi **ikki sahifada har xil**
4. "Pul yechish" **ikki marta** yozildi
5. R1/R2/R3 tenglikларidan biri buzildi
6. Foydalanuvchi "pulim yo'qoldi" deb murojaat qildi

**Rollback rejasi:** har bosqich alohida deploy qilinadi, shuning uchun
faqat oxirgi bosqich qaytariladi (hammasi emas).

---

## 5. TEST TARTIBI (jadval)

| Kun | Bosqich | Kim tekshiradi |
|---|---|---|
| 1 | Snapshot olish (deploy'siz) | Men (skript) |
| 2 | 0-bosqich deploy + testlar 0.1–0.5 | Siz (UI) + men (R1) |
| 3 | Kuzatuv kuni — hech narsa qilinmaydi | — |
| 4 | 1-bosqich deploy + testlar 1.1–1.6 | Siz + men |
| 5–6 | 2-bosqich deploy + testlar 2.1–2.24 | Siz (eng ko'p test) |
| 7 | Kuzatuv + snapshot solishtirish | Men |
| 8+ | 3-bosqich — faqat 2 ta test akkauntda, 1 hafta | Siz + men |
| — | F8 real foydalanuvchilarga — **feature flag bilan asta** | Men |

---

## 6. Nima men bajaraman, nima siz

| Men (avtomatik) | Siz (qo'lda, brauzerda) |
|---|---|
| Snapshot olish va solishtirish | UI testlari (2-bo'lim jadvallar) |
| R1/R2/R3 matematik tekshiruv | "Ikki marta bosish" testi |
| Bazada constraint/FK borligini tekshirish | Telegram tasdiq oqimi |
| Har deploy'dan keyin log tekshirish | Izchillik testi (6 sahifa bir xilmi) |
| Rollback (kerak bo'lsa) | "Pulim to'g'rimi?" — yakuniy qaror |
