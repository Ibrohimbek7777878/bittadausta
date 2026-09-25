import CoreBluetooth
import Foundation

/// BLE lazer menejeri — Android dagi BleManager bilan bir xil mantiq.
/// Drayverlar serverdan keladi (BLE._drivers): service_uuid,
/// characteristic_uuid, measure buyrug'i (cmd + payload).
/// Topilgan nom GAP Device Name (0x1800/0x2A00) dan ham o'qiladi.

protocol BleManagerDelegate: AnyObject {
    func bleDidFind(name: String, address: String, rssi: Int)
    func bleDidConnect(name: String)
    func bleDidDisconnect()
    func bleDidMeasure(mm: Int)
    func bleDidError(_ message: String)
    func bleScanFinished()
}

struct BleDriver {
    var serviceUUID: CBUUID
    var characteristicUUID: CBUUID
    var commandByte: UInt8?
    var payloadHex: String
}

final class BleManager: NSObject {

    weak var delegate: BleManagerDelegate?

    private var central: CBCentralManager!
    private var peripherals: [String: CBPeripheral] = [:]
    private var peripheralNames: [String: String] = [:]
    private var connected: CBPeripheral?
    private var measureChar: CBCharacteristic?
    private var nameChar: CBCharacteristic?
    private var drivers: [BleDriver] = []
    private var scanTimer: Timer?
    private var pendingMeasure = false

    private var lang: LangManager { LangManager.shared }
    private func T(_ key: String) -> String { lang.string(key) }
    private func Tf(_ key: String, _ args: CVarArg...) -> String {
        String(format: T(key), arguments: args)
    }

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    var isBluetoothOn: Bool { central.state == .poweredOn }

    // MARK: - Drivers (serverdan JSON)

    /// Android dagi refreshBleDrivers bilan bir xil format:
    /// [{service_uuid, characteristic_uuid, commands:[{key:'measure',...}]}]
    func setDrivers(json: String) {
        var out: [BleDriver] = []
        guard let data = json.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            drivers = []
            return
        }
        for d in arr {
            guard let services = d["services"] as? [[String: Any]] else { continue }
            let svc = services.first(where: { ($0["is_primary"] as? Bool) == true })
                ?? services.first(where: { ($0["service_uuid"] as? String ?? "").isEmpty == false })
            guard let s = svc,
                  let su = s["service_uuid"] as? String, !su.isEmpty,
                  let cu = s["characteristic_uuid"] as? String, !cu.isEmpty else { continue }
            var cmd: UInt8?
            var payload = ""
            if let cmds = d["commands"] as? [[String: Any]] {
                for c in cmds where (c["key"] as? String) == "measure" {
                    if let b = c["byte"] as? Int { cmd = UInt8(b & 0xFF) }
                    if let b = c["cmd"] as? Int { cmd = UInt8(b & 0xFF) }
                    payload = (c["payload_hex"] as? String) ?? (c["payload"] as? String) ?? ""
                }
            }
            out.append(BleDriver(
                serviceUUID: CBUUID(string: su),
                characteristicUUID: CBUUID(string: cu),
                commandByte: cmd,
                payloadHex: payload
            ))
        }
        drivers = out
    }

    // MARK: - Scan

    func startScan() {
        guard isBluetoothOn else {
            delegate?.bleDidError(T("bt_off"))
            return
        }
        peripherals.removeAll()
        peripheralNames.removeAll()
        let services = drivers.map { $0.serviceUUID }
        central.scanForPeripherals(
            withServices: services.isEmpty ? nil : services,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
        )
        scanTimer?.invalidate()
        scanTimer = Timer.scheduledTimer(withInterval: 15.0, repeats: false) { [weak self] _ in
            self?.stopScan()
            self?.delegate?.bleScanFinished()
        }
    }

    func stopScan() {
        scanTimer?.invalidate()
        scanTimer = nil
        if central.isScanning { central.stopScan() }
    }

    // MARK: - Connect

    func connect(address: String) {
        guard let p = peripherals[address] else {
            delegate?.bleDidError(Tf("bt_device_not_found", address))
            return
        }
        stopScan()
        connected = p
        p.delegate = self
        central.connect(p, options: nil)
    }

    func disconnect() {
        if let p = connected { central.cancelPeripheralConnection(p) }
        connected = nil
        measureChar = nil
        nameChar = nil
    }

    // MARK: - Measure

    func measure() {
        guard let p = connected, let ch = measureChar else {
            delegate?.bleDidError(T(pendingMeasure ? "ble_read_error" : "bt_not_connected"))
            return
        }
        // Drayver buyrug'i bo'lsa — yozamiz; bo'lmasa tugmani kutamiz.
        if let cmd = driver(for: p)?.commandByte {
            var bytes = [cmd] + hexToBytes(driver(for: p)?.payloadHex ?? "")
            p.writeValue(Data(bytes), for: ch, type: .withResponse)
        } else {
            delegate?.bleDidError(T("bt_press_measure"))
        }
    }

    private func driver(for p: CBPeripheral) -> BleDriver? {
        guard let svcs = p.services else { return drivers.first }
        for s in svcs {
            if let d = drivers.first(where: { $0.serviceUUID == s.uuid }) { return d }
        }
        return drivers.first
    }

    private func hexToBytes(_ hex: String) -> [UInt8] {
        var clean = hex.replacingOccurrences(of: " ", with: "")
        if clean.count % 2 == 1 { clean = "0" + clean }
        var out: [UInt8] = []
        var i = clean.startIndex
        while i < clean.endIndex {
            let j = clean.index(i, offsetBy: 2)
            out.append(UInt8(clean[i..<j], radix: 16) ?? 0)
            i = j
        }
        return out
    }

    /// Android dagi parse: avval ASCII matn, keyin binar (LE/BE).
    private func parseMeasurement(_ data: Data) -> Int? {
        if let s = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !s.isEmpty {
            let digits = s.filter { $0.isNumber }
            if let v = Int(digits), v > 0 { return v }
        }
        let b = [UInt8](data)
        if b.count >= 2 {
            let le16 = Int(b[0]) | (Int(b[1]) << 8)
            let be16 = (Int(b[0]) << 8) | Int(b[1])
            if le16 > 0 && le16 < 1_000_000 { return le16 }
            if be16 > 0 && be16 < 1_000_000 { return be16 }
        }
        if b.count >= 4 {
            let le32 = Int(b[0]) | (Int(b[1]) << 8) | (Int(b[2]) << 16) | (Int(b[3]) << 24)
            if le32 > 0 && le32 < 1_000_000 { return le32 }
        }
        return nil
    }
}

