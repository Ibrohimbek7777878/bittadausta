"""client_erp/module_pick_views.py — TZ-Usta-Bittada-Modul-Tanlash.md.

BUTUNLAY YANGI, ALOHIDA fayl — mavjud client_erp view'lariga (dashboard.py,
zamers.py, consumers.py) BIR QATOR ham tegilmaydi. `bom.FurnitureModule`ga
FAQAT O'QISH uchun murojaat qiladi (status='approved' filtri bilan) —
yozmaydi, tasdiqlash/rad hamon faqat ichki `/bom/modules/...` sahifasida.
"""
import json
import logging

from django.http import JsonResponse, Http404
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import csrf_exempt

logger = logging.getLogger(__name__)


def _guard(request, username):
    """client_erp/middleware.py ALLAQACHON /mini/<username>/... uchun
    request.client_user'ni JWT'dan o'rnatadi va username mos kelmasa
    redirect qiladi — bu yerda faqat mavjudligini tekshiramiz + qo'shimcha
    IDOR himoyasi (zamer egasi tekshiruvi chaqiruvchi joyda amalga oshadi)."""
    user = getattr(request, 'client_user', None)
    if not user or user.username != username:
        return None
    return user


def _db():
    from tenant_manager.middleware import get_current_db_alias
    return get_current_db_alias()


@require_GET
def module_pick_entry(request, username):
    """/mini/<username>/modules-pick/ — ID SIZ kirish nuqtasi (2026-08-15).

    Ilgari UI qattiq `.../modules-pick/1/` ni ochardi: `zamer_id=1` faqat
    bigone_cl2 da bor edi, boshqa akkauntda 404 chiqib, «fayl yuklash /
    3D xona yo'q» bo'lib ko'rinardi.

    Endi: foydalanuvchining OXIRGI zameri ochiladi; umuman bo'lmasa —
    bittasi avtomatik yaratiladi (bo'sh sahifa o'rniga ishlaydigan sahifa).
    """
    user = _guard(request, username)
    if not user:
        raise Http404()
    from manfacturing.models import Zamer
    db = _db()
    z = (Zamer.objects.using(db).filter(client_user_id=user.id)
         .order_by('-id').first())
    if not z:
        from django.db import transaction
        with transaction.atomic(using=db):
            z = Zamer.objects.using(db).create(
                client_user_id=user.id, room_name='Mening xonam',
                width=5000, depth=4000, height=2800,
            )
    return module_pick_page(request, username, z.pk)


@require_GET
def module_pick_page(request, username, zamer_id):
    user = _guard(request, username)
    if not user:
        raise Http404()
    from manfacturing.models import Zamer
    db = _db()
    zamer = Zamer.objects.using(db).filter(pk=zamer_id, client_user_id=user.id).first()
    if not zamer:
        raise Http404()
    return render(request, 'client_erp/module_pick.html', {
        'username': username, 'zamer_id': zamer_id,
        'room_name': zamer.room_name or '', 'width': zamer.width or 0,
        'depth': zamer.depth or 0, 'height': zamer.height or 0,
    })


_CAT_LABEL = {
    'shkaf': 'Shkaf', 'tortmali_blok': 'Tortmali blok', 'javon': 'Javon/polka',
    'pilyastra': 'Pilyastra/filler', '': 'Kategoriyasiz',
}


@require_GET
def module_pick_list_api(request, username, zamer_id):
    user = _guard(request, username)
    if not user:
        raise Http404()
    from manfacturing.models import Zamer
    from bom.models import FurnitureModule
    db = _db()
    zamer = Zamer.objects.using(db).filter(pk=zamer_id, client_user_id=user.id).first()
    if not zamer:
        raise Http404()

    qs = FurnitureModule.objects.using(db).filter(status='approved')
    category = request.GET.get('category', '')
    if category:
        qs = qs.filter(category=category)

    target_h = float(zamer.height or 0)
    # Mining ko'p buyurtma faylida bir xil jismoniy modulni har safar
    # alohida qatorga yozadi (dedublikatsiya yo'q) — foydalanuvchiga bir
    # xil o'lchamli modul bir necha marta ko'rinmasin deb, shu yerda
    # (o'lcham+kategoriya bo'yicha) eng yangisi qoldirilib, dublikatlar
    # olib tashlanadi (2026-08-14 aniqlangan bug).
    seen = set()
    rows = []
    for m in qs.order_by('-created_at')[:800]:
        key = (round(float(m.width_mm or 0)), round(float(m.height_mm or 0)), round(float(m.depth_mm or 0)), m.category)
        if key in seen:
            continue
        seen.add(key)
        rows.append(m)
        if len(rows) >= 200:
            break
    if target_h:
        rows.sort(key=lambda m: abs(float(m.height_mm or 0) - target_h))

    data = [{
        'id': m.id, 'width_mm': float(m.width_mm), 'height_mm': float(m.height_mm),
        'depth_mm': float(m.depth_mm), 'category': m.category,
        'category_label': _CAT_LABEL.get(m.category, m.category),
    } for m in rows]
    return JsonResponse({'ok': True, 'modules': data, 'categories': _CAT_LABEL})


