import SafariServices
import UIKit
import WebKit

/// Asosiy ekran — Android MainActivity ning iOS ekvivalenti.
/// Web SPA (https://usta.bittada.uz/bigone_cl2/spa/) + native ko'priklar:
/// BLE lazer, ulashish, yuklash, dialoglar, til, to'lov.
final class WebViewController: UIViewController {

    private let baseUrl = "https://usta.bittada.uz/bigone_cl2/spa/"

    private var webView: WKWebView!
    private var splashView: UIView!
    fileprivate var ble: BleManager!

    // BLE UI holati
    fileprivate var bleDevices: [(name: String, address: String, rssi: Int)] = []
    fileprivate var bleConnectingAddr: String?
    private var bleConnectedName: String?
    fileprivate var bleSheet: BleSheetViewController?
    private var bleIndicator: UIButton?
    private var bleIndicatorHidden = false

    private var lang: LangManager { LangManager.shared }
    fileprivate func T(_ key: String) -> String { lang.string(key) }
    fileprivate func Tf(_ key: String, _ args: CVarArg...) -> String {
        String(format: T(key), arguments: args)
    }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.05, green: 0.05, blue: 0.06, alpha: 1.0)

        ble = BleManager()
        ble.delegate = self

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let ucc = config.userContentController
        for name in ["NativeBle", "NativeShare", "NativeDl", "NativeApp", "IOSLang"] {
            ucc.add(self, name: name)
        }
        ucc.addUserScript(WKUserScript(
            source: WebViewController.bridgeJS,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: false
        ))

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .always
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        showSplash()
        observeKeyboard()

        if let url = URL(string: baseUrl) {
            webView.load(URLRequest(url: url))
        }
    }

    // MARK: - Splash

    private func showSplash() {
        let splash = UIView()
        splash.backgroundColor = UIColor(red: 0.05, green: 0.05, blue: 0.06, alpha: 1.0)
        splash.translatesAutoresizingMaskIntoConstraints = false
        let title = UILabel()
        title.text = T("app_name")
        title.textColor = UIColor(red: 0.96, green: 0.96, blue: 0.97, alpha: 1.0)
        title.font = .systemFont(ofSize: 26, weight: .bold)
        let sub = UILabel()
        sub.text = T("splash_subtitle")
        sub.textColor = UIColor(red: 0.61, green: 0.60, blue: 0.64, alpha: 1.0)
        sub.font = .systemFont(ofSize: 13)
        let stack = UIStackView(arrangedSubviews: [title, sub])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 6
        stack.translatesAutoresizingMaskIntoConstraints = false
        splash.addSubview(stack)
        view.addSubview(splash)
        NSLayoutConstraint.activate([
            splash.topAnchor.constraint(equalTo: view.topAnchor),
            splash.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            splash.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            splash.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.centerXAnchor.constraint(equalTo: splash.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: splash.centerYAnchor),
        ])
        splashView = splash
    }

    private func hideSplash() {
        guard let splash = splashView else { return }
        splashView = nil
        UIView.animate(withDuration: 0.4, animations: {
            splash.alpha = 0
        }) { _ in
            splash.removeFromSuperview()
        }
    }

    // MARK: - Keyboard (iOS tizimning o'zi inputni ko'taradi; pastki panellar uchun inset)

    private func observeKeyboard() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardWillShow(_:)),
            name: UIResponder.keyboardWillShowNotification, object: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardWillHide(_:)),
            name: UIResponder.keyboardWillHideNotification, object: nil)
    }

    @objc private func keyboardWillShow(_ n: Notification) {
        guard let f = (n.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue else { return }
        let h = max(0, view.bounds.height - f.origin.y)
        webView.scrollView.contentInset.bottom = h
        webView.scrollView.verticalScrollIndicatorInsets.bottom = h
    }

    @objc private func keyboardWillHide(_ n: Notification) {
        webView.scrollView.contentInset.bottom = 0
        webView.scrollView.verticalScrollIndicatorInsets.bottom = 0
    }

    // MARK: - Bridge xabarlar

    func handleBleMessage(_ m: [String: Any]) {
        switch m["action"] as? String {
        case "showDevices": openBleSheet()
        case "measure": ble.measure()
        default: break
        }
    }

    func handleShareMessage(_ m: [String: Any]) {
        let text = (m["text"] as? String) ?? ""
        let title = (m["title"] as? String) ?? nil
        var items: [Any] = [text]
        if let t = title, !t.isEmpty { items.append(t) }
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        if let pop = sheet.popoverPresentationController {
            pop.sourceView = view
            pop.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
        }
        present(sheet, animated: true)
    }

    func handleDownloadMessage(_ m: [String: Any]) {
        guard let b64 = m["base64"] as? String,
              let data = Data(base64Encoded: b64) else {
            Toast.show(T("download_error"), in: view)
            return
        }
        let name = (m["name"] as? String ?? "fayl").trimmingCharacters(in: .whitespacesAndNewlines)
        saveDownload(data: data, fileName: name.isEmpty ? "fayl" : name)
    }

    func handleAppMessage(_ m: [String: Any]) {
        switch m["action"] as? String {
        case "enterFullscreen":
            UIApplication.shared.isIdleTimerDisabled = true
        case "exitFullscreen":
            UIApplication.shared.isIdleTimerDisabled = false
        case "openExternal":
            if let url = m["url"] as? String { Bridge.openExternal(from: self, urlString: url) }
        default: break
        }
    }

    // MARK: - Yuklash

    private func saveDownload(data: Data, fileName: String) {
        do {
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let dir = docs.appendingPathComponent("Downloads", isDirectory: true)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let dest = uniqueURL(in: dir, name: fileName)
            try data.write(to: dest)
            Toast.show(Tf("download_finished", dest.lastPathComponent), in: view, long: true)
        } catch {
            Toast.show(T("download_error"), in: view)
        }
    }

    private func uniqueURL(in dir: URL, name: String) -> URL {
        var url = dir.appendingPathComponent(name)
        var i = 1
        while FileManager.default.fileExists(atPath: url.path) {
            let base = (name as NSString).deletingPathExtension
            let ext = (name as NSString).pathExtension
            let suffixed = ext.isEmpty ? "\(base) (\(i))" : "\(base) (\(i)).\(ext)"
            url = dir.appendingPathComponent(suffixed)
            i += 1
        }
        return url
    }

    private var lastDownloadName = "fayl"

    private func handleDataUrl(_ s: String) {
        // data:[<mime>][;base64],<data>
        guard let comma = s.firstIndex(of: ",") else {
            Toast.show(T("download_error"), in: view)
            return
        }
        let meta = s[s.index(s.startIndex, offsetBy: 5)..<comma]
        let payload = String(s[s.index(after: comma)...])
        let isBase64 = meta.contains(";base64")
        let data: Data?
        if isBase64 {
            data = Data(base64Encoded: payload)
        } else {
            data = payload.removingPercentEncoding?.data(using: .utf8)
        }
        guard let d = data else {
            Toast.show(T("download_error"), in: view)
            return
        }
        saveDownload(data: d, fileName: "fayl")
    }

    private func fetchBlobToNative(blobUrl: String) {
        let js = """
        (function(){fetch('\(blobUrl)').then(function(r){return r.blob();}).then(function(b){
        var fr=new FileReader();fr.onload=function(){try{
        NativeDl.postMessage({base64:String(fr.result).split(',')[1],name:'fayl',mime:b.type||''});
        }catch(e){}};fr.readAsDataURL(b);}).catch(function(){});})();
        """
        // NativeDl bridge postMessage formatida keladi (JSON emas, to'g'ridan-to'g'ri)
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - BLE UI

    private func openBleSheet() {
        if !ble.isBluetoothOn {
            Toast.show(T("bt_off"), in: view)
            return
        }
        if bleSheet != nil { return }
        bleDevices.removeAll()
        bleConnectingAddr = nil
        let sheet = BleSheetViewController(controller: self)
        bleSheet = sheet
        present(sheet, animated: true)
        ble.startScan()
        sheet.setStatus(T("ble_searching"))
    }

    fileprivate func closeBleSheet() {
        bleSheet?.dismiss(animated: true)
        bleSheet = nil
        ble.stopScan()
    }

    fileprivate func rescanBle() {
        bleDevices.removeAll()
        bleConnectingAddr = nil
        bleSheet?.reload()
        bleSheet?.setStatus(T("ble_searching"))
        ble.startScan()
    }

    fileprivate func connectBle(at index: Int) {
        guard index < bleDevices.count else { return }
        bleConnectingAddr = bleDevices[index].address
        bleSheet?.reload()
        bleSheet?.setStatus(Tf("ble_connecting", bleDevices[index].address))
        ble.connect(address: bleDevices[index].address)
    }

    private func showBleIndicator(named _: String) {
        hideBleIndicator()
        guard !bleIndicatorHidden else { return }
        let btn = UIButton(type: .custom)
        btn.setTitle("📡", for: .normal)
        btn.titleLabel?.font = .systemFont(ofSize: 24)
        btn.backgroundColor = UIColor(red: 0.13, green: 0.13, blue: 0.17, alpha: 0.92)
        btn.layer.cornerRadius = 28
        btn.layer.borderWidth = 1
        btn.layer.borderColor = UIColor(red: 0.23, green: 0.23, blue: 0.28, alpha: 1.0).cgColor
        btn.frame = CGRect(x: view.bounds.width - 76, y: view.bounds.height - 220, width: 56, height: 56)
        btn.addTarget(self, action: #selector(bleIndicatorTapped), for: .touchUpInside)
        let pan = UIPanGestureRecognizer(target: self, action: #selector(bleIndicatorDragged(_:)))
        btn.addGestureRecognizer(pan)
        view.addSubview(btn)
        bleIndicator = btn
    }

    private func hideBleIndicator() {
        bleIndicator?.removeFromSuperview()
        bleIndicator = nil
    }

    @objc private func bleIndicatorDragged(_ g: UIPanGestureRecognizer) {
        guard let btn = bleIndicator else { return }
        let t = g.translation(in: view)
        btn.center = CGPoint(
            x: min(max(btn.center.x + t.x, 28), view.bounds.width - 28),
            y: min(max(btn.center.y + t.y, 80), view.bounds.height - 80)
        )
        g.setTranslation(.zero, in: view)
    }

    @objc private func bleIndicatorTapped() {
        guard let name = bleConnectedName else { return }
        let menu = UIAlertController(title: "📡 \(name)", message: nil, preferredStyle: .actionSheet)
        menu.addAction(UIAlertAction(title: T("ble_menu_measure"), style: .default) { _ in
            self.ble.measure()
        })
        menu.addAction(UIAlertAction(title: T("ble_menu_disconnect"), style: .destructive) { _ in
            self.ble.disconnect()
        })
        menu.addAction(UIAlertAction(title: T("ble_menu_hide"), style: .default) { _ in
            self.bleIndicatorHidden = true
            self.hideBleIndicator()
            Toast.show(self.T("bt_icon_hidden"), in: self.view)
        })
        menu.addAction(UIAlertAction(title: T("ble_close").capitalized, style: .cancel))
        if let pop = menu.popoverPresentationController, let btn = bleIndicator {
            pop.sourceView = btn
            pop.sourceRect = btn.bounds
        }
        present(menu, animated: true)
    }

    // MARK: - Bridge JS (Android dagi injection bilan bir xil mantiq)

    static let bridgeJS = """
    (function() {
        if (typeof BLE !== 'undefined') {
            try {
                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.NativeBle) {
                    BLE.openBridge = function() { NativeBle.postMessage({action:'showDevices'}); };
                    BLE.connect = function() { NativeBle.postMessage({action:'showDevices'}); };
                    BLE.connectSmart = function() { NativeBle.postMessage({action:'showDevices'}); };
                    BLE.measure = function() { NativeBle.postMessage({action:'measure'}); };
                }
            } catch(e) {}
        }
        if (window.__nvHooks) return;
        window.__nvHooks = true;

        // navigator.share polyfill
        try {
            if (!navigator.share && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.NativeShare) {
                navigator.share = function(d) {
                    NativeShare.postMessage({text: (d.url || d.text || ''), title: (d.title || '')});
                    return Promise.resolve();
                };
            }
        } catch(e) {}

        // Fullscreen polyfill (video/galereya)
        try {
            var proto = Element.prototype;
            if (proto && !proto.__nvFsWrapped && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.NativeApp) {
                proto.__nvFsWrapped = true;
                var _req = proto.requestFullscreen;
                proto.requestFullscreen = function() {
                    try {
                        if (window.__fsPoly) return Promise.resolve();
                        window.__fsPoly = true;
                        NativeApp.postMessage({action:'enterFullscreen'});
                        var x = document.createElement('button');
                        x.id = 'nv-fs-close';
                        x.textContent = '✕';
                        x.style.cssText = 'position:fixed;top:14px;right:14px;z-index:100001;' +
                            'width:42px;height:42px;border-radius:50%;border:none;' +
                            'background:rgba(0,0,0,.55);color:#fff;font-size:18px;';
                        x.onclick = function() { document.exitFullscreen(); };
                        document.body.appendChild(x);
                        return Promise.resolve();
                    } catch(e) {}
                    return Promise.reject(new Error('fs'));
                };
                document.exitFullscreen = function() {
                    try {
                        window.__fsPoly = false;
                        var x = document.getElementById('nv-fs-close');
                        if (x) x.remove();
                        if (typeof NativeApp !== 'undefined') NativeApp.postMessage({action:'exitFullscreen'});
                    } catch(e) {}
                    return Promise.resolve();
                };
            }
        } catch(e) {}

        // Til o'zgarganda iOS ga xabar
        try {
            if (typeof I18n !== 'undefined' && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.IOSLang) {
                var _origSet = I18n.set;
                I18n.set = function(code) {
                    _origSet.call(I18n, code);
                    try { IOSLang.postMessage({lang: code}); } catch(e) {}
                };
                try { IOSLang.postMessage({lang: I18n.lang()}); } catch(e) {}
            }
        } catch(e) {}

        // To'lov checkout — tashqi brauzerda (SPA tirik qoladi, poll ishlaydi)
        try {
            if (!window.__nvPayWrapped && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.NativeApp) {
                window.__nvPayWrapped = true;
                var _wopen = window.open;
                window.open = function(u, t) {
                    try {
                        var s = String(u || '');
                        if (/paycom|checkout|click\\.uz|octobank|multicard|payze|stripe|paypal/i.test(s)) {
                            NativeApp.postMessage({action:'openExternal', url: s});
                            return { closed:false, close:function(){}, focus:function(){}, blur:function(){} };
                        }
                    } catch(e2) {}
                    return _wopen.apply(window, arguments);
                };
            }
        } catch(e) {}

        // Input fokusda markazga
        document.addEventListener('focusin', function(e) {
            var t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
                setTimeout(function(){ try { t.scrollIntoView({block:'center'}); } catch(x){} }, 150);
            }
        }, true);
    })();
    """
}

// MARK: - WKScriptMessageHandler

extension WebViewController: WKScriptMessageHandler {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        Bridge.handle(controller: self, name: message.name, body: message.body)
    }
}

// MARK: - WKNavigationDelegate

extension WebViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Sahifa ichidagi o'tishlarda hookni qayta o'rnatish (Android onPageFinished kabi)
        webView.evaluateJavaScript(WebViewController.bridgeJS, completionHandler: nil)
        // Drayverlarni BLE ga uzatish
        webView.evaluateJavaScript(
            "(function(){try{return JSON.stringify((typeof BLE!=='undefined'&&BLE._drivers)||[]);}catch(e){return '[]';}})();"
        ) { [weak self] result, _ in
            if let json = result as? String { self?.ble.setDrivers(json: json) }
        }
        // Splash ni yopish
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            self?.hideSplash()
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let s = url.absoluteString

        // tel/sms/mailto — tizimga uzatish
        if ["tel", "sms", "smsto", "mailto"].contains(url.scheme ?? "") {
            UIApplication.shared.open(url, options: [:])
            decisionHandler(.cancel)
            return
        }
        // Telegram — ilova bo'lsa ilova, bo'lmasa brauzer
        if url.scheme == "tg" || url.host == "t.me" {
            Bridge.openTelegram(from: self, urlString: s)
            decisionHandler(.cancel)
            return
        }
        // blob:/data: fayllar — JS fetch orqali native ga (Android dagi kabi)
        if url.scheme == "blob" {
            fetchBlobToNative(blobUrl: s)
            decisionHandler(.cancel)
            return
        }
        if url.scheme == "data" {
            handleDataUrl(s)
            decisionHandler(.cancel)
            return
        }
        // Bizning sayt — WebView ichida
        if s.contains("usta.bittada.uz") {
            decisionHandler(.allow)
            return
        }
        // Boshqa http(s) — ilova ichidagi brauzerda
        if url.scheme == "http" || url.scheme == "https" {
            Bridge.openExternal(from: self, urlString: s)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if navigationResponse.canShowMIMEType {
            decisionHandler(.allow)
        } else {
            decisionHandler(.download)
        }
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    // blob:/data: URL lar — JS fetch orqali native ga (Android dagi kabi)
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        let url = (error as NSError).userInfo[NSURLErrorFailingURLErrorKey] as? URL
        if let u = url, u.scheme == "blob" {
            fetchBlobToNative(blobUrl: u.absoluteString)
        }
    }
}

// MARK: - WKDownloadDelegate

extension WebViewController: WKDownloadDelegate {

    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String
    ) async -> URL? {
        do {
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let dir = docs.appendingPathComponent("Downloads", isDirectory: true)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let dest = uniqueURL(in: dir, name: suggestedFilename)
            lastDownloadName = dest.lastPathComponent
            Toast.show(T("download_started"), in: view)
            return dest
        } catch {
            return nil
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        Toast.show(Tf("download_finished", lastDownloadName), in: view, long: true)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        Toast.show(T("download_error"), in: view)
    }
}

// MARK: - WKUIDelegate (JS dialoglar, popup)

extension WebViewController: WKUIDelegate {

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: T("js_confirm_yes"), style: .default) { _ in completionHandler(true) })
        a.addAction(UIAlertAction(title: T("js_confirm_no"), style: .cancel) { _ in completionHandler(false) })
        present(a, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText }
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(a.textFields?.first?.text)
        })
        a.addAction(UIAlertAction(title: T("js_prompt_cancel"), style: .cancel) { _ in
            completionHandler(nil)
        })
        present(a, animated: true)
    }

    // window.open / target=_blank — brauzerda (Android onCreateWindow kabi)
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            let s = url.absoluteString
            if url.host == "t.me" || url.scheme == "tg" {
                Bridge.openTelegram(from: self, urlString: s)
            } else if url.scheme == "http" || url.scheme == "https" {
                Bridge.openExternal(from: self, urlString: s)
            }
        }
        return nil
    }
}

