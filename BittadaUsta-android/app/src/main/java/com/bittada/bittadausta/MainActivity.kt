package com.bittada.bittadausta

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.ArrayAdapter
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var splashView: FrameLayout
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var isSplashShowing = true

    private lateinit var bleManager: BleManager
    private var bleDialog: android.app.AlertDialog? = null
    private var bleDialogStatus: TextView? = null
    private var bleDeviceAdapter: BleRowAdapter? = null
    private val bleDevices = mutableListOf<Triple<String, String, Int>>()
    private var bleConnectingAddr: String? = null
    private var bleIndicator: View? = null
    private var bleConnectedName: String? = null
    private var bleIndicatorHidden = false
    private var rootView: FrameLayout? = null
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null
    private var kbOpen = false
    private var fsPolyActive = false

    private inner class NativeApp {
        @JavascriptInterface
        fun enterFullscreen() {
            fsPolyActive = true
            runOnUiThread {
                try {
                    androidx.core.view.WindowCompat.getInsetsController(window, window.decorView).apply {
                        hide(androidx.core.view.WindowInsetsCompat.Type.statusBars() or
                            androidx.core.view.WindowInsetsCompat.Type.navigationBars())
                        systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat
                            .BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    }
                } catch (_: Exception) {}
            }
        }

        @JavascriptInterface
        fun exitFullscreen() {
            fsPolyActive = false
            runOnUiThread {
                try {
                    androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
                        .show(androidx.core.view.WindowInsetsCompat.Type.statusBars() or
                            androidx.core.view.WindowInsetsCompat.Type.navigationBars())
                } catch (_: Exception) {}
            }
        }

        // To'lov checkout — tashqi brauzerda (2026-09-23, additive).
        // SPA tirik qoladi: poll ishlaydi, hamyon yangilanadi, orqaga yo'l bor.
        @JavascriptInterface
        fun openExternal(url: String?) {
            val u = (url ?: "").trim()
            if (u.isEmpty()) return
            runOnUiThread {
                try {
                    val customTabsIntent = CustomTabsIntent.Builder().build()
                    try { customTabsIntent.intent.setPackage("com.android.chrome") }
                    catch (_: Exception) {}
                    customTabsIntent.launchUrl(this@MainActivity, Uri.parse(u))
                } catch (_: Exception) {
                    try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u))) }
                    catch (_: Exception) {}
                }
            }
        }
    }

    private inner class NativeShare {
        @JavascriptInterface
        fun share(text: String?, title: String?) {
            runOnUiThread {
                try {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, text ?: "")
                        if (!title.isNullOrEmpty()) putExtra(Intent.EXTRA_SUBJECT, title)
                    }
                    startActivity(Intent.createChooser(send, str(R.string.share_title)))
                } catch (_: Exception) {
                    Toast.makeText(this@MainActivity, str(R.string.share_error), Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private val baseUrl = "https://usta.bittada.uz/bigone_cl2/spa/"

    private var cameraPhotoUri: Uri? = null
    private var cameraVideoUri: Uri? = null
    private var pendingWantsImage = false
    private var pendingWantsVideo = false
    private var pendingMultiple = false

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data
        val single = data?.data
        val results = if (result.resultCode == RESULT_OK) {
            val clip = data?.clipData
            when {
                clip != null && clip.itemCount > 0 ->
                    Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
                single != null -> arrayOf(single)
                cameraPhotoUri != null -> arrayOf(cameraPhotoUri!!)
                cameraVideoUri != null -> arrayOf(cameraVideoUri!!)
                else -> null
            }
        } else null
        cameraPhotoUri = null
        cameraVideoUri = null
        fileUploadCallback?.onReceiveValue(results)
        fileUploadCallback = null
    }

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        openMediaChooser()
    }

    private val micPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { }

    private val blePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        if (perms.values.all { it }) openBleDevices()
        else Toast.makeText(this, str(R.string.bt_permission_needed), Toast.LENGTH_SHORT).show()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.parseColor("#0D0C10")),
            navigationBarStyle = SystemBarStyle.dark(Color.parseColor("#0D0C10"))
        )
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        bleManager = BleManager(this)
        bleManager.setCallback(bleCallback)

        LangManager.init(this)
        LangManager.onLanguageChanged { _ -> /* til o'zgarganda UI yangilanadi */ }

        val root = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0D0C10"))
            fitsSystemWindows = true
        }

        splashView = createSplashView()
        root.addView(splashView)

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            visibility = View.GONE
        }

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                6
            ).apply {
                gravity = Gravity.TOP
            }
            max = 100
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                progressTintList = android.content.res.ColorStateList.valueOf(
                    Color.parseColor("#DCF262")
                )
            }
            visibility = View.GONE
        }

        root.addView(webView)
        root.addView(progressBar)

        setContentView(root)
        rootView = root

        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val sb = insets.getInsets(WindowInsetsCompat.Type.statusBars())
            val nb = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout()).bottom
            val bottomSafe = maxOf(nb, cutout)
            v.setPadding(sb.left, sb.top, sb.right, bottomSafe)
            insets
        }

        ViewCompat.setOnApplyWindowInsetsListener(webView) { v, insets ->
            v.setPadding(0, 0, 0, 0)
            insets
        }

        val rootRef = root
        var lastKbDp = -1
        rootRef.viewTreeObserver.addOnGlobalLayoutListener {
            try {
                val r = android.graphics.Rect()
                rootRef.getWindowVisibleDisplayFrame(r)
                val screenH = rootRef.rootView.height
                if (screenH > 0) {
                    val kbPx = (screenH - r.bottom).coerceAtLeast(0)
                    val kbDp = (kbPx / resources.displayMetrics.density).toInt()
                    val open = kbPx > screenH * 0.15
                    // Butun WebView ni klaviatura ustiga ko'tarish (Telegram usuli)
                    val wlp = webView.layoutParams as ViewGroup.MarginLayoutParams
                    val targetMargin = if (open) kbPx else 0
                    if (wlp.bottomMargin != targetMargin) {
                        wlp.bottomMargin = targetMargin
                        webView.layoutParams = wlp
                    }
                    if (open != kbOpen || (open && kotlin.math.abs(kbDp - lastKbDp) > 20)) {
                        kbOpen = open
                        lastKbDp = kbDp
                        val js = "(function(){window.__kbNative=" + (if (open) kbDp else 0) + ";" +
                            "if(typeof nvApplyKb==='function')nvApplyKb(); else {" +
                            "document.body.classList.toggle('kb-open'," + (if (open) "true" else "false") + ");}" +
                            "var el=document.activeElement;" +
                            "if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA')){" +
                            "setTimeout(function(){try{el.scrollIntoView({block:'center'});}catch(e){}},120);" +
                            "setTimeout(function(){try{el.scrollIntoView({block:'center'});}catch(e){}},450);}" +
                            "})();"
                        webView.post { webView.evaluateJavascript(js, null) }
                    }
                }
            } catch (_: Exception) {}
        }

        window.decorView.setOnApplyWindowInsetsListener { _, insets ->
            val nb = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout()).bottom
            val bottomSafe = maxOf(nb, cutout)
            webView.post {
                webView.evaluateJavascript("""
                    (function(){
                        var b=$bottomSafe;
                        var s=document.getElementById('abx-safe');
                        if(!s){s=document.createElement('style');s.id='abx-safe';document.head.appendChild(s);}
                        s.textContent=
                            '.rc-bottombar,[class*=bottombar],[class*=bottom-nav],[class*=tab-bar]{padding-bottom:'+b+'px!important;min-height:'+(56+b)+'px!important;}' +
                            'body,html{padding-bottom:0!important;margin-bottom:0!important;}' +
                            '.rc-page,[class*=page-container],[class*=content-wrap],[class*=main-scroll]{padding-bottom:'+(b+70)+'px!important;}' +
                            '@media(max-width:400px){.rc-topbar h1,.rc-topbar [class*=title]{font-size:13px!important;max-width:90px!important;}}';
                    })();
                """.trimIndent(), null)
            }
            insets
        }

        setupWebView()
        handleBackPress()

        webView.loadUrl(baseUrl)

        UpdateChecker(this).checkOnStart()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val data = intent.data
        if (data != null) {
            val scheme = data.scheme
            val host = data.host
            if (scheme == "tg" || scheme == "telegram" || host == "t.me") {
                webView.post { webView.reload() }
            }
        }
    }

    private fun createSplashView(): FrameLayout {
        return FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0D0C10"))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )

            addView(ImageView(this@MainActivity).apply {
                setImageResource(R.mipmap.ic_launcher)
                layoutParams = FrameLayout.LayoutParams(180, 180).apply {
                    gravity = Gravity.CENTER
                    setMargins(0, -120, 0, 0)
                }
                clipToOutline = true
                outlineProvider = object : android.view.ViewOutlineProvider() {
                    override fun getOutline(view: View, outline: android.graphics.Outline) {
                        outline.setOval(0, 0, view.width, view.height)
                    }
                }
                scaleType = ImageView.ScaleType.CENTER_CROP
            })

            addView(TextView(this@MainActivity).apply {
                text = str(R.string.app_name)
                setTextColor(Color.parseColor("#F5F4F7"))
                textSize = 22f
                typeface = Typeface.DEFAULT_BOLD
                letterSpacing = -0.02f
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.CENTER
                    topMargin = 140
                }
            })

            addView(TextView(this@MainActivity).apply {
                text = str(R.string.splash_subtitle)
                setTextColor(Color.parseColor("#9B9AA3"))
                textSize = 13f
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.CENTER
                    topMargin = 185
                }
            })
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.addJavascriptInterface(BleJs(), "NativeBle")
        webView.addJavascriptInterface(NativeDl(), "NativeDl")
        webView.addJavascriptInterface(NativeApp(), "NativeApp")
        webView.addJavascriptInterface(NativeShare(), "NativeShare")
        webView.addJavascriptInterface(LangManager.Bridge(LangManager), "AndroidLang")

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            loadWithOverviewMode = false
            useWideViewPort = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            mediaPlaybackRequiresUserGesture = false
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
            defaultTextEncodingName = "UTF-8"
            setTextZoom(100)
            allowUniversalAccessFromFileURLs = true
            allowFileAccessFromFileURLs = true
        }

        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)

                val fixJs = """
                    (function() {
                        var vp = document.querySelector('meta[name="viewport"]');
                        if (vp) {
                            vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
                        } else {
                            var m = document.createElement('meta');
                            m.name = 'viewport';
                            m.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
                            document.head.appendChild(m);
                        }

                        var _oldFix = document.getElementById('app-fixes');
                        if (_oldFix) _oldFix.remove();

                        var css = document.createElement('style');
                        css.id = 'app-fixes';
                        css.textContent = '' +
                            '[data-m="bot"],#m-bot,' +
                            '[class*="telegram"],[id*="telegram"],' +
                            'button[data-m="otp"],' +
                            '.method-btn[data-m="otp"]{' +
                            '  display:none!important;' +
                            '}' +

                            '/*v45-topbar-original*/' +
                            '/*v44-topbar-children-reset*/' +

                            '/*v45-title-original*/' +

                            '.rc-stage-card, [class*="stage-card"], [class*="etap"]{' +
                            '  margin-bottom:10px!important;' +
                            '  padding-bottom:10px!important;' +
                            '}' +

                            '.rc-card, [class*="rc-card"], [class*="stat-card"]{' +
                            '  margin-bottom:8px!important;' +
                            '  overflow:hidden!important;' +
                            '  text-overflow:ellipsis!important;' +
                            '}' +

                            '.rc-stage-items, [class*="stage-items"], [class*="checklist"]{' +
                            '  gap:6px!important;' +
                            '  padding:4px 0!important;' +
                            '}' +

                            '.rc-bottombar, [class*="bottombar"], [class*="bottom-nav"], [class*="tab-bar"]{' +
                            '  display:flex!important;' +
                            '  align-items:center!important;' +
                            '  justify-content:space-around!important;' +
                            '  position:fixed!important;' +
                            '  transform:translateZ(0)!important;' +
                            '  bottom:0!important;' +
                            '  left:0!important;' +
                            '  right:0!important;' +
                            '  z-index:99999!important;' +
                            '  background:var(--app-bg,#0D0C10)!important;' +
                            '  color:var(--app-fg,#F5F4F7)!important;' +
                            '  border-top:1px solid var(--app-border,#1a1a2e)!important;' +
                            '  flex-shrink:0!important;' +
                            '  padding-bottom:env(safe-area-inset-bottom,0)!important;' +
                            '}' +

                            '::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;}' +
                            'html,body{scrollbar-width:none!important;-ms-overflow-style:none!important;}' +

                            'body.kb-open .rc-bottombar,body.kb-open [class*="bottombar"],' +
                            'body.kb-open [class*="bottom-nav"],body.kb-open [class*="tab-bar"]{' +
                            '  transform:translateY(120%)!important;' +
                            '}' +

                            'body, html{' +
                            '  padding-bottom:0!important;' +
                            '  margin-bottom:0!important;' +
                            '  overflow-x:hidden!important;' +
                            '  -webkit-overflow-scrolling:touch!important;' +
                            '}' +

                            '.rc-page, [class*=page-container], [class*=content-wrap], [class*=main-scroll]{' +
                            '  padding-bottom:calc(env(safe-area-inset-bottom,0) + 70px)!important;' +
                            '}' +

                            'h1,h2,h3,h4,.rc-title,[class*=title]{' +
                            '  overflow:hidden!important;' +
                            '  text-overflow:ellipsis!important;' +
                            '  white-space:nowrap!important;' +
                            '}' +

                            '.rc-card-text,.rc-stat-val,[class*=stat-val],[class*=card-text]{' +
                            '  overflow:hidden!important;' +
                            '  text-overflow:ellipsis!important;' +
                            '  white-space:nowrap!important;' +
                            '  font-size:clamp(12px,3.5vw,16px)!important;' +
                            '}' +

                            '.nv-fs-poly{position:fixed!important;inset:0!important;z-index:99990!important;}' +

                            '@media(prefers-color-scheme:light){' +
                            '  :root{--app-bg:#FFFFFF;--app-fg:#1A1A2E;--app-border:#E0E0E0;}' +
                            '  .rc-topbar,[class*=topbar],header{background:#FFFFFF!important;color:#1A1A2E!important;border-bottom:1px solid #E0E0E0!important;}' +
                            '  .rc-bottombar,[class*=bottombar],[class*=bottom-nav],[class*=tab-bar]{background:#FFFFFF!important;color:#1A1A2E!important;border-top:1px solid #E0E0E0!important;}' +
                            '  body{background:#F5F5F5!important;color:#1A1A2E!important;}' +
                            '}';
                        document.head.appendChild(css);

                        var obs = new MutationObserver(function(){
                            document.querySelectorAll('[data-m="bot"],#m-bot,.method-btn[data-m="otp"]').forEach(function(el){
                                el.style.display='none';
                            });
                        });
                        obs.observe(document.body||document.documentElement,{childList:true,subtree:true});
                    })();
                """.trimIndent()
                view?.evaluateJavascript(fixJs, null)

                val bleJs = """
                    (function() {
                        if (typeof BLE !== 'undefined' && typeof NativeBle !== 'undefined') {
                            BLE.openBridge = function() { NativeBle.showDevices(); };
                            BLE.connect = function() { NativeBle.showDevices(); };
                            BLE.connectSmart = function() { NativeBle.showDevices(); };
                            BLE.measure = function() { NativeBle.measure(); };
                        }
                        if (window.__nvHooks) return;
                        window.__nvHooks = true;

                        // Til o'zgarganda Android ga xabar berish
                        if (typeof I18n !== 'undefined' && typeof AndroidLang !== 'undefined') {
                            var _origSet = I18n.set;
                            I18n.set = function(code) {
                                _origSet.call(I18n, code);
                                try { AndroidLang.setLang(code); } catch(e) {}
                            };
                            // Hozirgi tilni Android ga yuborish
                            try { AndroidLang.setLang(I18n.lang()); } catch(e) {}
                        }

                        // To'lov checkout — tashqi brauzerda (2026-09-23, additive).
                        // window.open(checkout) WebView popup'ni tashlaydi (SPA checkout
                        // ga almashib, poll o'ladi). Faqat to'lov domenlarini
                        // NativeApp.openExternal ga uzatamiz, boshqasiga tegmaymiz.
                        // Soxta oyna qaytaramiz — SPA poll boshlashi uchun (win!=null).
                        try {
                            if (!window.__nvPayWrapped && typeof NativeApp !== 'undefined' && NativeApp.openExternal) {
                                window.__nvPayWrapped = true;
                                var _nvOpen = window.open;
                                window.open = function(u, t) {
                                    try {
                                        var s = String(u || '');
                                        if (/paycom|checkout|click\.uz|octobank|multicard|payze|stripe|paypal/i.test(s)) {
                                            NativeApp.openExternal(s);
                                            return { closed: false, close: function(){}, focus: function(){}, blur: function(){} };
                                        }
                                    } catch(e2) {}
                                    return _nvOpen.apply(window, arguments);
                                };
                            }
                        } catch(e) {}

                        // Har qanday input/textarea fokuslanganda markazga ko'tarish
                        document.addEventListener('focusin', function(e) {
                            var t = e.target;
                            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
                                setTimeout(function(){ try { t.scrollIntoView({block:'center'}); } catch(x){} if (typeof nvApplyKb === 'function') nvApplyKb(); }, 150);
                                setTimeout(function(){ try { t.scrollIntoView({block:'center'}); } catch(x){} if (typeof nvApplyKb === 'function') nvApplyKb(); }, 550);
                            }
                        }, true);

                        // Klaviatura yopgan joyni O'LCHAB ko'tarish (taxmin emas)
                        window.__kbNative = window.__kbNative || 0;
                        window.__kbVv = window.__kbVv || 0;
                        window.nvApplyKb = function() {
                            try {
                                var vvh = 0, vvo = 0, hasVv = false;
                                if (window.visualViewport && window.visualViewport.height > 0) {
                                    vvh = window.visualViewport.height;
                                    vvo = window.visualViewport.offsetTop || 0;
                                    hasVv = true;
                                }
                                var kbEst = Math.max(window.__kbNative || 0, window.__kbVv || 0);
                                var anyLift = false;
                                function liftAbs(el, prop, cur) {
                                    if (!el) return;
                                    var need;
                                    if (hasVv) {
                                        var r = el.getBoundingClientRect();
                                        need = Math.round(r.bottom + cur - vvh - vvo);
                                    } else {
                                        need = kbEst > 0 ? kbEst : 0;
                                    }
                                    if (need < 0) need = 0;
                                    if (prop === 'bottom') el.style.bottom = need + 'px';
                                    else el.style.paddingBottom = need > 0 ? need + 'px' : '';
                                    if (need > 0) anyLift = true;
                                }
                                ['gal-ai-panel', 'gal-vr-panel'].forEach(function(id) {
                                    var p = document.getElementById(id);
                                    if (p) liftAbs(p, 'bottom', parseFloat(p.style.bottom) || 0);
                                });
                                var bd = document.getElementById('rc-sheet-bd');
                                if (bd) liftAbs(bd, 'pad', parseFloat(bd.style.paddingBottom) || 0);
                                var vvShrink = hasVv ? (window.innerHeight - vvh - vvo) : 0;
                                document.body.classList.toggle('kb-open', !!(anyLift || vvShrink > 50 || kbEst > 0));
                            } catch(x){}
                        };
                        function nvLift() {
                            try {
                                var kb = 0;
                                if (window.visualViewport) {
                                    kb = window.innerHeight - window.visualViewport.height -
                                        window.visualViewport.offsetTop;
                                }
                                if (kb < 0) kb = 0;
                                window.__kbVv = Math.round(kb);
                                window.nvApplyKb();
                            } catch(x){}
                        }
                        if (window.visualViewport) {
                            window.visualViewport.addEventListener('resize', nvLift);
                        }

                        // Ulashish: tizim oynasi
                        try {
                            if (!navigator.share && typeof NativeShare !== 'undefined') {
                                navigator.share = function(d) {
                                    d = d || {};
                                    NativeShare.share(d.url || d.text || '', d.title || '');
                                    return Promise.resolve();
                                };
                            }
                        } catch(x){}

                        // Fullscreen: WebView qo'llamaydi — native immersive orqali
                        try {
                            var proto = Element.prototype;
                            proto.requestFullscreen = function() {
                                var el = this;
                                try {
                                    if (typeof NativeApp !== 'undefined' &&
                                        (el.id === 'gal-overlay' || el.id === 'gal-vid' ||
                                         (el.closest && el.closest('#gal-overlay')))) {
                                        el.classList.add('nv-fs-poly');
                                        window.__fsPoly = true;
                                        NativeApp.enterFullscreen();
                                        var x = document.createElement('button');
                                        x.id = 'nv-fs-close';
                                        x.textContent = '✕';
                                        x.style.cssText = 'position:fixed;top:14px;right:14px;z-index:100001;' +
                                            'width:42px;height:42px;border-radius:50%;border:none;' +
                                            'background:rgba(0,0,0,.55);color:#fff;font-size:18px;';
                                        x.onclick = function() { document.exitFullscreen(); };
                                        document.body.appendChild(x);
                                        return Promise.resolve();
                                    }
                                } catch(e){}
                                return Promise.reject(new Error('fs'));
                            };
                            document.exitFullscreen = function() {
                                try {
                                    var els = document.querySelectorAll('.nv-fs-poly');
                                    for (var i = 0; i < els.length; i++) els[i].classList.remove('nv-fs-poly');
                                    window.__fsPoly = false;
                                    var x = document.getElementById('nv-fs-close');
                                    if (x) x.remove();
                                    if (typeof NativeApp !== 'undefined') NativeApp.exitFullscreen();
                                } catch(e){}
                                return Promise.resolve();
                            };
                        } catch(x){}
                    })();
                """.trimIndent()
                view?.evaluateJavascript(bleJs, null)

                if (isSplashShowing) {
                    isSplashShowing = false
                    splashView.animate()
                        .alpha(0f)
                        .setDuration(300)
                        .withEndAction {
                            splashView.visibility = View.GONE
                            webView.visibility = View.VISIBLE
                            try {
                                val parent = splashView.parent as? ViewGroup
                                parent?.removeView(splashView)
                            } catch (_: Exception) {}
                        }
                        .start()
                }
                progressBar.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    progressBar.visibility = View.GONE
                }
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false

                if (url.startsWith("tel:") || url.startsWith("mailto:") ||
                    url.startsWith("whatsapp:")
                ) {
                    try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                    catch (_: Exception) {}
                    return true
                }

                // SMS taklif tugmasi (2026-09-23, additive): SMS ilovani
                // tayyor matn bilan ochadi, kontaktni foydalanuvchi tanlaydi.
                if (url.startsWith("sms:") || url.startsWith("smsto:")) {
                    try {
                        val uri = Uri.parse(url)
                        val body = uri.getQueryParameter("body") ?: ""
                        val address = (uri.schemeSpecificPart ?: "").substringBefore("?")
                        val intent = Intent(Intent.ACTION_SENDTO).apply {
                            data = Uri.parse("smsto:$address")
                            putExtra("sms_body", body)
                        }
                        startActivity(intent)
                    } catch (_: Exception) {}
                    return true
                }

                if (url.startsWith("tg://") || url.startsWith("https://t.me/")) {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        intent.setPackage("org.telegram.messenger")
                        startActivity(intent)
                    } catch (_: Exception) {
                        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                        catch (_: Exception) {}
                    }
                    return true
                }

                if (url.contains("lazer") || url.contains("ble") || url.contains("bluetooth")) {
                    try {
                        val customTabsIntent = CustomTabsIntent.Builder().build()
                        customTabsIntent.intent.setPackage("com.android.chrome")
                        customTabsIntent.launchUrl(this@MainActivity, Uri.parse(url))
                    } catch (_: Exception) {
                        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                        catch (_: Exception) {}
                    }
                    return true
                }

                if (url.contains("usta.bittada.uz")) return false

                val scheme = request?.url?.scheme ?: ""
                if (scheme != "http" && scheme != "https") return true

                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                catch (_: Exception) {}
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = callback

                val accept = fileChooserParams?.acceptTypes?.filter { it.isNotEmpty() } ?: emptyList()
                val mediaOnly = accept.isNotEmpty() &&
                    accept.all { it.startsWith("image/") || it.startsWith("video/") }
                if (mediaOnly) {
                    pendingWantsImage = accept.any { it.startsWith("image/") }
                    pendingWantsVideo = accept.any { it.startsWith("video/") }
                    pendingMultiple = fileChooserParams?.mode ==
                        WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
                    val need = mutableListOf<String>()
                    if (pendingWantsImage || pendingWantsVideo) {
                        need.add(android.Manifest.permission.CAMERA)
                    }
                    if (pendingWantsVideo) {
                        need.add(android.Manifest.permission.RECORD_AUDIO)
                    }
                    if (need.all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) {
                        openMediaChooser()
                    } else {
                        try { cameraPermissionLauncher.launch(need.toTypedArray()) }
                        catch (_: Exception) { openMediaChooser() }
                    }
                    return true
                }

                val intent = fileChooserParams?.createIntent()
                try {
                    filePickerLauncher.launch(
                        intent ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                            type = "*/*"
                            addCategory(Intent.CATEGORY_OPENABLE)
                            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                        }
                    )
                } catch (e: Exception) {
                    fileUploadCallback?.onReceiveValue(null)
                    fileUploadCallback = null
                    return false
                }
                return true
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, true, false)
            }

            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (customView != null) {
                    callback?.onCustomViewHidden()
                    return
                }
                customView = view
                customCallback = callback
                val decor = window.decorView as ViewGroup
                val fs = FrameLayout(this@MainActivity).apply {
                    setBackgroundColor(Color.BLACK)
                    addView(view, ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT))
                }
                fs.tag = "fullscreen_holder"
                decor.addView(fs, ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT))
            }

            override fun onHideCustomView() {
                val decor = window.decorView as ViewGroup
                var i = 0
                while (i < decor.childCount) {
                    if (decor.getChildAt(i).tag == "fullscreen_holder") {
                        decor.removeViewAt(i)
                    } else i++
                }
                customView = null
                try { customCallback?.onCustomViewHidden() } catch (_: Exception) {}
                customCallback = null
            }

            override fun onJsAlert(
                view: WebView?, url: String?, message: String?,
                result: JsResult?
            ): Boolean {
                android.app.AlertDialog.Builder(this@MainActivity)
                    .setMessage(message ?: "")
                    .setPositiveButton("OK") { _, _ -> result?.confirm() }
                    .setCancelable(false)
                    .show()
                return true
            }

            override fun onJsConfirm(
                view: WebView?, url: String?, message: String?,
                result: JsResult?
            ): Boolean {
                android.app.AlertDialog.Builder(this@MainActivity)
                    .setMessage(message ?: "")
                    .setPositiveButton(str(R.string.js_confirm_yes)) { _, _ -> result?.confirm() }
                    .setNegativeButton(str(R.string.js_confirm_no)) { _, _ -> result?.cancel() }
                    .setCancelable(false)
                    .show()
                return true
            }

            override fun onJsPrompt(
                view: WebView?, url: String?, message: String?,
                defaultValue: String?, result: JsPromptResult?
            ): Boolean {
                val input = android.widget.EditText(this@MainActivity).apply {
                    setText(defaultValue ?: "")
                    setSelection(text.length)
                }
                val pad = dp(20)
                val box = LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(pad, dp(8), pad, 0)
                    addView(input)
                }
                android.app.AlertDialog.Builder(this@MainActivity)
                    .setMessage(message ?: "")
                    .setView(box)
                    .setPositiveButton("OK") { _, _ -> result?.confirm(input.text.toString()) }
                    .setNegativeButton(str(R.string.js_prompt_cancel)) { _, _ -> result?.cancel() }
                    .show()
                try {
                    input.post {
                        input.requestFocus()
                        val imm = getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
                        imm.showSoftInput(input, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)
                    }
                } catch (_: Exception) {}
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                val res = request?.resources ?: return
                val wantAudio = res.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                if (wantAudio && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) ==
                    PackageManager.PERMISSION_GRANTED) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                } else {
                    if (wantAudio) {
                        try {
                            micPermissionLauncher.launch(arrayOf(android.Manifest.permission.RECORD_AUDIO))
                        } catch (_: Exception) {}
                        Toast.makeText(this@MainActivity,
                            str(R.string.mic_permission_needed), Toast.LENGTH_SHORT).show()
                    }
                    request.deny()
                }
            }

            override fun onCreateWindow(
                view: WebView?, isDialog: Boolean, isUserGesture: Boolean,
                resultMsg: android.os.Message?
            ): Boolean {
                val href = view?.hitTestResult?.extra
                if (!href.isNullOrEmpty() && (href.startsWith("http://") || href.startsWith("https://"))) {
                    try {
                        val customTabsIntent = CustomTabsIntent.Builder().build()
                        try { customTabsIntent.intent.setPackage("com.android.chrome") }
                        catch (_: Exception) {}
                        customTabsIntent.launchUrl(this@MainActivity, Uri.parse(href))
                    } catch (_: Exception) {
                        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(href))) }
                        catch (_: Exception) {}
                    }
                }
                return false
            }
        }

        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            handleDownload(url ?: "", userAgent, contentDisposition, mimeType)
        }

        webView.setOnTouchListener { v, event ->
            v.performClick()
            false
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    /** Tilga moslashtirilgan string olish */
    private fun str(resId: Int): String {
        val lang = LangManager.getLang()
        val locale = when (lang) {
            "ru" -> java.util.Locale("ru")
            "en" -> java.util.Locale("en")
            else -> java.util.Locale("uz")
        }
        val config = android.content.res.Configuration(resources.configuration)
        config.setLocale(locale)
        val ctx = createConfigurationContext(config)
        return ctx.getString(resId)
    }

    /** Tilga moslashtirilgan string formatlash */
    private fun str(resId: Int, vararg args: Any?): String {
        return String.format(str(resId), *args)
    }

    private fun createCameraFile(suffix: String): Pair<java.io.File, Uri>? {
        return try {
            val dir = java.io.File(cacheDir, "camera").apply { mkdirs() }
            val f = java.io.File.createTempFile("cap_", suffix, dir)
            val uri = androidx.core.content.FileProvider.getUriForFile(
                this, "$packageName.fileprovider", f)
            f to uri
        } catch (_: Exception) { null }
    }

    private fun openMediaChooser() {
        val wantsImage = pendingWantsImage
        val wantsVideo = pendingWantsVideo
        val multiple = pendingMultiple
        cameraPhotoUri = null
        cameraVideoUri = null

        val cameraIntents = mutableListOf<Intent>()
        if (wantsImage && checkSelfPermission(android.Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED) {
            createCameraFile(".jpg")?.let { (_, uri) ->
                cameraPhotoUri = uri
                val ci = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
                ci.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uri)
                ci.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                if (ci.resolveActivity(packageManager) != null) cameraIntents.add(ci)
                else cameraPhotoUri = null
            }
        }
        if (wantsVideo && checkSelfPermission(android.Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED) {
            createCameraFile(".mp4")?.let { (_, uri) ->
                cameraVideoUri = uri
                val ci = Intent(android.provider.MediaStore.ACTION_VIDEO_CAPTURE)
                ci.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uri)
                ci.putExtra(android.provider.MediaStore.EXTRA_VIDEO_QUALITY, 1)
                ci.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                if (ci.resolveActivity(packageManager) != null) cameraIntents.add(ci)
                else cameraVideoUri = null
            }
        }

        val pickAction = "android.provider.action.PICK_IMAGES"
        val pick = Intent(pickAction).takeIf {
            try { it.resolveActivity(packageManager) != null } catch (_: Exception) { false }
        } ?: Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
        }
        when {
            wantsImage && !wantsVideo -> pick.type = "image/*"
            wantsVideo && !wantsImage -> pick.type = "video/*"
            else -> {
                if (pick.action == Intent.ACTION_GET_CONTENT) {
                    pick.type = "*/*"
                    pick.putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "video/*"))
                }
            }
        }
        pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)

        try {
            val chooser = Intent.createChooser(pick, "Tanlash")
            if (cameraIntents.isNotEmpty()) {
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, cameraIntents.toTypedArray())
            }
            filePickerLauncher.launch(chooser)
        } catch (_: Exception) {
            try {
                filePickerLauncher.launch(Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                })
            } catch (_: Exception) {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = null
                cameraPhotoUri = null
                cameraVideoUri = null
            }
        }
    }

    private fun blePermissions(): Array<String> {
        val l = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            l.add(android.Manifest.permission.BLUETOOTH_SCAN)
            l.add(android.Manifest.permission.BLUETOOTH_CONNECT)
        }
        l.add(android.Manifest.permission.ACCESS_FINE_LOCATION)
        return l.toTypedArray()
    }

    private fun hasBlePermissions(): Boolean =
        blePermissions().all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

    private inner class BleJs {
        @JavascriptInterface
        fun showDevices() {
            runOnUiThread {
                if (bleConnectedName != null) {
                    bleIndicatorHidden = false
                    showBleIndicator()
                }
                refreshBleDrivers()
                openBleDevices()
            }
        }

        @JavascriptInterface
        fun measure() {
            runOnUiThread {
                if (bleConnectedName != null) bleManager.measure()
                else {
                    Toast.makeText(this@MainActivity, str(R.string.bt_connect_device_first), Toast.LENGTH_SHORT).show()
                    openBleDevices()
                }
            }
        }
    }

    private val bleCallback = object : BleManager.Callback {
        override fun onDeviceFound(name: String, address: String, rssi: Int) {
            runOnUiThread {
                if (bleDevices.none { it.second == address }) {
                    bleDevices.add(Triple(name, address, rssi))
                    bleDeviceAdapter?.notifyDataSetChanged()
                }
            }
        }

        override fun onConnected(name: String) {
            runOnUiThread {
                bleConnectedName = name
                bleIndicatorHidden = false
                try { bleDialog?.dismiss() } catch (_: Exception) {}
                bleDialog = null
                showBleIndicator()
                val js = "(function(){if(typeof BLE!=='undefined'){BLE._connected=true;if(BLE._updateTopbar)BLE._updateTopbar();}if(typeof Toast!=='undefined')Toast.success('📡 ulanildi');})();"
                webView.evaluateJavascript(js, null)
                Toast.makeText(this@MainActivity, str(R.string.bt_device_connected, name), Toast.LENGTH_SHORT).show()
            }
        }

        override fun onDisconnected() {
            runOnUiThread {
                bleConnectedName = null
                hideBleIndicator()
                val js = "(function(){if(typeof BLE!=='undefined'){BLE._connected=false;BLE._char=null;if(BLE._updateTopbar)BLE._updateTopbar();}if(typeof Toast!=='undefined')Toast.error('BLE uzildi');})();"
                webView.evaluateJavascript(js, null)
            }
        }

        override fun onMeasurement(mm: Int) {
            feedMeasurementToPage(mm)
        }

        override fun onError(msg: String) {
            runOnUiThread {
                bleConnectingAddr = null
                bleDeviceAdapter?.notifyDataSetChanged()
                bleDialogStatus?.text = msg
                Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show()
            }
        }

        override fun onScanFinished() {
            runOnUiThread {
                val n = bleDevices.size
                bleDialogStatus?.text = if (n > 0) str(R.string.ble_devices_found, n) else str(R.string.ble_not_found)
            }
        }
    }

    private fun openBleDevices() {
        if (!hasBlePermissions()) {
            try { blePermissionLauncher.launch(blePermissions()) } catch (_: Exception) {}
            return
        }
        if (!bleManager.isBluetoothEnabled()) {
            Toast.makeText(this, str(R.string.bt_off), Toast.LENGTH_SHORT).show()
            try {
                startActivity(Intent(android.bluetooth.BluetoothAdapter.ACTION_REQUEST_ENABLE))
            } catch (_: Exception) {}
            return
        }
        if (bleDialog?.isShowing == true) return
        bleDevices.clear()

        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(12))
        }
        box.addView(TextView(this).apply {
            text = str(R.string.ble_title)
            setTextColor(Color.WHITE)
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 0, 0, dp(4))
        })
        val statusRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        bleDialogStatus = TextView(this).apply {
            text = str(R.string.ble_searching)
            setTextColor(Color.parseColor("#9B9AA3"))
            textSize = 13f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        statusRow.addView(bleDialogStatus)
        val rescan = TextView(this).apply {
            text = str(R.string.ble_retry)
            setTextColor(Color.parseColor("#DCF262"))
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(12), dp(6), dp(12), dp(6))
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setStroke(dp(1), Color.parseColor("#3A3A48"))
                setColor(Color.parseColor("#20202B"))
            }
            setOnClickListener {
                bleDevices.clear()
                bleConnectingAddr = null
                bleDeviceAdapter?.notifyDataSetChanged()
                bleDialogStatus?.text = str(R.string.ble_searching)
                bleManager.startScan()
            }
        }
        statusRow.addView(rescan)
        box.addView(statusRow)

        if (bleConnectedName != null) {
            val cur = TextView(this).apply {
                text = str(R.string.ble_connected_status, bleConnectedName ?: "")
                setTextColor(Color.parseColor("#22c55e"))
                textSize = 14f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(0, 0, 0, dp(8))
            }
            box.addView(cur)
        }

        val list = ListView(this).apply {
            divider = null
            dividerHeight = 0
            selector = android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)
            isVerticalScrollBarEnabled = false
        }
        val adapter = BleRowAdapter()
        bleDeviceAdapter = adapter
        list.adapter = adapter
        list.setOnItemClickListener { _, _, pos, _ -> connectBleAt(pos) }
        box.addView(list, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dp(280)
        ))
        val closeBtn = TextView(this).apply {
            text = str(R.string.ble_close)
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#DCF262"))
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, dp(12), 0, dp(4))
            setOnClickListener {
                bleManager.stopScan()
                try { bleDialog?.dismiss() } catch (_: Exception) {}
            }
        }
        box.addView(closeBtn)

        bleDialog = android.app.AlertDialog.Builder(this)
            .setView(box)
            .setOnDismissListener { bleManager.stopScan(); bleDialog = null }
            .create()
        try {
            bleDialog?.show()
            bleDialog?.window?.setBackgroundDrawable(GradientDrawable().apply {
                cornerRadius = dp(20).toFloat()
                setColor(Color.parseColor("#17171F"))
            })
        } catch (_: Exception) { return }
        bleManager.startScan()
    }

    private fun connectBleAt(pos: Int) {
        val dev = bleDevices.getOrNull(pos) ?: return
        bleConnectingAddr = dev.second
        bleDeviceAdapter?.notifyDataSetChanged()
        bleDialogStatus?.text = str(R.string.ble_connecting, dev.first)
        bleManager.connect(dev.second)
    }

    private inner class BleRowAdapter : android.widget.BaseAdapter() {
        override fun getCount(): Int = bleDevices.size
        override fun getItem(p: Int): Any = bleDevices[p]
        override fun getItemId(p: Int): Long = p.toLong()

        override fun getView(pos: Int, convertView: View?, parent: ViewGroup): View {
            val (name, addr, rssi) = bleDevices[pos]
            val row = LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(14), dp(12), dp(14), dp(12))
                background = GradientDrawable().apply {
                    cornerRadius = dp(14).toFloat()
                    setColor(Color.parseColor("#20202B"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { setMargins(0, 0, 0, dp(8)) }
            }
            row.addView(TextView(this@MainActivity).apply {
                text = "📶"
                textSize = 22f
                setPadding(0, 0, dp(10), 0)
            })
            val info = LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            val noName = (name == addr)
            info.addView(TextView(this@MainActivity).apply {
                text = if (noName) str(R.string.ble_unnamed_device) else name
                setTextColor(if (noName) Color.parseColor("#9B9AA3") else Color.WHITE)
                textSize = 15f
                typeface = Typeface.DEFAULT_BOLD
                maxLines = 1
            })
            info.addView(TextView(this@MainActivity).apply {
                text = str(R.string.ble_device_rssi, addr, rssi)
                setTextColor(Color.parseColor("#9B9AA3"))
                textSize = 12f
                maxLines = 1
            })
            row.addView(info)
            val connecting = (bleConnectingAddr == addr)
            row.addView(TextView(this@MainActivity).apply {
                text = if (connecting) "⏳" else "ULASH"
                setTextColor(Color.parseColor("#0D0C10"))
                textSize = 13f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dp(14), dp(8), dp(14), dp(8))
                background = GradientDrawable().apply {
                    cornerRadius = dp(10).toFloat()
                    setColor(Color.parseColor(if (connecting) "#9B9AA3" else "#DCF262"))
                }
            })
            return row
        }
    }

    private fun showBleIndicator() {
        if (bleConnectedName == null || bleIndicatorHidden) return
        val root = rootView ?: return
        if (bleIndicator == null) {
            val size = dp(56)
            val btn = FrameLayout(this).apply {
                layoutParams = FrameLayout.LayoutParams(size, size).apply {
                    gravity = Gravity.TOP or Gravity.END
                    setMargins(0, dp(320), dp(16), 0)
                }
                alpha = 0.92f
                isClickable = true
                isFocusable = true
            }
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#1a73e8"))
                setStroke(dp(2), Color.parseColor("#DCF262"))
            }
            btn.background = bg
            btn.addView(TextView(this).apply {
                text = "📡"
                textSize = 24f
                gravity = Gravity.CENTER
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                )
            })
            val dotSize = dp(14)
            btn.addView(View(this).apply {
                layoutParams = FrameLayout.LayoutParams(dotSize, dotSize).apply {
                    gravity = Gravity.TOP or Gravity.END
                    setMargins(0, dp(4), dp(4), 0)
                }
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#22c55e"))
                }
            })
            var downX = 0f
            var downY = 0f
            var origLeft = 0
            var origTop = 0
            var dragging = false
            val slop = dp(10)
            btn.setOnTouchListener { v, e ->
                val p = v.layoutParams as FrameLayout.LayoutParams
                when (e.action) {
                    MotionEvent.ACTION_DOWN -> {
                        downX = e.rawX
                        downY = e.rawY
                        origLeft = v.left - (root.paddingLeft)
                        origTop = v.top - (root.paddingTop)
                        dragging = false
                        true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = (e.rawX - downX).toInt()
                        val dy = (e.rawY - downY).toInt()
                        if (!dragging && (kotlin.math.abs(dx) > slop || kotlin.math.abs(dy) > slop)) {
                            dragging = true
                        }
                        if (dragging) {
                            p.gravity = Gravity.TOP or Gravity.START
                            val maxL = root.width - root.paddingLeft - root.paddingRight - v.width
                            val maxT = root.height - root.paddingTop - root.paddingBottom - v.height
                            p.leftMargin = (origLeft + dx).coerceIn(0, maxOf(0, maxL))
                            p.topMargin = (origTop + dy).coerceIn(0, maxOf(0, maxT))
                            p.rightMargin = 0
                            v.layoutParams = p
                        }
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        if (!dragging) v.performClick()
                        true
                    }
                    else -> false
                }
            }
            btn.setOnClickListener { showBleMenu() }
            root.addView(btn)
            bleIndicator = btn
        }
        bleIndicator?.visibility = View.VISIBLE
    }

    private fun hideBleIndicator() {
        bleIndicator?.visibility = View.GONE
    }

    private fun showBleMenu() {
        val name = bleConnectedName ?: return
        val items = arrayOf(str(R.string.ble_menu_measure), str(R.string.ble_menu_disconnect), str(R.string.ble_menu_hide))
        android.app.AlertDialog.Builder(this)
            .setTitle("📡 $name")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> bleManager.measure()
                    1 -> bleManager.disconnect()
                    2 -> {
                        bleIndicatorHidden = true
                        hideBleIndicator()
                        Toast.makeText(this, str(R.string.bt_icon_hidden), Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .show()
    }

    private fun refreshBleDrivers() {
        try {
            webView.evaluateJavascript(
                "(function(){try{return JSON.stringify((typeof BLE!=='undefined'&&BLE._drivers)||[]);}catch(e){return '[]';}})();"
            ) { json ->
                try {
                    val list = mutableListOf<BleManager.BleDriver>()
                    val arr = org.json.JSONArray(json ?: "[]")
                    for (i in 0 until arr.length()) {
                        val d = arr.optJSONObject(i) ?: continue
                        val services = d.optJSONArray("services") ?: continue
                        var svcObj: org.json.JSONObject? = null
                        for (j in 0 until services.length()) {
                            val s = services.optJSONObject(j) ?: continue
                            if (s.optBoolean("is_primary", false)) { svcObj = s; break }
                            if (svcObj == null && !s.optString("service_uuid", "").isNullOrEmpty()) svcObj = s
                        }
                        val svc = svcObj ?: continue
                        val su = svc.optString("service_uuid", "")
                        val cu = svc.optString("characteristic_uuid", "")
                        if (su.isEmpty() || cu.isEmpty()) continue
                        var cmdByte: Int? = null
                        var payloadHex = ""
                        val cmds = d.optJSONArray("commands")
                        if (cmds != null) {
                            for (j in 0 until cmds.length()) {
                                val c = cmds.optJSONObject(j) ?: continue
                                if (c.optString("key", "") == "measure") {
                                    cmdByte = c.optInt("cmd_byte", -1).takeIf { it >= 0 }
                                    payloadHex = c.optString("payload_hex", "")
                                    break
                                }
                            }
                        }
                        val fr = d.optJSONObject("framing")
                        val crc = fr?.optJSONObject("crc")
                        list.add(BleManager.BleDriver(
                            serviceUuid = su,
                            charUuid = cu,
                            mode = if (fr != null && !fr.isNull("mode")) fr.optInt("mode") else null,
                            cmdByte = cmdByte,
                            payload = hexToBytesLocal(payloadHex),
                            crcInit = if (crc == null || crc.isNull("init")) null else crc.optInt("init"),
                            crcPoly = if (crc == null || crc.isNull("poly")) null else crc.optInt("poly"),
                            crcMsb = crc?.optBoolean("msb_first", true) ?: true,
                            distOffset = d.optInt("dist_offset", 2),
                            distSize = d.optInt("dist_size", 4),
                            bigEndian = d.optString("dist_endian", "little") == "big",
                            mmPerUnit = d.optDouble("mm_per_unit", 1.0),
                            offsetMm = d.optDouble("offset_mm", 0.0),
                            writeWithResponse = d.optBoolean("write_with_response", true),
                            useIndication = d.optBoolean("use_indication", false)
                        ))
                    }
                    bleManager.setDrivers(list)
                } catch (_: Exception) {}
            }
        } catch (_: Exception) {}
    }

    private fun hexToBytesLocal(hex: String): ByteArray {
        return try {
            val clean = hex.replace(Regex("[^0-9a-fA-F]"), "")
            ByteArray(clean.length / 2) { i ->
                clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
            }
        } catch (_: Exception) { ByteArray(0) }
    }

    private fun feedMeasurementToPage(mm: Int) {
        if (mm <= 0) return
        val js = "(function(){var mm=" + mm + ";" +
            "if(typeof BLE!=='undefined'){BLE._lastValue=mm;if(BLE._log)BLE._log.push({value:mm,ts:new Date().toLocaleTimeString()});}" +
            "if(typeof BLE!=='undefined'&&BLE._onMeasure){var cb=BLE._onMeasure;BLE._onMeasure=null;cb(mm);return;}" +
            "if(typeof BLE!=='undefined'&&BLE._pendingCb){var pc=BLE._pendingCb;BLE._pendingCb=null;pc(mm);return;}" +
            "var inp=(typeof BLE!=='undefined'&&BLE._targetInput)||(typeof BLE!=='undefined'&&BLE._lastFocused)||document.activeElement;" +
            "if(inp&&inp.tagName==='INPUT'){inp.value=mm;inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));}" +
            "if(typeof Toast!=='undefined')Toast.success('📡 '+mm+' mm yozildi');})();"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private inner class NativeDl {
        @JavascriptInterface
        fun downloadBase64(base64: String?, filename: String?, mime: String?) {
            runOnUiThread { saveBase64ToDownloads(base64, filename, mime) }
        }
    }

    private fun saveBase64ToDownloads(base64: String?, filename: String?, mime: String?) {
        try {
            if (base64.isNullOrEmpty()) return
            val data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
            var name = (filename?.takeIf { it.isNotBlank() } ?: "fayl")
                .replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val mt = mime?.takeIf { it.contains("/") }
            if (!name.contains(".") && mt != null) {
                val ext = android.webkit.MimeTypeMap.getSingleton().getExtensionFromMimeType(mt)
                if (!ext.isNullOrEmpty()) name += ".$ext"
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name)
                    if (mt != null) put(android.provider.MediaStore.Downloads.MIME_TYPE, mt)
                    put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = contentResolver
                val uri = resolver.insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return
                resolver.openOutputStream(uri)?.use { it.write(data) }
                values.clear()
                values.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } else {
                val dir = android.os.Environment.getExternalStoragePublicDirectory(
                    android.os.Environment.DIRECTORY_DOWNLOADS)
                dir.mkdirs()
                java.io.File(dir, name).writeBytes(data)
            }
            Toast.makeText(this, str(R.string.download_finished, name), Toast.LENGTH_LONG).show()
        } catch (_: Exception) {
            Toast.makeText(this, str(R.string.download_error), Toast.LENGTH_SHORT).show()
        }
    }

    private fun handleDownload(url: String, userAgent: String?, contentDisposition: String?, mimeType: String?) {
        try {
            when {
                url.startsWith("blob:") -> {
                    val js = "(function(){fetch('$url').then(function(r){return r.blob();}).then(function(b){var fr=new FileReader();fr.onload=function(){try{NativeDl.downloadBase64(String(fr.result).split(',')[1],'fayl',b.type||'');}catch(e){}};fr.readAsDataURL(b);}).catch(function(){});})();"
                    webView.post { webView.evaluateJavascript(js, null) }
                }
                url.startsWith("data:") -> {
                    val comma = url.indexOf(",")
                    if (comma > 0) {
                        val meta = url.substring(5, comma)
                        val mt = meta.substringBefore(";").takeIf { it.contains("/") }
                        saveBase64ToDownloads(url.substring(comma + 1), "fayl", mt)
                    }
                }
                else -> {
                    val filename = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType)
                    val req = android.app.DownloadManager.Request(Uri.parse(url)).apply {
                        setTitle(filename)
                        setDescription(str(R.string.download_in_progress))
                        setNotificationVisibility(
                            android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        setDestinationInExternalPublicDir(
                            android.os.Environment.DIRECTORY_DOWNLOADS, filename)
                        setAllowedOverMetered(true)
                        setAllowedOverRoaming(true)
                        if (!userAgent.isNullOrEmpty()) addRequestHeader("User-Agent", userAgent)
                        try {
                            val cookie = CookieManager.getInstance().getCookie(url)
                            if (!cookie.isNullOrEmpty()) addRequestHeader("Cookie", cookie)
                        } catch (_: Exception) {}
                    }
                    val dm = getSystemService(DOWNLOAD_SERVICE) as android.app.DownloadManager
                    dm.enqueue(req)
                    Toast.makeText(this, str(R.string.download_started), Toast.LENGTH_SHORT).show()
                }
            }
        } catch (_: Exception) {
            Toast.makeText(this, str(R.string.download_error), Toast.LENGTH_SHORT).show()
        }
    }

    private fun handleBackPress() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (fsPolyActive) {
                    fsPolyActive = false
                    webView.post {
                        webView.evaluateJavascript(
                            "(function(){try{document.exitFullscreen();}catch(e){}})();", null)
                    }
                    try {
                        androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
                            .show(androidx.core.view.WindowInsetsCompat.Type.statusBars() or
                                androidx.core.view.WindowInsetsCompat.Type.navigationBars())
                    } catch (_: Exception) {}
                    return
                }
                if (customView != null) {
                    webView.webChromeClient?.onHideCustomView()
                    return
                }
                if (bleDialog?.isShowing == true) {
                    try { bleDialog?.dismiss() } catch (_: Exception) {}
                    bleDialog = null
                    bleManager.stopScan()
                    return
                }
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        CookieManager.getInstance().flush()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        try { bleManager.destroy() } catch (_: Exception) {}
        webView.destroy()
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        webView.restoreState(savedInstanceState)
    }
}