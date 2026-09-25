import Foundation

/// Til boshqaruvchisi — WebView dagi I18n tanlovini native UI ga uzatadi.
/// Android dagi LangManager bilan bir xil mantiq: 'uz' | 'ru' | 'en'.
final class LangManager {

    static let shared = LangManager()

    static let supported = ["uz", "ru", "en"]

    private let prefsKey = "app_lang"

    private(set) var current: String = "uz"

    var onChange: ((String) -> Void)?

    private init() {}

    func restore() {
        let saved = UserDefaults.standard.string(forKey: prefsKey) ?? "uz"
        set(saved, notify: false)
    }

    func set(_ lang: String, notify: Bool = true) {
        let resolved = LangManager.supported.contains(lang) ? lang : "uz"
        guard resolved != current || UserDefaults.standard.string(forKey: prefsKey) == nil else { return }
        current = resolved
        UserDefaults.standard.set(resolved, forKey: prefsKey)
        if notify { onChange?(resolved) }
    }

    /// Berilgan til kontekstida string olish (native dialoglar uchun).
    func string(_ key: String) -> String {
        guard let path = Bundle.main.path(forResource: current, ofType: "lproj"),
              let bundle = Bundle(path: path) else {
            return NSLocalizedString(key, comment: "")
        }
        return NSLocalizedString(key, bundle: bundle, comment: "")
    }
}
