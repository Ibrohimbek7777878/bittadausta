import SafariServices
import UIKit
import WebKit

/// JS → Native xabar marshrutlari.
/// Android dagi addJavascriptInterface nomlari bilan BIR XIL:
/// NativeBle / NativeShare / NativeDl / NativeApp / IOSLang(AndroidLang)
enum Bridge {

    static func handle(controller: WebViewController, name: String, body: Any) {
        switch name {
        case "NativeBle":
            guard let m = body as? [String: Any] else { return }
            controller.handleBleMessage(m)
        case "NativeShare":
            guard let m = body as? [String: Any] else { return }
            controller.handleShareMessage(m)
        case "NativeDl":
            guard let m = body as? [String: Any] else { return }
            controller.handleDownloadMessage(m)
        case "NativeApp":
            guard let m = body as? [String: Any] else { return }
            controller.handleAppMessage(m)
        case "IOSLang":
            guard let m = body as? [String: Any] else { return }
            if let lang = m["lang"] as? String { LangManager.shared.set(lang) }
        default:
            break
        }
    }

    /// Tashqi URL ni ilova ichidagi brauzerda ochish (Android Custom Tab).
    static func openExternal(from vc: UIViewController, urlString: String) {
        guard let url = URL(string: urlString),
              url.scheme == "http" || url.scheme == "https" else { return }
        let safari = SFSafariViewController(url: url)
        vc.present(safari, animated: true)
    }

    /// Telegram havola: avval Telegram ilova, bo'lmasa brauzer.
    static func openTelegram(from vc: UIViewController, urlString: String) {
        guard let url = URL(string: urlString) else { return }
        if url.host == "t.me",
           let tg = URL(string: "tg://resolve" + url.pathQuery),
           UIApplication.shared.canOpenURL(tg) {
            UIApplication.shared.open(tg)
            return
        }
        openExternal(from: vc, urlString: urlString)
    }
}

private extension URL {
    var pathQuery: String {
        var s = self.path
        if let q = self.query, !q.isEmpty { s += "?" + q }
        // t.me/xxx → tg://resolve?domain=xxx
        let domain = s.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if domain.contains("?") {
            let parts = domain.split(separator: "?", maxSplits: 1).map(String.init)
            return "?domain=" + parts[0] + "&" + (parts.count > 1 ? parts[1] : "")
        }
        return "?domain=" + domain
    }
}
