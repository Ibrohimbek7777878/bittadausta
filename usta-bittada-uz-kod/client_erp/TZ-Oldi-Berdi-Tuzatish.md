# TZ — Oldi-Berdi sahifasini to'g'rilash

> Sana: 2026-08-06 | Holat: 🔨 **BAJARILMOQDA**
> Asos: 2026-07-09 dan navbatda turgan «chuqur ko'rib chiqish» vazifasi
> Fayllar: `client_erp/serializers.py`, `client_erp/consumers.py`,
> `static/client_erp/js/redesign/oldi-berdi.js`

---

## 1. Sahifa nima

`Big One` (mini-ERP foydalanuvchisi) ↔ **MebelCity ERP** o'rtasidagi hisob.
Ya'ni ta'minotchi bilan «oldim-berdim» daftari.

⚠️ Mini-ERP moliyasidan **butunlay alohida**.

---

## 2. Topilgan xatolar (jonli bazada o'lchandi)

### 2.1 🔴 «To'lovlar 0» — noto'g'ri jadval

| Jadval | Big One yozuvlari |
|---|---|
| `ERPFinanceOperation` ← **sahifa shundan o'qiydi** | **0 ta** |
| `Payment` (qarzga bog'langan) ← **to'g'ri manba** | **8 ta = 20 239 403** |
| `FinancialOperation` (kassa amali) | 10 ta (`ref_type='sale'` 8 ta = 20 239 403) |

**Sabab:** platforma ROSTAPP'dan native moliyaga o'tgan; to'lovlar
`Payment`/`FinancialOperation` ga ko'chgan, bu sahifa eski
`ERPFinanceOperation` da qolib ketgan.

**To'g'ri manba — `Payment`**, chunki u `debt` FK bilan bog'langan:
qaysi to'lov qaysi qarzni yopgani aniq ko'rinadi.

### 2.2 🔴 100% dan oshgan foiz

```
501967:  sotuv   103 800  →  to'langan 1 200 000  (1156%)
501775:  sotuv   618 600  →  to'langan 4 756 000  (769%)
```

Bitta katta to'lov kichik chekka biriktirilgan (MebelCity tomonida).
Ekranda `1156%` va to'lgan chiziq chiqadi — buzuq ko'rinadi.

**Yechim:** foiz `min(100, ...)` bilan cheklanadi, ortiqcha bo'lsa
⚠️ belgi + izoh chiqadi. Ma'lumot **o'zgartirilmaydi** — faqat ko'rinish.

### 2.3 🟠 Svodka bog'lanmaydi

```
Sotuv 159 826 100 − Qaytarish 3 184 600 = 156 641 500
lekin Balans                              125 729 097
farq                                       30 912 403   ← izohsiz
```

Farq haqiqiy (14 977 600 darhol to'langan + 19 119 403 qarzdan to'langan),
lekin ekranda tushuntirilmagan.

**Yechim:** svodka ostida bog'lovchi qator.

### 2.4 🟠 Qatorni bosib bo'lmaydi

Foydalanuvchi so'rovi: *«buni bosganda nima uchun va nimaga qarz bo'lgan
chiqishi kerak»*. Hozir qator statik.

---

## 3. Qarz hayoti (kod bo'yicha aniqlangan)

`finance/views_qarz.py` va `sales` oqimi:

```
1. SOTUV bo'ladi
   Sale yaratiladi (total_uzs, paid_uzs, debt_uzs)
   Agar to'liq to'lanmagan bo'lsa → Debt yaratiladi
        ref_type='sale', ref_id=<sale.id>
        original_amount = qarz summasi
        remaining_amount = original_amount

2. TO'LOV qilinadi
   Kassa amali (FinancialOperation) tasdiqlanadi
   → Payment yaratiladi (debt FK bilan)
   → Sale.paid_uzs += summa,  Sale.debt_uzs = total − paid
   → Debt.remaining_amount −= summa

3. QARZ YOPILADI
   remaining_amount ≤ 0 bo'lsa:
        is_paid = True
        paid_at = hozir
   Mijoz balansi qayta hisoblanadi
```

**Balans = ochiq qarzlar (`is_paid=False`) `remaining_amount` yig'indisi.**
Tekshirildi: 144 848 500 − 19 119 403 = 125 729 097 ✅

---

## 4. Qilinadigan ishlar

| # | Ish |
|---|---|
| **A** | To'lovlar tabi → `Payment` jadvalidan (qarzga bog'langan) |
| **B** | Foiz `min(100,…)` + ⚠️ ortiqcha to'lov belgisi |
| **C** | Svodka ostida bog'lovchi izoh |
| **D** | Qatorni bosish → tafsilot: nima olingan, qancha to'langan, nega qarz |

---

## 5. Tegilmaydigan joylar

- MebelCity ERP ma'lumotlari — **FAQAT O'QILADI**, hech narsa yozilmaydi
- `Sale`, `Debt`, `Payment` yozuvlari — **o'zgartirilmaydi**
- Mini-ERP moliyasi — **umuman aloqasi yo'q**
- Migratsiya — **YO'Q**

---

## 6. Xavf

| Xavf | Daraja | Chora |
|---|---|---|
| Boshqa mijoz ma'lumoti oqishi | 🔴 YUQORI | Har so'rov `client=_get_client_safe(user)` bilan cheklanadi |
| Sekinlashish (37 sotuv × qarz × to'lov) | 🟠 O'RTA | Tafsilot FAQAT bosilganda yuklanadi |
| Yozuv o'zgartirib qo'yish | 🟢 YO'Q | Faqat `SELECT` |
