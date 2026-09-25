# Bittada Usta — Play Market'ga chiqarish qo'llanmasi

**Sana:** 2026-09-12
**Versiya:** versionCode 2 → **3**, versionName "1.0" → **"1.1"**

---

## 1. Android Studio'da AAB yig'ish

### Qadamlar

1. Android Studio'ni oching
2. `File → Open` → loyihani tanlang: `sketchup fayllar/BittadaUsta`
3. Gradle sinxronlanishini kuting (pastda progress ko'rinadi)
4. `Build → Generate Signed Bundle / APK...`
5. **Android App Bundle** tanlang → `Next`
6. Keystore maydonlari **avtomatik to'ladi** — ular loyiha ildizidagi
   `keystore.properties` faylidan o'qiladi.

   ⚠️ Parollar bu hujjatda **ataylab yozilmagan** — hujjat GitHub'ga
   tushadi, parol esa tushmasligi kerak. Qiymatlarni serverdagi
   `sketchup fayllar/BittadaUsta/keystore.properties` faylidan oling:

   | Maydon | Qayerdan |
   |---|---|
   | Key store path | `BittadaUsta/bittada-upload.jks` |
   | Key store password | `keystore.properties` → `BITTADA_STORE_PASSWORD` |
   | Key alias | `keystore.properties` → `BITTADA_KEY_ALIAS` |
   | Key password | `keystore.properties` → `BITTADA_KEY_PASSWORD` |

7. `Next` → **release** variantini tanlang → `Create`
8. Tayyor fayl: `app/release/app-release.aab`

### Agar xato chiqsa

- **"Release imzosi sozlanmagan!"** → loyiha ildizida `keystore.properties`
  fayli bor-yo'qligini va unda 4 ta `BITTADA_*` qatori borligini tekshiring
- **"Keystore file not found"** → `bittada-upload.jks` fayli loyiha ildizida
  (`BittadaUsta/` papkasida) turganini tekshiring

---

## 2. Play Console'da yangilanish chiqarish

### 2.1 AAB yuklash

1. [Play Console](https://play.google.com/console) → **Bittada Usta**
2. `Release → Production` (Рабочая версия) → **Create new release**
3. `app-release.aab` faylini yuklang
4. **Release notes** (nima o'zgardi) — namuna matn:

```
• Ilova ichida akkauntni o'chirish imkoniyati qo'shildi
• Parolni o'zgartirish funksiyasi ishga tushirildi
• Yangi ilova ikonkasi
• Tugallanmagan bo'limlar vaqtincha yashirildi
• Barqarorlik va xavfsizlik yaxshilandi
```

### 2.2 Majburiy havolalar

`App content` (Контент приложения) bo'limida:

| Maydon | Havola |
|---|---|
| **Privacy Policy** | `https://usta.bittada.uz/android-privacy.html` |
| **Account deletion URL** | `https://usta.bittada.uz/android-account-deletion.html` |

### 2.3 Data Safety (Безопасность данных)

Ilova yig'adigan ma'lumotlar — shu ro'yxat bo'yicha belgilang:

| Ma'lumot | Yig'iladimi | Maqsad |
|---|---|---|
| Telefon raqami | Ha | Hisobni boshqarish |
| Ism | Ha | Hisobni boshqarish |
| Parol | Ha | Hisobni boshqarish |
| Boshqa (buyurtma/moliya yozuvlari) | Ha | Ilova funksiyasi |
| Joylashuv, kontaktlar, kamera, fayllar | **Yo'q** | — |
| Reklama identifikatori | **Yo'q** | — |

Qo'shimcha savollar:
- Ma'lumot **shifrlangan kanal orqali** uzatiladimi → **Ha**
- Foydalanuvchi ma'lumotni **o'chirishni so'rashi mumkinmi** → **Ha**
- Ma'lumot uchinchi shaxslarga beriladimi → **Yo'q**

### 2.4 Store ikonkasi

`Store listing` → **App icon** → 512×512 PNG yuklang
(men yuborgan `bittada-play-icon-512.png` fayli)

---

## 3. Bugun kiritilgan o'zgarishlar

### Kod tuzatishlari

| Fayl | Nima o'zgardi |
|---|---|
| `ui/ErpApp.kt` | `SHOW_UNFINISHED = false` bayrog'i — tugallanmagan bo'limlar yashirildi (MebelCity guruhi, Jamoa, Laylo AI) |
| `ui/screens/DashboardScreen.kt` | "MebelCity" kartasi → ishlaydigan "Qarz" kartasi |
| `ui/screens/OrderDetailScreen.kt` | Chiqim/Shartnoma/Ulashish tugmalari yashirildi; fayl bo'sh holati qo'shildi |
| `ui/screens/SettingsScreen.kt` | **Akkaunt o'chirish** va **parol o'zgartirish** dialoglari — ikkalasi ham real ishlaydi |
| `net/Repo.kt` | `deleteAccount` + `changePassword` backend bilan ulandi |
| `data/Mock.kt` | `ErpBackend` interfeysiga 2 metod qo'shildi |

### Konfiguratsiya

| Fayl | Nima o'zgardi |
|---|---|
| `app/build.gradle.kts` | versionCode 3, signingConfig, R8 (minify) yoqildi, imzo tekshiruvi |
| `app/proguard-rules.pro` | OkHttp/okio/JSON/coroutines qoidalari |
| `AndroidManifest.xml` | `allowBackup="false"` — JWT token himoyasi |
| `gradle.properties` | Keystore sozlamalari |
| `res/values/strings.xml` | Ilova nomi: "BittadaUsta" → "Bittada Usta" |
| `res/mipmap-*`, `res/drawable/` | Android robot ikonkasi → Bittada logotipi |

### Serverda

| Sahifa | Havola |
|---|---|
| Maxfiylik siyosati | `https://usta.bittada.uz/android-privacy.html` |
| Akkauntni o'chirish | `https://usta.bittada.uz/android-account-deletion.html` |

---

## 4. Muhim eslatmalar

### Keystore — YO'QOTMANG

`bittada-upload.jks` fayli va paroli yo'qolsa, **ilovani boshqa hech qachon
yangilay olmaysiz**. Zaxira nusxa saqlang:
- Parol menejerida (1Password, Bitwarden)
- Shifrlangan tashqi diskda
- Kamida 2 joyda

Fayl joylashuvi: `sketchup fayllar/playmarket /bittada-upload.jks` va
`sketchup fayllar/BittadaUsta/bittada-upload.jks`

### Yashirilgan funksiyalarni qaytarish

Bo'limlar **o'chirilmadi**, faqat yashirildi. Tayyor bo'lganda:
`ui/ErpApp.kt` faylida `const val SHOW_UNFINISHED = false` → `true`

### Keyingi yangilanishlar

Har safar `versionCode` ni **bittaga oshiring** (3 → 4 → 5...).
Play bir xil versionCode'ni ikki marta qabul qilmaydi.

---

## 5. Hali qilinmagan ishlar (kelajak uchun)

| Ish | Nima uchun kerak |
|---|---|
| Mijoz qo'shish/tahrirlash | Hozir faqat ro'yxat ko'rinadi |
| Chiqim kiritish | Faqat kirim ishlaydi |
| Jamoa bo'limi | Backend tayyor, UI yo'q |
| Laylo AI chat | Faqat statik javob |
| MebelCity, Vizualizatsiya, Zamerlar, Oldi-Berdi | Backend tayyor, UI yo'q |
| JWT'ni `EncryptedSharedPreferences`ga ko'chirish | Xavfsizlik yaxshilanishi |
| Loyihani git'ga qo'shish | Hozir `.gitignore`da — zaxira yo'q |