@require_GET
def module_pick_mesh_api(request, username, module_id):
    """3D geometriya — bom/views.py::modules_module_mesh bilan bir xil
    mantiq, lekin auth boshqa (staff+token o'rniga ClientUser sessiyasi) —
    shuning uchun bom/views.py'ga tegmasdan shu yerda mustaqil takrorlanadi."""
    user = getattr(request, 'client_user', None)
    if not user:
        raise Http404()
    from bom.models import FurnitureModule
    from bom.parser_b3d import build_panel_mesh, material_color
    db = _db()
    # Status filtri YO'Q — ko'rib-chiqish ro'yxatidagi (pending) modullarni
    # ham 3D ko'rish kerak, aks holda "👁 3D ko'rish" ishlamaydi
    # (2026-08-14, review UI shu sahifaga ko'chirilgach zarur bo'ldi).
    mod = FurnitureModule.objects.using(db).filter(pk=module_id).first()
    if not mod:
        return JsonResponse({'ok': False, 'error': 'topilmadi'}, status=404)

    # ── BO'LAKLAR (2026-08-18, TZ-3D-Modul §M2) ──────────────────────────
    # Modul funksional qismlarga ajratiladi (Korpus · Tortma 1..N · Eshik ·
    # Polkalar) va har mesh-bo'lakka o'z bo'lagining kaliti yoziladi.
    # Shu tufayli 3D da har qismni ALOHIDA qo'shish/bo'yash/o'chirish mumkin.
    from bom.module_mining import split_into_parts
    _pd = mod.panel_data or []
    try:
        _parts_map = split_into_parts(_pd)
    except Exception:
        _parts_map = []
    _idx_to_part = {}
    for _pt in _parts_map:
        for _i in _pt['indices']:
            _idx_to_part[_i] = _pt

    parts = []
    for _pi, rec in enumerate(_pd):
        if rec.get('modelCode') != 4002:
            continue
        try:
            bm = build_panel_mesh(rec)
        except Exception:
            bm = None
        if not bm:
            continue
        verts, idx = bm
        color = material_color(rec.get('material', ''))
        label = (rec.get('name') or '').replace('\r', ' ').strip()
        _pt = _idx_to_part.get(_pi)
        parts.append({
            'positions': [c for v in verts for c in v],
            'indices': list(idx), 'color': color, 'label': label,
            'part_key': (_pt or {}).get('key', 'korpus'),
            'part_label': (_pt or {}).get('label', 'Korpus'),
        })

    # Faqat MESH chiqqan bo'laklar ro'yxati (bo'shlari ko'rsatilmaydi)
    _have = {p['part_key'] for p in parts}
    blocks = [{'key': b['key'], 'label': b['label'], 'count': b['count']}
              for b in _parts_map if b['key'] in _have]
    return JsonResponse({'ok': True, 'parts': parts, 'blocks': blocks})


# ─────────────────────────────────────────────────────────────────────────
#  O'z faylidan modul olish (TZ-Usta-Bittada-Modul-Tanlash.md §9,
#  2026-08-14) — mijoz o'zining .b3d faylini yuklaydi, undagi modullar
#  DARHOL (staff review'siz, DB'ga yozmasdan) shu sahifada ko'rinadi va
#  xonaga qo'shiladi. Umumiy (approved) katalogdan FARQLI: bu — faqat
#  shu foydalanuvchining o'z fayli, ochiq kutubxonaga QO'SHILMAYDI.
#  `bom.module_mining`/`bom.parser_b3d` FAQAT O'QISH uchun import qilinadi,
#  ularning DB-yozuvchi funksiyalari (worker/mining komandalar) chaqirilmaydi.
# ─────────────────────────────────────────────────────────────────────────
def _part_aabb(part):
    """Bitta mesh-bo'lakning gabariti (METRDA — `positions` shu birlikda)."""
    mn = [1e18] * 3
    mx = [-1e18] * 3
    pos = part['positions']
    for i in range(0, len(pos), 3):
        for k in range(3):
            v = pos[i + k]
            if v < mn[k]: mn[k] = v
            if v > mx[k]: mx[k] = v
    return (mn[0], mx[0], mn[1], mx[1], mn[2], mx[2])


def _block_dims(parts):
    """Blokning haqiqiy gabariti (mm) — mesh uchlaridan. `parts[].positions`
    METRDA (build_panel_mesh scale=0.001), shuning uchun 1000ga ko'paytiriladi."""
    mnx = mny = mnz = 1e18
    mxx = mxy = mxz = -1e18
    for p in parts:
        pos = p['positions']
        for i in range(0, len(pos), 3):
            x, y, z = pos[i], pos[i + 1], pos[i + 2]
            if x < mnx: mnx = x
            if x > mxx: mxx = x
            if y < mny: mny = y
            if y > mxy: mxy = y
            if z < mnz: mnz = z
            if z > mxz: mxz = z
    if mnx > mxx:
        return (0.0, 0.0, 0.0)
    return (round((mxx - mnx) * 1000, 1), round((mxy - mny) * 1000, 1), round((mxz - mnz) * 1000, 1))


