"""client_erp/views/stages.py — Etaplar, Ruxsatlar, Shablonlar API."""
import json
from decimal import Decimal, InvalidOperation
from django.shortcuts import get_object_or_404
from django.http import JsonResponse, Http404
from django.views.decorators.http import require_POST, require_GET
from django.utils import timezone
from ..models import (
    ClientOrder, ClientOrderStage, ClientOrderStageItem,
    ClientOrderTimeline, ClientFinanceRecord, ClientUser,
    ClientOrderStageTemplate, ClientOrderStageTemplateItem,
    ClientOrderPermission,
)


# ─── Permission helpers ───

def _check_order_access(user, order, stage=None):
    if order.owner_id == user.pk:
        return True, 'owner', None
    perm = ClientOrderPermission.objects.filter(order=order, user=user).first()
    if not perm:
        return False, None, None
    if stage and perm.role == 'worker':
        if perm.stages.exists() and not perm.stages.filter(pk=stage.pk).exists():
            return False, None, None
    return True, perm.role, perm


ROLE_RANK = {'viewer': 0, 'worker': 1, 'manager': 2, 'owner': 3}


def _require_access(user, order, require_role='viewer', stage=None):
    allowed, role, perm = _check_order_access(user, order, stage)
    if not allowed:
        return None, None, JsonResponse({'error': 'Ruxsat yo\'q'}, status=403)
    if ROLE_RANK.get(role, 0) < ROLE_RANK.get(require_role, 0):
        return None, None, JsonResponse({'error': 'Ruxsat yo\'q'}, status=403)
    return role, perm, None


def _get_order(pk, user):
    order = ClientOrder.objects.filter(pk=pk).first()
    if not order:
        raise Http404
    return order


# ─── Stage CRUD ───

@require_POST
def mini_stage_create(request, username, pk):
    user = request.client_user
    order = _get_order(pk, user)
    role, perm, err = _require_access(user, order, 'manager')
    if err:
        return err

    body = json.loads(request.body)
    title = (body.get('title', '') or '').strip()
    if not title:
        return JsonResponse({'error': 'Nomi kerak'}, status=400)

    max_sort = order.stages.order_by('-sort_order').values_list('sort_order', flat=True).first() or 0
    sort_order = body.get('sort_order', max_sort + 1)

    is_first = not order.stages.exists()

    stage = ClientOrderStage.objects.create(
        order=order,
        title=title,
        icon=body.get('icon', '📋'),
        color=body.get('color', '#6366f1'),
        sort_order=sort_order,
        is_mebelcity=body.get('is_mebelcity', False),
        deadline=body.get('deadline') or None,
        estimated_cost=body.get('estimated_cost') or None,
        status='active' if is_first else 'pending',
        started_at=timezone.now() if is_first else None,
    )

    checklist = body.get('checklist', [])
    if checklist:
        items = [
            ClientOrderStageItem(stage=stage, title=c, sort_order=i)
            for i, c in enumerate(checklist) if c.strip()
        ]
        ClientOrderStageItem.objects.bulk_create(items)

    ClientOrderTimeline.objects.create(order=order, action=f"📋 Etap qo'shildi: {title}")
    order.update_progress()
    return JsonResponse({'ok': True, 'id': stage.id})


@require_POST
def mini_stage_update(request, username, pk, stage_id):
    user = request.client_user
    order = _get_order(pk, user)
    role, perm, err = _require_access(user, order, 'manager')
    if err:
        return err

    stage = get_object_or_404(ClientOrderStage, pk=stage_id, order=order)
    body = json.loads(request.body)

    for f in ('title', 'icon', 'color', 'note'):
        if f in body:
            setattr(stage, f, body[f])
    if 'estimated_cost' in body:
        stage.estimated_cost = body['estimated_cost'] or None
    if 'deadline' in body:
        stage.deadline = body['deadline'] or None
    if 'assigned_to_id' in body:
        stage.assigned_to_id = body['assigned_to_id'] or None

    stage.save()
    return JsonResponse({'ok': True})


