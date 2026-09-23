# MINI ERP ADMIN PANEL — TO'LIQ TEXNIK TOPSHIRIQ (TZ)

> Versiya: 1.0 | Sana: 2026-05-20
> Andoza: Mebel-City-Gamifikatsiya-TZ.md

---

## 1. MAQSAD

`/mini/admin/` — Mebel-City xodimlari uchun boshqaruv paneli. Bu panel orqali:
- Mijozlar (ClientUser) boshqariladi
- Gamifikatsiya qoidalari sozlanadi
- Reklama/e'lon/aksiyalar yaratiladi
- Chegirmalar va VIP imtiyozlar belgilanadi
- Har bir mijozning hisobiga kirish mumkin

---

## 2. ADMIN PANEL BO'LIMLARI

### 2.1. Mijozlar boshqaruvi (mavjud, kengaytiriladi)

**Hozirgi:** Faqat ro'yxat + yaratish/parol/bloklash
**Yangi:**

| Funksiya | Tavsif |
|----------|--------|
| **Ro'yxat** | Ism, telefon, status, balans, oxirgi kirish, ERP Client bog'lanishi |
| **Qidiruv** | Kirill/Lotin transliteratsiya, telefon 4+ raqam |
| **Filtr** | Status bo'yicha (Start/Hamkor/Silver/Gold/VIP), Faol/Bloklangan |
| **Yaratish** | Telefon + ism → avtomatik username + parol generatsiya |
| **Parol yangilash** | Yangi 6 raqamli parol, ko'rsatish |
| **Kirish (impersonate)** | Admin mijoz hisobiga kiradi — `/mini/<username>/` ochiladi |
| **Bloklash/Tasdiqlash** | is_blocked, is_verified toggle |
| **ERP bog'lash** | Telefon bo'yicha `clients.Client` ga avtomatik/qo'lda bog'lash |
| **Statistika** | Jami XP, tanga, xaridlar soni, oxirgi faollik |

**Impersonate (kirish) mexanizmi:**
```
POST /mini/admin/impersonate/<user_id>/
→ Admin sessiyasiga `impersonating_client_user_id` yoziladi
→ Redirect: /mini/<username>/
→ Dashboard ochilganda admin sifatida ko'radi (yuqorida "Admin sifatida ko'rmoqdasiz" banner)
→ "Chiqish" bosilsa → admin panelga qaytadi
```

---

### 2.2. Gamifikatsiya sozlamalari

Admin paneldan barcha ball/tanga qoidalari **o'zgartiriladigan** bo'lishi kerak (hardcode emas).

#### 2.2.1. XP/Tanga qoidalari

**Model: `GamificationRule`**
```python
class GamificationRule(models.Model):
    code = CharField(unique=True)       # 'purchase_per_10k', 'daily_login', 'referral'
    name = CharField()                   # "Xarid (har 10,000 so'm)"
    description = TextField()            # Batafsil izoh
    xp_reward = IntegerField(default=0)  # Beriladigan XP
    coin_reward = IntegerField(default=0)# Beriladigan tanga
    is_active = BooleanField(default=True)
    is_repeatable = BooleanField(default=True)  # Bir martalik yoki takroriy
    max_per_day = IntegerField(null=True)       # Kuniga maks (0=cheksiz)
    min_status = FK → ClientVIPLevel(null=True) # Minimal daraja talab
    icon = CharField(default='⭐')
    sort_order = IntegerField(default=0)
```

