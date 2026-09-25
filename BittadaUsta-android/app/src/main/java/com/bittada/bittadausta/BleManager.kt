package com.bittada.bittadausta

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.UUID

class BleManager(private val context: Context) {

    companion object {
        private const val TAG = "BleManager"
        private const val SCAN_TIMEOUT_MS = 15_000L
    }

    /** Tilga moslashtirilgan string olish */
    private fun str(resId: Int): String {
        val lang = LangManager.getLang()
        val locale = when (lang) {
            "ru" -> java.util.Locale("ru")
            "en" -> java.util.Locale("en")
            else -> java.util.Locale("uz")
        }
        val config = android.content.res.Configuration(context.resources.configuration)
        config.setLocale(locale)
        val ctx = context.createConfigurationContext(config)
        return ctx.getString(resId)
    }

    private fun str(resId: Int, vararg args: Any?): String {
        return String.format(str(resId), *args)
    }

    interface Callback {
        fun onDeviceFound(name: String, address: String, rssi: Int)
        fun onConnected(name: String)
        fun onDisconnected()
        fun onMeasurement(mm: Int)
        fun onError(msg: String)
        fun onScanFinished()
    }

    private var callback: Callback? = null
    private val handler = Handler(Looper.getMainLooper())
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var scanner: BluetoothLeScanner? = null
    private var connectingDevice: BluetoothGatt? = null
    private var measureChar: BluetoothGattCharacteristic? = null
    private var measureServiceUuid: UUID? = null
    private var isScanning = false

    private val scannedDevices = mutableSetOf<String>()

    private var targetServiceUuid: UUID? = null
    private var targetCharUuid: UUID? = null

    data class BleDriver(
        val serviceUuid: String,
        val charUuid: String,
        val mode: Int?,
        val cmdByte: Int?,
        val payload: ByteArray,
        val crcInit: Int?,
        val crcPoly: Int?,
        val crcMsb: Boolean,
        val distOffset: Int,
        val distSize: Int,
        val bigEndian: Boolean,
        val mmPerUnit: Double,
        val offsetMm: Double,
        val writeWithResponse: Boolean,
        val useIndication: Boolean
    )

    private val drivers = mutableListOf<BleDriver>()
    private var activeDriver: BleDriver? = null
    var offsetEnabled = true

    fun setDrivers(list: List<BleDriver>) {
        drivers.clear()
        drivers.addAll(list)
        Log.d(TAG, "Drayverlar yuklandi: ${drivers.size}")
    }

    fun hasDriver(): Boolean = drivers.isNotEmpty()

