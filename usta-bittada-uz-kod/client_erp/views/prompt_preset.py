"""client_erp/views/prompt_preset.py — AI-rasm paneli uchun random uslub tugmalari."""
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from ..auth_backend import get_client_user
from ..models import PromptPreset

FEATURED_COUNT = 3


@require_http_methods(['GET'])
def prompt_preset_list(request):
    """GET /mini/api/prompt-presets/ — har chaqiruvda tasodifiy 3 ta uslub tugmasi."""
    user = get_client_user(request)
    if not user:
        return JsonResponse({'ok': False, 'error': 'Auth kerak'}, status=401)

    featured = list(
        PromptPreset.objects.filter(is_active=True, is_base=False, category='style')
        .order_by('?').values('id', 'title', 'prompt_text')[:FEATURED_COUNT]
    )

    base = PromptPreset.objects.filter(is_active=True, is_base=True).values_list('prompt_text', flat=True).first()

    return JsonResponse({'ok': True, 'featured': featured, 'base_instruction': base or ''})