@csrf_exempt
@require_POST
def module_pick_file_upload(request, username, zamer_id):
    user = _guard(request, username)
    if not user:
        raise Http404()
    from bom.module_mining import extract_modules_from_bytes, guess_category, split_indices_by_aabb
    from bom.parser_b3d import build_panel_mesh, material_color

    files = request.FILES.getlist('files')
    if not files:
        return JsonResponse({'ok': False, 'error': "fayl yuborilmadi"}, status=400)

    out = []
    for fi, f in enumerate(files):
        if not f.name.lower().endswith('.b3d'):
            continue
        try:
            data = f.read()
            result = extract_modules_from_bytes(data)
        except Exception as e:
            out.append({'file': f.name, 'error': str(e)})
            continue
        if result.get('status') != 'ok':
            out.append({'file': f.name, 'error': result.get('error') or 'xato'})
            continue
        for mi, mdict in enumerate(result.get('modules') or []):
            # Mining fayl-ketma-ketligi bo'yicha guruhlaydi — bu ko'pincha
            # bir necha alohida mebelni bitta yozuvga qo'shib yuboradi.
            # Shu sabab har modul FIZIK bloklarga ajratiladi va foydalanuvchiga
            # alohida-alohida kartochka bo'lib chiqadi (TZ §11, 2026-08-14).
            # MUHIM: bo'lish AYNAN mesh chiqqan bo'laklar (parts) ustida
            # bajariladi — brauzer (katalogdan qo'shish) ham xuddi shu
            # to'plamda ishlaydi. Ilgari server BARCHA panel yozuvi bo'yicha
            # bo'lardi va bitta modul ikki yo'lda TURLICHA bo'linardi
            # (2026-08-15 regressiya sinovi `1245_Shkaf_1550.b3d` da aniqladi).
            pairs = []          # [(rec, part), ...] — nom va geometriya birga
            for rec in (mdict.get('panel_data') or []):
                if rec.get('modelCode') != 4002:
                    continue
                try:
                    bm = build_panel_mesh(rec)
                except Exception:
                    bm = None
                if not bm:
                    continue
                verts, idx = bm
                pairs.append((rec, {
                    'positions': [c for v in verts for c in v],
                    'indices': list(idx),
                    'color': material_color(rec.get('material', '')),
                    'label': (rec.get('name') or '').replace('\r', ' ').strip(),
                }))
            if not pairs:
                continue
            try:
                groups = split_indices_by_aabb([_part_aabb(p) for _, p in pairs], 0.02)
            except Exception:
                groups = None
            blocks = ([[pairs[i] for i in g] for g in groups] if groups else [pairs])

            for bi, block in enumerate(blocks):
                parts = [p for _, p in block]
                if not parts:
                    continue
                dims = _block_dims(parts)
                bdict = {
                    'width_mm': dims[0], 'height_mm': dims[1], 'depth_mm': dims[2],
                    'panel_names': [(r.get('name') or '').strip() for r, _ in block],
                }
                category = guess_category(bdict)
                out.append({
                    'file': f.name,
                    'id': 'up_%d_%d_%d' % (fi, mi, bi),
                    'width_mm': dims[0], 'height_mm': dims[1], 'depth_mm': dims[2],
                    'category': category,
                    'category_label': _CAT_LABEL.get(category, category),
                    'is_suspicious': False,
                    'karkas_max_repeat': 0,
                    'block_index': bi, 'block_total': len(blocks),
                    'panel_count': len(block),
                    'panel_names': bdict['panel_names'][:12],
                    'parts': parts,
                })
    return JsonResponse({'ok': True, 'modules': out})


# ─────────────────────────────────────────────────────────────────────────
#  Modul-katalog KO'RIB CHIQISH (review) — /bom/modules/bulk-upload/ ichki
#  sahifasidagi ro'yxatning AYNAN o'zi, shu sahifada (2026-08-14,
#  foydalanuvchi so'rovi: "1-rasmdagi narsalar 2-rasmdagi joyda chiqsin").
#  bom/views.py'dagi modules_review_list/action bilan bir xil mantiq, lekin
#  auth boshqa (staff+token o'rniga ClientUser) — shu sabab bom/views.py'ga
#  TEGILMASDAN shu yerda mustaqil takrorlanadi. Bu — o'qish+tasdiqlash;
#  boshqa tenant ma'lumotiga tegmaydi (_db() joriy tenantni beradi).
# ─────────────────────────────────────────────────────────────────────────
@require_GET
def modules_review_list_api(request, username):
    user = _guard(request, username)
    if not user:
        raise Http404()
    from bom.models import FurnitureModule
    db = _db()
    qs = FurnitureModule.objects.using(db).all()
    status = request.GET.get('status', 'pending')
    if status in ('pending', 'approved', 'rejected'):
        qs = qs.filter(status=status)
    category = request.GET.get('category', '')
    if category:
        qs = qs.filter(category=category)
    if request.GET.get('suspicious') == '1':
        qs = qs.filter(is_suspicious=True)

    total = qs.count()
    page = max(1, int(request.GET.get('page', 1) or 1))
    per_page = 60
    rows = list(qs.order_by('-created_at')[(page - 1) * per_page: page * per_page])

    data = [{
        'id': m.id, 'panel_count': m.panel_count,
        'width_mm': float(m.width_mm), 'height_mm': float(m.height_mm), 'depth_mm': float(m.depth_mm),
        'category': m.category, 'is_suspicious': m.is_suspicious,
        'karkas_max_repeat': m.karkas_max_repeat,
        'status': m.status, 'panel_names': (m.panel_names or [])[:12],
    } for m in rows]

    counts = {
        'pending': FurnitureModule.objects.using(db).filter(status='pending').count(),
        'approved': FurnitureModule.objects.using(db).filter(status='approved').count(),
        'rejected': FurnitureModule.objects.using(db).filter(status='rejected').count(),
    }
    return JsonResponse({'ok': True, 'modules': data, 'total': total, 'page': page,
                         'per_page': per_page, 'counts': counts})


