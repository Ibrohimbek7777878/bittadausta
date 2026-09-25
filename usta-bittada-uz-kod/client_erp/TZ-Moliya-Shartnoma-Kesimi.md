# TZ — Moliya sahifasi «Shartnomalar kesimi»

> Versiya: 1.0 | Sana: 2026-08-04 | Sahifa: `usta.bittada.uz/<akk>/spa/#/finance`
> Fayllar: `client_erp/serializers.py` (`serialize_finance_page`, 1002-qator),
> `static/client_erp/js/redesign/rc-finance.js` (1334 qator)
> Holat: ✅ **JORIY QILINDI** (2026-08-04) — Faza A + B.
> Qamrov: FAQAT `ibrohim_cl` (id=82) — `scope.CONTRACT_SLICE_USER_IDS`.

---

## 1. Muammo

Hozir `#/finance` — bu **oqim jurnali** (kassa daftari):

```
Kirim 69 999 628 · Chiqim 31 658 000 · Kassa foyda 38 341 628 · Balans 6 671 046
        ↓
[Tranzaksiyalar]  [Qarzlar]
        ↓
17 ta yozuv — sana bo'yicha aralash ro'yxat
```

Ro'yxatda 3 ta zakazning puli **aralashib** yotadi. «Falon shartnoma
qancha foyda berdi?» degan savolga javob **yo'q** — buni qo'lda
hisoblash kerak.

**Nega bu muhim:** biz endi foydani **shartnoma summasidan** hisoblaymiz
(`ClientOrder.contract_profit`). Ya'ni shartnoma — moliyaning **asosiy
o'lchov birligi**. Lekin moliya sahifasi hali eski, sana-asosli mantiqда.

---

## 2. Taklif — 3-chi ko'rinish: «Shartnomalar»

Mavjud ikki tab yoniga **uchinchisi** qo'shiladi. Hech narsa
olib tashlanmaydi.

```
[Tranzaksiyalar]   [Shartnomalar 5]   [Qarzlar 0]
```

### 2.1 Umumiy sarlavha (portfel)

```
┌──────────────────────────────────────────────────────────┐
│  📄 Shartnomalar portfeli                      5 ta       │
│                                                           │
│  Shartnoma summasi        120 000 000                     │
│  Olingan                   85 000 000  ███████░░░  71%    │
│  Olinmagan (qarz)          35 000 000                     │
│  Chiqim                    52 000 000                     │
│  ─────────────────────────────────────────                │
│  Sof foyda                 68 000 000        (56.7%)      │
│  Taqsimlangan              20 000 000                     │
│  Taqsimlanmagan            48 000 000                     │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Har bir shartnoma — yig'iladigan karta

```
┌──────────────────────────────────────────────────────────┐
│ ▸ #319  oshxona mebeli                    ✅ Tasdiqlangan │
│   Shartnoma 50 000 000 · Foyda 19 342 000 (38.7%)        │
└──────────────────────────────────────────────────────────┘
        ↓ bosilsa ochiladi
┌──────────────────────────────────────────────────────────┐
│ ▾ #319  oshxona mebeli                    ✅ Tasdiqlangan │
│   Mijoz: Qodir aka · 01.08.2026 · Topshirilgan            │
│                                                           │
│   Shartnoma summasi          50 000 000                   │
│   ├ Olingan                  50 000 000  ██████████ 100%  │
│   └ Qolgan                            0                   │
│                                                           │
│   Chiqim                     30 658 000                   │
│   ├ Material                 28 244 000                   │
│   ├ Transport                    70 000                   │
│   └ Boshqa                    2 344 000                   │
│                                                           │
│   ═ SOF FOYDA                19 342 000   (38.7%)         │
│   ├ Taqsimlangan              5 000 000  → Artom          │
│   └ Sizda qoldi              14 342 000                   │
│                                                           │
│   [ Yozuvlarni ko'rish (15) ]   [ Zakazga o'tish → ]      │
└──────────────────────────────────────────────────────────┘
```

### 2.3 Uch xil holat — rang bilan ajraladi

| Belgi | Holat | Foyda qanday hisoblanadi |
|---|---|---|
| ✅ yashil | Tasdiqlangan `ClientContract` bor | `contract_amount − chiqim` |
| 🟡 sariq | Shartnoma yuborilgan, tasdiqlanmagan | Xuddi shunday, lekin «tasdiqlanmagan» yorlig'i bilan |
| ⚪ kulrang | Rasmiy shartnoma yo'q (zaklad/final_price) | Eski usul — `zaklad_amount` yoki `final_price` |
| 🔵 ko'k | **Shartnomasiz** (zakazga bog'lanmagan pul) | Alohida guruh — §4.1 |

> **Bugungi holat:** 73 akkauntda 35 shartnoma bor, shundan 16 tasi
> tasdiqlangan. Ya'ni ko'p zakazlar hali ⚪ kulrang bo'ladi — bu
> normal, va aynan shu foydalanuvchini shartnoma rasmiylashtirishga
> undaydi.

---

## 3. Hisoblash mantiqi

### 3.1 Bir shartnoma bo'yicha

```
shartnoma_summasi = order.contract_amount     ← mavjud property, TEGILMAYDI
olingan           = Σ(income yozuvlari, order=X, is_reversal=False)
                    − Σ(reversal income)
