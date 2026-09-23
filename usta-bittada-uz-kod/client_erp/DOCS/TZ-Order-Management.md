# TZ: Professional Order Management — Dynamic Stages

**Loyiha:** MebelCity Client ERP (`/mini/<username>/orders/<pk>/`)
**Sana:** 2026-05-20
**Maqsad:** Har bir buyurtmaga dinamik etaplar (stages), har etapda rasxod kuzatuv, boshqa foydalanuvchilarga ruxsat tizimi, MebelCity zakaz etapi, mobile-first minimalistik UI

---

## 1. Hozirgi holat

### Mavjud modellar
- `ClientOrder` — sarlavha, mijoz, status (6 ta: new → delivered/cancelled), narx, MebelCity bog'lanish
- `ClientOrderItem` — buyurtma tarkibi (nomi, material, soni, narx)
- `ClientOrderTimeline` — hodisalar tarixi (action + note + vaqt)
- `ClientFinanceRecord` — kirim/chiqim yozuvlari (order ga FK)

### Muammo
1. **Status — chiziqli va qattiq.** 6 ta hardcoded status. Real hayotda har bir mebel buyurtma o'ziga xos etaplardan o'tadi
2. **Etaplar yo'q.** Dizayn, Material olish, Kesish, Yig'ish, Bo'yash, Yetkazish — bularni kuzatib bo'lmaydi
3. **Chiqim etapga bog'lanmagan.** Materialga qancha, transportga qancha — faqat umumiy ko'rinadi
4. **Hamkorlik imkoni yo'q.** Usta boshqa foydalanuvchiga (seh boshlig'i, yordamchi) etapni bajarishni topa olmaydi
5. **MebelCity zakaz — holat ko'rinmaydi.** Faqat "o'tkazildi" yozuvi bor, lekin jarayon kuzatilmaydi

---

## 2. Yangi arxitektura

### 2.1. Modellar

```
ClientOrder (mavjud, kengaytiriladi)
  │
  ├── ClientOrderStage (YANGI)
  │     ├── order (FK → ClientOrder)
  │     ├── template (FK → ClientOrderStageTemplate, nullable)
  │     ├── title (CharField)
  │     ├── icon (CharField — emoji, default "📋")
  │     ├── color (CharField — hex, default "#6366f1")
  │     ├── sort_order (IntegerField)
  │     ├── status: pending | active | completed | skipped
  │     ├── assigned_to (FK → ClientUser, nullable) — kim bajaradi
  │     ├── started_at (DateTimeField, nullable)
  │     ├── completed_at (DateTimeField, nullable)
  │     ├── completed_by (FK → ClientUser, nullable)
  │     ├── note (TextField, blank)
  │     ├── estimated_cost (Decimal, nullable)
  │     ├── deadline (DateTimeField, nullable)
  │     └── is_mebelcity (BooleanField, default False)
  │
  ├── ClientOrderStageItem (YANGI)
  │     ├── stage (FK → ClientOrderStage)
  │     ├── title (CharField — "ЛДСП kesish", "Furnitura olish")
  │     ├── is_done (BooleanField)
  │     ├── done_by (FK → ClientUser, nullable)
  │     ├── done_at (DateTimeField, nullable)
  │     └── sort_order (IntegerField)
  │
  ├── ClientOrderPermission (YANGI)
  │     ├── order (FK → ClientOrder)
  │     ├── user (FK → ClientUser)
  │     ├── role: viewer | worker | manager
  │     ├── stages (M2M → ClientOrderStage, blank)
  │     │     ↑ bo'sh = barcha etaplarga ruxsat
  │     ├── can_add_expense (BooleanField, default False)
  │     ├── can_complete_stage (BooleanField, default True)
  │     └── created_at
  │
  └── ClientFinanceRecord (mavjud, kengaytiriladi)
        └── stage (FK → ClientOrderStage, nullable) — YANGI FIELD
```

