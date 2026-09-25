# FAZA 3: SPA Shell + Router + WS Client + Components

**Loyiha:** MebelCity Client ERP → SPA + WebSocket Conversion
**Faza:** 3 / 5
**Muddat:** 1 kun
**Qism:** Frontend (JavaScript / CSS / HTML)
**Bog'liqlik:** Faza 1 va 2 tugagan bo'lishi kerak

---

## 1. Maqsad

SPA framework yaratish — bir martalik sahifa yuklash, keyin barcha navigatsiya va ma'lumotlar JS + WebSocket orqali:
- `mini-erp.js` — main entry (router, WS client, state management)
- `components/` — modal, toast, skeleton, utils
- `base.html` yangilash — SPA shell
- CSS — skeleton animation, page transitions

---

## 2. Fayl strukturasi

```
static/client_erp/js/
├── mini-erp.js          ← Main SPA entry (~300 qator)
└── components/
    ├── modal.js         ← Universal modal (~80 qator)
    ├── toast.js         ← Toast notifications (~60 qator)
    ├── skeleton.js      ← Loading skeletons (~100 qator)
    └── utils.js         ← Formatting, dates, helpers (~80 qator)
```

---

## 3. `mini-erp.js` — Main Entry

### 3.1. State Management

```javascript
const STATE = {
    user: null,           // ClientUser data (server dan keladi)
    currentPage: '',      // Hozirgi sahifa nomi
    dashboard: null,      // Dashboard cache
    clients: [],          // Clients list cache
    orders: [],           // Own orders cache
    sharedOrders: [],     // Shared orders cache
    currentOrder: null,   // Active order detail cache
    finance: null,        // Finance data cache
    mcOrders: [],         // MebelCity orders cache
    templates: [],        // Stage templates cache
    ws: null,             // WebSocket instance
    loading: {},          // Loading flags: {dashboard: true, ...}
    pendingCallbacks: {}, // request_id → callback mapping
    requestCounter: 0,    // Auto-increment request ID
};
```

### 3.2. WebSocket Client Manager

