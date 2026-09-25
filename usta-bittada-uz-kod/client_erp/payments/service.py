"""client_erp/payments/service.py — to'lov biznes-logikasi (SANDBOX-first).

Bu qatlam ClientPayment yozuvini yaratadi, provayder checkout'ini oladi va
to'lov tasdiqlangach (webhook YOKI sandbox-confirm) mahsulotni yetkazadi
(_fulfill: tanga grant / tarif tayinlash).

XAVFSIZLIK
==========
Real provayder API FAQAT provayder qatlamida, `billing_live()` VA
`is_configured()` bo'lsagina chaqiriladi. `billing_live()` False bo'lsa hamma
narsa SandboxProvider orqali ketadi — real pul harakati YO'Q.
`confirm()` faqat webhook YOKI sandbox-confirm tomonidan chaqirilishi kerak —
bu yerda pul yechilmaydi, faqat sotib olingan narsa (tanga/tarif) beriladi.

ClientPayment (kutilayotgan model — bu paketdan tashqarida yaratiladi) maydonlari:
    user (FK ClientUser), provider (slug), purpose ('coin_topup'|'plan_purchase'),
    target_id (int), amount (UZS), status ('created'|'pending'|'paid'|'failed'),
    external_id (str), checkout_url (str), paid_at (datetime), fulfilled (bool)
PaymentAttempt (kutilayotgan model): payment (FK), code (str), message (str)
"""
import logging

from django.utils import timezone

from .base import get_provider, billing_live  # noqa: F401 (billing_live — hujjat/gate)

logger = logging.getLogger('client_erp.payments')


def amount_for(purpose, target_id):
    """`purpose`+`target_id` uchun narx (UZS, int). Topilmasa 0.

    Modellarni funksiya ichida import qilamiz (circular import oldini olish +
    model hali migratsiya qilinmagan bo'lsa jim o'tish).
    """
    if purpose == 'coin_topup':
        try:
            from client_erp.models import CoinPack
            pack = CoinPack.objects.filter(id=target_id).first()
            if pack is not None:
                return int(pack.price_uzs or 0)
        except Exception:
            pass
    elif purpose == 'plan_purchase':
        try:
            from client_erp.models import ClientPlan
            plan = ClientPlan.objects.filter(id=target_id).first()
            if plan is not None:
                return int(plan.price_uzs or 0)
        except Exception:
            pass
    return 0


def create_payment(user, provider_slug, purpose, target_id):
    """ClientPayment yaratadi (status=created), provayder checkout'ini oladi.

    Oqim:
      1) amount = amount_for(...)
      2) ClientPayment(status='created')
      3) provider.create_invoice(payment) -> external_id + checkout_url
      4) status='pending', saqlaydi, payment qaytaradi.

    XAVFSIZLIK: provider.create_invoice ichida sandbox/live gate bor — kalitsiz
    yoki billing_live() False bo'lsa real API chaqirilmaydi.
    """
    from client_erp.models import ClientPayment

    amount = amount_for(purpose, target_id)
    payment = ClientPayment.objects.create(
        user=user,
        provider=(provider_slug or 'sandbox'),
        purpose=purpose,
        target_id=int(target_id or 0),
        amount_uzs=amount,
        status='created',
    )

    provider = get_provider(provider_slug)
    inv = provider.create_invoice(payment) or {}
    payment.external_id = str(inv.get('external_id') or '')
    payment.checkout_url = str(inv.get('checkout_url') or '')
    payment.status = 'pending'
    fields = ['external_id', 'checkout_url', 'status']
    # Provayder xatosi bo'lsa (endpoint/account nomi) — audit uchun saqlaymiz;
    # handle_pay_start bo'sh checkout_url'ni ko'rib foydalanuvchiga xato qaytaradi.
    if inv.get('error'):
        payment.raw = {'invoice_error': inv.get('error')}
        fields.append('raw')
    payment.save(update_fields=fields)
    return payment


def poll_status(payment):
    """Pending to'lov holatini provayderdan FAOL tekshiradi (receipts.check).

    Payme «To'lash tugmasi» ssenariysining 3-qadami: chek holati state==4
    (paid) bo'lsa `confirm()` chaqiriladi (idempotent _fulfill — tanga/tarif).
    Sandbox yoki `check_receipt`siz provayderlarda hech nima qilmaydi.

    Qaytaradi: yangilangan ClientPayment (yoki o'sha obyekt).
    """
    from client_erp.models import ClientPayment
    if payment is None:
        return payment
    if payment.status == 'paid' or payment.fulfilled:
        return payment
    if not payment.external_id:
        return payment
    provider = get_provider(payment.provider)
    check = getattr(provider, 'check_receipt', None)
    if not callable(check):
        return payment
    try:
        res = check(payment.external_id) or {}
    except Exception:
        logger.exception('poll_status: check_receipt xatosi (payment=%s)', getattr(payment, 'pk', '?'))
        return payment
    if res.get('paid'):
        try:
            return confirm(payment, raw=res.get('raw') or {})
        except Exception:
            # confirm ichida log + PaymentAttempt bor; rollback bo'lsa 'pending' qoladi.
            return ClientPayment.objects.filter(pk=payment.pk).first() or payment
    return payment


