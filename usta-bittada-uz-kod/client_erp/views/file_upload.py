"""client_erp/views/file_upload.py — Fayl yuklash (chunked + oddiy) + FFmpeg optimizatsiya."""
import os
import json
import uuid
import logging
import subprocess
import shutil
import threading
import zipfile
from PIL import Image
from io import BytesIO

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.core.files.base import ContentFile
from django.conf import settings

from ..auth_backend import get_client_user
from ..models import ClientOrder, ClientOrderFile
from ..services.features import require_feature

logger = logging.getLogger("client_erp.file_upload")

ALLOWED_IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'}
ALLOWED_VIDEO_EXT = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.3gp', '.m4v'}
ALLOWED_DOC_EXT = {'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.zip', '.rar',
                   '.b3d', '.project', '.bpj',  # Bazis chizma fayllari (BOM uchun)
                   '.skp'}  # SketchUp fayli (2026-09-03)
CHUNK_DIR = '/tmp/client_erp_chunks'
FFMPEG_BIN = '/usr/bin/ffmpeg'


def _detect_file_type(ext):
    ext = ext.lower()
    if ext in ALLOWED_IMAGE_EXT:
        return 'image'
    if ext in ALLOWED_VIDEO_EXT:
        return 'video'
    return 'document'


def _make_thumbnail(file_obj, max_size=300):
    try:
        img = Image.open(file_obj)
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=80)
        buf.seek(0)
        return buf
    except Exception:
        return None


def _make_skp_thumbnail(file_path):
    """SketchUp (.skp) fayl — ZIP konteyner, ichida dastur o'zi saqlab
    qo'ygan preview PNG bor (meta/preview_thumbnail.png yoki
    meta/model_thumbnail.png). To'liq 3D model emas (geometriya
    model.dat'da — yopiq, hujjatlanmagan Trimble formati, o'qib
    bo'lmaydi — 2026-09-03 tekshirildi), lekin usta yuklagan fayl
    qanday mebel/xona ekanini darhol ko'rish uchun yetarli."""
    try:
        with zipfile.ZipFile(file_path) as z:
            names = set(z.namelist())
            for candidate in ('meta/preview_thumbnail.png', 'meta/model_thumbnail.png'):
                if candidate in names:
                    return z.read(candidate)
    except Exception as e:
        logger.warning(f"SKP thumbnail error: {e}")
    return None


def _make_video_thumbnail(video_path):
    """FFmpeg bilan videoning 1-sekundidan thumbnail olish."""
    try:
        thumb_path = video_path + '.thumb.jpg'
        subprocess.run([
            FFMPEG_BIN, '-y', '-i', video_path,
            '-ss', '00:00:01', '-vframes', '1',
            '-vf', 'scale=300:-1',
            thumb_path,
        ], capture_output=True, timeout=30)
        if os.path.exists(thumb_path) and os.path.getsize(thumb_path) > 0:
            with open(thumb_path, 'rb') as f:
                data = f.read()
            os.unlink(thumb_path)
            return data
    except Exception as e:
        logger.warning(f"Video thumbnail error: {e}")
    return None


def _optimize_video_bg(file_obj_id, source_path):
    """Background thread — FFmpeg bilan videoni web formatga (H.264/AAC mp4) optimizatsiya qilish."""
    try:
        optimized_path = source_path + '.optimized.mp4'
        result = subprocess.run([
            FFMPEG_BIN, '-y', '-i', source_path,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '28',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-max_muxing_queue_size', '1024',
            optimized_path,
        ], capture_output=True, timeout=600)

        if result.returncode != 0:
            logger.warning(f"FFmpeg failed: {result.stderr[:500]}")
            return

        if not os.path.exists(optimized_path):
            return

        opt_size = os.path.getsize(optimized_path)
        orig_size = os.path.getsize(source_path)

        if opt_size < orig_size * 0.95:
            from client_erp.models import ClientOrderFile as COF
            try:
                obj = COF.objects.get(pk=file_obj_id)
                unique_name = f"{uuid.uuid4().hex}.mp4"
                with open(optimized_path, 'rb') as f:
                    obj.file.save(unique_name, ContentFile(f.read()), save=True)
                obj.file_size = opt_size
                obj.save(update_fields=['file_size'])
                logger.info(f"Video optimized: {orig_size} → {opt_size} ({file_obj_id})")
            except COF.DoesNotExist:
                pass
    except Exception as e:
        logger.warning(f"Video optimize error: {e}")
    finally:
        for p in [source_path, source_path + '.optimized.mp4']:
            try:
                os.unlink(p)
            except OSError:
                pass


