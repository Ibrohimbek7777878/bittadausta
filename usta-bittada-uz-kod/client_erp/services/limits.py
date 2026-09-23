"""client_erp/services/limits.py — Tarif MIQDORIY limitlari (kvota) registri.

Feature-gating (features.py) funksiyani ON/OFF cheklaydi; bu modul esa MIQDORNI
cheklaydi (masalan: oyiga 15 buyurtma, 50 mijoz, 1 jamoa a'zosi).

XAVFSIZLIK (F1 bilan bir xil): limitlar FAQAT `CLIENT_FEATURE_GATING` yoqilganda
kuchga kiradi. O'chiq bo'lsa `guard()` doim (True, None) — hech kim bloklanmaydi.
Limit qiymati semantikasi:
    - plan.limits ichida kalit YO'Q            -> CHEKSIZ
    - qiymat manfiy (-1)                        -> CHEKSIZ
    - qiymat >= 0                               -> shu son = maksimal chegara
Ya'ni faqat ATAYIN ko'rsatilgan cheklovlar ishlaydi (yangi kalit qo'shilsa ham
avtomatik hech kimni bloklamaydi — xavfsiz default).

ClientPlan.limits (JSONField) — admin har tarifga sozlaydi.
"""
from django.conf import settings
from django.utils import timezone


# ─────────────────────────────────────────────────────────────────────────────
# LIMITS — barcha kvota kalitlari (label + o'lchov birligi). `count` funksiyasi
# joriy foydalanishni qaytaradi (owner=user bo'yicha ORM count).
# ─────────────────────────────────────────────────────────────────────────────
def _count_orders_month(user):
    from client_erp.models import ClientOrder
    now = timezone.now()
    return ClientOrder.objects.filter(
        owner=user, created_at__year=now.year, created_at__month=now.month
    ).count()


def _count_active_orders(user):
    from client_erp.models import ClientOrder
    return ClientOrder.objects.filter(
        owner=user, status__in=['new', 'in_progress', 'at_mebelcity']
    ).count()


def _count_customers(user):
    from client_erp.models import ClientCustomer
    return ClientCustomer.objects.filter(owner=user).count()


def _count_team_members(user):
    from client_erp.models import ClientTeamMember
    # Foydalanuvchi EGASI bo'lgan jamoalardagi a'zolar (egasining o'zidan tashqari).
    return ClientTeamMember.objects.filter(team__owner=user).exclude(role='owner').count()


LIMITS = {
    'orders_month': {'label': "Oyiga buyurtmalar", 'unit': 'ta/oy', 'count': _count_orders_month},
    'active_orders': {'label': "Faol buyurtmalar", 'unit': 'ta', 'count': _count_active_orders},
    'customers': {'label': "Mijozlar", 'unit': 'ta', 'count': _count_customers},
    'team_members': {'label': "Jamoa a'zolari", 'unit': 'ta', 'count': _count_team_members},
}

UNLIMITED = -1  # plan.limits qiymati sifatida ham, ko'rsatishда ham


# ─────────────────────────────────────────────────────────────────────────────
def limits_enabled():
    """Limitlar kuchga kirganmi? Feature-gating bilan bir bayroq (standart O'CHIQ)."""
    return bool(getattr(settings, 'CLIENT_FEATURE_GATING', False))


def _plan_limits(user):
    """Foydalanuvchining amaldagi tarifidagi limits dict (yoki {})."""
    try:
        from client_erp.services.features import effective_plan
        plan = effective_plan(user)
    except Exception:
        plan = None
    if plan is None:
        return {}
    lim = getattr(plan, 'limits', None)
    return lim if isinstance(lim, dict) else {}


def plan_limit(user, key):
    """`key` uchun tarif chegarasi (int) yoki None (CHEKSIZ)."""
    lim = _plan_limits(user)
    if key not in lim:
        return None
    try:
        v = int(lim[key])
    except (TypeError, ValueError):
        return None
    return None if v < 0 else v


def usage(user, key):
    """`key` bo'yicha joriy foydalanish (int). Xato bo'lsa 0."""
    spec = LIMITS.get(key)
    if not spec:
        return 0
    try:
        return int(spec['count'](user) or 0)
    except Exception:
        return 0


def status(user, key):
    """{key,label,unit,limit,used,remaining,unlimited,exceeded} — /tarif ko'rsatishi uchun."""
    spec = LIMITS.get(key) or {}
    lim = plan_limit(user, key)
    used = usage(user, key)
    unlimited = lim is None
    remaining = None if unlimited else max(0, lim - used)
    return {
        'key': key,
        'label': spec.get('label', key),
        'unit': spec.get('unit', ''),
        'limit': (UNLIMITED if unlimited else lim),
        'used': used,
        'remaining': remaining,
        'unlimited': unlimited,
        'exceeded': (not unlimited and used >= lim),
    }


def all_status(user):
    """Barcha limit kalitlari bo'yicha holat (ro'yxat) — /tarif joriy foydalanish paneli."""
    return [status(user, k) for k in LIMITS.keys()]


def guard(user, key, delta=1):
    """Amaldan OLDIN chaqiriladi: yana `delta` ta qo'shsa bo'ladimi?

    Qaytaradi (ok: bool, info: dict|None).
      - gating o'chiq / cheksiz / joyi bor -> (True, None)
      - chegaradan oshsa               -> (False, {key,label,limit,used,message})

    Bu funksiya DB o'qiydi — chaqiruvchi tenant-kontekstли sync ичida (mavjud
    handlerlarning _create ичida) chaqirishi kerak.
    """
    if not limits_enabled():
        return True, None
    lim = plan_limit(user, key)
    if lim is None:  # cheksiz
        return True, None
    used = usage(user, key)
    if used + delta <= lim:
        return True, None
    spec = LIMITS.get(key) or {}
    label = spec.get('label', key)
    return False, {
        'key': key,
        'label': label,
        'limit': lim,
        'used': used,
        'message': f"Tarif chegarasi: {label} — {lim} {spec.get('unit','')}. "
                   f"Ko'proq uchun tarifni yangilang.",
    }