```javascript
const WS = {
    url: null,
    socket: null,
    reconnectAttempts: 0,
    maxReconnect: 10,
    heartbeatInterval: null,
    isConnecting: false,

    init(username) {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.url = `${protocol}//${location.host}/ws/mini/${username}/`;
        this.connect();
    },

    connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;

        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            console.log('[WS] Connected');
            document.body.classList.remove('ws-offline');

            // Heartbeat
            this.heartbeatInterval = setInterval(() => {
                this.send('ping', {});
            }, 30000);

            // Agar sahifa ochiq bo'lsa — data so'rash
            if (STATE.currentPage) {
                Router.navigate(STATE.currentPage, true);
            }
        };

        this.socket.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            this._handleMessage(msg);
        };

        this.socket.onclose = (e) => {
            this.isConnecting = false;
            clearInterval(this.heartbeatInterval);
            document.body.classList.add('ws-offline');

            if (e.code === 4001 || e.code === 4003) {
                // Auth xato — login sahifasiga
                location.href = '/mini/login/';
                return;
            }

            // Reconnect (exponential backoff)
            if (this.reconnectAttempts < this.maxReconnect) {
                const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                this.reconnectAttempts++;
                console.log(`[WS] Reconnect #${this.reconnectAttempts} in ${delay}ms`);
                setTimeout(() => this.connect(), delay);
            }
        };

        this.socket.onerror = () => {
            this.isConnecting = false;
        };
    },

    send(type, data, callback) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            Toast.error('Server bilan aloqa yo\'q');
            return null;
        }

        const requestId = String(++STATE.requestCounter);
        if (callback) {
            STATE.pendingCallbacks[requestId] = callback;
        }

        this.socket.send(JSON.stringify({
            type: type,
            data: data || {},
            request_id: requestId,
        }));

        return requestId;
    },

    _handleMessage(msg) {
        // 1. Response callback (request_id bor)
        if (msg.request_id && STATE.pendingCallbacks[msg.request_id]) {
            const cb = STATE.pendingCallbacks[msg.request_id];
            delete STATE.pendingCallbacks[msg.request_id];
            cb(msg);
            return;
        }

        // 2. Broadcast (boshqa user dan)
        if (msg.type === 'broadcast') {
            this._handleBroadcast(msg);
            return;
        }

        // 3. XP notification
        if (msg.type === 'xp.awarded') {
            Toast.xp(msg.data.xp, msg.data.coins);
            return;
        }
    },

    _handleBroadcast(msg) {
        const action = msg.action;
        const data = msg.data;
        const by = msg.by;

        // Order detail da bo'lsa — real-time yangilash
        if (STATE.currentPage.startsWith('/orders/') && STATE.currentOrder) {
            if (typeof OrderDetail !== 'undefined' && OrderDetail.handleBroadcast) {
                OrderDetail.handleBroadcast(action, data, by);
            }
        }

        Toast.info(`${by}: ${action}`);
    },
};
```

### 3.3. Router (Hash-based)

```javascript
const Router = {
    routes: {},

    init() {
        // Route registratsiya
        this.routes = {
            '/':            () => Dashboard.render(),
            '/clients':     () => Clients.render(),
            '/orders':      () => Orders.render(),
            '/orders/:id':  (params) => OrderDetail.render(params.id),
            '/finance':     () => Finance.render(),
            '/mebelcity':   () => MebelCity.render(),
            '/settings':    () => Settings.render(),
        };

        // Hash change listener
        window.addEventListener('hashchange', () => this._onHashChange());

        // Initial route
        this._onHashChange();
    },

    _onHashChange() {
        const hash = location.hash.slice(1) || '/';
        this.navigate(hash);
    },

    navigate(path, force) {
        if (!force && path === STATE.currentPage) return;

        // Route matching
        let handler = null;
        let params = {};

        for (const [pattern, fn] of Object.entries(this.routes)) {
            const match = this._matchRoute(pattern, path);
            if (match) {
                handler = fn;
                params = match;
                break;
            }
        }

        if (!handler) {
            handler = this.routes['/'];
        }

        STATE.currentPage = path;
        this._updateNav(path);
        
        // Page transition
        const app = document.getElementById('app');
        app.classList.add('page-exit');
        
        requestAnimationFrame(() => {
            handler(params);
            app.classList.remove('page-exit');
            app.classList.add('page-enter');
            setTimeout(() => app.classList.remove('page-enter'), 200);
        });
    },

    _matchRoute(pattern, path) {
        // Simple pattern matching: /orders/:id → /orders/5
        const patternParts = pattern.split('/');
        const pathParts = path.split('/');

        if (patternParts.length !== pathParts.length) return null;

        const params = {};
        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i].startsWith(':')) {
                params[patternParts[i].slice(1)] = pathParts[i];
            } else if (patternParts[i] !== pathParts[i]) {
                return null;
            }
        }
        return params;
    },

    _updateNav(path) {
        // Sidebar + bottom nav active state
        document.querySelectorAll('[data-page]').forEach(el => {
            const page = el.dataset.page;
            const isActive = path === page || path.startsWith(page + '/');
            el.classList.toggle('active', isActive);
        });
    },

    go(path) {
        location.hash = '#' + path;
    },
};
```

### 3.4. App Init

```javascript
const App = {
    init() {
        // User data (base.html dan inline script orqali)
        STATE.user = window.__USER_DATA__ || {};

        // WS ulash
        WS.init(STATE.user.username);

        // Router boshlash
        Router.init();

        // Legacy URL redirect (agar to'g'ridan-to'g'ri URL ochilsa)
        this._handleLegacyRedirect();
    },

    _handleLegacyRedirect() {
        // /mini/sardor/orders/ → #/orders
        // /mini/sardor/orders/5/ → #/orders/5
        const path = location.pathname;
        const username = STATE.user.username;
        const prefix = `/mini/${username}/`;

        if (path.startsWith(prefix) && path !== prefix) {
            const subpath = path.slice(prefix.length).replace(/\/$/, '');
            if (subpath) {
                location.hash = '#/' + subpath;
            }
        }
    },
};

// DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
```

---

## 4. Components

### 4.1. `components/modal.js`

```javascript
const Modal = {
    _overlay: null,
    _onClose: null,

    open(title, bodyHtml, options = {}) {
        this.close(); // Avvalgi modal yopish

        const overlay = document.createElement('div');
        overlay.className = 'ce-modal-overlay';
        overlay.innerHTML = `
            <div class="ce-modal ${options.size || ''}">
                <div class="ce-modal-header">
                    <h3>${title}</h3>
                    <button class="ce-modal-close" onclick="Modal.close()">&times;</button>
                </div>
                <div class="ce-modal-body">
                    ${bodyHtml}
                </div>
                ${options.footer ? `<div class="ce-modal-footer">${options.footer}</div>` : ''}
            </div>
        `;

        // Backdrop click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) Modal.close();
        });

        document.body.appendChild(overlay);
        this._overlay = overlay;
        this._onClose = options.onClose || null;

        // Focus first input
        requestAnimationFrame(() => {
            const input = overlay.querySelector('input, textarea, select');
            if (input) input.focus();
        });
    },

    close() {
        if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
            if (this._onClose) this._onClose();
            this._onClose = null;
        }
    },

    confirm(title, message, onConfirm) {
        this.open(title, `
            <p>${message}</p>
        `, {
            footer: `
                <button class="ce-btn ce-btn-secondary" onclick="Modal.close()">Bekor</button>
                <button class="ce-btn ce-btn-primary" id="modal-confirm-btn">Tasdiqlash</button>
            `,
        });
        document.getElementById('modal-confirm-btn').onclick = () => {
            Modal.close();
            onConfirm();
        };
    },

    getFormData() {
        if (!this._overlay) return {};
        const form = this._overlay.querySelector('form') || this._overlay;
        const data = {};
        form.querySelectorAll('[name]').forEach(el => {
            if (el.type === 'checkbox') {
                data[el.name] = el.checked;
            } else if (el.type === 'radio') {
                if (el.checked) data[el.name] = el.value;
            } else {
                data[el.name] = el.value;
            }
        });
        return data;
    },
};
```

### 4.2. `components/toast.js`

```javascript
const Toast = {
    _container: null,

    _getContainer() {
        if (!this._container) {
            this._container = document.createElement('div');
            this._container.className = 'ce-toast-container';
            document.body.appendChild(this._container);
        }
        return this._container;
    },

    show(message, type = 'info', duration = 3000) {
        const container = this._getContainer();
        const toast = document.createElement('div');
        toast.className = `ce-toast ce-toast-${type}`;

        const icons = {
            success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️', xp: '⭐',
        };

        toast.innerHTML = `
            <span class="ce-toast-icon">${icons[type] || ''}</span>
            <span class="ce-toast-msg">${message}</span>
        `;

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => toast.classList.add('ce-toast-show'));

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('ce-toast-show');
            toast.classList.add('ce-toast-hide');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error', 5000); },
    info(msg) { this.show(msg, 'info'); },
    warning(msg) { this.show(msg, 'warning', 4000); },

    xp(xp, coins) {
        let msg = '';
        if (xp > 0) msg += `+${xp} XP`;
        if (coins > 0) msg += (msg ? ' | ' : '') + `+${coins} tanga`;
        if (msg) this.show(msg, 'xp', 4000);
    },
};
```

### 4.3. `components/skeleton.js`

```javascript
const Skeleton = {
    // Umumiy skeleton block
    block(height, width = '100%', radius = '10px') {
        return `<div class="sk-block" style="height:${height};width:${width};border-radius:${radius}"></div>`;
    },

    // Dashboard skeleton
    dashboard() {
        return `
            <div class="page-enter">
                <!-- User card -->
                <div class="ce-card" style="padding:16px;margin-bottom:16px">
                    <div style="display:flex;align-items:center;gap:12px">
                        ${this.block('48px', '48px', '50%')}
                        <div style="flex:1">
                            ${this.block('16px', '40%')}
                            <div style="height:6px"></div>
                            ${this.block('12px', '25%')}
                        </div>
                    </div>
                    <div style="height:12px"></div>
                    ${this.block('8px', '100%')}
                </div>

                <!-- Quick actions -->
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
                    ${this.block('70px')}${this.block('70px')}${this.block('70px')}
                </div>

                <!-- Orders -->
                ${this.block('14px', '30%')}
                <div style="height:10px"></div>
                ${[1,2,3].map(() => this.block('80px', '100%', '14px') + '<div style="height:8px"></div>').join('')}
            </div>
        `;
    },

    // Orders list skeleton
    ordersList() {
        return `
            <div class="page-enter">
                ${this.block('18px', '35%')}
                <div style="height:12px"></div>
                ${[1,2,3,4,5].map(() => this.block('90px', '100%', '14px') + '<div style="height:8px"></div>').join('')}
            </div>
        `;
    },

    // Order detail skeleton
    orderDetail() {
        return `
            <div class="page-enter">
                ${this.block('22px', '50%')}
                <div style="height:10px"></div>
                ${this.block('8px', '100%')}
                <div style="height:16px"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
                    ${this.block('60px')}${this.block('60px')}
                    ${this.block('60px')}${this.block('60px')}
                </div>
                ${[1,2,3].map(() => this.block('65px', '100%', '14px') + '<div style="height:8px"></div>').join('')}
            </div>
        `;
    },

    // Clients list skeleton
    clientsList() {
        return `
            <div class="page-enter">
                ${this.block('18px', '30%')}
                <div style="height:12px"></div>
                ${[1,2,3,4].map(() => `
                    <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">
                        ${this.block('42px', '42px', '50%')}
                        <div style="flex:1">
                            ${this.block('14px', '50%')}
                            <div style="height:6px"></div>
                            ${this.block('12px', '35%')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    // Finance skeleton
    finance() {
        return `
            <div class="page-enter">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
                    ${this.block('50px')}${this.block('50px')}
                    ${this.block('50px')}${this.block('50px')}
                </div>
                ${this.block('18px', '25%')}
                <div style="height:10px"></div>
                ${[1,2,3,4,5].map(() => this.block('55px', '100%', '10px') + '<div style="height:6px"></div>').join('')}
            </div>
        `;
    },

    // Generic list
    genericList(count = 4) {
        return `
            <div class="page-enter">
                ${this.block('18px', '30%')}
                <div style="height:12px"></div>
                ${Array(count).fill(0).map(() => this.block('70px', '100%', '14px') + '<div style="height:8px"></div>').join('')}
            </div>
        `;
    },
};
```

### 4.4. `components/utils.js`

```javascript
const Utils = {
    // Pul formatlash: 1234567 → "1 234 567"
    money(val) {
        const num = parseInt(val) || 0;
        return num.toLocaleString('ru-RU');
    },

    // Sana formatlash: ISO → "20.05.2026"
    date(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        return d.toLocaleDateString('ru-RU');
    },

    // Sana + vaqt: ISO → "20.05.2026 14:30"
    datetime(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
    },

    // Vaqt farqi: "2 soat oldin", "3 kun oldin"
    timeAgo(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const now = new Date();
        const diff = Math.floor((now - d) / 1000);

        if (diff < 60) return 'hozirgina';
        if (diff < 3600) return Math.floor(diff / 60) + ' min oldin';
        if (diff < 86400) return Math.floor(diff / 3600) + ' soat oldin';
        if (diff < 604800) return Math.floor(diff / 86400) + ' kun oldin';
        return this.date(isoStr);
    },

    // Debounce
    debounce(fn, delay = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    },

    // Status badge HTML
    statusBadge(status) {
        const map = {
            'new':       {label: 'Yangi',     cls: 'ce-badge-new'},
            'progress':  {label: 'Jarayonda', cls: 'ce-badge-progress'},
            'ready':     {label: 'Tayyor',    cls: 'ce-badge-ready'},
            'completed': {label: 'Tugallangan', cls: 'ce-badge-ready'},
            'cancelled': {label: 'Bekor',     cls: 'ce-badge-danger'},
            'pending':   {label: 'Kutilmoqda', cls: 'ce-badge-new'},
            'active':    {label: 'Faol',      cls: 'ce-badge-progress'},
            'skipped':   {label: 'O\'tkazildi', cls: 'ce-badge-danger'},
        };
        const s = map[status] || {label: status, cls: ''};
        return `<span class="ce-badge ${s.cls}">${s.label}</span>`;
    },

    // Initials: "Sardor Aliyev" → "SA"
    initials(name) {
        if (!name) return '?';
        return name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
    },

    // Escape HTML (XSS himoya)
    esc(str) {
        if (!str) return '';
        const el = document.createElement('span');
        el.textContent = str;
        return el.innerHTML;
    },

    // Progress bar HTML
    progressBar(percent) {
        const p = Math.min(100, Math.max(0, parseInt(percent) || 0));
        const color = p === 100 ? 'var(--accent)' : (p > 50 ? '#f59e0b' : 'var(--secondary)');
        return `
            <div class="ce-progress">
                <div class="ce-progress-bar" style="width:${p}%;background:${color}"></div>
            </div>
        `;
    },

    // Safe text (textContent emas innerHTML)
    safeHtml(template, data) {
        return template;
    },
};
```

---

## 5. `base.html` Yangilash

### 5.1. Hozirgi holatdan farq

**Eski:**
- Har sahifa `{% extends "client_erp/base.html" %}` + `{% block content %}`
- Sidebar linklari Django URL lar
- `{% block content %}` ichida server-rendered HTML

**Yangi:**
- `base.html` — SPA shell. `<div id="app"></div>` bo'sh container
- Sidebar linklari hash: `href="#/orders"` + `data-page="/orders"`
- Content JS tomonidan render qilinadi
- Barcha page JS lar `<script>` bilan yuklanadi

### 5.2. O'zgarishlar

```html
<!-- base.html dagi sidebar linklari -->
<!-- Eski: <a href="/mini/{{ user.username }}/" ... -->
<!-- Yangi: -->
<a href="#/" data-page="/" class="ce-nav-link">
    <i class="fas fa-home"></i><span>Bosh sahifa</span>
</a>
<a href="#/clients" data-page="/clients" class="ce-nav-link">
    <i class="fas fa-users"></i><span>Mijozlarim</span>
</a>
<a href="#/orders" data-page="/orders" class="ce-nav-link">
    <i class="fas fa-box"></i><span>Buyurtmalar</span>
</a>
<a href="#/finance" data-page="/finance" class="ce-nav-link">
    <i class="fas fa-wallet"></i><span>Moliya</span>
</a>
<a href="#/mebelcity" data-page="/mebelcity" class="ce-nav-link">
    <i class="fas fa-industry"></i><span>MebelCity</span>
</a>
<a href="#/settings" data-page="/settings" class="ce-nav-link">
    <i class="fas fa-cog"></i><span>Sozlamalar</span>
</a>

<!-- Bottom nav ham o'xshash -->
<a href="#/" data-page="/" class="ce-bnav-item">
    <i class="fas fa-home"></i><span>Bosh</span>
</a>
<!-- ... -->

<!-- Content area -->
<main class="ce-main">
    <div id="app"></div>
</main>

<!-- User data (JS uchun) -->
<script>
    window.__USER_DATA__ = {
        id: {{ user.pk }},
        username: '{{ user.username }}',
        full_name: '{{ user.full_name|escapejs }}',
        phone: '{{ user.phone|escapejs }}',
    };
</script>

<!-- JS fayllar -->
<script src="{% static 'client_erp/js/components/utils.js' %}"></script>
<script src="{% static 'client_erp/js/components/skeleton.js' %}"></script>
<script src="{% static 'client_erp/js/components/toast.js' %}"></script>
<script src="{% static 'client_erp/js/components/modal.js' %}"></script>
<!-- Page renderers — Faza 4 da qo'shiladi -->
<script src="{% static 'client_erp/js/pages/dashboard.js' %}"></script>
<script src="{% static 'client_erp/js/pages/clients.js' %}"></script>
<script src="{% static 'client_erp/js/pages/orders.js' %}"></script>
<script src="{% static 'client_erp/js/pages/order-detail.js' %}"></script>
<script src="{% static 'client_erp/js/pages/finance.js' %}"></script>
<script src="{% static 'client_erp/js/pages/mebelcity.js' %}"></script>
<script src="{% static 'client_erp/js/pages/settings.js' %}"></script>
<!-- Main entry — eng oxirida -->
<script src="{% static 'client_erp/js/mini-erp.js' %}"></script>
```

### 5.3. Django View o'zgarishi

`client_erp/views/dashboard.py` (yoki yangi `spa.py`):
```python
@client_login_required
def mini_spa(request, username):
    """SPA shell — bitta HTML, keyin JS render."""
    return render(request, 'client_erp/base.html', {
        'user': request.client_user,
        'spa_mode': True,
    })
```

`client_erp/urls.py` — bitta catch-all pattern:
```python
# SPA shell — barcha /mini/<username>/* URL lar
path('<str:username>/', views.mini_spa, name='mini_spa'),
path('<str:username>/<path:rest>/', views.mini_spa, name='mini_spa_catch'),
```

> **Muhim:** Eski URL patternlar ham qoladi (backward compatibility). `/mini/<username>/orders/` ochilsa → base.html render → JS hash redirect qiladi.

---

## 6. CSS Qo'shimchalar

`static/client_erp/css/base.css` ga qo'shish:

```css
/* ═══ SKELETON ═══ */
.sk-block {
    background: linear-gradient(90deg, var(--border) 25%, var(--surface2, #f0f0f0) 50%, var(--border) 75%);
    background-size: 200% 100%;
    animation: sk-shimmer 1.5s ease-in-out infinite;
    border-radius: 10px;
}
@keyframes sk-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

/* ═══ PAGE TRANSITIONS ═══ */
#app { min-height: 50vh; }
.page-enter {
    animation: pageIn .2s ease-out;
}
.page-exit {
    opacity: .5;
    pointer-events: none;
}
@keyframes pageIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: none; }
}

/* ═══ TOAST ═══ */
.ce-toast-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
}
.ce-toast {
    background: var(--card-bg, #fff);
    border-radius: 12px;
    padding: 10px 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    transform: translateX(120%);
    transition: transform .3s ease, opacity .3s;
    pointer-events: auto;
    max-width: 320px;
}
.ce-toast-show { transform: translateX(0); }
.ce-toast-hide { transform: translateX(120%); opacity: 0; }
.ce-toast-success { border-left: 4px solid var(--accent); }
.ce-toast-error   { border-left: 4px solid var(--danger); }
.ce-toast-info    { border-left: 4px solid var(--secondary); }
.ce-toast-warning { border-left: 4px solid var(--warning); }
.ce-toast-xp      { border-left: 4px solid #f59e0b; background: linear-gradient(135deg, #fffbeb, #fff); }

/* ═══ PROGRESS BAR ═══ */
.ce-progress {
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
}
.ce-progress-bar {
    height: 100%;
    border-radius: 3px;
    transition: width .3s ease;
}

/* ═══ OFFLINE INDICATOR ═══ */
body.ws-offline::after {
    content: '⚡ Server bilan aloqa yo\'q...';
    position: fixed;
    bottom: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--danger);
    color: #fff;
    padding: 8px 20px;
    border-radius: 20px;
    font-size: 13px;
    z-index: 9999;
    animation: fadeIn .3s;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* ═══ EMPTY STATE ═══ */
.ce-empty {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-muted, #888);
}
.ce-empty-icon { font-size: 40px; margin-bottom: 12px; }
.ce-empty p { font-size: 14px; }

/* ═══ MODAL IMPROVEMENTS ═══ */
.ce-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    backdrop-filter: blur(4px);
    z-index: 5000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn .15s;
}
.ce-modal {
    background: var(--card-bg, #fff);
    border-radius: 18px;
    width: 100%;
    max-width: 440px;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    animation: modalIn .2s ease-out;
}
@keyframes modalIn { from { transform: scale(.95); opacity: 0; } to { transform: none; opacity: 1; } }
.ce-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
}
.ce-modal-header h3 { font-size: 16px; margin: 0; }
.ce-modal-close {
    background: none;
    border: none;
    font-size: 22px;
    cursor: pointer;
    color: var(--text-muted, #888);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
}
.ce-modal-close:hover { background: var(--border); }
.ce-modal-body { padding: 16px 20px; }
.ce-modal-footer {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    padding: 12px 20px;
    border-top: 1px solid var(--border);
}

/* Mobile toast */
@media (max-width: 767px) {
    .ce-toast-container {
        top: auto;
        bottom: 80px;
        right: 10px;
        left: 10px;
    }
    .ce-toast { max-width: 100%; }
}
```

---

## 7. Fayl ro'yxati

| Fayl | Holat | Tavsif |
|------|-------|--------|
| `static/client_erp/js/mini-erp.js` | YANGI | Router + WS client + State + App init (~300 qator) |
| `static/client_erp/js/components/modal.js` | YANGI | Universal modal (~80 qator) |
| `static/client_erp/js/components/toast.js` | YANGI | Toast notifications (~60 qator) |
| `static/client_erp/js/components/skeleton.js` | YANGI | Loading skeletons (~100 qator) |
| `static/client_erp/js/components/utils.js` | YANGI | Formatting helpers (~80 qator) |
| `template/client_erp/base.html` | O'ZGARTIRISH | SPA shell, hash links, JS yuklash |
| `static/client_erp/css/base.css` | O'ZGARTIRISH | Skeleton, toast, transition CSS |
| `client_erp/views/dashboard.py` | O'ZGARTIRISH | mini_spa view qo'shish |
| `client_erp/urls.py` | O'ZGARTIRISH | catch-all SPA pattern |

---

## 8. Tekshirish

1. `/mini/<username>/` ochilganda base.html + bo'sh `#app` ko'rinishi kerak
2. WS ulanishi (`[WS] Connected` console da)
3. Hash o'zgarganda (`#/orders`) — skeleton ko'rinishi kerak
4. Toast test: console da `Toast.success('Ishlayapti!')` 
5. Modal test: `Modal.open('Test', '<p>Hello</p>')`
6. Offline: WS ulanish uzilganda pastda offline indicator ko'rinishi kerak

### Deploy:
```bash
/home/user/mebelcity_platform/platform_venv/bin/python /home/user/mebelcity_platform/manage.py collectstatic --noinput
sudo systemctl restart bittada-manager
sudo systemctl restart bittada-manager-ws
```

---

# PROMPT — Faza 3 uchun

```
Sen MebelCity ERP platformasida ishlayapsan. Bu Faza 3 — SPA Shell + Router + WS Client + Components (Frontend).
Faza 1-2 da backend WebSocket consumer va handler lar yaratilgan. Endi frontend qismini yaratish kerak.

## Nima qilish kerak:

### 1. `static/client_erp/js/mini-erp.js` — Main SPA entry
Tarkibi:
- **STATE** — global state object (user, currentPage, orders, clients, finance, ws, loading, pendingCallbacks)
- **WS** — WebSocket manager:
  - `init(username)` — WSS URL yaratish, connect
  - `connect()` — WebSocket ochish, onopen/onclose/onmessage/onerror
  - `send(type, data, callback)` — message yuborish, request_id auto-generate, callback saqlash
  - `_handleMessage(msg)` — response dispatch: callback / broadcast / xp.awarded
  - `_handleBroadcast(msg)` — real-time update (OrderDetail.handleBroadcast chaqirish)
  - Auto-reconnect: exponential backoff (1s, 2s, 4s, ... 30s max), 10 ta urinish
  - Heartbeat: 30s interval ping
  - Auth error (4001/4003) → login redirect
  - Offline class: `body.ws-offline`
- **Router** — hash-based routing:
  - `routes` object: pattern → handler mapping
  - `init()` — hashchange listener + initial route
  - `navigate(path, force)` — route match, page transition animation, handler chaqirish
  - `_matchRoute(pattern, path)` — simple param matching (:id)
  - `_updateNav(path)` — sidebar/bottom nav active state (`data-page` attribute)
  - `go(path)` — programmatic navigation
- **App** — init:
  - `window.__USER_DATA__` dan user olish
  - WS init
  - Router init
  - Legacy URL redirect (`/mini/sardor/orders/` → `#/orders`)

### 2. `static/client_erp/js/components/utils.js`
- `Utils.money(val)` — "1 234 567" format
- `Utils.date(iso)` — "20.05.2026"
- `Utils.datetime(iso)` — "20.05.2026 14:30"
- `Utils.timeAgo(iso)` — "2 soat oldin"
- `Utils.debounce(fn, delay)` — debounce helper
- `Utils.statusBadge(status)` — status → badge HTML
- `Utils.initials(name)` — "Sardor Aliyev" → "SA"
- `Utils.esc(str)` — XSS escape (textContent trick)
- `Utils.progressBar(percent)` — progress bar HTML
- `Utils.money` — raqamlarni formatlash

### 3. `static/client_erp/js/components/skeleton.js`
Skeleton shimmer placeholder lar — har sahifa uchun alohida:
- `Skeleton.block(height, width, radius)` — universal block
- `Skeleton.dashboard()` — user card + actions + orders
- `Skeleton.ordersList()` — 5 ta card
- `Skeleton.orderDetail()` — header + progress + stats + stages
- `Skeleton.clientsList()` — 4 ta avatar + name
- `Skeleton.finance()` — stats grid + transactions
- `Skeleton.genericList(count)` — universal list

### 4. `static/client_erp/js/components/toast.js`
- `Toast.show(msg, type, duration)` — toast yaratish + auto-remove
- `Toast.success/error/info/warning(msg)` — shortcut lar
- `Toast.xp(xp, coins)` — XP/tanga notification (maxsus stil)
- Container: fixed position, z-index: 10000
- Animation: slide-in from right → auto fade-out

### 5. `static/client_erp/js/components/modal.js`
- `Modal.open(title, bodyHtml, options)` — modal ochish
- `Modal.close()` — yopish (backdrop click ham)
- `Modal.confirm(title, msg, onConfirm)` — tasdiqlash dialog
- `Modal.getFormData()` — modal ichidagi form data yig'ish
- Options: size, footer HTML, onClose callback

### 6. `template/client_erp/base.html` yangilash
- Sidebar linklari: `href="#/orders"` + `data-page="/orders"` formatga o'tkazish
- Bottom nav ham o'xshash
- `{% block content %}` → `<div id="app"></div>`
- `<script>window.__USER_DATA__ = {...}</script>` — inline user data
- Barcha JS fayllarni `<script src="{% static '...' %}">` bilan yuklash
- `{% if spa_mode %}` shart bilan eski template logikani o'chirish

### 7. `static/client_erp/css/base.css` ga qo'shish
- `.sk-block` — skeleton shimmer animation
- `#app` transitions — `.page-enter`, `.page-exit`
- `.ce-toast-*` — toast stillar
- `.ce-progress` — progress bar
- `body.ws-offline::after` — offline indicator
- `.ce-empty` — bo'sh holat
- `.ce-modal-*` — modal stillar (yangilangan)
- Mobile responsive (`@media max-width: 767px`)

### 8. Backend o'zgartishlar
- `client_erp/views/` da `mini_spa` view qo'shish — SPA shell render
- `client_erp/urls.py` da catch-all pattern qo'shish

## Muhim qoidalar:
- Vanilla JS — React/Vue ISHLATILMASIN
- Template literals bilan HTML render
- XSS himoya: user data uchun `Utils.esc()` ishlatish, innerHTML ga user text QOYMASLIK
- Barcha state `STATE` object da saqlash
- WS callback: `send(type, data, callback)` — callback `msg` oladi
- Skeleton: har sahifa uchun maxsus, shimmer animation
- Mobile first: 767px breakpoint
- Font Awesome 5+ icons ishlatish

## Tekshirish:
1. Sahifa ochilganda WS ulanishi
2. Hash navigatsiya ishlashi
3. Skeleton ko'rinishi
4. Toast va Modal ishlashi
5. Offline indicator

## Deploy:
collectstatic + restart bittada-manager + restart bittada-manager-ws
```