@require_POST
def mini_stage_complete(request, username, pk, stage_id):
    user = request.client_user
    order = _get_order(pk, user)
    stage = get_object_or_404(ClientOrderStage, pk=stage_id, order=order)

    role, perm, err = _require_access(user, order, 'worker', stage=stage)
    if err:
        return err

    if stage.checklist.filter(is_done=False).exists():
        return JsonResponse({'error': 'Avval barcha checklist elementlarini bajaring'}, status=400)

    stage.status = 'completed'
    stage.completed_at = timezone.now()
    stage.completed_by = user
    stage.save(update_fields=['status', 'completed_at', 'completed_by'])

    _activate_next(order)
    order.update_progress()

    if not order.stages.exclude(status__in=['completed', 'skipped']).exists():
        order.status = 'ready'
        order.save(update_fields=['status'])

    ClientOrderTimeline.objects.create(
        order=order, action=f"✅ Etap tugallandi: {stage.title}"
    )

    from ..services.gamification import award_xp, check_quest_progress
    xp, coins = award_xp(user, 'complete_stage', f"Etap tugallandi: {stage.title}")

    if not order.stages.exclude(status__in=['completed', 'skipped']).exists():
        xp2, coins2 = award_xp(user, 'complete_order', f"Buyurtma tugallandi: {order.title}")
        xp += xp2
        coins += coins2
        if order.deadline and timezone.now() <= order.deadline:
            xp3, coins3 = award_xp(user, 'complete_order_ontime', f"Muddatida: {order.title}")
            xp += xp3
            coins += coins3
        done_count = ClientOrder.objects.filter(owner=user, overall_progress=100).count()
        if done_count == 1:
            xp4, coins4 = award_xp(user, 'first_order_stages', "Birinchi buyurtma etaplar bilan!")
            xp += xp4
            coins += coins4
        check_quest_progress(user, 'complete_order')

    check_quest_progress(user, 'complete_stage')

    return JsonResponse({
        'ok': True, 'progress': order.overall_progress,
        'xp_gained': xp, 'coins_gained': coins,
    })


@require_POST
def mini_stage_skip(request, username, pk, stage_id):
    user = request.client_user
    order = _get_order(pk, user)
    role, perm, err = _require_access(user, order, 'manager')
    if err:
        return err

    stage = get_object_or_404(ClientOrderStage, pk=stage_id, order=order)
    stage.status = 'skipped'
    stage.save(update_fields=['status'])

    _activate_next(order)
    order.update_progress()

    ClientOrderTimeline.objects.create(
        order=order, action=f"⏭️ Etap o'tkazildi: {stage.title}"
    )
    return JsonResponse({'ok': True, 'progress': order.overall_progress})


@require_POST
def mini_stage_delete(request, username, pk, stage_id):
    user = request.client_user
    order = _get_order(pk, user)
    role, perm, err = _require_access(user, order, 'manager')
    if err:
        return err

    stage = get_object_or_404(ClientOrderStage, pk=stage_id, order=order)
    title = stage.title
    stage.delete()
    order.update_progress()

    ClientOrderTimeline.objects.create(
        order=order, action=f"🗑 Etap o'chirildi: {title}"
    )
    return JsonResponse({'ok': True})


@require_POST
def mini_stages_reorder(request, username, pk):
    user = request.client_user
    order = _get_order(pk, user)
    role, perm, err = _require_access(user, order, 'manager')
    if err:
        return err

    body = json.loads(request.body)
    ids = body.get('order', [])
    stages = list(order.stages.filter(pk__in=ids))
    id_map = {s.pk: s for s in stages}
    for i, sid in enumerate(ids):
        if sid in id_map:
            id_map[sid].sort_order = i
    ClientOrderStage.objects.bulk_update(stages, ['sort_order'])
    return JsonResponse({'ok': True})


