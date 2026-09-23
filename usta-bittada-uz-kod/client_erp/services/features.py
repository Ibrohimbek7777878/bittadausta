"""client_erp/services/features.py — Funksiya-cheklash (tarif gating) registri.

MUHIM (F1 xavfsizlik): gating STANDART O'CHIQ. `CLIENT_FEATURE_GATING` sozlamasi
yoqilmagunча `user_can(...)` HAMMA narsaga True qaytaradi — hech kim bloklanmaydi.
Bu fayl faqat registr + yordamchilar; hech qayerga ulanmaydi (additiv).

Ishlatilishi (keyinchalik):
    - WS: consumers.receive() da msg_type -> feature_for_type() -> user_can()
    - HTTP: view ustiga @require_feature('ai_image')
    - SPA: user_features(user) -> ruxsat etilgan kalitlar ro'yxati frontendga
"""
from functools import wraps

from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone


# ─────────────────────────────────────────────────────────────────────────────
# 1) FEATURES — barcha funksiya kalitlari (label + kategoriya)
#    Kategoriyalar: core / ai / team / finance / files / templates /
#                   integration / tools
# ─────────────────────────────────────────────────────────────────────────────
FEATURES = {
    # Asosiy — HAR DOIM ochiq (dashboard, mijozlar, buyurtmalar, sozlamalar)
    'core': {'label': "Asosiy (doim ochiq)", 'category': 'core'},

    # AI imkoniyatlar
    'ai_analytics': {'label': "AI tahlil (analitika)", 'category': 'ai'},
    'ai_image': {'label': "AI rasm tahrirlash", 'category': 'ai'},
    'ai_panorama': {'label': "AI 360° panorama", 'category': 'ai'},
    'ai_laylo': {'label': "Laylo AI yordamchi", 'category': 'ai'},
    'gemini_live': {'label': "Gemini jonli suhbat", 'category': 'ai'},

    # Jamoa / ulashish / ruxsat
    'team': {'label': "Jamoa, ulashish va ruxsatlar", 'category': 'team'},

    # Kengaytirilgan moliya (foyda taqsimoti, qaytarish)
    'finance_advanced': {'label': "Kengaytirilgan moliya (foyda taqsimoti)", 'category': 'finance'},

    # Fayllar
    'files_upload': {'label': "Fayl yuklash", 'category': 'files'},

    # Shablonlar
    'templates': {'label': "Etap shablonlari", 'category': 'templates'},

    # Qo'shimcha premium bo'limlar
    'oldi_berdi': {'label': "Oldi-berdi (qarz daftari)", 'category': 'finance'},
    'mebelcity': {'label': "MebelCity integratsiya", 'category': 'integration'},
    'zamers': {'label': "Zamerlar", 'category': 'tools'},
    'vizualizatsiya': {'label': "Vizualizatsiya", 'category': 'tools'},
}