def _save_and_optimize(obj, file_type, final_path, unique_name):
    """Faylni saqlash + video bo'lsa thumbnail + bg optimize."""
    with open(final_path, 'rb') as f:
        obj.file.save(unique_name, ContentFile(f.read()), save=False)

    if file_type == 'image':
        with open(final_path, 'rb') as f:
            thumb_buf = _make_thumbnail(f)
            if thumb_buf:
                obj.thumbnail.save(f"thumb_{unique_name}.jpg", ContentFile(thumb_buf.read()), save=False)

    if file_type == 'video':
        thumb_data = _make_video_thumbnail(final_path)
        if thumb_data:
            obj.thumbnail.save(f"thumb_{unique_name}.jpg", ContentFile(thumb_data), save=False)

    if unique_name.lower().endswith('.skp'):
        thumb_data = _make_skp_thumbnail(final_path)
        if thumb_data:
            obj.thumbnail.save(f"thumb_{unique_name}.png", ContentFile(thumb_data), save=False)

    obj.save()

    if file_type == 'video' and os.path.exists(final_path):
        bg_path = f"/tmp/client_erp_ffmpeg_{obj.pk}{os.path.splitext(final_path)[1]}"
        shutil.copy2(final_path, bg_path)
        t = threading.Thread(target=_optimize_video_bg, args=(obj.pk, bg_path), daemon=True)
        t.start()


@csrf_exempt
@require_POST
@require_feature('files_upload')
def file_upload(request):
    user = get_client_user(request)
    if not user:
        return JsonResponse({'ok': False, 'error': 'Auth kerak'}, status=401)

    order_id = request.POST.get('order_id')
    if not order_id:
        return JsonResponse({'ok': False, 'error': 'order_id kerak'})

    try:
        order = ClientOrder.objects.get(pk=order_id)
    except ClientOrder.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Buyurtma topilmadi'})

    uploaded = request.FILES.get('file')
    if not uploaded:
        return JsonResponse({'ok': False, 'error': 'Fayl kerak'})

    ext = os.path.splitext(uploaded.name)[1].lower()
    allowed = ALLOWED_IMAGE_EXT | ALLOWED_VIDEO_EXT | ALLOWED_DOC_EXT
    if ext not in allowed:
        return JsonResponse({'ok': False, 'error': f'Ruxsat etilmagan format: {ext}'})

    file_type = _detect_file_type(ext)
    unique_name = f"{uuid.uuid4().hex}{ext}"

    # ── RASM TAHRIRI: ALMASHTIRISH (2026-08-18) ──────────────────────────
    # MUAMMO: rasm ustida o'lchov/chizma qilib «Saqlash» bosilganda HAR SAFAR
    # yangi fayl yuklanardi. Zakaz #328 da bitta rasmdan 14 ta nusxa yig'ilgan
    # (13:45–14:03) — galereya ko'payib, qaysi biri oxirgisi bilinmay ketgan.
    # YECHIM: `replace_id` berilsa — o'sha yozuvning fayli ALMASHTIRILADI
    # (id o'zgarmaydi, eski fayl diskdan o'chadi). Asl surat esa saqlanadi:
    # frontend faqat TAHRIR NUSXASINI almashtiradi, originalga tegmaydi.
    _rep_id = request.POST.get('replace_id')
    obj = None
    _old_path = None
    if _rep_id:
        obj = ClientOrderFile.objects.filter(pk=_rep_id, order=order).first()
        if obj:
            try:
                _old_path = obj.file.path if obj.file else None
            except (ValueError, NotImplementedError):
                _old_path = None
            obj.file_type = file_type
            obj.file_name = uploaded.name
            obj.file_size = uploaded.size
    if obj is None:
        obj = ClientOrderFile(
            order=order,
            file_type=file_type,
            file_name=uploaded.name,
            file_size=uploaded.size,
            caption=request.POST.get('caption', ''),
            uploaded_by=user,
        )

    # O'lchov chizmalari (2026-09-08, TZ-Olchov-Interaktiv-Saqlash) — rasm
    # editorida chizilgan o'lchov nuqtalari, qayta ochilganda interaktiv
    # (bittasi tanlansa qolganlari xiralashadi + ro'yxat) ko'rsatish uchun.
    # Frontend JSON-string sifatida yuboradi; noto'g'ri/bo'sh bo'lsa jim
    # o'tkazib yuboriladi (rasm saqlanishini bloklamasin).
    _measurements_raw = request.POST.get('measurements')
    if _measurements_raw:
        try:
            _measurements = json.loads(_measurements_raw)
            if isinstance(_measurements, list):
                obj.measurements = _measurements
        except (ValueError, TypeError):
            pass

    tmp_path = os.path.join('/tmp', f'ce_upload_{uuid.uuid4().hex}{ext}')
    with open(tmp_path, 'wb') as f:
        for chunk in uploaded.chunks():
            f.write(chunk)

    _save_and_optimize(obj, file_type, tmp_path, unique_name)
    try:
        os.unlink(tmp_path)
    except OSError:
        pass

    # Almashtirilgan bo'lsa — eski fayl diskdan o'chadi (joy egallamasin)
    if _old_path:
        try:
            if os.path.exists(_old_path):
                os.unlink(_old_path)
        except OSError:
            pass

    from ..serializers import serialize_file
    return JsonResponse({'ok': True, 'data': {'file': serialize_file(obj),
                                              'replaced': bool(_rep_id and _old_path)}})


