"""client_erp/services/mc_link.py — MebelCity zakaz ↔ Mini ERP ulanish tekshiruvi.

Feature: "Majburiy ulash" gate (2026-07-09 TZ).
Big One mini ERP (bigone_cl2) mijoziga tegishli, MC_LINK_REQUIRED_FROM dan
KEYIN yaratilgan manfacturing.Order'lar ustida etap amallari (boshlash/
tugatish/tasdiqlash/...) FAQAT zakaz mini ERP'ga ulangandan keyin mumkin.

"Ulangan" degani:
  - client_erp.ClientOrder.mebelcity_order_id == order.id (is_deleted=False), YOKI
  - client_erp.ClientOrderStage.mebelcity_order_id == order.id

MUHIM: FAIL-OPEN — har qanday xatolikda BLOKLAMAYMIZ (production to'xtamasin).
Barcha funksiyalar batch (N+1 siz) ishlaydi.
"""
import datetime
import logging

from django.utils import timezone

logger = logging.getLogger(__name__)

# Gate faqat shu sanadan keyin yaratilgan zakazlarga qo'llanadi (deploy sanasi).
# Eski zakazlar TEGILMAYDI.
# 2026-07-09: foydalanuvchi talabi bilan gate VAQTINCHA O'CHIRILDI (2099 = hech
# qachon ishlamaydi). Qayta yoqish uchun sanani bugungi kunga qaytaring.
MC_LINK_REQUIRED_FROM = datetime.date(2099, 1, 1)

# Gate faqat shu mini ERP foydalanuvchisining mijoziga tegishli zakazlar uchun
GATED_MINI_ERP_USERNAME = 'bigone_cl2'

BLOCK_MESSAGE = (
    "🔗 Mini ERP'ga ulanmagan — avval Big One mini ERP'da buyurtmaga ulang"
)


def _cutoff_dt():
    """MC_LINK_REQUIRED_FROM kunining boshlanishi (timezone-aware)."""
    return timezone.make_aware(
        datetime.datetime.combine(MC_LINK_REQUIRED_FROM, datetime.time.min),
        timezone.get_default_timezone(),
    )


def get_gated_client_ids():
    """Big One mini ERP foydalanuvchisiga bog'langan katta-ERP Client id'lari.

    Odatda 1 ta (placeholder "Big One"). Xatoda bo'sh set (fail-open).
    """
    try:
        from client_erp.models import ClientUser
        ids = set(
            ClientUser.objects.filter(
                username=GATED_MINI_ERP_USERNAME, client_id__isnull=False,
            ).values_list('client_id', flat=True)
        )
        return ids
    except Exception:
        logger.exception("[mc_link] gated client ids olishda xato")
        return set()


def get_linked_order_ids(order_ids):
    """Berilgan MebelCity order id'lar ichidan mini ERP'ga ulanganlarini qaytaradi.

    Batch — 2 ta so'rov (ClientOrder + ClientOrderStage).
    """
    order_ids = [oid for oid in order_ids if oid]
    if not order_ids:
        return set()
    from client_erp.models import ClientOrder, ClientOrderStage
    linked = set(
        ClientOrder.objects.filter(
            mebelcity_order_id__in=order_ids, is_deleted=False,
        ).values_list('mebelcity_order_id', flat=True)
    )
    linked |= set(
        ClientOrderStage.objects.filter(
            mebelcity_order_id__in=order_ids,
        ).values_list('mebelcity_order_id', flat=True)
    )
    return linked


def get_orders_link_status(orders):
    """Batch holat: {order_id: {'required': bool, 'linked': bool}}.

    `orders` — manfacturing.Order instansiyalari (id, client_id, order_date kerak).
    FAIL-OPEN: xatoda hamma uchun {'required': False, 'linked': True}.
    """
    orders = list(orders)
    if not orders:
        return {}
    # id yoki instansiya — ikkalasiga chidamli (safe qurish ham try ichida
    # bo'lishi shart emas, lekin getattr bilan hech qachon yiqilmaydi)
    safe = {getattr(o, 'id', o): {'required': False, 'linked': True} for o in orders}
    try:
        gated_clients = get_gated_client_ids()
        if not gated_clients:
            return safe
        cutoff = _cutoff_dt()
        candidates = [
            o for o in orders
            if o.client_id in gated_clients
            and getattr(o, 'order_date', None) is not None
            and o.order_date >= cutoff
        ]
        if not candidates:
            return safe
        linked_ids = get_linked_order_ids([o.id for o in candidates])
        result = dict(safe)
        for o in candidates:
            result[o.id] = {'required': True, 'linked': o.id in linked_ids}
        return result
    except Exception:
        logger.exception("[mc_link] get_orders_link_status xato — fail-open")
        return safe


def is_order_blocked(order):
    """Bitta order uchun: True = bloklangan (ulanish talab qilinadi, lekin ulanmagan).

    FAIL-OPEN: xatoda False.
    """
    try:
        info = get_orders_link_status([order]).get(order.id)
        return bool(info and info['required'] and not info['linked'])
    except Exception:
        logger.exception("[mc_link] is_order_blocked xato — fail-open")
        return False