@csrf_exempt
@require_POST
def modules_review_action_api(request, username, module_id):
    user = _guard(request, username)
    if not user:
        raise Http404()
    from django.utils import timezone
    from bom.models import FurnitureModule
    db = _db()
    try:
        body = json.loads(request.body or '{}')
    except Exception:
        body = {}
    action = body.get('action')
    if action not in ('approve', 'reject'):
        return JsonResponse({'ok': False, 'error': "action: approve|reject"}, status=400)

    mod = FurnitureModule.objects.using(db).filter(pk=module_id).first()
    if not mod:
        return JsonResponse({'ok': False, 'error': 'topilmadi'}, status=404)

    mod.status = 'approved' if action == 'approve' else 'rejected'
    # reviewed_by — Django User FK; bu yerda ClientUser bo'lgani uchun
    # bog'lanmaydi (NULL qoladi), faqat vaqt yoziladi.
    mod.reviewed_at = timezone.now()
    update_fields = ['status', 'reviewed_at']
    category = body.get('category')
    if category is not None:
        mod.category = category[:50]
        update_fields.append('category')
    mod.save(using=db, update_fields=update_fields)
    return JsonResponse({'ok': True})


# ─────────────────────────────────────────────────────────────────────────
#  Xona-o'lchash (BLE-lazer + qo'lda) — TZ-Usta-Bittada-Modul-Tanlash.md §7.
#  BUTUNLAY YANGI — mavjud Zamer/ClientZamerRoom modellariga tegilmaydi.
# ─────────────────────────────────────────────────────────────────────────
@csrf_exempt
@require_POST
def room_capture_start(request, username, zamer_id):
    user = _guard(request, username)
    if not user:
        raise Http404()
    from client_erp.models import RoomCapture
    db = _db()
    room = RoomCapture.objects.using(db).filter(
        client_user_id=user.id, zamer_id=zamer_id).order_by('-created_at').first()
    if not room:
        room = RoomCapture.objects.using(db).create(client_user_id=user.id, zamer_id=zamer_id)
    return JsonResponse({'ok': True, 'room_id': room.id})


@require_GET
def room_list_api(request, username, zamer_id):
    """Shu zamerga tegishli BARCHA xonalar ro'yxati — kartochkalar uchun
    (2026-08-14, "ko'p xona qo'shish" so'rovi, TZ §8.3/J3)."""
    user = _guard(request, username)
    if not user:
        raise Http404()
    from client_erp.models import RoomCapture
    db = _db()
    rooms = RoomCapture.objects.using(db).filter(
        client_user_id=user.id, zamer_id=zamer_id).order_by('created_at')
    return JsonResponse({'ok': True, 'rooms': [{
        'id': r.id, 'room_name': r.room_name or 'Xona',
        'width_mm': r.width_mm, 'depth_mm': r.depth_mm, 'height_mm': r.height_mm,
        'module_count': r.placed_modules.count(),
    } for r in rooms]})


# Standart uy shabloni (TZ §13.5 / Q5, 2026-08-15) — xodim hech narsa
# qo'shmasa ham tayyor 3D turishi uchun. O'lchamlar keyin qo'lda
# o'zgartiriladi (tepa paneldagi maydonlar orqali).
STANDARD_HOUSE = [
    {'room_name': 'Yashash xonasi', 'width_mm': 4200, 'depth_mm': 3600, 'height_mm': 2800},
    {'room_name': 'Yotoqxona',      'width_mm': 3600, 'depth_mm': 3200, 'height_mm': 2800},
]

# Xona turlari — foydalanuvchi ro'yxatdan tanlaydi, o'lchamlar oldindan
# to'ldiriladi (keyin qo'lda o'zgartiriladi). 2026-08-15 so'rovi:
# "yana 3ta xona va dush bilan hojatxona qo'shish kerak, nom berish kerak".
ROOM_TYPES = [
    {'key': 'yashash',  'room_name': 'Yashash xonasi',  'width_mm': 4200, 'depth_mm': 3600, 'height_mm': 2800},
    {'key': 'yotoq',    'room_name': 'Yotoqxona',       'width_mm': 3600, 'depth_mm': 3200, 'height_mm': 2800},
    {'key': 'bolalar',  'room_name': 'Bolalar xonasi',  'width_mm': 3200, 'depth_mm': 3000, 'height_mm': 2800},
    {'key': 'oshxona',  'room_name': 'Oshxona',         'width_mm': 3000, 'depth_mm': 2800, 'height_mm': 2800},
    {'key': 'mehmon',   'room_name': 'Mehmonxona',      'width_mm': 4000, 'depth_mm': 3400, 'height_mm': 2800},
    {'key': 'hammom',   'room_name': 'Hammom (dush)',   'width_mm': 2000, 'depth_mm': 1700, 'height_mm': 2600},
    {'key': 'hojat',    'room_name': 'Hojatxona',       'width_mm': 1500, 'depth_mm': 1200, 'height_mm': 2600},
    {'key': 'koridor',  'room_name': 'Koridor',         'width_mm': 3000, 'depth_mm': 1400, 'height_mm': 2800},
]


@require_GET
def room_types_api(request, username):
    user = _guard(request, username)
    if not user:
        raise Http404()
    return JsonResponse({'ok': True, 'types': ROOM_TYPES})


@csrf_exempt
@require_POST
def room_rename_api(request, username, room_id):
    """Xonaga nom berish / nomini o'zgartirish (2026-08-15 so'rovi)."""
    user = _guard(request, username)
    if not user:
        raise Http404()
    from client_erp.models import RoomCapture
    db = _db()
    room = RoomCapture.objects.using(db).filter(pk=room_id, client_user_id=user.id).first()
    if not room:
        raise Http404()
    try:
        body = json.loads(request.body or '{}')
    except Exception:
        body = {}
    name = (body.get('room_name') or '').strip()[:100]
    if not name:
        return JsonResponse({'ok': False, 'error': 'nom bo\'sh'}, status=400)
    RoomCapture.objects.using(db).filter(pk=room.id).update(room_name=name)
    return JsonResponse({'ok': True, 'room_name': name})


