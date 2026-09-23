# TZ — WebView APK Kamchiliklarni Tuzatish
## Sana: 2026-09-14

---

## 1. MUAMMO: Status bar ustiga chiqib ketish

**Holat:** Ilova ochilganda kontent status bar (soat, zaryadka, signal) ustiga chiqib ketayapti.
**Sabab:** WebView edge-to-edge rejimda ishlayapti, lekin safe area hisobga olinmagan.
**Yechim:**
- `windowInsetsController` orqali status bar ustiga padding qo'shish
- WebView'ga `performClick()` emas, to'g'ri inset sozlash
- `WindowCompat.setDecorFitsSystemWindows(window, true)` — edge-to-edge ni o'chirish
- Splash screen ham status bar ostida bo'lishi kerak

---

## 2. MUAMMO: Ekran o'lchamlariga mos emas

**Holat:**
- Kichik telefonlarda (5" va undan kichik) kontent kesiladi, yuqoriga chiqib ketadi
- Katta telefonlarda (S23 Ultra, 6.8") kontent juda kichik ko'rinadi
- Bottom nav paneli ba'zan ekranning pastki qismini bosib ketadi

**Sabab:** WebView viewport sozlamalari to'g'ri emas, CSS viewport meta tag yetarli emas.
**Yechim:**
- WebView'ga `setUseWideViewPort(true)` va `setLoadWithOverviewMode(true)` — allaqachon bor, tekshirish
- WebView'ga zoom/disabled zoom controls qo'shish
- JavaScript orqali viewport meta tag ni kuchaytirish:
  ```js
  viewport = document.querySelector('meta[name="viewport"]');
  viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
  ```
- Safe area insets CSS'ga qo'shish:
  ```css
  body { padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
  ```
- Minimum font size chegarasini o'chirish
- `textSizeAdjust: none` — CSS o'lcham avtomatik o'zgarishini to'xtatish

---

## 3. MUAMMO: Telegram OTP ishlamayapti

**Holat:** Faqat SMS kod ishlayapti. Telegram kod va Telegram tugma orqali kirish ishlamayapti.
**Sabab:** WebView ichida Telegram deep link (`tg://`) ochilganda:
1. Telegram ochilmayapti yoki
2. Qaytishda JWT token saqlanmayapti
3. `window.location.href` redirect'i WebView'da to'g'ri ishlamayapti

**Yechim:**
- `tg://` va `https://t.me/` deep link'larni `shouldOverrideUrlLoading` da ushlab, tashqi Telegram ilovasiga yo'naltirish
- Telegram'dan qaytishda WebView URL'ni tekshirish:
  ```kotlin
  override fun onNewIntent(intent: Intent?) {
      super.onNewIntent(intent)
      // Telegram'dan qaytishda WebView'ni yangilash
      webView.loadUrl(webView.url ?: baseUrl)
  }
  ```
- Cookie-based auth: Telegram'dan qaytishda cookie saqlanishi kerak
- `CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)` — allaqachon bor
- Polling muammosi: Telegram bot orqali kirishda `pollBotLogin` 2 sekundda so'raydi — WebView'da bu ishlashi kerak

**Test qilish:**
1. SMS orqali kirish — ishlayapti ✅
2. Telegram kod orqali kirish — ishlashi kerak ❌ → tuzatish
3. Telegram tugma orqali kirish — ishlashi kerak ❌ → tuzatish

---

## 4. MUAMMO: Laylo chatbot to'liq ishlashi kerak

**Holat:** Laylo AI chatbot saytda to'liq ishlayapti, lekin WebView'da to'liq ishlashi kerak.
**Sabab:** Laylo chatbot:
- WebSocket orqali ishlaydi (backend'da `glive.start`)
- Audio streaming kerak (Gemini Live)
- TTS (text-to-speech) kerak
- Popup formatda ochiladi

**Yechim:**
- WebView'ga `mediaPlaybackRequiresUserGesture = false` — audio avtomatik ijro uchun — allaqachon bor
- WebView'ga `setSupportMultipleWindows(false)` — Laylo popup'i WebView ichida ochilishi kerak
- WebView'ga `javaScriptCanOpenWindowsAutomatically = true` — allaqachon bor
- WebSocket ishlashi uchun `mixedContentMode = MIXED_CONTENT_ALWAYS_ALLOW` — allaqachon bor
- Audio recording (microphone) uchun `RECORD_AUDIO` ruxsat — allaqachon bor

**Test qilish:**
1. Laylo chatbot'ni ochish
2. Xabar yozish — javob kelishi kerak
3. Ovozli xabar yuborish — ishlashi kerak

---

## 5. TEXNIK DETALLAR

### MainActivity.kt — O'zgartirishlar:

1. **Edge-to-edge o'chirish:**
```kotlin
WindowCompat.setDecorFitsSystemWindows(window, true)  // false emas, true!
```

2. **Safe area padding:**
```kotlin
ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
    val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
    v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
    insets
}
```

3. **Telegram deep link handling:**
```kotlin
override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    val data = intent?.data
    if (data != null && (data.scheme == "tg" || data.host == "t.me")) {
        webView.loadUrl(webView.url ?: baseUrl)
    }
}
```

4. **Viewport JavaScript injection:**
```kotlin
webView.webViewClient = object : WebViewClient() {
    override fun onPageFinished(view: WebView?, url: String?) {
        view?.evaluateJavascript("""
            (function() {
                var vp = document.querySelector('meta[name="viewport"]');
                if (vp) vp.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
                document.body.style.paddingTop = 'env(safe-area-inset-top, 0px)';
                document.body.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
            })();
        """.trimIndent(), null)
    }
}
```

### AndroidManifest.xml — Qo'shimchalar:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="tg" />
    <data android:scheme="https" android:host="t.me" />
</intent-filter>
```

---

## 6. BUILD YANGILIKLARI

- `versionCode = 5`
- `versionName = "2.1"`
- Debug APK: `./gradlew assembleDebug`
- Release APK: `./gradlew assembleRelease`

---

## 7. TEST REJASI

| # | Test | Natija |
|---|------|--------|
| 1 | Ilova ochilishi — status bar ustiga chiqmasligi | ⬜ |
| 2 | Kichik telefon (5") — kontent to'liq ko'rinishi | ⬜ |
| 3 | Katta telefon (6.8") — kontent normal o'lchamda | ⬜ |
| 4 | SMS orqali kirish — ishlashi | ⬜ |
| 5 | Telegram kod orqali kirish — ishlashi | ⬜ |
| 6 | Telegram tugma orqali kirish — ishlashi | ⬜ |
| 7 | Laylo chatbot — xabar yozish | ⬜ |
| 8 | Laylo chatbot — ovozli xabar | ⬜ |
| 9 | Orqaga tugmasi — navigatsiya | ⬜ |
| 10 | Fayl yuklash — kamera/galereya | ⬜ |
