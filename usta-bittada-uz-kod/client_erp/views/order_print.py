from django.http import Http404
from django.shortcuts import render

from client_erp.auth_backend import get_client_user


def order_print(request, order_id):
    user = get_client_user(request)
    if not user:
        raise Http404

    from client_erp.models import ClientOrder
    try:
        order = ClientOrder.objects.select_related('customer').get(pk=order_id, owner=user)
    except ClientOrder.DoesNotExist:
        raise Http404

    stages = list(order.stages.prefetch_related('checklist').order_by('sort_order'))

    return render(request, 'client_erp/pages/order_print.html', {
        'order': order,
        'stages': stages,
    })