@csrf_exempt
@require_POST
def room_preset_api(request, username, zamer_id):
    """Standart 2-xonali uyni bir yo'la qo'shadi. Mavjud xonalarga
    TEGMAYDI — faqat qo'shiladi (TZ §13.8)."""
    user = _guard(request, username)
    if not user:
        raise Http404()
    from client_erp.models import RoomCapture
    db = _db()
    created = []
    for spec in STANDARD_HOUSE:
        r = RoomCapture.objects.using(db).create(
            client_user_id=user.id, zamer_id=zamer_id, **spec)
        created.append({'id': r.id, 'room_name': r.room_name})
    return JsonResponse({'ok': True, 'rooms': created})


@csrf_exempt
@require_POST
def room_create_api(request, username, zamer_id):
    """Yangi, BO'SH xona yaratadi (mavjudlarni qayta ishlatmaydi) —
    room_capture_start'dan farqli, har chaqiruvda YANGI qator (2026-08-14)."""
    user = _guard(request, username)
    if not user:
        raise Http404()
    from client_erp.models import RoomCapture
    db = _db()
    try:
        body = json.loads(request.body or '{}')
    except Exception:
        body = {}
    n = RoomCapture.objects.using(db).filter(client_user_id=user.id, zamer_id=zamer_id).count()
    kwargs = dict(
        client_user_id=user.id, zamer_id=zamer_id,
        room_name=(body.get('room_name') or '').strip()[:100] or ('Xona %d' % (n + 1)),
    )
    for f in ('width_mm', 'depth_mm', 'height_mm'):
        v = body.get(f)
        if isinstance(v, (int, float)) and v > 0:
            kwargs[f] = int(v)
    room = RoomCapture.objects.using(db).create(**kwargs)
    return JsonResponse({'ok': True, 'room_id': room.id, 'room_name': room.room_name})


@require_GET
def room_capture_get(request, username, room_id):
    user = _guard(request, username)
    if not user:
        raise Http404()
    from client_erp.models import RoomCapture
    db = _db()
    room = RoomCapture.objects.using(db).filter(pk=room_id, client_user_id=user.id).first()
    if not room:
        raise Http404()
    segs = list(room.segments.all().order_by('order'))
    mods = list(room.placed_modules.all().order_by('id'))
    return JsonResponse({
        'ok': True, 'height_mm': room.height_mm,
        'width_mm': room.width_mm, 'depth_mm': room.depth_mm,
        'finish': room.finish or None,          # devor/pol rangi va oboyi (§M4)
        # Xona shakli (poligon) va devor teshiklari — 2026-08-18 §F1
        'outline': room.outline or None,
        'openings': room.openings or [],
        'segments': [
            {'label': s.label, 'length_mm': s.length_mm, 'order': s.order, 'source': s.source}
            for s in segs
        ],
        'modules': [{
            'id': (m.furniture_module_id if m.source == 'catalog'
                   else ('wall_saved_%d' % m.pk if m.source == 'wall' else 'up_saved_%d' % m.pk)),
            'source': m.source,
            'width_mm': m.width_mm, 'height_mm': m.height_mm, 'depth_mm': m.depth_mm,
            'category': m.category, 'category_label': _CAT_LABEL.get(m.category, m.category),
            'px': m.px, 'py': m.py, 'scaleF': m.scale_f,
            'rot': m.rot_deg, 'rotX': m.rot_x_deg, 'rotZ': m.rot_z_deg,
            'pz': m.pz or 0,
            'homeX': m.home_x, 'homeY': m.home_y, 'homeZ': m.home_z,
            'color': m.color or None, 'partLabel': m.part_label or None,
            'wallItem': m.is_wall_item,
            'parts': m.mesh_parts,
        } for m in mods],
    })