@csrf_exempt
@require_POST
@require_feature('files_upload')
def link_add(request):
    """Fizik fayl o'rniga tashqi URL saqlash (2026-09-04) — masalan Bazis
    oblaka, ShapeSpark va h.k. havolalar. Fayl yuklanmaydi, faqat URL va
    nom saqlanadi; Fayllar tab'ida alohida "havola" kartochkasi sifatida
    ko'rinadi (bosilganda yangi oynada ochiladi)."""
    user = get_client_user(request)
    if not user:
        return JsonResponse({'ok': False, 'error': 'Auth kerak'}, status=401)

    order_id = request.POST.get('order_id')
    if not order_id:
        return JsonResponse({'ok': False, 'error': 'order_id kerak'})

    url = (request.POST.get('url') or '').strip()
    if not url:
        return JsonResponse({'ok': False, 'error': 'Havola kerak'})
    if not (url.startswith('http://') or url.startswith('https://')):
        return JsonResponse({'ok': False, 'error': 'Havola http:// yoki https:// bilan boshlanishi kerak'})
    if len(url) > 500:
        return JsonResponse({'ok': False, 'error': 'Havola juda uzun'})

    try:
        order = ClientOrder.objects.get(pk=order_id)
    except ClientOrder.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Buyurtma topilmadi'})

    name = (request.POST.get('name') or '').strip() or url

    obj = ClientOrderFile.objects.create(
        order=order,
        file_type='link',
        file_name=name,
        external_url=url,
        caption=request.POST.get('caption', ''),
        uploaded_by=user,
    )

    from ..serializers import serialize_file
    return JsonResponse({'ok': True, 'data': {'file': serialize_file(obj)}})


