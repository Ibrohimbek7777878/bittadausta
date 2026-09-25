"""client_erp/views/payments_api.py — To'lov provayder webhook'lari (F3).

SANDBOX-first: BILLING_LIVE=0 (standart) bo'lsa webhook ishlatilmaydi (sandbox
oqimi WS pay.sandbox_confirm orqali). Real provayder (Payme/Click/Octobank/
Multicard) BILLING_LIVE=1 + kalitlar bilan yoqilganда callback shu yerga keladi.
Katta ERP moliyasiga TEGMAYDI — faqat client_erp tanga/tarif.
"""
import logging

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

logger = logging.getLogger('client_erp.payments')


@csrf_exempt
def pay_callback(request, provider):
    """Provider webhook — real to'lov tasdig'i. BILLING_LIVE=0 da 400 (sandbox rejim)."""
    from client_erp.payments import get_provider, service, billing_live
    from client_erp.models import ClientPayment
    if not billing_live():
        return JsonResponse({'ok': False, 'error': 'sandbox mode'}, status=400)
    try:
        prov = get_provider(provider)
        result = prov.handle_callback(request) or {}
        ext = result.get('payment_external_id') or result.get('external_id')
        status = result.get('status')
        p = ClientPayment.objects.filter(external_id=ext).first() if ext else None
        if not p:
            return JsonResponse({'ok': False, 'error': 'payment not found'}, status=404)
        if status == 'paid':
            service.confirm(p, external_id=ext, raw=result.get('raw'))
        elif status == 'failed':
            service.fail(p, code='callback', msg='provider callback failed')
        # Eslatma: har provayder webhook JAVOB formati farq qiladi (Payme JSON-RPC,
        # Click prepare/complete...) — real yoqishda tegishli javob qaytarilsin (TODO).
        return JsonResponse({'ok': True})
    except Exception as e:
        logger.exception('pay_callback error (%s)', provider)
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)
