"""client_erp/views/pwa.py — Ilovani bosh ekranga qo'yish (PWA), 2026-08-24.

Nega kerak: Telegram WebView'da `navigator.bluetooth` YO'Q — lazer
o'lchagich bot ichida hech qachon ishlamaydi (Telegram cheklovi, kod bilan
aylanib o'tib bo'lmaydi). Yagona yechim — ilovani Chrome dvigatelida
ishlatish. PWA buni beradi, lekin foydalanuvchi uchun u ODDIY ILOVA
ko'rinishida bo'ladi: bosh ekranda ikonka, brauzer paneli yo'q.

⚠️ IKKI XOST, IKKI YO'L PREFIKSI:
  · usta.bittada.uz      — nginx `/x` → `/mini/x` qiladi  →  prefiks: ''
  · mebelcity.bittada.uz — to'g'ridan-to'g'ri                →  prefiks: '/mini'
Shuning uchun manifest DINAMIK: `scope` va `start_url` xostga qarab
hisoblanadi. Statik fayl bilan buni qilib bo'lmasdi.

⚠️ Bu modul mavjud HECH NARSAGA tegmaydi — faqat 2 ta yangi yo'l qo'shadi.
"""
from django.http import HttpResponse, JsonResponse

APP_NAME = 'Bittada Usta'
THEME = '#14171b'


def _prefix(request):
    """usta.bittada.uz da nginx `/mini` ni o'zi qo'shadi — havolalarda
    u KO'RINMASLIGI kerak. Boshqa xostlarda `/mini` kerak."""
    host = (request.get_host() or '').split(':')[0].lower()
    return '' if host.startswith('usta.') else '/mini'


def manifest_json(request):
    """GET /mini/manifest.json — ilova pasporti.

    `<link rel="manifest" crossorigin="use-credentials">` bilan chaqiriladi,
    shuning uchun sessiya cookie yetib keladi va `start_url` aynan shu
    foydalanuvchining sahifasiga qo'yiladi.
    """
    p = _prefix(request)
    user = getattr(request, 'client_user', None)
    start = f"{p}/{user.username}/spa/?src=pwa" if user else f"{p}/login/?src=pwa"

    data = {
        'id': f"{p}/?bittada-usta",
        'name': APP_NAME,
        'short_name': 'Usta',
        'description': "Mebel ustasi uchun ERP — zakaz, o'lchov, moliya, 3D",
        'lang': 'uz',
        'dir': 'ltr',
        'start_url': start,
        'scope': f"{p}/",
        'display': 'standalone',
        'display_override': ['standalone', 'minimal-ui'],
        'orientation': 'portrait-primary',
        'background_color': THEME,
        'theme_color': THEME,
        'categories': ['business', 'productivity'],
        'icons': [
            {'src': '/static/client_erp/pwa/icon-192.png',
             'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': '/static/client_erp/pwa/icon-512.png',
             'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': '/static/client_erp/pwa/icon-maskable.png',
             'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
    }
    resp = JsonResponse(data)
    resp['Content-Type'] = 'application/manifest+json'
    resp['Cache-Control'] = 'no-cache'
    return resp


# ⚠️ SERVICE WORKER — ATAYLAB HECH NARSA KESHLAMAYDI.
# Sabab: platformada `?v=N` bilan kesh yangilash tizimi bor
# ([[feedback_static-cache-bust]]). SW kesh qilsa eski JS/CSS qotib qolardi
# va har o'zgarishda «nega o'zgarmadi?» muammosi qaytardi. SW faqat PWA
# o'rnatilishi uchun TALAB qilinadi — boshqa vazifasi yo'q.
# ⚠️ 2026-08-25: foydalanuvchi «bosh ekranga qo'yish» taklifidan voz kechdi
# (o'rniga APK). Shuning uchun SW endi FAQAT O'ZINI O'CHIRADI — ilgari
# ro'yxatdan o'tgan qurilmalarda ham iz qolmasin.
SW_JS = """/* Bittada Usta — service worker O'CHIRILDI (2026-08-25).
 * Ilgari ro'yxatdan o'tgan bo'lsa — o'zini ro'yxatdan chiqaradi.
 */
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (err) {}
    try { await self.registration.unregister(); } catch (err) {}
    try {
      var cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach(function (c) { try { c.navigate(c.url); } catch (e) {} });
    } catch (err) {}
  })());
});
"""


def service_worker(request):
    """GET /mini/sw.js — usta.bittada.uz da `/sw.js` bo'lib ko'rinadi,
    shuning uchun qamrovi (scope) butun saytga yetadi."""
    resp = HttpResponse(SW_JS, content_type='application/javascript')
    resp['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp['Service-Worker-Allowed'] = '/'
    return resp


def open_link(request):
    """GET /mini/api/pwa/open-link/ — Telegram'dan Chrome'ga o'tish havolasi.

    Mavjud `mini_auto_login` (`/mini/auto/<token>/`) qayta ishlatiladi —
    unga TEGILMAYDI. Foydalanuvchi Chrome'da qayta login qilmaydi.

    `auto=1` — Chrome'da ochilgach «Bosh ekranga qo'shish» oynasi
    DARHOL chiqishi uchun belgi.
    """
    user = getattr(request, 'client_user', None)
    p = _prefix(request)
    base = f"{request.scheme}://{request.get_host()}"

    # Telegram bilan bog'langan bo'lsa — avtomatik kirish havolasi
    if user is not None and getattr(user, 'telegram_chat_id', None):
        try:
            from client_erp.views.auth import generate_auto_login_token
            token = generate_auto_login_token(int(user.telegram_chat_id))
            return JsonResponse({
                'url': f"{base}{p}/auto/{token}/?src=pwa&auto=1",
                'auto_login': True,
            })
        except Exception:                                       # noqa: BLE001
            pass

    # Bog'lanmagan bo'lsa — oddiy havola (Chrome'da login so'raladi)
    if user is not None:
        return JsonResponse({'url': f"{base}{p}/{user.username}/spa/?src=pwa&auto=1",
                             'auto_login': False})
    return JsonResponse({'url': f"{base}{p}/login/?src=pwa&auto=1", 'auto_login': False})
