"""client_erp/payments/payme_merchant.py — Payme Merchant API callback (kassa).

Payme BIZGA JSON-RPC 2.0 so'rov yuboradi (usta.bittada.uz/api/payments/payme/).
6 metod: CheckPerformTransaction, CreateTransaction, PerformTransaction,
CancelTransaction, CheckTransaction, GetStatement.

- account maydoni: `order_id` = ClientPayment.id
- Summa: tiyinда (ClientPayment.amount_uzs × 100)
- Auth: Basic base64("Paycom:<KASSA_KEY>")  (KASSA_KEY = PAYME_MERCHANT_KEY yoki PAYME_SECRET_KEY)
- Idempotent + row-lock (select_for_update) — poyga (race) yo'q.

PerformTransaction muvaffaqiyatли → service.confirm(payment) (tanga/tarif yetkaziladi).
"""
import base64
import json
import logging
import time

from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

logger = logging.getLogger('client_erp.payme_merchant')

# ── Payme xato kodlari ───────────────────────────────────────────────────────
ERR_PARSE          = -32700
ERR_REQUEST        = -32600
ERR_METHOD         = -32601
ERR_AUTH           = -32504
ERR_AMOUNT         = -31001
ERR_TXN_NOT_FOUND  = -31003
ERR_CANNOT_PERFORM = -31008
ERR_ORDER_NOT_FOUND = -31050   # account xatolari: -31050..-31099
ERR_ORDER_UNPAYABLE = -31051

# Payme cancel reason: 4 = timeout
REASON_TIMEOUT = 4

# Tranzaksiya timeout — 12 soat (ms)
TXN_TIMEOUT_MS = int(getattr(settings, 'PAYME_TXN_TIMEOUT_MS', 43_200_000))


def _now_ms():
    return int(time.time() * 1000)


def _kassa_keys():
    """Ruxsat berilgan kassa kalitlari (test + prod ikkalasi ham qabul qilinadi)."""
    keys = []
    for name in ('PAYME_MERCHANT_KEY', 'PAYME_SECRET_KEY', 'PAYME_KEY', 'PAYME_KEY_TEST'):
        v = (getattr(settings, name, '') or '').strip()
        if v:
            keys.append(v)
    return keys


def _account_field():
    return (getattr(settings, 'PAYME_ACCOUNT_FIELD', 'order_id') or 'order_id').strip()


class PaymeError(Exception):
    """JSON-RPC Payme xatosi (message uch tilli)."""
    def __init__(self, code, uz, ru='', en='', data=None):
        self.code = code
        self.message = {'uz': uz, 'ru': ru or uz, 'en': en or uz}
        self.data = data
        super().__init__(uz)


def _err(rpc_id, e: 'PaymeError'):
    body = {'jsonrpc': '2.0', 'id': rpc_id,
            'error': {'code': e.code, 'message': e.message}}
    if e.data is not None:
        body['error']['data'] = e.data
    return JsonResponse(body)


def _ok(rpc_id, result):
    return JsonResponse({'jsonrpc': '2.0', 'id': rpc_id, 'result': result})


def _check_auth(request):
    auth = request.META.get('HTTP_AUTHORIZATION', '') or ''
    if not auth.startswith('Basic '):
        raise PaymeError(ERR_AUTH, "Ruxsat yetarli emas", "Недостаточно привилегий", "Insufficient privileges")
    try:
        raw = base64.b64decode(auth[6:]).decode('utf-8', 'replace')
        login, _, password = raw.partition(':')
    except Exception:
        raise PaymeError(ERR_AUTH, "Ruxsat yetarli emas", "Недостаточно привилегий", "Insufficient privileges")
    keys = _kassa_keys()
    if login != 'Paycom' or not keys or password not in keys:
        raise PaymeError(ERR_AUTH, "Ruxsat yetarli emas", "Недостаточно привилегий", "Insufficient privileges")


def _get_order(params):
    """account.order_id → ClientPayment. Topilmasa PaymeError."""
    from client_erp.models import ClientPayment
    account = params.get('account') or {}
    field = _account_field()
    raw_id = account.get(field)
    try:
        oid = int(raw_id)
    except (TypeError, ValueError):
        raise PaymeError(ERR_ORDER_NOT_FOUND, "Buyurtma topilmadi", "Заказ не найден", "Order not found", data=field)
    p = ClientPayment.objects.filter(pk=oid).first()
    if not p:
        raise PaymeError(ERR_ORDER_NOT_FOUND, "Buyurtma topilmadi", "Заказ не найден", "Order not found", data=field)
    return p


def _order_payable(p):
    return p.status in ('created', 'pending') and not p.fulfilled


def _check_amount(p, params):
    expected = int(p.amount_uzs) * 100
    if int(params.get('amount') or 0) != expected:
        raise PaymeError(ERR_AMOUNT, "Noto'g'ri summa", "Неверная сумма", "Incorrect amount")


