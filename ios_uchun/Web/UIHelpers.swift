import UIKit
import WebKit

/// Kichik toast (Android Toast.makeText ekvivalenti).
final class Toast {
    static func show(_ text: String, in view: UIView, long: Bool = false) {
        let label = PaddingLabel()
        label.text = text
        label.textColor = .white
        label.font = .systemFont(ofSize: 13, weight: .medium)
        label.backgroundColor = UIColor.black.withAlphaComponent(0.82)
        label.layer.cornerRadius = 12
        label.clipsToBounds = true
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -40),
        ])
        label.alpha = 0
        UIView.animate(withDuration: 0.25) { label.alpha = 1 }
        DispatchQueue.main.asyncAfter(deadline: .now() + (long ? 3.0 : 1.8)) {
            UIView.animate(withDuration: 0.3, animations: { label.alpha = 0 }) { _ in
                label.removeFromSuperview()
            }
        }
    }
}

private final class PaddingLabel: UILabel {
    override func drawText(in rect: CGRect) {
        super.drawText(in: rect.inset(by: UIEdgeInsets(top: 10, left: 16, bottom: 10, right: 16)))
    }
    override var intrinsicContentSize: CGSize {
        let s = super.intrinsicContentSize
        return CGSize(width: s.width + 32, height: s.height + 20)
    }
}
