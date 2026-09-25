"""client_erp/views/settings.py — Sozlamalar."""
import json
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_POST


def mini_settings(request, username):
    user = request.client_user
    return render(request, 'client_erp/pages/settings/profile.html', {'user': user})


@require_POST
def mini_change_password(request, username):
    user = request.client_user
    body = json.loads(request.body)
    current = body.get('current', '')
    new_pass = body.get('new_password', '')
    if not user.check_password(current):
        return JsonResponse({'error': "Joriy parol noto'g'ri"}, status=400)
    if len(new_pass) < 6:
        return JsonResponse({'error': 'Kamida 6 belgi'}, status=400)
    user.set_password(new_pass)
    user.save(update_fields=['password_hash'])
    return JsonResponse({'ok': True})
