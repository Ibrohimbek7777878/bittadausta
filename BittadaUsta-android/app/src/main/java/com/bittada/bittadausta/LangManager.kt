package com.bittada.bittadausta

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.util.Locale

/**
 * Til boshqaruvchisi — WebView dagi til tanlashni Android locale ga uzatadi.
 * WebView I18n.set('ru') chaqirganda, bu yerda configChanged ishga tushadi
 * va keyingi getString() chaqiruvlari to'g'ri tilni qaytaradi.
 */
object LangManager {

    private var currentLang: String = "uz"
    private var appContext: Context? = null
    private var onLangChanged: ((String) -> Unit)? = null

    private val SUPPORTED = mapOf(
        "uz" to Locale("uz"),
        "ru" to Locale("ru"),
        "en" to Locale("en")
    )

    fun init(context: Context) {
        appContext = context.applicationContext
        // Oldingi tanlangan tilni qaytarish
        try {
            val prefs = context.getSharedPreferences("lang_prefs", Context.MODE_PRIVATE)
            val saved = prefs.getString("lang", "uz") ?: "uz"
            setLang(saved, false)
        } catch (_: Exception) {}
    }

    fun getLang(): String = currentLang

    fun setLang(lang: String, notify: Boolean = true) {
        val resolved = if (SUPPORTED.containsKey(lang)) lang else "uz"
        if (resolved == currentLang && appContext != null) return
        currentLang = resolved
        // Saqlash
        try {
            appContext?.getSharedPreferences("lang_prefs", Context.MODE_PRIVATE)
                ?.edit()?.putString("lang", resolved)?.apply()
        } catch (_: Exception) {}
        // Configuration o'zgartirish — getString() keyin to'g'ri tilni qaytaradi
        applyLocale(resolved)
        if (notify) onLangChanged?.invoke(resolved)
    }

    private fun applyLocale(lang: String) {
        val ctx = appContext ?: return
        val locale = SUPPORTED[lang] ?: Locale("uz")
        Locale.setDefault(locale)
        val config = Configuration(ctx.resources.configuration)
        config.setLocale(locale)
        @Suppress("DEPRECATION")
        ctx.resources.updateConfiguration(config, ctx.resources.displayMetrics)
    }

    fun onLanguageChanged(listener: (String) -> Unit) {
        onLangChanged = listener
    }

    /**
     * WebView ga JS interface — I18n.js chaqirganda bu metod ishlaydi.
     * I18n.set('ru') → window.AndroidLang.setLang('ru')
     */
    class Bridge(private val manager: LangManager) {
        @JavascriptInterface
        fun setLang(lang: String) {
            manager.setLang(lang)
        }

        @JavascriptInterface
        fun getLang(): String = manager.getLang()
    }
}
