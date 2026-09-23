-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# WebView
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class android.webkit.** { *; }
-keep class android.webkit.WebView { *; }
-keep class android.webkit.WebViewClient { *; }
-keep class android.webkit.WebChromeClient { *; }

# App classes
-keep class com.bittada.bittadausta.** { *; }

# AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**

# Material
-keep class com.google.android.material.** { *; }
-dontwarn com.google.android.material.**
