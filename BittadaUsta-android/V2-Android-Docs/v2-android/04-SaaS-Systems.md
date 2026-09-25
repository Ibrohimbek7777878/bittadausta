# 04 — SaaS Tizimlari (Bittada Usta v2)

> Android ilova quruvchi Claude Code UCHUN. Bu hujjat mini ERP (`usta.bittada.uz`)
> ning to'rtta SaaS qatlamini tavsiflaydi: **tarif gating**, **tanga (coin)
> billing**, **universal to'lov** va **Gemini Live** (real-time ovoz).
>
> **ENG MUHIM QOIDA — hamma flag STANDART O'CHIQ:**
> `CLIENT_FEATURE_GATING=0`, `CLIENT_AI_COINS=0`, `BILLING_LIVE=0`.
> O'chiq bo'lganda barcha funksiya OCHIQ, hech kim bloklanmaydi, real pul
> yechilmaydi. Android ilova shu holatda ham to'liq ishlashi kerak — SaaS UI
> (tarif/tanga ekranlari) mavjud, lekin "upgrade" majburlamaydi.

Manba fayllar:
- `client_erp/services/features.py` — tarif gating registri (14 feature)
- `client_erp/models/plan.py` — `ClientPlan`, `ClientSubscription`
- `client_erp/services/coins.py` + `client_erp/models/billing.py` — tanga
- `client_erp/payments/` + `client_erp/models/payments.py` — universal to'lov
- `client_erp/gemini_live.py`, `static/client_erp/js/redesign/rc-glive.js`,
  `rc-actions.js`, `rc-pay.js` — real-time ovoz + tool-call + to'lov UI
- WS handlerlar: `client_erp/consumers.py`
- HTTP webhook: `client_erp/views/payments_api.py`

---

## 1) Tarif gating (Feature gating) — F1

### Flag
`settings.CLIENT_FEATURE_GATING` (env `CLIENT_FEATURE_GATING`, standart `0`).
`False` bo'lsa `user_can(...)` HAR DOIM `True` qaytaradi — hech kim bloklanmaydi.

### Modellar
**`ClientPlan`** (tarif paketi, admin yaratadi — Bepul/Start/Biznes/Premium):
| Maydon | Izoh |
|--------|------|
| `name`, `slug`, `price_uzs` (BigInt), `period_days` (30) | asos |
| `coin_grant` | har davrda beriladigan tanga |
| `feature_keys` (JSON list) | ruxsat etilgan feature kalitlari — **bo'sh = hammasi ochiq** |
| `ai_included` (bool) | AI kiritilganmi |
| `is_free` (bool) | login uchun default tarif (faqat bittasi) |
| `is_active`, `sort`, `color`, `icon`, `description` | ko'rinish |

