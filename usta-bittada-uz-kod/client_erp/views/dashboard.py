"""client_erp/views/dashboard.py — Bosh sahifa."""
import json
from django.shortcuts import render
from django.db.models import Count, Sum, Q
from django.utils import timezone


def _plan_ctx(user):
    """SPA __USER_DATA__ uchun tarif/feature konteksti (F1 SaaS poydevor)."""
    try:
        from client_erp.services.features import user_features
        feats = list(user_features(user))
    except Exception:
        feats = None
    plan_data = None
    try:
        if getattr(user, 'plan_id', None):
            plan_data = {
                'name': user.plan.name, 'slug': user.plan.slug,
                'expires': user.plan_expires_at.isoformat() if user.plan_expires_at else None,
            }
    except Exception:
        plan_data = None
    # </script> breakout oldini olish (json <script> ichida |safe bilan chiqadi)
    def _js(v):
        return json.dumps(v).replace('</', '<\\/')
    return {'features': _js(feats), 'plan': _js(plan_data)}


def mini_spa(request, username, path=''):
    """SPA shell — ASOSIY (v2 redesign, 2026-07-13 dan JONLI).

    Barcha asosiy kirish nuqtalari shu orqali o'tadi (base `<user>/`, `/spa/`,
    login-redirect, Telegram `?tg=1`, impersonate) — hammasi endi yangi v2
    dizaynni beradi. Eski "Craft Light" (v1) `mini_spa_v1` da `/v1/` yo'lida
    rezerv sifatida saqlanadi (bir foydalanuvchi kerak bo'lsa darhol qaytadi)."""
    # Mudofaa: client_user middleware o'rnatmagan bo'lsa (masalan noto'g'ri yo'l
    # auth'ni chetlab o'tsa) 500 EMAS — login'ga yo'naltiramiz.
    user = getattr(request, 'client_user', None)
    if user is None:
        from django.http import HttpResponseRedirect
        return HttpResponseRedirect('/mini/login/')
    _update_streak(user, timezone.localdate())
    login_award = _track_login_quest(user)
    is_telegram = request.GET.get('tg') == '1'
    ctx = {
        'user': user, 'is_telegram': is_telegram,
        'login_award': json.dumps(login_award).replace('</', '<\\/'),
    }
    ctx.update(_plan_ctx(user))
    return render(request, 'client_erp/spa_redesign.html', ctx)


def mini_spa_redesign(request, username, path=''):
    """/v2/ alias — asosiy bilan bir xil (redesign). Backward-compat."""
    return mini_spa(request, username, path)


def mini_spa_v1(request, username, path=''):
    """/v1/ — ESKI "Craft Light" dizayn (rezerv/qochish yo'li).

    Asosiy v2 ga o'tgandan keyin ham eski dizayn shu yerda mustaqil qoladi —
    `mini_spa` ga bog'lanmaydi (aks holda u ham v2 bo'lib qolardi)."""
    user = request.client_user
    _update_streak(user, timezone.localdate())
    _track_login_quest(user)
    is_telegram = request.GET.get('tg') == '1'
    ctx = {'user': user, 'is_telegram': is_telegram}
    ctx.update(_plan_ctx(user))
    return render(request, 'client_erp/spa.html', ctx)


