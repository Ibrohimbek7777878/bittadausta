# FAZA 2: WebSocket Handlers — Page Data + CRUD + Broadcast

**Loyiha:** MebelCity Client ERP → SPA + WebSocket Conversion
**Faza:** 2 / 5
**Muddat:** 1.5 kun
**Qism:** Backend (Python / Django Channels)
**Bog'liqlik:** Faza 1 tugagan bo'lishi kerak

---

## 1. Maqsad

Faza 1 da yaratilgan `MiniERPConsumer` ga **barcha handler metodlarni** qo'shish:
- 7 ta page data handler (sahifa ma'lumotlari)
- 20+ ta CRUD handler (yaratish, o'zgartirish, o'chirish)
- Broadcast logika (multi-user real-time sync)
- Access control (permission tekshirish har handler da)

---

## 2. Page Data Handlers (7 ta)

### 2.1. `handle_page_dashboard(data)` → Dashboard
```python
@database_sync_to_async
def _get_dashboard_data(self):
    from client_erp.serializers import serialize_dashboard
    return serialize_dashboard(self.user)

async def handle_page_dashboard(self, data):
    result = await self._get_dashboard_data()
    return {'ok': True, 'data': result}
```
**Qaytaradi:** `serialize_dashboard(user)` — user, stats, active_orders, shared_tasks, quests, announcements

### 2.2. `handle_page_clients(data)` → Clients List
```python
@database_sync_to_async
def _get_clients(self):
    from client_erp.models import ClientCustomer
    from client_erp.serializers import serialize_customer
    clients = ClientCustomer.objects.filter(owner=self.user).order_by('-created_at')
    return [serialize_customer(c) for c in clients]

async def handle_page_clients(self, data):
    clients = await self._get_clients()
    return {'ok': True, 'data': {'clients': clients}}
```

### 2.3. `handle_page_orders(data)` → Orders List
```python
@database_sync_to_async
def _get_orders(self):
    from client_erp.models import ClientOrder, ClientOrderPermission, ClientOrderStageTemplate
    from client_erp.serializers import serialize_order_brief, serialize_template

    orders = ClientOrder.objects.filter(
        owner=self.user
    ).select_related('customer').order_by('-created_at')

    shared_perms = ClientOrderPermission.objects.filter(
        user=self.user
    ).select_related('order', 'order__customer')

    templates = ClientOrderStageTemplate.objects.filter(
        models.Q(owner=self.user) | models.Q(is_default=True)
    ).prefetch_related('items')

    return {
        'orders': [serialize_order_brief(o) for o in orders],
        'shared_orders': [{
            'order': serialize_order_brief(p.order),
            'role': p.role,
        } for p in shared_perms],
        'templates': [serialize_template(t) for t in templates],
    }

async def handle_page_orders(self, data):
    result = await self._get_orders()
    return {'ok': True, 'data': result}
```

### 2.4. `handle_page_order(data)` → Order Detail (ENG MUHIM)
```python
@database_sync_to_async
def _get_order_detail(self, order_id):
    from client_erp.models import ClientOrder, ClientOrderPermission, ClientOrderStageTemplate
    from client_erp.serializers import serialize_order_full, serialize_template

    try:
        order = ClientOrder.objects.select_related(
            'customer', 'owner'
        ).get(pk=order_id)
    except ClientOrder.DoesNotExist:
        return None, 'Buyurtma topilmadi'

    # Access check
    is_owner = (order.owner_id == self.user.pk)
    user_role = 'owner'
    if not is_owner:
        perm = ClientOrderPermission.objects.filter(
            order=order, user=self.user
        ).first()
        if not perm:
            return None, 'Ruxsat yo\'q'
        user_role = perm.role

    # Templates
    templates = ClientOrderStageTemplate.objects.filter(
        models.Q(owner=self.user) | models.Q(is_default=True)
    ).prefetch_related('items')

    data = serialize_order_full(order, user_role=user_role, is_owner=is_owner)
    data['templates'] = [serialize_template(t) for t in templates]
    return data, None

async def handle_page_order(self, data):
    order_id = data.get('id')
    if not order_id:
        return {'ok': False, 'error': 'id kerak'}

    result, error = await self._get_order_detail(order_id)
    if error:
        return {'ok': False, 'error': error}

    # Subscribe to order group
    await self._subscribe_order(order_id)

    return {'ok': True, 'data': result}
```

### 2.5. `handle_page_finance(data)` → Finance
```python
@database_sync_to_async
def _get_finance_data(self):
    from client_erp.serializers import serialize_finance_page
    return serialize_finance_page(self.user)

async def handle_page_finance(self, data):
    result = await self._get_finance_data()
    return {'ok': True, 'data': result}
```

### 2.6. `handle_page_mebelcity(data)` → MebelCity Orders
```python
@database_sync_to_async
def _get_mebelcity_orders(self):
    from manfacturing.models import Order
    phone = self.user.phone
    if not phone:
        return []
    orders = Order.objects.filter(
        partner__phone=phone
    ).select_related('partner').order_by('-created_at')[:50]
    result = []
    for o in orders:
        result.append({
            'id': o.pk,
            'code': o.code or '',
            'partner_name': o.partner.name if o.partner else '',
            'deadline': o.deadline.isoformat() if o.deadline else None,
            'state': o.state,
            'progress': o.progress,
            'steps': list(o.steps.values('name', 'status', 'sort_order').order_by('sort_order')),
            'is_urgent': o.is_urgent,
            'created_at': o.created_at.isoformat(),
        })
    return result

async def handle_page_mebelcity(self, data):
    orders = await self._get_mebelcity_orders()
    return {'ok': True, 'data': {'orders': orders}}
```

### 2.7. `handle_page_settings(data)` → Settings/Profile
```python
async def handle_page_settings(self, data):
    from client_erp.serializers import serialize_user
    user_data = await database_sync_to_async(serialize_user)(self.user)
    return {'ok': True, 'data': user_data}
```

---

## 3. CRUD Handlers

### 3.1. Client CRUD

#### `handle_client_create(data)`
```python
async def handle_client_create(self, data):
    """Yangi mijoz yaratish."""
    name = (data.get('name') or '').strip()
    phone = (data.get('phone') or '').strip()
    address = (data.get('address') or '').strip()

    if not name:
        return {'ok': False, 'error': 'Ism kiritilmagan'}

    @database_sync_to_async
    def _create():
        from client_erp.models import ClientCustomer
        customer = ClientCustomer.objects.create(
            owner=self.user, name=name, phone=phone, address=address,
        )
        from client_erp.serializers import serialize_customer
        return serialize_customer(customer)

    customer = await _create()

    # Gamification
    await self._award_xp('add_customer')

    return {'ok': True, 'data': customer}
```

#### `handle_client_delete(data)`
```python
async def handle_client_delete(self, data):
    client_id = data.get('id')

    @database_sync_to_async
    def _delete():
        from client_erp.models import ClientCustomer
        try:
            c = ClientCustomer.objects.get(pk=client_id, owner=self.user)
            c.delete()
            return True
        except ClientCustomer.DoesNotExist:
            return False

    ok = await _delete()
    if not ok:
        return {'ok': False, 'error': 'Mijoz topilmadi'}
    return {'ok': True, 'data': None}
```

### 3.2. Order CRUD

#### `handle_order_create(data)`
```python
async def handle_order_create(self, data):
    title = (data.get('title') or '').strip()
    customer_id = data.get('customer_id')
    estimated_price = data.get('estimated_price', 0)
    template_id = data.get('template_id')

    if not title:
        return {'ok': False, 'error': 'Sarlavha kiritilmagan'}

    @database_sync_to_async
    def _create():
        from client_erp.models import ClientOrder, ClientOrderStageTemplate
        from client_erp.serializers import serialize_order_brief
        from client_erp.views.stages import _apply_template

        order = ClientOrder.objects.create(
            owner=self.user,
            title=title,
            customer_id=customer_id if customer_id else None,
            estimated_price=estimated_price or 0,
        )

        if template_id:
            try:
                tmpl = ClientOrderStageTemplate.objects.get(pk=template_id)
                _apply_template(order, tmpl)
                order.use_stages = True
                order.save(update_fields=['use_stages'])
            except ClientOrderStageTemplate.DoesNotExist:
                pass

        return serialize_order_brief(order)

    order_data = await _create()
    await self._award_xp('create_order')
    return {'ok': True, 'data': order_data}
```

#### `handle_order_update(data)`
```python
async def handle_order_update(self, data):
    order_id = data.get('id')
    fields = data.get('fields', {})

    @database_sync_to_async
    def _update():
        from client_erp.models import ClientOrder
        from client_erp.serializers import serialize_order_brief

        order = ClientOrder.objects.get(pk=order_id, owner=self.user)
        allowed_fields = ['title', 'status', 'note', 'estimated_price', 'deadline']
        update_fields = []

        for field in allowed_fields:
            if field in fields:
                setattr(order, field, fields[field])
                update_fields.append(field)

        if update_fields:
            order.save(update_fields=update_fields)

        return serialize_order_brief(order)

    try:
        result = await _update()
    except Exception:
        return {'ok': False, 'error': 'Buyurtma topilmadi'}

    # Broadcast
    await self._broadcast_order(order_id, 'order.updated', result)
    return {'ok': True, 'data': result}
```

#### `handle_order_income(data)`
```python
async def handle_order_income(self, data):
    order_id = data.get('order_id')
    amount = data.get('amount', 0)
    description = data.get('description', '')
    payment_method = data.get('payment_method', 'cash')
    customer_id = data.get('customer_id')

    if not amount or float(amount) <= 0:
        return {'ok': False, 'error': 'Summa noto\'g\'ri'}

    @database_sync_to_async
    def _create_income():
        from client_erp.models import ClientOrder, ClientFinanceRecord, ClientOrderTimeline
        from client_erp.serializers import serialize_transaction

        order = ClientOrder.objects.get(pk=order_id)
        # Access check
        if order.owner_id != self.user.pk:
            from client_erp.models import ClientOrderPermission
            perm = ClientOrderPermission.objects.filter(
                order=order, user=self.user, role__in=['manager']
            ).first()
            if not perm:
                return None, 'Ruxsat yo\'q'

        record = ClientFinanceRecord.objects.create(
            owner=order.owner,
            order=order,
            customer_id=customer_id or (order.customer_id if order.customer else None),
            record_type='income',
            amount=amount,
            description=description,
            payment_method=payment_method,
        )

        ClientOrderTimeline.objects.create(
            order=order,
            action='income',
            description=f"Kirim: {amount:,.0f} so'm",
        )

        return serialize_transaction(record), None

    result, error = await _create_income()
    if error:
        return {'ok': False, 'error': error}

    await self._broadcast_order(order_id, 'order.income', result)
    await self._award_xp('add_income')
    return {'ok': True, 'data': result}
```

#### `handle_order_expense(data)`
```python
async def handle_order_expense(self, data):
    order_id = data.get('order_id')
    amount = data.get('amount', 0)
    description = data.get('description', '')
    payment_method = data.get('payment_method', 'cash')
    stage_id = data.get('stage_id')

    if not amount or float(amount) <= 0:
        return {'ok': False, 'error': 'Summa noto\'g\'ri'}

    @database_sync_to_async
    def _create_expense():
        from client_erp.models import (
            ClientOrder, ClientFinanceRecord, ClientOrderTimeline,
            ClientOrderPermission,
        )
        from client_erp.serializers import serialize_transaction

        order = ClientOrder.objects.get(pk=order_id)
        is_owner = (order.owner_id == self.user.pk)

        if not is_owner:
            perm = ClientOrderPermission.objects.filter(
                order=order, user=self.user
            ).first()
            if not perm or not perm.can_add_expense:
                return None, 'Chiqim qo\'shish ruxsati yo\'q'

        record = ClientFinanceRecord.objects.create(
            owner=order.owner,
            order=order,
            record_type='expense',
            amount=amount,
            description=description,
            payment_method=payment_method,
            stage_id=stage_id if stage_id else None,
        )

        stage_name = ''
        if stage_id:
            try:
                from client_erp.models import ClientOrderStage
                stage = ClientOrderStage.objects.get(pk=stage_id)
                stage_name = stage.title
            except ClientOrderStage.DoesNotExist:
                pass

        ClientOrderTimeline.objects.create(
            order=order,
            action='expense',
            description=f"Chiqim: {amount:,.0f} so'm" + (f" ({stage_name})" if stage_name else ''),
        )

        return serialize_transaction(record), None

    result, error = await _create_expense()
    if error:
        return {'ok': False, 'error': error}

    await self._broadcast_order(order_id, 'order.expense', result)
    return {'ok': True, 'data': result}
```

#### `handle_order_send_mc(data)`
```python
async def handle_order_send_mc(self, data):
    """Buyurtmani MebelCity ga yuborish."""
    order_id = data.get('id')

    @database_sync_to_async
    def _send():
        from client_erp.models import ClientOrder
        order = ClientOrder.objects.get(pk=order_id, owner=self.user)
        # MebelCity ga yuborish logikasi (mavjud view dan ko'chirish)
        # ...
        return {'mc_code': order.mc_code or ''}

    try:
        result = await _send()
    except Exception as e:
        return {'ok': False, 'error': str(e)}

    return {'ok': True, 'data': result}
```

### 3.3. Stage CRUD

#### `handle_stage_create(data)`
```python
async def handle_stage_create(self, data):
    order_id = data.get('order_id')
    title = (data.get('title') or '').strip()
    icon = data.get('icon', '📋')
    color = data.get('color', '#6366f1')
    note = data.get('note', '')
    estimated_cost = data.get('estimated_cost', 0)
    is_mebelcity = data.get('is_mebelcity', False)
    checklist = data.get('checklist', [])  # ['item1', 'item2', ...]

    if not title:
        return {'ok': False, 'error': 'Nom kiritilmagan'}

    @database_sync_to_async
    def _create():
        from client_erp.models import ClientOrder, ClientOrderStage, ClientOrderStageItem
        from client_erp.serializers import serialize_stage

        order = ClientOrder.objects.get(pk=order_id)
        # Access check
        is_owner = (order.owner_id == self.user.pk)
        if not is_owner:
            from client_erp.models import ClientOrderPermission
            perm = ClientOrderPermission.objects.filter(
                order=order, user=self.user, role='manager'
            ).first()
            if not perm:
                return None, None, 'Ruxsat yo\'q'

        max_sort = order.stages.aggregate(m=models.Max('sort_order'))['m'] or 0
        stage = ClientOrderStage.objects.create(
            order=order, title=title, icon=icon, color=color,
            note=note, estimated_cost=estimated_cost or 0,
            is_mebelcity=is_mebelcity,
            sort_order=max_sort + 1,
        )

        for idx, item_title in enumerate(checklist):
            if item_title.strip():
                ClientOrderStageItem.objects.create(
                    stage=stage, title=item_title.strip(), sort_order=idx,
                )

        if not order.use_stages:
            order.use_stages = True
            order.save(update_fields=['use_stages'])

        order.update_progress()
        stage.refresh_from_db()
        return serialize_stage(stage), order.overall_progress, None

    result, progress, error = await _create()
    if error:
        return {'ok': False, 'error': error}

    await self._broadcast_order(order_id, 'stage.created', {
        'stage': result, 'progress': progress,
    })
    return {'ok': True, 'data': {'stage': result, 'progress': progress}}
```

#### `handle_stage_complete(data)`
```python
async def handle_stage_complete(self, data):
    stage_id = data.get('id')

    @database_sync_to_async
    def _complete():
        from client_erp.models import ClientOrderStage, ClientOrderTimeline, ClientOrderPermission
        from client_erp.serializers import serialize_stage
        from client_erp.services.gamification import award_xp, check_quest_progress
        from django.utils import timezone

        stage = ClientOrderStage.objects.select_related('order', 'order__owner').get(pk=stage_id)
        order = stage.order

        # Access check
        is_owner = (order.owner_id == self.user.pk)
        if not is_owner:
            perm = ClientOrderPermission.objects.filter(
                order=order, user=self.user
            ).first()
            if not perm or not perm.can_complete_stage:
                return None, 'Ruxsat yo\'q'

        stage.status = 'completed'
        stage.completed_by = self.user
        stage.completed_at = timezone.now()
        stage.save(update_fields=['status', 'completed_by', 'completed_at'])

        # Keyingi etapni active qilish
        next_stage = order.stages.filter(
            sort_order__gt=stage.sort_order, status='pending'
        ).first()
        if next_stage:
            next_stage.status = 'active'
            next_stage.save(update_fields=['status'])

        order.update_progress()
        progress = order.overall_progress

        ClientOrderTimeline.objects.create(
            order=order, action='stage_complete',
            description=f"Etap tugallandi: {stage.title}",
        )

        # Gamification
        xp, coins = award_xp(self.user, 'complete_stage', f"Etap: {stage.title}")
        check_quest_progress(self.user, 'complete_stage')

        # Agar barcha etaplar tugatilgan bo'lsa
        all_done = not order.stages.exclude(
            status__in=['completed', 'skipped']
        ).exists()
        if all_done:
            xp2, coins2 = award_xp(self.user, 'complete_order', f"Buyurtma: {order.title}")
            xp += xp2
            coins += coins2

        return {
            'stage': serialize_stage(stage),
            'progress': progress,
            'xp': xp,
            'coins': coins,
            'all_done': all_done,
        }, None

    result, error = await _complete()
    if error:
        return {'ok': False, 'error': error}

    await self._broadcast_order(
        data.get('order_id') or result['stage']['id'],
        'stage.completed', result,
    )
    return {'ok': True, 'data': result}
```

#### `handle_stage_skip(data)`
```python
async def handle_stage_skip(self, data):
    stage_id = data.get('id')

    @database_sync_to_async
    def _skip():
        from client_erp.models import ClientOrderStage
        from client_erp.serializers import serialize_stage

        stage = ClientOrderStage.objects.select_related('order').get(pk=stage_id)
        order = stage.order

        if order.owner_id != self.user.pk:
            return None, 'Faqat egasi o\'tkazishi mumkin'

        stage.status = 'skipped'
        stage.save(update_fields=['status'])
        order.update_progress()

        return {
            'stage': serialize_stage(stage),
            'progress': order.overall_progress,
        }, None

    result, error = await _skip()
    if error:
        return {'ok': False, 'error': error}

    return {'ok': True, 'data': result}
```

#### `handle_stage_delete(data)`
```python
async def handle_stage_delete(self, data):
    stage_id = data.get('id')

    @database_sync_to_async
    def _delete():
        from client_erp.models import ClientOrderStage
        stage = ClientOrderStage.objects.select_related('order').get(pk=stage_id)
        order = stage.order

        if order.owner_id != self.user.pk:
            return None, 'Faqat egasi o\'chirishi mumkin'

        stage.delete()
        order.update_progress()
        return {'progress': order.overall_progress}, None

    result, error = await _delete()
    if error:
        return {'ok': False, 'error': error}

    return {'ok': True, 'data': result}
```

#### `handle_stage_reorder(data)`
```python
async def handle_stage_reorder(self, data):
    order_id = data.get('order_id')
    stage_ids = data.get('ids', [])  # tartibli id lar

    @database_sync_to_async
    def _reorder():
        from client_erp.models import ClientOrder, ClientOrderStage
        order = ClientOrder.objects.get(pk=order_id, owner=self.user)
        for idx, sid in enumerate(stage_ids):
            ClientOrderStage.objects.filter(
                pk=sid, order=order
            ).update(sort_order=idx)
        return True

    await _reorder()
    return {'ok': True, 'data': None}
```

#### `handle_stage_check(data)`
```python
async def handle_stage_check(self, data):
    """Checklist item toggle."""
    stage_id = data.get('stage_id')
    item_id = data.get('item_id')

    @database_sync_to_async
    def _toggle():
        from client_erp.models import ClientOrderStageItem, ClientOrderPermission
        from django.utils import timezone
        from client_erp.services.gamification import award_xp

        item = ClientOrderStageItem.objects.select_related(
            'stage', 'stage__order'
        ).get(pk=item_id, stage_id=stage_id)
        order = item.stage.order

        # Access check
        is_owner = (order.owner_id == self.user.pk)
        if not is_owner:
            perm = ClientOrderPermission.objects.filter(
                order=order, user=self.user
            ).first()
            if not perm:
                return None, 'Ruxsat yo\'q'

        item.is_done = not item.is_done
        if item.is_done:
            item.done_by = self.user
            item.done_at = timezone.now()
        else:
            item.done_by = None
            item.done_at = None
        item.save()

        # XP (har 5 ta checklist uchun)
        xp, coins = 0, 0
        if item.is_done:
            total_done = ClientOrderStageItem.objects.filter(
                stage__order=order, is_done=True
            ).count()
            if total_done % 5 == 0:
                xp, coins = award_xp(self.user, 'checklist_streak')

        return {
            'item_id': item.pk,
            'is_done': item.is_done,
            'done_by': self.user.full_name if item.is_done else None,
            'xp': xp,
            'coins': coins,
        }, None

    result, error = await _toggle()
    if error:
        return {'ok': False, 'error': error}

    # Broadcast to order group
    order_id = await self._get_order_id_from_stage(stage_id)
    if order_id:
        await self._broadcast_order(order_id, 'stage.checked', result)

    return {'ok': True, 'data': result}
```

### 3.4. Template Handlers

#### `handle_template_list(data)`
```python
async def handle_template_list(self, data):
    @database_sync_to_async
    def _list():
        from client_erp.models import ClientOrderStageTemplate
        from client_erp.serializers import serialize_template
        templates = ClientOrderStageTemplate.objects.filter(
            models.Q(owner=self.user) | models.Q(is_default=True)
        ).prefetch_related('items')
        return [serialize_template(t) for t in templates]

    templates = await _list()
    return {'ok': True, 'data': {'templates': templates}}
```

#### `handle_template_apply(data)`
```python
async def handle_template_apply(self, data):
    template_id = data.get('template_id')
    order_id = data.get('order_id')

    @database_sync_to_async
    def _apply():
        from client_erp.models import ClientOrder, ClientOrderStageTemplate
        from client_erp.views.stages import _apply_template
        from client_erp.serializers import serialize_order_full

        order = ClientOrder.objects.get(pk=order_id, owner=self.user)
        tmpl = ClientOrderStageTemplate.objects.get(pk=template_id)
        _apply_template(order, tmpl)
        order.use_stages = True
        order.save(update_fields=['use_stages'])
        order.update_progress()

        return serialize_order_full(order, user_role='owner', is_owner=True)

    try:
        result = await _apply()
    except Exception as e:
        return {'ok': False, 'error': str(e)}

    return {'ok': True, 'data': result}
```

### 3.5. Permission Handlers

#### `handle_perm_save(data)`
```python
async def handle_perm_save(self, data):
    order_id = data.get('order_id')
    user_id = data.get('user_id')
    role = data.get('role', 'viewer')
    stage_ids = data.get('stages', [])
    can_add_expense = data.get('can_add_expense', False)
    can_complete_stage = data.get('can_complete_stage', False)

    @database_sync_to_async
    def _save():
        from client_erp.models import ClientOrder, ClientOrderPermission
        from client_erp.serializers import serialize_permission
        from client_erp.services.gamification import award_xp

        order = ClientOrder.objects.get(pk=order_id, owner=self.user)

        perm, created = ClientOrderPermission.objects.update_or_create(
            order=order, user_id=user_id,
            defaults={
                'role': role,
                'can_add_expense': can_add_expense,
                'can_complete_stage': can_complete_stage,
            }
        )
        perm.stages.set(stage_ids)

        if created:
            award_xp(self.user, 'share_order')

        perm = ClientOrderPermission.objects.select_related(
            'user', 'user__vip_level'
        ).prefetch_related('stages').get(pk=perm.pk)

        return serialize_permission(perm)

    result = await _save()
    return {'ok': True, 'data': result}
```

#### `handle_perm_delete(data)`
```python
async def handle_perm_delete(self, data):
    perm_id = data.get('id')

    @database_sync_to_async
    def _delete():
        from client_erp.models import ClientOrderPermission
        perm = ClientOrderPermission.objects.select_related('order').get(pk=perm_id)
        if perm.order.owner_id != self.user.pk:
            return False
        perm.delete()
        return True

    ok = await _delete()
    if not ok:
        return {'ok': False, 'error': 'Ruxsat yo\'q'}
    return {'ok': True, 'data': None}
```

#### `handle_user_search(data)`
```python
async def handle_user_search(self, data):
    q = (data.get('q') or '').strip()
    if len(q) < 2:
        return {'ok': True, 'data': {'users': []}}

    @database_sync_to_async
    def _search():
        from client_erp.models import ClientUser
        users = ClientUser.objects.filter(
            models.Q(full_name__icontains=q) |
            models.Q(phone__icontains=q) |
            models.Q(username__icontains=q),
            is_active=True,
        ).exclude(pk=self.user.pk)[:10]
        return [{'id': u.pk, 'full_name': u.full_name, 'phone': u.phone} for u in users]

    users = await _search()
    return {'ok': True, 'data': {'users': users}}
```

### 3.6. Finance Handlers

#### `handle_finance_create(data)`
```python
async def handle_finance_create(self, data):
    record_type = data.get('type', 'income')
    amount = data.get('amount', 0)
    description = data.get('description', '')
    payment_method = data.get('payment_method', 'cash')
    customer_id = data.get('customer_id')
    order_id = data.get('order_id')

    if not amount or float(amount) <= 0:
        return {'ok': False, 'error': 'Summa noto\'g\'ri'}

    @database_sync_to_async
    def _create():
        from client_erp.models import ClientFinanceRecord
        from client_erp.serializers import serialize_transaction

        record = ClientFinanceRecord.objects.create(
            owner=self.user,
            record_type=record_type,
            amount=amount,
            description=description,
            payment_method=payment_method,
            customer_id=customer_id if customer_id else None,
            order_id=order_id if order_id else None,
        )
        return serialize_transaction(record)

    result = await _create()
    return {'ok': True, 'data': result}
```

#### `handle_debt_create(data)`
```python
async def handle_debt_create(self, data):
    customer_id = data.get('customer_id')
    amount = data.get('amount', 0)
    description = data.get('description', '')

    @database_sync_to_async
    def _create():
        from client_erp.models import ClientDebt
        debt = ClientDebt.objects.create(
            owner=self.user,
            customer_id=customer_id,
            amount=amount,
            remaining=amount,
            description=description,
        )
        return {
            'id': debt.pk,
            'amount': str(debt.amount),
            'remaining': str(debt.remaining),
            'customer_id': debt.customer_id,
        }

    result = await _create()
    return {'ok': True, 'data': result}
```

#### `handle_debt_pay(data)`
```python
async def handle_debt_pay(self, data):
    debt_id = data.get('id')
    amount = data.get('amount', 0)

    @database_sync_to_async
    def _pay():
        from client_erp.models import ClientDebt, ClientDebtPayment
        from decimal import Decimal

        debt = ClientDebt.objects.get(pk=debt_id, owner=self.user)
        pay_amount = min(Decimal(str(amount)), debt.remaining)

        ClientDebtPayment.objects.create(
            debt=debt, amount=pay_amount,
        )

        debt.remaining -= pay_amount
        if debt.remaining <= 0:
            debt.remaining = 0
            debt.is_paid = True
        debt.save(update_fields=['remaining', 'is_paid'])

        return {
            'debt_id': debt.pk,
            'remaining': str(debt.remaining),
            'is_paid': debt.is_paid,
            'paid_amount': str(pay_amount),
        }

    result = await _pay()
    return {'ok': True, 'data': result}
```

#### `handle_finance_withdrawal(data)`
```python
async def handle_finance_withdrawal(self, data):
    amount = data.get('amount', 0)

    @database_sync_to_async
    def _withdraw():
        from client_erp.models import ClientFinanceRecord
        from client_erp.serializers import serialize_transaction

        record = ClientFinanceRecord.objects.create(
            owner=self.user,
            record_type='withdrawal',
            amount=amount,
            description='Pul yechish',
        )
        return serialize_transaction(record)

    result = await _withdraw()
    return {'ok': True, 'data': result}
```

### 3.7. Settings Handler

#### `handle_settings_password(data)`
```python
async def handle_settings_password(self, data):
    current = data.get('current', '')
    new_pass = data.get('new', '')

    if len(new_pass) < 4:
        return {'ok': False, 'error': 'Parol kamida 4 ta belgi bo\'lishi kerak'}

    @database_sync_to_async
    def _change():
        if not self.user.check_password(current):
            return False, 'Hozirgi parol noto\'g\'ri'
        self.user.set_password(new_pass)
        self.user.save(update_fields=['password'])
        return True, None

    ok, error = await _change()
    if not ok:
        return {'ok': False, 'error': error}
    return {'ok': True, 'data': None}
```

---

## 4. Gamification Helper

Consumer ichida gamification uchun helper:

```python
async def _award_xp(self, rule_code, description=''):
    @database_sync_to_async
    def _do_award():
        from client_erp.services.gamification import award_xp
        return award_xp(self.user, rule_code, description)

    xp, coins = await _do_award()
    if xp > 0 or coins > 0:
        await self.send_json({
            'type': 'xp.awarded',
            'data': {'xp': xp, 'coins': coins, 'rule': rule_code},
        })
```

---

## 5. Order ID Helper

```python
@database_sync_to_async
def _get_order_id_from_stage(self, stage_id):
    from client_erp.models import ClientOrderStage
    try:
        return ClientOrderStage.objects.values_list('order_id', flat=True).get(pk=stage_id)
    except ClientOrderStage.DoesNotExist:
        return None
```

---

## 6. Tekshirish

### Browser console:
```javascript
const ws = new WebSocket('wss://mebelcity.bittada.uz/ws/mini/sardor/');
ws.onmessage = (e) => console.log(JSON.parse(e.data));

// Dashboard
ws.send(JSON.stringify({type:'page.dashboard', request_id:'1'}));

// Clients
ws.send(JSON.stringify({type:'page.clients', request_id:'2'}));

// Client create
ws.send(JSON.stringify({type:'client.create', data:{name:'Test', phone:'998901234567'}, request_id:'3'}));

// Stage check
ws.send(JSON.stringify({type:'stage.check', data:{stage_id:1, item_id:1}, request_id:'4'}));
```

### Restart:
```bash
sudo systemctl restart bittada-manager-ws
```

---

## 7. Fayl ro'yxati

| Fayl | Holat | O'zgarish |
|------|-------|-----------|
| `client_erp/consumers.py` | O'ZGARTIRISH | 30+ handler metod qo'shish |

---

# PROMPT — Faza 2 uchun

```
Sen MebelCity ERP platformasida ishlayapsan. Bu Faza 2 — WebSocket handler lar.
Faza 1 da `MiniERPConsumer` skeleton, `serializers.py`, `routing.py` yaratilgan.

## Nima qilish kerak:

`client_erp/consumers.py` ga barcha handler metodlarni qo'shish:

### Page data handlers (7 ta):
1. `handle_page_dashboard` → serialize_dashboard(user) chaqiradi
2. `handle_page_clients` → ClientCustomer.filter(owner=user) list
3. `handle_page_orders` → orders + shared_orders + templates
4. `handle_page_order` → serialize_order_full + subscribe order group + access check
5. `handle_page_finance` → serialize_finance_page(user)
6. `handle_page_mebelcity` → manfacturing.Order.filter(partner__phone=user.phone)
7. `handle_page_settings` → serialize_user(user)

### CRUD handlers (20+ ta):
**Client:** client.create (name, phone, address), client.delete (id)
**Order:** order.create (title, customer_id, estimated_price, template_id), order.update (id, fields), order.income, order.expense, order.send_mc
**Stage:** stage.create (order_id, title, icon, color, checklist[]), stage.complete (id) + gamification, stage.skip (id), stage.delete (id), stage.reorder (order_id, ids[]), stage.check (stage_id, item_id) — checklist toggle
**Template:** template.list, template.apply (template_id, order_id)
**Permission:** perm.save (order_id, user_id, role, stages[]), perm.delete (id), user.search (q)
**Finance:** finance.create (type, amount, ...), debt.create, debt.pay (id, amount), finance.withdrawal
**Settings:** settings.password (current, new)

### Har handler da:
- `@database_sync_to_async` bilan ORM operatsiyalar
- Access control: owner/permission tekshirish
- Error handling: try/except, aniq xato xabar
- Broadcast: order o'zgarishlarida `_broadcast_order()` chaqirish
- Gamification: tegishli joylarda `_award_xp()` chaqirish
- XP notification: `xp.awarded` event yuborish

### Helper metodlar:
- `_award_xp(rule_code, description)` — gamification + xp.awarded event
- `_get_order_id_from_stage(stage_id)` — stage dan order_id topish

### Muhim:
- Mavjud `client_erp/views/` dagi logikani qayta ishlatish (import qilish, dublikat qilmaslik)
  - `stages.py` → `_check_order_access`, `_apply_template`
  - `gamification.py` → `award_xp`, `check_quest_progress`
- Tenant DB automatic routing (middleware orqali)
- Har handler qaytaradi: `{'ok': True/False, 'data': ..., 'error': ...}`
- stage.complete da gamification: award_xp('complete_stage'), check_quest_progress('complete_stage')
- stage.check da har 5 ta done uchun: award_xp('checklist_streak')
- Barcha broadcast lar `sender_channel` tekshirib, o'ziga yubormaslik

### Tekshirish:
Browser console dan WS orqali har bir handler ni test qilish.
Restart: `sudo systemctl restart bittada-manager-ws`
```
