# TZ — Kontakt-asosli foyda taqsimoti (H1 to'liq)

> Versiya: 1.0 | Sana: 2026-08-04 | Loyiha: Bittada Usta (`client_erp`)
> Holat: 🟡 **TASDIQ KUTILMOQDA** — kod TZ tasdiqlangach yoziladi.
> Bog'liq: `TZ-Shartnoma-Foyda-Jamoa-Moliya.md` §0.5-H1

---

## 1. Muammo (jonli bazadan o'lchangan)

Hozir foyda ulushi **erkin matn** bilan yoziladi:

| Ko'rsatkich | Qiymat |
|---|---|
| `ClientOrderProfitShare` yozuvlari | **144 ta** |
| Ulardan real akkauntga bog'langani (`member` FK) | **0 ta** |
| Ro'yxatdan o'tgan faol foydalanuvchilar | 73 ta |
| Faol jamoa a'zoliklari | 20 ta |

Bundan tashqari `rc-order-detail.js:_profitEdit` da **qattiq yozilgan** (hardcoded)
ismlar bor — har bir foydalanuvchiga, hatto ularni tanimasa ham, ko'rinadi:

```js
if (!shares.length) shares = [
  { name: 'Oybek aka', percent: 0 },
  { name: 'Ganisher',  percent: 0 },
  { name: 'Rustam aka', percent: 0 },
];
```

### Bundan kelib chiqadigan xavflar

1. **Pul noto'g'ri odamga tushishi** — ulush faqat ism bo'yicha akkauntga
   moslashtiriladi. Bazada bir xil ismli akkauntlar bor (`dilshod` ×2), 26%
   ismda imlo xatosi (`gʻanisher`, `iibrohim`, `nrsulton`, `rstam aka`).
2. **Insider fraud** — H2 gate qo'yilgunga qadar a'zo ismini boshqa ustanikiga
   o'zgartirib, uning ulushini o'z balansiga oldirishi mumkin edi.