// MARK: - BleManagerDelegate

extension WebViewController: BleManagerDelegate {

    func bleDidFind(name: String, address: String, rssi: Int) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if let i = self.bleDevices.firstIndex(where: { $0.address == address }) {
                // Keyin kelgan ismni qabul qilish (nomsiz → nomli)
                var d = self.bleDevices[i]
                if d.name == d.address && name != address { d.name = name }
                d.rssi = rssi
                self.bleDevices[i] = d
            } else {
                self.bleDevices.append((name: name, address: address, rssi: rssi))
            }
            self.bleSheet?.reload()
        }
    }

    func bleDidConnect(name: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.bleConnectedName = name
            self.bleConnectingAddr = nil
            self.closeBleSheet()
            Toast.show(self.Tf("bt_device_connected", name), in: self.view)
            self.showBleIndicator(named: name)
        }
    }

    func bleDidDisconnect() {
        DispatchQueue.main.async { [weak self] in
            self?.bleConnectedName = nil
            self?.hideBleIndicator()
            self?.bleSheet?.reload()
        }
    }

    func bleDidMeasure(mm: Int) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            // Sahifaga o'lchovni uzatish (BLE.measure callback konvensiyasi)
            let js = "(function(){try{if(typeof BLE!=='undefined'&&BLE._onMeasure)BLE._onMeasure(\(mm));}catch(e){}})();"
            self.webView.evaluateJavaScript(js, completionHandler: nil)
            Toast.show("\(mm) mm", in: self.view)
        }
    }

    func bleDidError(_ message: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.bleConnectingAddr = nil
            self.bleSheet?.setStatus(message)
            self.bleSheet?.reload()
            Toast.show(message, in: self.view)
        }
    }

    func bleScanFinished() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let n = self.bleDevices.count
            if n > 0 {
                self.bleSheet?.setStatus(self.Tf("ble_devices_found", n))
            } else {
                self.bleSheet?.setStatus(self.T("ble_not_found"))
            }
            self.bleSheet?.reload()
        }
    }
}

