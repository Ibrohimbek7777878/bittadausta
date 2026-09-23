# FAZA 3: Frontend UI — Order Detail sahifasi

**Fayl:** `client_erp/DOCS/FAZA-3-Frontend-UI.md`
**Davomiyligi:** ~2 soat
**Oldingi shart:** Faza 1 (modellar) + Faza 2 (API) tugatilgan
**Natija:** Order detail sahifasi to'liq qayta dizayn — etaplar, checklist, chiqim, ruxsatlar UI

---

## PROMPT (Claude uchun)

```
Sening vazifang Client ERP order detail sahifasini to'liq qayta yozish — dinamik etaplar bilan professional mobile-first UI.

KONTEKST:
- Template: /home/user/mebelcity_platform/template/client_erp/pages/orders/detail.html
- Base template: template/client_erp/base.html ({% extends "client_erp/base.html" %})
- CSS: /static/client_erp/css/base.css (mavjud: ce-card, ce-btn, ce-badge, ce-stats, ce-modal, ce-input, ce-field, ce-section-title)
- Faqat jQuery/vanilla JS — React/Vue yo'q
- FontAwesome 5 mavjud
- Inter font
- Dark/light ranglar var() bilan: --bg, --card, --text, --text2, --accent (#10b981), --accent2 (#6366f1), --danger (#ef4444), --border
- Mobile-first: 360px dan boshlab

CONTEXT dan keladigan o'zgaruvchilar (Faza 2 da qo'shilgan):
- order — ClientOrder object
- items — OrderItem lar
- stages — ClientOrderStage lar (prefetch: checklist, expenses, assigned_to, completed_by)
- transactions — ClientFinanceRecord lar
- timeline — ClientOrderTimeline lar
- permissions — ClientOrderPermission lar (faqat owner ko'radi)
- is_owner — bool
- user_role — 'owner' | 'viewer' | 'worker' | 'manager'
- user_permission — ClientOrderPermission | None
- stage_templates — shablon lar (faqat owner)
- mc_code — MebelCity order code (agar bor)
- customers — ClientCustomer ro'yxat
- user — ClientUser

═══ SAHIFA STRUKTURASI ═══

Sahifani to'liq qayta yoz (eski kodni o'chir). Tartib:

1. HEADER
   - "← Orqaga" link (../  ga)
   - Order title (h2, 20px, font-weight 900)
   - Status dropdown (select, agar owner/manager) + mijoz + sana + mc_code
   - Agar owner emas — read-only badge

2. PROGRESS BAR (yangi)
   - Agar stages mavjud:
   - Overall progress: "60% tugallangan (3/5 etap)"
   - Gradient progress bar (accent rangda)
   - Agar stages yo'q — ko'rsatma

3. MOLIYA XULOSA
   - 2x2 grid (ce-stats): Kirim / Chiqim / Foyda / To'langan %
   - To'lov progress bar (agar estimated_price bor)

4. ACTION BUTTONS
   - 💰 Kirim (accent) — mavjud modal
   - 📤 Chiqim (danger) — kengaytirilgan modal (stage tanlash bilan)
   - 🏢 MebelCity (agar bog'lanmagan) — mavjud
   - Agar owner emas (worker) — faqat ruxsat berilgan tugmalar

5. ETAPLAR (asosiy yangi qism)
   - Section title: "Etaplar"
   - Har etap — accordion card:

   ┌─────────────────────────────────────────┐
   │ [Klik → ochish/yopish]                   │
   │                                           │
   │  {icon} {sort_order}. {title}             │
   │           [status badge]    💵 {expense}  │
   │  👤 {assigned_to}  📅 {deadline}          │
   │                                           │
   │  ─── ochilganda ─────────────────────── │
   │                                           │
   │  ☑ ЛДСП sotib olish       ← checkbox    │
   │  ☐ Furnitura olish                       │
   │  ☐ Oynaband                              │
   │                                           │
   │  📤 Chiqimlar: 2,500,000 so'm            │
   │  ├ 1,200,000 — ЛДСП (material)           │
   │  └ 1,300,000 — Furnitura (furniture)      │
   │                                           │
   │  📝 Izoh: _______________                 │
   │                                           │
   │  [📤 +Chiqim] [⏭️ O'tkazish] [✅ Tugatish]│
   └─────────────────────────────────────────┘

   Status badge ranglari:
   - pending: kulrang (#94a3b8), icon ⏳
   - active: indigo (#6366f1), icon 🔄, pulsating border
   - completed: yashil (#10b981), icon ✅
   - skipped: sariq (#f59e0b), icon ⏭️

   MebelCity etap (is_mebelcity=True) — maxsus ko'rinish:
   - Agar order.mebelcity_order_id yo'q: "🏢 MebelCity'ga yuborish" tugmasi
   - Agar bor: MC kodi, URL link, narx
   - Border rang: #6366f1, gradient fon

   Accordion logika:
   - Aktiv etap (status=='active') default ochiq
   - Boshqalar yopiq
   - Click → toggle (max-height transition 0.3s)
   - Faqat bitta ochiq bo'lishi shart EMAS (bir nechta ochiq bo'lishi mumkin)

   Tugmalar:
   - "📤 +Chiqim" — chiqim modali, stage_id yuboriladi
   - "⏭️ O'tkazish" — confirm dialog, skip API
   - "✅ Tugatish" — checklist tekshirish (frontend), complete API
   - Owner/manager: barcha tugmalar
   - Worker: faqat ruxsat berilgan etaplarda
   - Viewer: tugmalar yo'q

6. ETAP QO'SHISH (faqat owner/manager)
   - Pastda: "+ Etap qo'shish" tugmasi
   - Click → inline card ochiladi (modal emas):
     - Title input
     - Icon picker: 10 ta emoji tugma (📐 ✂️ 🔨 🪚 🎨 🚛 🏢 📦 ✅ 📋)
     - Rang picker: 6 ta preset (#6366f1, #10b981, #ef4444, #f59e0b, #8b5cf6, #3b82f6)
     - Deadline input (date)
     - MebelCity etap checkbox
     - Checklist builder: dinamik input lar + "+" tugma
     - [Bekor] [Saqlash]

   - Shablon tanlash:
     - "+ Etap qo'shish" yonida "📋 Shablondan" tugmasi
     - Click → dropdown: mavjud shablonlar
     - Tanlash → confirm → barcha etaplar qo'shiladi

7. ETAP TARTIBINI O'ZGARTIRISH (faqat owner/manager)
   - Har etap kartasida ↑ ↓ tugmalari (kichik, yuqori o'ng burchak)
   - Click → reorder API → sahifa yangilanadi (yoki DOM manipulyatsiya)

8. RUXSATLAR (faqat owner ko'radi)
   - Section title: "👥 Ruxsatlar"
   - Har permission — card:
     - 👤 {user.full_name} — {role badge} — etaplar
     - [🗑 O'chirish]
   - "+ Ruxsat berish" tugmasi → modal:
     - User qidirish (telefon/ism input + AJAX search)
     - Rol: radio (Ko'ruvchi / Ishchi / Menejer)
     - Etaplar: checkbox lar (barchasi + har etap)
     - Chiqim huquqi: checkbox
     - [Bekor] [Saqlash]

9. TRANZAKSIYALAR — mavjud ko'rinish (o'zgarmaydi)

10. TIMELINE — mavjud ko'rinish (o'zgarmaydi)

═══ CHIQIM MODALI KENGAYTIRISH ═══

Mavjud expense modalga qo'shish:
- Yuqorida: "Etap" dropdown (select):
  <option value="">— Umumiy —</option>
  {% for s in stages %}<option value="{{ s.id }}">{{ s.sort_order }}. {{ s.title }}</option>{% endfor %}
- stage_id ni POST body ga qo'shish

═══ JAVASCRIPT FUNKSIYALAR ═══

1. stageToggle(stageId) — accordion ochish/yopish
2. stageCheck(stageId, itemId) — checkbox toggle (fetch POST)
3. stageComplete(stageId) — "haqiqatdan tugatasizmi?" confirm, fetch POST, reload
4. stageSkip(stageId) — confirm, fetch POST, reload
5. stageDelete(stageId) — confirm, fetch POST, reload
6. stageReorder(stageId, direction) — direction='up'/'down', sort_order swap, fetch POST
7. openAddStage() — inline card ko'rsatish
8. saveStage() — yangi etap saqlash (fetch POST, reload)
9. applyTemplate(tmplId) — shablon qo'llash (fetch POST, reload)
10. openPermModal() — ruxsat modali ochish
11. savePerm() — ruxsat saqlash
12. deletePerm(permId) — ruxsat o'chirish
13. searchUsers(query) — AJAX user search (GET /mini/<username>/clients/ dan foydalanish yoki alohida endpoint)

═══ CSS STILLAR ═══

Sahifa ichida <style> tag bilan (base.css ga tegma):

.stage-card — etap kartasi
.stage-card.active — aktiv etap (indigo border, pulsating)
.stage-card.completed — yashil chiziq
.stage-card.skipped — sariq, opacity .7
.stage-header — click target, cursor pointer, display flex
.stage-body — accordion content, max-height 0 → auto, overflow hidden, transition .3s
.stage-body.open — max-height: 2000px (yoki scrollHeight)
.stage-badge — status badge (rounded, kichik)
.stage-checklist — checklist container
.stage-check-item — har bir checkbox qator
.stage-check-item.done — line-through, opacity .6
.stage-expense-list — chiqimlar ro'yxati
.stage-actions — tugmalar container (flex, gap 8px)
.icon-picker — emoji tugmalar grid
.color-picker — rang tugmalar grid
.checklist-builder — dinamik input lar

Animatsiyalar:
- .stage-card.active: border-left: 3px solid #6366f1, box-shadow 0 0 0 1px rgba(99,102,241,.2)
- .stage-body: transition max-height .3s ease-out
- Checkbox toggle: smooth (transform scale)

═══ MOBILE RESPONSIVE QOIDALAR ═══

- Barcha kartalar: width 100%, border-radius 14px
- Tugmalar: min-height 44px (touch target)
- Font: 13px asosiy, 11px secondary
- Accordion: smooth transition
- Moliya stats: 2 ustun (mobile), 4 ustun (768px+)
- Stage actions: flex-wrap bilan (agar tor ekran)
- Modal: max-width 500px, mobile da 95vw
- Bottom padding: 80px (bottom nav uchun)

═══ QOIDALAR ═══
- base.css ga TEGMA — barcha CSS <style> tag ichida
- Faqat shu bitta template faylni o'zgartir
- jQuery yoki vanilla JS — boshqa kutubxona qo'shma
- CSRF token: {{ csrf_token }}
- API URL lar: '/mini/{{ user.username }}/orders/'+ORDER_ID+'/stages/...'
- Barcha fetch POST lar JSON body bilan
- XSS himoya: user inputlarni DOM ga qo'yishda textContent ishlatish (innerHTML emas)
- Sahifa reload: location.reload() — real-time keyin qo'shiladi
- Restart: sudo systemctl restart bittada-manager (template o'zgarish uchun)
```