@csrf_exempt
@require_POST
@require_feature('files_upload')
def detal_qr_create(request):
    """Detal QR kartochka yaratish (2026-09-04, TZ-Detal-QR-2026-09.md).

    Ikki yo'l:
    1) `image` — tayyor rasm (usta Bazisdan o'zi eksport qilib yuklaydi).
    2) `b3d_file` — xom .b3d fayl: server AVTOMATIK render qiladi
       (bom.parser_b3d + headless Chromium, client_erp/services/b3d_render.py
       — mavjud, sinovdan o'tgan "Furniture Module Mining" render kodidan
       qayta foydalaniladi). `detal_count` ham berilmagan bo'lsa panellar
       sonidan avtomatik hisoblanadi.
    `order_id` IXTIYORIY — bitta buyurtmada bir nechta (har modul uchun
    alohida) yoki buyurtmasiz mustaqil kartochka ham yaratish mumkin."""
    user = get_client_user(request)
    if not user:
        return JsonResponse({'ok': False, 'error': 'Auth kerak'}, status=401)

    title = (request.POST.get('title') or '').strip()
    if not title:
        return JsonResponse({'ok': False, 'error': 'Nomi kerak'})

    order = None
    order_id = request.POST.get('order_id')
    if order_id:
        try:
            order = ClientOrder.objects.get(pk=order_id)
        except ClientOrder.DoesNotExist:
            return JsonResponse({'ok': False, 'error': 'Buyurtma topilmadi'})

    artikul = (request.POST.get('artikul') or '').strip()
    detal_count = request.POST.get('detal_count')
    try:
        detal_count = int(detal_count) if detal_count else None
    except ValueError:
        detal_count = None

    uploaded = request.FILES.get('image')
    b3d_uploaded = request.FILES.get('b3d_file')
    panel_data = []

    if b3d_uploaded:
        ext = os.path.splitext(b3d_uploaded.name)[1].lower()
        if ext != '.b3d':
            return JsonResponse({'ok': False, 'error': 'Faqat .b3d fayl qabul qilinadi'})
        # 2026-09-04 (TZ-Detal-QR-Interaktiv-3D): b3d_panels — TO'LIQ panel
        # ro'yxati (mesh+nom+o'lcham+material+kromka, frontend interaktiv
        # ko'ruvchi uchun). b3d_render — bitta statik PNG (zaxira/thumbnail,
        # panel_data bo'lmagan eski frontendlar/ulashish uchun ham foydali).
        from ..services.b3d_panels import b3d_to_panels
        from ..services.b3d_render import b3d_to_png
        data = b3d_uploaded.read()
        panel_data, panels_err = b3d_to_panels(data)
        if panels_err:
            return JsonResponse({'ok': False, 'error': panels_err})
        if detal_count is None:
            detal_count = len(panel_data) or None
        png, err = b3d_to_png(data)
        if err:
            return JsonResponse({'ok': False, 'error': err})
        unique_name = f"{uuid.uuid4().hex}.png"
        image_content = ContentFile(png, name=unique_name)
    elif uploaded:
        ext = os.path.splitext(uploaded.name)[1].lower()
        if ext not in ALLOWED_IMAGE_EXT:
            return JsonResponse({'ok': False, 'error': f'Ruxsat etilmagan format: {ext} (faqat rasm)'})
        unique_name = f"{uuid.uuid4().hex}{ext}"
        image_content = uploaded
    else:
        return JsonResponse({'ok': False, 'error': 'Rasm yoki .b3d fayl kerak'})

    from ..models import ClientDetalCard
    card = ClientDetalCard(
        order=order, owner=user, title=title,
        artikul=artikul, detal_count=detal_count,
        panel_data=panel_data or [],
    )
    card.image.save(unique_name, image_content, save=False)
    card.save()

    return JsonResponse({'ok': True, 'data': {
        'short_code': card.short_code,
        'url': request.build_absolute_uri(f'/mini/detal/{card.short_code}/'),
    }})


@csrf_exempt
@require_POST
@require_feature('files_upload')
def detal_qr_update(request):
    """Detal QR kartochkani tahrirlash (2026-09-04) — nom/artikul/detal
    soni. Rasm/panel_data QAYTA YUKLANMAYDI (yangi .b3d/rasm kerak bo'lsa
    kartochkani o'chirib qaytadan yaratish kerak — bu funksiya faqat matn
    maydonlarini o'zgartiradi). Faqat egasi tahrirlay oladi."""
    user = get_client_user(request)
    if not user:
        return JsonResponse({'ok': False, 'error': 'Auth kerak'}, status=401)

    short_code = request.POST.get('short_code')
    if not short_code:
        return JsonResponse({'ok': False, 'error': 'short_code kerak'})

    from ..models import ClientDetalCard
    card = ClientDetalCard.objects.filter(short_code=short_code).first()
    if not card:
        return JsonResponse({'ok': False, 'error': 'Topilmadi'})
    if card.owner_id != user.pk:
        return JsonResponse({'ok': False, 'error': "Ruxsat yo'q"}, status=403)

    title = (request.POST.get('title') or '').strip()
    if not title:
        return JsonResponse({'ok': False, 'error': 'Nomi kerak'})
    card.title = title
    card.artikul = (request.POST.get('artikul') or '').strip()
    detal_count = request.POST.get('detal_count')
    try:
        card.detal_count = int(detal_count) if detal_count else None
    except ValueError:
        card.detal_count = None
    card.save(update_fields=['title', 'artikul', 'detal_count'])

    return JsonResponse({'ok': True})


