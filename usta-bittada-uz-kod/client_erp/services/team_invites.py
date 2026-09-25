"""client_erp/services/team_invites.py — Taklif havolasi + demo tozalash (2026-09-23).

BARCHA funksiya ADDITIVE — mavjud kodga tegmaydi, faqat yangi oqim.
Xatolar JIM o'tadi (ro'yxatdan o'tish/taklif buzilmasligi uchun).
"""
import logging

logger = logging.getLogger(__name__)

DEFAULT_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.bittada.bittadausta'
DEFAULT_BOT_URL = 'https://t.me/mebelcity_bittada_bot'

CHIEF_ADMIN_PHONE = '+998945876003'
MAX_ADMINS = 3


def norm_phone(phone):
    """Telefonni +998XXXXXXXXX formatiga keltiradi (auth dagi bilan bir xil)."""
    try:
        from client_erp.views.auth import _normalize_phone
        return _normalize_phone(phone or '')
    except Exception:
        digits = ''.join(c for c in (phone or '') if c.isdigit())
        if len(digits) == 9:
            return '+998' + digits
        if len(digits) == 12 and digits.startswith('998'):
            return '+' + digits
        return (phone or '').strip()


def get_setting(key, default=''):
    try:
        from client_erp.models.team import AppSetting
        s = AppSetting.objects.filter(key=key).first()
        return s.value if s and s.value else default
    except Exception:
        return default


def set_setting(key, value, user=None):
    from client_erp.models.team import AppSetting
    s, _ = AppSetting.objects.get_or_create(key=key)
    s.value = value or ''
    s.updated_by = user
    s.save(update_fields=['value', 'updated_by', 'updated_at'])
    return s


def is_admin(user):
    """Ilova admini: is_app_admin YOKI is_platform_admin (server) bayrog'i
    YOKI bosh admin nomeri. Hech qachon exception. Maydon DB'da bo'lmasa —
    getattr default bilan jim o'tadi (ikkala versiyada ham ishlaydi)."""
    try:
        if not user:
            return False
        if getattr(user, 'is_app_admin', False):
            return True
        if getattr(user, 'is_platform_admin', False):
            return True
        return norm_phone(getattr(user, 'phone', '')) == CHIEF_ADMIN_PHONE
    except Exception:
        return False


def has_platform_admin_field():
    """DB'da is_platform_admin ustuni bormi (server versiyasi)?"""
    try:
        from client_erp.models import ClientUser
        return _has_field(ClientUser, 'is_platform_admin')
    except Exception:
        return False


def admin_count():
    """Jami adminlar soni (ikkala bayroq + bosh admin)."""
    try:
        from django.db.models import Q
        from client_erp.models import ClientUser
        q = Q(is_app_admin=True)
        if has_platform_admin_field():
            q = q | Q(is_platform_admin=True)
        ids = set(ClientUser.objects.filter(q).values_list('id', flat=True))
        chief = ClientUser.objects.filter(phone=CHIEF_ADMIN_PHONE).values_list(
            'id', flat=True).first()
        if chief:
            ids.add(chief)
        return len(ids)
    except Exception:
        return 0


def _has_field(model, name):
    try:
        model._meta.get_field(name)
        return True
    except Exception:
        return False


def set_admin_flags(user, value):
    """Ikkala admin bayrog'ini sinxron qo'yadi/oladi (qaysi ustun bo'lsa).
    Qaytaradi: o'zgargan DB maydonlar ro'yxati (save uchun)."""
    changed = []
    try:
        from client_erp.models import ClientUser
        for fname in ('is_app_admin', 'is_platform_admin'):
            if _has_field(ClientUser, fname):
                try:
                    setattr(user, fname, value)
                    changed.append(fname)
                except Exception:
                    pass
    except Exception:
        pass
    return changed


