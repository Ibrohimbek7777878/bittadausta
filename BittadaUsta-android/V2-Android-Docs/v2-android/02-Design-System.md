# 02 — Dizayn tizimi (Bittada Usta v2)

> Android ilova quruvchi uchun **dizayn tizimi** spetsifikatsiyasi.
> Manba: `static/client_erp/css/redesign.css` (236 qator) + `js/redesign/*`.
> Prefiks: **`rc-`** (redesign client). Shrift: **Plus Jakarta Sans**. Accent: **lime `#DCF262`**.
> Ikki mavzu: **Qorong'i (default)** + **Yorug'** (`data-theme="light"`).

Bu hujjat faqat vizual tizim (ranglar, tipografiya, komponentlar, layout). Ekranlar va WS
oqimlari uchun → `03-Screens-Features.md`.

---

## 1. Dizayn falsafasi

- **Mobil-birinchi.** Web `spa_redesign.html` bir vaqtda desktop (sidebar) va mobil
  (bottom-nav) uchun ishlaydi. Android ilova **mobil layout**ni asos qiladi.
- **Qorong'i default.** Ilova qorong'i mavzuda ochiladi; foydalanuvchi almashtiradi
  (holat `localStorage['rc-theme']`, Androidda `SharedPreferences`/DataStore).
- **Yumaloq, yumshoq, "bento".** Katta radius (22px), yumshoq soyalar, lime accent,
  pastel ikkilamchi ranglar (peach/cyan/lavender). Kartochka-asosli tartib.
- **Bottom-sheet > modal.** Barcha formalar/dialoglar pastdan chiquvchi `rc-sheet`
  (Android `BottomSheetDialogFragment` / Compose `ModalBottomSheet`).
- **Animatsiya muhim.** Ekran kirishi stagger, karta popin, progress bar o'sishi,
  coin burst. Androidda mos motion (fade+slide-up, spring).

---

## 2. Rang tokenlari (ikkala mavzu)

CSS o'zgaruvchilari `:root` (dark) va `:root[data-theme="light"]` da. Androidda buni
ikki `Colors` to'plami (dark/light) sifatida bering (Compose `lightColorScheme`/`darkColorScheme`
yoki `colors.xml` + `values-night/`).

| Token | Ma'nosi | **Dark (default)** | **Light** |
|-------|---------|-------------------|-----------|
| `--bg` | Fon (ekran orqasi) | `#0D0C10` | `#F3F1EA` |
| `--bg2` | Fon 2 (chuqurroq) | `#141318` | `#ECEAE1` |
| `--sfc` | Yuza (kartochka) | `#1E1D24` | `#FFFFFF` |
| `--sfc2` | Yuza 2 (ichki blok, input pill) | `#29282F` | `#F1EFE8` |
| `--txt` | Asosiy matn | `#F5F4F7` | `#1B1A20` |
| `--mut` | So'nik matn (label, meta) | `#9B9AA3` | `#6E6C76` |
| `--brd` | Chegara (nozik) | `rgba(255,255,255,.08)` | `rgba(0,0,0,.08)` |
| `--brd2` | Chegara (quyuqroq) | `rgba(255,255,255,.15)` | `rgba(0,0,0,.14)` |
| `--acc` | **Accent (lime)** | `#DCF262` | `#DCF262` (bir xil) |
| `--acc-d` | Accent hover | `#C9E04F` | `#C9E04F` |
| `--acc-ink` | Accent ustidagi matn (qora) | `#1B1A20` | `#1B1A20` |
| `--pch` | Peach (chiqim, ogohlantirish) | `#F5A48B` | `#F5A48B` |
| `--cyan` | Cyan (info, MebelCity) | `#A6E6F2` | `#A6E6F2` |
| `--lav` | Lavender (yechish, AI) | `#C9B4F7` | `#C9B4F7` |
| `--danger` | Xato/o'chirish | `#F58B8B` | `#DC5B5B` |
| `--ok` | OK (= accent) | `#DCF262` | `#DCF262` |

**Muhim qoidalar:**
- `--acc` ustiga **doim `--acc-ink` (qora)** matn — lime och rang, oq matn o'qilmaydi.
- Accent, pch, cyan, lav, danger qiymatlari **ikki mavzuda ham bir xil** (faqat
  fon/matn/chegara almashadi). Light mavzuda faqat `--danger` quyuqroq (`#DC5B5B`).