@csrf_exempt
@require_POST
@require_feature('files_upload')
def detal_qr_delete(request):
    """Detal QR kartochkani o'chirish (2026-09-04) — fayl ham diskdan
    o'chadi. Faqat egasi o'chira oladi."""
    user = get_client_user(request)
    if not user:
        return JsonResponse({'ok': False, 'error': 'Auth kerak'}, status=401)

    short_code = request.POST.get('short_code')
    if not short_code:
        return JsonResponse({'ok': False, 'error': 'short_code kerak'})

    from ..models import ClientDetalCard
    card = ClientDetalCard.objects.filter(short_code=short_code).first()
    if not card:
        return JsonResponse({'ok': True})  # allaqachon yo'q — muvaffaqiyat
    if card.owner_id != user.pk:
        return JsonResponse({'ok': False, 'error': "Ruxsat yo'q"}, status=403)

    card.image.delete(save=False)
    card.delete()
    return JsonResponse({'ok': True})


@csrf_exempt
@require_POST
@require_feature('files_upload')
def chunk_upload(request):
    """Chunked upload — katta fayllar uchun."""
    user = get_client_user(request)
    if not user:
        return JsonResponse({'ok': False, 'error': 'Auth kerak'}, status=401)

    upload_id = request.POST.get('upload_id', '')
    chunk_index = int(request.POST.get('chunk_index', 0))
    total_chunks = int(request.POST.get('total_chunks', 1))
    order_id = request.POST.get('order_id')
    file_name = request.POST.get('file_name', 'file')

    chunk = request.FILES.get('chunk')
    if not chunk:
        return JsonResponse({'ok': False, 'error': 'Chunk kerak'})

    if not upload_id:
        upload_id = uuid.uuid4().hex

    chunk_path = os.path.join(CHUNK_DIR, upload_id)
    os.makedirs(chunk_path, exist_ok=True)

    with open(os.path.join(chunk_path, f'{chunk_index:05d}'), 'wb') as f:
        for part in chunk.chunks():
            f.write(part)

    existing = len(os.listdir(chunk_path))
    if existing < total_chunks:
        return JsonResponse({'ok': True, 'data': {'upload_id': upload_id, 'received': existing, 'total': total_chunks}})

    ext = os.path.splitext(file_name)[1].lower()
    file_type = _detect_file_type(ext)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    final_path = os.path.join(chunk_path, f'final{ext}')

    total_size = 0
    with open(final_path, 'wb') as out:
        for i in range(total_chunks):
            cp = os.path.join(chunk_path, f'{i:05d}')
            with open(cp, 'rb') as inp:
                data = inp.read()
                total_size += len(data)
                out.write(data)

    try:
        order = ClientOrder.objects.get(pk=order_id)
    except ClientOrder.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Buyurtma topilmadi'})

    obj = ClientOrderFile(
        order=order,
        file_type=file_type,
        file_name=file_name,
        file_size=total_size,
        caption=request.POST.get('caption', ''),
        uploaded_by=user,
    )

    _save_and_optimize(obj, file_type, final_path, unique_name)
    shutil.rmtree(chunk_path, ignore_errors=True)

    # Almashtirilgan bo'lsa — eski fayl diskdan o'chadi (joy egallamasin)
    if _old_path:
        try:
            if os.path.exists(_old_path):
                os.unlink(_old_path)
        except OSError:
            pass

    from ..serializers import serialize_file
    return JsonResponse({'ok': True, 'data': {'file': serialize_file(obj),
                                              'replaced': bool(_rep_id and _old_path)}})
