# TZ: Vizit Kartalar Tizimi — Admin Panel

## 1. Umumiy maqsad

Admin panelga (`/mini/admin/`) yangi **"Vizit Kartalar"** tabi qo'shiladi.
Admin ro'yxatni paste qiladi yoki mavjud userlarni tanlaydi — tizim avtomatik
user yaratadi, parol generatsiya qiladi va A4 formatda vizit kartalar chiqaradi.

**Asosiy flow:**
```
Admin ro'yxat paste qiladi → Userlar avtomatik yaratiladi → Vizit kartalar generatsiya → Chop etish
```

---

## 2. Mavjud tizim

- **Admin panel**: `/mini/admin/` — Django template, `@_staff_required` bilan himoyalangan
- **Tab tizimi**: `maTab(name)` funksiyasi, `ma-panel` class bilan panellar
- **API pattern**: `maApi(url, body)` — `fetch` + CSRF + JSON
- **Modal tizim**: `maOpenModal(title, fields, saveCallback)` — universal modal
- **User model**: `ClientUser` — `phone`, `full_name`, `username`, `organization`, `vip_level`, `password_hash`
- **Vizit karta dizayni**: `client_erp/DOCS/Mebel-City-Vizit-Kartalar.html` — tayyor HTML/CSS/JS

---

## 3. Yangi tab: "Vizit Kartalar"

Tablar qatoriga qo'shiladi:
```html
<button class="ma-tab" onclick="maTab('visitcards')">📇 Vizit Kartalar</button>
```

Panel 3 ta bo'limdan iborat:

### 3.1. Bulk Import — Ro'yxat tashlab user yaratish

**UI:**
- Textarea — admin ro'yxatni paste qiladi (Excel/Google Sheets dan ko'chirilsa tab bilan ajraladi)
- Ajratuvchi tanlash: Tab (default) / Vergul / Nuqtali vergul
- Ustun tartibi tanlash: "Telefon, Firma, Ism" (default) yoki "Telefon, Ism, Firma"
- Yangi userlar uchun status tanlash: Start (default) / Hamkor / Silver / Gold / VIP
- "Tekshirish" tugmasi — ro'yxatni parse qiladi va natijani jadvalda ko'rsatadi

**Parse va tekshirish natijasi (jadval):**

| # | Telefon | Firma | Ism Familya | Holat |
|---|---------|-------|-------------|-------|
| 1 | 998901234567 | MebelMax | Ozodbek Karimov | Yangi |
| 2 | 998912345678 | DoorPlus | Dilshod Rahimov | Mavjud (DB da bor) |
| 3 | noto'g'ri | WoodArt | Sardor | Xato: telefon noto'g'ri |

**Statistika:** Yangi: 2 ta | Mavjud: 1 ta | Xato: 1 ta

**Tugmalar:**
- "Yaratish va Kartalar generatsiya" — yangi userlarni DB da yaratadi, parol generatsiya qiladi, kartalarni ko'rsatadi
- Mavjud userlar ham kartaga qo'shiladi (parol yangilanadi)

