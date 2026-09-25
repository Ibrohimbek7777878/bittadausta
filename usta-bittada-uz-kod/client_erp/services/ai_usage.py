"""client_erp/services/ai_usage.py — AI foydalanish o'lchovi va kunlik limit.

TZ: client_erp/TZ-Tanga-Tolov-Adolat.md §2.3, §2.5, §2.6

╔══════════════════════════════════════════════════════════════════════════╗
║  YAGONA MANBA                                                            ║
║  O'lchov ham, limit ham, foydalanuvchiga ko'rsatiladigan sarf ham —      ║
║  hammasi `ClientAiUsage` jadvalidan. Alohida hisoblagich YO'Q.           ║
║                                                                          ║
║  HECH QACHON YIQILMAYDI: har bir funksiya try/except ichida. O'lchov     ║
║  ishlamay qolsa ham AI ishlashda davom etadi (limit esa ochiq qoladi —   ║
║  foydalanuvchini xatoga qoldirmaymiz).                                   ║
╚══════════════════════════════════════════════════════════════════════════╝
"""
import logging

logger = logging.getLogger(__name__)

# ── Kunlik limitlar (foydalanuvchiga) — TZ §2.5.2 ────────────────────────
DAILY_MSG_LIMIT = 30            # xabar / kun
DAILY_TOKEN_LIMIT = 50_000      # token / kun
MIN_GAP_SEC = 3                 # xabarlar orasidagi eng kam vaqt

# Token noma'lum bo'lsa taxmin: belgilar / 4
CHARS_PER_TOKEN = 4


def estimate_tokens(text):
    """Provayder token bermasa — taxminiy hisob. Hech qachon 0 qaytarmaydi."""
    n = len(text or '')
    return max(1, n // CHARS_PER_TOKEN)


def _today_bounds():
    from django.utils import timezone
    now = timezone.localtime()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, now


def today_usage(user):
    """Bugungi sarf: {'msgs': n, 'tokens': n, 'last_at': dt|None}."""
    out = {'msgs': 0, 'tokens': 0, 'last_at': None}
    try:
        from client_erp.models import ClientAiUsage
        from django.db.models import Sum, Count, Max
        start, _ = _today_bounds()
        row = ClientAiUsage.objects.filter(
            user=user, started_at__gte=start,
        ).aggregate(
            n=Count('id'),
            ti=Sum('tokens_in'), to=Sum('tokens_out'),
            last=Max('started_at'),
        )
        out['msgs'] = row['n'] or 0
        out['tokens'] = (row['ti'] or 0) + (row['to'] or 0)
        out['last_at'] = row['last']
    except Exception as e:                                        # noqa: BLE001
        logger.warning('today_usage xato: %s', e)
    return out


def check_limit(user):
    """Amaldan OLDIN: foydalanuvchi yana so'rov yubora oladimi?

    Qaytaradi (ok: bool, xabar: str|None).
    ⚠️ Xato bo'lsa (True, None) — limit tizimi buzilsa AI to'xtamasin.
    """
    try:
        u = today_usage(user)
        if u['msgs'] >= DAILY_MSG_LIMIT:
            return False, (
                f"Bugungi AI limiti tugadi ({DAILY_MSG_LIMIT} ta xabar). "
                "Ertaga davom etasiz yoki tarifni kengaytiring."
            )
        if u['tokens'] >= DAILY_TOKEN_LIMIT:
            return False, (
                "Bugungi AI hajmi tugadi. Ertaga davom etasiz yoki "
                "tarifni kengaytiring."
            )
        last = u.get('last_at')
        if last:
            from django.utils import timezone
            gap = (timezone.now() - last).total_seconds()
            if gap < MIN_GAP_SEC:
                return False, f"Biroz kuting — {MIN_GAP_SEC} soniyada bir marta."
    except Exception as e:                                        # noqa: BLE001
        logger.warning('check_limit xato: %s', e)
    return True, None


def log(user, kind, *, started_at=None, ended_at=None, duration_sec=0,
        audio_ms_in=0, tokens_in=0, tokens_out=0, tokens_estimated=False,
        provider='', model_name='', coins_charged=0, charge_reason=''):
    """Bitta foydalanish yozuvi. Xato bo'lsa jim o'tadi (AI to'xtamasin)."""
    try:
        from client_erp.models import ClientAiUsage
        from django.utils import timezone
        st = started_at or timezone.now()
        return ClientAiUsage.objects.create(
            user=user, kind=kind,
            started_at=st, ended_at=ended_at,
            duration_sec=int(duration_sec or 0),
            audio_ms_in=int(audio_ms_in or 0),
            tokens_in=int(tokens_in or 0), tokens_out=int(tokens_out or 0),
            tokens_estimated=bool(tokens_estimated),
            provider=(provider or '')[:40], model_name=(model_name or '')[:80],
            coins_charged=int(coins_charged or 0),
            charge_reason=(charge_reason or '')[:24],
        )
    except Exception as e:                                        # noqa: BLE001
        logger.warning('ai_usage.log xato: %s', e)
        return None


def usage_block(user, tokens=0, estimated=False, duration_sec=None, coins=0):
    """Foydalanuvchiga ko'rsatiladigan sarf ma'lumoti — TZ §2.6.

    Chat javobiga va ovozli sessiya yakuniga qo'shiladi.
    """
    u = today_usage(user)
    return {
        'tokens': int(tokens or 0),
        'estimated': bool(estimated),
        'msgs_today': u['msgs'],
        'msgs_limit': DAILY_MSG_LIMIT,
        'tokens_today': u['tokens'],
        'tokens_limit': DAILY_TOKEN_LIMIT,
        'tokens_left': max(0, DAILY_TOKEN_LIMIT - u['tokens']),
        'duration_sec': duration_sec,
        'coins': int(coins or 0),
    }
