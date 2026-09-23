# TZ — Tanga to'lovini adolatli qilish + o'lchov joriy etish

> Sana: 2026-08-05 | Holat: 🟡 **TASDIQ KUTILMOQDA**
> Asos: `client_erp/HISOBOT-Tanga-Token-Narx.md`
> Fayllar: `client_erp/glive_consumer.py`, `client_erp/services/coins.py`,
> `client_erp/models/billing.py` (+1 migratsiya)

---

## 1. Muammo (o'lchangan)

To'lov **noto'g'ri paytda** olinadi — sessiya ochilishi bilan:

```
glive_consumer.py:202
    self._charged = await self._charge()     ← sessiya ochilishi bilan 2 tanga
```

Jonli baza (15.07 – 03.08, 95 sessiya):

| Ko'rsatkich | Qiymat |
|---|---|
| 30 soniya ichida qayta ochilgan | **67 ta (71%)** |
| Sessiyalar orasidagi median | **11 soniya** (eng kami 3 s) |
| Bekorga yechilgan | **134 tanga ≈ 134 000 UZS** |

Odam tugmani bosdi → ulanmadi yoki darrov yopdi → qayta bosdi.
Har safar 2 tanga, AI esa ishlamadi.

**Bu narx muammosi EMAS** — marja 88–94%. Bu *hisoblash paytining* muammosi.

---

## 2. Yechim — 4 qadam

### 2.1 To'lov ochilishda emas, BIRINCHI GAPDA

```
Sessiya ochildi        → tanga YETARLIMI tekshiriladi (hozirgidek, o'zgarmaydi)
Foydalanuvchi gapirdi  → ANA ENDI 2 tanga yechiladi
Gapirmay yopdi         → 0 tanga
```

**Kod:**
- `_on_start` da `_charge()` CHAQIRILMAYDI (gate `can_use_live` qoladi)
- `_on_audio` ichida birinchi haqiqiy audio kelganda `_ensure_charged()`
- `_ensure_charged()` sessiyada bir marta ishlaydi (`self._charged` bayrog'i)

> ⚠️ Audio oqimi uzluksiz keladi (mikrofon ochilishi bilan jimlik ham).
> Shuning uchun «birinchi audio» YETARLI EMAS — mikrofon yoqilishi bilanoq
> to'lov ketardi. **Shart:** kamida `MIN_AUDIO_MS = 1500` ms audio yuborilgan
> BO'LSIN (ya'ni odam haqiqatan gapirgan). Buni yuborilgan bayt hajmidan
> hisoblaymiz: PCM16 mono 16 kHz → 32 000 bayt/soniya.

### 2.2 Qayta ulanish oynasi — 50 soniya

Internet uzildi / telefon qulflandi / sahifa yangilandi → qayta ulanadi.
Ikkinchi marta to'lov OLINMASIN.

```
Oxirgi gemini_live to'lovidan 50 soniya ichida yangi sessiya
    → o'sha to'lovning DAVOMI, qayta olinmaydi
```

**Kod:** `coins.py` ga `recently_charged(user, action_key, window_sec=50)` —
`CoinLedger` dan oxirgi `spend` yozuvining vaqtini tekshiradi.

### 2.3 O'lchov — `ClientAiUsage`

| Maydon | Manba | Ishonchlilik |
|---|---|---|
| `user`, `kind` (live/chat/image) | — | ✅ |
| `started_at`, `ended_at`, `duration_sec` | timestamp | ✅ **har doim** |
| `audio_ms_in` | yuborilgan bayt / 32 | ✅ |
| `tokens_in`, `tokens_out` | Gemini `usage_metadata`, matnda `prompt_tokens` | 🟡 bo'lsa |
| `coins_charged` | yechilgan tanga | ✅ |
| `charged_reason` | 'first_audio' / 'reuse_window' / 'skipped' | ✅ |

> `fal` provayderi token qaytarmaydi (`return text, 0, 0`) — shuning uchun
> **davomiylik asosiy o'lchov**, token qo'shimcha.

Migratsiya: 1 ta yangi jadval. Mavjud modellarga TEGILMAYDI.

### 2.4 Uzoq sessiya himoyasi

Hisobotga ko'ra ~29 daqiqadan uzun suhbat 2 tangaga zarar.

- **20-daqiqa:** ogohlantirish (`{type:'warn', detail:'5 daqiqa qoldi'}`)
- **25-daqiqa:** **AVTOMATIK TO'XTATISH** + «Davom etish» tugmasi (yana 2 tanga)

