# FAZA 1: WebSocket Infrastructure — Backend Foundation

**Loyiha:** MebelCity Client ERP → SPA + WebSocket Conversion
**Faza:** 1 / 5
**Muddat:** 1 kun
**Qism:** Backend (Python / Django Channels)

---

## 1. Maqsad

Client ERP uchun WebSocket infratuzilmasini yaratish:
- `MiniERPConsumer` — AsyncJsonWebsocketConsumer
- `serializers.py` — barcha model → JSON funksiyalar
- `routing.py` — WS URL pattern
- `config/asgi.py` ga integratsiya
- JWT cookie auth WS middleware

Bu fazada **handler logika yo'q** — faqat skelet: connect/disconnect/dispatch/reply.
Keyingi fazalarda handler lar qo'shiladi.

---

## 2. Yaratilishi kerak bo'lgan fayllar

### 2.1. `client_erp/routing.py` (YANGI)

```python
from django.urls import path
from . import consumers

websocket_urlpatterns = [
    path("ws/mini/<str:username>/", consumers.MiniERPConsumer.as_asgi()),
]
```

### 2.2. `client_erp/consumers.py` (YANGI)

**Asosiy class:** `MiniERPConsumer(AsyncJsonWebsocketConsumer)`

**connect():**
1. URL dan `username` olish (`self.scope['url_route']['kwargs']['username']`)
2. JWT cookie dan auth tekshirish — `self.scope['cookies']` dan token olish
3. `ClientUser` ni topish (database_sync_to_async bilan)
4. Agar user topilmasa yoki `is_active=False` → `await self.close(code=4001)`
5. `self.user_group = f"mini_user_{self.user.pk}"` 
6. Channel group ga qo'shish
7. `await self.accept()`
8. `self.order_groups = set()` — order subscribe tracking
9. `self.user_data` — cached user info

**disconnect(code):**
1. `self.user_group` dan chiqish
2. `self.order_groups` dagi barcha group lardan chiqish

**receive_json(content):**
```python
msg_type = content.get('type', '')
handler_name = 'handle_' + msg_type.replace('.', '_')
handler = getattr(self, handler_name, None)
if not handler:
    await self._error(content, 'Unknown action type')
    return
try:
    result = await handler(content.get('data', {}))
    await self._reply(content, **result)
except Exception as e:
    logger.exception(f"WS handler error: {msg_type}")
    await self._error(content, str(e))
```

**Helper metodlar:**

```python
async def _reply(self, original, ok=True, data=None, error=None):
    await self.send_json({
        'type': original.get('type', '') + '.result',
        'request_id': original.get('request_id'),
        'ok': ok,
        'data': data,
        'error': error,
    })

async def _error(self, original, error):
    await self._reply(original, ok=False, error=error)

async def _broadcast_order(self, order_id, action, payload):
    await self.channel_layer.group_send(
        f"mini_order_{order_id}",
        {
            'type': 'order.broadcast',
            'message': {
                'type': 'broadcast',
                'action': action,
                'data': payload,
                'by': self.user.full_name,
            },
            'sender_channel': self.channel_name,
        }
    )

async def order_broadcast(self, event):
    if event.get('sender_channel') != self.channel_name:
        await self.send_json(event['message'])

async def _subscribe_order(self, order_id):
    group = f"mini_order_{order_id}"
    if group not in self.order_groups:
        await self.channel_layer.group_add(group, self.channel_name)
        self.order_groups.add(group)

async def _unsubscribe_order(self, order_id):
    group = f"mini_order_{order_id}"
    if group in self.order_groups:
        await self.channel_layer.group_discard(group, self.channel_name)
        self.order_groups.discard(group)
```

**Auth helper:**
```python
@database_sync_to_async
def _authenticate(self):
    """JWT cookie dan ClientUser topish."""
    from client_erp.middleware import _get_user_from_token
    cookies = self.scope.get('cookies', {})
    token = cookies.get('mini_token') or cookies.get('TOKEN_COOKIE')
    if not token:
        return None
    return _get_user_from_token(token)
```

