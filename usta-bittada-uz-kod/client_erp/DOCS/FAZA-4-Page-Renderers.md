# FAZA 4: Page Renderers — 7 ta Sahifa JS Render

**Loyiha:** MebelCity Client ERP → SPA + WebSocket Conversion
**Faza:** 4 / 5
**Muddat:** 2 kun
**Qism:** Frontend (JavaScript)
**Bog'liqlik:** Faza 1, 2, 3 tugagan bo'lishi kerak

---

## 1. Maqsad

Barcha 7 ta sahifani JS template literal bilan render qilish. Har sahifa:
- Skeleton ko'rsatish → WS orqali data so'rash → HTML render → Event bind
- Optimistic UI (checkbox, toggle — darhol visual, keyin server confirm)
- Modal form lar (yaratish/tahrirlash)
- STATE cache ishlatish (tez navigatsiya)

---

## 2. Umumiy render pattern

```javascript
const PageName = {
    render() {
        const app = document.getElementById('app');
        
        // 1. Skeleton
        app.innerHTML = Skeleton.pageNameSkeleton();
        
        // 2. Cache mavjud bo'lsa — darhol render
        if (STATE.cachedData) {
            app.innerHTML = this.template(STATE.cachedData);
            this.bind();
        }
        
        // 3. WS dan yangi data
        WS.send('page.name', {}, (msg) => {
            if (!msg.ok) {
                Toast.error(msg.error);
                return;
            }
            STATE.cachedData = msg.data;
            app.innerHTML = this.template(msg.data);
            this.bind();
        });
    },
    
    template(data) {
        return `<div class="page-enter">...</div>`;
    },
    
    bind() {
        // Event listeners
    },
};
```

---

## 3. Sahifalar

### 3.1. `pages/dashboard.js` — Dashboard (~200 qator)

```javascript
const Dashboard = {
    render() {
        const app = document.getElementById('app');
        app.innerHTML = Skeleton.dashboard();

        WS.send('page.dashboard', {}, (msg) => {
            if (!msg.ok) return Toast.error(msg.error);
            STATE.dashboard = msg.data;
            STATE.user = msg.data.user;
            app.innerHTML = this.template(msg.data);
            this.bind();
        });
    },

    template(d) {
        const u = d.user;
        const s = d.stats;
        const level = u.vip_level;

        return `
        <div class="page-enter">
            <!-- User Card -->
            <div class="ce-card" style="padding:16px;margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:12px">
                    <div class="ce-avatar" style="width:48px;height:48px;font-size:18px;
                        background:${level ? level.color : 'var(--secondary)'};color:#fff;
                        border-radius:50%;display:flex;align-items:center;justify-content:center">
                        ${level ? Utils.esc(level.icon) : Utils.initials(u.full_name)}
                    </div>
                    <div style="flex:1">
                        <div style="font-weight:600;font-size:16px">${Utils.esc(u.full_name)}</div>
                        <div style="font-size:12px;color:var(--text-muted)">
                            ${level ? Utils.esc(level.name) : 'Yangi foydalanuvchi'}
                            · ${u.xp} XP · ${u.coins} tanga
                        </div>
                    </div>
                </div>
                ${level ? `
                <div style="margin-top:10px">
                    ${Utils.progressBar(Math.min(100, Math.floor(u.xp / 10)))}
                </div>` : ''}
            </div>

            <!-- Quick Actions -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
                <a href="#/orders" class="ce-card" style="padding:14px;text-align:center;text-decoration:none;color:inherit">
                    <div style="font-size:22px">📦</div>
                    <div style="font-size:12px;margin-top:4px">Buyurtmalar</div>
                    <div style="font-weight:700;font-size:18px;color:var(--accent)">${s.active_orders}</div>
                </a>
                <a href="#/mebelcity" class="ce-card" style="padding:14px;text-align:center;text-decoration:none;color:inherit">
                    <div style="font-size:22px">🏭</div>
                    <div style="font-size:12px;margin-top:4px">MebelCity</div>
                </a>
                <a href="#/clients" class="ce-card" style="padding:14px;text-align:center;text-decoration:none;color:inherit">
                    <div style="font-size:22px">👥</div>
                    <div style="font-size:12px;margin-top:4px">Mijozlar</div>
                    <div style="font-weight:700;font-size:18px;color:var(--secondary)">${s.customers_count}</div>
                </a>
            </div>

            <!-- Stats -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
                <div class="ce-card" style="padding:12px">
                    <div style="font-size:11px;color:var(--text-muted)">Kirim</div>
                    <div style="font-weight:700;color:var(--accent)">${Utils.money(s.total_income)}</div>
                </div>
                <div class="ce-card" style="padding:12px">
                    <div style="font-size:11px;color:var(--text-muted)">Foyda</div>
                    <div style="font-weight:700;color:${parseInt(s.profit) >= 0 ? 'var(--accent)' : 'var(--danger)'}">${Utils.money(s.profit)}</div>
                </div>
            </div>

            <!-- Daily Quests -->
            ${d.daily_quests.length > 0 ? `
            <h3 style="font-size:15px;margin:0 0 10px">📋 Kunlik topshiriqlar</h3>
            ${d.daily_quests.map(q => `
                <div class="ce-card" style="padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:10px;
                    ${q.is_completed ? 'opacity:.6' : ''}">
                    <span style="font-size:20px">${Utils.esc(q.icon)}</span>
                    <div style="flex:1">
                        <div style="font-size:13px;font-weight:500">${Utils.esc(q.title)}</div>
                        <div style="font-size:11px;color:var(--text-muted)">
                            ${q.progress}/${q.action_count}
                            ${q.xp_reward ? ` · +${q.xp_reward} XP` : ''}
                        </div>
                        ${Utils.progressBar(Math.floor(q.progress / q.action_count * 100))}
                    </div>
                    ${q.is_completed ? '<span style="color:var(--accent)">✅</span>' : ''}
                </div>
            `).join('')}` : ''}

            <!-- Active Orders -->
            ${d.active_orders.length > 0 ? `
            <h3 style="font-size:15px;margin:16px 0 10px">📦 Faol buyurtmalar</h3>
            ${d.active_orders.map(o => this._orderCard(o)).join('')}` : ''}

            <!-- Shared Tasks -->
            ${d.shared_tasks.length > 0 ? `
            <h3 style="font-size:15px;margin:16px 0 10px">🤝 Vazifalarim</h3>
            ${d.shared_tasks.map(t => `
                <a href="#/orders/${t.order.id}" class="ce-card" style="padding:12px;margin-bottom:8px;text-decoration:none;color:inherit;display:block">
                    <div style="font-size:13px;font-weight:500">${Utils.esc(t.order.title)}</div>
                    <div style="font-size:11px;color:var(--text-muted)">
                        ${Utils.esc(t.role)} · 
                        ${t.active_stages.map(s => s.icon + ' ' + Utils.esc(s.title)).join(', ')}
                    </div>
                </a>
            `).join('')}` : ''}

            <!-- Announcements -->
            ${d.announcements.length > 0 ? `
            <h3 style="font-size:15px;margin:16px 0 10px">📢 E'lonlar</h3>
            ${d.announcements.map(a => `
                <div class="ce-card" style="padding:12px;margin-bottom:8px">
                    <div style="display:flex;justify-content:space-between;align-items:start">
                        <div style="font-size:13px;font-weight:500">${Utils.esc(a.title)}</div>
                        ${Utils.statusBadge(a.type)}
                    </div>
                    <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${Utils.esc(a.body).substring(0, 100)}</div>
                    ${a.discount_percent ? `<div style="font-size:13px;font-weight:600;color:var(--accent);margin-top:4px">-${a.discount_percent}%</div>` : ''}
                </div>
            `).join('')}` : ''}
        </div>
        `;
    },

    _orderCard(o) {
        return `
        <a href="#/orders/${o.id}" class="ce-card" style="padding:12px;margin-bottom:8px;text-decoration:none;color:inherit;display:block">
            <div style="display:flex;justify-content:space-between;align-items:start">
                <div style="font-size:13px;font-weight:500">${Utils.esc(o.title)}</div>
                ${Utils.statusBadge(o.status)}
            </div>
            ${o.customer_name ? `<div style="font-size:11px;color:var(--text-muted)">${Utils.esc(o.customer_name)}</div>` : ''}
            <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:12px;color:var(--accent)">${Utils.money(o.total_income)} so'm</span>
                <span style="font-size:11px;color:var(--text-muted)">${o.overall_progress}%</span>
            </div>
            ${Utils.progressBar(o.overall_progress)}
        </a>
        `;
    },

    bind() {
        // Dashboard da maxsus event yo'q — link lar hash orqali ishlaydi
    },
};
```

