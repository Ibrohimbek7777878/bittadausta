"""client_erp/views/auth.py — Login/Logout + Telegram WebApp auth."""
import hashlib
import hmac
import json
import logging
import random
import time
from urllib.parse import parse_qs

import requests as http_requests
from django.shortcuts import render, redirect
from django.utils import timezone
from ..models import ClientUser, ClientLoginAttempt
from ..auth_backend import generate_token, get_client_user, TOKEN_COOKIE

logger = logging.getLogger("client_erp.auth")


def _normalize_phone(phone):
    """Telefon raqamni +998XXXXXXXXX formatiga keltiradi."""
    if not phone:
        return ''
    digits = ''.join(c for c in phone if c.isdigit())
    if len(digits) == 9:
        return f'+998{digits}'
    if len(digits) == 12 and digits.startswith('998'):
        return f'+{digits}'
    if len(digits) == 13 and digits.startswith('998'):
        return f'+{digits[:12]}'
    if phone.startswith('+'):
        return phone
    return f'+{digits}' if digits else ''


def _do_login(user, redirect_url=None):
    """Login muvaffaqiyatli — token cookie o'rnatib redirect."""
    user.last_login = timezone.now()
    user.save(update_fields=['last_login'])
    token = generate_token(user)
    url = redirect_url or f'/mini/{user.username}/spa/'
    response = redirect(url)
    response.set_cookie(TOKEN_COOKIE, token, max_age=30 * 24 * 3600, httponly=True, samesite='Lax')
    return response


def _login_redirect_url(user):
    return f'/mini/{user.username}/spa/'


def _do_login_json(user):
    """AJAX login — JsonResponse + JWT cookie o'rnatadi (Telegram 2FA polling uchun)."""
    from django.http import JsonResponse
    user.last_login = timezone.now()
    user.save(update_fields=['last_login'])
    token = generate_token(user)
    resp = JsonResponse({'ok': True, 'redirect': _login_redirect_url(user)})
    resp.set_cookie(TOKEN_COOKIE, token, max_age=30 * 24 * 3600, httponly=True, samesite='Lax')
    return resp


def mini_login(request):
    """GET/POST /mini/login/"""
    # Agar allaqachon kirgan bo'lsa
    user = get_client_user(request)
    if user:
        return redirect(f'/mini/{user.username}/spa/')

    # QR access: /mini/login/?tel=+998930421502&password=secret
    qr_tel = _normalize_phone(request.GET.get('tel', '').strip())
    qr_pwd = request.GET.get('password', '').strip()
    if qr_tel and qr_pwd:
        ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
        if ClientLoginAttempt.is_blocked(qr_tel):
            return render(request, 'client_erp/auth/login.html', {
                'error': "Juda ko'p urinish. 30 daqiqadan keyin qayta urining.",
            })
        try:
            u = ClientUser.objects.get(phone=qr_tel)
            if not u.is_active or u.is_blocked or not u.is_verified:
                ClientLoginAttempt.objects.create(phone=qr_tel, ip_address=ip, success=False, login_type='qr')
                return render(request, 'client_erp/auth/login.html', {
                    'error': 'Hisob faol emas yoki bloklangan.',
                })
            if u.check_password(qr_pwd):
                ClientLoginAttempt.objects.create(phone=qr_tel, ip_address=ip, success=True, login_type='qr', user=u)
                return _do_login(u)
            else:
                ClientLoginAttempt.objects.create(phone=qr_tel, ip_address=ip, success=False, login_type='qr')
        except ClientUser.DoesNotExist:
            ClientLoginAttempt.objects.create(phone=qr_tel, ip_address=ip, success=False, login_type='qr')
        return render(request, 'client_erp/auth/login.html', {
            'error': "QR orqali kirish muvaffaqiyatsiz. Qayta urinib ko'ring.",
        })

    error = ''
    if request.method == 'POST':
        phone = _normalize_phone((request.POST.get('phone', '') or '').strip())
        password = request.POST.get('password', '') or ''
        ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')

        if ClientLoginAttempt.is_blocked(phone):
            ClientLoginAttempt.objects.filter(phone=phone, success=False).delete()
            error = "Juda ko'p urinish. Qayta urining yoki admin bilan bog'laning."
        elif phone and password:
            try:
                user = ClientUser.objects.get(phone=phone)
                if not user.is_active:
                    error = "Hisob faol emas"
                elif user.is_blocked:
                    error = "Hisob bloklangan. Admin bilan bog'laning."
                elif not user.is_verified:
                    error = "Hisob hali tasdiqlanmagan. Admin bilan bog'laning."
                elif user.check_password(password):
                    ClientLoginAttempt.objects.create(phone=phone, ip_address=ip, success=True, login_type='web', user=user)
                    return _do_login(user)
                else:
                    error = "Parol noto'g'ri"
                    ClientLoginAttempt.objects.create(phone=phone, ip_address=ip, success=False, login_type='web')
            except ClientUser.DoesNotExist:
                error = "Bu raqam ro'yxatdan o'tmagan"
                ClientLoginAttempt.objects.create(phone=phone, ip_address=ip, success=False, login_type='web')
        else:
            error = "Telefon va parolni kiriting"

    return render(request, 'client_erp/auth/login.html', {'error': error})