// MARK: - BLE qurilmalar ro'yxati (bottom-sheet uslubida)

final class BleSheetViewController: UIViewController {

    private weak var controller: WebViewController?
    private let statusLabel = UILabel()
    private let table = UITableView()

    init(controller: WebViewController) {
        self.controller = controller
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .pageSheet
        if let sheet = sheetPresentationController {
            sheet.detents = [.medium(), .large()]
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let title = UILabel()
        title.text = controller?.T("ble_title")
        title.font = .systemFont(ofSize: 18, weight: .bold)
        title.translatesAutoresizingMaskIntoConstraints = false

        statusLabel.textColor = .secondaryLabel
        statusLabel.font = .systemFont(ofSize: 13)
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        let rescan = UIButton(type: .system)
        rescan.setTitle(controller?.T("ble_retry"), for: .normal)
        rescan.titleLabel?.font = .systemFont(ofSize: 13, weight: .bold)
        rescan.addTarget(self, action: #selector(rescanTapped), for: .touchUpInside)
        rescan.translatesAutoresizingMaskIntoConstraints = false

        let close = UIButton(type: .system)
        close.setTitle(controller?.T("ble_close"), for: .normal)
        close.titleLabel?.font = .systemFont(ofSize: 14, weight: .bold)
        close.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        close.translatesAutoresizingMaskIntoConstraints = false

        let header = UIStackView(arrangedSubviews: [title, rescan])
        header.axis = .horizontal
        header.distribution = .equalSpacing
        header.translatesAutoresizingMaskIntoConstraints = false

        presentationController?.delegate = self
        table.delegate = self
        table.dataSource = self
        table.register(UITableViewCell.self, forCellReuseIdentifier: "dev")
        table.translatesAutoresizingMaskIntoConstraints = false

        let stack = UIStackView(arrangedSubviews: [header, statusLabel, table, close])
        stack.axis = .vertical
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
        ])
    }