@require_POST
def mini_stage_check(request, username, pk, stage_id):
    user = request.client_user
    order = _get_order(pk, user)
    stage = get_object_or_404(ClientOrderStage, pk=stage_id, order=order)

    role, perm, err = _require_access(user, order, 'worker', stage=stage)
    if err:
        return err

    body = json.loads(request.body)
    item = get_object_or_404(ClientOrderStageItem, pk=body.get('item_id'), stage=stage)

    item.is_done = not item.is_done
    if item.is_done:
        item.done_by = user
        item.done_at = timezone.now()
    else:
        item.done_by = None
        item.done_at = None
    item.save()

    if item.is_done:
        today_checks = ClientOrderStageItem.objects.filter(
            done_by=user, done_at__date=timezone.localdate(), is_done=True
        ).count()
        if today_checks > 0 and today_checks % 5 == 0:
            from ..services.gamification import award_xp
            award_xp(user, 'checklist_streak', f"{today_checks} ta checklist bugun")

    return JsonResponse({'ok': True, 'is_done': item.is_done})


# ─── Permission CRUD ───

@require_POST
def mini_permission_save(request, username, pk):
    user = request.client_user
    order = get_object_or_404(ClientOrder, pk=pk, owner=user)
    body = json.loads(request.body)

    target_user_id = body.get('user_id')
    if not target_user_id:
        return JsonResponse({'error': 'Foydalanuvchi tanlang'}, status=400)
    target_user = get_object_or_404(ClientUser, pk=target_user_id)

    if target_user.pk == user.pk:
        return JsonResponse({'error': 'O\'zingizga ruxsat berish kerak emas'}, status=400)

    role = body.get('role', 'worker')
    if role not in ('viewer', 'worker', 'manager'):
        role = 'worker'

    perm, created = ClientOrderPermission.objects.update_or_create(
        order=order, user=target_user,
        defaults={
            'role': role,
            'can_add_expense': body.get('can_add_expense', False),
            'can_complete_stage': body.get('can_complete_stage', True),
        }
    )

    stage_ids = body.get('stage_ids', [])
    if stage_ids:
        perm.stages.set(order.stages.filter(pk__in=stage_ids))
    else:
        perm.stages.clear()

    role_display = dict(ClientOrderPermission.ROLE_CHOICES).get(role, role)
    ClientOrderTimeline.objects.create(
        order=order,
        action=f"👤 Ruxsat berildi: {target_user.full_name} ({role_display})"
    )

    if created:
        from ..services.gamification import award_xp
        award_xp(user, 'share_order', f"Buyurtma ulashildi: {order.title} → {target_user.full_name}")

    return JsonResponse({'ok': True, 'id': perm.id})


@require_POST
def mini_permission_delete(request, username, pk, perm_id):
    user = request.client_user
    order = get_object_or_404(ClientOrder, pk=pk, owner=user)
    perm = get_object_or_404(ClientOrderPermission, pk=perm_id, order=order)
    name = perm.user.full_name
    perm.delete()

    ClientOrderTimeline.objects.create(
        order=order, action=f"👤 Ruxsat olib tashlandi: {name}"
    )
    return JsonResponse({'ok': True})


# ─── Template CRUD ───

@require_POST
def mini_template_save(request, username):
    user = request.client_user
    body = json.loads(request.body)
    name = (body.get('name', '') or '').strip()
    if not name:
        return JsonResponse({'error': 'Nomi kerak'}, status=400)

    tmpl_id = body.get('id')
    if tmpl_id:
        tmpl = get_object_or_404(ClientOrderStageTemplate, pk=tmpl_id, owner=user)
        tmpl.name = name
        tmpl.save(update_fields=['name'])
    else:
        tmpl = ClientOrderStageTemplate.objects.create(owner=user, name=name)

    tmpl.items.all().delete()
    items_data = body.get('items', [])
    items = []
    for i, d in enumerate(items_data):
        items.append(ClientOrderStageTemplateItem(
            template=tmpl,
            title=d.get('title', ''),
            icon=d.get('icon', '📋'),
            color=d.get('color', '#6366f1'),
            sort_order=d.get('sort_order', i),
            is_mebelcity=d.get('is_mebelcity', False),
            checklist_json=d.get('checklist', []),
        ))
    ClientOrderStageTemplateItem.objects.bulk_create(items)

    return JsonResponse({'ok': True, 'id': tmpl.id})