> **Muhim:** Mavjud `client_erp/middleware.py` dagi JWT decode logikasini qayta ishlatish. Agar `_get_user_from_token` funksiya yo'q bo'lsa — middleware dan token verify qismini ajratib, import qilinadigan funksiya qilish.

### 2.3. `client_erp/serializers.py` (YANGI)

Barcha model → dict funksiyalar. **Django ORM** foydalanadi, `database_sync_to_async` bilan consumer dan chaqiriladi.

```python
"""client_erp/serializers.py — Model → JSON serialization."""
from decimal import Decimal


def _dec(val):
    """Decimal → str (JSON uchun)."""
    if val is None:
        return '0'
    return str(Decimal(str(val)).quantize(Decimal('1')))


# ── User ──
def serialize_user(u):
    return {
        'id': u.pk,
        'username': u.username,
        'full_name': u.full_name,
        'phone': u.phone,
        'organization': u.organization or '',
        'xp': u.xp,
        'coins': u.coins,
        'coins_total_earned': u.coins_total_earned,
        'streak_days': getattr(u, 'streak_days', 0),
        'vip_level': serialize_level(u.vip_level) if u.vip_level else None,
        'avatar_url': u.avatar.url if u.avatar else None,
    }


# ── VIP Level ──
def serialize_level(level):
    if not level:
        return None
    return {
        'id': level.pk,
        'name': level.name,
        'level_number': level.level_number,
        'icon': level.icon,
        'color': level.color,
        'min_turnover': _dec(level.min_turnover),
    }


# ── Customer ──
def serialize_customer(c):
    return {
        'id': c.pk,
        'name': c.name,
        'phone': c.phone or '',
        'address': c.address or '',
        'created_at': c.created_at.isoformat() if c.created_at else None,
    }


# ── Order (brief — list uchun) ──
def serialize_order_brief(o):
    return {
        'id': o.pk,
        'title': o.title,
        'status': o.status,
        'customer_name': o.customer.name if o.customer else '',
        'estimated_price': _dec(o.estimated_price),
        'overall_progress': o.overall_progress,
        'total_income': _dec(o.total_income),
        'total_expense': _dec(o.total_expense),
        'payment_percent': o.payment_percent,
        'created_at': o.created_at.isoformat(),
        'deadline': o.deadline.isoformat() if o.deadline else None,
        'mc_code': getattr(o, 'mc_code', '') or '',
        'use_stages': o.use_stages,
    }


# ── Order (full — detail uchun) ──
def serialize_order_full(order, user_role='owner', is_owner=True):
    stages = list(order.stages.select_related(
        'assigned_to', 'completed_by'
    ).prefetch_related('checklist_items').order_by('sort_order'))

    transactions = list(order.finance_records.select_related(
        'stage'
    ).order_by('-created_at')[:50])

    timeline = list(order.timeline.order_by('-created_at')[:30])

    permissions = list(order.permissions.select_related(
        'user', 'user__vip_level'
    ).prefetch_related('stages'))

    return {
        'id': order.pk,
        'title': order.title,
        'status': order.status,
        'customer': serialize_customer(order.customer) if order.customer else None,
        'estimated_price': _dec(order.estimated_price),
        'overall_progress': order.overall_progress,
        'total_income': _dec(order.total_income),
        'total_expense': _dec(order.total_expense),
        'profit': _dec(order.profit),
        'payment_percent': order.payment_percent,
        'mc_code': getattr(order, 'mc_code', '') or '',
        'use_stages': order.use_stages,
        'deadline': order.deadline.isoformat() if order.deadline else None,
        'created_at': order.created_at.isoformat(),
        'note': order.note or '',

        'stages': [serialize_stage(s) for s in stages],
        'transactions': [serialize_transaction(t) for t in transactions],
        'timeline': [serialize_timeline(t) for t in timeline],
        'permissions': [serialize_permission(p) for p in permissions],

        'user_role': user_role,
        'is_owner': is_owner,
    }


# ── Stage ──
def serialize_stage(s):
    items = list(s.checklist_items.order_by('sort_order'))
    expenses = list(s.expenses.order_by('-created_at')) if hasattr(s, 'expenses') else []
    return {
        'id': s.pk,
        'title': s.title,
        'icon': s.icon or '📋',
        'color': s.color or '#6366f1',
        'status': s.status,
        'sort_order': s.sort_order,
        'note': s.note or '',
        'estimated_cost': _dec(s.estimated_cost),
        'deadline': s.deadline.isoformat() if s.deadline else None,
        'is_mebelcity': s.is_mebelcity,
        'assigned_to': {
            'id': s.assigned_to.pk,
            'full_name': s.assigned_to.full_name,
        } if s.assigned_to else None,
        'completed_by': {
            'id': s.completed_by.pk,
            'full_name': s.completed_by.full_name,
        } if s.completed_by else None,
        'completed_at': s.completed_at.isoformat() if hasattr(s, 'completed_at') and s.completed_at else None,
        'checklist': [serialize_checklist_item(i) for i in items],
        'total_expense': _dec(s.total_expense) if hasattr(s, 'total_expense') else '0',
        'expenses': [serialize_transaction(e) for e in expenses],
    }


# ── Checklist item ──
def serialize_checklist_item(item):
    return {
        'id': item.pk,
        'title': item.title,
        'is_done': item.is_done,
        'done_by': item.done_by.full_name if item.done_by else None,
        'done_at': item.done_at.isoformat() if item.done_at else None,
        'sort_order': item.sort_order,
    }


# ── Finance record (transaction) ──
def serialize_transaction(t):
    return {
        'id': t.pk,
        'record_type': t.record_type,
        'amount': _dec(t.amount),
        'description': t.description or '',
        'payment_method': t.payment_method or '',
        'stage_id': t.stage_id,
        'stage_name': t.stage.title if t.stage else None,
        'order_id': t.order_id,
        'order_title': t.order.title if t.order else None,
        'customer_id': t.customer_id,
        'customer_name': t.customer.name if t.customer else None,
        'created_at': t.created_at.isoformat(),
    }


# ── Timeline ──
def serialize_timeline(t):
    return {
        'id': t.pk,
        'action': t.action,
        'description': t.description or '',
        'created_at': t.created_at.isoformat(),
        'user_name': t.user.full_name if hasattr(t, 'user') and t.user else '',
    }


# ── Permission ──
def serialize_permission(p):
    return {
        'id': p.pk,
        'user': {
            'id': p.user.pk,
            'full_name': p.user.full_name,
            'phone': p.user.phone,
            'avatar_url': p.user.avatar.url if p.user.avatar else None,
        },
        'role': p.role,
        'stages': [s.pk for s in p.stages.all()],
        'can_add_expense': p.can_add_expense,
        'can_complete_stage': p.can_complete_stage,
    }


# ── Stage Template ──
def serialize_template(t):
    items = list(t.items.order_by('sort_order'))
    return {
        'id': t.pk,
        'name': t.name,
        'is_default': t.is_default,
        'items': [{
            'title': i.title,
            'icon': i.icon,
            'color': i.color,
            'sort_order': i.sort_order,
            'is_mebelcity': i.is_mebelcity,
            'checklist_json': i.checklist_json or [],
        } for i in items],
    }


# ── Dashboard data (yig'ma) ──
def serialize_dashboard(user):
    from client_erp.models import (
        ClientOrder, ClientCustomer, ClientFinanceRecord,
        ClientDebt, Quest, QuestCompletion, Announcement,
        ClientOrderPermission,
    )
    from django.utils import timezone
    from django.db.models import Sum, Q

    today = timezone.localdate()
    orders = ClientOrder.objects.filter(owner=user)
    customers = ClientCustomer.objects.filter(owner=user)
    finance = ClientFinanceRecord.objects.filter(owner=user)

    total_income = finance.filter(record_type='income').aggregate(
        s=Sum('amount'))['s'] or 0
    total_expense = finance.filter(record_type='expense').aggregate(
        s=Sum('amount'))['s'] or 0
    total_debt = ClientDebt.objects.filter(
        owner=user, is_paid=False
    ).aggregate(s=Sum('remaining'))['s'] or 0

    active_orders = orders.exclude(status='completed').order_by('-created_at')[:10]

    # Shared tasks
    shared_perms = ClientOrderPermission.objects.filter(
        user=user
    ).select_related('order', 'order__customer')
    shared_tasks = []
    for perm in shared_perms:
        o = perm.order
        active_stages = list(o.stages.filter(status='active'))
        if active_stages:
            shared_tasks.append({
                'order': serialize_order_brief(o),
                'role': perm.role,
                'active_stages': [{'id': s.pk, 'title': s.title, 'icon': s.icon} for s in active_stages],
            })

    # Daily quests
    daily_quests = Quest.objects.filter(quest_type='daily', is_active=True)
    quests_data = []
    for q in daily_quests:
        completion = QuestCompletion.objects.filter(
            user=user, quest=q, date=today
        ).first()
        quests_data.append({
            'id': q.pk,
            'title': q.title,
            'icon': q.icon,
            'description': q.description,
            'xp_reward': q.xp_reward,
            'coin_reward': q.coin_reward,
            'action_count': q.action_count,
            'progress': completion.progress if completion else 0,
            'is_completed': completion.is_completed if completion else False,
        })

    # Announcements
    now = timezone.now()
    announcements = Announcement.objects.filter(
        is_active=True, start_date__lte=now,
    ).filter(Q(end_date__isnull=True) | Q(end_date__gte=now))
    if user.vip_level:
        announcements = announcements.filter(
            Q(target_all=True) | Q(target_levels=user.vip_level) | Q(target_users=user)
        )
    else:
        announcements = announcements.filter(
            Q(target_all=True) | Q(target_users=user)
        )
    announcements = announcements.distinct().order_by('-is_pinned', '-created_at')[:5]

    return {
        'user': serialize_user(user),
        'stats': {
            'customers_count': customers.count(),
            'total_orders': orders.count(),
            'active_orders': orders.exclude(status='completed').count(),
            'total_income': _dec(total_income),
            'total_expense': _dec(total_expense),
            'profit': _dec(total_income - total_expense),
            'total_debt': _dec(total_debt),
        },
        'active_orders': [serialize_order_brief(o) for o in active_orders],
        'shared_tasks': shared_tasks,
        'daily_quests': quests_data,
        'announcements': [{
            'id': a.pk,
            'type': a.announcement_type,
            'title': a.title,
            'body': a.body,
            'image': a.image.url if a.image else None,
            'discount_percent': str(a.discount_percent) if a.discount_percent else None,
            'discount_code': a.discount_code or '',
            'start_date': a.start_date.isoformat(),
            'end_date': a.end_date.isoformat() if a.end_date else None,
            'is_pinned': a.is_pinned,
        } for a in announcements],
    }


# ── Finance page data ──
def serialize_finance_page(user):
    from client_erp.models import ClientFinanceRecord, ClientDebt
    from django.db.models import Sum

    records = ClientFinanceRecord.objects.filter(
        owner=user
    ).select_related('order', 'customer', 'stage').order_by('-created_at')[:100]

    debts = ClientDebt.objects.filter(
        owner=user, is_paid=False
    ).select_related('customer').order_by('-created_at')

    income = ClientFinanceRecord.objects.filter(
        owner=user, record_type='income'
    ).aggregate(s=Sum('amount'))['s'] or 0

    expense = ClientFinanceRecord.objects.filter(
        owner=user, record_type='expense'
    ).aggregate(s=Sum('amount'))['s'] or 0

    withdrawal = ClientFinanceRecord.objects.filter(
        owner=user, record_type='withdrawal'
    ).aggregate(s=Sum('amount'))['s'] or 0

    return {
        'stats': {
            'total_income': _dec(income),
            'total_expense': _dec(expense),
            'total_withdrawal': _dec(withdrawal),
            'profit': _dec(income - expense),
            'balance': _dec(income - expense - withdrawal),
        },
        'records': [serialize_transaction(r) for r in records],
        'debts': [{
            'id': d.pk,
            'customer': serialize_customer(d.customer) if d.customer else None,
            'amount': _dec(d.amount),
            'remaining': _dec(d.remaining),
            'description': d.description or '',
            'is_paid': d.is_paid,
            'created_at': d.created_at.isoformat(),
        } for d in debts],
    }
```

