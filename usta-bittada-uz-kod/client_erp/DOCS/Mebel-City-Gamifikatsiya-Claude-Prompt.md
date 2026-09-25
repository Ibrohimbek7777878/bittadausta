# Mebel-City Gamifikatsiya Ilovasi — Claude uchun Prompt

> Bu promptni Claude'ga (yoki Claude Code'ga) to'g'ridan-to'g'ri bering. Claude buni o'qib, ilovani bosqichma-bosqich yaratishni boshlaydi. Pastdagi matnni to'liq nusxalab, Claude'ga yopishtiring.

---

## ASOSIY PROMPT (nusxalab Claude'ga bering)

```
Sen tajribali full-stack dasturchi va mahsulot dizaynerisan. Men O'zbekistondagi 
mebel kompaniyasi "Mebel-City" uchun mijozlar sodiqlik ilovasini yaratmoqchiman. 
Sen bu ilovani gamifikatsiya (o'yinlashtirish) mexanikasi bilan quryapsan.

== KONTEKST ==
Mebel-City — Sirdaryo viloyati Guliston shahridagi mebel ishlab chiqaruvchi. 
Asosiy mijozlar: USTALAR (mebel yasovchilar), ular bizdan material/furnitura 
sotib olib o'z mijozlariga mebel yasaydi. Mijozlarga QR kodli vizit karta beramiz, 
ular ilovaga login+parol bilan kiradi. Maqsad: mijozlarni doimiy aloqada ushlash, 
takroriy xaridni rag'batlantirish, statusli sodiqlik tizimini raqamlashtirish.

== TIL ==
Butun interfeys O'ZBEK tilida (lotin alifbosi). Sodda, iliq, ishonchli til. 
Ustalar texnologiyaga juda usta emas — interfeys o'ta sodda bo'lsin.

== STATUS TIZIMI (5 daraja, yillik aylanmaga qarab) ==
1. Start         — 0-10 mln so'm    — 0% chegirma  — rang #3c4450 (grafit)
2. Hamkor        — 10-30 mln so'm   — 3% chegirma  — rang #157a3a (yashil)
3. Silver Hamkor — 30-100 mln so'm  — 5% chegirma  — rang #6b7480 (kumush)
4. Gold Hamkor   — 100-250 mln so'm — 7% chegirma  — rang #b07d12 (oltin)
5. VIP Hamkor    — 250 mln+ so'm    — 10%+ chegirma — rang #1a2433 (qora-oltin)

== IKKI VALYUTALI GAMIFIKATSIYA ==
- XP (tajriba balli): faqat yig'iladi, sarflanmaydi. Daraja oshirish uchun.
- TANGA (coin): yig'iladi VA sarflanadi. Ilova ichidagi "pul" — sovg'a/chegirmaga.
- YUTUQ NISHONLARI (badges): maxsus harakatlar uchun belgilar.
- STREAK: ketma-ket kunlar faollik, uzilsa noldan.

Ballar topish (taxminiy, keyin admin paneldan o'zgartiriladi):
- Xarid: har 10,000 so'm = +1 XP, +1 tanga
- Kunlik kirish: +10 XP, +5 tanga
- Do'st tavsiya (ro'yxatdan o'tsa): +500 XP, +50 tanga
- Tavsiya qilingan do'st birinchi xarid qilsa: +1000 XP, +200 tanga
- Mahsulot sharhi/foto: +100 XP, +20 tanga
- Kunlik topshiriq: +50 XP, +20 tanga
- Tug'ilgan kun: +200 tanga

Tanga sarflash (Sovg'alar do'koni):
- 50,000 so'm chegirma kuponi = 500 tanga
- Bepul yetkazib berish = 200 tanga
- Brendli sovg'a = 300 tanga
- Asbob = 1500 tanga

== BREND RANGLARI ==
Qizil #b91c1c (asosiy), Yashil #157a3a (ikkilamchi), Krem #fffdf7 (fon).

== EKRANLAR (MVP uchun ustuvor 1-5) ==
1. Login — QR + parol bilan kirish
2. Bosh ekran (Dashboard) — ENG MUHIM:
   - Yuqorida: status kartasi (mijoz ismi, rangli status, QR kod)
   - Daraja progress bari (keyingi darajagacha qancha XP qolgani)
   - Balans: tanga (katta, ko'zga tashlanadigan) + XP
   - Streak indikatori (necha kun ketma-ket, alanga ikonkasi)
   - Kunlik topshiriqlar (qisqa ro'yxat, checkbox bilan)
   - Tezkor tugmalar: Buyurtma, Do'st tavsiya, Sovg'alar do'koni
3. Status va imtiyozlar — 5 daraja vizual ko'rinishi, hozirgi belgilangan
4. Sovg'alar do'koni — tangaga almashtiriladigan sovg'alar (kartalar)
5. Topshiriqlar — kunlik/haftalik/maxsus tablar
(keyingi bosqich: Yutuqlar, Reyting jadvali, Tavsiya, Profil, Bildirishnoma)

== TEXNIK TALABLAR ==
- React + Tailwind CSS, mobil-birinchi responsive (PWA bo'lsa yaxshi)
- Komponentlar toza, qayta ishlatiladigan
- Backend API bilan ishlaydigan struktura (hozircha mock data bilan, keyin 
  mebelcity.bittada.uz va Odoo ERP ga ulanadi)
- Tanga/XP/daraja qoidalari HARDCODE EMAS — config faylda yoki admin orqali 
  o'zgartiriladigan qilib qur
- Tanga olinganda / daraja oshganda — kichik tantanali animatsiya (dofamin uchun)

== DIZAYN PRINSIPLARI ==
- Zamonaviy, toza, iliq, ishonchli. Mobil-birinchi.
- O'zbek mentaliteti: "klub" emas "HAMKOR" so'zini ishlat (sherikchilik, oila tuyg'usi)
- Gamifikatsiya psixologiyasi: progress barlar, "keyingi darajagacha oz qoldi", 
  streak yo'qotish ogohlantirishi, reyting raqobati
- Animatsiyalar mo''tadil (arzon telefonda ham ishlasin)

== VAZIFA ==
Avval menga ilova ARXITEKTURASINI va fayl tuzilishini ko'rsat. Keyin 
1-bosqichdan boshla: LOGIN va BOSH EKRAN (Dashboard) ni to'liq, ishlaydigan 
holda yarat (mock data bilan). Har bosqichdan keyin to'xtab, menga ko'rsat — 
men tasdiqlasam, keyingisiga o'tasan. Birdan hammasini qilma.

Boshla.
```