@require_GET
def mini_template_list(request, username):
    user = request.client_user
    templates = ClientOrderStageTemplate.objects.filter(
        models_Q_owner(user)
    ).prefetch_related('items')

    data = []
    for t in templates:
        data.append({
            'id': t.id,
            'name': t.name,
            'is_default': t.is_default,
            'items': [
                {
                    'title': i.title, 'icon': i.icon, 'color': i.color,
                    'sort_order': i.sort_order, 'is_mebelcity': i.is_mebelcity,
                    'checklist': i.checklist_json,
                }
                for i in t.items.all()
            ]
        })
    return JsonResponse({'templates': data})


@require_POST
def mini_template_apply(request, username, tmpl_id, order_pk):
    user = request.client_user
    order = _get_order(order_pk, user)
    role, perm, err = _require_access(user, order, 'manager')
    if err:
        return err

    tmpl = get_object_or_404(ClientOrderStageTemplate, pk=tmpl_id)
    _apply_template(order, tmpl)

    ClientOrderTimeline.objects.create(
        order=order,
        action=f"📋 Shablon qo'llanildi: {tmpl.name} ({tmpl.items.count()} etap)"
    )
    return JsonResponse({'ok': True})


# ─── Helpers ───

def _activate_next(order):
    nxt = order.stages.filter(status='pending').order_by('sort_order').first()
    if nxt:
        nxt.status = 'active'
        nxt.started_at = timezone.now()
        nxt.save(update_fields=['status', 'started_at'])


def _apply_template(order, tmpl):
    items = tmpl.items.all().order_by('sort_order')
    is_first = not order.stages.exists()
    max_sort = order.stages.order_by('-sort_order').values_list('sort_order', flat=True).first() or 0

    for i, ti in enumerate(items):
        first_stage = is_first and i == 0
        stage = ClientOrderStage.objects.create(
            order=order,
            template_item=ti,
            title=ti.title,
            icon=ti.icon,
            color=ti.color,
            sort_order=max_sort + i + 1,
            is_mebelcity=ti.is_mebelcity,
            note=getattr(ti, 'note', '') or '',
            estimated_cost=getattr(ti, 'estimated_cost', 0) or 0,
            status='active' if first_stage else 'pending',
            started_at=timezone.now() if first_stage else None,
        )
        if ti.checklist_json:
            cl_items = [
                ClientOrderStageItem(stage=stage, title=c, sort_order=j)
                for j, c in enumerate(ti.checklist_json) if c.strip()
            ]
            ClientOrderStageItem.objects.bulk_create(cl_items)

    order.update_progress()


def models_Q_owner(user):
    from django.db.models import Q
    return Q(owner=user) | Q(owner__isnull=True)


@require_GET
def mini_user_search(request, username):
    user = request.client_user
    q = (request.GET.get('q', '') or '').strip()
    if len(q) < 2:
        return JsonResponse({'users': []})

    from django.db.models import Q
    users = ClientUser.objects.filter(
        Q(full_name__icontains=q) | Q(phone__icontains=q) | Q(username__icontains=q),
        is_active=True,
    ).exclude(pk=user.pk)[:10]

    return JsonResponse({'users': [
        {'id': u.pk, 'name': u.full_name, 'phone': u.phone, 'username': u.username}
        for u in users
    ]})
