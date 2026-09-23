"""client_erp/payments/base.py — Universal to'lov abstraksiyasi (SANDBOX-first).

XAVFSIZLIK (eng muhim qoida)
============================
`BILLING_LIVE` standart **False**. False bo'lganda HECH QANDAY real provayder
API chaqirilmaydi — hamma to'lov `SandboxProvider` orqali ketadi (real pul
harakati YO'Q). Real provayder API faqat `BILLING_LIVE=True` VA o'sha
provayderning kalitlari sozlangan (`is_configured()`) bo'lsagina ishga tushadi.

Bu modul:
  - `billing_live()`     — rejim bayrog'i (False = sandbox)
  - `PaymentProvider`    — abstrakt interfeys (har provayder meros oladi)
  - `PROVIDERS` registry — {slug: instance}
  - `get_provider(slug)` — instance qaytaradi (topilmasa Sandbox — xavfsiz)
  - `read_post(...)`      — Django/DRF/dict so'rovdan POST qiymatini o'qish helperi
"""
from django.conf import settings


def billing_live():
    """Real to'lov rejimi yoqilganmi? STANDART False = SANDBOX (real pul yo'q)."""
    return bool(getattr(settings, 'BILLING_LIVE', False))


class PaymentProvider:
    """Abstrakt to'lov provayder interfeysi.

    Har bir konkret provayder (Payme/Click/Octobank/Multicard/Sandbox) shu
    sinfdan meros oladi va uch metodni bajaradi.
    """

    #: registryda ishlatiladigan qisqa kalit (masalan 'payme')
    slug = 'base'

    def is_configured(self):
        """Provayder env kalitlari to'liq sozlanganmi? -> bool."""
        raise NotImplementedError

    def create_invoice(self, payment):
        """Provayder tomonida checkout/invoice yaratadi.

        Kirish : `payment` — ClientPayment (id, amount, user, purpose ...).
        Qaytish: {'checkout_url': str, 'external_id': str}
        """
        raise NotImplementedError

    def handle_callback(self, request):
        """Provayder webhook (callback) so'rovini parse qiladi.

        Qaytish: {
            'payment_external_id': str,          # bizning ClientPayment.external_id
            'status': 'paid' | 'failed' | 'pending',
            'raw': dict,                         # xom ma'lumot (audit uchun)
        }
        """
        raise NotImplementedError


# ═══════════════════════════════════════════════════════════════════
#  REGISTRY
# ═══════════════════════════════════════════════════════════════════
# slug -> PaymentProvider instance. Provayder modullari import bo'lganda
# o'zini `register()` orqali shu yerga qo'shadi.
PROVIDERS = {}


def register(instance):
    """Provayder instance'ni registryga qo'shadi (import yon effekti sifatida)."""
    PROVIDERS[instance.slug] = instance
    return instance


def _ensure_loaded():
    """Registry bo'sh bo'lsa provayder modullarini yuklaydi (lazy, circular-safe)."""
    if not PROVIDERS:
        # Modul-yuklash yon effekti sifatida har bir provayder register() chaqiradi.
        from . import providers  # noqa: F401


def get_provider(slug):
    """slug bo'yicha provayder instance qaytaradi.

    Topilmasa YOKI slug bo'sh bo'lsa — SandboxProvider (XAVFSIZ default:
    real pul harakati yo'q).
    """
    _ensure_loaded()
    inst = PROVIDERS.get((slug or '').strip().lower())
    if inst is not None:
        return inst
    return PROVIDERS.get('sandbox')


# ═══════════════════════════════════════════════════════════════════
#  So'rovdan POST qiymatini o'qish (Django HttpRequest / DRF / dict)
# ═══════════════════════════════════════════════════════════════════

def read_post(request, key, default=''):
    """`request` (Django HttpRequest, DRF Request yoki dict) dan POST qiymati.

    Provayder webhooklari turli formatda kelishi mumkin — bu helper barchasidan
    xavfsiz o'qiydi, hech qachon exception ko'tarmaydi.
    """
    if request is None:
        return default
    # DRF: request.data (parsed body), Django: request.POST (form data)
    for attr in ('data', 'POST'):
        container = getattr(request, attr, None)
        if container is None:
            continue
        getter = getattr(container, 'get', None)
        if callable(getter):
            try:
                val = getter(key)
            except Exception:
                val = None
            if val is not None:
                return val
    if isinstance(request, dict):
        return request.get(key, default)
    return default