@csrf_exempt
@require_POST
def room_capture_save_state(request, username, room_id):
    """Xona o'lchami + joylashtirilgan modullar to'liq holatini saqlaydi —
    sahifa yopilib qayta ochilganda qolgan joydan davom etish uchun
    (TZ-Usta-Bittada-Modul-Tanlash.md §8.7, 2026-08-14). Har chaqiruvda
    shu xonaning PlacedModule qatorlari TO'LIQ almashtiriladi (client
    tomon har o'zgarishdan keyin butun `selected[]`ni yuboradi — inkremental
    diff shart emas, modullar soni odatda kichik, oddiy va ishonchli)."""
    user = _guard(request, username)
    if not user:
        raise Http404()
    from django.db import transaction
    from client_erp.models import RoomCapture, PlacedModule
    db = _db()
    room = RoomCapture.objects.using(db).filter(pk=room_id, client_user_id=user.id).first()
    if not room:
        raise Http404()
    try:
        body = json.loads(request.body or '{}')
    except Exception:
        body = {}

    update_fields = []
    for f in ('width_mm', 'depth_mm', 'height_mm'):
        v = body.get(f)
        if isinstance(v, (int, float)) and v > 0:
            setattr(room, f, int(v))
            update_fields.append(f)
    # ── XONA KO'RINISHI (2026-08-18, §M4): devor/pol rangi va oboyi ──────
    # `RoomCapture.finish` (JSONField) allaqachon bor — shu yerda to'ldiriladi.
    fin = body.get('finish')
    if isinstance(fin, dict):
        room.finish = {k: fin.get(k) for k in ('wall', 'floor', 'ceil', 'wallTex', 'floorTex')}
        update_fields.append('finish')
    # ── XONA SHAKLI (poligon) va DEVOR TESHIKLARI — 2026-08-18 §F1 ──────
    # Yuborilmasa TEGILMAYDI (eski xonalar buzilmasin). Bo'sh ro'yxat
    # yuborilsa — ataylab tozalash deb qabul qilinadi.
    out = body.get('outline')
    if isinstance(out, dict):
        # ── KO'P XONALI PLAN (2026-08-18) ─────────────────────────────
        # Bitta yozuv = butun kvartira. `rooms` — ichidagi har bir xona
        # (nomi + konturi). `points` — tashqi gabarit (eski kod uchun).
        # Faqat `points` kelsa (eski, bitta xonali) — u bitta xona deb
        # qabul qilinadi, hech narsa buzilmaydi.
        rooms = []
        for r in (out.get('rooms') or [])[:60]:
            if not isinstance(r, dict):
                continue
            cp = _clean_points(r.get('points'))
            if cp:
                rooms.append({'name': str(r.get('name') or '')[:60], 'points': cp})
        clean = _clean_points(out.get('points'))
        if not rooms and clean:
            rooms = [{'name': '', 'points': clean}]
        if rooms:
            if not clean:                      # tashqi gabaritni o'zimiz hisoblaymiz
                allp = [p for r in rooms for p in r['points']]
                mnx = min(p[0] for p in allp); mxx = max(p[0] for p in allp)
                mny = min(p[1] for p in allp); mxy = max(p[1] for p in allp)
                clean = [[mnx, mny], [mxx, mny], [mxx, mxy], [mnx, mxy]]
            th = out.get('thickness_mm')
            room.outline = {
                'points': clean,
                'rooms': rooms,
                'thickness_mm': int(th) if isinstance(th, (int, float)) and 10 <= th <= 1000 else 100,
            }
            # ── CHIZMA-FON (2026-08-19, §A6) ──────────────────────────
            # Yuklangan plan rasmi 2D muharrirda TO'G'RI MASSHTABDA fon
            # bo'lib turadi — usta uning ustidan devor chizadi. AI xona
            # konturini noto'g'ri o'qisa ham natija aniq bo'ladi.
            bd = out.get('backdrop')
            if isinstance(bd, dict) and bd.get('url'):
                try:
                    room.outline['backdrop'] = {
                        'url': str(bd['url'])[:300],
                        'w_mm': float(bd.get('w_mm') or 0),
                        'h_mm': float(bd.get('h_mm') or 0),
                        'x_mm': float(bd.get('x_mm') or 0),
                        'y_mm': float(bd.get('y_mm') or 0),
                        'opacity': max(0.05, min(1.0, float(bd.get('opacity') or 0.45))),
                    }
                except (TypeError, ValueError):
                    pass
            update_fields.append('outline')
    elif out is None and 'outline' in body:
        room.outline = None
        update_fields.append('outline')

    ops = body.get('openings')
    if isinstance(ops, list):
        room.openings = [_clean_opening(o) for o in ops[:100]]
        room.openings = [o for o in room.openings if o]
        update_fields.append('openings')
    if update_fields:
        room.save(using=db, update_fields=update_fields)

    modules = body.get('modules')
    if isinstance(modules, list):
        with transaction.atomic(using=db):
            PlacedModule.objects.using(db).filter(room_id=room.id).delete()
            rows = []
            for m in modules[:200]:
                if not isinstance(m, dict):
                    continue
                is_upload = isinstance(m.get('id'), str) and m['id'].startswith('up')
                # ── DEVOR JIHOZI (2026-08-18, §M5) ────────────────────────
                # Rozetka/oyna/kartina... katalog moduli EMAS — `id` si matn
                # («wall_oyna_1»). Ilgari `int(id)` xato berib, jihoz jimgina
                # tushib qolardi (sinovda aniqlandi).
                is_wall = bool(m.get('wallItem')) or (
                    isinstance(m.get('id'), str) and m['id'].startswith('wall_'))
                try:
                    rows.append(PlacedModule(
                        room_id=room.id,
                        source='wall' if is_wall else ('upload' if is_upload else 'catalog'),
                        furniture_module_id=None if (is_upload or is_wall) else int(m['id']),
                        width_mm=float(m['width_mm']), height_mm=float(m['height_mm']), depth_mm=float(m['depth_mm']),
                        category=m.get('category') or '',
                        px=float(m['px']), py=float(m['py']), scale_f=float(m.get('scaleF') or 1),
                        rot_deg=float(m.get('rot') or 0),
                        rot_x_deg=float(m.get('rotX') or 0),
                        rot_z_deg=float(m.get('rotZ') or 0),
                        mesh_parts=m.get('parts') if is_upload else None,
                        # §M3/§M5 — blok rangi, bo'lak nomi, devor jihozi
                        color=(m.get('color') or '')[:16],
                        part_label=(m.get('partLabel') or '')[:40],
                        is_wall_item=bool(m.get('wallItem')),
                        # Balandlik + mo'ljal (asl joyi) — 2026-08-18
                        pz=float(m.get('pz') or 0),
                        home_x=_fnum(m.get('homeX')),
                        home_y=_fnum(m.get('homeY')),
                        home_z=_fnum(m.get('homeZ')),
                    ))
                except (KeyError, TypeError, ValueError):
                    continue
            if rows:
                PlacedModule.objects.using(db).bulk_create(rows)
    return JsonResponse({'ok': True})


