/* client_erp/js/redesign/rc-settings.js — Redesign Sozlamalar (real page.settings + template.list).
   Ko'rinish qatlami yangi (rc-). WS action va logika settings.js dan AYNAN olindi:
     page.settings, template.list, settings.password, settings.delete_account,
     template.delete, template.save. */
window.RC_PAGES = window.RC_PAGES || {};

var RcSettings = {
  _templates: [],
  _ICONS: ['📋','📐','🪚','🔨','🎨','✂️','📦','🚚','🔧','✅','🏭','💰','📸','🧹','🪑','🛋️','🚪','🪟','💡','🧱','🔩','📏','🖌️','🪵','🧰','⚡'],
  _COLORS: ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b'],

  render: function () {
    var app = document.getElementById('app');
    app.innerHTML = Skeleton.list(4);
    WS.send('page.settings', {}, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      // Birlashtirish — HTML'dan kelgan bayroqlar saqlanadi (yuqoridagi izoh)
      STATE.user = Object.assign({}, window.__USER_DATA__ || {}, STATE.user || {}, msg.data || {});
      WS.send('template.list', {}, function (tmsg) {
        RcSettings._templates = (tmsg.ok && tmsg.data) ? tmsg.data.templates : [];
        app.innerHTML = RcSettings.template(msg.data);
        RcSettings.bind();
        // Topbar coins pill (dashboard bilan bir xil)
        var cv = document.getElementById('rc-coins-val'), cp = document.getElementById('rc-coins');
        if (cv && cp && window.RC_BILLING_LIVE) { cv.textContent = msg.data.coins; cp.style.display = 'inline-flex'; }
      });
    });
  },

  template: function (u) {
    var esc = Utils.esc, money = Utils.money, ini = Utils.initials;
    var lv = u.vip_level;
    var h = '<div data-screen>';

    // ── Profil kartasi ──
    h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:14px">';
    h += '<div style="display:flex;align-items:center;gap:14px">';
    h += '<div class="rc-avatar" style="width:56px;height:56px;font-size:19px">' + (lv ? esc(lv.icon) : ini(u.full_name)) + '</div>';
    h += '<div style="flex:1;min-width:0">';
    h += '<div style="font-weight:800;font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(u.full_name) + '</div>';
    h += '<div style="font-size:12px;color:var(--mut)">@' + esc(u.username) + '</div>';
    h += '</div></div>';
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
    if (lv) h += '<span class="rc-chip rc-chip-acc">👑 ' + esc(lv.name) + '</span>';
    h += '<span class="rc-chip">⭐ ' + u.xp + ' XP</span>';
    h += '<span class="rc-chip">🪙 ' + u.coins + ' tanga</span>';
    h += '<span class="rc-chip">🔥 ' + u.streak_days + ' kun</span>';
    h += '</div>';
    if (u.phone) h += '<div style="font-size:12px;color:var(--mut)"><i class="fas fa-phone" style="margin-right:6px;width:14px"></i>' + esc(u.phone) + '</div>';
    if (u.organization) h += '<div style="font-size:12px;color:var(--mut)"><i class="fas fa-building" style="margin-right:6px;width:14px"></i>' + esc(u.organization) + '</div>';
    h += '</div>';

    // ── TIL (i18n, 2026-08-07) ─────────────────────────────────────────
    // Til almashtirilganda sahifa qayta chiziladi (to'liq reload emas —
    // ochiq oynalar/holat yo'qolmaydi). Tanlov localStorage + serverda.
    h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:10px">';
    h += '<div style="font-weight:800;font-size:15px">🌐 ' + T('Til') + '</div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    (window.I18n ? I18n.LANGS : []).forEach(function (L) {
      var on = window.I18n && I18n.lang() === L.code;
      h += '<button class="rc-lang-btn" data-lang="' + L.code + '" style="flex:1;min-width:96px;'
        + 'border:1px solid ' + (on ? 'var(--acc)' : 'var(--brd2)') + ';border-radius:12px;'
        + 'padding:10px 8px;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:700;'
        + 'background:' + (on ? 'var(--acc)' : 'var(--sfc2)') + ';'
        + 'color:' + (on ? 'var(--acc-ink)' : 'var(--txt)') + '">'
        + L.flag + ' ' + L.name + '</button>';
    });
    h += '</div>';
    h += '<div style="font-size:11px;color:var(--mut)">' + T('Tilni tanlang')
      + ' — ' + T('raqam va sana ko‘rinishi ham o‘zgaradi') + '.</div>';
    h += '</div>';

    // ── Etap shablonlari ──
    h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:12px">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between">';
    h += '<div style="font-weight:800;font-size:15px">📋 Etap shablonlari</div>';
    h += '<button class="rc-btn-ghost rc-btn-sm" id="rc-tmpl-add"><i class="fas fa-plus"></i> Yangi</button>';
    h += '</div>';
    h += '<div id="rc-tmpl-list" style="display:flex;flex-direction:column;gap:8px">';
    if (!RcSettings._templates.length) {
      h += '<div style="font-size:13px;color:var(--mut);text-align:center;padding:14px 0">Shablonlar yo\'q</div>';
    } else {
      RcSettings._templates.forEach(function (t) { h += RcSettings.tmplRow(t); });
    }
    h += '</div></div>';

    // ── Chiqim kategoriyalari ──
    h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:12px">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between">';
    h += '<div style="font-weight:800;font-size:15px">🏷 Chiqim kategoriyalari</div>';
    h += '<button class="rc-btn-ghost rc-btn-sm" id="rc-cat-add"><i class="fas fa-plus"></i> Yangi</button>';
    h += '</div>';
    h += '<div id="rc-cat-list" style="display:flex;flex-wrap:wrap;gap:8px">' + RcSettings._catChips(u.expense_categories || []) + '</div>';
    h += '<div style="font-size:11px;color:var(--mut)">Chiqim qo\'shishda shu kategoriyalar karta bo\'lib chiqadi. O\'zingiznikini qo\'shishingiz mumkin.</div>';
    h += '</div>';

    // ── Parolni o'zgartirish ──
    h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:10px">';
    h += '<div style="font-weight:800;font-size:15px">🔒 Parolni o\'zgartirish</div>';
    h += '<input type="password" id="rc-pwd-current" class="rc-input" placeholder="Hozirgi parol" autocomplete="current-password">';
    h += '<input type="password" id="rc-pwd-new" class="rc-input" placeholder="Yangi parol" autocomplete="new-password">';
    h += '<input type="password" id="rc-pwd-confirm" class="rc-input" placeholder="Yangi parolni takrorlang" autocomplete="new-password">';
    h += '<button class="rc-btn" id="rc-pwd-btn" style="width:100%">O\'zgartirish</button>';
    h += '</div>';

    // ── 🎁 Do'stlaringizni taklif qiling ──
    h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:10px">';
    h += '<div style="font-weight:800;font-size:15px">🎁 Do\'stlaringizni taklif qiling</div>';
    h += '<div style="font-size:12px;color:var(--mut)">Havolangiz orqali qo\'shilgan har bir do\'stingiz uchun +30 XP va +20 tanga olasiz.</div>';
    if (u.referral_count) h += '<div style="font-size:12px;color:var(--acc-text);font-weight:700">✅ ' + u.referral_count + ' ta do\'st qo\'shildi</div>';
    h += '<button class="rc-btn" id="rc-referral-share" style="width:100%"><i class="fas fa-share-alt"></i> Ulashish</button>';
    h += '</div>';

    // ── 🆘 Admin bilan bog'lanish ──
    h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:10px">';
    h += '<div style="font-weight:800;font-size:15px">🆘 Admin bilan bog\'lanish</div>';
    h += '<div style="font-size:12px;color:var(--mut)">Savol yoki muammo bo\'lsa, adminlarga xabar yuboring.</div>';
    h += '<textarea id="rc-contact-msg" class="rc-input" rows="3" placeholder="Xabaringiz (ixtiyoriy)..." style="resize:vertical"></textarea>';
    h += '<button class="rc-btn" id="rc-contact-btn" style="width:100%">Yuborish</button>';
    h += '</div>';

    // ── 🔴 Xavfli zona ──
    h += '<div class="rc-card" style="border-color:color-mix(in srgb,var(--danger) 45%,var(--brd))">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">';
    h += '<div style="min-width:0"><div style="font-size:14px;font-weight:800;color:var(--danger)"><i class="fas fa-triangle-exclamation"></i> Xavfli zona</div>';
    h += '<div style="font-size:11px;color:var(--mut);margin-top:2px">Akkauntni butunlay o\'chirish</div></div>';
    h += '<button class="rc-btn-danger rc-btn-sm" id="rc-da-open" style="flex:none">O\'chirish</button>';
    h += '</div>';
    // Inline ikki qavat tasdiq paneli (RcSheet o'rniga — sahifada ochiladi)
    h += '<div id="rc-da-panel" style="display:none;flex-direction:column;gap:10px;margin-top:14px">';
    h += '<div style="font-size:12px;color:var(--mut);line-height:1.5">Barcha buyurtma, moliya, mijoz va fayllaringiz <b>butunlay</b> o\'chadi. Bu amalni <b>qaytarib bo\'lmaydi</b>.</div>';
    h += '<div><label style="font-size:11px;color:var(--mut)">Parolingiz</label><input type="password" id="rc-da-pwd" class="rc-input" style="margin-top:4px" autocomplete="current-password"></div>';
    h += '<div><label style="font-size:11px;color:var(--mut)">Tasdiqlash uchun <b>OCHIRISH</b> deb yozing</label><input type="text" id="rc-da-confirm" class="rc-input" style="margin-top:4px" placeholder="OCHIRISH" autocomplete="off"></div>';
    h += '<div style="display:flex;gap:8px"><button class="rc-btn-danger" id="rc-da-submit" style="flex:1">Butunlay o\'chirish</button><button class="rc-btn-ghost" id="rc-da-cancel">Bekor</button></div>';
    h += '</div>';
    h += '</div>';

    // ── Tanishtiruvni qayta ko'rish (2026-08-05) ──
    // Foydalanuvchi turni o'tkazib yuborgan yoki unutgan bo'lsa —
    // shu yerdan qaytadan ishga tushiradi.
    h += '<div class="rc-card" style="padding:14px;margin-top:12px">';
    h += '<div style="font-weight:800;font-size:14px;margin-bottom:4px">🎓 Tanishtiruv</div>';
    h += '<div style="font-size:12px;color:var(--mut);line-height:1.55;margin-bottom:10px">'
      + 'Ilova qanday ishlashini qadam-baqadam ko\'rsatadi. Yangi funksiyalar '
      + 'qo\'shilganda ham shu yerdan qayta ko\'rishingiz mumkin.</div>';
    h += '<button class="rc-btn-ghost rc-btn-sm" id="rc-tour-again" style="width:100%">'
      + '<i class="fas fa-play"></i> Qaytadan ko\'rish</button>';
    h += '</div>';

    // ── Admin bo'limi — faqat adminlarga (2026-09-23, additive) ──
    h += RcSettings._adminCard(u);

    h += '</div>';
    return h;
  },

  tmplRow: function (t) {
    var esc = Utils.esc, money = Utils.money;
    var first = (t.items && t.items[0]) || { icon: '📋', color: '#6366f1' };
    var clr = first.color || '#6366f1';
    var totalCost = 0, totalChecklist = 0, hasMC = false;
    (t.items || []).forEach(function (it) {
      totalCost += it.estimated_cost || 0;
      totalChecklist += (it.checklist ? it.checklist.length : 0);
      if (it.is_mebelcity) hasMC = true;
    });
    var meta = [(t.items ? t.items.length : 0) + ' etap'];
    if (totalCost) meta.push('💰 ' + money(totalCost));
    if (totalChecklist) meta.push('✅ ' + totalChecklist);
    if (hasMC) meta.push('🏭 MC');

    var editable = !t.is_default;
    var h = '<div ' + (editable ? 'class="rc-tmpl-row" data-id="' + t.id + '" ' : '') + 'style="display:flex;align-items:center;gap:12px;background:var(--sfc2);border-radius:16px;padding:12px' + (editable ? ';cursor:pointer' : '') + '">';
    h += '<div style="width:38px;height:38px;border-radius:12px;background:' + clr + '22;display:flex;align-items:center;justify-content:center;font-size:17px;flex:none">' + esc(first.icon || '📋') + '</div>';
    h += '<div style="flex:1;min-width:0">';
    h += '<div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.name);
    if (t.is_default) h += ' <span class="rc-badge" style="background:var(--acc);color:var(--acc-ink)">Tizim</span>';
    h += '</div>';
    h += '<div style="font-size:11px;color:var(--mut);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + meta.join(' · ') + '</div>';
    h += '</div>';
    if (editable) {
      h += '<button class="rc-tmpl-del" data-id="' + t.id + '" style="flex:none;width:32px;height:32px;border-radius:10px;border:none;background:var(--sfc);color:var(--danger)"><i class="fas fa-trash" style="font-size:12px"></i></button>';
    } else {
      h += '<i class="fas fa-chevron-right" style="color:var(--mut);font-size:11px"></i>';
    }
    h += '</div>';
    return h;
  },

  bind: function () {
    // Admin bo'limi (2026-09-23, additive — admin bo'lmasa jim chiqadi)
    try { RcSettings._adminBind(); } catch (e) {}
    // Til tugmalari (i18n)
    Array.prototype.forEach.call(document.querySelectorAll('.rc-lang-btn'), function (b) {
      b.onclick = function () {
        if (window.I18n) I18n.set(b.dataset.lang);
      };
    });

    // ── Tanishtiruvni qaytadan ko'rish (2026-08-05) ──
    var tourBtn = document.getElementById('rc-tour-again');
    if (tourBtn) tourBtn.onclick = function () {
      if (!(window.RcTour && RcTour.reset)) return;
      RcTour.reset();                       // barcha sahifalar «ko'rilmagan»
      if (window.RcHint && RcHint.reset) RcHint.reset();
      Toast.success('Tanishtiruv qayta yoqildi — Moliya sahifasiga o\'ting');
      setTimeout(function () { if (window.Router) Router.go('/finance'); }, 700);
    };

    // ── Parol ──
    var pb = document.getElementById('rc-pwd-btn');
    if (pb) pb.onclick = function () {
      var current = document.getElementById('rc-pwd-current').value;
      var newPwd = document.getElementById('rc-pwd-new').value;
      var conf = document.getElementById('rc-pwd-confirm').value;
      if (!current) return Toast.error('Hozirgi parolni kiriting');
      if (newPwd.length < 4) return Toast.error('Yangi parol kamida 4 ta belgi');
      if (newPwd !== conf) return Toast.error('Parollar mos kelmadi');
      WS.send('settings.password', { current: current, new: newPwd }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        Toast.success('Parol o\'zgartirildi');
        document.getElementById('rc-pwd-current').value = '';
        document.getElementById('rc-pwd-new').value = '';
        document.getElementById('rc-pwd-confirm').value = '';
      });
    };

    // ── Do'stlaringizni taklif qiling ──
    var refBtn = document.getElementById('rc-referral-share');
    if (refBtn) refBtn.onclick = function () { RcReferral.share(); };

    // ── Admin bilan bog'lanish ──
    var cb = document.getElementById('rc-contact-btn');
    if (cb) cb.onclick = function () {
      var msgEl = document.getElementById('rc-contact-msg');
      var message = msgEl ? msgEl.value.trim() : '';
      cb.disabled = true;
      WS.send('settings.contact_admin', { message: message }, function (msg) {
        cb.disabled = false;
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        Toast.success('Xabar yuborildi, admin tez orada bog\'lanadi');
        if (msgEl) msgEl.value = '';
      });
    };

    // ── Shablon: qo'shish / tahrirlash ──
    var addBtn = document.getElementById('rc-tmpl-add');
    if (addBtn) addBtn.onclick = function () { RcSettings._openTmplEditor(null); };

    var catAdd = document.getElementById('rc-cat-add');
    if (catAdd) catAdd.onclick = function () { RcSettings._catAdd(); };

    document.querySelectorAll('.rc-tmpl-row').forEach(function (row) {
      row.onclick = function () {
        var id = parseInt(row.dataset.id);
        var tmpl = RcSettings._templates.find(function (t) { return t.id === id; });
        if (tmpl) RcSettings._openTmplEditor(tmpl);
      };
    });

    // ── Shablon: o'chirish ──
    document.querySelectorAll('.rc-tmpl-del').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        if (!confirm('Shablonni o\'chirasizmi?')) return;
        WS.send('template.delete', { id: parseInt(b.dataset.id) }, function (msg) {
          if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
          Toast.success('O\'chirildi');
          RcSettings.render();
        });
      };
    });

    // ── Xavfli zona: inline ikki qavat tasdiq ──
    var open = document.getElementById('rc-da-open');
    var panel = document.getElementById('rc-da-panel');
    var cancel = document.getElementById('rc-da-cancel');
    if (open && panel) open.onclick = function () {
      open.style.display = 'none';
      panel.style.display = 'flex';
      var p = document.getElementById('rc-da-pwd'); if (p) p.focus();
    };
    if (cancel && panel) cancel.onclick = function () {
      panel.style.display = 'none';
      if (open) open.style.display = 'inline-flex';
      var p = document.getElementById('rc-da-pwd'), c = document.getElementById('rc-da-confirm');
      if (p) p.value = ''; if (c) c.value = '';
    };
    var submit = document.getElementById('rc-da-submit');
    if (submit) submit.onclick = function () {
      var pwd = (document.getElementById('rc-da-pwd') || {}).value || '';
      var conf = (document.getElementById('rc-da-confirm') || {}).value || '';
      if (!pwd) return Toast.error('Parolni kiriting');
      if (conf.trim().toUpperCase() !== 'OCHIRISH') return Toast.error('Tasdiqlash uchun OCHIRISH deb yozing');
      submit.disabled = true;
      submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      WS.send('settings.delete_account', { password: pwd }, function (msg) {
        if (!msg.ok) {
          submit.disabled = false;
          submit.textContent = 'Butunlay o\'chirish';
          return Toast.error(msg.error || 'Xatolik');
        }
        Toast.success('Akkount o\'chirildi');
        window.location.href = '/mini/logout/';
      });
    };
  },

  // ── Shablon muharriri (RcSheet bo'lsa — ochiladi; bo'lmasa degrade) ──
  _openTmplEditor: function (tmpl) {
    if (!window.RcSheet) return Toast.info('Tez orada');

    var icons = RcSettings._ICONS, colors = RcSettings._COLORS;
    var esc = Utils.esc, money = Utils.money;

    function newItem() { return { title: '', icon: '📋', color: '#6366f1', note: '', estimated_cost: 0, is_mebelcity: false, checklist: [] }; }
    var items = tmpl ? tmpl.items.map(function (it) {
      return { title: it.title, icon: it.icon, color: it.color, note: it.note || '', estimated_cost: it.estimated_cost || 0, is_mebelcity: it.is_mebelcity || false, checklist: it.checklist || [] };
    }) : [newItem()];
    var openIdx = items.length === 1 ? 0 : -1;

    function renderItems() {
      var h = '';
      items.forEach(function (item, i) {
        h += '<div style="border:1px solid var(--brd);border-radius:14px;margin-bottom:8px;overflow:hidden">';
        h += '<div class="rc-te-head" data-i="' + i + '" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--sfc2);cursor:pointer">';
        h += '<span style="font-size:18px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:' + (item.color || '#6366f1') + '22;flex:none">' + esc(item.icon) + '</span>';
        h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (item.title ? esc(item.title) : '<span style="color:var(--mut)">Yangi etap...</span>') + '</div>';
        var meta = [];
        if (item.estimated_cost) meta.push(money(item.estimated_cost) + ' so\'m');
        if (item.checklist.length) meta.push(item.checklist.length + ' band');
        if (item.is_mebelcity) meta.push('🏭 MC');
        if (meta.length) h += '<div style="font-size:10px;color:var(--mut)">' + meta.join(' · ') + '</div>';
        h += '</div>';
        h += '<div style="display:flex;gap:2px;flex:none">';
        if (i > 0) h += '<button class="rc-te-move" data-i="' + i + '" data-dir="-1" style="background:none;border:none;cursor:pointer;font-size:12px;padding:4px;color:var(--mut)">▲</button>';
        if (i < items.length - 1) h += '<button class="rc-te-move" data-i="' + i + '" data-dir="1" style="background:none;border:none;cursor:pointer;font-size:12px;padding:4px;color:var(--mut)">▼</button>';
        h += '<button class="rc-te-del" data-i="' + i + '" style="background:none;border:none;cursor:pointer;font-size:12px;padding:4px;color:var(--danger);opacity:' + (items.length <= 1 ? '.3' : '1') + '"' + (items.length <= 1 ? ' disabled' : '') + '>✕</button>';
        h += '</div></div>';
        // Ochilgan forma
        h += '<div id="rc-te-body-' + i + '" style="display:none;padding:10px 12px;border-top:1px solid var(--brd)">';
        h += '<label style="font-size:11px;color:var(--mut)">Nom *</label><input type="text" class="rc-input rc-te-title" data-i="' + i + '" value="' + esc(item.title) + '" placeholder="Etap nomi" style="margin:4px 0 10px">';
        h += '<label style="font-size:11px;color:var(--mut)">Emoji</label><div style="display:flex;flex-wrap:wrap;gap:3px;margin:4px 0 10px">';
        icons.forEach(function (ic) {
          h += '<span class="rc-te-ic" data-i="' + i + '" data-icon="' + ic + '" style="font-size:18px;cursor:pointer;padding:3px;border-radius:6px;' + (item.icon === ic ? 'background:var(--acc)' : '') + '">' + ic + '</span>';
        });
        h += '</div>';
        h += '<label style="font-size:11px;color:var(--mut)">Rang</label><div style="display:flex;flex-wrap:wrap;gap:5px;margin:4px 0 10px">';
        colors.forEach(function (c) {
          h += '<span class="rc-te-cl" data-i="' + i + '" data-color="' + c + '" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:' + c + ';cursor:pointer;border:' + (item.color === c ? '3px solid var(--txt)' : '2px solid transparent') + '"></span>';
        });
        h += '</div>';
        h += '<label style="font-size:11px;color:var(--mut)">Taxminiy xarajat</label><input type="number" class="rc-input rc-te-cost" data-i="' + i + '" value="' + (item.estimated_cost || '') + '" placeholder="0" style="margin:4px 0 10px">';
        h += '<label style="font-size:11px;color:var(--mut)">Izoh</label><input type="text" class="rc-input rc-te-note" data-i="' + i + '" value="' + esc(item.note || '') + '" placeholder="Ixtiyoriy" style="margin:4px 0 10px">';
        h += '<label style="font-size:11px;color:var(--mut)">Checklist (har biri yangi qator)</label><textarea class="rc-input rc-te-checklist" data-i="' + i + '" rows="3" placeholder="1-band\n2-band" style="margin:4px 0 10px">' + esc((item.checklist || []).join('\n')) + '</textarea>';
        h += '<label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" class="rc-te-mc" data-i="' + i + '"' + (item.is_mebelcity ? ' checked' : '') + '> 🏭 MebelCity etapi</label>';
        h += '</div></div>';
      });
      return h;
    }

    function syncItems() {
      document.querySelectorAll('.rc-te-title').forEach(function (el) { var i = parseInt(el.dataset.i); if (items[i]) items[i].title = el.value; });
      document.querySelectorAll('.rc-te-cost').forEach(function (el) { var i = parseInt(el.dataset.i); if (items[i]) items[i].estimated_cost = parseInt(el.value) || 0; });
      document.querySelectorAll('.rc-te-note').forEach(function (el) { var i = parseInt(el.dataset.i); if (items[i]) items[i].note = el.value; });
      document.querySelectorAll('.rc-te-checklist').forEach(function (el) { var i = parseInt(el.dataset.i); if (items[i]) items[i].checklist = el.value.split('\n').filter(function (l) { return l.trim(); }); });
      document.querySelectorAll('.rc-te-mc').forEach(function (el) { var i = parseInt(el.dataset.i); if (items[i]) items[i].is_mebelcity = el.checked; });
    }

    function rebind() {
      var container = document.getElementById('rc-tmpl-items');
      if (container) container.innerHTML = renderItems();
      if (openIdx >= 0) { var body = document.getElementById('rc-te-body-' + openIdx); if (body) body.style.display = 'block'; }
      document.querySelectorAll('.rc-te-head').forEach(function (hdr) {
        hdr.onclick = function (e) {
          if (e.target.closest('.rc-te-move') || e.target.closest('.rc-te-del')) return;
          syncItems();
          var i = parseInt(hdr.dataset.i);
          openIdx = openIdx === i ? -1 : i;
          rebind();
        };
      });
      document.querySelectorAll('.rc-te-ic').forEach(function (b) {
        b.onclick = function (e) { e.stopPropagation(); syncItems(); items[parseInt(b.dataset.i)].icon = b.dataset.icon; openIdx = parseInt(b.dataset.i); rebind(); };
      });
      document.querySelectorAll('.rc-te-cl').forEach(function (b) {
        b.onclick = function (e) { e.stopPropagation(); syncItems(); items[parseInt(b.dataset.i)].color = b.dataset.color; openIdx = parseInt(b.dataset.i); rebind(); };
      });
      document.querySelectorAll('.rc-te-del').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          if (items.length <= 1) return;
          syncItems();
          var i = parseInt(b.dataset.i);
          items.splice(i, 1);
          if (openIdx === i) openIdx = -1; else if (openIdx > i) openIdx--;
          rebind();
        };
      });
      document.querySelectorAll('.rc-te-move').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          syncItems();
          var i = parseInt(b.dataset.i), dir = parseInt(b.dataset.dir), ni = i + dir;
          if (ni < 0 || ni >= items.length) return;
          var tmp = items[i]; items[i] = items[ni]; items[ni] = tmp;
          if (openIdx === i) openIdx = ni; else if (openIdx === ni) openIdx = i;
          rebind();
        };
      });
    }

    var body = '';
    body += '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--mut)">Shablon nomi</label>';
    body += '<input type="text" id="rc-tmpl-name" class="rc-input" style="margin-top:4px;font-weight:700" value="' + esc(tmpl ? tmpl.name : '') + '" placeholder="Masalan: Oshxona mebeli"></div>';
    body += '<label style="font-size:12px;color:var(--mut);display:block;margin-bottom:6px">Etaplar</label>';
    body += '<div id="rc-tmpl-items">' + renderItems() + '</div>';
    body += '<button class="rc-btn-ghost" id="rc-tmpl-add-item" style="width:100%;border-style:dashed;margin-top:2px"><i class="fas fa-plus"></i> Etap qo\'shish</button>';
    body += '<button class="rc-btn" id="rc-tmpl-save" style="width:100%;margin-top:14px">Saqlash</button>';

    RcSheet.open(tmpl ? 'Shablonni tahrirlash' : 'Yangi shablon', body, {});

    setTimeout(function () {
      rebind();
      var addItem = document.getElementById('rc-tmpl-add-item');
      if (addItem) addItem.onclick = function () { syncItems(); items.push(newItem()); openIdx = items.length - 1; rebind(); };
      var save = document.getElementById('rc-tmpl-save');
      if (save) save.onclick = function () {
        syncItems();
        var name = (document.getElementById('rc-tmpl-name').value || '').trim();
        if (!name) return Toast.error('Shablon nomini kiriting');
        var valid = items.filter(function (it) { return it.title.trim(); });
        if (!valid.length) return Toast.error('Kamida 1 ta etap kerak');
        WS.send('template.save', {
          id: tmpl ? tmpl.id : null,
          name: name,
          items: valid.map(function (it) {
            return { title: it.title.trim(), icon: it.icon, color: it.color, note: it.note || '', estimated_cost: it.estimated_cost || 0, is_mebelcity: it.is_mebelcity || false, checklist: it.checklist || [] };
          }),
        }, function (msg) {
          if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
          if (window.RcSheet && RcSheet.close) RcSheet.close();
          Toast.success('Shablon saqlandi');
          RcSettings.render();
        });
      };
    }, 50);
  },

  // ── Chiqim kategoriyalari (built-in ko'rsatiladi, custom o'chiriladi) ──
  _catChips: function (cats) {
    var esc = Utils.esc;
    if (!cats || !cats.length) return '<div style="font-size:12px;color:var(--mut)">Kategoriya yo\'q</div>';
    return cats.map(function (c) {
      var del = c.custom ? '<span onclick="event.stopPropagation();RcSettings._catDelete(\'' + esc(c.key) + '\')" style="cursor:pointer;font-weight:900;margin-left:3px;opacity:.75" title="O\'chirish">×</span>' : '';
      return '<span style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:var(--pill);background:' + (c.color || '#C3C9D4') + ';color:var(--acc-ink);font-size:12px;font-weight:700">' + (c.icon || '📦') + ' ' + esc(c.name) + del + '</span>';
    }).join('');
  },
  _refreshCats: function (cats) {
    if (STATE.user) STATE.user.expense_categories = cats;
    var el = document.getElementById('rc-cat-list');
    if (el) el.innerHTML = RcSettings._catChips(cats);
  },
  _catDelete: function (key) {
    (window.RcSheet ? RcSheet : Modal).confirm('O\'chirish', 'Bu kategoriya o\'chirilsinmi? (eski yozuvlar saqlanadi)', function () {
      WS.send('settings.expense_cat_delete', { key: key }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSettings._refreshCats(msg.data.categories); Toast.success('O\'chirildi');
      });
    });
  },
  _catAdd: function () {
    if (!(window.RcSheet && RcSheet.open)) { Toast.info('Tez orada'); return; }
    var icons = RcSettings._ICONS;
    var colors = ['#DCF262', '#A6E6F2', '#C9B4F7', '#F5A48B', '#C3C9D4', '#F7C948', '#9AE6B4', '#FBB6CE'];
    RcSettings._newIcon = icons[6]; RcSettings._newColor = colors[0];
    var iconHtml = icons.map(function (ic, i) {
      return '<button type="button" class="rc-cat-ic" data-ic="' + ic + '" style="width:36px;height:36px;border-radius:10px;border:1.5px solid ' + (i === 6 ? 'var(--acc)' : 'var(--brd)') + ';background:var(--sfc2);font-size:17px;cursor:pointer;flex:none">' + ic + '</button>';
    }).join('');
    var colHtml = colors.map(function (cl, i) {
      return '<button type="button" class="rc-cat-cl" data-cl="' + cl + '" style="width:30px;height:30px;border-radius:50%;border:2px solid ' + (i === 0 ? 'var(--txt)' : 'var(--brd)') + ';background:' + cl + ';cursor:pointer;flex:none;transform:' + (i === 0 ? 'scale(1.15)' : 'none') + '"></button>';
    }).join('');
    var body = '<div style="display:flex;flex-direction:column;gap:14px;padding-top:2px">' +
      '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">Nom *</div><input id="rc-cat-name" class="rc-input" placeholder="Masalan: Ijara, Ish haqi, Kommunal"></div>' +
      '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">Ikonка</div><div style="display:flex;flex-wrap:wrap;gap:6px">' + iconHtml + '</div></div>' +
      '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">Rang</div><div style="display:flex;flex-wrap:wrap;gap:8px">' + colHtml + '</div></div>' +
      '</div>';
    RcSheet.open('🏷 Yangi chiqim kategoriyasi', body, { footer: '<button class="rc-btn rc-btn-sm" id="rc-cat-save">Qo\'shish</button>' });
    document.querySelectorAll('.rc-cat-ic').forEach(function (b) {
      b.onclick = function () {
        RcSettings._newIcon = b.dataset.ic;
        document.querySelectorAll('.rc-cat-ic').forEach(function (x) { x.style.borderColor = 'var(--brd)'; });
        b.style.borderColor = 'var(--acc)';
      };
    });
    document.querySelectorAll('.rc-cat-cl').forEach(function (b) {
      b.onclick = function () {
        RcSettings._newColor = b.dataset.cl;
        document.querySelectorAll('.rc-cat-cl').forEach(function (x) { x.style.transform = 'none'; x.style.borderColor = 'var(--brd)'; });
        b.style.transform = 'scale(1.15)'; b.style.borderColor = 'var(--txt)';
      };
    });
    var sb = document.getElementById('rc-cat-save');
    if (sb) sb.onclick = function () {
      var name = (document.getElementById('rc-cat-name').value || '').trim();
      if (!name) return Toast.error('Nom kiriting');
      sb.disabled = true;
      WS.send('settings.expense_cat_add', { name: name, icon: RcSettings._newIcon, color: RcSettings._newColor }, function (msg) {
        if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); sb.disabled = false; return; }
        RcSheet.close(); Toast.success('Qo\'shildi'); RcSettings._refreshCats(msg.data.categories);
      });
    };
  },

  // ── Admin bo'limi (2026-09-23, additive) ─────────────────────────
  // Faqat is_app_admin userlarga ko'rinadi. Havolalarni ilova ichidan
  // o'zgartirish + admin tayinlash (max 3) + tarif boshqaruvi.
  _adminCard: function (u) {
    var esc = Utils.esc;
    if (!u || !u.is_app_admin) return '';
    var h = '<div class="rc-card" id="rc-admin-card" style="border-color:color-mix(in srgb,var(--acc) 45%,var(--brd))">';
    h += '<div style="font-weight:800;font-size:15px;margin-bottom:10px">🛡 Admin</div>';
    h += '<div style="font-size:12px;color:var(--mut);margin-bottom:6px">Taklif havolalari (dinamik)</div>';
    h += '<div style="margin-bottom:8px"><label style="font-size:11px;color:var(--mut)">Play Market</label><input type="text" id="rc-adm-play" class="rc-input" style="margin-top:4px;font-size:12px" placeholder="https://..."></div>';
    h += '<div style="margin-bottom:8px"><label style="font-size:11px;color:var(--mut)">Bot</label><input type="text" id="rc-adm-bot" class="rc-input" style="margin-top:4px;font-size:12px" placeholder="https://t.me/..."></div>';
    h += '<button class="rc-btn rc-btn-sm" id="rc-adm-save" style="width:100%;margin-bottom:14px">Saqlash</button>';
    h += '<div style="font-size:12px;color:var(--mut);margin-bottom:6px">Adminlar (<span id="rc-adm-count">…</span>/3)</div>';
    h += '<div id="rc-adm-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"></div>';
    h += '<div style="display:flex;gap:6px"><input type="text" id="rc-adm-new" class="rc-input" style="flex:1;font-size:12px" placeholder="+998..."><button class="rc-btn rc-btn-sm" id="rc-adm-add" style="flex:none">+ Admin</button></div>';
    h += '<div style="font-size:12px;color:var(--mut);margin:14px 0 6px">💳 Tariflar (narx/limit)</div>';
    h += '<div id="rc-adm-plans" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"><div style="font-size:12px;color:var(--mut)">Yuklanmoqda...</div></div>';
    h += '<button class="rc-btn-ghost rc-btn-sm" id="rc-plan-new" style="width:100%">+ Yangi tarif</button>';
    h += '</div>';
    return h;
  },

  _adminBind: function () {
    if (!document.getElementById('rc-admin-card')) return;
    var esc = Utils.esc;
    WS.send('admin.settings_get', {}, function (msg) {
      if (msg.ok && msg.data) {
        document.getElementById('rc-adm-play').value = msg.data.invite_play_url || '';
        document.getElementById('rc-adm-bot').value = msg.data.invite_bot_url || '';
      }
    });
    function loadAdmins() {
      WS.send('admin.admins_list', {}, function (msg) {
        if (!msg.ok) return;
        var d = msg.data || {};
        document.getElementById('rc-adm-count').textContent = d.count || 0;
        var h = '';
        (d.admins || []).forEach(function (a) {
          h += '<div style="display:flex;align-items:center;gap:8px;background:var(--sfc2);border-radius:12px;padding:8px 10px">';
          h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">' + esc(a.name) + (a.chief ? ' 👑' : '') + '</div>';
          h += '<div style="font-size:11px;color:var(--mut)">' + esc(a.phone) + '</div></div>';
          if (!a.chief) h += '<button class="rc-btn-ghost rc-btn-sm btn-rc-adm-del" data-id="' + a.id + '" style="color:var(--danger)">✕</button>';
          h += '</div>';
        });
        document.getElementById('rc-adm-list').innerHTML = h || '<div style="font-size:12px;color:var(--mut)">Hali admin yo‘q</div>';
        Array.prototype.forEach.call(document.querySelectorAll('.btn-rc-adm-del'), function (b) {
          b.onclick = function () {
            RcSheet.confirm('Adminlikni olish', 'Rostdan ham olib tashlaysizmi?', function () {
              WS.send('admin.admin_remove', { user_id: parseInt(b.dataset.id) }, function (m2) {
                if (!m2.ok) return Toast.error(m2.error);
                Toast.success('Olib tashlandi'); loadAdmins();
              });
            });
          };
        });
      });
    }
    loadAdmins();
    document.getElementById('rc-adm-save').onclick = function () {
      WS.send('admin.settings_set', {
        invite_play_url: document.getElementById('rc-adm-play').value.trim(),
        invite_bot_url: document.getElementById('rc-adm-bot').value.trim()
      }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error);
        Toast.success('Saqlandi');
      });
    };
    document.getElementById('rc-adm-add').onclick = function () {
      var q = document.getElementById('rc-adm-new').value.trim();
      if (!q) return Toast.error('Telefon/username kiritilmagan');
      WS.send('admin.admin_add', { query: q }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error);
        document.getElementById('rc-adm-new').value = '';
        Toast.success('Admin qo‘shildi'); loadAdmins();
      });
    };
    RcSettings._plansBind();
  },

  // ── Tarif jadvali + forma (server: admin.plans_list / admin.plans_save)
  _plansBind: function () {
    var wrap = document.getElementById('rc-adm-plans');
    if (!wrap) return;
    var esc = Utils.esc;
    function money(v) { try { return Number(v || 0).toLocaleString('uz-UZ'); } catch (e) { return v; } }
    function loadPlans() {
      WS.send('admin.plans_list', {}, function (msg) {
        if (!msg.ok) { wrap.innerHTML = '<div style="font-size:12px;color:var(--danger)">' + esc(msg.error || 'Xatolik') + '</div>'; return; }
        var plans = ((msg.data || {}).plans) || [];
        if (!plans.length) { wrap.innerHTML = '<div style="font-size:12px;color:var(--mut)">Tarif yo‘q</div>'; return; }
        var h = '';
        plans.forEach(function (p) {
          h += '<div style="display:flex;align-items:center;gap:8px;background:var(--sfc2);border-radius:12px;padding:8px 10px' + (p.is_active ? '' : ';opacity:.55') + '">';
          h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">' + esc(p.name) + '</div>';
          h += '<div style="font-size:11px;color:var(--mut)">' + money(p.price_uzs) + ' so‘m/oy' + (p.is_free ? ' · bepul' : '') + (p.is_active ? '' : ' · o‘chiq') + '</div></div>';
          h += '<button class="rc-btn-ghost rc-btn-sm btn-rc-plan-edit" data-id="' + p.id + '">✏️</button></div>';
        });
        wrap.innerHTML = h;
        Array.prototype.forEach.call(document.querySelectorAll('.btn-rc-plan-edit'), function (b) {
          b.onclick = function () {
            var found = null;
            plans.forEach(function (p) { if (String(p.id) === String(b.dataset.id)) found = p; });
            if (found) RcSettings._planEditSheet(found, loadPlans);
          };
        });
      });
    }
    loadPlans();
    var nb = document.getElementById('rc-plan-new');
    if (nb) nb.onclick = function () { RcSettings._planEditSheet(null, loadPlans); };
  },

  _planEditSheet: function (p, cb) {
    if (!window.RcSheet || !RcSheet.open) { Toast.info('Tez orada'); return; }
    p = p || {};
    var esc = Utils.esc;
    var lim = p.limits || {};
    function numRow(key, label) {
      var v = (lim[key] === undefined || lim[key] === null) ? '' : lim[key];
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div style="flex:1;font-size:12px;color:var(--mut)">' + label + '</div>' +
        '<input type="number" class="rc-input rc-plan-lim" data-k="' + key + '" value="' + v + '" placeholder="∞" style="width:90px;padding:6px;text-align:center;font-size:12px"></div>';
    }
    var body =
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Nom *</div><input type="text" id="rc-pl-name" class="rc-input" value="' + esc(p.name || '') + '"></div>' +
      '<div style="display:flex;gap:8px">' +
      '<div style="flex:1"><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Narx (so‘m/oy)</div><input type="number" id="rc-pl-price" class="rc-input" value="' + (p.price_uzs === undefined ? '' : p.price_uzs) + '"></div>' +
      '<div style="flex:1"><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Muddat (kun)</div><input type="number" id="rc-pl-period" class="rc-input" value="' + (p.period_days === undefined ? '30' : p.period_days) + '"></div></div>' +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Coin grant</div><input type="number" id="rc-pl-coin" class="rc-input" value="' + (p.coin_grant === undefined ? '' : p.coin_grant) + '"></div>' +
      '<div style="font-size:12px;color:var(--mut);font-weight:600">Limitlar (bo‘sh = cheksiz)</div>' +
      numRow('orders_month', 'Oyiga buyurtmalar') +
      numRow('active_orders', 'Faol buyurtmalar') +
      numRow('customers', 'Mijozlar') +
      numRow('team_members', 'Jamoa a’zolari') +
      numRow('ai_autonomous_daily', 'AI amal/kun') +
      '<div><div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Feature keys (vergul bilan)</div><input type="text" id="rc-pl-feats" class="rc-input" style="font-size:12px" value="' + esc((p.feature_keys || []).join(', ')) + '" placeholder="bo‘sh = hammasi ochiq"></div>' +
      '<div style="display:flex;gap:14px;font-size:13px">' +
      '<label><input type="checkbox" id="rc-pl-ai" ' + (p.ai_included ? 'checked' : '') + '> AI bor</label>' +
      '<label><input type="checkbox" id="rc-pl-active" ' + (p.is_active === false ? '' : 'checked') + '> Faol</label></div>' +
      '</div>';
    RcSheet.open(p.id ? 'Tarif: ' + esc(p.name || '') : 'Yangi tarif', body,
      { footer: '<button class="rc-btn-ghost rc-btn-sm" onclick="RcSheet.close()">Bekor</button><button class="rc-btn rc-btn-sm" id="rc-plan-save">Saqlash</button>' });
    document.getElementById('rc-plan-save').onclick = function () {
      var name = document.getElementById('rc-pl-name').value.trim();
      if (!name) return Toast.error('Nom kiritilmagan');
      var limits = {};
      Array.prototype.forEach.call(document.querySelectorAll('.rc-plan-lim'), function (el) {
        var v = el.value.trim();
        if (v !== '') limits[el.dataset.k] = parseInt(v, 10) || 0;
      });
      var feats = document.getElementById('rc-pl-feats').value.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      var payload = {
        name: name,
        price_uzs: parseInt(document.getElementById('rc-pl-price').value, 10) || 0,
        period_days: parseInt(document.getElementById('rc-pl-period').value, 10) || 30,
        coin_grant: parseInt(document.getElementById('rc-pl-coin').value, 10) || 0,
        feature_keys: feats,
        limits: limits,
        ai_included: document.getElementById('rc-pl-ai').checked,
        is_active: document.getElementById('rc-pl-active').checked
      };
      if (p.id) payload.id = p.id;
      WS.send('admin.plans_save', payload, function (msg) {
        if (!msg.ok) return Toast.error(msg.error);
        RcSheet.close(); Toast.success('Tarif saqlandi');
        if (cb) cb();
      });
    };
  },
};

window.RcSettings = RcSettings;
RC_PAGES['/settings'] = function () { RcSettings.render(); };