**Standart qoidalar (admin yaratadi/o'zgartiradi):**

| Kod | Harakat | XP | Tanga | Takroriy | Maks/kun |
|-----|---------|-----|-------|----------|----------|
| `purchase_per_10k` | Xarid (har 10,000 so'm) | +1 | +1 | ✅ | ∞ |
| `daily_login` | Kunlik ilovaga kirish | +10 | +5 | ✅ | 1 |
| `referral_register` | Do'st tavsiya (ro'yxatdan o'tsa) | +500 | +50 | ✅ | ∞ |
| `referral_first_buy` | Tavsiya do'st birinchi xarid | +1000 | +200 | ✅ | ∞ |
| `product_review` | Mahsulot sharhi/foto | +100 | +20 | ✅ | 3 |
| `google_review` | Yandex/Google sharh | +300 | +100 | 1x | 1 |
| `daily_quest` | Kunlik topshiriq | +50 | +20 | ✅ | 3 |
| `weekly_quest` | Haftalik topshiriq | +200 | +100 | ✅ | 1 |
| `birthday` | Tug'ilgan kun | +0 | +200 | 1x/yil | 1 |
| `event_attend` | Tadbirat (plov, ko'rgazma) | +500 | +150 | ✅ | ∞ |
| `profile_complete` | Profil to'ldirish (100%) | +200 | +50 | 1x | 1 |

**Admin UI:** Jadval ko'rinishda — har bir qatorni inline tahrirlash, XP/tanga o'zgartirish, yoqish/o'chirish toggle.

---

#### 2.2.2. Status (daraja) sozlamalari

**Model: `ClientVIPLevel` (mavjud, kengaytiriladi)**

Qo'shiladigan fieldlar:
```python
# Mavjud: name, min_orders, min_amount, discount_percent, cashback_percent, color
# Yangi:
level_number = IntegerField(default=1)           # 1-5
min_turnover = DecimalField()                     # Yillik min aylanma (so'm)
referral_commission = DecimalField(default=0)      # Tavsiya komissiyasi %
badge_icon = CharField(default='⭐')              # Emoji/ikon
badge_image = ImageField(null=True, blank=True)   # Karta dizayni
description = TextField(blank=True)                # Imtiyozlar tavsifi
auto_promote = BooleanField(default=True)          # Avtomatik ko'tarilish
require_admin_approval = BooleanField(default=False) # Admin tasdiqlashi kerakmi (VIP uchun)
downgrade_after_months = IntegerField(default=6)   # Faolsizlikdan keyin pasaytirish (oy)
```

**Admin UI:** 5 ta daraja kartochkalar — rangli, vizual, har birida chegirma/komissiya/chegaralar tahrirlash.

---

#### 2.2.3. ClientUser ga qo'shiladigan fieldlar

```python
# Mavjud: phone, username, password_hash, client, full_name, organization, avatar...
# Gamifikatsiya uchun yangi:
xp = IntegerField(default=0)                        # Jami XP
coins = IntegerField(default=0)                      # Jami tanga (sarflanmagan)
coins_total_earned = IntegerField(default=0)          # Jami yig'ilgan tanga (tarixiy)
vip_level = FK → ClientVIPLevel(null=True)            # Joriy daraja
turnover_year = DecimalField(default=0)               # Yillik aylanma (so'm)
turnover_total = DecimalField(default=0)              # Umumiy aylanma
streak_days = IntegerField(default=0)                  # Ketma-ket kun
streak_last_date = DateField(null=True)                # Oxirgi streak sanasi
referral_code = CharField(unique=True)                 # Shaxsiy tavsiya kodi
referred_by = FK → self(null=True)                     # Kim tavsiya qilgan
referral_count = IntegerField(default=0)               # Nechta do'st olib kelgan
referral_earnings = DecimalField(default=0)            # Tavsiya komissiyasi jami
birth_date = DateField(null=True, blank=True)          # Tug'ilgan kun
profile_completion = IntegerField(default=0)           # Profil to'liqligi %
last_activity = DateTimeField(null=True)               # Oxirgi faollik
```

---

### 2.3. Reklama, E'lon va Aksiyalar

**Model: `Announcement`**
```python
class Announcement(models.Model):
    TYPES = [
        ('news', 'Yangilik'),
        ('promo', 'Aksiya'),
        ('discount', 'Chegirma'),
        ('event', "Yig'ilish/Tadbirat"),
        ('notification', 'Bildirishnoma'),
    ]
    announcement_type = CharField(choices=TYPES)
    title = CharField(max_length=200)
    body = TextField()                             # HTML yoki oddiy matn
    image = ImageField(null=True, blank=True)      # Banner rasm
    
    # Kimga ko'rinadi
    target_all = BooleanField(default=True)         # Hammaga
    target_levels = ManyToMany(ClientVIPLevel, blank=True)  # Faqat shu darajalar
    target_users = ManyToMany(ClientUser, blank=True)       # Faqat shu foydalanuvchilar
    
    # Chegirma (agar promo/discount turi bo'lsa)
    discount_percent = DecimalField(null=True, blank=True)
    discount_amount = DecimalField(null=True, blank=True)   # So'm
    discount_code = CharField(blank=True)                    # Kupon kodi
    
    # Muddat
    start_date = DateTimeField()
    end_date = DateTimeField(null=True, blank=True)
    
    # Holat
    is_active = BooleanField(default=True)
    is_pinned = BooleanField(default=False)        # Eng tepada turadi
    
    # Telegram
    send_telegram = BooleanField(default=False)     # Telegram ga ham yuborish
    telegram_sent = BooleanField(default=False)     # Yuborilganmi
    
    created_by = FK → CustomUser
    created_at = DateTimeField(auto_now_add=True)
```

**Admin UI:**
- E'lonlar ro'yxati (jadval + filtr: turi, holat, sana)
- Yaratish forma: turi, sarlavha, matn, rasm yuklash
- **Target tanlash:** "Hammaga" yoki "Faqat Gold+ uchun" yoki "Alohida mijozlar"
- Chegirma: foiz yoki summa, kupon kodi
- Muddat: boshlanish va tugash sanasi
- Telegram yuborish toggle
- Ko'rib chiqish (preview) — mijoz ko'rganidek

---

### 2.4. Oylik chegirmalar

**Model: `MonthlyDiscount`**
```python
class MonthlyDiscount(models.Model):
    month = DateField()                             # 2026-05-01 (shu oy uchun)
    vip_level = FK → ClientVIPLevel                 # Qaysi daraja uchun
    discount_percent = DecimalField()                # Bu oy chegirmasi %
    bonus_coins = IntegerField(default=0)            # Qo'shimcha tanga
    note = CharField(blank=True)                     # "Bahor aksiyasi"
    is_active = BooleanField(default=True)
    created_by = FK → CustomUser
```

**Admin UI:**
- Oy tanlash → 5 daraja uchun chegirma % kiritish
- Jadval: Start=0%, Hamkor=3%, Silver=5%, Gold=7%, VIP=10%
- Har oyda o'zgartirish mumkin (masalan bayramda 2x)

---

### 2.5. Tadbiratlar (Yig'ilishlar)

**Model: `Event`**
```python
class Event(models.Model):
    title = CharField(max_length=200)
    description = TextField()
    image = ImageField(null=True, blank=True)
    
    event_date = DateTimeField()
    location = CharField(max_length=300, blank=True)
    location_url = URLField(blank=True)              # Google Maps link
    
    max_participants = IntegerField(default=0)        # 0=cheksiz
    xp_reward = IntegerField(default=500)             # Ishtirok uchun XP
    coin_reward = IntegerField(default=150)           # Ishtirok uchun tanga
    
    # Kimga
    target_all = BooleanField(default=True)
    target_levels = ManyToMany(ClientVIPLevel, blank=True)
    
    # QR tasdiqlash
    qr_code = CharField(unique=True, blank=True)      # Tadbiratda skanerlash uchun
    
    is_active = BooleanField(default=True)
    created_by = FK → CustomUser
    created_at = DateTimeField(auto_now_add=True)
```

**Model: `EventParticipant`**
```python
class EventParticipant(models.Model):
    event = FK → Event
    user = FK → ClientUser
    registered_at = DateTimeField(auto_now_add=True)
    attended = BooleanField(default=False)             # QR bilan tasdiqlangan
    attended_at = DateTimeField(null=True)
    xp_awarded = BooleanField(default=False)
```

**Admin UI:**
- Tadbiratlar ro'yxati
- Yaratish: nomi, sana, joy, QR generatsiya
- Ishtirokchilar ro'yxati — kim ro'yxatdan o'tgan, kim kelgan
- QR skan sahifasi (admin telefondan)

---

### 2.6. Sovg'alar do'koni boshqaruvi

**Model: `RewardItem`**
```python
class RewardItem(models.Model):
    name = CharField(max_length=200)
    description = TextField(blank=True)
    image = ImageField(null=True, blank=True)
    coin_price = IntegerField()                       # Tanga narxi
    TYPES = [('coupon', 'Chegirma kuponi'), ('delivery', 'Bepul yetkazish'),
             ('gift', 'Jismoniy sovg\'a'), ('service', 'Bepul xizmat')]
    reward_type = CharField(choices=TYPES)
    discount_value = DecimalField(null=True, blank=True)  # Kupon uchun so'm
    min_level = FK → ClientVIPLevel(null=True)             # Min daraja
    stock = IntegerField(default=0)                        # 0=cheksiz
    is_active = BooleanField(default=True)
    sort_order = IntegerField(default=0)
```

**Model: `RewardClaim`**
```python
class RewardClaim(models.Model):
    user = FK → ClientUser
    reward = FK → RewardItem
    coins_spent = IntegerField()
    STATUS = [('pending', 'Kutilmoqda'), ('approved', 'Tasdiqlangan'),
              ('delivered', 'Berildi'), ('cancelled', 'Bekor')]
    status = CharField(choices=STATUS, default='pending')
    claimed_at = DateTimeField(auto_now_add=True)
    approved_by = FK → CustomUser(null=True)
```

**Admin UI:**
- Sovg'alar ro'yxati — qo'shish/o'chirish/narx o'zgartirish
- So'rovlar (claims) ro'yxati — tasdiqlash/bekor qilish
- Statistika: eng mashhur sovg'alar, sarflangan tangalar

---

### 2.7. Topshiriqlar boshqaruvi

**Model: `Quest`**
```python
class Quest(models.Model):
    TYPES = [('daily', 'Kunlik'), ('weekly', 'Haftalik'),
             ('onetime', 'Bir martalik'), ('seasonal', 'Mavsumiy')]
    quest_type = CharField(choices=TYPES)
    title = CharField(max_length=200)
    description = TextField()
    icon = CharField(default='📋')
    
    # Mukofot
    xp_reward = IntegerField(default=0)
    coin_reward = IntegerField(default=0)
    
    # Bajarish sharti
    ACTION_TYPES = [
        ('login', 'Ilovaga kirish'), ('purchase', 'Xarid qilish'),
        ('review', 'Sharh yozish'), ('referral', 'Do\'st tavsiya'),
        ('view_products', 'Mahsulot ko\'rish'), ('share', 'Ulashish'),
    ]
    action_type = CharField(choices=ACTION_TYPES)
    action_count = IntegerField(default=1)           # Necha marta bajarish kerak
    
    # Muddat (mavsumiy uchun)
    start_date = DateField(null=True, blank=True)
    end_date = DateField(null=True, blank=True)
    
    min_level = FK → ClientVIPLevel(null=True)
    is_active = BooleanField(default=True)
    sort_order = IntegerField(default=0)
```

**Admin UI:**
- Topshiriqlar ro'yxati — tablar (kunlik/haftalik/maxsus)
- Yaratish: turi, nomi, mukofot, bajarish sharti
- Statistika: necha kishi bajardi

---

## 3. ADMIN PANEL UI TUZILISHI

```
/mini/admin/
├── 📊 Dashboard (statistika)
│   ├── Jami mijozlar / faol / yangi (bu oy)
│   ├── Status bo'yicha taqsimot (donut chart)
│   ├── Oylik aylanma / o'sish %
│   └── Eng faol 5 ta mijoz
│
├── 👥 Mijozlar
│   ├── Ro'yxat (qidiruv, filtr, sort)
│   ├── + Yangi yaratish
│   ├── Parol yangilash
│   ├── 🔑 Kirish (impersonate)
│   └── ERP bog'lash
│
├── ⚙️ Gamifikatsiya
│   ├── XP/Tanga qoidalari (jadval)
│   ├── Status darajalari (5 ta karta)
│   └── Yutuq nishonlari (badges)
│
├── 📢 E'lonlar
│   ├── Ro'yxat
│   ├── + Yangi yaratish
│   └── Telegram yuborish
│
├── 💰 Chegirmalar
│   ├── Oylik chegirmalar (daraja bo'yicha)
│   └── Kuponlar
│
├── 🎉 Tadbiratlar
│   ├── Ro'yxat
│   ├── + Yangi yaratish
│   ├── QR generatsiya
│   └── Ishtirokchilar
│
├── 🎁 Sovg'alar
│   ├── Do'kon boshqaruvi
│   └── So'rovlar (claims)
│
├── 📋 Topshiriqlar
│   ├── Kunlik / Haftalik / Maxsus
│   └── + Yangi yaratish
│
└── 📊 Hisobotlar
    ├── XP/Tanga statistikasi
    ├── Eng faol mijozlar
    ├── Tavsiya tizimi hisoboti
    └── Chegirma foydalanish
```

---

## 4. IMPERSONATE (MIJOZ HISOBIGA KIRISH)

Admin har bir mijozning hisobiga kirib, uning ko'rganini ko'radi:

**Flow:**
```
1. Admin /mini/admin/ da mijozni topadi
2. "🔑 Kirish" tugmasini bosadi
3. POST /mini/admin/impersonate/<user_id>/
4. Server: session['impersonating_client_id'] = user_id
5. Redirect → /mini/<username>/
6. middleware: impersonate = True → ClientUser sifatida ko'rsatadi
7. Yuqorida sariq banner: "⚠️ Admin sifatida ko'rmoqdasiz: Sardor (998901234567)"
8. "Chiqish" → session.pop('impersonating_client_id') → /mini/admin/
```

---

## 5. IMPLEMENT KETMA-KETLIGI

### Faza 1 — Modellar va Migration
1. `ClientUser` ga gamifikatsiya fieldlari qo'shish (xp, coins, vip_level, streak, referral)
2. `GamificationRule` model yaratish
3. `Announcement` model yaratish
4. `MonthlyDiscount` model yaratish
5. `Event` + `EventParticipant` modellar
6. `RewardItem` + `RewardClaim` modellar
7. `Quest` model yaratish
8. `ClientVIPLevel` kengaytirish
9. Migration yaratish va qo'llash

### Faza 2 — Admin Panel Views + API
10. Mijozlar boshqaruvi kengaytirish (qidiruv, filtr, impersonate)
11. Gamifikatsiya sozlamalari sahifasi
12. E'lonlar CRUD
13. Chegirmalar sahifasi
14. Tadbiratlar CRUD + QR
15. Sovg'alar do'koni boshqaruvi
16. Topshiriqlar CRUD

### Faza 3 — Admin Panel Template (UI)
17. Dashboard — statistika kartalari
18. Mijozlar — jadval + modal
19. Sozlamalar — inline tahrirlash
20. E'lonlar — forma + preview
21. Tadbiratlar — kartochkalar

### Faza 4 — Mijoz ilovasiga integratsiya
22. Dashboard da XP/tanga/status ko'rsatish
23. E'lonlar feed
24. Sovg'alar do'koni
25. Topshiriqlar
26. Streak va kunlik kirish

---

## 6. TEGISHLI FAYLLAR

| Fayl | Nima o'zgaradi |
|------|---------------|
| `client_erp/models/user.py` | ClientUser ga gamifikatsiya fieldlari |
| `client_erp/models/portfolio.py` | ClientVIPLevel kengaytirish |
| `client_erp/models/` | Yangi: gamification.py, announcement.py, event.py, reward.py, quest.py |
| `client_erp/views/admin.py` | Admin CRUD views kengaytirish |
| `client_erp/urls.py` | Yangi admin URL lar |
| `client_erp/templates/client_erp/admin/` | Admin panel templatelar |
| `client_erp/middleware.py` | Impersonate middleware |