# ═══════════════════════════════════════════════════════════════════════
#  TELEGRAM GATEWAY OTP — web-login verifikatsiya (rasmiy Telegram Gateway)
#  Telefon → Telegram'ga OTP kod → kod kiritiladi → login. Bot ochish SHART EMAS.
#  Telegrami yo'q / Gateway yetmasa → parol-fallback.
# ═══════════════════════════════════════════════════════════════════════
from django.views.decorators.csrf import csrf_exempt

_LOGIN_KEY = 'ce_login_otp_{}'
_LOGIN_TTL = 360  # 6 daqiqa (kod ttl 300 + zapas)
_GW_URL = 'https://gatewayapi.telegram.org'


def _gw_token():
    from django.conf import settings
    return getattr(settings, 'TELEGRAM_GATEWAY_TOKEN', '') or ''


def _gateway_send(phone):
    """Telegram Gateway orqali OTP kod yuboradi. Returns request_id yoki None.
    phone '+998...' → Gateway raqamni faqat digit ('998...') sifatida kutadi."""
    token = _gw_token()
    if not token:
        return None
    digits = ''.join(c for c in phone if c.isdigit())
    try:
        r = http_requests.post(
            f"{_GW_URL}/sendVerificationMessage",
            headers={"Authorization": f"Bearer {token}"},
            data={"phone_number": digits, "code_length": 6, "ttl": 300},
            timeout=15,
        )
        d = r.json()
        rid = (d.get('result') or {}).get('request_id')
        if d.get('ok') and rid:
            return rid
        logger.warning("Gateway send xato: %s", d)
        return None
    except Exception as e:  # noqa: BLE001
        logger.error("Gateway send istisno: %s", e)
        return None


def _gateway_check(request_id, code):
    """Kiritilgan kodni tekshiradi. Returns True agar 'code_valid'."""
    token = _gw_token()
    if not token:
        return False
    try:
        r = http_requests.post(
            f"{_GW_URL}/checkVerificationStatus",
            headers={"Authorization": f"Bearer {token}"},
            data={"request_id": request_id, "code": code},
            timeout=15,
        )
        d = r.json()
        vs = (d.get('result') or {}).get('verification_status') or {}
        return bool(d.get('ok') and vs.get('status') == 'code_valid')
    except Exception as e:  # noqa: BLE001
        logger.error("Gateway check istisno: %s", e)
        return False


def _send_login_button_via_bot(chat_id, confirm_url):
    """Bot orqali «✅ Kirishni tasdiqlash» URL-tugmasini yuboradi (BEPUL — Bot API).

    Returns True agar yuborilgan bo'lsa. Telegram Gateway (pulli) dan farqli —
    bu bot orqali, balans kerak emas. Faqat chat_id (botdan ro'yxatdan o'tgan)
    borlar uchun ishlaydi."""
    bot_token = _get_bot_token()
    if not bot_token or not chat_id:
        return False
    text = (
        "🔐 <b>Bittada Usta — kirish so'rovi</b>\n\n"
        "Agar bu <b>siz</b> bo'lsangiz, kirishni tasdiqlang. "
        "Agar siz emas bo'lsangiz — bu xabarni e'tiborsiz qoldiring."
    )
    kb = {'inline_keyboard': [[{'text': '✅ Kirishni tasdiqlash', 'url': confirm_url}]]}
    try:
        r = http_requests.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML', 'reply_markup': kb},
            timeout=10,
        )
        return bool((r.json() or {}).get('ok'))
    except Exception as e:  # noqa: BLE001
        logger.error("Login tugma yuborishda xato: %s", e)
        return False


def _sms_send_code(phone, code):
    """Eskiz orqali tasdiqlash kodini SMS qilib yuboradi. True agar yuborilgan bo'lsa.

    Shablon (Eskiz'da tasdiqlangan bo'lishi kerak):
      «Mebel-City Bittada platformasiga kirish uchun tasdiqlash kodi: XXXX. Kodni hech kimga bermang.»
    """
    try:
        from sms_service.client import send_sms
        msg = ("Mebel-City Bittada platformasiga kirish uchun tasdiqlash kodi: "
               f"{code}. Kodni hech kimga bermang.")
        r = send_sms(phone, msg, source='login') or {}
        if r.get('error'):
            logger.warning("SMS login xato: %s", r.get('error'))
            return False
        return True
    except Exception as e:  # noqa: BLE001
        logger.error("SMS login istisno: %s", e)
        return False