---

## QO'SHIMCHA: BOSQICHMA-BOSQICH SO'ROVLAR

Claude 1-bosqichni tugatgandan keyin, quyidagi so'rovlar bilan davom eting:

**2-bosqich uchun:**
```
Yaxshi. Endi STATUS va IMTIYOZLAR ekrani hamda SOVG'ALAR DO'KONI ni yarat. 
Status ekranida 5 daraja vizual kartalar ko'rinishida bo'lsin, mijozning 
hozirgi darajasi belgilangan va "keyingi darajaga qanday yetish" ko'rsatilsin.
```

**3-bosqich uchun:**
```
Endi TOPSHIRIQLAR (kunlik/haftalik/maxsus tablar bilan) va YUTUQ NISHONLARI 
ekranlarini yarat. Topshiriq bajarilganda tanga olinishi va animatsiya bo'lsin.
```

**4-bosqich uchun:**
```
Endi ijtimoiy elementlarni qo'sh: REYTING JADVALI (eng faol hamkorlar, XP bo'yicha, 
familiya qisqartirilgan) va TAVSIYA (referral) tizimi — shaxsiy kod, ulashish 
tugmasi, taklif qilinganlar ro'yxati.
```

**5-bosqich uchun:**
```
Endi ADMIN PANEL yarat: mijozlar boshqaruvi, XP/tanga qoidalarini o'zgartirish, 
sovg'alar do'konini boshqarish, topshiriq yaratish, bildirishnoma yuborish, 
statistika. Bu Mebel-City xodimlari uchun.
```

**Backend ulash uchun:**
```
Endi mock datani haqiqiy backend bilan almashtir. mebelcity.bittada.uz API 
strukturasini hisobga ol va Odoo ERP dan xaridlar avtomatik XP/tangaga 
aylanadigan integratsiya qatlamini yarat.
```

---

## MASLAHATLAR

1. **Claude Code'da ishlatish** — agar terminal orqali Claude Code'dan foydalansangiz, bu prompt eng yaxshi ishlaydi: u to'g'ridan-to'g'ri fayllar yaratadi, loyiha tuzilishini quradi va ishga tushiradi.

2. **Oddiy Claude chatda** — bu yerda ham ishlaydi, lekin Claude bir vaqtda bitta-ikkita komponent yaratadi (artifact ko'rinishida). Katta loyiha uchun Claude Code yaxshiroq.

3. **Bosqichma-bosqich** — promptда aniq yozdim: Claude birdan hammasini qilmasin, har bosqichda to'xtab ko'rsatsin. Bu sizga nazorat beradi va sifat oshadi.

4. **Mock data** — boshida haqiqiy backend kerak emas. Claude soxta (mock) ma'lumot bilan to'liq ishlaydigan ilova quradi, keyin uni haqiqiy tizimga ulaysiz.

5. **To'liq TZ bilan birga** — agar Claude'ga ko'proq tafsilot kerak bo'lsa, "Mebel-City-Gamifikatsiya-TZ.md" hujjatini ham unga bering — u yerda har bir element batafsil yozilgan.
