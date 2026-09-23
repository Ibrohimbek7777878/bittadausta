"""client_erp/views/zamers.py — Zamerlar (widget_zamer.Zamer bilan bog'langan)."""
import re
import json
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from ..models import ClientZamer, ClientCustomer


def mini_zamers(request, username):
    """Mijozning zamerlari — widget_zamer.Zamer dan telefon bo'yicha."""
    user = request.client_user

    # Telefon oxirgi 9 raqami
    digits = re.sub(r'\D', '', user.phone or '')
    last9 = digits[-9:] if len(digits) >= 9 else digits

    # MebelCity dagi real zamerlar
    mc_zamers = []
    if last9 and len(last9) >= 7:
        try:
            from widget_zamer.models import Zamer
            from manfacturing.models import Order
            from django.db.models import Q
            from hashids import Hashids

            hashids = Hashids(
                salt="Alloh nomi bilan boshlayman", min_length=6,
                alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            )

            # Shu mijoz telefoni bilan ochilgan orderlardagi zamerlar
            order_ids = Order.objects.filter(
                Q(client__phone__endswith=last9) |
                Q(client__phone2__endswith=last9)
            ).values_list('id', flat=True)

            zamers = Zamer.objects.filter(
                order_id__in=list(order_ids)
            ).select_related('order').order_by('-created_at')[:30]

            for z in zamers:
                order_code = hashids.encode(z.order_id) if z.order_id else ''
                blocks_count = z.mebel_blocks.count() if hasattr(z, 'mebel_blocks') else 0

                mc_zamers.append({
                    'id': z.id,
                    'order_id': z.order_id,
                    'order_code': order_code,
                    'partner_name': z.order.partner_name if z.order else '',
                    'room_name': z.room_name or '',
                    'width': z.width,
                    'height': z.height,
                    'depth': z.depth,
                    'wall_count': z.wall_count if hasattr(z, 'wall_count') else 0,
                    'blocks_count': blocks_count,
                    'created_at': z.created_at,
                    'zamer_url': f'/make_zamer/{order_code}/?mode=input' if order_code else '',
                })
        except Exception:
            pass

    # Ichki zamerlar (ClientZamer)
    own_zamers = ClientZamer.objects.filter(owner=user).select_related('customer').order_by('-created_at')

    return render(request, 'client_erp/pages/zamers/list.html', {
        'user': user,
        'mc_zamers': mc_zamers,
        'own_zamers': own_zamers,
        'customers': ClientCustomer.objects.filter(owner=user),
    })


@require_POST
def mini_zamer_create(request, username):
    user = request.client_user
    body = json.loads(request.body)
    title = (body.get('title', '') or '').strip()
    if not title:
        return JsonResponse({'error': 'Nom kerak'}, status=400)
    z = ClientZamer.objects.create(
        owner=user, title=title,
        customer_id=body.get('customer_id') or None,
        note=body.get('note', ''),
    )
    return JsonResponse({'ok': True, 'id': z.id})