    @objc private func rescanTapped() { controller?.rescanBle() }
    @objc private func closeTapped() { controller?.closeBleSheet() }

    func setStatus(_ text: String) { statusLabel.text = text }
    func reload() { table.reloadData() }

    deinit { controller?.bleSheet = nil }
}

extension BleSheetViewController: UITableViewDelegate, UITableViewDataSource, UIAdaptivePresentationControllerDelegate {

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        controller?.bleSheet = nil
        controller?.ble.stopScan()
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        controller?.bleDevices.count ?? 0
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "dev", for: indexPath)
        guard let c = controller, indexPath.row < c.bleDevices.count else { return cell }
        let d = c.bleDevices[indexPath.row]
        let noName = (d.name == d.address)
        var cfg = cell.defaultContentConfiguration()
        cfg.text = noName ? c.T("ble_unnamed_device") : d.name
        cfg.secondaryText = c.Tf("ble_device_rssi", d.address, d.rssi)
        cell.contentConfiguration = cfg
        if c.bleConnectingAddr == d.address {
            let sp = UIActivityIndicatorView(style: .medium)
            sp.startAnimating()
            cell.accessoryView = sp
        } else {
            cell.accessoryView = nil
            cell.accessoryType = .disclosureIndicator
        }
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        controller?.connectBle(at: indexPath.row)
    }
}
