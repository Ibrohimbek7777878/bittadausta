"""client_erp/views/detal_qr.py — Detal QR: ochiq (login talab qilmaydi) sahifa.

TZ-Detal-QR-2026-09.md, TZ-Detal-QR-Interaktiv-3D-2026-09.md. Oqim:
  GET /mini/detal/<short_code>/     — kartochka sahifasi (interaktiv 3D, yoki
                                       panel_data bo'sh bo'lsa statik rasm)
  GET /mini/detal/<short_code>/qr/  — QR-kod PNG (portal_qr bilan bir xil naqsh, client_erp/views/portal.py)

XAVFSIZLIK: bu sahifa TO'LIQ OCHIQ (client_erp/middleware.py da istisno,
portal_view bilan bir xil naqsh). Faqat short_code orqali topiladi — moliyaviy
ma'lumot yo'q, faqat rasm+matn+geometriya.
"""
import json

from django.http import HttpResponse, Http404
from django.shortcuts import render

from ..models import ClientDetalCard


def detal_qr_view(request, short_code):
    card = ClientDetalCard.objects.filter(short_code=short_code).first()
    if not card:
        raise Http404
    # 2026-09-04 (TZ-Detal-QR-Interaktiv-3D): panel_data bo'lsa (`.b3d`
    # orqali yaratilgan) — interaktiv 3D ko'ruvchi; bo'sh bo'lsa (`image`
    # orqali qo'lda yuklangan eski/oddiy kartochka) — statik rasm (zaxira).
    # `</script>`dan himoya — panel nomi ichida shunga o'xshash matn bo'lsa
    # inline <script> bloki erta yopilib qolmasin (XSS emas, lekin sahifani
    # buzadi). json.dumps o'zi HTML-maxsus belgilarni escape qilmaydi.
    _panel_json = json.dumps(card.panel_data) if card.panel_data else '[]'
    _panel_json = _panel_json.replace('</', '<\\/')
    return render(request, 'client_erp/detal_qr.html', {
        'card': card,
        'has_3d': bool(card.panel_data),
        'panel_data_json': _panel_json,
    })


def detal_qr_png(request, short_code):
    card = ClientDetalCard.objects.filter(short_code=short_code).first()
    if not card:
        raise Http404

    import qrcode
    from io import BytesIO
    url = request.build_absolute_uri(f'/mini/detal/{card.short_code}/')
    img = qrcode.make(url)
    buf = BytesIO()
    img.save(buf, format='PNG')
    return HttpResponse(buf.getvalue(), content_type='image/png')
