"""client_erp/payments/providers/payme.py — Payme (Paycom) Subscribe/Receipts API.

OQIM (hujjat: developer.help.paycom.uz/metody-subscribe-api):
  «To'lash tugmasi» ssenariysi (webhooksiz, poll asosida):
    1) receipts.create({amount, account})           -> receipt_id
    2) checkout havola: {CHECKOUT_BASE}/{receipt_id} -> foydalanuvchi to'laydi
    3) receipts.check({id})  -> state == 4 bo'lsa TO'LANGAN -> confirm/_fulfill

XAVFSIZLIK / REJIMLAR:
  - `is_configured()` False (kalit yo'q)  -> SandboxProvider (hech qanday tashqi
    API chaqirilmaydi, real pul yo'q).
  - `is_configured()` True + `billing_live()` False  -> TEST endpoint
    (checkout.test.paycom.uz) — REAL API, lekin TEST muhit, PUL YO'Q. Foydalanuvchi
    to'liq oqimni test kartalari bilan sinaydi.
  - `is_configured()` True + `billing_live()` True    -> PROD endpoint
    (checkout.paycom.uz) — real pul. Faqat BILLING_LIVE=1 va prod kalitlar bilan.
  Endpoint'ni `PAYME_RPC_URL` / `PAYME_CHECKOUT_BASE` bilan majburan override
  qilish mumkin.

Auth: Receipts API header  `X-Auth: {merchant_id}:{key}`. Kalit (.env) LOG'ga
tushmaydi, git'ga commit qilinmaydi.
"""
import logging

from django.conf import settings

from ..base import PaymentProvider, register, billing_live, read_post
from .sandbox import SandboxProvider

logger = logging.getLogger('client_erp.payments')

# JSON-RPC endpointlar
TEST_RPC = 'https://checkout.test.paycom.uz/api'
PROD_RPC = 'https://checkout.paycom.uz/api'
# Checkout (foydalanuvchi to'laydigan) sahifa prefiksi
# DIQQAT (2026-07-16): checkout.test.paycom.uz HTTP 500 qaytaradi (eskirgan) —
# Payme TEST checkout'i https://test.paycom.uz da. Tekshirilgan: test → 200.
TEST_CHECKOUT = 'https://test.paycom.uz'
PROD_CHECKOUT = 'https://checkout.paycom.uz'

# Payme chek holati (receipts.check -> state): 4 = TO'LANGAN
STATE_PAID = 4


def _cfg(name, default=''):
    return getattr(settings, name, default) or default


