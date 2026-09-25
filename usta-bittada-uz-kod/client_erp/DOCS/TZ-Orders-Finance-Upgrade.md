# MINI ERP — BUYURTMA VA MOLIYA TIZIMI UPGRADE TZ

> Versiya: 1.0 | Sana: 2026-05-20

---

## 1. MAQSAD

Mebelchi (usta) o'z mijozlaridan pul oladi, MebelCity'da material/xizmat sotib oladi, mebel yasaydi.
Bu tizim mebelchining **to'liq moliyaviy oqimini** boshqaradi:

```
Mijozdan kirim → Materialga chiqim → MebelCity xizmatiga chiqim → Foyda hisoblash → Pul yechish
```

---

## 2. MOLIYAVIY OQIM (FLOW)

```
┌──────────────────────────────────────────────────────────┐
│  BUYURTMA YARATILDI (Mijoz: Sardor, Kuxnya 15 mln)     │
│                                                          │
│  1. KIRIM — mijozdan pul olindi                         │
│     ├── Avans: 7 000 000 UZS (naqd)                    │
│     └── Qoldiq: 8 000 000 UZS (keyinroq)               │
│                                                          │
│  2. CHIQIM — materialga sarflandi                       │
│     ├── MebelCity'dan ЛДСП: 3 500 000 UZS              │
│     ├── MebelCity'dan кромка: 200 000 UZS              │
│     ├── MebelCity'dan raspil xizmati: 450 000 UZS      │
│     ├── Furnitura (bozordan): 1 200 000 UZS            │
│     └── Transport: 300 000 UZS                          │
│     Jami chiqim: 5 650 000 UZS                          │
│                                                          │
│  3. QOLDIQ KIRIM — mijoz qolgan pulni to'ladi           │
│     └── 8 000 000 UZS (karta)                           │
│                                                          │
│  4. FOYDA = Jami kirim - Jami chiqim                    │
│     = 15 000 000 - 5 650 000 = 9 350 000 UZS           │
│                                                          │
│  5. PUL YECHISH — mebelchi o'z foydasi                  │
│     └── 5 000 000 UZS (shaxsiy hisob)                  │
│     Qolgan balans: 4 350 000 UZS                        │
└──────────────────────────────────────────────────────────┘
```

---

## 3. BUYURTMA SAHIFASI UPGRADE

### 3.1. Buyurtma kartochkasi (mavjud, kengaytiriladi)

**Yangi elementlar:**

| Element | Tavsif |
|---------|--------|
| **Moliya xulosa** | Kirim / Chiqim / Foyda — buyurtma ichida |
| **To'lov progress** | Progress bar: qancha to'langan / qolgan qarz |
| **Kirim qo'shish** | "💰 Kirim" tugmasi — mijozdan pul olindi |
| **Chiqim qo'shish** | "📤 Chiqim" tugmasi — materialga sarflandi |
| **Tranzaksiyalar** | Kirim/chiqim tarix jadvali (buyurtma ichida) |
| **Status yangilash** | Dropdown yoki tugmalar bilan status o'zgartirish |

### 3.2. Buyurtma detail sahifasi yangi ko'rinishi

```
┌──────────────────────────────────────────────────────┐
│  ← Ortga                                    Status ▼ │
│                                                      │
│  🛋️ Kuxnya mebeli                                   │
│  Mijoz: Sardor · 998901234567                        │
│  Sana: 20.05.2026 · Muddat: 01.06.2026              │
│                                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │15 000 000│ │5 650 000│ │9 350 000│ │ 100%    │   │
│  │  Kirim  │ │ Chiqim  │ │  Foyda  │ │To'langan│   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                      │
│  ████████████████████████ 100% to'langan             │
│                                                      │
│  ┌────────────┐  ┌────────────┐                     │
│  │ 💰 Kirim   │  │ 📤 Chiqim  │                     │
│  └────────────┘  └────────────┘                     │
│                                                      │
│  📋 Tranzaksiyalar                                   │
│  ┌──────────────────────────────────────────────┐    │
│  │ 💰 20.05  Avans (naqd)         +7 000 000   │    │
│  │ 📤 21.05  ЛДСП material        -3 500 000   │    │
│  │ 📤 21.05  Кромка                  -200 000   │    │
│  │ 📤 22.05  Raspil xizmati          -450 000   │    │
│  │ 📤 22.05  Furnitura (bozor)     -1 200 000   │    │
│  │ 📤 23.05  Transport               -300 000   │    │
│  │ 💰 25.05  Qoldiq to'lov (karta)+8 000 000   │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  📜 Timeline                                         │
│  · 20.05 Buyurtma yaratildi                          │
│  · 21.05 Material olinmoqda                          │
│  · 25.05 To'lov tugallandi                           │
│  · 28.05 Buyurtma tayyor                             │
└──────────────────────────────────────────────────────┘
```