### 3.2. `pages/clients.js` — Clients CRUD (~150 qator)

```javascript
const Clients = {
    render() {
        const app = document.getElementById('app');
        app.innerHTML = Skeleton.clientsList();

        WS.send('page.clients', {}, (msg) => {
            if (!msg.ok) return Toast.error(msg.error);
            STATE.clients = msg.data.clients;
            app.innerHTML = this.template(STATE.clients);
            this.bind();
        });
    },

    template(clients) {
        return `
        <div class="page-enter">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                <h2 style="font-size:18px;margin:0">Mijozlarim</h2>
                <button class="ce-btn ce-btn-primary" id="btn-add-client" style="font-size:13px;padding:8px 16px">
                    <i class="fas fa-plus"></i> Qo'shish
                </button>
            </div>

            <input type="text" id="client-search" class="ce-input" placeholder="Qidirish..."
                style="width:100%;margin-bottom:12px;font-size:14px">

            <div id="clients-list">
                ${clients.length === 0 ? `
                    <div class="ce-empty">
                        <div class="ce-empty-icon">👥</div>
                        <p>Hali mijoz qo'shilmagan</p>
                    </div>
                ` : clients.map(c => this._clientCard(c)).join('')}
            </div>
        </div>
        `;
    },

    _clientCard(c) {
        return `
        <div class="ce-card client-card" data-id="${c.id}" style="padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:12px">
            <div style="width:42px;height:42px;border-radius:50%;background:var(--secondary);color:#fff;
                display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;flex-shrink:0">
                ${Utils.initials(c.name)}
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:500">${Utils.esc(c.name)}</div>
                ${c.phone ? `<div style="font-size:12px;color:var(--text-muted)">${Utils.esc(c.phone)}</div>` : ''}
                ${c.address ? `<div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Utils.esc(c.address)}</div>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
                ${c.phone ? `<a href="tel:${Utils.esc(c.phone)}" class="ce-btn ce-btn-secondary" style="padding:6px 10px;font-size:12px"><i class="fas fa-phone"></i></a>` : ''}
                <button class="ce-btn ce-btn-danger btn-del-client" data-id="${c.id}" style="padding:6px 10px;font-size:12px"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        `;
    },

    bind() {
        // Qo'shish
        document.getElementById('btn-add-client')?.addEventListener('click', () => this.showAddModal());

        // O'chirish
        document.querySelectorAll('.btn-del-client').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                Modal.confirm("O'chirish", "Bu mijozni o'chirasizmi?", () => this.deleteClient(id));
            });
        });

        // Qidirish (local filter)
        const searchInput = document.getElementById('client-search');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce((e) => {
                const q = e.target.value.toLowerCase();
                document.querySelectorAll('.client-card').forEach(card => {
                    const name = card.querySelector('[style*="font-weight:500"]')?.textContent?.toLowerCase() || '';
                    const phone = card.querySelector('[style*="text-muted"]')?.textContent?.toLowerCase() || '';
                    card.style.display = (name.includes(q) || phone.includes(q)) ? '' : 'none';
                });
            }, 200));
        }
    },

    showAddModal() {
        Modal.open("Yangi mijoz", `
            <form id="form-add-client">
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Ism *</label>
                    <input type="text" name="name" class="ce-input" required style="width:100%">
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Telefon</label>
                    <input type="tel" name="phone" class="ce-input" style="width:100%">
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Manzil</label>
                    <input type="text" name="address" class="ce-input" style="width:100%">
                </div>
            </form>
        `, {
            footer: `<button class="ce-btn ce-btn-primary" id="btn-save-client">Saqlash</button>`,
        });

        document.getElementById('btn-save-client').addEventListener('click', () => {
            const data = Modal.getFormData();
            if (!data.name?.trim()) return Toast.error('Ism kiritilmagan');

            WS.send('client.create', data, (msg) => {
                if (!msg.ok) return Toast.error(msg.error);
                STATE.clients.unshift(msg.data);
                Modal.close();
                Toast.success('Mijoz qo\'shildi');

                // DOM ga qo'shish (reload yo'q!)
                const list = document.getElementById('clients-list');
                const empty = list.querySelector('.ce-empty');
                if (empty) empty.remove();
                list.insertAdjacentHTML('afterbegin', this._clientCard(msg.data));
                this.bind(); // Rebind
            });
        });
    },

    deleteClient(id) {
        WS.send('client.delete', {id: parseInt(id)}, (msg) => {
            if (!msg.ok) return Toast.error(msg.error);
            STATE.clients = STATE.clients.filter(c => c.id !== parseInt(id));

            // DOM dan olib tashlash (fade out)
            const card = document.querySelector(`.client-card[data-id="${id}"]`);
            if (card) {
                card.style.transition = 'all .3s';
                card.style.opacity = '0';
                card.style.transform = 'translateX(20px)';
                setTimeout(() => card.remove(), 300);
            }
            Toast.success("Mijoz o'chirildi");
        });
    },
};
```

### 3.3. `pages/orders.js` — Orders List + Create (~200 qator)

```javascript
const Orders = {
    render() {
        const app = document.getElementById('app');
        app.innerHTML = Skeleton.ordersList();

        WS.send('page.orders', {}, (msg) => {
            if (!msg.ok) return Toast.error(msg.error);
            STATE.orders = msg.data.orders;
            STATE.sharedOrders = msg.data.shared_orders;
            STATE.templates = msg.data.templates;
            app.innerHTML = this.template(msg.data);
            this.bind();
        });
    },

    template(d) {
        return `
        <div class="page-enter">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                <h2 style="font-size:18px;margin:0">Buyurtmalar</h2>
                <button class="ce-btn ce-btn-primary" id="btn-add-order" style="font-size:13px;padding:8px 16px">
                    <i class="fas fa-plus"></i> Yangi
                </button>
            </div>

            <!-- Status filter tabs -->
            <div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;flex-wrap:nowrap" id="order-tabs">
                <button class="ce-btn ce-btn-secondary tab-btn active" data-filter="all" style="font-size:12px;padding:6px 12px;white-space:nowrap">Hammasi (${d.orders.length})</button>
                <button class="ce-btn tab-btn" data-filter="new" style="font-size:12px;padding:6px 12px;white-space:nowrap">Yangi</button>
                <button class="ce-btn tab-btn" data-filter="progress" style="font-size:12px;padding:6px 12px;white-space:nowrap">Jarayonda</button>
                <button class="ce-btn tab-btn" data-filter="completed" style="font-size:12px;padding:6px 12px;white-space:nowrap">Tayyor</button>
            </div>

            <div id="orders-list">
                ${d.orders.length === 0 ? `
                    <div class="ce-empty">
                        <div class="ce-empty-icon">📦</div>
                        <p>Hali buyurtma yo'q</p>
                    </div>
                ` : d.orders.map(o => this._orderCard(o)).join('')}
            </div>

            <!-- Shared Orders -->
            ${d.shared_orders.length > 0 ? `
            <h3 style="font-size:15px;margin:20px 0 10px">🤝 Ulashilgan buyurtmalar</h3>
            <div id="shared-orders-list">
                ${d.shared_orders.map(so => `
                    <div class="ce-card" style="padding:12px;margin-bottom:8px">
                        <a href="#/orders/${so.order.id}" style="text-decoration:none;color:inherit">
                            <div style="display:flex;justify-content:space-between;align-items:start">
                                <div style="font-size:13px;font-weight:500">${Utils.esc(so.order.title)}</div>
                                <span class="ce-badge">${so.role}</span>
                            </div>
                            ${so.order.customer_name ? `<div style="font-size:11px;color:var(--text-muted)">${Utils.esc(so.order.customer_name)}</div>` : ''}
                            ${Utils.progressBar(so.order.overall_progress)}
                        </a>
                    </div>
                `).join('')}
            </div>` : ''}
        </div>
        `;
    },

    _orderCard(o) {
        return `
        <a href="#/orders/${o.id}" class="ce-card order-card" data-id="${o.id}" data-status="${o.status}"
           style="padding:12px;margin-bottom:8px;text-decoration:none;color:inherit;display:block">
            <div style="display:flex;justify-content:space-between;align-items:start">
                <div style="font-size:14px;font-weight:500">${Utils.esc(o.title)}</div>
                ${Utils.statusBadge(o.status)}
            </div>
            ${o.customer_name ? `<div style="font-size:12px;color:var(--text-muted)">${Utils.esc(o.customer_name)}</div>` : ''}
            <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center">
                <div>
                    <span style="font-size:12px;color:var(--accent)">${Utils.money(o.total_income)}</span>
                    ${o.estimated_price !== '0' ? `<span style="font-size:11px;color:var(--text-muted)"> / ${Utils.money(o.estimated_price)}</span>` : ''}
                </div>
                <span style="font-size:12px;font-weight:600">${o.overall_progress}%</span>
            </div>
            ${Utils.progressBar(o.overall_progress)}
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
                ${Utils.timeAgo(o.created_at)}
                ${o.mc_code ? ' · 🏭 ' + Utils.esc(o.mc_code) : ''}
            </div>
        </a>
        `;
    },

    bind() {
        // Add order
        document.getElementById('btn-add-order')?.addEventListener('click', () => this.showCreateModal());

        // Tab filter
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active', 'ce-btn-secondary'));
                btn.classList.add('active', 'ce-btn-secondary');
                const filter = btn.dataset.filter;
                document.querySelectorAll('.order-card').forEach(card => {
                    card.style.display = (filter === 'all' || card.dataset.status === filter) ? '' : 'none';
                });
            });
        });
    },

    showCreateModal() {
        // Template options
        const tmplOpts = STATE.templates.map(t =>
            `<option value="${t.id}">${Utils.esc(t.name)}</option>`
        ).join('');

        // Customer options
        const custOpts = STATE.clients.map(c =>
            `<option value="${c.id}">${Utils.esc(c.name)}</option>`
        ).join('');

        Modal.open("Yangi buyurtma", `
            <form>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Sarlavha *</label>
                    <input type="text" name="title" class="ce-input" required style="width:100%">
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Mijoz</label>
                    <select name="customer_id" class="ce-input" style="width:100%">
                        <option value="">— tanlanmagan —</option>
                        ${custOpts}
                    </select>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Taxminiy narx</label>
                    <input type="number" name="estimated_price" class="ce-input" style="width:100%">
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Etap shabloni</label>
                    <select name="template_id" class="ce-input" style="width:100%">
                        <option value="">— shablonsiz —</option>
                        ${tmplOpts}
                    </select>
                </div>
            </form>
        `, {
            footer: `<button class="ce-btn ce-btn-primary" id="btn-save-order">Yaratish</button>`,
        });

        document.getElementById('btn-save-order').addEventListener('click', () => {
            const data = Modal.getFormData();
            if (!data.title?.trim()) return Toast.error('Sarlavha kiritilmagan');

            WS.send('order.create', {
                title: data.title,
                customer_id: data.customer_id ? parseInt(data.customer_id) : null,
                estimated_price: parseInt(data.estimated_price) || 0,
                template_id: data.template_id ? parseInt(data.template_id) : null,
            }, (msg) => {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Buyurtma yaratildi');
                // Navigate to detail
                Router.go('/orders/' + msg.data.id);
            });
        });
    },
};
```

### 3.4. `pages/order-detail.js` — Order Detail (~500 qator, ENG KATTA)

Bu eng murakkab sahifa. To'liq tarkibi:

```javascript
const OrderDetail = {
    render(id) {
        const app = document.getElementById('app');
        app.innerHTML = Skeleton.orderDetail();

        WS.send('page.order', {id: parseInt(id)}, (msg) => {
            if (!msg.ok) {
                Toast.error(msg.error);
                Router.go('/orders');
                return;
            }
            STATE.currentOrder = msg.data;
            app.innerHTML = this.template(msg.data);
            this.bind();
        });
    },

    template(d) {
        const isOwner = d.is_owner;
        const role = d.user_role;
        const canEdit = (role === 'owner' || role === 'manager');

        return `
        <div class="page-enter">
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px">
                <div>
                    <a href="#/orders" style="font-size:12px;color:var(--text-muted);text-decoration:none">← Buyurtmalar</a>
                    <h2 style="font-size:18px;margin:4px 0 0">${Utils.esc(d.title)}</h2>
                    ${d.customer ? `<div style="font-size:12px;color:var(--text-muted)">${Utils.esc(d.customer.name)}</div>` : ''}
                </div>
                ${canEdit ? `
                <select id="od-status" class="ce-input" style="width:auto;font-size:12px;padding:6px 10px">
                    <option value="new" ${d.status === 'new' ? 'selected' : ''}>Yangi</option>
                    <option value="progress" ${d.status === 'progress' ? 'selected' : ''}>Jarayonda</option>
                    <option value="ready" ${d.status === 'ready' ? 'selected' : ''}>Tayyor</option>
                    <option value="completed" ${d.status === 'completed' ? 'selected' : ''}>Tugallangan</option>
                    <option value="cancelled" ${d.status === 'cancelled' ? 'selected' : ''}>Bekor</option>
                </select>
                ` : Utils.statusBadge(d.status)}
            </div>

            <!-- Progress -->
            <div style="margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                    <span>Jarayon</span>
                    <span id="od-progress-text">${d.overall_progress}%</span>
                </div>
                <div id="od-progress-bar">${Utils.progressBar(d.overall_progress)}</div>
            </div>

            <!-- Stats -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
                <div class="ce-card" style="padding:10px;text-align:center">
                    <div style="font-size:11px;color:var(--text-muted)">Kirim</div>
                    <div style="font-weight:700;color:var(--accent)" id="od-income">${Utils.money(d.total_income)}</div>
                </div>
                <div class="ce-card" style="padding:10px;text-align:center">
                    <div style="font-size:11px;color:var(--text-muted)">Chiqim</div>
                    <div style="font-weight:700;color:var(--danger)" id="od-expense">${Utils.money(d.total_expense)}</div>
                </div>
                <div class="ce-card" style="padding:10px;text-align:center">
                    <div style="font-size:11px;color:var(--text-muted)">Foyda</div>
                    <div style="font-weight:700" id="od-profit">${Utils.money(d.profit)}</div>
                </div>
                <div class="ce-card" style="padding:10px;text-align:center">
                    <div style="font-size:11px;color:var(--text-muted)">To'lov</div>
                    <div style="font-weight:700" id="od-payment">${d.payment_percent}%</div>
                </div>
            </div>

            <!-- Action Buttons -->
            ${canEdit ? `
            <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
                <button class="ce-btn ce-btn-primary" id="od-btn-income" style="font-size:12px;padding:8px 14px">
                    <i class="fas fa-plus"></i> Kirim
                </button>
                <button class="ce-btn ce-btn-danger" id="od-btn-expense" style="font-size:12px;padding:8px 14px">
                    <i class="fas fa-minus"></i> Chiqim
                </button>
                ${isOwner && !d.mc_code ? `
                <button class="ce-btn ce-btn-secondary" id="od-btn-mc" style="font-size:12px;padding:8px 14px">
                    🏭 MebelCity
                </button>` : ''}
            </div>` : ''}

            <!-- Stages -->
            <h3 style="font-size:15px;margin:0 0 10px">Etaplar</h3>
            <div id="od-stages">
                ${d.stages.map(s => this._stageCard(s, canEdit, isOwner)).join('')}
            </div>

            <!-- Add Stage -->
            ${canEdit ? `
            <button class="ce-btn ce-btn-secondary" id="od-btn-add-stage" style="width:100%;margin:10px 0 16px;font-size:13px">
                <i class="fas fa-plus"></i> Etap qo'shish
            </button>` : ''}

            <!-- Template Apply -->
            ${isOwner && d.templates && d.templates.length > 0 && d.stages.length === 0 ? `
            <div style="margin-bottom:16px">
                <label style="font-size:12px;color:var(--text-muted)">Shablon qo'llash:</label>
                <div style="display:flex;gap:6px;margin-top:4px">
                    <select id="od-tmpl-select" class="ce-input" style="flex:1;font-size:13px">
                        ${d.templates.map(t => `<option value="${t.id}">${Utils.esc(t.name)}</option>`).join('')}
                    </select>
                    <button class="ce-btn ce-btn-primary" id="od-btn-apply-tmpl" style="font-size:12px">Qo'llash</button>
                </div>
            </div>` : ''}

            <!-- Permissions -->
            ${isOwner ? `
            <h3 style="font-size:15px;margin:20px 0 10px">Ruxsatlar</h3>
            <div id="od-permissions">
                ${d.permissions.map(p => this._permCard(p)).join('')}
            </div>
            <button class="ce-btn ce-btn-secondary" id="od-btn-add-perm" style="width:100%;margin:10px 0 16px;font-size:13px">
                <i class="fas fa-user-plus"></i> Ruxsat qo'shish
            </button>` : ''}

            <!-- Transactions -->
            <h3 style="font-size:15px;margin:20px 0 10px">Tranzaksiyalar</h3>
            <div id="od-transactions">
                ${d.transactions.length === 0 ? '<p style="font-size:13px;color:var(--text-muted)">Hali tranzaksiya yo\'q</p>' : ''}
                ${d.transactions.map(t => this._trxCard(t)).join('')}
            </div>

            <!-- Timeline -->
            <h3 style="font-size:15px;margin:20px 0 10px">Tarix</h3>
            <div id="od-timeline">
                ${d.timeline.map(t => `
                    <div style="font-size:12px;padding:6px 0;border-bottom:1px solid var(--border)">
                        <span style="color:var(--text-muted)">${Utils.datetime(t.created_at)}</span>
                        <span>${Utils.esc(t.description)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        `;
    },

    // ── Stage Card ──
    _stageCard(s, canEdit, isOwner) {
        const statusCls = {
            pending: '', active: 'stg-active', completed: 'stg-completed', skipped: 'stg-skipped',
        }[s.status] || '';

        return `
        <div class="ce-card stg-card ${statusCls} ${s.is_mebelcity ? 'stg-mc' : ''}" data-stage-id="${s.id}"
             style="padding:12px;margin-bottom:8px;border-left:4px solid ${s.color}">
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="OrderDetail.toggleStage(${s.id})">
                <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:18px">${Utils.esc(s.icon)}</span>
                    <span style="font-weight:500;font-size:14px">${Utils.esc(s.title)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                    ${Utils.statusBadge(s.status)}
                    <i class="fas fa-chevron-down stg-chevron" style="font-size:11px;color:var(--text-muted);transition:transform .2s"></i>
                </div>
            </div>

            <!-- Body (collapsed by default) -->
            <div class="stg-body" style="display:none;margin-top:10px">
                <!-- Checklist -->
                ${s.checklist.length > 0 ? `
                <div class="stg-checklist">
                    ${s.checklist.map(item => `
                        <div class="stg-cl-item ${item.is_done ? 'done' : ''}" data-item="${item.id}">
                            <div class="stg-cl-box" onclick="OrderDetail.toggleCheck(${s.id}, ${item.id})">
                                ${item.is_done ? '<i class="fas fa-check"></i>' : ''}
                            </div>
                            <span style="font-size:13px;${item.is_done ? 'text-decoration:line-through;opacity:.6' : ''}">${Utils.esc(item.title)}</span>
                            ${item.done_by ? `<span style="font-size:10px;color:var(--text-muted);margin-left:auto">${Utils.esc(item.done_by)}</span>` : ''}
                        </div>
                    `).join('')}
                </div>` : ''}

                <!-- Note -->
                ${s.note ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">${Utils.esc(s.note)}</div>` : ''}

                <!-- Cost -->
                ${s.estimated_cost !== '0' ? `<div style="font-size:12px;margin-top:6px">Smeta: <b>${Utils.money(s.estimated_cost)}</b></div>` : ''}

                <!-- Stage expenses -->
                ${s.expenses.length > 0 ? `
                <div style="margin-top:8px">
                    <div style="font-size:11px;color:var(--text-muted)">Chiqimlar:</div>
                    ${s.expenses.map(e => `
                        <div style="font-size:12px;display:flex;justify-content:space-between;padding:4px 0">
                            <span>${Utils.esc(e.description)}</span>
                            <span style="color:var(--danger)">${Utils.money(e.amount)}</span>
                        </div>
                    `).join('')}
                    <div style="font-size:12px;font-weight:600;text-align:right;border-top:1px solid var(--border);padding-top:4px">
                        Jami: ${Utils.money(s.total_expense)}
                    </div>
                </div>` : ''}

                <!-- Actions -->
                ${canEdit && s.status !== 'completed' && s.status !== 'skipped' ? `
                <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
                    <button class="ce-btn ce-btn-primary" onclick="OrderDetail.completeStage(${s.id})" style="font-size:11px;padding:6px 12px">
                        <i class="fas fa-check"></i> Tugatish
                    </button>
                    ${isOwner ? `
                    <button class="ce-btn" onclick="OrderDetail.skipStage(${s.id})" style="font-size:11px;padding:6px 12px">
                        O'tkazish
                    </button>
                    <button class="ce-btn ce-btn-danger" onclick="OrderDetail.deleteStage(${s.id})" style="font-size:11px;padding:6px 12px">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                    <button class="ce-btn" onclick="OrderDetail.addStageExpense(${s.id})" style="font-size:11px;padding:6px 12px">
                        <i class="fas fa-minus-circle"></i> Chiqim
                    </button>
                </div>` : ''}

                <!-- Assigned -->
                ${s.assigned_to ? `
                <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
                    Mas'ul: ${Utils.esc(s.assigned_to.full_name)}
                </div>` : ''}
                ${s.completed_by ? `
                <div style="font-size:11px;color:var(--accent);margin-top:4px">
                    Tugatgan: ${Utils.esc(s.completed_by.full_name)} · ${Utils.datetime(s.completed_at)}
                </div>` : ''}
            </div>
        </div>
        `;
    },

    // ── Permission Card ──
    _permCard(p) {
        const roleLabels = {viewer: 'Ko\'ruvchi', worker: 'Ishchi', manager: 'Menejer'};
        return `
        <div class="ce-card perm-card" data-perm-id="${p.id}" style="padding:10px;margin-bottom:6px;display:flex;align-items:center;gap:10px">
            <div style="width:36px;height:36px;border-radius:50%;background:var(--secondary);color:#fff;
                display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0">
                ${Utils.initials(p.user.full_name)}
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:500">${Utils.esc(p.user.full_name)}</div>
                <div style="font-size:11px;color:var(--text-muted)">${roleLabels[p.role] || p.role}</div>
            </div>
            <button class="ce-btn ce-btn-danger" onclick="OrderDetail.deletePerm(${p.id})" style="padding:6px 10px;font-size:11px">
                <i class="fas fa-times"></i>
            </button>
        </div>
        `;
    },

    // ── Transaction Card ──
    _trxCard(t) {
        const isIncome = t.record_type === 'income';
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
            <div>
                <div style="font-size:13px">${Utils.esc(t.description) || (isIncome ? 'Kirim' : 'Chiqim')}</div>
                <div style="font-size:11px;color:var(--text-muted)">
                    ${Utils.datetime(t.created_at)}
                    ${t.stage_name ? ' · ' + Utils.esc(t.stage_name) : ''}
                </div>
            </div>
            <div style="font-weight:600;font-size:14px;color:${isIncome ? 'var(--accent)' : 'var(--danger)'}">
                ${isIncome ? '+' : '-'}${Utils.money(t.amount)}
            </div>
        </div>
        `;
    },

    // ═══ METHODS ═══

    toggleStage(stageId) {
        const card = document.querySelector(`[data-stage-id="${stageId}"]`);
        const body = card?.querySelector('.stg-body');
        const chevron = card?.querySelector('.stg-chevron');
        if (body) {
            const isOpen = body.style.display !== 'none';
            body.style.display = isOpen ? 'none' : 'block';
            if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
        }
    },

    toggleCheck(stageId, itemId) {
        // Optimistic UI
        const el = document.querySelector(`[data-item="${itemId}"]`);
        if (!el) return;
        const wasDone = el.classList.contains('done');
        el.classList.toggle('done');
        const box = el.querySelector('.stg-cl-box');
        box.innerHTML = !wasDone ? '<i class="fas fa-check"></i>' : '';
        const span = el.querySelector('span');
        if (span) {
            span.style.textDecoration = !wasDone ? 'line-through' : 'none';
            span.style.opacity = !wasDone ? '.6' : '1';
        }

        // WS
        WS.send('stage.check', {stage_id: stageId, item_id: itemId}, (msg) => {
            if (!msg.ok) {
                // Revert
                el.classList.toggle('done');
                box.innerHTML = wasDone ? '<i class="fas fa-check"></i>' : '';
                Toast.error(msg.error);
            }
        });
    },

    completeStage(stageId) {
        WS.send('stage.complete', {id: stageId}, (msg) => {
            if (!msg.ok) return Toast.error(msg.error);
            Toast.success('Etap tugallandi!');
            // Re-render full page
            this.render(STATE.currentOrder.id);
        });
    },

    skipStage(stageId) {
        Modal.confirm("O'tkazish", "Bu etapni o'tkazasizmi?", () => {
            WS.send('stage.skip', {id: stageId}, (msg) => {
                if (!msg.ok) return Toast.error(msg.error);
                this.render(STATE.currentOrder.id);
            });
        });
    },

    deleteStage(stageId) {
        Modal.confirm("O'chirish", "Bu etapni o'chirasizmi?", () => {
            WS.send('stage.delete', {id: stageId}, (msg) => {
                if (!msg.ok) return Toast.error(msg.error);
                const card = document.querySelector(`[data-stage-id="${stageId}"]`);
                if (card) {
                    card.style.transition = 'all .3s';
                    card.style.opacity = '0';
                    card.style.maxHeight = '0';
                    setTimeout(() => card.remove(), 300);
                }
                // Update progress
                if (msg.data?.progress !== undefined) {
                    this._updateProgress(msg.data.progress);
                }
                Toast.success("Etap o'chirildi");
            });
        });
    },

    addStageExpense(stageId) {
        // Chiqim modal — stage_id bilan
        this._showFinanceModal('expense', stageId);
    },

    _updateProgress(percent) {
        const text = document.getElementById('od-progress-text');
        const bar = document.getElementById('od-progress-bar');
        if (text) text.textContent = percent + '%';
        if (bar) bar.innerHTML = Utils.progressBar(percent);
    },

    // ── Finance modals ──
    _showFinanceModal(type, stageId) {
        const isIncome = type === 'income';
        const orderId = STATE.currentOrder.id;

        // Stage options
        const stages = STATE.currentOrder.stages || [];
        const stageOpts = stages.map(s =>
            `<option value="${s.id}" ${s.id === stageId ? 'selected' : ''}>${Utils.esc(s.icon)} ${Utils.esc(s.title)}</option>`
        ).join('');

        Modal.open(isIncome ? 'Kirim qo\'shish' : 'Chiqim qo\'shish', `
            <form>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Summa *</label>
                    <input type="number" name="amount" class="ce-input" required style="width:100%">
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Izoh</label>
                    <input type="text" name="description" class="ce-input" style="width:100%">
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">To'lov usuli</label>
                    <select name="payment_method" class="ce-input" style="width:100%">
                        <option value="cash">Naqd</option>
                        <option value="card">Karta</option>
                        <option value="transfer">O'tkazma</option>
                    </select>
                </div>
                ${!isIncome && stages.length > 0 ? `
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Etap</label>
                    <select name="stage_id" class="ce-input" style="width:100%">
                        <option value="">— umumiy —</option>
                        ${stageOpts}
                    </select>
                </div>` : ''}
            </form>
        `, {
            footer: `<button class="ce-btn ${isIncome ? 'ce-btn-primary' : 'ce-btn-danger'}" id="od-save-finance">Saqlash</button>`,
        });

        document.getElementById('od-save-finance').addEventListener('click', () => {
            const formData = Modal.getFormData();
            if (!formData.amount || parseInt(formData.amount) <= 0) return Toast.error('Summa kiritilmagan');

            const wsType = isIncome ? 'order.income' : 'order.expense';
            WS.send(wsType, {
                order_id: orderId,
                amount: parseInt(formData.amount),
                description: formData.description || '',
                payment_method: formData.payment_method || 'cash',
                stage_id: formData.stage_id ? parseInt(formData.stage_id) : null,
            }, (msg) => {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success(isIncome ? 'Kirim qo\'shildi' : 'Chiqim qo\'shildi');
                this.render(orderId); // Re-render
            });
        });
    },

    // ── Add Stage Modal ──
    showAddStageModal() {
        const emojis = ['📋', '✂️', '🪚', '🔨', '🎨', '📐', '🚚', '📦', '🏭', '✅'];
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

        Modal.open("Yangi etap", `
            <form>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Nomi *</label>
                    <input type="text" name="title" class="ce-input" required style="width:100%">
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Emoji</label>
                    <div style="display:flex;gap:6px;flex-wrap:wrap" id="stg-emoji-picker">
                        ${emojis.map((e, i) => `
                            <label style="cursor:pointer;font-size:20px;padding:4px;border:2px solid ${i === 0 ? 'var(--accent)' : 'transparent'};border-radius:8px">
                                <input type="radio" name="icon" value="${e}" ${i === 0 ? 'checked' : ''} style="display:none">
                                ${e}
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Rang</label>
                    <div style="display:flex;gap:6px" id="stg-color-picker">
                        ${colors.map((c, i) => `
                            <label style="cursor:pointer;width:28px;height:28px;border-radius:50%;background:${c};
                                border:3px solid ${i === 0 ? '#fff' : 'transparent'};box-shadow:${i === 0 ? '0 0 0 2px var(--accent)' : 'none'}">
                                <input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''} style="display:none">
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Smeta</label>
                    <input type="number" name="estimated_cost" class="ce-input" style="width:100%">
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Checklist</label>
                    <div id="stg-checklist-builder"></div>
                    <button type="button" class="ce-btn ce-btn-secondary" onclick="OrderDetail._addChecklistInput()" style="font-size:12px;margin-top:6px">
                        <i class="fas fa-plus"></i> Element
                    </button>
                </div>
                <div style="margin-bottom:12px">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                        <input type="checkbox" name="is_mebelcity">
                        <span style="font-size:13px">🏭 MebelCity etapi</span>
                    </label>
                </div>
            </form>
        `, {
            footer: `<button class="ce-btn ce-btn-primary" id="stg-save-btn">Qo'shish</button>`,
        });

        // Emoji/color picker interactivity
        document.querySelectorAll('#stg-emoji-picker label').forEach(lbl => {
            lbl.addEventListener('click', () => {
                document.querySelectorAll('#stg-emoji-picker label').forEach(l => l.style.borderColor = 'transparent');
                lbl.style.borderColor = 'var(--accent)';
            });
        });
        document.querySelectorAll('#stg-color-picker label').forEach(lbl => {
            lbl.addEventListener('click', () => {
                document.querySelectorAll('#stg-color-picker label').forEach(l => {
                    l.style.borderColor = 'transparent';
                    l.style.boxShadow = 'none';
                });
                lbl.style.borderColor = '#fff';
                lbl.style.boxShadow = '0 0 0 2px var(--accent)';
            });
        });

        // Save
        document.getElementById('stg-save-btn').addEventListener('click', () => {
            const formData = Modal.getFormData();
            if (!formData.title?.trim()) return Toast.error('Nom kiritilmagan');

            // Collect checklist
            const checklist = [];
            document.querySelectorAll('.stg-cl-input').forEach(inp => {
                if (inp.value.trim()) checklist.push(inp.value.trim());
            });

            WS.send('stage.create', {
                order_id: STATE.currentOrder.id,
                title: formData.title,
                icon: formData.icon || '📋',
                color: formData.color || '#6366f1',
                estimated_cost: parseInt(formData.estimated_cost) || 0,
                is_mebelcity: !!formData.is_mebelcity,
                checklist: checklist,
            }, (msg) => {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Etap qo\'shildi');
                this.render(STATE.currentOrder.id);
            });
        });
    },

    _addChecklistInput() {
        const container = document.getElementById('stg-checklist-builder');
        if (!container) return;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;gap:6px;margin-bottom:4px';
        div.innerHTML = `
            <input type="text" class="ce-input stg-cl-input" placeholder="Element nomi" style="flex:1;font-size:13px">
            <button type="button" class="ce-btn ce-btn-danger" onclick="this.parentElement.remove()" style="padding:6px 8px"><i class="fas fa-times"></i></button>
        `;
        container.appendChild(div);
        div.querySelector('input').focus();
    },

    // ── Permission Modal ──
    showPermModal() {
        Modal.open("Ruxsat qo'shish", `
            <form>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Foydalanuvchi qidirish</label>
                    <input type="text" id="perm-search-input" class="ce-input" placeholder="Ism, telefon..." style="width:100%">
                    <div id="perm-search-results" style="margin-top:6px"></div>
                    <input type="hidden" name="user_id" id="perm-user-id">
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:12px;color:var(--text-muted)">Rol</label>
                    <div style="display:flex;gap:8px;margin-top:4px">
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
                            <input type="radio" name="role" value="viewer" checked> Ko'ruvchi
                        </label>
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
                            <input type="radio" name="role" value="worker"> Ishchi
                        </label>
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
                            <input type="radio" name="role" value="manager"> Menejer
                        </label>
                    </div>
                </div>
                <div style="margin-bottom:12px">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                        <input type="checkbox" name="can_add_expense"> Chiqim qo'sha oladi
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:4px">
                        <input type="checkbox" name="can_complete_stage"> Etap tugata oladi
                    </label>
                </div>
            </form>
        `, {
            footer: `<button class="ce-btn ce-btn-primary" id="perm-save-btn">Saqlash</button>`,
        });

        // User search
        const searchInput = document.getElementById('perm-search-input');
        searchInput.addEventListener('input', Utils.debounce((e) => {
            const q = e.target.value.trim();
            if (q.length < 2) {
                document.getElementById('perm-search-results').innerHTML = '';
                return;
            }
            WS.send('user.search', {q}, (msg) => {
                if (!msg.ok) return;
                const results = document.getElementById('perm-search-results');
                results.innerHTML = msg.data.users.map(u => `
                    <div class="ce-card" style="padding:8px;margin-bottom:4px;cursor:pointer;display:flex;align-items:center;gap:8px"
                         onclick="OrderDetail._selectPermUser(${u.id}, '${Utils.esc(u.full_name)}')">
                        <div style="width:32px;height:32px;border-radius:50%;background:var(--secondary);color:#fff;
                            display:flex;align-items:center;justify-content:center;font-size:11px">${Utils.initials(u.full_name)}</div>
                        <div>
                            <div style="font-size:13px">${Utils.esc(u.full_name)}</div>
                            <div style="font-size:11px;color:var(--text-muted)">${Utils.esc(u.phone)}</div>
                        </div>
                    </div>
                `).join('') || '<div style="font-size:12px;color:var(--text-muted);padding:8px">Topilmadi</div>';
            });
        }, 300));

        // Save
        document.getElementById('perm-save-btn').addEventListener('click', () => {
            const formData = Modal.getFormData();
            const userId = document.getElementById('perm-user-id').value;
            if (!userId) return Toast.error('Foydalanuvchi tanlang');

            WS.send('perm.save', {
                order_id: STATE.currentOrder.id,
                user_id: parseInt(userId),
                role: formData.role || 'viewer',
                can_add_expense: !!formData.can_add_expense,
                can_complete_stage: !!formData.can_complete_stage,
            }, (msg) => {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Ruxsat saqlandi');
                this.render(STATE.currentOrder.id);
            });
        });
    },

    _selectPermUser(userId, name) {
        document.getElementById('perm-user-id').value = userId;
        document.getElementById('perm-search-input').value = name;
        document.getElementById('perm-search-results').innerHTML = '';
    },

    deletePerm(permId) {
        Modal.confirm("O'chirish", "Ruxsatni olib tashlaysizmi?", () => {
            WS.send('perm.delete', {id: permId}, (msg) => {
                if (!msg.ok) return Toast.error(msg.error);
                const card = document.querySelector(`[data-perm-id="${permId}"]`);
                if (card) {
                    card.style.transition = 'all .3s';
                    card.style.opacity = '0';
                    setTimeout(() => card.remove(), 300);
                }
                Toast.success("Ruxsat olib tashlandi");
            });
        });
    },

    // ── Broadcast handler ──
    handleBroadcast(action, data, by) {
        // Boshqa user o'zgartirish qilganda — sahifani yangilash
        Toast.info(`${by} → ${action}`);
        this.render(STATE.currentOrder.id);
    },

    // ── Bind ──
    bind() {
        // Status change
        document.getElementById('od-status')?.addEventListener('change', (e) => {
            WS.send('order.update', {
                id: STATE.currentOrder.id,
                fields: {status: e.target.value},
            }, (msg) => {
                if (!msg.ok) Toast.error(msg.error);
                else Toast.success('Status yangilandi');
            });
        });

        // Income/Expense buttons
        document.getElementById('od-btn-income')?.addEventListener('click', () => this._showFinanceModal('income'));
        document.getElementById('od-btn-expense')?.addEventListener('click', () => this._showFinanceModal('expense'));

        // Add stage
        document.getElementById('od-btn-add-stage')?.addEventListener('click', () => this.showAddStageModal());

        // Add permission
        document.getElementById('od-btn-add-perm')?.addEventListener('click', () => this.showPermModal());

        // Apply template
        document.getElementById('od-btn-apply-tmpl')?.addEventListener('click', () => {
            const tmplId = document.getElementById('od-tmpl-select')?.value;
            if (!tmplId) return;
            WS.send('template.apply', {
                template_id: parseInt(tmplId),
                order_id: STATE.currentOrder.id,
            }, (msg) => {
                if (!msg.ok) return Toast.error(msg.error);
                Toast.success('Shablon qo\'llandi');
                this.render(STATE.currentOrder.id);
            });
        });

        // MebelCity
        document.getElementById('od-btn-mc')?.addEventListener('click', () => {
            Modal.confirm('MebelCity', "Buyurtmani MebelCity ga yuborasizmi?", () => {
                WS.send('order.send_mc', {id: STATE.currentOrder.id}, (msg) => {
                    if (!msg.ok) return Toast.error(msg.error);
                    Toast.success('MebelCity ga yuborildi');
                    this.render(STATE.currentOrder.id);
                });
            });
        });
    },
};
```

### 3.5. `pages/finance.js` — Finance (~200 qator)

Asosiy tuzilma: stats grid + tabs (all/income/expense/withdrawal) + debts section + modals.

**Render:** WS `page.finance` → stats + records + debts
**Tabs:** Local filter (server so'rov yo'q)
**Modals:** Kirim/Chiqim/Qarz yaratish/Qarz to'lash/Pul yechish
**DOM update:** Har operatsiyadan keyin re-render

### 3.6. `pages/mebelcity.js` — MebelCity Orders (~80 qator)

Read-only sahifa:
**Render:** WS `page.mebelcity` → orders list
**Card:** partner_name, code, deadline, state, progress bar, steps badges
**Link:** Har order ni MebelCity ga ochish (tashqi link)

### 3.7. `pages/settings.js` — Settings/Profile (~80 qator)

**Render:** WS `page.settings` → user data
**Template:** Profile info (name, phone, username, org) + password change form
**Action:** `settings.password` WS handler

---

## 4. Stage CSS (base.css ga qo'shish)

```css
/* ═══ STAGE CARDS ═══ */
.stg-card { transition: all .2s; }
.stg-active { background: rgba(16,185,129,0.05); }
.stg-completed { opacity: .7; }
.stg-completed .stg-chevron { color: var(--accent) !important; }
.stg-skipped { opacity: .5; background: var(--border); }
.stg-mc { border-right: 4px solid #f59e0b; }

/* Checklist */
.stg-checklist { margin-top: 8px; }
.stg-cl-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
}
.stg-cl-box {
    width: 22px;
    height: 22px;
    border: 2px solid var(--border);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 11px;
    color: var(--accent);
    flex-shrink: 0;
    transition: all .15s;
}
.stg-cl-item.done .stg-cl-box {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
}
```

---

## 5. Fayl ro'yxati

| Fayl | Holat | Hajm (taxm.) |
|------|-------|--------------|
| `static/client_erp/js/pages/dashboard.js` | YANGI | ~200 qator |
| `static/client_erp/js/pages/clients.js` | YANGI | ~150 qator |
| `static/client_erp/js/pages/orders.js` | YANGI | ~200 qator |
| `static/client_erp/js/pages/order-detail.js` | YANGI | ~500 qator |
| `static/client_erp/js/pages/finance.js` | YANGI | ~200 qator |
| `static/client_erp/js/pages/mebelcity.js` | YANGI | ~80 qator |
| `static/client_erp/js/pages/settings.js` | YANGI | ~80 qator |
| `static/client_erp/css/base.css` | O'ZGARTIRISH | Stage CSS qo'shish |

---

# PROMPT — Faza 4 uchun

```
Sen MebelCity ERP platformasida ishlayapsan. Bu Faza 4 — Page Renderers (Frontend).
Faza 1-2 da backend WS consumer + handlers, Faza 3 da SPA shell + router + components yaratilgan.
Endi har sahifa uchun JS renderer yaratish kerak.

## Nima qilish kerak:

### 7 ta page renderer:

#### 1. `pages/dashboard.js` — Dashboard (~200 qator)
- `Dashboard.render()` → Skeleton → WS `page.dashboard` → template render
- Template: user card (avatar, level, XP), quick actions (3 ta), stats grid, daily quests, active orders, shared tasks, announcements
- Har element click → hash navigation
- Cache: `STATE.dashboard`

#### 2. `pages/clients.js` — Clients CRUD (~150 qator)
- `Clients.render()` → Skeleton → WS `page.clients` → template render
- Client card: avatar initials, name, phone, address, call button, delete button
- Add modal: name*, phone, address → WS `client.create` → DOM prepend (reload yo'q)
- Delete: confirm modal → WS `client.delete` → DOM fade-out remove
- Local search filter (no server request)
- Cache: `STATE.clients`

#### 3. `pages/orders.js` — Orders List (~200 qator)
- `Orders.render()` → Skeleton → WS `page.orders` → template render
- Order card: title, customer, income, progress bar, status badge, timeAgo
- Filter tabs: All/Yangi/Jarayonda/Tayyor (local DOM filter)
- Shared orders section
- Create modal: title*, customer select, estimated_price, template select → WS `order.create` → navigate to detail
- Cache: `STATE.orders`, `STATE.sharedOrders`, `STATE.templates`

#### 4. `pages/order-detail.js` — ENG KATTA (~500 qator)
Bu eng murakkab sahifa. Barcha order operatsiyalari:
- Header: title, customer, status dropdown (owner/manager), back link
- Progress bar
- Stats grid: income, expense, profit, payment%
- Action buttons: +Kirim, +Chiqim, MebelCity
- **Stages accordion:** har stage card = header (icon, title, status badge, chevron) + body (checklist, note, cost, expenses, actions)
- **Checklist:** optimistic toggle (darhol visual → WS confirm → revert if error)
- Stage actions: complete, skip, delete, add expense
- Add stage modal: title, emoji picker, color picker, checklist builder, mebelcity checkbox
- Template apply
- **Permissions:** cards + add modal (user search debounce → select → role → save)
- Transactions list
- Timeline
- **Broadcast handler:** boshqa user o'zgartirsa — re-render

#### 5. `pages/finance.js` — Finance (~200 qator)
- `Finance.render()` → Skeleton → WS `page.finance` → template render
- Stats: income, expense, withdrawal, profit, balance
- Tabs: All/Kirim/Chiqim/Yechish (local filter)
- Transaction cards
- Debts section: cards + pay modal
- Modals: kirim/chiqim yaratish, qarz yaratish, qarz to'lash, pul yechish
- Cache: `STATE.finance`

#### 6. `pages/mebelcity.js` — MebelCity Orders (~80 qator)
- `MebelCity.render()` → Skeleton → WS `page.mebelcity` → template render
- Read-only cards: partner, code, deadline, state, progress, steps badges
- Empty state agar telefon bilan order topilmasa
- Cache: `STATE.mcOrders`

#### 7. `pages/settings.js` — Settings (~80 qator)
- `Settings.render()` → WS `page.settings` → template render
- Profile display: name, phone, username, org
- Password change form → WS `settings.password` → success/error toast

### Har page uchun umumiy pattern:
1. `render()` → skeleton → WS send → template → bind
2. `template(data)` → JS template literal → HTML string
3. `bind()` → addEventListener lar
4. Cache STATE da saqlash

### CSS qo'shish (base.css):
- `.stg-card`, `.stg-active`, `.stg-completed`, `.stg-skipped`, `.stg-mc`
- `.stg-checklist`, `.stg-cl-item`, `.stg-cl-box`
- Optimistic toggle animation

### Muhim:
- Vanilla JS — React/Vue ISHLATILMASIN
- Template literal bilan HTML render
- XSS himoya: `Utils.esc()` barcha user data uchun
- Optimistic UI: checkbox toggle darhol visual, keyin WS confirm
- Modal forms: `Modal.open()` + `Modal.getFormData()`
- Fade-out animation: delete operatsiyalar uchun
- No page reload — barcha operatsiyalar DOM manipulation
- Back link: `#/orders` → hash navigation

### Tekshirish:
Har sahifani ochib, barcha operatsiyalarni test qilish. Reload yo'qligini tekshirish.

### Deploy:
collectstatic + restart
```
