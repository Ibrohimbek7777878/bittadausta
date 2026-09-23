/* client_erp/js/redesign/rc-dashboard.js — Redesign Dashboard (real page.dashboard). */
window.RC_PAGES = window.RC_PAGES || {};
var RcDashboard = {
  QGRAD: ['linear-gradient(135deg,#DCF262,#B8D93E)', 'linear-gradient(135deg,#A6E6F2,#7FD0E0)', 'linear-gradient(135deg,#C9B4F7,#B197EE)'],
  QINK: ['#DCF262', '#A6E6F2', '#C9B4F7'],

  render: function () {
    var app = document.getElementById('app');
    app.innerHTML = Skeleton.list(4);
    WS.send('page.dashboard', {}, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      STATE.dashboard = msg.data;
      // ⚠️ 2026-08-15: ilgari `STATE.user = msg.data.user` deb USTIGA
      // yozilardi va sahifa yuklanishida HTML'dan kelgan bayroqlar
      // (`can_revert_finance` va boshqalar) YO'QOLARDI — natijada
      // «Kirim/Chiqim qaytarish» tugmalari Bosh sahifaga kirgandan keyin
      // g'oyib bo'lardi. Endi birlashtiriladi.
      STATE.user = Object.assign({}, window.__USER_DATA__ || {}, STATE.user || {}, msg.data.user || {});
      app.innerHTML = RcDashboard.template(msg.data);
      RcDashboard.bind();
      // Topbar coins pill
      var cv = document.getElementById('rc-coins-val'), cp = document.getElementById('rc-coins');
      if (cv && cp && window.RC_BILLING_LIVE) { cv.textContent = msg.data.user.coins; cp.style.display = 'inline-flex'; }
    });
  },

  bind: function () {
    // Tanishtiruv (rc-tour.js) — birinchi kirishda o'zi boshlanadi (2026-08-05)
    if (window.RcTour && RcTour.auto) { try { RcTour.auto('dashboard', 1600); } catch (e) {} }
    if (window.RcHint && RcHint.bind) { try { RcHint.bind(); } catch (e) {} }
    var a = document.getElementById('rc-accept-invite');
    if (a) a.onclick = function () { WS.send('team.accept', {}, function (m) { if (!m.ok) return Toast.error(m.error); Toast.success('Jamoaga qo\'shildingiz!'); RcDashboard.render(); }); };
    var d = document.getElementById('rc-decline-invite');
    if (d) d.onclick = function () { WS.send('team.decline', {}, function (m) { if (!m.ok) return Toast.error(m.error); Toast.success('Taklif rad etildi'); RcDashboard.render(); }); };

    // Bildirishnoma (2026-08-04): kartaga bosilsa — havolaga O'TADI,
    // ✕ bosilsa — faqat yopiladi. Ikkalasida ham «o'qildi» belgilanadi.
    // Bildirishnoma (2026-08-04): ✕ YO'Q — tasodifan yopib yuborilmasin.
    // Bosilsa: «o'qildi» + havolaga o'tadi. Havola `/orders/319#profit`
    // ko'rinishida bo'lsa — sahifa ochilgach «Foyda taqsimlash» oynasi
    // avtomatik ochiladi (foydalanuvchi qidirib yurmasin).
    document.querySelectorAll('.rc-notif').forEach(function (el) {
      el.onclick = function () {
        var nid = parseInt(el.dataset.nid);
        var link = el.dataset.link || '';
        var openProfit = link.indexOf('#profit') !== -1;
        // ── 2026-08-04: PULGA OID KARTA BOSILGANDA YO'QOLMAYDI ────────────
        // Sabab: karta amal bajarilgunicha turishi kerak (foydalanuvchi
        // so'rovi). Uni FAQAT server yopadi:
        //   • «ulush belgilandi» → pul yechilganda
        //   • «ulush kelmoqda» / «jo'natildi» → a'zo qabul qilgan/rad etganda
        // Summasi yo'q (oddiy ma'lumot) kartalar esa bosilganda o'qiladi.
        var hasAmount = !!el.dataset.amt && parseFloat(el.dataset.amt) > 0;
        if (!openProfit && !hasAmount) {
          WS.send('notification.read', { id: nid }, function () {});
        }
        if (!link) return;
        var path = link.split('#')[0];
        Router.go(path);
        if (openProfit) {
          // Buyurtma sahifasi WS'dan yuklangach ochamiz (bir necha urinish)
          var tries = 0;
          var t = setInterval(function () {
            tries++;
            var od = window.RcOrderDetail;
            if (od && od._data && od.openProfit) {
              clearInterval(t);
              try { od.setTab('moliya'); } catch (e) {}
              setTimeout(function () { od.openProfit(); }, 220);
            } else if (tries > 25) { clearInterval(t); }
          }, 200);
        }
      };
    });

    document.querySelectorAll('.rc-ann-card').forEach(function (card) {
      card.onclick = function () {
        var ai = parseInt(card.dataset.ai);
        var a = STATE.dashboard && STATE.dashboard.announcements && STATE.dashboard.announcements[ai];
        if (!a || !(window.RcSheet && RcSheet.open)) return;
        RcSheet.open('📢 ' + Utils.esc(a.title), '<div style="white-space:pre-wrap;line-height:1.6">' + Utils.esc(a.body || '') + '</div>', {});
      };
    });

    document.querySelectorAll('.rc-quest-row').forEach(function (row) {
      row.onclick = function () {
        var action = row.dataset.action;
        if (action === 'view_products' && window.RcCatalog) RcCatalog.open();
        else if (action === 'share' && window.RcReferral) RcReferral.share();
      };
    });

    var pendingCard = document.querySelector('.rc-stat[data-action="pending-detail"]');
    if (pendingCard) pendingCard.onclick = RcDashboard.showPendingDetail;
  },

  // 💰 Kutilmoqda kartasi — qaysi zakaz(lar)dan qancha kutilayotgani (2026-08-12).
  showPendingDetail: function () {
    var esc = Utils.esc, money = Utils.money;
    WS.send('dashboard.pending.detail', {}, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      var d = msg.data;
      if (!d.orders.length) return;
      var h = '<div style="display:flex;flex-direction:column;gap:8px">';
      d.orders.forEach(function (o) {
        h += '<div class="rc-list-row" data-oid="' + o.order_id + '" style="cursor:pointer;background:var(--sfc2);border-radius:14px;padding:12px;display:flex;justify-content:space-between;align-items:center;gap:10px">';
        h += '<div style="min-width:0">';
        h += '<div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(o.title || ('#' + o.order_id)) + '</div>';
        h += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + esc(o.customer || '') + (o.owner_name ? ' · ' + esc(o.owner_name) + ' hisobida' : '') + (o.delivered_at ? ' · ' + o.delivered_at.slice(0, 10) : '') + '</div>';
        h += '</div>';
        h += '<div style="font-weight:800;font-size:13px;color:var(--lav-text);white-space:nowrap">' + money(o.amount) + '</div>';
        h += '</div>';
      });
      h += '</div>';
      h += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--brd);display:flex;justify-content:space-between;font-weight:800;font-size:14px"><span>Jami</span><span style="color:var(--lav-text)">' + money(d.total) + '</span></div>';
      h += '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Bu pul hali sizga o\'tkazilmagan — egasi ("hisobida" ko\'rsatilgan) pul yechganda avtomatik yo\'qoladi.</div>';
      RcSheet.open('👥 Sheriklikdagi foyda', h, {});
      document.querySelectorAll('.rc-list-row[data-oid]').forEach(function (row) {
        row.onclick = function () { RcSheet.close(); Router.go('/orders/' + row.dataset.oid); };
      });
    });
  },

  template: function (d) {
    var u = d.user, s = d.stats, lv = u.vip_level;
    var esc = Utils.esc, money = Utils.money, ini = Utils.initials;
    var h = '<div data-screen>';

    // Profil kartasi
    h += '<div class="rc-card rc-card-lg" style="display:flex;align-items:center;gap:12px">';
    h += '<div class="rc-avatar" style="width:48px;height:48px;font-size:16px">' + (lv ? esc(lv.icon) : ini(u.full_name)) + '</div>';
    h += '<div style="flex:1;min-width:0"><div style="font-weight:800;font-size:15px">' + T('Salom') + ', ' + esc(u.full_name) + ' 👋</div>';
    h += '<div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">';
    h += '<span class="rc-chip-acc rc-chip">👑 ' + (lv ? esc(lv.name) : 'Start') + '</span>';
    h += '<span class="rc-chip">⭐ ' + u.xp + ' XP</span>';
    h += '<span class="rc-chip">🔥 ' + u.streak_days + ' kun</span>';
    h += '</div></div></div>';

    // Jamoa taklifi
    if (d.team_invite) {
      h += '<div class="rc-card" style="border-color:color-mix(in srgb,var(--lav) 45%,var(--brd))">';
      h += '<div style="font-weight:800;font-size:14px">👥 Jamoaga taklif!</div>';
      h += '<div style="font-size:12px;color:var(--mut);margin:6px 0 12px"><b>' + esc(d.team_invite.owner_name) + '</b> sizni <b>' + esc(d.team_invite.team_name) + '</b> jamoasiga taklif qildi</div>';
      h += '<div style="display:flex;gap:8px"><button class="rc-btn rc-btn-sm" id="rc-accept-invite">Qabul</button><button class="rc-btn-ghost rc-btn-sm" id="rc-decline-invite">Rad etish</button></div></div>';
    }

    // Quick cards
    var quick = [
      // 2026-08-26: «Buyurtmalar» nomi Analitikadagi bir xil nomli
      // ko'rsatkich bilan CHALKASHARDI (bu — faqat FAOL/tugallanmagan
      // zakazlar, Analitika esa shu oy OCHILGAN barcha zakazni sanaydi —
      // ikkalasi turli sabab bilan farqli raqam beradi, ikkalasi ham to'g'ri).
      { go: '/orders', fa: 'fa-clipboard-list', count: s.active_orders, label: 'Jarayondagi buyurtmalar' },
      // 2026-08-28: foydalanuvchi talabi — bu ikkala karta endi BUTUN TARIX
      // emas, SHU OY bo'yicha (backend serialize_dashboard'da filtrlandi).
      // Label'ga "shu oy" qo'shildi — aks holda kichikroq raqam chalkashtiradi.
      { go: '/mebelcity', fa: 'fa-industry', count: s.mebelcity_count || 0, label: 'MebelCity (shu oy)' },
      { go: '/clients', fa: 'fa-users', count: s.customers_count, label: 'Yangi mijoz (shu oy)' },
    ];
    h += '<div class="rc-grid" style="grid-template-columns:repeat(3,1fr);gap:8px">';
    quick.forEach(function (q, i) {
      h += '<div onclick="Router.go(\'' + q.go + '\')" class="rc-quick-card" style="background:' + RcDashboard.QGRAD[i] + ';color:var(--acc-ink);border-radius:18px;padding:12px;cursor:pointer;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:10px;position:relative;overflow:hidden">';
      h += '<i class="fas ' + q.fa + '" style="position:absolute;right:-10px;bottom:-8px;font-size:52px;color:rgba(0,0,0,.07);transform:rotate(-12deg)"></i>';
      h += '<div style="display:flex;align-items:center;justify-content:space-between"><div style="width:30px;height:30px;border-radius:50%;background:#1B1A20;display:flex;align-items:center;justify-content:center;color:' + RcDashboard.QINK[i] + ';font-size:11px"><i class="fas ' + q.fa + '"></i></div>';
      h += '<div style="width:22px;height:22px;border-radius:50%;border:1.5px solid rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center"><i class="fas fa-arrow-right" style="font-size:9px;transform:rotate(-45deg)"></i></div></div>';
      h += '<div><div style="font-size:24px;font-weight:800;line-height:1">' + q.count + '</div><div style="font-size:10px;font-weight:700;opacity:.72;margin-top:2px">' + q.label + '</div></div></div>';
    });
    h += '</div>';

    // Stats
    var pos = parseInt(s.profit) >= 0;
    var stats = [
      { label: 'Kirim', val: money(s.total_income), clr: 'var(--acc-text)' },
      { label: 'Foyda', val: money(s.profit), clr: pos ? 'var(--acc-text)' : 'var(--danger)' },
    ];
    if (parseInt(s.total_debt) > 0) stats.push({ label: 'Qarz', val: money(s.total_debt), clr: 'var(--pch-text)' });
    // 👥 Sheriklikdagi foyda (H8) — sherikli zakazdan hali yechilmagan ulush.
    // ATAYLAB Kirim/Foydadan alohida: pul hali boshqa odamning kassasida.
    if (parseFloat(s.pending_profit || 0) > 0) {
      stats.push({ label: '👥 Sheriklikda', val: money(s.pending_profit), clr: 'var(--lav-text)', action: 'pending-detail' });
    }
    h += '<div class="rc-grid rc-grid-auto">';
    stats.forEach(function (st, i) {
      var act = st.action ? ' data-action="' + st.action + '" style="animation-delay:' + (i * .05) + 's;cursor:pointer"' : ' style="animation-delay:' + (i * .05) + 's"';
      h += '<div class="rc-stat"' + act + '><div class="rc-stat-label">' + st.label + '</div><div class="rc-stat-val" style="color:' + st.clr + '">' + st.val + '</div></div>';
    });
    h += '</div>';

    // Quests
    if (d.daily_quests && d.daily_quests.length) {
      h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:8px">';
      h += '<div style="display:flex;align-items:center;justify-content:space-between"><div style="font-weight:800;font-size:14px">🎯 Kunlik topshiriqlar</div></div>';
      d.daily_quests.forEach(function (q) {
        var pct = q.action_count ? Math.floor(q.progress / q.action_count * 100) : 0;
        h += '<div class="rc-quest-row" data-action="' + esc(q.action_type || '') + '" style="display:flex;align-items:center;gap:10px;background:var(--sfc2);border-radius:14px;padding:10px' + (q.is_completed ? ';opacity:.6' : ';cursor:pointer') + '">';
        h += '<div style="width:34px;height:34px;border-radius:10px;background:var(--sfc);display:flex;align-items:center;justify-content:center;font-size:15px;flex:none">' + esc(q.icon) + '</div>';
        h += '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700">' + esc(q.title) + '</div>';
        h += '<div style="display:flex;align-items:center;gap:6px;margin-top:4px"><div class="rc-progress"><div class="rc-progress-fill" style="width:' + pct + '%"></div></div>';
        h += '<span style="font-size:10px;color:var(--mut);font-weight:700">' + q.progress + '/' + q.action_count + '</span></div></div>';
        h += (q.xp_reward ? '<span class="rc-chip-acc rc-chip">+' + q.xp_reward + ' XP</span>' : (q.is_completed ? '<span>✅</span>' : '')) + '</div>';
      });
      h += '</div>';
    }


    // ── Ilova ichidagi bildirishnomalar (2026-08-25 ko'chirildi) ──
    // Ilgari profil kartasidan DARHOL keyin turardi — foydalanuvchi ilovaga
    // kirganda birinchi ko'rgan narsasi shu bo'lardi. Endi: quick cards,
    // stats va kunlik topshiriqlar shablonidan KEYIN tursin. Har biri
    // bosilsa «o'qildi» bo'lib yo'qoladi.
    var nots = d.notifications || [];
    if (nots.length) {
      nots.forEach(function (n) {
        // Sarlavha «Matn · Zakaz nomi» — OXIRGI ' · ' bo'yicha ajratamiz.
        // (Ilgari birinchisi olinardi: «Artom · ...8003 ga ulush belgilandi ·
        //  oshxona mebeli» → sarlavha «Artom» bo'lib chalkash chiqardi.)
        var _t = String(n.title || ''), _ord = '';
        var _dot = _t.lastIndexOf(' · ');
        if (_dot > 0) { _ord = _t.slice(_dot + 3); _t = _t.slice(0, _dot); }
        var _amt = (n.amount !== null && n.amount !== undefined) ? parseFloat(n.amount) : null;

        h += '<div class="rc-notif" data-nid="' + n.id + '" data-link="' + esc(n.link || '') + '" '
          + 'data-amt="' + (_amt || 0) + '" '
          + 'style="display:flex;gap:9px;align-items:center;padding:10px 11px;'
          + 'background:var(--sfc);border:1px solid var(--brd2);border-left:3px solid var(--acc);'
          + 'border-radius:13px;cursor:pointer">';
        // Ikonka — yumshoq fon, to'q laym emas
        h += '<div style="width:32px;height:32px;border-radius:10px;'
          + 'background:var(--sfc2);display:flex;align-items:center;justify-content:center;'
          + 'font-size:15px;flex:none">' + esc(n.icon || '🔔') + '</div>';
        h += '<div style="flex:1;min-width:0">';
        h += '<div style="font-size:11.5px;font-weight:700;color:var(--txt);'
          + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(_t) + '</div>';
        if (_amt !== null && _amt > 0) {
          h += '<div style="font-size:14px;font-weight:800;color:var(--acc-text);'
            + 'letter-spacing:-.2px;margin-top:1px">' + Utils.money(_amt) + ' so\'m</div>';
        }
        if (_ord) {
          h += '<div style="font-size:10px;color:var(--mut);margin-top:1px;'
            + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📦 ' + esc(_ord) + '</div>';
        }
        h += '<div style="font-size:10px;color:var(--mut);opacity:.7;margin-top:2px">'
          + Utils.timeAgo(n.created_at) + '</div>';
        h += '</div>';
        // ✕ YO'Q (2026-08-04) — pul o'tkazilgunicha yopilmaydi.
        // Butun karta bosiladi, o'ng tomonda faqat ishora.
        h += '<i class="fas fa-chevron-right" style="color:var(--acc-text);'
          + 'font-size:13px;flex:none;opacity:.75"></i>';
        h += '</div>';
      });
    }


    // Faol buyurtmalar
    if (d.active_orders && d.active_orders.length) {
      h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:0 2px"><div style="font-weight:800;font-size:14px">Jarayondagi buyurtmalar</div><button class="rc-btn-ghost rc-btn-sm" style="border:none;background:none;color:var(--acc-text);font-size:11px" onclick="Router.go(\'/orders\')">Hammasi <i class="fas fa-arrow-right" style="font-size:9px"></i></button></div>';
      d.active_orders.forEach(function (o) { h += RcDashboard.orderCard(o); });
    }

    // 🤝 Vazifalarim (menga biriktirilgan/ulashilgan buyurtmalar)
    if (d.shared_tasks && d.shared_tasks.length) {
      h += '<div style="font-weight:800;font-size:15px;padding:0 2px">🤝 Vazifalarim</div>';
      d.shared_tasks.forEach(function (t) {
        h += '<a href="#/orders/' + t.order.id + '" class="rc-card" style="display:block;text-decoration:none;color:inherit">';
        h += '<div style="font-size:14px;font-weight:700">' + esc(t.order.title) + '</div>';
        h += '<div style="font-size:11px;color:var(--mut);margin-top:3px">' + Utils.roleLabel(t.role) + ' · ' + (t.active_stages || []).map(function (s) { return s.icon + ' ' + esc(s.title); }).join(', ') + '</div>';
        h += '</a>';
      });
    }

    // E'lonlar
    if (d.announcements && d.announcements.length) {
      d.announcements.forEach(function (a, ai) {
        var body = a.body || '';
        var truncated = body.length > 90;
        h += '<div class="rc-ann-card" data-ai="' + ai + '" style="background:var(--pch);color:var(--acc-ink);border-radius:20px;padding:16px;box-shadow:var(--shadow);display:flex;align-items:center;gap:12px' + (truncated ? ';cursor:pointer' : '') + '">';
        h += '<div style="font-size:22px">📢</div><div style="flex:1;min-width:0"><div style="font-weight:800;font-size:13px">' + esc(a.title) + '</div>';
        h += '<div style="font-size:12px;opacity:.75;margin-top:2px">' + esc(body.substring(0, 90)) + (truncated ? '…' : '') + '</div>';
        if (truncated) h += '<div style="font-size:11px;font-weight:800;margin-top:6px;text-decoration:underline">Batafsil</div>';
        h += '</div>';
        if (a.discount_percent) h += '<div style="font-weight:800;flex:none">-' + a.discount_percent + '%</div>';
        h += '</div>';
      });
    }

    h += '</div>';
    return h;
  },

  orderCard: function (o) {
    var esc = Utils.esc, money = Utils.money;
    var st = RcStatus.badge(o.status);
    return '<div onclick="Router.go(\'/orders/' + o.id + '\')" class="rc-card" style="cursor:pointer;display:flex;flex-direction:column;gap:8px;padding:12px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div style="font-weight:700;font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</div>' + st + '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px;color:var(--mut)">' + esc(o.customer_name || '—') + '</span><span style="font-size:13px;font-weight:800">' + money(o.total_income) + ' so\'m</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px"><div class="rc-progress"><div class="rc-progress-fill" style="width:' + o.overall_progress + '%"></div></div><span style="font-size:10px;font-weight:700;color:var(--mut)">' + o.overall_progress + '%</span></div>' +
      '</div>';
  },
};

/* Status badge helper (redesign ranglar) */
var RcStatus = {
  MAP: {
    new: ['Yangi', 'var(--cyan)'], waiting: ['Kutilmoqda', 'var(--pch)'], in_progress: ['Jarayonda', 'var(--acc)'],
    at_mebelcity: ['MebelCity', 'var(--lav)'], ready: ['Tayyor', 'var(--acc)'], completed: ['Bajarilgan', 'var(--acc)'],
    delivered: ['Topshirildi', '#C3C9D4'], cancelled: ['Bekor', 'var(--danger)'],
  },
  badge: function (status) {
    var m = RcStatus.MAP[status] || [status, 'var(--sfc2)'];
    // 2026-09-23: yorliq T() orqali — tanlangan tilda (kalit topilmasa o'zbekcha)
    return '<span class="rc-badge" style="background:' + m[1] + ';color:var(--acc-ink)">' + T(m[0]) + '</span>';
  },
};
window.RcStatus = RcStatus;
window.RcDashboard = RcDashboard;
RC_PAGES['/'] = function () { RcDashboard.render(); };
