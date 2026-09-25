# TZ — «Menga qolgan foyda» ko'rsatkichi

> Sana: 2026-08-05 | Holat: 🟡 **TASDIQ KUTILMOQDA**
> So'rov: *«foyda umumiy emas, akkaunt egasiga tegadigan ulushni hisoblashi kerak»*
> Fayllar: `client_erp/serializers.py`, `static/client_erp/js/redesign/rc-finance.js`

---

## 1. Talab

Hozir foyda **to'liq** ko'rsatiladi:

```
Zakaz foydasi   10 738 000     ← kartada shu
```

Lekin ustalarga ulush berilgan bo'lsa, egaga kamrog'i qoladi:

```
Zakaz foydasi   10 738 000
Ustalarga        −3 000 000
────────────────────────────
Egaga qoldi       7 738 000    ← haqiqatda shuncha
```

---

## 2. 🔴 ENG MUHIM TOPILMA — zakaz kesimida hisoblab bo'lmaydi

Jonli bazada o'lchandi (2026-08-05):

| Ko'rsatkich | Qiymat |
|---|---|
| Jami yechim (`withdrawal`) | 206 135 370 (37 ta) |
| Bekor qilingan | −19 999 628 (4 ta) |
| **SOF taqsimlangan** | **186 135 742** |
| Zakazga **bog'langan** | 74 819 535 (13 ta) — **40%** |
| Zakazga **bog'lanmagan** | **131 315 835 (24 ta) — 60%** |

### `bigone_cl2` da holat yanada aniq

```
jami yechim         : 99 561 700  (8 ta)
zakazga bog'langan  :          0  (0 ta)   ← BITTA HAM YO'Q
bog'lanmagan        : 99 561 700  (8 ta)
```

### Nega shunday

Bog'lanmagan yechimlar — **akkaunt darajasidagi** taqsimot:

```
34 726 895  Oybek aka      «Foyda taqsimoti»
22 820 531  Rustam aka     «Foyda taqsimoti»
21 828 334  Ganisher       «Foyda taqsimoti»
19 843 940  Nursulton      «Foyda taqsimoti»
```

Usta oy oxirida **umumiy foydani** sheriklariga bo'ladi — qaysi zakazdan
ekanini ajratmaydi. Bu tabiiy ish uslubi.

### Xulosa

Agar «egaga qolgan = zakaz foydasi − o'sha zakazdagi taqsimot» qilsak:
- `bigone_cl2` uchun taqsimot **har doim 0** → hech narsa o'zgarmaydi
- 60% hollarda raqam **noto'g'ri** (katta ko'rsatadi)

**Shuning uchun asosiy hisob AKKAUNT darajasida bo'lishi kerak.**

---

## 3. Yechim — ikki daraja

### 3.1 Akkaunt darajasi (ASOSIY — hamma uchun ishlaydi)

Moliya sahifasida yangi ko'rsatkich:

```
┌────────────────────────────────────────┐
│  💰 Sof foyda           111 794 000    │
│  👷 Ustalarga berildi   −99 561 700    │
│  ══════════════════════════════════    │
│  🧑‍💼 MENGA QOLDI          12 232 300    │
└────────────────────────────────────────┘
```

Formula:
```
menga_qoldi = sof_foyda − (yechimlar − bekor qilinganlar)
```

**Barcha yechimlar** sanaladi — zakazga bog'langani ham, bog'lanmagani ham.
Shuning uchun har akkauntda to'g'ri ishlaydi.

> ⚠️ Bu yerda «yechim» ichida ustaning O'ZIGA olgani ham bor
> (masalan `🧑‍💼 Men (buyurtma egasi) — 6 671 047`). U ham foydadan
> chiqqan pul, shuning uchun sanaladi. Ya'ni «menga qoldi» =
> **hali taqsimlanmagan** foyda.

### 3.2 Zakaz darajasi (FAQAT bog'langanda)

Shartnomalar tabida allaqachon bor:
```
Ulushga berdik    5 000 000
Sizga qoldi      14 342 000
```

Bu **saqlanadi**, lekin taqsimot bog'lanmagan bo'lsa qatorlar
**ko'rsatilmaydi** (hozir ham shunday — 0 bo'lsa chiqmaydi).

Qo'shiladi: agar akkauntda bog'lanmagan yechim bo'lsa, tab pastida izoh:

> ⓘ Sizda 99 561 700 so'm taqsimot hech qaysi zakazga bog'lanmagan —
> shuning uchun zakazlar kesimida ko'rinmaydi. Umumiy hisob yuqorida.

---

## 4. Qaysi joyda qaysi raqam

| Joy | Hozir | Bo'ladi |
|---|---|---|
| Moliya → **Sof foyda** kartasi | to'liq foyda | **to'liq foyda** (o'zgarmaydi) |
| Moliya → yangi qator | — | **🧑‍💼 Menga qoldi** (§3.1) |
| Bosh sahifa → **Foyda** | to'liq foyda | **to'liq foyda** (o'zgarmaydi) |
| Shartnomalar tabi | ulush + qoldiq | o'zgarmaydi + izoh |
| Buyurtma sahifasi | to'liq foyda | o'zgarmaydi |

**Nega «Sof foyda» o'zgarmaydi:** u — *«bu oy qancha ishlab topdim»*
degan savolga javob. Ulush — keyingi qadam (kimga bo'ldim). Ikkalasi
alohida raqam bo'lishi kerak, bittasi ikkinchisini almashtirmaydi.

---

## 5. Tegilmaydigan joylar

- `contract_profit` formulasi — **o'zgarmaydi**
- `sof_foyda.total` — **o'zgarmaydi**
- Balans / Kassa / Kirim / Chiqim — **umuman tegilmaydi**
- Ulush taqsimoti oqimi (`handle_profit_*`) — **tegilmaydi**
- Migratsiya — **YO'Q** (barcha ma'lumot bor)

**Faqat yangi KO'RSATKICH qo'shiladi. Hech qaysi mavjud raqam o'zgarmaydi.**

---

## 6. Xavf tahlili

| Xavf | Daraja | Chora |
|---|---|---|
| Bog'lanmagan taqsimot noto'g'ri hisoblanishi | 🔴 **YUQORI** | §3.1 — akkaunt darajasida BARCHA yechim sanaladi |
| Bekor qilingan taqsimot ikki marta sanalishi | 🟠 O'RTA | `is_reversal` ayiriladi (mavjud naqsh) |
| Manfiy «menga qoldi» chiqishi | 🟠 O'RTA | Yechim foydadan ko'p bo'lsa — bu HAQIQAT, qizil ko'rsatiladi + izoh |
| Davr filtri chalkashligi | 🟠 O'RTA | Sof foyda davrga bog'liq, yechim ham SHU DAVRDAN olinadi |
| Boshqa hisobotlarga ta'sir | 🟢 YO'Q | Faqat qo'shiladi, hech narsa o'zgarmaydi |

---

## 7. Chekka holat — manfiy qoldiq

`bigone_cl2` misolida davr «Hammasi» bo'lsa:
```
Sof foyda      111 794 000
Yechilgan       99 561 700
Menga qoldi     12 232 300   ✅ musbat
```

Lekin «Shu oy» bo'lsa:
```
Sof foyda                0   (avgustda topshirilmagan)
Yechilgan                0
Menga qoldi              0
```

Ba'zi oyda yechim foydadan ko'p bo'lishi mumkin (oldingi oy foydasidan
yechilgan). Bunda manfiy chiqadi — bu **xato emas**, shunday izoh bilan
ko'rsatiladi:

> ⚠️ Bu davrda foydadan ko'proq yechilgan — farq oldingi oylar
> foydasidan olingan.

---

## 8. Bosqichlar

| Faza | Ish |
|---|---|
| **A** | Backend: `owner_left` hisobi (`serialize_finance_page`) |
| **B** | UI: «🧑‍💼 Menga qoldi» qatori |
| **C** | Shartnomalar tabida bog'lanmagan taqsimot izohi |

---

## 9. Sinov

1. `bigone_cl2` «Hammasi»: 111 794 000 − 99 561 700 = **12 232 300**
2. `ibrohim_cl` «Shu oy»: sof foyda 43 385 000, yechim 31 670 582,
   BEKOR qilingan −19 999 628 → sof taqsimot 11 670 954 → **31 714 046**
   *(TZ yozilganda bekor qilinganlar hisobga olinmagan edi — kod to'g'ri)*
3. Yechimi yo'q akkauntda «Menga qoldi» = Sof foyda (farq yo'q)
4. 73 akkauntda `serialize_finance_page` — 0 xato, mavjud raqamlar o'zgarmagan