#### ClientOrderStageTemplate (YANGI — shablon)
```
ClientOrderStageTemplate
  ├── owner (FK → ClientUser) — kim yaratdi
  ├── name (CharField — "Oshxona mebel", "Shkaf", "Umumiy")
  ├── is_default (BooleanField)
  └── created_at

ClientOrderStageTemplateItem
  ├── template (FK → ClientOrderStageTemplate)
  ├── title (CharField)
  ├── icon (CharField)
  ├── color (CharField)
  ├── sort_order (IntegerField)
  ├── is_mebelcity (BooleanField)
  └── checklist_json (JSONField, default [])
      ↑ ["ЛДСП kesish", "Furnitura olish", ...] — default checklistlar
```

### 2.2. Permission roles

| Rol | Ko'rish | Checkbox | Expense | Stage tugallash | Order tahrirlash |
|-----|---------|----------|---------|-----------------|------------------|
| **viewer** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **worker** | ✅ | ✅ (o'z etaplari) | ❌ | ✅ (o'z etaplari) | ❌ |
| **manager** | ✅ | ✅ | ✅ | ✅ | ✅ |

- `owner` (ClientOrder.owner) — to'liq huquq, hech qanday Permission kerak emas
- Boshqa userlar faqat `ClientOrderPermission` orqali kiradi
- `stages` M2M bo'sh = barcha etaplarga ruxsat (manager odatda)

### 2.3. ClientOrder kengaytirish

```python
# Yangi fieldlar
use_stages = models.BooleanField(default=True)
stage_template = models.ForeignKey(ClientOrderStageTemplate, null=True, blank=True, on_delete=models.SET_NULL)
overall_progress = models.IntegerField(default=0)  # 0-100, cached
```

`overall_progress` = completed_stages / total_stages * 100 — har stage tugaganda yangilanadi.

`status` field saqlanadi (backward compatibility), lekin endi asosan `overall_progress` + stage statuslar bilan ishlaydi:
- 0% → `new`
- 1-99% → `in_progress`  
- 100% → `ready`
- `delivered`, `cancelled` — qo'lda

---

## 3. UI dizayni — `/mini/<username>/orders/<pk>/`

### 3.1. Umumiy layout (Mobile-first)

```
┌─────────────────────────────┐
│ ← Orqaga          #MC-A3X2 │  ← MebelCity code (agar bor)
│                             │
│ ╔═══════════════════════╗   │
│ ║  Oshxona mebel        ║  │  ← Title (katta, bold)
│ ║  👤 Anvar · 15.05.26  ║  │  ← Mijoz + sana
│ ║  ████████░░ 60%       ║  │  ← Progress bar
│ ╚═══════════════════════╝   │
│                             │
│ ┌─── MOLIYA ────────────┐   │
│ │ 💰 15.0M   📤 8.2M    │  │  ← Kirim / Chiqim
│ │ 📊 6.8M    ✅ 75%     │  │  ← Foyda / To'langan
│ └───────────────────────┘   │
│                             │
│ [💰 Kirim] [📤 Chiqim]     │  ← Action buttons
│                             │
│ ── ETAPLAR ──────────────   │
│                             │
│ ┌ 1. ✅ Dizayn ──── 0 ──┐  │  ← Tugallangan, 0 so'm
│ └───────────────────────┘   │
│                             │
│ ┌ 2. 🔄 Material olish ─┐  │  ← Aktiv etap (ajratilgan)
│ │  ☑ ЛДСП sotib olish    │  │  ← Checklist items
│ │  ☐ Furnitura olish     │  │
│ │  ☐ Oynaband buyurtma   │  │
│ │                         │  │
│ │  💵 2,500,000 so'm     │  │  ← Shu etap rasxodlari
│ │  ─────────────────     │  │
│ │  📤 1.2M ЛДСП          │  │
│ │  📤 1.3M Furnitura      │  │
│ │  ─────────────────     │  │
│ │  [📤 +Chiqim] [✅ Tugatish] │ ← Etap tugmalari
│ └───────────────────────┘   │
│                             │
│ ┌ 3. ⏳ Kesish ──────────┐  │  ← Kutayotgan
│ └───────────────────────┘   │
│                             │
│ ┌ 4. ⏳ Yig'ish ─────────┐  │
│ └───────────────────────┘   │
│                             │
│ ┌ 5. 🏢 MebelCity zakaz ─┐  │  ← MebelCity etap
│ │  Narxi: 12,000,000     │  │  ← MebelCity narxi
│ │  Holat: Jarayonda       │  │  ← MebelCity dan sync
│ │  Kod: #MC-A3X2          │  │
│ └───────────────────────┘   │
│                             │
│ ┌ 6. ⏳ Yetkazish ───────┐  │
│ └───────────────────────┘   │
│                             │
│ ── TARIX ────────────────   │
│  ● Material olish boshlandi │
│  ● Dizayn tugallandi         │
│  ● Buyurtma yaratildi        │
│                             │
│ ── RUXSATLAR ────────────   │
│  👤 Bobur (worker) — 2,3    │  ← Etap 2,3 ga ruxsat
│  👤 Shoxrux (viewer)        │
│  [+ Ruxsat berish]          │
└─────────────────────────────┘
```

