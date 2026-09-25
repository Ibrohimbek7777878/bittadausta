"""client_erp/middleware.py — Mini ERP auth middleware."""
import re
from django.http import HttpResponseRedirect
from .auth_backend import get_client_user

# /mini/<uuid>/ — mijozga ochiq buyurtma-holati sahifasi (authsiz)
# /mini/panorama/<uuid>/ — shu sahifadagi 🥽 vizualizatsiya viewer'i (authsiz)
# /mini/room/s/<uuid>/ — 3D Room viewer (authsiz)
_SHARE_UUID_RE = re.compile(
    r'^/mini/(panorama/|room/s/)?'
    r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(/.*)?$'
)


class ClientERPMiddleware:
    """
    /mini/ URL lari uchun ClientUser auth tekshiruvi.
    Django session ga TEGINMAYDI — faqat JWT cookie tekshiradi.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path

        # Faqat /mini/ URL larga ta'sir qiladi
        if not path.startswith('/mini/'):
            return self.get_response(request)

        # Login, admin, BOM standart (is_staff) va public URL larga ruxsat (Django auth ishlatadi)
        # /mini/login/* — login, login/start, login/status, login/confirm (Telegram 2FA)
        # DIQQAT: aniq prefiks — `/mini/admin` startswith `/mini/administrator/` ni ham
        # qamrab, auth'siz o'tkazib mini_spa'ni client_user'siz chaqirardi (500). Shuning
        # uchun `/mini/admin/` (slash bilan) yoki aynan `/mini/admin`.
        if path.startswith('/mini/login') or path.startswith('/mini/logout') \
                or path in ('/mini/telegram-auth/', '/mini/telegram-auth') or path.startswith('/mini/static/') \
                or path == '/mini/admin' or path.startswith('/mini/admin/') \
                or path == '/mini/bom-settings' or path.startswith('/mini/bom-settings/') \
                or path.startswith('/mini/portal/') \
                or path.startswith('/mini/detal/') \
                or path.startswith('/mini/auto/'):
            return self.get_response(request)

        # Huquqiy public sahifalar (Payme moderatsiyasi) — anonim ochiladi (login'ga tushmaydi).
        # usta.bittada.uz da nginx /oferta/ → /mini/oferta/ qiladi; shu whitelist ularni ochiq qoldiradi.
        # 2026-09-03: /sotuv-roadmap.html ham shu tarzda (statik marketing
        # sahifa, config/urls.py'da to'g'ridan-to'g'ri path() bilan
        # ro'yxatga olingan) — anonim ochiq bo'lishi kerak.
        if path in ('/mini/oferta/', '/mini/terms/', '/mini/return-policy/', '/mini/contacts/',
                    '/mini/privacy/', '/mini/data-deletion/', '/mini/robots.txt',
                    '/mini/sotuv-roadmap.html',
                    '/mini/sotuv-ssenariysi.html',
                    '/mini/sotuv-ssenariysi/save/',   # 2026-09-11 VAQTINCHALIK
                    '/mini/android-privacy.html',     # 2026-09-12 Play Data Safety
                    '/mini/android-account-deletion.html'):  # Play akkaunt o'chirish URL
            return self.get_response(request)

        # Mijozga ochiq buyurtma-holati (/mini/<uuid>/) — anonim ko'rish
        if _SHARE_UUID_RE.match(path):
            return self.get_response(request)

        # Payme Merchant callback — Payme serveri (cookie yo'q, Basic auth view ичida).
        # usta: /api/payments/payme/ → nginx → /mini/api/payments/payme/
        if path == '/mini/api/payments/payme/':
            return self.get_response(request)

        # Bazis smeta PDF (/mini/bom/...) — auth kerak, lekin IDOR username tekshiruvi
        # o'tkazilmaydi (path'da username yo'q). Egalik view ichida tekshiriladi.
        if path.startswith('/mini/bom/'):
            client_user = get_client_user(request)
            if not client_user:
                return HttpResponseRedirect('/mini/login/')
            request.client_user = client_user
            return self.get_response(request)

        # ── 📡 LAZER KO'PRIGI (2026-08-17) ────────────────────────────────
        # Lazer FAQAT Chrome'da ulanadi, bot esa WebView — shuning uchun
        # havola tashqi brauzerda ochiladi va u yerda SESSIYA YO'Q.
        # `?k=` — qisqa muddatli IMZOLANGAN kalit (30 daq). U sessiya
        # BERMAYDI: faqat lazer sahifasini ochish va o'lchov yuborish.
        # Tekshiruv view ichida (`views/lazer.py`), bu yerda faqat o'tkazamiz.
        if path.endswith('/lazer/') and request.GET.get('k'):
            return self.get_response(request)
        # ── XATO JURNALI (2026-08-24) ────────────────────────────────────
        # Auth SHART EMAS va shart ham bo'lmasligi kerak: xato aynan
        # sessiya/login buzilganda yozilishi kerak. Aks holda eng muhim
        # xatolar («qaytadan registratsiya so'rayapti» kabi) jurnalga
        # umuman tushmasdi. Yozuvda maxfiy ma'lumot yo'q, tezlik cheklovi
        # view ichida (IP ga 60/daqiqa).
        if path == '/mini/api/client-error/':
            return self.get_response(request)
        if path == '/mini/api/lazer-push/':
            return self.get_response(request)

        # ── PWA (2026-08-24) ─────────────────────────────────────────────
        # `sw.js` login'siz ham berilishi SHART — brauzer uni sessiyasiz
        # so'raydi. `manifest.json` esa sessiya bilan chaqiriladi
        # (`crossorigin=use-credentials`) va foydalanuvchini bilsa
        # `start_url` ni uning sahifasiga qo'yadi; bilmasa — login'ga.
        # Ikkalasida ham maxfiy ma'lumot YO'Q.
        if path in ('/mini/sw.js', '/mini/manifest.json'):
            try:
                request.client_user = get_client_user(request)
            except Exception:
                request.client_user = None
            return self.get_response(request)

        # BLE lazer drayverlari — FAQAT O'QISH, maxfiy ma'lumot yo'q
        # (qurilma nomi, servis UUID). usta.bittada.uz da nginx
        # /api/v2/widget-zamer/... → /mini/api/... qiladi va middleware 401
        # qaytarib, panelda «Driverlar yuklanmadi» chiqardi (2026-08-15).
        if path.startswith('/mini/api/v2/widget-zamer/ble-drivers/') and request.method == 'GET':
            return self.get_response(request)

        # API URL larda auth — client_user set qilib davom etadi (401 agar yo'q)
        if path.startswith('/mini/api/'):
            client_user = get_client_user(request)
            if client_user:
                request.client_user = client_user
            else:
                from django.http import JsonResponse
                return JsonResponse({'ok': False, 'error': 'Auth kerak'}, status=401)
            return self.get_response(request)

        # Auth tekshiruvi
        client_user = get_client_user(request)
        if not client_user:
            return HttpResponseRedirect('/mini/login/')

        # IDOR himoya — URL dagi username == session dagi user
        parts = path.strip('/').split('/')
        if len(parts) >= 2:
            url_username = parts[1]
            if url_username != 'login' and url_username != client_user.username:
                return HttpResponseRedirect(f'/mini/{client_user.username}/')

        # request ga client_user ni biriktirish
        request.client_user = client_user
        return self.get_response(request)