@csrf_exempt
def mini_login_start(request):
    """POST /mini/login/start/ — AJAX. Telefon + `method` (bot|otp|sms) qabul qiladi.

    HYBRID (2026-07-14) — foydalanuvchi USULNI TANLAYDI (qo'lda parol yo'q):
      method='bot' → Telegram BOT «✅ Kirish» tugma (bepul, chat_id kerak) → poll.
      method='otp' → Telegram Gateway OTP kod (pulli).
      method='sms' → Eskiz SMS kod (pulli).
      probe=True   → mavjud usullarni qaytaradi (has_telegram).
    method berilmasa — eski avto-hybrid (bot→otp→parol) saqlanadi (orqaga-mos)."""
    from django.http import JsonResponse
    import secrets
    from django.core.cache import cache

    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST kerak'}, status=405)
    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = request.POST
    phone = _normalize_phone((body.get('phone') or '').strip())
    password = (body.get('password') or '')
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')

    if not phone:
        return JsonResponse({'ok': False, 'error': 'Telefon raqamini kiriting'})
    if ClientLoginAttempt.is_blocked(phone):
        return JsonResponse({'ok': False, 'error': "Juda ko'p urinish. Keyinroq urining."})

    try:
        user = ClientUser.objects.get(phone=phone)
    except ClientUser.DoesNotExist:
        user = None   # YANGI raqam → ro'yxatdan o'tish oqimiga o'tadi

    if user is not None:
        if not user.is_active:
            return JsonResponse({'ok': False, 'error': 'Hisob faol emas'})
        if user.is_blocked:
            return JsonResponse({'ok': False, 'error': "Hisob bloklangan. Admin bilan bog'laning."})

    # 1) Parol berilgan bo'lsa — parol-login (faqat mavjud user)
    if password and user is not None:
        if not user.is_verified:
            return JsonResponse({'ok': False, 'error': 'Hisob hali tasdiqlanmagan.'})
        if user.check_password(password):
            ClientLoginAttempt.objects.create(phone=phone, ip_address=ip, success=True, login_type='web', user=user)
            return _do_login_json(user)
        ClientLoginAttempt.objects.create(phone=phone, ip_address=ip, success=False, login_type='web')
        return JsonResponse({'ok': False, 'error': "Parol noto'g'ri"})

    method = (body.get('method') or '').strip().lower()

    def _new_token(payload):
        tk = secrets.token_urlsafe(24)
        cache.set(_LOGIN_KEY.format(tk), payload, _LOGIN_TTL)
        return tk

    # Probe — frontend usullarni + raqam yangimi biladi (yangi bo'lsa registratsiya)
    if body.get('probe'):
        return JsonResponse({'ok': True, 'register': user is None,
                             'has_telegram': bool(user and getattr(user, 'telegram_chat_id', None))})

    # ── YANGI RAQAM → ro'yxatdan o'tish uchun tasdiqlash kodi (SMS yoki Telegram-kod) ──
    if user is None:
        # Referral kod (do'stning ulashish havolasidan ?ref=) — ro'yxatdan
        # o'tish oxirigacha token orqali ko'chib boradi (mini_register da ishlatiladi).
        ref_code = (body.get('ref') or '').strip()[:20]
        if method == 'sms':
            code = ''.join(secrets.choice('0123456789') for _ in range(4))
            tk = _new_token({'register': True, 'phone': phone, 'mode': 'sms', 'code': code, 'attempts': 0, 'verified': False, 'ref': ref_code})
            if _sms_send_code(phone, code):
                return JsonResponse({'ok': True, 'code_sent': True, 'token': tk, 'method': 'sms', 'register': True})
            cache.delete(_LOGIN_KEY.format(tk))
            return JsonResponse({'ok': False, 'error': "SMS yuborilmadi. Boshqa usulni tanlang."})
        if method == 'otp':
            request_id = _gateway_send(phone)
            if request_id:
                tk = _new_token({'register': True, 'phone': phone, 'mode': 'otp', 'request_id': request_id, 'attempts': 0, 'verified': False, 'ref': ref_code})
                return JsonResponse({'ok': True, 'code_sent': True, 'token': tk, 'method': 'otp', 'register': True})
            return JsonResponse({'ok': False, 'error': "Telegram kod yuborilmadi. SMS tanlang."})
        # method yo'q / bot — SMS yoki OTP tanlashni so'raymiz (yangi raqamda bot yo'q)
        return JsonResponse({'ok': True, 'register': True, 'choose': True})

    # ── Foydalanuvchi TANLAGAN aniq usul ──
    if method == 'sms':
        code = ''.join(secrets.choice('0123456789') for _ in range(4))
        tk = _new_token({'user_id': user.pk, 'phone': phone, 'mode': 'sms', 'code': code, 'attempts': 0})
        if _sms_send_code(phone, code):
            return JsonResponse({'ok': True, 'code_sent': True, 'token': tk, 'method': 'sms'})
        cache.delete(_LOGIN_KEY.format(tk))
        return JsonResponse({'ok': False, 'error': "SMS yuborilmadi. Boshqa usulni tanlang."})

    if method == 'bot':
        chat_id = getattr(user, 'telegram_chat_id', None)
        if not chat_id:
            return JsonResponse({'ok': False, 'error': "Telegram ulanmagan. SMS yoki OTP tanlang."})
        tk = _new_token({'user_id': user.pk, 'phone': phone, 'mode': 'bot', 'confirmed': False})
        confirm_url = request.build_absolute_uri(f'/mini/login/confirm/{tk}/')
        if _send_login_button_via_bot(chat_id, confirm_url):
            return JsonResponse({'ok': True, 'bot_sent': True, 'token': tk})
        cache.delete(_LOGIN_KEY.format(tk))
        return JsonResponse({'ok': False, 'error': "Telegram tugma yuborilmadi."})

    if method == 'otp':
        request_id = _gateway_send(phone)
        if request_id:
            tk = _new_token({'user_id': user.pk, 'request_id': request_id, 'phone': phone, 'attempts': 0, 'mode': 'otp'})
            return JsonResponse({'ok': True, 'code_sent': True, 'token': tk, 'method': 'otp'})
        return JsonResponse({'ok': False, 'error': "Telegram OTP yuborilmadi (balans/raqam)."})

    # 2) BOT «✅ Kirish» tugma (BEPUL — Bot API, balans kerak emas).
    #    telegram_chat_id bor (botdan ro'yxatdan o'tgan) bo'lsa BIRINCHI shu ishlatiladi.
    chat_id = getattr(user, 'telegram_chat_id', None)
    if chat_id:
        token = secrets.token_urlsafe(24)
        cache.set(_LOGIN_KEY.format(token),
                  {'user_id': user.pk, 'phone': phone, 'mode': 'bot', 'confirmed': False},
                  _LOGIN_TTL)
        confirm_url = request.build_absolute_uri(f'/mini/login/confirm/{token}/')
        if _send_login_button_via_bot(chat_id, confirm_url):
            return JsonResponse({'ok': True, 'bot_sent': True, 'token': token})
        cache.delete(_LOGIN_KEY.format(token))  # bot yubora olmadi → Gateway'ga o'tamiz

    # 3) Telegram Gateway OTP (chat_id yo'q / bot yubora olmadi; PULLI — balans bo'lsa).
    request_id = _gateway_send(phone)
    if request_id:
        token = secrets.token_urlsafe(24)
        cache.set(_LOGIN_KEY.format(token),
                  {'user_id': user.pk, 'request_id': request_id, 'phone': phone,
                   'attempts': 0, 'mode': 'otp'},
                  _LOGIN_TTL)
        return JsonResponse({'ok': True, 'code_sent': True, 'token': token})

    # 4) Hech biri ishlamadi → parol fallback
    return JsonResponse({'ok': True, 'need_password': True,
                         'error': "Telegram orqali yuborilmadi — parol bilan kiring."})