class PaymeProvider(PaymentProvider):
    slug = 'payme'

    # ── konfiguratsiya ─────────────────────────────────────────────
    def is_configured(self):
        return bool(_cfg('PAYME_MERCHANT_ID') and _cfg('PAYME_SECRET_KEY'))

    def _live(self):
        """PROD (real pul) rejimimi? False -> TEST endpoint (pul yo'q)."""
        return billing_live()

    def _rpc_url(self):
        return _cfg('PAYME_RPC_URL') or (PROD_RPC if self._live() else TEST_RPC)

    def _checkout_base(self):
        return _cfg('PAYME_CHECKOUT_BASE') or (PROD_CHECKOUT if self._live() else TEST_CHECKOUT)

    def _headers(self):
        return {
            'X-Auth': f"{_cfg('PAYME_MERCHANT_ID')}:{_cfg('PAYME_SECRET_KEY')}",
            'Content-Type': 'application/json',
        }

    def _account_field(self):
        # Kassa sozlamalaridagi "Hisob"(account) maydon nomi. Standart 'order_id'.
        return _cfg('PAYME_ACCOUNT_FIELD', 'order_id') or 'order_id'

    # ── JSON-RPC chaqiruv ──────────────────────────────────────────
    def _call(self, method, params, rpc_id=1):
        """Qaytaradi (result, error). Ulanish/JSON-RPC xatosida (None, error_dict)."""
        import requests
        body = {'id': rpc_id, 'method': method, 'params': params}
        try:
            resp = requests.post(self._rpc_url(), json=body, headers=self._headers(), timeout=25)
            data = resp.json()
        except Exception as e:  # ulanish / JSON parse xatosi — CRASH YO'Q
            logger.warning('payme %s ulanish xatosi: %s', method, str(e)[:150])
            return None, {'connect': str(e)[:200]}
        if isinstance(data, dict) and data.get('error'):
            logger.warning('payme %s RPC xato: %s', method, data.get('error'))
            return None, data.get('error')
        result = data.get('result') if isinstance(data, dict) else None
        return (result or {}), None

    # ── 1) receipts.create -> checkout havola ──────────────────────
    def create_invoice(self, payment):
        """MERCHANT KASSA checkout havolasi (base64 GET) — tashqi API chaqirilmaydi.

        Format: {checkout_base}/base64("m=<kassa_id>;ac.order_id=<payment_id>;a=<tiyin>;l=uz;c=<return>")
        Foydalanuvchi to'lagach Payme BIZGA callback qiladi
        (/api/payments/payme/ → PerformTransaction) → tanga/tarif yetkaziladi.

        BILLING_LIVE=0 → checkout.test.paycom.uz (TEST, pul yo'q)
        BILLING_LIVE=1 → checkout.paycom.uz (REAL pul)
        """
        # Sozlanmagan bo'lsa — sandbox (hech qanday tashqi havola yo'q).
        if not self.is_configured():
            return SandboxProvider().create_invoice(payment)

        import base64 as _b64
        amount_tiyin = int(getattr(payment, 'amount_uzs', 0) or 0) * 100  # UZS -> tiyin
        pid = getattr(payment, 'id', '')
        parts = [
            'm=' + _cfg('PAYME_MERCHANT_ID'),
            f'ac.{self._account_field()}={pid}',
            f'a={amount_tiyin}',
            'l=uz',
        ]
        ret = _cfg('PAYME_RETURN_URL', 'https://usta.bittada.uz/')
        if ret:
            parts.append('c=' + ret)
        raw = ';'.join(parts)
        token = _b64.b64encode(raw.encode()).decode()
        checkout_url = f'{self._checkout_base()}/{token}'
        # external_id — Payme tranzaksiya id'si callback'да keladi (hozir bo'sh).
        return {'external_id': '', 'checkout_url': checkout_url,
                'raw': {'checkout_params': raw}}

    # ── 3) receipts.check -> to'lov holati ─────────────────────────
    def check_receipt(self, receipt_id):
        """Qaytaradi {'paid': bool, 'state': int|None, 'raw': dict}."""
        if not (self.is_configured() and receipt_id):
            return {'paid': False, 'state': None, 'raw': {}}
        result, err = self._call('receipts.check', {'id': receipt_id})
        if err is not None:
            return {'paid': False, 'state': None, 'raw': {'error': err}}
        state = (result or {}).get('state')
        return {'paid': (state == STATE_PAID), 'state': state, 'raw': result}

    # ── (ixtiyoriy) receipts.get — to'liq chek ─────────────────────
    def get_receipt(self, receipt_id):
        if not (self.is_configured() and receipt_id):
            return {}
        result, err = self._call('receipts.get', {'id': receipt_id})
        return {} if err is not None else (result or {})

    # ── (ixtiyoriy) receipts.cancel — chekni bekor qilish ──────────
    def cancel_receipt(self, receipt_id):
        if not (self.is_configured() and receipt_id):
            return {'ok': False, 'reason': 'not_configured'}
        result, err = self._call('receipts.cancel', {'id': receipt_id})
        return {'ok': err is None, 'raw': (result if err is None else {'error': err})}

    # ── (ixtiyoriy) saqlangan karta token bilan to'lash ────────────
    def pay_receipt(self, receipt_id, token):
        """receipts.pay — chekni saqlangan karta token bilan to'laydi (checkoutsiz).

        F3'da checkout oqimi ishlatiladi; bu recurring/Subscribe kelajagi uchun.
        """
        if not self.is_configured():
            return {'ok': False, 'reason': 'not_configured'}
        result, err = self._call('receipts.pay', {'id': receipt_id, 'token': token})
        return {'ok': err is None, 'raw': (result if err is None else {'error': err})}

    # ── (ixtiyoriy) Merchant API webhook — bu oqimda ishlatilmaydi ──
    def handle_callback(self, request):
        method = read_post(request, 'method')
        params = read_post(request, 'params') or {}
        if not isinstance(params, dict):
            params = {}
        account = params.get('account') or {}
        payment_external_id = str(account.get(self._account_field()) or params.get('id') or '')
        status = 'pending'
        if method == 'PerformTransaction':
            status = 'paid'
        elif method == 'CancelTransaction':
            status = 'failed'
        return {'payment_external_id': payment_external_id, 'status': status,
                'raw': {'method': method, 'params': params}}


register(PaymeProvider())
