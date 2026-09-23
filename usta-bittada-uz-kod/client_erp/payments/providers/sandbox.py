"""client_erp/payments/providers/sandbox.py — SandboxProvider.

`BILLING_LIVE=False` bo'lganda (STANDART) HAMMA to'lov shu provayder orqali
ketadi. Real pul harakati YO'Q — foydalanuvchi bizning ichki sandbox-confirm
sahifamizga (`/mini/pay/sandbox/<id>/`) yo'naltiriladi va u yerdan "to'lov"
tasdiqlanadi. Testlash / demo uchun.
"""
from ..base import PaymentProvider, register, read_post


class SandboxProvider(PaymentProvider):
    slug = 'sandbox'

    def is_configured(self):
        # Sandbox hech qanday kalit talab qilmaydi — doim tayyor.
        return True

    def create_invoice(self, payment):
        pid = getattr(payment, 'id', None)
        return {
            'external_id': f'sbx_{pid}',
            'checkout_url': f'/mini/pay/sandbox/{pid}/',
        }

    def handle_callback(self, request):
        # Sandbox-confirm sahifasi POST bilan payment_id + status yuboradi.
        pid = read_post(request, 'payment_id')
        status = (read_post(request, 'status') or 'paid').strip().lower()
        if status not in ('paid', 'failed', 'pending'):
            status = 'paid'
        return {
            'payment_external_id': f'sbx_{pid}' if pid else '',
            'status': status,
            'raw': {'payment_id': pid, 'status': status},
        }


register(SandboxProvider())