@csrf_exempt
def mini_login_verify(request):
    """POST /mini/login/verify/ {token, code} — Telegram Gateway OTP kodni tekshiradi → login."""
    from django.http import JsonResponse
    from django.core.cache import cache
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST kerak'}, status=405)
    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = request.POST
    token = (body.get('token') or '').strip()
    code = ''.join(c for c in (body.get('code') or '') if c.isdigit())
    key = _LOGIN_KEY.format(token)
    data = cache.get(key) if token else None
    if data is None:
        return JsonResponse({'ok': False, 'error': "Muddat tugagan. Qayta boshlang.", 'expired': True})
    if len(code) < 4:
        return JsonResponse({'ok': False, 'error': "Kodni to'liq kiriting"})
    # Urinishlar cheklovi (5 marta)
    data['attempts'] = data.get('attempts', 0) + 1
    if data['attempts'] > 5:
        cache.delete(key)
        return JsonResponse({'ok': False, 'error': "Juda ko'p urinish. Qayta boshlang.", 'expired': True})
    cache.set(key, data, _LOGIN_TTL)

    mode = data.get('mode', 'otp')
    if mode == 'sms':
        ok = bool(data.get('code')) and str(code) == str(data.get('code'))
    else:
        ok = _gateway_check(data.get('request_id'), code)

    # ── YANGI RAQAM (registratsiya): kod to'g'ri → login QILMAYMIZ, ma'lumot so'raymiz ──
    if data.get('register'):
        if not ok:
            return JsonResponse({'ok': False, 'error': "Kod noto'g'ri"})
        data['verified'] = True
        cache.set(key, data, _LOGIN_TTL)
        return JsonResponse({'ok': True, 'register': True, 'token': token})

    if ok:
        try:
            user = ClientUser.objects.get(pk=data['user_id'])
        except ClientUser.DoesNotExist:
            return JsonResponse({'ok': False, 'error': 'Foydalanuvchi topilmadi'})
        cache.delete(key)  # bir martalik
        ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
        ClientLoginAttempt.objects.create(phone=data.get('phone', ''), ip_address=ip, success=True, login_type='web', user=user)
        return _do_login_json(user)
    return JsonResponse({'ok': False, 'error': "Kod noto'g'ri"})


