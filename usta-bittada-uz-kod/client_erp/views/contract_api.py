"""client_erp/views/contract_api.py — Xodim shartnoma yaratadi va mijozga yuboradi (auth talab qiladi)."""
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..auth_backend import get_client_user
from ..models import ClientOrder, ClientContract


@csrf_exempt
@require_http_methods(['POST'])
def create_contract(request):
    """POST /mini/api/contracts/ {order_id, amount, terms} — shartnoma yaratib, darhol 'sent' qiladi."""
    user = get_client_user(request)
    if not user:
        return JsonResponse({'ok': False, 'error': 'Auth kerak'}, status=401)

    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = request.POST

    order_id = body.get('order_id')
    amount = body.get('amount')
    terms = (body.get('terms') or '').strip()

    if not order_id or not amount:
        return JsonResponse({'ok': False, 'error': 'order_id va amount majburiy'}, status=400)

    order = ClientOrder.objects.filter(pk=order_id).first()
    if not order:
        return JsonResponse({'ok': False, 'error': 'Buyurtma topilmadi'}, status=404)
    if order.owner_id != user.pk and not order.permissions.filter(user=user).exists():
        return JsonResponse({'ok': False, 'error': "Ruxsat yo'q"}, status=403)

    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return JsonResponse({'ok': False, 'error': "Summa noto'g'ri"}, status=400)

    contract = ClientContract.objects.create(
        order=order, contract_amount=amount, terms_text=terms,
        status='sent', created_by=user,
    )
    return JsonResponse({
        'ok': True,
        'data': {
            'uuid': str(contract.uuid),
            'portal_url': f'/mini/portal/{contract.uuid}/',
            'customer_phone': (order.customer.phone if order.customer else '') or '',
        },
    })


@csrf_exempt
@require_http_methods(['POST'])
def send_contract_sms(request, contract_uuid):
    """POST /mini/api/contracts/<uuid>/send-sms/ — mijozga shartnoma linkini SMS orqali yuboradi."""
    user = get_client_user(request)
    if not user:
        return JsonResponse({'ok': False, 'error': 'Auth kerak'}, status=401)

    contract = ClientContract.objects.select_related('order', 'order__customer').filter(uuid=contract_uuid).first()
    if not contract:
        return JsonResponse({'ok': False, 'error': 'Topilmadi'}, status=404)

    order = contract.order
    if order.owner_id != user.pk and not order.permissions.filter(user=user).exists():
        return JsonResponse({'ok': False, 'error': "Ruxsat yo'q"}, status=403)

    phone = order.customer.phone if order.customer else ''
    if not phone:
        return JsonResponse({'ok': False, 'error': "Mijoz telefon raqami kiritilmagan"}, status=400)

    portal_url = request.build_absolute_uri(f'/mini/portal/{contract.uuid}/')
    message = f"{order.title} — shartnomangiz tayyor. Ko'rish va tasdiqlash uchun: {portal_url}"

    from sms_service.client import send_sms
    result = send_sms(
        phone=phone, message=message, sent_by=None,
        order_id=order.id, client_name=order.customer.full_name if order.customer else '',
        source='client_erp_contract',
    )
    if result.get('error'):
        return JsonResponse({'ok': False, 'error': result['error']}, status=400)
    return JsonResponse({'ok': True})