def _txn_dict(t):
    from client_erp.models import PaymeMerchantTxn
    return {
        'create_time': t.create_time,
        'perform_time': t.perform_time,
        'cancel_time': t.cancel_time,
        'transaction': str(t.pk),
        'state': t.state,
        'reason': t.reason,
    }


# ── 6 METOD ──────────────────────────────────────────────────────────────────

def m_check_perform(params):
    p = _get_order(params)
    _check_amount(p, params)
    if not _order_payable(p):
        raise PaymeError(ERR_ORDER_UNPAYABLE, "Buyurtma to'lanmaydi", "Заказ не может быть оплачен", "Order not payable", data=_account_field())
    return {'allow': True}


def m_create(params, db):
    from client_erp.models import PaymeMerchantTxn
    payme_id = params.get('id')
    p = _get_order(params)
    _check_amount(p, params)

    with transaction.atomic(using=db):
        # Idempotent: shu payme_id bilan mavjudmi?
        existing = PaymeMerchantTxn.objects.using(db).select_for_update().filter(payme_id=payme_id).first()
        if existing:
            if existing.state == PaymeMerchantTxn.STATE_CREATED:
                return {'create_time': existing.create_time, 'transaction': str(existing.pk),
                        'state': PaymeMerchantTxn.STATE_CREATED}
            raise PaymeError(ERR_CANNOT_PERFORM, "Bu holatda bajarib bo'lmaydi", "Невозможно выполнить операцию", "Cannot perform operation")

        if not _order_payable(p):
            raise PaymeError(ERR_ORDER_UNPAYABLE, "Buyurtma to'lanmaydi", "Заказ не может быть оплачен", "Order not payable", data=_account_field())

        # Bitta orderga bitta aktiv (state 1|2) tranzaksiya
        active = PaymeMerchantTxn.objects.using(db).filter(payment=p, state__in=[1, 2]).exists()
        if active:
            raise PaymeError(ERR_ORDER_UNPAYABLE, "Buyurtma band", "Заказ уже обрабатывается", "Order is busy", data=_account_field())

        create_time = int(params.get('time') or _now_ms())
        t = PaymeMerchantTxn.objects.using(db).create(
            payme_id=payme_id, payment=p, amount_tiyin=int(params.get('amount') or 0),
            state=PaymeMerchantTxn.STATE_CREATED, create_time=create_time,
        )
        if p.status != 'pending':
            p.status = 'pending'
            p.save(using=db, update_fields=['status'])
    return {'create_time': create_time, 'transaction': str(t.pk), 'state': PaymeMerchantTxn.STATE_CREATED}


def m_perform(params, db):
    from client_erp.models import PaymeMerchantTxn
    payme_id = params.get('id')
    with transaction.atomic(using=db):
        t = PaymeMerchantTxn.objects.using(db).select_for_update().filter(payme_id=payme_id).select_related('payment').first()
        if not t:
            raise PaymeError(ERR_TXN_NOT_FOUND, "Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found")
        if t.state == PaymeMerchantTxn.STATE_PERFORMED:
            return {'transaction': str(t.pk), 'perform_time': t.perform_time, 'state': PaymeMerchantTxn.STATE_PERFORMED}
        if t.state != PaymeMerchantTxn.STATE_CREATED:
            raise PaymeError(ERR_CANNOT_PERFORM, "Bu holatda bajarib bo'lmaydi", "Невозможно выполнить операцию", "Cannot perform operation")
        # Timeout tekshiruvi
        if _now_ms() - t.create_time > TXN_TIMEOUT_MS:
            t.state = PaymeMerchantTxn.STATE_CANCELLED_AFTER_CREATE
            t.reason = REASON_TIMEOUT
            t.cancel_time = _now_ms()
            t.save(using=db, update_fields=['state', 'reason', 'cancel_time'])
            raise PaymeError(ERR_CANNOT_PERFORM, "Vaqt tugadi", "Время транзакции истекло", "Transaction timed out")
        perform_time = _now_ms()
        t.state = PaymeMerchantTxn.STATE_PERFORMED
        t.perform_time = perform_time
        t.save(using=db, update_fields=['state', 'perform_time'])
        payment = t.payment
    # TO'LOV BAJARILDI — sotib olingan narsani yetkazamiz (idempotent, atomik ichida emas
    # — confirm o'zi atomic + lock qiladi; xato bo'lsa log, lekin Payme'ga OK qaytadi
    # chунki pul kelib bo'ldi — yetkazish keyin qayta urinilishi mumkin).
    try:
        from client_erp.payments import service
        service.confirm(payment, external_id=payme_id, raw={'source': 'payme_merchant'})
    except Exception:
        logger.exception('payme_merchant: fulfill xato payment=%s', getattr(payment, 'pk', None))
    return {'transaction': str(t.pk), 'perform_time': perform_time, 'state': PaymeMerchantTxn.STATE_PERFORMED}


