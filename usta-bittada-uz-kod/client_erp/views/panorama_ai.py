"""
client_erp/views/panorama_ai.py — Galereya rasmini AI bilan 360° VR panoramaga aylantirish.

Oqim:
  POST /mini/api/panorama-generate/  {file_id, provider, prompt}  → {task_id}  (fon thread)
  GET  /mini/api/panorama-generate/?task_id=...  → {status, step, viewer_url?}

`provider`: 'panopulse' (default) | 'fal_hunyuan' — frontend (gallery.js VR
tanlov popup) tanlaganini yuboradi.
`prompt`: ixtiyoriy, foydalanuvchi yozgan qo'shimcha tavsif — bo'sh bo'lsa
avtomatik statik prompt ishlatiladi, to'ldirilsa Claude orqali provayderga mos
promptga aylantiriladi (_build_panopulse_prompt / _build_fal_hunyuan_prompt).

REUSE — yangi AI integratsiya emas, mavjud ishlaydigan patternning o'zi:
  - PanoPulseClient (voicebot/panopulse) — core/mind/mebel/engine.py:MebelPipeline.
    generate_panorama() da xuddi shu tarzda ishlatiladi (upload_image → convert_and_wait).
  - fal-ai/hunyuan_world — voicebot/ai_providers/fal/client.py:fal_run() + cost/base.py:
    provider_call() orqali (generic fal qatlam, boshqa ai_providers modellari bilan bir xil).
  - _save_image_as_panorama (widget_panorama/consumers.py) — natijani ko'rish uchun
    PanoramaGallery/Panorama qilib saqlaydi, /panorama/<uuid>/ havolasini beradi
    (ikkala provider uchun ham bir xil, provayderdan mustaqil).

DIQQAT: client_erp TENANT_APPS da — thread'ga tenant db_alias uzatiladi,
tugagach connections.close_all() (fon-thread leak qoidasi, ai_image_edit.py bilan bir xil).
"""
import json
import logging
import os
import tempfile
import threading
import uuid

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..auth_backend import get_client_user
from ..models import ClientOrderFile
from ..services import coins
from ..services.features import require_feature

logger = logging.getLogger('client_erp.panorama_ai')

_TASK_KEY = 'ce_pano_{}'
_TASK_TTL = 600
_CONVERT_PROMPT = "360 equirectangular panorama of this interior, same furniture, walls, floor and lighting"
_HUNYUAN_ENDPOINT = 'fal-ai/hunyuan_world'
_PROVIDERS = {'panopulse', 'fal_hunyuan'}


@csrf_exempt
@require_http_methods(['GET', 'POST'])
@require_feature('ai_panorama')
def panorama_generate(request):
    user = get_client_user(request)
    if not user:
        return JsonResponse({'ok': False, 'error': 'Auth kerak'}, status=401)

    # ── GET: polling ─────────────────────────────────────────────────────────
    if request.method == 'GET':
        task_id = (request.GET.get('task_id') or '').strip()
        state = cache.get(_TASK_KEY.format(task_id)) if task_id else None
        if state is None:
            return JsonResponse({'ok': False, 'error': 'Task topilmadi yoki eskirgan'})
        return JsonResponse({'ok': True, 'data': state})

    # ── POST: yangi VR yaratish boshlash ────────────────────────────────────
    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = request.POST

    file_id = body.get('file_id')
    if not file_id:
        return JsonResponse({'ok': False, 'error': 'file_id kerak'})

    provider = (body.get('provider') or 'panopulse').strip()
    if provider not in _PROVIDERS:
        return JsonResponse({'ok': False, 'error': "Noto'g'ri provider"})

    user_prompt = (body.get('prompt') or '').strip()[:300]

    f = ClientOrderFile.objects.select_related('order').filter(pk=file_id).first()
    if not f:
        return JsonResponse({'ok': False, 'error': 'Fayl topilmadi'})
    if f.file_type != 'image':
        return JsonResponse({'ok': False, 'error': "Faqat rasmdan VR yaratish mumkin"})

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
        coins.charge(user, 'ai_panorama', ref_id=str(order.pk))
    except coins.InsufficientCoins as e:
        return JsonResponse({'ok': False, 'error': 'coins', 'need': e.need,
                             'balance': e.balance}, status=402)

    task_id = uuid.uuid4().hex[:12]
    key = _TASK_KEY.format(task_id)
    cache.set(key, {'status': 'queued', 'step': 'Navbatga qo\'yildi...', 'provider': provider}, _TASK_TTL)

    # Tenant kontekstni thread'ga uzatish
    from tenant_manager.middleware import _thread_local, get_current_db_alias
    db_alias = get_current_db_alias()
    tenant = getattr(_thread_local, 'tenant', None)
    order_id, order_title, user_id, file_name = order.pk, order.title, user.pk, f.file_name

    def _run():
        _thread_local.db_alias = db_alias
        _thread_local.tenant = tenant
        try:
            if provider == 'fal_hunyuan':
                _process_fal_hunyuan(key, abs_path, order_id, order_title, user_id, file_name, db_alias, user_prompt)
            else:
                _process(key, abs_path, order_id, order_title, user_id, file_name, db_alias, user_prompt)
        except Exception as e:
            logger.exception('Panorama task xato (%s, provider=%s): %s', task_id, provider, e)
            cache.set(key, {'status': 'error', 'error': _friendly_error(e, provider)}, _TASK_TTL)
        finally:
            from django.db import connections
            connections.close_all()

    threading.Thread(target=_run, daemon=True, name=f'pano_{task_id}').start()
    logger.info('Panorama boshlandi task=%s file=%s user=%s provider=%s', task_id, file_id, user_id, provider)
    return JsonResponse({'ok': True, 'data': {'task_id': task_id, 'coins': user.coins}})


