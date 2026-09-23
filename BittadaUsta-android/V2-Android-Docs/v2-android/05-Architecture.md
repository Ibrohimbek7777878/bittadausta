# 05 — Arxitektura (Bittada Usta v2)

> Mini ERP "Bittada Usta" (`usta.bittada.uz`) ning umumiy texnik arxitekturasi.
> Android ilova quruvchi Claude Code shu hujjatdan tizim tuzilishini, WS/HTTP
> chegaralarini va deploy'ni tushunadi.

---

## 1) Texnologiyalar

| Qatlam | Texnologiya |
|--------|-------------|
| Backend | Django 5.x, Python 3.12 |
| DB | PostgreSQL — **database-per-tenant** (tenant: `mebelcity`, alias `tenant_mebelcity`) |
| Real-time | Django Channels (Daphne), WebSocket — asosiy transport |
| Auth (mini ERP) | JWT cookie (`client_erp_token`), Django session'ga TEGMAYDI |
| Cache | Redis (channel layer + holat) |
| Frontend (joriy) | SPA — vanilla JS + WebSocket, server-render minimal shell |
| Multi-tenant | `tenant_manager/` — middleware + router (`get_current_db_alias`) |

Mini ERP butun `client_erp/` app'ida izolyatsiya qilingan: **o'z auth**, **o'z
modellari** (`Client*` prefiks), **o'z WS consumeri**, katta ERP moliyasiga
tegmaydi.

---

## 2) v1 (`ce-` / mini-erp.js) vs v2 (`rc-` redesign) farqi

Mini ERP frontend ikki avlodda:

- **v1 (eski)**: `static/client_erp/js/mini-erp.js` (+ `pages/`, `components/`) —
  dastlabki SPA. Router, WS klient, sahifalar shu yerda. Hali ishlaydi
  (asosiy WS klient `window.WS`, `Router`, `STATE` shu yerdan).
- **v2 (redesign, `rc-` prefiks)**: `static/client_erp/js/redesign/rc-*.js` —
  yangi UI qatlami. Shell: `template/client_erp/spa_redesign.html`. Modullar:
  `rc-dashboard`, `rc-orders`, `rc-order-detail`, `rc-finance`, `rc-analytics`,
  `rc-clients`, `rc-settings`, `rc-tariff`, `rc-wallet`, `rc-pay`, `rc-actions`,
  `rc-glive`, `rc-components`, `rc-misc`, `rc-period`, `redesign-app.js`.

**Muhim:** ikkalasi ham BIR XIL backend WS protokolidan foydalanadi
(`MiniERPConsumer`). `rc-` modullari `window.WS` (v1 klient), `Router`, `STATE`,
`Toast`, `RcSheet` global'lariga tayanadi. **Android ilova uchun kanonik manba —
WS protokol + `rc-*.js` biznes-logikasi** (v2 eng yangi UX). HTML/CSS ni
takrorlash SHART emas — WS message contract'ni takrorlang.

Statik versiyalash: `spa_redesign.html` da har fayl `?v=N` bilan (masalan
`rc-order-detail.js?v=8`). JS/CSS o'zgarsa `?v=N` oshiriladi (cache-bust).

---

## 3) Servislar

| Servis | Port | Vazifa | systemd |
|--------|------|--------|---------|
| `bittada-manager` | 8040 | Gunicorn (4 worker) — HTTP (views, API, webhook, SPA shell) | `bittada-manager.service` |
| `bittada-manager-ws` | 8041 | Daphne — **WebSocket** (mini ERP real-time yadrosi) | `bittada-manager-ws.service` |

Restart qoidalari (mini ERP kontekstida):
- Python/view/template o'zgarsa → `sudo systemctl restart bittada-manager`
- **`client_erp/consumers.py`** (WS) o'zgarsa → `sudo systemctl restart bittada-manager-ws`
- Ikkalasi → ikkalasini restart
- Static JS/CSS o'zgarsa → `collectstatic` + `restart bittada-manager` +
  `spa_redesign.html` da `?v=N` oshirish

