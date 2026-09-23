# Bittada Usta (Mini ERP) — v2 Backend API Reference

> Android ilova quruvchi Claude Code UCHUN. Ushbu hujjat backend'ga to'liq ulanish
> uchun yetarli: auth (login → OTP → token), WebSocket protokol (barcha
> handlerlar), HTTP API endpointlar, va data (JSON) shakllari.
>
> Kod dalillari `fayl:qator` ko'rinishida keltirilgan (`client_erp/` app'i).
> Bu **faqat dokumentatsiya** — kod o'zgartirilmagan.

---

## 0. Umumiy (Overview)

| Narsa | Qiymat |
|-------|--------|
| **Base URL** | `https://usta.bittada.uz` |
| **Tenant** | Mebel City (host-based routing — `Host: usta.bittada.uz` header tenant'ni aniqlaydi) |
| **User model** | `ClientUser` (`client_erp/models/user.py:6`) — `AUTH_USER_MODEL` EMAS, o'z auth'i |
| **Auth turi** | JWT (HS256), cookie nomi **`client_erp_token`** |
| **Auth backend** | `client_erp/auth_backend.py` |
| **WebSocket** | `wss://usta.bittada.uz/ws/mini/<username>/` (asosiy transport, deyarli barcha data shu yerda) |
| **HTTP API** | `/mini/api/...` (fayl yuklash, AI, shartnoma, to'lov callback) |
| **Til** | UI o'zbek; server xatolari o'zbek tilida (`error` matnlari) |

**Muhim arxitektura fakti:** Mini ERP butunlay SPA + WebSocket. Sahifa data'si
(dashboard, buyurtmalar, moliya, jamoa, ...) HTTP REST orqali EMAS, balki bitta
doimiy WebSocket ulanish orqali `{type, data, request_id}` xabarlar bilan olinadi.
HTTP faqat: login, fayl yuklash, AI (long-running), shartnoma, to'lov webhook.

`ClientUser` `.phone` orqali katta ERP'dagi `Client` (mijoz) bilan telefon
raqami bo'yicha bog'lanadi — MebelCity buyurtmalari shu asosda ko'rinadi.

---

## 1. Authentication (Login oqimi)

### 1.1 Auth modeli

- Login muvaffaqiyatli bo'lgach server **JWT token**ni `client_erp_token`
  cookie'siga yozadi: `httponly=True`, `max_age=30 kun`, `SameSite=Lax`
  (Telegram WebApp oqimida `SameSite=None; Secure`).
  Dalil: `client_erp/views/auth.py:42`, `:57`, `:549`.
- JWT payload (`auth_backend.py:11`):
  ```json
  { "user_id": 56, "phone": "+998930421502", "username": "sardor_cl",
    "type": "client_erp", "exp": 1750000000, "iat": 1747000000 }
  ```
- Token 30 kun amal qiladi (`TOKEN_EXPIRY_DAYS=30`, `auth_backend.py:8`).
- Har `/mini/...` so'rovda `ClientERPMiddleware` (`middleware.py`) cookie'ni
  tekshiradi. `/mini/api/...` da token yo'q bo'lsa **HTTP 401** `{"ok":false,"error":"Auth kerak"}`.

> **Android eslatma:** Server token'ni **cookie** sifatida beradi. Native
> Android'da: (a) `CookieManager`/`CookieJar` bilan cookie'ni saqlang va har
> so'rovda (HTTP va WebSocket handshake) `Cookie: client_erp_token=<JWT>`
> header'ini yuboring. WebSocket authentifikatsiyasi FAQAT shu cookie'dan
> o'qiladi (`consumers.py:80` → `scope['cookies']`). `Authorization: Bearer`
> yoki `?token=` mini ERP uchun ISHLAMAYDI (u DRF Token, boshqa app uchun).

### 1.2 Login endpointlari

Login oqimi: **telefon → Telegram Gateway OTP → kod → token**. Telegram'i
bo'lmagan / Gateway ishlamasa → **parol fallback**.

---

#### `POST /mini/login/start/`
Telefon (+ ixtiyoriy parol) qabul qiladi. CSRF exempt. JSON body.
Dalil: `client_erp/views/auth.py:190`.

**Request:**
```json
{ "phone": "+998930421502", "password": "" }
```
`phone` — 9/12/13 xonali variantlar avtomatik `+998XXXXXXXXX`ga normalizatsiya
qilinadi (`auth.py:19`). `password` bo'sh bo'lsa OTP oqimi ishga tushadi.

**Javob variantlari:**

| Holat | JSON | Ma'no |
|-------|------|-------|
| OTP yuborildi | `{"ok":true,"code_sent":true,"token":"<opaque>"}` | Telegram'ga 6 xonali kod ketdi. `token`ni saqlang → verify'ga yuboring |
| Parol kerak | `{"ok":true,"need_password":true,"error":"..."}` | Gateway ishlamadi → parol so'rang, qayta `start`'ga `password` bilan yuboring |
| Parol bilan kirdi | `{"ok":true,"redirect":"/mini/<username>/spa/"}` + `Set-Cookie` | To'g'ridan-to'g'ri login (parol berilgan edi) |
| Xato | `{"ok":false,"error":"Bu raqam ro'yxatdan o'tmagan"}` va h.k. | Xatolar: raqam yo'q, faol emas, bloklangan, parol noto'g'ri, ko'p urinish |

`token` — `secrets.token_urlsafe(24)`, cache'da 6 daqiqa yashaydi (`auth.py:238`).

---

#### `POST /mini/login/verify/`
OTP kodni tekshiradi → login. CSRF exempt. Dalil: `auth.py:249`.

**Request:**
```json
{ "token": "<start dan olingan token>", "code": "123456" }
```

**Javob:**
| Holat | JSON |
|-------|------|
| Muvaffaqiyat | `{"ok":true,"redirect":"/mini/<username>/spa/"}` + `Set-Cookie: client_erp_token=...` |
| Kod noto'g'ri | `{"ok":false,"error":"Kod noto'g'ri"}` |
| Muddat tugagan | `{"ok":false,"error":"Muddat tugagan. Qayta boshlang.","expired":true}` |
| Ko'p urinish (>5) | `{"ok":false,"error":"Juda ko'p urinish...","expired":true}` |

Muvaffaqiyatda: `Set-Cookie` header'idan `client_erp_token`ni olib saqlang.
`redirect`dagi `<username>`ni WebSocket URL uchun ishlating.

---

#### `POST /mini/login/` (klassik parol formasi — fallback)
`Content-Type: application/x-www-form-urlencoded`, maydonlar: `phone`, `password`.
Muvaffaqiyatda **302 redirect** + cookie. Dalil: `auth.py:61,96-125`. Odatda
Android start/verify oqimini ishlatadi; bu web forma uchun.

**QR/deep-link kirish:** `GET /mini/login/?tel=+998...&password=secret` — telefon+parol
bilan bir so'rovda kirish (`auth.py:68`).

---

#### `GET /mini/logout/`
Cookie'ni tozalaydi (`max_age=0`), `/mini/login/`ga redirect. `auth.py:287`.

#### `GET /mini/auto/<token>/`
Telegram bot'dan brauzerga signed-token bilan avtologin (`auth.py:294`). Bot
tomonidan generatsiya qilinadi; Android odatda ishlatmaydi.

#### `POST /mini/telegram-auth/`
Telegram WebApp `initData` (HMAC-SHA256 tekshiruv) orqali avtologin/register
(`auth.py:415`). Telegram Mini App konteksti uchun; native Android emas.

### 1.3 Brute-force himoya
`ClientLoginAttempt` (`models/user.py:139`): bir telefon uchun 30 daqiqada 10 ta
muvaffaqiyatsiz urinish → 30 daqiqa blok (`is_blocked`, `:164`).

---

## 2. WebSocket API (asosiy)

### 2.1 Ulanish (handshake)

```
wss://usta.bittada.uz/ws/mini/<username>/
```
- `<username>` — login javobidagi `redirect` yoki JWT `username` (masalan `sardor_cl`).
- Handshake'da **`Cookie: client_erp_token=<JWT>`** header YUBORILISHI SHART.
- Consumer: `MiniERPConsumer` (`client_erp/consumers.py:10`), routing `routing.py:6`.
- Auth: `connect()` cookie'dan token'ni o'qib `ClientUser`ni topadi
  (`consumers.py:12-24`, `:76`).

**Ulanish yopilish kodlari:**
| Kod | Sabab |
|-----|-------|
| `4001` | Token yo'q/yaroqsiz yoki user topilmadi (`consumers.py:16`) |
| `4003` | URL'dagi `<username>` token egasiga mos emas (`consumers.py:19`) |

Tenant/DB konteksti WS middleware orqali Host header'dan aniqlanadi
(`tenant_manager/ws_middleware.py`) — Android tomondan qo'shimcha ish kerak emas,
faqat to'g'ri Host'ga ulaning.

### 2.2 Protokol (request/response)

**Klient → Server (yuboriladigan):**
```json
{ "type": "page.dashboard", "data": { }, "request_id": "abc-123" }
```
- `type` — operatsiya nomi (quyidagi jadvallar). Nuqtali (`page.dashboard`).
  Server ichida `handle_` + `type.replace('.', '_')` handleriga yo'naltiradi
  (`consumers.py:38`). Ya'ni `page.dashboard` → `handle_page_dashboard`.
- `data` — operatsiya parametrlari (dict). Bo'sh bo'lsa `{}`.
- `request_id` — klient generatsiya qiladi; javobda aynan qaytadi (so'rov-javob
  moslashtirish uchun). Ixtiyoriy, lekin tavsiya etiladi.

**Server → Klient (javob):**
```json
{ "type": "page.dashboard.result", "request_id": "abc-123",
  "ok": true, "data": { }, "error": null }
```
- Javob `type` = so'rov type + **`.result`** (`consumers.py:64`).
- `ok` — bool. `false` bo'lsa `error` (string) to'ladi, `data` odatda `null`.
- Xato/noma'lum type → `{"...result", ok:false, error:"Noma'lum operatsiya"}` (`:41`).
- Handler istisno tashlasa → `{ok:false, error:"<exception matni>"}` (`:56`).

**Ping/Pong (heartbeat):**
```
→ { "type": "ping", "request_id": "p1" }
← { "type": "ping.result", "request_id": "p1", "ok": true, "data": "pong", "error": null }
```
Dalil: `consumers.py:35`.

**Push xabarlar (server o'zi yuboradi, `.result` EMAS):**
| type | qachon | data |
|------|--------|------|
| `broadcast` | boshqa a'zo order'ni o'zgartirdi (real-time) | `{action, data, by}` — 2.4 bo'limga qarang |
| `xp.awarded` | XP/tanga berildi | `{xp, coins, rule?}` (`:192`, `:1860`) |
| `xp.revoked` | etap qayta ochildi, XP qaytarildi | `{xp, coins}` (`:1966`) |
| `analytics.ai.result` | AI tahlil boshlandi | `{status:"streaming"}` (`:613`) |
| `ai.chunk` | AI stream bo'lagi | `{text}` (`:686`) |
| `ai.done` | AI tahlil tugadi | to'liq tahlil obyekti (`:655`) |
| `ai.error` | AI xato | `{error}` (`:659`) |
| `laylo.typing` | Laylo AI "o'ylayapti" | `{status:"thinking"}` (`:3307`) |

### 2.3 Tarif gating (feature limit)

`receive_json` har so'rovdan oldin tarif tekshiruvi qiladi
(`consumers.py:44`). **STANDART O'CHIQ** (`CLIENT_FEATURE_GATING=False`,
`services/features.py:153`) — hozircha hech kim bloklanmaydi, hamma type ochiq.
Yoqilsa, cheklangan type javobi:
```json
{ "ok": false, "error": "Bu funksiya tarifingizda yo'q",
  "data": { "upgrade": true, "feature": "team" } }
```
Qaysi type qaysi feature'ga bog'langani — `services/features.py:66` (`WS_TYPE_FEATURE`).
Core type'lar (dashboard/clients/orders/stage/note/client/debt/rate...) hech
qachon cheklanmaydi.

### 2.4 Real-time broadcast (order xonasi)

Foydalanuvchi biror order detalini ochганda (`page.order`) server uni
`mini_order_<id>` guruhiga obuna qiladi (`consumers.py:94`, `:577`). O'sha
order'da kimdir o'zgarish qilsa, boshqa ulangan a'zolarga push keladi:

```json
{ "type": "broadcast", "action": "stage.completed",
  "data": { }, "by": "Sardor Aliyev" }
```
`action` qiymatlari: `order.updated`, `order.income`, `order.expense`,
`stage.created`, `stage.completed`, `stage.skipped`, `stage.reopened`,
`stage.deleted`, `stage.reordered`, `stage.checked`, `stage.linked`,
`perm.saved`, `perm.deleted`, `template.applied`, `profit.saved`,
`profit.withdrawn`, `file.created` (AI natijasi).

**💰 Pul yashirish:** Agar ulangan a'zoda "pulni ko'rish" ruxsati bo'lmasa,
server broadcast payload'idan moliyaviy maydonlarni **olib tashlaydi** va
`money_hidden:true` qo'yadi (`consumers.py:121-141`, `serializers.py:108`
`scrub_money_data`). Olib tashlanadigan kalitlar: `total_income`,
`total_expense`, `profit`, `zaklad_amount`, `zaklad_balance`,
`payment_percent`, `estimated_cost`, `total_sum`; bo'shatiladigan ro'yxatlar:
`transactions`, `profit_shares`, `expenses`.

---

## 3. WebSocket Handlerlar (to'liq ro'yxat)

> Har qatorda: `type` · kutilgan `data` kalitlari · muvaffaqiyat `data` javobi.
> Javob doim `{type+".result", request_id, ok, data, error}` bilan o'raladi —
> quyida faqat ichki `data` tavsiflanadi. Dalil ustuni — `consumers.py` qatori.

### 3.1 Sahifa data (page.*)

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `page.dashboard` | `{}` | `serialize_dashboard` (§5.7) | `342` |
| `page.clients` | `{}` | `{clients: [customer+order_count+order_months+last_order_at]}` | `353` |
| `page.client_detail` | `{id}` | `{customer, orders:[order_brief], stats:{count}}` | `389` |
| `page.orders` | `{}` | `{orders:[order_brief], shared_orders:[{order,role}], templates:[], clients:[], statuses:[]}` | `418` |
| `page.order` | `{id}` | `serialize_order_full` + `{templates, can_add_expense, can_complete_stage}` (§5.3) | `513` |
| `page.finance` | `{period?, date_from?, date_to?, ym?}` | `serialize_finance_page` (§5.5) | `740` |
| `page.analytics` | `{period?, date_from?, date_to?, ym?}` | `serialize_analytics` (§5.6) | `580` |
| `page.settings` | `{}` | `serialize_user` (§5.1) | `1192` |
| `page.team` | `{}` | `{team, profit_templates, member_teams, team_orders}` (§3.7) | `2396` |
| `page.oldi_berdi` | `{period?, ...}` | `serialize_oldi_berdi_page` (qarz daftari) | `1071` |
| `page.mebelcity` | `{}` | `{orders:[MC order + sale_brief + files_info]}` (§3.9) | `785` |
| `page.vizualizatsiya` | `{}` | `{galleries:[panorama gallery]}` | `879` |
| `page.zamers` | `{}` | `{zamers:[zamer item]}` | `3466` |
| `page.tarif` | `{}` | `{plans:[...], current:{name,slug,expires}}` | `212` |
| `page.tanga` | `{}` | `{packs:[...], balance, coins, ledger:[...]}` | `236` |

`period` qiymatlari: `today`, `week`, `month` (default), `year`, `all`; yoki
`ym:"2026-07"` aniq oy; yoki `date_from`/`date_to` (`YYYY-MM-DD`). Yagona
hisoblagich `services/periods.py`.

### 3.2 Yordamchi read/action

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `rate.get` | `{}` | `{rate: 12750.0}` (USD→UZS joriy kurs) | `729` |
| `user.search` | `{q}` (≥2 belgi) | `{users:[{id, full_name, phone}]}` | `2366` |
| `analytics.ai` | `{period}` | stream (push: `ai.chunk`/`ai.done`); tanga yechadi (default 50) | `594` |
| `analytics.ai_history` | `{}` | `{... [oxirgi 10 AI tahlil]}` | `706` |
| `mc.order_detail` | `{code}` (secure code) | MC buyurtma tafsiloti (steps, history, progress) | `1096` |
| `mebelcity.orders_for_stage` | `{}` | `{orders:[telefon bo'yicha MC buyurtmalar]}` | `1705` |

### 3.3 Mijoz CRUD (client.*)

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `client.create` | `{name*, phone?, address?}` | `serialize_customer` (§5.2). `+add_customer` XP | `1207` |
| `client.update` | `{id*, name*, phone?}` | `serialize_customer` (faqat egasi) | `1244` |
| `client.delete` | `{id*}` | `null` (topilmasa `error`) | `1227` |

`*` = majburiy. Ism bo'sh → `{ok:false,error:"Ism kiritilmagan"}`.

### 3.4 Buyurtma CRUD + moliya (order.*)

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `order.create` | `{title*, customer_id?, template_id?}` | `order_brief`. `+create_order` XP, standing-share avto-ulash | `1274` |
| `order.update` | `{id*, fields:{title?,status?,description?,deadline?,zaklad_amount?}, status_note?}` | `order_brief`; broadcast `order.updated` | `1311` |
| `order.delete` | `{id*, note*}` | `{id}` (soft-delete; `note` — o'chirish sababi MAJBURIY) | `1369` |
| `order.restore` | `{id*}` | `order_brief` | `1396` |
| `orders.deleted` | `{}` | `{orders:[o'chirilgan + deleted_at + delete_note]}` | `1419` |
| `order.income` | `{order_id*, amount*, description?, payment_method?, customer_id?}` | `serialize_transaction` (§5.4); broadcast `order.income`; `+add_income` XP | `1439` |
| `order.expense` | `{order_id*, amount*, description?, payment_method?, stage_id?, category?}` | `serialize_transaction`; broadcast `order.expense` | `1488` |
| `finance.revert` | `{order_id*, type:"income"|"expense", amount*}` | teskari yozuv. **FAQAT `username=bigone_cl2`** ruxsat | `1555` |
| `order.send_mc` | `{id*}` | `{mc_order_id}` | `1603` |

**Status qiymatlari** (`models/order.py:16`): `new`, `waiting`, `in_progress`,
`at_mebelcity`, `ready`, `delivered`, `cancelled`. `waiting`ga o'tkazishda
`status_note` majburiy. `delivered`ga o'tsa `delivered_at` avto-to'ladi (foyda
shu oyга tan olinadi).

**payment_method**: `cash`, `card`, `click`, `payme`, `transfer`/`bank`, ... (erkin string).

**Ruxsat:** owner har doim; boshqa a'zo — income uchun `role='manager'`,
expense uchun `perm.can_add_expense`, stage tugatish uchun `perm.can_complete_stage`.

### 3.5 Etap (stage.*)

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `stage.create` | `{order_id*, title*, icon?, color?, note?, estimated_cost?, is_mebelcity?, mebelcity_order_id?, checklist:[]}` | `{stage, progress}`; broadcast `stage.created` | `1622` |
| `stage.complete` | `{id*}` | `{stage, progress, xp, coins, all_done, order_id}`; broadcast + XP | `1783` |
| `stage.skip` | `{id*}` | `{stage, progress, order_id}` (faqat egasi) | `1866` |
| `stage.reopen` | `{id*}` | `{stage, progress, order_id, revoked_xp, revoked_coins}` (XP clawback) | `1892` |
| `stage.delete` | `{id*}` | `{progress, stage_id, order_id}` (faqat egasi) | `1972` |
| `stage.reorder` | `{order_id*, ids:[stage_id...]}` | `null`; broadcast `stage.reordered` | `1992` |
| `stage.check` | `{stage_id*, item_id*}` | `{item_id, stage_id, is_done, done_by, xp, coins, order_id}` (checklist toggle) | `2007` |
| `stage.link_order` | `{stage_id*, mebelcity_order_id}` | `{stage}`; MC zakazga bog'lash | `1678` |

`stage.status`: `pending`, `active`, `completed`, `skipped`. Etap tugatilganda
keyingi `pending` etap avto `active` bo'ladi; barchasi tugasa order `ready`.

### 3.6 Eslatma & fayl (note.* / file.*)

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `note.create` | `{order_id*, text*}` | `{note: serialize_note}` (§5.9) | `985` |
| `note.update` | `{note_id*, text*}` | `{note}` | `1009` |
| `note.delete` | `{note_id*}` | `{ok:true}` | `1032` |
| `file.delete` | `{file_id*}` | `{ok:true}` (disk fayli ham o'chadi) | `1050` |

Fayl **yuklash** WS'da EMAS — HTTP `/mini/api/file-upload/` (§4).

### 3.7 Jamoa (team.*) + ruxsat (perm.*) + ulashish

**Jamoa sahifasi `page.team` javobi** (`consumers.py:2396`):
```jsonc
{
  "team": { "id", "name", "description", "is_owner",
            "members": [{user_id, name, phone, username, role, profit_percent, status}],
            "invitations": [ /* status='invited' a'zolar */ ] },
  "profit_templates": [{id, name, is_default, lines:[{role_label, percent}]}],
  "member_teams": [{id, name, owner_name, my_role, my_percent, members:[...]}],
  "team_orders": [{order: order_brief, visibility, team_name}]
}
```

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `team.create` | `{name?, description?}` | `{team_id}` (bitta owner = 1 jamoa) | `2473` |
| `team.update` | `{name?, description?}` | `{ok}` | `2491` |
| `team.invite` | `{query(phone/username)*, role?, profit_percent?}` | `{ok}`; Telegram bildirishnoma | `2508` |
| `team.update_member` | `{user_id*, role?, profit_percent?}` | `{ok}` (owner o'zgarmas) | `2539` |
| `team.remove_member` | `{user_id*}` | `{ok}` | `2558` |
| `team.accept` | `{}` | `{ok}` (o'z taklifini qabul) | `2612` |
| `team.decline` | `{}` | `{ok}` | `2630` |
| `team.save_template` | `{name?, lines:[{role_label, percent}]}` | `{ok}` | `2575` |
| `team.delete_template` | `{id*}` | `{ok}` | `2595` |
| `team.report` | `{period?}` | `{total_orders, total_profit, total_withdrawn, members:[{name,percent,orders_count,calculated,withdrawn}], incomplete_orders}` | `2695` |
| `team.profit_detail` | `{...}` | ustalar foydasi drill-down (kanonik ism) | `2875` |
| `team.autoshare_get` | `{}` | `{teams:[avto-ulashish sozlamalari]}` | `2312` |
| `team.autoshare_set` | `{team_id*, auto_share_new_orders?, auto_role?, auto_can_*?}` | jamoa dict | `2321` |

**Rol qiymatlari:** `owner`, `admin`, `manager`, `worker`, `viewer`.
**Standart foyda %:** owner=35 (`consumers.py:2485`).

**Order ruxsat (perm.*) va ulashish:**

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `perm.save` | `{order_id*, user_id*, role?, stages:[], can_add_expense?, can_complete_stage?, can_see_money?, always?}` | `serialize_permission` (§5.8); broadcast `perm.saved` | `2164` |
| `perm.delete` | `{id*}` | `null`; broadcast `perm.deleted` | `2347` |
| `order.share` | `{order_id*, visibility?, can_edit?, can_complete?, can_add_expense?}` | `{ok}` (jamoaga ulash) | `3036` |
| `order.unshare` | `{order_id*, team_id*}` | `{ok}` | `3072` |
| `profit.save` | `{order_id*, shares:[{name, percent}]}` | broadcast `profit.saved` | `3089` |
| `profit.withdraw` | `{order_id*, total_profit, lines:[{name, percent, amount}]}` | broadcast `profit.withdrawn` | `2642` |
| `standing.list` | `{}` | `{members:[doimiy], teams:[...]}` | `2241` |
| `standing.update` | `{id*, role?, can_*?}` | yangilangan yozuv | `2265` |
| `standing.delete` | `{id*}` | `null` | `2294` |

`visibility`: `full`, `limited`, `finance_hidden` (moliya yashirin), `worker`.
`always:true` — "Har doim" doimiy a'zolik (`ClientStandingShare`): egaga har
yangi buyurtma shu a'zoga avto-ulashadi.

### 3.8 Shablon (template.*)

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `template.list` | `{}` | `{templates:[serialize_template]}` (§5.10) | `2072` |
| `template.save` | `{id?, name*, items:[{title,icon,color,is_mebelcity,note,estimated_cost,checklist:[]}]}` | `serialize_template` | `2084` |
| `template.delete` | `{id*}` | `{ok}` | `2122` |
| `template.apply` | `{template_id*, order_id*}` | `serialize_order_full`; broadcast `template.applied` | `2134` |

### 3.9 Moliya + qarz (finance.* / debt.*)

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `finance.create` | `{type:"income"|"expense"|"withdrawal", amount*, description?, payment_method?, category?, customer_id?, order_id?}` | `serialize_transaction` | `3124` |
| `finance.withdrawal` | `{amount*, recipient_name?, description?, payment_method?}` | `serialize_transaction` (withdrawal) | `3224` |
| `debt.create` | `{customer_id*, amount*, description?}` | qarz obyekti (`id, customer, original_amount, remaining, status`) | `3157` |
| `debt.pay` | `{id*, amount*}` | `{debt_id, remaining, paid_amount, status}` | `3187` |

`debt.status`: `active`, `partial`, `paid`.

### 3.10 To'lov (pay.*) + Gemini Live (glive.*)

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `pay.start` | `{provider?:"sandbox", purpose:"coin_topup"|"plan_purchase", target_id}` | `{payment_id, checkout_url, amount, provider, status}` | `255` |
| `pay.sandbox_confirm` | `{payment_id*}` | `{balance, coins, status:"paid", coins_added}` (FAQAT sandbox/`BILLING_LIVE=0`) | `276` |
| `pay.status` | `{payment_id*}` | `{status, fulfilled}` (polling) | `299` |
| `glive.start` | `{page?}` | `{token, model, system, coins}` (Gemini Live ephemeral token) | `313` |

`glive.start` xatosi tanga/tarifga bog'liq: `{ok:false, error:"coins"|"plan", data:{...}}`.
Standartda AI-tanga o'chiq → bepul/ochiq.

### 3.11 Laylo AI yordamchi (laylo.*)

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `laylo.chat` | `{text?, audio_base64?, quality?, tts?}` | `{html, tts_text, tools_used, cost, coins, transcript?, audio_base64?, audio_mime?}` | `3253` |
| `laylo.tts` | `{text*}` | `{audio_base64, audio_mime:"audio/ogg"}` | `3338` |
| `laylo.permissions` | `{}` | `{permissions:[...]}` | `3404` |

Audio ovoz limiti: STT max 1 MB base64 (`_LAYLO_STT_MAX_BYTES`), TTS max 2000 belgi.
Tanga yechadi (default o'chiq → 0). Push: ishlov paytida `laylo.typing`.

### 3.12 Sozlamalar (settings.*) + MebelCity bog'lash

| type | request `data` | response `data` | qator |
|------|----------------|-----------------|-------|
| `settings.password` | `{current*, new*}` (new ≥4 belgi) | `null` | `3421` |
| `settings.delete_account` | `{password*}` | `null` (akkountni butunlay o'chiradi) | `3442` |
| `panorama.link` | `{gallery_uuid*, client_order_id}` | `{ok}` (VR gallereyani buyurtmaga bog'lash) | `967` |
| `zamer.link` | `{zamer_id*, client_order_id}` | `{ok}` | `3548` |

---

## 4. HTTP API endpointlar

Barchasi `/mini/api/...` ostida. Auth: `client_erp_token` cookie majburiy
(bo'lmasa **401** `{"ok":false,"error":"Auth kerak"}`). CSRF exempt.
URL'lar: `client_erp/urls.py:72-81`.

### 4.1 `POST /mini/api/file-upload/`
Oddiy fayl yuklash (`multipart/form-data`). Dalil: `views/file_upload.py:145`.

**Form maydonlari:** `file` (fayl, majburiy), `order_id` (majburiy), `caption?`.

**Ruxsat etilgan formatlar** (`file_upload.py:23`):
- rasm: `.jpg .jpeg .png .gif .webp .heic`
- video: `.mp4 .mov .avi .mkv .webm .3gp .m4v`
- hujjat: `.pdf .doc .docx .xls .xlsx .txt .zip .rar .b3d .project .bpj`

**Javob:** `{"ok":true,"data":{"file": serialize_file}}` (§5.11). Rasm/videoga
thumbnail avtomatik yaratiladi; video fon-thread'da H.264 mp4'ga optimallashadi.
Xato: `{"ok":false,"error":"Ruxsat etilmagan format: .xyz"}` va h.k.

### 4.2 `POST /mini/api/chunk-upload/`
Katta fayllar uchun bo'lakli yuklash. Dalil: `file_upload.py:198`.

**Form maydonlari:** `chunk` (bo'lak fayli), `upload_id` (birinchi bo'lakda
bo'sh → server generatsiya qiladi), `chunk_index` (0-based), `total_chunks`,
`order_id`, `file_name`, `caption?`.

**Oraliq javob** (hali barcha bo'lak kelmagan):
```json
{"ok":true,"data":{"upload_id":"<hex>","received":3,"total":10}}
```
Keyingi bo'laklarni shu `upload_id` bilan yuboring. Oxirgi bo'lakdan keyin
fayl birlashtiriladi va javob `{"ok":true,"data":{"file": serialize_file}}`.

### 4.3 `POST | GET /mini/api/ai-image-edit/`
Galereya rasmini AI (fal.ai flux-pro/kontext) bilan tahrirlash. Dalil:
`views/ai_image_edit.py:41`. Long-running → task_id + polling.

**POST** body `{file_id*, prompt*}` → `{"ok":true,"data":{"task_id":"...","coins":N}}`.
`prompt` max 800 belgi. Tanga yechadi (default o'chiq → 0), yetmasa **402**
`{ok:false,error:"coins",need,balance}`.

**GET** `?task_id=...` → holat polling:
```json
{"ok":true,"data":{"status":"editing","step":"AI tahrirlamoqda...","enhanced_prompt":"..."}}
```
`status`: `queued`→`enhancing`→`uploading`→`editing`→`saving`→`done` (yoki `error`).
`done` bo'lganda `data.file` = serialize_file (yangi fayl buyurtmaga qo'shiladi).
Tayyor bo'lganda WS `broadcast action=file.created` ham keladi.

### 4.4 `POST | GET /mini/api/panorama-generate/`
Rasmni 360° VR panoramaga aylantirish. Dalil: `views/panorama_ai.py:53`.

**POST** body `{file_id*, provider?:"panopulse"|"fal_hunyuan", prompt?}` →
`{"ok":true,"data":{"task_id":"...","coins":N}}`. `prompt` max 300 belgi.

**GET** `?task_id=...` → `{status, step, viewer_url?}`.
`status`: `queued`→`uploading`→`prompting`→`converting`→`saving`→`done`|`error`.
`done`: `data.viewer_url` = `/panorama/<uuid>/` (WebView'da ochiladi).

### 4.5 `POST /mini/api/contracts/`
Shartnoma yaratib mijozga yuborishga tayyorlaydi. Dalil: `views/contract_api.py:12`.

**Body** `{order_id*, amount*, terms?}`. Ruxsat: order egasi yoki perm bor a'zo
(aks holda 403). **Javob:**
```json
{"ok":true,"data":{"uuid":"...","portal_url":"/mini/portal/<uuid>/","customer_phone":"+998..."}}
```

### 4.6 `POST /mini/api/contracts/<uuid>/send-sms/`
Shartnoma linkini mijozga SMS yuboradi. Dalil: `contract_api.py:57`. Body yo'q
(uuid URL'da). Mijoz telefon raqami order.customer'dan olinadi. Javob `{ok:true}`
yoki `{ok:false,error}`.

### 4.7 `POST /mini/api/pay/<provider>/callback/`
To'lov provayder webhook'i (Payme/Click/...). Dalil: `views/payments_api.py:16`.
**Server↔provider** oqimi — Android **ishlatmaydi**. `BILLING_LIVE=0` (standart)
bo'lsa **400** `sandbox mode` qaytadi; sandbox to'lov WS `pay.sandbox_confirm`
orqali. `pay-callback` faqat real provayder yoqilganda ishlaydi.

### 4.8 `GET /mini/api/prompt-presets/`
AI prompt shablonlari ro'yxati (`urls.py:77`, `views/prompt_preset.py`).

---

## 5. Data shakllari (Serializerlar — Android modellari uchun)

Manba: `client_erp/serializers.py`. **Muhim:** pul maydonlari
`_dec()` orqali **butun son string** ko'rinishida qaytadi (masalan `"1500000"`,
tiyin/kasr yo'q) — `serializers.py:5`. Sana/vaqt — ISO 8601 string yoki `null`.

### 5.1 `serialize_user` (`:13`)
| kalit | tur | izoh |
|-------|-----|------|
| `id` | int | |
| `username` | string | |
| `full_name` | string | |
| `phone` | string | `+998...` |
| `organization` | string | |
| `xp` | int | tajriba ballari |
| `coins` | int | tanga balansi |
| `coins_total_earned` | int | |
| `streak_days` | int | |
| `vip_level` | obj/null | `{id, name, level_number, icon, color, min_turnover}` |
| `avatar_url` | string/null | |

### 5.2 `serialize_customer` (`:46`)
`{ id:int, name:string, phone:string, address:string, note:string, created_at:iso|null }`

### 5.3 `serialize_order_full` (`:133`)
Buyurtma detali. Kalitlar:
| kalit | tur | izoh |
|-------|-----|------|
| `id, title, description, status` | | |
| `customer` | obj/null | serialize_customer |
| `overall_progress` | int | 0–100 |
| `total_income, total_expense, profit` | string | butun son (pul) |
| `zaklad_amount, zaklad_balance, payment_percent` | string/int | |
| `mc_order_id` | int/null | MebelCity zakaz id |
| `use_stages` | bool | |
| `deadline, created_at, delivered_at` | iso/null | |
| `stages` | array | serialize_stage (§5.12) |
| `transactions` | array | serialize_transaction (oxirgi 50) |
| `timeline` | array | `{id, action, note, created_at}` |
| `permissions` | array | serialize_permission |
| `profit_shares` | array | `{id, name, percent, is_remainder}` |
| `shares` | array | `{team_id, team_name, visibility, can_edit, can_complete, can_add_expense}` |
| `files` | array | serialize_file |
| `notes` | array | serialize_note |
| `panoramas` | array | `{uuid, name, panorama_count, thumbnail}` |
| `zamers` | array | `{id, room_name, width, height, depth, blocks_count, thumbnail, order_hash, zamer_url, ...}` |
| `bom` | obj/null | BOM smeta (tannarx YASHIRIN) |
| `user_role` | string | `owner`/`viewer`/`worker`/... |
| `is_owner` | bool | |
| `money_hidden` | bool | `true` → moliyaviy maydonlar olib tashlangan |

`page.order` javobiga qo'shimcha: `templates`, `can_add_expense`, `can_complete_stage`.

### 5.4 `serialize_transaction` (`:456`)
| kalit | tur |
|-------|-----|
| `id` | int |
| `record_type` | `income`/`expense`/`withdrawal` |
| `amount` | string (butun) |
| `description, category, payment_method` | string |
| `stage_id, stage_name` | int/null, string/null |
| `order_id, order_title` | int/null, string/null |
| `customer_id, customer_name` | int/null, string/null |
| `recipient_name` | string |
| `date, created_at` | iso/null |

### 5.5 `serialize_finance_page` (`:707`)
```jsonc
{
  "months": {"2026-07": 42},          // oy → yozuvlar soni (dropdown)
  "period": "month", "ym": null,
  "stats": { "total_income","total_expense","total_withdrawal","profit","balance" },
  "kassa": { "opening","income","expense","withdrawal","closing" },
  "sof_foyda": { "total","count","orders":[{id,title,customer,income,expense,profit,delivered_at}] },
  "wip": "0",                         // band pul (tugamagan buyurtma xarajati)
  "monthly": {"2026-07": {income,expense,withdrawal}},
  "withdrawal_recipients": ["Oybek", ...],
  "last_profit_shares": [{name, percent}],
  "records": [serialize_transaction, ...],   // oxirgi 100 (davr filtri)
  "debts": [{id, customer, original_amount, paid_amount, remaining, status, due_date, created_at}]
}
```
Barcha pul — string (butun). `balance` HAR DOIM barcha vaqt (davrga bog'liq emas).

### 5.6 `serialize_analytics` (`:868`)
Asosiy bloklar (`:1224`):
```jsonc
{
  "period", "months": {ym:count}, "profit_monthly": [{month, profit}],
  "deliveries": { delivered_count, delivered_on_time, delivered_late,
                  contract_total, overdue_count, delivered:[...], overdue:[...] },
  "summary": { income, expense, profit, orders, completed,
               income_change, expense_change, orders_change },   // *_change = % o'zgarish
  "totals": { income, expense, withdrawal, profit, balance, debt,
              orders, completed, customers },
  "chart": { labels:[], income:[], expense:[] },
  "status_distribution": [{status, count}],
  "expense_categories": [{category, total}],
  "payment_data_income": [{method, total}],
  "payment_data_expense": [{method, total}],
  "top_customers": [{id, name, total}],
  "stage_performance": [{title, count}],
  "orders_detail": [{id, title, status, customer, progress, total_stages,
                     done_stages, active_stage, blocked_count, income, expense,
                     profit, days_since_created, deadline, shared_with, has_mc}],
  "debts_detail": [{customer, order, original, paid, remaining, status, due_date, overdue}],
  "bottlenecks": [{title, avg_days, count}],
  "customer_activity": [{name, orders}],
  "shared_orders_in": [{order_title, owner, role, status}]
}
```
`summary`/`chart`/`*_categories`/`payment_*` ichida `total` — int; pul jamlari
(`totals`, `deliveries.contract_total`) — string (butun).

### 5.7 `serialize_dashboard` (`:558`)
```jsonc
{
  "user": serialize_user,
  "stats": { customers_count, total_orders, active_orders, mebelcity_count,
             total_income, total_expense, profit, total_debt },
  "active_orders": [order_brief, ...],   // aktiv, oxirgi 10
  "shared_tasks": [{order, role, active_stages:[{id,title,icon}]}],
  "daily_quests": [{id,title,icon,description,xp_reward,coin_reward,action_count,progress,is_completed}],
  "announcements": [{id,type,title,body,image,discount_percent,discount_code,start_date,end_date,is_pinned}],
  "team_invite": {team_name, owner_name, role} | null
}
```

### 5.8 `serialize_permission` (`:489`)
```jsonc
{ "id", "user": {id, full_name, phone, avatar_url}, "role",
  "stages": [stage_id...], "can_add_expense", "can_complete_stage", "can_see_money" }
```

### 5.9 `serialize_note` (`:524`)
`{ id, text, created_by, created_by_id, created_at, updated_at }`

### 5.10 `serialize_template` (`:537`)
```jsonc
{ "id", "name", "is_default",
  "items": [{ title, icon, color, sort_order, is_mebelcity, note,
              estimated_cost, checklist:[] }] }
```

### 5.11 `serialize_file` (`:508`)
```jsonc
{ "id", "file_url", "thumbnail_url", "file_type": "image"|"video"|"document",
  "file_name", "file_size", "caption", "uploaded_by", "created_at" }
```

### 5.12 `serialize_stage` (`:219`) va `serialize_order_brief` (`:59`)

**stage:**
```jsonc
{ "id","title","icon","color","status","sort_order","note",
  "estimated_cost","deadline","is_mebelcity","mebelcity_order_id",
  "mc_info": {id, order_hash, partner_name, state, delivery_state, delivery_label,
              total_sum, progress, current_step, is_urgent} | null,
  "assigned_to": {id, full_name}|null, "completed_by": {id, full_name}|null,
  "completed_at",
  "checklist": [{id, title, is_done, done_by, done_at, sort_order}],
  "total_expense", "expenses": [serialize_transaction] }
```

**order_brief** (ro'yxatlar uchun):
```jsonc
{ "id","title","status","customer_name","customer_id","overall_progress",
  "total_income","total_expense","payment_percent","created_at","deadline",
  "mc_order_id","is_linked":bool,"has_zamer":bool|null,"use_stages","waiting_note" }
```

---

## 6. Android ulanish uchun minimal oqim (recap)

1. `POST /mini/login/start/` `{phone}` → `token` (OTP Telegram'ga ketdi).
2. Foydalanuvchi kodni kiritadi → `POST /mini/login/verify/` `{token, code}` →
   `Set-Cookie: client_erp_token=<JWT>` + `redirect:/mini/<username>/spa/`.
3. Cookie'ni saqlang (`CookieJar`). `<username>`ni ajratib oling.
4. WebSocket: `wss://usta.bittada.uz/ws/mini/<username>/` + handshake header
   `Cookie: client_erp_token=<JWT>`.
5. WS orqali `{type,data,request_id}` yuboring, `{type+".result",request_id,ok,data,error}`
   qabul qiling. `ping`/`pong` bilan tirik ushlang. `broadcast`/`xp.*`/`ai.*`
   push'larini alohida tinglang.
6. Fayl/AI/shartnoma uchun — HTTP `/mini/api/...` (o'sha cookie bilan).

**Xatolarga umumiy qoida:** `ok:false` bo'lsa `error` (o'zbek tilida) — UI'da
ko'rsating; `error:"coins"` bo'lsa tanga yetmadi (`need`/`balance` bilan);
`data.upgrade:true` bo'lsa tarif cheklovi. HTTP 401 → qayta login. WS close
4001/4003 → token yaroqsiz, qayta login.
