# MEBEL-CITY MIJOZ ILOVASI — GAMIFIKATSIYA TIZIMI
## To'liq Texnik Topshiriq (TZ) va Prompt

> Bu hujjat Mebel-City mijozlar uchun mobil/web ilovasi yaratish bo'yicha to'liq texnik topshiriqdir. Dasturchilarga yoki AI kod-generatsiya tizimiga (Cursor, v0, Claude Code, Lovable, Bolt va h.k.) to'g'ridan-to'g'ri berish mumkin. Ilova mijozlarni faol ushlab turish, ularni Mebel-City bilan doimiy bog'lash va xaridlarni rag'batlantirish uchun gamifikatsiya (o'yinlashtirish) mexanikasidan foydalanadi.

---

## 1. LOYIHA HAQIDA UMUMIY MA'LUMOT

**Kompaniya:** Mebel-City — O'zbekistonning Sirdaryo viloyati, Guliston shahrida joylashgan mebel ishlab chiqaruvchi korxona.

**Auditoriya:** Asosan **ustalar** (mebel yasovchilar) — ular Mebel-City'dan material/furnitura/mahsulot sotib olib, o'z mijozlariga mebel yasaydi. Shuningdek to'g'ridan-to'g'ri xaridorlar ham bor.

**Ilova maqsadi:**
1. Mijozni Mebel-City bilan doimiy aloqada ushlab turish
2. Takroriy xaridlarni rag'batlantirish (gamifikatsiya orqali)
3. Statusli sodiqlik tizimini raqamli ko'rinishda yuritish
4. Mijozga o'z statusini, imtiyozlarini, balans va tarixini ko'rsatish
5. Yangi mijozlarni tavsiya (referral) orqali jalb qilish

**Mavjud tizim:** Mijozlarga vizit kartalar beriladi (QR kod bilan), QR `https://mebelcity.bittada.uz/mini/login/` ga olib boradi. Ular login va parol bilan kiradi.

**Til:** Butun interfeys **o'zbek tilida** (lotin alifbosi). Soddа, tushunarli til.

---

## 2. STATUS (DARAJA) TIZIMI — ASOSIY POYDEVOR

5 darajali statusli tizim. Mijozning yillik aylanmasiga (turnover) qarab daraja beriladi:

| Daraja | Nom | Yillik aylanma | Chegirma | Rang (HEX) |
|--------|-----|----------------|----------|-----------|
| 1 | **Start** | 0–10 mln so'm | 0% | `#3c4450` (grafit) |
| 2 | **Hamkor** | 10–30 mln so'm | 3% | `#157a3a` (yashil) |
| 3 | **Silver Hamkor** | 30–100 mln so'm | 5% | `#6b7480` (kumush) |
| 4 | **Gold Hamkor** | 100–250 mln so'm | 7% | `#b07d12` (oltin) |
| 5 | **VIP Hamkor** | 250 mln+ so'm | 10%+ | `#1a2433` (qora-oltin) |

**Daraja mexanizmlari:**
- **Ko'tarilish**: aylanma chegaradan oshganda avtomatik. VIP'ga ko'tarilish faqat rahbar (Oybek aka) tasdiqlashi bilan.
- **Pasayish**: 6 oy faolsizlikdan keyin bir pog'ona tushadi, lekin oldindan ogohlantirish bilan. Hech qachon Start'ga qaytmaydi — minimum Hamkor saqlanadi.
- **Tavsiya komissiyasi**: yangi mijoz olib kelganda — Hamkor 1%, Silver 3%, Gold 5%, VIP 8%.

---

## 3. GAMIFIKATSIYA MEXANIKASI — YADRO

Tizim **ikki valyutali** bo'ladi:

### 3.1. XP (Tajriba ballari) — daraja oshirish uchun
- XP faqat **yig'iladi**, sarflanmaydi. Mijozning umumiy faolligini ko'rsatadi.
- XP status darajasiga ta'sir qiladi (aylanma bilan birga).
- Misol: har 1000 so'm xarid = 1 XP. Tavsiya = 500 XP. Sharh qoldirish = 100 XP.

### 3.2. Tanga (Coin) — sarflash uchun valyuta
- Tanga **yig'iladi va sarflanadi**. Bu ilova ichidagi "pul".
- Mijoz tangani: chegirma kuponiga, sovg'aga, yetkazib berishga almashtiradi.
- Misol: har 10,000 so'm xarid = 1 tanga. Kunlik kirish = 5 tanga. Topshiriq bajarish = 20-100 tanga.

### 3.3. Yutuq nishonlari (Achievements/Badges)
- Maxsus harakatlar uchun beriladigan belgilar. Faqat status, sarflanmaydi.
- Misollar:
  - "Birinchi xarid" — birinchi buyurtma
  - "Sodiq hamkor" — 1 yil ketma-ket faol
  - "Tavsiyachi" — 5 ta do'st olib kelgan
  - "Tungi qush" — kechqurun buyurtma bergan
  - "Katta buyurtma" — 50 mln+ bitta buyurtma
  - "Plov mehmoni" — tadbirat ishtirok etgan

### 3.4. Seriya (Streak)
- Ketma-ket kunlar/haftalar faollik. Uzilsa, noldan boshlanadi.
- Misol: har kuni ilovaga kirish — 7 kun streak = bonus tanga.

---

## 4. BALLAR QANDAY TOPILADI (Earning rules)

| Harakat | XP | Tanga | Izoh |
|---------|-----|-------|------|
| Xarid (har 10,000 so'm) | +1 XP | +1 tanga | Asosiy manba |
| Kunlik ilovaga kirish | +10 XP | +5 tanga | Streak rag'batlantiradi |
| Do'st tavsiya qilish (ro'yxatdan o'tsa) | +500 XP | +50 tanga | + status bo'yicha % komissiya |
| Tavsiya qilingan do'st birinchi xarid qilsa | +1000 XP | +200 tanga | Katta rag'bat |
| Mahsulot sharhi/foto qoldirish | +100 XP | +20 tanga | Kuniga maks. 3 ta |
| Yandex/Google'da sharh | +300 XP | +100 tanga | Bir martalik, tekshiriladi |
| Kunlik topshiriq bajarish | +50 XP | +20 tanga | Har kuni yangilanadi |
| Haftalik topshiriq bajarish | +200 XP | +100 tanga | Murakkabroq |
| Tug'ilgan kun | +0 XP | +200 tanga | Avtomatik sovg'a |
| Tadbirat (plov, ko'rgazma) ishtirok | +500 XP | +150 tanga | QR skan bilan tasdiqlanadi |
| Profil to'ldirish (100%) | +200 XP | +50 tanga | Bir martalik |

> **MUHIM:** Aniq raqamlarni Mebel-City rahbariyati moslashtirishi mumkin. Tizim bu qiymatlarni **admin paneldan o'zgartirish** imkonini berishi kerak (hardcode qilinmasin).

---

## 5. TANGANI QANDAY SARFLASH (Spending — Sovg'alar do'koni)

Ilovada "Sovg'alar do'koni" (Rewards shop) bo'ladi. Mijoz tangani quyidagilarga almashtiradi:

| Sovg'a | Narxi (tanga) | Izoh |
|--------|---------------|------|
| 50,000 so'mlik chegirma kuponi | 500 tanga | Keyingi xaridda |
| Bepul yetkazib berish | 200 tanga | Bir martalik |
| 100,000 so'mlik kupon | 900 tanga | |
| Mebel-City brendli sovg'a (futbolka, kepka) | 300 tanga | Jismoniy sovg'a |
| Ustaxona asbobi (mayda) | 1500 tanga | |
| Bazis bo'limidan bepul loyiha chizmasi | 800 tanga | Faqat Silver+ |
| VIP tadbirat taklifnoma | 2000 tanga | Faqat Gold+ |

> Sovg'alar ham admin paneldan boshqarilsin — qo'shish, narx o'zgartirish, yoqish/o'chirish.

---

## 6. TOPSHIRIQLAR TIZIMI (Quests/Missions)

### 6.1. Kunlik topshiriqlar (har kuni yangilanadi)
- "Bugun ilovaga kir" (+5 tanga)
- "Katalogdan 3 ta mahsulot ko'r" (+10 tanga)
- "Do'stingga ilovani ulash" (+20 tanga)

### 6.2. Haftalik topshiriqlar
- "Bu hafta kamida 1 buyurtma ber" (+100 tanga)
- "Yangi mahsulotni ko'r va saqlab qo'y" (+50 tanga)

### 6.3. Bir martalik topshiriqlar (Onboarding)
- "Profilingni to'ldir" (+50 tanga)
- "Birinchi buyurtmangni ber" (+200 tanga)
- "Birinchi do'stingni tavsiya qil" (+100 tanga)

### 6.4. Maxsus/Mavsumiy topshiriqlar
- Bayramlar, aksiyalar paytida (Yangi yil, Navro'z, Qurbon hayit)
- "Yangi yil oldidan 3 ta buyurtma ber — 500 tanga + maxsus nishon"

---

## 7. ILOVA EKRANLARI (Screens) — TO'LIQ RO'YXAT

### 7.1. Kirish (Login)
- Login + parol (kompaniya beradi, vizit kartada yozilgan)
- QR kod orqali avtomatik kirish (karta QR'ini skan qilganda)
- "Parolni unutdim" — SMS orqali tiklash

### 7.2. Bosh ekran (Dashboard) — eng muhim ekran
Yuqoridan pastga:
1. **Status kartasi** (eng yuqorida): mijoz ismi, joriy status (rangli, vizit karta dizaynida), QR kod
2. **Daraja progress bari**: hozirgi XP va keyingi darajagacha qancha qolgani (vizual progress bar)
3. **Balans**: tanga soni (katta, ko'zga tashlanadigan) + XP
4. **Streak indikatori**: necha kun ketma-ket (alanga ikonkasi bilan)
5. **Kunlik topshiriqlar** (qisqa ro'yxat, bajarilganini belgilash)
6. **Tezkor harakatlar**: "Buyurtma berish", "Do'st tavsiya qilish", "Sovg'alar do'koni"
7. **So'nggi yutuqlar**: yangi olingan nishonlar

### 7.3. Status va imtiyozlar ekrani
- 5 darajali tizim to'liq ko'rinishi (vizual kartalar)
- Mijozning hozirgi darajasi belgilangan
- Har bir daraja imtiyozlari ro'yxati
- "Keyingi darajaga qanday yetish" — aniq ko'rsatma

### 7.4. Sovg'alar do'koni (Rewards shop)
- Tangaga almashtiriladigan sovg'alar to'plami (kartalar ko'rinishida)
- Har birida: rasm, nomi, tanga narxi, "Almashtirish" tugmasi
- Yetarli tanga bo'lmasa — tugma o'chiq, qancha kerakligi ko'rsatiladi
- Status cheklovi bo'lsa ko'rsatiladi ("Faqat Gold+ uchun")

### 7.5. Topshiriqlar ekrani (Quests)
- Tablar: Kunlik / Haftalik / Maxsus
- Har topshiriqda: nomi, mukofoti, progress, "Olish" tugmasi (bajarilgan bo'lsa)

### 7.6. Yutuqlar ekrani (Achievements)
- Olingan va olinmagan nishonlar (olinmaganlar kulrang)
- Har birida: ikon, nomi, qanday olinishi, olingan sana

### 7.7. Reyting jadvali (Leaderboard) — ijtimoiy element
- "Bu oyning eng faol hamkorlari" — XP bo'yicha top ro'yxat
- Mijozning o'z o'rni belgilangan
- Faqat ism va status ko'rsatiladi (maxfiylik uchun familiya qisqartirilgan)
- **Psixologik kuch**: ustalar bir-biri bilan raqobatlashadi

### 7.8. Tavsiya (Referral) ekrani
- Mijozning shaxsiy tavsiya kodi/havolasi
- "Do'stga ulashish" tugmasi (Telegram, WhatsApp orqali)
- Necha kishi taklif qilingani, qancha komissiya olingani
- Taklif qilinganlar ro'yxati va ularning holati

### 7.9. Buyurtma berish (Catalog/Order)
- Mahsulotlar katalogi (yoki tashqi tizimga ulanish)
- Savatcha, buyurtma berish
- Buyurtma tarixi
- Har buyurtma uchun olingan XP/tanga ko'rsatiladi

### 7.10. Profil
- Shaxsiy ma'lumotlar, telefon
- QR karta (yuklab olish/ko'rsatish)
- Sozlamalar, bildirishnoma sozlamalari
- Til (kelajakda rus tili qo'shish mumkin)

### 7.11. Bildirishnomalar (Notifications)
- Status o'zgarishi, yangi topshiriq, tanga olindi, tadbirat e'loni
- Push-bildirishnoma (mobil uchun)

### 7.12. Mebel-City bilan aloqa
- Shaxsiy menejer chati (Gold+ uchun)
- Umumiy qo'llab-quvvatlash
- Ijtimoiy tarmoq havolalari

---

## 8. TEXNIK TALABLAR

### 8.1. Platforma
- **Web ilova** (responsive, mobil-birinchi dizayn) — barcha qurilmada ishlaydi
- Yoki **PWA** (Progressive Web App) — telefonga o'rnatib olish mumkin
- Mavjud backend: `mebelcity.bittada.uz` — bu tizim bilan integratsiya qilinadi

### 8.2. Texnologiyalar (tavsiya, dasturchi tanlashi mumkin)
- Frontend: React / Vue / Next.js + Tailwind CSS
- Backend: mavjud bittada.uz tizimi yoki yangi (Node.js/Python/PHP)
- Ma'lumotlar bazasi: PostgreSQL / MySQL
- Autentifikatsiya: JWT token, QR-login qo'llab-quvvatlash

### 8.3. Admin panel (MUHIM)
Mebel-City xodimlari uchun boshqaruv paneli:
- Mijozlar ro'yxati, status boshqaruvi
- XP/tanga qoidalarini o'zgartirish
- Sovg'alar do'koni boshqaruvi (qo'shish/o'chirish/narx)
- Topshiriqlar yaratish va boshqarish
- Bildirishnoma yuborish (hammaga yoki status bo'yicha)
- Statistika: faol mijozlar, sotuvlar, eng faollar
- Tavsiya tizimi nazorati

### 8.4. Integratsiyalar
- **Odoo ERP** bilan bog'lanish (mavjud tizim) — xaridlar avtomatik XP/tangaga aylanadi
- SMS shlyuz (parol tiklash, bildirishnoma)
- Telegram bot (ixtiyoriy — bildirishnoma va kirish uchun)
- Click/Payme (kelajakda — to'lov uchun)

---

## 9. DIZAYN YO'NALISHI

### 9.1. Brend ranglari
- **Qizil**: `#b91c1c` (asosiy brend rangi)
- **Yashil**: `#157a3a` (archa, ikkilamchi)
- **Krem/oq**: `#fffdf7` (fon)
- Status ranglari: yuqoridagi jadvalga qarang

### 9.2. Logo
- Mebel-City dumaloq logosi (qizil halqa + yashil archa + krem fon)

### 9.3. Uslub
- Zamonaviy, toza, mobil-birinchi
- Gamifikatsiya elementlari: progress barlar, animatsiyalar (tanga olinganda, daraja oshganda)
- O'zbek mijozlariga mos: iliq, ishonchli, ortiqcha murakkab emas
- Animatsiyalar mo''tadil (telefon zaif bo'lsa ham ishlasin)

### 9.4. Tanga/XP olinganda
- Kichik animatsiya (tanga uchib kelishi, "+50 tanga!" ko'rsatish)
- Daraja oshganda — tantanali ekran (konfeti, tabrik)
- Bu **dofamin** beradi va qaytishni rag'batlantiradi

---

## 10. PSIXOLOGIK PRINSIPLAR (O'zbek mentaliteti uchun)

Ilova quyidagi psixologik tamoyillarga asoslanadi:

1. **Yo'qotish qo'rquvi (Loss aversion)**: "Streak'ingiz uziladi!", "Status pasayishi yaqin" — yo'qotishni eslatish kuchli motivatsiya.
2. **Ijtimoiy isbot (Social proof)**: Reyting jadvali, "Boshqa ustalar bu oy 50 ta buyurtma berdi".
3. **O'zaro javob (Reciprocity)**: Tug'ilgan kun sovg'asi, kutilmagan bonuslar — mijoz "qarzdor" his qiladi.
4. **Maqsadga yaqinlik (Goal gradient)**: "Keyingi darajagacha atigi 2 ta buyurtma!" — yaqin maqsad ko'proq harakatga undaydi.
5. **Hamkorlik tuyg'usi**: "klub" emas, "hamkor" so'zi — sherikchilik, oilaviy munosabat. O'zbek mentalitetida bu juda muhim.
6. **Obro' va maqom**: Yuqori status — ustaning kasbiy obro'si. VIP Hamkor bo'lish — faxr.

---

## 11. ROLLAR VA RUXSATLAR

| Rol | Imkoniyatlar |
|-----|-------------|
| **Mijoz** | O'z profili, status, balans, topshiriq, sovg'a, tavsiya |
| **Sotuvchi konsultant** | Mijoz qidirish, buyurtma kiritish, status ko'rish |
| **Menejer (ROP)** | Sotuvchilarni nazorat, statistika |
| **Admin (HR/IT)** | Tizim sozlamalari, qoidalar, sovg'alar |
| **Rahbar (Oybek aka)** | Hammasi + VIP tasdiqlash + umumiy statistika |

---

## 12. BIRINCHI BOSQICH (MVP) — NIMADAN BOSHLASH

Hammasi birdan emas, bosqichma-bosqich. Birinchi versiya (MVP) uchun:

**1-bosqich (asosiy):**
- Login (QR + parol)
- Bosh ekran (status, balans, QR karta)
- Status va imtiyozlar ko'rinishi
- Xaridlar avtomatik tanga/XP ga aylanishi (Odoo integratsiya)
- Profil

**2-bosqich (gamifikatsiya):**
- Sovg'alar do'koni
- Kunlik topshiriqlar va streak
- Yutuq nishonlari

**3-bosqich (ijtimoiy):**
- Reyting jadvali
- Tavsiya tizimi
- Bildirishnomalar

**4-bosqich (kengaytirish):**
- Telegram bot
- To'lov integratsiyasi
- Kengaytirilgan analitika

---

## 13. AI KOD-GENERATORIGA BERISH UCHUN QISQA PROMPT

> Agar bu TZ'ni AI kod-generatsiya vositasiga (v0, Lovable, Bolt, Cursor) berayotgan bo'lsangiz, quyidagi qisqa promptdan boshlang:

```
Mebel-City (O'zbek mebel kompaniyasi) mijozlari uchun gamifikatsiyalangan 
sodiqlik ilovasi yarating. Mobil-birinchi, responsive web ilova (PWA). 
Til: o'zbek (lotin). 

Asosiy funksiyalar:
- QR + parol bilan login
- 5 darajali status tizimi (Start/Hamkor/Silver/Gold/VIP Hamkor)
- Ikki valyuta: XP (daraja uchun) va Tanga (sarflash uchun)
- Bosh ekran: status kartasi, QR, balans, daraja progress bari, streak, kunlik topshiriqlar
- Sovg'alar do'koni (tangani chegirma/sovg'aga almashtirish)
- Kunlik/haftalik topshiriqlar, yutuq nishonlari
- Reyting jadvali (eng faol hamkorlar)
- Tavsiya (referral) tizimi
- Admin panel (qoidalar, sovg'alar, mijozlarni boshqarish)

Brend ranglari: qizil #b91c1c, yashil #157a3a, krem #fffdf7.
Status ranglari: Start #3c4450, Hamkor #157a3a, Silver #6b7480, 
Gold #b07d12, VIP #1a2433.

Dizayn: zamonaviy, toza, iliq, ishonchli. Tanga/daraja olinganda 
kichik tantanali animatsiyalar. O'zbek ustalariga mos.

Texnologiya: React + Tailwind CSS. localStorage emas, backend API 
bilan ishlaydigan struktura. Avval bosh ekran va status tizimidan boshlang.
```

---

## 14. MUHIM ESLATMALAR

1. **Aniq raqamlar (XP, tanga miqdori) admin paneldan o'zgartiriladigan bo'lsin** — hardcode qilinmasin. Mebel-City test qilib, moslab boradi.
2. **Maxfiylik**: mijoz ma'lumotlari himoyalangan bo'lsin. Reyting jadvalida to'liq familiya ko'rsatilmasin.
3. **Soddalik**: ustalar texnologiyaga unchalik usta emas — interfeys juda sodda va tushunarli bo'lishi shart.
4. **Tezlik**: ilova zaif internet va arzon telefonlarda ham ishlasin.
5. **Mavjud tizim** (`mebelcity.bittada.uz`) bilan integratsiya — noldan emas, bor narsaning ustiga qurish.
6. **Bosqichma-bosqich**: MVP'dan boshlab, asta kengaytirish. Hammasini birdan qilishga urinmaslik.

---

*Ushbu TZ Mebel-City brendi uchun maxsus tayyorlandi. Savol yoki o'zgartirish kerak bo'lsa, har bir bo'limni alohida kengaytirish mumkin.*
