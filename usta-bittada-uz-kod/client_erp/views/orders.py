"""client_erp/views/orders.py — Buyurtmalar CRUD + Kirim/Chiqim."""
import json
from decimal import Decimal, InvalidOperation
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.utils import timezone
from django.http import Http404
from ..models import (
    ClientOrder, ClientOrderItem, ClientOrderTimeline, ClientCustomer,
    ClientFinanceRecord, ClientOrderStage, ClientOrderStageTemplate,
    ClientOrderPermission,
)
from .stages import _check_order_access, _require_access, _apply_template


def mini_orders(request, username):
    user = request.client_user
    orders = ClientOrder.objects.filter(owner=user).select_related('customer').order_by('-created_at')

    shared_order_ids = ClientOrderPermission.objects.filter(user=user).values_list('order_id', flat=True)
    shared_orders = ClientOrder.objects.filter(
        id__in=shared_order_ids
    ).select_related('customer', 'owner').exclude(
        status__in=['delivered', 'cancelled']
    ).order_by('-created_at')

    from django.db.models import Q
    stage_templates = ClientOrderStageTemplate.objects.filter(
        Q(owner=user) | Q(owner__isnull=True)
    ).prefetch_related('items')

    return render(request, 'client_erp/pages/orders/list.html', {
        'user': user, 'orders': orders,
        'shared_orders': shared_orders,
        'customers': ClientCustomer.objects.filter(owner=user),
        'stage_templates': stage_templates,
    })


