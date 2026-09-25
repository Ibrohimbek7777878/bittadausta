# TZ — Qarzlar tabi avtomatik to'ldirilsin

> Sana: 2026-08-05 | Sahifa: `#/finance` → Qarzlar tabi
> Holat: 🟡 **TASDIQ KUTILMOQDA**

---

## 1. Hozirgi holat (o'lchandi)

| Nima | Holat |
|---|---|
| `ClientDebt` yozuvlari — butun bazada | **10 ta** |
| Shundan `ibrohim_cl` da | **0 ta** |
| Qarz qo'lda yoziladi (`handle_debt_create`) | mijoz + summa majburiy |
| Shartnoma qarzi (kelishdik − oldik) | hisoblanadi, lekin Qarzlar tabida **YO'Q** |

Natija: `#327` da mijoz 20 000 000 qarzdor, lekin Qarzlar tabida **0** turibdi.
Foydalanuvchi ikkita joyni solishtirib chalkashadi.

---

## 2. 🔴 To'siq: 26% zakazda mijoz yo'q

`ClientDebt.customer` — **NOT NULL** (majburiy). Lekin:

```
jami zakaz 151, mijozi YO'Q: 40 (26%)
```

`#327 «test»` ham aynan shunday — mijozi yo'q, qarzi 20 mln.
Ya'ni **avtomatik `ClientDebt` yozuvi yarata olmaymiz** — yozuv mijozsiz
saqlanmaydi.

---

## 3. Taklif: yozuv YARATMAYMIZ, HISOBLAB ko'rsatamiz

Qarzlar tabi ikki qismga bo'linadi:

```
┌──────────────────────────────────────────────┐
│ 🔴 Shartnoma bo'yicha qarz          2 ta     │
│ (o'zi hisoblanadi — yozish shart emas)       │
├──────────────────────────────────────────────┤
│ #327 · test                                  │
│ Mijoz: ko'rsatilmagan                        │
│ Kelishdik 20 000 000 · Oldik 0               │
│ 🔴 QARZ ······················· 20 000 000   │
│                    [ Rasmiy qarz qilish ]    │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 📝 Rasmiy qarzlar                    0 ta    │
│ (qo'lda yozilgan — muddati bor)              │
│                        [ + Yangi qarz ]      │
└──────────────────────────────────────────────┘
```

### Nega yozuv yaratilmaydi

| Xavf | Izoh |
|---|---|
| Mijozsiz zakaz | 26% zakazda mijoz yo'q — yozuv saqlanmaydi |
| Ikki marta sanash | Qo'lda ham yozilgan bo'lsa — qarz 2x ko'rinadi |
| Sinxron qolish | Pul kelsa/shartnoma o'zgarsa har safar yangilash kerak |
| Ortga qaytarib bo'lmaslik | Noto'g'ri yaratilgan yozuvni tozalash og'ir |

Hisoblab ko'rsatish — **har doim to'g'ri**, chunki manba bitta:
`shartnoma − olingan pul`. Hech narsa eskirmaydi.

### «Rasmiy qarz qilish» tugmasi

Agar mijoz bilan muddat kelishilsa — bir bosishda `ClientDebt` yaratiladi
(mijoz yo'q bo'lsa avval mijoz tanlash so'raladi). Shundan keyin u
avtomatik ro'yxatdan chiqib, «Rasmiy qarzlar» ga o'tadi — takror
ko'rinmaydi.

---

## 4. Tranzaksiyalar tabi — yarim ishlaydi

Modelda **6 xil** yozuv turi bor, lekin amalda faqat **3 tasi** ishlatiladi:

| Tur | Butun bazada | Holat |
|---|---|---|
| `income` — Kirim | 267 ta | ✅ ishlaydi |
| `expense` — Chiqim | 515 ta | ✅ ishlaydi |
| `withdrawal` — Pul yechish | 37 ta | ✅ ishlaydi |
| `debt_given` — Qarz berdim | **0 ta** | ❌ UI yo'q |
| `debt_received` — Qarz oldim | **0 ta** | ❌ UI yo'q |
| `debt_paid` — Qarz to'ladi | **0 ta** | ❌ UI yo'q |

Ya'ni qarz harakatlari moliya jurnaliga **umuman tushmaydi**.

### Taklif

Qarz to'lovi qabul qilinganda avtomatik `debt_paid` yozuvi yozilsin —
shunda «kim qachon qancha to'ladi» tarixi Tranzaksiyalarda ko'rinadi.
`debt_given` / `debt_received` esa hozircha tegilmaydi (ular boshqa
oqim — usta boshqa odamga qarz berishi; hozir kerak emas).

---

## 5. Tegilmaydigan joylar

- Kirim / Chiqim / Balans / Kassa — **tegilmaydi**
- Sof foyda, Ustalar foydasi — **tegilmaydi**
- Mavjud 10 ta `ClientDebt` — **tegilmaydi**
- Shartnomalar tabi — **tegilmaydi**
- Migratsiya — **YO'Q**

---

## 6. Bosqichlar

| Faza | Ish |
|---|---|
| **A** | Qarzlar tabi: hisoblangan qarzlar bo'limi (faqat o'qish) |
| **B** | «Rasmiy qarz qilish» tugmasi (bir bosishda `ClientDebt`) |
| **C** | Qarz to'lovi → avtomatik `debt_paid` yozuvi |

---

## 7. Savol

**Faza B kerakmi?** Ya'ni hisoblangan qarzni «rasmiy qarz» ga
aylantirish tugmasi — yoki faqat ko'rinib tursa yetarlimi?