def mini_login_confirm(request, token):
    """GET /mini/login/confirm/<token>/ — bot «✅ Kirish» tugmasi bosilganda.

    Cache token'ni confirmed=True qiladi (login sahifasi poll orqali biladi) VA
    shu brauzerni ham darhol kiritadi (agar foydalanuvchi tugmani shu qurilmada
    bossa — telefonda — to'g'ridan-to'g'ri /spa/ ga o'tadi)."""
    from django.core.cache import cache
    key = _LOGIN_KEY.format((token or '').strip())
    data = cache.get(key)
    if not data or data.get('mode') != 'bot':
        return render(request, 'client_erp/auth/login.html', {
            'error': "Havola eskirgan yoki noto'g'ri. Qaytadan urinib ko'ring.",
        })
    try:
        user = ClientUser.objects.get(pk=data['user_id'], is_active=True, is_blocked=False)
    except ClientUser.DoesNotExist:
        return render(request, 'client_erp/auth/login.html', {'error': "Foydalanuvchi topilmadi."})
    # Poll uchun tasdiqlanган deb belgilaymiz (login sahifasi shu orqali kiradi).
    data['confirmed'] = True
    cache.set(key, data, _LOGIN_TTL)
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
    ClientLoginAttempt.objects.create(phone=data.get('phone', ''), ip_address=ip,
                                      success=True, login_type='web', user=user)
    # Shu brauzerni kiritamiz (bir qurilmali oqim uchun).
    return _do_login(user)


@csrf_exempt
def mini_login_status(request):
    """POST /mini/login/status/ {token} — bot tugma tasdiqini POLL qiladi.

    Boshqa qurilmada (masalan telefon) tugma bosilib confirmed=True bo'lsa —
    shu (login boshlangan) brauzerni ham kiritadi (JWT cookie)."""
    from django.http import JsonResponse
    from django.core.cache import cache
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST kerak'}, status=405)
    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = request.POST
    token = (body.get('token') or '').strip()
    key = _LOGIN_KEY.format(token)
    data = cache.get(key) if token else None
    if data is None:
        return JsonResponse({'ok': False, 'error': "Muddat tugadi", 'expired': True})
    if not data.get('confirmed'):
        return JsonResponse({'ok': True, 'pending': True})
    try:
        user = ClientUser.objects.get(pk=data['user_id'], is_active=True, is_blocked=False)
    except ClientUser.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Foydalanuvchi topilmadi'})
    cache.delete(key)  # bir martalik
    return _do_login_json(user)


@csrf_exempt
def mini_register(request):
    """POST /mini/login/register/ {token, full_name, organization} — kod tasdiqlangач
    yangi ClientUser yaratadi (telefon o'zgarmaydi) va darhol login qiladi. Oferta
    formada qabul qilinadi → oferta_accepted=True."""
    from django.http import JsonResponse
    from django.core.cache import cache
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST kerak'}, status=405)
    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = request.POST
    token = (body.get('token') or '').strip()
    data = cache.get(_LOGIN_KEY.format(token)) if token else None
    if not data or not data.get('register') or not data.get('verified'):
        return JsonResponse({'ok': False, 'error': "Tasdiqlanmagan. Qaytadan boshlang.", 'expired': True})
    phone = data.get('phone') or ''
    full_name = (body.get('full_name') or '').strip()
    if len(full_name) < 2:
        return JsonResponse({'ok': False, 'error': "Ism-familiyani kiriting"})
    organization = (body.get('organization') or '').strip()
    if ClientUser.objects.filter(phone=phone).exists():
        cache.delete(_LOGIN_KEY.format(token))
        return JsonResponse({'ok': False, 'error': "Bu raqam allaqachon ro'yxatdan o'tgan"})

    import secrets as _secrets
    username = ClientUser.generate_username(full_name)
    password = _secrets.token_urlsafe(9)
    # ── 2026-09-23 (additive): sessiyada demo user bo'lsa — YANGI qator
    # emas, o'sha qator convert qilinadi (datasi ko'chadi = o'zida qoladi).
    demo_user = None
    try:
        me = get_client_user(request)
        if me and getattr(me, 'is_demo', False):
            from django.utils import timezone as _tz
            if not me.demo_expires_at or me.demo_expires_at > _tz.now():
                demo_user = me
    except Exception:
        demo_user = None
    if demo_user is not None:
        u = demo_user
        u.phone = phone
        u.username = username
        u.full_name = full_name[:200]
        u.organization = organization[:200]
        u.is_active = True
        u.is_verified = True
        u.is_demo = False
        u.demo_expires_at = None
        u.oferta_accepted = True
        u.oferta_accepted_at = timezone.now()
    else:
        u = ClientUser(
            phone=phone, username=username, full_name=full_name[:200],
            organization=organization[:200], is_active=True, is_verified=True,
            oferta_accepted=True, oferta_accepted_at=timezone.now(),
        )
    u.set_password(password)
    try:
        client_obj = _find_or_link_client(phone)
        if client_obj:
            u.client = client_obj
    except Exception:
        pass
    u.save()
    cache.delete(_LOGIN_KEY.format(token))
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
    ClientLoginAttempt.objects.create(phone=phone, ip_address=ip, success=True, login_type='web', user=u)
    _credit_referrer(data.get('ref'), u)
    # ── 2026-09-23 (additive): kutilayotgan jamoa takliflarini bajarish
    try:
        from client_erp.services.team_invites import claim_pending_invites
        claim_pending_invites(u)
    except Exception:
        pass
    return _do_login_json(u)