def invite_links(inviter=None):
    """Taklif havolalari: Play Market (standart, dinamik) + bot (ref bilan)."""
    play_url = get_setting('invite_play_url', DEFAULT_PLAY_URL)
    bot_base = get_setting('invite_bot_url', DEFAULT_BOT_URL).rstrip('/')
    code = ''
    try:
        code = (getattr(inviter, 'referral_code', '') or '').strip()
    except Exception:
        code = ''
    bot_url = bot_base + ('?start=ref_' + code if code else '')
    return {'play': play_url, 'bot': bot_url}


def invite_text(team_name, inviter_name, links):
    return (
        "Assalomu alaykum! Sizni «%s» jamoasiga taklif qilishdi "
        "(taklif qilgan: %s).\n\n"
        "Qo'shilish uchun ilovani o'rnatib ro'yxatdan o'ting:\n"
        "📱 %s\n"
        "🤖 Bot: %s"
    ) % (team_name or 'Jamoa', inviter_name or '', links['play'], links['bot'])


def claim_pending_invites(user):
    """Yangi ro'yxatdan o'tgan user uchun kutilayotgan takliflarni bajaradi:
    jamoaga qo'shadi + taklif qilganga ilova ichidan xabar yuboradi.
    mini_register va telegram-register dan chaqiriladi. Jim o'tadi."""
    try:
        from django.utils import timezone
        from client_erp.models.team import ClientPendingInvite, ClientTeamMember
        from client_erp.services.notifications import notify_in_app
        phone = norm_phone(getattr(user, 'phone', ''))
        if not phone:
            return 0
        pendings = list(ClientPendingInvite.objects.filter(
            status='waiting').select_related('team', 'inviter'))
        done = 0
        for p in pendings:
            try:
                if norm_phone(p.phone) != phone:
                    continue
                if ClientTeamMember.objects.filter(team=p.team, user=user).exists():
                    p.status = 'registered'
                    p.registered_at = timezone.now()
                    p.save(update_fields=['status', 'registered_at'])
                    continue
                ClientTeamMember.objects.create(
                    team=p.team, user=user, role=p.role or 'worker',
                    profit_percent=p.profit_percent or 0,
                    status='active', accepted_at=timezone.now(),
                )
                p.status = 'registered'
                p.registered_at = timezone.now()
                p.save(update_fields=['status', 'registered_at'])
                try:
                    notify_in_app(
                        p.inviter,
                        "Sherigingiz registratsiya qildi 🎉",
                        "%s endi «%s» jamoangizda." % (p.name, p.team.name),
                        'custom', icon='👥', link='/team',
                    )
                except Exception:
                    pass
                done += 1
            except Exception:
                logger.exception("claim pending xato")
        return done
    except Exception:
        logger.exception("claim_pending_invites xato")
        return 0


def purge_expired_demos():
    """Muddati o'tgan demo akkauntlarni + BARCHA datalarini o'chiradi.

    DB: CASCADE avtomatik (orders, members, ...). Disk: avatar + buyurtma
    fayllari qo'lda o'chiriladi (Django buni o'zi qilmaydi).
    Qaytaradi: o'chirilgan demo soni.
    """
    from django.utils import timezone
    from client_erp.models import ClientUser
    now = timezone.now()
    expired = list(ClientUser.objects.filter(
        is_demo=True, demo_expires_at__lte=now))
    n = 0
    for u in expired:
        try:
            _delete_demo_files(u)
            u.delete()
            n += 1
        except Exception:
            logger.exception("demo purge xato")
    return n


def _delete_demo_files(user):
    """Demo user diski fayllarini o'chiradi (avatar + buyurtma fayllari)."""
    import os
    paths = set()
    try:
        if getattr(user, 'avatar', None):
            try:
                paths.add(user.avatar.path)
            except Exception:
                pass
    except Exception:
        pass
    try:
        from client_erp.models.order import ClientOrderFile
        for f in ClientOrderFile.objects.filter(order__owner=user):
            for fld in ('file', 'image', 'thumbnail'):
                try:
                    fo = getattr(f, fld, None)
                    if fo:
                        paths.add(fo.path)
                except Exception:
                    pass
    except Exception:
        pass
    for p in paths:
        try:
            if p and os.path.isfile(p):
                os.remove(p)
        except Exception:
            pass
