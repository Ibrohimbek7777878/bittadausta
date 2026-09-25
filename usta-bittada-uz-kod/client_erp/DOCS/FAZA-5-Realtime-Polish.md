# FAZA 5: Real-time Broadcast + Polish + Integration

**Loyiha:** MebelCity Client ERP → SPA + WebSocket Conversion
**Faza:** 5 / 5
**Muddat:** 1 kun
**Qism:** Backend + Frontend (ikkalasi)
**Bog'liqlik:** Faza 1-4 tugagan bo'lishi kerak

---

## 1. Maqsad

Oxirgi faza — barcha qismlarni birlashtirish va sifatni oshirish:
- **Real-time broadcast** — multi-user sync (bir buyurtmani bir nechta user ko'rganda)
- **WS reconnect** — exponential backoff + visual indicator
- **Offline/Online indicator** — UI feedback
- **Performance** — cache optimization, lazy load, debounce
- **Error boundary** — WS disconnect, server error handling
- **Edge cases** — bo'sh holat, xato holat, permission edge case
- **Backward compatibility** — eski URL lar, redirect
- **Deploy va test** — collectstatic, restart, production test

---

## 2. Real-time Broadcast (Backend)

### 2.1. Broadcast qoidalari

Har qanday order ga tegishli o'zgarish bo'lganda, shu order ni ko'rayotgan **barcha user** larga broadcast yuboriladi (o'zgartirgan user dan tashqari).

**Broadcast yuborilishi kerak bo'lgan handler lar:**