@csrf_exempt
def demo_login(request):
    """POST /mini/login/demo/ — 24 soatlik demo akkaunt (2026-09-23, additive).

    Tasodifiy mehmon yaratadi (birovning akkauntiga kirmaydi), 24 soatdan
    keyin user + BARCHA datasi to'liq o'chadi. Hech qanday tasdiqlash
    (SMS/parol) kerak emas.
    """
    from django.http import JsonResponse
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST kerak'}, status=405)
    import secrets as _secrets
    from datetime import timedelta
    for _ in range(5):
        tag = _secrets.token_hex(4)
        phone = 'demo_+%s' % tag
        username = 'demo_' + tag
        if not ClientUser.objects.filter(phone=phone).exists() and \
                not ClientUser.objects.filter(username=username).exists():
            break
    else:
        return JsonResponse({'ok': False, 'error': 'Qayta urining'})
    u = ClientUser(
        phone=phone, username=username, full_name='Mehmon',
        is_active=True, is_verified=True,
        is_demo=True, demo_expires_at=timezone.now() + timedelta(hours=24),
    )
    u.set_password(_secrets.token_urlsafe(16))
    u.save()
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
    try:
        ClientLoginAttempt.objects.create(
            phone=phone, ip_address=ip, success=True, login_type='web', user=u)
    except Exception:
        pass
    return _do_login_json(u)


def _credit_referrer(ref_code, new_user):
    """Do'stni taklif qilgan foydalanuvchiga (referral_code egasiga) yangi
    a'zo ilovaga kirgach XP+tanga beradi. ref_code bo'sh/topilmasa jim o'tadi."""
    ref_code = (ref_code or '').strip()
    if not ref_code:
        return
    try:
        referrer = ClientUser.objects.filter(referral_code=ref_code).exclude(pk=new_user.pk).first()
        if not referrer:
            return
        referrer.referral_count = (referrer.referral_count or 0) + 1
        referrer.xp += 30
        referrer.coins += 20
        referrer.coins_total_earned += 20
        referrer.save(update_fields=['referral_count', 'xp', 'coins', 'coins_total_earned'])
        from client_erp.services.gamification import _check_level_up
        _check_level_up(referrer)
        from client_erp.services.realtime import push_wallet_update
        push_wallet_update(referrer)
        from client_erp.services.notifications import notify_referral_joined
        notify_referral_joined(referrer, new_user.full_name)
    except Exception:
        logging.getLogger(__name__).exception("Referral credit xato")


def mini_logout(request):
    """GET /mini/logout/"""
    response = redirect('/mini/login/')
    response.set_cookie(TOKEN_COOKIE, '', max_age=0, httponly=True, samesite='Lax')
    return response


def mini_auto_login(request, token):
    """GET /mini/auto/<token>/ — Telegram dan brauzerga avtomatik kirish."""
    from django.core import signing
    try:
        data = signing.loads(token)
    except signing.BadSignature:
        return render(request, 'client_erp/auth/login.html', {
            'error': "Havola eskirgan yoki noto'g'ri. Botdan yangi link oling.",
        })
    chat_id = data.get('cid')
    if not chat_id:
        return render(request, 'client_erp/auth/login.html', {'error': "Noto'g'ri havola."})
    try:
        user = ClientUser.objects.get(telegram_chat_id=chat_id, is_active=True, is_blocked=False)
    except ClientUser.DoesNotExist:
        return render(request, 'client_erp/auth/login.html', {
            'error': "Foydalanuvchi topilmadi. Avval Telegram orqali ro'yxatdan o'ting.",
        })
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
    ClientLoginAttempt.objects.create(phone=user.phone, ip_address=ip, success=True, login_type='qr', user=user)
    # `?tg=1` saqlab qolinadi — Telegram WebApp skripti keyingi SPA
    # sahifasida ham yuklansin (2026-09-03, laylo_handler.py bilan bir xil).
    _redirect = f'/mini/{user.username}/spa/?tg=1' if request.GET.get('tg') == '1' else None
    return _do_login(user, redirect_url=_redirect)