def m_cancel(params, db):
    from client_erp.models import PaymeMerchantTxn
    payme_id = params.get('id')
    reason = params.get('reason')
    with transaction.atomic(using=db):
        t = PaymeMerchantTxn.objects.using(db).select_for_update().filter(payme_id=payme_id).select_related('payment').first()
        if not t:
            raise PaymeError(ERR_TXN_NOT_FOUND, "Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found")
        if t.state in (PaymeMerchantTxn.STATE_CANCELLED_AFTER_CREATE, PaymeMerchantTxn.STATE_CANCELLED_AFTER_PERFORM):
            return {'transaction': str(t.pk), 'cancel_time': t.cancel_time, 'state': t.state}
        cancel_time = _now_ms()
        if t.state == PaymeMerchantTxn.STATE_CREATED:
            t.state = PaymeMerchantTxn.STATE_CANCELLED_AFTER_CREATE
        else:  # PERFORMED
            t.state = PaymeMerchantTxn.STATE_CANCELLED_AFTER_PERFORM
        t.reason = reason
        t.cancel_time = cancel_time
        t.save(using=db, update_fields=['state', 'reason', 'cancel_time'])
        p = t.payment
        p.status = 'cancelled'
        p.save(using=db, update_fields=['status'])
        state = t.state
    # Eslatma: bajarilgan (fulfilled) tanga/tarifni AVTOMATIK qaytarmaymiz — bu qo'lда
    # ko'rib chiqiladi (double-refund/manfiy balans xavfi). Payment 'cancelled' bo'ldi.
    return {'transaction': str(t.pk), 'cancel_time': cancel_time, 'state': state}


def m_check(params, db):
    from client_erp.models import PaymeMerchantTxn
    t = PaymeMerchantTxn.objects.using(db).filter(payme_id=params.get('id')).first()
    if not t:
        raise PaymeError(ERR_TXN_NOT_FOUND, "Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found")
    return _txn_dict(t)


def m_statement(params, db):
    from client_erp.models import PaymeMerchantTxn
    frm = int(params.get('from') or 0)
    to = int(params.get('to') or 0)
    field = _account_field()
    qs = PaymeMerchantTxn.objects.using(db).filter(
        create_time__gte=frm, create_time__lte=to,
    ).select_related('payment').order_by('create_time')
    out = []
    for t in qs:
        out.append({
            'id': t.payme_id,
            'time': t.create_time,
            'amount': t.amount_tiyin,
            'account': {field: str(t.payment_id)},
            'create_time': t.create_time,
            'perform_time': t.perform_time,
            'cancel_time': t.cancel_time,
            'transaction': str(t.pk),
            'state': t.state,
            'reason': t.reason,
        })
    return {'transactions': out}


_METHODS = {
    'CheckPerformTransaction': lambda params, db: m_check_perform(params),
    'CreateTransaction': m_create,
    'PerformTransaction': m_perform,
    'CancelTransaction': m_cancel,
    'CheckTransaction': m_check,
    'GetStatement': m_statement,
}


@csrf_exempt
@require_POST
def payme_callback(request):
    """POST /api/payments/payme/ — Payme Merchant JSON-RPC callback."""
    from tenant_manager.middleware import get_current_db_alias
    db = get_current_db_alias() or 'default'

    # 1) JSON parse
    try:
        body = json.loads(request.body or b'{}')
    except (ValueError, TypeError):
        return JsonResponse({'jsonrpc': '2.0', 'id': None,
                             'error': {'code': ERR_PARSE, 'message': {'uz': 'JSON xato', 'ru': 'Ошибка парсинга', 'en': 'Parse error'}}})

    rpc_id = body.get('id')
    method = body.get('method')
    params = body.get('params') or {}

    # 2) Auth (JSON parse'дан keyin — Payme shu tartibni kutadi)
    try:
        _check_auth(request)
    except PaymeError as e:
        # DIQQAT: kalit HECH QACHON log'ga yozilmaydi — faqat mos kelmagani.
        logger.warning('payme_merchant: AUTH FAIL method=%s (kassa kaliti mos emas; '
                       '.env dagi kalitlar soni=%d)', method, len(_kassa_keys()))
        return _err(rpc_id, e)
    logger.info('payme_merchant: method=%s account=%s amount=%s',
                method, (params.get('account') or {}), params.get('amount'))

    # 3) Dispatch
    fn = _METHODS.get(method)
    if not fn:
        return _err(rpc_id, PaymeError(ERR_METHOD, "Metod topilmadi", "Метод не найден", "Method not found"))
    try:
        result = fn(params, db)
        return _ok(rpc_id, result)
    except PaymeError as e:
        return _err(rpc_id, e)
    except Exception:
        logger.exception('payme_merchant: kutilmagan xato method=%s', method)
        return _err(rpc_id, PaymeError(ERR_REQUEST, "Ichki xato", "Внутренняя ошибка", "Internal error"))