### 3.2. Etap kartasi (Stage Card)

Har bir etap — accordion tarzida ochiladi/yopiladi. Aktiv etap default ochiq.

**Status ko'rinishi:**

| Status | Icon | Rang | Fon |
|--------|------|------|-----|
| pending | ⏳ | `#94a3b8` (kulrang) | `rgba(148,163,184,.08)` |
| active | 🔄 | `#6366f1` (indigo) | `rgba(99,102,241,.08)` |
| completed | ✅ | `#10b981` (yashil) | `rgba(16,185,129,.08)` |
| skipped | ⏭️ | `#f59e0b` (sariq) | `rgba(245,158,11,.08)` |

**Kartaning tarkibi (ochilganda):**
1. Checklist itemlar (agar bor) — checkbox + nomi
2. Etap rasxodlari ro'yxati (shu stage ga tegishli `ClientFinanceRecord` lar)
3. Etap jami summasi
4. Izoh (textarea, ixtiyoriy)
5. Tugmalar: `📤 +Chiqim` | `⏭️ O'tkazib yuborish` | `✅ Tugatish`

**MebelCity etap (is_mebelcity=True):**
- Agar buyurtma hali yuborilmagan: `🏢 MebelCity'ga yuborish` tugmasi
- Agar yuborilgan: MebelCity kod, narx, holat ko'rinadi
- Chiqim avtomatik qo'shilishi mumkin (MebelCity narxi)

### 3.3. Etap qo'shish

Order detail sahifasida pastda:
```
[+ Etap qo'shish]
```

Modal ochiladi:
- Nomi (input)
- Icon (emoji picker — 10 ta popular: 📐✂️🔨🪚🎨🚛🏢📦✅📋)
- Rang (5-6 ta preset ranglar)
- Deadline (date, ixtiyoriy)
- Checklist (dinamik — har bir qatorga input, + qo'shish)

**Shablondan qo'shish:**
Agar `ClientOrderStageTemplate` mavjud — dropdown bilan tanlash, barcha etaplar bir marta qo'shiladi.

### 3.4. Etaplar drag-and-drop

Mobile uchun: Long-press → drag tartibni o'zgartirish (sort_order).
Yoki oddiy ↑↓ tugmalari.

### 3.5. Ruxsat berish modali

```
[+ Ruxsat berish] tugmasi → Modal:

┌──────────────────────────────────┐
│  👤 Foydalanuvchi tanlash         │
│  [Search: telefon/ism...]         │
│                                   │
│  Rol:  ○ Ko'ruvchi  ● Ishchi  ○ Menejer │
│                                   │
│  Etaplar:                         │
│  ☑ 1. Dizayn                      │
│  ☑ 2. Material olish              │
│  ☐ 3. Kesish                      │
│  ☐ 4. Yig'ish                     │
│  ☑ Barchasi                       │
│                                   │
│  ☐ Chiqim qo'shish huquqi        │
│                                   │
│           [Bekor] [Saqlash]       │
└──────────────────────────────────┘
```

Foydalanuvchi qidirish — `ClientUser.objects.filter()` ism yoki telefon bo'yicha (transliteration bilan).

### 3.6. Shared order sahifasi

`/mini/<username>/orders/<pk>/` — agar `username` buyurtma egasi bo'lmasa, tizim `ClientOrderPermission` tekshiradi.

Agar permission bor — sahifa role ga qarab cheklangan ko'rinishda ochiladi:
- **viewer**: faqat ko'rish (tugmalar yo'q)
- **worker**: o'z etaplarida checkbox + tugatish (boshqa etaplar readonly)
- **manager**: to'liq boshqarish

