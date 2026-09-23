/* client_erp/js/pages/mebelcity.js — MebelCity orders (read-only) */
var MebelCity = {
    _stateMap: {draft:'Qoralama',pending:'Kutilmoqda',in_progress:'Jarayonda',done:'Tugallangan',cancel:'Bekor',completed:'Tugallangan',cancelled:'Bekor'},
    _stateColor: {draft:'#94a3b8',pending:'#f59e0b',in_progress:'var(--accent)',done:'#10b981',cancel:'var(--danger)',completed:'#10b981',cancelled:'var(--danger)'},
    _stepStateMap: {pending:'Kutilmoqda',in_progress:'Jarayonda',done:'Tugallandi',check:'Tekshirilmoqda',error:'Qayta boshlash',cancel:'Bekor',fix:'Tuzatilmoqda',paused:"To'xtatildi"},
    _stepIcon: {pending:'⚪',in_progress:'🔵',done:'🟢',check:'🟡',error:'🔴',cancel:'⚫',fix:'🟠',paused:'⏸'},
    _deliveryMap: {not_ready:'Tayyor emas',ready:'Ishlab chiqarish tayyor',packing:'Qadoqlanmoqda',packed:'Qadoqlangan',on_route:"Yo'lda",delivered:'Yetkazildi',installed:'Montaj qilindi',returned:'Qaytarildi',on_hold:"To'xtatildi"},
    _deliveryColor: {not_ready:'#94a3b8',ready:'#3b82f6',packing:'#f59e0b',packed:'#8b5cf6',on_route:'#f97316',delivered:'#10b981',installed:'#10b981',returned:'#ef4444',on_hold:'#94a3b8'},
    _fieldMap: {state:'Holat',delivery_state:'Yetkazish'},

    render: function() {
        var app = document.getElementById('app');
        app.innerHTML = Skeleton.genericList();
        WS.send('page.mebelcity', {}, function(msg) {
            if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
            STATE.mcOrders = msg.data.orders || [];
            app.innerHTML = MebelCity.template(STATE.mcOrders);
            MebelCity.bind();
        });
    },

    template: function(orders) {
        var h = '<h2 style="font-size:18px;margin:0 0 14px">🏭 MebelCity buyurtmalar</h2>';
        if (!orders.length) {
            h += '<div class="ce-empty"><div class="ce-empty-icon">🏭</div><p>MebelCity buyurtmalari yo\'q</p></div>';
            return h;
        }
        orders.forEach(function(o) {
            var state = o.state || 'pending';
            var stateLabel = o.state_label || MebelCity._stateMap[state] || state;
            var stateColor = MebelCity._stateColor[state] || 'var(--text-muted)';
            h += '<div class="ce-card mc-order-card" data-hash="'+Utils.esc(o.order_hash)+'" style="padding:12px;margin-bottom:8px;cursor:pointer">';
            h += '<div style="display:flex;justify-content:space-between;align-items:start">';
            h += '<div><div style="font-size:14px;font-weight:500">#'+Utils.esc(o.order_hash)+'</div>';
            if (o.partner_name) h += '<div style="font-size:12px;color:var(--text-muted)">'+Utils.esc(o.partner_name)+'</div>';
            if (o.owner_name) h += '<div style="font-size:11px;color:var(--text-muted)">👤 '+Utils.esc(o.owner_name)+'</div>';
            h += '</div>';
            h += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">';
            h += '<span style="font-size:11px;padding:3px 8px;border-radius:10px;background:'+stateColor+';color:#fff">'+stateLabel+'</span>';
            if (o.delivery_state && o.delivery_state !== 'not_ready') {
                var dlLabel = o.delivery_label || MebelCity._deliveryMap[o.delivery_state] || o.delivery_state;
                var dlColor = MebelCity._deliveryColor[o.delivery_state] || '#94a3b8';
                h += '<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:'+dlColor+'20;color:'+dlColor+';font-weight:600">'+dlLabel+'</span>';
            }
            h += '</div></div>';
            if (o.total_sum) {
                h += '<div style="margin-top:6px;font-size:13px"><span style="color:var(--accent);font-weight:600">'+Utils.money(o.total_sum)+' so\'m</span></div>';
            }
            if (o.progress !== undefined && o.progress !== null) {
                h += '<div style="margin-top:6px;display:flex;align-items:center;gap:8px">';
                h += '<div style="flex:1">'+Utils.progressBar(o.progress)+'</div>';
                h += '<span style="font-size:11px;font-weight:600;color:var(--text-muted)">'+o.progress+'%</span>';
                h += '</div>';
            }
            // Chek mahsulotlari
            if (o.sale_brief) {
                var sb = o.sale_brief;
                h += '<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:11px">';
                h += '<div style="font-weight:700;color:#1e40af;margin-bottom:4px;font-size:10px"><i class="fas fa-receipt" style="margin-right:4px"></i>Chek mahsulotlari</div>';
                if (sb.lines && sb.lines.length) {
                    sb.lines.forEach(function(l) {
                        h += '<div style="display:flex;gap:6px;padding:2px 0;border-bottom:1px solid #f1f5f9">';
                        h += '<span style="flex:1;color:#334155">'+Utils.esc(l.name)+'</span>';
                        h += '<span style="color:#94a3b8;white-space:nowrap;font-size:10px">'+(l.price?Math.round(l.price).toLocaleString('ru-RU'):'')+'</span>';
                        h += '<span style="font-weight:700;color:#059669;white-space:nowrap">'+Math.ceil(l.qty)+' '+Utils.esc(l.unit)+'</span>';
                        h += '<span style="color:#0f766e;white-space:nowrap;font-weight:700;font-size:10px">'+(l.total?Math.round(l.total).toLocaleString('ru-RU'):'')+'</span>';
                        h += '</div>';
                    });
                }
                if (sb.services && sb.services.length) {
                    sb.services.forEach(function(s) {
                        h += '<div style="display:flex;gap:6px;padding:2px 0;border-bottom:1px solid #f1f5f9">';
                        h += '<span style="flex:1;color:#64748b"><i class="fas fa-wrench" style="font-size:8px;margin-right:3px;opacity:.5"></i>'+Utils.esc(s.name)+'</span>';
                        h += '<span style="font-weight:600;color:#d97706;white-space:nowrap">'+Math.ceil(s.qty)+' '+Utils.esc(s.unit)+'</span>';
                        h += '</div>';
                    });
                }
                h += '</div>';
            }
            // Fayllar
            if (o.files_info && o.files_info.length) {
                var extColors = {project:{bg:'#ede9fe',text:'#6d28d9',border:'#c4b5fd'},lc4:{bg:'#fef9c3',text:'#854d0e',border:'#fde68a'},gibcut:{bg:'#f0fdf4',text:'#15803d',border:'#86efac'}};
                h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">';
                o.files_info.forEach(function(f) {
                    var c = extColors[f.ext] || {bg:'#f1f5f9',text:'#475569',border:'#cbd5e1'};
                    var qtyBadge = (f.ext === 'gibcut' && f.qty) ? '<span style="background:'+c.text+';color:#fff;border-radius:4px;padding:0 3px;font-size:8px;margin-left:2px">'+f.qty+' list</span>' : '';
                    h += '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:600;background:'+c.bg+';color:'+c.text+';border:1px solid '+c.border+'">';
                    h += '<i class="fas fa-file-alt" style="font-size:8px"></i>'+Utils.esc(f.name)+qtyBadge+'</span>';
                });
                h += '</div>';
            }
            var meta = [];
            if (o.is_urgent) meta.push('🔥 Shoshilinch');
            if (o.deadline) meta.push('📅 '+Utils.date(o.deadline));
            if (o.created_at) meta.push(Utils.timeAgo(o.created_at));
            if (meta.length) h += '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">'+meta.join(' · ')+'</div>';
            h += '</div>';
        });
        return h;
    },

    bind: function() {
        document.querySelectorAll('.mc-order-card').forEach(function(card) {
            card.addEventListener('click', function(e) {
                e.preventDefault();
                var hash = card.dataset.hash;
                if (hash) MebelCity.openOrder(hash);
            });
        });
    },

    openOrder: function(hash) {
        var ov = document.createElement('div');
        ov.className = 'mc-iframe-overlay';
        ov.innerHTML =
            '<div class="mc-iframe-wrap">' +
                '<div class="mc-iframe-header">' +
                    '<button class="mc-iframe-back" onclick="MebelCity.closeOrder()"><i class="fas fa-arrow-left"></i></button>' +
                    '<span class="mc-iframe-title">#' + Utils.esc(hash) + '</span>' +
                    '<button class="mc-iframe-close" onclick="MebelCity.closeOrder()">&times;</button>' +
                '</div>' +
                '<div class="mc-iframe-body">' +
                    '<div class="mc-iframe-loading"><div class="mc-iframe-spinner"></div></div>' +
                    '<iframe src="/order/' + Utils.esc(hash) + '/" frameborder="0"></iframe>' +
                '</div>' +
            '</div>';
        document.body.appendChild(ov);
        document.body.classList.add('modal-open');
        this._overlay = ov;
        var iframe = ov.querySelector('iframe');
        var loading = ov.querySelector('.mc-iframe-loading');
        iframe.onload = function() { loading.style.display = 'none'; };
        ov.addEventListener('click', function(e) { if (e.target === ov) MebelCity.closeOrder(); });
        this._escHandler = function(e) { if (e.key === 'Escape') MebelCity.closeOrder(); };
        document.addEventListener('keydown', this._escHandler);
    },

    closeOrder: function() {
        if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
            document.body.classList.remove('modal-open');
        }
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
    },
};
