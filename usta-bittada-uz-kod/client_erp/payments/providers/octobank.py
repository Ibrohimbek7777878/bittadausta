"""client_erp/payments/providers/octobank.py — Octobank (OctoPay) provayder.

XAVFSIZLIK: real API FAQAT `billing_live()` VA `is_configured()` bo'lsagina
chaqiriladi. Aks holda — SandboxProvider ga fallback (real pul yo'q).

Octo REST oqim:
  1) prepare_payment — biz Octo'ga qo'ng'iroq qilib to'lov sessiyasini
     yaratamiz, javobda `octo_pay_url` (checkout) va `octo_payment_UUID`.
  2) notify (webhook) — Octo BIZGA to'lov natijasini yuboradi.
     `handle_callback()` parse qiladi.
"""
from django.conf import settings

from ..base import PaymentProvider, register, billing_live, read_post
from .sandbox import SandboxProvider

OCTO_PREPARE_URL = getattr(
    settings, 'OCTO_PREPARE_URL', 'https://secure.octo.uz/prepare_payment'
)
OCTO_RETURN_URL = getattr(settings, 'OCTO_RETURN_URL', '')
OCTO_NOTIFY_URL = getattr(settings, 'OCTO_NOTIFY_URL', '')


def _cfg(name):
    return getattr(settings, name, '') or ''


class OctobankProvider(PaymentProvider):
    slug = 'octobank'

    def is_configured(self):
        return bool(_cfg('OCTO_SHOP_ID') and _cfg('OCTO_SECRET'))

    def create_invoice(self, payment):
        # XAVFSIZLIK: live emas yoki sozlanmagan => sandbox (real pul yo'q).
        if not (billing_live() and self.is_configured()):
            return SandboxProvider().create_invoice(payment)

        import httpx

        pid = getattr(payment, 'id', '')
        amount = int(getattr(payment, 'amount_uzs', 0) or 0)  # Octo summani UZS da oladi

        # TODO: body maydon nomlari (init_time/user_data/currency) — Octo
        #       hujjatiga qarab tasdiqlang. test=not billing_live emas — bu yerga
        #       faqat live'da kelinadi, shu bois test=False.
        body = {
            'octo_shop_id': _int(_cfg('OCTO_SHOP_ID')),
            'octo_secret': _cfg('OCTO_SECRET'),
            'shop_transaction_id': str(pid),
            'auto_capture': True,
            'test': False,
            'total_sum': amount,
            'currency': 'UZS',
            'description': f'Mini ERP payment #{pid}',
            'return_url': OCTO_RETURN_URL,
            'notify_url': OCTO_NOTIFY_URL,
        }
        headers = {'Content-Type': 'application/json'}
        resp = httpx.post(OCTO_PREPARE_URL, json=body, headers=headers, timeout=30)
        data = resp.json()
        payload = data.get('data') or {}
        external_id = str(payload.get('octo_payment_UUID') or '')
        checkout_url = payload.get('octo_pay_url') or ''
        return {'external_id': external_id, 'checkout_url': checkout_url}

    def handle_callback(self, request):
        # Octo notify (webhook) JSON yuboradi.
        # TODO/XAVFSIZLIK: `signature` (octo_secret bilan) ni SHART tekshiring.
        uuid = read_post(request, 'octo_payment_UUID')
        raw_status = str(read_post(request, 'status') or '').strip().lower()

        # Octo statuslari: 'succeeded' | 'failed' | 'created'/'waiting'.
        if raw_status in ('succeeded', 'paid', 'success'):
            status = 'paid'
        elif raw_status in ('failed', 'canceled', 'cancelled', 'error'):
            status = 'failed'
        else:
            status = 'pending'

        return {
            'payment_external_id': str(uuid or ''),
            'status': status,
            'raw': {'octo_payment_UUID': uuid, 'status': raw_status},
        }


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return v


register(OctobankProvider())