Worker o'z dashboardida "Menga berilgan vazifalar" bo'limida shared orderlar ko'rinadi.

---

## 4. API endpoints

### 4.1. Yangi endpointlar

```
# Etaplar
POST   /mini/<username>/orders/<pk>/stages/create/         — etap qo'shish
POST   /mini/<username>/orders/<pk>/stages/<stage_id>/update/   — etap yangilash
POST   /mini/<username>/orders/<pk>/stages/<stage_id>/complete/ — etap tugatish
POST   /mini/<username>/orders/<pk>/stages/<stage_id>/skip/     — o'tkazib yuborish
POST   /mini/<username>/orders/<pk>/stages/reorder/        — tartib o'zgartirish
DELETE /mini/<username>/orders/<pk>/stages/<stage_id>/delete/   — etap o'chirish

# Checklist
POST   /mini/<username>/orders/<pk>/stages/<stage_id>/check/   — checkbox toggle
       body: { item_id: int }

# Stage-level chiqim (mavjud expense endpoint kengaytiriladi)
POST   /mini/<username>/orders/<pk>/expense/
       body: { ..., stage_id: int }  — yangi field

# Ruxsatlar
POST   /mini/<username>/orders/<pk>/permissions/save/
POST   /mini/<username>/orders/<pk>/permissions/<perm_id>/delete/

# Shablonlar
POST   /mini/<username>/stages/templates/save/
POST   /mini/<username>/stages/templates/<tmpl_id>/apply/<order_id>/
GET    /mini/<username>/stages/templates/   — ro'yxat (AJAX)
```

### 4.2. Mavjud endpointlar o'zgarishi

- `mini_order_detail` — stage data, permissions, stage-level expenses qo'shiladi
- `mini_order_expense` — `stage_id` qabul qiladi, `ClientFinanceRecord.stage` saqlanadi
- `mini_order_create` — `template_id` qabul qiladi, shablondan etaplar auto-yaratiladi

---

## 5. Biznes logika

### 5.1. Etap tugallash oqimi

```
1. User "✅ Tugatish" bosadi
2. Tekshirish:
   a. Barcha checklist itemlar is_done=True bo'lishi kerak (agar bor)
   b. Permission tekshirish (owner yoki worker/manager)
3. Stage.status = 'completed', completed_at = now(), completed_by = user
4. Keyingi etapni auto-activate: navbatdagi 'pending' stage → 'active'
5. ClientOrder.overall_progress yangilanadi
6. Agar barcha etaplar completed → ClientOrder.status = 'ready'
7. ClientOrderTimeline ga yozuv qo'shiladi
8. XP/tanga: GamificationRule 'complete_stage' triggerlash
```

### 5.2. MebelCity etap

```
1. is_mebelcity=True etapga kelganda:
   a. Agar order hali yuborilmagan → "MebelCity'ga yuborish" tugmasi (mavjud funksiya)
   b. Yuborilgandan keyin:
      - MebelCity code, order URL ko'rinadi
      - Narxni chiqim sifatida qayd qilish mumkin (category='mebelcity')
      - MebelCity dagi holat polling bilan tekshirilishi mumkin (keyinchalik webhook)
   c. MebelCity order tayyor bo'lganda — shu etap auto-complete (keyinchalik)
```

### 5.3. Chiqim etapga bog'lash