# ─────────────────────────────────────────────────────────────────────────────
# 2) WS_TYPE_FEATURE — WS msg type -> feature_key
#    FAQAT cheklanadigan tiplar xaritalanadi. Core tiplar
#    (page.dashboard, page.clients, order.create, stage.*, note.*, page.settings,
#     client.*, debt.*, rate.get, ... ) bu yerda YO'Q => feature_for_type() None
#    qaytaradi => user_can(None) => doim ruxsat.
#
#    Eslatma: dispatcher `msg_type.replace('.', '_')` qiladi, shuning uchun ba'zi
#    tiplar frontendda nuqtali, ba'zilari pastki-chiziqli yuboriladi. Ikkala
#    variantni ham kiritamiz (ortiqcha kalit zararsiz — mos kelmasa e'tiborsiz).
# ─────────────────────────────────────────────────────────────────────────────
WS_TYPE_FEATURE = {
    # ── AI tahlil ──
    'analytics.ai': 'ai_analytics',
    'analytics.ai_history': 'ai_analytics',

    # ── Laylo AI ──
    'laylo.chat': 'ai_laylo',
    'laylo.tts': 'ai_laylo',
    # laylo.permissions / laylo.typing — o'qish/holat => core (xaritada yo'q)

    # ── AI panorama ──
    'panorama.link': 'ai_panorama',

    # ── Jamoa / ulashish / ruxsat ──
    'perm.save': 'team',
    'perm.delete': 'team',
    'order.share': 'team',
    'order.unshare': 'team',
    'team.create': 'team',
    'team.update': 'team',
    'team.invite': 'team',
    'team.update_member': 'team',
    'team.remove_member': 'team',
    'team.accept': 'team',
    'team.decline': 'team',
    'team.save_template': 'team',
    'team.delete_template': 'team',
    'team.autoshare_set': 'team',
    'team.report': 'team',
    'team.profit_detail': 'team',
    'team_profit_detail': 'team',
    'standing.update': 'team',
    'standing.delete': 'team',
    'page.team': 'team',
    # standing.list / team.autoshare_get / user.search — o'qish yordamchilari => core

    # ── Kengaytirilgan moliya (foyda taqsimoti / qaytarish) ──
    'profit.save': 'finance_advanced',
    'profit.withdraw': 'finance_advanced',
    'finance.revert': 'finance_advanced',
    # finance.create / finance.withdrawal / debt.* — oddiy moliya => core

    # ── Shablonlar (yozish amallari) ──
    'template.save': 'templates',
    'template.delete': 'templates',
    'template.apply': 'templates',
    # template.list — o'qish => core

    # ── Oldi-berdi ──
    'page.oldi_berdi': 'oldi_berdi',
    'oldi_berdi.load_more': 'oldi_berdi',

    # ── MebelCity integratsiya ──
    'page.mebelcity': 'mebelcity',
    'order.send_mc': 'mebelcity',
    'mc.order_detail': 'mebelcity',
    'mc_order_detail': 'mebelcity',
    'mebelcity.orders_for_stage': 'mebelcity',
    'mebelcity_orders_for_stage': 'mebelcity',

    # ── Zamerlar ──
    'page.zamers': 'zamers',
    'zamer.link': 'zamers',

    # ── Vizualizatsiya ──
    'page.vizualizatsiya': 'vizualizatsiya',
}


# ─────────────────────────────────────────────────────────────────────────────
# 3) HTTP_FEATURE — URL path bo'lagi -> feature_key
#    (path ichida shu bo'lak bo'lsa — mos feature). require_feature dekoratori
#    view'ga aniq kalit bilan qo'yiladi; bu xarita middleware/avtomatik tekshiruv
#    uchun qulaylik.
# ─────────────────────────────────────────────────────────────────────────────
HTTP_FEATURE = {
    'ai-image-edit': 'ai_image',
    'panorama-generate': 'ai_panorama',
    'file-upload': 'files_upload',
    'chunk-upload': 'files_upload',
    'prompt-presets': 'ai_image',
}


# ─────────────────────────────────────────────────────────────────────────────
# 4) gating_enabled — STANDART False (F1 xavfsiz)
# ─────────────────────────────────────────────────────────────────────────────
def gating_enabled():
    """Tarif gating yoqilganmi? Standart — O'CHIQ (False)."""
    return getattr(settings, 'CLIENT_FEATURE_GATING', False)