### 3.3. Kirim modal

```
┌─────────────────────────────────────┐
│  💰 Kirim qo'shish                 │
│                                     │
│  Summa *        [___________] UZS   │
│  Valyuta        [UZS ▼]            │
│  Kurs (USD)     [12 500]           │
│  To'lov usuli   [Naqd ▼]          │
│  Izoh           [Avans_______]      │
│  Sana           [20.05.2026]       │
│                                     │
│  [Bekor]              [💰 Saqlash]  │
└─────────────────────────────────────┘
```

### 3.4. Chiqim modal

```
┌─────────────────────────────────────┐
│  📤 Chiqim qo'shish                │
│                                     │
│  Kategoriya     [Material ▼]        │
│     Material | Xizmat | Transport   │
│     Furnitura | Boshqa              │
│                                     │
│  Summa *        [___________] UZS   │
│  Izoh *         [ЛДСП sotib olish]  │
│  MebelCity'dan  [✓] (avtomatik)    │
│  Sana           [21.05.2026]       │
│                                     │
│  [Bekor]              [📤 Saqlash]  │
└─────────────────────────────────────┘
```

---

## 4. MOLIYA SAHIFASI UPGRADE

### 4.1. Yangi ko'rinish

```
┌──────────────────────────────────────────────────────┐
│  💰 Moliya                                           │
│                                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │45 000 000│ │12 500 000││32 500 000│ │3 200 000│  │
│  │  Kirim  │ │  Chiqim  │ │  Foyda  │ │  Qarz   │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                      │
│  [💰 Kirim] [📤 Chiqim] [💸 Pul yechish] [📊 Filtr]│
│                                                      │
│  ═══ Tablar ═══                                      │
│  [Barchasi] [Kirimlar] [Chiqimlar] [Qarzlar] [Yechish]│
│                                                      │
│  📋 Tranzaksiyalar                                   │
│  ┌──────────────────────────────────────────────┐    │
│  │ 💰 20.05  Sardor — Avans (naqd)  +7 000 000 │    │
│  │ 📤 21.05  MebelCity — ЛДСП      -3 500 000  │    │
│  │ 💸 22.05  Pul yechish            -2 000 000  │    │
│  │ 💰 25.05  Sardor — Qoldiq        +8 000 000  │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ═══ Qarzlar ═══                                     │
│  ┌──────────────────────────────────────────────┐    │
│  │ Sardor — Kuxnya        3 200 000 / 15 000 000│    │
│  │ ████████████░░░░        78% to'langan         │    │
│  │ [💰 To'lov qilish]                           │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

### 4.2. Pul yechish (YANGI)

Mebelchi o'z foydasi hisobidan pul yechadi — bu shaxsiy daromad.

**Model: ClientFinanceRecord** (mavjud, `record_type='withdrawal'` qo'shiladi)

```
┌─────────────────────────────────────┐
│  💸 Pul yechish                     │
│                                     │
│  Summa *        [___________] UZS   │
│  Mavjud balans: 9 350 000 UZS      │
│                                     │
│  Izoh           [Oylik_______]      │
│  Sana           [20.05.2026]       │
│                                     │
│  [Bekor]              [💸 Yechish]  │
└─────────────────────────────────────┘
```

**Balans hisob:**
```
Umumiy balans = Jami kirim - Jami chiqim - Jami pul yechish
```

---

## 5. MODEL O'ZGARISHLAR

### 5.1. ClientFinanceRecord — record_type kengaytirish

```python
RECORD_TYPES = [
    ('income', 'Kirim'),
    ('expense', 'Chiqim'),
    ('withdrawal', 'Pul yechish'),    # YANGI
    ('debt_given', 'Qarz berdim'),
    ('debt_received', 'Qarz oldim'),
    ('debt_paid', "Qarz to'ladi"),
]
```

### 5.2. ClientFinanceRecord — kategoriya qo'shish

```python
EXPENSE_CATEGORIES = [
    ('material', 'Material'),
    ('service', 'Xizmat'),
    ('transport', 'Transport'),
    ('furniture', 'Furnitura'),
    ('mebelcity', 'MebelCity'),
    ('other', 'Boshqa'),
]
category = CharField(max_length=20, choices=EXPENSE_CATEGORIES, blank=True, default='')
payment_method = CharField(max_length=20, choices=[
    ('cash', 'Naqd'), ('card', 'Karta'), ('transfer', "O'tkazma")
], default='cash')
```

### 5.3. ClientOrder — moliya hisob fieldlari (computed)

Yangi field qo'shish shart emas — `ClientFinanceRecord.order` orqali hisoblash mumkin:
```python
@property
def total_income(self):
    return self.finance_records.filter(record_type='income', is_deleted=False).aggregate(Sum('amount'))['amount__sum'] or 0