```
ClientFinanceRecord.stage = FK(ClientOrderStage)

Har etap kartasida:
  - Shu etap chiqimlari ro'yxati
  - Etap jami summasi
  - Umumiy buyurtma foyda = kirim - barcha etaplar chiqimi
```

### 5.4. Progress hisoblash

```python
total = stages.exclude(status='skipped').count()
done = stages.filter(status='completed').count()
overall_progress = int(done / total * 100) if total > 0 else 0
```

---

## 6. Default shablonlar

Tizim birinchi marta ishga tushganda yaratiladi:

### "Umumiy mebel" (default)
| # | Etap | Icon | Checklist |
|---|------|------|-----------|
| 1 | Dizayn va o'lchov | 📐 | Zamer olish, Chizma tayyorlash, Mijoz tasdiqlash |
| 2 | Material olish | 🧱 | ЛДСП sotib olish, Furnitura olish, Aksessuarlar |
| 3 | Kesish | ✂️ | Materiallarni kesish, Krom yapish |
| 4 | Yig'ish | 🔨 | Korpusni yig'ish, Eshiklarni o'rnatish |
| 5 | MebelCity zakaz | 🏢 | *(is_mebelcity=True)* |
| 6 | Bo'yash / Ishlov | 🎨 | Sirtni tayyorlash, Bo'yash, Quritish |
| 7 | Yetkazish va o'rnatish | 🚛 | Transportga yuklash, Yetkazish, O'rnatish, Mijoz qabul |

### "Oshxona mebel"
| # | Etap | Icon | Checklist |
|---|------|------|-----------|
| 1 | Loyiha | 📐 | 3D loyiha, Mijoz tasdiqlash |
| 2 | Material | 🧱 | ЛДСП, Stoleshnitsa, Moskovka, Furnitura |
| 3 | MebelCity | 🏢 | *(is_mebelcity=True)* |
| 4 | Korpus yig'ish | 🔨 | Pastki shkaflar, Ustki shkaflar |
| 5 | O'rnatish | 🚛 | Yetkazish, O'rnatish, Texnika ulash, Topshirish |

### "Shkaf-kupe"
| # | Etap | Icon | Checklist |
|---|------|------|-----------|
| 1 | O'lchov | 📐 | Zamer, Chizma |
| 2 | Material | 🧱 | ЛДСП, Oyna/Ko'zgu, Profil, Roliklar |
| 3 | Kesish va yig'ish | ✂️ | ЛДСП kesish, Korpus yig'ish |
| 4 | Eshiklar | 🪟 | Profil kesish, Oyna o'rnatish, Yig'ish |
| 5 | O'rnatish | 🚛 | Yetkazish, O'rnatish, Topshirish |

---

## 7. Implementatsiya rejasi

### Faza 1 — Modellar + Migration (1 kun)
- [ ] `ClientOrderStage` model
- [ ] `ClientOrderStageItem` model (checklist)
- [ ] `ClientOrderStageTemplate` + `TemplateItem` modellar
- [ ] `ClientOrderPermission` model
- [ ] `ClientFinanceRecord.stage` FK qo'shish
- [ ] `ClientOrder` ga `use_stages`, `overall_progress` qo'shish
- [ ] Migration yaratish va qo'llash

### Faza 2 — Backend API (1 kun)
- [ ] Stage CRUD views (create, update, complete, skip, delete, reorder)
- [ ] Checklist toggle view
- [ ] Permission CRUD views
- [ ] Template CRUD + apply views
- [ ] `mini_order_expense` ga `stage_id` qo'shish
- [ ] `mini_order_detail` ga stage/permission data qo'shish
- [ ] `mini_order_create` ga template support
- [ ] Permission middleware/decorator: `_check_order_access(request, order)`
- [ ] URL patterns