def order_share_view(request, share_uuid):
    """GET /<uuid>/ — MIJOZ uchun OCHIQ buyurtma holati sahifasi (authsiz).

    Ko'rsatiladi: brend (usta firmasi), holat, progress, kelishilgan muddat,
    etaplar (qaysi tugagan), fayllar, vizualizatsiyalar. Eslatma/moliya YO'Q."""
    from ..models import ClientOrder
    order = (ClientOrder.objects.filter(share_uuid=share_uuid, is_deleted=False)
             .select_related('owner', 'customer').first())
    if not order:
        return render(request, 'client_erp/order_share.html', {'not_found': True})
    owner = order.owner
    brand = (owner.organization or '').strip() or (owner.full_name or 'Bittada Usta')
    # Mijoz ismi (Title uchun) — customer bo'lsa uning ismi, aks holda buyurtma nomi
    customer_name = ''
    try:
        if order.customer_id and order.customer:
            customer_name = (order.customer.full_name or getattr(order.customer, 'name', '') or '').strip()
    except Exception:
        customer_name = ''

    stages = list(order.stages.order_by('sort_order', 'id'))
    stage_data = [{
        'title': s.title, 'icon': s.icon or '📋', 'color': s.color,
        'done': s.status == 'completed', 'skipped': s.status == 'skipped',
        'active': s.status == 'active',
        'completed_at': s.completed_at,
    } for s in stages]
    done_count = sum(1 for s in stages if s.status == 'completed')

    # Media (rasm + video) — bitta galereyada; qolgani (hujjat) alohida.
    media, docs = [], []
    for f in order.files.order_by('created_at'):
        if not f.file:
            continue
        try:
            url = f.file.url
        except Exception:
            continue
        name = f.file_name or f.caption or 'Fayl'
        low = (f.file_name or '').lower()
        is_video = (f.file_type == 'video') or low.endswith(('.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v'))
        is_image = (f.file_type == 'image') or low.endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'))
        thumb = url
        try:
            if f.thumbnail:
                thumb = f.thumbnail.url
        except Exception:
            pass
        if is_video:
            media.append({'type': 'video', 'url': url, 'name': name,
                          'thumb': (f.thumbnail.url if getattr(f, 'thumbnail', None) and f.thumbnail else '')})
        elif is_image:
            media.append({'type': 'image', 'url': url, 'name': name, 'thumb': thumb})
        else:
            docs.append({'url': url, 'name': name})

    # OG rasm — birinchi rasm (yoki panorama thumb), Telegram/WhatsApp preview uchun
    og_image = ''
    for m in media:
        if m['type'] == 'image':
            og_image = request.build_absolute_uri(m['url'])
            break

    try:
        from ..serializers import _get_order_panoramas, _get_order_rooms
        # ClientOrder'ga ulangan MebelCity buyurtma id'lari (etaplar orqali) —
        # panorama shu MC buyurtmaga biriktirilgan bo'lsa ham ko'rsatiladi.
        mc_ids = list(order.stages.exclude(mebelcity_order_id__isnull=True)
                      .values_list('mebelcity_order_id', flat=True).distinct())
        panoramas = _get_order_panoramas(order.pk, mc_ids or None) or []
        rooms = _get_order_rooms(order.pk, mc_ids or None) or []
        # Har panoramaga OCHIQ viewer havolasi (usta.bittada.uz/panorama/<uuid>/,
        # nginx → /mini/panorama/<uuid>/ → panorama_viewer_view, authsiz).
        for p in panoramas:
            if p.get('uuid'):
                p['viewer_url'] = '/panorama/%s/' % p['uuid']
                p['title'] = p.get('name') or ''
    except Exception:
        panoramas = []
        rooms = []

    # OG rasm rasm topilmasa — panorama thumb
    if not og_image:
        for p in panoramas:
            if p.get('thumbnail'):
                og_image = request.build_absolute_uri(p['thumbnail'])
                break

    return render(request, 'client_erp/order_share.html', {
        'brand': brand,
        'customer_name': customer_name,
        'order': order,
        'title': order.title,
        'status': order.status,
        'status_label': dict(ClientOrder.STATUS_CHOICES).get(order.status, order.status),
        'progress': order.overall_progress or 0,
        'deadline': order.deadline,
        'stages': stage_data,
        'done_count': done_count,
        'total_count': len(stages),
        'media': media,
        'docs': docs,
        'panoramas': panoramas,
        'rooms': rooms,
        'og_image': og_image,
        'page_url': request.build_absolute_uri(),
    })


def mini_dashboard(request, username):
    """GET /mini/<username>/"""
    user = request.client_user

    # Statistika
    from ..models import (
        ClientCustomer, ClientOrder, ClientDebt, ClientFinanceRecord,
        ClientVIPLevel, Announcement, Quest, QuestCompletion,
    )
    customers_count = ClientCustomer.objects.filter(owner=user).count()
    orders = ClientOrder.objects.filter(owner=user)
    active_orders = orders.filter(status__in=['new', 'in_progress', 'at_mebelcity']).order_by('-created_at')[:5]
    total_orders = orders.count()
    active_debts = ClientDebt.objects.filter(owner=user, status__in=['active', 'partial']).select_related('customer').order_by('-created_at')[:5]
    total_debt = active_debts.aggregate(t=Sum('remaining'))['t'] or 0

    income = ClientFinanceRecord.objects.filter(owner=user, record_type='income', is_deleted=False).aggregate(t=Sum('amount'))['t'] or 0
    expense = ClientFinanceRecord.objects.filter(owner=user, record_type='expense', is_deleted=False).aggregate(t=Sum('amount'))['t'] or 0
    profit = income - expense

    # ── Gamifikatsiya ──
    # VIP daraja
    current_level = user.vip_level
    all_levels = list(ClientVIPLevel.objects.order_by('level_number'))
    next_level = None
    if current_level:
        for lvl in all_levels:
            if lvl.level_number > current_level.level_number:
                next_level = lvl
                break
    elif all_levels:
        current_level = all_levels[0]  # Start
        next_level = all_levels[1] if len(all_levels) > 1 else None

    # XP progress (keyingi darajagacha)
    xp_progress = 0
    if next_level and next_level.min_turnover > 0 and current_level:
        cur_min = float(current_level.min_turnover)
        nxt_min = float(next_level.min_turnover)
        turnover = float(user.turnover_year or 0)
        if nxt_min > cur_min:
            xp_progress = min(100, int((turnover - cur_min) / (nxt_min - cur_min) * 100))

    # E'lonlar (faol, shu daraja uchun)
    now = timezone.now()
    announcements = Announcement.objects.filter(
        is_active=True, start_date__lte=now,
    ).filter(Q(end_date__isnull=True) | Q(end_date__gte=now))
    if current_level:
        announcements = announcements.filter(Q(target_all=True) | Q(target_levels=current_level))
    else:
        announcements = announcements.filter(target_all=True)
    announcements = announcements.distinct().order_by('-is_pinned', '-created_at')[:5]

    # Kunlik topshiriqlar
    today = timezone.localdate()
    daily_quests = Quest.objects.filter(quest_type='daily', is_active=True).order_by('sort_order')
    quest_data = []
    for q in daily_quests:
        completion = QuestCompletion.objects.filter(user=user, quest=q, date=today).first()
        quest_data.append({
            'quest': q,
            'progress': completion.progress if completion else 0,
            'completed': completion.is_completed if completion else False,
        })

    # Menga berilgan vazifalar (shared orders)
    from ..models import ClientOrderPermission
    my_permissions = ClientOrderPermission.objects.filter(
        user=user
    ).select_related('order', 'order__customer', 'order__owner')

    shared_tasks = []
    for perm in my_permissions:
        o = perm.order
        if o.status in ('delivered', 'cancelled'):
            continue
        if perm.stages.exists():
            my_stages = perm.stages.filter(status__in=['active', 'pending']).order_by('sort_order')
        else:
            my_stages = o.stages.filter(status__in=['active', 'pending']).order_by('sort_order')
        shared_tasks.append({
            'order': o,
            'permission': perm,
            'active_stages': list(my_stages[:3]),
            'stages_count': o.stages.count(),
            'completed_count': o.stages.filter(status='completed').count(),
        })

    # Streak yangilash
    _update_streak(user, today)

    return render(request, 'client_erp/pages/dashboard.html', {
        'user': user,
        'customers_count': customers_count,
        'total_orders': total_orders,
        'active_orders': active_orders,
        'active_debts': active_debts,
        'total_debt': total_debt,
        'income': income,
        'expense': expense,
        'profit': profit,
        # Gamifikatsiya
        'current_level': current_level,
        'next_level': next_level,
        'all_levels': all_levels,
        'xp_progress': xp_progress,
        'announcements': announcements,
        'daily_quests': quest_data,
        'shared_tasks': shared_tasks,
    })