def _clean_points(pts):
    """Nuqtalar ro'yxatini tozalaydi. 3 tadan kam bo'lsa None."""
    if not isinstance(pts, list) or len(pts) < 3:
        return None
    out = []
    for pt in pts[:300]:
        try:
            out.append([round(float(pt[0]), 1), round(float(pt[1]), 1)])
        except (TypeError, ValueError, IndexError):
            continue
    return out if len(out) >= 3 else None


def _clean_opening(o):
    """Bitta eshik/deraza yozuvini tozalaydi (§F1). Yaroqsiz bo'lsa None."""
    if not isinstance(o, dict):
        return None
    try:
        w = float(o.get('width') or 0)
        h = float(o.get('height') or 0)
        if w <= 0 or h <= 0:
            return None
        kind = o.get('kind') if o.get('kind') in ('eshik', 'deraza', 'ravoq') else 'eshik'
        return {
            # `room` — outline.rooms dagi xona indeksi (2026-08-18, ko'p xonali plan)
            'room': int(o.get('room') or 0),
            'wall': int(o.get('wall') or 0),
            'offset': round(float(o.get('offset') or 0), 1),
            'width': round(w, 1),
            'height': round(h, 1),
            'sill': round(float(o.get('sill') or 0), 1),
            'kind': kind,
        }
    except (TypeError, ValueError):
        return None


def _fnum(v):
    """Son bo'lsa float, aks holda None (mo'ljalsiz detal)."""
    return float(v) if isinstance(v, (int, float)) else None


# ═════════════════════════════════════════════════════════════════════════
#  CHIZMADAN XONA (TZ-Xona-Qoshish-Chizmadan.md §F2) — rasm/PDF yuklash,
#  AI bilan o'qish, holatni so'rash. Natija AVTOMATIK xonaga aylanmaydi:
#  brauzer tasdiqlash ekranini ko'rsatadi, usta tuzatib tasdiqlaydi.
# ═════════════════════════════════════════════════════════════════════════
PLAN_MAX_BYTES = 20 * 1024 * 1024
PLAN_EXT = {
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image',
    '.heic': 'image', '.heif': 'image', '.bmp': 'image',
    '.pdf': 'pdf', '.dxf': 'dxf', '.b3d': 'b3d',
}


def _plan_run(import_id, db):
    """Fon-oqim: chizmani o'qib, natijani yozadi. HECH QACHON tashqariga
    Exception chiqarmaydi — xato bo'lsa `status='error'` bo'ladi."""
    import os
    from django.utils import timezone
    from django.conf import settings
    from client_erp.models import RoomPlanImport
    from client_erp.services import plan_vision

    row = RoomPlanImport.objects.using(db).filter(pk=import_id).first()
    if not row:
        return
    RoomPlanImport.objects.using(db).filter(pk=import_id).update(status='running')

    def _progress(txt):
        """Brauzerga «hozir nima bo'layapti» deb ko'rsatish uchun."""
        RoomPlanImport.objects.using(db).filter(pk=import_id).update(
            result={'progress': txt})

    try:
        src = row.source_file.path
        if row.kind in ('image', 'pdf'):
            _progress('Chizma tayyorlanmoqda…')
            base = os.path.splitext(src)[0] + '_prev.png'
            png = plan_vision.prepare_image(src, base)
            if not png:
                raise RuntimeError("Faylni rasmga aylantirib bo'lmadi")
            rel = os.path.relpath(png, settings.MEDIA_ROOT)
            # ⚠️ RASMNI DARHOL saqlaymiz — foydalanuvchi AI ni kutayotganda
            # bo'sh oynaga qarab o'tirmasin (2026-08-19 shikoyati:
            # «juda qotib qolayapti»). Ilgari preview faqat OXIRIDA yozilardi.
            RoomPlanImport.objects.using(db).filter(pk=import_id).update(preview=rel)
            _progress("AI chizmani o'qiyapti (30–90 soniya)…")
            data, meta = plan_vision.analyze_plan(png)
            if not data:
                raise RuntimeError((meta or {}).get('error') or "AI o'qiy olmadi")
            _progress('Natija tayyorlanmoqda…')
            res = plan_vision.normalize(data)
            if not res:
                raise RuntimeError("Chizmada xona konturi topilmadi")
            res['provider'] = (meta or {}).get('provider') or ''
            RoomPlanImport.objects.using(db).filter(pk=import_id).update(
                status='done', result=res, finished_at=timezone.now())
            return
        raise RuntimeError("Bu fayl turi hali qo'llab-quvvatlanmaydi")
    except Exception as e:  # noqa: BLE001
        logger.warning("RoomPlanImport#%s xato: %s", import_id, e)
        RoomPlanImport.objects.using(db).filter(pk=import_id).update(
            status='error', error_text=str(e)[:500], finished_at=timezone.now())
    finally:
        # Fon-oqim DB ulanishini o'zi yopadi (ulanish sizib ketmasin)
        try:
            from django.db import connections
            connections.close_all()
        except Exception:
            pass


