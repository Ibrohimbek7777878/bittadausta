"""client_erp/views/lazer.py — 📡 LAZER KO'PRIGI (2026-08-17).

MUAMMO
    Barcha ustalar ilovaga bot (Telegram Mini App) ichidan kiradi, u esa
    Android WebView — WebView'da Web Bluetooth API UMUMAN YO'Q. Lazer faqat
    Chrome'da ulanadi. Havolani tashqi brauzerda ochganda esa sessiya
    (JWT cookie) BO'LMAYDI va foydalanuvchi login sahifasiga tushib qoladi.

YECHIM — QISQA MUDDATLI IMZOLANGAN KALIT
    Ilova `lazer.link` orqali kalit oladi va Chrome'da shu havola ochiladi.
    Kalit:
      • `django.core.signing` bilan imzolangan (buzib bo'lmaydi)
      • 30 daqiqada kuchini yo'qotadi
      • FAQAT ikki ishga yaraydi: lazer sahifasini ochish va o'lchov yuborish

⚠️ QAT'IY CHEGARA: kalit SESSIYA BERMAYDI — cookie o'rnatilmaydi, ilovaga
    kirish, moliyani ko'rish, hech narsani o'zgartirish IMKONI YO'Q. Faqat
    «shu foydalanuvchiga mm yuborish». Shu sababli havola birovga tushsa ham
    zarari yo'q (eng ko'pi — noto'g'ri o'lcham yuboradi).
"""
import json
import logging

from django.core import signing
from django.http import JsonResponse, Http404
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

logger = logging.getLogger(__name__)

SALT = 'client_erp.lazer.bridge'
# ⚠️ 2026-08-24: 30 daqiqa KAM edi — usta tugmani bosib, brauzerni keyinroq
# ochsa kalit eskirib «registratsiya» sahifasi chiqardi. Kalit FAQAT mm
# qiymatini yuborishga yaraydi (sessiya bermaydi), shuning uchun 12 soat
# xavfsiz.
MAX_AGE = 60 * 60 * 12     # 12 soat


def make_key(user):
    """Foydalanuvchi uchun qisqa muddatli lazer-kaliti."""
    return signing.dumps({'uid': user.pk, 'u': user.username}, salt=SALT)


def read_key(key, username=None):
    """Kalitni tekshiradi. Yaroqsiz/muddati o'tgan bo'lsa None."""
    if not key:
        return None
    try:
        data = signing.loads(key, salt=SALT, max_age=MAX_AGE)
    except signing.BadSignature:
        return None
    if username and data.get('u') != username:
        return None
    return data


def lazer_page(request, username):
    """/mini/<username>/lazer/ — lazer sahifasi.

    Ikki yo'l bilan ochiladi:
      1) `?k=<kalit>` bilan — tashqi brauzerda (login SHART EMAS)
      2) oddiy sessiya bilan — kompyuterda ilovadan o'tilsa
    """
    key = request.GET.get('k') or ''
    data = read_key(key, username)
    if data:
        return render(request, 'client_erp/lazer.html', {
            'lazer_username': username, 'lazer_key': key,
        })

    # Kalitsiz — sessiya bo'lishi shart (middleware allaqachon tekshirgan)
    user = getattr(request, 'client_user', None)
    if user is None or user.username != username:
        # ⚠️ 2026-08-24: ilgari bu yerda 404/login sahifasi chiqardi va
        # foydalanuvchi «qaytadan registratsiya so'rayapti» deb tushunardi.
        # Endi TUSHUNARLI xabar: kalit eskirgan yoki havola noto'g'ri —
        # ilovadan qayta ochish kerak.
        from django.http import HttpResponse
        _why = ('Havola muddati tugagan' if key else 'Havolada kalit yo\'q')
        return HttpResponse(
            '<!doctype html><meta charset=utf-8>'
            '<meta name=viewport content="width=device-width,initial-scale=1">'
            '<div style="font-family:system-ui;background:#14171b;color:#e7e4de;'
            'min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'padding:24px;text-align:center">'
            '<div style="max-width:420px">'
            '<div style="font-size:46px">🔑</div>'
            '<h2 style="margin:12px 0 8px">Lazer havolasi ishlamadi</h2>'
            '<p style="color:#9aa0a0;line-height:1.6">' + _why + '.<br>'
            'Bu sahifani <b>to\'g\'ridan-to\'g\'ri ochib bo\'lmaydi</b> — '
            'ilovadagi <b>«Qurilmaga ulanish»</b> tugmasi orqali oching.</p>'
            '<p style="color:#6b7280;font-size:.85rem;margin-top:18px">'
            'Havola 12 soat amal qiladi.</p>'
            '</div></div>', status=200)
    return render(request, 'client_erp/lazer.html', {
        'lazer_username': username, 'lazer_key': make_key(user),
    })


def lazer_key(request, username):
    """GET /mini/<username>/lazer-key/ → {"url": "...?k=<kalit>"}

    Nega kerak (2026-08-24): `openBridge()` kalitni WS orqali olardi.
    WS ulanmagan yoki javob bermagan holatda sahifa KALITSIZ ochilib,
    login sahifasiga tushardi — foydalanuvchi «qaytadan registratsiya
    so'rayapti» deb shikoyat qilgan. Endi HTTP zaxira yo'li bor.
    """
    user = getattr(request, 'client_user', None)
    if not user or user.username != username:
        return JsonResponse({'ok': False, 'error': 'auth'}, status=403)
    key = make_key(user)
    return JsonResponse({
        'ok': True,
        'url': f"{request.scheme}://{request.get_host()}/mini/{username}/lazer/?k={key}",
    })


@csrf_exempt
@require_POST
def lazer_push(request):
    """POST /mini/api/lazer-push/ — Chrome'dagi lazerdan kelgan o'lchov.

    Body: {"k": "<kalit>", "mm": 1250}
    Kalit yaroqli bo'lsa — o'lchov foydalanuvchining WS guruhiga uzatiladi
    (bot ichidagi oyna qabul qilib maydonga yozadi).
    """
    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'json'}, status=400)

    data = read_key(body.get('k'))
    if not data:
        return JsonResponse({'ok': False, 'error': 'Kalit muddati tugadi — '
                                                   'ilovadan qayta oching'}, status=403)
    try:
        mm = int(round(float(body.get('mm') or 0)))
    except (TypeError, ValueError):
        return JsonResponse({'ok': False, 'error': 'mm'}, status=400)
    if mm <= 0:
        return JsonResponse({'ok': False, 'error': 'mm 0'}, status=400)

    # WS guruhiga uzatish — guruh nomi tenant-scoped (cross-tenant leak yo'q)
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        from tenant_manager.middleware import get_current_db_alias
        from tenant_manager.ws_groups import tgroup
        group = tgroup(get_current_db_alias(), f"mini_user_{data['uid']}")
        async_to_sync(get_channel_layer().group_send)(group, {
            'type': 'ble.measure',
            'data': {'mm': mm, 'source': 'lazer'},
        })
    except Exception:                                             # noqa: BLE001
        logger.warning('[lazer] o\'lchovni uzatib bo\'lmadi', exc_info=True)
        return JsonResponse({'ok': False, 'error': 'uzatilmadi'}, status=500)
    return JsonResponse({'ok': True, 'mm': mm})