3. **Kimga tushgani bazada qayd etilmaydi** (H1-qisman `WithdrawalLine.user`
   qo'shildi, lekin `ProfitShare` hali ismga tayanadi).
4. **Begona ismlar** — yangi foydalanuvchi buyurtma ochib «Foyda taqsimlash»
   bosganda tanimagan 3 ta ism chiqadi.

---

## 2. Yechim — faqat KONTAKT (ro'yxatdan o'tgan foydalanuvchi)

Foyda **faqat Bittada'da ro'yxatdan o'tgan** foydalanuvchilar orasida
taqsimlanadi. Ism qo'lda yozilmaydi — ro'yxatdan tanlanadi, xuddi
**«Jamoaga a'zo qo'shish»** dagi kabi.

### 2.1 Kontakt manbalari (prioritet tartibida)

| # | Manba | Izoh |
|---|---|---|
| 1 | **O'zi (egasi)** | «🧑‍💼 Men (buyurtma egasi)» — statik, o'chirilmaydi |
| 2 | **Jamoa a'zolari** (`ClientTeamMember`, `status='active'`) | Egasining o'z jamoasi + a'zo bo'lgan jamoalari |
| 3 | **Shu zakazga ulashilganlar** (`ClientOrderPermission`) | Zakaz bo'yicha aniq ruxsat berilganlar |

Uchtasi birlashtirilib, dublikatsiz ro'yxat chiqadi.

### 2.2 Ko'rinish formati (foydalanuvchi so'rovi)

```
👤 Ibrohim · ...6003
👤 ClaudeAI · ...0001
```

- **Asosiy** — `full_name` (bo'lmasa `username`)
- **Yonida** — telefon raqamining **oxirgi 4 raqami** (`...6003`)
  Sabab: bir xil ismli ikki kishini ajratish uchun. To'liq raqam
  ko'rsatilmaydi (maxfiylik).
- Telefon yo'q bo'lsa — faqat ism, `...----` ko'rsatilmaydi.

### 2.3 Kontakt yo'q bo'lsa

Agar egasining jamoasi yo'q va zakaz hech kimga ulashilmagan bo'lsa —
tushuntirish + tugma:

> 👥 **Hali kontakt yo'q**
> Foydani bo'lishish uchun avval jamoangizga odam qo'shing.
> Ular Bittada'da ro'yxatdan o'tgan bo'lishi kerak.
> **[👥 Jamoaga a'zo qo'shish]**

Bu holda foydalanuvchi 100% ni o'ziga (Men) yozib ketishi mumkin.

---

## 3. Ma'lumot modeli o'zgarishi

### 3.1 `ClientOrderProfitShare`

```python
member = FK(ClientTeamMember, null=True)   # MAVJUD — deyarli ishlatilmaydi
user   = FK(ClientUser, null=True)         # YANGI — ASOSIY bog'lanish
name   = CharField(100)                    # QOLADI — faqat KO'RSATISH uchun
```

**Nega `member` emas, `user`:** a'zo jamoadan chiqarilsa `ClientTeamMember`
o'chadi, lekin tarixiy ulush qolishi kerak. `ClientUser` esa doimiy.

**`name` nima uchun qoladi:** eski 144 ta yozuv uchun (migratsiya qilib
bo'lmaydiganlari) va ko'rsatish uchun snapshot (a'zo keyin ismini
o'zgartirsa ham eski hisobotda o'sha paytdagi ism turadi).

### 3.2 Migratsiya (mavjud 144 ta yozuv)

Avtomatik bog'lash **QILINMAYDI** — ism-moslashtirish aynan tuzatmoqchi
bo'lgan xavf. Buning o'rniga:

- Eski yozuvlar `user=NULL` bo'lib qoladi → hisobotlarda **⚠️ belgisi** bilan
  ko'rsatiladi («eski, akkauntga bog'lanmagan»).
- Yangi taqsimotlar faqat kontaktdan.
- Egasi xohlasa eski ulushni qayta taqsimlab, kontaktga bog'lashi mumkin.

---

## 4. UI o'zgarishlari

### 4.1 «Foyda taqsimlash» oynasi

**Hozir:** 3 ta qattiq yozilgan ism + erkin matn maydonlari.

**Bo'ladi:**

```
Foyda: 10 850 000

🧑‍💼 Men (buyurtma egasi)          [ 40 ]%   4 340 000
👤 Ibrohim · ...6003               [ 35 ]%   3 797 500      ✕
👤 ClaudeAI · ...0001              [ 25 ]%   2 712 500      ✕

[ + Kontakt qo'shish ]

Jami: 100% ✅
[ ✓ Saqlash ]
```

- **«+ Kontakt qo'shish»** → pastdan ro'yxat chiqadi (jamoa a'zolari +
  ulashilganlar), bosib tanlanadi. Allaqachon qo'shilganlar ro'yxatda
  ko'rinmaydi.
- Ism maydoni **tahrirlanmaydi** (faqat foiz).
- «Men» qatori o'chirilmaydi.

### 4.2 «Pul yechish» oynasi

Xuddi shu tamoyil — erkin ism kiritish olib tashlanadi, faqat taqsimotda
belgilangan kontaktlar chiqadi.

### 4.3 «Ustalar foydasi» paneli (Moliya sahifasi)

- Kontaktga bog'langan qatorlar — ism + `...4 raqam`
- Eski (bog'lanmagan) qatorlar — ⚠️ belgisi bilan, «eski usul» izohi

---

## 5. Eslatma-bildirishnoma (foydalanuvchi so'rovi)

> «moliyaga kirganimda va test jarayonida menga xabar bersin —
> ustalar foydasini bo'lib bering deb»

**Qoida:** Moliya sahifasi ochilganda, agar quyidagi shart bajarilsa —
sahifa tepasida **eslatma banneri** chiqadi:

- topshirilgan (`delivered`) buyurtma bor,
- uning foydasi > 0,
- lekin `ClientOrderProfitShare` yozuvi **yo'q** (taqsimlanmagan).

```
💰 Foyda taqsimlanmagan
2 ta topshirilgan buyurtmada jami 15 200 000 so'm foyda bor,
lekin hali bo'lishilmagan.
[ Ko'rish va bo'lish → ]
```

Bosilsa — «Ustalar foydasi» paneli ochilib, «⚠ Taqsimlanmagan» ro'yxatiga
o'tadi (mavjud `_openUndistributed`).

**Bu bildirishnoma faqat ko'rsatadi — pul harakatini avtomatlashtirmaydi**
(H6 bekor qilish bor, lekin avtomatik pul o'tkazish hali xavfli).

Mavjud oy-oxiri Telegram eslatmasi (`run_month_end_profit_reminders`,
F9-b) o'z holicha qoladi — bu unga qo'shimcha, ilova ichidagi versiya.

---

## 6. Darhol bajariladigan (TZ tasdig'isiz, xavfsiz)

Foydalanuvchi aniq so'ragan, kutish shart bo'lmagan ish:

1. **Qattiq yozilgan ismlarni olib tashlash** (`_profitEdit` dagi
   `Oybek aka / Ganisher / Rustam aka`) — ular hech kimga tegishli emas,
   yangi foydalanuvchini chalg'itadi.
2. **Test buyurtmasi #327** foyda ulushlari — allaqachon o'chirildi
   (2026-08-04 reset).

---

## 7. Bosqichlar

| Faza | Ish | Migratsiya |
|---|---|---|
| **A** | Qattiq ismlarni olib tashlash + «kontakt yo'q» holati | ❌ |
| **B** | `ProfitShare.user` FK + kontakt-picker UI | ✅ |
| **C** | «Pul yechish» ni ham kontaktga o'tkazish | ❌ |
| **D** | «Ustalar foydasi» panelida ⚠️ belgisi (eski yozuvlar) | ❌ |
| **E** | Moliya sahifasidagi eslatma-banner | ❌ |

---

## 8. Ochiq savollar

1. **Jamoasi yo'q, lekin ustalari bor foydalanuvchi nima qiladi?**
   Taklif: ustani Bittada'ga taklif qilish (mavjud «Jamoaga taklif»
   mexanizmi — telefon raqami bilan). Muqobil: `ClientProfitPerson`
   (akkauntsiz ism ro'yxati) saqlanib qolsin, lekin **pul yozilmaydi**,
   faqat hisobot uchun.
2. **Eski 144 ta ulushni qo'lda bog'lash kerakmi?** Yoki `NULL` holida
   qolaversinmi (⚠️ belgisi bilan)?
3. Telefon oxirgi 4 raqami — **maxfiylik** nuqtai nazaridan qabul qilinadimi?