@csrf_exempt
@require_POST
def room_plan_upload(request, username, zamer_id):
    """Chizma yuklash — qatorni yaratadi va fon-oqimni boshlaydi (§F2)."""
    import os
    user = _guard(request, username)
    if not user:
        raise Http404()
    from client_erp.models import RoomPlanImport

    f = request.FILES.get('file')
    if not f:
        return JsonResponse({'ok': False, 'error': "fayl yuborilmadi"}, status=400)
    if f.size > PLAN_MAX_BYTES:
        return JsonResponse({'ok': False, 'error': "Fayl juda katta (20 MB gacha)"}, status=400)
    ext = os.path.splitext(f.name)[1].lower()
    kind = PLAN_EXT.get(ext)
    if not kind:
        return JsonResponse({'ok': False, 'error': "Faqat rasm, PDF, DXF yoki .b3d"}, status=400)
    if kind in ('dxf', 'b3d'):
        return JsonResponse({'ok': False, 'error': "Bu fayl turi hali tayyor emas (rasm/PDF ishlaydi)"}, status=400)

    db = _db()
    row = RoomPlanImport.objects.using(db).create(
        client_user_id=user.id, zamer_id=zamer_id, kind=kind, source_file=f)
    try:
        import threading
        t = threading.Thread(target=_plan_run, args=(row.pk, db), daemon=True)
        t.start()
    except Exception as e:  # noqa: BLE001
        logger.warning("plan thread ishga tushmadi: %s", e)
        _plan_run(row.pk, db)
    return JsonResponse({'ok': True, 'id': row.pk, 'status': 'pending'})


def room_plan_status(request, username, import_id):
    """Chizma o'qish holati (brauzer har 2 sekundda so'raydi) — §F2."""
    user = _guard(request, username)
    if not user:
        raise Http404()
    from client_erp.models import RoomPlanImport
    db = _db()
    row = RoomPlanImport.objects.using(db).filter(
        pk=import_id, client_user_id=user.id).first()
    if not row:
        raise Http404()
    # ── QOROVUL (2026-08-19) ─────────────────────────────────────────
    # Fon-oqim gunicorn ichida ishlaydi; worker qayta ishga tushsa (reload,
    # timeout) oqim o'ladi va qator MANGU `running` bo'lib qoladi — brauzer
    # esa cheksiz kutadi. 10 daqiqadan oshsa — aniq xato beramiz.
    if row.status in ('pending', 'running'):
        from django.utils import timezone as _tz
        from datetime import timedelta as _td
        if row.created_at < _tz.now() - _td(minutes=10):
            RoomPlanImport.objects.using(db).filter(pk=row.pk).update(
                status='error', finished_at=_tz.now(),
                error_text="Juda uzoq davom etdi (server qayta ishga tushgan "
                           "bo'lishi mumkin). Qaytadan yuklab ko'ring.")
            row.refresh_from_db()
    # Fon uchun rasm o'lchami (piksel) — masshtabni hisoblashda kerak
    pw = ph = 0
    if row.preview:
        try:
            from PIL import Image
            with Image.open(row.preview.path) as _im:
                pw, ph = _im.size
        except Exception:                                     # noqa: BLE001
            pass
    _res = row.result or None
    _prog = ''
    if isinstance(_res, dict) and 'progress' in _res and 'rooms' not in _res:
        _prog = _res.get('progress') or ''
        _res = None                     # hali natija emas — faqat holat
    return JsonResponse({
        'ok': True, 'status': row.status,
        'error': row.error_text or '',
        'progress': _prog,
        'result': _res,
        'preview': (row.preview.url if row.preview else None),
        'preview_w': pw, 'preview_h': ph,
        'kind': row.kind,
    })


@csrf_exempt
@require_POST
def room_capture_delete(request, username, room_id):
    """Xonani butunlay o'chirish (2026-08-18, TZ-Detal-Joyiga-Qoyish §D6).

    Ichidagi PlacedModule va RoomWallSegment qatorlari CASCADE bilan
    o'chadi. FAQAT o'z xonasi — `client_user_id` tekshiriladi.
    Moliya/zakazga TEGMAYDI: xona faqat 3D ma'lumoti."""
    user = _guard(request, username)
    if not user:
        raise Http404()
    from client_erp.models import RoomCapture
    db = _db()
    room = RoomCapture.objects.using(db).filter(pk=room_id, client_user_id=user.id).first()
    if not room:
        raise Http404()
    name = room.room_name or ('Xona #%d' % room.pk)
    RoomCapture.objects.using(db).filter(pk=room.id).delete()
    return JsonResponse({'ok': True, 'deleted': room_id, 'room_name': name})


@csrf_exempt
@require_POST
def room_capture_add_segment(request, username, room_id):
    user = _guard(request, username)
    if not user:
        raise Http404()
    from client_erp.models import RoomCapture, RoomWallSegment
    db = _db()
    room = RoomCapture.objects.using(db).filter(pk=room_id, client_user_id=user.id).first()
    if not room:
        raise Http404()
    try:
        body = json.loads(request.body or '{}')
    except Exception:
        body = {}
    label = (body.get('label') or '').strip()[:1].upper()
    length_mm = body.get('length_mm')
    source = body.get('source') if body.get('source') in ('ble', 'manual') else 'manual'
    if not label or not isinstance(length_mm, (int, float)) or length_mm <= 0:
        return JsonResponse({'ok': False, 'error': "label va length_mm kerak"}, status=400)

    existing = RoomWallSegment.objects.using(db).filter(room_id=room.id, label=label).first()
    if existing:
        existing.length_mm = int(length_mm)
        existing.source = source
        existing.save(using=db, update_fields=['length_mm', 'source'])
    else:
        next_order = RoomWallSegment.objects.using(db).filter(room_id=room.id).count()
        RoomWallSegment.objects.using(db).create(
            room_id=room.id, label=label, length_mm=int(length_mm),
            order=next_order, source=source,
        )
    segs = list(room.segments.all().order_by('order'))
    return JsonResponse({'ok': True, 'segments': [
        {'label': s.label, 'length_mm': s.length_mm, 'order': s.order, 'source': s.source}
        for s in segs
    ]})
