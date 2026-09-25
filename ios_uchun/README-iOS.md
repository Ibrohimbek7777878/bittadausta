# Bittada Usta — iOS versiya (ios_uchun)

Android v1.60 ning to'liq iOS porti (Swift, UIKit + WKWebView).
Server: `https://usta.bittada.uz/bigone_cl2/spa/` — Android bilan bir xil sahifa.

## Tarkib

| Fayl | Nima |
|---|---|
| `project.yml` | XcodeGen loyiha ta'rifi (`.xcodeproj` shu yerdan yasaladi) |
| `App/` | AppDelegate, SceneDelegate, Info.plist (ruxsatlar: BLE/kamera/galereya/mikrofon) |
| `Web/WebViewController.swift` | Asosiy ekran: WebView + ko'priklar + fayl/yuklash/dialog/klaviatura/to'lov |
| `Web/Bridges.swift` | JS→Native marshrutlar (NativeBle/Share/Dl/App/IOSLang) |
| `Web/UIHelpers.swift` | Toast |
| `BLE/BleManager.swift` | CoreBluetooth: qidirish/ulanish/o'lchash (drayverlar serverdan) |
| `Lang/` | LangManager + 3 til (uz/ru/en, Android bilan bir xil matnlar) |
| `Resources/LaunchScreen.storyboard` | Splash |

## Mac da yig'ish (dasturchi uchun, ~30–60 daq)

1. **Kerak:** Mac + Xcode 15+, Apple ID (Xcode → Settings → Accounts).
2. Terminalda:
```bash
brew install xcodegen
cd ios_uchun
xcodegen generate   # BittadaUsta.xcodeproj yaratiladi
open BittadaUsta.xcodeproj
```
3. Xcode da: target **BittadaUsta** → **Signing & Capabilities** → **Team** ni tanlang
   (shaxsiy team — simulator uchun yetadi; qurilmaga/App Store ga — Apple Developer).
4. **Run** (⌘R): simulator yoki kabeldagi iPhone.
5. Qurilmaga o'rnatishda telefonda: Settings → General → VPN & Device Management → ishonch.

## Sinash ro'yxati (Android bilan bir xil)

- [ ] Login/SMS → kirish
- [ ] BLE lazer: ro'yxat → ulanish → 📡 belgi → O'lchash (mm sahifaga tushadi)
- [ ] Galereya/kamera tanlash (rasm yuklash)
- [ ] Yuklab olish (Fayllar/On My iPhone ko'rinadi)
- [ ] Ulashish (Share sheet)
- [ ] Til: Sozlamada rus/ingliz → native oynalar ham o'zgaradi
- [ ] To'lov: checkout Safari oynada ochiladi, orqaga qaytish bor
- [ ] Klaviatura yozuv joyini yopmaydi

## Eslatmalar

- Fayl tanlash iOS 14+ da WebView da **tizimning o'zi** ochadi (qo'shimcha kod shart emas).
- Versiya Android bilan teng: **1.60 (60)** — `project.yml` da (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`).
- Bundle ID: `com.bittada.bittadausta` (Android bilan bir xil).
- **App Store:** Apple "faqat sayt" ilovalarni rad etishi mumkin (4.2). BLE qurilma + kamera + native funksiyalar himoya bo'ladi. Avval **TestFlight** orqali ichki test tavsiya qilinadi.
- Bu kod Linux da yozilgan, Mac da kompilyatsiya qilinmagan — birinchi build da mayda tuzatish chiqsa, shu fayllar ichida bo'ladi.