def mini_order_detail(request, username, pk):
    user = request.client_user

    order = ClientOrder.objects.filter(pk=pk, owner=user).first()
    is_owner = bool(order)
    user_role = 'owner'
    user_permission = None

    if not order:
        order = ClientOrder.objects.filter(pk=pk).first()
        if not order:
            raise Http404
        perm = ClientOrderPermission.objects.filter(order=order, user=user).first()
        if not perm:
            raise Http404
        user_role = perm.role
        user_permission = perm

    items = order.items.all()
    timeline = order.timeline.all()[:20]
    transactions = ClientFinanceRecord.objects.filter(
        order=order, is_deleted=False
    ).order_by('-date', '-created_at')

    stages = order.stages.all().prefetch_related(
        'checklist', 'expenses', 'assigned_to', 'completed_by'
    )
    permissions = order.permissions.select_related('user').prefetch_related('stages') if is_owner else []

    mc_code = ''
    if order.mebelcity_order_id:
        from hashids import Hashids
        _h = Hashids(salt="Alloh nomi bilan boshlayman", min_length=6, alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
        mc_code = _h.encode(order.mebelcity_order_id)

    from django.db.models import Q
    stage_templates = ClientOrderStageTemplate.objects.filter(
        Q(owner=user) | Q(owner__isnull=True)
    ).prefetch_related('items') if is_owner or user_role == 'manager' else []

    return render(request, 'client_erp/pages/orders/detail.html', {
        'user': user, 'order': order, 'items': items,
        'timeline': timeline, 'transactions': transactions,
        'customers': ClientCustomer.objects.filter(owner=order.owner),
        'mc_code': mc_code,
        'stages': stages,
        'permissions': permissions,
        'is_owner': is_owner,
        'user_role': user_role,
        'user_permission': user_permission,
        'stage_templates': stage_templates,
    })


@require_POST
def mini_order_create(request, username):
    user = request.client_user
    body = json.loads(request.body)
    title = (body.get('title', '') or '').strip()
    if not title:
        return JsonResponse({'error': 'Sarlavha kerak'}, status=400)
    o = ClientOrder.objects.create(
        owner=user, title=title,
        customer_id=body.get('customer_id') or None,
        description=body.get('description', ''),
        deadline=body.get('deadline') or None,
    )
    ClientOrderTimeline.objects.create(order=o, action='Buyurtma yaratildi')

    template_id = body.get('template_id')
    if template_id:
        tmpl = ClientOrderStageTemplate.objects.filter(pk=template_id).first()
        if tmpl:
            _apply_template(o, tmpl)
            ClientOrderTimeline.objects.create(
                order=o, action=f"📋 Shablon qo'llanildi: {tmpl.name}"
            )

    # "Har doim" doimiy a'zolarga avto-ulashish + bildirishnoma (fail-safe)
    from client_erp.services.standing_share import apply_standing_shares
    apply_standing_shares(o)

    return JsonResponse({'ok': True, 'id': o.id})


@require_POST
def mini_order_update(request, username, pk):
    user = request.client_user
    order = get_object_or_404(ClientOrder, pk=pk, owner=user)
    body = json.loads(request.body)
    for f in ['title', 'description', 'status']:
        if f in body:
            setattr(order, f, body[f])
    if 'final_price' in body:
        order.final_price = body['final_price'] or None
    order.save()
    if 'status' in body:
        ClientOrderTimeline.objects.create(order=order, action=f"Holat: {order.get_status_display()}")
    return JsonResponse({'ok': True})


@require_POST
def mini_order_income(request, username, pk):
    """POST /mini/<username>/orders/<pk>/income/ — mijozdan kirim."""
    user = request.client_user
    order = get_object_or_404(ClientOrder, pk=pk, owner=user)
    body = json.loads(request.body)
    try:
        amount = Decimal(str(body.get('amount', 0)))
    except (InvalidOperation, ValueError):
        return JsonResponse({'error': 'Yaroqli summa kiriting'}, status=400)
    if amount <= 0:
        return JsonResponse({'error': 'Summa musbat bo\'lishi kerak'}, status=400)

    from django.utils.dateparse import parse_date
    date = parse_date(body.get('date', '')) or timezone.localdate()

    rec = ClientFinanceRecord.objects.create(
        owner=user, order=order, customer=order.customer,
        record_type='income', amount=amount,
        currency=body.get('currency', 'UZS'),
        payment_method=body.get('payment_method', 'cash'),
        description=body.get('description', ''),
        date=date,
    )
    ClientOrderTimeline.objects.create(
        order=order,
        action=f"💰 Kirim: {amount:,.0f} UZS ({rec.get_payment_method_display()})"
    )
    return JsonResponse({'ok': True, 'id': rec.id})


@require_POST
def mini_order_expense(request, username, pk):
    """POST /mini/<username>/orders/<pk>/expense/ — chiqim."""
    user = request.client_user
    order = get_object_or_404(ClientOrder, pk=pk, owner=user)
    body = json.loads(request.body)
    try:
        amount = Decimal(str(body.get('amount', 0)))
    except (InvalidOperation, ValueError):
        return JsonResponse({'error': 'Yaroqli summa kiriting'}, status=400)
    if amount <= 0:
        return JsonResponse({'error': 'Summa musbat bo\'lishi kerak'}, status=400)

    from django.utils.dateparse import parse_date
    date = parse_date(body.get('date', '')) or timezone.localdate()

    stage_id = body.get('stage_id')
    stage_obj = None
    if stage_id:
        stage_obj = ClientOrderStage.objects.filter(pk=stage_id, order=order).first()

    rec = ClientFinanceRecord.objects.create(
        owner=user, order=order, customer=order.customer,
        record_type='expense', amount=amount,
        stage=stage_obj,
        category=body.get('category', 'other'),
        payment_method=body.get('payment_method', 'cash'),
        description=body.get('description', ''),
        date=date,
    )
    cat_display = dict(ClientFinanceRecord.EXPENSE_CATEGORIES).get(rec.category, rec.category)
    ClientOrderTimeline.objects.create(
        order=order,
        action=f"📤 Chiqim: {amount:,.0f} UZS ({cat_display})"
    )
    return JsonResponse({'ok': True, 'id': rec.id})


@require_POST
def mini_order_send_to_mebelcity(request, username, pk):
    """POST /mini/<username>/orders/<pk>/send-mebelcity/ — MebelCity'ga o'tkazish."""
    import re
    user = request.client_user
    order = get_object_or_404(ClientOrder, pk=pk, owner=user)
    body = json.loads(request.body)

    if order.mebelcity_order_id:
        return JsonResponse({'error': 'Bu buyurtma allaqachon MebelCity\'ga o\'tkazilgan', 'order_id': order.mebelcity_order_id}, status=400)

    # 1. Client topish (telefon bo'yicha)
    from clients.models import Client
    from django.db.models import Q

    client_obj = None

    # ClientUser → Client bog'lanishi
    if user.client_id:
        client_obj = user.client

    if not client_obj:
        digits = re.sub(r'\D', '', user.phone or '')
        last9 = digits[-9:] if len(digits) >= 9 else digits
        if len(last9) >= 7:
            client_obj = Client.objects.filter(
                Q(phone__endswith=last9) | Q(phone2__endswith=last9),
                is_active=True,
            ).first()

    if not client_obj:
        # Yangi client yaratish
        client_obj = Client.objects.create(
            full_name=user.full_name,
            phone=user.phone,
            organization=user.organization,
        )
        user.client = client_obj
        user.save(update_fields=['client'])

    # 2. OrderStepLine tanlash
    from manfacturing.models import Order, OrderStepLine, OrderStepType

    line_id = body.get('line_id')
    line_obj = None
    if line_id:
        line_obj = OrderStepLine.objects.filter(pk=line_id).first()
    if not line_obj:
        # Default — birinchi StepLine
        line_obj = OrderStepLine.objects.filter(parent__isnull=True).first()

    # 3. Order yaratish
    from hashids import Hashids
    hashids = Hashids(
        salt="Alloh nomi bilan boshlayman", min_length=6,
        alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    )

    mc_order = Order.objects.create(
        partner_name=f"{user.full_name} ({order.title})",
        project_name=(client_obj.full_name or user.full_name or '').strip(),
        client=client_obj,
        state='draft',
        line=line_obj,
        note=f"Mini ERP dan: {order.title}\n{order.description or ''}",
    )
    if line_obj:
        line_obj.generate_steps(mc_order)

    # 4. ClientOrder ga bog'lash
    order.mebelcity_order_id = mc_order.id
    order.mebelcity_tenant = 'tenant_mebelcity'
    order.status = 'at_mebelcity'
    order.save(update_fields=['mebelcity_order_id', 'mebelcity_tenant', 'status'])

    ClientOrderTimeline.objects.create(
        order=order,
        action=f"🏢 MebelCity'ga o'tkazildi (#{mc_order.id})"
    )

    code = hashids.encode(mc_order.id)

    return JsonResponse({
        'ok': True,
        'mebelcity_order_id': mc_order.id,
        'order_code': code,
        'order_url': f'/order/{code}/',
    })
