"""client_erp/payments/providers/click.py — Click (Click Up) provayder.

XAVFSIZLIK: real API FAQAT `billing_live()` VA `is_configured()` bo'lsagina
chaqiriladi. Aks holda — SandboxProvider ga fallback (real pul yo'q).

Click ikki oqim:
  1) SHOP API (Prepare/Complete) — Click BIZNING endpoint'imizga qo'ng'iroq
     qiladi (webhook). `handle_callback()` parse qiladi (imzo = md5).
  2) Invoice API — biz Click'ga qo'ng'iroq qilib invoice yaratamiz.
     `create_invoice()` shu oqimni ishlatadi + checkout redirect URL beradi.
"""
from django.conf import settings

from ..base import PaymentProvider, register, billing_live, read_post
from .sandbox import SandboxProvider

CLICK_INVOICE_URL = getattr(
    settings, 'CLICK_INVOICE_URL',
    'https://api.click.uz/v2/merchant/invoice/create',
)
# Foydalanuvchini kartani kiritishga yo'naltiradigan checkout sahifasi.
CLICK_PAY_URL = getattr(settings, 'CLICK_PAY_URL', 'https://my.click.uz/services/pay')


def _cfg(name):
    return getattr(settings, name, '') or ''


class ClickProvider(PaymentProvider):
    slug = 'click'

    def is_configured(self):
        return bool(
            _cfg('CLICK_SERVICE_ID')
            and _cfg('CLICK_SECRET')
            and _cfg('CLICK_MERCHANT_ID')
        )

    def _auth_header(self):
        """Click Invoice API `Auth` header'i: '{user_id}:{digest}:{timestamp}'.

        digest = sha1(timestamp + secret_key).
        """
        import time
        import hashlib

        ts = str(int(time.time()))
        secret = _cfg('CLICK_SECRET')
        digest = hashlib.sha1(f'{ts}{secret}'.encode()).hexdigest()
        # TODO: CLICK_MERCHANT_USER_ID — Click kabinetidagi "merchant_user_id".
        user_id = _cfg('CLICK_MERCHANT_USER_ID')
        return f'{user_id}:{digest}:{ts}'

    def create_invoice(self, payment):
        # XAVFSIZLIK: live emas yoki sozlanmagan => sandbox (real pul yo'q).
        if not (billing_live() and self.is_configured()):
            return SandboxProvider().create_invoice(payment)

        import httpx

        service_id = _cfg('CLICK_SERVICE_ID')
        merchant_id = _cfg('CLICK_MERCHANT_ID')
        pid = getattr(payment, 'id', '')
        amount = int(getattr(payment, 'amount_uzs', 0) or 0)  # Click summani UZS da oladi
        user = getattr(payment, 'user', None)
        phone = getattr(user, 'phone', '') if user else ''

        # Invoice API — telefon raqamiga to'lov so'rovi yuboradi.
        # TODO: body maydon nomlari (merchant_trans_id/phone_number) — Click
        #       hujjatiga qarab tasdiqlang.
        body = {
            'service_id': int(service_id) if str(service_id).isdigit() else service_id,
            'amount': amount,
            'phone_number': phone,
            'merchant_trans_id': str(pid),
        }
        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Auth': self._auth_header(),
        }
        resp = httpx.post(CLICK_INVOICE_URL, json=body, headers=headers, timeout=30)
        data = resp.json()
        invoice_id = str(data.get('invoice_id') or '')

        # Foydalanuvchini checkout sahifasiga ham yo'naltirsa bo'ladi (redirect).
        # transaction_param = bizning payment.id (Prepare/Complete da qaytadi).
        checkout_url = (
            f'{CLICK_PAY_URL}?service_id={service_id}'
            f'&merchant_id={merchant_id}&amount={amount}&transaction_param={pid}'
        )
        return {'external_id': invoice_id, 'checkout_url': checkout_url}

    def handle_callback(self, request):
        # Click SHOP API Prepare/Complete POST (form-urlencoded) yuboradi.
        # TODO/XAVFSIZLIK: `sign_string` (md5) ni SHART tekshiring:
        #   md5(click_trans_id + service_id + SECRET + merchant_trans_id +
        #       [merchant_prepare_id] + amount + action + sign_time)
        merchant_trans_id = read_post(request, 'merchant_trans_id')
        action = str(read_post(request, 'action') or '')
        error = str(read_post(request, 'error') or '0')

        # action: 0 = Prepare, 1 = Complete. error < 0 => xato.
        try:
            err_code = int(error)
        except (TypeError, ValueError):
            err_code = 0
        if err_code < 0:
            status = 'failed'
        elif action == '1':
            status = 'paid'
        else:
            status = 'pending'

        return {
            'payment_external_id': str(merchant_trans_id or ''),
            'status': status,
            'raw': {
                'merchant_trans_id': merchant_trans_id,
                'action': action,
                'error': error,
                'click_trans_id': read_post(request, 'click_trans_id'),
            },
        }


register(ClickProvider())
