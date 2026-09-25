package com.bittada.bittadausta

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.content.Intent
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject

class BleBridge(
    private val context: Context,
    private val webView: WebView,
    private val bleManager: BleManager
) : BleManager.Callback {

    companion object {
        private const val TAG = "BleBridge"
    }

    private var lastMeasurement = 0
    private var pendingMeasure = false

    @JavascriptInterface
    fun isAvailable(): Boolean {
        return bleManager.isBluetoothEnabled()
    }

    @JavascriptInterface
    fun enable() {
        try {
            val intent = Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            postToWeb("ble.onEnableError", "Bluetooth yoqish mumkin emas")
        }
    }

    @JavascriptInterface
    fun startScan() {
        Log.d(TAG, "startScan called from JS")
        bleManager.setCallback(this)
        bleManager.startScan()
    }

    @JavascriptInterface
    fun stopScan() {
        bleManager.stopScan()
    }

    @JavascriptInterface
    fun connect(address: String) {
        Log.d(TAG, "connect called: $address")
        bleManager.setCallback(this)
        bleManager.connect(address)
    }

    @JavascriptInterface
    fun disconnect() {
        bleManager.disconnect()
    }

    @JavascriptInterface
    fun measure() {
        if (pendingMeasure) return
        pendingMeasure = true
        lastMeasurement = 0
        bleManager.measure()
        // Timeout for measurement
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            if (pendingMeasure) {
                pendingMeasure = false
                postToWeb("ble.onMeasureError", "O'lchov vaqt tugadi")
            }
        }, 5000)
    }

    @JavascriptInterface
    fun measureOnce(): Int {
        // Synchronous-style: start measure and return last known
        bleManager.measure()
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            if (lastMeasurement > 0) {
                postToWeb("ble.onMeasureResult", lastMeasurement.toString())
            }
        }, 2000)
        return lastMeasurement
    }

    // BleManager.Callback implementations
    override fun onDeviceFound(name: String, address: String, rssi: Int) {
        val json = JSONObject().apply {
            put("name", name)
            put("address", address)
            put("rssi", rssi)
        }
        postToWeb("ble.onDeviceFound", json.toString())
    }

    override fun onConnected(name: String) {
        postToWeb("ble.onConnected", name)
    }

    override fun onDisconnected() {
        postToWeb("ble.onDisconnected", "")
    }

    override fun onMeasurement(mm: Int) {
        lastMeasurement = mm
        pendingMeasure = false
        postToWeb("ble.onMeasureResult", mm.toString())

        // Also try to inject directly into input fields (like the web bridge does)
        val js = """
            (function() {
                var mm = $mm;
                // Try callback first
                if (window._bleOnMeasure) {
                    var cb = window._bleOnMeasure;
                    window._bleOnMeasure = null;
                    cb(mm);
                    return;
                }
                // Try BLE._onMeasure
                if (typeof BLE !== 'undefined' && BLE._onMeasure) {
                    var cb2 = BLE._onMeasure;
                    BLE._onMeasure = null;
                    cb2(mm);
                    return;
                }
                // Try BLE._pendingCb
                if (typeof BLE !== 'undefined' && BLE._pendingCb) {
                    var cb3 = BLE._pendingCb;
                    BLE._pendingCb = null;
                    cb3(mm);
                    return;
                }
                // Write to target or last focused input
                var inp = (typeof BLE !== 'undefined' && BLE._targetInput) || 
                          (typeof BLE !== 'undefined' && BLE._lastFocused) ||
                          document.activeElement;
                if (inp && inp.tagName === 'INPUT') {
                    inp.value = mm;
                    inp.dispatchEvent(new Event('input', {bubbles: true}));
                    inp.dispatchEvent(new Event('change', {bubbles: true}));
                }
                if (typeof Toast !== 'undefined') Toast.success('📡 ' + mm + ' mm yozildi');
            })();
        """.trimIndent()
        postToWeb("eval", js)
    }

    override fun onError(msg: String) {
        postToWeb("ble.onError", msg)
    }

    override fun onScanFinished() {
        postToWeb("ble.onScanFinished", "")
    }

    private fun postToWeb(method: String, data: String) {
        val escaped = data.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
        val js = "if(window._bleBridge) window._bleBridge.$method('$escaped');"
        webView.post {
            webView.evaluateJavascript(js, null)
        }
    }
}