- Semantik ishlatish:
  - **Kirim / foyda / bajarildi** → `--acc` (lime)
  - **Chiqim / kutilmoqda / qaytarish** → `--pch` (peach)
  - **Info / MebelCity / jarayonda** → `--cyan`
  - **Pul yechish / AI / lavender aksent** → `--lav`
  - **Xato / o'chirish / muddat o'tgan** → `--danger`

### 2.1 Gradientlar (dekorativ kartalar)
Dashboard tez-kartalar va fayl plitkalar uchun 3-4 rangli gradient (accent-ink matn bilan):
```
lime:  linear-gradient(135deg, #DCF262, #B8D93E)
cyan:  linear-gradient(135deg, #A6E6F2, #7FD0E0)
lav:   linear-gradient(135deg, #C9B4F7, #B197EE)
peach: linear-gradient(135deg, #F5A48B, #EE8A6D)
```

---

## 3. Tipografiya

- **Shrift oilasi:** `Plus Jakarta Sans` (400,500,600,700,800). Fallback: `Inter, system-ui, sans-serif`.
  - Androidda: Google Fonts orqali Plus Jakarta Sans yuklang (Downloadable Fonts yoki
    `res/font/`). Fallback — Roboto/system.
- **Asosiy body:** 14px, `-webkit-font-smoothing: antialiased`.
- **Og'irliklar:** matn 600-700; sarlavha/qiymat **800** (extra-bold ko'p ishlatiladi).

### O'lcham shkalasi (kuzatilgan qiymatlar)
| Element | Size | Weight |
|---------|------|--------|
| Ekran sarlavha (topbar title) | 17px | 800 |
| Karta ichki sarlavha | 14-15px | 800 |
| Katta stat qiymati (balans) | 34-38px | 800 |
| Stat qiymati | 19px | 800 |
| Buyurtma narxi | 14px | 800 |
| Body / karta matn | 13px | 600-700 |
| Label / meta / so'nik | 10-12px | 600 |
| Chip / badge | 10-11px | 700 |
| Nav guruh sarlavhasi | 10px | 700, `letter-spacing:.1em`, UPPERCASE |

---

## 4. Radius, soyalar, o'lchamlar

| Token | Qiymat | Ishlatilishi |
|-------|--------|-------------|
| `--radius` | **22px** | Katta kartalar (`rc-card`) |
| `--radius-md` | **18px** | O'rta bloklar, stat, skeleton, fayl plitka |
| `--radius-sm` | **14px** | Tugma, input, chip ichki, kichik kartalar |
| `--pill` | **999px** | Chip, tab, progress bar, coins pill, toggle |
| bottom-sheet | **26px 26px 0 0** | `rc-sheet` yuqori burchaklari |

| Soya | Qiymat (dark) | Ishlatilishi |
|------|--------------|-------------|
| `--shadow` | `0 14px 30px rgba(0,0,0,.40)` | FAB, sheet, lightbox, gradient kartalar |
| `--shadow-sm` | `0 6px 14px rgba(0,0,0,.28)` | Oddiy kartalar, stat |
| `--glow` | `0 10px 24px rgba(0,0,0,.30)` | Tugma, accent elementlar |
| `--inset-acc` | `inset 0 -3px 6px rgba(0,0,0,.14), inset 0 2px 4px rgba(255,255,255,.45)` | Avatar (accent) ichki nur |