**Telefon validatsiyasi:**
- Faqat raqamlar olinadi (boshqa belgilar o'chiriladi)
- 998 bilan boshlanishi kerak
- 12 ta raqam bo'lishi kerak (998XXYYYYYYY)
- Agar 9 ta raqam bo'lsa — 998 boshiga qo'shiladi

### 3.2. Mavjud userlardan tanlash

**UI:**
- Qidirish input (ism, telefon bo'yicha filter)
- Status filter: Barchasi / Start / Hamkor / Silver / Gold / VIP
- Checkbox bilan userlar ro'yxati (DB dan)
- "Hammasini tanlash" / "Bekor qilish" tugmalari
- "Parolni yangilash" checkbox (yangi parol generatsiya qilish)
- "Kartalar generatsiya" tugmasi

**Jadval:**

| ☑ | Ism | Telefon | Firma | Daraja | Username |
|---|-----|---------|-------|--------|----------|
| ☑ | Ozodbek Karimov | 998901.. | MebelMax | Gold | ozodbek_k |
| ☑ | Dilshod Rahimov | 998912.. | DoorPlus | Silver | dilshod_r |
| ☐ | Sardor Tursunov | 998933.. | WoodArt | Start | sardor_t |

### 3.3. Vizit kartalar preview + chop etish

**Sozlamalar:**
- Ko'rinish toggle: Oldi+Orqa / Faqat oldi / Faqat orqa
- Kesish chiziqlarini ko'rsatish (checkbox)
- QR link (default: `https://mebelcity.bittada.uz/mini/login/`)

**Tugmalar:**
- "Chop etish (PDF)" — `window.print()` chaqiradi
- "Tozalash" — kartalar ro'yxatini tozalaydi

**Preview:**
- A4 formatda kartalar ko'rsatiladi (2 ustun x 4 qator = 8 karta / sahifa)
- Har bir karta: 90mm x 55mm
- Oldi va orqa alohida sahifalarda (duplex print uchun)
- Orqa tomon oynali tartibda (1↔0, 3↔2, 5↔4, 7↔6) — duplex to'g'ri tushishi uchun

---

## 4. Backend API endpointlar

### 4.1. `POST /mini/admin/bulk-check/`

Ro'yxatni parse qiladi va DB da tekshiradi.

**Request:**
```json
{
  "rows": [
    {"phone": "998901234567", "org": "MebelMax", "name": "Ozodbek Karimov"},
    {"phone": "998912345678", "org": "DoorPlus", "name": "Dilshod Rahimov"},
    {"phone": "invalid", "org": "WoodArt", "name": "Sardor"}
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "results": [
    {"phone": "998901234567", "org": "MebelMax", "name": "Ozodbek Karimov", "state": "new"},
    {"phone": "998912345678", "org": "DoorPlus", "name": "Dilshod Rahimov", "state": "exists", "user_id": 5, "username": "dilshod_r"},
    {"phone": "invalid", "org": "WoodArt", "name": "Sardor", "state": "error", "error": "Telefon noto'g'ri"}
  ],
  "summary": {"new": 1, "exists": 1, "error": 1}
}
```

### 4.2. `POST /mini/admin/bulk-create/`

Yangi userlar yaratadi va parol generatsiya qiladi. Mavjud userlar uchun parolni yangilaydi.

**Request:**
```json
{
  "rows": [
    {"phone": "998901234567", "org": "MebelMax", "name": "Ozodbek Karimov"}
  ],
  "status": "start",
  "include_existing": true
}
```

**Response:**
```json
{
  "ok": true,
  "users": [
    {
      "id": 10,
      "name": "Ozodbek Karimov",
      "phone": "998901234567",
      "org": "MebelMax",
      "username": "ozodbek_k",
      "password": "MC-A7K9",
      "status": "start",
      "is_new": true
    }
  ],
  "created": 1,
  "updated": 0
}
```

### 4.3. `POST /mini/admin/card-users/`

Mavjud userlar uchun karta ma'lumotlarini qaytaradi, ixtiyoriy parolni yangilaydi.

**Request:**
```json
{
  "user_ids": [1, 2, 3],
  "reset_password": true
}
```

**Response:**
```json
{
  "ok": true,
  "users": [
    {
      "id": 1,
      "name": "Ozodbek Karimov",
      "phone": "998901234567",
      "org": "MebelMax",
      "username": "ozodbek_k",
      "password": "MC-B3M2",
      "status": "gold"
    }
  ]
}
```

---

## 5. Parol formati

```
MC- + 4 ta random belgi (katta harf + raqam) = MC-A7K9, MC-B3M2, MC-X4P1, ...
```

**Generatsiya:**
```python
'MC-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
```

---

## 6. Status mapping

VIP level dan vizit karta statusiga:

| ClientUser.vip_level | Karta status | Karta rangi | Status nomi |
|---------------------|-------------|-------------|-------------|
| null (yo'q) | `start` | `#3c4450` (kulrang) | Start |
| level_number = 1 | `hamkor` | `#157a3a` (yashil) | Hamkor |
| level_number = 2 | `silver` | `#6b7480` (kumush) | Silver Hamkor |
| level_number = 3 | `gold` | `#b07d12` (oltin) | Gold Hamkor |
| level_number >= 4 | `vip` | `#1a2433` (qora) | VIP Hamkor |

Bulk import da admin yangi userlar uchun statusni tanlaydi (default: start).

---

## 7. Vizit karta dizayni

### 7.1. Oldi tomon (90mm x 55mm)
```
┌──────────────────────────────────────┐
│ ▬▬▬▬▬▬▬▬▬ accent stripe ▬▬▬▬▬▬▬▬▬▬ │
│                                      │
│  [LOGO] MEBEL CITY      [STATUS]    │
│                                      │
│                                      │
│  Hamkor                              │
│  OZODBEK KARIMOV                     │
│                                      │
│  +998 90 123 45 67   Mebel-City hamkori│
└──────────────────────────────────────┘
```
- Rangli fon (statusga qarab)
- Mebel-City logotipi (base64 PNG)
- Status tag (yuqori o'ng)
- Ism familya (katta, oq)
- Telefon (pastda)
- "MC" watermark (katta, shaffof)

### 7.2. Orqa tomon (90mm x 55mm)
```
┌──────────────────────────────────────┐
│ ▬▬▬▬▬▬▬▬▬ accent stripe ▬▬▬▬▬▬▬▬▬▬ │
│                                      │
│  [LOGO] Dasturga kirish    │ ┌────┐ │
│                             │ │ QR │ │
│  Login:  ozodbek_k          │ │    │ │
│  Parol:  MC-A7K9            │ │    │ │
│  Tel:    +998 90 123 45 67  │ └────┘ │
│                             │Skaner- │
│  ┌─────────────────────┐   │ lang   │
│  │QR kodni skanerlang  │   │        │
│  │yoki mebelcity.      │   │        │
│  │bittada.uz ga kiring │   │        │
│  └─────────────────────┘   │        │
└──────────────────────────────────────┘
```
- Oq fon
- Login, parol, telefon
- QR kod (login sahifaga havola)
- Ko'rsatma matni

### 7.3. Print layout
- A4 sahifa: 210mm x 297mm
- Grid: 2 ustun x 4 qator = 8 karta
- Kartalar orasida gap yo'q (bleed) — kesish xatosiga chidamli
- Duplex uchun orqa sahifa oynali tartib:
  ```
  Oldi:  [0][1]    Orqa:  [1][0]
         [2][3]           [3][2]
         [4][5]           [5][4]
         [6][7]           [7][6]
  ```

---

## 8. O'zgariladigan fayllar

| Fayl | O'zgarish |
|------|----------|
| `client_erp/views/admin.py` | +3 endpoint: `bulk-check`, `bulk-create`, `card-users` |
| `client_erp/urls.py` | +3 URL pattern |
| `template/client_erp/admin/dashboard.html` | Yangi tab + panel (CSS + HTML + JS + karta generatori) |

---

## 9. Xavfsizlik

- Barcha endpointlar `@_staff_required` bilan himoyalangan (login + is_staff)
- Parollar faqat response'da qaytadi, DB da hash saqlanadi
- CSRF himoyasi (`X-CSRFToken` header)
- Generatsiya qilingan parollar ekranda ko'rsatiladi va print qilinadi — keyin yo'qoladi

---

## 10. Texnik talablar

- QR kod: `qrcodejs` kutubxonasi (CDN: `https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js`)
- Logo: base64 PNG (HTML ichida, tashqi dependency yo'q)
- Print: `@media print` — boshqaruv paneli yashirinadi, faqat kartalar chiqadi
- Telefon formatlash: `998901234567` → `+998 90 123 45 67` (karta uchun)
- Username generatsiya: `ClientUser.generate_username(name)` — mavjud metod ishlatiladi
