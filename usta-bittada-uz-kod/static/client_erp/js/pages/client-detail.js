/* client_erp/js/pages/client-detail.js — Mijoz tafsiloti + uning buyurtmalari */
var ClientDetail = {
    render: function(id) {
        var app = document.getElementById('app');
        app.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">Yuklanmoqda...</div>';
        WS.send('page.client_detail', {id: parseInt(id)}, function(msg) {
            if (!msg.ok) {
                app.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">' +
                    Utils.esc(msg.error || 'Xatolik') +
                    '<br><br><a href="#/clients" style="color:var(--accent);text-decoration:none">← Mijozlar</a></div>';
                return;
            }
            ClientDetail._customer = msg.data.customer || {};
            app.innerHTML = ClientDetail.template(msg.data);
        });
    },

    template: function(d) {
        var c = d.customer || {};
        var orders = d.orders || [];
        var stats = d.stats || {count: 0, total_estimated: 0};
        var h = '';

        // Back
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">';
        h += '<a href="#/clients" style="font-size:18px;text-decoration:none">←</a>';
        h += '<h2 style="font-size:17px;margin:0;flex:1">Mijoz</h2></div>';

        // Customer card
        h += '<div class="ce-card" style="padding:14px;margin-bottom:14px;display:flex;align-items:center;gap:12px">';
        h += '<div style="width:50px;height:50px;border-radius:50%;background:var(--secondary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:16px;flex-shrink:0">' + Utils.initials(c.name) + '</div>';
        h += '<div style="flex:1;min-width:0">';
        h += '<div style="font-size:16px;font-weight:600">' + Utils.esc(c.name) + '</div>';
        if (c.phone) h += '<div style="font-size:13px;color:var(--text-muted)">' + Utils.esc(c.phone) + '</div>';
        if (c.address) h += '<div style="font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + Utils.esc(c.address) + '</div>';
        h += '</div>';
        if (c.phone) h += '<a href="tel:' + Utils.esc(c.phone) + '" class="ce-btn ce-btn-secondary" style="padding:8px 12px;font-size:13px"><i class="fas fa-phone"></i></a>';
        h += '<button class="ce-btn ce-btn-secondary" style="padding:8px 12px;font-size:13px" onclick="ClientDetail._openEdit()" title="Tahrirlash"><i class="fas fa-pen"></i></button>';
        h += '</div>';

        // Stats
        h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px">';
        h += '<div class="ce-card" style="padding:10px;text-align:center"><div style="font-size:11px;color:var(--text-muted)">Buyurtmalar</div><div style="font-weight:700;font-size:16px">' + stats.count + '</div></div>';
        h += '<div class="ce-card" style="padding:10px;text-align:center"><div style="font-size:11px;color:var(--text-muted)">Jami shartnoma</div><div style="font-weight:700;font-size:15px;color:#8b5cf6">' + Utils.money(stats.total_estimated) + '</div></div>';
        h += '</div>';

        // Orders
        h += '<h3 style="font-size:14px;margin:0 0 10px">Buyurtmalari</h3>';
        if (!orders.length) {
            h += '<div class="ce-empty"><div class="ce-empty-icon">📦</div><p>Bu mijozda buyurtma yo\'q</p></div>';
        } else {
            orders.forEach(function(o) { h += ClientDetail._orderCard(o); });
        }
        return h;
    },

    _openEdit: function() {
        var c = ClientDetail._customer || {};
        var body =
            '<div style="margin-bottom:10px"><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Ism</label>' +
            '<input id="ced-name" class="ce-input" style="width:100%" value="' + Utils.esc(c.name || '') + '"></div>' +
            '<div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Telefon</label>' +
            '<input id="ced-phone" class="ce-input" style="width:100%" value="' + Utils.esc(c.phone || '') + '" placeholder="+998..."></div>';
        Modal.open('Mijozni tahrirlash', body, {
            footer: '<button class="ce-btn ce-btn-secondary" onclick="Modal.close()">Bekor</button>' +
                    '<button class="ce-btn ce-btn-primary" id="ced-save">Saqlash</button>'
        });
        document.getElementById('ced-save').onclick = function() {
            var name = (document.getElementById('ced-name').value || '').trim();
            var phone = (document.getElementById('ced-phone').value || '').trim();
            if (!name) { Toast.error('Ism kiritilmagan'); return; }
            var btn = document.getElementById('ced-save'); btn.disabled = true;
            WS.send('client.update', {id: c.id, name: name, phone: phone}, function(msg) {
                if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); btn.disabled = false; return; }
                Modal.close();
                Toast.success('Saqlandi');
                ClientDetail.render(c.id);
            });
        };
    },

    _orderCard: function(o) {
        return '<a href="#/orders/' + o.id + '" class="ce-card" style="padding:12px;margin-bottom:8px;text-decoration:none;color:inherit;display:block">' +
            '<div style="display:flex;justify-content:space-between;align-items:start"><div style="font-size:14px;font-weight:500">' + Utils.esc(o.title) + '</div>' + Utils.statusBadge(o.status) + '</div>' +
            '<div style="margin-top:8px;display:flex;justify-content:flex-end;align-items:center">' +
            '<span style="font-size:12px;font-weight:600">' + o.overall_progress + '%</span></div>' +
            Utils.progressBar(o.overall_progress) +
            '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">🕒 ' + Utils.datetime(o.created_at) + (o.mc_order_id ? ' · 🏭' : '') + '</div></a>';
    },
};
