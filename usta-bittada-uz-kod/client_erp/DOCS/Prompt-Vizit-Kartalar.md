# Prompt: Vizit Kartalar Tizimi

## Kontekst

MebelCity ERP platformasi. Multi-tenant SaaS (Django 5.x, Python 3.12, PostgreSQL).
Admin panel: `/mini/admin/` — Django template, `@_staff_required` dekorator bilan himoyalangan.
Admin panelda tab tizimi mavjud (`maTab(name)` JS funksiyasi).

## Vazifa

Admin panelga yangi **"Vizit Kartalar"** tabi qo'sh. Bu tab orqali admin:
1. Ro'yxatni (telefon, firma, ism) textarea ga paste qilib, birdan userlar yaratadi
2. Yoki mavjud userlarni tanlaydi
3. Vizit kartalar generatsiya qilib, A4 da chop etadi

## TZ fayli

To'liq texnik spetsifikatsiya: `client_erp/DOCS/TZ-Vizit-Kartalar.md`

## Dizayn manba

Tayyor vizit karta HTML/CSS/JS: `client_erp/DOCS/Mebel-City-Vizit-Kartalar.html`
Bu fayldagi karta dizayni (oldi/orqa, bleed, duplex, QR), CSS stillari va JS logikani admin panelga integratsiya qilish kerak.

## O'zgariladigan fayllar

### 1. `client_erp/views/admin.py`
3 ta yangi endpoint qo'sh:

**`POST /mini/admin/bulk-check/`** — Ro'yxatni parse + DB da tekshirish
- `@_staff_required` dekorator
- Request: `{"rows": [{"phone":"998..","org":"...","name":"..."}]}`
- Telefon validatsiyasi (faqat raqamlar, 998 prefix, 12 raqam)
- DB da `ClientUser.objects.filter(phone=phone).exists()` tekshirish
- Response: har bir qator uchun `state: "new"|"exists"|"error"`

**`POST /mini/admin/bulk-create/`** — Yangi userlar yaratish + parol generatsiya
- Yangi userlar uchun: `ClientUser.generate_username(name)`, parol `MC-` + 4 random (A-Z, 0-9)
- `user.set_password(password)`, `is_verified=True`
- Mavjud userlar uchun (include_existing=true): parolni yangilash
- VIP level mapping: status parametriga qarab level qo'yish (yoki null)
- Response: userlar ro'yxati (id, name, phone, org, username, password, status)

**`POST /mini/admin/card-users/`** — Mavjud userlar uchun karta ma'lumotlari
- `user_ids` ro'yxati olinadi
- `reset_password=true` bo'lsa yangi parol generatsiya
- VIP level dan status aniqlanadi: null→start, 1→hamkor, 2→silver, 3→gold, 4+→vip
- Response: userlar ro'yxati (id, name, phone, org, username, password, status)

### 2. `client_erp/urls.py`
3 ta yangi URL qo'sh:
```python
path('admin/bulk-check/', admin.mini_admin_bulk_check, name='admin-bulk-check'),
path('admin/bulk-create/', admin.mini_admin_bulk_create, name='admin-bulk-create'),
path('admin/card-users/', admin.mini_admin_card_users, name='admin-card-users'),
```

### 3. `template/client_erp/admin/dashboard.html`
Yangi tab va panel qo'sh. Panel 3 bo'limdan iborat:

**Bo'lim A — Bulk Import:**
- Textarea (ro'yxat paste qilish uchun)
- Ajratuvchi tanlash (Tab/Vergul/Nuqtali vergul) — select
- Ustun tartibi (Telefon,Firma,Ism / Telefon,Ism,Firma) — select
- Status tanlash (Start/Hamkor/Silver/Gold/VIP) — select
- "Tekshirish" tugmasi → `/mini/admin/bulk-check/` API chaqiradi → natija jadvalda
- "Yaratish va Kartalar generatsiya" tugmasi → `/mini/admin/bulk-create/` → kartalar ko'rsatadi

**Bo'lim B — Mavjud userlar:**
- Qidirish input + status filter
- Checkbox bilan userlar jadvali (template dan: `{{ client_users }}` ishlatiladi)
- "Parolni yangilash" checkbox
- "Kartalar generatsiya" tugmasi → `/mini/admin/card-users/` → kartalar ko'rsatadi

**Bo'lim C — Vizit kartalar preview:**
- View toggle (Oldi+Orqa / Faqat oldi / Faqat orqa)
- Kesish chiziqlarini ko'rsatish checkbox
- QR link input
- "Chop etish" va "Tozalash" tugmalari
- A4 sheet preview (kartalar grid: 2x4=8 karta/sahifa)
- Duplex uchun orqa tomon oynali tartib (1↔0, 3↔2, 5↔4, 7↔6)

**Karta CSS/JS:**
`Mebel-City-Vizit-Kartalar.html` fayldagi quyidagilar to'liq ko'chiriladi:
- `.mc-vc-card`, `.mc-vc-sheet` va boshqa CSS klasslar
- `frontCard(c)`, `backCard(c, idx)` JS funksiyalar
- QR kod generatsiyasi (`qrcodejs` CDN)
- `@media print` qoidalar
- Logo (base64 LOGO konstanta)
- `STATUS_NAMES` mapping

**Telefon formatlash (karta uchun):**
```javascript
function formatPhone(p) {
  var d = p.replace(/\D/g,'');
  if (d.length === 12) return '+' + d.slice(0,3) + ' ' + d.slice(3,5) + ' ' + d.slice(5,8) + ' ' + d.slice(8,10) + ' ' + d.slice(10);
  return p;
}
```

## Muhim qoidalar

- `CLAUDE.md` dagi restart qoidalariga amal qil (Python o'zgarsa `bittada-manager` restart, static o'zgarsa `collectstatic` + restart)
- Mavjud admin panel stiliga mos qil (`.ma-*` klasslar, `maApi()`, `maOpenModal()` pattern)
- Karta CSS klasslarini `.mc-vc-*` prefiksi bilan saqlash (admin CSS bilan conflict bo'lmasligi uchun)
- `@media print` da faqat kartalar ko'rinsin, admin panel yashirinsin
- Barcha endpointlar `@_staff_required` bilan himoyalangan bo'lsin
- Telefon formati: DB da `998901234567`, kartada `+998 90 123 45 67`