// MARK: - CBCentralManagerDelegate

extension BleManager: CBCentralManagerDelegate {

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state != .poweredOn && central.state != .unknown && central.state != .resetting {
            delegate?.bleDidError(T("bt_off"))
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let addr = peripheral.identifier.uuidString
        peripherals[addr] = peripheral
        // Keyingi paketda ism kelsa — yangilaymiz (Android dagi kabi)
        if let n = peripheral.name, !n.isEmpty {
            peripheralNames[addr] = n
        } else if let local = advertisementData[CBAdvertisementDataLocalNameKey] as? String,
                  !local.isEmpty {
            peripheralNames[addr] = local
        }
        let displayName = peripheral.name ?? peripheralNames[addr] ?? addr
        delegate?.bleDidFind(name: displayName, address: addr, rssi: RSSI.intValue)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices(nil)
    }

    func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        delegate?.bleDidError(error?.localizedDescription ?? Tf("bt_device_not_found", peripheral.identifier.uuidString))
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        if connected?.identifier == peripheral.identifier {
            connected = nil
            measureChar = nil
            delegate?.bleDidDisconnect()
        }
    }
}

// MARK: - CBPeripheralDelegate

extension BleManager: CBPeripheralDelegate {

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let services = peripheral.services, !services.isEmpty else {
            delegate?.bleDidError(T("bt_services_not_found"))
            return
        }
        for s in services {
            peripheral.discoverCharacteristics(nil, for: s)
        }
        // GAP Device Name (0x1800/0x2A00) — ulangan nom uchun
        if let gap = services.first(where: { $0.uuid == CBUUID(string: "1800") }) {
            peripheral.discoverCharacteristics([CBUUID(string: "2A00")], for: gap)
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        guard let chars = service.characteristics else { return }
        let wanted = driver(for: peripheral)?.characteristicUUID
        for ch in chars {
            if ch.uuid == CBUUID(string: "2A00") {
                nameChar = ch
                peripheral.readValue(for: ch)
                continue
            }
            if wanted == nil || ch.uuid == wanted {
                if measureChar == nil {
                    measureChar = ch
                    if ch.properties.contains(.notify) || ch.properties.contains(.indicate) {
                        peripheral.setNotifyValue(true, for: ch)
                    }
                    let nm = peripheralNames[peripheral.identifier.uuidString]
                        ?? peripheral.name ?? T("bt_default_device")
                    delegate?.bleDidConnect(name: nm)
                }
            }
        }
        if measureChar == nil && service.uuid != CBUUID(string: "1800") {
            // boshqa servislarda ham qidiramiz — hamma servis topilgach xulosa
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard let data = characteristic.value, !data.isEmpty else { return }
        if characteristic.uuid == CBUUID(string: "2A00"),
           let n = String(data: data, encoding: .utf8), !n.isEmpty {
            peripheralNames[peripheral.identifier.uuidString] = n
            return
        }
        if let mm = parseMeasurement(data) {
            delegate?.bleDidMeasure(mm: mm)
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didWriteValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        if error != nil {
            delegate?.bleDidError(T("ble_read_error"))
        }
    }
}