def _friendly_error(e, provider='panopulse'):
    msg = str(e)
    if 'credit' in msg.lower() or 'quota' in msg.lower() or 'insufficient' in msg.lower():
        label = 'PanoPulse' if provider == 'panopulse' else 'Fal.ai'
        return f"{label} kredit/limit tugagan — administratorga xabar bering"
    return msg[:200]


def _build_panopulse_prompt(db='default', user_text=''):
    """PanoPulse uchun prompt. Foydalanuvchi matn kiritmagan bo'lsa — mavjud
    statik texnik prompt (o'zgarishsiz, avvalgi xatti-harakat). Kiritilgan
    bo'lsa — Claude orqali equirectangular panorama uslubiga moslashtiriladi."""
    if not user_text.strip():
        return _CONVERT_PROMPT
    from voicebot.ai_providers.providers.anthropic import client as cl
    from voicebot.ai_providers.cost.base import provider_call

    system = (
        "Convert this interior description/request into a professional "
        "360-degree equirectangular panorama generation prompt in English. "
        "Mention preserving the room's furniture, walls, floor and lighting "
        "unless the user explicitly asks to change them, plus lighting "
        "details, material textures and atmosphere. Output ONLY the prompt, "
        "max 80 words."
    )
    try:
        resp = provider_call(
            'anthropic', 'claude-sonnet-4-6', 'prompt_enhance',
            lambda **_: cl.chat(user_text, model='claude-sonnet-4-6', system=system,
                                effort='low', thinking=False),
            db=db, model_display='claude-sonnet-4-6', req_meta={'text': user_text},
        )
        return cl.text_of(resp).strip() or _CONVERT_PROMPT
    except Exception as e:
        logger.warning('PanoPulse prompt upgrade xato: %s', e)
        return _CONVERT_PROMPT


def _process(key, abs_path, order_id, order_title, user_id, file_name, db_alias, user_prompt=''):
    cache.set(key, {'status': 'uploading', 'step': 'Rasm yuklanmoqda...'}, _TASK_TTL)

    from widget_panorama.models import PanoramaGallery
    db = db_alias or 'default'
    # Gallery DARHOL yaratiladi (natija emas, boshlanishida) — shu bilan
    # Vizualizatsiya sahifasi hali tayyor bo'lmagan panoramani ham "Yaratilmoqda..."
    # kartasi sifatida darhol ko'rsata oladi (handle_page_vizualizatsiya, pending=count==0).
    gallery = PanoramaGallery(
        name=f'AI VR — {order_title}'[:255],
        erp_client_id=user_id,
        client_order_id=order_id,
    )
    gallery.save(using=db)

    from voicebot.panopulse import PanoPulseClient
    token = getattr(settings, 'PANOPULSE_SESSION_TOKEN', '')
    pano_client = PanoPulseClient(session_token=token)

    try:
        image_url = pano_client.upload_image(abs_path)

        prompt_text = _CONVERT_PROMPT
        if user_prompt:
            cache.set(key, {'status': 'prompting', 'step': 'Prompt tayyorlanmoqda...'}, _TASK_TTL)
            prompt_text = _build_panopulse_prompt(db=db, user_text=user_prompt)

        cache.set(key, {'status': 'converting',
                        'step': '360° panorama yaratilmoqda (1-3 daqiqa)...'}, _TASK_TTL)
        task = pano_client.convert_and_wait(
            prompt=prompt_text, images=[image_url],
            quality='medium', timeout=180, poll_interval=5,
        )
        if not task.result_url:
            raise ValueError('PanoPulse natija qaytarmadi')

        save_path = os.path.join(tempfile.gettempdir(), f'ce_pano_{uuid.uuid4().hex}.webp')
        pano_client.download(task, save_path)

        cache.set(key, {'status': 'saving', 'step': 'Panorama saqlanmoqda...'}, _TASK_TTL)

        from widget_panorama.consumers import _save_image_as_panorama
        from asgiref.sync import async_to_sync

        pano_filename = f'ai_vr_{os.path.splitext(file_name)[0]}.webp'
        async_to_sync(_save_image_as_panorama)(
            gallery_id=gallery.id, gallery_name=gallery.name,
            image_path=save_path, order_id=None,
            file_name=pano_filename, uploaded_by_id=user_id, db=db,
        )

        try:
            os.remove(save_path)
        except OSError:
            pass

        viewer_url = f'/panorama/{gallery.uuid}/'
        cache.set(key, {'status': 'done', 'step': 'Tayyor!', 'viewer_url': viewer_url}, _TASK_TTL)
        logger.info('Panorama tayyor: order=%s gallery=%s', order_id, gallery.id)
    except Exception:
        gallery.delete(using=db)
        raise
    finally:
        pano_client.close()