Light mavzuda soyalar issiq jigarrang tusda (`rgba(90,80,60,...)`).
Android: `elevation` + `shadowColor` bilan taqriban moslang (dark: pastroq alfa oq
glow yo'q, quyuq soya).

---

## 5. Komponentlar (`rc-*`)

Har biri quyida: **ko'rinish** + **ishlatilishi** + **Android moslama**.

### 5.1 `rc-card` — kartochka
- `background:var(--sfc)`, `border:1px solid var(--brd)`, `radius:22px`, `padding:16px`,
  `box-shadow:var(--shadow-sm)`.
- `rc-card-lg` — padding 18px (profil, kassa, sof foyda kabi "hero" bloklar).
- **Eng asosiy konteyner.** Ro'yxat elementlari, statistika, formalar — hammasi karta.
- Android: `Card` (Compose) / `MaterialCardView`, `cornerRadius=22dp`, `strokeWidth=1dp`.

### 5.2 `rc-btn` — asosiy tugma (lime)
- `height:44px`, `padding:0 18px`, `radius:14px`, `background:var(--acc)`,
  `color:var(--acc-ink)`, `font-weight:800`, `font-size:13px`, `box-shadow:var(--glow)`.
- `:active { transform: scale(.95) }` — bosishda kichrayadi.
- **Variantlar:**
  - `rc-btn-sm` — height 36px, padding 0 12px, 12px.
  - `rc-btn-danger` — `background:var(--danger)`, ink matn (o'chirish, akkaunt o'chirish).
- Android: Filled `Button`, lime konteyner + qora matn, 44dp balandlik, press scale 0.95.

### 5.3 `rc-btn-ghost` — ikkilamchi tugma (outline)
- `height:44px`, `radius:14px`, `border:1px solid var(--brd)`, `background:var(--sfc)`,
  `color:var(--txt)`, `font-weight:700`.
- Ikkilamchi amallar (Chiqim, Ulashish, Bekor, filter tugmalari).
- Android: Outlined `Button` / Tonal.

### 5.4 `rc-fab` — suzuvchi tugma
- `position:fixed; right:16px; bottom:84px`, `54x54px`, doira, `background:var(--acc)`,
  `font-size:20px`, `box-shadow:var(--shadow)`, `animation: rc-fabbob 3s infinite` (yuqori-past siljish).
- Bosh sahifada "Yangi buyurtma" uchun ishlatilishi mumkin. Ikkita maxsus FAB stack pastda
  (bo'lim 7.4 — Laylo + Gemini Live).
- Android: `FloatingActionButton`, 56dp, lime, subtle bob animatsiya.

### 5.5 `rc-input` / `rc-search`
- `rc-input`: full-width, `background:var(--sfc)`, `border:1px solid var(--brd)`,
  `radius:14px`, `padding:12px 14px`, `font-size:13px`, `color:var(--txt)`.
  `<textarea>`, `<select>`, `<input type=date/number/tel>` ham shu klass.
- `rc-search`: qidiruv pill — konteyner `radius:14px` + ichida 🔍 ikon + `input` (fon yo'q).
- Placeholder `color:var(--mut)`. Fokus konturi yo'q (`outline:none`).
- **Money input**: `.ce-money-input` — `Utils.bindMoneyInputs()` raqamni `1 234 567`
  formatlaydi (probel bilan), `Utils.rawMoney()` qaytaradi. Androidda `TextWatcher` bilan.
- Android: `OutlinedTextField` / `TextInputLayout`, radius 14dp, fill `--sfc`.

### 5.6 `rc-chip` — teg/yorliq
- `radius:pill`, `padding:4px 10px`, `font-size:11px`, `font-weight:700`,
  `background:var(--sfc2)`, `color:var(--txt)`. Ikon+matn (gap 6px).
- `rc-chip-acc` — lime fon + ink matn (aktiv/muhim: VIP darajasi, "+8 XP", buyurtma soni).
- Statuslar, meta yorliqlar, "🔗 Ulangan / ✓ Zamer" belgilari.
- Android: kichik `AssistChip` / custom `Text` pill.

### 5.7 `rc-tab` — segment/tab (pill)
- Gorizontal scroll qatorda (`rc-tabs`: `overflow-x:auto`, `gap:8px`).
- Har tab: `height:38px`, `radius:pill`, `border:1px solid var(--brd)`, `background:var(--sfc)`,
  `color:var(--mut)`, `font-weight:700`, `white-space:nowrap`.
- `.active` → `background:var(--acc)`, `color:var(--acc-ink)`, `border:transparent`.
- Buyurtma detali tablari, status filtrlari, davr filtri, moliya tab.
- Android: horizontal `ScrollableTabRow` (pill uslub) yoki `LazyRow` of chips.

### 5.8 `rc-badge` — status nishoni
- `radius:pill`, `padding:3px 9px`, `font-size:10px`, `font-weight:700`. Fon rangi statusga
  qarab dinamik (`RcStatus.MAP`, quyida). Matn doim `--acc-ink` (fon och).
- Android: kichik pill `Text` konteyner.

**Status rang xaritasi (`RcStatus.MAP`):**
| Status | Yorliq | Fon |
|--------|--------|-----|
| `new` | Yangi | `--cyan` |
| `waiting` | Kutilmoqda | `--pch` |
| `in_progress` | Jarayonda | `--acc` |
| `at_mebelcity` | MebelCity | `--lav` |
| `ready` | Tayyor | `--acc` |
| `completed` | Bajarilgan | `--acc` |
| `delivered` | Topshirildi | `--mut` |
| `cancelled` | Bekor | `--danger` |

### 5.9 `rc-stat` — statistika kattasi
- `background:var(--sfc)`, `radius:18px`, `padding:14px`, `box-shadow:var(--shadow-sm)`,
  `animation: rc-popin` (scale-in).
- Ichida: `rc-stat-label` (11px `--mut`), `rc-stat-val` (19px, 800, rangli), `rc-stat-sub` (11px `--mut`).
- Grid ichida: `rc-grid rc-grid-auto` → `repeat(auto-fit, minmax(140px,1fr))`.
- Android: kichik `Card` grid (2 ustun mobil).

### 5.10 `rc-progress` — jarayon bari
- Trek: `height:6px`, `radius:pill`, `background:var(--sfc2)`, `overflow:hidden`.
- `rc-progress-lg` — 8px (buyurtma detali sarlavhasida).
- Fill: `background:var(--acc)`, `animation: rc-bargrowx .7s` (scaleX 0→1, chapdan).
- Progress + o'ng tarafda `%` matn (11-12px, 700).
- Android: `LinearProgressIndicator` (rounded) yoki custom.

### 5.11 `rc-avatar`
- Doira, `background:var(--acc)`, `color:var(--acc-ink)`, `font-weight:800`,
  `box-shadow:var(--inset-acc)`. Bosh harflar (`Utils.initials`) yoki VIP emoji.
- Mijoz kartalarida rang paletka aylanadi: `[--acc, --cyan, --lav, --pch]` (id bo'yicha).
- O'lchamlar: 38px (jamoa a'zosi), 46px (mijoz), 56px (profil hero).
- Android: doira `Box` + markazda `Text`.

### 5.12 `rc-sheet` — pastdan chiquvchi modal (RcSheet)
- Backdrop: `rgba(0,0,0,.55)`, blur, `align-items:flex-end` (mobil) / `center` (desktop ≥700px).
- Sheet: `max-width:520px`, `background:var(--sfc)`, `radius:26px 26px 0 0`,
  `padding:10px 18px + safe-area`, `max-height:88vh`, `overflow-y:auto`,
  `animation: rc-sheetup` (pastdan yuqoriga).
- Yuqorida **handle** (`rc-sheet-handle`: 40x4px pill) — drag belgisi.
- **API (`window.RcSheet`)** — `03`da har ekranda ishlatiladi:
  - `RcSheet.open(title, bodyHtml, {footer, onClose, autofocus})`
  - `RcSheet.close()`
  - `RcSheet.confirm(title, msg, onConfirm)` — Bekor/Tasdiqlash tugmalari bilan tasdiq
  - `RcSheet.getFormData()` — sheet ichidagi `[name]` maydonlarni obyekt qilib yig'adi
- Barcha "qo'shish/tahrirlash/tasdiqlash" oynalari SHU. Android: `ModalBottomSheet` +
  drag handle; forma → `getFormData` o'rniga state.

### 5.13 `rc-toast` — bildirishnoma (Toast/RcToast)
- Yuqorida markazda (`rc-toasts`: `top:12px`), `background:var(--sfc)`, `radius:14px`,
  `box-shadow:var(--shadow)`, `animation: rc-toastin` (yuqoridan tushadi).
- Variant chegaralari: `rc-toast-ok` (accent), `rc-toast-err` (danger).
- **API (`window.Toast`):**
  - `Toast.success(msg)` → yashil "✅ ..."
  - `Toast.error(msg)` → qizil "❌ ..." (5s)
  - `Toast.info(msg)` / `Toast.warning(msg)`
  - `Toast.xp(xp, coins)` → "⭐ +N XP | +N tanga"
- Android: `Snackbar` yoki custom top toast (design uslubga mos).

### 5.14 CoinBurst — 🪙 animatsiya (RcCoinBurst / CoinBurst)
- `CoinBurst.award(n)` — 6-18 ta 🪙 emoji topbar coins pill'dan yuqoriga uchadi
  (`@keyframes rc-coinpop`: yuqoriga + scale 1.4 + fade). `CoinBurst.lost(n)` — teskari.
- XP/tanga berilganda ijobiy fon. WS `xp.awarded` / `xp.revoked` ham ulanadi.
- Android: `Particle`/overlay animatsiya (emoji yoki lime tanga ikon).

### 5.15 Boshqa holatlar
- `rc-empty` — bo'sh holat: markazda katta emoji (`rc-empty-ic` 40px) + sarlavha + izoh.
- `rc-skel` — skeleton yuklanish: `background:var(--sfc2)`, `animation: rc-pulse` (opacity 0.45↔1).
  `Skeleton.list(n)` — n ta 76px balandlik skeleton karta qatori.

---

## 6. Animatsiyalar (keyframes)

| Nomi | Effekt | Qayerda |
|------|--------|---------|
| `rc-screenin` | opacity 0 + translateY(14px) → 1 | Ekran elementlari (stagger delay `.05s` qadam, `[data-screen] > *`) |
| `rc-popin` | scale .85 → 1.04 → 1 | `rc-stat` kartalar |
| `rc-bargrowx` | scaleX 0 → 1 | Progress fill |
| `rc-sheetup` | translateY(100%) → 0 | Bottom-sheet |
| `rc-toastin` | translateY(-16px)+fade → 0 | Toast |
| `rc-topin` | translateY(-12px)+fade | Topbar |
| `rc-navup` | translateY(100%) | Bottom-nav kirishi |
| `rc-coinpop` | translateY(-110px)+scale 1.4+fade | Coin burst |
| `rc-fabbob` | translateY 0↔-7px | FAB "nafas olishi" |
| `rc-pulse` | opacity 0.45↔1 | Skeleton |
| `slidein` | translateX(-100%) → 0 | Mobil drawer |

Umumiy o'tishlar: `.14-.3s`, `cubic-bezier(.2,.8,.3,1)` (asosiy) yoki
`cubic-bezier(.3,1.4,.5,1)` (tugma bosishi, spring). Android: `spring`/`tween` mos.

**Ekran kirish stagger:** `[data-screen]` bolalar navbatma-navbat 0.05s kechikish bilan
kiradi (birinchisi darhol, keyingilari yuqoriga-fade). Androidda `LazyColumn` item enter
animatsiyasi bilan taqlid.

---

## 7. Layout (shell)

### 7.1 Umumiy tuzilma
```
rc-shell (flex)
├── rc-sidebar     (desktop ≥861px, 240px, sticky) — mobil'da YASHIRIN
└── rc-main (flex-col)
    ├── rc-topbar  (sticky top, z-40)
    └── rc-content (padding 4px 16px 100px; ichida #app)
rc-bottomnav       (mobil ≤860px, fixed bottom, blur) — desktopda YASHIRIN
```
- Kontent kengligi cheklangan: `[data-screen] { max-width:720px; margin:0 auto }`.
  Mobil'da 100%. **Android → doim 100% (bitta ustun).**

### 7.2 Topbar (`rc-topbar`)
Chapdan o'ngga tartib:
1. **Burger** (`rc-burger`, mobil) — chap drawer ochadi (`RcShell.openDrawer`).
   YOKI **Orqaga** (`rc-back`) — ichki sahifada (detail) ko'rinadi, tashqi sahifada yashirin.
2. **Sarlavha** (`rc-topbar-title`) — joriy sahifa nomi (`RcShell.TITLES`).
3. **🪙 Coins pill** (`rc-coins`) — tanga balansi, bosilsa `/tanga`. Dashboard yuklanganda
   ko'rinadi (`display:none` → `inline-flex`).
4. **Mavzu tugmasi** (`rc-theme-btn`) — ☀️/🌙, `RcShell.toggleTheme()`.
5. **Avatar** (`rc-avatar` 38px) — bosilsa `/settings`.

Android: `TopAppBar` — navigation icon (burger/back), title, actions (coins pill, theme, avatar).

### 7.3 Navigatsiya
**Sidebar (desktop) va Drawer (mobil)** — bir xil `RcShell.sidebarHtml()`:
- Logo (Bittada Usta + "Mebelchi ustalar uchun") + guruhlangan navlink'lar.
- Guruhlar (`RcShell.NAV`):
  - **Asosiy:** Bosh sahifa `/`, Mijozlarim `/clients`, Buyurtmalar `/orders`, Moliya `/finance`, Analitika `/analytics`
  - **MebelCity:** Buyurtmalarim `/mebelcity`, Vizualizatsiya `/vizualizatsiya`, 3D Zamerlar `/zamers`, Oldi-Berdi `/oldi-berdi`
  - **Jamoa:** Jamoa `/team`
  - **Obuna:** Tarif `/tarif`, Tanga hamyoni `/tanga`
  - **Boshqa:** Sozlamalar `/settings`
- Pastda "Yangi buyurtma" tugma + "Chiqish" (`/mini/logout/`, danger).
- Navlink: ikon (30px pill `rc-navic`) + label. `.active` → `--sfc2` fon, ikon `--acc`.

**Bottom-nav (mobil, `RcShell.BOTTOM`)** — 5 ta asosiy:
`Bosh /` · `Mijoz /clients` · `Zakaz /orders` · `Analitik /analytics` · `Moliya /finance`
- `rc-bnav`: vertikal ikon+matn (10px). `.active` → matn `--acc`.
- Fon `--sfc` 92% + blur (`backdrop-filter`), yuqori chegara, safe-area padding.

Android: **`BottomNavigationBar`** (5 ta yuqoridagi) + qolgan bo'limlar (MebelCity,
Vizualizatsiya, Zamerlar, Oldi-Berdi, Jamoa, Tarif, Tanga, Sozlamalar) — **Navigation
Drawer** (burger) yoki "Ko'proq" bo'limida. Aktiv rang lime.

### 7.4 Suzuvchi tugmalar (FAB stack, mobil)
Pastda o'ngda ikkita AI FAB (bottom-nav ustida):
1. **Laylo AI** (`laylo-popup-fab`) — `bottom:80px right:20px`, 58px doira,
   accent gradient, 🤖 ikon. Bosilsa chat popup (matn + ovoz).
2. **Gemini Live** (`rc-glive-fab`) — `bottom:~150px right:16px`, 56px doira, lime,
   🎙️ ikon. Real-time ovozli boshqaruv (`03`da RcGLive). Holat animatsiyalari:
   idle (bob) / connecting (spinner) / listening (pulse) / speaking (cyan pulse).

Android: ikki FAB (Compose `FloatingActionButton`) yoki bitta "Extended FAB" +
tanlov. Mikrofon ruxsati kerak (Gemini Live). Laylo — chat ekran/bottom-sheet.

---

## 8. Android moslash tavsiyalari (Material 3 ko'prigi)

| Web (rc-) | Android (Material 3 / Compose) |
|-----------|-------------------------------|
| `data-theme` dark/light | `darkColorScheme`/`lightColorScheme` + DataStore |
| `--acc` lime + `--acc-ink` qora | `primary` = lime, `onPrimary` = `#1B1A20` |
| `--sfc`/`--sfc2` | `surface` / `surfaceVariant` |
| `--bg` | `background` |
| `--danger` | `error` |
| `rc-card` | `Card` cornerRadius 22dp, stroke 1dp |
| `rc-btn` | Filled `Button`, 44dp, press scale 0.95 |
| `rc-btn-ghost` | Outlined/Tonal `Button` |
| `rc-sheet` + `getFormData` | `ModalBottomSheet` + form state (drag handle) |
| `rc-tab` pill | `ScrollableTabRow` / chips `LazyRow` |
| `rc-toast` | `Snackbar` (custom style) |
| CoinBurst | Overlay particle animatsiya |
| `rc-fab` bob | `FloatingActionButton` + subtle animatsiya |
| bottom-nav (5) | `NavigationBar` |
| sidebar/drawer | `ModalNavigationDrawer` |
| `rc-progress` | `LinearProgressIndicator` (rounded) |
| `rc-avatar` initials | doira `Box` + `Text` |
| Plus Jakarta Sans | Downloadable Fonts (fallback Roboto) |

**Muhim izohlar Android uchun:**
- Raqamlar (quantity/stock) **butun son** — `Math.ceil()` (loyiha qoidasi). Android `ceil`.
- Pul formati: `Utils.money` = `ru-RU` locale (`1 234 567`, probel ajratkich). So'm/USD alohida.
- Safe-area (notch/gesture) — bottom-nav va sheet padding'da hisobga olingan.
- Kirill↔Lotin qidiruv normalizatsiyasi mavjud (buyurtmalarda) — Androidda ham qo'llang.
- Barcha ma'lumot **WebSocket** orqali (`WS.send(action, payload, cb)`) — batafsil `03`.