**`ClientSubscription`** (obuna tarixi + joriy holat):
`user`, `plan`, `status` (trial/active/expired/cancelled), `period_start`,
`period_end`, `source` ('admin' | 'trial' | to'lov id).

**`ClientUser`** da (mavjud): `plan` (FK), `plan_expires_at`, `plan_since`.

### 14 feature kaliti (`FEATURES` dict)
`core` (doim ochiq), `ai_analytics`, `ai_image`, `ai_panorama`, `ai_laylo`,
`gemini_live`, `team`, `finance_advanced`, `files_upload`, `templates`,
`oldi_berdi`, `mebelcity`, `zamers`, `vizualizatsiya`.

Kategoriyalar: `core / ai / team / finance / files / templates / integration / tools`.

### Oqim (gating qanday ishlaydi)
1. **WS** (`consumers.receive_json`): har `msg_type` uchun
   `feature_for_type(msg_type)` → `WS_TYPE_FEATURE` xaritasidan feature topadi.
   Faqat CHEKLANADIGAN tiplar xaritada bor (masalan `analytics.ai`→`ai_analytics`,
   `order.share`→`team`, `page.oldi_berdi`→`oldi_berdi`). Core tiplar (dashboard,
   orders, stage.*, note.*) xaritada YO'Q → `None` → doim ruxsat.
   Ruxsat yo'q bo'lsa WS javob: `{ok:false, error:"Bu funksiya tarifingizda yo'q",
   data:{upgrade:true, feature:<key>}}`.
2. **HTTP** (`@require_feature('ai_image')` dekoratori): ruxsat yo'q bo'lsa
   `403 {ok:false, error, upgrade:true, feature}`.
3. **`effective_plan(user)`**: `user.plan` bor va `plan_expires_at` o'tmagan
   bo'lsa — o'sha; aks holda `ClientPlan(is_free=True)` (bepul tarif).

### Android tomon nima qiladi
- **`#/tarif` ekrani** — WS `page.tarif` yuboradi, javob:
  `{plans:[{id,name,slug,price_uzs,period_days,coin_grant,ai_included,is_free,
  color,icon,description,features:[label...]}], current:{name,slug,expires}}`.
  Barcha faol tariflarni karta ko'rinishida ko'rsat, joriy tarifni belgila.
- WS javobida `data.upgrade === true` kelsa — "Tarifni yangilang" dialogini
  ko'rsat va `#/tarif` ga yo'nalt (lekin ilovani bloklamа: gating o'chiq
  bo'lsa bu holat KELMAYDI).
- Tarif sotib olish → to'lov oqimi (§3): `purpose='plan_purchase'`,
  `target_id = plan.id`.
- Ilova FEATURES ro'yxatini backend'dan olib (kelajakda `user_features(user)`
  SPA'ga uzatiladi), yo'q feature tugmalarini "qulf/upgrade" bilan bezashi mumkin —
  lekin standart holatda hammasi ochiq.

---

## 2) Tanga (Coin) billing — F2

> **1 tanga = 1000 so'm** (biznes qoidasi). Tanga = AI funksiyalar uchun ichki
> valyuta. Joriy balans `ClientUser.coins` (INTEGER) da; `coins_total_earned`
> jami yig'ilgan.

### Flag
`settings.CLIENT_AI_COINS` (env, standart `0`). `False` bo'lsa HECH KIM tanga
sarflamaydi: `charge()` doim `0` qaytaradi, `can_afford()` doim `True`.

### Modellar (`client_erp/models/billing.py`)
- **`CoinPack`** (sotiladigan paket): `name`, `coins`, `bonus_coins`,
  `price_uzs`, `is_active`, `sort`, `color`; `total_coins = coins + bonus_coins`.
- **`ClientAIPrice`** (AI amal narxi, admin sozlaydi): `action_key` (unique),
  `label`, `coin_cost`, `is_active` (False ⇒ bu funksiya tekin).
- **`CoinLedger`** (audit trail): `user`, `kind`
  (purchase/spend/grant/refund), `amount` (± ), `balance_after`, `reason`,
  `ref_id`, `created_at`.

### Narxlash (`coins.ai_price(action_key)`)
Prioritet: `ClientAIPrice(is_active).coin_cost` → `DEFAULT_PRICES` → `0`.
`DEFAULT_PRICES`: `analytics_ai=3`, `ai_image=2`, `ai_panorama=5`, `laylo_chat=1`, `gemini_live=2` (1 tanga=1000 so'm),
`laylo_chat=0`, `gemini_live=0`. `0` = bepul (tanga yechilmaydi).

### Servis API (`client_erp/services/coins.py`)
- `can_afford(user, action_key)` → bool (o'chiq/0 ⇒ True).
- `charge(user, action_key, ref_id)` → yechilgan tanga (int). Yetmasa
  **`InsufficientCoins(need, balance)`** ko'taradi. `select_for_update` bilan
  qatorni lock qiladi (double-charge yo'q). **Muhim:** chaqiruvchi natijaning
  truthy emas, EXCEPTION'ga tayanadi (bepul amal `0` qaytaradi).
- `grant(user, amount, reason, kind, ref_id)` — tanga beradi (paket sotib
  olgach / admin qo'lda). `refund(...)` — qaytaradi.

### Oqim
AI funksiya BOSHIDA `coins.charge(...)` chaqiriladi. Masalan:
- Gemini Live start: `coins.charge(user, 'gemini_live', ref_id='glive')`
  (`consumers.handle_glive_start`).
- Laylo chat: `coins.charge(user, 'laylo_chat')`.
- AI analitika: to'g'ridan-to'g'ri `user.coins -= cost` (eski logika, cost=50).

### Android tomon nima qiladi
- **`#/tanga` ekrani (hamyon)** — WS `page.tanga` yuboradi, javob:
  `{packs:[{id,name,coins,bonus_coins,total_coins,price_uzs,color}],
  balance, coins, ledger:[{kind,amount,reason,created_at}]}` (oxirgi 10 harakat).
  Balansni katta ko'rsat, paketlarni sotib olish tugmalari bilan, tarixni ro'yxatda.
- Topbar'da doimiy tanga badge: 🪙 `<balance>` (SPA'da `#rc-coins`), bosilganda
  `#/tanga` ga o'tadi.
- Paket sotib olish → to'lov oqimi (§3): `purpose='coin_topup'`,
  `target_id = pack.id`. To'lov tasdiqlanganda `balance` yangilanadi
  (`pay.sandbox_confirm` javobida `coins_added`, `balance`).
- WS javobda `{error:'coins', need, balance}` kelsa — "Tanga yetarli emas,
  to'ldiring" dialogi + `#/tanga`. (Standart `CLIENT_AI_COINS=0` da kelmaydi.)

---

## 3) Universal to'lov — F3 (SANDBOX-first)

### Flag
`settings.BILLING_LIVE` (env, standart `0`). **`False` bo'lsa HECH QANDAY real
provayder API chaqirilmaydi** — hamma to'lov `SandboxProvider` orqali (real pul
YO'Q). Real provayder faqat `BILLING_LIVE=1` VA o'sha provayder kalitlari
sozlangan (`is_configured()`) bo'lsagina ishlaydi.

### Provayderlar (`client_erp/payments/providers/`)
`payme`, `click`, `octobank`, `multicard`, `sandbox`. Har biri
`PaymentProvider` (`base.py`) dan meros: `is_configured()`, `create_invoice(payment)`
→ `{checkout_url, external_id}`, `handle_callback(request)` →
`{payment_external_id, status: paid|failed|pending, raw}`. Registry:
`get_provider(slug)` — topilmasa/bo'sh bo'lsa **Sandbox** (xavfsiz default).

Sandbox `checkout_url` = `/mini/pay/sandbox/<id>/` (ichki tasdiq sahifasi).

### Modellar (`client_erp/models/payments.py`)
- **`ClientPayment`**: `user`, `provider` (payme/click/octobank/multicard/sandbox),
  `purpose` (`coin_topup` | `plan_purchase`), `target_id` (CoinPack.id yoki
  ClientPlan.id), `amount_uzs`, `status` (created/pending/paid/failed/cancelled),
  `external_id`, `checkout_url`, `fulfilled` (idempotentlik bayrog'i), `raw`,
  `paid_at`.
- **`SavedCard`** — Payme recurring token (PAN saqlanmaydi, `crypto.py` Fernet
  bilan shifrlanadi; kelajak avtoto'lov).
- **`PaymentAttempt`** — har urinish audit.

### Servis oqimi (`client_erp/payments/service.py`)
1. `create_payment(user, provider_slug, purpose, target_id)`:
   `amount_for()` narx → `ClientPayment(created)` → `provider.create_invoice()`
   → `external_id` + `checkout_url` → `status='pending'`.
2. **Tasdiq** faqat webhook YOKI sandbox-confirm orqali `confirm(payment)`:
   PUL YECHILMAYDI (provayder allaqachon oldi), faqat `status='paid'` +
   `_fulfill()`. **IDEMPOTENT** (`fulfilled` + `select_for_update` — takroriy
   webhook double-grant qilmaydi). `_fulfill()`: `coin_topup` ⇒
   `coins.grant(pack.total_coins)`; `plan_purchase` ⇒ `user.plan` tayinlash +
   `ClientSubscription(active)`.
3. Xato bo'lsa butun tranzaksiya rollback (qisman holat qolmaydi) + `PaymentAttempt`.

### WS handlerlar (`consumers.py`)
| Type | Vazifa | Javob |
|------|--------|-------|
| `pay.start` | to'lov boshlash | `{payment_id, checkout_url, amount, provider, status}` |
| `pay.sandbox_confirm` | sandbox tasdiq (faqat `BILLING_LIVE=0`) | `{balance, coins, status:'paid', coins_added}` |
| `pay.status` | polling | `{status, fulfilled}` |

`pay.start` data: `{provider, purpose, target_id}`.

### HTTP webhook (real rejim)
`POST /mini/api/pay/<provider>/callback/` (`payments_api.pay_callback`,
csrf_exempt). `BILLING_LIVE=0` da `400 sandbox mode`. Live'da provayder
`handle_callback()` → `service.confirm()` yoki `service.fail()`.

### Android tomon nima qiladi (`rc-pay.js` oqimini takrorla)
1. Paket/tarif tugmasi → **provayder tanlash** bottom-sheet
   (Payme/Click/Octobank/Multicard).
2. WS `pay.start` `{provider, purpose, target_id}` yubor.
3. Javob `checkout_url` ni tekshir:
   - `/mini/pay/sandbox/…` bilan boshlansa → **sandbox tasdiq** oynasi ko'rsat →
     WS `pay.sandbox_confirm` `{payment_id}` → muvaffaqiyatда balansni yangila
     (`coins_added`, `balance`), agar `#/tanga`/`#/tarif` bo'lsa reload.
   - aks holda (real provayder) → `checkout_url` ni **WebView/tashqi brauzer**
     da och; qaytgach WS `pay.status` bilan polling qilib `fulfilled` bo'lguncha
     kut, keyin balans/tarifni yangila.
4. Har xato holatida yumshoq toast, ilovani yiqitma.

---

## 4) Gemini Live — real-time ovozli boshqaruv (F4)

> Foydalanuvchi gapiradi → Gemini Live eshitadi → **tool-call** → ilova amalni
> bajaradi (navigatsiya, etap tugatish, kirim qo'shish...) → Gemini ovozda javob
> beradi. Ephemeral token pattern — Gemini API kaliti HECH QACHON qurilmaga
> chiqmaydi.

### Gate
`gemini_live.can_use_live(user)` → `(allowed, affordable)`:
`allowed` = feature `gemini_live` (tarif), `affordable` = tanga yetarli.
Ikkalasi standart-ochiq (flaglar o'chiq ⇒ `True`, bepul).

### Backend (`client_erp/gemini_live.py`)
- `mint_ephemeral_token()` — `google-genai` SDK `client.auth_tokens.create`
  (v1alpha) bilan qisqa muddatli token: `uses=1`, ~30 daqiqa,
  model'ga qulflangan (`live_connect_constraints`). Muvaffaqiyat:
  `{token, model, expires}`; xato: `{error:'gemini_live_unavailable', detail}`
  (CRASH YO'Q — SDK yo'q / kalit yo'q / kvota bo'lsa jim degradatsiya).
- `live_model()` — standart `gemini-2.0-flash-live-001` (`settings.GEMINI_LIVE_MODEL`).
- `system_context(name, page, order_summary)` — o'zbekcha system-instruction
  (interfeysni tool orqali boshqarish yo'riqnomasi).

### WS handler (`consumers.handle_glive_start`, type `glive.start`)
Data: `{page}`. Oqim: gate tekshir → agar ruxsat yo'q
`{error:'plan', upgrade:true, feature:'gemini_live'}`; tanga yetmasa
`{error:'coins', need, balance}`. Avval token, keyin `coins.charge` (refund-gap
yo'q). Muvaffaqiyat: `{ok:true, data:{token, model, system, coins}}`.

### Frontend oqimi (`rc-glive.js` — qurilmada takrorlash uchun namuna)
1. 🎙️ FAB → WS `glive.start` `{page}` → `{token, model, system}`.
2. Mikrofon: `getUserMedia` → PCM16 **mono 16kHz** → base64 →
   `realtimeInput.mediaChunks` (`audio/pcm;rate=16000`, ~120ms bo'lak).
3. To'g'ridan-to'g'ri Gemini WSS ga ulanish:
   `wss://generativelanguage.googleapis.com/ws/...BidiGenerateContent?access_token=<token>`.
   `onopen` → `setup{ model, generationConfig:{responseModalities:['AUDIO']},
   systemInstruction, tools:[{functionDeclarations}] }`.
4. `serverContent.modelTurn` audio (PCM **24kHz**) → ijro navbati (barge-in:
   foydalanuvchi gapirsa to'xtat). `toolCall.functionCalls[]` → `RcActions.run` →
   `toolResponse`.

### Tool-call registri (`rc-actions.js` → `window.GEMINI_TOOLS` + `RcActions`)
Gemini "function call" → mos ilova amali. Namunaviy amallar:
`navigate` (sahifa), `open_order` (buyurtma), `open_page` (o'zbekcha nom→route),
etap tugatish / checklist / kirim-chiqim (RcOrderDetail orqali). Har amal qisqa
STRING natija qaytaradi — Gemini uni ovozda aytadi. Global yo'q bo'lsa xavfsiz
degradatsiya.

### Android tomon nima qiladi
- Gemini Live'ni **nativ** ulash tavsiya etiladi: WS `glive.start` orqali
  ephemeral `token` + `model` + `system` ol, keyin nativ WebSocket +
  `AudioRecord` (16kHz PCM16 in) / `AudioTrack` (24kHz PCM16 out) bilan Gemini
  BidiGenerateContent WSS ga ulanish. Barge-in va navbatli ijroni qo'lla.
- **Tool-call'larni** nativ amallarga xarita: navigatsiya, buyurtma ochish,
  etap tugatish, kirim/chiqim qo'shish — har biriga qisqa string natija qaytar.
  `GEMINI_TOOLS` (functionDeclarations) ni backend system + `rc-actions.js`
  dan olib, nativ ekvivalentini bajar.
- API kaliti hech qachon ilovaga kelmaydi — faqat ephemeral token (~30 daqiqa,
  bir ulanish). Muddat tugasa qayta `glive.start`.
- `{upgrade:true}` yoki `{error:'coins'}` kelsa tarif/tanga oynasiga yo'nalt
  (standart flaglar o'chiq — bu holat kelmaydi).

---

## Xulosa — flaglar jadvali

| Flag | Env | Standart | O'chiqda xatti-harakat |
|------|-----|----------|------------------------|
| `CLIENT_FEATURE_GATING` | `CLIENT_FEATURE_GATING` | `0` | `user_can`=True, hamma feature ochiq |
| `CLIENT_AI_COINS` | `CLIENT_AI_COINS` | `0` | `charge`=0, `can_afford`=True, tanga yechilmaydi |
| `BILLING_LIVE` | `BILLING_LIVE` | `0` | faqat Sandbox, real pul yo'q |

Uchtasi ham o'chiq holatda ilova to'liq ishlaydi. Android UI SaaS ekranlarni
(tarif/tanga/to'lov/ovoz) ko'rsatadi, lekin hech nimani majburlamaydi.