# ─────────────────────────────────────────────────────────────────────────────
# 5) effective_plan — foydalanuvchining amaldagi tarifi
# ─────────────────────────────────────────────────────────────────────────────
def effective_plan(user):
    """Foydalanuvchining amaldagi tarifini qaytaradi.

    - user.plan bor va muddati (plan_expires_at) o'tmagan bo'lsa -> user.plan
    - aks holda (plan yo'q / muddati o'tgan) -> bepul tarif (ClientPlan.is_free=True)
    - hech biri topilmasa / model hali yo'q -> None

    ClientPlan importi funksiya ICHIDA — sirkular importni oldini olish uchun.
    """
    if user is None:
        return None

    # Model hali mavjud bo'lmasligi mumkin (F1) — xavfsiz import
    try:
        from client_erp.models import ClientPlan
    except Exception:
        ClientPlan = None

    plan = getattr(user, 'plan', None)
    expires = getattr(user, 'plan_expires_at', None)
    if plan is not None:
        # expires None => muddatsiz (o'tmagan deb hisoblaymiz)
        if expires is None or expires >= timezone.now():
            return plan

    # Muddati o'tgan yoki tarif belgilanmagan -> bepul tarif
    if ClientPlan is None:
        return None
    try:
        return ClientPlan.objects.filter(is_free=True).first()
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# 6) user_can — foydalanuvchi shu funksiyani ishlata oladimi?
# ─────────────────────────────────────────────────────────────────────────────
def user_can(user, feature_key):
    """feature_key funksiyasiga ruxsat bormi?

    F1: gating o'chiq bo'lsa HAMMA narsa ochiq (True). 'core' har doim ochiq.
    """
    if not feature_key or feature_key == 'core':
        return True
    if not gating_enabled():
        return True  # F1: hamma narsa ochiq

    plan = effective_plan(user)
    if plan is None:
        return True

    keys = getattr(plan, 'feature_keys', None)
    if not keys:
        return True  # bo'sh ro'yxat = hammasi ochiq

    return feature_key in keys


# ─────────────────────────────────────────────────────────────────────────────
# 7) feature_for_type — WS msg type uchun feature kaliti (yoki None)
# ─────────────────────────────────────────────────────────────────────────────
def feature_for_type(msg_type):
    """WS msg type -> feature_key (cheklanmasa None)."""
    if not msg_type:
        return None
    return WS_TYPE_FEATURE.get(msg_type)


# ─────────────────────────────────────────────────────────────────────────────
# 8) require_feature — HTTP view dekoratori (DRF yoki oddiy view)
# ─────────────────────────────────────────────────────────────────────────────
def _extract_request(args):
    """Pozitsion argumentlardan request obyektini topadi.

    Oddiy FBV: (request, ...) — birinchi arg.
    DRF APIView metodi: (self, request, ...) — ikkinchi arg.
    """
    for arg in args:
        # request obyekti — odatda META bor yoki bizning middleware client_user qo'ygan
        if hasattr(arg, 'META') or hasattr(arg, 'client_user'):
            return arg
    return None


def require_feature(feature_key):
    """View'ni tarif bilan cheklaydigan dekorator.

    request.client_user ni user_can bilan tekshiradi. Ruxsat yo'q bo'lsa 403 +
    {'ok': False, 'error': ..., 'upgrade': True, 'feature': feature_key}.
    Gating o'chiq bo'lsa (F1) — user_can doim True, ya'ni dekorator shaffof.
    """
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped(*args, **kwargs):
            request = _extract_request(args)
            user = getattr(request, 'client_user', None) if request is not None else None
            if not user_can(user, feature_key):
                return JsonResponse({
                    'ok': False,
                    'error': "Bu funksiya tarifingizda yo'q",
                    'upgrade': True,
                    'feature': feature_key,
                }, status=403)
            return view_func(*args, **kwargs)
        return _wrapped
    return decorator


# ─────────────────────────────────────────────────────────────────────────────
# 9) user_features — SPA'ga uzatiladigan ruxsat etilgan kalitlar ro'yxati
# ─────────────────────────────────────────────────────────────────────────────
def user_features(user):
    """Foydalanuvchiga ruxsat etilgan feature_key'lar ro'yxati (frontend uchun).

    - gating o'chiq bo'lsa YOKI tarif topilmasa -> BARCHA kalitlar
    - tarif feature_keys bo'sh bo'lsa -> BARCHA kalitlar
    - aks holda -> tarifdagi kalitlar ('core' har doim qo'shiladi)
    """
    all_keys = list(FEATURES.keys())

    if not gating_enabled():
        return all_keys

    plan = effective_plan(user)
    if plan is None:
        return all_keys

    keys = getattr(plan, 'feature_keys', None)
    if not keys:
        return all_keys

    result = list(keys)
    if 'core' not in result:
        result = ['core'] + result
    return result