---

## Fayl xaritasi

| Fayl | Harakat |
|------|---------|
| `template/client_erp/pages/orders/detail.html` | TO'LIQ QAYTA YOZISH |

---

## Visual reference

```
Mobile (360px):
┌──────────────────┐
│ ← Orqaga         │
│ Oshxona mebel    │
│ [Yangi ▾] Anvar  │
│ ████████░░ 60%   │
│                  │
│ ┌──┐ ┌──┐       │
│ │15M│ │8M│       │
│ │Kim│ │Chq│      │
│ ├──┤ ├──┤       │
│ │7M │ │75%│      │
│ │Fyd│ │To'l│     │
│ └──┘ └──┘       │
│                  │
│ [Kirim][Chiqim]  │
│                  │
│ ═ ETAPLAR ═══    │
│ ┌─────────────┐  │
│ │✅ 1.Dizayn 0│  │
│ └─────────────┘  │
│ ┌─────────────┐  │
│ │🔄 2.Material│  │ ← OCHIQ
│ │ ☑ ЛДСП      │  │
│ │ ☐ Furnitura  │  │
│ │ 💵 2.5M      │  │
│ │[+Chiq][Tugat]│  │
│ └─────────────┘  │
│ ┌─────────────┐  │
│ │⏳ 3.Kesish   │  │
│ └─────────────┘  │
│                  │
│ [+ Etap qo'shish]│
│                  │
│ ═ RUXSATLAR ══   │
│ 👤 Bobur (worker)│
│ [+ Ruxsat berish]│
│                  │
│ ═ TARIX ══════   │
│ ● Stage completed│
│ ● Order created  │
│                  │
│  [80px padding]  │
└──────────────────┘
```