### 2.4. `config/asgi.py` ga qo'shish

Mavjud `websocket_urlpatterns` ga yangi qo'shish:

```python
# Mavjud importlar orasiga:
import client_erp.routing

# websocket_urlpatterns ichiga qo'shish:
*client_erp.routing.websocket_urlpatterns,
```

---

## 3. Auth — JWT Cookie WS Middleware

Mavjud `client_erp/middleware.py` dagi token tekshirish logikasini consumer dan foydalanish uchun ajratish kerak.

**Qadamlar:**
1. `middleware.py` da `_get_user_from_token(token_str)` funksiya ajratish
2. Consumer `connect()` da shu funksiyani `database_sync_to_async` bilan chaqirish
3. Token yo'q yoki noto'g'ri → `close(4001)`
4. User blocked/inactive → `close(4003)`

**Token cookie nomi:** Mavjud middleware dagi cookie nomini ishlatish (odatda `mini_token` yoki `client_erp_token`).

---

## 4. Middleware token funksiyasini ajratish

`client_erp/middleware.py` dagi mavjud logika:
```python
# Hozir middleware ichida:
# token = request.COOKIES.get('...')
# jwt.decode(token, ...)
# user = ClientUser.objects.get(...)

# Ajratish kerak:
def get_user_from_token(token_str):
    """Token string dan ClientUser qaytaradi. Xato bo'lsa None."""
    try:
        payload = jwt.decode(token_str, settings.SECRET_KEY, algorithms=['HS256'])
        user = ClientUser.objects.get(pk=payload['user_id'], is_active=True)
        return user
    except (jwt.InvalidTokenError, ClientUser.DoesNotExist):
        return None
```

