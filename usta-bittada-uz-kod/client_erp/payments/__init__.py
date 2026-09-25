"""client_erp/payments — universal to'lov abstraksiyasi (SANDBOX-first).

Umumiy foydalanish:
    from client_erp.payments import service, get_provider, billing_live
    payment = service.create_payment(user, 'payme', 'coin_topup', pack_id)
    # webhook / sandbox-confirm:
    service.confirm(payment)

XAVFSIZLIK: `billing_live()` standart False — real provayder API chaqirilmaydi,
hamma to'lov SandboxProvider orqali (real pul yo'q). Real rejim faqat
settings.BILLING_LIVE=True + provayder kalitlari bilan yoqiladi.
"""
from .base import (
    PaymentProvider,
    PROVIDERS,
    get_provider,
    register,
    billing_live,
    read_post,
)
from . import providers  # noqa: F401 — provayderlarni registryga yuklaydi
from . import service     # noqa: F401 — biznes-logika

__all__ = [
    'PaymentProvider',
    'PROVIDERS',
    'get_provider',
    'register',
    'billing_live',
    'read_post',
    'providers',
    'service',
]