> Foydalanuvchi qarori (2026-08-05): 25 daqiqa. Zarar chegarasi ~29 daqiqa
> bo'lgani uchun 25 da to'xtatish xavfsiz chekka qoldiradi.

### 2.5 Tekin AI — limit + token tejash (2026-08-05 talab)

**Muammo:** matnli chat hozir mutlaqo bepul (tanga yechmaydi) va tekin
kalitlar hovuzidan ishlaydi. Foydalanuvchilar uni bekorga ham ishlatyapti —
tekin kalitlar limiti tez tugaydi.

#### 2.5.1 O'lchangan token sarfi

| Nima | Token |
|---|---|
| Chat: «Balansim qancha?» | 558 |
| Chat: «Nega foydam kam?» | 1 005 |
| Live: system prompt (har sessiyada) | **1 396** |

#### 2.5.2 Limitlar (kunlik, foydalanuvchiga)

| Limit | Qiymat | Nega |
|---|---|---|
| Xabar soni | **30 / kun** | Halol foydalanuvchiga yetarli |
| Token byudjeti | **50 000 / kun** | ~50–90 ta savolga teng |
| Xabarlar orasi | **3 soniya** | Spam/tasodifiy ikki bosishdan |

Limit tugasa — do'stona xabar: *«Bugungi AI limiti tugadi. Ertaga davom
etasiz yoki tarifni kengaytiring.»* Xatolik emas, taqiq emas.

> ⚠️ Limit `ClientAiUsage` (Faza C) yozuvlaridan sanaladi — shuning uchun
> **F fazasi C ga bog'liq**. Alohida hisoblagich yaratilmaydi.

#### 2.5.3 Token tejash (kodda)

| O'zgarish | Tejash |
|---|---|
| Bilim bo'limlari: 3 → **2 ta** | ~120 tok/savol |
| Suhbat tarixi: 6 → **4 ta**, har biri 400 → 250 belgi | ~150 tok/savol |
| FAKTLAR: maksimal **2 500 belgi** | ~200 tok (uzun tashxisda) |
| Bilim bazasi matnini ixchamlash | ~400 tok/Live sessiya |

Kutilayotgan natija: chat ~**30%**, Live system prompt ~**30%** kamayadi.
Javob sifati tushmasligi sinovda tekshiriladi.

### 2.6 Sarf har suhbat oxirida KO'RSATILADI (2026-08-05 talab)

Foydalanuvchi nima sarflaganini va nima qolganini **har safar** ko'rsin —
oyning oxirida «pulim qayoqqa ketdi?» degan savol tug'ilmasin.

#### Matnli chat — har javob ostida

```
┌────────────────────────────────────────┐
│ Balansingiz 32 759 000 so'm. Bu hozir  │
│ qo'lingizda turgan haqiqiy pul...      │
├────────────────────────────────────────┤
│ ~640 token · bugun 12/30 xabar         │
│ qolgan: 41 600 / 50 000 token          │
└────────────────────────────────────────┘
```

Kichik, kulrang matn — javobga xalaqit bermaydi.

#### Ovozli suhbat — tugaganda

```
┌────────────────────────────────────────┐
│ 🎤 Suhbat tugadi                       │
│ Davomiylik: 2 daqiqa 14 soniya         │
│ Sarflandi:  ~3 200 token · 2 tanga     │
│ Bugun:      4 / 30 suhbat              │
│ Qolgan:     38 400 / 50 000 token      │
└────────────────────────────────────────┘
```

#### Token noma'lum bo'lsa

`fal` va ba'zi tekin provayderlar token qaytarmaydi. Bunday holda
**taxminiy** ko'rsatiladi va shunday belgilanadi:

```
~640 token (taxminiy)
```

Taxmin: `belgilar_soni / 4`. Hech qachon «0 token» deb ko'rsatilmaydi —
foydalanuvchi tekin ishlatyapman deb o'ylab qolmasin.

#### Texnik

- `handle_ai_chat` javobiga `usage` bloki qo'shiladi:
  `{tokens: 640, estimated: false, msgs_today: 12, msgs_limit: 30,
    tokens_today: 8400, tokens_limit: 50000}`
- Ovozda: `{type:'ended'}` xabariga o'sha `usage` bloki qo'shiladi
- Manba — `ClientAiUsage` (Faza C). Alohida hisoblagich YO'Q.

---

## 3. Kutilayotgan natija