---

## 5. Tekshirish

### Consumer ishlashini test qilish:
```python
# Django shell:
# WebSocket consumer ga ulanish test (wscat yoki browser console):
# ws = new WebSocket('wss://mebelcity.bittada.uz/ws/mini/sardor/')
# ws.onmessage = (e) => console.log(JSON.parse(e.data))
# ws.send(JSON.stringify({type: 'ping', request_id: '1'}))
# Kutilgan javob: {type: 'ping.result', ok: false, error: 'Unknown action type'}
```

### Restart:
```bash
sudo systemctl restart bittada-manager-ws
```

---

## 6. Fayl ro'yxati

| Fayl | Holat | Tavsif |
|------|-------|--------|
| `client_erp/consumers.py` | YANGI | MiniERPConsumer skeleton |
| `client_erp/routing.py` | YANGI | WS URL pattern |
| `client_erp/serializers.py` | YANGI | 15+ serialize funksiya |
| `config/asgi.py` | O'ZGARTIRISH | client_erp routing qo'shish |
| `client_erp/middleware.py` | O'ZGARTIRISH | Token funksiyani ajratish |

---

## 7. Muhim eslatmalar

1. **database_sync_to_async** — barcha ORM operatsiyalari `@database_sync_to_async` bilan o'ralishi SHART (async consumer ichida sync ORM ishlamaydi)
2. **Tenant DB** — barcha querylar `.using('tenant_mebelcity')` bilan bo'lishi kerak (yoki middleware orqali avtomatik)
3. **Mavjud consumer pattern** — `manfacturing/consumers.py` dagi `serialize_instance()` va `OrderConsumer` ni namuna sifatida ishlatish
4. **Error handling** — har handler da try/except, log + user-friendly xato
5. **Bu fazada handler logika yo'q** — faqat infrastructure. `handle_*` metodlar keyingi fazada

