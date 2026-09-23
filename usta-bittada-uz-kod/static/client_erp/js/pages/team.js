/* client_erp/js/pages/team.js — Jamoa boshqaruvi */
var Team = {
    _data: null,
    _tab: 'members',

    render: function() {
        var app = document.getElementById('app');
        app.innerHTML = Skeleton.list ? Skeleton.list() : '<div style="padding:20px;text-align:center;color:var(--text-muted)">Yuklanmoqda...</div>';
        WS.send('page.team', {}, function(msg) {
            if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
            Team._data = msg.data;
            app.innerHTML = Team.template(msg.data);
            Team.bind();
        });
    },

    template: function(d) {
        var h = '';
        if (!d.team) {
            h += '<div style="text-align:center;padding:40px 20px">';
            h += '<div style="font-size:48px;margin-bottom:16px">👥</div>';
            h += '<h2 style="font-size:18px;margin-bottom:8px">Jamoa yaratilmagan</h2>';
            h += '<p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Jamoa yarating va hamkorlarni taklif qiling</p>';
            h += '<button class="ce-btn ce-btn-primary" id="btn-create-team" style="font-size:13px;padding:10px 24px"><i class="fas fa-plus"></i> Jamoa yaratish</button>';
            h += '</div>';
            return h;
        }

        var t = d.team;
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
        h += '<div><h2 style="font-size:18px;margin:0">👥 '+Utils.esc(t.name)+'</h2>';
        h += '<div style="font-size:12px;color:var(--text-muted)">'+t.members.length+' a\'zo</div></div>';
        h += '<button class="ce-btn ce-btn-primary" id="btn-invite" style="font-size:12px;padding:6px 14px"><i class="fas fa-user-plus"></i> Taklif</button></div>';

        // Tabs
        h += '<div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto">';
        h += '<button class="ce-btn team-tab '+(Team._tab==='members'?'ce-btn-secondary':'')+'" data-tab="members" style="font-size:12px;padding:6px 12px">A\'zolar</button>';
        h += '<button class="ce-btn team-tab '+(Team._tab==='orders'?'ce-btn-secondary':'')+'" data-tab="orders" style="font-size:12px;padding:6px 12px;white-space:nowrap">📦 Buyurtmalar'+((d.team_orders||[]).length?' ('+d.team_orders.length+')':'')+'</button>';
        h += '<button class="ce-btn team-tab '+(Team._tab==='profit'?'ce-btn-secondary':'')+'" data-tab="profit" style="font-size:12px;padding:6px 12px">Foyda shabloni</button>';
        h += '<button class="ce-btn team-tab '+(Team._tab==='settings'?'ce-btn-secondary':'')+'" data-tab="settings" style="font-size:12px;padding:6px 12px">Sozlamalar</button>';
        h += '<button class="ce-btn team-tab '+(Team._tab==='member_teams'?'ce-btn-secondary':'')+'" data-tab="member_teams" style="font-size:12px;padding:6px 12px;white-space:nowrap">A\'zo bo\'lgan jamolar'+((d.member_teams||[]).length?' ('+d.member_teams.length+')':'')+'</button>';
        h += '</div>';

        h += '<div id="team-content">';
        if (Team._tab === 'members') h += Team._membersTab(t);
        else if (Team._tab === 'orders') h += Team._ordersTab(d);
        else if (Team._tab === 'profit') h += Team._profitTab(d);
        else if (Team._tab === 'settings') h += Team._settingsTab(t);
        else if (Team._tab === 'member_teams') h += Team._memberTeamsTab(d);
        h += '</div>';

        return h;
    },

    _ordersTab: function(d) {
        var list = d.team_orders || [];
        if (!list.length) {
            return '<div class="ce-empty"><div class="ce-empty-icon">📦</div><p>Jamoaga ulashilgan buyurtma yo\'q</p></div>';
        }
        var vis = {full:'',limited:' 🔒',finance_hidden:' 💰🔒'};
        var h = '';
        list.forEach(function(to) {
            h += '<a href="#/orders/'+to.order.id+'" class="ce-card" style="padding:12px;margin-bottom:8px;text-decoration:none;color:inherit;display:block;border-left:3px solid #6366f1">';
            h += '<div style="display:flex;justify-content:space-between;align-items:start"><div style="font-size:13px;font-weight:500">'+Utils.esc(to.order.title)+'</div>'+Utils.statusBadge(to.order.status)+'</div>';
            if (to.visibility !== 'finance_hidden') {
                h += '<div style="margin-top:4px;font-size:12px;color:var(--accent)">'+Utils.money(to.order.total_income)+'</div>';
            }
            h += '<div style="font-size:10px;color:var(--text-muted);margin-top:4px">'+Utils.esc(to.team_name)+(vis[to.visibility]||'')+'</div>';
            h += Utils.progressBar(to.order.overall_progress) + '</a>';
        });
        return h;
    },

    _memberTeamsTab: function(d) {
        var roles = {owner:'Egasi', admin:'Admin', worker:'Ishchi', viewer:'Ko\'ruvchi'};
        var list = d.member_teams || [];
        if (!list.length) {
            return '<div class="ce-empty"><div class="ce-empty-icon">🤝</div><p>Hali boshqa jamoaga qo\'shilmagansiz</p></div>';
        }
        var h = '';
        list.forEach(function(tm) {
            h += '<div class="ce-card" style="padding:14px;margin-bottom:10px">';
            h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">';
            h += '<div style="min-width:0"><div style="font-size:15px;font-weight:700">👥 '+Utils.esc(tm.name)+'</div>';
            h += '<div style="font-size:11px;color:var(--text-muted)">Egasi: '+Utils.esc(tm.owner_name)+' · '+((tm.members||[]).length)+' a\'zo</div></div>';
            h += '<div style="text-align:right;flex-shrink:0;margin-left:10px"><div style="font-size:11px;color:var(--accent);font-weight:700">'+(roles[tm.my_role]||tm.my_role)+'</div>';
            if (tm.my_percent > 0) h += '<div style="font-size:14px;font-weight:800">'+tm.my_percent+'%</div>';
            h += '</div></div>';
            if (tm.members && tm.members.length) {
                h += '<div style="border-top:1px solid var(--border);padding-top:8px;display:flex;flex-direction:column;gap:4px">';
                tm.members.forEach(function(mm) {
                    h += '<div style="display:flex;justify-content:space-between;font-size:12px">';
                    h += '<span>'+Utils.esc(mm.name)+' <span style="color:var(--text-muted)">('+(roles[mm.role]||mm.role)+')</span></span>';
                    h += '<span style="color:var(--text-muted)">'+(mm.profit_percent>0?mm.profit_percent+'%':'')+'</span></div>';
                });
                h += '</div>';
            }
            h += '</div>';
        });
        return h;
    },

    _membersTab: function(t) {
        var roles = {owner:'Egasi', admin:'Admin', worker:'Ishchi', viewer:'Ko\'ruvchi'};
        var statuses = {invited:'Taklif', active:'Faol', blocked:'Bloklangan'};
        var statusColors = {invited:'#f59e0b', active:'#10b981', blocked:'#ef4444'};
        var h = '';
        t.members.forEach(function(m) {
            h += '<div class="ce-card" style="padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:12px">';
            h += '<div style="width:40px;height:40px;border-radius:50%;background:var(--accent2,#6366f1);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0">'+Utils.esc((m.name||'?')[0].toUpperCase())+'</div>';
            h += '<div style="flex:1">';
            h += '<div style="font-size:14px;font-weight:600">'+Utils.esc(m.name)+'</div>';
            h += '<div style="font-size:11px;color:var(--text-muted)">'+Utils.esc(m.phone||m.username||'')+'</div>';
            h += '</div>';
            h += '<div style="text-align:right">';
            h += '<div style="font-size:11px;font-weight:600;color:'+(statusColors[m.status]||'#888')+'">'+(statuses[m.status]||m.status)+'</div>';
            h += '<div style="font-size:10px;color:var(--text-muted)">'+(roles[m.role]||m.role)+'</div>';
            if (m.profit_percent > 0) h += '<div style="font-size:10px;color:var(--accent)">'+m.profit_percent+'%</div>';
            h += '</div>';
            if (m.role !== 'owner') {
                h += '<button class="ce-btn btn-member-edit" data-uid="'+m.user_id+'" style="font-size:10px;padding:4px 8px;background:var(--accent2,#6366f1);color:#fff;border:none;border-radius:4px">✏</button>';
                h += '<button class="ce-btn btn-member-del" data-uid="'+m.user_id+'" style="font-size:10px;padding:4px 8px;background:var(--danger);color:#fff;border:none;border-radius:4px">✕</button>';
            }
            h += '</div>';
        });
        if (t.invitations && t.invitations.length) {
            h += '<h4 style="font-size:13px;margin:16px 0 8px;color:var(--text-muted)">Kutilmoqda</h4>';
            t.invitations.forEach(function(inv) {
                h += '<div class="ce-card" style="padding:10px;margin-bottom:6px;display:flex;align-items:center;gap:10px;opacity:.7">';
                h += '<span style="font-size:18px">⏳</span>';
                h += '<div style="flex:1;font-size:13px">'+Utils.esc(inv.name)+'</div>';
                h += '<span style="font-size:11px;color:#f59e0b">Taklif yuborilgan</span>';
                h += '</div>';
            });
        }
        // Ro'yxatdan o'tmaganlarga takliflar — "hali ro'yxatdan o'tmadi" (2026-09-23)
        if (t.pending && t.pending.length) {
            h += '<h4 style="font-size:13px;margin:16px 0 8px;color:var(--text-muted)">⏳ Ro‘yxatdan o‘tishi kutilmoqda</h4>';
            t.pending.forEach(function(p) {
                h += '<div class="ce-card" style="padding:10px;margin-bottom:6px;display:flex;align-items:center;gap:10px">';
                h += '<span style="font-size:18px">📩</span>';
                h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">'+Utils.esc(p.name)+'</div>';
                h += '<div style="font-size:11px;color:var(--text-muted)">'+Utils.esc(p.phone)+'</div>';
                h += '<div style="font-size:11px;color:#f59e0b">Sherigingiz hali ham ro‘yxatdan o‘tmadi — kutilmoqda</div></div>';
                h += '<button class="ce-btn btn-pending-del" data-id="'+p.id+'" style="font-size:10px;padding:4px 8px;background:var(--danger);color:#fff;border:none;border-radius:4px">✕</button>';
                h += '</div>';
            });
        }
        return h;
    },

    _profitTab: function(d) {
        var templates = d.profit_templates || [];
        var h = '<button class="ce-btn ce-btn-primary" id="btn-add-tmpl" style="font-size:12px;padding:6px 14px;margin-bottom:12px"><i class="fas fa-plus"></i> Yangi shablon</button>';
        if (!templates.length) {
            h += '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">Hali shablon yo\'q</div>';
        }
        templates.forEach(function(tmpl) {
            h += '<div class="ce-card" style="padding:12px;margin-bottom:8px">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
            h += '<div style="font-size:14px;font-weight:600">'+Utils.esc(tmpl.name)+(tmpl.is_default?' <span style="font-size:10px;color:var(--accent)">default</span>':'')+'</div>';
            h += '<button class="ce-btn btn-del-tmpl" data-id="'+tmpl.id+'" style="font-size:10px;padding:3px 8px;background:var(--danger);color:#fff;border:none;border-radius:4px">🗑</button>';
            h += '</div>';
            tmpl.lines.forEach(function(ln) {
                h += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid var(--border)">';
                h += '<span>'+Utils.esc(ln.role_label)+'</span><span style="font-weight:600">'+ln.percent+'%</span></div>';
            });
            h += '</div>';
        });
        return h;
    },

    _settingsTab: function(t) {
        var h = '<div class="ce-card" style="padding:16px">';
        h += '<div class="f" style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Jamoa nomi</label>';
        h += '<input type="text" id="team-name" class="ce-input" value="'+Utils.esc(t.name)+'" style="width:100%"></div>';
        h += '<div class="f" style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Tavsif</label>';
        h += '<textarea id="team-desc" class="ce-input" rows="3" style="width:100%">'+Utils.esc(t.description||'')+'</textarea></div>';
        h += '<button class="ce-btn ce-btn-primary" id="btn-team-save" style="font-size:12px;padding:8px 16px">Saqlash</button>';
        h += '</div>';
        // Avto-ulashish sozlamalari — faqat jamoa egasiga (share-modal bilan bir xil karta)
        if (t.is_owner) {
            h += '<div class="ce-card" style="padding:16px;margin-top:12px">';
            h += '<h4 style="font-size:13px;margin:0 0 10px">🔁 Yangi buyurtmalarni avto-ulashish</h4>';
            h += '<div id="team-autoshare-wrap"><div style="font-size:12px;color:var(--text-muted)">Yuklanmoqda...</div></div>';
            h += '</div>';
        }
        return h;
    },

    // Avto-ulashish blokini yuklash va bog'lash (OrderDetail helper'lari bilan baham)
    _loadAutoShare: function() {
        var wrap = document.getElementById('team-autoshare-wrap');
        if (!wrap) return;
        WS.send('team.autoshare_get', {}, function(msg) {
            wrap = document.getElementById('team-autoshare-wrap');
            if (!wrap) return;
            if (!msg.ok) { wrap.innerHTML = '<div style="font-size:12px;color:var(--danger)">'+Utils.esc(msg.error||'Xatolik')+'</div>'; return; }
            var teams = (msg.data && msg.data.teams) || [];
            if (!teams.length) { wrap.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Jamoa topilmadi</div>'; return; }
            var h = '';
            teams.forEach(function(t) { h += OrderDetail._autoShareCardHtml(t); });
            h += '<div style="font-size:11px;color:var(--text-muted);margin:4px 0 10px">Tugma yoqilsa — HAR BIR yangi buyurtmangiz jamoa a\'zolariga avtomatik ochiladi (eski buyurtmalarga tegilmaydi)</div>';
            h += '<button class="ce-btn ce-btn-primary" id="btn-autoshare-save" style="font-size:12px;padding:8px 16px">Saqlash</button>';
            wrap.innerHTML = h;
            OrderDetail._bindAutoShareCards(wrap);
            document.getElementById('btn-autoshare-save').onclick = function() {
                var cards = wrap.querySelectorAll('.autoshare-card');
                var left = cards.length, failed = null;
                if (!left) return;
                cards.forEach(function(card) {
                    WS.send('team.autoshare_set', OrderDetail._autoShareCollect(card), function(res) {
                        if (!res.ok) failed = res.error || 'Xatolik';
                        left--;
                        if (left === 0) {
                            if (failed) return Toast.error(failed);
                            Toast.success('Avto-ulashish saqlandi');
                        }
                    });
                });
            };
        });
    },

    bind: function() {
        var d = Team._data;

        // Create team
        var createBtn = document.getElementById('btn-create-team');
        if (createBtn) createBtn.onclick = function() { Team._showCreateModal(); };

        // Invite
        var invBtn = document.getElementById('btn-invite');
        if (invBtn) invBtn.onclick = function() { Team._showInviteModal(); };

        // Tabs
        document.querySelectorAll('.team-tab').forEach(function(btn) {
            btn.onclick = function() {
                Team._tab = btn.dataset.tab;
                Team.render();
            };
        });

        // Member actions
        document.querySelectorAll('.btn-member-edit').forEach(function(btn) {
            btn.onclick = function() { Team._showEditMember(parseInt(btn.dataset.uid)); };
        });
        document.querySelectorAll('.btn-member-del').forEach(function(btn) {
            btn.onclick = function() {
                Modal.confirm("A'zoni chiqarish", "Rostdan ham chiqarasizmi?", function() {
                    WS.send('team.remove_member', {user_id: parseInt(btn.dataset.uid)}, function(msg) {
                        if (!msg.ok) return Toast.error(msg.error);
                        Toast.success("A'zo chiqarildi");
                        Team.render();
                    });
                });
            };
        });

        // Kutilayotgan taklifni bekor qilish (2026-09-23)
        document.querySelectorAll('.btn-pending-del').forEach(function(btn) {
            btn.onclick = function() {
                Modal.confirm("Taklifni bekor qilish", "Rostdan ham bekor qilasizmi?", function() {
                    WS.send('team.pending_cancel', {pending_id: parseInt(btn.dataset.id)}, function(msg) {
                        if (!msg.ok) return Toast.error(msg.error);
                        Toast.success("Taklif bekor qilindi");
                        Team.render();
                    });
                });
            };
        });
        // Settings save
        var saveBtn = document.getElementById('btn-team-save');
        if (saveBtn) saveBtn.onclick = function() {
            var name = document.getElementById('team-name').value.trim();
            var desc = document.getElementById('team-desc').value.trim();
            if (!name) return Toast.error('Nom kiritilmagan');
            WS.send('team.update', {name: name, description: desc}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Toast.success('Saqlandi');
                Team.render();
            });
        };

        // Profit template
        var addTmplBtn = document.getElementById('btn-add-tmpl');
        if (addTmplBtn) addTmplBtn.onclick = function() { Team._showAddTemplate(); };

        // Avto-ulashish sozlamalari (Sozlamalar tabi, faqat owner)
        if (Team._tab === 'settings' && document.getElementById('team-autoshare-wrap')) {
            Team._loadAutoShare();
        }
    },

    _showCreateModal: function() {
        Modal.open("Jamoa yaratish",
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Jamoa nomi *</label><input type="text" name="name" class="ce-input" style="width:100%" placeholder="Masalan: BigOne jamoasi"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Tavsif</label><textarea name="description" class="ce-input" rows="2" style="width:100%"></textarea></div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-do-create">Yaratish</button>'});
        document.getElementById('btn-do-create').onclick = function() {
            var f = Modal.getFormData();
            if (!f.name || !f.name.trim()) return Toast.error('Nom kiritilmagan');
            WS.send('team.create', {name: f.name, description: f.description||''}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Jamoa yaratildi!');
                Team.render();
            });
        };
    },

    _showInviteModal: function() {
        Modal.open("Taklif qilish",
            '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.6">1️⃣ Sherigingiz avval <b>ro‘yxatdan o‘tsin</b> (ilova yoki bot orqali)<br>2️⃣ Telefonini kiriting<br>3️⃣ Taklif yuboring</div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Telefon yoki username *</label><input type="text" name="query" class="ce-input" style="width:100%" placeholder="+998..."></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Ism (ro‘yxatdan o‘tmagan bo‘lsa) </label><input type="text" name="name" class="ce-input" style="width:100%" placeholder="Sherik ismi"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Rol</label><select name="role" class="ce-input" style="width:100%"><option value="worker">Ishchi</option><option value="admin">Admin</option><option value="viewer">Ko\'ruvchi</option></select></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Default foiz</label><input type="number" name="percent" class="ce-input" style="width:100%" value="20" min="0" max="100"></div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-do-invite">Taklif yuborish</button>'});
        document.getElementById('btn-do-invite').onclick = function() {
            var f = Modal.getFormData();
            if (!f.query || !f.query.trim()) return Toast.error('Telefon/username kiritilmagan');
            WS.send('team.invite', {query: f.query, name: f.name||'', role: f.role||'worker', profit_percent: parseFloat(f.percent)||0}, function(msg) {
                if (msg.ok) {
                    Modal.close();
                    Toast.success('Taklif yuborildi!');
                    Team.render();
                    return;
                }
                // Ro'yxatdan o'tmagan — taklif havolasi oynasi
                if (msg.code === 'USER_NOT_REGISTERED' && msg.invite) {
                    Team._showInviteResult(msg.invite);
                    return;
                }
                Toast.error(msg.error);
            });
        };
    },

    // Ro'yxatdan o'tmagan odamga taklif havolasi (2026-09-23)
    // Odam QO'SHILMAYDI — faqat havola ulashiladi (SMS/Telegram/bot).
    _showInviteResult: function(inv) {
        var text = inv.text || '';
        var links = inv.links || {};
        var smsHref = 'sms:?body=' + encodeURIComponent(text);
        var tgHref = 'https://t.me/share/url?url=' + encodeURIComponent(links.play || '') + '&text=' + encodeURIComponent(text);
        Modal.open("Do‘stingizni taklif qiling",
            '<div style="text-align:center;padding:6px 0 12px"><div style="font-size:40px;margin-bottom:8px">📩</div>' +
            '<div style="font-size:14px;font-weight:700;margin-bottom:6px;color:#f59e0b">Kechirasiz, bu foydalanuvchi tizimdan ro‘yxatdan o‘tmagan</div>' +
            '<div style="font-size:12px;color:var(--text-muted);line-height:1.6">Ro‘yxatdan o‘tmaguncha jamoaga qo‘sha olmaysiz.<br>Pastdagi tugma bilan taklif havolasini yuboring —<br>ro‘yxatdan o‘tsa, avtomatik jamoangizga qo‘shiladi.</div></div>' +
            '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<a href="' + smsHref + '" class="ce-btn ce-btn-primary" style="text-align:center;text-decoration:none;font-size:13px;padding:10px">📩 SMS orqali yuborish</a>' +
            '<a href="' + tgHref + '" target="_blank" class="ce-btn ce-btn-primary" style="text-align:center;text-decoration:none;font-size:13px;padding:10px;background:#229ED9">✈️ Telegram orqali yuborish</a>' +
            '<a href="' + Utils.esc(links.bot || '') + '" target="_blank" class="ce-btn" style="text-align:center;text-decoration:none;font-size:13px;padding:10px">🤖 Botni ochish</a>' +
            '</div>',
            {footer:'<button class="ce-btn" id="btn-inv-close">Yopish</button>'});
        document.getElementById('btn-inv-close').onclick = function() {
            Modal.close();
            Team.render();
        };
    },

    _showEditMember: function(userId) {
        var d = Team._data;
        if (!d || !d.team) return;
        var m = d.team.members.find(function(x) { return x.user_id === userId; });
        if (!m) return;
        Modal.open("A'zo sozlamalari — "+Utils.esc(m.name),
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Rol</label><select name="role" class="ce-input" style="width:100%"><option value="admin"'+(m.role==='admin'?' selected':'')+'>Admin</option><option value="worker"'+(m.role==='worker'?' selected':'')+'>Ishchi</option><option value="viewer"'+(m.role==='viewer'?' selected':'')+'>Ko\'ruvchi</option></select></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Default foiz</label><input type="number" name="percent" class="ce-input" style="width:100%" value="'+(m.profit_percent||0)+'" min="0" max="100"></div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-do-edit-m">Saqlash</button>'});
        document.getElementById('btn-do-edit-m').onclick = function() {
            var f = Modal.getFormData();
            WS.send('team.update_member', {user_id: userId, role: f.role, profit_percent: parseFloat(f.percent)||0}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Saqlandi');
                Team.render();
            });
        };
    },

    _showAddTemplate: function() {
        var lines = [{role_label:'Usta',percent:35},{role_label:'Ishchi',percent:20},{role_label:'Ishchi',percent:20},{role_label:'Ishchi',percent:20}];
        Modal.open("Foyda shabloni",
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Shablon nomi</label><input type="text" name="tmpl_name" class="ce-input" value="Standart" style="width:100%"></div>' +
            '<div id="tmpl-lines"></div>' +
            '<button class="ce-btn ce-btn-secondary" id="btn-tmpl-add-line" style="font-size:11px;margin-top:6px">+ Qator</button>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-tmpl-save">Saqlash</button>'});
        function renderLines() {
            var h = '';
            lines.forEach(function(ln, i) {
                h += '<div style="display:flex;gap:6px;margin-bottom:6px"><input type="text" class="ce-input tl-label" data-i="'+i+'" value="'+Utils.esc(ln.role_label)+'" placeholder="Lavozim" style="flex:2;font-size:12px;padding:6px"><input type="number" class="ce-input tl-pct" data-i="'+i+'" value="'+ln.percent+'" style="width:60px;font-size:12px;padding:6px;text-align:center"><span style="font-size:11px;line-height:32px">%</span></div>';
            });
            document.getElementById('tmpl-lines').innerHTML = h;
        }
        renderLines();
        document.getElementById('btn-tmpl-add-line').onclick = function() { lines.push({role_label:'',percent:0}); renderLines(); };
        document.getElementById('btn-tmpl-save').onclick = function() {
            document.querySelectorAll('.tl-label').forEach(function(el) { lines[parseInt(el.dataset.i)].role_label = el.value; });
            document.querySelectorAll('.tl-pct').forEach(function(el) { lines[parseInt(el.dataset.i)].percent = parseFloat(el.value)||0; });
            var name = document.querySelector('[name="tmpl_name"]').value.trim() || 'Standart';
            WS.send('team.save_template', {name: name, lines: lines}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Shablon saqlandi');
                Team.render();
            });
        };
    },
};