def confirm(payment, external_id='', raw=None):
    """To'lov tasdiqlangach chaqiriladi (webhook / sandbox-confirm).

    IDEMPOTENT: payment allaqachon fulfilled bo'lsa qayta ishlamaydi (takroriy
    webhook bir necha marta tanga bermasligi uchun).

    Bu yerda PUL YECHILMAYDI — provayder pulni allaqachon oldi. Biz faqat
    holatni 'paid' qilamiz va sotib olingan narsani yetkazamiz (_fulfill).
    """
    from django.db import transaction
    from client_erp.models import ClientPayment
    # Tenant DB — atomic + select_for_update AYNI alias'da bo'lishi shart.
    try:
        from tenant_manager.middleware import get_current_db_alias
        db = get_current_db_alias() or 'default'
    except Exception:
        db = 'default'
    try:
        with transaction.atomic(using=db):
            # Qatorni lock — konkurent dublikat tasdiq (webhook retry / ikki WS)
            # double-grant qilmasligi uchun (B2 race tuzatildi).
            p = ClientPayment.objects.using(db).select_for_update().get(pk=payment.pk)
            if p.fulfilled:
                return p
            p.status = 'paid'
            p.paid_at = timezone.now()
            fields = ['status', 'paid_at']
            if external_id and not p.external_id:
                p.external_id = str(external_id)
                fields.append('external_id')
            if raw:
                p.raw = raw
                fields.append('raw')
            p.save(update_fields=fields)
            _fulfill(p)   # xato → RAISE → butun tranzaksiya rollback (qisman holat qolmaydi)
        return ClientPayment.objects.using(db).get(pk=payment.pk)
    except Exception as e:
        # B3: jim yutmaymiz — log + PaymentAttempt. Rollback tufayli status 'paid'
        # bo'lmay qoladi → keyingi webhook/urinish toza qayta ishlaydi.
        logger.exception("to'lov yetkazishda xato (payment=%s)", getattr(payment, 'pk', '?'))
        try:
            from client_erp.models import PaymentAttempt
            PaymentAttempt.objects.create(payment=payment, success=False,
                                          error_code='fulfill', error_message=str(e)[:200])
        except Exception:
            pass
        raise


def _fulfill(payment):
    """Sotib olingan narsani yetkazadi + fulfilled=True. confirm() ATOMIK bloki
    ichida chaqiriladi — XATO bo'lsa RAISE qiladi (rollback, qisman holat qolmaydi).
    Idempotent: mavjud CoinLedger/ClientSubscription bo'lsa qayta bermaydi (B3 dublikat).
    """
    user = payment.user
    ref = str(payment.id)

    if payment.purpose == 'coin_topup':
        from client_erp.models import CoinPack, CoinLedger
        from client_erp.services import coins
        already = CoinLedger.objects.filter(user=user, ref_id=ref, kind='purchase').exists()
        if not already:
            pack = CoinPack.objects.filter(id=payment.target_id).first()
            if pack is not None:
                coins.grant(user, pack.total_coins, reason=f'CoinPack #{pack.id}',
                            kind='purchase', ref_id=ref)

    elif payment.purpose == 'plan_purchase':
        from datetime import timedelta
        from client_erp.models import ClientPlan, ClientSubscription
        src = f'payment #{payment.id}'
        if not ClientSubscription.objects.filter(user=user, source=src).exists():
            plan = ClientPlan.objects.filter(id=payment.target_id).first()
            if plan is not None:
                now = timezone.now()
                expires = now + timedelta(days=int(plan.period_days or 30))
                user.plan = plan
                user.plan_since = now
                user.plan_expires_at = expires
                user.save(update_fields=['plan', 'plan_since', 'plan_expires_at'])
                ClientSubscription.objects.create(
                    user=user, plan=plan, status='active',
                    period_start=now, period_end=expires, source=src,
                )

    payment.fulfilled = True
    payment.save(update_fields=['fulfilled'])


def fail(payment, code='', msg=''):
    """To'lovni muvaffaqiyatsiz deb belgilaydi + PaymentAttempt log yozadi."""
    payment.status = 'failed'
    payment.save(update_fields=['status'])
    try:
        from client_erp.models import PaymentAttempt
        PaymentAttempt.objects.create(
            payment=payment,
            success=False,
            error_code=str(code or ''),
            error_message=str(msg or ''),
        )
    except Exception:
        # PaymentAttempt hali migratsiya qilinmagan bo'lishi mumkin — jim o'tamiz.
        pass
    return payment