| Handler | Broadcast action | Ma'lumot |
|---------|-----------------|----------|
| `stage.check` | `stage.checked` | `{item_id, is_done, done_by, stage_id}` |
| `stage.complete` | `stage.completed` | `{stage_id, progress, all_done}` |
| `stage.skip` | `stage.skipped` | `{stage_id, progress}` |
| `stage.delete` | `stage.deleted` | `{stage_id, progress}` |
| `stage.create` | `stage.created` | `{stage}` (to'liq serialize) |
| `stage.reorder` | `stage.reordered` | `{order_id}` |
| `order.update` | `order.updated` | `{fields}` |
| `order.income` | `order.income` | `{transaction}` |
| `order.expense` | `order.expense` | `{transaction}` |
| `perm.save` | `perm.saved` | `{permission}` |
| `perm.delete` | `perm.deleted` | `{perm_id}` |
| `template.apply` | `template.applied` | `{order_id}` |

### 2.2. Consumer broadcast logikasi

```python
# consumers.py ichida har handler oxirida:

async def handle_stage_check(self, data):
    result, error = await self._toggle_check(data)
    if error:
        return {'ok': False, 'error': error}

    # Broadcast
    order_id = await self._get_order_id_from_stage(data['stage_id'])
    if order_id:
        await self._broadcast_order(order_id, 'stage.checked', result)

    return {'ok': True, 'data': result}
```

### 2.3. `order_broadcast` handler

```python
async def order_broadcast(self, event):
    """Channel layer group dan kelgan broadcast."""
    # O'zimizga yubormaslik
    if event.get('sender_channel') == self.channel_name:
        return
    await self.send_json(event['message'])
```

### 2.4. Order group subscription

- `handle_page_order` da → `_subscribe_order(order_id)` 
- Boshqa sahifaga o'tganda → `_unsubscribe_order(order_id)` kerak

```python
# Consumer da sahifa o'zgarganda eski order dan chiqish
async def handle_page_dashboard(self, data):
    # Agar avval order ko'rilgan bo'lsa — unsubscribe
    await self._unsubscribe_all_orders()
    result = await self._get_dashboard_data()
    return {'ok': True, 'data': result}

async def _unsubscribe_all_orders(self):
    for group in list(self.order_groups):
        await self.channel_layer.group_discard(group, self.channel_name)
    self.order_groups.clear()
```

---

## 3. Real-time Broadcast (Frontend)

### 3.1. Broadcast handler `mini-erp.js` da

```javascript
// WS._handleBroadcast ichida:
_handleBroadcast(msg) {
    const action = msg.action;
    const data = msg.data;
    const by = msg.by;

    // Hozir order detail da bo'lsak
    if (STATE.currentPage.startsWith('/orders/') && STATE.currentOrder) {
        OrderDetail.handleBroadcast(action, data, by);
        return;
    }

    // Boshqa sahifada — notification faqat
    Toast.info(`${by} yangiladi`);
},
```

### 3.2. `OrderDetail.handleBroadcast()` — granular DOM update

```javascript
handleBroadcast(action, data, by) {
    switch (action) {
        case 'stage.checked':
            // Faqat shu checklist item ni yangilash
            const el = document.querySelector(`[data-item="${data.item_id}"]`);
            if (el) {
                const isDone = data.is_done;
                el.classList.toggle('done', isDone);
                const box = el.querySelector('.stg-cl-box');
                box.innerHTML = isDone ? '<i class="fas fa-check"></i>' : '';
                const span = el.querySelector('span');
                if (span) {
                    span.style.textDecoration = isDone ? 'line-through' : 'none';
                    span.style.opacity = isDone ? '.6' : '1';
                }
            }
            Toast.info(`${by} checklist yangiladi`);
            break;

        case 'stage.completed':
            // Progress yangilash + stage status o'zgartirish
            this._updateProgress(data.progress);
            const stageCard = document.querySelector(`[data-stage-id="${data.stage_id}"]`);
            if (stageCard) {
                stageCard.classList.add('stg-completed');
                stageCard.querySelector('.ce-badge')?.remove();
                // Badge qo'shish
                const header = stageCard.querySelector('[style*="cursor:pointer"]');
                if (header) header.insertAdjacentHTML('beforeend', Utils.statusBadge('completed'));
            }
            Toast.info(`${by} etapni tugatdi`);
            break;

        case 'stage.deleted':
            const delCard = document.querySelector(`[data-stage-id="${data.stage_id}"]`);
            if (delCard) {
                delCard.style.transition = 'all .3s';
                delCard.style.opacity = '0';
                setTimeout(() => delCard.remove(), 300);
            }
            this._updateProgress(data.progress);
            Toast.info(`${by} etapni o'chirdi`);
            break;

        case 'order.income':
        case 'order.expense':
            // Stats va trx listni yangilash
            this.render(STATE.currentOrder.id);
            Toast.info(`${by} ${action === 'order.income' ? 'kirim' : 'chiqim'} qo'shdi`);
            break;

        case 'stage.created':
        case 'template.applied':
        case 'stage.reordered':
        case 'perm.saved':
        case 'perm.deleted':
        case 'order.updated':
            // To'liq re-render
            this.render(STATE.currentOrder.id);
            Toast.info(`${by} yangiladi`);
            break;
    }
},
```

---

## 4. WS Reconnect va Error Handling

### 4.1. Reconnect logikasi (mini-erp.js)

```javascript
// WS.connect() ichida:
this.socket.onclose = (e) => {
    this.isConnecting = false;
    clearInterval(this.heartbeatInterval);

    // Auth error — login ga yo'naltirish
    if (e.code === 4001 || e.code === 4003) {
        document.body.classList.add('ws-offline');
        Toast.error('Sessiya tugadi. Qayta kiring.');
        setTimeout(() => { location.href = '/mini/login/'; }, 2000);
        return;
    }

    // Normal close (user yopgan)
    if (e.code === 1000) return;

    // Reconnect
    document.body.classList.add('ws-offline');
    if (this.reconnectAttempts < this.maxReconnect) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
    } else {
        Toast.error('Server bilan aloqa uzildi. Sahifani yangilang.');
    }
};