@property  
def total_expense(self):
    return self.finance_records.filter(record_type='expense', is_deleted=False).aggregate(Sum('amount'))['amount__sum'] or 0

@property
def profit(self):
    return self.total_income - self.total_expense
```

---

## 6. API ENDPOINTLAR (yangi va kengaytirilgan)

### Buyurtma:

```
GET  /mini/<username>/orders/<pk>/           — detail (kirim/chiqim bilan)
POST /mini/<username>/orders/<pk>/income/    — kirim qo'shish
POST /mini/<username>/orders/<pk>/expense/   — chiqim qo'shish
POST /mini/<username>/orders/<pk>/status/    — status o'zgartirish
```

### Moliya:

```
POST /mini/<username>/finance/withdrawal/    — pul yechish
GET  /mini/<username>/finance/?tab=income    — filtrlangan ro'yxat
GET  /mini/<username>/finance/?tab=expense
GET  /mini/<username>/finance/?tab=debts
GET  /mini/<username>/finance/?tab=withdrawal
```

---

## 7. IMPLEMENT KETMA-KETLIGI

### Faza 1 — Model yangilash
1. `ClientFinanceRecord.RECORD_TYPES` ga `'withdrawal'` qo'shish
2. `ClientFinanceRecord` ga `category`, `payment_method` fieldlari
3. `ClientOrder` ga `total_income`, `total_expense`, `profit` property
4. Migration

### Faza 2 — Buyurtma detail upgrade
5. View: buyurtma detail ga kirim/chiqim hisob qo'shish
6. Template: moliya xulosa, progress bar, tranzaksiyalar jadvali
7. Kirim modal + endpoint
8. Chiqim modal + endpoint (kategoriya bilan)

### Faza 3 — Moliya sahifasi upgrade
9. View: filtr (tab), pul yechish
10. Template: tablar, pul yechish tugmasi, qarz to'lov modal
11. Pul yechish modal + endpoint

### Faza 4 — Qarz tizimi
12. Qarz detail sahifasi (to'lovlar tarixi)
13. Qarz yaratish — buyurtma bilan bog'lash
14. To'lov qilish modal

---

## 8. TEGISHLI FAYLLAR

| Fayl | O'zgarish |
|------|-----------|
| `client_erp/models/finance.py` | record_type kengaytirish, category, payment_method |
| `client_erp/models/order.py` | property: total_income, total_expense, profit |
| `client_erp/views/orders.py` | detail upgrade, income/expense endpoints |
| `client_erp/views/finance.py` | withdrawal endpoint, filtr |
| `client_erp/urls.py` | yangi URL lar |
| `template/client_erp/pages/orders/detail.html` | moliya xulosa, modallar |
| `template/client_erp/pages/finance/list.html` | tablar, pul yechish, qarz modal |