def mini_zamer_new(request):
    """Yangi 3D zamer — virtual order yaratib embed URL qaytaradi.

    DIQQAT: `username` parametri OLIB TASHLANDI — URL (`api/zamer-new/`) da
    `<username>` yo'q edi, view esa uni majburiy talab qilib HAR DOIM 500 berardi.
    User `request.client_user` (middleware o'rnatadi) dan olinadi."""
    from django.http import JsonResponse
    from hashids import Hashids
    from manfacturing.models import Order as MFOrder
    _hashids = Hashids(salt="Alloh nomi bilan boshlayman", min_length=6, alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")

    user = request.client_user
    virtual_order = MFOrder.objects.filter(
        partner_name=f'_mini_{user.id}', state='draft',
    ).first()

    if not virtual_order:
        client_obj = getattr(user, 'client', None)
        if not client_obj:
            from clients.dedup_service import find_client_by_phone
            from clients.models import Client
            client_obj = find_client_by_phone(user.phone)
            # Topilgan mijoz allaqachon BOSHQA portal foydalanuvchiga bog'langan
            # bo'lsa (OneToOne — related_name='mini_erp_user') — qayta ishlatib
            # bo'lmaydi, yangisini yaratamiz.
            if client_obj and hasattr(client_obj, 'mini_erp_user'):
                client_obj = None
            if not client_obj:
                client_obj = Client.objects.create(full_name=user.full_name, phone=user.phone)
            user.client = client_obj
            user.save(update_fields=['client'])
        virtual_order = MFOrder.objects.create(
            partner_name=f'_mini_{user.id}', client=client_obj, state='draft',
        )

    order_code = _hashids.encode(virtual_order.id)
    iframe_url = f'/make_zamer/{order_code}/?mode=input&embed=1'
    return JsonResponse({'ok': True, 'iframe_url': iframe_url, 'order_code': order_code})


def _update_streak(user, today):
    """Streak yangilash — har kirganida."""
    from datetime import timedelta
    if user.streak_last_date == today:
        return  # bugun allaqachon kirgan
    if user.streak_last_date == today - timedelta(days=1):
        user.streak_days += 1
    else:
        user.streak_days = 1
    user.streak_last_date = today
    user.last_activity = timezone.now()
    user.save(update_fields=['streak_days', 'streak_last_date', 'last_activity'])


def _track_login_quest(user):
    """"Bugun ilovaga kir" kunlik topshirig'i — har sahifa ochilganda (idempotent,
    check_quest_progress QuestCompletion.is_completed orqali qayta hisoblamaydi).
    Qaytaradi: yangi bajarilgan mukofot(lar) ro'yxati (bo'lishi mumkin bo'sh) —
    sahifa __LOGIN_AWARD__ orqali darhol CoinBurst animatsiyasini ko'rsatadi
    (WS hali ulanmagan bo'lishi mumkin, shuning uchun sahifaga ichiga qotiriladi)."""
    try:
        from client_erp.services.gamification import check_quest_progress
        return check_quest_progress(user, 'login')
    except Exception:
        return []
