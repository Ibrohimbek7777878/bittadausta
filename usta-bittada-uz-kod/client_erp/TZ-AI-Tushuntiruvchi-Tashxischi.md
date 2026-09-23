# TZ — Bittada Usta AI: «Tushuntiruvchi + Tashxischi»

> Sana: 2026-08-05 | Holat: 🟡 **TASDIQ KUTILMOQDA**
> Fayllar: `client_erp/gemini_live.py`, `glive_consumer.py`,
> `static/client_erp/js/redesign/rc-actions.js`

---

## 1. Hozirgi holat (kod tekshirildi)

✨ tugma — Gemini Live **ovozli** yordamchi, 16 ta tool bilan **amal bajaradi**.

| Nima | Holat |
|---|---|
| Sahifa ochish, buyurtma yaratish, kirim/chiqim yozish | ✅ ishlaydi |
| System prompt hajmi | ~10 qator |
| Moliya mantiqi prompt'da | ❌ **umuman yo'q** |
| Prompt ko'rsatmasi | *«Ortiqcha tushuntirish berma»* — u **ishchi**, o'qituvchi emas |
| Moliya tool'i | 1 ta (`finance_summary`) — atigi 2 raqam qaytaradi |
| Yozma chat | ❌ (v2 da yashirilgan) |

**Xulosa:** «Balans nima?», «nega foydam kam?» degan savolga hozir AI
**o'zidan to'qiydi** — bu moliyaviy masalada xavfli.

---

## 2. Nima qilinadi — 3 ta qobiliyat

```
1. BILADI      → platformani to'liq (sahifalar, tugmalar, formulalar)
2. TUSHUNTIRADI → «Balans nima?», «Sof foydadan farqi?»
3. TASHXIS QO'YADI → SIZNING ma'lumotingizga qarab xatoni KO'RSATADI
```

---

## 3. 🔴 ENG MUHIM QOIDA: tashxisni AI TO'QIMAYDI

Xatolarni **oddiy kod** topadi (deterministik tekshiruvlar), AI faqat
topilganini **odam tilida gapirib beradi**.

```
❌ NOTO'G'RI:  AI ma'lumotga qarab «menimcha muammo shu» deydi
✅ TO'G'RI:    Kod tekshiradi → aniq ro'yxat qaytaradi → AI shuni tushuntiradi
```

**Sabab:** AI moliyaviy xulosa to'qisa — usta noto'g'ri qaror qabul qiladi.
Raqam va sabab **har doim koddan**, faqat **so'z** AI'dan.

---

## 4. Tashxis tekshiruvlari (jonli bazada o'lchandi)

151 ta zakaz bo'yicha bugun topilgani:

| # | Tekshiruv | Topildi | Foydaga ta'siri |
|---|---|---|---|
| 1 | Shartnoma summasi yo'q | **40 ta** (26%) | Foyda **0** chiqadi |
| 2 | Chiqim zakazga bog'lanmagan | **13 ta = 96 198 609** | Foyda **katta** ko'rinadi, hamyon kichik |
| 3 | Kirim zakazga bog'lanmagan | **16 ta = 133 315 033** | Qaysi zakazdan kelgani noma'lum |
| 4 | Zarar (shartnoma < xarajat) | **2 ta** | Haqiqiy zarar |
| 5 | Topshirilgan, pul kelmagan | **1 ta** | Qarz |
| 6 | Mijozi yo'q | **40 ta** | Qarzdorni ism bilan ko'rsatib bo'lmaydi |
| 7 | Topshirilgan, xarajat yozilmagan | 0 ta | Foyda soxta katta |
| 8 | Ulush 100% dan oshgan | 0 ta | Foyda ortiqcha taqsimlangan |

### Akkaunt kesimida (misol)

```
akkaunt          zakaz  summasiz   zakazsiz-chiqim  zarar
bigone_cl2          47         4                 0      1
jasurbek_cl2         2         1        30 500 000      0
ibragimov_cl         9         3         4 020 000      0
alijon_cl            9         5                 0      0
```

---

## 5. Suhbat namunasi

**Savol:** «Nega mening foydam kam?»

```
AI ma'lumotni tekshiradi va aytadi:

«Uch sabab topdim:

 1. 4 ta buyurtmangizda shartnoma summasi kiritilmagan.
    Ular: #331, #344, #350, #352. Foyda shartnomadan
    hisoblanadi — summa yo'q bo'lsa foyda 0 chiqadi.
    Yechim: har biriga kelishilgan summani kiriting.

 2. #259 «Office» zarar keltirgan: shartnoma 600 000,
    xarajat 2 862 222. Zarar 2 262 222.

 3. Mijozlaringizda 52 800 000 qarz turibdi — eng kattasi
    Begzod aka, 9 800 000.

Qaysi biridan boshlaymiz?»
```

**Savol:** «Xatoyim bor, topa olmadim — o'zing ko'rsat»

```
«Eng katta muammo: 30 500 000 so'mlik chiqim hech qaysi
 buyurtmaga bog'lanmagan (13 ta yozuv).

 Nima bo'ladi: bu pul hamyoningizdan chiqdi — Balans kamaydi.
 Lekin hech qaysi buyurtmaning xarajatiga qo'shilmadi —
 shuning uchun foyda haqiqatdan KATTA ko'rinadi.

 Eng kattalari:
   04.08  material     12 000 000  ← bog'lanmagan
   28.07  furnitura     8 500 000  ← bog'lanmagan

 Yechim: Tranzaksiyalar tabidan har birini ochib,
 qaysi buyurtmaga tegishli ekanini belgilang.»
```

