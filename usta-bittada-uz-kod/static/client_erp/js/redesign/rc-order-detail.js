/* client_erp/js/redesign/rc-order-detail.js — Redesign Buyurtma detali (real page.order).
   Ma'lumot manbai: WS 'page.order' {id} → serialize_order_full.
   TAB struktura: Umumiy / Moliya / Etap / Fayl / Jamoa.
   Interaktiv amallar (Kirim/Chiqim/Shartnoma/Ulashish/status/toggle) hozircha
   RcSheet mavjud bo'lmasa Toast.info('Tez orada') bilan degrade qilinadi. */
window.RC_PAGES = window.RC_PAGES || {};

var RcOrderDetail = {
  _id: null,
  _data: null,
  _tab: 'umumiy',

  AVA: ['var(--acc)', 'var(--cyan)', 'var(--lav)', 'var(--pch)'],
  FGRAD: ['linear-gradient(135deg,#DCF262,#B8D93E)', 'linear-gradient(135deg,#A6E6F2,#7FD0E0)', 'linear-gradient(135deg,#C9B4F7,#B197EE)', 'linear-gradient(135deg,#F5A48B,#EE8A6D)'],

  render: function (id) {
    RcOrderDetail._id = parseInt(id);
    RcOrderDetail._tab = 'umumiy';
    var app = document.getElementById('app');
    app.innerHTML = Skeleton.list(4);
    WS.send('page.order', { id: RcOrderDetail._id }, function (msg) {
      if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); Router.go('/orders'); return; }
      RcOrderDetail._data = msg.data;
      STATE.currentOrder = msg.data;
      RcOrderDetail._paint();
      // ── FOIZ MAJBURIY (2026-08-15, TZ-Zakaz-Ochishda-Foiz…) ──────────────
      // Yangi buyurtma ochilganda `rc-orders.js` bayroq qo'yadi — bu yerda
      // «Foyda taqsimlash» o'zi ochiladi va to'ldirilmaguncha yopilmaydi.
      try {
        if (sessionStorage.getItem('rc_force_profit') === String(RcOrderDetail._id)) {
          setTimeout(function () { RcOrderDetail._forceProfit(); }, 120);
        }
      } catch (e) {}
      // Fon-AI tahriri tugallanmagan bo'lsa (sahifadan chiqib qaytilgan) — davom ettirish
      if (window.Gallery && Gallery.aiResume) { try { Gallery.aiResume(msg.data.id); } catch (e) {} }
    });
  },

  // Yangi buyurtmada foizni MAJBURIY so'rash. Yolg'iz ishlaydigan ustaga
  // to'siq bo'lmasligi uchun «Men — 100%» tayyor turadi: bir bosish yetadi.
  _forceProfit: function () {
    var d = RcOrderDetail._data || {};
    if (d.profit_shares && d.profit_shares.length) {   // allaqachon kiritilgan
      try { sessionStorage.removeItem('rc_force_profit'); } catch (e) {}
      return;
    }
    RcOrderDetail._psForce = true;
    RcOrderDetail._ps = [{ name: RcOrderDetail._OWNER_LABEL, percent: 100, owner: true }];
    RcOrderDetail._profitEdit(true);
  },

  // Tab almashtirish — WS qayta so'ralmaydi, kesh'dan chiziladi.
  // 2026-09-10: butun sahifani (`_paint`) emas, FAQAT tab-mazmuni divini
  // yangilaydi — header/kartochka/tab tugmalari qayta yaratilmaydi, shu
  // sabab ekranda "oqarish/flash" bo'lmaydi (foydalanuvchi buni "sahifa
  // qayta yuklanayabdi" deb sezgan edi, garchi WS so'rov yuborilmasa ham —
  // sabab butun innerHTML'ning qayta yaratilishi edi).
  setTab: function (t) {
    RcOrderDetail._tab = t;
    var content = document.getElementById('rc-od-tabcontent');
    var tabsBar = document.getElementById('rc-od-tabs');
    if (!content || !tabsBar || !RcOrderDetail._data) { RcOrderDetail._paint(); window.scrollTo(0, 0); return; }
    tabsBar.querySelectorAll('.rc-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === t);
    });
    content.innerHTML = RcOrderDetail._tabContentHtml(RcOrderDetail._data);
    RcOrderDetail._afterPaint();
    window.scrollTo(0, 0);
  },

  _paint: function () {
    var app = document.getElementById('app');
    app.innerHTML = RcOrderDetail.template(RcOrderDetail._data);
    RcOrderDetail._afterPaint();
  },

  // Render'dan keyin: Bazis smeta (BOM) kartasini chizish
  _afterPaint: function () {
    var d = RcOrderDetail._data;
    var bomEl = document.getElementById('rc-bom');
    if (!bomEl) return;
    if (window.BomCard && d.bom) {
      RcOrderDetail._bomRetry = 0;
      // 2026-09-04: standart holatda YOPIQ (expanded=false) — foydalanuvchi
      // so'rovi bo'yicha. Ilgari `true` bo'lgani uchun har safar ochiq
      // boshlanardi; endi sarlavhaga bosilgach ochiladi (mavjud bomc-head
      // toggle, bom-card.js:211-217, o'zgarmadi).
      try { BomCard.renderData(d.bom, bomEl, d.bom.source_order_id, false); } catch (e) { bomEl.innerHTML = ''; }
      return;
    }
    var hasB3d = (d.files || []).some(function (f) { return /\.b3d$/i.test(f.file_name || ''); });
    if (hasB3d && (RcOrderDetail._bomRetry || 0) < 3) {
      RcOrderDetail._bomRetry = (RcOrderDetail._bomRetry || 0) + 1;
      bomEl.innerHTML = '<div class="rc-card" style="text-align:center;color:var(--mut);font-size:12px;padding:14px">⏳ Bazis smeta hisoblanmoqda…</div>';
      setTimeout(function () { if (location.hash.indexOf('/orders/' + d.id) !== -1) RcOrderDetail.reload(); }, 2500);
    } else if (hasB3d) {
      bomEl.innerHTML = '<div class="rc-card" style="text-align:center;color:var(--mut);font-size:12px;padding:14px">📐 .b3d bor, lekin smeta yo\'q. Qayta yuklang.</div>';
    } else {
      bomEl.innerHTML = '';
    }
  },

  // Interaktiv amal degrade (hali ulanmagan tugmalar uchun)
  act: function () { Toast.info('Tez orada'); },

  // Joriy tabni saqlab qayta yuklash (mutatsiyadan keyin)
  reload: function () {
    WS.send('page.order', { id: RcOrderDetail._id }, function (msg) {
      if (!msg.ok) { Toast.error(msg.error || 'Xatolik'); return; }
      RcOrderDetail._data = msg.data;
      STATE.currentOrder = msg.data;
      RcOrderDetail._paint();
    });
  },

  _val: function (id) { var el = document.getElementById(id); return el ? el.value : ''; },

  // Real-time broadcast (boshqa a'zo etap/moliya/fayl/checklist o'zgartirsa) — jonli yangilanish.
  // O'z amalim reload() ni allaqachon chaqiradi; broadcastlarni debounce qilib bitta reload.
  handleBroadcast: function (action, data, by) {
    if (by && STATE.user && by === STATE.user.full_name) return;
    if (RcOrderDetail._bcTimer) clearTimeout(RcOrderDetail._bcTimer);
    RcOrderDetail._bcTimer = setTimeout(function () {
      if (location.hash.indexOf('/orders/' + RcOrderDetail._id) !== -1) RcOrderDetail.reload();
    }, 400);
  },

  // ── Holat o'zgartirish (ikonкали timeline-picker) ──
  STATUS_ORDER: ['new', 'waiting', 'in_progress', 'at_mebelcity', 'ready', 'delivered', 'cancelled'],
  STATUS_META: {
    new:          { label: 'Yangi',       icon: 'fa-star',         color: 'var(--cyan)' },
    waiting:      { label: 'Kutilmoqda',  icon: 'fa-clock',        color: 'var(--pch)' },
    in_progress:  { label: 'Jarayonda',   icon: 'fa-spinner',      color: 'var(--acc-text)' },
    at_mebelcity: { label: 'MebelCity da', icon: 'fa-industry',    color: 'var(--lav)' },
    ready:        { label: 'Tayyor',       icon: 'fa-box-open',    color: 'var(--acc-text)' },
    delivered:    { label: 'Topshirildi',  icon: 'fa-check-circle', color: 'var(--ok)' },
    cancelled:    { label: 'Bekor qilingan', icon: 'fa-ban',       color: 'var(--danger)' },
  },
  // Ikki sana orasidagi kun farqi (boshlandi → topshirildi). Noto'g'ri/bo'sh
  // sana bo'lsa null. Bir kunda bo'lsa "0" emas, kamida 1 kun deb ko'rsatamiz.
  _kunFarq: function (a, b) {
    if (!a || !b) return null;
    var t1 = new Date(a).getTime(), t2 = new Date(b).getTime();
    if (isNaN(t1) || isNaN(t2) || t2 < t1) return null;
    var kun = Math.round((t2 - t1) / 86400000);
    return kun < 1 ? 1 : kun;
  },

  _stRow: function (k, selected) {
    var m = RcOrderDetail.STATUS_META[k]; if (!m) return '';
    var on = k === selected;
    return '<button type="button" class="rc-st-opt" data-k="' + k + '" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:8px 10px;border:1.5px solid ' + (on ? m.color : 'transparent') + ';border-radius:12px;background:' + (on ? 'color-mix(in srgb,' + m.color + ' 15%,transparent)' : 'transparent') + ';cursor:pointer">' +
      '<span style="width:34px;height:34px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:' + m.color + ';color:var(--acc-ink)"><i class="fas ' + m.icon + '"></i></span>' +
      '<span style="flex:1;font-size:14px;font-weight:' + (on ? '800' : '600') + ';color:' + (on ? 'var(--txt)' : 'var(--mut)') + '">' + T(m.label) + '</span>' +
      '<i class="fas fa-check rc-st-chk" style="color:' + m.color + ';' + (on ? '' : 'display:none') + '"></i></button>';
  },
  changeStatus: function () {
    var d = RcOrderDetail._data;
    if (!(d.is_owner || d.user_role === 'manager')) return;
    var cur = d.status, selected = cur;
    var rows = RcOrderDetail.STATUS_ORDER.map(function (k) { return RcOrderDetail._stRow(k, cur); }).join('');
    var body = '<div style="display:flex;flex-direction:column;gap:4px;padding-top:2px">' + rows +
      '<div id="rc-st-note" style="display:' + (cur === 'waiting' ? '' : 'none') + ';margin-top:8px"><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">Kutilmoqda sababi *</div>' +
      '<textarea id="rc-st-note-in" class="rc-input" rows="2" placeholder="Masalan: material yetishmayapti..."></textarea></div>' +
      '<button class="rc-btn" id="rc-st-ok" style="width:100%;margin-top:10px"><i class="fas fa-check"></i> Saqlash</button></div>';
    RcSheet.open("Holatni o'zgartirish", body, {});
    var noteBox = document.getElementById('rc-st-note');
    document.querySelectorAll('.rc-st-opt').forEach(function (b) {
      b.onclick = function () {
        selected = b.getAttribute('data-k');
        document.querySelectorAll('.rc-st-opt').forEach(function (x) {
          var xk = x.getAttribute('data-k'), xm = RcOrderDetail.STATUS_META[xk], on = xk === selected;
          x.style.borderColor = on ? xm.color : 'transparent';
          x.style.background = on ? 'color-mix(in srgb,' + xm.color + ' 15%,transparent)' : 'transparent';
          var lbl = x.querySelector('span:nth-child(2)'); if (lbl) { lbl.style.fontWeight = on ? '800' : '600'; lbl.style.color = on ? 'var(--txt)' : 'var(--mut)'; }
          var chk = x.querySelector('.rc-st-chk'); if (chk) chk.style.display = on ? '' : 'none';
        });
        noteBox.style.display = selected === 'waiting' ? '' : 'none';
      };
    });
    document.getElementById('rc-st-ok').onclick = function () {
      var nv = selected;
      if (nv === cur) { RcSheet.close(); return; }
      var note = (RcOrderDetail._val('rc-st-note-in') || '').trim();
      if (nv === 'waiting' && !note) return Toast.error("Kutilmoqda sababini yozing");
      var payload = { id: d.id, fields: { status: nv } };
      if (nv === 'waiting') payload.status_note = note;
      WS.send('order.update', payload, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success('Holat yangilandi'); RcOrderDetail.reload();
      });
    };
  },

  // ── Buyurtmani topshirish (status=ready → delivered) ──
  deliverOrder: function () {
    var d = RcOrderDetail._data;
    (window.RcSheet ? RcSheet : Modal).confirm('Buyurtmani topshirish',
      'Buyurtma mijozga topshirildi deb belgilansinmi? Holat «Topshirildi» bo\'ladi.',
      function () {
        WS.send('order.update', { id: d.id, fields: { status: 'delivered' } }, function (msg) {
          if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
          Toast.success('Buyurtma topshirildi!'); RcOrderDetail.reload();
        });
      });
  },

  // ── Eslatmalar ──
  addNote: function () {
    var d = RcOrderDetail._data;
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      '<textarea id="rc-note-in" class="rc-input" rows="5" placeholder="Eslatma yozing..."></textarea>' +
      '<button class="rc-btn" id="rc-note-ok" style="width:100%"><i class="fas fa-check"></i> Saqlash</button></div>';
    RcSheet.open('📝 Yangi eslatma', body, {});
    document.getElementById('rc-note-ok').onclick = function () {
      var text = (RcOrderDetail._val('rc-note-in') || '').trim();
      if (!text) return Toast.error('Matn kiriting');
      WS.send('note.create', { order_id: d.id, text: text }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success('Saqlandi'); RcOrderDetail.reload();
      });
    };
  },
  editNote: function (noteId) {
    var d = RcOrderDetail._data;
    var n = (d.notes || []).filter(function (x) { return x.id === noteId; })[0];
    if (!n) return;
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      '<textarea id="rc-note-in" class="rc-input" rows="5"></textarea>' +
      '<button class="rc-btn" id="rc-note-ok" style="width:100%"><i class="fas fa-check"></i> Saqlash</button></div>';
    RcSheet.open('Eslatmani tahrirlash', body, {});
    document.getElementById('rc-note-in').value = n.text;
    document.getElementById('rc-note-ok').onclick = function () {
      var text = (RcOrderDetail._val('rc-note-in') || '').trim();
      if (!text) return Toast.error('Matn kiriting');
      WS.send('note.update', { note_id: noteId, text: text }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success('Yangilandi'); RcOrderDetail.reload();
      });
    };
  },
  delNote: function (noteId) {
    RcSheet.confirm("O'chirish", "Eslatmani o'chirasizmi?", function () {
      WS.send('note.delete', { note_id: noteId }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        Toast.success("O'chirildi"); RcOrderDetail.reload();
      });
    });
  },

  // ── Etap amallari ──
  completeStage: function (id) {
    WS.send('stage.complete', { id: id }, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      Toast.success(T('Etap tugallandi')); RcOrderDetail.reload();
    });
  },
  skipStage: function (id) {
    RcSheet.confirm("O'tkazish", "Ushbu etapni o'tkazasizmi?", function () {
      WS.send('stage.skip', { id: id }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        Toast.success(T("Etap o'tkazildi")); RcOrderDetail.reload();
      });
    });
  },
  reopenStage: function (id) {
    RcSheet.confirm('Qayta ochish', 'Ushbu etapni qayta ochasizmi?', function () {
      WS.send('stage.reopen', { id: id }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        Toast.success(T('Etap qayta ochildi')); RcOrderDetail.reload();
      });
    });
  },
  delStage: function (id) {
    RcSheet.confirm("O'chirish", "Ushbu etapni o'chirasizmi?", function () {
      WS.send('stage.delete', { id: id }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        Toast.success(T("Etap o'chirildi")); RcOrderDetail.reload();
      });
    });
  },
  checkItem: function (stageId, itemId) {
    WS.send('stage.check', { stage_id: stageId, item_id: itemId }, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      RcOrderDetail.reload();
    });
  },

  // ── Yangi etap ──
  COLORS: [['#DCF262', 'Yashil'], ['#A6E6F2', 'Moviy'], ['#C9B4F7', 'Siyohrang'], ['#F5A48B', 'Pushti'], ['#6366f1', "Ko'k"], ['#f59e0b', 'Sariq']],
  EMOJIS: ['📋', '📐', '🪚', '🔨', '🎨', '✂️', '📦', '🚚', '🔧', '✅', '🏭', '💰', '📸', '🧹', '🪑', '🛋️', '🚪', '🪟', '💡', '🧱', '🔩', '📏', '🖌️', '🪵', '🧰', '⚡', '🎯', '🖼️', '🔥', '⭐', '📝', '🛠️', '🧪', '🪛', '🔌', '🚿', '🪞', '🗜️', '🏗️', '🎁'],

  _emojiGrid: function (hidId, selected) {
    var items = RcOrderDetail.EMOJIS.map(function (e) {
      var on = e === selected;
      return '<button type="button" class="rc-emo" data-e="' + e + '" onclick="RcOrderDetail._pickEmoji(this,\'' + hidId + '\')" style="width:40px;height:40px;border-radius:11px;border:1.5px solid ' + (on ? 'var(--acc)' : 'var(--brd)') + ';background:' + (on ? 'color-mix(in srgb,var(--acc) 18%,transparent)' : 'var(--sfc2)') + ';font-size:20px;cursor:pointer;flex:none;transition:all .12s">' + e + '</button>';
    }).join('');
    return '<div style="display:flex;flex-wrap:wrap;gap:7px;max-height:142px;overflow-y:auto;padding:2px">' + items + '</div>' +
      '<input type="hidden" id="' + hidId + '" value="' + selected + '">';
  },
  _pickEmoji: function (btn, hidId) {
    var hid = document.getElementById(hidId); if (hid) hid.value = btn.dataset.e;
    var box = btn.parentNode;
    box.querySelectorAll('.rc-emo').forEach(function (b) { b.style.borderColor = 'var(--brd)'; b.style.background = 'var(--sfc2)'; });
    btn.style.borderColor = 'var(--acc)'; btn.style.background = 'color-mix(in srgb,var(--acc) 18%,transparent)';
  },

  addStage: function () {
    var d = RcOrderDetail._data;
    var copts = RcOrderDetail.COLORS.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('');
    var lbl = function (t) { return '<div style="font-size:11px;color:var(--mut);font-weight:700;margin-bottom:7px">' + t + '</div>'; };
    var body = '<div style="display:flex;flex-direction:column;gap:15px;padding-top:2px">' +
      '<div>' + lbl('Nom *') + '<input id="rc-sg-title" class="rc-input" placeholder="Masalan: Kesish"></div>' +
      '<div>' + lbl('Emoji tanlang') + RcOrderDetail._emojiGrid('rc-sg-icon', '📋') + '</div>' +
      '<div>' + lbl('Rang') + '<select id="rc-sg-color" class="rc-input">' + copts + '</select></div>' +
      '<div>' + lbl('Izoh') + '<input id="rc-sg-note" class="rc-input" placeholder="Ixtiyoriy"></div>' +
      '<div>' + lbl('Checklist (har qatorda bittadan)') + '<textarea id="rc-sg-chk" class="rc-input" rows="3" placeholder="Masalan:\nMaterial tayyorlash\nO\'lchash"></textarea></div>' +
      '<button type="button" id="rc-sg-mc-btn" style="width:100%;display:flex;align-items:center;gap:10px;padding:13px 15px;border-radius:var(--radius-sm);border:1.5px solid var(--brd2);background:var(--sfc2);color:var(--txt);font-size:13px;font-weight:700;cursor:pointer">' +
        '<span id="rc-sg-mc-ico" style="font-size:16px">🏭</span><span style="flex:1;text-align:left">MebelCity buyurtmaga ulash</span><i class="fas fa-chevron-down" id="rc-sg-mc-chev" style="font-size:11px;color:var(--mut)"></i></button>' +
      '<div id="rc-sg-mcbox" style="display:none"></div>' +
      '<button class="rc-btn" id="rc-sg-ok" style="width:100%;margin-top:2px"><i class="fas fa-check"></i> Qo\'shish</button></div>';
    RcSheet.open('✨ Yangi etap', body, {});

    var mcBtn = document.getElementById('rc-sg-mc-btn');
    var mcBox = document.getElementById('rc-sg-mcbox');
    var mcChev = document.getElementById('rc-sg-mc-chev');
    var mcOn = false, mcLoaded = false;
    mcBtn.onclick = function () {
      mcOn = !mcOn;
      mcBtn.style.background = mcOn ? 'var(--acc)' : 'var(--sfc2)';
      mcBtn.style.color = mcOn ? 'var(--acc-ink)' : 'var(--txt)';
      mcBtn.style.borderColor = mcOn ? 'transparent' : 'var(--brd2)';
      if (mcChev) mcChev.className = 'fas fa-chevron-' + (mcOn ? 'up' : 'down');
      mcBox.style.display = mcOn ? 'block' : 'none';
      if (mcOn && !mcLoaded) { mcLoaded = true; mcBox.innerHTML = RcOrderDetail._mcPickerHtml(); RcOrderDetail._initMcPicker(null); }
    };

    document.getElementById('rc-sg-ok').onclick = function () {
      var title = (RcOrderDetail._val('rc-sg-title') || '').trim();
      if (!title) return Toast.error('Nom kiriting');
      var chk = (RcOrderDetail._val('rc-sg-chk') || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      var mcId = mcOn ? (parseInt(RcOrderDetail._val('mc-selected-id')) || null) : null;
      WS.send('stage.create', {
        order_id: d.id, title: title,
        icon: (RcOrderDetail._val('rc-sg-icon') || '📋').trim() || '📋',
        color: RcOrderDetail._val('rc-sg-color') || '#DCF262',
        note: (RcOrderDetail._val('rc-sg-note') || '').trim(),
        is_mebelcity: mcOn, mebelcity_order_id: mcId, checklist: chk,
      }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success(T('Etap qo\'shildi')); RcOrderDetail.reload();
      });
    };
  },

  // ── Shablon qo'llash ──
  applyTemplate: function () {
    var d = RcOrderDetail._data;
    var tpls = d.templates || [];
    if (!tpls.length) return Toast.info('Shablon yo\'q');
    var rows = tpls.map(function (t) {
      var cnt = (t.items && t.items.length) || 0;
      return '<button class="rc-btn-ghost" style="width:100%;justify-content:space-between;text-align:left" onclick="RcOrderDetail._doApply(' + t.id + ')">' +
        '<span>' + Utils.esc(t.name) + '</span><span style="color:var(--mut);font-size:11px">' + cnt + ' etap</span></button>';
    }).join('');
    RcSheet.open('Shablon tanlang', '<div style="display:flex;flex-direction:column;gap:8px;padding-top:2px">' + rows + '</div>', {});
  },
  _doApply: function (templateId) {
    var d = RcOrderDetail._data;
    WS.send('template.apply', { template_id: templateId, order_id: d.id }, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      RcSheet.close(); Toast.success('Shablon qo\'llandi'); RcOrderDetail.reload();
    });
  },

  // ── Buyurtmani o'chirish ──
  deleteOrder: function () {
    var d = RcOrderDetail._data;
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      '<div style="font-size:13px;color:var(--txt)">Buyurtma o\'chiriladi. Sababini yozing:</div>' +
      '<textarea id="rc-od-note" class="rc-input" rows="3" placeholder="O\'chirish sababi..."></textarea>' +
      '<button class="rc-btn" id="rc-od-ok" style="width:100%;background:var(--danger);color:#fff"><i class="fas fa-trash"></i> O\'chirish</button></div>';
    RcSheet.open("Buyurtmani o'chirish", body, {});
    document.getElementById('rc-od-ok').onclick = function () {
      var note = (RcOrderDetail._val('rc-od-note') || '').trim();
      if (!note) return Toast.error('Sababini yozing');
      WS.send('order.delete', { id: d.id, note: note }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success("Buyurtma o'chirildi"); Router.go('/orders');
      });
    };
  },

  // ═══════════ F2: MOLIYA ═══════════
  _fld: function (label, ctrl) {
    return '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">' + label + '</div>' + ctrl + '</div>';
  },
  _pmSelect: function (id) {
    return '<select id="' + id + '" class="rc-input"><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O\'tkazma</option></select>';
  },

  // ── Kirim ──
  addIncome: function () {
    var d = RcOrderDetail._data;
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      RcOrderDetail._fld('Summa *', '<input id="rc-in-amt" class="rc-input ce-money-input" inputmode="numeric" placeholder="0">') +
      RcOrderDetail._fld('Izoh', '<input id="rc-in-desc" class="rc-input" placeholder="Ixtiyoriy">') +
      RcOrderDetail._fld("To'lov turi", RcOrderDetail._pmSelect('rc-in-pm')) +
      '<button class="rc-btn" id="rc-in-ok" style="width:100%"><i class="fas fa-check"></i> Saqlash</button></div>';
    RcSheet.open("Kirim qo'shish", body, {});
    document.getElementById('rc-in-ok').onclick = function () {
      var amt = Utils.rawMoney(RcOrderDetail._val('rc-in-amt')) || 0;
      if (amt <= 0) return Toast.error('Summa kiriting');
      var payload = {
        order_id: d.id, amount: amt,
        description: (RcOrderDetail._val('rc-in-desc') || '').trim(),
        payment_method: RcOrderDetail._val('rc-in-pm'),
        customer_id: d.customer ? d.customer.id : null,
      };
      var send = function (allowExtra) {
        if (allowExtra) payload.allow_extra = true;
        WS.send('order.income', payload, function (msg) {
          // 2026-08-04: shartnoma summasi yo'q bo'lsa server '__NEED_CONTRACT__'
          // qaytaradi — quruq xato o'rniga tushuntirib, shartnoma oynasini
          // o'zimiz ochamiz (foydalanuvchi qidirib yurmasin).
          if (!msg.ok && msg.error === '__NEED_CONTRACT__') return RcOrderDetail._needContract(amt);
          // 2026-08-08: shartnoma to'lib bo'lgan — rad etmaymiz, so'raymiz.
          if (!msg.ok && msg.over_contract) return RcOrderDetail._overContract(msg.over_contract, send);
          if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
          RcSheet.close(); Toast.success("Kirim qo'shildi"); RcOrderDetail.reload();
        });
      };
      send(false);
    };
  },

  // ── Chiqim ──
  addExpense: function () {
    var d = RcOrderDetail._data, esc = Utils.esc;
    var stageOpts = '<option value="">— umumiy —</option>';
    (d.stages || []).forEach(function (s) {
      if (s.status !== 'completed' && s.status !== 'skipped') stageOpts += '<option value="' + s.id + '">' + esc(s.icon + ' ' + s.title) + '</option>';
    });
    var catSel = '<select id="rc-ex-cat" class="rc-input"><option value="material">Material</option><option value="service">Xizmat</option><option value="transport">Transport</option><option value="other">Boshqa</option></select>';

    // ── SHERIKLI ZAKAZ: «Kim to'ladi?» (2026-08-15, §F3) ──────────────────
    // Rasxod kiritilgan foizga qarab bo'linadi: to'lovchining kassasidan
    // to'liq summa chiqadi, qolgan sheriklar unga ulushi qadar qarzdor bo'ladi.
    var pShares = (d.profit_shares || []).filter(function (s) { return s.user_id; });
    var isShared = (d.profit_shares || []).length >= 2;
    var payerFld = '';
    if (isShared && pShares.length) {
      var opts = pShares.map(function (s) {
        var sel = (s.user_id === d.owner_id) ? ' selected' : '';
        return '<option value="' + s.user_id + '"' + sel + '>' + esc(s.label || s.name)
          + ' · ' + s.percent + '%</option>';
      }).join('');
      payerFld = RcOrderDetail._fld("Kim to‘ladi?", '<select id="rc-ex-payer" class="rc-input">' + opts + '</select>')
        + '<div id="rc-ex-split" style="font-size:11px;color:var(--mut);line-height:1.6;'
        + 'background:var(--sfc2);padding:9px 11px;border-radius:10px;margin-top:-6px"></div>';
    }

    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      RcOrderDetail._fld('Summa *', '<input id="rc-ex-amt" class="rc-input ce-money-input" inputmode="numeric" placeholder="0">') +
      RcOrderDetail._fld('Izoh', '<input id="rc-ex-desc" class="rc-input" placeholder="Ixtiyoriy">') +
      RcOrderDetail._fld('Kategoriya', catSel) +
      RcOrderDetail._fld(T('Etap'), '<select id="rc-ex-stage" class="rc-input">' + stageOpts + '</select>') +
      RcOrderDetail._fld("To'lov turi", RcOrderDetail._pmSelect('rc-ex-pm')) +
      payerFld +
      '<button class="rc-btn" id="rc-ex-ok" style="width:100%"><i class="fas fa-check"></i> Saqlash</button></div>';
    RcSheet.open("Chiqim qo'shish", body, {});

    // Jonli oldindan ko'rsatish: kim qancha ko'taradi / kim kimga qarzdor
    var _preview = function () {
      var box = document.getElementById('rc-ex-split');
      if (!box) return;
      var amt = Utils.rawMoney(RcOrderDetail._val('rc-ex-amt')) || 0;
      var payerId = parseInt(RcOrderDetail._val('rc-ex-payer')) || 0;
      if (amt <= 0) { box.innerHTML = 'Summa kiriting — ulushlar shu yerda ko‘rinadi.'; return; }
      box.innerHTML = pShares.map(function (s) {
        var part = Math.round(amt * (parseFloat(s.percent) || 0) / 100);
        var me = (s.user_id === payerId);
        return '<div>' + (me ? '💵 ' : '🧾 ') + esc(s.label || s.name) + ' — ' + Utils.money(part)
          + (me ? ' <b>(to‘laydi)</b>' : ' <span style="color:var(--danger)">(qarz)</span>') + '</div>';
      }).join('');
    };
    var amtEl = document.getElementById('rc-ex-amt');
    if (amtEl) amtEl.addEventListener('input', _preview);
    var payerEl = document.getElementById('rc-ex-payer');
    if (payerEl) payerEl.onchange = _preview;
    _preview();

    document.getElementById('rc-ex-ok').onclick = function () {
      var amt = Utils.rawMoney(RcOrderDetail._val('rc-ex-amt')) || 0;
      if (amt <= 0) return Toast.error('Summa kiriting');
      var sid = RcOrderDetail._val('rc-ex-stage');
      var pid = RcOrderDetail._val('rc-ex-payer');
      WS.send('order.expense', { order_id: d.id, amount: amt, description: (RcOrderDetail._val('rc-ex-desc') || '').trim(), payment_method: RcOrderDetail._val('rc-ex-pm'), category: RcOrderDetail._val('rc-ex-cat'), stage_id: sid ? parseInt(sid) : null, payer_id: pid ? parseInt(pid) : null }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success("Chiqim qo'shildi"); RcOrderDetail.reload();
      });
    };
  },

  // ── Shartnoma summasi (zaklad) ──
  setZaklad: function () {
    var d = RcOrderDetail._data;
    var cur = parseInt(d.zaklad_amount) || 0;
    // Sana chegaralari: bugundan (o'tgan yo'q) — bugun+300 kun
    function ymd(dt) { return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2); }
    var today = new Date(); var maxD = new Date(); maxD.setDate(maxD.getDate() + 300);
    var minStr = ymd(today), maxStr = ymd(maxD);
    var curDl = (d.deadline || '').slice(0, 10);   // ISO → YYYY-MM-DD
    var PRESETS = [['3 kun', 3], ['5 kun', 5], ['1 hafta', 7], ['10 kun', 10], ['15 kun', 15], ['1 oy', 30]];
    var chips = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:-4px">' + PRESETS.map(function (p) {
      return '<button type="button" class="rc-dl-preset" data-d="' + p[1] + '" style="border:1px solid var(--brd);background:var(--sfc2);color:var(--txt);border-radius:var(--pill);padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer">' + p[0] + '</button>';
    }).join('') + '</div>';
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      RcOrderDetail._fld('Shartnoma summasi', '<input id="rc-zk-amt" class="rc-input ce-money-input" inputmode="numeric" value="' + (cur || '') + '" placeholder="0">') +
      RcOrderDetail._fld('Topshirish sanasi', '<input id="rc-zk-dl" class="rc-input" type="date" value="' + curDl + '" min="' + minStr + '" max="' + maxStr + '">') +
      chips +
      '<div style="font-size:11px;color:var(--mut)">Mijoz bilan kelishilgan umumiy narx va topshirish muddati (bugundan 300 kungacha).</div>' +
      '<button class="rc-btn" id="rc-zk-ok" style="width:100%"><i class="fas fa-check"></i> Saqlash</button></div>';
    RcSheet.open('Shartnoma summasi', body, {});
    // Tez-tanlov: bosilsa sana = bugun + N kun
    document.querySelectorAll('.rc-dl-preset').forEach(function (b) {
      b.onclick = function () {
        var n = parseInt(b.getAttribute('data-d'), 10);
        var dt = new Date(); dt.setDate(dt.getDate() + n);
        var inp = document.getElementById('rc-zk-dl'); if (inp) inp.value = ymd(dt);
        document.querySelectorAll('.rc-dl-preset').forEach(function (x) {
          x.style.borderColor = 'var(--brd)'; x.style.background = 'var(--sfc2)'; x.style.color = 'var(--txt)';
        });
        b.style.borderColor = 'var(--acc)'; b.style.background = 'color-mix(in srgb,var(--acc) 16%,transparent)'; b.style.color = 'var(--acc-text)';
      };
    });
    document.getElementById('rc-zk-ok').onclick = function () {
      var val = Utils.rawMoney(RcOrderDetail._val('rc-zk-amt')) || 0;
      var dl = (RcOrderDetail._val('rc-zk-dl') || '').trim();
      if (dl) {
        if (dl < minStr) return Toast.error("O'tgan sanani belgilab bo'lmaydi");
        if (dl > maxStr) return Toast.error("300 kundan ortiq sana belgilab bo'lmaydi");
      }
      var fields = { zaklad_amount: val };
      if (dl) fields.deadline = dl;
      WS.send('order.update', { id: d.id, fields: fields }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success('Saqlandi'); RcOrderDetail.reload();
      });
    };
  },

  // ── Kirim/Chiqim qaytarish (faqat can_revert_finance) ──
  revertFinance: function (type) {
    var d = RcOrderDetail._data;
    var isIncome = type === 'income';
    var title = isIncome ? 'Kirim qaytarish' : 'Chiqim qaytarish';
    var marker = isIncome ? 'income_return' : 'expense_return';
    var hist = (d.transactions || []).filter(function (t) { return t.category === marker; });
    var histHtml = '';
    if (hist.length) {
      histHtml = '<div><div style="font-size:11px;color:var(--mut);margin-bottom:6px">Qaytarilgan tarix</div>';
      hist.forEach(function (t) {
        histHtml += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--brd)"><span style="color:var(--mut)">' + Utils.date(t.date) + '</span><span style="font-weight:700">' + Utils.money(t.amount) + '</span></div>';
      });
      histHtml += '</div>';
    }
    // ── QAYTARILADIGAN YOZUVLAR RO'YXATI (2026-08-15 talabi) ──────────────
    // Ilgari faqat «summa kiriting» degan bo'sh maydon bor edi — qaysi
    // chiqimni qaytarayotganini tanlab bo'lmasdi. Endi shu buyurtmaning
    // kirim/chiqimlari ro'yxati chiqadi, bosilgani tanlanadi va summasi
    // o'zi to'ladi. Qo'lda boshqa summa yozish ham mumkin (qisman qaytarish).
    var esc = Utils.esc;
    var src = (d.transactions || []).filter(function (t) {
      return t.record_type === type && t.category !== marker && !t.is_reversal;
    });
    // Allaqachon qaytarilganlarni belgilash uchun — qaytarish yozuvlari summasi
    var revd = {};
    hist.forEach(function (t) {
      var m = /#(\d+)/.exec(t.description || '');
      if (m) revd[m[1]] = (revd[m[1]] || 0) + (parseInt(t.amount) || 0);
    });

    var listHtml = '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">'
      + (isIncome ? 'Kirimlar' : 'Chiqimlar') + ' — qaytariladiganini tanlang</div>';
    if (src.length) {
      listHtml += '<div style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto">';
      src.forEach(function (t) {
        var done = revd[t.id] >= (parseInt(t.amount) || 0);
        listHtml += '<div class="rc-rv-row" data-id="' + t.id + '" data-amt="' + t.amount + '" '
          + 'style="display:flex;justify-content:space-between;align-items:center;gap:8px;'
          + 'padding:9px 11px;background:var(--sfc2);border-radius:10px;cursor:pointer;'
          + 'border:1px solid transparent' + (done ? ';opacity:.5' : '') + '">'
          + '<div style="min-width:0;flex:1">'
          + '<div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          + esc(t.description || t.stage_name || t.category || '—') + (done ? ' ✅' : '') + '</div>'
          + '<div style="font-size:10.5px;color:var(--mut);margin-top:2px">' + Utils.date(t.date)
          + (revd[t.id] ? ' · qaytarilgan ' + Utils.money(revd[t.id]) : '') + '</div></div>'
          + '<b style="font-size:13px;white-space:nowrap;color:'
          + (isIncome ? 'var(--acc-text)' : 'var(--pch-text)') + '">' + Utils.money(t.amount) + '</b></div>';
      });
      listHtml += '</div>';
    } else {
      listHtml += '<div style="font-size:12px;color:var(--mut);padding:6px 2px">'
        + (isIncome ? 'Kirim' : 'Chiqim') + ' yozuvi yo\'q</div>';
    }
    listHtml += '</div>';

    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      RcOrderDetail._fld('Qaytariladigan summa', '<input id="rc-rv-amt" class="rc-input" type="number" inputmode="numeric" placeholder="0">') +
      listHtml +
      histHtml +
      '<button class="rc-btn" id="rc-rv-ok" style="width:100%"><i class="fas fa-undo"></i> Qaytarish</button></div>';
    RcSheet.open(title, body, {});

    RcOrderDetail._rvPick = null;
    document.querySelectorAll('.rc-rv-row').forEach(function (row) {
      row.onclick = function () {
        document.querySelectorAll('.rc-rv-row').forEach(function (r) {
          r.style.border = '1px solid transparent';
        });
        row.style.border = '1px solid var(--acc)';
        RcOrderDetail._rvPick = parseInt(row.dataset.id);
        var el = document.getElementById('rc-rv-amt');
        if (el) el.value = row.dataset.amt;
      };
    });

    document.getElementById('rc-rv-ok').onclick = function () {
      var amt = parseInt(RcOrderDetail._val('rc-rv-amt')) || 0;
      if (amt <= 0) return Toast.error('Summa kiriting yoki ro\'yxatdan tanlang');
      WS.send('finance.revert', {
        order_id: d.id, type: type, amount: amt,
        record_id: RcOrderDetail._rvPick || null
      }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success('Qaytarildi'); RcOrderDetail.reload();
      });
    };
  },

  // ── Foyda taqsimot ──
  openProfit: function () {
    var d = RcOrderDetail._data;
    if (d.money_hidden) return;
    // 2026-08-04: shartnoma summasisiz FOYDA TAQSIMLASH yo'q — foyda aynan
    // shartnomadan hisoblanadi, shartnomasiz esa taqsimlanadigan raqam
    // ishonchsiz (eski naqd-asosli hisobga tushib qolardi).
    if (RcOrderDetail._noContract()) return RcOrderDetail._needContract(0, 'taqsimlash');
    if (d.profit_shares && d.profit_shares.length) RcOrderDetail._profitRead();
    else RcOrderDetail._profitEdit();
  },
  _profitRead: function () {
    var d = RcOrderDetail._data, esc = Utils.esc;
    var profit = (d.profit !== undefined && d.profit !== null)
      ? (parseInt(d.profit) || 0)
      : ((parseInt(d.total_income) || 0) - (parseInt(d.total_expense) || 0));
    var shares = d.profit_shares || [];
    var h = '<div style="display:flex;flex-direction:column;gap:8px;padding-top:2px">';
    h += '<div style="font-size:13px;font-weight:800;color:var(--acc-text)">Foyda: ' + Utils.money(Math.abs(profit)) + '</div>';
    shares.forEach(function (s) {
      var amt = Math.round(profit * (parseFloat(s.percent) || 0) / 100);
      h += '<div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--brd)"><span style="font-weight:600">' + esc(s.name || "Noma'lum") + '</span><span><span style="color:var(--mut)">' + s.percent + '%</span> · <span style="font-weight:800;color:var(--acc-text)">' + Utils.money(Math.abs(amt)) + '</span></span></div>';
    });
    h += '<div style="font-size:11px;color:var(--mut);text-align:center;margin-top:4px">Bo\'lingan ✅ · o\'zgartirish uchun Moliya sahifasidan</div></div>';
    RcSheet.open('Foyda taqsimlash', h, {});
  },
  // ══════════════════════════════════════════════════════════════════════
  //  SHARTNOMA MAJBURIY — KIRIMDAN OLDIN (2026-08-04)
  //  Foyda shartnoma summasidan hisoblanadi, shuning uchun shartnomasiz
  //  kelgan pul hisobotni chalkashtiradi. Quruq xato o'rniga — tushuntirish
  //  va TO'G'RIDAN-TO'G'RI shartnoma kiritish oynasi.
  // ══════════════════════════════════════════════════════════════════════
  // Shartnoma summasi yo'qmi (rasmiy ClientContract yoki zaklad)
  _noContract: function () {
    var d = RcOrderDetail._data || {};
    var c = parseFloat(d.contract_amount || 0) || 0;
    if (!c) c = parseFloat(d.zaklad_amount || 0) || 0;   // eski javob bilan moslik
    return !(c > 0);
  },

  // ══════════════════════════════════════════════════════════════════════
  //  SHARTNOMA TO'LIB BO'LGAN (2026-08-08)
  //  Ilgari bu holatda kirim QAT'IY rad etilardi va usta qo'shimcha ish
  //  uchun olgan pulni hech qayerga yoza olmasdi (189 buyurtmadan 62 tasi
  //  shu holatda edi). Endi savol beramiz — 2 ta chiqish yo'li bilan.
  // ══════════════════════════════════════════════════════════════════════
  _overContract: function (info, resend) {
    var money = Utils.money;
    if (!window.RcSheet || !RcSheet.open) {
      Toast.error('Shartnoma summasi to\'lib bo\'lgan');
      return;
    }
    var h = ''
      + '<div style="text-align:center;margin-bottom:14px"><div style="font-size:38px">💰</div>'
      + '<div style="font-weight:800;font-size:16px;color:var(--txt);margin-top:8px">'
      + 'Shartnoma summasi to\u2018lib bo\u2018lgan</div></div>'
      + '<div style="padding:12px 14px;background:var(--sfc2);border-radius:14px;font-size:12.5px;line-height:1.9">'
      + '<div style="display:flex"><span style="flex:1;color:var(--mut)">Shartnoma</span><b>' + money(info.contract) + '</b></div>'
      + '<div style="display:flex"><span style="flex:1;color:var(--mut)">Allaqachon kelgan</span><b>' + money(info.already) + '</b></div>'
      + '<div style="display:flex"><span style="flex:1;color:var(--mut)">Siz kiritayotgan</span><b>' + money(info.amount) + '</b></div>'
      + '<div style="display:flex;border-top:1px solid var(--brd);margin-top:6px;padding-top:6px">'
      + '<span style="flex:1;color:var(--mut)">Shartnomadan ortiq</span>'
      + '<b style="color:var(--cyan,#22d3ee)">' + money(info.extra) + '</b></div>'
      + '</div>'
      + '<div style="margin-top:12px;font-size:12.5px;color:var(--mut);line-height:1.7">'
      + 'Bu pul <b style="color:var(--txt)">qo\u2018shimcha ish</b> uchunmi, yoki '
      + '<b style="color:var(--txt)">shartnoma summasi noto\u2018g\u2018ri</b> yozilganmi?</div>'
      + '<div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">'
      + '<button class="rc-btn" id="rc-oc-extra" style="width:100%">'
      + '\u2795 Qo\u2018shimcha ish \u2014 daromadga qo\u2018sh</button>'
      + '<button class="rc-btn-ghost" id="rc-oc-raise" style="width:100%">'
      + '\uD83D\uDCC4 Shartnoma summasini o\u2018zgartiraman</button>'
      + '</div>'
      + '<div style="margin-top:10px;font-size:11px;color:var(--mut);line-height:1.6">'
      + '\u2139\ufe0f Qo\u2018shimcha daromad <b style="color:var(--txt)">foydaga qo\u2018shilmaydi</b> '
      + '(foyda faqat shartnomadan hisoblanadi), lekin yo\u2018qolmaydi ham \u2014 '
      + 'Moliyada alohida satrda turadi.</div>';
    RcSheet.open('Shartnomadan ortiq pul', h, {});
    setTimeout(function () {
      var be = document.getElementById('rc-oc-extra');
      if (be) be.onclick = function () { RcSheet.close(); resend(true); };
      var br = document.getElementById('rc-oc-raise');
      if (br) br.onclick = function () {
        RcSheet.close();
        setTimeout(function () { RcOrderDetail.setZaklad(); }, 80);
      };
    }, 0);
  },

  _needContract: function (pendingAmount, mode) {
    if (!window.RcSheet || !RcSheet.open) { Toast.error('Avval shartnoma summasini kiriting'); return; }
    var h = ''
      + '<div style="text-align:center;margin-bottom:14px"><div style="font-size:40px">📄</div>'
      + '<div style="font-weight:800;font-size:16px;color:var(--txt);margin-top:8px">Iltimos, shartnoma summasini kiriting</div>'
      + '<div style="font-size:13px;color:var(--mut);margin-top:4px">'
      + (mode === 'taqsimlash' ? 'Shartnomasiz foydani taqsimlab bo‘lmaydi'
         : mode === 'yechish' ? 'Shartnomasiz pul yechib bo‘lmaydi'
         : 'Shartnomasiz pul moliyaga qo\'shilmaydi') + '</div></div>'
      + '<div style="padding:12px 14px;background:var(--sfc2);border-radius:14px;font-size:13px;line-height:1.7;color:var(--txt)">'
      + '<b>Shartnoma summasi</b> — mijoz bilan kelishilgan umumiy narx.<br><br>'
      + 'Foyda shundan hisoblanadi: <b>shartnoma − xarajat = foyda</b>. '
      + 'Shuning uchun avval kelishilgan summani yozing, keyin kelgan pullarni qo\'shasiz.'
      + '</div>'
      + '<button class="rc-btn" id="rc-nc-go" style="width:100%;margin-top:16px">'
      + '📄 Shartnoma summasini kiritish</button>';
    RcSheet.open('Shartnoma kerak', h, {});
    setTimeout(function () {
      var b = document.getElementById('rc-nc-go');
      if (b) b.onclick = function () {
        RcSheet.close();
        // Shartnoma oynasi ochiladi; saqlangach foydalanuvchi kirimni qayta kiritadi.
        setTimeout(function () { RcOrderDetail.setZaklad(); }, 80);
      };
    }, 0);
  },

  // ══════════════════════════════════════════════════════════════════════
  //  H6 (2026-08-04): FOYDA YECHISHNI BEKOR QILISH
  //  Yozuv O'CHIRILMAYDI — teskari moliyaviy yozuv yaratiladi (append-only).
  //  Egaga pul qaytadi, a'zoning kirimidan olib tashlanadi, unga Telegram
  //  xabar boradi. Sabab MAJBURIY — audit uchun.
  // ══════════════════════════════════════════════════════════════════════
  reverseWithdraw: function (wid) {
    if (!window.RcSheet || !RcSheet.open) { Toast.info('Tez orada'); return; }
    var h = ''
      + '<div style="text-align:center;margin-bottom:14px"><div style="font-size:38px">↩️</div>'
      + '<div style="font-weight:800;font-size:16px;color:var(--txt);margin-top:6px">Pul yechishni bekor qilish</div></div>'
      + '<div style="font-size:13px;color:var(--txt);line-height:1.7;margin-bottom:12px">'
      + 'Yechilgan pul <b>sizning kassangizga qaytadi</b>. Ulush olgan odamning '
      + 'kirimidan esa <b>olib tashlanadi</b> va unga xabar boradi.<br><br>'
      + '<span style="color:var(--mut);font-size:12px">Eski yozuv o‘chirilmaydi — '
      + 'tarixda «bekor qilingan» bo‘lib qoladi.</span></div>'
      + '<div style="font-size:12px;color:var(--mut);font-weight:600;margin-bottom:6px">Sabab *</div>'
      + '<textarea id="rc-rev-note" class="rc-input" rows="3" placeholder="Masalan: foiz xato yozilgan"></textarea>'
      + '<button class="rc-btn" id="rc-rev-ok" style="width:100%;margin-top:14px;background:var(--danger);color:#fff">'
      + '↩️ Bekor qilish</button>';
    RcSheet.open('Bekor qilish', h, {});
    setTimeout(function () {
      var btn = document.getElementById('rc-rev-ok');
      if (!btn) return;
      btn.onclick = function () {
        if (btn.dataset.busy === '1') return;          // takror bosishga to'siq
        var note = (document.getElementById('rc-rev-note') || {}).value || '';
        if (note.trim().length < 3) return Toast.error('Sababini yozing');
        btn.dataset.busy = '1'; btn.disabled = true;
        var _t = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Bajarilmoqda…';
        WS.send('profit.withdraw.reverse', { withdrawal_id: wid, note: note.trim() }, function (msg) {
          if (!msg.ok) {
            btn.dataset.busy = ''; btn.disabled = false; btn.innerHTML = _t;
            return Toast.error(msg.error || 'Xatolik');
          }
          RcSheet.close();
          Toast.success('Bekor qilindi — pul kassaga qaytdi');
          RcOrderDetail.reload();
        }, 30000);
      };
    }, 0);
  },

  // F5 (2026-08-03): "Men (buyurtma egasi)" — statik, o'chirib bo'lmaydigan
  // qator. Ilgari faqat jamoa a'zolari qatori bor edi (Oybek aka/Ganisher/
  // Rustam aka) — agar ular 100%ni to'liq olsa, EGAGA hech narsa qolmasdi
  // (ko'zdan qochirilgan xato). Default 0% — egasi o'zi kiritadi.
  _OWNER_LABEL: '🧑‍💼 Men (buyurtma egasi)',
  _profitEdit: function (keep) {
    var d = RcOrderDetail._data;
    var profit = (d.profit !== undefined && d.profit !== null)
      ? (parseInt(d.profit) || 0)
      : ((parseInt(d.total_income) || 0) - (parseInt(d.total_expense) || 0));
    var shares = (d.profit_shares || []).slice();
    /* 2026-08-04: QATTIQ YOZILGAN ISMLAR OLIB TASHLANDI.
       Ilgari har bir foydalanuvchiga — hatto ularni tanimasa ham —
       'Oybek aka / Ganisher / Rustam aka' chiqardi (bir akkauntning
       ustalari butun tizimga qattiq yozib qo'yilgan edi).
       Endi bo'sh boshlanadi: egasi «Kontakt qo'shish» orqali o'z jamoa
       a'zolarini tanlaydi (TZ-Kontakt-Asosli-Foyda-Taqsimoti.md). */
    var ownerLabel = RcOrderDetail._OWNER_LABEL;
    var ownerRow = shares.find(function (s) { return s.name === ownerLabel; });
    var rest = shares.filter(function (s) { return s.name !== ownerLabel; });
    // H1 to'liq (2026-08-04): har qator KONTAKTGA bog'lanadi (`user_id`).
    // Eski, bog'lanmagan yozuvlar `user_id=null` bilan qoladi va ⚠️ bilan
    // ko'rsatiladi — avtomatik bog'lanmaydi (bu aynan tuzatilayotgan xavf).
    // `keep` — kontakt tanlash oynasidan qaytganda mavjud qatorlar va
    // kiritilgan foizlar SAQLANADI (aks holda foydalanuvchi qaytadan yozardi).
    if (!keep) {
      RcOrderDetail._ps = [{ name: ownerLabel, percent: ownerRow ? (parseFloat(ownerRow.percent) || 0) : 0, owner: true }]
        .concat(rest.map(function (s) {
          return { name: s.name || '', percent: parseFloat(s.percent) || 0,
                   user_id: s.user_id || null, label: s.label || s.name || '',
                   linked: !!s.is_linked };
        }));
    }
    RcOrderDetail._psProfit = profit;
    var _force = !!RcOrderDetail._psForce;
    var body = '<div style="display:flex;flex-direction:column;gap:10px;padding-top:2px">' +
      (_force
        ? '<div style="font-size:11.5px;color:var(--mut);line-height:1.55;background:var(--sfc2);'
          + 'padding:10px 12px;border-radius:12px;border-left:3px solid var(--acc)">'
          + 'Buyurtma yaratildi. Endi <b>foyda ulushini</b> belgilang — rasxod ham, foyda ham '
          + 'shu foizga qarab bo‘linadi. Yolg‘iz ishlasangiz <b>Men 100%</b> holicha qoldiring.</div>'
        : '') +
      '<div style="font-size:13px;font-weight:800;color:var(--acc-text)">Foyda: ' + Utils.money(Math.abs(profit)) + '</div>' +
      '<div id="rc-ps-rows"></div>' +
      '<button class="rc-btn-ghost rc-btn-sm" id="rc-ps-add" style="align-self:flex-start"><i class="fas fa-plus"></i> Kontakt qo\'shish</button>' +
      '<div id="rc-ps-sum" style="font-size:11px"></div>' +
      '<button class="rc-btn" id="rc-ps-save" style="width:100%;margin-top:4px"><i class="fas fa-check"></i> Saqlash</button></div>';
    RcSheet.open('Foyda taqsimlash', body, { locked: _force });
    RcOrderDetail._psRender();
    document.getElementById('rc-ps-add').onclick = function () {
      RcOrderDetail._psSync();
      RcOrderDetail._pickContact();          // erkin matn EMAS — ro'yxatdan
    };
    document.getElementById('rc-ps-save').onclick = function () {
      RcOrderDetail._psSync();
      var total = RcOrderDetail._ps.reduce(function (a, x) { return a + (x.percent || 0); }, 0);
      if (Math.abs(total - 100) > 0.5) return Toast.error("Jami 100% bo'lishi kerak (hozir: " + total.toFixed(1) + '%)');
      var _payload = RcOrderDetail._ps.map(function (r) {
        return { name: r.name, percent: r.percent, user_id: r.owner ? null : (r.user_id || null) };
      });
      WS.send('profit.save', { order_id: d.id, shares: _payload }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close();
        // F9 (2026-08-03): avval pul yechilgan bo'lsa — eski yozuvlar
        // o'zgarmasligini ogohlantiramiz (aks holda "nega eski summa
        // o'zgarmadi" degan tushunmovchilik chiqadi).
        // 2026-08-04: ogohlantirish `data` ichida keladi (top-level EMAS) —
        // `_reply()` faqat ok/data/error kwarg qabul qiladi, `warning` ni
        // to'g'ridan-to'g'ri qaytarish butun so'rovni TypeError bilan yiqitardi.
        var _w = msg.data && msg.data.warning;
        if (_w) Toast.info(_w); else Toast.success('Foyda taqsimoti saqlandi');
        // Majburiy rejim tugadi — bayroq olib tashlanadi (aks holda sahifa
        // har ochilganda oyna qayta chiqaverardi).
        RcOrderDetail._psForce = false;
        try { sessionStorage.removeItem('rc_force_profit'); } catch (e) {}
        RcOrderDetail.reload();
      });
    };
  },
  _psSync: function () {
    document.querySelectorAll('.rc-ps-pct').forEach(function (el) { RcOrderDetail._ps[parseInt(el.dataset.i)].percent = parseFloat(el.value) || 0; });
  },
  _psDel: function (i) {
    // F5: 0-index — "Men (buyurtma egasi)" statik qator, o'chirib bo'lmaydi.
    if (i === 0 || RcOrderDetail._ps.length <= 1) return;
    RcOrderDetail._psSync();
    RcOrderDetail._ps.splice(i, 1);
    RcOrderDetail._psRender();
  },
  _psRender: function () {
    var box = document.getElementById('rc-ps-rows'); if (!box) return;
    var profit = RcOrderDetail._psProfit, esc = Utils.esc, h = '';
    RcOrderDetail._ps.forEach(function (s, i) {
      var amt = Math.round(profit * (s.percent || 0) / 100);
      var isOwner = (i === 0 && s.name === RcOrderDetail._OWNER_LABEL);
      h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">';
      if (isOwner) {
        h += '<div class="rc-input" style="flex:2;padding:8px;font-weight:700;color:var(--acc-text);background:var(--bg-2,transparent)">' + esc(s.name) + '</div>';
      } else {
        // H1: ism TAHRIRLANMAYDI — kontakt ro'yxatdan tanlangan.
        // Eski (bog'lanmagan) yozuv ⚠️ bilan ajratiladi.
        var _lbl = s.label || s.name || '';
        var _warn = s.linked ? '' : ' <span title="Eski yozuv — akkauntga bog\'lanmagan">⚠️</span>';
        h += '<div class="rc-input" style="flex:2;padding:8px;font-size:12.5px;'
          + (s.linked ? '' : 'color:var(--mut);') + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          + (s.linked ? '👤 ' : '') + esc(_lbl) + _warn + '</div>';
      }
      h += '<input class="rc-input rc-ps-pct" data-i="' + i + '" type="number" value="' + s.percent + '" style="width:64px;padding:8px;text-align:center">';
      h += '<span class="rc-ps-amt" style="font-size:12px;font-weight:700;min-width:74px;text-align:right">' + Utils.money(Math.abs(amt)) + '</span>';
      h += isOwner
        ? '<span style="width:29px"></span>'
        : '<button class="rc-btn-ghost rc-btn-sm" style="color:var(--danger);padding:4px 7px" onclick="RcOrderDetail._psDel(' + i + ')">✕</button>';
      h += '</div>';
    });
    box.innerHTML = h;
    RcOrderDetail._psSums();
    document.querySelectorAll('.rc-ps-pct').forEach(function (el) { el.oninput = function () { RcOrderDetail._psSums(); }; });
  },
  // ══════════════════════════════════════════════════════════════════════
  //  H1 to'liq (2026-08-04): KONTAKT TANLASH
  //  Foyda faqat ro'yxatdan o'tgan foydalanuvchilar orasida taqsimlanadi.
  //  Erkin ism yozish OLIB TASHLANDI — sabab: bir xil ismli akkauntlar
  //  (bazada `dilshod` ×2) va imlo xatolari (26%) tufayli pul noto'g'ri
  //  odamga ketishi mumkin edi. TZ-Kontakt-Asosli-Foyda-Taqsimoti.md
  // ══════════════════════════════════════════════════════════════════════
  // `mode`: undefined → «Foyda taqsimlash» (_ps), 'wd' → «Pul yechish» (_wdRows)
  _pickContact: function (mode) {
    var d = RcOrderDetail._data || {};
    var all = d.contacts || [];
    var isWd = (mode === 'wd');
    var rows = isWd ? (RcOrderDetail._wdRows || []) : (RcOrderDetail._ps || []);
    // Allaqachon qo'shilganlarni ro'yxatdan chiqaramiz
    var used = {};
    rows.forEach(function (r) { if (r.user_id) used[r.user_id] = 1; });
    var free = all.filter(function (c) { return !used[c.id]; });

    var esc = Utils.esc, h = '';
    if (!all.length) {
      // Kontakt umuman yo'q — tushuntirish + jamoaga yo'naltirish
      h += '<div style="text-align:center;margin-bottom:14px"><div style="font-size:38px">👥</div>'
        + '<div style="font-weight:800;font-size:16px;color:var(--txt);margin-top:8px">Hali kontakt yo‘q</div></div>'
        + '<div style="font-size:13px;line-height:1.7;color:var(--txt);padding:12px 14px;background:var(--sfc2);border-radius:14px">'
        + 'Foydani bo‘lishish uchun avval jamoangizga odam qo‘shing. '
        + 'Ular <b>Bittada‘da ro‘yxatdan o‘tgan</b> bo‘lishi kerak — shunda pul '
        + 'to‘g‘ri odamga tushadi va u o‘z telefonida ko‘rib turadi.<br><br>'
        + '<span style="color:var(--mut);font-size:12px">Hozircha 100% ni o‘zingizga '
        + '(«Men») yozib qo‘yishingiz mumkin.</span></div>'
        + '<button class="rc-btn" id="rc-pc-team" style="width:100%;margin-top:16px">'
        + '👥 Jamoaga a‘zo qo‘shish</button>';
    } else if (!free.length) {
      h += '<div style="text-align:center;padding:18px 8px">'
        + '<div style="font-size:34px">✅</div>'
        + '<div style="font-size:13.5px;color:var(--txt);margin-top:8px">Barcha kontaktlar allaqachon qo‘shilgan</div></div>';
    } else {
      h += '<div style="font-size:12.5px;color:var(--mut);margin-bottom:10px">'
        + 'Foyda faqat ro‘yxatdan o‘tgan kontaktlarga bo‘linadi</div>';
      // QIDIRUV — HAR DOIM ko'rinadi (2026-08-04).
      // Ikki bosqichli: avval jamoa ro'yxatidan filtrlaydi, keyin
      // serverdan BUTUN Bittada bo'yicha qidiradi (jamoaga hali
      // qo'shilmagan, lekin ro'yxatdan o'tgan ustani ham topish uchun).
      h += '<div class="rc-search" style="margin-bottom:10px">'
        + '<i class="fas fa-search" style="color:var(--mut);font-size:13px"></i>'
        + '<input id="rc-pc-q" type="text" placeholder="Ism yoki telefon raqami..." '
        + 'autocomplete="off"></div>';
      h += '<div id="rc-pc-hint" style="font-size:11px;color:var(--mut);margin-bottom:8px;'
        + 'display:none"></div>';
      h += '<div id="rc-pc-list" style="display:flex;flex-direction:column;gap:8px">';
      free.forEach(function (c) {
        var _hay = ((c.name || '') + ' ' + (c.username || '') + ' ' + (c.phone || '')).toLowerCase();
        h += '<button class="rc-pc-item" data-id="' + c.id + '" data-name="' + esc(c.name) + '" '
          + 'data-label="' + esc(c.label) + '" data-search="' + esc(_hay) + '" '
          + 'style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;'
          + 'padding:11px 13px;border:1.5px solid var(--brd);border-radius:14px;'
          + 'background:var(--sfc2);color:var(--txt);cursor:pointer;font-family:inherit">'
          + '<span style="font-size:17px;flex:none">👤</span>'
          + '<span style="flex:1;min-width:0">'
          + '<span style="display:block;font-size:13.5px;font-weight:600;overflow:hidden;'
          + 'text-overflow:ellipsis;white-space:nowrap">' + esc(c.label) + '</span>'
          // ⚠️ Bazada bir xil ism VA bir xil oxirgi-4 raqamli akkauntlar bor
          // (dilshod_cl / dilshod_cl2). @username ajratib turadi — noto'g'ri
          // odamga pul ketmasin (2026-08-04).
          + (c.username ? '<span style="display:block;font-size:10.5px;color:var(--mut);'
              + 'margin-top:1px">@' + esc(c.username) + '</span>' : '')
          + '</span>'
          + '<i class="fas fa-plus" style="color:var(--mut);font-size:12px;flex:none"></i></button>';
      });
      h += '</div>';
    }

    RcSheet.open('Kontakt tanlash', h, {});
    setTimeout(function () {
      // Qidiruv — ism, username yoki telefon raqami bo'yicha (bo'shliqsiz ham)
      var q = document.getElementById('rc-pc-q');
      var hint = document.getElementById('rc-pc-hint');
      var srvTimer = null;
      function _bindItems() {
        document.querySelectorAll('.rc-pc-item').forEach(function (b) {
          b.onclick = function () { RcOrderDetail._pcPick(b, isWd); };
        });
      }
      function _itemHtml(c) {
        return '<button class="rc-pc-item" data-id="' + c.id + '" data-name="' + esc(c.name) + '" '
          + 'data-label="' + esc(c.label) + '" '
          + 'style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;'
          + 'padding:11px 13px;border:1.5px solid var(--brd);border-radius:14px;'
          + 'background:var(--sfc2);color:var(--txt);cursor:pointer;font-family:inherit">'
          + '<span style="font-size:17px;flex:none">👤</span>'
          + '<span style="flex:1;min-width:0">'
          + '<span style="display:block;font-size:13.5px;font-weight:600;overflow:hidden;'
          + 'text-overflow:ellipsis;white-space:nowrap">' + esc(c.label) + '</span>'
          // ⚠️ Bazada bir xil ism VA bir xil oxirgi-4 raqamli akkauntlar bor
          // (dilshod_cl / dilshod_cl2). @username ajratib turadi — noto'g'ri
          // odamga pul ketmasin (2026-08-04).
          + (c.username ? '<span style="display:block;font-size:10.5px;color:var(--mut);'
              + 'margin-top:1px">@' + esc(c.username) + '</span>' : '')
          + '</span>'
          + '<i class="fas fa-plus" style="color:var(--mut);font-size:12px;flex:none"></i></button>';
      }
      if (q) {
        q.oninput = function () {
          var raw = (q.value || '').trim();
          var v = raw.toLowerCase().replace(/\s+/g, '');
          // 1-bosqich: jamoa ro'yxatidan darhol filtrlash
          var shown = 0;
          document.querySelectorAll('.rc-pc-item').forEach(function (b) {
            var hay = (b.dataset.search || '').replace(/\s+/g, '');
            if (!b.dataset.search) return;          // serverdan kelgan — tegmaymiz
            var ok = !v || hay.indexOf(v) !== -1;
            b.style.display = ok ? '' : 'none';
            if (ok) shown++;
          });
          // 2-bosqich: serverdan BUTUN Bittada bo'yicha qidirish
          clearTimeout(srvTimer);
          if (raw.length < 2) {
            if (hint) hint.style.display = 'none';
            document.querySelectorAll('.rc-pc-srv').forEach(function (x) { x.remove(); });
            return;
          }
          srvTimer = setTimeout(function () {
            WS.send('contacts.search', { q: raw }, function (m) {
              document.querySelectorAll('.rc-pc-srv').forEach(function (x) { x.remove(); });
              var items = (m && m.ok && m.data && m.data.items) || [];
              // Ro'yxatda allaqachon borlarini chiqarib tashlaymiz
              var have = {};
              document.querySelectorAll('.rc-pc-item').forEach(function (b) {
                if (b.dataset.search) have[b.dataset.id] = 1;
              });
              rows.forEach(function (r) { if (r.user_id) have[r.user_id] = 1; });
              var fresh = items.filter(function (c) { return !have[c.id]; });
              var lst = document.getElementById('rc-pc-list');
              if (!lst) return;
              fresh.forEach(function (c) {
                var d = document.createElement('div');
                d.className = 'rc-pc-srv';
                d.innerHTML = _itemHtml(c);
                lst.appendChild(d);
              });
              _bindItems();
              if (hint) {
                if (fresh.length) {
                  hint.textContent = 'Bittada bo‘yicha topildi: ' + fresh.length + ' ta';
                  hint.style.display = '';
                } else if (!shown) {
                  hint.textContent = 'Topilmadi — bu odam Bittada‘da ro‘yxatdan o‘tmagan bo‘lishi mumkin';
                  hint.style.display = '';
                } else { hint.style.display = 'none'; }
              }
            });
          }, 300);
        };
        q.focus();
      }
      _bindItems();
      var tb = document.getElementById('rc-pc-team');
      if (tb) tb.onclick = function () { RcSheet.close(); Router.go('/team'); };
    }, 0);
  },

  // Kontakt tanlandi — mos ro'yxatga qo'shib, oynani qayta ochamiz
  _pcPick: function (b, isWd) {
    var row = { name: b.dataset.name, label: b.dataset.label,
                user_id: parseInt(b.dataset.id), percent: 0,
                linked: true, on: true };
    if (isWd) {
      RcOrderDetail._wdRows.push(row);
      RcSheet.close();
      setTimeout(function () { RcOrderDetail.withdrawProfit(true); }, 60);
    } else {
      RcOrderDetail._ps.push(row);
      RcSheet.close();
      setTimeout(function () { RcOrderDetail._profitEdit(true); }, 60);
    }
  },

  _psSums: function () {
    var profit = RcOrderDetail._psProfit, total = 0;
    document.querySelectorAll('.rc-ps-pct').forEach(function (el) {
      var pct = parseFloat(el.value) || 0; total += pct;
      var amt = Math.round(profit * pct / 100);
      var span = el.parentNode.querySelector('.rc-ps-amt'); if (span) span.textContent = Utils.money(Math.abs(amt));
    });
    var sum = document.getElementById('rc-ps-sum'); var rem = 100 - total;
    if (sum) sum.innerHTML = Math.abs(rem) > 0.01 ? '<span style="color:var(--danger)">Qoldiq: ' + rem.toFixed(1) + '%</span>' : '<span style="color:var(--acc-text)">Jami: 100% ✅</span>';
  },

  // ── E4: «Foyda allaqachon taqsimlangan» oynasi (2026-08-17) ───────────
  _wdHistorySheet: function (hist) {
    var esc = Utils.esc, money = Utils.money;
    var h = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">'
      + '<div style="font-size:11.5px;color:var(--mut);line-height:1.6;background:var(--sfc2);'
      + 'padding:10px 12px;border-radius:12px;border-left:3px solid var(--acc)">'
      + 'Bu buyurtma foydasi <b>allaqachon taqsimlangan</b>. Shuning uchun '
      + 'qoldiq <b>0</b> — qayta bo\'lish kerak emas.</div>';
    hist.forEach(function (w) {
      h += '<div class="rc-card" style="padding:11px 13px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'
        + '<span style="font-size:11.5px;color:var(--mut)">' + Utils.date(w.created_at) + '</span>'
        + '<b style="font-size:14px;color:var(--acc-text)">' + money(w.total_profit) + '</b></div>';
      (w.lines || []).forEach(function (l) {
        h += '<div style="display:flex;justify-content:space-between;font-size:12.5px;'
          + 'padding:6px 0;border-top:1px solid var(--brd)">'
          + '<span>' + esc(l.name) + (l.percent ? ' · ' + l.percent + '%' : '') + '</span>'
          + '<b>' + money(l.amount) + '</b></div>';
      });
      h += '</div>';
    });
    // Kerak bo'lsa qayta taqsimlash mumkin — lekin bu ATAYLAB ikkinchi
    // darajali tugma (asosiysi — ko'rish).
    h += '<button class="rc-btn-ghost rc-btn-sm" id="rc-wd-again" style="width:100%">'
      + 'Yana bir marta taqsimlash</button>'
      + '<button class="rc-btn-ghost" onclick="RcSheet.close()" style="width:100%">Yopish</button></div>';
    RcSheet.open('Foyda taqsimlangan', h, {});
    var ag = document.getElementById('rc-wd-again');
    if (ag) ag.onclick = function () {
      if (!confirm('Foyda allaqachon taqsimlangan. Yana bir marta taqsimlaysizmi?')) return;
      RcOrderDetail._wdForce = true;
      RcOrderDetail.withdrawProfit();
    };
  },

  // ── Foyda yechish — TO'LIQ DINAMIK (TZ-Ustalar-Dinamik.md §2.4) ──
  //    Ism va foiz TAHRIRLANADI · qator qo'shish/o'chirish · foiz QO'LDA.
  //    Foiz avtomatik to'ldirilmaydi — ustalar o'zlari kelishib yozadi.
  withdrawProfit: function (keep) {
    var d = RcOrderDetail._data;
    // 2026-08-04: shartnomasiz PUL YECHISH ham yo'q (yuqoridagi sabab).
    if (RcOrderDetail._noContract()) return RcOrderDetail._needContract(0, 'yechish');
    var profit = (d.profit !== undefined && d.profit !== null)
      ? (parseInt(d.profit) || 0)
      : ((parseInt(d.total_income) || 0) - (parseInt(d.total_expense) || 0));
    // ── E4 (2026-08-17): ALLAQACHON TAQSIMLANGAN bo'lsa — TARIX ──────────
    // Ilgari qayta bosilganda quruq «Foyda yo'q» chiqardi va usta «nega 0?»
    // deb qolardi. Eski xatti-harakat: qanday bo'lingani KO'RINARDI.
    // Endi kim, qachon, qancha olganini ko'rsatamiz.
    // Foyda ALLAQACHON taqsimlangan bo'lsa — bo'sh forma o'rniga TAQSIMOT
    // ko'rsatiladi (eski xatti-harakat). Ilgari har bosishda foizlar
    // «noldan» so'ralardi va usta ikkinchi marta bo'lib yuborishi mumkin edi.
    var _wh = (d.withdrawal_history || []).filter(function (w) { return !w.reversed; });
    if (_wh.length && !keep && !RcOrderDetail._wdForce) return RcOrderDetail._wdHistorySheet(_wh);
    RcOrderDetail._wdForce = false;
    if (profit <= 0) return Toast.error("Foyda yo'q");

    // Boshlang'ich qatorlar: saqlangan taqsimot bo'lsa o'sha (foizi bilan),
    // aks holda usta ro'yxati — foizlar BO'SH.
    var saved = (d.profit_shares || []).filter(function (s) { return (s.name || '').trim(); });
    RcOrderDetail._wdProfit = profit;
    // H1 (2026-08-04): `user_id` ni ham olib kelamiz — pul AYNAN shu kontakt
    // akkauntiga o'tkaziladi (ism bo'yicha taxmin qilinmaydi).
    // `keep` — kontakt tanlash oynasidan qaytganda mavjud qatorlar saqlanadi
    if (!keep) {
      // ── BO'SH OCHILMASIN (2026-08-18) ───────────────────────────────
      // Bu zakazda taqsimot bo'lmasa — OXIRGI marta qanday bo'lingan
      // bo'lsa, o'sha oldindan qo'yiladi (ism + foiz + akkaunt).
      // Ilgari bo'sh ro'yxat ochilib, usta har safar hammasini qaytadan
      // yozishi kerak edi (foydalanuvchi shikoyati).
      var src = saved.length ? saved : (d.last_profit_shares || []);
      RcOrderDetail._wdRows = src.map(function (s) {
        return { name: s.name, percent: parseFloat(s.percent) || 0, on: true,
                 user_id: s.user_id || null, label: s.label || s.name };
      });
      RcOrderDetail._wdPrefilled = !saved.length && src.length > 0;
    }

    var body = '<div style="display:flex;flex-direction:column;gap:10px;padding-top:2px">'
      + '<div style="font-size:14px;font-weight:800">Umumiy foyda: <span style="color:var(--acc-text)">' + Utils.money(profit) + '</span></div>'
      + '<div id="rc-wd-rows"></div>'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
      + '<button type="button" id="rc-wd-add" class="rc-btn-ghost rc-btn-sm"><i class="fas fa-plus"></i> Kontakt</button>'
      + '<div id="rc-wd-sum" style="font-size:12px;font-weight:700"></div></div>'
      + '<div style="font-size:10px;color:var(--mut)">'
      + (RcOrderDetail._wdPrefilled
          ? '↩️ Oxirgi taqsimot bo\'yicha to\'ldirildi — o\'zgartirishingiz mumkin'
          : 'Foizlarni o\'zingiz yozasiz — jami 100% bo\'lsin') + '</div>'
      + '<button class="rc-btn" id="rc-wd-ok" style="width:100%;margin-top:2px"><i class="fas fa-check"></i> Tasdiqlash va yechish</button></div>';
    RcSheet.open('Foyda yechish', body, {});
    RcOrderDetail._wdRender();

    // 2026-08-04: `profit.people.list` (qo'lda yozilgan ustalar) OLIB
    // TASHLANDI — pul faqat ro'yxatdan o'tgan KONTAKTGA o'tkaziladi,
    // shuning uchun qatorlar «Foyda taqsimlash»dagi bog'langan
    // kontaktlardan keladi, «+ Kontakt» esa ro'yxatdan tanlatadi.

    document.getElementById('rc-wd-add').onclick = function () {
      RcOrderDetail._wdSync();
      RcOrderDetail._pickContact('wd');     // erkin matn EMAS — ro'yxatdan
    };
    document.getElementById('rc-wd-ok').onclick = function () {
      var okBtn = this;
      // H3 (2026-08-03): TAKROR YUBORISHNI TO'SISH.
      // Ilgari tugma bloklanmasdi — tez ikki marta bosilsa yoki WS 15s
      // timeout'dan keyin qayta bosilsa, IKKI marta pul yechilardi (real
      // moliyaviy yozuv, qaytarib bo'lmaydi). Backendda ham 60 soniyalik
      // to'siq bor (consumers.py:handle_profit_withdraw) — bu ikki qavatli.
      if (okBtn.dataset.busy === '1') return;

      RcOrderDetail._wdSync();
      var lines = RcOrderDetail._wdRows
        .filter(function (r) { return r.on && (r.name || '').trim() && r.percent > 0; })
        .map(function (r) {
          return { name: r.name.trim(), percent: r.percent,
                   user_id: r.user_id || null,
                   amount: Math.round(profit * r.percent / 100) };
        });
      if (!lines.length) return Toast.error('Kontakt qo\'shing va foiz kiriting');
      // Bog'lanmagan (eski) qator bo'lsa — pul o'tmasligini ochiq aytamiz
      var _unl = lines.filter(function (x) { return !x.user_id; });
      if (_unl.length) {
        Toast.info('⚠️ ' + _unl.length + ' ta qator akkauntga bog‘lanmagan — '
          + 'ularga pul avtomatik o‘tmaydi (faqat sizning kassangizdan chiqim yoziladi)');
      }
      var tot = lines.reduce(function (a, x) { return a + x.percent; }, 0);
      if (Math.abs(tot - 100) > 0.5)
        return Toast.error("Jami 100% bo'lishi kerak (hozir: " + tot.toFixed(1) + '%)');

      // H3 (2026-08-04): IDEMPOTENTLIK — bitta bosish = bitta UUID.
      // Qayta urinishda (timeout/reconnect) AYNAN shu ID takrorlanadi, server
      // esa `unique` cheklov bilan ikkinchi yozuvni yaratmaydi.
      if (!okBtn.dataset.crid) {
        // Zaxira ham HAQIQIY UUID v4 bo'lishi SHART — server `UUIDField`
        // kutadi, boshqa format `ValidationError` bilan butun pul yechishni
        // yiqitadi (2026-08-04 testda aniqlandi).
        okBtn.dataset.crid = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
              var r = Math.random() * 16 | 0;
              return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
            });
      }
      okBtn.dataset.busy = '1';
      okBtn.disabled = true;
      var _txt = okBtn.innerHTML;
      okBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Yechilmoqda…';
      function _unlock() {
        okBtn.dataset.busy = '';
        okBtn.disabled = false;
        okBtn.innerHTML = _txt;
      }

      WS.send('profit.withdraw', {
        order_id: d.id, lines: lines, total_profit: profit,
        client_request_id: okBtn.dataset.crid,
      }, function (msg) {
        if (!msg.ok) { _unlock(); return Toast.error(msg.error || 'Xatolik'); }
        RcSheet.close(); Toast.success('Foyda yechildi! ' + lines.length + ' ta yozuv');
        RcOrderDetail.reload();
      }, 30000);   // 15s → 30s: Telegram sekin bo'lsa ham timeout chiqmasin
    };
  },
  _wdSync: function () {
    var box = document.getElementById('rc-wd-rows'); if (!box) return;
    box.querySelectorAll('.rc-wd-pct').forEach(function (el) {
      RcOrderDetail._wdRows[parseInt(el.dataset.i)].percent = parseFloat(el.value) || 0;
    });
    box.querySelectorAll('.rc-wd-chk').forEach(function (el) {
      RcOrderDetail._wdRows[parseInt(el.dataset.i)].on = el.checked;
    });
  },
  _wdRender: function () {
    var box = document.getElementById('rc-wd-rows'); if (!box) return;
    var esc = Utils.esc, profit = RcOrderDetail._wdProfit || 0, h = '';
    // Bo'sh holat — foydalanuvchi nima qilishini bilsin
    if (!RcOrderDetail._wdRows.length) {
      box.innerHTML = '<div style="text-align:center;padding:16px 10px;color:var(--mut);'
        + 'font-size:12.5px;line-height:1.6;background:var(--sfc2);border-radius:14px">'
        + '👥 Hali kontakt qo‘shilmagan<br>'
        + '<span style="font-size:11.5px">Pastdagi «+ Kontakt» tugmasidan tanlang — '
        + 'pul faqat ro‘yxatdan o‘tgan kontaktga o‘tkaziladi</span></div>';
      // To'g'ri nom `_wdTotal` — `_wdSums` hech qachon mavjud bo'lmagan.
      // Bu yo'l faqat TAQSIMOT YO'Q buyurtmada ochiladi, shuning uchun
      // ilgari (tugma faqat taqsimot bor bo'lsa ko'ringanda) yuzaga
      // chiqmagan; tugma doim ko'rinadigan bo'lgach oyna yiqilardi
      // ("Foyda yechish ishlamayapti", 2026-08-15).
      RcOrderDetail._wdTotal();
      return;
    }
    RcOrderDetail._wdRows.forEach(function (r, i) {
      var amt = Math.round(profit * (parseFloat(r.percent) || 0) / 100);
      h += '<div style="display:flex;align-items:center;gap:6px;padding:8px;margin-bottom:6px;'
         + 'background:var(--sfc2);border-radius:var(--radius-sm)">'
         + '<input type="checkbox" class="rc-wd-chk" data-i="' + i + '"' + (r.on ? ' checked' : '') + '>'
         + (function () {
             // H1 (2026-08-04): ism ENDI YOZILMAYDI — kontakt ro'yxatdan
             // tanlanadi. Ilgari erkin matn edi: qo'lda yozilgan ism hech
             // qanday akkauntga bog'lanmasdi va pul JIM o'tmay qolardi.
             var lbl = r.label || r.name || '';
             var linked = !!r.user_id;
             return '<div class="rc-input" style="flex:1;min-width:0;padding:7px;font-size:12.5px;'
               + (linked ? '' : 'color:var(--mut);')
               + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
               + (linked ? '👤 ' : '') + esc(lbl)
               + (linked ? '' : ' <span title="Akkauntga bog\'lanmagan — pul o‘tmaydi">⚠️</span>')
               + '</div>';
           })()
         + '<input type="number" class="rc-input rc-wd-pct" data-i="' + i + '" value="' + (r.percent || '') + '" min="0" max="100" placeholder="%" style="width:58px;padding:7px;text-align:center">'
         + '<span style="font-size:11px;color:var(--mut)">%</span>'
         + '<span class="rc-wd-amt" data-i="' + i + '" style="font-size:12px;font-weight:800;color:var(--acc-text);min-width:74px;text-align:right">' + Utils.money(amt) + '</span>'
         + '<button type="button" class="rc-wd-del" data-i="' + i + '" style="border:none;background:none;color:var(--danger);cursor:pointer;font-size:15px;line-height:1">✕</button>'
         + '</div>';
    });
    box.innerHTML = h;
    box.querySelectorAll('.rc-wd-pct').forEach(function (el) {
      el.oninput = function () {
        var i = parseInt(el.dataset.i);
        RcOrderDetail._wdRows[i].percent = parseFloat(el.value) || 0;
        var amtEl = box.querySelector('.rc-wd-amt[data-i="' + i + '"]');
        if (amtEl) amtEl.textContent = Utils.money(
          Math.round((RcOrderDetail._wdProfit || 0) * RcOrderDetail._wdRows[i].percent / 100));
        RcOrderDetail._wdTotal();
      };
    });
    box.querySelectorAll('.rc-wd-chk').forEach(function (el) {
      el.onchange = function () {
        RcOrderDetail._wdRows[parseInt(el.dataset.i)].on = el.checked;
        RcOrderDetail._wdTotal();
      };
    });
    box.querySelectorAll('.rc-wd-del').forEach(function (el) {
      el.onclick = function () {
        RcOrderDetail._wdSync();
        RcOrderDetail._wdRows.splice(parseInt(el.dataset.i), 1);
        if (!RcOrderDetail._wdRows.length) RcOrderDetail._wdRows.push({ name: '', percent: 0, on: true });
        RcOrderDetail._wdRender();
      };
    });
    RcOrderDetail._wdTotal();
  },
  _wdTotal: function () {
    var el = document.getElementById('rc-wd-sum'); if (!el) return;
    var sum = RcOrderDetail._wdRows.reduce(function (a, r) {
      return a + (r.on ? (parseFloat(r.percent) || 0) : 0); }, 0);
    var ok = Math.abs(sum - 100) < 0.5;
    el.innerHTML = 'Jami: <span style="color:' + (ok ? 'var(--acc-text)' : 'var(--danger)') + '">'
                 + sum + '%</span> ' + (ok ? '✅' : (sum > 100 ? '⚠️ oshdi' : '(100% bo\'lsin)'));
  },

  // ═══════════ F3: FAYLLAR + SHARTNOMA ═══════════
  // Faylni ko'rish — to'liq galereya (viewer + editor/o'lchov/BLE/saqlash + AI + 360°VR).
  // Yetuk Gallery komponenti (gallery.js) mavjud bo'lsa o'shani ishlatamiz; aks holda
  // ichki oddiy galereyaga (fallback) tushamiz.
  viewFile: function (idx) {
    // 2026-09-04: havola-turi fayllar (external_url) Fayllar tab'ida ALOHIDA
    // ro'yxatda chiqadi (_tabFayl, "Ochish" tugmasi bilan) va o'sha yerda
    // to'g'ridan-to'g'ri window.open bilan ochiladi — bu funksiyaga umuman
    // kirmaydi. Shu sabab bu yerda `mediaFiles`ga mos indeks ishlatiladi
    // (havolalar chiqarib tashlangan — grid'dagi kartochka bilan bir xil tartib).
    var files = ((RcOrderDetail._data && RcOrderDetail._data.files) || []).filter(function (f) { return f.file_type !== 'link'; });
    if (!files.length) return;
    if (window.Gallery && Gallery.open) { Gallery.open(files, idx); return; }
    var clicked = files[idx]; if (!clicked) return;
    var media = [];
    files.forEach(function (f) {
      var nm = f.file_name || '';
      var isVid = /video/i.test(f.file_type || '') || /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(nm);
      var isImg = /image/i.test(f.file_type || '') || /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(nm) || (f.thumbnail_url && !isVid);
      if (isVid) media.push({ type: 'video', f: f });
      else if (isImg) media.push({ type: 'image', f: f });
    });
    if (!media.length) {
      var u = clicked.file_url || clicked.thumbnail_url || '';
      if (u) { if (window.Gallery && Gallery._downloadOrOpen) Gallery._downloadOrOpen(u, clicked.file_name); else window.open(u, '_blank'); }
      return;
    }
    var start = 0;
    for (var i = 0; i < media.length; i++) { if (media[i].f === clicked) { start = i; break; } }
    RcOrderDetail._openGallery(media, start);
  },

  _openGallery: function (media, start) {
    var d = RcOrderDetail._data;
    var canEdit = d.is_owner || d.user_role === 'manager';
    var st = { media: media, i: start, scale: 1, tx: 0, ty: 0, canEdit: canEdit };
    RcOrderDetail._gal = st;
    var bd = document.createElement('div');
    bd.id = 'rc-lightbox';
    bd.style.cssText = 'position:fixed;inset:0;z-index:600;background:#000;display:flex;flex-direction:column;touch-action:none';
    bd.innerHTML =
      '<div style="position:absolute;top:0;left:0;right:0;z-index:5;display:flex;align-items:center;justify-content:space-between;padding:calc(12px + env(safe-area-inset-top)) 16px 12px;background:linear-gradient(rgba(0,0,0,.55),transparent);color:#fff">' +
        '<button onclick="RcOrderDetail._galClose()" style="width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:18px;cursor:pointer">✕</button>' +
        '<div id="rc-gal-count" style="font-size:14px;font-weight:700"></div>' +
        '<a id="rc-gal-dl" href="#" target="_blank" rel="noopener" download style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.15);color:#fff;font-size:17px;display:flex;align-items:center;justify-content:center;text-decoration:none">⭳</a>' +
      '</div>' +
      '<button id="rc-gal-prev" onclick="RcOrderDetail._galGo(-1)" style="position:absolute;top:50%;left:12px;transform:translateY(-50%);z-index:5;width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,.13);color:#fff;font-size:22px;cursor:pointer">‹</button>' +
      '<div id="rc-gal-stage" style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative"></div>' +
      '<button id="rc-gal-next" onclick="RcOrderDetail._galGo(1)" style="position:absolute;top:50%;right:12px;transform:translateY(-50%);z-index:5;width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,.13);color:#fff;font-size:22px;cursor:pointer">›</button>' +
      '<div id="rc-gal-cap" style="position:absolute;bottom:calc(70px + env(safe-area-inset-bottom));left:0;right:0;text-align:center;color:#fff;font-size:13px;z-index:5;padding:0 60px;text-shadow:0 1px 4px rgba(0,0,0,.8);pointer-events:none"></div>' +
      '<div id="rc-gal-actions" style="position:absolute;bottom:calc(18px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);display:flex;gap:10px;z-index:6"></div>';
    bd.onclick = function (e) { if (e.target === bd) RcOrderDetail._galClose(); };
    document.body.appendChild(bd);
    RcOrderDetail._galBindTouch(bd);
    document.addEventListener('keydown', RcOrderDetail._galKey);
    RcOrderDetail._galRender();
  },
  _galClose: function () {
    var l = document.getElementById('rc-lightbox'); if (l) l.remove();
    document.removeEventListener('keydown', RcOrderDetail._galKey);
    if (RcOrderDetail._gal && RcOrderDetail._gal._cleanup) RcOrderDetail._gal._cleanup();
    RcOrderDetail._gal = null;
  },
  _galKey: function (e) {
    if (!RcOrderDetail._gal || !document.getElementById('rc-lightbox')) return;
    if (e.key === 'Escape') RcOrderDetail._galClose();
    else if (e.key === 'ArrowLeft') RcOrderDetail._galGo(-1);
    else if (e.key === 'ArrowRight') RcOrderDetail._galGo(1);
  },
  _galGo: function (dir) {
    var st = RcOrderDetail._gal; if (!st) return;
    var n = st.i + dir; if (n < 0 || n >= st.media.length) return;
    st.i = n; RcOrderDetail._galRender();
  },
  _galApplyT: function () {
    var st = RcOrderDetail._gal; if (!st || !st.img) return;
    st.img.style.transform = 'translate(' + st.tx + 'px,' + st.ty + 'px) scale(' + st.scale + ')';
  },
  _galRender: function () {
    var st = RcOrderDetail._gal; if (!st) return;
    if (st._cleanup) { st._cleanup(); st._cleanup = null; }
    st.scale = 1; st.tx = 0; st.ty = 0; st.img = null;
    var m = st.media[st.i], f = m.f;
    var url = f.file_url || f.thumbnail_url || '';
    document.getElementById('rc-gal-count').textContent = (st.i + 1) + ' / ' + st.media.length;
    document.getElementById('rc-gal-prev').style.opacity = st.i <= 0 ? '.25' : '1';
    document.getElementById('rc-gal-next').style.opacity = st.i >= st.media.length - 1 ? '.25' : '1';
    document.getElementById('rc-gal-cap').textContent = f.file_name || '';
    // Telegram WebView'da <a download> ishonchsiz (2026-09-03) — onclick
    // orqali Gallery._downloadOrOpen (mavjud bo'lsa u orqali, aks holda
    // eski <a download> yo'liga tushadi).
    var dl = document.getElementById('rc-gal-dl');
    dl.href = url;
    dl.onclick = function (e) {
      if (window.Gallery && Gallery._downloadOrOpen) {
        e.preventDefault();
        Gallery._downloadOrOpen(url, f.file_name);
      }
    };
    var stage = document.getElementById('rc-gal-stage'); stage.innerHTML = '';
    var actions = document.getElementById('rc-gal-actions'); actions.innerHTML = '';
    if (m.type === 'video') {
      var v = document.createElement('video');
      v.src = url; v.controls = true; v.autoplay = true; v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.style.cssText = 'max-width:100%;max-height:100%;background:#000';
      stage.appendChild(v);
    } else {
      var im = document.createElement('img');
      im.src = url; im.draggable = false;
      im.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;touch-action:none;will-change:transform';
      stage.appendChild(im);
      st.img = im;
      RcOrderDetail._galBindZoom(im);
      if (st.canEdit) {
        actions.innerHTML =
          '<button class="rc-btn rc-btn-sm" onclick="event.stopPropagation();RcOrderDetail.aiEdit(' + f.id + ')"><i class="fas fa-magic"></i> AI tahrir</button>' +
          '<button class="rc-btn-sm" style="background:rgba(255,255,255,.14);color:#fff;border:none;border-radius:var(--radius-sm);padding:8px 14px;font-weight:700" onclick="event.stopPropagation();RcOrderDetail.makeVr(' + f.id + ')"><i class="fas fa-vr-cardboard"></i> 360° VR</button>';
      }
    }
  },
  _galBindZoom: function (im) {
    var st = RcOrderDetail._gal;
    im.addEventListener('wheel', function (e) {
      e.preventDefault();
      st.scale = Math.max(1, Math.min(5, st.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      if (st.scale === 1) { st.tx = 0; st.ty = 0; }
      RcOrderDetail._galApplyT();
    }, { passive: false });
    var lastTap = 0;
    im.addEventListener('click', function (e) {
      var now = Date.now();
      if (now - lastTap < 300) {
        if (st.scale > 1) { st.scale = 1; st.tx = 0; st.ty = 0; } else { st.scale = 2.4; }
        RcOrderDetail._galApplyT(); e.stopPropagation();
      }
      lastTap = now;
    });
    var drag = false, sx = 0, sy = 0, ox = 0, oy = 0;
    im.addEventListener('mousedown', function (e) { if (st.scale <= 1) return; drag = true; sx = e.clientX; sy = e.clientY; ox = st.tx; oy = st.ty; e.preventDefault(); });
    var mv = function (e) { if (!drag) return; st.tx = ox + (e.clientX - sx); st.ty = oy + (e.clientY - sy); RcOrderDetail._galApplyT(); };
    var up = function () { drag = false; };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    st._cleanup = function () { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  },
  _galBindTouch: function (bd) {
    var stage = bd.querySelector('#rc-gal-stage');
    var t = { x0: 0, y0: 0, px: 0, d0: 0, s0: 1, ox: 0, oy: 0, mode: '' };
    function dist(tt) { var a = tt[0], b = tt[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    stage.addEventListener('touchstart', function (e) {
      var st = RcOrderDetail._gal; if (!st) return;
      if (e.touches.length === 2) { t.mode = 'pinch'; t.d0 = dist(e.touches); t.s0 = st.scale; }
      else if (e.touches.length === 1) { t.mode = st.scale > 1 ? 'pan' : 'swipe'; t.x0 = t.px = e.touches[0].clientX; t.y0 = e.touches[0].clientY; t.ox = st.tx; t.oy = st.ty; }
    }, { passive: true });
    stage.addEventListener('touchmove', function (e) {
      var st = RcOrderDetail._gal; if (!st) return;
      if (t.mode === 'pinch' && e.touches.length === 2) { st.scale = Math.max(1, Math.min(5, t.s0 * dist(e.touches) / t.d0)); RcOrderDetail._galApplyT(); }
      else if (t.mode === 'pan' && e.touches.length === 1) { st.tx = t.ox + (e.touches[0].clientX - t.x0); st.ty = t.oy + (e.touches[0].clientY - t.y0); RcOrderDetail._galApplyT(); }
      else if (t.mode === 'swipe' && e.touches.length === 1) { t.px = e.touches[0].clientX; }
    }, { passive: true });
    stage.addEventListener('touchend', function () {
      var st = RcOrderDetail._gal; if (!st) return;
      if (t.mode === 'pinch' && st.scale <= 1.02) { st.scale = 1; st.tx = 0; st.ty = 0; RcOrderDetail._galApplyT(); }
      if (t.mode === 'swipe') { var dx = t.px - t.x0; if (Math.abs(dx) > 60) RcOrderDetail._galGo(dx < 0 ? 1 : -1); }
      t.mode = '';
    }, { passive: true });
  },

  // ── AI rasm tahrir (fal.ai) ──
  aiEdit: function (fileId) {
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      RcOrderDetail._fld("Nima o'zgartirilsin?", '<textarea id="rc-ai-prompt" class="rc-input" rows="3" placeholder="Masalan: divanni yashil rangga bo\'ya, fon yorug\'roq"></textarea>') +
      '<div id="rc-ai-status" style="font-size:12px;color:var(--mut)"></div>' +
      '<button class="rc-btn" id="rc-ai-ok" style="width:100%"><i class="fas fa-magic"></i> AI tahrirlash</button></div>';
    RcSheet.open('✨ AI rasm tahrir', body, {});
    document.getElementById('rc-ai-ok').onclick = function () {
      var prompt = (RcOrderDetail._val('rc-ai-prompt') || '').trim();
      if (!prompt) return Toast.error("Nima o'zgartirilsin — yozing");
      var ok = document.getElementById('rc-ai-ok'); ok.disabled = true; ok.style.opacity = '.5';
      var st = document.getElementById('rc-ai-status'); st.textContent = 'Boshlanmoqda…'; st.style.color = 'var(--mut)';
      fetch('/mini/api/ai-image-edit/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: fileId, prompt: prompt }) })
        .then(function (r) { return r.json(); }).then(function (r) {
          if (!r.ok) throw new Error(r.error || 'Xatolik');
          RcOrderDetail._aiPoll(r.data.task_id, st, ok);
        }).catch(function (err) { ok.disabled = false; ok.style.opacity = '1'; st.textContent = err.message; st.style.color = 'var(--danger)'; });
    };
  },
  _aiPoll: function (taskId, st, ok) {
    var iv = setInterval(function () {
      fetch('/mini/api/ai-image-edit/?task_id=' + taskId).then(function (r) { return r.json(); }).then(function (r) {
        if (!r.ok) throw new Error(r.error || 'Task topilmadi');
        var d = r.data;
        if (st) st.textContent = d.step || d.status || '';
        if (d.status === 'done') { clearInterval(iv); Toast.success("AI tahrir tayyor — fayl qo'shildi"); RcSheet.close(); var lb = document.getElementById('rc-lightbox'); if (lb) lb.remove(); RcOrderDetail.reload(); }
        else if (d.status === 'error') { clearInterval(iv); if (ok) { ok.disabled = false; ok.style.opacity = '1'; } if (st) { st.textContent = d.error || 'AI xatosi'; st.style.color = 'var(--danger)'; } }
      }).catch(function (err) { clearInterval(iv); if (ok) { ok.disabled = false; ok.style.opacity = '1'; } if (st) { st.textContent = err.message; st.style.color = 'var(--danger)'; } });
    }, 2000);
  },

  // Ulangan panoramani ochish (usta.bittada.uz/panorama/<uuid>/ — public viewer)
  openPanorama: function (uuid) {
    if (!uuid) return;
    var url = '/panorama/' + uuid + '/';
    if (window.RcFrame && RcFrame.open) RcFrame.open(url, '🌐 Vizualizatsiya');
    else window.open(url, '_blank');
  },

  // ── 360° VR / panorama (PanoPulse yoki Fal Hunyuan) ──
  makeVr: function (fileId) {
    var body = '<div style="display:flex;flex-direction:column;gap:10px;padding-top:2px">' +
      '<div style="font-size:12px;color:var(--mut)">Provayderni tanlang. 360° panorama 1-3 daqiqada tayyor bo\'ladi.</div>' +
      RcOrderDetail._fld("Qo'shimcha tavsif (ixtiyoriy)", '<input id="rc-vr-prompt" class="rc-input" placeholder="masalan: yorqinroq, zamonaviy uslub">') +
      '<button class="rc-btn" style="width:100%" onclick="RcOrderDetail._runVr(' + fileId + ',\'panopulse\')"><i class="fas fa-vr-cardboard"></i> PanoPulse (Bittada 360)</button>' +
      '<button class="rc-btn-ghost" style="width:100%" onclick="RcOrderDetail._runVr(' + fileId + ',\'fal_hunyuan\')"><i class="fas fa-globe"></i> Fal AI (Hunyuan World)</button>' +
      '<div id="rc-vr-status" style="font-size:12px;color:var(--mut)"></div></div>';
    RcSheet.open('🥽 360° VR yaratish', body, {});
  },
  _runVr: function (fileId, provider) {
    var prompt = (RcOrderDetail._val('rc-vr-prompt') || '').trim();
    var st = document.getElementById('rc-vr-status');
    if (st) { st.textContent = '360° VR yaratilmoqda (1-3 daqiqa)…'; st.style.color = 'var(--mut)'; }
    Toast.info('360° VR yaratish boshlandi…');
    fetch('/mini/api/panorama-generate/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: fileId, provider: provider, prompt: prompt }) })
      .then(function (r) { return r.json(); }).then(function (r) {
        if (!r.ok) throw new Error(r.error || 'Xatolik');
        RcOrderDetail._vrPoll(r.data.task_id, st);
      }).catch(function (err) { if (st) { st.textContent = err.message; st.style.color = 'var(--danger)'; } Toast.error(err.message); });
  },
  _vrPoll: function (taskId, st) {
    var iv = setInterval(function () {
      fetch('/mini/api/panorama-generate/?task_id=' + taskId).then(function (r) { return r.json(); }).then(function (r) {
        if (!r.ok) throw new Error(r.error || 'Task xatosi');
        var d = r.data;
        if (st) st.textContent = d.step || d.status || '';
        if (d.status === 'done') { clearInterval(iv); Toast.success('360° VR tayyor!'); if (d.viewer_url) window.open(d.viewer_url, '_blank'); RcSheet.close(); RcOrderDetail.reload(); }
        else if (d.status === 'error') { clearInterval(iv); if (st) { st.textContent = d.error || 'VR xatosi'; st.style.color = 'var(--danger)'; } Toast.error(d.error || 'VR xatosi'); }
      }).catch(function (err) { clearInterval(iv); if (st) { st.textContent = err.message; st.style.color = 'var(--danger)'; } });
    }, 4000);
  },

  // Faylni o'chirish
  delFile: function (fileId) {
    RcSheet.confirm("O'chirish", "Faylni o'chirasizmi?", function () {
      WS.send('file.delete', { file_id: fileId }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        Toast.success("O'chirildi"); RcOrderDetail.reload();
      });
    });
  },

  // Faylni ulashish / URL nusxalash
  shareFile: function (url) {
    var full = (url && url.indexOf('http') === 0) ? url : (window.location.origin + url);
    if (navigator.share) { navigator.share({ url: full }).catch(function () {}); }
    else if (navigator.clipboard) { navigator.clipboard.writeText(full).then(function () { Toast.success('URL nusxalandi'); }); }
    else { window.open(full, '_blank'); }
  },

  // Fayl yuklash (modal + REST)
  uploadFile: function () {
    var d = RcOrderDetail._data;
    var body = '<div style="display:flex;flex-direction:column;gap:10px;padding-top:2px">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="rc-btn" id="rc-fu-file" style="flex:1;min-width:80px"><i class="fas fa-folder-open"></i> Fayl</button>' +
      '<button class="rc-btn-ghost" id="rc-fu-photo" style="flex:1;min-width:80px"><i class="fas fa-camera"></i> Surat</button>' +
      '<button class="rc-btn-ghost" id="rc-fu-video" style="flex:1;min-width:80px"><i class="fas fa-video"></i> Video</button></div>' +
      '<input type="file" id="rc-fu-in" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.b3d,.project,.bpj,.skp" style="display:none">' +
      // `capture="environment"` OLIB TASHLANDI (2026-09-03) — Telegram
      // WebView'da kamerani MAJBURAN ochishga urinish ba'zi qurilmalarda
      // ishlamay qolgan ("kamera ochilmadi", foydalanuvchi xabari).
      // `capture`siz — tizim o'z rasm-tanlash menyusini ochadi (unda odatda
      // "Kamera" varianti ham bor), bu WebView'da ancha ishonchliroq.
      '<input type="file" id="rc-fu-cam" accept="image/*" style="display:none">' +
      '<input type="file" id="rc-fu-vid" accept="video/*" style="display:none">' +
      '<div id="rc-fu-prev" style="font-size:12px;color:var(--mut);line-height:1.6"></div>' +
      '<div id="rc-fu-prog" style="display:none"><div style="font-size:11px;color:var(--mut)">Yuklanmoqda…</div><div style="height:5px;border-radius:99px;background:var(--sfc2);margin-top:6px"><div id="rc-fu-bar" style="width:0;height:100%;border-radius:99px;background:var(--acc);transition:width .2s"></div></div></div></div>';
    RcSheet.open('📎 Fayl yuklash', body, {});
    var fi = document.getElementById('rc-fu-in'), ci = document.getElementById('rc-fu-cam'), vi = document.getElementById('rc-fu-vid');
    document.getElementById('rc-fu-file').onclick = function () { fi.click(); };
    document.getElementById('rc-fu-photo').onclick = function () { ci.click(); };
    document.getElementById('rc-fu-video').onclick = function () { vi.click(); };
    function handle(fl) {
      if (!fl || !fl.length) return;
      var prev = document.getElementById('rc-fu-prev');
      prev.innerHTML = Array.from(fl).map(function (f) { return (f.type.indexOf('image') === 0 ? '🖼' : f.type.indexOf('video') === 0 ? '🎬' : '📄') + ' ' + Utils.esc(f.name); }).join('<br>');
      RcOrderDetail._doUpload(Array.from(fl), d.id);
    }
    fi.onchange = function () { handle(fi.files); };
    ci.onchange = function () { handle(ci.files); };
    vi.onchange = function () { handle(vi.files); };
  },

  // ── Oblaka havola qo'shish (2026-09-04) ───────────────────────────────
  // Fayl yuklamasdan tashqi URL saqlash uchun — Bazis oblaka va VR 3D model
  // (ShapeSpark va h.k.) uchun ALOHIDA ikkita kirish nuqtasi (Fayllar tab
  // yuqorisidagi ikkita tugma), lekin ikkalasi ham shu bitta oynadan va
  // bitta backend endpoint'dan (`/mini/api/link-add/`) foydalanadi.
  // `kind`: 'bazis' → nom "Bazis oblaka", 'vr' → nom "VR 3D model".
  // Havolani (Bazis oblaka / VR / Detal QR) nusxalash — 2026-09-08.
  copyLink: function (url) {
    if (!url) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { Toast.success('Havola nusxalandi'); },
        function () { Toast.error('Nusxalab bo\'lmadi'); });
    } else { Toast.error('Nusxalab bo\'lmadi'); }
  },

  addLink: function (kind) {
    var d = RcOrderDetail._data;
    var title = kind === 'vr' ? '🕶️ VR 3D model link' : '☁️ Bazis oblaka link';
    var defName = kind === 'vr' ? 'VR 3D model' : 'Bazis oblaka';
    var body = '<div style="display:flex;flex-direction:column;gap:10px;padding-top:2px">' +
      '<input type="text" id="rc-link-name" placeholder="Nomi" value="' + Utils.esc(defName) + '" style="padding:10px 12px;border-radius:12px;border:1px solid var(--brd);background:var(--sfc2);color:var(--txt);font-size:13px">' +
      '<input type="url" id="rc-link-url" placeholder="https://..." style="padding:10px 12px;border-radius:12px;border:1px solid var(--brd);background:var(--sfc2);color:var(--txt);font-size:13px">' +
      '<button class="rc-btn" id="rc-link-save" style="width:100%"><i class="fas fa-check"></i> Saqlash</button></div>';
    RcSheet.open(title, body, {});
    document.getElementById('rc-link-save').onclick = function () {
      var url = (document.getElementById('rc-link-url').value || '').trim();
      var name = (document.getElementById('rc-link-name').value || '').trim() || defName;
      if (!url) { Toast.error('Havola kiriting'); return; }
      if (!/^https?:\/\//i.test(url)) { Toast.error('Havola http:// yoki https:// bilan boshlanishi kerak'); return; }
      var btn = document.getElementById('rc-link-save');
      btn.disabled = true;
      var fd = new FormData();
      fd.append('order_id', d.id);
      fd.append('url', url);
      fd.append('name', name);
      fetch('/mini/api/link-add/', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          btn.disabled = false;
          if (res.ok) { Toast.success('Havola qo\'shildi'); RcSheet.close(); RcOrderDetail.reload(); }
          else { Toast.error(res.error || 'Xatolik'); }
        })
        .catch(function () { btn.disabled = false; Toast.error('Xatolik'); });
    };
  },

  // ── Detal QR (2026-09-04, TZ-Detal-QR-2026-09.md) ─────────────────────
  // Bazisdan eksport qilingan 3D rasmni yuklab, avtomatik QR-kod + login
  // talab qilmaydigan jamoat sahifa yaratadi. `order_id` ixtiyoriy jo'natiladi
  // — bu buyurtmaga bog'lanadi, lekin kartochka mustaqil ham ochilaveradi.
  openDetalQr: function () {
    // 2026-09-04: ".b3d yukla" — server AVTOMATIK render qiladi (parser +
    // headless Chromium, client_erp/services/b3d_render.py). "Rasm yukla" —
    // eski qo'lda-eksport yo'li ham qoladi (zaxira, agar b3d render
    // muvaffaqiyatsiz bo'lsa yoki usta rasmni o'zi tayyorlab qo'ygan bo'lsa).
    var d = RcOrderDetail._data;
    var body = '<div style="display:flex;flex-direction:column;gap:10px;padding-top:2px">' +
      '<input type="text" id="dqr-title" placeholder="Nomi (masalan: Kofe budka Pro)" style="padding:10px 12px;border-radius:12px;border:1px solid var(--brd);background:var(--sfc2);color:var(--txt);font-size:13px">' +
      '<input type="text" id="dqr-artikul" placeholder="Artikul (ixtiyoriy)" style="padding:10px 12px;border-radius:12px;border:1px solid var(--brd);background:var(--sfc2);color:var(--txt);font-size:13px">' +
      '<input type="number" id="dqr-count" placeholder="Detallar soni (avtomatik hisoblanadi)" style="padding:10px 12px;border-radius:12px;border:1px solid var(--brd);background:var(--sfc2);color:var(--txt);font-size:13px">' +
      '<div style="display:flex;gap:8px">' +
      '<button class="rc-btn" id="dqr-b3d-btn" style="flex:1"><i class="fas fa-cube"></i> .b3d yukla</button>' +
      '<button class="rc-btn-ghost" id="dqr-img-btn" style="flex:1"><i class="fas fa-image"></i> Rasm yukla</button></div>' +
      '<input type="file" id="dqr-b3d" accept=".b3d" style="display:none">' +
      '<input type="file" id="dqr-img" accept="image/*" style="display:none">' +
      '<div id="dqr-prev" style="font-size:12px;color:var(--mut)"></div>' +
      '<button class="rc-btn" id="dqr-save" style="width:100%"><i class="fas fa-qrcode"></i> QR yaratish</button></div>';
    RcSheet.open('📦 Detal QR yaratish', body, {});
    var b3dInp = document.getElementById('dqr-b3d'), imgInp = document.getElementById('dqr-img');
    var chosenB3d = null, chosenImg = null;
    document.getElementById('dqr-b3d-btn').onclick = function () { b3dInp.click(); };
    document.getElementById('dqr-img-btn').onclick = function () { imgInp.click(); };
    b3dInp.onchange = function () {
      chosenB3d = b3dInp.files[0] || null; chosenImg = null;
      document.getElementById('dqr-prev').textContent = chosenB3d ? ('📐 ' + chosenB3d.name + ' — serverda render qilinadi') : '';
    };
    imgInp.onchange = function () {
      chosenImg = imgInp.files[0] || null; chosenB3d = null;
      document.getElementById('dqr-prev').textContent = chosenImg ? ('🖼 ' + chosenImg.name) : '';
    };
    document.getElementById('dqr-save').onclick = function () {
      var title = (document.getElementById('dqr-title').value || '').trim();
      var artikul = (document.getElementById('dqr-artikul').value || '').trim();
      var count = (document.getElementById('dqr-count').value || '').trim();
      if (!title) { Toast.error('Nomi kiriting'); return; }
      if (!chosenB3d && !chosenImg) { Toast.error('.b3d fayl yoki rasm tanlang'); return; }
      var btn = document.getElementById('dqr-save');
      var origHtml = btn.innerHTML;
      function resetBtn() { btn.disabled = false; btn.innerHTML = origHtml; }
      btn.disabled = true;
      if (chosenB3d) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Render qilinmoqda…';
      var fd = new FormData();
      fd.append('title', title);
      if (artikul) fd.append('artikul', artikul);
      if (count) fd.append('detal_count', count);
      fd.append('order_id', d.id);
      if (chosenB3d) fd.append('b3d_file', chosenB3d);
      else fd.append('image', chosenImg);
      fetch('/mini/api/detal-qr-create/', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res.ok) { resetBtn(); Toast.error(res.error || 'Xatolik'); return; }
          Toast.success('Detal QR yaratildi');
          RcSheet.close();
          RcOrderDetail.reload();
        })
        .catch(function () { resetBtn(); Toast.error('Xatolik'); });
    };
  },

  // Detal QR — tahrirlash (nom/artikul/detal soni; rasm/3D qayta yuklanmaydi)
  editDetalQr: function (shortCode, title, artikul, detalCount) {
    var body = '<div style="display:flex;flex-direction:column;gap:10px;padding-top:2px">' +
      '<input type="text" id="dqre-title" placeholder="Nomi" value="' + Utils.esc(title || '') + '" style="padding:10px 12px;border-radius:12px;border:1px solid var(--brd);background:var(--sfc2);color:var(--txt);font-size:13px">' +
      '<input type="text" id="dqre-artikul" placeholder="Artikul (ixtiyoriy)" value="' + Utils.esc(artikul || '') + '" style="padding:10px 12px;border-radius:12px;border:1px solid var(--brd);background:var(--sfc2);color:var(--txt);font-size:13px">' +
      '<input type="number" id="dqre-count" placeholder="Detallar soni" value="' + (detalCount || '') + '" style="padding:10px 12px;border-radius:12px;border:1px solid var(--brd);background:var(--sfc2);color:var(--txt);font-size:13px">' +
      '<button class="rc-btn" id="dqre-save" style="width:100%"><i class="fas fa-check"></i> Saqlash</button></div>';
    RcSheet.open('✏️ Detal QR tahrirlash', body, {});
    document.getElementById('dqre-save').onclick = function () {
      var title2 = (document.getElementById('dqre-title').value || '').trim();
      if (!title2) { Toast.error('Nomi kiriting'); return; }
      var btn = document.getElementById('dqre-save');
      btn.disabled = true;
      var fd = new FormData();
      fd.append('short_code', shortCode);
      fd.append('title', title2);
      fd.append('artikul', (document.getElementById('dqre-artikul').value || '').trim());
      fd.append('detal_count', (document.getElementById('dqre-count').value || '').trim());
      fetch('/mini/api/detal-qr-update/', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          btn.disabled = false;
          if (!res.ok) { Toast.error(res.error || 'Xatolik'); return; }
          Toast.success('Saqlandi');
          RcSheet.close();
          RcOrderDetail.reload();
        })
        .catch(function () { btn.disabled = false; Toast.error('Xatolik'); });
    };
  },

  // Detal QR — o'chirish
  deleteDetalQr: function (shortCode) {
    RcSheet.confirm("O'chirish", 'Detal QR kartochkasini o\'chirasizmi? Havola ham ishlamay qoladi.', function () {
      var fd = new FormData();
      fd.append('short_code', shortCode);
      fetch('/mini/api/detal-qr-delete/', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res.ok) return Toast.error(res.error || 'Xatolik');
          Toast.success("O'chirildi");
          RcOrderDetail.reload();
        })
        .catch(function () { Toast.error('Xatolik'); });
    });
  },

  _doUpload: function (files, orderId) {
    var CHUNK = 5 * 1024 * 1024;
    var prog = document.getElementById('rc-fu-prog'), bar = document.getElementById('rc-fu-bar');
    if (prog) prog.style.display = 'block';
    var total = files.length, done = 0;
    function next() {
      if (done >= total) { Toast.success(total + ' ta fayl yuklandi'); RcSheet.close(); RcOrderDetail.reload(); return; }
      var f = files[done];
      if (bar) bar.style.width = Math.round(done / total * 100) + '%';
      if (f.size > CHUNK) { RcOrderDetail._chunk(f, orderId, function () { done++; next(); }); }
      else {
        var fd = new FormData(); fd.append('file', f); fd.append('order_id', orderId);
        var x = new XMLHttpRequest(); x.open('POST', '/mini/api/file-upload/');
        x.onload = function () { done++; next(); };
        x.onerror = function () { Toast.error('Xatolik: ' + f.name); done++; next(); };
        x.send(fd);
      }
    }
    next();
  },
  _chunk: function (file, orderId, onDone) {
    var CHUNK = 5 * 1024 * 1024;
    var totalChunks = Math.ceil(file.size / CHUNK), uploadId = '', idx = 0;
    var bar = document.getElementById('rc-fu-bar');
    function send() {
      if (idx >= totalChunks) { if (onDone) onDone(); return; }
      var start = idx * CHUNK, end = Math.min(start + CHUNK, file.size);
      var fd = new FormData();
      fd.append('chunk', file.slice(start, end)); fd.append('order_id', orderId);
      fd.append('file_name', file.name); fd.append('chunk_index', idx); fd.append('total_chunks', totalChunks);
      if (uploadId) fd.append('upload_id', uploadId);
      var x = new XMLHttpRequest(); x.open('POST', '/mini/api/chunk-upload/');
      x.onload = function () { try { var r = JSON.parse(x.responseText); if (r.data && r.data.upload_id) uploadId = r.data.upload_id; } catch (e) {} idx++; if (bar) bar.style.width = Math.round(idx / totalChunks * 100) + '%'; send(); };
      x.onerror = function () { Toast.error('Chunk xatolik'); if (onDone) onDone(); };
      x.send(fd);
    }
    send();
  },

  // Mijoz uchun shartnoma (portal + SMS/ulashish)
  openContract: function () {
    var d = RcOrderDetail._data;
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      RcOrderDetail._fld('Dogovor summasi', '<input id="rc-ct-amt" class="rc-input" type="number" inputmode="numeric" placeholder="0">') +
      RcOrderDetail._fld('Shartnoma matni', '<textarea id="rc-ct-terms" class="rc-input" rows="5" placeholder="Jarayon, muddat, shartlar..."></textarea>') +
      '<button class="rc-btn" id="rc-ct-ok" style="width:100%"><i class="fas fa-file-contract"></i> Yaratish va yuborish</button>' +
      '<div id="rc-ct-res"></div></div>';
    RcSheet.open('Mijoz uchun shartnoma', body, {});
    document.getElementById('rc-ct-ok').onclick = function () {
      var amount = parseInt(RcOrderDetail._val('rc-ct-amt')) || 0;
      if (amount <= 0) return Toast.error('Summa kiriting');
      fetch('/mini/api/contracts/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: d.id, amount: amount, terms: RcOrderDetail._val('rc-ct-terms') || '' }) })
        .then(function (r) { return r.json(); }).then(function (r) {
          if (!r.ok) return Toast.error(r.error || 'Xatolik');
          var url = window.location.origin + r.data.portal_url;
          var uuid = r.data.uuid;
          var phone = (r.data.customer_phone || '').replace(/\D/g, '');
          var box = document.getElementById('rc-ct-res');
          box.innerHTML = '<div style="margin-top:8px;padding-top:12px;border-top:1px solid var(--brd)">' +
            '<div style="font-size:11px;color:var(--mut);margin-bottom:6px">Mijozga havola</div>' +
            '<div style="display:flex;gap:6px;margin-bottom:10px"><input readonly value="' + Utils.esc(url) + '" class="rc-input" style="flex:1;font-size:11px"><button class="rc-btn-ghost rc-btn-sm" id="rc-ct-copy">Nusxa</button></div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' +
            '<button class="rc-btn-ghost rc-btn-sm" id="rc-ct-sms"><i class="fas fa-sms"></i> SMS</button>' +
            '<button class="rc-btn-ghost rc-btn-sm" id="rc-ct-tg"><i class="fab fa-telegram"></i> TG</button>' +
            '<button class="rc-btn-ghost rc-btn-sm" id="rc-ct-wa"><i class="fab fa-whatsapp"></i> WA</button></div>' +
            '<img src="/mini/portal/' + uuid + '/qr/" style="width:150px;height:150px;display:block;margin:0 auto;border-radius:10px">' +
            '</div>';
          document.getElementById('rc-ct-copy').onclick = function () { navigator.clipboard.writeText(url).then(function () { Toast.success('Nusxalandi'); }); };
          document.getElementById('rc-ct-sms').onclick = function () {
            if (!phone) return Toast.error("Mijoz telefoni yo'q");
            var b = this; b.disabled = true;
            fetch('/mini/api/contracts/' + uuid + '/send-sms/', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (r) { b.disabled = false; if (r.ok) Toast.success('SMS yuborildi'); else Toast.error(r.error || 'Xatolik'); }).catch(function () { b.disabled = false; Toast.error('Tarmoq xatosi'); });
          };
          document.getElementById('rc-ct-tg').onclick = function () { window.open('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(d.title + ' — shartnomangiz tayyor'), '_blank'); };
          document.getElementById('rc-ct-wa').onclick = function () { window.open(phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(d.title + ' — shartnoma: ' + url) : 'https://api.whatsapp.com/send?text=' + encodeURIComponent(url), '_blank'); };
          Toast.success('Shartnoma yaratildi');
        }).catch(function () { Toast.error('Tarmoq xatosi'); });
    };
  },

  // ═══════════ F4: ULASHISH / RUXSAT / MebelCity ULASH ═══════════
  // ── Jamoaga ulashish ──
  shareOrder: function () {
    var d = RcOrderDetail._data;
    var shares = d.shares || [];
    var visLabel = { full: "To'liq", limited: 'Cheklangan', finance_hidden: 'Moliya yashirin' };
    var existing = '';
    shares.forEach(function (s) {
      existing += '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--sfc2);border-radius:var(--radius-sm);margin-bottom:6px"><span>👥</span><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">' + Utils.esc(s.team_name) + '</div><div style="font-size:11px;color:var(--mut)">' + (visLabel[s.visibility] || s.visibility) + '</div></div><button class="rc-btn-ghost rc-btn-sm" style="color:var(--danger)" onclick="RcOrderDetail.unshareOrder(' + s.team_id + ')">✕</button></div>';
    });
    var custCard = '<div style="background:var(--sfc2);border-radius:var(--radius-sm);padding:12px 14px">' +
      '<div style="font-size:13px;font-weight:800"><i class="fas fa-user-check" style="color:var(--acc-text)"></i> Mijozga ulashish</div>' +
      '<div style="font-size:11px;color:var(--mut);margin:5px 0 9px">Mijoz buyurtma holati, tugagan etaplar, fayllar va vizualizatsiyani ko\'radi. Eslatma va moliya yashirin.</div>' +
      '<div id="rc-cust-body"><button class="rc-btn rc-btn-sm" style="width:100%" onclick="RcOrderDetail.customerShare()"><i class="fas fa-link"></i> Mijoz havolasini olish</button></div></div>';
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      custCard +
      '<div style="height:1px;background:var(--brd);margin:2px 0"></div>' +
      '<div style="font-size:13px;font-weight:800;color:var(--mut)">Jamoaga ulashish (ichki)</div>' +
      (existing ? '<div>' + existing + '</div>' : '') +
      RcOrderDetail._fld("Ko'rinish darajasi", '<select id="rc-sh-vis" class="rc-input"><option value="full">To\'liq (hamma narsa)</option><option value="limited">Cheklangan (faqat etaplar)</option><option value="finance_hidden">Moliya yashirin</option></select>') +
      '<div style="display:flex;gap:14px;flex-wrap:wrap"><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" id="rc-sh-edit"> Tahrirlash</label><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" id="rc-sh-comp" checked> Tugatish</label><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" id="rc-sh-exp"> Chiqim</label></div>' +
      '<button class="rc-btn" id="rc-sh-ok" style="width:100%"><i class="fas fa-share-alt"></i> Jamoaga ulashish</button></div>';
    RcSheet.open('Buyurtma ulashish', body, {});
    document.getElementById('rc-sh-ok').onclick = function () {
      WS.send('order.share', { order_id: d.id, visibility: document.getElementById('rc-sh-vis').value, can_edit: document.getElementById('rc-sh-edit').checked, can_complete: document.getElementById('rc-sh-comp').checked, can_add_expense: document.getElementById('rc-sh-exp').checked }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success('Jamoaga ulashildi'); RcOrderDetail.reload();
      });
    };
  },
  // ── SHERIKNI CHIQARISH — SABAB MAJBURIY (2026-08-15, §S1) ─────────────
  // Ilgari bir bosishda chiqib ketardi va hech qanday iz qolmasdi: keyin
  // «kim, qachon, nega chiqargan, unga qancha tegardi» degan savolga javob
  // yo'q edi. Endi sabab so'raladi va append-only jurnalga yoziladi.
  REMOVE_REASONS: ['Ishni tashlab ketdi', 'Kelishuv o‘zgardi',
                   'Ishni bajarmadi', 'Xato qo‘shilgan'],

  unshareOrder: function (teamId) {
    var d = RcOrderDetail._data, esc = Utils.esc;
    if (!(window.RcSheet && RcSheet.open)) { Toast.info('Tez orada'); return; }

    // Chiqariladiganlarning hozirgi ulushi — ogohlantirishda ko'rsatiladi
    var profit = (d.profit !== undefined && d.profit !== null)
      ? (parseInt(d.profit) || 0)
      : ((parseInt(d.total_income) || 0) - (parseInt(d.total_expense) || 0));
    var others = (d.profit_shares || []).filter(function (s) {
      return s.user_id && s.user_id !== d.owner_id;
    });
    var who = others.map(function (s) {
      var amt = Math.round(profit * (parseFloat(s.percent) || 0) / 100);
      return '<div style="display:flex;justify-content:space-between;gap:8px;'
        + 'padding:7px 10px;background:var(--sfc2);border-radius:10px;font-size:12.5px">'
        + '<b>' + esc(s.label || s.name) + '</b>'
        + '<span style="color:var(--lav-text);font-weight:700">' + s.percent + '% · '
        + Utils.money(amt) + '</span></div>';
    }).join('');

    var chips = RcOrderDetail.REMOVE_REASONS.map(function (r) {
      return '<button type="button" class="rc-chip rc-rm-why" data-r="' + esc(r) + '" '
        + 'style="flex:none;cursor:pointer">' + esc(r) + '</button>';
    }).join('');

    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">'
      + (who ? '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">'
              + 'Hozirgi ulushi</div>' + who + '</div>' : '')
      + '<div><div style="font-size:11px;color:var(--mut);font-weight:600;margin-bottom:6px">Sabab *</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' + chips + '</div>'
      + '<input id="rc-rm-reason" class="rc-input" placeholder="Yoki o‘zingiz yozing..."></div>'
      + '<div style="font-size:11.5px;color:var(--mut);line-height:1.55;background:var(--sfc2);'
      + 'padding:10px 12px;border-radius:12px;border-left:3px solid var(--pch)">'
      + '⚠️ Chiqarilgandan keyin unga bu buyurtmadan <b>hech narsa yozilmaydi</b> — '
      + 'na foyda, na rasxod, na qarz. Bo‘shagan foiz sizga o‘tadi.</div>'
      + '<button class="rc-btn" id="rc-rm-ok" style="width:100%">Chiqarish</button></div>';

    RcSheet.open('Sherikni chiqarish', body, {});
    document.querySelectorAll('.rc-rm-why').forEach(function (b) {
      b.onclick = function () {
        var el = document.getElementById('rc-rm-reason');
        if (el) el.value = b.dataset.r;
        document.querySelectorAll('.rc-rm-why').forEach(function (x) { x.classList.remove('rc-chip-acc'); });
        b.classList.add('rc-chip-acc');
      };
    });
    document.getElementById('rc-rm-ok').onclick = function () {
      var reason = ((document.getElementById('rc-rm-reason') || {}).value || '').trim();
      if (!reason) return Toast.error('Sababni tanlang yoki yozing');
      WS.send('order.unshare', { order_id: d.id, team_id: teamId, reason: reason }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success('Sherik chiqarildi'); RcOrderDetail.reload();
      });
    };
  },

  // ── Mijozga OCHIQ ulashish (public UUID havola) ──
  customerShare: function () {
    var d = RcOrderDetail._data;
    var box = document.getElementById('rc-cust-body');
    if (box) box.innerHTML = '<div style="font-size:12px;color:var(--mut)">Havola tayyorlanmoqda…</div>';
    WS.send('order.customer_share', { order_id: d.id }, function (msg) {
      if (!msg.ok || !msg.data || !msg.data.uuid) {
        if (box) box.innerHTML = '<div style="color:var(--danger);font-size:12px">' + ((msg && msg.error) || 'Xatolik') + '</div>';
        return;
      }
      RcOrderDetail._renderCustShare(msg.data.uuid);
    });
  },
  _renderCustShare: function (uuid) {
    var box = document.getElementById('rc-cust-body');
    if (!box) return;
    var url = location.protocol + '//' + location.host + '/mini/' + uuid + '/';
    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;background:var(--sfc);border:1px solid var(--brd);border-radius:10px;padding:9px 11px;margin-bottom:8px">' +
      '<i class="fas fa-globe" style="color:var(--acc-text);font-size:12px"></i>' +
      '<input readonly id="rc-cust-url" value="' + url + '" style="flex:1;min-width:0;border:none;background:none;color:var(--txt);font-size:12px;outline:none">' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
      '<button class="rc-btn rc-btn-sm" style="flex:1" onclick="RcOrderDetail._copyShare()"><i class="fas fa-copy"></i> Nusxa</button>' +
      '<a href="' + url + '" target="_blank" rel="noopener" class="rc-btn-ghost rc-btn-sm" style="flex:1;text-align:center;text-decoration:none;line-height:1.9"><i class="fas fa-external-link-alt"></i> Ochish</a>' +
      '<button class="rc-btn-ghost rc-btn-sm" style="color:var(--danger)" title="Havolani o\'chirish" onclick="RcOrderDetail._custUnshare()"><i class="fas fa-unlink"></i></button>' +
      '</div>';
  },
  _copyShare: function () {
    var i = document.getElementById('rc-cust-url');
    if (!i) return;
    var ok = function () { Toast.success('Havola nusxalandi'); };
    try { navigator.clipboard.writeText(i.value).then(ok, function () { i.select(); document.execCommand('copy'); ok(); }); }
    catch (e) { try { i.select(); document.execCommand('copy'); ok(); } catch (e2) {} }
  },
  _custUnshare: function () {
    var d = RcOrderDetail._data;
    if (!confirm("Mijoz havolasi o'chirilsinmi? Eski havola ishlamay qoladi.")) return;
    WS.send('order.customer_unshare', { order_id: d.id }, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      var box = document.getElementById('rc-cust-body');
      if (box) box.innerHTML = '<button class="rc-btn rc-btn-sm" style="width:100%" onclick="RcOrderDetail.customerShare()"><i class="fas fa-link"></i> Mijoz havolasini olish</button>';
      Toast.success("Havola o'chirildi");
    });
  },

  // ── A'zo qo'shish / ruxsat ──
  openPerm: function () {
    var d = RcOrderDetail._data;
    var person = RcOrderDetail._fld('Foydalanuvchi qidirish', '<input id="rc-pm-search" class="rc-input" placeholder="Ism yoki telefon..."><div id="rc-pm-res" style="margin-top:6px"></div><input type="hidden" id="rc-pm-uid">') +
      RcOrderDetail._fld('Rol', '<select id="rc-pm-role" class="rc-input"><option value="viewer">Ko\'ruvchi — faqat ko\'radi</option><option value="worker">Ishchi — etap bajaradi</option><option value="manager">Menejer — hammasini boshqaradi</option></select>') +
      '<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="rc-pm-exp"> ➖ Chiqim qo\'sha olsin</label>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="rc-pm-comp"> ✅ Etap tugallashi mumkin</label>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="rc-pm-money"> 💰 Pul ko\'rinadi</label>' +
      RcOrderDetail._fld('Ulashish turi', '<div style="display:flex;gap:6px"><button type="button" class="rc-btn-ghost rc-btn-sm rc-pm-mode" data-m="once" style="flex:1">Bir martalik</button><button type="button" class="rc-btn-ghost rc-btn-sm rc-pm-mode" data-m="always" style="flex:1">Har doim</button></div><div id="rc-pm-hint" style="font-size:11px;color:var(--mut);margin-top:5px"></div>') +
      '<div id="rc-pm-standing"></div>';
    var body = '<div style="display:flex;flex-direction:column;gap:12px;padding-top:2px">' +
      '<div style="display:flex;border:1.5px solid var(--brd2);border-radius:var(--radius-sm);overflow:hidden">' +
      '<button type="button" class="rc-pm-target" data-t="person" style="flex:1;padding:11px 6px;border:none;background:transparent;font-size:13px;font-weight:700;cursor:pointer;color:var(--mut)">👤 Shaxs</button>' +
      '<button type="button" class="rc-pm-target" data-t="team" style="flex:1;padding:11px 6px;border:none;background:transparent;font-size:13px;font-weight:700;cursor:pointer;color:var(--mut)">👥 Jamoa</button></div>' +
      '<div id="rc-pm-person" style="display:flex;flex-direction:column;gap:12px">' + person + '</div>' +
      '<div id="rc-pm-team" style="display:none"><div style="font-size:12px;color:var(--mut);padding:8px 0">Yuklanmoqda...</div></div>' +
      '<button class="rc-btn" id="rc-pm-ok" style="width:100%"><i class="fas fa-check"></i> Saqlash</button></div>';
    RcSheet.open("A'zo qo'shish / Ruxsat", body, {});
    RcOrderDetail._permTarget = 'person';
    var _teamsLoaded = false;
    function paintTarget() {
      document.querySelectorAll('.rc-pm-target').forEach(function (b) { var on = b.dataset.t === RcOrderDetail._permTarget; b.style.background = on ? 'var(--acc)' : 'transparent'; b.style.color = on ? 'var(--acc-ink)' : 'var(--mut)'; });
      document.getElementById('rc-pm-person').style.display = RcOrderDetail._permTarget === 'person' ? 'flex' : 'none';
      document.getElementById('rc-pm-team').style.display = RcOrderDetail._permTarget === 'team' ? 'block' : 'none';
      if (RcOrderDetail._permTarget === 'team' && !_teamsLoaded) { _teamsLoaded = true; loadTeams(); }
    }
    function loadTeams() {
      WS.send('team.autoshare_get', {}, function (msg) {
        var tw = document.getElementById('rc-pm-team'); if (!tw) return;
        if (!msg.ok) { tw.innerHTML = '<div style="font-size:12px;color:var(--danger);padding:8px 0">' + Utils.esc(msg.error || 'Xatolik') + '</div>'; return; }
        var teams = (msg.data && msg.data.teams) || [];
        if (!teams.length) { tw.innerHTML = '<div style="text-align:center;padding:16px;font-size:13px;color:var(--mut)">Sizda jamoa yo\'q.<br><a href="#/team" style="color:var(--acc-text)">Jamoa sahifasida yarating</a></div>'; return; }
        var th = ''; teams.forEach(function (t) { th += RcOrderDetail._autoShareCard(t); });
        th += '<div style="font-size:11px;color:var(--mut);margin-top:4px">Yoqib "Saqlash"ni bossangiz — bundan keyin har bir yangi buyurtmangiz jamoa a\'zolariga avtomatik ochiladi (eski buyurtmalarga tegilmaydi)</div>';
        tw.innerHTML = th; RcOrderDetail._bindAutoShare(tw);
      });
    }
    document.querySelectorAll('.rc-pm-target').forEach(function (b) { b.onclick = function () { RcOrderDetail._permTarget = b.dataset.t; paintTarget(); }; });
    paintTarget();
    RcOrderDetail._permMode = 'once';
    function paintMode() {
      document.querySelectorAll('.rc-pm-mode').forEach(function (b) { var on = b.dataset.m === RcOrderDetail._permMode; b.style.background = on ? 'var(--acc)' : ''; b.style.color = on ? 'var(--acc-ink)' : ''; });
      var hint = document.getElementById('rc-pm-hint');
      if (hint) hint.textContent = RcOrderDetail._permMode === 'always' ? 'Har doim: bundan keyin har bir yangi buyurtmangiz shu odamga avtomatik ulashiladi' : 'Bir martalik: faqat shu buyurtma uchun';
    }
    document.querySelectorAll('.rc-pm-mode').forEach(function (b) { b.onclick = function () { RcOrderDetail._permMode = b.dataset.m; paintMode(); }; });
    paintMode();
    var si = document.getElementById('rc-pm-search'), res = document.getElementById('rc-pm-res');
    si.oninput = Utils.debounce(function () {
      var q = si.value.trim(); if (q.length < 2) { res.innerHTML = ''; return; }
      WS.send('user.search', { q: q }, function (msg) {
        if (!msg.ok) return;
        var html = '';
        (msg.data.users || []).forEach(function (u) { html += '<div class="rc-pm-uitem" data-id="' + u.id + '" style="padding:8px;cursor:pointer;border-bottom:1px solid var(--brd);font-size:13px">' + Utils.esc(u.full_name) + ' <span style="color:var(--mut)">' + Utils.esc(u.phone) + '</span></div>'; });
        res.innerHTML = html || '<div style="font-size:12px;color:var(--mut);padding:8px">Topilmadi</div>';
        res.querySelectorAll('.rc-pm-uitem').forEach(function (it) { it.onclick = function () { document.getElementById('rc-pm-uid').value = it.dataset.id; si.value = it.textContent.trim(); res.innerHTML = ''; }; });
      });
    }, 300);
    RcOrderDetail._loadStanding();
    document.getElementById('rc-pm-ok').onclick = function () {
      if (RcOrderDetail._permTarget === 'team') {
        var cards = document.querySelectorAll('#rc-pm-team .rc-as-card');
        if (!cards.length) return Toast.error("Jamoa yo'q");
        var left = cards.length, failed = null;
        cards.forEach(function (card) {
          WS.send('team.autoshare_set', RcOrderDetail._autoShareCollect(card), function (msg) {
            if (!msg.ok) failed = msg.error || 'Xatolik';
            left--;
            if (left === 0) { if (failed) return Toast.error(failed); RcSheet.close(); Toast.success('Jamoa avto-ulashish saqlandi'); }
          });
        });
        return;
      }
      var uid = (document.getElementById('rc-pm-uid') || {}).value;
      if (!uid) return Toast.error('Foydalanuvchi tanlang');
      WS.send('perm.save', {
        order_id: d.id, user_id: parseInt(uid), role: document.getElementById('rc-pm-role').value,
        can_add_expense: document.getElementById('rc-pm-exp').checked,
        can_complete_stage: document.getElementById('rc-pm-comp').checked,
        can_see_money: document.getElementById('rc-pm-money').checked,
        always: RcOrderDetail._permMode === 'always', stages: [],
      }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success(RcOrderDetail._permMode === 'always' ? 'Ruxsat saqlandi — har doim ulashiladi' : 'Ruxsat saqlandi'); RcOrderDetail.reload();
      });
    };
  },
  _loadStanding: function () {
    var wrap = document.getElementById('rc-pm-standing'); if (!wrap) return;
    WS.send('standing.list', {}, function (msg) {
      var w = document.getElementById('rc-pm-standing'); if (!msg.ok || !w) return;
      var members = (msg.data && msg.data.members) || [];
      if (!members.length) { w.innerHTML = ''; return; }
      var esc = Utils.esc;
      var sh = '<div style="font-size:12px;color:var(--mut);margin:4px 0 6px">🔁 Har doim ulashiladiganlar</div>';
      members.forEach(function (m) {
        sh += '<div style="border:1px solid var(--brd);border-radius:var(--radius-sm);margin-bottom:5px;padding:8px 10px;font-size:12px">';
        sh += '<div style="display:flex;align-items:center;gap:8px">';
        sh += '<span style="flex:1;min-width:0"><b>' + esc(m.full_name) + '</b> <span style="color:var(--mut)">' + Utils.roleLabel(m.role) + (m.can_see_money ? ' · 💰' : '') + (m.can_add_expense ? ' · ➖' : '') + (m.can_complete_stage ? ' · ✅' : '') + '</span></span>';
        sh += '<button class="rc-btn-ghost rc-btn-sm" style="padding:3px 8px" onclick="RcOrderDetail._toggleStandingEdit(' + m.id + ')">✏️</button>';
        sh += '<button class="rc-btn-ghost rc-btn-sm" style="color:var(--danger);padding:3px 8px" onclick="RcOrderDetail._delStanding(' + m.id + ')">✕</button></div>';
        sh += '<div id="rc-se-' + m.id + '" style="display:none;margin-top:8px;padding-top:8px;border-top:1px dashed var(--brd)">';
        sh += '<select class="rc-input rc-se-role" style="padding:8px;margin-bottom:6px">';
        [['viewer', "👁 Ko'ruvchi"], ['worker', '🔨 Ishchi'], ['manager', '⭐ Menejer']].forEach(function (r) { sh += '<option value="' + r[0] + '"' + (m.role === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; });
        sh += '</select>';
        sh += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">';
        sh += '<label style="display:flex;align-items:center;gap:4px;font-size:11px;padding:5px 8px;border:1px solid var(--brd);border-radius:8px"><input type="checkbox" class="rc-se-money"' + (m.can_see_money ? ' checked' : '') + '> 💰 Pul</label>';
        sh += '<label style="display:flex;align-items:center;gap:4px;font-size:11px;padding:5px 8px;border:1px solid var(--brd);border-radius:8px"><input type="checkbox" class="rc-se-exp"' + (m.can_add_expense ? ' checked' : '') + '> ➖ Chiqim</label>';
        sh += '<label style="display:flex;align-items:center;gap:4px;font-size:11px;padding:5px 8px;border:1px solid var(--brd);border-radius:8px"><input type="checkbox" class="rc-se-comp"' + (m.can_complete_stage ? ' checked' : '') + '> ✅ Tugatish</label>';
        sh += '</div>';
        sh += '<button class="rc-btn rc-btn-sm" onclick="RcOrderDetail._saveStanding(' + m.id + ')">Saqlash</button>';
        sh += '</div></div>';
      });
      w.innerHTML = sh;
    });
  },
  _toggleStandingEdit: function (id) {
    var p = document.getElementById('rc-se-' + id);
    if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
  },
  _saveStanding: function (id) {
    var p = document.getElementById('rc-se-' + id); if (!p) return;
    WS.send('standing.update', {
      id: id,
      role: p.querySelector('.rc-se-role').value,
      can_see_money: p.querySelector('.rc-se-money').checked,
      can_add_expense: p.querySelector('.rc-se-exp').checked,
      can_complete_stage: p.querySelector('.rc-se-comp').checked,
    }, function (res) {
      if (!res.ok) return Toast.error(res.error || 'Xatolik');
      Toast.success('Saqlandi'); RcOrderDetail._loadStanding();
    });
  },
  _delStanding: function (id) {
    WS.send('standing.delete', { id: id }, function (res) {
      if (!res.ok) return Toast.error(res.error || 'Xatolik');
      Toast.success("Har doim ulashish to'xtatildi"); RcOrderDetail._loadStanding();
    });
  },

  // ── Jamoa avto-ulashish kartasi (perm modal "Jamoa" segmenti) ──
  _autoShareCard: function (t) {
    var esc = Utils.esc;
    var h = '<div class="rc-as-card" data-team="' + t.id + '" style="border:1.5px solid var(--brd2);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px">';
    h += '<div style="font-size:13px;font-weight:700;margin-bottom:2px">👥 ' + esc(t.name) + '</div>';
    if (t.members && t.members.length) h += '<div style="font-size:11px;color:var(--mut);margin-bottom:8px">' + t.members.length + " a'zo: " + t.members.map(function (m) { return esc(m.name); }).join(', ') + '</div>';
    else h += '<div style="font-size:11px;color:var(--mut);margin-bottom:8px">Faol a\'zo yo\'q — avval Jamoa sahifasida a\'zo qo\'shing</div>';
    h += '<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;padding:10px;border:1.5px solid var(--brd2);border-radius:var(--radius-sm);cursor:pointer;margin-bottom:8px"><input type="checkbox" class="rc-ta-master" style="width:18px;height:18px"' + (t.auto_share_new_orders ? ' checked' : '') + '><span>🔁 Yangi buyurtmalarim jamoaga avto-ochilsin</span></label>';
    h += '<div class="rc-ta-row" style="display:' + (t.auto_share_new_orders ? 'block' : 'none') + '">';
    h += '<div style="font-size:11px;color:var(--mut);margin-bottom:6px">A\'zolarga beriladigan ruxsatlar:</div>';
    h += '<select class="rc-input rc-ta-role" style="margin-bottom:8px;padding:8px">';
    [['viewer', "👁 Ko'ruvchi — faqat ko'radi"], ['worker', '🔨 Ishchi — etap bajaradi'], ['manager', '⭐ Menejer — hammasini boshqaradi']].forEach(function (r) { h += '<option value="' + r[0] + '"' + (t.auto_role === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; });
    h += '</select><div style="display:flex;gap:6px;flex-wrap:wrap">';
    h += '<label style="display:flex;align-items:center;gap:5px;font-size:12px;padding:6px 9px;border:1px solid var(--brd);border-radius:8px"><input type="checkbox" class="rc-ta-money"' + (t.auto_can_see_money ? ' checked' : '') + '> 💰 Pul</label>';
    h += '<label style="display:flex;align-items:center;gap:5px;font-size:12px;padding:6px 9px;border:1px solid var(--brd);border-radius:8px"><input type="checkbox" class="rc-ta-exp"' + (t.auto_can_add_expense ? ' checked' : '') + '> ➖ Chiqim</label>';
    h += '<label style="display:flex;align-items:center;gap:5px;font-size:12px;padding:6px 9px;border:1px solid var(--brd);border-radius:8px"><input type="checkbox" class="rc-ta-comp"' + (t.auto_can_complete_stage ? ' checked' : '') + '> ✅ Tugatish</label>';
    h += '</div></div></div>';
    return h;
  },
  _bindAutoShare: function (scope) {
    (scope || document).querySelectorAll('.rc-as-card').forEach(function (card) {
      var m = card.querySelector('.rc-ta-master'), row = card.querySelector('.rc-ta-row');
      if (m && row) m.onchange = function () { row.style.display = m.checked ? 'block' : 'none'; };
    });
  },
  _autoShareCollect: function (card) {
    return {
      team_id: parseInt(card.dataset.team),
      auto_share_new_orders: !!(card.querySelector('.rc-ta-master') && card.querySelector('.rc-ta-master').checked),
      auto_role: card.querySelector('.rc-ta-role') ? card.querySelector('.rc-ta-role').value : 'worker',
      auto_can_see_money: !!(card.querySelector('.rc-ta-money') && card.querySelector('.rc-ta-money').checked),
      auto_can_add_expense: !!(card.querySelector('.rc-ta-exp') && card.querySelector('.rc-ta-exp').checked),
      auto_can_complete_stage: !!(card.querySelector('.rc-ta-comp') && card.querySelector('.rc-ta-comp').checked),
    };
  },

  // ── Ruxsat toggle / rol / o'chirish ──
  togglePerm: function (permId, field) {
    var d = RcOrderDetail._data;
    var p = (d.permissions || []).filter(function (x) { return x.id === permId; })[0];
    if (!p) return;
    var payload = { order_id: d.id, user_id: p.user.id, role: p.role, can_add_expense: !!p.can_add_expense, can_complete_stage: !!p.can_complete_stage, can_see_money: !!p.can_see_money, stages: p.stages || [] };
    payload[field] = !p[field];
    WS.send('perm.save', payload, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      Toast.success('Saqlandi'); RcOrderDetail.reload();
    });
  },
  setPermRole: function (permId, role) {
    var d = RcOrderDetail._data;
    var p = (d.permissions || []).filter(function (x) { return x.id === permId; })[0];
    if (!p) return;
    WS.send('perm.save', { order_id: d.id, user_id: p.user.id, role: role, can_add_expense: !!p.can_add_expense, can_complete_stage: !!p.can_complete_stage, can_see_money: !!p.can_see_money, stages: p.stages || [] }, function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      Toast.success('Rol yangilandi'); RcOrderDetail.reload();
    });
  },
  delPerm: function (permId) {
    RcSheet.confirm("O'chirish", "Ruxsatni olib tashlaysizmi?", function () {
      WS.send('perm.delete', { id: permId }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        Toast.success('Ruxsat olib tashlandi'); RcOrderDetail.reload();
      });
    });
  },

  // ── MebelCity buyurtma ulash (etap) ──
  linkMc: function (stageId) {
    var stage = ((RcOrderDetail._data && RcOrderDetail._data.stages) || []).filter(function (s) { return s.id === stageId; })[0];
    var wasLinked = stage && stage.mebelcity_order_id;
    // 2026-09-05: aniq, ALOHIDA "Uzish" tugmasi qo'shildi (foydalanuvchi
    // so'rovi) — ilgari uzish uchun avval tanlangan elementni QAYTA BOSIB
    // tanlovni bekor qilish kerak edi, bu tushunarsiz edi ("uzib bo'lmayapdi"
    // deb shikoyat qilingan). Endi: "Uzish" — darhol, tanlovsiz uzadi;
    // "Ulash" — faqat ro'yxatdan YANGI tanlov qilinganda ishlaydi.
    var unlinkBtn = wasLinked
      ? '<button class="rc-btn-ghost" id="rc-lmc-unlink" style="width:100%;margin-top:8px;color:var(--danger)"><i class="fas fa-unlink"></i> Uzish</button>'
      : '';
    var body = '<div style="padding-top:2px">' + RcOrderDetail._mcPickerHtml() +
      '<button class="rc-btn" id="rc-lmc-ok" style="width:100%;margin-top:12px"><i class="fas fa-link"></i> Ulash</button>' +
      unlinkBtn + '</div>';
    RcSheet.open('🔗 MebelCity buyurtma', body, {});
    RcOrderDetail._initMcPicker(stage ? stage.mebelcity_order_id : null);
    if (wasLinked) {
      document.getElementById('rc-lmc-unlink').onclick = function () {
        WS.send('stage.link_order', { stage_id: stageId, mebelcity_order_id: null }, function (msg) {
          if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
          RcSheet.close(); Toast.success('Buyurtma uzildi'); RcOrderDetail.reload();
        });
      };
    }
    document.getElementById('rc-lmc-ok').onclick = function () {
      var v = (document.getElementById('mc-selected-id') || {}).value;
      v = v ? parseInt(v) : null;
      if (!v) { Toast.error('Avval buyurtmani tanlang'); return; }
      WS.send('stage.link_order', { stage_id: stageId, mebelcity_order_id: v }, function (msg) {
        if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
        RcSheet.close(); Toast.success('Buyurtma ulandi'); RcOrderDetail.reload();
      });
    };
  },
  // ── MebelCity buyurtma tanlash (Ro'yxat + 📅 Kalendar) — V1 uslubi, theme-safe ──
  _mcPickerHtml: function () {
    return '<div style="display:flex;gap:6px;margin-bottom:8px">' +
      '<button type="button" class="rc-mc-tab" data-tab="list" id="mc-tab-list" style="flex:1;font-size:12px;font-weight:700;padding:8px;border-radius:10px;border:1px solid var(--brd);background:var(--acc);color:var(--acc-ink);cursor:pointer">📋 Ro\'yxat</button>' +
      '<button type="button" class="rc-mc-tab" data-tab="cal" id="mc-tab-cal" style="flex:1;font-size:12px;font-weight:700;padding:8px;border-radius:10px;border:1px solid var(--brd);background:var(--sfc2);color:var(--mut);cursor:pointer">📅 Kalendar</button>' +
      '</div>' +
      '<div id="mc-search-wrap" style="margin-bottom:8px"><input type="text" id="mc-search" class="rc-input" placeholder="🔍 Qidirish (hash, nom, loyiha...)"></div>' +
      '<div id="mc-calendar-wrap" style="display:none;margin-bottom:8px;background:var(--sfc2);border-radius:var(--radius-sm);padding:10px"></div>' +
      '<div id="mc-order-list" style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:6px"><div style="text-align:center;padding:20px;color:var(--mut);font-size:12px">Yuklanmoqda…</div></div>' +
      '<input type="hidden" id="mc-selected-id" value="">';
  },
  // Bu chegaradan yuqori balli nomzod "Tavsiya" (ishonchli) bo'ladi. Hech
  // qaysi nomzod bu chegaraga yetmasa ham — eng yaqin 2 tasi "Ehtimol"
  // (ishonchsizroq, boshqacharoq belgi) deb ko'rsatiladi, chunki usta hech
  // bo'lmasa qayerdan boshlashni bilsin (2026-08-28, foydalanuvchi: mos
  // topilmasa ham eng yaqinini ko'rsat).
  MC_MATCH_THRESHOLD: 0.35,
  MC_WEAK_MATCH_COUNT: 2,
  _renderMcListItems: function (orders, selectedId, container) {
    var esc = Utils.esc, TH = RcOrderDetail.MC_MATCH_THRESHOLD;
    if (!orders.length) { container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--mut);font-size:12px">Buyurtma topilmadi</div>'; return; }
    var hasStrong = orders.some(function (o) { return (o.match_score || 0) >= TH; });
    // Hech qanday kuchli taklif yo'q bo'lsa — eng yuqori balli 2 tasini
    // (ball 0 bo'lmasa) "ehtimol" deb belgilash uchun ID to'plami.
    var weakIds = {};
    if (!hasStrong) {
      orders.filter(function (o) { return (o.match_score || 0) > 0; })
        .sort(function (a, b) { return (b.match_score || 0) - (a.match_score || 0); })
        .slice(0, RcOrderDetail.MC_WEAK_MATCH_COUNT)
        .forEach(function (o) { weakIds[o.id] = true; });
    }
    var h = '';
    orders.forEach(function (o) {
      var isSel = selectedId && o.id === selectedId;
      var isLinked = o.linked_to && o.id !== selectedId;
      var isSuggested = (o.match_score || 0) >= TH;
      var isWeak = !isSuggested && weakIds[o.id];
      var bc = isSel ? 'var(--acc)' : (isSuggested ? 'var(--acc-text)' : (isWeak ? 'var(--pch)' : (isLinked ? 'var(--pch)' : 'var(--brd)')));
      var bg = isSel ? 'color-mix(in srgb,var(--acc) 14%,transparent)' : (isSuggested ? 'color-mix(in srgb,var(--acc) 8%,var(--sfc2))' : 'var(--sfc2)');
      // Faqat mijoz ismi + sana — usta uchun tanish, tushunarli narsalar.
      // Texnik detallar (hash, foiz, zamer, ball) ATAYLAB ko'rsatilmaydi —
      // taklif faqat rang/"Tavsiya" so'zi bilan ajratiladi (2026-08-28).
      var name = o.project_name || o.partner_name || ('Buyurtma #' + o.order_hash);
      h += '<div class="mc-order-item" data-id="' + o.id + '" style="padding:16px;border:2px solid ' + bc + (isWeak ? ';border-style:dashed' : '') + ';border-radius:var(--radius-sm);cursor:pointer;background:' + bg + ';' + (isLinked ? 'opacity:.75;' : '') + 'transition:all .15s">';
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">';
      h += '<span style="font-size:16px;font-weight:700">' + esc(name) + '</span>';
      if (isSel) h += '<span style="font-size:20px;flex:none">✅</span>';
      else if (isSuggested) h += '<span style="font-size:11px;padding:3px 9px;border-radius:6px;background:var(--acc);color:var(--acc-ink);font-weight:700;flex:none">Tavsiya</span>';
      else if (isWeak) h += '<span style="font-size:11px;padding:3px 9px;border-radius:6px;background:var(--sfc);color:var(--pch);font-weight:700;flex:none;border:1px dashed var(--pch)">Ehtimol</span>';
      h += '</div>';
      if (o.created_at) h += '<div style="font-size:13px;color:var(--mut);margin-top:5px">📅 ' + Utils.date(o.created_at) + '</div>';
      if (isLinked) h += '<div style="font-size:12px;color:var(--pch);margin-top:4px">🔗 Boshqa zakazga ulangan: ' + esc(o.linked_to) + '</div>';
      h += '</div>';
    });
    container.innerHTML = h;
  },
  _renderMcCalendar: function (orders, selectedId, calWrap, year, month) {
    var orderDates = {}, linkedDates = {};
    orders.forEach(function (o) {
      if (!o.created_at) return;
      var d = o.created_at.substring(0, 10);
      (orderDates[d] = orderDates[d] || []).push(o);
      if (o.linked_to) linkedDates[d] = true;
    });
    var first = new Date(year, month, 1);
    var startDay = (first.getDay() + 6) % 7;
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var months = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    h += '<button type="button" id="mc-cal-prev" style="padding:4px 10px;font-size:13px;border-radius:8px;border:1px solid var(--brd);background:var(--sfc);color:var(--txt);cursor:pointer">◀</button>';
    h += '<span style="font-size:13px;font-weight:700">' + months[month] + ' ' + year + '</span>';
    h += '<button type="button" id="mc-cal-next" style="padding:4px 10px;font-size:13px;border-radius:8px;border:1px solid var(--brd);background:var(--sfc);color:var(--txt);cursor:pointer">▶</button></div>';
    h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center;font-size:10px;margin-bottom:3px">';
    ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'].forEach(function (d) { h += '<div style="color:var(--mut);padding:2px;font-weight:700">' + d + '</div>'; });
    h += '</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center">';
    for (var i = 0; i < startDay; i++) h += '<div></div>';
    for (var day = 1; day <= daysInMonth; day++) {
      var key = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      var hasOrder = orderDates[key], hasLinked = linkedDates[key];
      var bg = 'transparent', border = '1px solid transparent', cursor = 'default', dot = '';
      if (hasOrder) {
        bg = 'color-mix(in srgb,var(--acc) 16%,transparent)'; border = '1px solid color-mix(in srgb,var(--acc) 40%,transparent)'; cursor = 'pointer';
        dot = '<div style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);display:flex;gap:1px">' +
          '<span style="width:4px;height:4px;border-radius:50%;background:var(--acc-text)"></span>' +
          (hasLinked ? '<span style="width:4px;height:4px;border-radius:50%;background:var(--pch)"></span>' : '') + '</div>';
      }
      h += '<div class="mc-cal-day' + (hasOrder ? ' has-orders' : '') + '" data-date="' + key + '" style="position:relative;padding:6px 2px;border-radius:8px;font-size:11px;font-weight:600;color:var(--txt);background:' + bg + ';border:' + border + ';cursor:' + cursor + '">' + day + dot + '</div>';
    }
    h += '</div><div style="display:flex;gap:12px;margin-top:8px;font-size:10px;color:var(--mut)">';
    h += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--acc-text);vertical-align:middle"></span> Buyurtma bor</span>';
    h += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--pch);vertical-align:middle"></span> Bog\'langan</span></div>';
    calWrap.innerHTML = h;
  },
  _initMcPicker: function (selectedId, onSelect) {
    var list = document.getElementById('mc-order-list');
    var search = document.getElementById('mc-search');
    var searchWrap = document.getElementById('mc-search-wrap');
    var calWrap = document.getElementById('mc-calendar-wrap');
    var hiddenInput = document.getElementById('mc-selected-id');
    var tabList = document.getElementById('mc-tab-list');
    var tabCal = document.getElementById('mc-tab-cal');
    if (!list) return;
    var allOrders = [];
    var currentSelected = selectedId || null;
    var currentTab = 'list';
    var calYear = (new Date()).getFullYear();
    var calMonth = (new Date()).getMonth();
    var calDateFilter = null;
    if (hiddenInput && currentSelected) hiddenInput.value = currentSelected;

    var orderTitle = (RcOrderDetail._data && RcOrderDetail._data.title) || '';
    WS.send('mebelcity_orders_for_stage', { order_title: orderTitle }, function (msg) {
      if (!msg.ok || !msg.data) { list.innerHTML = '<div style="padding:12px;text-align:center;color:var(--mut);font-size:12px">Xatolik</div>'; return; }
      allOrders = msg.data.orders || [];
      renderList(allOrders);
    });

    function renderList(items) {
      RcOrderDetail._renderMcListItems(items, currentSelected, list);
      list.querySelectorAll('.mc-order-item').forEach(function (el) {
        el.onclick = function () {
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
      // 2026-09-05: telefon raqam bo'yicha qidiruv — raqamlarni tozalab
      // solishtiramiz (foydalanuvchi "+998" yoki bo'shliqlar bilan yozishi
      // mumkin, `partner_phone` esa bazadagi xom formatda keladi).
      var qDigits = q.replace(/\D/g, '');
      return allOrders.filter(function (o) {
        return (o.order_hash || '').toLowerCase().indexOf(q) >= 0 ||
          (o.partner_name || '').toLowerCase().indexOf(q) >= 0 ||
          (o.project_name && o.project_name.toLowerCase().indexOf(q) >= 0) ||
          (o.creator_name && o.creator_name.toLowerCase().indexOf(q) >= 0) ||
          (o.delivery_label && o.delivery_label.toLowerCase().indexOf(q) >= 0) ||
          (o.current_step && o.current_step.toLowerCase().indexOf(q) >= 0) ||
          (qDigits.length >= 3 && (o.partner_phone || '').replace(/\D/g, '').indexOf(qDigits) >= 0);
      });
    }
    function filterByDate(dk) { return allOrders.filter(function (o) { return o.created_at && o.created_at.substring(0, 10) === dk; }); }
    function renderCalendar() {
      RcOrderDetail._renderMcCalendar(allOrders, currentSelected, calWrap, calYear, calMonth);
      document.getElementById('mc-cal-prev').onclick = function () { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } calDateFilter = null; renderCalendar(); renderList(allOrders); };
      document.getElementById('mc-cal-next').onclick = function () { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } calDateFilter = null; renderCalendar(); renderList(allOrders); };
      calWrap.querySelectorAll('.mc-cal-day.has-orders').forEach(function (el) {
        el.onclick = function () {
          calWrap.querySelectorAll('.mc-cal-day').forEach(function (d) { if (d.classList.contains('has-orders')) d.style.background = 'color-mix(in srgb,var(--acc) 16%,transparent)'; });
          el.style.background = 'color-mix(in srgb,var(--acc) 36%,transparent)';
          calDateFilter = el.dataset.date;
          renderList(filterByDate(calDateFilter));
        };
      });
    }
    function switchTab(tab) {
      currentTab = tab; calDateFilter = null;
      var on = 'background:var(--acc);color:var(--acc-ink)', off = 'background:var(--sfc2);color:var(--mut)';
      if (tab === 'list') {
        searchWrap.style.display = 'block'; calWrap.style.display = 'none';
        tabList.style.cssText += ';' + on; tabCal.style.cssText += ';' + off;
        tabList.style.background = 'var(--acc)'; tabList.style.color = 'var(--acc-ink)';
        tabCal.style.background = 'var(--sfc2)'; tabCal.style.color = 'var(--mut)';
        renderList(getFiltered());
      } else {
        searchWrap.style.display = 'none'; calWrap.style.display = 'block';
        tabCal.style.background = 'var(--acc)'; tabCal.style.color = 'var(--acc-ink)';
        tabList.style.background = 'var(--sfc2)'; tabList.style.color = 'var(--mut)';
        renderCalendar(); renderList(allOrders);
      }
    }
    if (tabList) tabList.onclick = function () { switchTab('list'); };
    if (tabCal) tabCal.onclick = function () { switchTab('cal'); };
    if (search) search.oninput = function () { renderList(getFiltered()); };
  },

  template: function (d) {
    var esc = Utils.esc;
    var h = '<div data-screen>';

    // ── Sarlavha kartasi ──
    h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:12px">';
    h += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">';
    h += '<div style="min-width:0"><div style="font-weight:800;font-size:17px">' + esc(d.title || 'Buyurtma') + '</div>';
    if (d.customer) {
      h += '<a href="#/clients/' + d.customer.id + '" style="display:block;font-size:12px;color:var(--mut);margin-top:3px">';
      h += '<i class="fas fa-user" style="font-size:10px"></i> ' + esc(d.customer.name);
      if (d.customer.phone) h += ' · 📞 ' + esc(d.customer.phone);
      h += '</a>';
    }
    h += '</div>';
    var canStatus = d.is_owner || d.user_role === 'manager';
    h += '<span ' + (canStatus ? 'onclick="RcOrderDetail.changeStatus()" style="cursor:pointer"' : '') + '>' + RcStatus.badge(d.status) + (canStatus ? ' <i class="fas fa-pen" style="font-size:9px;opacity:.5;margin-left:2px"></i>' : '') + '</span>';
    h += '</div>';
    // Progress
    h += '<div style="display:flex;align-items:center;gap:10px">';
    h += '<div class="rc-progress rc-progress-lg"><div class="rc-progress-fill" style="width:' + (d.overall_progress || 0) + '%"></div></div>';
    h += '<span style="font-size:12px;font-weight:800">' + (d.overall_progress || 0) + '%</span></div>';
    // Sanalar — 2026-07-25: avval faqat ikonka bor edi (📅/✅), nima ekani
    // noaniq edi. Endi YORLIQ bilan: boshlangan va topshirilgan sana + necha kun.
    h += '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--mut)">';
    h += '<span>📅 <b>' + T('Boshlandi') + ':</b> ' + Utils.date(d.created_at) + '</span>';
    if (d.deadline) h += '<span>🏁 <b>' + T('Muddat') + ':</b> ' + Utils.date(d.deadline) + '</span>';
    if (d.delivered_at) {
      h += '<span style="color:var(--acc-text)">✅ <b>' + T('Topshirildi') + ':</b> ' + Utils.date(d.delivered_at) + '</span>';
      var _kun = RcOrderDetail._kunFarq(d.created_at, d.delivered_at);
      if (_kun !== null) h += '<span>⏱ ' + _kun + ' ' + T('kun') + '</span>';
    }
    h += '</div>';
    h += '</div>';

    // ── Buyurtmani topshirish — barcha etap tugab «Tayyor» bo'lganda ──
    if (d.status === 'ready' && (d.is_owner || d.user_role === 'manager')) {
      h += '<button class="rc-btn" onclick="RcOrderDetail.deliverOrder()" style="width:100%;background:var(--acc);color:var(--acc-ink);font-size:15px;padding:15px;box-shadow:var(--glow)"><i class="fas fa-truck"></i> ' + T('Buyurtmani topshirish') + '</button>';
    }

    // ── Tablar ──
    var tabs = [['umumiy', T('Umumiy')], ['moliya', T('Moliya')], ['etap', T('Etaplar')], ['fayl', T('Fayllar')], ['jamoa', T('Jamoa')]];
    h += '<div class="rc-tabs" id="rc-od-tabs">';
    tabs.forEach(function (t) {
      var on = RcOrderDetail._tab === t[0];
      h += '<button class="rc-tab' + (on ? ' active' : '') + '" data-tab="' + t[0] + '" onclick="RcOrderDetail.setTab(\'' + t[0] + '\')">' + t[1] + '</button>';
    });
    h += '</div>';

    // ── Tab mazmuni — 2026-09-10: alohida id'ga o'ralgan (o'ralmasa `setTab`
    // butun sahifani (header+tablar bilan) qayta chizishga majbur bo'lardi —
    // katta innerHTML almashinuvi ekranda qisqa "oqarish/flash" beradi,
    // foydalanuvchi buni "sahifa qayta yuklanayabdi" deb sezgan). Endi
    // `setTab` faqat SHU div ichini yangilaydi, header/kartochka/tab
    // tugmalari joyida qoladi — flash yo'qoladi.
    h += '<div id="rc-od-tabcontent">' + RcOrderDetail._tabContentHtml(d) + '</div>';

    h += '</div>';
    return h;
  },

  _tabContentHtml: function (d) {
    if (RcOrderDetail._tab === 'umumiy') return RcOrderDetail._tabUmumiy(d);
    if (RcOrderDetail._tab === 'moliya') return RcOrderDetail._tabMoliya(d);
    if (RcOrderDetail._tab === 'etap') return RcOrderDetail._tabEtap(d);
    if (RcOrderDetail._tab === 'fayl') return RcOrderDetail._tabFayl(d);
    if (RcOrderDetail._tab === 'jamoa') return RcOrderDetail._tabJamoa(d);
    return '';
  },

  // ═══ UMUMIY ═══
  _tabUmumiy: function (d) {
    var esc = Utils.esc, h = '';
    var st = RcStatus.MAP[d.status] || [d.status, ''];
    var rows = [[T('Holat'), T(st[0])]];
    if (d.customer) {
      rows.push([T('Mijoz'), d.customer.name]);
      if (d.customer.phone) rows.push([T('Telefon'), d.customer.phone]);
      if (d.customer.address) rows.push([T('Manzil'), d.customer.address]);
    }
    // 2026-07-25: "Yaratilgan" → "Boshlangan sana", va TOPSHIRILGAN sana qo'shildi
    // (avval umuman yo'q edi). Foyda AYNAN topshirilgan oyga yoziladi, shuning
    // uchun bu sana ko'rinib turishi shart.
    rows.push([T('Boshlangan sana'), Utils.date(d.created_at)]);
    if (d.delivered_at) {
      rows.push([T('Topshirilgan sana'), Utils.date(d.delivered_at)]);
      var kun = RcOrderDetail._kunFarq(d.created_at, d.delivered_at);
      if (kun !== null) rows.push([T('Necha kun davom etdi'), kun + ' ' + T('kun')]);
    }
    if (d.deadline) rows.push([T('Muddat'), Utils.date(d.deadline)]);
    rows.push([T('Jarayon'), (d.overall_progress || 0) + '%']);

    h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:12px">';
    h += '<div style="font-weight:800;font-size:14px">' + T('Ma\'lumot') + '</div>';
    rows.forEach(function (r) {
      h += '<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px">';
      h += '<span style="color:var(--mut)">' + esc(r[0]) + '</span>';
      h += '<span style="font-weight:700;text-align:right;min-width:0">' + esc(r[1] || '—') + '</span></div>';
    });
    h += '</div>';

    // 🌐 Vizualizatsiya (buyurtmaga ulangan 360° panoramalar)
    h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:10px">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between"><div style="font-weight:800;font-size:14px">🌐 Vizualizatsiya</div>';
    h += '<a href="#/vizualizatsiya" style="font-size:11px;color:var(--acc-text);text-decoration:none;font-weight:700">Barchasi ›</a></div>';
    if (d.panoramas && d.panoramas.length) {
      h += '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:2px">';
      d.panoramas.forEach(function (p) {
        h += '<div onclick="RcOrderDetail.openPanorama(\'' + esc(p.uuid) + '\')" style="flex:0 0 120px;cursor:pointer;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--brd);background:var(--sfc2)">';
        h += '<div style="position:relative;aspect-ratio:1;background:var(--sfc2)">';
        if (p.thumbnail) h += '<img src="' + esc(p.thumbnail) + '" style="width:100%;height:100%;object-fit:cover" loading="lazy">';
        else h += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:26px">🌐</div>';
        h += '<span style="position:absolute;top:5px;left:5px;background:var(--acc);color:var(--acc-ink);font-size:9px;font-weight:800;padding:1px 6px;border-radius:5px">360°</span>';
        if (p.panorama_count > 1) h += '<span style="position:absolute;bottom:5px;right:5px;background:rgba(0,0,0,.6);color:#fff;font-size:9px;padding:1px 5px;border-radius:5px">🖼 ' + p.panorama_count + '</span>';
        h += '</div>';
        h += '<div style="padding:5px 7px;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p.name || 'Panorama') + '</div></div>';
      });
      h += '</div>';
    } else {
      h += '<div style="font-size:12px;color:var(--mut);text-align:center;padding:10px">Ulangan vizualizatsiya yo\'q. <a href="#/vizualizatsiya" style="color:var(--acc-text)">Bog\'lash</a></div>';
    }
    h += '</div>';

    // 📐 Bazis smeta (BOM) — d.bom bo'lsa (_afterPaint rc-bom'ni to'ldiradi)
    if (d.bom) {
      h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:8px">';
      h += '<div style="display:flex;align-items:center;justify-content:space-between"><div style="font-weight:800;font-size:14px">📐 Bazis smeta</div>';
      if (d.bom.snapshot_id) h += '<a href="/bom/snapshot/' + d.bom.snapshot_id + '/pdf/" target="_blank" rel="noopener" class="rc-btn-ghost rc-btn-sm" style="text-decoration:none;flex:none"><i class="fas fa-file-pdf"></i> PDF</a>';
      h += '</div>';
      h += '<div id="rc-bom"></div></div>';
    }

    if (d.description) {
      h += '<div class="rc-card"><div style="font-weight:800;font-size:14px">📄 Tavsif</div>';
      h += '<div style="font-size:13px;color:var(--mut);margin-top:8px;line-height:1.5">' + esc(d.description) + '</div></div>';
    }

    // Eslatmalar
    h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:10px">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between"><div style="font-weight:800;font-size:14px">📝 Eslatmalar</div>';
    h += '<button class="rc-btn-ghost rc-btn-sm" onclick="RcOrderDetail.addNote()"><i class="fas fa-plus"></i></button></div>';
    if (d.notes && d.notes.length) {
      var meId = (STATE.user && STATE.user.id) || 0;
      d.notes.forEach(function (n) {
        var mine = d.is_owner || n.created_by_id === meId;
        h += '<div style="background:var(--sfc2);border-radius:var(--radius-sm);padding:12px">';
        h += '<div style="display:flex;align-items:flex-start;gap:8px">';
        h += '<div style="flex:1;min-width:0;font-size:13px;line-height:1.5">' + esc(n.text) + '</div>';
        if (mine) {
          h += '<div style="display:flex;gap:4px;flex:none">';
          h += '<button class="rc-btn-ghost rc-btn-sm" style="padding:4px 7px" onclick="RcOrderDetail.editNote(' + n.id + ')"><i class="fas fa-pen" style="font-size:10px"></i></button>';
          h += '<button class="rc-btn-ghost rc-btn-sm" style="padding:4px 7px;color:var(--danger)" onclick="RcOrderDetail.delNote(' + n.id + ')"><i class="fas fa-trash" style="font-size:10px"></i></button>';
          h += '</div>';
        }
        h += '</div>';
        h += '<div style="font-size:11px;color:var(--mut);margin-top:6px">' + esc(n.created_by || '') + ' · ' + Utils.timeAgo(n.created_at) + '</div></div>';
      });
    } else {
      h += '<div style="font-size:12px;color:var(--mut);text-align:center;padding:8px">Eslatmalar yo\'q</div>';
    }
    h += '</div>';

    // Tarix (timeline)
    if (d.timeline && d.timeline.length) {
      h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:8px">';
      h += '<div style="font-weight:800;font-size:14px">Tarix</div>';
      d.timeline.forEach(function (t) {
        h += '<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:6px 0;border-bottom:1px solid var(--brd)">';
        h += '<span>' + esc(t.note) + '</span>';
        h += '<span style="color:var(--mut);white-space:nowrap">' + Utils.timeAgo(t.created_at) + '</span></div>';
      });
      h += '</div>';
    }

    // Buyurtmani o'chirish (owner)
    if (d.is_owner) {
      h += '<button class="rc-btn-ghost" style="color:var(--danger);width:100%;margin-top:4px" onclick="RcOrderDetail.deleteOrder()"><i class="fas fa-trash"></i> Buyurtmani o\'chirish</button>';
    }
    return h;
  },

  // ═══ MOLIYA ═══
  _tabMoliya: function (d) {
    var h = '', money = Utils.money;
    if (d.money_hidden) {
      return '<div class="rc-card rc-empty"><div class="rc-empty-ic">🔒</div><div style="font-weight:800;color:var(--txt)">Moliya yopiq</div><div style="margin-top:4px">Sizda pul ma\'lumotini ko\'rish ruxsati yo\'q</div></div>';
    }
    var shartnoma = parseInt(d.zaklad_amount) || 0;
    var kirim = parseInt(d.total_income) || 0;
    var chiqim = parseInt(d.total_expense) || 0;
    // SHARTNOMA-ASOSLI (2026-08-03): foyda endi BACKENDDAN keladi — bu yerda
    // qayta hisoblanmaydi. Ilgari JS o'zi `kirim − chiqim` qilardi va Moliya
    // sahifasidagi «Sof foyda» bilan farq qilardi (audit: TZ §0.3-Y5).
    var profit = (d.profit !== undefined && d.profit !== null)
      ? (parseInt(d.profit) || 0)
      : (kirim - chiqim);
    var extraInc = parseInt(d.extra_income) || 0;
    // Backenddan (zaklad_balance) — bitta algoritm, ikki joyda alohida hisoblanmaydi.
    var qarz = shartnoma > 0 ? (parseInt(d.zaklad_balance) || 0) : 0;
    var qarzText = shartnoma > 0 ? (qarz > 0 ? money(qarz) : "To'langan") : '—';

    var payPct = parseInt(d.payment_percent) || 0;
    var cards = [
      { label: 'Shartnoma', val: shartnoma ? (money(shartnoma) + (payPct ? ' (' + payPct + '%)' : '')) : '—', clr: 'var(--lav)' },
      { label: 'Berildi', val: money(kirim), clr: 'var(--acc)' },
      { label: 'Rasxod', val: money(chiqim), clr: 'var(--danger)' },
      // 2026-09-04: yangi kartochka — Berildi − Rasxod (qo'lda qolgan naqd
      // ostatka, shartnomaga bog'liq emas). "Qolgan pul" (shartnoma − Berildi)
      // dan FARQLI — ikkalasi ham qoladi, chalkashmasin uchun nomlari aniq.
      { label: 'Qolgan ostatka', val: (kirim - chiqim < 0 ? '-' : '') + money(Math.abs(kirim - chiqim)),
        clr: (kirim - chiqim) < 0 ? 'var(--danger)' : 'var(--cyan)' },
      // 2026-09-04: "Qarz" → "Qolgan pul" (foydalanuvchi so'rovi bo'yicha nom o'zgartirish, mantiq o'zgarmadi)
      { label: 'Qolgan pul', val: qarzText, clr: qarz > 0 ? 'var(--pch)' : 'var(--acc)' },
      // 2026-09-04: status 'ready'/'delivered' bo'lmaguncha Foyda kartochkasi
      // BO'SH ko'rinadi (raqam yashiriladi) — backend orqa fonda hisoblashda
      // davom etadi (profit o'zgarmadi), faqat status yangilanmaguncha UI'da
      // ko'rsatilmaydi. Foydalanuvchi talabi: erta ko'rsatilgan "kutilmoqda"
      // raqami chalkashtirar edi. Tartib: Shartnoma/Berildi/Rasxod/Qolgan
      // pul/Foyda (foydalanuvchi so'rovi bo'yicha — Foyda oxirgi kartochka).
      { label: 'Foyda',
        val: (d.status === 'ready' || d.status === 'delivered')
          ? ((profit < 0 ? '-' : '') + money(Math.abs(profit)))
          : '—',
        clr: (d.status === 'ready' || d.status === 'delivered')
          ? (profit < 0 ? 'var(--danger)' : 'var(--acc)')
          : 'var(--mut)',
        sub: (d.status === 'ready' || d.status === 'delivered')
          ? (d.profit_pct !== undefined && d.profit_pct !== null ? d.profit_pct + '%' + (d.by_contract ? ' · 📄 ' + T('shartnoma bo‘yicha') : '') : (d.by_contract ? '📄 ' + T('shartnoma bo‘yicha') : ''))
          : 'buyurtma tayyor/topshirilgach ko‘rinadi' },
    ];
    // Shartnomadan ortiq kelgan pul — alohida karta (yo'qolib qolmasin)
    if (extraInc > 0) {
      cards.push({ label: 'Qo‘shimcha', val: money(extraInc), clr: 'var(--cyan)',
                   sub: 'shartnomadan ortiq' });
    }
    // ── OGOHLANTIRISH (2026-08-07) ────────────────────────────────────
    // Chiqim 0 bo'lsa «Foyda = shartnoma summasi» chiqib qoladi va 100%
    // ko'rinadi. Bu foyda emas — hali material/ish haqi yozilmagan.
    // Buyurtma tugallanmaguncha bu raqam Moliyadagi «Sof foyda»ga KIRMAYDI.
    // 2026-09-23: to'liq gap kalitlari — T() orqali tarjima (bo'laklab emas)
    var warn = '';
    if (chiqim === 0) {
      warn = '<b>' + T('Chiqim hali kiritilmagan.') + '</b> '
           + T('Shuning uchun foyda shartnoma summasiga teng (100%) ko\u2018rinyapti \u2014 bu haqiqiy foyda emas. Material, ish haqi va boshqa xarajatlarni yozing.');
    } else if (d.status !== 'completed') {
      warn = T('Buyurtma hali <b>tugallanmagan</b> \u2014 foyda o\u2018zgarishi mumkin.');
    }
    if (warn) {
      h += '<div class="rc-card" style="margin-bottom:10px;padding:10px 12px;'
        + 'border:1px dashed var(--pch);background:var(--sfc2);font-size:11.5px;'
        + 'color:var(--mut);line-height:1.55">\u26A0\uFE0F ' + warn
        + (d.status !== 'completed'
            ? '<br>' + T('Moliyadagi <b>Sof foyda</b>ga faqat <b>tugallangan</b> buyurtmalar qo\u2018shiladi.')
            : '')
        + '</div>';
    }

    var canProfit = (d.is_owner || d.user_role === 'manager');
    h += '<div class="rc-grid rc-grid-auto">';
    cards.forEach(function (c, i) {
      var oc = '', cur = '';
      if (c.label === 'Foyda' && canProfit) { oc = ' onclick="RcOrderDetail.openProfit()"'; cur = 'cursor:pointer'; }
      else if (c.label === 'Shartnoma' && d.is_owner) { oc = ' onclick="RcOrderDetail.setZaklad()"'; cur = 'cursor:pointer'; }
      h += '<div class="rc-stat" style="animation-delay:' + (i * .05) + 's;' + cur + '"' + oc + '>';
      h += '<div class="rc-stat-label">' + c.label + '</div>';
      h += '<div class="rc-stat-val" style="color:' + c.clr + '">' + c.val + '</div>';
      // Foyda qaysi usulda hisoblanganini ko'rsatuvchi kichik izoh
      if (c.sub) h += '<div style="font-size:9.5px;color:var(--mut);margin-top:2px;opacity:.85">' + c.sub + '</div>';
      h += '</div>';
    });
    h += '</div>';

    // Amal tugmalari
    var showIncome = (d.is_owner || d.user_role === 'manager');
    var showExpense = d.is_owner || d.user_role === 'manager' || d.can_add_expense;
    h += '<div class="rc-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">';
    if (showIncome) h += '<button class="rc-btn" onclick="RcOrderDetail.addIncome()"><i class="fas fa-plus"></i> Kirim</button>';
    if (showExpense) h += '<button class="rc-btn-ghost" onclick="RcOrderDetail.addExpense()"><i class="fas fa-minus"></i> Chiqim</button>';
    if (d.is_owner) h += '<button class="rc-btn-ghost" onclick="RcOrderDetail.openContract()"><i class="fas fa-file-contract"></i> Shartnoma</button>';
    if (d.is_owner) h += '<button class="rc-btn-ghost" onclick="RcOrderDetail.shareOrder()"><i class="fas fa-share-alt"></i> Ulashish</button>';
    // «Foyda yechish» avval FAQAT taqsimot allaqachon saqlangan bo'lsa
    // ko'rinardi — taqsimot qilinmagan buyurtmada tugma umuman topilmasdi
    // (2026-08-15 shikoyati). Endi egasi/menejerga doim ko'rinadi; ichkarida
    // shartnoma va foyda>0 tekshiruvi allaqachon bor, taqsimot bo'lmasa
    // oyna bo'sh qatorlar bilan ochiladi (kontakt tanlanadi).
    if (canProfit) h += '<button class="rc-btn-ghost" onclick="RcOrderDetail.withdrawProfit()"><i class="fas fa-hand-holding-usd"></i> Foyda yechish</button>';
    // «Kirim/Chiqim qaytarish» — 2026-08-15 da olib tashlangan edi, o'sha
    // kuni QAYTARILDI (moliya TZ, talab #6). Backend tegilmagan.
    var canRevert = d.is_owner && STATE.user && STATE.user.can_revert_finance;
    if (canRevert) {
      h += '<button class="rc-btn-ghost" onclick="RcOrderDetail.revertFinance(\'income\')"><i class="fas fa-undo"></i> Kirim qaytarish</button>';
      h += '<button class="rc-btn-ghost" onclick="RcOrderDetail.revertFinance(\'expense\')"><i class="fas fa-undo"></i> Chiqim qaytarish</button>';
    }
    h += '</div>';

    // Tranzaksiyalar
    // ── 🧰 SHU BUYURTMA UCHUN OLINGAN QARZLAR (2026-08-15) ──────────────
    // Kimdan · nima uchun · qachon. Ikki manba: qo'lda yozilgan qarz va
    // sherikli rasxoddan avtomatik chiqqan qarz (Ustalar qarzi bloki bilan
    // BIR XIL yozuv — ikki joyda ikki nusxa emas).
    var sdb = d.supplier_debts || [];
    var _ICO = { dokon: '🏪', ustanovchik: '🔧', shaxs: '👤', boshqa: '📌' };
    h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 2px 0;flex-wrap:wrap">'
      + '<span style="font-weight:800;font-size:14px">🧰 Shu buyurtma qarzlari</span>'
      + '<span style="flex:1;min-width:0"></span>'
      + '<button class="rc-btn-ghost rc-btn-sm" onclick="RcFinance._creditorSheet(' + d.id + ')">'
      + '<i class="fas fa-plus"></i> Qarz yozish</button></div>';
    if (sdb.length) {
      sdb.forEach(function (r) {
        h += '<div class="rc-card" style="padding:11px 13px' + (r.is_closed ? ';opacity:.55' : '') + '">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">'
          + '<b style="font-size:13.5px">' + (_ICO[r.type] || '📌') + ' ' + Utils.esc(r.name)
          + (r.is_auto ? ' <span class="rc-chip" style="font-size:9.5px;padding:1px 6px;background:var(--sfc2);color:var(--mut)">avtomatik</span>' : '') + '</b>'
          + '<b style="font-size:14px;color:var(--danger);white-space:nowrap">' + Utils.money(r.remaining) + '</b></div>'
          + '<div style="font-size:11px;color:var(--mut);margin-top:3px;line-height:1.6">'
          + Utils.esc(r.type_label) + ' · 📅 ' + Utils.date(r.taken_date)
          + (parseInt(r.paid) ? ' · to‘landi ' + Utils.money(r.paid) : '')
          + (r.note ? '<br>💬 ' + Utils.esc(r.note) : '')
          + (r.debtor ? '<br>👤 Qarzdor: ' + Utils.esc(r.debtor) : '')
          + '</div></div>';
      });
    } else {
      h += '<div style="font-size:12px;color:var(--mut);padding:6px 2px 2px">Bu buyurtma bo‘yicha qarz yo‘q</div>';
    }

    // ── 🔻 BUYURTMADAN CHIQARILGANLAR (2026-08-15, §S3) ─────────────────
    // Qachon · nega · chiqarilgan paytda unga qancha tegardi. Jurnal
    // append-only — bu yozuv hech qachon o'chmaydi/o'zgarmaydi.
    var rmv = d.removed_partners || [];
    if (rmv.length) {
      h += '<div style="font-weight:800;font-size:14px;padding:4px 2px 0">🔻 Buyurtmadan chiqarilganlar</div>';
      rmv.forEach(function (r) {
        h += '<div class="rc-card" style="padding:12px 14px;border-left:3px solid var(--pch)">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">'
          + '<b style="font-size:13.5px;min-width:0">' + Utils.esc(r.name) + '</b>'
          + '<span style="font-size:11px;color:var(--mut);white-space:nowrap">' + Utils.date(r.at) + '</span></div>'
          + (r.reason ? '<div style="font-size:12px;color:var(--mut);margin-top:4px">Sabab: <b>'
                        + Utils.esc(r.reason) + '</b></div>' : '')
          + '<div style="font-size:12px;color:var(--mut);margin-top:4px">Chiqarilgan paytda tegishi bo‘lgan: '
          + '<b style="color:var(--lav-text)">' + Utils.esc(r.was) + '</b> → endi <b>0</b></div>'
          + (r.by ? '<div style="font-size:10.5px;color:var(--mut);margin-top:4px">Chiqargan: '
                    + Utils.esc(r.by) + '</div>' : '')
          + '</div>';
      });
    }

    if (d.transactions && d.transactions.length) {
      h += '<div style="font-weight:800;font-size:14px;padding:4px 2px 0">Tranzaksiyalar</div>';
      d.transactions.slice(0, 20).forEach(function (t) {
        var inc = t.record_type === 'income';
        h += '<div class="rc-card" style="display:flex;align-items:center;gap:12px;padding:12px 14px">';
        h += '<div style="width:40px;height:40px;border-radius:14px;background:' + (inc ? 'var(--acc)' : 'var(--pch)') + ';color:var(--acc-ink);display:flex;align-items:center;justify-content:center;font-size:15px;flex:none">' + (inc ? '↗' : '↘') + '</div>';
        h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">' + (inc ? 'Kirim' : 'Chiqim') + '</div>';
        var sub = Utils.esc(t.description || t.stage_name || t.category || '');
        if (sub) h += '<div style="font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + sub + '</div>';
        h += '</div>';
        h += '<div style="text-align:right"><div style="font-size:13px;font-weight:800;color:' + (inc ? 'var(--acc)' : 'var(--danger)') + '">' + (inc ? '+' : '-') + Utils.money(t.amount) + '</div>';
        h += '<div style="font-size:10px;color:var(--mut)">' + Utils.date(t.date) + '</div></div></div>';
        // ── Sherikli rasxod: kim to'ladi / kim qarzdor (2026-08-15 §F4) ──
        var sp = t.expense_split || [];
        if (sp.length) {
          h += '<div style="margin:-6px 2px 0;padding:8px 12px;background:var(--sfc2);'
            + 'border-radius:0 0 12px 12px;font-size:11px;color:var(--mut);line-height:1.7">';
          sp.forEach(function (r) {
            h += '<div>' + (r.is_payer ? '💵 ' : '🧾 ') + Utils.esc(r.name) + ' · ' + r.percent + '% · '
              + Utils.money(r.amount)
              + (r.is_payer ? ' <b style="color:var(--txt)">(to‘ladi)</b>'
                            : (r.has_debt ? ' <span style="color:var(--danger)">(qarz)</span>' : ''))
              + '</div>';
          });
          h += '</div>';
        }
      });
    } else {
      h += '<div class="rc-empty"><div class="rc-empty-ic">💸</div><div>Tranzaksiyalar yo\'q</div></div>';
    }
    return h;
  },

  // ═══ ETAP ═══
  _tabEtap: function (d) {
    var esc = Utils.esc, h = '';
    var canComplete = d.is_owner || d.user_role === 'manager' || d.can_complete_stage;
    var canEdit = d.is_owner || d.user_role === 'manager';

    // Yangi etap qo'shish (owner/manager)
    if (canEdit && d.stages && d.stages.length) {
      h += '<button class="rc-btn rc-btn-sm" style="width:100%;margin-bottom:4px" onclick="RcOrderDetail.addStage()"><i class="fas fa-plus"></i> Yangi etap</button>';
    }

    if (d.stages && d.stages.length) {
      d.stages.forEach(function (s, i) {
        var done = s.status === 'completed', skipped = s.status === 'skipped';
        var active = !done && !skipped;
        var stLabel = done ? 'Bajarildi' : skipped ? "O'tkazildi" : 'Jarayonda';
        var stBg = done ? 'var(--acc)' : skipped ? 'var(--sfc2)' : 'var(--cyan)';
        var stInk = skipped ? 'var(--mut)' : 'var(--acc-ink)';
        var op = (done || skipped) ? 'opacity:.72;' : '';
        h += '<div class="rc-card" style="' + op + 'display:flex;gap:14px;padding:14px 16px;animation-delay:' + (i * .05) + 's">';
        h += '<div style="width:6px;border-radius:99px;background:' + (s.color || 'var(--acc)') + ';flex:none"></div>';
        h += '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px">';
        h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">';
        h += '<div style="font-weight:700;font-size:14px;min-width:0"><span style="margin-right:4px">' + esc(s.icon) + '</span>' + esc(s.title) + '</div>';
        h += '<span class="rc-badge" style="background:' + stBg + ';color:' + stInk + ';flex:none">' + stLabel + '</span></div>';
        if (s.assigned_to) h += '<div style="font-size:11px;color:var(--mut)">👤 ' + esc(s.assigned_to.full_name) + '</div>';
        // Chiqim
        if (s.total_expense && s.total_expense !== '0') {
          h += '<div style="font-size:11px;color:var(--danger)">💰 Chiqim: ' + Utils.money(s.total_expense);
          if (s.estimated_cost && s.estimated_cost !== '0') h += ' / ' + Utils.money(s.estimated_cost);
          h += '</div>';
        }
        // Checklist (bosiladigan)
        if (s.checklist && s.checklist.length) {
          h += '<div style="display:flex;flex-direction:column;gap:6px;margin-top:2px">';
          s.checklist.forEach(function (it) {
            var ic = it.is_done ? '✅' : '⬜';
            var stl = it.is_done ? 'text-decoration:line-through;color:var(--mut)' : '';
            // Tugallangan (is_done) checkboxlar BOSILMAYDI — faqat belgilanmaganini belgilash mumkin
            var clickable = canComplete && !it.is_done;
            var clk = clickable ? 'cursor:pointer' : 'cursor:default';
            var oc = clickable ? ' onclick="RcOrderDetail.checkItem(' + s.id + ',' + it.id + ')"' : '';
            h += '<div style="display:flex;align-items:center;gap:8px;font-size:12px;' + clk + '"' + oc + '><span>' + ic + '</span><span style="' + stl + '">' + esc(it.title) + '</span></div>';
          });
          h += '</div>';
        }
        if (s.note) h += '<div style="font-size:11px;color:var(--mut)">' + esc(s.note) + '</div>';
        if (done && s.completed_by) h += '<div style="font-size:10px;color:var(--mut)">✅ ' + esc(s.completed_by.full_name) + ' · ' + Utils.timeAgo(s.completed_at) + '</div>';

        // Amal tugmalari
        var acts = [];
        if (active && canComplete) acts.push('<button class="rc-btn rc-btn-sm" onclick="RcOrderDetail.completeStage(' + s.id + ')"><i class="fas fa-check"></i> Tugatish</button>');
        if (active && canEdit) acts.push('<button class="rc-btn-ghost rc-btn-sm" onclick="RcOrderDetail.skipStage(' + s.id + ')"><i class="fas fa-forward"></i></button>');
        if (!active && canEdit) acts.push('<button class="rc-btn-ghost rc-btn-sm" onclick="RcOrderDetail.reopenStage(' + s.id + ')"><i class="fas fa-undo"></i> Qayta ochish</button>');
        if (s.is_mebelcity && canEdit) acts.push('<button class="rc-btn-ghost rc-btn-sm" onclick="RcOrderDetail.linkMc(' + s.id + ')"><i class="fas fa-link"></i> Buyurtma</button>');
        if (canEdit) acts.push('<button class="rc-btn-ghost rc-btn-sm" style="color:var(--danger)" onclick="RcOrderDetail.delStage(' + s.id + ')"><i class="fas fa-trash"></i></button>');
        if (acts.length) h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">' + acts.join('') + '</div>';

        h += '</div></div>';

        // MebelCity ichki karta (cyan)
        if (s.is_mebelcity && s.mc_info) {
          var mc = s.mc_info;
          h += '<div style="background:var(--cyan);color:var(--acc-ink);border-radius:var(--radius-md);padding:16px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:10px">';
          h += '<div style="display:flex;align-items:center;justify-content:space-between">';
          h += '<div style="font-weight:800;font-size:14px">🏭 MebelCity #' + esc(mc.order_hash) + '</div>';
          h += '<span style="font-size:11px;font-weight:800;background:rgba(0,0,0,.12);border-radius:999px;padding:4px 10px">' + mc.progress + '%</span></div>';
          h += '<div style="height:7px;border-radius:99px;background:rgba(0,0,0,.12);overflow:hidden"><div style="height:100%;border-radius:99px;background:var(--acc-ink);width:' + mc.progress + '%"></div></div>';
          h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">';
          h += '<span style="font-size:12px;opacity:.72;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(mc.current_step || mc.delivery_label || '—') + '</span>';
          if (mc.total_sum) h += '<span style="font-size:13px;font-weight:800;flex:none">' + Utils.money(mc.total_sum) + '</span>';
          h += '</div>';
          // To'liq ko'rish — MebelCity'ning O'Z (katta ERP) jamoat kuzatuv
          // sahifasiga to'g'ridan-to'g'ri o'tkazadi (login talab qilmaydi,
          // 2026-08-28 foydalanuvchi: "katta ERPga o'tkazib yuborish kere").
          // Brauzerning o'z "Orqaga" tugmasi bilan qaytadi.
          if (mc.order_hash) h += '<a class="rc-btn-ghost rc-btn-sm" style="width:100%;background:rgba(0,0,0,.12);border-color:transparent;color:var(--acc-ink);display:block;text-align:center;text-decoration:none" href="https://mebelcity.bittada.uz/order/' + esc(mc.order_hash) + '/"><i class="fas fa-external-link-alt"></i> To\'liq ko\'rish</a>';
          // Uzish — 2026-08-28, foydalanuvchi: zakaz ICHIDA (Etaplar tab,
          // shu cyan karta) uzish tugmasi umuman yo'q edi, faqat ro'yxat
          // kartasida va #/mebelcity'da bor edi. Endi shu yerda ham bor —
          // mavjud linkMc(stageId) modalini ochadi (Ro'yxat/Kalendar,
          // hozir ulangani ko'k rangda ko'rinadi, tanlovni bekor qilib
          // "Ulash" bossa — uzadi, wasLinked tekshiruvi orqali).
          if (canEdit) h += '<button class="rc-btn-ghost rc-btn-sm" style="width:100%;background:rgba(0,0,0,.12);border-color:transparent;color:var(--acc-ink)" onclick="RcOrderDetail.linkMc(' + s.id + ')"><i class="fas fa-unlink"></i> Uzish / boshqasiga ulash</button>';
          h += '</div>';
        }
      });
    } else {
      h += '<div class="rc-card rc-empty"><div class="rc-empty-ic">📋</div><div style="font-weight:700;color:var(--txt)">Etaplar yo\'q</div>';
      if (canEdit) {
        h += '<div style="margin-top:4px">Shablon qo\'llang yoki qo\'lda etap qo\'shing</div>';
        h += '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px">';
        if (d.templates && d.templates.length) h += '<button class="rc-btn rc-btn-sm" onclick="RcOrderDetail.applyTemplate()">Shablon qo\'llash</button>';
        h += '<button class="rc-btn-ghost rc-btn-sm" onclick="RcOrderDetail.addStage()"><i class="fas fa-plus"></i> Yangi etap</button>';
        h += '</div>';
      }
      h += '</div>';
    }
    return h;
  },

  // ═══ FAYL ═══
  _tabFayl: function (d) {
    var esc = Utils.esc, h = '';
    var files = d.files || [];
    var canUp = d.is_owner || d.user_role === 'manager';

    // Bazis smeta (BOM) — _afterPaint to'ldiradi
    h += '<div id="rc-bom" style="margin-bottom:4px"></div>';

    // Oblaka havolalar — Bazis oblaka / VR 3D model (2026-09-04, fayl grid'
    // dan ALOHIDA, yuqorida — foydalanuvchi so'rovi bo'yicha). Bosilganda
    // addLink(kind) oynasi ochiladi. Saqlangan havolalar pastda ALOHIDA
    // ro'yxatda (Vizualizatsiya sahifasidagi kartochka uslubiga o'xshash —
    // nom + "Ochish" tugmasi), oddiy fayl grid'iga aralashmaydi.
    if (canUp) {
      h += '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">';
      h += '<button class="rc-btn-ghost rc-btn-sm" style="flex:1;min-width:140px" onclick="RcOrderDetail.addLink(\'bazis\')"><i class="fas fa-cloud"></i> Bazis oblaka link</button>';
      h += '<button class="rc-btn-ghost rc-btn-sm" style="flex:1;min-width:140px" onclick="RcOrderDetail.addLink(\'vr\')"><i class="fas fa-vr-cardboard"></i> VR 3D model link</button>';
      h += '</div>';
      // 2026-09-04 (TZ-Detal-QR-2026-09.md) — Bazisdan eksport qilingan 3D
      // rasmni yuklab, avtomatik QR-kod + jamoat sahifa yaratish.
      h += '<div style="margin-bottom:14px">';
      h += '<button class="rc-btn-ghost rc-btn-sm" style="width:100%" onclick="RcOrderDetail.openDetalQr()"><i class="fas fa-qrcode"></i> Detal QR yaratish</button>';
      h += '</div>';
    }

    var linkFiles = files.filter(function (f) { return f.file_type === 'link'; });
    var mediaFiles = files.filter(function (f) { return f.file_type !== 'link'; });

    if (linkFiles.length) {
      h += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">';
      linkFiles.forEach(function (f) {
        var isVr = /vr|3d/i.test(f.file_name || '');
        h += '<div class="rc-card" style="display:flex;align-items:center;gap:12px;padding:10px 12px">';
        h += '<div style="width:44px;height:44px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;font-size:20px;background:' + (isVr ? 'var(--lav)' : 'var(--cyan)') + ';color:var(--acc-ink)">' + (isVr ? '🕶️' : '☁️') + '</div>';
        h += '<div style="flex:1;min-width:0">';
        h += '<div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(f.file_name || 'Havola') + '</div>';
        h += '<div style="font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(f.external_url || f.file_url || '') + '</div>';
        h += '</div>';
        // 2026-09-04: <button onclick>/addEventListener ikkalasi ham
        // ishonchsiz chiqdi (bo'sh about:blank ochilgan) — oddiy <a href
        // target=_blank> eng ishonchli, JS'ga bog'liq emas, brauzer o'zi
        // navigatsiya qiladi.
        h += '<a class="rc-btn rc-btn-sm" style="flex:none;text-decoration:none;display:inline-flex;align-items:center;gap:6px" href="' + esc(f.external_url || f.file_url || '') + '" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> Ochish</a>';
        // Nusxa olish — 2026-09-08, foydalanuvchi so'rovi (link'ni tez ulashish uchun).
        h += '<button class="rc-btn-ghost rc-btn-sm" style="flex:none" title="Havolani nusxalash" onclick="RcOrderDetail.copyLink(\'' + esc(f.external_url || f.file_url || '') + '\')"><i class="fas fa-copy"></i></button>';
        if (canUp) h += '<button class="rc-btn-ghost rc-btn-sm" style="flex:none;color:var(--danger)" onclick="RcOrderDetail.delFile(' + f.id + ')"><i class="fas fa-trash"></i></button>';
        h += '</div>';
      });
      h += '</div>';
    }

    // Detal QR kartochkalari (2026-09-04) — rasm + nom + QR-sahifa havolasi
    var detalCards = d.detal_cards || [];
    if (detalCards.length) {
      h += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">';
      detalCards.forEach(function (c) {
        h += '<div class="rc-card" style="display:flex;align-items:center;gap:12px;padding:10px 12px">';
        if (c.image_url) h += '<img src="' + esc(c.image_url) + '" style="width:44px;height:44px;border-radius:12px;flex:none;object-fit:cover">';
        h += '<div style="flex:1;min-width:0">';
        h += '<div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📦 ' + esc(c.title) + '</div>';
        var cmeta = [];
        if (c.artikul) cmeta.push('Artikul: ' + esc(c.artikul));
        if (c.detal_count) cmeta.push(c.detal_count + ' ta detal');
        if (cmeta.length) h += '<div style="font-size:11px;color:var(--mut)">' + cmeta.join(' · ') + '</div>';
        h += '</div>';
        h += '<a class="rc-btn rc-btn-sm" style="flex:none;text-decoration:none;display:inline-flex;align-items:center;gap:6px" href="' + esc(c.url) + '" target="_blank" rel="noopener"><i class="fas fa-qrcode"></i> QR</a>';
        h += '<button class="rc-btn-ghost rc-btn-sm" style="flex:none" title="Havolani nusxalash" onclick="RcOrderDetail.copyLink(\'' + esc(c.url) + '\')"><i class="fas fa-copy"></i></button>';
        if (canUp) {
          h += '<button class="rc-btn-ghost rc-btn-sm" style="flex:none" onclick="RcOrderDetail.editDetalQr(\'' + esc(c.short_code) + '\',\'' + esc(c.title) + '\',\'' + esc(c.artikul || '') + '\',' + (c.detal_count || 0) + ')"><i class="fas fa-pen"></i></button>';
          h += '<button class="rc-btn-ghost rc-btn-sm" style="flex:none;color:var(--danger)" onclick="RcOrderDetail.deleteDetalQr(\'' + esc(c.short_code) + '\')"><i class="fas fa-trash"></i></button>';
        }
        h += '</div>';
      });
      h += '</div>';
    }

    h += '<div class="rc-grid rc-grid-3">';
    mediaFiles.forEach(function (f, i) {
      var isVid = /video/i.test(f.file_type || '') || /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(f.file_name || '');
      var isImg = /image/i.test(f.file_type || '') || (f.thumbnail_url && !isVid);
      h += '<div style="position:relative">';
      h += '<div onclick="RcOrderDetail.viewFile(' + i + ')" style="aspect-ratio:1;border-radius:18px;overflow:hidden;cursor:pointer;box-shadow:var(--shadow-sm);';
      if ((isImg || isVid) && f.thumbnail_url) {
        h += 'background:#000">';
        h += '<img src="' + esc(f.thumbnail_url) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover">';
        if (isVid) h += '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;padding-left:2px;border:1.5px solid rgba(255,255,255,.5)">▶</span>';
      } else {
        h += 'background:' + RcOrderDetail.FGRAD[i % 4] + ';color:var(--acc-ink);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">';
        h += '<div style="font-size:24px">' + RcOrderDetail._fileIcon(f) + '</div>';
        h += '<div style="font-size:10px;font-weight:700;opacity:.72;padding:0 8px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">' + esc(f.file_name || 'Fayl') + '</div>';
      }
      h += '</div>';
      var furl = f.file_url || f.thumbnail_url || '';
      if (furl) h += '<button onclick="event.stopPropagation();RcOrderDetail.shareFile(\'' + esc(furl) + '\')" style="position:absolute;top:6px;left:6px;width:26px;height:26px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;font-size:11px"><i class="fas fa-share-alt"></i></button>';
      if (canUp) {
        h += '<button onclick="event.stopPropagation();RcOrderDetail.delFile(' + f.id + ')" style="position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;font-size:11px"><i class="fas fa-trash"></i></button>';
      }
      h += '</div>';
    });
    // Qo'shish tile
    if (canUp) {
      h += '<div onclick="RcOrderDetail.uploadFile()" style="aspect-ratio:1;border-radius:18px;border:2px dashed var(--brd2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;color:var(--mut)">';
      h += '<i class="fas fa-plus"></i><div style="font-size:11px;font-weight:700">Qo\'shish</div></div>';
    }
    h += '</div>';
    if (!files.length && !canUp) {
      h += '<div class="rc-empty"><div class="rc-empty-ic">📎</div><div>Fayllar yo\'q</div></div>';
    }
    return h;
  },

  _fileIcon: function (f) {
    if (f.file_type === 'link') return '🔗';
    var n = (f.file_name || '').toLowerCase();
    if (/\.b3d$/.test(n)) return '📐';
    if (/\.(pdf)$/.test(n)) return '📄';
    if (/\.(xls|xlsx|csv)$/.test(n)) return '📊';
    if (/\.(doc|docx)$/.test(n)) return '📝';
    if (/\.(zip|rar|7z)$/.test(n)) return '🗜️';
    if (/\.(mp4|mov|avi)$/.test(n)) return '🎬';
    if (/image/i.test(f.file_type || '')) return '🖼️';
    return '📎';
  },

  // ═══ JAMOA ═══
  _tabJamoa: function (d) {
    var esc = Utils.esc, h = '';
    var perms = d.permissions || [];
    var shares = d.profit_shares || [];

    // A'zolar
    h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:12px">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between"><div style="font-weight:800;font-size:14px">Jamoa a\'zolari</div>';
    if (d.is_owner) h += '<button class="rc-btn-ghost rc-btn-sm" onclick="RcOrderDetail.openPerm()"><i class="fas fa-user-plus"></i></button>';
    h += '</div>';
    if (perms.length) {
      perms.forEach(function (p, i) {
        h += '<div style="display:flex;align-items:center;gap:12px">';
        h += '<div class="rc-avatar" style="width:38px;height:38px;font-size:13px;background:' + RcOrderDetail.AVA[i % 4] + '">' + Utils.initials(p.user.full_name) + '</div>';
        h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.user.full_name) + '</div>';
        h += '<div style="font-size:11px;color:var(--mut)">' + Utils.roleLabel(p.role) + '</div></div>';
        h += '</div>';
      });
    } else {
      h += '<div style="font-size:12px;color:var(--mut);text-align:center;padding:6px">Hali a\'zo qo\'shilmagan</div>';
    }
    h += '</div>';

    // Foyda taqsimot
    if (shares.length && (d.is_owner || d.user_role === 'manager') && !d.money_hidden) {
      var profit = (d.profit !== undefined && d.profit !== null)
      ? (parseInt(d.profit) || 0)
      : ((parseInt(d.total_income) || 0) - (parseInt(d.total_expense) || 0));
      h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:12px">';
      h += '<div style="font-weight:800;font-size:14px">💰 Foyda taqsimot</div>';
      // Split bar
      h += '<div style="display:flex;height:10px;border-radius:99px;overflow:hidden;gap:2px">';
      shares.forEach(function (s, i) {
        h += '<div style="width:' + (parseFloat(s.percent) || 0) + '%;background:' + RcOrderDetail.AVA[i % 4] + ';border-radius:99px"></div>';
      });
      h += '</div>';
      shares.forEach(function (s) {
        var amt = Math.round(profit * (parseFloat(s.percent) || 0) / 100);
        h += '<div style="display:flex;align-items:center;justify-content:space-between;font-size:13px">';
        h += '<span style="font-weight:600">' + esc(s.name || 'Noma\'lum') + '</span>';
        h += '<span><span style="color:var(--mut)">' + s.percent + '%</span> · <span style="font-weight:800;color:var(--acc-text)">' + Utils.money(Math.abs(amt)) + '</span></span></div>';
      });
      h += '</div>';
    }

    // F8.1 (2026-08-03): Pul yechish tarixi — kim, qachon, qancha oldi.
    // Append-only audit-trail (TZ §F9/§H6) — faqat o'qish, tahrirlanmaydi.
    var wdHist = d.withdrawal_history || [];
    if (wdHist.length && (d.is_owner || d.user_role === 'manager') && !d.money_hidden) {
      h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:10px">';
      h += '<div style="font-weight:800;font-size:14px">💸 Pul yechish tarixi</div>';
      wdHist.forEach(function (w) {
        var rev = !!w.reversed;
        h += '<div style="border-bottom:1px solid var(--brd);padding-bottom:8px;margin-bottom:2px'
          + (rev ? ';opacity:.6' : '') + '">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--mut);margin-bottom:4px">';
        h += '<span>' + Utils.date(w.created_at) + '</span>';
        h += '<span style="font-weight:800;color:' + (rev ? 'var(--mut)' : 'var(--acc-text)') + ';'
          + (rev ? 'text-decoration:line-through' : '') + '">' + Utils.money(w.total_profit) + '</span></div>';
        (w.lines || []).forEach(function (ln) {
          h += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0">';
          h += '<span>' + esc(ln.name || 'Noma\'lum') + (ln.user_id ? ' <span style="color:var(--acc-text)" title="Akkauntga bog\'langan">✓</span>' : '') + '</span>';
          h += '<span style="color:var(--mut)">' + ln.percent + '% · ' + Utils.money(ln.amount) + '</span></div>';
        });
        // H6 (2026-08-04): bekor qilish. Yozuv o'chirilmaydi — teskari
        // moliyaviy yozuv yaratiladi, tarix append-only qoladi.
        if (rev) {
          h += '<div style="font-size:11px;color:var(--danger);margin-top:6px">'
            + '↩️ Bekor qilingan' + (w.reverse_note ? ' · ' + esc(w.reverse_note) : '') + '</div>';
        } else if (d.is_owner) {
          h += '<button class="rc-btn-ghost rc-btn-sm" style="color:var(--danger);margin-top:6px;padding:4px 10px" '
            + 'onclick="RcOrderDetail.reverseWithdraw(' + w.id + ')">↩️ Bekor qilish</button>';
        }
        h += '</div>';
      });
      h += '</div>';
    }

    // Ruxsatlar (rol + funksional toggle + o'chirish)
    if (d.is_owner && perms.length) {
      h += '<div class="rc-card" style="display:flex;flex-direction:column;gap:14px">';
      h += '<div style="font-weight:800;font-size:14px">Ruxsatlar</div>';
      perms.forEach(function (p) {
        h += '<div style="display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--brd);padding-bottom:12px">';
        h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">';
        h += '<div style="font-size:13px;font-weight:700;min-width:0">' + esc(p.user.full_name) + '</div>';
        h += '<button class="rc-btn-ghost rc-btn-sm" style="color:var(--danger);padding:3px 8px;flex:none" onclick="RcOrderDetail.delPerm(' + p.id + ')">✕</button></div>';
        h += '<select class="rc-input" style="padding:8px" onchange="RcOrderDetail.setPermRole(' + p.id + ',this.value)">';
        [['viewer', "Ko'ruvchi"], ['worker', 'Ishchi'], ['manager', 'Menejer']].forEach(function (r) { h += '<option value="' + r[0] + '"' + (p.role === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; });
        h += '</select>';
        h += RcOrderDetail._permRow(p.id, 'can_see_money', "💰 Pul ko'rish", !!p.can_see_money);
        h += RcOrderDetail._permRow(p.id, 'can_add_expense', '➖ Chiqim qo\'shish', !!p.can_add_expense);
        h += RcOrderDetail._permRow(p.id, 'can_complete_stage', '✅ Etap tugatish', !!p.can_complete_stage);
        h += '</div>';
      });
      h += '</div>';
    }
    return h;
  },

  _permRow: function (permId, field, label, on) {
    var track = 'width:40px;height:22px;border-radius:99px;flex:none;position:relative;cursor:pointer;background:' + (on ? 'var(--acc)' : 'var(--sfc2)');
    var knob = 'position:absolute;top:2px;' + (on ? 'right:2px' : 'left:2px') + ';width:18px;height:18px;border-radius:50%;background:' + (on ? 'var(--acc-ink)' : 'var(--mut)');
    return '<div style="display:flex;align-items:center;justify-content:space-between">' +
      '<span style="font-size:12px;color:var(--mut)">' + label + '</span>' +
      '<div onclick="RcOrderDetail.togglePerm(' + permId + ',\'' + field + '\')" style="' + track + '"><div style="' + knob + '"></div></div></div>';
  },
};

window.RcOrderDetail = RcOrderDetail;
RC_PAGES['/orders/:id'] = function (p) { RcOrderDetail.render(p.id); };