### Faza 3 — Frontend UI (2 kun)
- [ ] Order detail sahifasini qayta dizayn (yuqoridagi mockup)
- [ ] Stage accordion komponent (ochiq/yopiq, status, rangli)
- [ ] Checklist UI (checkbox toggle, real-time)
- [ ] Stage expense inline ko'rinish
- [ ] Stage qo'shish modali (icon picker, rang, checklist builder)
- [ ] Permission modali (user search, role, stage select)
- [ ] Shablon tanlash modali (yangi buyurtma yaratishda)
- [ ] MebelCity etap maxsus ko'rinishi
- [ ] Drag/sort etaplar (↑↓ tugmalar — mobile uchun)
- [ ] Progress bar animatsiya

### Faza 4 — Shared access + Dashboard (0.5 kun)
- [ ] Shared order ko'rinish (viewer/worker/manager roles)
- [ ] Worker dashboardda "Vazifalarim" bo'limi
- [ ] Timeline avtomatik yozuvlar (stage events)
- [ ] Default shablonlar generatsiya (3 ta)

### Faza 5 — Gamifikatsiya integratsiya (0.5 kun)
- [ ] `complete_stage` → XP/tanga berish
- [ ] `complete_all_stages` → bonus XP
- [ ] `on_time_delivery` → streak/bonus
- [ ] Quest integratsiya (`complete_order` action)

---

## 8. Texnik qarorlar

| Savol | Qaror | Sabab |
|-------|-------|-------|
| Etaplar qanday saqlanadi? | Har bir etap alohida model record | Flexible, reorder mumkin, FK bilan bog'lanish oson |
| Drag-and-drop kutubxona? | ↑↓ tugmalar (kutubxonasiz) | Mobile-first, jQuery dependency yo'q, sodda |
| Checklist — alohida model yoki JSON? | Alohida model (`ClientOrderStageItem`) | Har bir item ga `done_by`, `done_at` kerak — audit trail |
| Permission — middleware yoki decorator? | View ichida tekshirish + helper function | Oddiy, aniq, debug oson |
| Real-time yangilanish? | Hozircha yo'q (page reload) | WebSocket keyin qo'shiladi, hozir MVP |
| Template — admin yoki user? | User o'zi yaratadi | Har bir mebelchi o'z shablonlarini boshqaradi |

---

## 9. Mobile responsive qoidalar

- Barcha kartalar `border-radius: 14px`, `padding: 14px`
- Font: Inter, asosiy matn 13px, sarlavhalar 16-20px
- Tugmalar: minimum `44px` balandlik (touch target)
- Stage card: to'liq kenglikda, accordion ochilishi smooth (`max-height` transition)
- Progress bar: `8px` balandlik, `border-radius: 4px`
- Moliya stats: `grid-template-columns: repeat(2, 1fr)` (mobile), `repeat(4, 1fr)` (desktop)
- Bottom safe area: `padding-bottom: 80px` (bottom nav uchun)
- Modal: mobile da to'liq ekran (bottom sheet pattern)

---

## 10. Xavfsizlik

1. **Owner tekshirish** — barcha endpointlarda `order.owner == request.client_user` YOKI `ClientOrderPermission` mavjud
2. **Role enforcement** — viewer faqat GET, worker faqat o'z etaplari, manager to'liq
3. **Stage ownership** — worker faqat `assigned_to=self` YOKI `permission.stages` ichidagi etaplarga tegishi mumkin
4. **Rate limiting** — expense qo'shishda summa tekshirish (manfiy bo'lmasligi)
5. **Audit** — barcha o'zgarishlar `ClientOrderTimeline` ga yoziladi

---

## 11. Kelajakdagi imkoniyatlar (hozir qilinmaydi)

- WebSocket real-time: bir nechta user bir vaqtda stage ko'rganda live sync
- Push notification: "Sizning etapingiz tayyor" (Telegram bot orqali)
- Stage deadline reminder: etap muddati yaqinlashganda ogohlantirish
- Foto upload: har etapda foto/video biriktirish
- MebelCity webhook: MebelCity dagi holat o'zgarganda auto-update
- Printable report: buyurtma va barcha etaplar hujjat sifatida chop etish
- Analytics: o'rtacha etap davomiyligi, eng ko'p sarf qilingan etap
