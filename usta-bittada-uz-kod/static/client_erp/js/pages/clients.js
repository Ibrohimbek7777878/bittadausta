/* client_erp/js/pages/clients.js — Clients CRUD.
   Davr filtri: PeriodFilter (ESKI "Craft Light" ce- uslub), default SHU OY.
   MUHIM: filtr "shu oyda BUYURTMA berganlar" bo'yicha — har mijozda
   order_months (['YYYY-MM',...]) va last_order_at bor. Davr SHU OY/aniq oy/
   custom/yil bo'lsa: o'sha davrda buyurtma bergan (order_months yoki last_order_at
   mos) YOKI o'sha davrda yaratilgan mijozlar ko'rinadi. Qidiruv saqlanadi.
   Barchasi client-side (page.clients period QABUL QILMAYDI). */
var Clients = {
    _st: null,       // PeriodFilter holati {period, ym, date_from, date_to}
    _months: {},     // "Aniq oy…" dropdown uchun (order + created oylari)
    _map: {},        // id → mijoz obyekti (client-side filtr uchun)

    render: function() {
        var app = document.getElementById('app');
        app.innerHTML = Skeleton.clientsList();
        Clients._st = PeriodFilter.init();   // default: Shu oy
        WS.send('page.clients', {}, function(msg) {
            if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
            STATE.clients = msg.data.clients || [];
            Clients._map = {};
            STATE.clients.forEach(function(c){ Clients._map[c.id] = c; });
            Clients._months = Clients._buildMonths(STATE.clients);
            app.innerHTML = Clients.template(STATE.clients);
            Clients.bind();
        });
    },

    // Dropdown uchun oylar: har mijozning buyurtma oylari + yaratilgan oyi
    _buildMonths: function(clients) {
        var m = {};
        clients.forEach(function(c){
            (c.order_months || []).forEach(function(ym){ if (ym) m[ym] = (m[ym] || 0) + 1; });
            var cm = (c.created_at || '').slice(0, 7);
            if (cm) m[cm] = (m[cm] || 0) + 1;
        });
        return m;
    },

    template: function(clients) {
        var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
        h += '<h2 style="font-size:18px;margin:0">Mijozlarim</h2>';
        h += '<button class="ce-btn ce-btn-primary" id="btn-add-client" style="font-size:13px;padding:8px 16px"><i class="fas fa-plus"></i> Qo\'shish</button></div>';
        h += '<input type="text" id="client-search" class="ce-input" placeholder="Qidirish..." style="width:100%;margin-bottom:12px;font-size:14px">';

        // Professional davr filtri (PeriodFilter) — default SHU OY
        h += '<div id="clients-period" style="margin-bottom:8px">' + PeriodFilter.html(Clients._st, Clients._months) + '</div>';
        h += '<div id="clients-count" style="font-size:12px;color:var(--text-muted);margin-bottom:10px"></div>';

        h += '<div id="clients-list">';
        if (!clients.length) {
            h += '<div class="ce-empty"><div class="ce-empty-icon">👥</div><p>Hali mijoz qo\'shilmagan</p></div>';
        } else {
            clients.forEach(function(c) { h += Clients._card(c); });
        }
        h += '</div>';
        h += '<div id="clients-noresult" class="ce-empty" style="display:none"><div class="ce-empty-icon">🔍</div><p>Bu davrda mijoz topilmadi</p></div>';
        return h;
    },

    _card: function(c) {
        var countBadge = c.order_count ? '<span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:8px;background:rgba(99,102,241,.12);color:var(--accent);flex-shrink:0">📦 '+c.order_count+'</span>' : '';
        return '<div class="ce-card client-card" data-id="'+c.id+'" style="padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:12px;cursor:pointer">' +
            '<div style="width:42px;height:42px;border-radius:50%;background:var(--secondary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;flex-shrink:0">'+Utils.initials(c.name)+'</div>' +
            '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:500;display:flex;align-items:center;gap:6px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+Utils.esc(c.name)+'</span>'+countBadge+'</div>' +
            (c.phone?'<div style="font-size:12px;color:var(--text-muted)">'+Utils.esc(c.phone)+'</div>':'') +
            (c.address?'<div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+Utils.esc(c.address)+'</div>':'') +
            '</div><div style="display:flex;gap:6px;flex-shrink:0">' +
            (c.phone?'<a href="tel:'+Utils.esc(c.phone)+'" class="ce-btn ce-btn-secondary" style="padding:6px 10px;font-size:12px"><i class="fas fa-phone"></i></a>':'') +
            '<button class="ce-btn ce-btn-danger btn-del-client" data-id="'+c.id+'" style="padding:6px 10px;font-size:12px"><i class="fas fa-trash"></i></button>' +
            '</div></div>';
    },

    // ── Mijoz tanlangan davrga tushadimi? (buyurtma oyi / oxirgi buyurtma / yaratilgan) ──
    _matches: function(c, st) {
        var b = PeriodFilter.bounds(st);
        if (!b) return true;                       // Hammasi — barcha mijoz
        // 1) Buyurtma bergan oylaridan biri davrga tushsa
        var months = c.order_months || [];
        for (var i = 0; i < months.length; i++) {
            if (Clients._monthInRange(months[i], b)) return true;
        }
        // 2) Oxirgi buyurtma sanasi davrga tushsa
        if (c.last_order_at && PeriodFilter.inRange(c.last_order_at, st)) return true;
        // 3) Mijoz shu davrda yaratilgan bo'lsa (buyurtma bo'lmasa ham)
        if (c.created_at && PeriodFilter.inRange(c.created_at, st)) return true;
        return false;
    },

    // 'YYYY-MM' oyi [b.start, b.end] oralig'i bilan kesishadimi?
    _monthInRange: function(ym, b) {
        var p = (ym || '').split('-');
        if (p.length < 2) return false;
        var lastDay = new Date(+p[0], +p[1], 0).getDate();
        var mStart = ym + '-01';
        var mEnd = ym + '-' + (lastDay < 10 ? '0' : '') + lastDay;
        return mStart <= b.end && mEnd >= b.start;
    },

    bind: function() {
        var addBtn = document.getElementById('btn-add-client');
        if (addBtn) addBtn.onclick = function() { Clients.showAdd(); };

        Clients._bindCards();

        var si = document.getElementById('client-search');
        if (si) si.oninput = Utils.debounce(Clients._filterClients, 200);

        var box = document.getElementById('clients-period');
        if (box) PeriodFilter.bind(box, Clients._st, Clients._months, Clients._onPeriodChange);

        Clients._filterClients();   // default (SHU OY) filtrni qo'llash
    },

    // Kartalar bosilishi/o'chirilishi (rebuild yoki qo'shishdan keyin qayta ulanadi)
    _bindCards: function() {
        document.querySelectorAll('.btn-del-client').forEach(function(b) {
            b.onclick = function(e) {
                e.stopPropagation();
                Modal.confirm("O'chirish", "Bu mijozni o'chirasizmi?", function() { Clients.del(b.dataset.id); });
            };
        });
        document.querySelectorAll('.client-card').forEach(function(card) {
            card.onclick = function(e) {
                if (e.target.closest('a, button')) return;
                Router.go('/clients/' + card.dataset.id);
            };
        });
    },

    // Davr o'zgarsa: filtr barini qayta chizib (aktiv holat), qayta ulab, filtrlash
    _onPeriodChange: function() {
        var box = document.getElementById('clients-period');
        if (box) {
            box.innerHTML = PeriodFilter.html(Clients._st, Clients._months);
            PeriodFilter.bind(box, Clients._st, Clients._months, Clients._onPeriodChange);
        }
        Clients._filterClients();
    },

    _filterClients: function() {
        var si = document.getElementById('client-search');
        var q = si ? si.value.toLowerCase().trim() : '';
        var st = Clients._st;
        var shown = 0;
        document.querySelectorAll('.client-card').forEach(function(card) {
            var c = Clients._map[card.dataset.id];
            var ok = c ? Clients._matches(c, st) : true;
            if (ok && q) ok = card.textContent.toLowerCase().indexOf(q) >= 0;
            card.style.display = ok ? '' : 'none';
            if (ok) shown++;
        });
        var cnt = document.getElementById('clients-count');
        if (cnt) cnt.textContent = shown + ' mijoz · ' + PeriodFilter.label(st);
        var nr = document.getElementById('clients-noresult');
        if (nr) nr.style.display = (shown === 0 && (STATE.clients || []).length) ? '' : 'none';
    },

    showAdd: function() {
        Modal.open("Yangi mijoz",
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Ism *</label><input type="text" name="name" class="ce-input" required style="width:100%"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Telefon</label><input type="tel" name="phone" class="ce-input" style="width:100%"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Manzil</label><input type="text" name="address" class="ce-input" style="width:100%"></div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-save-client">Saqlash</button>'});
        document.getElementById('btn-save-client').onclick = function() {
            var d = Modal.getFormData();
            if (!d.name || !d.name.trim()) return Toast.error('Ism kiritilmagan');
            WS.send('client.create', d, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                STATE.clients.unshift(msg.data);
                Clients._map[msg.data.id] = msg.data;
                Modal.close();
                Toast.success("Mijoz qo'shildi");
                var list = document.getElementById('clients-list');
                var empty = list.querySelector('.ce-empty');
                if (empty) empty.remove();
                list.insertAdjacentHTML('afterbegin', Clients._card(msg.data));
                Clients._bindCards();
                Clients._filterClients();   // yangi mijoz joriy davrga mos bo'lsa ko'rinadi
            });
        };
    },

    del: function(id) {
        WS.send('client.delete', {id:parseInt(id)}, function(msg) {
            if (!msg.ok) return Toast.error(msg.error);
            STATE.clients = STATE.clients.filter(function(c){return c.id!==parseInt(id)});
            delete Clients._map[id];
            var card = document.querySelector('.client-card[data-id="'+id+'"]');
            if (card) { card.style.transition='all .3s'; card.style.opacity='0'; card.style.transform='translateX(20px)'; setTimeout(function(){card.remove(); Clients._filterClients();}, 300); }
            Toast.success("Mijoz o'chirildi");
        });
    },
};
