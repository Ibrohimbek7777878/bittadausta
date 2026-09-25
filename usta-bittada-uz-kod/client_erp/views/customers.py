"""client_erp/views/customers.py — Mijozlarim CRUD."""
import json
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from ..models import ClientCustomer


def mini_clients(request, username):
    user = request.client_user
    customers = ClientCustomer.objects.filter(owner=user).order_by('-created_at')
    return render(request, 'client_erp/pages/customers/list.html', {'user': user, 'customers': customers})


@require_POST
def mini_client_create(request, username):
    user = request.client_user
    body = json.loads(request.body)
    name = (body.get('full_name', '') or '').strip()
    if not name:
        return JsonResponse({'error': 'Ism kerak'}, status=400)
    c = ClientCustomer.objects.create(
        owner=user, full_name=name,
        phone=body.get('phone', ''), phone2=body.get('phone2', ''),
        address=body.get('address', ''), note=body.get('note', ''),
    )
    return JsonResponse({'ok': True, 'id': c.id})


@require_POST
def mini_client_delete(request, username, pk):
    ClientCustomer.objects.filter(pk=pk, owner=request.client_user).delete()
    return JsonResponse({'ok': True})