def generate_auto_login_token(telegram_chat_id):
    """Telegram chat_id uchun doimiy signed token yaratadi."""
    from django.core import signing
    return signing.dumps({'cid': telegram_chat_id})


# ===========================================================================
# TELEGRAM WEBAPP AUTH
# ===========================================================================

def _get_bot_token():
    """DB dan birinchi faol bot tokenini oladi."""
    try:
        from telegram_bot.models import Bot
        bot = Bot.objects.filter(is_active=True).first()
        return bot.token if bot else None
    except Exception:
        return None


def validate_telegram_webapp(init_data: str, bot_token: str):
    """Telegram WebApp initData ni HMAC-SHA256 bilan tekshiradi.

    Returns: (is_valid: bool, user_data: dict)
    user_data: {'id': 123, 'first_name': '...', 'last_name': '...', 'username': '...'}
    """
    try:
        parsed = parse_qs(init_data, keep_blank_values=True)
        received_hash = parsed.get("hash", [""])[0]
        if not received_hash:
            return False, {}

        # hash ni olib tashlab, qolganlarini alifbo tartibida joylash
        data_pairs = []
        for key in sorted(parsed.keys()):
            if key == "hash":
                continue
            data_pairs.append(f"{key}={parsed[key][0]}")
        data_check_string = "\n".join(data_pairs)

        # HMAC-SHA256 tekshiruv
        secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

        if calculated_hash != received_hash:
            return False, {}

        # auth_date tekshiruv (24 soat ichida bo'lishi kerak)
        auth_date = int(parsed.get("auth_date", ["0"])[0])
        if abs(time.time() - auth_date) > 86400:
            return False, {}

        # user ma'lumotlarini olish
        user_json = parsed.get("user", ["{}"])[0]
        user_data = json.loads(user_json)
        return True, user_data

    except Exception as e:
        logger.error("Telegram initData validate xato: %s", e)
        return False, {}


def _send_password_via_bot(chat_id, phone, password):
    """Generatsiya qilingan parolni bot orqali Telegram chatga yuboradi."""
    bot_token = _get_bot_token()
    if not bot_token:
        return
    text = (
        f"🔐 <b>Bittada Usta parolingiz</b>\n\n"
        f"📱 Login: <code>{phone}</code>\n"
        f"🔑 Parol: <code>{password}</code>\n\n"
        f"⚠️ Bu parolni xavfsiz joyda saqlang.\n"
        f"Keyinchalik Bittada Usta sozlamalarida o'zgartirishingiz mumkin."
    )
    try:
        http_requests.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            timeout=10,
        )
    except Exception as e:
        logger.error("Parolni yuborishda xato: %s", e)


def _find_or_link_client(phone):
    """Katta ERP dagi Client ni telefon bo'yicha topadi."""
    try:
        from clients.models import Client
        digits = ''.join(c for c in phone if c.isdigit())[-9:]
        if len(digits) >= 9:
            return Client.objects.using('tenant_mebelcity').filter(
                phone__endswith=digits
            ).first()
    except Exception:
        pass
    return None


def mini_telegram_auth(request):
    """Telegram WebApp dan avtologin yoki ro'yxatdan o'tish.

    GET: initData tekshirish → avtologin yoki so'rovnoma
    POST: so'rovnomani qabul qilish → yangi user yaratish
    """
    bot_token = _get_bot_token()
    if not bot_token:
        return render(request, 'client_erp/auth/telegram_register.html', {
            'error': 'Bot sozlanmagan. Admin bilan bog\'laning.',
        })

    if request.method == 'POST':
        return _telegram_auth_register(request, bot_token)

    # GET — Telegram WebApp ochilganda
    # initData JS orqali yuboriladi (sahifa o'zi POST qiladi)
    return render(request, 'client_erp/auth/telegram_register.html', {
        'step': 'init',
    })