| | Hozir | Keyin |
|---|---|---|
| 95 sessiyada olingan | 190 tanga | **~56 tanga** |
| Bekorga ketgan | 134 tanga | **0** |
| Marja | 88–94% | 88–94% (o'zgarmaydi) |
| Narx asosi | taxmin | **o'lchov** |

> **Diqqat:** bu daromadni ~70% kamaytiradi. Lekin kamayadigan qism —
> allaqachon *bekorga olingan pul*. Foydalanuvchi buni sezadi.

---

## 4. Tegilmaydigan joylar

- Tanga narxlari (`DEFAULT_PRICES`) — **o'zgarmaydi**
- `CoinPack` paketlari va UZS narxlari — **o'zgarmaydi**
- Tarif/gating (`features.user_can`) — **o'zgarmaydi**
- Rasm / panorama / analitika to'lovlari — **tegilmaydi**
- Moliya hisoblari — **umuman aloqasi yo'q**
- `ai_coins_enabled()` bayrog'i — **o'zgarmaydi** (hozir o'chiq)

---

## 5. Xavf tahlili

| Xavf | Daraja | Chora |
|---|---|---|
| Tekin foydalanish (gapirmasdan tool ishlatish) | 🟠 O'RTA | `tool_call` bo'lsa ham `_ensure_charged()` chaqiriladi |
| Audio bayti noto'g'ri hisoblanishi | 🟡 PAST | PCM16/16 kHz aniq: 32 000 bayt/s. Testda tekshiriladi |
| 50 s oyna suiiste'mol qilinishi | 🟡 PAST | Eng ko'pi 50 soniya tekin — sessiya tannarxi ~40 UZS |
| Ledger so'rovi sekinlashtirishi | 🟡 PAST | 1 ta indeksli so'rov, sessiya boshida bir marta |
| Yozuv jadvali shishishi | 🟡 PAST | Sessiyaga 1 qator; 95 ta/3 hafta — ahamiyatsiz |
| Daromad tushishi | 🟠 **O'RTA** | Ataylab. §3 dagi izohga qarang — bu bekor pul edi |

**Moliyaga ta'sir: 0.** Tanga tizimi mijoz moliyasidan (Kirim/Chiqim/Balans)
butunlay ajratilgan.

---

## 6. Bosqichlar

| Faza | Ish | Mustaqilmi |
|---|---|---|
| **A** | To'lov birinchi gapga ko'chiriladi (§2.1) | ha |
| **B** | 50 soniya qayta-ulanish oynasi (§2.2) | ha |
| **C** | `ClientAiUsage` + migratsiya + yozish (§2.3) | ha |
| **D** | Uzoq sessiya ogohlantirish/to'xtatish (§2.4) | C dan keyin |
| **F** | Tekin AI limiti + token tejash (§2.5) | C dan keyin |
| **G** | Sarfni foydalanuvchiga ko'rsatish (§2.6) | F dan keyin |
| **E** | *(2 hafta keyin)* o'lchovga qarab narxni qayta ko'rish | C dan keyin |

A va B — darhol qilinadi (eng ko'p foyda, eng kam xavf).
C — o'lchov, keyingi qarorlar uchun poydevor.

---

## 7. Qanday sinaladi

1. **Bosdi-yopdi:** ✨ → chat → 🎤 → darhol yop. → `CoinLedger` da yangi
   yozuv **BO'LMASLIGI** kerak.
2. **Haqiqiy suhbat:** 🎤 → 5 soniya gapir. → **1 ta** yozuv, 2 tanga.
3. **Qayta ulanish:** suhbat paytida sahifani yangila, qayta ulan. →
   yangi yozuv **BO'LMASLIGI** kerak (50 s oyna).
4. **50 s dan keyin:** kut, qayta ulan. → **yangi** yozuv chiqishi kerak.
5. **`ClientAiUsage`:** har sessiyada `duration_sec` > 0 yozilgan bo'lsin.
6. **Regressiya:** 73 akkauntda `serialize_finance_page` — 0 xato
   (tanga moliyaga tegmasligini tasdiqlash).

---

## 8. Deploy

```
manage.py migrate            # C fazasi uchun
manage.py collectstatic      # D fazasi (frontend ogohlantirish) uchun
systemctl reload bittada-manager
systemctl restart bittada-manager-ws     # glive_consumer o'zgaradi
```

---

## 9. Qabul qilingan qarorlar (2026-08-05)

| Savol | Qaror |
|---|---|
| Qayta ulanish oynasi | **50 soniya** |
| Uzoq sessiya | **25 daqiqada AVTOMATIK to'xtatish** (20 da ogohlantirish) |
| Kunlik limit | 30 xabar · 50 000 token · 3 s oraliq |
| Sarf ko'rsatilishi | **Har suhbat oxirida** — token + qolgan limit (§2.6) |
