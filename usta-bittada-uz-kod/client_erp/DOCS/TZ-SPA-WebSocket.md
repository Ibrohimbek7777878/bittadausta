# TZ: Client ERP — Full SPA + WebSocket Conversion

**Loyiha:** MebelCity Client ERP (`/mini/`)
**Sana:** 2026-05-20
**Maqsad:** Barcha sahifalar JS render, 0 ta page reload, to'liq WebSocket real-time, loading skeleton, instant UX

---

## 1. Hozirgi muammo

### Page reload lar
Hozir **24 ta joyda** `location.reload()` ishlatilgan:
- Order detail: 16 ta reload (har checkbox, har chiqim, har etap)
- Finance: 4 ta reload
- Customers: 1 ta reload
- Orders list: 1 ta reload + 2 ta `location.href`

### Tezlik muammolari
1. Har operatsiyadan keyin **to'liq sahifa qayta yuklanadi** (HTML render + CSS + JS parse)
2. Barcha ma'lumotlar **Django template** da render — server CPU sarfi
3. Sahifalar o'rtasida navigatsiya — **to'liq HTTP GET** + blank screen
4. Mobil tarmoqda har reload 500ms-2s kutish

### Maqsad
- **0 ta page reload** — barcha operatsiyalar JS DOM manipulyatsiya bilan
- **WebSocket** — real-time yangilanish (bir nechta user bir buyurtmani ko'rganda)
- **Loading skeleton** — API javob kutilganda placeholder UI
- **Instant navigatsiya** — sahifalar orasida SPA-style o'tish
- **Optimistic UI** — checkbox/toggle darhol yangilanadi, server confirm keyin

---

## 2. Arxitektura

### 2.1. Yondashuv: SPA Shell + WS Data

```
┌────────────────────────────────────────────────┐
│                 BROWSER                          │
│                                                  │
│  ┌── base.html (shell) ────────────────────┐    │
│  │  Sidebar + TopBar + BottomNav            │    │
│  │  <div id="app"></div> ← JS render zone   │    │
│  │  <script src="mini-erp.js"></script>      │    │
│  └──────────────────────────────────────────┘    │
│         │                          ▲              │
│         ▼                          │              │
│  ┌── mini-erp.js ──────────────────┤              │
│  │  Router (hash-based)            │              │
│  │  ├ #/               → Dashboard │              │
│  │  ├ #/clients         → Clients  │              │
│  │  ├ #/orders          → Orders   │              │
│  │  ├ #/orders/:id      → Detail   │              │
│  │  ├ #/finance         → Finance  │              │
│  │  ├ #/mebelcity       → MC       │              │
│  │  └ #/settings        → Settings │              │
│  │                                 │              │
│  │  WebSocket ←──→ MiniERPConsumer │              │
│  │  Cache (sessionStorage)         │              │
│  └─────────────────────────────────┘              │
│                                                    │
└────────────────────────────────────────────────────┘
         │ WSS
         ▼
┌────────────────────────────────────────────────┐
│              DJANGO (Daphne)                     │
│                                                  │
│  MiniERPConsumer (channels)                      │
│  ├ type: "page.data"     → sahifa datasi          │
│  ├ type: "stage.check"   → checklist toggle       │
│  ├ type: "stage.complete" → etap tugatish         │
│  ├ type: "order.update"  → order yangilash        │
│  ├ type: "finance.create" → kirim/chiqim          │
│  ├ type: "client.create" → mijoz yaratish         │
│  └ type: "broadcast"     → boshqa userlarga push  │
│                                                  │
│  Channel Groups:                                 │
│  ├ "mini_user_{user_id}" — user shaxsiy           │
│  └ "mini_order_{order_id}" — order subscribers    │
└────────────────────────────────────────────────────┘
```

### 2.2. Nima uchun WS (HTTP API emas)?

| Xususiyat | HTTP API | WebSocket |
|-----------|----------|-----------|
| Tezlik | Har request yangi TCP | Doimiy connection |
| Real-time | Polling kerak | Server push |
| Multi-user | Polling | Broadcast |
| Header overhead | Har request CSRF + Cookie | 1 marta handshake |
| Mobil battery | Ko'p request | 1 connection |

**Qaror: To'liq WebSocket.** HTTP API faqat fayl yuklash (image upload) uchun.

### 2.3. Fayl strukturasi

```
static/client_erp/js/
├── mini-erp.js          ← Main SPA entry (router, WS, state)
├── pages/
│   ├── dashboard.js     ← Dashboard render
│   ├── clients.js       ← Clients list + CRUD
│   ├── orders.js        ← Orders list
│   ├── order-detail.js  ← Order detail (stages, checklist, finance)
│   ├── finance.js       ← Finance page
│   ├── mebelcity.js     ← MebelCity orders
│   └── settings.js      ← Settings page
└── components/
    ├── modal.js         ← Universal modal
    ├── toast.js         ← Toast notifications
    ├── skeleton.js      ← Loading skeletons
    └── utils.js         ← Formatting, dates, helpers

client_erp/
├── consumers.py         ← YANGI — MiniERPConsumer (WebSocket)
├── routing.py           ← YANGI — WS URL routing
```

---

## 3. WebSocket Protocol

### 3.1. Connection

```
WSS: wss://mebelcity.bittada.uz/ws/mini/{username}/
Auth: JWT token cookie (mavjud middleware bilan)
```

### 3.2. Message format (ikki tomonga)

```json
{
  "type": "action_name",
  "data": { ... },
  "request_id": "uuid"  // client → server: correlation id
}
```

Server response:
```json
{
  "type": "action_name.result",
  "data": { ... },
  "request_id": "uuid",
  "ok": true,
  "error": null
}
```

Broadcast (server → client, boshqa userlar):
```json
{
  "type": "broadcast",
  "action": "stage.completed",
  "data": { "order_id": 1, "stage_id": 5, "by": "Sardor" }
}
```

### 3.3. Actions (barcha 30+ operatsiya)

#### Dashboard
```
→ page.dashboard                    ← dashboard data (stats, orders, quests, announcements)
```

#### Clients
```
→ page.clients                      ← clients list
→ client.create   {name, phone}     ← {ok, client}
→ client.delete   {id}              ← {ok}
```

#### Orders
```
→ page.orders                       ← orders list + shared
→ order.create    {title, ...}      ← {ok, order}
→ page.order      {id}              ← order full data (items, stages, timeline, permissions)
→ order.update    {id, fields}      ← {ok, order}
→ order.income    {id, amount, ...} ← {ok, record}
→ order.expense   {id, amount, ...} ← {ok, record}
→ order.send_mc   {id}              ← {ok, mc_code}
```

#### Stages
```
→ stage.create    {order_id, ...}   ← {ok, stage}
→ stage.update    {id, fields}      ← {ok}
→ stage.complete  {id}              ← {ok, progress, xp, coins}
→ stage.skip      {id}              ← {ok, progress}
→ stage.delete    {id}              ← {ok}
→ stage.reorder   {order_id, ids}   ← {ok}
→ stage.check     {stage_id, item_id} ← {ok, is_done}
→ template.list                     ← {templates}
→ template.apply  {tmpl_id, order_id} ← {ok}
```

#### Permissions
```
→ perm.save       {order_id, ...}   ← {ok, perm}
→ perm.delete     {id}              ← {ok}
→ user.search     {q}               ← {users}
```

#### Finance
```
→ page.finance    {tab}             ← finance data
→ finance.create  {type, amount}    ← {ok, record}
→ debt.create     {customer_id, amount} ← {ok, debt}
→ debt.pay        {id, amount}      ← {ok}
→ finance.withdrawal {amount}       ← {ok}
```

#### MebelCity
```
→ page.mebelcity                    ← mc orders
```

#### Settings
```
→ page.settings                     ← user profile
→ settings.password {current, new}  ← {ok}
```

---

## 4. Frontend Architecture

### 4.1. Router (Hash-based)

```javascript
// Nima uchun hash: Django URL lar saqlanadi, server-side 404 yo'q
// /mini/bigone_cl/ → base shell yuklaydi
// #/orders/5       → JS order detail renderlay
// Browser back/forward ishlaydi

const ROUTES = {
  '/':            () => renderDashboard(),
  '/clients':     () => renderClients(),
  '/orders':      () => renderOrders(),
  '/orders/:id':  (id) => renderOrderDetail(id),
  '/finance':     () => renderFinance(),
  '/mebelcity':   () => renderMebelCity(),
  '/settings':    () => renderSettings(),
};
```

### 4.2. State Management

```javascript
const STATE = {
  user: null,           // ClientUser data
  dashboard: null,      // Dashboard cache
  clients: [],          // Clients list
  orders: [],           // Own orders
  sharedOrders: [],     // Shared orders
  currentOrder: null,   // Active order detail
  finance: null,        // Finance data
  templates: [],        // Stage templates
  ws: null,             // WebSocket connection
  loading: {},          // Loading flags per section
};
```

### 4.3. Rendering Pattern

```javascript
function renderOrderDetail(orderId) {
  const app = document.getElementById('app');
  
  // 1. Immediately show skeleton
  app.innerHTML = skeletonOrderDetail();
  
  // 2. Check cache
  if (STATE.currentOrder?.id === orderId) {
    app.innerHTML = templateOrderDetail(STATE.currentOrder);
    bindOrderEvents();
  }
  
  // 3. Request fresh data via WS
  ws.send('page.order', { id: orderId }, (data) => {
    STATE.currentOrder = data;
    app.innerHTML = templateOrderDetail(data);
    bindOrderEvents();
  });
}
```

### 4.4. Optimistic UI

```javascript
// Checkbox toggle — darhol visual yangilash
function onChecklistToggle(stageId, itemId) {
  // 1. Darhol DOM yangilash (optimistic)
  const el = document.querySelector(`[data-item="${itemId}"]`);
  el.classList.toggle('done');
  const box = el.querySelector('.stg-cl-box');
  box.innerHTML = el.classList.contains('done') ? '<i class="fas fa-check"></i>' : '';
  
  // 2. Server ga yuborish
  ws.send('stage.check', { stage_id: stageId, item_id: itemId }, (res) => {
    if (!res.ok) {
      // Revert
      el.classList.toggle('done');
      box.innerHTML = !el.classList.contains('done') ? '<i class="fas fa-check"></i>' : '';
      toast.error(res.error);
    }
  });
}
```

### 4.5. Loading Skeletons

```javascript
function skeletonOrderDetail() {
  return `
    <div class="skeleton-block" style="height:24px;width:40%;margin-bottom:16px"></div>
    <div class="skeleton-block" style="height:8px;width:100%;margin-bottom:16px"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div class="skeleton-block" style="height:60px"></div>
      <div class="skeleton-block" style="height:60px"></div>
      <div class="skeleton-block" style="height:60px"></div>
      <div class="skeleton-block" style="height:60px"></div>
    </div>
    ${[1,2,3].map(() => `
      <div class="skeleton-block" style="height:60px;margin-bottom:10px;border-radius:14px"></div>
    `).join('')}
  `;
}

// CSS:
// .skeleton-block { background: linear-gradient(90deg, var(--border) 25%, var(--surface2) 50%, var(--border) 75%); 
//   background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 10px; }
// @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
```

---

## 5. WebSocket Consumer

### 5.1. MiniERPConsumer

```python
# client_erp/consumers.py

class MiniERPConsumer(AsyncJsonWebsocketConsumer):
    """
    To'liq Mini ERP WebSocket consumer.
    
    Groups:
    - mini_user_{user_id} — shaxsiy kanal
    - mini_order_{order_id} — buyurtma subscribers (ochiq sahifa)
    
    Auth: JWT token cookie bilan (middleware)
    """
    
    async def connect(self):
        # 1. JWT auth tekshirish
        # 2. ClientUser topish
        # 3. mini_user_{id} group ga qo'shish
        # 4. accept()
    
    async def disconnect(self, code):
        # Groups dan chiqish
    
    async def receive_json(self, content):
        # type bo'yicha dispatch:
        handler = getattr(self, f"handle_{content['type'].replace('.', '_')}", None)
        if handler:
            result = await handler(content.get('data', {}))
            await self.send_json({
                'type': f"{content['type']}.result",
                'data': result.get('data'),
                'ok': result.get('ok', True),
                'error': result.get('error'),
                'request_id': content.get('request_id'),
            })
    
    # ── Page data handlers ──
    async def handle_page_dashboard(self, data): ...
    async def handle_page_clients(self, data): ...
    async def handle_page_orders(self, data): ...
    async def handle_page_order(self, data): ...
    async def handle_page_finance(self, data): ...
    async def handle_page_mebelcity(self, data): ...
    async def handle_page_settings(self, data): ...
    
    # ── CRUD handlers ──
    async def handle_client_create(self, data): ...
    async def handle_order_create(self, data): ...
    async def handle_order_update(self, data): ...
    async def handle_stage_create(self, data): ...
    async def handle_stage_complete(self, data): ...
    async def handle_stage_check(self, data): ...
    # ... 20+ handlers
    
    # ── Broadcast ──
    async def order_broadcast(self, event):
        """Boshqa subscribers ga push."""
        await self.send_json(event['message'])
```

### 5.2. Serialization

```python
# client_erp/serializers.py (YANGI)

def serialize_dashboard(user):
    """Dashboard uchun barcha data bir JSON da."""
    return {
        'user': serialize_user(user),
        'stats': {
            'customers_count': ...,
            'total_orders': ...,
            'profit': ...,
            'total_debt': ...,
        },
        'active_orders': [serialize_order_brief(o) for o in ...],
        'shared_tasks': [...],
        'daily_quests': [...],
        'announcements': [...],
        'level': serialize_level(user),
    }

def serialize_order_full(order, user):
    """Order detail — stages, checklist, finance, permissions."""
    return {
        'id': order.id,
        'title': order.title,
        'status': order.status,
        'customer': serialize_customer(order.customer) if order.customer else None,
        'estimated_price': str(order.estimated_price or 0),
        'overall_progress': order.overall_progress,
        'total_income': str(order.total_income),
        'total_expense': str(order.total_expense),
        'profit': str(order.profit),
        'payment_percent': order.payment_percent,
        'mc_code': ...,
        'stages': [serialize_stage(s) for s in order.stages.all()],
        'transactions': [serialize_transaction(t) for t in ...],
        'timeline': [serialize_timeline(t) for t in ...],
        'permissions': [...],
        'templates': [...],
        'user_role': ...,
        'is_owner': ...,
    }
```

---

## 6. Sahifalar va ularning render logikasi

### 6.1. Dashboard (`#/`)
**Ma'lumot:** `page.dashboard` → bir JSON
**Render:** JS template literal bilan HTML generate
**Real-time:** Quest progress, XP, streak — server push bilan yangilanadi
**Skeleton:** 3x grid cards + 5 ta order placeholder

### 6.2. Clients (`#/clients`)
**Ma'lumot:** `page.clients` → clients array
**Operatsiyalar:**
- Yaratish → `client.create` → list ga JS qo'shish (DOM prepend)
- O'chirish → `client.delete` → DOM element olib tashlash (fade out)
**Skeleton:** 5 ta card placeholder

### 6.3. Orders (`#/orders`)
**Ma'lumot:** `page.orders` → {orders, shared_orders, templates}
**Operatsiyalar:**
- Yaratish → `order.create` → list ga qo'shish + auto navigate to detail
- Click → `#/orders/:id` ga navigate (JS router)
**Skeleton:** 6 ta card placeholder

### 6.4. Order Detail (`#/orders/:id`) — **ENG MURAKKAB**
**Ma'lumot:** `page.order` → full order data
**Subscribe:** `mini_order_{id}` group ga qo'shilish
**Operatsiyalar (barchasi reload yo'q):**

| Operatsiya | WS message | DOM yangilanish |
|------------|-----------|----------------|
| Checkbox toggle | `stage.check` | Optimistic: darhol class toggle |
| Etap tugatish | `stage.complete` | Stage card status o'zgarish + progress bar |
| Etap o'tkazish | `stage.skip` | Stage card greyed out |
| Etap o'chirish | `stage.delete` | DOM element slide-out remove |
| Etap qo'shish | `stage.create` | DOM ga yangi card append |
| Etap tartib | `stage.reorder` | DOM reorder (swap) |
| Kirim qo'shish | `order.income` | Stats yangilanish + trx card prepend |
| Chiqim qo'shish | `order.expense` | Stats + stage expense yangilanish |
| Status o'zgartirish | `order.update` | Badge yangilanish |
| Ruxsat qo'shish | `perm.save` | Perm card prepend |
| Ruxsat o'chirish | `perm.delete` | Perm card remove |
| MebelCity yuborish | `order.send_mc` | MC section yangilanish |

**Real-time broadcast:**
Boshqa user checkbox bosganda — mening ekranimda ham ko'rinadi (WS broadcast orqali)

### 6.5. Finance (`#/finance`)
**Ma'lumot:** `page.finance` → {stats, records, debts}
**Operatsiyalar:**
- Tab o'zgartirish → local filter (server so'rov yo'q)
- Kirim/Chiqim → `finance.create` → stats + list yangilanish
- Qarz to'lash → `debt.pay` → debt card yangilanish
- Pul yechish → `finance.withdrawal` → stats yangilanish
**Skeleton:** Stats + 5 ta trx placeholder

### 6.6. MebelCity (`#/mebelcity`)
**Ma'lumot:** `page.mebelcity` → mc_orders
**Read-only** (o'zgarish yo'q)
**Skeleton:** 4 ta order card placeholder

### 6.7. Settings (`#/settings`)
**Ma'lumot:** `page.settings` → user data
**Operatsiyalar:**
- Parol o'zgartirish → `settings.password` → success/error toast

---

## 7. Navigation va Transitions

### 7.1. SPA Navigation

```javascript
// Sidebar/BottomNav linklari o'zgaradi:
// Eski: <a href="/mini/bigone_cl/orders/">
// Yangi: <a href="#/orders" data-page="orders">

// Active state: hash ga qarab
window.addEventListener('hashchange', () => {
  const path = location.hash.slice(1) || '/';
  router.navigate(path);
  updateActiveNav(path);
});
```

### 7.2. Page Transition

```css
/* Sahifa o'tishi */
#app { transition: opacity .15s; }
#app.loading { opacity: .4; pointer-events: none; }

/* Yoki slide animation */
@keyframes pageIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
.page-enter { animation: pageIn .2s ease-out; }
```

---

## 8. Implementatsiya rejasi

### Faza A — WebSocket Consumer + Serializers (1.5 kun)
- [ ] `client_erp/consumers.py` — MiniERPConsumer (AsyncJsonWebsocketConsumer)
- [ ] `client_erp/routing.py` — WS URL pattern
- [ ] `config/asgi.py` ga qo'shish
- [ ] `client_erp/serializers.py` — barcha serialize funksiyalar
- [ ] 30+ handler metodlar (page data + CRUD)
- [ ] Channel group broadcast (order subscribers)
- [ ] JWT auth WS middleware (mavjuddan foydalanish)
- [ ] Restart: `sudo systemctl restart bittada-manager-ws`

### Faza B — SPA Shell + Router + WS Client (0.5 kun)
- [ ] `static/client_erp/js/mini-erp.js` — main entry
- [ ] Hash-based router
- [ ] WS connection manager (auto-reconnect, heartbeat)
- [ ] State management (cache, loading flags)
- [ ] `template/client_erp/base.html` yangilash — `<div id="app">`
- [ ] Sidebar/BottomNav hash linklarga o'tkazish
- [ ] Loading skeleton CSS + component

### Faza C — Page renderers (2 kun)
- [ ] `pages/dashboard.js` — Dashboard render + skeleton
- [ ] `pages/clients.js` — Clients CRUD (optimistic)
- [ ] `pages/orders.js` — Orders list + create modal
- [ ] `pages/order-detail.js` — Full order detail (eng katta)
- [ ] `pages/finance.js` — Finance tabs + modals
- [ ] `pages/mebelcity.js` — MC orders (read-only)
- [ ] `pages/settings.js` — Profile + password

### Faza D — Components (0.5 kun)
- [ ] `components/modal.js` — Universal modal (open/close/form)
- [ ] `components/toast.js` — Success/error/XP notifications
- [ ] `components/skeleton.js` — Per-page skeletons
- [ ] `components/utils.js` — formatMoney, formatDate, debounce, etc.

### Faza E — Real-time + Polish (0.5 kun)
- [ ] Order broadcast — multi-user sync
- [ ] WS reconnect logic (exponential backoff)
- [ ] Offline indicator
- [ ] Error boundary (WS disconnect → retry + toast)
- [ ] Performance: lazy load pages, debounce input
- [ ] collectstatic + restart

---

## 9. Texnik qarorlar

| Savol | Qaror | Sabab |
|-------|-------|-------|
| React/Vue? | Yo'q, vanilla JS | Mavjud stack, no build step, jQuery ham yo'q |
| Hash vs History API? | Hash (#/) | Django URL conflict yo'q, server 404 yo'q |
| State management lib? | Oddiy object | Kichik app, lib ortiqcha |
| Template engine? | JS template literals | Sodda, tez, dependency yo'q |
| WS library? | Native WebSocket | Browser support yaxshi, lib kerak emas |
| Bundler? | Yo'q | Bitta concatenated fayl, import yo'q |
| Caching? | sessionStorage | Sahifa refresh da ham tez |
| Image upload? | HTTP POST (fetch) | WS binary qo'llab-quvvatlamaydi |

---

## 10. WS Consumer ichki tuzilishi

```python
class MiniERPConsumer(AsyncJsonWebsocketConsumer):

    # ── Auth ──
    async def connect(self):
        self.user = await self._authenticate()
        if not self.user:
            await self.close(code=4001)
            return
        self.user_group = f"mini_user_{self.user.pk}"
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.accept()
        self.order_groups = set()
    
    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.user_group, self.channel_name)
        for g in self.order_groups:
            await self.channel_layer.group_discard(g, self.channel_name)

    # ── Dispatch ──
    async def receive_json(self, content):
        msg_type = content.get('type', '')
        handler_name = 'handle_' + msg_type.replace('.', '_')
        handler = getattr(self, handler_name, None)
        if not handler:
            await self._reply(content, ok=False, error='Unknown type')
            return
        try:
            result = await handler(content.get('data', {}))
            await self._reply(content, **result)
        except Exception as e:
            await self._reply(content, ok=False, error=str(e))

    async def _reply(self, original, ok=True, data=None, error=None):
        await self.send_json({
            'type': original.get('type', '') + '.result',
            'request_id': original.get('request_id'),
            'ok': ok, 'data': data, 'error': error,
        })

    # ── Order subscribe ──
    async def handle_page_order(self, data):
        order_id = data.get('id')
        group = f"mini_order_{order_id}"
        if group not in self.order_groups:
            await self.channel_layer.group_add(group, self.channel_name)
            self.order_groups.add(group)
        # ... serialize va return

    # ── Broadcast helper ──
    async def _broadcast_order(self, order_id, action, payload):
        """Order subscribers ga yangilik yuborish (o'zimdan boshqa)."""
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
```

---

## 11. Performance budgetlar

| Metrika | Maqsad |
|---------|--------|
| First page render | < 200ms (skeleton) |
| WS connect | < 300ms |
| Dashboard data | < 500ms |
| Checkbox toggle | < 50ms (optimistic) |
| Page navigate | < 100ms (cached) |
| mini-erp.js size | < 50KB (gzip) |
| WS message latency | < 100ms |

---

## 12. Xavfsizlik

1. **WS Auth** — JWT token cookie (mavjud middleware)
2. **Permission** — har handler da owner/role tekshirish (mavjud logika)
3. **Input sanitize** — textContent ishlatish (innerHTML emas user data uchun)
4. **Rate limiting** — consumer da per-user rate limit
5. **Group isolation** — user faqat o'z orderlariga subscribe bo'lishi
6. **CSRF** — WS da kerak emas (origin check middleware bilan)

---

## 13. Backward Compatibility

- `/mini/<username>/` — Django base shell qaytaradi (SPA bootstrap)
- `/mini/<username>/orders/`, `/mini/<username>/orders/5/` — 301 redirect → `#/orders`, `#/orders/5`
- HTTP API endpoints saqlanadi (mobile app yoki boshqa integrations uchun)
- Admin panel (`/mini/admin/`) o'zgarmaydi (alohida tizim)

---

## 14. Kelajak

- Service Worker + offline cache (PWA)
- Push notifications (WS orqali yoki Firebase)
- Lazy loading: faqat ko'rilgan page JS yuklanadi
- Virtual scrolling: 1000+ order/tranzaksiya uchun
- Drag-and-drop stages (touch events)