> Mini ERP ning butun ishchi oqimi (dashboard, buyurtma, moliya, tanga, tarif,
> to'lov, Gemini Live gate) **WebSocket** orqali. HTTP faqat: SPA shell,
> fayl-yuklash, to'lov webhook, panorama/AI-image kabi og'ir amallar.

---

## 4) Fayl-struktura xaritasi (`client_erp/`)

```
client_erp/
├── consumers.py          # MiniERPConsumer — WS yadro (dispatch: handle_<type>)
├── routing.py            # ws/mini/<username>/
├── middleware.py         # /mini/ auth (JWT cookie) + IDOR himoya
├── auth_backend.py       # generate_token/decode_token/get_client_user (JWT HS256)
├── urls.py               # /mini/ HTTP marshrutlar (login, admin, api, pay callback)
├── serializers.py        # WS javob serializatorlari (dashboard, order, customer...)
├── gemini_live.py        # Gemini Live ephemeral token + system context (F4)
│
├── models/
│   ├── __init__.py       # barcha modellar re-export
│   ├── user.py           # ClientUser (+ coins, plan, plan_expires_at)
│   ├── customer.py       # ClientCustomer
│   ├── order.py          # ClientOrder + Item/Photo/Timeline/Stage/File/Note
│   ├── finance.py        # ClientFinanceRecord/Log, ClientDebt(+Payment)
│   ├── team.py           # ClientTeam, Share, ProfitShare, Standing...
│   ├── zamer.py          # ClientZamer(+Room/Item)
│   ├── portfolio.py      # Portfolio, Notification, Achievement, VIP
│   ├── gamification.py   # XP, Quest, Reward, Event...
│   ├── plan.py           # ★ ClientPlan, ClientSubscription (F1)
│   ├── billing.py        # ★ CoinPack, ClientAIPrice, CoinLedger (F2)
│   ├── payments.py       # ★ ClientPayment, SavedCard, PaymentAttempt (F3)
│   ├── contract.py, permission.py, stage_template.py, prompt_preset.py,
│   └── order_status.py, ai_analysis.py
│
├── services/
│   ├── features.py       # ★ tarif gating registri (F1)
│   ├── coins.py          # ★ tanga narxlash/yechish (F2)
│   ├── crypto.py         # ★ SavedCard token Fernet shifrlash
│   ├── ai_analysis.py, ai_prompt_writer.py, gamification.py,
│   ├── notifications.py, periods.py, standing_share.py, mc_link.py,
│   └── account_purge.py
│
├── payments/             # ★ universal to'lov (F3)
│   ├── base.py           # PaymentProvider abstrakt + PROVIDERS registry + billing_live()
│   ├── service.py        # create_payment / confirm / _fulfill / fail
│   └── providers/        # sandbox, payme, click, octobank, multicard
│
├── views/                # HTTP: payments_api (webhook), admin, portal, ...
├── templates/            # admin dashboard, print, portal, zamer iframe
└── migrations/           # 0001…0029
```

`template/client_erp/spa_redesign.html` — v2 SPA shell (loyiha `template/`
papkasi APP_DIRS'dan ustun).

---

## 5) Migratsiyalar 0027–0029 (SaaS qatlami)

| Migratsiya | Nima qo'shdi |
|------------|--------------|
| `0027_clientplan_clientuser_plan_expires_at_and_more` | **`ClientPlan`**, **`ClientSubscription`** + `ClientUser.plan`, `plan_expires_at`, `plan_since` (F1) |
| `0028_clientaiprice_coinpack_coinledger` | **`ClientAIPrice`**, **`CoinPack`**, **`CoinLedger`** (F2 tanga) |
| `0029_clientpayment_paymentattempt_savedcard` | **`ClientPayment`**, **`PaymentAttempt`**, **`SavedCard`** (F3 to'lov) |

Migratsiya tenant DB'da: `manage.py migrate client_erp --database tenant_mebelcity`
(yoki loyiha router konvensiyasiga ko'ra). `ClientUser.coins` allaqachon mavjud
edi (gamifikatsiyadan).

---

## 6) WebSocket protokoli (Android klient uchun kanonik)

**URL:** `wss://usta.bittada.uz/ws/mini/<username>/`
**Auth:** JWT cookie `client_erp_token` (login'da `generate_token(user)` beradi,
HS256, 30 kun). Handshake'da cookie yuboriladi.

**So'rov formati:**
```json
{ "type": "page.dashboard", "request_id": "<uuid>", "data": { ... } }
```
**Javob formati:**
```json
{ "type": "page.dashboard.result", "request_id": "<uuid>",
  "ok": true, "data": { ... }, "error": null }
```

Dispatch: `handle_name = 'handle_' + type.replace('.', '_')`. `type='ping'` →
`data:'pong'`. Noma'lum type → `{ok:false, error:"Noma'lum operatsiya"}`.
Gating (F1) `receive_json` boshida: `CLIENT_FEATURE_GATING=1` bo'lsagina
tekshiradi (standart o'chiq → hamma type ochiq).

`request_id` — har so'rovni javobga bog'lash uchun (Android'da so'rov→javob
correlation SHART; parallel so'rovlar bo'lishi mumkin).

---

## 7) Deploy — `usta.bittada.uz`

- **Nginx**: `/etc/nginx/sites-enabled/usta.bittada.uz` — SSL (Let's Encrypt),
  `location /` → gunicorn `:8040`, `location /ws/` → daphne `:8041`
  (WebSocket upgrade header'lari bilan).
- **Domen**: `usta.bittada.uz` asosiy; `mini.bittada.uz` → 301 redirect.
- **Tenant**: mini ERP `mebelcity` tenant DB (`tenant_mebelcity`) ustida ishlaydi.
- **Login**: `/mini/login/` — telefon → Telegram 2FA (parolsiz, "✅ Tasdiqlash"
  tugmasi) → JWT cookie o'rnatiladi.

Android ilova uchun bazaviy URL: `https://usta.bittada.uz`. Auth JWT'ni
login-flow orqali olib, WS + HTTP so'rovlarda cookie/token sifatida uzatadi.