---

## 6. Texnik reja

### 6.1 Bilim bazasi

`client_erp/ai_knowledge.py` — Bittada Ustaning to'liq tavsifi:

- **Moliya formulalari** — Balans, Kassa foyda, Sof foyda, shartnoma-asosli
  foyda, qarz, ulush, bekor qilish
- **Sahifalar va tugmalar** — har biri nima qiladi
- **Etaplar oqimi** — buyurtma yo'li
- **Tez-tez so'raladigan savollar** — «nega Balans kichik, foyda katta?»

Bu matn system-prompt'ga qo'shiladi. Manba: bugungi tushuntirishlar +
mavjud TZ fayllar.

> ⚠️ Prompt uzun bo'ladi (~3–5 KB). Har sessiyada yuboriladi — token
> narxi oshadi. Shuning uchun **ikki qavat**: qisqa asosiy prompt +
> savol turiga qarab kerakli bo'lim qo'shiladi.

### 6.2 Tashxis dvigateli

`client_erp/services/ai_diagnose.py`:

```python
def diagnose(user):
    """Deterministik tekshiruvlar. AI EMAS — oddiy kod.
    Qaytaradi: [{code, severity, title, amount, items, fix}]
    FAQAT O'QIYDI."""
```

8 ta tekshiruv (§4). Har biri: nima, qancha, qaysi zakazlar, qanday tuzatiladi.

### 6.3 Yangi tool'lar (rc-actions.js + server)

| Tool | Nima qaytaradi |
|---|---|
| `diagnose_my_finance` | Tashxis ro'yxati (§6.2) |
| `explain_metric(name)` | Balans/foyda/qarz formulasi + **sizning raqamingiz** |
| `my_debtors` | Kim qancha qarzdor |
| `contract_detail(order_id)` | Bitta shartnoma to'liq hisobi |
| `orders_without_contract` | Summasi kiritilmagan zakazlar |
| `unlinked_records` | Bog'lanmagan kirim/chiqim yozuvlari |

### 6.4 Chat — matn ASOSIY, ovoz ichida (foydalanuvchi qarori 2026-08-05)

✨ tugmasiga **TEGILMAYDI** (joyi, ko'rinishi o'zgarmaydi). Faqat
bosilganda nima ochilishi o'zgaradi:

```
✨ bosildi
   ↓
⌨️  MATNLI CHAT ochiladi (asosiy)
   ├─ savol yoziladi, javob o'qiladi
   └─ o'ng burchakda 🎤 ikonka
         ↓ bosilsa
      🎤 OVOZLI rejim (hozirgi Gemini Live)
```

Matnli rejim `ai_analysis.py` dagi mavjud fallback zanjiridan
foydalanadi (fal→github→cohere→gemini→openrouter→claude) — Gemini Live
shart emas, arzonroq. Ovozli rejim hozirgidek qoladi, tegilmaydi.

---

## 7. Tegilmaydigan joylar

- Moliya hisoblari — AI **faqat o'qiydi**, hech narsa yozmaydi/o'zgartirmaydi
- Mavjud 16 ta tool — o'zgarmaydi
- Gemini Live ovozli oqim — o'zgarmaydi (ustiga qo'shiladi)
- Tanga/tarif tizimi — o'zgarmaydi

---

## 8. Xavf tahlili

| Xavf | Daraja | Chora |
|---|---|---|
| AI moliyaviy xulosa to'qishi | 🔴 **YUQORI** | §3 — raqam va sabab faqat koddan |
| Noto'g'ri maslahat berish | 🟠 O'RTA | Tashxis «tuzatish» matni oldindan yozilgan, AI o'zi o'ylab topmaydi |
| Prompt uzayib token qimmatlashishi | 🟠 O'RTA | Ikki qavatli prompt (§6.1) |
| Boshqa foydalanuvchi ma'lumoti oqishi | 🔴 **YUQORI** | Har tool `user` bo'yicha qat'iy filtrlanadi, `scope.py` qoidasi |
| Sekinlashish | 🟡 PAST | `diagnose()` — agregat so'rovlar, N+1 yo'q |

---

## 9. Bosqichlar

| Faza | Ish |
|---|---|
| **A** | Bilim bazasi + system prompt (savolga javob bera boshlaydi) |
| **B** | `diagnose()` + `diagnose_my_finance` tool (xatoni ko'rsatadi) |
| **C** | Qolgan 5 ta tool (aniq raqamli javoblar) |
| **D** | Matnli chat (✨ → matn, ichida 🎤 → ovoz) |

---

## 10. Qabul qilingan qarorlar (2026-08-05)

| Savol | Qaror |
|---|---|
| Chat turi | ✨ tugmaga **tegilmaydi**. Bosilganda **matnli chat** ochiladi; ichida 🎤 ikonka — bosilsa ovozli rejim |
| Tashxis joyi | **Faqat AI so'ralganda**. Moliya sahifasiga tugma qo'shilmaydi — sahifa o'zgarmaydi |
