"""
client_erp/views/portal.py — Mijoz portali: ochiq (public, login talab qilmaydi) sahifa.

Oqim:
  GET  /mini/portal/<uuid>/          — shartnoma (status=sent) YOKI kuzatuv (status=confirmed)
  POST /mini/portal/<uuid>/confirm/  — mijoz tasdiqlaydi -> ClientOrder ishga tushadi
  POST /mini/portal/<uuid>/reject/   — mijoz rad etadi, izoh MAJBURIY
  GET  /mini/portal/<uuid>/qr/       — QR-kod PNG (portal linkidan)

XAVFSIZLIK: bu sahifa TO'LIQ OCHIQ (client_erp/middleware.py da istisno).
Faqat UUID orqali topiladi — hech qanday moliyaviy/shaxsiy ma'lumot URL'da yo'q.
O'CHIRISH funksiyasi bu yerda ATAYLAB yo'q — faqat 'confirmed'/'rejected'ga o'tadi.
"""
import logging

from django.http import JsonResponse, HttpResponse, Http404
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import ClientContract

logger = logging.getLogger('client_erp.portal')


def _client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def portal_view(request, contract_uuid):
    contract = ClientContract.objects.select_related('order').filter(uuid=contract_uuid).first()
    if not contract:
        raise Http404

    order = contract.order
    ctx = {'contract': contract, 'order': order}

    if contract.status == 'confirmed':
        # FAQAT jarayon (bosqichlar) — moliyaviy ma'lumot (summa/kirim-chiqim) mijozga ko'rsatilmaydi
        stages = list(order.stages.select_related('assigned_to').order_by('sort_order', 'id'))
        total = len(stages)
        done = sum(1 for s in stages if s.status == 'completed')
        progress = round(done / total * 100) if total else 0

        # ── Mini ERP ulash gate (2026-07-09 TZ): buyurtma MebelCity'ga
        # ulanmagunicha mijoz REAL-TIME etap progressini KO'RMAYDI —
        # etaplar ro'yxati ko'rinadi, lekin qaysi bosqichga yetgani yashirin.
        # Faqat Big One (bigone_cl2) buyurtmalari uchun. FAIL-OPEN.
        progress_hidden = False
        try:
            if order.owner and order.owner.username == 'bigone_cl2':
                linked = bool(order.mebelcity_order_id) or order.stages.filter(
                    mebelcity_order_id__isnull=False,
                ).exists()
                progress_hidden = not linked
        except Exception:
            logger.exception('portal progress gate xato — fail-open')
            progress_hidden = False

        ctx.update({
            'stages': stages,
            'progress': progress,
            'is_completed': total > 0 and done == total,
            'progress_hidden': progress_hidden,
        })

    return render(request, 'client_erp/portal.html', ctx)


@csrf_exempt
@require_http_methods(['POST'])
def portal_confirm(request, contract_uuid):
    contract = ClientContract.objects.select_related('order').filter(uuid=contract_uuid).first()
    if not contract:
        return JsonResponse({'ok': False, 'error': 'Topilmadi'}, status=404)
    if contract.status != 'sent':
        return JsonResponse({'ok': False, 'error': 'Bu shartnoma allaqachon hal qilingan'}, status=400)

    contract.status = 'confirmed'
    contract.confirmed_at = timezone.now()
    contract.confirmed_ip = _client_ip(request)
    contract.save(update_fields=['status', 'confirmed_at', 'confirmed_ip'])

    order = contract.order
    if order.status == 'new':
        order.status = 'in_progress'
        order.save(update_fields=['status'])

    logger.info('Shartnoma tasdiqlandi: contract=%s order=%s ip=%s',
                contract.uuid, order.pk, contract.confirmed_ip)
    return JsonResponse({'ok': True})


@csrf_exempt
@require_http_methods(['POST'])
def portal_reject(request, contract_uuid):
    contract = ClientContract.objects.select_related('order').filter(uuid=contract_uuid).first()
    if not contract:
        return JsonResponse({'ok': False, 'error': 'Topilmadi'}, status=404)
    if contract.status != 'sent':
        return JsonResponse({'ok': False, 'error': 'Bu shartnoma allaqachon hal qilingan'}, status=400)

    note = (request.POST.get('note') or '').strip()
    if not note:
        return JsonResponse({'ok': False, 'error': 'Izoh yozish majburiy'}, status=400)

    contract.status = 'rejected'
    contract.rejected_at = timezone.now()
    contract.rejected_ip = _client_ip(request)
    contract.rejection_note = note
    contract.save(update_fields=['status', 'rejected_at', 'rejected_ip', 'rejection_note'])

    logger.info('Shartnoma rad etildi: contract=%s order=%s izoh=%.100s',
                contract.uuid, contract.order_id, note)
    return JsonResponse({'ok': True})


def portal_qr(request, contract_uuid):
    contract = ClientContract.objects.filter(uuid=contract_uuid).first()
    if not contract:
        raise Http404

    import qrcode
    from io import BytesIO
    url = request.build_absolute_uri(f'/mini/portal/{contract.uuid}/')
    img = qrcode.make(url)
    buf = BytesIO()
    img.save(buf, format='PNG')
    return HttpResponse(buf.getvalue(), content_type='image/png')
