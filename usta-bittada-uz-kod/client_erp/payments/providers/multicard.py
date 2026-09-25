"""client_erp/payments/providers/multicard.py — Multicard provayder.

XAVFSIZLIK: real API FAQAT `billing_live()` VA `is_configured()` bo'lsagina
chaqiriladi. Aks holda — SandboxProvider ga fallback (real pul yo'q).

Multicard REST oqim:
  1) /auth — application_id + secret => Bearer token.
  2) /payment/invoice — token bilan invoice yaratamiz, javobda `checkout_url`
     va `uuid`.
  3) callback (webhook) — Multicard BIZGA natijani yuboradi.
     `handle_callback()` parse qiladi.
"""
from django.conf import settings

from ..base import PaymentProvider, register, billing_live, read_post
from .sandbox import SandboxProvider

MULTICARD_AUTH_URL = getattr(
    settings, 'MULTICARD_AUTH_URL', 'https://mesh.multicard.uz/auth'
)
MULTICARD_INVOICE_URL = getattr(
    settings, 'MULTICARD_INVOICE_URL', 'https://mesh.multicard.uz/payment/invoice'
)
MULTICARD_RETURN_URL = getattr(settings, 'MULTICARD_RETURN_URL', '')


def _cfg(name):
    return getattr(settings, name, '') or ''


class MulticardProvider(PaymentProvider):
    slug = 'multicard'

    def is_configured(self):
        return bool(_cfg('MULTICARD_APP_ID') and _cfg('MULTICARD_SECRET'))

    def _get_token(self, client):
        """/auth — Bearer token oladi. Xato bo'lsa '' qaytaradi."""
        # TODO: body maydon nomlari (application_id/secret) — Multicard
        #       hujjatiga qarab tasdiqlang.
        body = {
            'application_id': _cfg('MULTICARD_APP_ID'),
            'secret': _cfg('MULTICARD_SECRET'),
        }
        resp = client.post(MULTICARD_AUTH_URL, json=body, timeout=30)
        data = resp.json()
        return (data.get('data') or {}).get('token') or ''

    def create_invoice(self, payment):
        # XAVFSIZLIK: live emas yoki sozlanmagan => sandbox (real pul yo'q).
        if not (billing_live() and self.is_configured()):
            return SandboxProvider().create_invoice(payment)

        import httpx

        pid = getattr(payment, 'id', '')
        amount_tiyin = int(getattr(payment, 'amount_uzs', 0) or 0) * 100  # UZS -> tiyin

        with httpx.Client() as client:
            token = self._get_token(client)
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
            }
            # TODO: body maydon nomlari (store_id/invoice_id/amount) — Multicard
            #       hujjatiga qarab tasdiqlang. store_id .env da bo'lishi mumkin.
            body = {
                'store_id': _cfg('MULTICARD_STORE_ID'),
                'amount': amount_tiyin,
                'invoice_id': str(pid),
                'return_url': MULTICARD_RETURN_URL,
                'short_link': True,
            }
            resp = client.post(MULTICARD_INVOICE_URL, json=body, headers=headers, timeout=30)
            data = resp.json()

        payload = data.get('data') or {}
        external_id = str(payload.get('uuid') or '')
        checkout_url = payload.get('checkout_url') or payload.get('short_link') or ''
        return {'external_id': external_id, 'checkout_url': checkout_url}

    def handle_callback(self, request):
        # Multicard callback (webhook) JSON yuboradi.
        # TODO/XAVFSIZLIK: `sign` (secret bilan) ni SHART tekshiring.
        uuid = read_post(request, 'uuid') or read_post(request, 'invoice_uuid')
        raw_status = str(read_post(request, 'status') or '').strip().lower()

        if raw_status in ('success', 'paid', 'completed'):
            status = 'paid'
        elif raw_status in ('failed', 'canceled', 'cancelled', 'error', 'reversed'):
            status = 'failed'
        else:
            status = 'pending'

        return {
            'payment_external_id': str(uuid or ''),
            'status': status,
            'raw': {'uuid': uuid, 'status': raw_status},
        }


register(MulticardProvider())