    private fun hexToBytes(hex: String): ByteArray {
        val clean = hex.replace(Regex("[^0-9a-fA-F]"), "")
        val out = ByteArray(clean.length / 2)
        for (i in out.indices) {
            out[i] = clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
        return out
    }

    private fun crcCalc(data: ByteArray, init: Int, poly: Int, msb: Boolean): Byte {
        var crc = init and 0xFF
        val p = poly and 0xFF
        for (b in data) {
            crc = crc xor (b.toInt() and 0xFF)
            repeat(8) {
                crc = if (msb) {
                    if (crc and 0x80 != 0) ((crc shl 1) xor p) and 0xFF else (crc shl 1) and 0xFF
                } else {
                    if (crc and 0x01 != 0) ((crc shr 1) xor p) and 0xFF else (crc shr 1) and 0xFF
                }
            }
        }
        return (crc and 0xFF).toByte()
    }

    fun setCallback(cb: Callback) { callback = cb }

    fun isBluetoothEnabled(): Boolean {
        val bm = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bm?.adapter
        return bluetoothAdapter?.isEnabled == true
    }

    @SuppressLint("MissingPermission")
    fun startScan(serviceUuids: List<UUID>? = null) {
        val adapter = bluetoothAdapter
            ?: (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
        if (adapter == null || !adapter.isEnabled) {
            callback?.onError(str(R.string.bt_off))
            return
        }
        bluetoothAdapter = adapter
        scanner = adapter.bluetoothLeScanner
        if (scanner == null) {
            callback?.onError(str(R.string.bt_scanner_not_available))
            return
        }

        scannedDevices.clear()
        isScanning = true

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setReportDelay(0)
            .build()

        val filters = serviceUuids?.map { uuid ->
            ScanFilter.Builder().setServiceUuid(android.os.ParcelUuid(uuid)).build()
        }

        Log.d(TAG, "Scan boshlandi, filter: ${filters?.size ?: 0}")
        scanner?.startScan(filters, settings, scanCallback)

        handler.postDelayed({
            if (isScanning) {
                stopScan()
                callback?.onScanFinished()
            }
        }, SCAN_TIMEOUT_MS)
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        if (!isScanning) return
        isScanning = false
        try { scanner?.stopScan(scanCallback) } catch (_: Exception) {}
        Log.d(TAG, "Scan to'xtatildi, topilgan: ${scannedDevices.size}")
    }

    @SuppressLint("MissingPermission")
    fun connect(address: String) {
        stopScan()
        val adapter = bluetoothAdapter ?: return
        val device = adapter.getRemoteDevice(address) ?: run {
            callback?.onError(str(R.string.bt_device_not_found, address))
            return
        }
        Log.d(TAG, "Ulanmoqda: ${device.name ?: address}")
        connectingDevice = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    @SuppressLint("MissingPermission")
    fun disconnect() {
        connectingDevice?.disconnect()
        connectingDevice = null
        measureChar = null
        measureServiceUuid = null
        activeDriver = null
    }

    @SuppressLint("MissingPermission")
    fun measure() {
        val gatt = connectingDevice
        val char = measureChar
        val svcUuid = measureServiceUuid
        if (gatt == null || char == null || svcUuid == null) {
            callback?.onError(str(R.string.bt_not_connected))
            return
        }

        val service = gatt.getService(svcUuid)
        val c = service?.getCharacteristic(char.uuid) ?: run {
            callback?.onError(str(R.string.bt_characteristic_not_found))
            return
        }

        val drv = activeDriver
        if (drv != null && drv.cmdByte == null) {
            callback?.onError(str(R.string.bt_press_measure))
            return
        }

        val frame: ByteArray = if (drv != null && drv.cmdByte != null) {
            val out = mutableListOf<Byte>()
            if (drv.mode != null) out.add((drv.mode and 0xFF).toByte())
            out.add((drv.cmdByte and 0xFF).toByte())
            out.add((drv.payload.size and 0xFF).toByte())
            drv.payload.forEach { out.add(it) }
            if (drv.crcInit != null) {
                out.add(crcCalc(out.toByteArray(), drv.crcInit,
                    drv.crcPoly ?: 0x31, drv.crcMsb))
            }
            out.toByteArray()
        } else {
            byteArrayOf(0x01, 0x01, 0x00, 0x36.toByte())
        }

        val ok = c.setValue(frame)
        c.writeType = if (drv?.writeWithResponse == false)
            BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        else BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        val result = gatt.writeCharacteristic(c)
        Log.d(TAG, "Measure yuborildi: ok=$ok, writeResult=$result")
    }

    fun sendCommand(serviceUuid: UUID, charUuid: UUID, data: ByteArray) {
        val gatt = connectingDevice ?: return
        val service = gatt.getService(serviceUuid) ?: return
        val char = service.getCharacteristic(charUuid) ?: return
        char.setValue(data)
        char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        gatt.writeCharacteristic(char)
    }

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            val addr = device.address
            if (addr in scannedDevices) return
            scannedDevices.add(addr)

            val name = try { device.name } catch (_: SecurityException) { null }
                ?: addr
            Log.d(TAG, "Topildi: $name ($addr) RSSI=${result.rssi}")
            callback?.onDeviceFound(name, addr, result.rssi)
        }

        override fun onScanFailed(errorCode: Int) {
            isScanning = false
            callback?.onError(str(R.string.ble_scan_error, errorCode))
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.d(TAG, "ULANDI: ${gatt.device.name}")
                    handler.post { callback?.onConnected(gatt.device.name ?: str(R.string.bt_default_device)) }
                    handler.postDelayed({ gatt.discoverServices() }, 600)
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.d(TAG, "UZILDI")
                    handler.post { callback?.onDisconnected() }
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                callback?.onError(str(R.string.bt_services_not_found))
                return
            }

            val services = gatt.services
            Log.d(TAG, "Topilgan servislar: ${services.size}")
            for (svc in services) {
                Log.d(TAG, "  Service: ${svc.uuid}")
                for (c in svc.characteristics) {
                    Log.d(TAG, "    Char: ${c.uuid} props=${c.properties}")
                }
            }

            activeDriver = null
            var matched: BluetoothGattCharacteristic? = null

            // 1) Drayver bo'yicha avtomatik aniqlash (sayt logikasi bilan bir xil)
            outer@ for (svc in services) {
                val su = svc.uuid.toString().lowercase()
                for (d in drivers) {
                    if (d.serviceUuid.lowercase() == su) {
                        val ch = svc.characteristics.firstOrNull {
                            it.uuid.toString().lowercase() == d.charUuid.lowercase()
                        } ?: continue
                        activeDriver = d
                        measureServiceUuid = svc.uuid
                        measureChar = ch
                        matched = ch
                        Log.d(TAG, "Drayver topildi: ${d.serviceUuid}")
                        break@outer
                    }
                }
            }

            // 2) Topilmasa — eski umumiy usul (o'qish/bildirishnomali birinchi)
            if (matched == null) {
                for (svc in services) {
                    for (c in svc.characteristics) {
                        val props = c.properties
                        if ((props and BluetoothGattCharacteristic.PROPERTY_READ) != 0 ||
                            (props and BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) {
                            measureServiceUuid = svc.uuid
                            measureChar = c
                            matched = c
                            break
                        }
                    }
                    if (matched != null) break
                }
            }

            val chosen = matched
            if (chosen == null) {
                callback?.onError(str(R.string.bt_characteristic_not_match))
                return
            }
            Log.d(TAG, "Measure characteristic tanlandi: ${chosen.uuid}")

            val useInd = activeDriver?.useIndication == true
            val props = chosen.properties
            if (!useInd && (props and BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) {
                gatt.setCharacteristicNotification(chosen, true)
                val desc = chosen.getDescriptor(UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"))
                if (desc != null) {
                    desc.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    gatt.writeDescriptor(desc)
                }
            } else if (useInd && (props and BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0) {
                gatt.setCharacteristicNotification(chosen, true)
                val desc = chosen.getDescriptor(UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"))
                if (desc != null) {
                    desc.value = BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                    gatt.writeDescriptor(desc)
                }
            }
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            parseMeasurement(characteristic.value)
        }

        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                parseMeasurement(value)
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            Log.d(TAG, "Write status: $status")
            // After write, try to read response
            if (status == BluetoothGatt.GATT_SUCCESS) {
                gatt.readCharacteristic(characteristic)
            }
        }
    }

    private fun parseMeasurement(data: ByteArray?) {
        if (data == null || data.isEmpty()) return
        Log.d(TAG, "Raw data: ${data.joinToString(" ") { String.format("%02X", it) }}")

        // Try ASCII text first (some devices send "1250")
        val ascii = StringBuilder()
        for (b in data) {
            val c = b.toInt() and 0xFF
            if (c in 0x30..0x39 || c == 0x2E) {
                ascii.append(c.toChar())
            }
        }
        if (ascii.isNotEmpty()) {
            val mm = ascii.toString().toFloatOrNull()
            if (mm != null && mm > 0) {
                handler.post { callback?.onMeasurement(mm.toInt()) }
                return
            }
        }

        // Binary: drayver bo'yicha masofa o'qish
        val drv = activeDriver
        if (drv != null) {
            if (data.size >= drv.distOffset + drv.distSize && drv.distSize > 0) {
                var raw = 0L
                if (drv.bigEndian) {
                    for (i in 0 until drv.distSize) {
                        raw = raw * 256 + (data[drv.distOffset + i].toInt() and 0xFF)
                    }
                } else {
                    for (j in drv.distSize - 1 downTo 0) {
                        raw = raw * 256 + (data[drv.distOffset + j].toInt() and 0xFF)
                    }
                }
                if (raw == 0L) {
                    callback?.onError(str(R.string.ble_aim))
                    return
                }
                var mm = raw * drv.mmPerUnit
                if (offsetEnabled) mm += drv.offsetMm
                handler.post { callback?.onMeasurement(kotlin.math.round(mm).toInt()) }
                return
            }
        } else {
            // Drayversiz umumiy usul: 2/4 bayt, offset 2
            if (data.size >= 6) {
                val raw = (data[2].toInt() and 0xFF) or
                        ((data[3].toInt() and 0xFF) shl 8) or
                        ((data[4].toInt() and 0xFF) shl 16) or
                        ((data[5].toInt() and 0xFF) shl 24)
                if (raw > 0) {
                    handler.post { callback?.onMeasurement(raw) }
                    return
                }
            }
            if (data.size >= 4) {
                val raw = (data[2].toInt() and 0xFF) or
                        ((data[3].toInt() and 0xFF) shl 8)
                if (raw > 0) {
                    handler.post { callback?.onMeasurement(raw) }
                    return
                }
            }
        }

        callback?.onError(str(R.string.ble_read_error))
    }

    fun destroy() {
        stopScan()
        disconnect()
    }
}
