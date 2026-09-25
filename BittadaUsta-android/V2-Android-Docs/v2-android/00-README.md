# 00 — README (Bittada Usta v2 → Android ilova)

> **Bu paket nima?** `usta.bittada.uz` mini ERP "Bittada Usta" (v2 redesign)
> ning **nativ Android ilovasini qurish** uchun to'liq texnik hujjatlar to'plami.
> Android quruvchi Claude Code SHU README'dan boshlaydi va ketma-ket 01→05
> hujjatlarni o'qib ilovani qura oladi.
>
> Ilova mavjud Django backendni **o'zgartirmasdan** ishlaydi: butun biznes-mantiq
> allaqachon serverda (WebSocket + HTTP). Android ilova = **yangi klient**
> (nativ UI + mavjud WS/HTTP protokol).

---

## Nima quriladi

- **Platforma:** mebel ustalari uchun mini ERP — buyurtmalar, etaplar (bosqichlar),
  mijozlar, moliya (kirim/chiqim/qarz), jamoa, zamerlar, portfolio, gamifikatsiya.
- **SaaS qatlami:** tarif rejalari, tanga (coin) hamyoni, to'lov (Payme/Click/
  Octobank/Multicard), Gemini Live ovozli yordamchi.
- **Transport:** asosan **WebSocket** (real-time); JWT auth; PostgreSQL (tenant).
- **Bazaviy URL:** `https://usta.bittada.uz` · **WS:** `wss://usta.bittada.uz/ws/mini/<username>/`

---

## Hujjatlar ro'yxati (00–05)

| Fayl | Mavzu | Holat |
|------|-------|-------|
| **00-README.md** | Bosh indeks — bu fayl, qurish qadamlari, muhim eslatmalar | ✅ |
| **01** (Auth va WebSocket protokoli) | Login (Telegram 2FA + JWT), WS ulanish, so'rov/javob konventsiyasi, message contract | ↴ |
| **02-Design-System.md** | Dizayn tizimi — ranglar, tipografiya (Plus Jakarta Sans), komponentlar, mavzu (dark default), `rc-` prefiks | ✅ |
| **03** (Ekranlar va funksiyalar) | Har ekran + WS oqimlari (dashboard, buyurtma, order-detail/etap, moliya, mijozlar, sozlamalar...) | ↴ |
| **04-SaaS-Systems.md** | Tarif gating · Tanga billing · Universal to'lov · Gemini Live (4 tizim, flaglar, Android tomon) | ✅ |
| **05-Architecture.md** | Umumiy arxitektura — texnologiyalar, v1/v2, servislar, fayl-struktura, migratsiya, deploy | ✅ |