def _telegram_auth_register(request, bot_token):
    """Telegram auth POST — initData tekshirish + avtologin/register."""
    init_data = request.POST.get('initData', '')
    if not init_data:
        return render(request, 'client_erp/auth/telegram_register.html', {
            'error': 'Telegram ma\'lumotlari topilmadi. Iltimos, botdan qayta oching.',
        })

    is_valid, tg_user = validate_telegram_webapp(init_data, bot_token)
    if not is_valid:
        return render(request, 'client_erp/auth/telegram_register.html', {
            'error': 'Telegram tekshiruvi muvaffaqiyatsiz. Qayta urinib ko\'ring.',
        })

    tg_id = tg_user.get('id')
    tg_first = tg_user.get('first_name', '')
    tg_last = tg_user.get('last_name', '')
    tg_username = tg_user.get('username', '')

    if not tg_id:
        return render(request, 'client_erp/auth/telegram_register.html', {
            'error': 'Telegram foydalanuvchi ID topilmadi.',
        })

    # 1. telegram_chat_id bo'yicha qidirish (avtologin)
    try:
        user = ClientUser.objects.get(telegram_chat_id=tg_id, is_active=True, is_blocked=False)
        if tg_username and not user.telegram_username:
            user.telegram_username = tg_username
            user.save(update_fields=['telegram_username'])
        return _do_login_telegram(user)
    except ClientUser.DoesNotExist:
        pass

    # 2. So'rovnoma POST (register)
    action = request.POST.get('action', '')
    verified_phone = _normalize_phone(_get_phone_from_contact(tg_id))

    if action == 'register':
        full_name = request.POST.get('full_name', '').strip()
        organization = request.POST.get('organization', '').strip()
        phone = verified_phone or _normalize_phone(request.POST.get('phone', '').strip())

        if not full_name:
            return render(request, 'client_erp/auth/telegram_register.html', {
                'step': 'register',
                'tg_user': tg_user,
                'init_data': init_data,
                'phone': phone,
                'phone_verified': bool(verified_phone),
                'error': 'Ism familiyani kiriting.',
            })

        if not phone:
            return render(request, 'client_erp/auth/telegram_register.html', {
                'step': 'register',
                'tg_user': tg_user,
                'init_data': init_data,
                'full_name': full_name,
                'organization': organization,
                'phone_verified': False,
                'error': 'Telefon raqamini kiriting.',
            })

        # Mavjud telefon tekshiruvi
        existing = ClientUser.objects.filter(phone=phone).first()
        if existing:
            existing.telegram_chat_id = tg_id
            existing.telegram_username = tg_username
            existing.save(update_fields=['telegram_chat_id', 'telegram_username'])
            return _do_login_telegram(existing)

        # Yangi user yaratish
        password = str(random.randint(100000, 999999))
        username = ClientUser.generate_username(full_name)
        new_user = ClientUser(
            phone=phone,
            username=username,
            full_name=full_name,
            organization=organization,
            telegram_chat_id=tg_id,
            telegram_username=tg_username,
            is_active=True,
            is_verified=True,
        )
        new_user.set_password(password)
        client_obj = _find_or_link_client(phone)
        if client_obj:
            new_user.client = client_obj
        new_user.save()

        # Parolni bot orqali yuborish (chat_id bo'lsa)
        if tg_id:
            _send_password_via_bot(tg_id, phone, password)

        # Parol EKRANDA ham bir marta ko'rsatiladi — bot yuborilmasa (chat_id
        # yo'q/xato) foydalanuvchi parolsiz qolmasin. "Davom etish" tugmasi
        # SPA'ga olib kiradi; login cookie shu javobning o'zida o'rnatiladi.
        new_user.last_login = timezone.now()
        new_user.save(update_fields=['last_login'])
        ClientLoginAttempt.objects.create(
            phone=new_user.phone, ip_address='0.0.0.0',
            success=True, login_type='telegram', user=new_user,
        )
        # ── 2026-09-23 (additive): kutilayotgan jamoa takliflarini bajarish
        try:
            from client_erp.services.team_invites import claim_pending_invites
            claim_pending_invites(new_user)
        except Exception:
            pass
        token = generate_token(new_user)
        response = render(request, 'client_erp/auth/telegram_register.html', {
            'step': 'done',
            'tg_user': tg_user,
            'new_login': phone,
            'new_password': password,
            'spa_url': f'/mini/{new_user.username}/spa/?tg=1',
        })
        response.set_cookie(
            TOKEN_COOKIE, token,
            max_age=30 * 24 * 3600, httponly=True,
            samesite='None', secure=True,
        )
        return response

    # 3. So'rovnoma sahifasini ko'rsatish
    return render(request, 'client_erp/auth/telegram_register.html', {
        'step': 'register',
        'tg_user': tg_user,
        'init_data': init_data,
        'full_name': f"{tg_first} {tg_last}".strip(),
        'phone': verified_phone or '',
        'phone_verified': bool(verified_phone),
    })


def _get_phone_from_contact(tg_id):
    """MessageLog dan contact orqali yuborilgan raqamni topadi."""
    try:
        from telegram_bot.models import MessageLog
        log = MessageLog.objects.filter(
            chat_id=str(tg_id),
            direction='in',
            raw__has_key='contact_phone',
        ).order_by('-created_at').first()
        if log:
            return log.raw.get('contact_phone', '')
    except Exception:
        pass
    return ''


def _do_login_telegram(user):
    """Telegram WebApp uchun login — SameSite=None cookie."""
    user.last_login = timezone.now()
    user.save(update_fields=['last_login'])
    ClientLoginAttempt.objects.create(
        phone=user.phone, ip_address='0.0.0.0',
        success=True, login_type='telegram', user=user,
    )
    token = generate_token(user)
    url = f'/mini/{user.username}/spa/?tg=1'
    response = redirect(url)
    response.set_cookie(
        TOKEN_COOKIE, token,
        max_age=30 * 24 * 3600,
        httponly=True,
        samesite='None',
        secure=True,
    )
    response['X-Telegram-Auth'] = 'ok'
    return response
