/* client_erp/js/pages/orders.js — Orders list + create */
var Orders = {
    render: function() {
        var app = document.getElementById('app');
        app.innerHTML = Skeleton.ordersList();
        Orders._deletedLoaded = false;
        WS.send('page.orders', {}, function(msg) {
            if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
            STATE.orders = msg.data.orders;
            STATE.sharedOrders = msg.data.shared_orders;
            STATE.templates = msg.data.templates;
            STATE.orderClients = msg.data.clients || [];
            Orders._orderClients = STATE.orderClients;
            Orders._st = PeriodFilter.init();   // default: SHU OY
            app.innerHTML = Orders.template(msg.data);
            Orders.bind();
            // Zakazga kirib qaytganda — oxirgi scroll holatini tiklash
            Router.restoreScrollFor('/orders');
        });
    },

    _toLatin: {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z','и':'i',
        'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
        'у':'u','ф':'f','х':'x','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'i',
        'ь':'','э':'e','ю':'yu','я':'ya','ў':'o\'','қ':'q','ғ':'g\'','ҳ':'h'
    },
    _toCyrillic: {
        'sh':'ш','ch':'ч','yo':'ё','yu':'ю','ya':'я','ts':'ц','shch':'щ',
        'a':'а','b':'б','v':'в','g':'г','d':'д','e':'е','j':'ж','z':'з','i':'и',
        'y':'й','k':'к','l':'л','m':'м','n':'н','o':'о','p':'п','r':'р','s':'с','t':'т',
        'u':'у','f':'ф','x':'х','q':'қ','h':'ҳ'
    },

    _normalize: function(str) {
        if (!str) return '';
        var s = str.toLowerCase().trim();
        var lat = '', cyr = '';
        var map = Orders._toLatin;
        for (var i = 0; i < s.length; i++) {
            lat += map[s[i]] || s[i];
        }
        var rmap = Orders._toCyrillic;
        var keys = Object.keys(rmap).sort(function(a,b){return b.length - a.length});
        var j = 0;
        while (j < s.length) {
            var found = false;
            for (var k = 0; k < keys.length; k++) {
                if (s.substr(j, keys[k].length) === keys[k]) {
                    cyr += rmap[keys[k]]; j += keys[k].length; found = true; break;
                }
            }
            if (!found) { cyr += s[j]; j++; }
        }
        return s + '|' + lat + '|' + cyr;
    },

    // Davr filtri holati (PeriodFilter — ce- uslub). Default: SHU OY.
    _st: null,
    _months: {},
    _FINISHED: {delivered: 1, cancelled: 1},

    // Buyurtma tanlangan davrga tegishlimi?
    // Carry-over: FAQAT "Shu oy" tanlanganda tugamagan (delivered/cancelled EMAS)
    // buyurtma qaysi oyda ochilganidan qat'i nazar KO'RINADI. Tugaganlari esa o'z
    // created_at oyida. Boshqa davrlarda (o'tgan oy/aniq oy/yil/custom) hamma uchun
    // PeriodFilter.inRange(created_at) — carry-over faqat SHU OY uchun.
    _inPeriod: function(status, createdAt) {
        var st = Orders._st || PeriodFilter.init();
        if (PeriodFilter.isCurrentMonth(st) && !Orders._FINISHED[status]) return true;
        return PeriodFilter.inRange(createdAt, st);
    },

    _filterOrders: function() {
        var q = (document.getElementById('order-search') || {}).value || '';
        var tab = (document.querySelector('.tab-btn.active') || {}).dataset;
        var filter = tab ? tab.filter : 'all';
        var qn = Orders._normalize(q);
        var parts = qn.split('|');

        document.querySelectorAll('.order-card').forEach(function(c) {
            var statusOk = filter === 'all' || c.dataset.status === filter;
            var periodOk = Orders._inPeriod(c.dataset.status, c.dataset.created);
            if (!statusOk || !periodOk) { c.style.display = 'none'; return; }
            if (!q.trim()) { c.style.display = 'block'; return; }
            var hay = Orders._normalize(c.dataset.title + ' ' + (c.dataset.customer || ''));
            var match = parts.some(function(p) { return p && hay.indexOf(p) !== -1; });
            c.style.display = match ? 'block' : 'none';
        });

        var vis = document.querySelectorAll('.order-card[style*="display: block"], .order-card:not([style*="display: none"])');
        var cnt = 0;
        document.querySelectorAll('.order-card').forEach(function(c){ if(c.style.display !== 'none') cnt++; });
        var empty = document.getElementById('search-empty');
        if (cnt === 0 && q.trim()) {
            if (!empty) {
                var d = document.createElement('div');
                d.id = 'search-empty';
                d.style.cssText = 'text-align:center;padding:24px;color:var(--text-muted);font-size:13px';
                d.textContent = 'Topilmadi: "' + q + '"';
                document.getElementById('orders-list').appendChild(d);
            } else { empty.textContent = 'Topilmadi: "' + q + '"'; }
        } else if (empty) { empty.remove(); }
    },

    template: function(d) {
        var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
        h += '<h2 style="font-size:18px;margin:0">Buyurtmalar</h2>';
        h += '<button class="ce-btn ce-btn-primary" id="btn-add-order" style="font-size:13px;padding:8px 16px"><i class="fas fa-plus"></i> Yangi</button></div>';

        // Search
        h += '<div style="position:relative;margin-bottom:10px">';
        h += '<i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:13px"></i>';
        h += '<input type="text" id="order-search" class="ce-input" placeholder="Qidirish... (ism, izoh)" style="width:100%;padding-left:34px;font-size:13px">';
        h += '</div>';

        // Davr filtri (PeriodFilter — ce- uslub, default SHU OY). "Aniq oy…"
        // ro'yxati created_at oylaridan yig'iladi.
        var monthCounts = {};
        d.orders.forEach(function(o){ var m=(o.created_at||'').slice(0,7); if(m) monthCounts[m]=(monthCounts[m]||0)+1; });
        Orders._months = monthCounts;
        h += '<div id="order-period-filter" style="margin-bottom:10px">' + PeriodFilter.html(Orders._st, monthCounts) + '</div>';

        // Tabs — oddiy, qattiq yozilgan (avvalgi holat), faqat "Kutilmoqda" qo'shildi
        STATE.orderStatuses = d.statuses || [];
        var counts = {all:d.orders.length, new:0, waiting:0, in_progress:0, ready:0, delivered:0};
        d.orders.forEach(function(o) { if (counts[o.status] !== undefined) counts[o.status]++; });
        h += '<div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto" id="order-tabs">';
        h += '<button class="ce-btn ce-btn-secondary tab-btn active" data-filter="all" style="font-size:12px;padding:6px 12px;white-space:nowrap">Hammasi ('+counts.all+')</button>';
        h += '<button class="ce-btn tab-btn" data-filter="new" style="font-size:12px;padding:6px 12px;white-space:nowrap">Yangi ('+counts.new+')</button>';
        h += '<button class="ce-btn tab-btn" data-filter="waiting" style="font-size:12px;padding:6px 12px;white-space:nowrap">Kutilmoqda ('+counts.waiting+')</button>';
        h += '<button class="ce-btn tab-btn" data-filter="in_progress" style="font-size:12px;padding:6px 12px;white-space:nowrap">Jarayonda ('+counts.in_progress+')</button>';
        h += '<button class="ce-btn tab-btn" data-filter="ready" style="font-size:12px;padding:6px 12px;white-space:nowrap">Tayyor ('+counts.ready+')</button>';
        h += '<button class="ce-btn tab-btn" data-filter="delivered" style="font-size:12px;padding:6px 12px;white-space:nowrap">Topshirildi ('+counts.delivered+')</button>';
        h += '<button class="ce-btn tab-btn" data-filter="deleted" style="font-size:12px;padding:6px 12px;white-space:nowrap;color:var(--danger)"><i class="fas fa-trash"></i> O\'chirilgan</button>';
        h += '</div>';

        // Joriy oyda TOPSHIRILGAN (delivered) zakazlar tepada — real-time oy (new Date)
        // Faqat ko'rsatilish tartibi; ma'lumot o'zgarmaydi/aralashmaydi
        var _now = new Date();
        var _curM = _now.getFullYear() + '-' + ('0' + (_now.getMonth() + 1)).slice(-2); // 'YYYY-MM'
        d.orders.sort(function(a, b) {
            var at = (a.status === 'delivered' && (a.created_at || '').slice(0, 7) === _curM) ? 1 : 0;
            var bt = (b.status === 'delivered' && (b.created_at || '').slice(0, 7) === _curM) ? 1 : 0;
            if (at !== bt) return bt - at;                          // joriy oy topshirilgan → tepaga
            return (b.created_at || '').localeCompare(a.created_at || ''); // keyin eng yangisi
        });

        // Oddiy ko'rinish — barcha status-tab'lar shu ichida (yagona tab bilan yashiriladi/ko'rsatiladi)
        h += '<div id="normal-orders-view">';

        // Eslatma: "Jamoa buyurtmalari" endi bu sahifada YO'Q — Jamoa bo'limiga ko'chirildi (team.js)

        h += '<div id="orders-list">';
        if (!d.orders.length) h += '<div class="ce-empty"><div class="ce-empty-icon">📦</div><p>Hali buyurtma yo\'q</p></div>';
        else d.orders.forEach(function(o) { h += Orders._card(o); });
        h += '</div>';

        if (d.shared_orders && d.shared_orders.length) {
            h += '<h3 style="font-size:15px;margin:20px 0 10px">🤝 Ulashilgan buyurtmalar</h3>';
            d.shared_orders.forEach(function(so) {
                h += '<a href="#/orders/'+so.order.id+'" class="ce-card" style="padding:12px;margin-bottom:8px;text-decoration:none;color:inherit;display:block">';
                h += '<div style="display:flex;justify-content:space-between"><div style="font-size:13px;font-weight:500">'+Utils.esc(so.order.title)+'</div>'+Utils.statusBadge(so.role)+'</div>';
                h += Utils.progressBar(so.order.overall_progress) + '</a>';
            });
        }
        h += '</div>'; // #normal-orders-view

        // 🗑 O'chirilgan — endi alohida tab, bir bosishda ochiladi (avval "eng pastda" edi)
        h += '<div id="deleted-logs-body" style="display:none"></div>';

        return h;
    },

    _card: function(o) {
        return '<a href="#/orders/'+o.id+'" class="ce-card order-card" data-id="'+o.id+'" data-status="'+o.status+'" data-created="'+(o.created_at||'')+'" data-title="'+Utils.esc(o.title)+'" data-customer="'+Utils.esc(o.customer_name || '')+'" style="padding:12px;margin-bottom:8px;text-decoration:none;color:inherit;display:block">' +
            '<div style="display:flex;justify-content:space-between;align-items:start"><div style="font-size:14px;font-weight:500">'+Utils.esc(o.title)+'</div>'+Utils.statusBadge(o.status)+'</div>' +
            (o.customer_name?'<div style="font-size:12px;color:var(--text-muted)">'+Utils.esc(o.customer_name)+'</div>':'') +
            (o.status === 'waiting' && o.waiting_note
                ? '<div style="font-size:11px;color:#f59e0b;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+Utils.esc(o.waiting_note)+'">💬 '+Utils.esc(o.waiting_note)+'</div>'
                : '') +
            '<div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center">' +
            '<div><span style="font-size:12px;color:var(--accent)">'+Utils.money(o.total_income)+'</span></div>' +
            '<span style="font-size:12px;font-weight:600">'+o.overall_progress+'%</span></div>' +
            Utils.progressBar(o.overall_progress) +
            '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;display:flex;align-items:center;gap:6px">' +
            '<span>'+Utils.timeAgo(o.created_at)+'</span>' +
            (o.is_linked
                ? '<span style="font-size:10px;font-weight:600;color:#10b981;background:rgba(16,185,129,.1);padding:1px 7px;border-radius:6px;white-space:nowrap">🔗 Ulangan</span>'
                : '<span style="font-size:10px;font-weight:600;color:#94a3b8;background:rgba(148,163,184,.12);padding:1px 7px;border-radius:6px;white-space:nowrap">○ Ulanmagan</span>') +
            // Zamer holati — Ulanmagan/Ulangan yonida (backend has_zamer: true/false/null)
            (o.has_zamer === true
                ? '<span style="font-size:10px;font-weight:700;color:#059669;background:rgba(16,185,129,.12);padding:1px 7px;border-radius:6px;white-space:nowrap">✓ Zamer bor</span>'
                : (o.has_zamer === false
                    ? '<span style="font-size:10px;font-weight:700;color:#dc2626;background:rgba(239,68,68,.12);padding:1px 7px;border-radius:6px;white-space:nowrap">✗ Zamer yo\'q</span>'
                    : '')) +
            '</div></a>';
    },

    bind: function() {
        var addBtn = document.getElementById('btn-add-order');
        if (addBtn) addBtn.onclick = function() { Orders.showCreate(); };

        var searchEl = document.getElementById('order-search');
        var debounce;
        if (searchEl) searchEl.oninput = function() {
            clearTimeout(debounce);
            debounce = setTimeout(Orders._filterOrders, 150);
        };

        document.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.onclick = function() {
                document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active','ce-btn-secondary')});
                btn.classList.add('active','ce-btn-secondary');
                if (btn.dataset.filter === 'deleted') { Orders._showDeletedView(); }
                else { Orders._showNormalView(); Orders._filterOrders(); }
            };
        });

        Orders._bindPeriodFilter();

        // Default davr (SHU OY) filtri darhol qo'llanadi
        Orders._filterOrders();
    },

    // PeriodFilter — client-side (backendga so'rov yubormaydi). O'zgarsa faqat
    // filtr qatorini qayta chizamiz + ko'rinishni yangilaymiz (WS qayta emas).
    _bindPeriodFilter: function() {
        var wrap = document.getElementById('order-period-filter');
        if (!wrap) return;
        PeriodFilter.bind(wrap, Orders._st, Orders._months, function() {
            wrap.innerHTML = PeriodFilter.html(Orders._st, Orders._months);
            Orders._bindPeriodFilter();
            Orders._filterOrders();
        });
    },

    // ── O'chirilgan (endi tab orqali — bir bosishda ochiladi) ──
    _deletedLoaded: false,
    _deletedOrders: [],

    _showNormalView: function() {
        var normal = document.getElementById('normal-orders-view');
        var deleted = document.getElementById('deleted-logs-body');
        var search = document.getElementById('order-search');
        var pf = document.getElementById('order-period-filter');
        if (normal) normal.style.display = 'block';
        if (deleted) deleted.style.display = 'none';
        if (search) search.parentElement.style.display = '';
        if (pf) pf.style.display = '';
    },

    _showDeletedView: function() {
        var normal = document.getElementById('normal-orders-view');
        var deleted = document.getElementById('deleted-logs-body');
        var search = document.getElementById('order-search');
        var pf = document.getElementById('order-period-filter');
        if (normal) normal.style.display = 'none';
        if (deleted) deleted.style.display = 'block';
        if (search) search.parentElement.style.display = 'none';
        if (pf) pf.style.display = 'none';
        if (Orders._deletedLoaded) return;
        deleted.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">Yuklanmoqda...</div>';
        WS.send('orders.deleted', {}, function(msg) {
            if (!msg.ok) { deleted.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">'+Utils.esc(msg.error||'Xatolik')+'</div>'; return; }
            Orders._deletedOrders = msg.data.orders || [];
            Orders._deletedLoaded = true;
            Orders._renderDeletedLogs();
        });
    },

    _renderDeletedLogs: function() {
        var body = document.getElementById('deleted-logs-body');
        if (!body) return;
        var orders = Orders._deletedOrders;
        var h = '<input type="text" id="deleted-search" class="ce-input" placeholder="🔍 Qidirish (nom, narx)" style="width:100%;margin-bottom:8px;font-size:12px">';
        h += '<div id="deleted-list">';
        if (!orders.length) {
            h += '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">O\'chirilgan buyurtma yo\'q</div>';
        } else {
            orders.forEach(function(o) { h += Orders._deletedCard(o); });
        }
        h += '</div>';
        body.innerHTML = h;
        Orders._bindDeletedLogs();
    },

    _deletedCard: function(o) {
        var when = o.deleted_at ? Utils.datetime(o.deleted_at) : '';
        return '<div class="deleted-card" data-id="'+o.id+'" style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;opacity:.9">' +
            '<div style="display:flex;justify-content:space-between;align-items:start;gap:8px">' +
            '<div style="min-width:0;flex:1">' +
            '<div style="font-size:13px;font-weight:500">'+Utils.esc(o.title)+'</div>' +
            (o.customer_name?'<div style="font-size:11px;color:var(--text-muted)">'+Utils.esc(o.customer_name)+'</div>':'') +
            (when?'<div style="font-size:10px;color:var(--text-muted);margin-top:2px">🗑 '+when+'</div>':'') +
            (o.delete_note?'<div style="font-size:11px;color:var(--danger);margin-top:4px;background:rgba(220,38,38,.08);padding:4px 8px;border-radius:6px"><i class="fas fa-comment-dots"></i> '+Utils.esc(o.delete_note)+'</div>':'') +
            '</div>' +
            '<button class="ce-btn ce-btn-secondary btn-restore-order" data-id="'+o.id+'" style="font-size:11px;padding:5px 10px;flex-shrink:0"><i class="fas fa-undo"></i> Tiklash</button>' +
            '</div></div>';
    },

    _bindDeletedLogs: function() {
        var si = document.getElementById('deleted-search');
        if (si) si.oninput = Utils.debounce(function() {
            var q = si.value.toLowerCase().trim();
            document.querySelectorAll('.deleted-card').forEach(function(card) {
                var txt = card.textContent.toLowerCase();
                var match = !q || txt.indexOf(q) >= 0;
                card.style.display = match ? '' : 'none';
            });
        }, 200);
        document.querySelectorAll('.btn-restore-order').forEach(function(b) {
            b.onclick = function() {
                var id = parseInt(b.dataset.id);
                Modal.confirm("Tiklash", "Bu buyurtmani tiklaysizmi? Asosiy ro'yxatga qaytadi.", function() {
                    WS.send('order.restore', {id: id}, function(msg) {
                        if (!msg.ok) return Toast.error(msg.error);
                        Toast.success("Buyurtma tiklandi");
                        Orders.render();
                    });
                });
            };
        });
    },

    _orderClients: [],

    showCreate: function() {
        var clients = STATE.orderClients || Orders._orderClients || [];
        var tmpls = STATE.templates || [];

        var tmplCards = '';
        tmplCards += '<div class="tmpl-opt" data-tid="" style="padding:8px 12px;border:2px solid var(--accent);border-radius:8px;cursor:pointer;margin-bottom:6px;font-size:13px;font-weight:500;background:var(--accent);color:#fff"><i class="fas fa-ban" style="margin-right:6px"></i>Shablonsiz</div>';
        tmpls.forEach(function(t) {
            var steps = t.items.map(function(it){ return Utils.esc(it.icon)+' '+Utils.esc(it.title); }).join(' → ');
            tmplCards += '<div class="tmpl-opt" data-tid="'+t.id+'" style="padding:8px 12px;border:2px solid var(--border);border-radius:8px;cursor:pointer;margin-bottom:6px">';
            tmplCards += '<div style="font-size:13px;font-weight:600">'+Utils.esc(t.name)+'</div>';
            tmplCards += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">'+steps+'</div>';
            tmplCards += '</div>';
        });

        Modal.open("Yangi buyurtma",
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Sarlavha *</label><input type="text" name="title" class="ce-input" required style="width:100%"></div>' +

            '<div style="margin-bottom:12px">' +
            '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Mijoz</label>' +
            '<div style="position:relative" id="cust-picker">' +
            '<button type="button" id="btn-new-client" class="ce-btn ce-btn-secondary" style="width:100%;font-size:12px;padding:8px 12px;margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:6px"><i class="fas fa-user-plus"></i> Yangi mijoz qo\'shish</button>' +
            '<input type="text" id="cust-search" class="ce-input" style="width:100%" placeholder="Ism yoki telefon..." autocomplete="off">' +
            '<input type="hidden" name="customer_id" id="cust-id-input">' +
            '<div id="cust-dropdown" style="display:none;position:fixed;background:var(--card-bg,#fff);border:1px solid var(--border,#e2e8f0);border-radius:0 0 8px 8px;max-height:180px;overflow-y:auto;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.2)"></div>' +
            '</div>' +
            '</div>' +

            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px">Etap shabloni</label>' +
            '<input type="hidden" name="template_id" id="tmpl-id-input" value="">' +
            '<div id="tmpl-picker" style="max-height:200px;overflow-y:auto">' + tmplCards + '</div></div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-save-order">Yaratish</button>'});

        Utils.bindMoneyInputs();
        Orders._initCustPicker(clients);

        document.querySelectorAll('.tmpl-opt').forEach(function(el) {
            el.onclick = function() {
                document.querySelectorAll('.tmpl-opt').forEach(function(o) {
                    o.style.borderColor = 'var(--border)';
                    o.style.background = '';
                    o.style.color = '';
                });
                el.style.borderColor = 'var(--accent)';
                el.style.background = 'var(--accent)';
                el.style.color = '#fff';
                document.getElementById('tmpl-id-input').value = el.dataset.tid;
            };
        });

        document.getElementById('btn-new-client').onclick = function() { Orders._showNewClient(); };

        document.getElementById('btn-save-order').onclick = function() {
            var d = Modal.getFormData();
            if (!d.title||!d.title.trim()) return Toast.error('Sarlavha kiritilmagan');
            WS.send('order.create', {title:d.title, customer_id:d.customer_id?parseInt(d.customer_id):null, template_id:d.template_id?parseInt(d.template_id):null}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Buyurtma yaratildi');
                Router.go('/orders/'+msg.data.id);
            });
        };
    },

    _initCustPicker: function(clients) {
        var searchEl = document.getElementById('cust-search');
        var ddEl = document.getElementById('cust-dropdown');
        var hiddenEl = document.getElementById('cust-id-input');
        if (!searchEl) return;

        function positionDD() {
            var r = searchEl.getBoundingClientRect();
            ddEl.style.top = r.bottom + 'px';
            ddEl.style.left = r.left + 'px';
            ddEl.style.width = r.width + 'px';
        }

        function renderList(filter) {
            var q = (filter || '').toLowerCase();
            var filtered = clients.filter(function(c) {
                return !q || c.name.toLowerCase().indexOf(q) !== -1 || (c.phone && c.phone.indexOf(q) !== -1);
            });
            if (!filtered.length) {
                ddEl.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:var(--text-muted)">Topilmadi</div>';
            } else {
                ddEl.innerHTML = filtered.map(function(c) {
                    return '<div class="cust-opt" data-id="'+c.id+'" data-name="'+Utils.esc(c.name)+'" style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);transition:background .15s">' +
                        '<div style="font-weight:500">'+Utils.esc(c.name)+'</div>' +
                        (c.phone ? '<div style="font-size:11px;color:var(--text-muted)">'+Utils.esc(c.phone)+'</div>' : '') +
                        '</div>';
                }).join('');
            }
            positionDD();
            ddEl.style.display = 'block';
        }

        searchEl.onfocus = function() { renderList(searchEl.value); };
        searchEl.oninput = function() {
            hiddenEl.value = '';
            renderList(searchEl.value);
        };

        ddEl.onclick = function(e) {
            var opt = e.target.closest('.cust-opt');
            if (!opt) return;
            hiddenEl.value = opt.dataset.id;
            searchEl.value = opt.dataset.name;
            ddEl.style.display = 'none';
        };

        document.addEventListener('click', function _closeDD(e) {
            if (!e.target.closest('#cust-picker')) ddEl.style.display = 'none';
        });
    },

    _showNewClient: function() {
        var btn = document.getElementById('btn-new-client');
        var searchEl = document.getElementById('cust-search');
        var hiddenEl = document.getElementById('cust-id-input');
        var ddEl = document.getElementById('cust-dropdown');
        if (!btn) return;

        btn.style.display = 'none';
        searchEl.style.display = 'none';
        if (ddEl) ddEl.style.display = 'none';

        var form = document.createElement('div');
        form.id = 'nc-form';
        form.style.cssText = 'border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--card-bg)';
        form.innerHTML =
            '<div style="font-size:13px;font-weight:600;margin-bottom:8px">Yangi mijoz</div>' +
            '<input type="text" id="nc-name" class="ce-input" placeholder="Ism *" style="width:100%;margin-bottom:6px;font-size:13px">' +
            '<input type="text" id="nc-phone" class="ce-input" placeholder="Telefon" style="width:100%;margin-bottom:8px;font-size:13px">' +
            '<div style="display:flex;gap:6px">' +
            '<button class="ce-btn ce-btn-primary" id="nc-save" style="flex:1;font-size:12px;padding:8px">Saqlash</button>' +
            '<button class="ce-btn ce-btn-secondary" id="nc-cancel" style="font-size:12px;padding:8px">Bekor</button>' +
            '</div>';
        btn.parentNode.insertBefore(form, searchEl);

        document.getElementById('nc-name').focus();

        document.getElementById('nc-cancel').onclick = function() {
            form.remove();
            btn.style.display = '';
            searchEl.style.display = '';
        };

        document.getElementById('nc-save').onclick = function() {
            var name = (document.getElementById('nc-name').value || '').trim();
            var phone = (document.getElementById('nc-phone').value || '').trim();
            if (!name) return Toast.error('Ism kiritilmagan');
            WS.send('client.create', {name: name, phone: phone}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                var c = msg.data;
                Orders._orderClients.push(c);
                if (STATE.orderClients) STATE.orderClients.push(c);
                hiddenEl.value = c.id;
                searchEl.value = c.name;
                form.remove();
                btn.style.display = '';
                searchEl.style.display = '';
                Toast.success('Mijoz qo\'shildi: ' + c.name);
            });
        };
    },
};