this.socket.onopen = () => {
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    console.log('[WS] Connected');
    document.body.classList.remove('ws-offline');

    // Heartbeat
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({type: 'ping', data: {}, request_id: 'hb'}));
        }
    }, 30000);

    // Reconnect bo'lsa — hozirgi sahifani qayta yuklash
    if (STATE.currentPage) {
        Router.navigate(STATE.currentPage, true);
    }
};
```

### 4.2. Offline indicator CSS

```css
/* base.css da mavjud — lekin yaxshilash: */
body.ws-offline::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--danger);
    z-index: 10001;
    animation: offlinePulse 2s infinite;
}
@keyframes offlinePulse {
    0%, 100% { opacity: 1; }
    50% { opacity: .4; }
}

body.ws-offline::after {
    content: '⚡ Ulanish...';
    position: fixed;
    bottom: 75px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--danger);
    color: #fff;
    padding: 8px 20px;
    border-radius: 20px;
    font-size: 13px;
    z-index: 9999;
    animation: fadeInUp .3s;
}
@keyframes fadeInUp {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

### 4.3. Request timeout

```javascript
// WS.send() ichida — timeout qo'shish:
send(type, data, callback, timeout = 15000) {
    // ...
    const requestId = String(++STATE.requestCounter);
    
    if (callback) {
        STATE.pendingCallbacks[requestId] = callback;
        
        // Timeout
        setTimeout(() => {
            if (STATE.pendingCallbacks[requestId]) {
                delete STATE.pendingCallbacks[requestId];
                callback({ok: false, error: 'Server javob bermadi (timeout)'});
            }
        }, timeout);
    }
    // ...
},
```

---

## 5. Performance Optimization

### 5.1. Cache strategiya

```javascript
// Sahifaga qaytganda eski data ni darhol ko'rsatish, keyin yangilash
renderWithCache(cacheKey, wsType, wsData, templateFn, bindFn) {
    const app = document.getElementById('app');
    
    if (STATE[cacheKey]) {
        // Cache dan darhol render
        app.innerHTML = templateFn(STATE[cacheKey]);
        bindFn();
    } else {
        // Skeleton
        app.innerHTML = Skeleton[cacheKey]?.() || Skeleton.genericList();
    }
    
    // Yangi data so'rash
    WS.send(wsType, wsData || {}, (msg) => {
        if (!msg.ok) return Toast.error(msg.error);
        STATE[cacheKey] = msg.data;
        app.innerHTML = templateFn(msg.data);
        bindFn();
    });
}
```

### 5.2. Debounce va throttle

```javascript
// Search input larga debounce (300ms)
// Window resize ga throttle
// WS send ga queue (bir vaqtda ko'p request jo'natmaslik)
```

### 5.3. Lazy DOM update

Checklist toggle da to'liq re-render qilmaslik — faqat shu element ni yangilash (optimistic UI allaqachon qilingan).

### 5.4. IntersectionObserver

Uzun list lar uchun — ko'rinmaydigan element larni render qilmaslik (virtual scroll emas, lekin visibility-based):

```javascript
// Agar 50+ ta order/transaction bo'lsa — faqat ko'rinadiganlarni render
// Bu Faza 5+ (kelajak optimization)
```

---

## 6. Backward Compatibility

### 6.1. URL Redirect

```python
# client_erp/urls.py da:
# Eski URL lar ishlashda davom etishi kerak

# Variant 1: SPA catch-all
path('<str:username>/', views.mini_spa, name='mini_spa'),
path('<str:username>/<path:rest>/', views.mini_spa, name='mini_spa_catch'),

# Variant 2: Redirect
# /mini/sardor/orders/ → /mini/sardor/#/orders
# Bu base.html da JS tomonidan qilinadi (App._handleLegacyRedirect)
```

### 6.2. HTTP API endpoints

Mavjud HTTP API (`mini_order_detail`, `mini_order_create`, etc.) saqlash kerak:
- Mobile app yoki boshqa integrations uchun kerak bo'lishi mumkin
- WS handler lar va HTTP views alohida ishlaydi
- Umumiy logikani `services/` papkaga ajratish (DRY)

### 6.3. Admin panel

`/mini/admin/` — admin panel o'zgarmaydi. U alohida base template ishlatadi (`manfacturing/base.html`).

---

## 7. Error Handling

### 7.1. Frontend error boundary

```javascript
// Global error catcher
window.addEventListener('unhandledrejection', (e) => {
    console.error('[App Error]', e.reason);
    Toast.error('Xatolik yuz berdi');
});

// WS handler xatoliklari
WS._handleMessage = function(msg) {
    try {
        // ... existing logic
    } catch (e) {
        console.error('[WS Message Error]', e, msg);
    }
};
```

### 7.2. Backend error handling

```python
# Consumer da har handler try/except bilan:
async def receive_json(self, content):
    handler_name = 'handle_' + content.get('type', '').replace('.', '_')
    handler = getattr(self, handler_name, None)
    if not handler:
        await self._error(content, 'Noma\'lum operatsiya')
        return
    try:
        result = await handler(content.get('data', {}))
        await self._reply(content, **result)
    except Exception as e:
        logger.exception(f"WS handler error: {handler_name}")
        await self._error(content, 'Server xatosi. Qayta urinib ko\'ring.')
```

---

## 8. Edge Cases

### 8.1. Bo'sh holatlar
- Buyurtma yo'q → "Hali buyurtma yo'q" + "Yangi yaratish" tugma
- Mijoz yo'q → "Hali mijoz qo'shilmagan"
- Stage yo'q → "Shablon qo'llash yoki yangi etap qo'shish"
- Transaction yo'q → "Hali tranzaksiya yo'q"
- MebelCity order yo'q → "Telefon raqamingiz bilan MebelCity buyurtma topilmadi"

### 8.2. Permission edge case
- User order ni ko'rayotganda permission olib tashlansa → keyingi WS so'rovda xato → orders list ga redirect
- Worker faqat o'zining stage larini ko'radi (agar stage chegaralangan bo'lsa)

### 8.3. Concurrent editing
- Ikki user bir vaqtda bitta checklist item ni toggle qilsa → oxirgi yutadi (last-write-wins)
- Stage complete bo'lgandan keyin checklist edit qila olmaslik

### 8.4. Katta data
- 100+ order → faqat oxirgi 50 ta ko'rsatish + "Ko'proq yuklash" tugma
- 100+ transaction → pagination (yoki virtual scroll)

---

## 9. Test plan

### 9.1. Funktsional test

| Test | Kutilgan natija |
|------|-----------------|
| WS ulanish | Console da `[WS] Connected` |
| Dashboard render | User card, stats, orders, quests ko'rinadi |
| Clients CRUD | Yaratish, qidirish, o'chirish — reload yo'q |
| Order yaratish | Modal → WS → detail ga navigate |
| Stage CRUD | Qo'shish, checklist, tugatish, o'chirish — reload yo'q |
| Checklist toggle | Optimistic: darhol visual, keyin confirm |
| Kirim/Chiqim | Modal → WS → stats yangilanadi |
| Permission | Qo'shish, o'chirish — reload yo'q |
| Multi-user | 2 ta browser ochib, bitta order da ishlash → real-time sync |
| WS disconnect | Internet o'chirish → offline indicator → reconnect |
| Back/Forward | Browser back/forward → hash navigate |
| Direct URL | `/mini/sardor/orders/5/` → `#/orders/5` redirect |
| Parol o'zgartirish | Modal → WS → success toast |
| MebelCity | Read-only cards ko'rinadi |

### 9.2. Performance test

| Metrika | Maqsad | Test |
|---------|--------|------|
| First paint | < 200ms | Skeleton ko'rinish vaqti |
| WS connect | < 500ms | Console log timestamp |
| Page navigate | < 100ms | Hash o'zgarganda |
| Checkbox toggle | < 50ms | Visual response |
| Dashboard data | < 1s | WS response vaqti |

---

## 10. Deploy checklist

```bash
# 1. Static fayllarni yig'ish
/home/user/mebelcity_platform/platform_venv/bin/python /home/user/mebelcity_platform/manage.py collectstatic --noinput

# 2. Backend restart
sudo systemctl restart bittada-manager

# 3. WebSocket restart
sudo systemctl restart bittada-manager-ws

# 4. Log tekshirish
sudo journalctl -u bittada-manager -n 50 --no-pager
sudo journalctl -u bittada-manager-ws -n 50 --no-pager

# 5. Browser test
# - /mini/<username>/ ochish
# - Console da xato yo'qligini tekshirish
# - WS ulanishini tekshirish
# - Har sahifani test qilish
```

---

## 11. Fayl ro'yxati (butun loyiha)

### Yangi fayllar:
| Fayl | Faza | Tavsif |
|------|------|--------|
| `client_erp/consumers.py` | 1-2 | WS Consumer + 30+ handler |
| `client_erp/routing.py` | 1 | WS URL pattern |
| `client_erp/serializers.py` | 1 | Model → JSON serialization |
| `static/client_erp/js/mini-erp.js` | 3 | SPA Router + WS Client + State |
| `static/client_erp/js/components/modal.js` | 3 | Universal modal |
| `static/client_erp/js/components/toast.js` | 3 | Toast notifications |
| `static/client_erp/js/components/skeleton.js` | 3 | Loading skeletons |
| `static/client_erp/js/components/utils.js` | 3 | Formatting helpers |
| `static/client_erp/js/pages/dashboard.js` | 4 | Dashboard render |
| `static/client_erp/js/pages/clients.js` | 4 | Clients CRUD |
| `static/client_erp/js/pages/orders.js` | 4 | Orders list |
| `static/client_erp/js/pages/order-detail.js` | 4 | Order detail (eng katta) |
| `static/client_erp/js/pages/finance.js` | 4 | Finance page |
| `static/client_erp/js/pages/mebelcity.js` | 4 | MebelCity orders |
| `static/client_erp/js/pages/settings.js` | 4 | Settings/profile |

### O'zgartirilgan fayllar:
| Fayl | Faza | O'zgarish |
|------|------|-----------|
| `config/asgi.py` | 1 | client_erp routing qo'shish |
| `client_erp/middleware.py` | 1 | Token funksiya ajratish |
| `template/client_erp/base.html` | 3 | SPA shell, hash links |
| `static/client_erp/css/base.css` | 3-5 | Skeleton, toast, stage, offline CSS |
| `client_erp/views/dashboard.py` | 3 | mini_spa view |
| `client_erp/urls.py` | 3 | Catch-all SPA pattern |

---

# PROMPT — Faza 5 uchun

```
Sen MebelCity ERP platformasida ishlayapsan. Bu Faza 5 — Real-time Broadcast + Polish.
Faza 1-4 da backend WS consumer + handlers, frontend SPA shell + router + components + page renderers yaratilgan.
Endi barchasini birlashtirish va sifatni oshirish kerak.

## Nima qilish kerak:

### 1. Real-time Broadcast (Backend — consumers.py)
Har order o'zgarishi broadcast yuborilishi kerak:
- `stage.check` → `stage.checked` broadcast
- `stage.complete` → `stage.completed` broadcast  
- `stage.skip`, `stage.delete`, `stage.create` → tegishli broadcast
- `order.update`, `order.income`, `order.expense` → broadcast
- `perm.save`, `perm.delete` → broadcast
- `template.apply` → broadcast
- Broadcast `sender_channel` tekshirish — o'ziga yubormaslik

Order group subscription boshqarish:
- `handle_page_order` da `_subscribe_order(order_id)`
- Boshqa sahifaga o'tganda `_unsubscribe_all_orders()` chaqirish
- `disconnect()` da barcha group lardan chiqish

### 2. Real-time Broadcast (Frontend — mini-erp.js + order-detail.js)
`WS._handleBroadcast(msg)`:
- Agar hozir order detail da bo'lsak → `OrderDetail.handleBroadcast()` chaqirish
- Boshqa sahifada → faqat Toast notification

`OrderDetail.handleBroadcast(action, data, by)`:
- `stage.checked` → faqat shu checklist item ni DOM da yangilash (granular)
- `stage.completed` → stage card ni completed qilish + progress yangilash
- `stage.deleted` → stage card ni fade-out remove
- `order.income/expense` → to'liq re-render
- Boshqa action lar → to'liq re-render
- Har birida Toast notification (`${by} yangiladi`)

### 3. WS Reconnect Polish (mini-erp.js)
- Auth error (4001/4003) → login redirect + toast
- Normal close (1000) → hech narsa
- Unexpected close → reconnect (exponential backoff: 1s, 2s, 4s, ... 30s max, 10 urinish)
- Reconnect muvaffaqiyatli → hozirgi sahifani qayta yuklash
- 10 ta urinishdan keyin → "Sahifani yangilang" toast
- Heartbeat: 30s interval ping (connection sog'ligini tekshirish)

### 4. Request Timeout (mini-erp.js)
WS.send() da 15s timeout:
- Callback 15s ichida javob kelmasa → error callback chaqirish
- `{ok: false, error: 'Server javob bermadi (timeout)'}` 

### 5. Offline/Online UI (base.css)
- `body.ws-offline::before` — tepadagi qizil chiziq (pulsing)
- `body.ws-offline::after` — pastdagi "Ulanish..." badge
- Animations: fadeInUp, offlinePulse

### 6. Error Handling
Frontend:
- `window.addEventListener('unhandledrejection')` — global catch
- WS message parsing error catch
- Toast error for user-facing errors

Backend:
- Har handler da try/except + logger.exception
- User-friendly error messages (server xatosi emas, "Qayta urinib ko'ring")

### 7. Edge Cases
- Bo'sh holatlar: barcha sahifalarda empty state UI
- Permission olib tashlanganda → keyingi so'rovda error → redirect
- Concurrent editing: last-write-wins, broadcast bilan sync
- Completed stage da checklist edit bloklash
- Katta data: pagination (oxirgi 50 ta ko'rsatish)

### 8. Backward Compatibility
- Eski URL lar ishlashi kerak (`/mini/sardor/orders/` → hash redirect)
- HTTP API endpoints saqlanadi
- Admin panel (`/mini/admin/`) o'zgarmaydi
- `App._handleLegacyRedirect()` funksiyasi

### 9. Cache Optimization
- `renderWithCache(cacheKey, ...)` — eski data darhol, keyin yangilash
- Dashboard cache 60s valid (har kirganida yangilash shart emas)
- Order detail — har kirganda yangi data (real-time muhim)

### 10. Deploy va Test
```bash
/home/user/mebelcity_platform/platform_venv/bin/python /home/user/mebelcity_platform/manage.py collectstatic --noinput
sudo systemctl restart bittada-manager
sudo systemctl restart bittada-manager-ws
```

Test checklist:
- WS ulanish va reconnect
- Multi-user real-time sync (2 browser)
- Offline indicator
- Barcha CRUD operatsiyalar
- Hash navigation + back/forward
- Eski URL redirect
- Performance: < 200ms first paint

### Muhim:
- Bu OXIRGI faza — barcha narsani birlashtirish va tekshirish
- Hech qanday yangi funksionallik qo'shmaslik — faqat polish va bug fix
- Error log larni tekshirish
- Production da test qilish
```
