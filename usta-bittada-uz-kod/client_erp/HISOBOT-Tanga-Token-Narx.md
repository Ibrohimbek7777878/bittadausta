# HISOBOT — Tanga narxi ↔ token sarfi

> Sana: 2026-08-05 | Akkaunt: `bigone_cl2` va butun baza
> Kurs: **1 USD = 11 942.21 UZS** (o'lchandi, `core.services.rates`)

---

## 1. Xulosa — bir qarashda

| Savol | Javob |
|---|---|
| Tanga narxi token sarfiga to'g'ri keladimi? | **Ha, hatto ortig'i bilan** — marja 88–94% |
| Zarar xavfi bormi? | Faqat **29 daqiqadan uzun** ovozli suhbatda |
| Asosiy muammo nima? | **Token emas** — 71% sessiya bekorga to'langan |
| Narxni oshirish kerakmi? | **Yo'q.** Ortiqcha to'lovni to'xtatish kerak |

---

## 2. O'lchangan ma'lumot

### 2.1 Prompt hajmlari (bugun o'lchandi)

| Nima | Token |
|---|---|
| Gemini Live system prompt (bilim bazasi bilan) | **1 675** |
| Matnli chat — bitta savol (kirish) | **~790** |
| Matnli chat — javob (chiqish) | ~400 |

### 2.2 Tanga paketlari

| Paket | Tanga | Narx | 1 tanga |
|---|---|---|---|
| 50 tanga | 50 | 50 000 | 1 000 UZS |
| 100 tanga | 100 | 100 000 | 1 000 UZS |
| 500 + 50 bonus | 550 | 500 000 | 909 UZS |
| 1000 + 150 bonus | 1150 | 1 000 000 | **870 UZS** |

Hisobda eng arzoni — **870 UZS/tanga** ishlatilgan (eng yomon holat).

### 2.3 Haqiqiy foydalanish (15.07 – 03.08)

```
gemini_live sessiyalari : 95 ta  (190 tanga)
boshqa amallar          : 0 ta   (rasm/panorama/analitika ishlatilmagan)
sotib olingan tanga     : 36 900 (54 marta)
```

---

## 3. ⚠️ Taxminlar — tasdiqlanishi kerak

Quyidagi narxlar provayder saytidan **tekshirilishi shart**. Ular
o'zgarsa butun hisob o'zgaradi:

| Nima | Taxmin |
|---|---|
| Gemini Live audio kirish | $3.00 / 1M token |
| Gemini Live audio chiqish | $12.00 / 1M token |
| Gemini Live matn kirish | $0.50 / 1M token |
| Audio zichligi | 25 token/soniya |
| Matnli chat (flash/mini) | $0.15 kirish / $0.60 chiqish |
| Suhbatning yarmi — gap, yarmi — jimlik | 50% |

---

## 4. Ovozli sessiya tannarxi

| Davomiylik | Tannarx (UZS) | 2 tanga = 1 740 UZS |
|---|---|---|
| 30 soniya | 40 | ✅ |
| 1 daqiqa | 69 | ✅ |
| 2 daqiqa | 128 | ✅ |
| 5 daqiqa | 306 | ✅ |
| 10 daqiqa | 601 | ✅ |
| 20 daqiqa | 1 192 | ✅ |
| **30 daqiqa** | **1 783** | 🔴 zarar |

**Zarar chegarasi: ~29 daqiqa.** Undan qisqa har qanday suhbat foydali.

---

## 5. Matnli chat tannarxi

```
1 savol-javob :   4 UZS
100 savol     : 428 UZS
```

**1 tanga (870 UZS) ga ~203 ta savol sig'adi.**

> Hozir matnli chat **umuman tanga yechmaydi** (bugun qo'shildi, `charge()`
> ga ulanmagan). Tannarxi juda past bo'lgani uchun bu katta zarar emas,
> lekin qaror qabul qilinishi kerak.

---

## 6. Oylik profillar

| Profil | Ovoz sessiya | O'rt. davomiylik | Matn savol | Tannarx | Kerak tanga | Hozir olinadi |
|---|---|---|---|---|---|---|
| Yengil | 8 | 90 s | 20 | 875 UZS | **1.0** | 16 |
| O'rtacha | 20 | 120 s | 60 | 2 821 UZS | **3.2** | 40 |
| Faol | 50 | 180 s | 200 | 10 223 UZS | **11.8** | 100 |

### Marja

| Profil | Tushum | Tannarx | Foyda | Marja |
|---|---|---|---|---|
| Yengil | 13 920 | 875 | 13 045 | **93.7%** |
| O'rtacha | 34 800 | 2 821 | 31 979 | **91.9%** |
| Faol | 87 000 | 10 223 | 76 777 | **88.2%** |

Ya'ni foydalanuvchi **kerakidan 8–16 barobar ko'p** to'layapti.

---

## 7. 🔴 ASOSIY MUAMMO — token emas, bekor sessiyalar

95 ta sessiya tahlili:

```
30 soniya ichida qayta ochilgan : 67 ta  (71%)
2 daqiqa ichida qayta ochilgan  : 71 ta  (75%)
sessiyalar orasidagi median     : 11 soniya (eng kami 3 s)
```

| Foydalanuvchi | Sessiya | 30 s ichida qayta |
|---|---|---|
| alijon_cl | 27 | **22** |
| bigone_cl2 | 19 | **14** |
| sanjarbek_cl | 10 | 7 |
| jasurbek_cl2 | 9 | 7 |

Odam tugmani bosdi → ulanmadi yoki darrov yopdi → qayta bosdi.
**Har safar 2 tanga.** Shu 67 ta uchun **134 tanga (~134 000 UZS)**
yechilgan, AI esa deyarli ishlamagan.

Tannarx jihatidan bu arzon (har biri ~40 UZS), lekin **foydalanuvchi
uchun adolatsiz** — u pulini yo'qotayotganini ko'radi.

---

## 8. 🔴 O'lchov yo'qligi

Hech qayerda **sessiya davomiyligi** ham, **token soni** ham yozilmaydi.
`CoinLedger` da faqat boshlanish vaqti bor.

Shuning uchun yuqoridagi jadvallar — **model**, o'lchov emas.
Haqiqiy raqam faqat log yig'ilgandan keyin ma'lum bo'ladi.

---

## 9. Tavsiyalar — muhimlik tartibida

### 1️⃣ Qayta ochilishni bloklash (eng shoshilinch)

Oxirgi sessiyadan **60 soniya** o'tmagan bo'lsa qayta to'lov olinmasin
(bir «oyna» ichida bepul qayta ulanish). Bu 71% ortiqcha to'lovni
darhol to'xtatadi. Kod: `glive_consumer._charge()`.

### 2️⃣ O'lchov qo'shish

Yangi jadval: sessiya boshlanishi/tugashi, davomiyligi, token soni
(Gemini `usage_metadata` qaytaradi). 2 hafta ma'lumotdan keyin narx
**taxmin emas, o'lchov** bilan belgilanadi.

### 3️⃣ Narxni PASAYTIRISH imkoni

Marja 88–94% — juda yuqori. Raqobat uchun ovozli sessiyani
**2 → 1 tanga** qilish mumkin, marja baribir 80%+ qoladi.
Yoki 2 tanga qoldirib, ichiga **10 daqiqa** kafolat berish.

### 4️⃣ Uzoq sessiyaga qo'shimcha

29 daqiqadan uzun suhbat zarar. Chora: har 15 daqiqada +1 tanga,
yoki 30 daqiqada avtomatik to'xtatish + ogohlantirish.

### 5️⃣ Matnli chat narxi

Tannarxi 4 UZS. Variantlar:
- **Bepul qoldirish** (foydalanuvchini jalb qiladi, zarar deyarli yo'q)
- Yoki **1 tanga = 50 savol** paketi

---

## 10. Yakuniy javob

> **Tanga narxi token sarfiga to'g'ri keladimi?**

**Keladi, hatto ortig'i bilan.** Foydalanuvchi tannarxdan 8–16 barobar
ko'p to'layapti. Narxni oshirish shart emas.

Lekin **hisoblash usuli noto'g'ri**: sessiya soniga qarab olinadi,
foydalanish hajmiga emas. Shuning uchun 71% to'lov bekorga ketyapti —
bu foydalanuvchining ishonchini yo'qotadi.

**Avval o'lchang (2-tavsiya), keyin narxlang.** Hozirgi raqamlar taxmin.
