/* client_erp/js/pages/order-detail.js — Order detail SPA page */
var OrderDetail = {
    _orderId: null,
    _data: null,
    _bomRetry: 0,

    render: function(id, _isRetry) {
        this._orderId = parseInt(id);
        if (!_isRetry) this._bomRetry = 0;   // yangi navigatsiya — BOM retry hisoblagichni nollash
        var app = document.getElementById('app');
        // Skeleton faqat YANGI ochilishda — BOM retry'da emas (aks holda panel miltillaydi "tok ochib yonganday")
        if (!_isRetry) app.innerHTML = Skeleton.orderDetail();
        WS.send('page.order', {id: this._orderId}, function(msg) {
            if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); Router.go('/orders'); return; }
            OrderDetail._data = msg.data;
            STATE.currentOrder = msg.data;
            STATE.templates = msg.data.templates || [];
            app.innerHTML = OrderDetail.template(msg.data);
            OrderDetail.bind();
            // Tugallanmagan AI rasm-tahrir taski bo'lsa pollingni davom ettirish
            if (window.Gallery && Gallery.aiResume) {
                try { Gallery.aiResume(msg.data.id); } catch (e) {}
            }
            // Etap tugatish/skip/reopen — sahifa sakramasin: saqlangan scrollni tiklash
            if (OrderDetail._keepScrollY != null) {
                var _y = OrderDetail._keepScrollY;
                OrderDetail._keepScrollY = null;
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() { window.scrollTo(0, _y); });
                });
            }
        });
    },

    // Scroll holatini saqlab qayta render qilish (etap amallaridan keyin sakramaslik uchun)
    _renderKeepScroll: function() {
        OrderDetail._keepScrollY = window.scrollY || document.documentElement.scrollTop || 0;
        OrderDetail.render(OrderDetail._orderId, true);
    },

    template: function(d) {
        var h = '';
        // Back + Title
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">';
        h += '<a href="#/orders" style="font-size:18px;text-decoration:none">←</a>';
        h += '<div style="flex:1"><h2 style="font-size:17px;margin:0">'+Utils.esc(d.title)+'</h2>';
        if (d.customer) h += '<a href="#/clients/'+d.customer.id+'" style="display:block;font-size:12px;color:var(--text-muted);text-decoration:none">👤 '+Utils.esc(d.customer.name)+(d.customer.phone?' · '+Utils.esc(d.customer.phone):'')+'</a>';
        h += '</div>';
        if (d.is_owner) {
            h += '<select id="order-status" class="ce-input" style="font-size:12px;padding:4px 8px;width:auto">';
            ['new','waiting','in_progress','at_mebelcity','ready','delivered','cancelled'].forEach(function(s) {
                h += '<option value="'+s+'"'+(d.status===s?' selected':'')+'>'+OrderDetail._statusLabel(s)+'</option>';
            });
            h += '</select>';
        } else {
            h += Utils.statusBadge(d.status);
        }
        h += '</div>';

        // Dates
        h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">📅 Yaratilgan: '+Utils.date(d.created_at);
        if (d.delivered_at) h += ' &nbsp;·&nbsp; ✅ Topshirilgan: '+Utils.date(d.delivered_at);
        h += '</div>';

        // Progress
        h += '<div style="margin-bottom:14px">';
        h += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>Jarayon</span><span id="od-progress">'+d.overall_progress+'%</span></div>';
        h += '<div id="od-progress-bar">'+Utils.progressBar(d.overall_progress)+'</div></div>';

        // Stats — money_hidden bo'lsa moliyaviy kartalar UMUMAN ko'rsatilmaydi
        // (server ham bu maydonlarni yubormaydi — can_see_money=False)
        if (!d.money_hidden) {
            var shartnoma = parseInt(d.zaklad_amount) || 0;
            var kirim = parseInt(d.total_income) || 0;
            var chiqim = parseInt(d.total_expense) || 0;
            var profit = kirim - chiqim;
            var pColor = profit < 0 ? 'var(--danger)' : 'var(--accent)';
            var qarz = shartnoma > 0 ? Math.max(0, shartnoma - kirim) : 0;
            var qarzText = shartnoma > 0 ? (qarz > 0 ? Utils.money(qarz) : "To'langan") : '—';
            var qarzColor = qarz > 0 ? 'var(--danger)' : 'var(--accent)';
            h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:14px">';
            h += '<div class="ce-card od-zaklad-card" style="padding:7px;text-align:center;cursor:pointer" title="Shartnoma summasi"><div style="font-size:9px;color:var(--text-muted)">Shartnoma</div><div style="font-weight:700;font-size:11px;color:#8b5cf6" id="od-zaklad">'+(shartnoma ? Utils.money(shartnoma) : '—')+'</div></div>';
            h += '<div class="ce-card od-income-card" style="padding:7px;text-align:center"><div style="font-size:9px;color:var(--text-muted)">Kirim</div><div style="font-weight:700;font-size:11px;color:var(--accent)" id="od-income">'+Utils.money(kirim)+'</div></div>';
            h += '<div class="ce-card" style="padding:7px;text-align:center"><div style="font-size:9px;color:var(--text-muted)">Qarz</div><div style="font-weight:700;font-size:11px;color:'+qarzColor+'">'+qarzText+'</div></div>';
            h += '<div class="ce-card od-expense-card" style="padding:7px;text-align:center"><div style="font-size:9px;color:var(--text-muted)">Chiqim</div><div style="font-weight:700;font-size:11px;color:var(--danger)" id="od-expense">'+Utils.money(chiqim)+'</div></div>';
            h += '<div class="ce-card od-profit-card" style="padding:7px;text-align:center;cursor:pointer" title="Foyda taqsimlash"><div style="font-size:9px;color:var(--text-muted)">Foyda</div><div style="font-weight:700;font-size:11px;color:'+pColor+'">'+(profit<0?'-':'')+Utils.money(Math.abs(profit))+'</div></div>';
            h += '</div>';
        }

        // Action buttons
        var showIncome = (d.is_owner || d.user_role === 'manager') && !d.money_hidden;
        var showExpense = d.is_owner || d.user_role === 'manager' || d.can_add_expense;
        var canRevert = !!(STATE.user && STATE.user.can_revert_finance);
        if (showIncome || showExpense || canRevert) {
            h += '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">';
            if (showIncome) h += '<button class="ce-btn ce-btn-primary" id="btn-add-income" style="font-size:12px;padding:6px 12px"><i class="fas fa-plus"></i> Kirim</button>';
            if (showExpense) h += '<button class="ce-btn ce-btn-secondary" id="btn-add-expense" style="font-size:12px;padding:6px 12px"><i class="fas fa-minus"></i> Chiqim</button>';
            if (canRevert) h += '<button class="ce-btn ce-btn-secondary" id="btn-revert-income" style="font-size:12px;padding:6px 12px"><i class="fas fa-rotate-left"></i> Kirim qaytarish</button>';
            if (canRevert) h += '<button class="ce-btn ce-btn-secondary" id="btn-revert-expense" style="font-size:12px;padding:6px 12px"><i class="fas fa-rotate-left"></i> Chiqim qaytarish</button>';
            if (d.is_owner) h += '<button class="ce-btn ce-btn-secondary" id="btn-add-stage" style="font-size:12px;padding:6px 12px"><i class="fas fa-layer-group"></i> Etap</button>';
            if (d.is_owner) h += '<button class="ce-btn ce-btn-secondary" id="btn-contract" style="font-size:12px;padding:6px 12px"><i class="fas fa-file-signature"></i> Shartnoma</button>';
            if (d.is_owner) h += '<button class="ce-btn ce-btn-secondary" id="btn-share-order" style="font-size:12px;padding:6px 12px"><i class="fas fa-share-alt"></i> Ulashish</button>';
            if (d.is_owner) h += '<button class="ce-btn ce-btn-danger" id="btn-delete-order" style="font-size:12px;padding:6px 12px"><i class="fas fa-trash"></i> O\'chirish</button>';
            h += '</div>';
        }

        // Stages
        h += '<div id="od-stages">';
        if (d.stages && d.stages.length) {
            h += '<h3 style="font-size:14px;margin:0 0 10px">Etaplar</h3>';
            d.stages.forEach(function(s) { h += OrderDetail._stageCard(s, d.is_owner, d.user_role, d.can_complete_stage); });
        } else if (d.is_owner && d.templates && d.templates.length) {
            h += '<div class="ce-card" style="padding:16px;text-align:center;margin-bottom:12px">';
            h += '<p style="font-size:13px;color:var(--text-muted);margin:0 0 10px">Etaplar yo\'q. Shablon qo\'llang:</p>';
            h += '<select id="tmpl-select" class="ce-input" style="width:auto;display:inline-block;font-size:12px;margin-right:8px">';
            d.templates.forEach(function(t) { h += '<option value="'+t.id+'">'+Utils.esc(t.name)+'</option>'; });
            h += '</select><button class="ce-btn ce-btn-primary" id="btn-apply-tmpl" style="font-size:12px;padding:6px 12px">Qo\'llash</button></div>';
        }
        h += '</div>';

        // Vizualizatsiya
        h += '<div style="margin-top:14px">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        h += '<h3 style="font-size:14px;margin:0">🌐 Vizualizatsiya</h3>';
        h += '<a href="#/vizualizatsiya" style="font-size:11px;color:var(--accent);text-decoration:none"><i class="fas fa-external-link-alt" style="margin-right:3px"></i>Barchasi</a>';
        h += '</div>';
        if (d.panoramas && d.panoramas.length) {
            h += '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px">';
            d.panoramas.forEach(function(p) {
                h += '<div class="od-panorama-card" data-uuid="'+Utils.esc(p.uuid)+'" style="flex:0 0 120px;cursor:pointer;border-radius:10px;overflow:hidden;border:1px solid var(--border);transition:transform .15s">';
                h += '<div style="position:relative;aspect-ratio:1;background:#f1f5f9">';
                if (p.thumbnail) h += '<img src="'+Utils.esc(p.thumbnail)+'" style="width:100%;height:100%;object-fit:cover" loading="lazy">';
                else h += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:28px"><i class="fas fa-globe-americas"></i></div>';
                h += '<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,.6);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;font-weight:700">360°</div>';
                if (p.panorama_count > 1) h += '<div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px"><i class="fas fa-images"></i> '+p.panorama_count+'</div>';
                h += '</div>';
                h += '<div style="padding:4px 6px;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+Utils.esc(p.name || 'Panorama')+'</div>';
                h += '</div>';
            });
            h += '</div>';
        } else {
            h += '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Vizualizatsiya yo\'q. <a href="#/vizualizatsiya" style="color:var(--accent)">Bog\'lash</a></div>';
        }
        h += '</div>';

        // 3D Zamerlar
        h += '<div style="margin-top:14px">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        h += '<h3 style="font-size:14px;margin:0"><i class="fas fa-ruler-combined" style="color:var(--accent);margin-right:4px;font-size:12px"></i> 3D Zamerlar</h3>';
        h += '<a href="#/zamers" style="font-size:11px;color:var(--accent);text-decoration:none"><i class="fas fa-external-link-alt" style="margin-right:3px"></i>Barchasi</a>';
        h += '</div>';
        if (d.zamers && d.zamers.length) {
            h += '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px">';
            d.zamers.forEach(function(z) {
                h += '<div class="od-zamer-card" data-url="'+Utils.esc(z.zamer_url || '')+'" data-id="'+z.id+'" style="flex:0 0 120px;cursor:pointer;border-radius:10px;overflow:hidden;border:1px solid var(--border);transition:transform .15s">';
                h += '<div style="position:relative;aspect-ratio:1;background:#f1f5f9">';
                if (z.thumbnail) h += '<img src="'+Utils.esc(z.thumbnail)+'" style="width:100%;height:100%;object-fit:cover" loading="lazy">';
                else h += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:28px"><i class="fas fa-cube"></i></div>';
                h += '<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,.6);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;font-weight:700">3D</div>';
                if (z.blocks_count > 0) h += '<div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px"><i class="fas fa-cubes"></i> '+z.blocks_count+'</div>';
                h += '</div>';
                var zname = z.room_name || 'Xona #'+z.id;
                h += '<div style="padding:4px 6px;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+Utils.esc(zname)+'</div>';
                h += '</div>';
            });
            h += '</div>';
        } else {
            h += '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">3D Zamerlar yo\'q. <a href="#/zamers" style="color:var(--accent)">Bog\'lash</a></div>';
        }
        h += '</div>';

        // Fayllar
        h += '<div style="margin-top:14px">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        h += '<h3 style="font-size:14px;margin:0">📎 Fayllar</h3>';
        if (d.is_owner || d.user_role === 'manager') h += '<button class="ce-btn ce-btn-sm" id="btn-upload-file" style="font-size:11px;padding:4px 10px"><i class="fas fa-plus"></i> Yuklash</button>';
        h += '</div>';
        h += '<div id="od-files">';
        if (d.files && d.files.length) {
            h += OrderDetail._filesGrid(d.files);
        } else {
            h += '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Fayllar yo\'q</div>';
        }
        h += '</div></div>';

        // 📐 Bazis smeta bo'limi (.b3d chizmadan avtomatik narx)
        h += '<div style="margin-top:14px">';
        h += '<h3 style="font-size:14px;margin:0 0 8px">📐 Bazis smeta</h3>';
        h += '<div id="od-bom"></div>';
        h += '</div>';

        // Eslatmalar (Notebook)
        h += '<div style="margin-top:14px">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        h += '<h3 style="font-size:14px;margin:0">📝 Eslatmalar</h3>';
        h += '<button class="ce-btn ce-btn-sm" id="btn-add-note" style="font-size:11px;padding:4px 10px"><i class="fas fa-plus"></i></button>';
        h += '</div>';
        h += '<div id="od-notes">';
        if (d.notes && d.notes.length) {
            d.notes.forEach(function(n) { h += OrderDetail._noteCard(n); });
        } else {
            h += '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Eslatmalar yo\'q</div>';
        }
        h += '</div></div>';

        // Permissions
        if (d.is_owner) {
            h += '<div style="margin-top:16px">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
            h += '<h3 style="font-size:14px;margin:0">Ruxsatlar</h3>';
            h += '<button class="ce-btn ce-btn-secondary" id="btn-add-perm" style="font-size:11px;padding:5px 10px"><i class="fas fa-user-plus"></i></button></div>';
            h += '<div id="od-perms">';
            if (d.permissions && d.permissions.length) {
                d.permissions.forEach(function(p) { h += OrderDetail._permCard(p); });
            } else {
                h += '<div style="font-size:12px;color:var(--text-muted)">Hali ruxsat berilmagan</div>';
            }
            h += '</div></div>';
        }

        // Profit shares display
        if (d.profit_shares && d.profit_shares.length && (d.is_owner || d.user_role === 'manager')) {
            var pr = parseInt(d.total_income) - parseInt(d.total_expense);
            h += '<div class="ce-card" style="padding:12px;margin-bottom:14px">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
            h += '<h3 style="font-size:14px;margin:0">💰 Foyda taqsimot</h3>';
            if (d.is_owner) h += '<button class="ce-btn ce-btn-primary" id="btn-withdraw" style="font-size:11px;padding:4px 12px"><i class="fas fa-hand-holding-usd"></i> Yechish</button>';
            h += '</div>';
            d.profit_shares.forEach(function(s) {
                var amt = Math.round(pr * s.percent / 100);
                h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px">';
                h += '<span style="font-weight:500">'+Utils.esc(s.name || 'Noma\'lum')+'</span>';
                h += '<span><span style="color:var(--text-muted)">'+s.percent+'%</span> · <span style="font-weight:700;color:var(--accent)">'+Utils.money(Math.abs(amt))+'</span></span>';
                h += '</div>';
            });
            h += '</div>';
        }

        // Transactions
        if (d.transactions && d.transactions.length) {
            h += '<h3 style="font-size:14px;margin:16px 0 10px">Tranzaksiyalar</h3>';
            h += '<div id="od-transactions">';
            d.transactions.slice(0, 20).forEach(function(t) { h += OrderDetail._txCard(t); });
            h += '</div>';
        }

        // Timeline
        if (d.timeline && d.timeline.length) {
            h += '<h3 style="font-size:14px;margin:16px 0 10px">Tarix</h3>';
            h += '<div id="od-timeline">';
            d.timeline.forEach(function(t) {
                h += '<div style="font-size:12px;padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between">';
                h += '<span>'+Utils.esc(t.note)+'</span>';
                h += '<span style="color:var(--text-muted);white-space:nowrap;margin-left:8px">'+Utils.timeAgo(t.created_at)+'</span></div>';
            });
            h += '</div>';
        }

        return h;
    },

    _statusLabel: function(s) {
        var m = {new:'Yangi',waiting:'Kutilmoqda',in_progress:'Jarayonda',at_mebelcity:'MebelCity',ready:'Tayyor',delivered:'Topshirildi',cancelled:'Bekor'};
        return m[s] || s;
    },

    _stageCard: function(s, isOwner, userRole, canCompleteStage) {
        var done = s.status === 'completed', skipped = s.status === 'skipped';
        var locked = done || skipped;
        var opacity = locked ? 'opacity:.7;' : '';
        var h = '<div class="ce-card stage-card" data-id="'+s.id+'" data-locked="'+(locked?'1':'')+'" style="padding:12px;margin-bottom:8px;border-left:4px solid '+s.color+';'+opacity+'">';
        h += '<div style="display:flex;justify-content:space-between;align-items:start">';
        h += '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">'+Utils.esc(s.icon)+'</span>';
        h += '<div><div style="font-size:13px;font-weight:600">'+Utils.esc(s.title)+'</div>';
        if (s.assigned_to) h += '<div style="font-size:11px;color:var(--text-muted)">👤 '+Utils.esc(s.assigned_to.full_name)+'</div>';
        h += '</div></div>';
        h += '<div style="display:flex;gap:4px;align-items:center">';
        if (done) {
            h += '<span style="font-size:11px;color:var(--accent)">✅</span>';
            if (isOwner) h += '<button class="ce-btn btn-reopen-stage" data-id="'+s.id+'" style="font-size:10px;padding:3px 8px;background:var(--accent2,#6366f1);color:#fff;border:none;border-radius:4px;margin-left:4px" title="Qayta ochish">🔄</button>';
        } else if (skipped) {
            h += '<span style="font-size:11px;color:var(--text-muted)">⏭</span>';
            if (isOwner) h += '<button class="ce-btn btn-reopen-stage" data-id="'+s.id+'" style="font-size:10px;padding:3px 8px;background:var(--accent2,#6366f1);color:#fff;border:none;border-radius:4px;margin-left:4px" title="Qayta ochish">🔄</button>';
        }
        else {
            if (isOwner || userRole === 'manager' || canCompleteStage) {
                h += '<button class="ce-btn btn-complete-stage" data-id="'+s.id+'" style="font-size:10px;padding:3px 8px;background:var(--accent);color:#fff;border:none;border-radius:4px" title="Tugallash">✓</button>';
            }
            if (isOwner) {
                h += '<button class="ce-btn btn-skip-stage" data-id="'+s.id+'" style="font-size:10px;padding:3px 8px;background:var(--text-muted);color:#fff;border:none;border-radius:4px" title="O\'tkazish">⏭</button>';
                h += '<button class="ce-btn btn-del-stage" data-id="'+s.id+'" style="font-size:10px;padding:3px 8px;background:var(--danger);color:#fff;border:none;border-radius:4px" title="O\'chirish">🗑</button>';
            }
        }
        h += '</div></div>';

        // MebelCity buyurtma info — chiqim va bosqich
        if (s.is_mebelcity && s.mc_info) {
            var mc = s.mc_info;
            h += '<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.15)">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center">';
            h += '<div style="font-size:11px;font-weight:600;color:var(--accent)">🏭 #'+Utils.esc(mc.order_hash)+'</div>';
            if (mc.total_sum) h += '<div style="font-size:12px;font-weight:700;color:var(--danger)">'+Utils.money(mc.total_sum)+'</div>';
            h += '</div>';
            if (mc.current_step) h += '<div style="font-size:11px;color:var(--text-muted);margin-top:3px">📍 '+Utils.esc(mc.current_step)+'</div>';
            h += '<div style="display:flex;align-items:center;gap:6px;margin-top:4px">';
            h += '<div style="flex:1;height:4px;border-radius:2px;background:rgba(99,102,241,.15)"><div style="width:'+mc.progress+'%;height:100%;border-radius:2px;background:var(--accent)"></div></div>';
            h += '<span style="font-size:10px;color:var(--text-muted)">'+mc.progress+'%</span>';
            if (mc.delivery_label) h += '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(99,102,241,.1);color:var(--accent)">'+Utils.esc(mc.delivery_label)+'</span>';
            h += '</div>';
            h += '<button class="btn-view-mc-order" data-hash="'+Utils.esc(mc.order_hash)+'" style="margin-top:6px;width:100%;padding:6px;font-size:11px;font-weight:600;border:1px solid rgba(99,102,241,.25);border-radius:6px;background:rgba(99,102,241,.06);color:var(--accent);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all .15s"><i class="fas fa-external-link-alt" style="font-size:10px"></i> Ko\'rish</button>';
            h += '</div>';
        } else if (s.is_mebelcity && !s.mebelcity_order_id && (isOwner || userRole === 'manager')) {
            h += '<button class="ce-btn btn-link-mc-order" data-stage="'+s.id+'" style="margin-top:6px;font-size:11px;padding:4px 10px;background:rgba(99,102,241,.1);color:var(--accent);border:1px dashed var(--accent);border-radius:6px">🔗 Buyurtma ulash</button>';
        }

        // Expense info
        if (s.total_expense && s.total_expense !== '0') {
            h += '<div style="font-size:11px;color:var(--danger);margin-top:4px">💰 Chiqim: '+Utils.money(s.total_expense);
            if (s.estimated_cost && s.estimated_cost !== '0') h += ' / '+Utils.money(s.estimated_cost);
            h += '</div>';
        }

        // Checklist
        if (s.checklist && s.checklist.length) {
            h += '<div class="stage-checklist" style="margin-top:8px">';
            s.checklist.forEach(function(item) {
                var cursorStyle = locked ? 'cursor:default' : 'cursor:pointer';
                h += '<label class="checklist-item" data-stage="'+s.id+'" data-item="'+item.id+'" style="display:flex;align-items:center;gap:8px;padding:4px 0;'+cursorStyle+';font-size:12px">';
                h += '<input type="checkbox" class="chk-toggle"'+(item.is_done?' checked':'')+(locked?' disabled':'')+' style="margin:0">';
                h += '<span style="'+(item.is_done?'text-decoration:line-through;color:var(--text-muted)':'')+'">'+Utils.esc(item.title)+'</span>';
                if (item.done_by) h += '<span style="font-size:10px;color:var(--text-muted);margin-left:auto">'+Utils.esc(item.done_by)+'</span>';
                h += '</label>';
            });
            h += '</div>';
        }

        if (s.note) h += '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">'+Utils.esc(s.note)+'</div>';
        if (done && s.completed_by) h += '<div style="font-size:10px;color:var(--text-muted);margin-top:4px">✅ '+Utils.esc(s.completed_by.full_name)+' · '+Utils.timeAgo(s.completed_at)+'</div>';
        h += '</div>';
        return h;
    },

    _ROLE_DESC: {viewer: "faqat ko'radi", worker: 'etap bajaradi', manager: 'hammasini boshqaradi'},

    _permToggle: function(pid, field, on, label, title) {
        return '<button class="ce-btn perm-tgl" data-id="'+pid+'" data-field="'+field+'" title="'+title+'" ' +
            'style="padding:5px 9px;font-size:11px;border-radius:6px;border:1px solid ' +
            (on ? 'rgba(16,185,129,.4)' : 'var(--border)') + ';background:' +
            (on ? 'rgba(16,185,129,.12)' : 'transparent') + ';color:' +
            (on ? '#059669' : 'var(--text-muted)') + ';cursor:pointer;white-space:nowrap">' + label + '</button>';
    },

    _permCard: function(p) {
        var u = p.user;
        var h = '<div class="ce-card perm-card" data-id="'+p.id+'" style="padding:10px;margin-bottom:8px">';
        // Yuqori qator: avatar + ism + o'chirish
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">';
        h += '<div style="width:32px;height:32px;flex-shrink:0;border-radius:50%;background:var(--secondary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600">'+Utils.initials(u.full_name)+'</div>';
        h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+Utils.esc(u.full_name)+'</div>';
        h += '<div style="font-size:10px;color:var(--text-muted)">'+Utils.roleLabel(p.role)+(OrderDetail._ROLE_DESC[p.role] ? ' — ' + OrderDetail._ROLE_DESC[p.role] : '')+'</div></div>';
        h += '<button class="ce-btn ce-btn-danger btn-del-perm" data-id="'+p.id+'" style="padding:4px 8px;font-size:11px;flex-shrink:0"><i class="fas fa-times"></i></button>';
        h += '</div>';
        // Pastki qator: rol select + 3 toggle — har o'zgarish darhol perm.save
        h += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">';
        h += '<select class="ce-input perm-role-sel" data-id="'+p.id+'" style="font-size:11px;padding:5px 6px;flex:1;min-width:120px">';
        h += '<option value="viewer"'+(p.role==='viewer'?' selected':'')+'>👁 Ko\'ruvchi — faqat ko\'radi</option>';
        h += '<option value="worker"'+(p.role==='worker'?' selected':'')+'>🔨 Ishchi — etap bajaradi</option>';
        h += '<option value="manager"'+(p.role==='manager'?' selected':'')+'>⭐ Menejer — hammasini boshqaradi</option>';
        h += '</select>';
        h += OrderDetail._permToggle(p.id, 'can_see_money', !!p.can_see_money, '💰 Pul', "Pul (kirim/chiqim/foyda) ko'rinishi");
        h += OrderDetail._permToggle(p.id, 'can_add_expense', !!p.can_add_expense, '➖ Chiqim', "Chiqim qo'sha oladi");
        h += OrderDetail._permToggle(p.id, 'can_complete_stage', !!p.can_complete_stage, '✅ Tugatish', 'Etap tugata oladi');
        h += '</div>';
        h += '</div>';
        return h;
    },

    // Ruxsat kartasidan bitta maydonni o'zgartirib darhol saqlash (owner-only, server tekshiradi)
    _permSaveField: function(p, changes, successMsg) {
        var d = OrderDetail._data;
        var payload = {
            order_id: d.id, user_id: p.user.id, role: p.role,
            can_add_expense: !!p.can_add_expense,
            can_complete_stage: !!p.can_complete_stage,
            can_see_money: !!p.can_see_money,
            stages: p.stages || [],
        };
        for (var k in changes) payload[k] = changes[k];
        WS.send('perm.save', payload, function(msg) {
            if (!msg.ok) return Toast.error(msg.error);
            Toast.success(successMsg || 'Saqlandi');
            OrderDetail._renderKeepScroll();
        });
    },

    _txCard: function(t) {
        var isIncome = t.record_type === 'income';
        var h = '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">';
        h += '<div><div style="font-weight:500">'+(isIncome?'↗ Kirim':'↘ Chiqim')+'</div>';
        if (t.description) h += '<div style="color:var(--text-muted);font-size:11px">'+Utils.esc(t.description)+'</div>';
        if (t.stage_name) h += '<div style="color:var(--text-muted);font-size:11px">'+Utils.esc(t.stage_name)+'</div>';
        h += '</div>';
        h += '<div style="text-align:right"><div style="font-weight:600;color:'+(isIncome?'var(--accent)':'var(--danger)')+'">'+(isIncome?'+':'-')+Utils.money(t.amount)+'</div>';
        h += '<div style="color:var(--text-muted);font-size:10px">'+Utils.date(t.date)+'</div></div></div>';
        return h;
    },

    bind: function() {
        var d = this._data;
        if (!d) return;

        // Status change
        var statusSel = document.getElementById('order-status');
        if (statusSel) {
            var _prevStatus = statusSel.value;
            statusSel.onchange = function() {
                var newVal = statusSel.value;
                if (newVal === 'waiting' && _prevStatus !== 'waiting') {
                    var _saved = false;
                    Modal.open('Kutilmoqda sababi',
                        '<div style="margin-bottom:10px;font-size:13px;color:var(--text-muted)">Buyurtma "Kutilmoqda" holatiga o\'tkazilmoqda. Sababini yozing:</div>' +
                        '<textarea name="status_note" class="ce-input" rows="3" style="width:100%;resize:vertical" placeholder="Masalan: material yetishmayapti..."></textarea>',
                        {
                            footer: '<button class="ce-btn ce-btn-primary" id="btn-confirm-waiting">Saqlash</button>',
                            onClose: function() {
                                // Cancel/backdrop/Esc bilan yopilsa va saqlanmagan bo'lsa — selectni eski holatga qaytarish
                                if (!_saved) statusSel.value = _prevStatus;
                            },
                        });
                    document.getElementById('btn-confirm-waiting').onclick = function() {
                        var f = Modal.getFormData();
                        var note = (f.status_note || '').trim();
                        if (!note) return Toast.error("Kutilmoqda sababini yozing");
                        WS.send('order.update', {id: d.id, fields: {status: newVal}, status_note: note}, function(msg) {
                            if (!msg.ok) return Toast.error(msg.error);
                            _saved = true;
                            _prevStatus = newVal;
                            Modal.close();
                            Toast.success('Status yangilandi');
                        });
                    };
                    return;
                }
                WS.send('order.update', {id: d.id, fields: {status: newVal}}, function(msg) {
                    if (!msg.ok) return Toast.error(msg.error);
                    Toast.success('Status yangilandi');
                    _prevStatus = newVal;
                });
            };
        }

        // Zaklad
        var zakladCard = document.querySelector('.od-zaklad-card');
        if (zakladCard && (d.is_owner || d.user_role === 'manager')) {
            zakladCard.onclick = function() { OrderDetail._showZakladModal(); };
        }

        // Profit
        var profitCard = document.querySelector('.od-profit-card');
        if (profitCard && (d.is_owner || d.user_role === 'manager')) {
            profitCard.onclick = function() { OrderDetail._showProfitModal(); };
        }

        // Withdraw
        var withdrawBtn = document.getElementById('btn-withdraw');
        if (withdrawBtn) withdrawBtn.onclick = function() { OrderDetail._showWithdrawModal(); };

        // Income
        var incBtn = document.getElementById('btn-add-income');
        if (incBtn) incBtn.onclick = function() { OrderDetail._showIncomeModal(); };

        // Expense
        var expBtn = document.getElementById('btn-add-expense');
        if (expBtn) expBtn.onclick = function() { OrderDetail._showExpenseModal(); };

        // Kirim/Chiqim qaytarish (2026-08-15 da qaytarildi — moliya TZ #6)
        var revIncBtn = document.getElementById('btn-revert-income');
        if (revIncBtn) revIncBtn.onclick = function() { OrderDetail._showRevertModal('income'); };
        var revExpBtn = document.getElementById('btn-revert-expense');
        if (revExpBtn) revExpBtn.onclick = function() { OrderDetail._showRevertModal('expense'); };

        // Add stage
        var stgBtn = document.getElementById('btn-add-stage');
        if (stgBtn) stgBtn.onclick = function() { OrderDetail._showStageModal(); };

        // Contract (mijoz portali)
        var contractBtn = document.getElementById('btn-contract');
        if (contractBtn) contractBtn.onclick = function() { OrderDetail._showContractModal(); };

        // Share
        var shareBtn = document.getElementById('btn-share-order');
        if (shareBtn) shareBtn.onclick = function() { OrderDetail._showShareModal(); };

        // Delete order (soft-delete → "O'chirilgan" bo'limida saqlanadi, sabab MAJBURIY)
        var delBtn = document.getElementById('btn-delete-order');
        if (delBtn) delBtn.onclick = function() {
            Modal.open("Buyurtmani o'chirish",
                '<div style="margin-bottom:10px;font-size:13px;color:var(--text-muted)">Bu buyurtma o\'chirilmaydi — "O\'chirilgan" bo\'limida saqlanib qoladi va istalgan payt tiklanadi. O\'chirish sababini yozing:</div>' +
                '<textarea name="delete_note" class="ce-input" rows="3" style="width:100%;resize:vertical" placeholder="Masalan: xato kiritilgan, mijoz bekor qildi..."></textarea>',
                {footer: '<button class="ce-btn ce-btn-danger" id="btn-confirm-delete">O\'chirish</button>'});
            document.getElementById('btn-confirm-delete').onclick = function() {
                var f = Modal.getFormData();
                var note = (f.delete_note || '').trim();
                if (!note) return Toast.error("O'chirish sababini yozish majburiy");
                WS.send('order.delete', {id: d.id, note: note}, function(msg) {
                    if (!msg.ok) return Toast.error(msg.error);
                    Modal.close();
                    Toast.success("Buyurtma o'chirildi");
                    Router.go('/orders');
                });
            };
        };

        // Apply template
        var tmplBtn = document.getElementById('btn-apply-tmpl');
        if (tmplBtn) tmplBtn.onclick = function() {
            var sel = document.getElementById('tmpl-select');
            if (!sel) return;
            WS.send('template.apply', {template_id: parseInt(sel.value), order_id: d.id}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Toast.success('Shablon qo\'llandi');
                OrderDetail.render(d.id);
            });
        };

        // Stage actions
        OrderDetail._bindStageActions();

        // Checklist toggles
        OrderDetail._bindChecklist();

        // Panorama cards
        document.querySelectorAll('.od-panorama-card').forEach(function(card) {
            card.onclick = function() {
                var username = STATE.user && STATE.user.username;
                if (username) {
                    var backUrl = '/mini/' + encodeURIComponent(username) + '/#/orders/' + d.id;
                    window.location.href = '/mini/' + encodeURIComponent(username) + '/panorama/' + card.dataset.uuid + '/?back=' + encodeURIComponent(backUrl);
                }
            };
        });

        // Zamer cards
        document.querySelectorAll('.od-zamer-card').forEach(function(card) {
            card.onclick = function() {
                var url = card.dataset.url;
                if (url) {
                    if (typeof Zamers !== 'undefined' && Zamers._openIframe) {
                        Zamers._openIframe(url, 'Zamer');
                    } else {
                        window.open(url, '_blank');
                    }
                }
            };
        });

        // Files
        OrderDetail._bindFiles();

        // Bazis smeta — kartochka yoki bo'sh holat (+ to'g'ridan yuklash tugmasi)
        var _bomEl = document.getElementById('od-bom');
        if (_bomEl) {
            if (window.BomCard && d.bom) {
                OrderDetail._bomRetry = 0;   // smeta keldi — retry hisoblagichni nollash
                BomCard.renderData(d.bom, _bomEl, d.bom.source_order_id, true);
            } else {
                var _canUp = (d.is_owner || d.user_role === 'manager');
                var _btn = _canUp ? '<button id="od-bom-upload" class="ce-btn ce-btn-sm" style="margin-top:10px;font-size:11px;padding:5px 12px"><i class="fas fa-upload"></i> .b3d yuklash</button>' : '';
                var _hasB3d = (d.files || []).some(function(f) { return /\.b3d$/i.test(f.file_name || ''); });
                var _MAX_BOM_RETRY = 3;
                if (_hasB3d && (OrderDetail._bomRetry || 0) < _MAX_BOM_RETRY) {
                    // .b3d bor — BOM background'da hisoblanayotgan bo'lishi mumkin.
                    // CHEKLANGAN marta kutib qayta yuklaymiz (cheksiz tsikl emas).
                    OrderDetail._bomRetry = (OrderDetail._bomRetry || 0) + 1;
                    _bomEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:14px;border:1px dashed var(--border);border-radius:10px">⏳ Bazis smeta hisoblanmoqda…</div>';
                    setTimeout(function() { if (location.hash.indexOf('/orders/' + d.id) !== -1) OrderDetail.render(d.id, true); }, 2500);
                } else {
                    // .b3d yo'q YOKI retry tugadi (smeta o'chirilgan/hisoblab bo'lmadi) — TSIKL TO'XTAYDI
                    var _emptyMsg = _hasB3d
                        ? '📐 .b3d bor, lekin smeta yo\'q.<br>Qayta hisoblash uchun chizmani qayta yuklang.'
                        : '📐 Bazis chizma (.b3d) yo\'q.<br>Chizmani yuklang — narx avtomatik hisoblanadi.';
                    _bomEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:14px;border:1px dashed var(--border);border-radius:10px">' + _emptyMsg + _btn + '</div>';
                    var _ub = document.getElementById('od-bom-upload');
                    if (_ub) _ub.onclick = function() { var b = document.getElementById('btn-upload-file'); if (b) b.click(); };
                }
            }
        }

        // Notes
        OrderDetail._bindNotes();

        // Permission buttons
        var permBtn = document.getElementById('btn-add-perm');
        if (permBtn) permBtn.onclick = function() { OrderDetail._showPermModal(); };
        // Ruxsat kartalari: rol select + 3 toggle — har o'zgarish darhol perm.save
        document.querySelectorAll('.perm-role-sel').forEach(function(sel) {
            sel.onchange = function() {
                var p = (d.permissions || []).find(function(x) { return x.id === parseInt(sel.dataset.id); });
                if (!p) return;
                OrderDetail._permSaveField(p, {role: sel.value});
            };
        });
        document.querySelectorAll('.perm-tgl').forEach(function(b) {
            b.onclick = function(e) {
                e.stopPropagation();
                var p = (d.permissions || []).find(function(x) { return x.id === parseInt(b.dataset.id); });
                if (!p) return;
                var field = b.dataset.field;
                var changes = {};
                changes[field] = !p[field];
                var msgs = {
                    can_see_money: changes[field] ? "💰 Pul endi ko'rinadi" : '💰 Pul yashirildi',
                    can_add_expense: changes[field] ? '➖ Chiqim ruxsati berildi' : '➖ Chiqim ruxsati olindi',
                    can_complete_stage: changes[field] ? '✅ Tugatish ruxsati berildi' : '✅ Tugatish ruxsati olindi',
                };
                OrderDetail._permSaveField(p, changes, msgs[field]);
            };
        });
        document.querySelectorAll('.btn-del-perm').forEach(function(b) {
            b.onclick = function(e) {
                e.stopPropagation();
                Modal.confirm("O'chirish", "Ruxsatni olib tashlaysizmi?", function() {
                    WS.send('perm.delete', {id: parseInt(b.dataset.id)}, function(msg) {
                        if (!msg.ok) return Toast.error(msg.error);
                        var card = document.querySelector('.perm-card[data-id="'+b.dataset.id+'"]');
                        if (card) card.remove();
                        Toast.success("Ruxsat olib tashlandi");
                    });
                });
            };
        });
    },

    _bindStageActions: function() {
        var d = this._data;
        document.querySelectorAll('.btn-complete-stage').forEach(function(b) {
            b.onclick = function(e) {
                e.stopPropagation();
                WS.send('stage.complete', {id: parseInt(b.dataset.id)}, function(msg) {
                    if (!msg.ok) return Toast.error(msg.error);
                    Toast.success('Etap tugallandi');
                    OrderDetail._updateProgress(msg.data.progress);
                    OrderDetail._renderKeepScroll();
                });
            };
        });
        document.querySelectorAll('.btn-skip-stage').forEach(function(b) {
            b.onclick = function(e) {
                e.stopPropagation();
                Modal.confirm("O'tkazish", "Ushbu etapni o'tkazasizmi?", function() {
                    WS.send('stage.skip', {id: parseInt(b.dataset.id)}, function(msg) {
                        if (!msg.ok) return Toast.error(msg.error);
                        Toast.success("Etap o'tkazildi");
                        OrderDetail._renderKeepScroll();
                    });
                });
            };
        });
        document.querySelectorAll('.btn-del-stage').forEach(function(b) {
            b.onclick = function(e) {
                e.stopPropagation();
                Modal.confirm("O'chirish", "Ushbu etapni o'chirasizmi?", function() {
                    WS.send('stage.delete', {id: parseInt(b.dataset.id)}, function(msg) {
                        if (!msg.ok) return Toast.error(msg.error);
                        Toast.success("Etap o'chirildi");
                        var card = document.querySelector('.stage-card[data-id="'+b.dataset.id+'"]');
                        if (card) card.remove();
                        OrderDetail._updateProgress(msg.data.progress);
                    });
                });
            };
        });
        document.querySelectorAll('.btn-reopen-stage').forEach(function(b) {
            b.onclick = function(e) {
                e.stopPropagation();
                Modal.confirm("Qayta ochish", "Ushbu etapni qayta ochasizmi?", function() {
                    WS.send('stage.reopen', {id: parseInt(b.dataset.id)}, function(msg) {
                        if (!msg.ok) return Toast.error(msg.error);
                        Toast.success("Etap qayta ochildi");
                        OrderDetail._renderKeepScroll();
                    });
                });
            };
        });
        document.querySelectorAll('.btn-link-mc-order').forEach(function(b) {
            b.onclick = function(e) {
                e.stopPropagation();
                OrderDetail._showLinkMcModal(parseInt(b.dataset.stage));
            };
        });
        document.querySelectorAll('.btn-view-mc-order').forEach(function(b) {
            b.onclick = function(e) {
                e.stopPropagation();
                OrderDetail._openMcOrder(b.dataset.hash);
            };
        });
    },

    _openMcOrder: function(hash) {
        var ov = document.createElement('div');
        ov.className = 'mc-iframe-overlay';
        ov.innerHTML =
            '<div class="mc-iframe-wrap">' +
                '<div class="mc-iframe-header">' +
                    '<button class="mc-iframe-back" id="mc-ov-back"><i class="fas fa-arrow-left"></i></button>' +
                    '<span class="mc-iframe-title">#' + Utils.esc(hash) + '</span>' +
                    '<button class="mc-iframe-close" id="mc-ov-close">&times;</button>' +
                '</div>' +
                '<div class="mc-iframe-body">' +
                    '<div class="mc-iframe-loading"><div class="mc-iframe-spinner"></div></div>' +
                    '<iframe src="/order/' + Utils.esc(hash) + '/" frameborder="0"></iframe>' +
                '</div>' +
            '</div>';
        document.body.appendChild(ov);
        document.body.classList.add('modal-open');
        OrderDetail._mcOverlay = ov;
        var iframe = ov.querySelector('iframe');
        var loading = ov.querySelector('.mc-iframe-loading');
        iframe.onload = function() { loading.style.display = 'none'; };
        ov.querySelector('#mc-ov-back').onclick = function() { OrderDetail._closeMcOrder(); };
        ov.querySelector('#mc-ov-close').onclick = function() { OrderDetail._closeMcOrder(); };
        ov.addEventListener('click', function(e) { if (e.target === ov) OrderDetail._closeMcOrder(); });
        OrderDetail._mcEscHandler = function(e) { if (e.key === 'Escape') OrderDetail._closeMcOrder(); };
        document.addEventListener('keydown', OrderDetail._mcEscHandler);
    },

    _closeMcOrder: function() {
        if (this._mcOverlay) { this._mcOverlay.remove(); this._mcOverlay = null; document.body.classList.remove('modal-open'); }
        if (this._mcEscHandler) { document.removeEventListener('keydown', this._mcEscHandler); this._mcEscHandler = null; }
    },

    _bindChecklist: function() {
        document.querySelectorAll('.chk-toggle').forEach(function(chk) {
            if (chk.disabled) return;
            chk.onchange = function() {
                var label = chk.closest('.checklist-item');
                var stageId = parseInt(label.dataset.stage);
                var itemId = parseInt(label.dataset.item);
                var span = label.querySelector('span');
                // Optimistic UI
                if (chk.checked) {
                    span.style.textDecoration = 'line-through';
                    span.style.color = 'var(--text-muted)';
                } else {
                    span.style.textDecoration = '';
                    span.style.color = '';
                }
                WS.send('stage.check', {stage_id: stageId, item_id: itemId}, function(msg) {
                    if (!msg.ok) {
                        // Revert
                        chk.checked = !chk.checked;
                        span.style.textDecoration = chk.checked ? 'line-through' : '';
                        span.style.color = chk.checked ? 'var(--text-muted)' : '';
                        Toast.error(msg.error);
                    }
                });
            };
        });
    },

    _updateProgress: function(pct) {
        var el = document.getElementById('od-progress');
        if (el) el.textContent = pct + '%';
        var bar = document.getElementById('od-progress-bar');
        if (bar) bar.innerHTML = Utils.progressBar(pct);
    },

    _showZakladModal: function() {
        var d = this._data;
        var current = parseInt(d.zaklad_amount) || 0;
        Modal.open("Shartnoma summasi",
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Shartnoma summasi</label><input type="text" inputmode="numeric" name="zaklad" class="ce-input ce-money-input" style="width:100%" value="'+(current||'')+'"></div>' +
            '<div style="font-size:11px;color:var(--text-muted)">Mijoz bilan kelishilgan umumiy narx. Faqat ma\'lumot uchun saqlanadi.</div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-save-zaklad">Saqlash</button>'});
        Utils.bindMoneyInputs();
        document.getElementById('btn-save-zaklad').onclick = function() {
            var f = Modal.getFormData();
            var val = parseInt(f.zaklad) || 0;
            WS.send('order.update', {id: d.id, fields: {zaklad_amount: val}}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Shartnoma summasi saqlandi');
                OrderDetail.render(d.id);
            });
        };
    },

    // Kirim/Chiqim qaytarish — Shartnoma bilan bir xil naqsh (faqat bigone_cl2 ko'radi).
    // Yozilgan summa aynan shu summada teskari yozuv sifatida qo'shiladi (kirim qaytarilsa
    // chiqim, chiqim qaytarilsa kirim) — mavjud jamlash (total_income/expense) o'zgarmaydi.
    _showRevertModal: function(type) {
        var d = this._data;
        var isIncome = type === 'income';
        var title = isIncome ? 'Kirim qaytarish' : 'Chiqim qaytarish';
        var marker = isIncome ? 'income_return' : 'expense_return';

        var history = (d.transactions || []).filter(function(t) { return t.category === marker; });
        var histHtml = '';
        if (history.length) {
            histHtml += '<div style="margin-top:14px"><div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Qaytarilgan summalar tarixi</div>';
            history.forEach(function(t) {
                histHtml += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">' +
                    '<span style="color:var(--text-muted)">'+Utils.date(t.date)+'</span>' +
                    '<span style="font-weight:600">'+Utils.money(t.amount)+'</span></div>';
            });
            histHtml += '</div>';
        }

        Modal.open(title,
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Qaytariladigan summa</label><input type="text" inputmode="numeric" name="revert_amount" class="ce-input ce-money-input" style="width:100%"></div>' +
            histHtml,
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-save-revert">Qaytarish</button>'});
        Utils.bindMoneyInputs();
        document.getElementById('btn-save-revert').onclick = function() {
            var f = Modal.getFormData();
            var amount = parseInt(f.revert_amount) || 0;
            if (amount <= 0) return Toast.error('Summa kiriting');
            WS.send('finance.revert', {order_id: d.id, type: type, amount: amount}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Qaytarildi');
                OrderDetail.render(d.id);
            });
        };
    },

    _showContractModal: function() {
        var d = this._data;
        Modal.open('Mijoz uchun shartnoma',
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Dogovor summasi</label>' +
              '<input type="text" inputmode="numeric" name="contract_amount" class="ce-input ce-money-input" style="width:100%"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Shartnoma matni</label>' +
              '<textarea name="contract_terms" class="ce-input" rows="6" style="width:100%;resize:vertical" placeholder="Jarayon, muddat, shartlar..."></textarea></div>' +
            '<div id="contract-result" style="display:none"></div>',
            {footer: '<button class="ce-btn ce-btn-primary" id="btn-save-contract">Yaratish va yuborish</button>'});
        document.getElementById('btn-save-contract').onclick = function() {
            var f = Modal.getFormData();
            var amount = parseInt((f.contract_amount || '').toString().replace(/\D/g, '')) || 0;
            if (amount <= 0) return Toast.error('Summa kiriting');
            fetch('/mini/api/contracts/', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({order_id: d.id, amount: amount, terms: f.contract_terms || ''}),
            }).then(function(r) { return r.json(); }).then(function(r) {
                if (!r.ok) return Toast.error(r.error || 'Xatolik');
                var url = window.location.origin + r.data.portal_url;
                var contractUuid = r.data.uuid;
                var phone = (r.data.customer_phone || '').replace(/\D/g, '');
                var shareText = d.title + ' — shartnomangiz tayyor. Ko\'rish va tasdiqlash: ' + url;
                var box = document.getElementById('contract-result');
                box.style.display = 'block';
                box.innerHTML =
                    '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">' +
                    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Mijozga yuboriladigan havola</div>' +
                    '<div style="display:flex;gap:6px;margin-bottom:12px">' +
                    '<input type="text" readonly value="' + Utils.esc(url) + '" style="flex:1;font-size:12px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg)">' +
                    '<button class="ce-btn ce-btn-secondary" id="btn-copy-contract-link" style="font-size:12px">Nusxalash</button></div>' +
                    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Ulashish</div>' +
                    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">' +
                    '<button class="ce-btn ce-btn-secondary" id="btn-share-sms" style="font-size:12px"><i class="fas fa-sms"></i> SMS</button>' +
                    '<button class="ce-btn ce-btn-secondary" id="btn-share-tg" style="font-size:12px"><i class="fab fa-telegram"></i> Telegram</button>' +
                    '<button class="ce-btn ce-btn-secondary" id="btn-share-wa" style="font-size:12px"><i class="fab fa-whatsapp"></i> WhatsApp</button>' +
                    '<button class="ce-btn ce-btn-secondary" id="btn-share-ig" style="font-size:12px"><i class="fab fa-instagram"></i> Instagram</button>' +
                    '</div>' +
                    '<img src="/mini/portal/' + contractUuid + '/qr/" style="width:160px;height:160px;display:block;margin:0 auto;border-radius:8px">' +
                    '</div>';
                document.getElementById('btn-copy-contract-link').onclick = function() {
                    navigator.clipboard.writeText(url).then(function() { Toast.success('Nusxalandi'); });
                };
                document.getElementById('btn-share-sms').onclick = function() {
                    if (!phone) return Toast.error("Mijoz telefon raqami kiritilmagan");
                    var btn = this; btn.disabled = true;
                    fetch('/mini/api/contracts/' + contractUuid + '/send-sms/', {method: 'POST'})
                        .then(function(r) { return r.json(); })
                        .then(function(r) {
                            btn.disabled = false;
                            if (r.ok) Toast.success('SMS yuborildi'); else Toast.error(r.error || 'Xatolik');
                        }).catch(function() { btn.disabled = false; Toast.error('Tarmoq xatosi'); });
                };
                document.getElementById('btn-share-tg').onclick = function() {
                    window.open('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(d.title + ' — shartnomangiz tayyor'), '_blank');
                };
                document.getElementById('btn-share-wa').onclick = function() {
                    var waUrl = phone
                        ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(shareText)
                        : 'https://api.whatsapp.com/send?text=' + encodeURIComponent(shareText);
                    window.open(waUrl, '_blank');
                };
                document.getElementById('btn-share-ig').onclick = function() {
                    navigator.clipboard.writeText(url).then(function() {
                        Toast.info("Link nusxalandi — Instagram DM'ga qo'lda joylashtiring (Instagram tayyor xabar bilan link ochishni qo'llab-quvvatlamaydi)");
                    });
                };
                Toast.success('Shartnoma yaratildi');
            }).catch(function() { Toast.error('Tarmoq xatosi'); });
        };
    },

    _showProfitModal: function() {
        var d = this._data;
        if (d.profit_shares && d.profit_shares.length) {
            OrderDetail._showProfitReadView();
        } else {
            OrderDetail._showProfitEditForm();
        }
    },

    _showProfitReadView: function() {
        var d = this._data;
        var profit = parseInt(d.total_income) - parseInt(d.total_expense);
        var shares = d.profit_shares || [];
        var h = '<div style="margin-bottom:8px;font-size:13px;font-weight:700;color:var(--accent)">Foyda: '+Utils.money(Math.abs(profit))+'</div>';
        shares.forEach(function(s) {
            var amt = Math.round(profit * s.percent / 100);
            h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">';
            h += '<span style="font-weight:500">'+Utils.esc(s.name || 'Noma\'lum')+'</span>';
            h += '<span><span style="color:var(--text-muted)">'+s.percent+'%</span> · <span style="font-weight:700;color:var(--accent)">'+Utils.money(Math.abs(amt))+'</span></span>';
            h += '</div>';
        });

        Modal.open("Foyda taqsimlash", h,
            {footer:'<button class="ce-btn ce-btn-primary" id="ps-done" disabled style="opacity:.7;cursor:default">✅ Bo\'lingan</button>'});
    },

    _showProfitEditForm: function() {
        var d = this._data;
        var profit = parseInt(d.total_income) - parseInt(d.total_expense);
        var shares = (d.profit_shares || []).slice();
        if (!shares.length) {
            // 2026-07-30: Nursulton ishdan bo'shadi — 3 usta qoldi.
            // Ismlar oldindan, FOIZLAR BO'SH — o'zlari kelishib yozadi.
            shares = [
                {name: 'Oybek aka', percent: 0},
                {name: 'Ganisher',  percent: 0},
                {name: 'Rustam aka', percent: 0},
            ];
        }

        function renderRows() {
            var total = 0;
            var h = '<div style="margin-bottom:8px;font-size:13px;font-weight:700;color:var(--accent)">Foyda: '+Utils.money(Math.abs(profit))+'</div>';
            h += '<div id="ps-rows">';
            shares.forEach(function(s, i) {
                var amt = Math.round(profit * s.percent / 100);
                total += s.percent;
                h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">';
                h += '<input type="text" class="ce-input ps-name" data-i="'+i+'" value="'+Utils.esc(s.name)+'" placeholder="Ism" style="flex:2;font-size:12px;padding:6px 8px">';
                h += '<input type="number" class="ce-input ps-pct" data-i="'+i+'" value="'+s.percent+'" min="0" max="100" style="width:60px;font-size:12px;padding:6px 8px;text-align:center">';
                h += '<span style="font-size:11px;color:var(--text-muted);min-width:20px">%</span>';
                h += '<span style="font-size:12px;font-weight:600;min-width:80px;text-align:right">'+Utils.money(Math.abs(amt))+'</span>';
                h += '<button class="ce-btn" onclick="OrderDetail._profitDel('+i+')" style="font-size:10px;padding:2px 6px;background:var(--danger);color:#fff;border:none;border-radius:4px">✕</button>';
                h += '</div>';
            });
            h += '</div>';
            var remainder = 100 - total;
            if (Math.abs(remainder) > 0.01) {
                h += '<div style="font-size:11px;color:var(--danger);margin-top:4px">Qoldiq: '+remainder.toFixed(1)+'% ('+Utils.money(Math.abs(Math.round(profit * remainder / 100)))+')</div>';
            } else {
                h += '<div style="font-size:11px;color:var(--accent);margin-top:4px">Jami: 100% ✅</div>';
            }
            return h;
        }

        Modal.open("Foyda taqsimlash",
            '<div id="ps-container">'+renderRows()+'</div>' +
            '<button class="ce-btn ce-btn-secondary" id="ps-add" style="font-size:11px;padding:5px 12px;margin-top:8px">+ Xodim qo\'shish</button>',
            {footer:'<button class="ce-btn ce-btn-primary" id="ps-save">Saqlash</button>'});

        OrderDetail._profitShares = shares;
        OrderDetail._profitProfit = profit;

        function rebind() {
            document.querySelectorAll('.ps-name').forEach(function(el) {
                el.oninput = function() { shares[parseInt(el.dataset.i)].name = el.value; };
            });
            document.querySelectorAll('.ps-pct').forEach(function(el) {
                el.oninput = function() {
                    shares[parseInt(el.dataset.i)].percent = parseFloat(el.value) || 0;
                    document.getElementById('ps-container').innerHTML = renderRows();
                    rebind();
                };
            });
        }
        rebind();

        document.getElementById('ps-add').onclick = function() {
            shares.push({name: '', percent: 0});
            document.getElementById('ps-container').innerHTML = renderRows();
            rebind();
        };

        document.getElementById('ps-save').onclick = function() {
            document.querySelectorAll('.ps-name').forEach(function(el) {
                shares[parseInt(el.dataset.i)].name = el.value;
            });
            var total = shares.reduce(function(s, x) { return s + x.percent; }, 0);
            if (Math.abs(total - 100) > 0.5) return Toast.error('Jami 100% bo\'lishi kerak (hozir: '+total.toFixed(1)+'%)');
            WS.send('profit.save', {order_id: d.id, shares: shares}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Foyda taqsimoti saqlandi');
                OrderDetail.render(d.id);
            });
        };
    },

    _profitDel: function(idx) {
        var shares = OrderDetail._profitShares;
        if (!shares || shares.length <= 1) return;
        shares.splice(idx, 1);
        var profit = OrderDetail._profitProfit;
        var total = 0;
        var h = '<div style="margin-bottom:8px;font-size:13px;font-weight:700;color:var(--accent)">Foyda: '+Utils.money(Math.abs(profit))+'</div>';
        h += '<div id="ps-rows">';
        shares.forEach(function(s, i) {
            var amt = Math.round(profit * s.percent / 100);
            total += s.percent;
            h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">';
            h += '<input type="text" class="ce-input ps-name" data-i="'+i+'" value="'+Utils.esc(s.name)+'" placeholder="Ism" style="flex:2;font-size:12px;padding:6px 8px">';
            h += '<input type="number" class="ce-input ps-pct" data-i="'+i+'" value="'+s.percent+'" min="0" max="100" style="width:60px;font-size:12px;padding:6px 8px;text-align:center">';
            h += '<span style="font-size:11px;color:var(--text-muted);min-width:20px">%</span>';
            h += '<span style="font-size:12px;font-weight:600;min-width:80px;text-align:right">'+Utils.money(Math.abs(amt))+'</span>';
            h += '<button class="ce-btn" onclick="OrderDetail._profitDel('+i+')" style="font-size:10px;padding:2px 6px;background:var(--danger);color:#fff;border:none;border-radius:4px">✕</button>';
            h += '</div>';
        });
        h += '</div>';
        var remainder = 100 - total;
        if (Math.abs(remainder) > 0.01) {
            h += '<div style="font-size:11px;color:var(--danger);margin-top:4px">Qoldiq: '+remainder.toFixed(1)+'%</div>';
        } else {
            h += '<div style="font-size:11px;color:var(--accent);margin-top:4px">Jami: 100% ✅</div>';
        }
        document.getElementById('ps-container').innerHTML = h;
        document.querySelectorAll('.ps-name').forEach(function(el) {
            el.oninput = function() { shares[parseInt(el.dataset.i)].name = el.value; };
        });
        document.querySelectorAll('.ps-pct').forEach(function(el) {
            el.oninput = function() {
                shares[parseInt(el.dataset.i)].percent = parseFloat(el.value) || 0;
                OrderDetail._profitDel(-999);
            };
        });
    },

    _showWithdrawModal: function() {
        var d = this._data;
        var profit = parseInt(d.total_income) - parseInt(d.total_expense);
        var shares = d.profit_shares || [];
        if (!shares.length) return Toast.error('Avval foyda taqsimotini belgilang');
        if (profit <= 0) return Toast.error('Foyda yo\'q');

        var h = '<div style="margin-bottom:10px;font-size:14px;font-weight:700">Umumiy foyda: <span style="color:var(--accent)">'+Utils.money(profit)+'</span></div>';
        h += '<div id="wd-lines">';
        shares.forEach(function(s, i) {
            var amt = Math.round(profit * s.percent / 100);
            h += '<div style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:6px;background:var(--card-bg);border:1px solid var(--border);border-radius:8px">';
            h += '<input type="checkbox" class="wd-chk" data-i="'+i+'" checked>';
            h += '<div style="flex:1"><div style="font-size:13px;font-weight:600">'+Utils.esc(s.name || 'Noma\'lum')+'</div>';
            h += '<div style="font-size:11px;color:var(--text-muted)">'+s.percent+'%</div></div>';
            h += '<div style="font-size:14px;font-weight:700;color:var(--accent)">'+Utils.money(amt)+'</div>';
            h += '</div>';
        });
        h += '</div>';

        Modal.open("Foyda yechish",
            h + '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">Tanlangan xodimlarga pul yechish yozuvi yaratiladi</div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-do-withdraw" style="background:#10b981"><i class="fas fa-check"></i> Tasdiqlash va yechish</button>'});

        document.getElementById('btn-do-withdraw').onclick = function() {
            var lines = [];
            document.querySelectorAll('.wd-chk').forEach(function(chk) {
                if (chk.checked) {
                    var s = shares[parseInt(chk.dataset.i)];
                    lines.push({name: s.name, percent: s.percent, amount: Math.round(profit * s.percent / 100)});
                }
            });
            if (!lines.length) return Toast.error('Kamida 1 ta tanlang');
            WS.send('profit.withdraw', {order_id: d.id, lines: lines, total_profit: profit}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Foyda yechildi! '+lines.length+' ta yozuv yaratildi');
                OrderDetail.render(d.id);
            });
        };
    },

    _showShareModal: function() {
        var d = this._data;
        var shares = d.shares || [];
        var h = '';
        if (shares.length) {
            h += '<div style="margin-bottom:12px">';
            shares.forEach(function(s) {
                var visLabel = {full:"To'liq", limited:'Cheklangan', finance_hidden:'Moliya yashirin'};
                h += '<div class="ce-card" style="padding:10px;margin-bottom:6px;display:flex;align-items:center;gap:10px">';
                h += '<span style="font-size:16px">👥</span>';
                h += '<div style="flex:1"><div style="font-size:13px;font-weight:600">'+Utils.esc(s.team_name)+'</div>';
                h += '<div style="font-size:11px;color:var(--text-muted)">'+(visLabel[s.visibility]||s.visibility)+'</div></div>';
                h += '<button class="ce-btn btn-unshare" data-tid="'+s.team_id+'" style="font-size:10px;padding:3px 8px;background:var(--danger);color:#fff;border:none;border-radius:4px">✕</button>';
                h += '</div>';
            });
            h += '</div>';
        }
        Modal.open("Buyurtma ulashish",
            h +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Ko\'rinish darajasi</label>' +
            '<select name="visibility" class="ce-input" style="width:100%">' +
            '<option value="full">To\'liq (hamma narsa)</option>' +
            '<option value="limited">Cheklangan (faqat etaplar)</option>' +
            '<option value="finance_hidden">Moliya yashirin</option></select></div>' +
            '<div style="display:flex;gap:8px;margin-bottom:12px">' +
            '<label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" name="can_edit"> Tahrirlash</label>' +
            '<label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" name="can_complete" checked> Tugatish</label>' +
            '<label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" name="can_add_expense"> Chiqim</label></div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-do-share">Jamoaga ulashish</button>'});

        document.querySelectorAll('.btn-unshare').forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                WS.send('order.unshare', {order_id: d.id, team_id: parseInt(btn.dataset.tid)}, function(msg) {
                    if (!msg.ok) return Toast.error(msg.error);
                    Toast.success('Ulashish bekor qilindi');
                    Modal.close();
                    OrderDetail.render(d.id);
                });
            };
        });

        document.getElementById('btn-do-share').onclick = function() {
            var f = Modal.getFormData();
            WS.send('order.share', {
                order_id: d.id,
                visibility: f.visibility || 'full',
                can_edit: !!document.querySelector('[name="can_edit"]').checked,
                can_complete: !!document.querySelector('[name="can_complete"]').checked,
                can_add_expense: !!document.querySelector('[name="can_add_expense"]').checked,
            }, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Buyurtma jamoaga ulashildi');
                OrderDetail.render(d.id);
            });
        };
    },

    _showIncomeModal: function() {
        var d = this._data;
        Modal.open("Kirim qo'shish",
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Summa *</label><input type="text" inputmode="numeric" name="amount" class="ce-input ce-money-input" style="width:100%" required></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Izoh</label><input type="text" name="description" class="ce-input" style="width:100%"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">To\'lov turi</label><select name="payment_method" class="ce-input" style="width:100%"><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O\'tkazma</option></select></div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-save-income">Saqlash</button>'});
        Utils.bindMoneyInputs();
        document.getElementById('btn-save-income').onclick = function() {
            var f = Modal.getFormData();
            if (!f.amount || parseInt(f.amount) <= 0) return Toast.error('Summa kiriting');
            WS.send('order.income', {order_id: d.id, amount: parseInt(f.amount), description: f.description, payment_method: f.payment_method, customer_id: d.customer ? d.customer.id : null}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Kirim qo\'shildi');
                OrderDetail.render(d.id);
            });
        };
    },

    _showExpenseModal: function() {
        var d = this._data;
        var stageOpts = '<option value="">— umumiy —</option>';
        if (d.stages) d.stages.forEach(function(s) {
            if (s.status !== 'completed' && s.status !== 'skipped')
                stageOpts += '<option value="'+s.id+'">'+Utils.esc(s.icon+' '+s.title)+'</option>';
        });
        Modal.open("Chiqim qo'shish",
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Summa *</label><input type="text" inputmode="numeric" name="amount" class="ce-input ce-money-input" style="width:100%" required></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Izoh</label><input type="text" name="description" class="ce-input" style="width:100%"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Kategoriya</label><select name="category" class="ce-input" style="width:100%"><option value="material">Material</option><option value="service">Xizmat</option><option value="transport">Transport</option><option value="other">Boshqa</option></select></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Etap</label><select name="stage_id" class="ce-input" style="width:100%">'+stageOpts+'</select></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">To\'lov turi</label><select name="payment_method" class="ce-input" style="width:100%"><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O\'tkazma</option></select></div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-save-expense">Saqlash</button>'});
        Utils.bindMoneyInputs();
        document.getElementById('btn-save-expense').onclick = function() {
            var f = Modal.getFormData();
            if (!f.amount || parseInt(f.amount) <= 0) return Toast.error('Summa kiriting');
            WS.send('order.expense', {order_id: d.id, amount: parseInt(f.amount), description: f.description, payment_method: f.payment_method, category: f.category, stage_id: f.stage_id ? parseInt(f.stage_id) : null}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Chiqim qo\'shildi');
                OrderDetail.render(d.id);
            });
        };
    },

    _showStageModal: function() {
        var d = this._data;
        var emojis = ['📋','🪚','🔨','🎨','📐','🪑','🚚','📦','🧰','🔩','⚡','🧹','📸','✅','🏭'];
        var colors = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#06b6d4'];
        var emojiHtml = emojis.map(function(e) { return '<span class="emoji-pick" data-val="'+e+'" style="font-size:20px;cursor:pointer;padding:4px">'+e+'</span>'; }).join('');
        var colorHtml = colors.map(function(c) { return '<span class="color-pick" data-val="'+c+'" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:'+c+';cursor:pointer;margin:2px"></span>'; }).join('');

        Modal.open("Yangi etap",
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Nom *</label><input type="text" name="title" class="ce-input" style="width:100%" required></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Emoji</label><div>'+emojiHtml+'</div><input type="hidden" name="icon" value="📋"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Rang</label><div>'+colorHtml+'</div><input type="hidden" name="color" value="#6366f1"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Izoh</label><input type="text" name="note" class="ce-input" style="width:100%"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Taxminiy xarajat</label><input type="text" inputmode="numeric" name="estimated_cost" class="ce-input ce-money-input" style="width:100%"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Checklist (har birini yangi qatorga)</label><textarea name="checklist_raw" class="ce-input" rows="3" style="width:100%" placeholder="1-band\n2-band"></textarea></div>' +
            '<div style="margin-bottom:12px"><label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" name="is_mebelcity" id="chk-is-mebelcity"> MebelCity etapi</label></div>' +
            '<div id="mc-order-picker" style="display:none;margin-bottom:12px">' +
            '<label style="font-size:12px;color:var(--text-muted);margin-bottom:6px;display:block">🏭 MebelCity buyurtma</label>' +
            OrderDetail._mcPickerHtml() +
            '</div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-save-stage">Qo\'shish</button>'});
        Utils.bindMoneyInputs();

        // MebelCity checkbox toggle
        var mcChk = document.getElementById('chk-is-mebelcity');
        var mcPicker = document.getElementById('mc-order-picker');
        var mcLoaded = false;
        if (mcChk) mcChk.addEventListener('change', function() {
            mcPicker.style.display = mcChk.checked ? 'block' : 'none';
            if (mcChk.checked && !mcLoaded) {
                mcLoaded = true;
                OrderDetail._initMcPicker(null);
            }
        });

        // Emoji picker
        document.querySelectorAll('.emoji-pick').forEach(function(e) {
            e.onclick = function() {
                document.querySelectorAll('.emoji-pick').forEach(function(x){x.style.outline=''});
                e.style.outline = '2px solid var(--accent)';
                var inp = document.querySelector('[name="icon"]');
                if (inp) inp.value = e.dataset.val;
            };
        });
        // Color picker
        document.querySelectorAll('.color-pick').forEach(function(c) {
            c.onclick = function() {
                document.querySelectorAll('.color-pick').forEach(function(x){x.style.outline=''});
                c.style.outline = '2px solid #333';
                var inp = document.querySelector('[name="color"]');
                if (inp) inp.value = c.dataset.val;
            };
        });

        document.getElementById('btn-save-stage').onclick = function() {
            var f = Modal.getFormData();
            if (!f.title || !f.title.trim()) return Toast.error('Nom kiritilmagan');
            var checklist = (f.checklist_raw || '').split('\n').map(function(l){return l.trim()}).filter(Boolean);
            var mcEl = document.getElementById('mc-selected-id');
            var mcOrderId = (mcEl && mcEl.value) ? parseInt(mcEl.value) : null;
            WS.send('stage.create', {
                order_id: d.id, title: f.title, icon: f.icon || '📋', color: f.color || '#6366f1',
                note: f.note || '', estimated_cost: parseInt(f.estimated_cost) || 0,
                is_mebelcity: !!f.is_mebelcity, mebelcity_order_id: mcOrderId, checklist: checklist,
            }, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Etap qo\'shildi');
                OrderDetail.render(d.id);
            });
        };
    },

    _mcPickerHtml: function() {
        return '<div style="display:flex;gap:4px;margin-bottom:8px">' +
            '<button class="ce-btn mc-tab active" data-tab="list" id="mc-tab-list" style="flex:1;font-size:11px;padding:5px 8px">📋 Ro\'yxat</button>' +
            '<button class="ce-btn mc-tab" data-tab="cal" id="mc-tab-cal" style="flex:1;font-size:11px;padding:5px 8px">📅 Kalendar</button>' +
            '</div>' +
            '<div id="mc-search-wrap" style="margin-bottom:8px">' +
            '<input type="text" id="mc-search" class="ce-input" style="width:100%" placeholder="🔍 Qidirish (hash, nom...)">' +
            '</div>' +
            '<div id="mc-calendar-wrap" style="display:none;margin-bottom:8px"></div>' +
            '<div id="mc-order-list" style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:4px">' +
            '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">Yuklanmoqda...</div>' +
            '</div>' +
            '<input type="hidden" name="mebelcity_order_id" id="mc-selected-id">';
    },

    _renderMcList: function(orders, selectedId, container) {
        if (!orders.length) {
            container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">Buyurtmalar topilmadi</div>';
            return;
        }
        var h = '';
        orders.forEach(function(o) {
            var isSelected = selectedId && o.id === selectedId;
            var isLinked = o.linked_to && o.id !== selectedId;
            var borderColor = isSelected ? 'var(--accent)' : (isLinked ? 'rgba(245,158,11,.5)' : 'var(--border)');
            var bg = isSelected ? 'rgba(99,102,241,.08)' : (isLinked ? 'rgba(245,158,11,.05)' : 'transparent');
            var opacity = isLinked ? 'opacity:.7;' : '';
            var date = o.created_at ? Utils.date(o.created_at) : '';
            h += '<div class="mc-order-item" data-id="'+o.id+'" style="padding:8px 10px;border:1px solid '+borderColor+';border-radius:8px;margin-bottom:4px;cursor:pointer;background:'+bg+';'+opacity+'transition:all .15s">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center">';
            h += '<div style="font-size:13px;font-weight:600">#'+Utils.esc(o.order_hash)+'</div>';
            h += '<div style="display:flex;gap:4px;align-items:center">';
            if (o.is_urgent) h += '<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(239,68,68,.1);color:var(--danger)">🔥</span>';
            // Zamer statusi — buyurtma ichiga kirmasdan bilish uchun (ulangan/ulanmagan kabi)
            if (o.has_zamer === true) {
                h += '<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(16,185,129,.12);color:#059669;font-weight:700">✓ Zamer bor</span>';
            } else if (o.has_zamer === false) {
                h += '<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(239,68,68,.12);color:#dc2626;font-weight:700">✗ Zamer yo\'q</span>';
            }
            if (isLinked) h += '<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(245,158,11,.12);color:#d97706">🔗 bog\'langan</span>';
            if (isSelected) h += '<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:var(--accent);color:#fff">✓</span>';
            h += '</div></div>';
            // Mijoz ismi · Loyiha nomi · Yaratuvchi · Sana (pul KO'RSATILMAYDI — TZ)
            h += '<div style="margin-top:2px;font-size:12px;font-weight:600">'+Utils.esc(o.partner_name || '')+'</div>';
            if (o.project_name) h += '<div style="font-size:11px;color:var(--text-muted);margin-top:1px">📁 Loyiha: '+Utils.esc(o.project_name)+'</div>';
            if (o.creator_name) h += '<div style="font-size:11px;color:var(--text-muted);margin-top:1px">👤 Yaratuvchi: '+Utils.esc(o.creator_name)+'</div>';
            h += '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:3px;font-size:10px;color:var(--text-muted)">';
            if (date) h += '<span>📅 '+date+'</span>';
            if (o.delivery_label) h += '<span style="padding:1px 5px;border-radius:3px;background:rgba(99,102,241,.08)">'+Utils.esc(o.delivery_label)+'</span>';
            if (o.current_step) h += '<span>📍 '+Utils.esc(o.current_step)+'</span>';
            h += '<span style="margin-left:auto">'+o.progress+'%</span>';
            h += '</div>';
            if (isLinked) h += '<div style="font-size:10px;color:#d97706;margin-top:2px">→ '+Utils.esc(o.linked_to)+'</div>';
            h += '</div>';
        });
        container.innerHTML = h;
    },

    _renderMcCalendar: function(orders, selectedId, calWrap, year, month) {
        var orderDates = {};
        var linkedDates = {};
        orders.forEach(function(o) {
            if (!o.created_at) return;
            var d = o.created_at.substring(0, 10);
            if (!orderDates[d]) orderDates[d] = [];
            orderDates[d].push(o);
            if (o.linked_to) linkedDates[d] = true;
        });
        var first = new Date(year, month, 1);
        var startDay = (first.getDay() + 6) % 7;
        var daysInMonth = new Date(year, month + 1, 0).getDate();
        var months = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

        var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
        h += '<button class="ce-btn" id="mc-cal-prev" style="padding:3px 8px;font-size:12px">◀</button>';
        h += '<span style="font-size:13px;font-weight:600">'+months[month]+' '+year+'</span>';
        h += '<button class="ce-btn" id="mc-cal-next" style="padding:3px 8px;font-size:12px">▶</button>';
        h += '</div>';
        h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:10px;margin-bottom:2px">';
        ['Du','Se','Ch','Pa','Ju','Sh','Ya'].forEach(function(d) { h += '<div style="color:var(--text-muted);padding:2px;font-weight:600">'+d+'</div>'; });
        h += '</div>';
        h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center">';
        for (var i = 0; i < startDay; i++) h += '<div></div>';
        for (var day = 1; day <= daysInMonth; day++) {
            var key = year + '-' + String(month+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
            var hasOrder = orderDates[key];
            var hasLinked = linkedDates[key];
            var bg = 'transparent', color = 'var(--text)', border = '1px solid transparent', cursor = 'default', dot = '';
            if (hasOrder) {
                bg = 'rgba(99,102,241,.1)'; border = '1px solid rgba(99,102,241,.25)'; cursor = 'pointer';
                if (hasLinked) {
                    dot = '<div style="position:absolute;bottom:1px;left:50%;transform:translateX(-50%);display:flex;gap:1px">' +
                          '<span style="width:4px;height:4px;border-radius:50%;background:#6366f1"></span>' +
                          '<span style="width:4px;height:4px;border-radius:50%;background:#f59e0b"></span></div>';
                } else {
                    dot = '<div style="position:absolute;bottom:1px;left:50%;transform:translateX(-50%)">' +
                          '<span style="width:4px;height:4px;border-radius:50%;background:#6366f1;display:block"></span></div>';
                }
            }
            h += '<div class="mc-cal-day'+(hasOrder?' has-orders':'')+'" data-date="'+key+'" style="position:relative;padding:4px 2px;border-radius:6px;font-size:11px;background:'+bg+';border:'+border+';cursor:'+cursor+'">';
            h += day + dot + '</div>';
        }
        h += '</div>';
        h += '<div style="display:flex;gap:10px;margin-top:6px;font-size:10px;color:var(--text-muted)">';
        h += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#6366f1;vertical-align:middle"></span> Buyurtma</span>';
        h += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;vertical-align:middle"></span> Bog\'langan</span>';
        h += '</div>';
        calWrap.innerHTML = h;
    },

    _initMcPicker: function(selectedId, onSelect) {
        var list = document.getElementById('mc-order-list');
        var search = document.getElementById('mc-search');
        var searchWrap = document.getElementById('mc-search-wrap');
        var calWrap = document.getElementById('mc-calendar-wrap');
        var hiddenInput = document.getElementById('mc-selected-id');
        var tabList = document.getElementById('mc-tab-list');
        var tabCal = document.getElementById('mc-tab-cal');
        var allOrders = [];
        var currentSelected = selectedId || null;
        var currentTab = 'list';
        var calYear = new Date().getFullYear();
        var calMonth = new Date().getMonth();
        var calDateFilter = null;
        if (hiddenInput && currentSelected) hiddenInput.value = currentSelected;

        WS.send('mebelcity_orders_for_stage', {}, function(msg) {
            if (!msg.ok || !msg.data) { list.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px">Xatolik</div>'; return; }
            allOrders = msg.data.orders || [];
            renderList(allOrders);
        });

        function renderList(items) {
            OrderDetail._renderMcList(items, currentSelected, list);
            list.querySelectorAll('.mc-order-item').forEach(function(el) {
                el.onclick = function() {
                    var id = parseInt(el.dataset.id);
                    currentSelected = (currentSelected === id) ? null : id;
                    if (hiddenInput) hiddenInput.value = currentSelected || '';
                    renderList(currentTab === 'cal' && calDateFilter ? filterByDate(calDateFilter) : getFiltered());
                    if (onSelect) onSelect(currentSelected);
                };
            });
        }

        function getFiltered() {
            var q = search ? search.value.toLowerCase().trim() : '';
            if (!q) return allOrders;
            return allOrders.filter(function(o) {
                return o.order_hash.toLowerCase().indexOf(q) >= 0 ||
                       (o.partner_name || '').toLowerCase().indexOf(q) >= 0 ||
                       (o.project_name && o.project_name.toLowerCase().indexOf(q) >= 0) ||
                       (o.creator_name && o.creator_name.toLowerCase().indexOf(q) >= 0) ||
                       (o.delivery_label && o.delivery_label.toLowerCase().indexOf(q) >= 0) ||
                       (o.current_step && o.current_step.toLowerCase().indexOf(q) >= 0);
            });
        }

        function filterByDate(dateKey) {
            return allOrders.filter(function(o) {
                return o.created_at && o.created_at.substring(0, 10) === dateKey;
            });
        }

        function renderCalendar() {
            OrderDetail._renderMcCalendar(allOrders, currentSelected, calWrap, calYear, calMonth);
            document.getElementById('mc-cal-prev').onclick = function() {
                calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
                calDateFilter = null; renderCalendar(); renderList(allOrders);
            };
            document.getElementById('mc-cal-next').onclick = function() {
                calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
                calDateFilter = null; renderCalendar(); renderList(allOrders);
            };
            calWrap.querySelectorAll('.mc-cal-day.has-orders').forEach(function(el) {
                el.onclick = function() {
                    calWrap.querySelectorAll('.mc-cal-day').forEach(function(d) { d.style.background = d.classList.contains('has-orders') ? 'rgba(99,102,241,.1)' : 'transparent'; });
                    el.style.background = 'rgba(99,102,241,.3)';
                    calDateFilter = el.dataset.date;
                    renderList(filterByDate(calDateFilter));
                };
            });
        }

        function switchTab(tab) {
            currentTab = tab;
            calDateFilter = null;
            if (tab === 'list') {
                searchWrap.style.display = 'block';
                calWrap.style.display = 'none';
                tabList.classList.add('active'); tabCal.classList.remove('active');
                tabList.style.background = 'var(--accent)'; tabList.style.color = '#fff';
                tabCal.style.background = ''; tabCal.style.color = '';
                renderList(getFiltered());
            } else {
                searchWrap.style.display = 'none';
                calWrap.style.display = 'block';
                tabCal.classList.add('active'); tabList.classList.remove('active');
                tabCal.style.background = 'var(--accent)'; tabCal.style.color = '#fff';
                tabList.style.background = ''; tabList.style.color = '';
                renderCalendar();
                renderList(allOrders);
            }
        }

        if (tabList) tabList.onclick = function() { switchTab('list'); };
        if (tabCal) tabCal.onclick = function() { switchTab('cal'); };
        tabList.style.background = 'var(--accent)'; tabList.style.color = '#fff';

        if (search) search.addEventListener('input', function() {
            calDateFilter = null;
            renderList(getFiltered());
        });
    },

    _showLinkMcModal: function(stageId) {
        var stage = null;
        if (OrderDetail._data) {
            OrderDetail._data.stages.forEach(function(s) { if (s.id === stageId) stage = s; });
        }
        Modal.open("🔗 Buyurtma ulash", OrderDetail._mcPickerHtml(),
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-link-mc">Ulash</button>'});
        OrderDetail._initMcPicker(stage ? stage.mebelcity_order_id : null);
        document.getElementById('btn-link-mc').onclick = function() {
            var val = document.getElementById('mc-selected-id').value;
            val = val ? parseInt(val) : null;
            WS.send('stage.link_order', {stage_id: stageId, mebelcity_order_id: val}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success(val ? 'Buyurtma ulandi' : 'Buyurtma uzildi');
                OrderDetail.render(OrderDetail._orderId);
            });
        };
    },

    // ── Jamoa avto-ulashish kartasi (share-modal va team.js Sozlamalar tabi baham ko'radi) ──

    _autoShareCardHtml: function(t) {
        var h = '<div class="autoshare-card" data-team="'+t.id+'" style="border:1.5px solid var(--border);border-radius:12px;padding:12px;margin-bottom:8px">';
        h += '<div style="font-size:13px;font-weight:700;margin-bottom:2px">👥 '+Utils.esc(t.name)+'</div>';
        if (t.members && t.members.length) {
            var names = t.members.map(function(m) { return Utils.esc(m.name); }).join(', ');
            h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">'+t.members.length+" a'zo: "+names+'</div>';
        } else {
            h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Faol a\'zo yo\'q — avval Jamoa sahifasida a\'zo qo\'shing</div>';
        }
        // BITTA asosiy tugma
        h += '<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;padding:10px;border:1.5px solid var(--border);border-radius:10px;cursor:pointer;margin-bottom:8px">';
        h += '<input type="checkbox" class="ta-master" style="width:18px;height:18px;flex-shrink:0"'+(t.auto_share_new_orders?' checked':'')+'>';
        h += '<span>🔁 Yangi buyurtmalarim jamoaga avto-ochilsin</span></label>';
        // Avto-ruxsat qatori
        h += '<div class="ta-perm-row" style="display:'+(t.auto_share_new_orders?'block':'none')+'">';
        h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">A\'zolarga beriladigan ruxsatlar:</div>';
        h += '<select class="ce-input ta-role" style="width:100%;font-size:12px;margin-bottom:8px">';
        h += '<option value="viewer"'+(t.auto_role==='viewer'?' selected':'')+'>👁 Ko\'ruvchi — faqat ko\'radi</option>';
        h += '<option value="worker"'+(t.auto_role==='worker'?' selected':'')+'>🔨 Ishchi — etap bajaradi</option>';
        h += '<option value="manager"'+(t.auto_role==='manager'?' selected':'')+'>⭐ Menejer — hammasini boshqaradi</option>';
        h += '</select>';
        h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
        h += '<label style="display:flex;align-items:center;gap:5px;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:8px;cursor:pointer"><input type="checkbox" class="ta-money"'+(t.auto_can_see_money?' checked':'')+'> 💰 Pul ko\'rinadi</label>';
        h += '<label style="display:flex;align-items:center;gap:5px;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:8px;cursor:pointer"><input type="checkbox" class="ta-expense"'+(t.auto_can_add_expense?' checked':'')+'> ➖ Chiqim</label>';
        h += '<label style="display:flex;align-items:center;gap:5px;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:8px;cursor:pointer"><input type="checkbox" class="ta-complete"'+(t.auto_can_complete_stage?' checked':'')+'> ✅ Tugatish</label>';
        h += '</div></div></div>';
        return h;
    },

    _bindAutoShareCards: function(scope) {
        (scope || document).querySelectorAll('.autoshare-card').forEach(function(card) {
            var master = card.querySelector('.ta-master');
            var row = card.querySelector('.ta-perm-row');
            if (master && row) {
                master.onchange = function() { row.style.display = master.checked ? 'block' : 'none'; };
            }
        });
    },

    _autoShareCollect: function(card) {
        return {
            team_id: parseInt(card.dataset.team),
            auto_share_new_orders: !!(card.querySelector('.ta-master') && card.querySelector('.ta-master').checked),
            auto_role: card.querySelector('.ta-role') ? card.querySelector('.ta-role').value : 'worker',
            auto_can_see_money: !!(card.querySelector('.ta-money') && card.querySelector('.ta-money').checked),
            auto_can_add_expense: !!(card.querySelector('.ta-expense') && card.querySelector('.ta-expense').checked),
            auto_can_complete_stage: !!(card.querySelector('.ta-complete') && card.querySelector('.ta-complete').checked),
        };
    },

    _showPermModal: function() {
        var d = this._data;
        Modal.open("Ruxsat berish",
            // Shaxs / Jamoa segmenti — BITTA joy, BITTA tugma falsafasi
            '<div style="margin-bottom:12px"><div style="display:flex;border:1.5px solid var(--border);border-radius:10px;overflow:hidden">' +
            '<button type="button" class="perm-target-btn" data-target="person" style="flex:1;padding:11px 6px;border:none;font-size:13px;font-weight:700;cursor:pointer">👤 Shaxs</button>' +
            '<button type="button" class="perm-target-btn" data-target="team" style="flex:1;padding:11px 6px;border:none;font-size:13px;font-weight:700;cursor:pointer">👥 Jamoa</button>' +
            '</div></div>' +
            // ── Shaxs rejimi (mavjud oqim o'zgarishsiz) ──
            '<div id="perm-person-wrap">' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Foydalanuvchi qidirish</label>' +
            '<input type="text" id="perm-search" class="ce-input" style="width:100%" placeholder="Ism yoki telefon...">' +
            '<div id="perm-search-results" style="margin-top:6px"></div>' +
            '<input type="hidden" name="user_id"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Rol</label><select name="role" class="ce-input" style="width:100%"><option value="viewer">Ko\'ruvchi — faqat ko\'radi</option><option value="worker">Ishchi — etap bajaradi</option><option value="manager">Menejer — hammasini boshqaradi</option></select></div>' +
            '<div style="margin-bottom:12px"><label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" name="can_add_expense"> Chiqim qo\'sha olsin</label></div>' +
            '<div style="margin-bottom:12px"><label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" name="can_complete_stage"> Etap tugallashi mumkin</label></div>' +
            '<div style="margin-bottom:12px"><label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" name="can_see_money" id="perm-see-money"> 💰 Pul ko\'rinadi (kirim/chiqim/foyda)</label></div>' +
            // "Bir martalik / Har doim" — juda sodda segmented tanlov
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px">Ulashish turi</label>' +
            '<div style="display:flex;border:1.5px solid var(--border);border-radius:10px;overflow:hidden">' +
            '<button type="button" class="perm-mode-btn" data-mode="once" style="flex:1;padding:11px 6px;border:none;font-size:13px;font-weight:700;cursor:pointer">Bir martalik</button>' +
            '<button type="button" class="perm-mode-btn" data-mode="always" style="flex:1;padding:11px 6px;border:none;font-size:13px;font-weight:700;cursor:pointer">Har doim</button>' +
            '</div>' +
            '<div id="perm-mode-hint" style="font-size:11px;color:var(--text-muted);margin-top:5px"></div></div>' +
            '<div id="standing-list-wrap"></div>' +
            '</div>' +
            // ── Jamoa rejimi (avto-ulashish sozlamalari) ──
            '<div id="perm-team-wrap" style="display:none"><div style="font-size:12px;color:var(--text-muted);padding:8px 0">Yuklanmoqda...</div></div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-save-perm">Saqlash</button>'});

        // Shaxs / Jamoa segmenti — default "Shaxs"
        var permTarget = 'person';
        var teamsLoaded = false;
        function paintTarget() {
            document.querySelectorAll('.perm-target-btn').forEach(function(b) {
                var on = b.dataset.target === permTarget;
                b.style.background = on ? 'var(--accent)' : 'transparent';
                b.style.color = on ? '#fff' : 'var(--text-muted)';
            });
            var pw = document.getElementById('perm-person-wrap');
            var tw = document.getElementById('perm-team-wrap');
            if (pw) pw.style.display = permTarget === 'person' ? '' : 'none';
            if (tw) tw.style.display = permTarget === 'team' ? '' : 'none';
            if (permTarget === 'team' && !teamsLoaded) loadTeams();
        }
        function loadTeams() {
            teamsLoaded = true;
            WS.send('team.autoshare_get', {}, function(msg) {
                var tw = document.getElementById('perm-team-wrap');
                if (!tw) return;
                if (!msg.ok) { tw.innerHTML = '<div style="font-size:12px;color:var(--danger);padding:8px 0">'+Utils.esc(msg.error||'Xatolik')+'</div>'; return; }
                var teams = (msg.data && msg.data.teams) || [];
                if (!teams.length) {
                    tw.innerHTML = '<div style="text-align:center;padding:16px;font-size:13px;color:var(--text-muted)">Sizda jamoa yo\'q.<br><a href="#/team" style="color:var(--accent)">Jamoa sahifasida yarating</a></div>';
                    return;
                }
                var th = '';
                teams.forEach(function(t) { th += OrderDetail._autoShareCardHtml(t); });
                th += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Tugmani yoqib "Saqlash"ni bossangiz — bundan keyin HAR BIR yangi buyurtmangiz jamoa a\'zolariga avtomatik ochiladi (eski buyurtmalarga tegilmaydi)</div>';
                tw.innerHTML = th;
                OrderDetail._bindAutoShareCards(tw);
            });
        }
        document.querySelectorAll('.perm-target-btn').forEach(function(b) {
            b.onclick = function() { permTarget = b.dataset.target; paintTarget(); };
        });
        paintTarget();

        // Segmented tanlov — default "Bir martalik"
        var permMode = 'once';
        function paintMode() {
            document.querySelectorAll('.perm-mode-btn').forEach(function(b) {
                var on = b.dataset.mode === permMode;
                b.style.background = on ? 'var(--accent)' : 'transparent';
                b.style.color = on ? '#fff' : 'var(--text-muted)';
            });
            var hint = document.getElementById('perm-mode-hint');
            if (hint) hint.textContent = permMode === 'always'
                ? "Har doim: bundan keyin HAR BIR yangi buyurtmangiz shu odamga avtomatik ulashiladi va unga xabar boradi"
                : "Bir martalik: faqat shu buyurtma uchun";
        }
        document.querySelectorAll('.perm-mode-btn').forEach(function(b) {
            b.onclick = function() { permMode = b.dataset.mode; paintMode(); };
        });
        paintMode();

        // "Har doim" doimiy a'zolar ro'yxati — shu modaldan boshqariladi (✏️ tahrirlash bilan)
        function loadStanding() {
            var wrap = document.getElementById('standing-list-wrap');
            if (!wrap) return;
            WS.send('standing.list', {}, function(msg) {
                if (!msg.ok || !wrap) return;
                var members = (msg.data && msg.data.members) || [];
                if (!members.length) { wrap.innerHTML = ''; return; }
                var sh = '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">🔁 Har doim ulashiladiganlar</div>';
                members.forEach(function(m) {
                    sh += '<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:5px;padding:7px 9px;font-size:12px">';
                    sh += '<div style="display:flex;align-items:center;gap:8px">';
                    sh += '<span style="flex:1;min-width:0"><b>'+Utils.esc(m.full_name)+'</b> <span style="color:var(--text-muted)">'+Utils.roleLabel(m.role)+(m.can_see_money?' · 💰':'')+(m.can_add_expense?' · ➖':'')+(m.can_complete_stage?' · ✅':'')+'</span></span>';
                    sh += '<button class="btn-edit-standing" data-id="'+m.id+'" style="padding:3px 8px;font-size:11px;background:var(--secondary,#6366f1);color:#fff;border:none;border-radius:5px;cursor:pointer" title="Ruxsatlarni tahrirlash">✏️</button>';
                    sh += '<button class="btn-del-standing" data-id="'+m.id+'" style="padding:3px 8px;font-size:11px;background:var(--danger);color:#fff;border:none;border-radius:5px;cursor:pointer" title="Har doim ulashishni to\'xtatish">✕</button>';
                    sh += '</div>';
                    // Inline tahrir paneli (✏️ bosilganda ochiladi)
                    sh += '<div class="standing-edit" data-id="'+m.id+'" style="display:none;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)">';
                    sh += '<select class="ce-input se-role" style="width:100%;font-size:12px;margin-bottom:6px">';
                    sh += '<option value="viewer"'+(m.role==='viewer'?' selected':'')+'>👁 Ko\'ruvchi — faqat ko\'radi</option>';
                    sh += '<option value="worker"'+(m.role==='worker'?' selected':'')+'>🔨 Ishchi — etap bajaradi</option>';
                    sh += '<option value="manager"'+(m.role==='manager'?' selected':'')+'>⭐ Menejer — hammasini boshqaradi</option>';
                    sh += '</select>';
                    sh += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">';
                    sh += '<label style="display:flex;align-items:center;gap:4px;font-size:11px;padding:5px 8px;border:1px solid var(--border);border-radius:8px;cursor:pointer"><input type="checkbox" class="se-money"'+(m.can_see_money?' checked':'')+'> 💰 Pul</label>';
                    sh += '<label style="display:flex;align-items:center;gap:4px;font-size:11px;padding:5px 8px;border:1px solid var(--border);border-radius:8px;cursor:pointer"><input type="checkbox" class="se-expense"'+(m.can_add_expense?' checked':'')+'> ➖ Chiqim</label>';
                    sh += '<label style="display:flex;align-items:center;gap:4px;font-size:11px;padding:5px 8px;border:1px solid var(--border);border-radius:8px;cursor:pointer"><input type="checkbox" class="se-complete"'+(m.can_complete_stage?' checked':'')+'> ✅ Tugatish</label>';
                    sh += '</div>';
                    sh += '<button class="btn-save-standing ce-btn ce-btn-primary" data-id="'+m.id+'" style="font-size:11px;padding:5px 12px">Saqlash</button>';
                    sh += '</div>';
                    sh += '</div>';
                });
                wrap.innerHTML = sh;
                wrap.querySelectorAll('.btn-edit-standing').forEach(function(b) {
                    b.onclick = function() {
                        var panel = wrap.querySelector('.standing-edit[data-id="'+b.dataset.id+'"]');
                        if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                    };
                });
                wrap.querySelectorAll('.btn-save-standing').forEach(function(b) {
                    b.onclick = function() {
                        var panel = wrap.querySelector('.standing-edit[data-id="'+b.dataset.id+'"]');
                        if (!panel) return;
                        WS.send('standing.update', {
                            id: parseInt(b.dataset.id),
                            role: panel.querySelector('.se-role').value,
                            can_see_money: panel.querySelector('.se-money').checked,
                            can_add_expense: panel.querySelector('.se-expense').checked,
                            can_complete_stage: panel.querySelector('.se-complete').checked,
                        }, function(res) {
                            if (!res.ok) return Toast.error(res.error);
                            Toast.success('Saqlandi');
                            loadStanding();
                        });
                    };
                });
                wrap.querySelectorAll('.btn-del-standing').forEach(function(b) {
                    b.onclick = function() {
                        WS.send('standing.delete', {id: parseInt(b.dataset.id)}, function(res) {
                            if (!res.ok) return Toast.error(res.error);
                            Toast.success("Har doim ulashish to'xtatildi");
                            loadStanding();
                        });
                    };
                });
            });
        }
        loadStanding();

        var searchInput = document.getElementById('perm-search');
        var resultsDiv = document.getElementById('perm-search-results');
        searchInput.oninput = Utils.debounce(function() {
            var q = searchInput.value.trim();
            if (q.length < 2) { resultsDiv.innerHTML = ''; return; }
            WS.send('user.search', {q: q}, function(msg) {
                if (!msg.ok) return;
                var html = '';
                (msg.data.users || []).forEach(function(u) {
                    html += '<div class="search-user-item" data-id="'+u.id+'" style="padding:8px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px">';
                    html += Utils.esc(u.full_name)+' <span style="color:var(--text-muted)">'+Utils.esc(u.phone)+'</span></div>';
                });
                resultsDiv.innerHTML = html || '<div style="font-size:12px;color:var(--text-muted);padding:8px">Topilmadi</div>';
                resultsDiv.querySelectorAll('.search-user-item').forEach(function(item) {
                    item.onclick = function() {
                        document.querySelector('[name="user_id"]').value = item.dataset.id;
                        searchInput.value = item.textContent.trim();
                        resultsDiv.innerHTML = '';
                    };
                });
            });
        }, 300);

        document.getElementById('btn-save-perm').onclick = function() {
            // ── Jamoa rejimi: barcha avto-ulashish kartalarini bitta tugmada saqlash ──
            if (permTarget === 'team') {
                var cards = document.querySelectorAll('#perm-team-wrap .autoshare-card');
                if (!cards.length) return Toast.error("Jamoa yo'q");
                var left = cards.length, failed = null;
                cards.forEach(function(card) {
                    WS.send('team.autoshare_set', OrderDetail._autoShareCollect(card), function(msg) {
                        if (!msg.ok) failed = msg.error || 'Xatolik';
                        left--;
                        if (left === 0) {
                            if (failed) return Toast.error(failed);
                            Modal.close();
                            Toast.success('Jamoa avto-ulashish saqlandi');
                        }
                    });
                });
                return;
            }
            // ── Shaxs rejimi (mavjud oqim) ──
            var f = Modal.getFormData();
            if (!f.user_id) return Toast.error('Foydalanuvchi tanlang');
            WS.send('perm.save', {
                order_id: d.id, user_id: parseInt(f.user_id), role: f.role,
                can_add_expense: !!f.can_add_expense, can_complete_stage: !!f.can_complete_stage,
                can_see_money: !!f.can_see_money,
                always: permMode === 'always',
                stages: [],
            }, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success(permMode === 'always' ? "Ruxsat saqlandi — endi har doim ulashiladi" : 'Ruxsat saqlandi');
                OrderDetail.render(d.id);
            });
        };
    },

    // ── Fayllar ──

    _filesGrid: function(files) {
        var h = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">';
        files.forEach(function(f, idx) {
            h += '<div class="od-file-card" data-id="'+f.id+'" data-idx="'+idx+'" style="border-radius:8px;overflow:hidden;border:1px solid var(--border);position:relative;cursor:pointer">';
            if (f.file_type === 'image') {
                var src = f.thumbnail_url || f.file_url;
                h += '<div style="aspect-ratio:1;background:#f1f5f9"><img src="'+Utils.esc(src)+'" style="width:100%;height:100%;object-fit:cover" loading="lazy"></div>';
            } else if (f.file_type === 'video') {
                if (f.thumbnail_url) {
                    h += '<div style="aspect-ratio:1;background:#0f172a;position:relative"><img src="'+Utils.esc(f.thumbnail_url)+'" style="width:100%;height:100%;object-fit:cover" loading="lazy">';
                    h += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><i class="fas fa-play-circle" style="font-size:30px;color:rgba(255,255,255,.85);text-shadow:0 2px 8px rgba(0,0,0,.4)"></i></div></div>';
                } else {
                    h += '<div style="aspect-ratio:1;background:#0f172a;display:flex;align-items:center;justify-content:center"><i class="fas fa-play-circle" style="font-size:28px;color:rgba(255,255,255,.7)"></i></div>';
                }
            } else if (f.file_name.toLowerCase().endsWith('.pdf')) {
                h += '<div style="aspect-ratio:1;background:#fef2f2;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px">';
                h += '<i class="fas fa-file-pdf" style="font-size:24px;color:#ef4444"></i>';
                h += '<div style="font-size:9px;color:var(--text-muted);margin-top:4px;text-align:center;word-break:break-all">'+Utils.esc(f.file_name.substring(0,20))+'</div></div>';
            } else if (/\.(b3d|project|bpj)$/i.test(f.file_name)) {
                h += '<div style="aspect-ratio:1;background:#eef2ff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px">';
                h += '<i class="fas fa-drafting-compass" style="font-size:24px;color:#4338ca"></i>';
                h += '<div style="font-size:9px;color:#4338ca;font-weight:700;margin-top:4px;text-align:center;word-break:break-all">'+Utils.esc(f.file_name.substring(0,20))+'</div></div>';
            } else {
                h += '<div style="aspect-ratio:1;background:#f8fafc;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px">';
                h += '<i class="fas fa-file" style="font-size:22px;color:var(--text-muted)"></i>';
                h += '<div style="font-size:9px;color:var(--text-muted);margin-top:4px;text-align:center;word-break:break-all">'+Utils.esc(f.file_name.substring(0,20))+'</div></div>';
            }
            h += '<div style="position:absolute;top:3px;right:3px;display:flex;gap:2px">';
            h += '<button class="btn-share-file" data-url="'+Utils.esc(f.file_url)+'" style="width:22px;height:22px;border-radius:50%;border:none;background:rgba(0,0,0,.5);color:#fff;cursor:pointer;font-size:9px;display:flex;align-items:center;justify-content:center"><i class="fas fa-share-alt"></i></button>';
            h += '<button class="btn-del-file" data-id="'+f.id+'" style="width:22px;height:22px;border-radius:50%;border:none;background:rgba(239,68,68,.8);color:#fff;cursor:pointer;font-size:9px;display:flex;align-items:center;justify-content:center"><i class="fas fa-trash"></i></button>';
            h += '</div>';
            h += '</div>';
        });
        h += '</div>';
        return h;
    },

    // Fayl-gridni to'liq re-fetch'siz yangilash (AI tahrir / WS file.created)
    _refreshFilesGrid: function() {
        var grid = document.getElementById('od-files');
        if (!grid || !OrderDetail._data) return;
        var files = OrderDetail._data.files || [];
        grid.innerHTML = files.length
            ? OrderDetail._filesGrid(files)
            : '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Fayllar yo\'q</div>';
        OrderDetail._bindFiles(); // innerHTML almashganda onclick'lar yo'qoladi — qayta bog'lash
    },

    _bindFiles: function() {
        var d = this._data;
        var uploadBtn = document.getElementById('btn-upload-file');
        if (uploadBtn) {
            uploadBtn.onclick = function() { OrderDetail._showFileUploadModal(); };
        }
        document.querySelectorAll('.od-file-card').forEach(function(card) {
            card.onclick = function(e) {
                if (e.target.closest('.btn-share-file') || e.target.closest('.btn-del-file')) return;
                var idx = parseInt(card.dataset.idx);
                Gallery.open(d.files, idx);
            };
        });
        document.querySelectorAll('.btn-share-file').forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var url = window.location.origin + btn.dataset.url;
                if (navigator.share) {
                    navigator.share({url: url}).catch(function(){});
                } else {
                    navigator.clipboard.writeText(url).then(function() { Toast.success('URL nusxalandi'); });
                }
            };
        });
        document.querySelectorAll('.btn-del-file').forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                Modal.confirm("O'chirish", "Faylni o'chirasizmi?", function() {
                    WS.send('file.delete', {file_id: parseInt(btn.dataset.id)}, function(msg) {
                        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
                        Toast.success("O'chirildi");
                        OrderDetail.render(d.id);
                    });
                });
            };
        });
    },

    _openGallery: function(files, startIdx) {
        Gallery.open(files, startIdx);
    },

    _showFileUploadModal: function() {
        var d = this._data;
        var body = '<div style="display:flex;gap:6px;margin-bottom:10px">';
        body += '<button class="ce-btn ce-btn-primary" id="fu-pick-file" style="flex:1;font-size:12px;padding:8px"><i class="fas fa-folder-open"></i> Fayl tanlash</button>';
        body += '<button class="ce-btn ce-btn-secondary" id="fu-take-photo" style="flex:1;font-size:12px;padding:8px"><i class="fas fa-camera"></i> Suratga olish</button>';
        body += '<button class="ce-btn ce-btn-secondary" id="fu-take-video" style="flex:1;font-size:12px;padding:8px"><i class="fas fa-video"></i> Video</button>';
        body += '</div>';
        body += '<input type="file" id="fu-file-input" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.b3d,.project,.bpj" style="display:none">';
        body += '<input type="file" id="fu-camera-input" accept="image/*" capture="environment" style="display:none">';
        body += '<input type="file" id="fu-video-input" accept="video/*" capture="environment" style="display:none">';
        body += '<div id="fu-preview" style="margin-top:8px"></div>';
        body += '<div id="fu-progress" style="display:none;margin-top:8px"><div style="font-size:11px;color:var(--text-muted)">Yuklanmoqda...</div><div style="height:4px;border-radius:2px;background:var(--border);margin-top:4px"><div id="fu-bar" style="width:0%;height:100%;border-radius:2px;background:var(--accent);transition:width .2s"></div></div></div>';
        Modal.open('📎 Fayl yuklash', body);

        var fileInput = document.getElementById('fu-file-input');
        var cameraInput = document.getElementById('fu-camera-input');
        var videoInput = document.getElementById('fu-video-input');
        document.getElementById('fu-pick-file').onclick = function() { fileInput.click(); };
        document.getElementById('fu-take-photo').onclick = function() { cameraInput.click(); };
        document.getElementById('fu-take-video').onclick = function() { videoInput.click(); };

        function handleFiles(files) {
            if (!files || !files.length) return;
            var preview = document.getElementById('fu-preview');
            preview.innerHTML = '';
            Array.from(files).forEach(function(f) {
                var div = document.createElement('div');
                div.style.cssText = 'font-size:11px;padding:4px;display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--border)';
                var icon = f.type.startsWith('image/') ? '🖼' : f.type.startsWith('video/') ? '🎬' : '📄';
                div.textContent = icon + ' ' + f.name + ' (' + OrderDetail._formatSize(f.size) + ')';
                preview.appendChild(div);
            });
            OrderDetail._uploadFiles(Array.from(files), d.id);
        }

        fileInput.onchange = function() { handleFiles(fileInput.files); };
        cameraInput.onchange = function() { handleFiles(cameraInput.files); };
        videoInput.onchange = function() { handleFiles(videoInput.files); };
    },

    _formatSize: function(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1073741824).toFixed(1) + ' GB';
    },

    _uploadFiles: function(files, orderId) {
        var CHUNK_SIZE = 5 * 1024 * 1024;
        var prog = document.getElementById('fu-progress');
        var bar = document.getElementById('fu-bar');
        if (prog) prog.style.display = 'block';
        var total = files.length;
        var done = 0;

        function next() {
            if (done >= total) {
                Toast.success(total + ' ta fayl yuklandi');
                Modal.close();
                OrderDetail.render(orderId);
                return;
            }
            var f = files[done];
            if (bar) bar.style.width = Math.round(done / total * 100) + '%';

            if (f.size > CHUNK_SIZE) {
                OrderDetail._chunkedUpload(f, orderId, function() { done++; next(); });
            } else {
                var fd = new FormData();
                fd.append('file', f);
                fd.append('order_id', orderId);
                var xhr = new XMLHttpRequest();
                xhr.open('POST', '/mini/api/file-upload/');
                xhr.onload = function() { done++; next(); };
                xhr.onerror = function() { Toast.error('Xatolik: ' + f.name); done++; next(); };
                xhr.send(fd);
            }
        }
        next();
    },

    _chunkedUpload: function(file, orderId, onDone) {
        var CHUNK_SIZE = 5 * 1024 * 1024;
        var totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        var uploadId = '';
        var idx = 0;
        var bar = document.getElementById('fu-bar');

        function sendChunk() {
            if (idx >= totalChunks) { if (onDone) onDone(); return; }
            var start = idx * CHUNK_SIZE;
            var end = Math.min(start + CHUNK_SIZE, file.size);
            var chunk = file.slice(start, end);
            var fd = new FormData();
            fd.append('chunk', chunk);
            fd.append('order_id', orderId);
            fd.append('file_name', file.name);
            fd.append('chunk_index', idx);
            fd.append('total_chunks', totalChunks);
            if (uploadId) fd.append('upload_id', uploadId);

            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/mini/api/chunk-upload/');
            xhr.onload = function() {
                try {
                    var res = JSON.parse(xhr.responseText);
                    if (res.data && res.data.upload_id) uploadId = res.data.upload_id;
                } catch(e) {}
                idx++;
                if (bar) bar.style.width = Math.round(idx / totalChunks * 100) + '%';
                sendChunk();
            };
            xhr.onerror = function() { Toast.error('Chunk xatolik'); if (onDone) onDone(); };
            xhr.send(fd);
        }
        sendChunk();
    },

    // ── Eslatmalar ──

    _noteCard: function(n) {
        var h = '<div class="od-note-card" data-id="'+n.id+'" style="padding:10px 12px;margin-bottom:6px;border-radius:10px;border:1px solid var(--border);background:linear-gradient(135deg,rgba(251,191,36,.04),rgba(245,158,11,.02))">';
        h += '<div style="display:flex;justify-content:space-between;align-items:start">';
        h += '<div style="font-size:13px;white-space:pre-wrap;word-break:break-word;flex:1">'+Utils.esc(n.text)+'</div>';
        h += '<div style="display:flex;gap:3px;margin-left:8px;flex-shrink:0">';
        h += '<button class="btn-edit-note" data-id="'+n.id+'" style="width:24px;height:24px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center"><i class="fas fa-pen"></i></button>';
        h += '<button class="btn-del-note" data-id="'+n.id+'" style="width:24px;height:24px;border-radius:6px;border:1px solid rgba(239,68,68,.2);background:transparent;color:var(--danger);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center"><i class="fas fa-trash"></i></button>';
        h += '</div></div>';
        h += '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--text-muted)">';
        h += '<span>'+Utils.esc(n.created_by)+'</span>';
        h += '<span>'+Utils.timeAgo(n.created_at)+'</span>';
        h += '</div></div>';
        return h;
    },

    _bindNotes: function() {
        var d = this._data;
        var addBtn = document.getElementById('btn-add-note');
        if (addBtn) addBtn.onclick = function() {
            var body = '<textarea class="ce-input" name="note_text" rows="5" style="width:100%;resize:vertical;font-size:13px" placeholder="Eslatma yozing..."></textarea>';
            Modal.open('📝 Yangi eslatma', body, {
                footer: '<button class="ce-btn ce-btn-primary" id="btn-save-note">Saqlash</button>'
            });
            document.getElementById('btn-save-note').onclick = function() {
                var text = document.querySelector('[name="note_text"]').value.trim();
                if (!text) return Toast.error('Matn kiriting');
                WS.send('note.create', {order_id: d.id, text: text}, function(msg) {
                    if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
                    Modal.close();
                    Toast.success('Saqlandi');
                    OrderDetail.render(d.id);
                });
            };
        };
        document.querySelectorAll('.btn-edit-note').forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var noteId = parseInt(btn.dataset.id);
                var note = (d.notes || []).find(function(n) { return n.id === noteId; });
                if (!note) return;
                var body = '<textarea class="ce-input" name="note_text" rows="5" style="width:100%;resize:vertical;font-size:13px">'+Utils.esc(note.text)+'</textarea>';
                Modal.open('📝 Tahrirlash', body, {
                    footer: '<button class="ce-btn ce-btn-primary" id="btn-update-note">Saqlash</button>'
                });
                document.getElementById('btn-update-note').onclick = function() {
                    var text = document.querySelector('[name="note_text"]').value.trim();
                    if (!text) return Toast.error('Matn kiriting');
                    WS.send('note.update', {note_id: noteId, text: text}, function(msg) {
                        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
                        Modal.close();
                        Toast.success('Yangilandi');
                        OrderDetail.render(d.id);
                    });
                };
            };
        });
        document.querySelectorAll('.btn-del-note').forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                Modal.confirm("O'chirish", "Eslatmani o'chirasizmi?", function() {
                    WS.send('note.delete', {note_id: parseInt(btn.dataset.id)}, function(msg) {
                        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
                        Toast.success("O'chirildi");
                        OrderDetail.render(d.id);
                    });
                });
            };
        });
    },

    // Broadcast handler — called from WS._handleBroadcast
    handleBroadcast: function(action, data, by) {
        if (!OrderDetail._data) return;
        if (action === 'file.created') {
            // Yangi fayl (masalan AI tahrir natijasi) — to'liq re-fetch'siz grid yangilash
            var files = OrderDetail._data.files || (OrderDetail._data.files = []);
            var dup = false;
            for (var fi = 0; fi < files.length; fi++) {
                if (files[fi].id === data.id) { dup = true; break; }
            }
            if (!dup) files.unshift(data);
            OrderDetail._refreshFilesGrid();
            return;
        }
        if (action === 'order.updated' || action === 'order.income' || action === 'order.expense' ||
            action === 'template.applied' || action === 'perm.saved' || action === 'perm.deleted') {
            Toast.info((by || 'Kimdir') + ' yangiladi');
            OrderDetail.render(OrderDetail._orderId);
            return;
        }
        if (action === 'stage.completed' || action === 'stage.skipped') {
            Toast.info((by || 'Kimdir') + ' etapni yangiladi');
            OrderDetail._renderKeepScroll();
            return;
        }
        if (action === 'stage.created' || action === 'stage.linked') {
            Toast.info((by || 'Kimdir') + ' etapni yangiladi');
            OrderDetail._renderKeepScroll();
            return;
        }
        if (action === 'stage.deleted') {
            var card = document.querySelector('.stage-card[data-id="'+data.stage_id+'"]');
            if (card) card.remove();
            OrderDetail._updateProgress(data.progress);
            return;
        }
        if (action === 'stage.checked') {
            var label = document.querySelector('.checklist-item[data-item="'+data.item_id+'"]');
            if (label) {
                var chk = label.querySelector('input');
                var span = label.querySelector('span');
                if (chk) chk.checked = data.is_done;
                if (span) {
                    span.style.textDecoration = data.is_done ? 'line-through' : '';
                    span.style.color = data.is_done ? 'var(--text-muted)' : '';
                }
            }
            return;
        }
    },
};