> ↴ = boshqa agent yozadi/yozgan (fayl nomi mos `03-Screens-Features.md`,
> `01-*.md` ko'rinishida). O'qish tartibi: **00 → 01 → 02 → 03 → 04 → 05**.
> Kanonik protokol manbai — backend `client_erp/consumers.py` (WS) + `rc-*.js`.

---

## Android ilovani qurish — tavsiya qadamlar

Quyidagi tartibda ishlang (har qadam avvalgisiga tayanadi):

### 1-qadam — Auth (login → JWT)
`01` hujjatiga qarang. Login: telefon → Telegram 2FA ("✅ Tasdiqlash" tugmasi,
parolsiz) → server **JWT** beradi (`client_erp_token`, HS256, 30 kun). Tokenni
xavfsiz saqla (`EncryptedSharedPreferences`/Keystore). Har WS/HTTP so'rovda
uzat.

### 2-qadam — WebSocket ulanish (yadro)
`wss://usta.bittada.uz/ws/mini/<username>/` ga JWT bilan ulan. Message contract:
```
so'rov:  { "type": "<...>", "request_id": "<uuid>", "data": { ... } }
javob:   { "type": "<...>.result", "request_id": "<uuid>", "ok": bool, "data": {...}, "error": null }
```
`request_id` bilan so'rov→javob correlation qil (parallel so'rovlarni qo'lla).
`ping`→`pong` heartbeat. Uzilishda avto-reconnect + qayta ulanish.

### 3-qadam — Asosiy ekranlar (WS oqimlari)
`02` (dizayn) + `03` (ekranlar). Har ekran WS `page.*` yuboradi, `data` ni UI'ga
bog'laydi. Boshlang'ich ketma-ketlik: `page.dashboard` → `page.orders` →
order-detail (etap/holat/moliya) → `page.clients` → `page.settings`. Dizaynni
`02` dan (dark default, lime accent, bottom-sheet, `rc-` komponentlar) olib nativ
Compose/View'ga ko'chir.

### 4-qadam — SaaS integratsiyasi
`04` hujjatiga qarang. Ekranlar: **`#/tarif`** (page.tarif), **`#/tanga`**
(page.tanga, hamyon), **to'lov** (pay.start → sandbox_confirm/checkout),
**Gemini Live** (glive.start → ephemeral token → nativ audio WSS). Topbar'da
doimiy tanga badge. **Muhim:** SaaS flaglar standart O'CHIQ — ekranlarni ko'rsat,
lekin hech nimani majburlama.

---

## Muhim eslatmalar (yodda tut)

- **JWT auth.** Cookie/token `client_erp_token`, HS256, 30 kun. Login = telefon +
  Telegram 2FA (parolsiz). WS handshake va HTTP so'rovlar shu token bilan.
- **WS `request_id`.** Har so'rovga unikal `request_id` ber; javob shu bilan
  qaytadi. Correlation'siz parallel so'rovlar aralashadi.
- **1 tanga = 1000 so'm.** Tanga = AI funksiyalar ichki valyutasi
  (`ClientUser.coins`, INTEGER). Balansni har amaldan keyin yangila.
- **SaaS flaglar STANDART O'CHIQ:** `CLIENT_FEATURE_GATING=0`,
  `CLIENT_AI_COINS=0`, `BILLING_LIVE=0`. O'chiqda: hamma feature ochiq, tanga
  yechilmaydi, to'lov faqat **Sandbox** (real pul yo'q). Ilova shu holatda ham
  to'liq ishlashi kerak — "upgrade" majburlamaydi.
- **Gemini Live token.** API kaliti hech qachon qurilmaga chiqmaydi — faqat
  ephemeral token (`glive.start`, ~30 daqiqa, 1 ulanish). Audio: mikrofon PCM16
  **16kHz** in, Gemini PCM16 **24kHz** out; barge-in qo'lla.
- **Backend'ni o'zgartirma.** Barcha logika serverda. Android = yangi klient.
  Protokol manbai: `client_erp/consumers.py` (`handle_<type>`) + `rc-*.js`.
- **v2 = `rc-` prefiks.** Kanonik UX/biznes-logika `static/client_erp/js/redesign/`
  (v1 `mini-erp.js` eski, lekin WS klient shu yerda). HTML takrorlanmaydi — WS
  contract takrorlanadi.
- **Deploy.** `usta.bittada.uz` (nginx+SSL); HTTP → gunicorn `:8040`, WS → daphne
  `:8041`; mebelcity tenant DB.

---

## Tez havolalar (backend manba)

| Nima | Fayl |
|------|------|
| WS consumer (barcha `handle_*`) | `client_erp/consumers.py` |
| WS routing | `client_erp/routing.py` (`ws/mini/<username>/`) |
| Auth (JWT) | `client_erp/auth_backend.py`, `middleware.py` |
| Tarif gating | `client_erp/services/features.py`, `models/plan.py` |
| Tanga | `client_erp/services/coins.py`, `models/billing.py` |
| To'lov | `client_erp/payments/`, `models/payments.py`, `views/payments_api.py` |
| Gemini Live | `client_erp/gemini_live.py`, `static/.../rc-glive.js`, `rc-actions.js` |
| SPA shell (v2) | `template/client_erp/spa_redesign.html` |
