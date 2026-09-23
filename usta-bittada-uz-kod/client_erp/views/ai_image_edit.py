"""
client_erp/views/ai_image_edit.py — Galereya AI rasm tahrirlash (fal.ai).

Oqim:
  POST /mini/api/ai-image-edit/  {file_id, prompt}  → {task_id}  (fon thread)
  GET  /mini/api/ai-image-edit/?task_id=...          → {status, step, file?}

Fon thread bosqichlari:
  1. enhance_prompt(style='edit')  — prompt → mukammal inglizcha AI prompt
  2. fal_client.upload_file        — lokal fayl → fal CDN
  3. edit_image (flux-pro/kontext) — sync, ~15-30s
  4. Natijani ClientOrderFile qilib buyurtma fayllariga qo'shish (thumbnail bilan)

DIQQAT: client_erp TENANT_APPS da — thread'ga tenant db_alias uzatiladi,
tugagach connections.close_all() (fon-thread leak qoidasi).
"""
import json
import logging
import os
import threading
import time
import uuid

from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..auth_backend import get_client_user
from ..models import ClientOrderFile
from ..services import coins
from ..services.features import require_feature

logger = logging.getLogger('client_erp.ai_edit')

_TASK_KEY   = 'ce_ai_edit_{}'
_TASK_TTL   = 600
_PROMPT_MAX = 800

# Rasm-tahrir modellari — foydalanuvchi AI panelida tanlaydi; tanga narxi 'action'
# kalitidan (coins.ai_price → ClientAIPrice yoki DEFAULT_PRICES) olinadi.
EDIT_MODELS = {
    'seedream': {'endpoint': 'fal-ai/bytedance/seedream/v4.5/edit',   'name': 'Seedream 4.5',    'desc': 'Aniq — mebel uchun','icon': '🎯', 'action': 'ai_image_precise'},
}
DEFAULT_MODEL = 'seedream'


@csrf_exempt
@require_http_methods(['GET', 'POST'])
@require_feature('ai_image')
def ai_image_edit(request):
    user = get_client_user(request)
    if not user:
        return JsonResponse({'ok': False, 'error': 'Auth kerak'}, status=401)

    # ── GET: model ro'yxati (tanga narxi bilan) yoki task polling ─────────────
    if request.method == 'GET':
        if request.GET.get('models'):
            from client_erp.services.coins import ai_price
            return JsonResponse({'ok': True, 'data': {
                'default': DEFAULT_MODEL,
                'models': [{
                    'key': k, 'name': m['name'], 'desc': m['desc'],
                    'icon': m['icon'], 'coins': ai_price(m['action']),
                } for k, m in EDIT_MODELS.items()],
            }})
        task_id = (request.GET.get('task_id') or '').strip()
        state = cache.get(_TASK_KEY.format(task_id)) if task_id else None
        if state is None:
            return JsonResponse({'ok': False, 'error': 'Task topilmadi yoki eskirgan'})
        return JsonResponse({'ok': True, 'data': state})

    # ── POST: yangi tahrir boshlash ──────────────────────────────────────────
    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = request.POST

    file_id = body.get('file_id')
    prompt = (body.get('prompt') or '').strip()[:_PROMPT_MAX]
    if not file_id or not prompt:
        return JsonResponse({'ok': False, 'error': 'file_id va prompt kerak'})

    model_key = body.get('model') or DEFAULT_MODEL
    mcfg = EDIT_MODELS.get(model_key) or EDIT_MODELS[DEFAULT_MODEL]

    f = (ClientOrderFile.objects.select_related('order')
         .filter(pk=file_id).first())
    if not f:
        return JsonResponse({'ok': False, 'error': 'Fayl topilmadi'})
    if f.file_type != 'image':
        return JsonResponse({'ok': False, 'error': 'Faqat rasm tahrirlash mumkin'})

    # Egalik: buyurtma egasi yoki ulashilgan foydalanuvchi
    order = f.order
    if order.owner_id != user.pk and not order.permissions.filter(user=user).exists():
        return JsonResponse({'ok': False, 'error': 'Bu buyurtmaga ruxsat yo\'q'}, status=403)

    try:
        abs_path = f.file.path
    except Exception:
        return JsonResponse({'ok': False, 'error': 'Fayl diskda topilmadi'})
    if not os.path.exists(abs_path):
        return JsonResponse({'ok': False, 'error': 'Fayl diskda topilmadi'})

    # Tanga yechish — generatsiya BOSHLANISHIDA (AI-tanga o'chiq bo'lsa 0, hech
    # kim bloklanmaydi; yetmasa faqat InsufficientCoins ko'tariladi).
    try:
        coins.charge(user, mcfg['action'], ref_id=str(order.pk))
    except coins.InsufficientCoins as e:
        return JsonResponse({'ok': False, 'error': 'coins', 'need': e.need,
                             'balance': e.balance}, status=402)

    task_id = uuid.uuid4().hex[:12]
    key = _TASK_KEY.format(task_id)
    cache.set(key, {'status': 'queued', 'step': 'Navbatga qo\'yildi...'}, _TASK_TTL)

    # Tenant kontekstni thread'ga uzatish
    from tenant_manager.middleware import _thread_local, get_current_db_alias
    db_alias = get_current_db_alias()
    tenant = getattr(_thread_local, 'tenant', None)
    order_id, user_id = order.pk, user.pk

    def _run():
        _thread_local.db_alias = db_alias
        _thread_local.tenant = tenant
        try:
            _process(key, abs_path, prompt, order_id, user_id, mcfg['endpoint'])
        except Exception as e:
            logger.exception('AI edit task xato (%s): %s', task_id, e)
            cache.set(key, {'status': 'error', 'error': str(e)[:200]}, _TASK_TTL)
        finally:
            from django.db import connections
            connections.close_all()

    threading.Thread(target=_run, daemon=True, name=f'ai_edit_{task_id}').start()
    logger.info('AI edit boshlandi task=%s file=%s user=%s prompt=%.60s',
                task_id, file_id, user_id, prompt)
    return JsonResponse({'ok': True, 'data': {'task_id': task_id, 'coins': user.coins}})