qolgan            = shartnoma_summasi − olingan       (manfiy bo'lsa 0)
ortiqcha          = olingan − shartnoma_summasi       (musbat bo'lsa «Ortiqcha kirim»)
chiqim            = Σ(expense yozuvlari, order=X)
sof_foyda         = shartnoma_summasi − chiqim        ← contract_profit bilan BIR XIL
taqsimlangan      = Σ(withdrawal yozuvlari, order=X)  − Σ(BEKOR qilinganlar)
qoldiq            = sof_foyda − taqsimlangan
```

### 3.2 🔴 KRITIK: `withdrawal` chiqim EMAS

Ma'lumotda ko'rindi — foyda taqsimoti `withdrawal` turida yoziladi:

```
withdrawal  4 999 907  order=319  «Artom»
income      4 999 907  order=319  «BEKOR: Artom ulushi qaytar»   ← reversal
```

**Qoida:** `withdrawal` — foydaning **taqsimlanishi**, tannarx emas.
Uni `chiqim`ga qo'shish = foydani ikki marta kamaytirish.
Shuning uchun u alohida qatorda («Taqsimlangan») ko'rsatiladi.

**Reversal juftliklari** (`is_reversal=True` yoki `BEKOR:` bilan
boshlanadigan) o'zaro qisqartiriladi — aks holda #319 da 5 ta withdrawal
va 4 ta bekor qilish ko'rinib, 25 mln taqsimlangandek chiqadi
(aslida 5 mln).

### 3.3 Jami — Kirim kartasi bilan MOS kelishi SHART

```
Σ(barcha shartnoma kartalari · olingan) + Shartnomasiz guruh = Kirim kartasi
Σ(barcha shartnoma kartalari · chiqim)  + Shartnomasiz guruh = Chiqim kartasi
```

Agar mos kelmasa — sahifa pastida qizil ogohlantirish chiqadi
(«Nomuvofiqlik: 120 000 — texnik xizmatga murojaat qiling»).
**Jimgina yashirish taqiqlanadi.**

---

## 4. Chekka holatlar

### 4.1 Zakazga bog'lanmagan pul (832 dan 56 ta = 7%)

Bu yozuvlarda `order = NULL`. Ular ham ko'rinishi SHART, aks holda
jami mos kelmaydi. Ular oxirgi guruhda:

```
┌──────────────────────────────────────────────────────────┐
│ ▸ 🔵 Shartnomasiz                              56 yozuv   │
│   Kirim 4 200 000 · Chiqim 1 850 000                      │
│   ⓘ Bu pullar hech qaysi zakazga bog'lanmagan             │
└──────────────────────────────────────────────────────────┘
```

Ichida har bir yozuv yonida **«Zakazga bog'lash»** tugmasi —
bosilsa zakaz tanlanadi va yozuv o'sha shartnomaga ko'chadi.
*(Bu ixtiyoriy — Faza C.)*

### 4.2 Davr filtri — ENG MUHIM QAROR

Shartnoma **oylar bo'ylab cho'ziladi**: iyulda boshlanib avgustda
tugaydi. «Shu oy» filtri bilan ko'rsatilsa — chiqim iyulda, kirim
avgustda bo'lib, foyda **noto'g'ri** chiqadi.

**Taklifim:** shartnoma kartasi HAR DOIM **to'liq umr bo'yi** ko'rsatiladi
(filtrdan qat'i nazar), filtr esa **qaysi shartnomalar ro'yxatga tushishini**
belgilaydi:

```
«Shu oy» tanlansa → shu oyda harakat bo'lgan shartnomalar ro'yxati,
                     lekin har birining raqamlari — BOSHIDAN OXIRIGACHA
```

Karta tepasida kichik izoh: *«Raqamlar shartnoma boshidan beri»*.

> Alternativa (tavsiya etilmaydi): filtrni raqamlarga ham qo'llash —
> soddaroq, lekin foyda foizi yolg'on chiqadi.

### 4.3 Manfiy foyda

Shartnoma summasi chiqimdan kam bo'lsa (masalan #259 «Office»:
600 000 vs 2 862 222) — qizil rangda, «⚠️ Zarar» yorlig'i bilan.
Yashirilmaydi.

### 4.4 Jamoa ulushi bilan kelgan pul

Boshqa akkauntdan kelgan ulush (`is_team_share`) — bu **sizning
shartnomangiz emas**. U «Shartnomasiz» guruhida, `🤝 Jamoa ulushi`
yorlig'i bilan.

---

## 5. Texnik reja

### 5.1 Backend — `serializers.py`

Yangi funksiya (mavjudlarga TEGILMAYDI):

```python
def _contract_slices(user, period, date_from, date_to, ym):
    """Shartnoma kesimi. FAQAT O'QIYDI — hech narsa yozmaydi."""
    # 1 ta so'rov: order bo'yicha guruhlangan agregat
    #    .values('order').annotate(Sum(...))  — N+1 YO'Q
    # 2 ta so'rov: orderlar + contractlar (prefetch)
    # Qaytaradi: [{order_id, title, customer, status, badge,
    #              contract_amount, received, remaining, expense,
    #              expense_by_cat, profit, profit_pct,
    #              distributed, left, record_count}]
```

`serialize_finance_page` javobiga bitta yangi kalit qo'shiladi:

```python
'contracts': {
    'items':   [...],       # shartnoma kartalari
    'orphan':  {...},       # 🔵 shartnomasiz guruh
    'totals':  {...},       # portfel sarlavhasi
    'mismatch': 0,          # nomuvofiqlik (0 bo'lishi kerak)
}
```

> ⚠️ **Poll-payload tekshiruvi** (memory qoidasi): `#/finance`
> WS orqali yuklanadi. 5 shartnoma ≈ 3 KB — xavfsiz. Lekin 100+
> shartnomali akkaunt uchun **sahifalash** (20 tadan) qo'yiladi,
> `expense_by_cat` esa faqat karta ochilganda alohida so'raladi.

### 5.2 Frontend — `rc-finance.js`

| Nima | O'zgarish |
|---|---|
| `_tab` | `'records'` / `'debts'` yoniga `'contracts'` |
| `template()` | Uchinchi tab tugmasi |
| **`_contractsHtml()`** | yangi — portfel + kartalar |
| **`_contractCard()`** | yangi — bitta karta (yig'iladigan) |
| **`_toggleContract(id)`** | yangi — ochish/yopish |
| `bind()` | Yangi tab va kartalar hodisalari |

Dark + Light ikkalasi ham (memory qoidasi).
`spa_redesign.html` da `?v=N` **oshiriladi** (memory qoidasi).

### 5.3 Tegilmaydigan joylar

- `serialize_finance_page` mavjud kalitlari — **o'zgarmaydi**
- Kirim / Chiqim / Kassa foyda / Balans kartalari — **o'zgarmaydi**
- `ClientOrder.contract_profit` / `contract_amount` — **o'zgarmaydi**
- Tranzaksiyalar va Qarzlar tablari — **o'zgarmaydi**
- Pul yechish, qarz, ustalar foydasi oqimlari — **o'zgarmaydi**
- Hech qanday migratsiya **YO'Q** — barcha ma'lumot allaqachon bor

---

## 6. Xavf tahlili

| Xavf | Daraja | Chora |
|---|---|---|
| Jami Kirim/Chiqim bilan mos kelmasligi | 🔴 **YUQORI** | §3.3 nomuvofiqlik tekshiruvi + qizil ogohlantirish; `finance_selfcheck` ga 7-invariant qo'shiladi |
| `withdrawal` chiqim deb sanalishi | 🔴 **YUQORI** | §3.2 — alohida qatorda, testda tekshiriladi |
| Reversal juftlik ikki marta sanalishi | 🟠 O'RTA | `is_reversal` + `BEKOR:` prefiksi bo'yicha qisqartirish |
| N+1 so'rov (100 shartnoma = 300 so'rov) | 🟠 O'RTA | `.values().annotate()` bilan bitta agregat so'rov |
| Payload shishishi | 🟠 O'RTA | 20 tadan sahifalash, `expense_by_cat` — lazy |
| Davr filtri chalkashligi | 🟡 PAST | §4.2 — karta tepasida aniq izoh |
| Mavjud moliyaga ziyon | 🟢 **YO'Q** | Faqat o'qish; hech qaysi mavjud funksiya o'zgarmaydi |

**Moliyaga ta'sir: 0.** Bu — yangi **ko'rinish**, yangi hisob emas.
Bitta ham yozuv yaratilmaydi/o'zgartirilmaydi.

---

## 7. Bosqichlar

| Faza | Ish | Natija |
|---|---|---|
| **A** | Backend `_contract_slices()` + jami tekshiruvi | ✅ bajarildi |
| **B** | «Shartnomalar» tabi + kartalar (Dark/Light) | ✅ bajarildi |
| **C** | *(ixtiyoriy)* Shartnomasiz yozuvni zakazga bog'lash | ⏸ keyinga |
| **D** | `finance_selfcheck` ga 7-invariant | ⏸ keyinga |

### O'lchangan natijalar (2026-08-04)

| Akkaunt | Shartnoma | So'rov | Vaqt | Nomuvofiqlik |
|---|---|---|---|---|
| ibrohim_cl | 2 | 11 | 40 ms | 0 ✅ |
| artom_cl | 4 | 11 | 14 ms | 0 ✅ |
| bigone_cl2 | 53 | 11 | 21 ms | 0 ✅ |

So'rov soni shartnoma soniga **bog'liq emas** (11 ta, tekis).

### Ish davomida topilgan 2 narsa

**1. N+1 (tuzatildi).** `ClientOrder.contract_amount` propertysi ichida
`self.contracts.filter(...)` bor — `.filter()` prefetch keshini chetlab
o'tadi. 53 shartnoma = **64 so'rov** edi. Formula prefetch keshidan
(`.all()`) hisoblanadigan qilindi → **11 so'rov**. Natija property bilan
1:1 mos ekani barcha kartada tekshirildi.

**2. «Kirim» kartasi bekor qilingan taqsimotni ham sanaydi.**
ibrohim_cl: Kirim kartasi 69 999 628, mijozdan kelgan haqiqiy pul
**50 000 000**; farq 19 999 628 — 4 ta bekor qilingan ulushning qaytishi.
Kassa nuqtai nazaridan to'g'ri (pul haqiqatan qaytdi), lekin tushum emas.
Yashirilmadi — tabda ochiq tushuntiriladi (`reversal_income`).

Deploy: `?v=N` oshirish → `collectstatic` → `sudo systemctl reload bittada-manager`.

---

## 8. Qabul qilingan qarorlar

| Savol | Qaror |
|---|---|
| Davr filtri | Raqamlar **umr bo'yi**, filtr faqat ro'yxatni cheklaydi (§4.2) |
| Tartib | **Qarzi borlar tepada**, qarz miqdori bo'yicha kamayish; keyin foyda bo'yicha |
| Faza C | Keyinga qoldirildi |

### 8.1 Qo'shimcha talab (2026-08-04, foydalanuvchi)

> «qaysidan qancha qarz qolgan ham ko'rinish kerak … kimdan qancha pul
> olindi, qancha foyda tushdi va kim bizdan qancha qarz qolgan … ixcham
> va tushunarli tarzda»

Bajarildi:
- Har kartada **Bizga qarz** va **Foyda** — asosiy ikki ko'rsatkich sifatida
- Mijoz ismi sarlavhada, to'lov progressi chiziq bilan (olindi %)
- Qarzli shartnomalar **tepada**, chap chetida qizil chiziq
- Portfel sarlavhasida: jami qarz + nechta shartnomada qarz borligi
- Ikki xil qarz ajratildi: `remaining` (shartnoma bo'yicha kelmagan pul)
  va `debt_open` (qo'lda ochilgan rasmiy `ClientDebt` yozuvi)