def _build_fal_hunyuan_prompt(db='default', user_text=''):
    """Baza tavsifni (yoki foydalanuvchi yozgan matnni) Claude orqali
    fal-ai/hunyuan_world uchun qisqa promptga aylantiradi. Model schema
    (fal_schema('fal-ai/hunyuan_world')) misoli ("A skyland of wonders")
    qisqa, ijodiy uslubni kutishini ko'rsatadi — PanoPulse'dagi uzun texnik
    "equirectangular panorama..." iborasidan farqli."""
    from voicebot.ai_providers.providers.anthropic import client as cl
    from voicebot.ai_providers.cost.base import provider_call

    base = ("Interior room photo converted into an immersive 360-degree "
            "panoramic scene. Preserve the same furniture, walls, floor "
            "and lighting exactly as shown.")
    system = (
        "You write short prompts for the fal.ai Hunyuan World image-to-panorama "
        "model. It takes one interior photo and expands it into a full panoramic "
        "scene, creatively filling in what's outside the original frame. The "
        "user may give extra creative direction — blend it in naturally while "
        "keeping the room recognisable (same general furniture/layout unless "
        "the user asks to change it). Output ONLY the prompt text, max 30 "
        "words, English, evocative but concrete."
    )
    source_text = user_text.strip() or base
    try:
        resp = provider_call(
            'anthropic', 'claude-sonnet-4-6', 'prompt_enhance',
            lambda **_: cl.chat(source_text, model='claude-sonnet-4-6', system=system,
                                effort='low', thinking=False),
            db=db, model_display='claude-sonnet-4-6', req_meta={'text': source_text},
        )
        return cl.text_of(resp).strip() or base
    except Exception as e:
        logger.warning('Fal panorama prompt upgrade xato: %s', e)
        return base


def _process_fal_hunyuan(key, abs_path, order_id, order_title, user_id, file_name, db_alias, user_prompt=''):
    cache.set(key, {'status': 'uploading', 'step': 'Rasm yuklanmoqda...'}, _TASK_TTL)

    from widget_panorama.models import PanoramaGallery
    db = db_alias or 'default'
    gallery = PanoramaGallery(
        name=f'AI VR (Fal) — {order_title}'[:255],
        erp_client_id=user_id,
        client_order_id=order_id,
    )
    gallery.save(using=db)

    try:
        from voicebot.ai_providers.fal.client import _ensure_key, fal_run
        from voicebot.ai_providers.cost.base import provider_call
        import fal_client

        _ensure_key()
        hosted_url = fal_client.upload_file(abs_path)

        cache.set(key, {'status': 'prompting', 'step': 'Prompt tayyorlanmoqda...'}, _TASK_TTL)
        prompt = _build_fal_hunyuan_prompt(db=db, user_text=user_prompt)

        cache.set(key, {'status': 'converting',
                        'step': '360° panorama yaratilmoqda (fal.ai)...'}, _TASK_TTL)
        result = provider_call(
            'fal', _HUNYUAN_ENDPOINT, 'panorama',
            lambda **kw: fal_run(_HUNYUAN_ENDPOINT, kw),
            db=db, model_display='Hunyuan World', is_async=False,
            estimate_units={'image': 1},
            image_url=hosted_url, prompt=prompt,
        )
        result_url = ((result or {}).get('image') or {}).get('url')
        if not result_url:
            raise ValueError('Fal.ai natija qaytarmadi')

        cache.set(key, {'status': 'saving', 'step': 'Panorama saqlanmoqda...'}, _TASK_TTL)

        import requests
        resp = requests.get(result_url, timeout=60)
        resp.raise_for_status()
        save_path = os.path.join(tempfile.gettempdir(), f'ce_pano_{uuid.uuid4().hex}.png')
        with open(save_path, 'wb') as fh:
            fh.write(resp.content)

        from widget_panorama.consumers import _save_image_as_panorama
        from asgiref.sync import async_to_sync

        try:
            pano_filename = f'ai_vr_fal_{os.path.splitext(file_name)[0]}.png'
            async_to_sync(_save_image_as_panorama)(
                gallery_id=gallery.id, gallery_name=gallery.name,
                image_path=save_path, order_id=None,
                file_name=pano_filename, uploaded_by_id=user_id, db=db,
            )
        finally:
            try:
                os.remove(save_path)
            except OSError:
                pass

        viewer_url = f'/panorama/{gallery.uuid}/'
        cache.set(key, {'status': 'done', 'step': 'Tayyor!', 'viewer_url': viewer_url}, _TASK_TTL)
        logger.info('Fal panorama tayyor: order=%s gallery=%s', order_id, gallery.id)
    except Exception:
        gallery.delete(using=db)
        raise