---

# PROMPT — Faza 1 uchun

```
Sen MebelCity ERP platformasida ishlayapsan. Hozirgi vazifa: Client ERP (`/mini/`) modulini to'liq 
SPA + WebSocket ga o'tkazish. Bu Faza 1 — WebSocket infrastructure.

## Nima qilish kerak:

### 1. `client_erp/consumers.py` — MiniERPConsumer yaratish
- `AsyncJsonWebsocketConsumer` dan voris oladi
- `connect()`: JWT cookie dan auth, ClientUser topish, `mini_user_{id}` group ga qo'shish
- `disconnect()`: barcha groups dan chiqish
- `receive_json()`: type → handler dispatch (`handle_` + type.replace('.','_'))
- `_reply()`, `_error()`: JSON response helpers
- `_broadcast_order()`: order group ga broadcast (sender o'ziga yubormaslik)
- `order_broadcast()`: group message handler
- `_subscribe_order()`, `_unsubscribe_order()`: order group management
- `_authenticate()`: `@database_sync_to_async` bilan JWT cookie → ClientUser

### 2. `client_erp/routing.py`
- `ws/mini/<str:username>/` → MiniERPConsumer

### 3. `config/asgi.py` ga client_erp routing qo'shish
- Mavjud `websocket_urlpatterns` ga `*client_erp.routing.websocket_urlpatterns` qo'shish

### 4. `client_erp/serializers.py` — barcha serialize funksiyalar
Funksiyalar ro'yxati (barchasi sync, consumer dan `database_sync_to_async` bilan chaqiriladi):
- `serialize_user(user)` — id, username, full_name, phone, org, xp, coins, vip_level, avatar
- `serialize_level(level)` — id, name, level_number, icon, color, min_turnover
- `serialize_customer(customer)` — id, name, phone, address, created_at
- `serialize_order_brief(order)` — list uchun qisqa (id, title, status, progress, income/expense)
- `serialize_order_full(order, user_role, is_owner)` — detail uchun to'liq (stages, transactions, timeline, permissions)
- `serialize_stage(stage)` — id, title, icon, color, status, checklist[], expenses[], assigned_to
- `serialize_checklist_item(item)` — id, title, is_done, done_by, done_at
- `serialize_transaction(record)` — id, type, amount, description, stage, order, customer, date
- `serialize_timeline(entry)` — id, action, description, date, user
- `serialize_permission(perm)` — id, user{}, role, stages[], can_add_expense, can_complete_stage
- `serialize_template(template)` — id, name, is_default, items[]
- `serialize_dashboard(user)` — yig'ma: user, stats, active_orders, shared_tasks, quests, announcements
- `serialize_finance_page(user)` — stats, records[], debts[]
- `_dec(val)` — Decimal → str helper

### 5. `client_erp/middleware.py` ni o'zgartirish
- Token tekshirish logikasini `get_user_from_token(token_str)` funksiyaga ajratish
- Middleware o'zi ham shu funksiyani chaqirsin
- Consumer ham shu funksiyani import qilib ishlatsin

## Muhim qoidalar:
- Barcha ORM querylar `@database_sync_to_async` bilan bo'lishi kerak
- Tenant DB: `.using('tenant_mebelcity')` yoki middleware automatic routing
- Serializer larda Decimal → str (`_dec()` helper)
- ForeignKey lar uchun `select_related` ishlatish
- M2M lar uchun `prefetch_related` ishlatish
- Handler logika YOZMA — bu fazada faqat skeleton + serializers
- `handle_ping` qo'shish — test uchun `{'ok': True, 'data': 'pong'}`
- Restart: `sudo systemctl restart bittada-manager-ws`

## Mavjud fayllar (reference):
- `manfacturing/consumers.py` — namuna consumer pattern
- `config/asgi.py` — mavjud ASGI config
- `client_erp/middleware.py` — JWT auth logikasi
- `client_erp/models/` — barcha modellar
- `client_erp/views/` — mavjud view logikasi (serialize uchun reference)

## Tekshirish:
Browser console dan WebSocket ulanishini test qilish kerak.
```
