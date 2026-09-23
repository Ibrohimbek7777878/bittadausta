/* client_erp/js/pages/dashboard.js — Dashboard renderer */
var Dashboard = {
    render: function() {
        var app = document.getElementById('app');
        app.innerHTML = Skeleton.dashboard();
        WS.send('page.dashboard', {}, function(msg) {
            if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
            STATE.dashboard = msg.data;
            STATE.user = msg.data.user;
            app.innerHTML = Dashboard.template(msg.data);
            Dashboard._bindInvite();
        });
    },

    _bindInvite: function() {
        var acc = document.getElementById('btn-accept-invite');
        if (acc) acc.onclick = function() {
            WS.send('team.accept', {}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Toast.success('Jamoaga qo\'shildingiz!');
                Dashboard.render();
            });
        };
        var dec = document.getElementById('btn-decline-invite');
        if (dec) dec.onclick = function() {
            WS.send('team.decline', {}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Toast.success('Taklif rad etildi');
                Dashboard.render();
            });
        };
    },

    template: function(d) {
        var u = d.user, s = d.stats;
        var level = u.vip_level;
        var h = '';

        // User card
        h += '<div class="ce-card" style="padding:16px;margin-bottom:16px">';
        h += '<div style="display:flex;align-items:center;gap:12px">';
        h += '<div style="width:48px;height:48px;font-size:18px;background:'+(level?level.color:'var(--secondary)')+';color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600">';
        h += level ? Utils.esc(level.icon) : Utils.initials(u.full_name);
        h += '</div><div style="flex:1"><div style="font-weight:600;font-size:16px">'+Utils.esc(u.full_name)+'</div>';
        h += '<div style="font-size:12px;color:var(--text-muted)">'+(level?Utils.esc(level.name):'Foydalanuvchi')+' · '+u.xp+' XP · '+u.coins+' tanga · 🔥 '+u.streak_days+' kun</div>';
        h += '</div></div></div>';

        // Team invite banner
        if (d.team_invite) {
            h += '<div class="ce-card" style="padding:14px;margin-bottom:12px;border-left:4px solid #6366f1;background:rgba(99,102,241,.05)">';
            h += '<div style="font-size:14px;font-weight:600;margin-bottom:4px">👥 Jamoaga taklif!</div>';
            h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px"><b>'+Utils.esc(d.team_invite.owner_name)+'</b> sizni <b>'+Utils.esc(d.team_invite.team_name)+'</b> jamoasiga taklif qildi ('+d.team_invite.role+')</div>';
            h += '<div style="display:flex;gap:8px">';
            h += '<button class="ce-btn ce-btn-primary" id="btn-accept-invite" style="font-size:12px;padding:6px 16px">Qabul qilish</button>';
            h += '<button class="ce-btn ce-btn-secondary" id="btn-decline-invite" style="font-size:12px;padding:6px 16px">Rad etish</button>';
            h += '</div></div>';
        }

        // Quick actions
        h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">';
        h += '<a href="#/orders" class="ce-card" style="padding:14px;text-align:center;text-decoration:none;color:inherit"><div style="font-size:22px">📦</div><div style="font-size:12px;margin-top:4px">Buyurtmalar</div><div style="font-weight:700;font-size:18px;color:var(--accent)">'+s.active_orders+'</div></a>';
        h += '<a href="#/mebelcity" class="ce-card" style="padding:14px;text-align:center;text-decoration:none;color:inherit"><div style="font-size:22px">🏭</div><div style="font-size:12px;margin-top:4px">MebelCity</div>'+(s.mebelcity_count?'<div style="font-weight:700;font-size:18px;color:var(--accent)">'+s.mebelcity_count+'</div>':'')+'</a>';
        h += '<a href="#/clients" class="ce-card" style="padding:14px;text-align:center;text-decoration:none;color:inherit"><div style="font-size:22px">👥</div><div style="font-size:12px;margin-top:4px">Mijozlar</div><div style="font-weight:700;font-size:18px;color:var(--secondary)">'+s.customers_count+'</div></a>';
        h += '</div>';

        // Stats
        h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">';
        h += '<div class="ce-card" style="padding:12px"><div style="font-size:11px;color:var(--text-muted)">Kirim</div><div style="font-weight:700;color:var(--accent)">'+Utils.money(s.total_income)+'</div></div>';
        h += '<div class="ce-card" style="padding:12px"><div style="font-size:11px;color:var(--text-muted)">Foyda</div><div style="font-weight:700;color:'+(parseInt(s.profit)>=0?'var(--accent)':'var(--danger)')+'">'+Utils.money(s.profit)+'</div></div>';
        if (parseInt(s.total_debt) > 0) {
            h += '<div class="ce-card" style="padding:12px"><div style="font-size:11px;color:var(--text-muted)">Qarz</div><div style="font-weight:700;color:var(--danger)">'+Utils.money(s.total_debt)+'</div></div>';
        }
        h += '</div>';

        // Quests
        if (d.daily_quests.length) {
            h += '<h3 style="font-size:15px;margin:0 0 10px">📋 Kunlik topshiriqlar</h3>';
            d.daily_quests.forEach(function(q) {
                var pct = Math.floor(q.progress / q.action_count * 100);
                h += '<div class="ce-card" style="padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:10px;'+(q.is_completed?'opacity:.6':'')+'">';
                h += '<span style="font-size:20px">'+Utils.esc(q.icon)+'</span>';
                h += '<div style="flex:1"><div style="font-size:13px;font-weight:500">'+Utils.esc(q.title)+'</div>';
                h += '<div style="font-size:11px;color:var(--text-muted)">'+q.progress+'/'+q.action_count+(q.xp_reward?' · +'+q.xp_reward+' XP':'')+'</div>';
                h += Utils.progressBar(pct)+'</div>';
                h += (q.is_completed?'<span style="color:var(--accent)">✅</span>':'')+'</div>';
            });
        }

        // Active orders
        if (d.active_orders.length) {
            h += '<h3 style="font-size:15px;margin:16px 0 10px">📦 Faol buyurtmalar</h3>';
            d.active_orders.forEach(function(o) { h += Dashboard._orderCard(o); });
        }

        // Shared tasks
        if (d.shared_tasks.length) {
            h += '<h3 style="font-size:15px;margin:16px 0 10px">🤝 Vazifalarim</h3>';
            d.shared_tasks.forEach(function(t) {
                h += '<a href="#/orders/'+t.order.id+'" class="ce-card" style="padding:12px;margin-bottom:8px;text-decoration:none;color:inherit;display:block">';
                h += '<div style="font-size:13px;font-weight:500">'+Utils.esc(t.order.title)+'</div>';
                h += '<div style="font-size:11px;color:var(--text-muted)">'+Utils.roleLabel(t.role)+' · '+t.active_stages.map(function(s){return s.icon+' '+Utils.esc(s.title)}).join(', ')+'</div>';
                h += '</a>';
            });
        }

        // Announcements
        if (d.announcements.length) {
            h += '<h3 style="font-size:15px;margin:16px 0 10px">📢 E\'lonlar</h3>';
            d.announcements.forEach(function(a) {
                h += '<div class="ce-card" style="padding:12px;margin-bottom:8px">';
                h += '<div style="display:flex;justify-content:space-between;align-items:start"><div style="font-size:13px;font-weight:500">'+Utils.esc(a.title)+'</div>'+Utils.statusBadge(a.type)+'</div>';
                h += '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">'+Utils.esc(a.body).substring(0,120)+'</div>';
                if (a.discount_percent) h += '<div style="font-size:13px;font-weight:600;color:var(--accent);margin-top:4px">-'+a.discount_percent+'%</div>';
                h += '</div>';
            });
        }

        return h;
    },

    _orderCard: function(o) {
        return '<a href="#/orders/'+o.id+'" class="ce-card" style="padding:12px;margin-bottom:8px;text-decoration:none;color:inherit;display:block">' +
            '<div style="display:flex;justify-content:space-between;align-items:start"><div style="font-size:13px;font-weight:500">'+Utils.esc(o.title)+'</div>'+Utils.statusBadge(o.status)+'</div>' +
            (o.customer_name?'<div style="font-size:11px;color:var(--text-muted)">'+Utils.esc(o.customer_name)+'</div>':'') +
            '<div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;color:var(--accent)">'+Utils.money(o.total_income)+' so\'m</span><span style="font-size:11px;color:var(--text-muted)">'+o.overall_progress+'%</span></div>' +
            Utils.progressBar(o.overall_progress) + '</a>';
    },
};