def _process(key, abs_path, prompt, order_id, user_id, endpoint='fal-ai/flux-pro/kontext'):
    """Fon thread: enhance → fal upload → edit (tanlangan model) → faylga saqlash."""
    # 1. Prompt mukammallashtirish (xatoda original qaytadi — graceful)
    cache.set(key, {'status': 'enhancing',
                    'step': 'Prompt mukammallashtirilmoqda...'}, _TASK_TTL)
    from voicebot.services.prompt_enhance import enhance_prompt
    enhanced = enhance_prompt(prompt, style='edit')

    # 2. Rasmni fal CDN ga yuklash
    cache.set(key, {'status': 'uploading',
                    'step': 'Rasm AI ga yuborilmoqda...',
                    'enhanced_prompt': enhanced}, _TASK_TTL)
    from voicebot.ai_providers.harness.runner import _stage_upload
    cdn_url = _stage_upload('fal', abs_path)

    # 3. AI tahrir (flux-pro/kontext, sync)
    cache.set(key, {'status': 'editing',
                    'step': 'AI tahrirlamoqda (15-30 soniya)...',
                    'enhanced_prompt': enhanced}, _TASK_TTL)
    from voicebot.services.fal.image import edit_image
    images = edit_image(image_url=cdn_url, prompt=enhanced, model=endpoint)
    if not images or not images[0].get('url'):
        raise RuntimeError('AI natija qaytarmadi')

    # 4. Natijani yuklab olib buyurtma fayliga qo'shish
    cache.set(key, {'status': 'saving',
                    'step': 'Natija faylga saqlanmoqda...',
                    'enhanced_prompt': enhanced}, _TASK_TTL)
    import httpx
    resp = httpx.get(images[0]['url'], timeout=60, follow_redirects=True)
    resp.raise_for_status()
    data = resp.content

    tmp_path = os.path.join('/tmp', f'ce_ai_edit_{uuid.uuid4().hex}.jpg')
    with open(tmp_path, 'wb') as fh:
        fh.write(data)

    try:
        from .file_upload import _save_and_optimize
        obj = ClientOrderFile(
            order_id=order_id,
            file_type='image',
            file_name=f'ai_edit_{int(time.time())}.jpg',
            file_size=len(data),
            caption=f'AI: {prompt[:200]}',
            uploaded_by_id=user_id,
        )
        _save_and_optimize(obj, 'image', tmp_path, f'{uuid.uuid4().hex}.jpg')
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    from ..serializers import serialize_file
    file_payload = serialize_file(obj)
    cache.set(key, {'status': 'done',
                    'step': 'Tayyor!',
                    'enhanced_prompt': enhanced,
                    'file': file_payload}, _TASK_TTL)
    logger.info('AI edit tayyor: order=%s yangi fayl=%s', order_id, obj.pk)

    # 5. WS broadcast — mini_order_{id} guruhiga (ochiq sessiyalar fayl-gridini
    # reload'siz yangilashi uchun). FAIL-SAFE: xato asosiy oqimni buzmaydi.
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        from ..models import ClientUser
        u = ClientUser.objects.filter(pk=user_id).first()
        layer = get_channel_layer()
        if layer:
            from tenant_manager.ws_groups import tgroup
            from tenant_manager.middleware import get_current_db_alias
            async_to_sync(layer.group_send)(
                tgroup(get_current_db_alias(), f'mini_order_{order_id}'),
                {
                    'type': 'order.broadcast',
                    'order_id': order_id,
                    'message': {
                        'type': 'broadcast',
                        'action': 'file.created',
                        'data': file_payload,
                        'by': (u.full_name if u else 'AI'),
                    },
                    'sender_channel': None,
                },
            )
    except Exception:
        logger.exception('AI edit WS broadcast xato (order=%s) — jarayon davom etadi', order_id)
