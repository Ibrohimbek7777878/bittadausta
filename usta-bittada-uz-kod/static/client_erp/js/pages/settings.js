/* client_erp/js/pages/settings.js — Profile + password + templates */
var Settings = {
    _templates: [],

    render: function() {
        var app = document.getElementById('app');
        app.innerHTML = Skeleton.genericList();
        WS.send('page.settings', {}, function(msg) {
            if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
            WS.send('template.list', {}, function(tmsg) {
                Settings._templates = (tmsg.ok && tmsg.data) ? tmsg.data.templates : [];
                app.innerHTML = Settings.template(msg.data);
                Settings.bind();
            });
        });
    },

    template: function(u) {
        var h = '<h2 style="font-size:18px;margin:0 0 14px">Sozlamalar</h2>';

        // Profile card
        var level = u.vip_level;
        h += '<div class="ce-card" style="padding:16px;margin-bottom:16px">';
        h += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">';
        h += '<div style="width:56px;height:56px;font-size:22px;background:'+(level?level.color:'var(--secondary)')+';color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600">';
        h += level ? Utils.esc(level.icon) : Utils.initials(u.full_name);
        h += '</div><div><div style="font-weight:600;font-size:16px">'+Utils.esc(u.full_name)+'</div>';
        h += '<div style="font-size:12px;color:var(--text-muted)">@'+Utils.esc(u.username)+'</div>';
        h += '</div></div>';

        h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">';
        h += '<div style="text-align:center"><div style="font-size:10px;color:var(--text-muted)">XP</div><div style="font-weight:700">'+u.xp+'</div></div>';
        h += '<div style="text-align:center"><div style="font-size:10px;color:var(--text-muted)">Tangalar</div><div style="font-weight:700">'+u.coins+'</div></div>';
        h += '<div style="text-align:center"><div style="font-size:10px;color:var(--text-muted)">Streak</div><div style="font-weight:700">🔥 '+u.streak_days+'</div></div>';
        h += '</div>';
        if (u.phone) h += '<div style="font-size:13px;margin-top:10px;color:var(--text-muted)"><i class="fas fa-phone" style="margin-right:6px"></i>'+Utils.esc(u.phone)+'</div>';
        if (u.organization) h += '<div style="font-size:13px;margin-top:4px;color:var(--text-muted)"><i class="fas fa-building" style="margin-right:6px"></i>'+Utils.esc(u.organization)+'</div>';
        h += '</div>';

        // Stage templates
        h += '<div class="ce-card" style="padding:16px;margin-bottom:16px">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
        h += '<h3 style="font-size:14px;margin:0">📋 Etap shablonlari</h3>';
        h += '<button class="ce-btn ce-btn-primary" id="btn-add-tmpl" style="font-size:12px;padding:6px 12px"><i class="fas fa-plus"></i> Yangi</button>';
        h += '</div>';
        h += '<div id="tmpl-list">';
        if (!Settings._templates.length) {
            h += '<div style="font-size:13px;color:var(--text-muted);text-align:center;padding:16px">Shablonlar yo\'q</div>';
        } else {
            Settings._templates.forEach(function(t) {
                h += '<div class="ce-card" style="padding:10px;margin-bottom:6px;border:1px solid var(--border)">';
                h += '<div style="display:flex;justify-content:space-between;align-items:center">';
                h += '<div>';
                h += '<div style="font-size:13px;font-weight:600">'+Utils.esc(t.name);
                if (t.is_default) h += ' <span style="font-size:10px;padding:1px 6px;border-radius:8px;background:var(--accent);color:#fff">Tizim</span>';
                h += '</div>';
                h += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">';
                var totalCost = 0;
                t.items.forEach(function(item, i) {
                    if (i > 0) h += ' → ';
                    h += Utils.esc(item.icon) + ' ' + Utils.esc(item.title);
                    totalCost += item.estimated_cost || 0;
                });
                h += '</div>';
                var info = [];
                if (totalCost) info.push('💰 ' + Utils.money(totalCost));
                var totalChecklist = t.items.reduce(function(s,it){return s+(it.checklist?it.checklist.length:0)},0);
                if (totalChecklist) info.push('✅ ' + totalChecklist + ' band');
                var hasMC = t.items.some(function(it){return it.is_mebelcity});
                if (hasMC) info.push('🏭 MC');
                if (info.length) h += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">'+info.join(' · ')+'</div>';
                h += '</div>';
                if (!t.is_default) {
                    h += '<div style="display:flex;gap:4px">';
                    h += '<button class="ce-btn ce-btn-secondary tmpl-edit" data-id="'+t.id+'" style="font-size:11px;padding:4px 8px"><i class="fas fa-edit"></i></button>';
                    h += '<button class="ce-btn tmpl-del" data-id="'+t.id+'" style="font-size:11px;padding:4px 8px;color:var(--danger)"><i class="fas fa-trash"></i></button>';
                    h += '</div>';
                }
                h += '</div></div>';
            });
        }
        h += '</div></div>';

        // Password change
        h += '<div class="ce-card" style="padding:16px">';
        h += '<h3 style="font-size:14px;margin:0 0 12px">Parolni o\'zgartirish</h3>';
        h += '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Hozirgi parol</label><input type="password" id="pwd-current" class="ce-input" style="width:100%"></div>';
        h += '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Yangi parol</label><input type="password" id="pwd-new" class="ce-input" style="width:100%"></div>';
        h += '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Takrorlang</label><input type="password" id="pwd-confirm" class="ce-input" style="width:100%"></div>';
        h += '<button class="ce-btn ce-btn-primary" id="btn-change-pwd" style="width:100%">O\'zgartirish</button>';
        h += '</div>';

        // Admin bo'limi — faqat adminlarga (2026-09-23, additive)
        h += Settings._adminCard(u);

        // Danger zone — akkountni butunlay o'chirish
        h += '<div class="ce-card" style="padding:16px;border:1px solid var(--danger,#dc2626)">';
        h += '<h3 style="font-size:14px;margin:0 0 8px;color:var(--danger,#dc2626)"><i class="fas fa-triangle-exclamation"></i> Xavfli zona</h3>';
        h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.5">Akkountni o\'chirsangiz, barcha buyurtma, moliya, mijoz va fayllaringiz <b>butunlay</b> o\'chadi. Bu amalni <b>qaytarib bo\'lmaydi</b>. Qaytadan kirish uchun Telegram orqali yangi akkaunt ochishingiz mumkin.</div>';
        h += '<button class="ce-btn" id="btn-delete-account" style="width:100%;background:var(--danger,#dc2626);color:#fff;border:none"><i class="fas fa-trash"></i> Akkountni butunlay o\'chirish</button>';
        h += '</div>';

        return h;
    },

    bind: function() {
        // Admin bo'limi (2026-09-23, additive — admin bo'lmasa jim chiqadi)
        try { Settings._adminBind(); } catch (e) {}
        // Password
        var btn = document.getElementById('btn-change-pwd');
        if (btn) btn.onclick = function() {
            var current = document.getElementById('pwd-current').value;
            var newPwd = document.getElementById('pwd-new').value;
            var confirm = document.getElementById('pwd-confirm').value;
            if (!current) return Toast.error('Hozirgi parolni kiriting');
            if (newPwd.length < 4) return Toast.error('Yangi parol kamida 4 ta belgi');
            if (newPwd !== confirm) return Toast.error('Parollar mos kelmadi');
            WS.send('settings.password', {current: current, new: newPwd}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Toast.success('Parol o\'zgartirildi');
                document.getElementById('pwd-current').value = '';
                document.getElementById('pwd-new').value = '';
                document.getElementById('pwd-confirm').value = '';
            });
        };

        // Templates
        var addBtn = document.getElementById('btn-add-tmpl');
        if (addBtn) addBtn.onclick = function() { Settings._openTmplEditor(null); };

        document.querySelectorAll('.tmpl-edit').forEach(function(b) {
            b.onclick = function() {
                var id = parseInt(b.dataset.id);
                var tmpl = Settings._templates.find(function(t){return t.id===id});
                if (tmpl) Settings._openTmplEditor(tmpl);
            };
        });

        document.querySelectorAll('.tmpl-del').forEach(function(b) {
            b.onclick = function() {
                if (!confirm('Shablonni o\'chirasizmi?')) return;
                WS.send('template.delete', {id: parseInt(b.dataset.id)}, function(msg) {
                    if (!msg.ok) return Toast.error(msg.error);
                    Toast.success('O\'chirildi');
                    Settings.render();
                });
            };
        });

        // Danger zone — akkountni o'chirish
        var delBtn = document.getElementById('btn-delete-account');
        if (delBtn) delBtn.onclick = function() { Settings._confirmDeleteAccount(); };
    },

    // Ikki qavat tasdiq: parol + "OCHIRISH" so'zi
    _confirmDeleteAccount: function() {
        var body = '';
        body += '<div style="font-size:13px;color:var(--danger,#dc2626);font-weight:600;margin-bottom:12px"><i class="fas fa-triangle-exclamation"></i> Bu amal QAYTARIB BO\'LMAYDI</div>';
        body += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;line-height:1.5">Barcha buyurtma, moliya, mijoz va fayllaringiz butunlay o\'chadi.</div>';
        body += '<div style="margin-bottom:10px"><label style="font-size:12px;color:var(--text-muted)">Parolingiz</label><input type="password" id="da-pwd" class="ce-input" style="width:100%" autocomplete="current-password"></div>';
        body += '<div style="margin-bottom:4px"><label style="font-size:12px;color:var(--text-muted)">Tasdiqlash uchun <b>OCHIRISH</b> deb yozing</label><input type="text" id="da-confirm" class="ce-input" style="width:100%" autocomplete="off" placeholder="OCHIRISH"></div>';

        Modal.open('Akkountni o\'chirish', body, {
            footer: '<button class="ce-btn" id="da-submit" style="background:var(--danger,#dc2626);color:#fff;border:none">Butunlay o\'chirish</button>'
        });

        setTimeout(function() {
            var submit = document.getElementById('da-submit');
            if (!submit) return;
            submit.onclick = function() {
                var pwd = (document.getElementById('da-pwd') || {}).value || '';
                var conf = (document.getElementById('da-confirm') || {}).value || '';
                if (!pwd) return Toast.error('Parolni kiriting');
                if (conf.trim().toUpperCase() !== 'OCHIRISH') return Toast.error('Tasdiqlash uchun OCHIRISH deb yozing');
                submit.disabled = true;
                submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                WS.send('settings.delete_account', {password: pwd}, function(msg) {
                    if (!msg.ok) {
                        submit.disabled = false;
                        submit.textContent = 'Butunlay o\'chirish';
                        return Toast.error(msg.error || 'Xatolik');
                    }
                    Toast.success('Akkount o\'chirildi');
                    window.location.href = '/mini/logout/';
                });
            };
            var pwdInp = document.getElementById('da-pwd');
            if (pwdInp) pwdInp.focus();
        }, 50);
    },

    _ICONS: ['📋','📐','🪚','🔨','🎨','✂️','📦','🚚','🔧','✅','🏭','💰','📸','🧹','🪑','🛋️','🚪','🪟','💡','🧱','🔩','📏','🖌️','🪵','🧰','⚡'],
    _COLORS: ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b'],

    _openTmplEditor: function(tmpl) {
        var items = tmpl ? tmpl.items.map(function(it){
            return {title:it.title, icon:it.icon, color:it.color, note:it.note||'', estimated_cost:it.estimated_cost||0, is_mebelcity:it.is_mebelcity||false, checklist:it.checklist||[]};
        }) : [{title:'', icon:'📋', color:'#6366f1', note:'', estimated_cost:0, is_mebelcity:false, checklist:[]}];
        var icons = Settings._ICONS;
        var colors = Settings._COLORS;

        function newItem() { return {title:'', icon:'📋', color:'#6366f1', note:'', estimated_cost:0, is_mebelcity:false, checklist:[]}; }

        function renderItems() {
            var h = '';
            items.forEach(function(item, i) {
                h += '<div class="te-item" data-i="'+i+'" style="border:1px solid var(--border);border-radius:10px;margin-bottom:8px;overflow:hidden">';
                // Header
                h += '<div class="te-header" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg);cursor:pointer" data-i="'+i+'">';
                h += '<span class="te-icon-preview" style="font-size:18px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:'+(item.color||'#6366f1')+'20;flex-shrink:0">'+item.icon+'</span>';
                h += '<div style="flex:1;min-width:0">';
                h += '<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(item.title || '<span style="color:var(--text-muted)">Yangi etap...</span>')+'</div>';
                var meta = [];
                if (item.estimated_cost) meta.push(Utils.money(item.estimated_cost)+' so\'m');
                if (item.checklist.length) meta.push(item.checklist.length+' ta band');
                if (item.is_mebelcity) meta.push('🏭 MC');
                if (meta.length) h += '<div style="font-size:10px;color:var(--text-muted)">'+meta.join(' · ')+'</div>';
                h += '</div>';
                h += '<div style="display:flex;gap:2px;flex-shrink:0">';
                if (i > 0) h += '<button class="te-move" data-i="'+i+'" data-dir="-1" style="background:none;border:none;cursor:pointer;font-size:12px;padding:4px;color:var(--text-muted)" title="Yuqoriga">▲</button>';
                if (i < items.length - 1) h += '<button class="te-move" data-i="'+i+'" data-dir="1" style="background:none;border:none;cursor:pointer;font-size:12px;padding:4px;color:var(--text-muted)" title="Pastga">▼</button>';
                h += '<button class="te-del" data-i="'+i+'" style="background:none;border:none;cursor:pointer;font-size:12px;padding:4px;color:var(--danger);opacity:'+(items.length<=1?'0.3':'1')+'" '+(items.length<=1?'disabled':'')+'>✕</button>';
                h += '<span class="te-toggle" data-i="'+i+'" style="font-size:12px;padding:4px;color:var(--text-muted);cursor:pointer">▼</span>';
                h += '</div></div>';
                // Expanded form (hidden by default)
                h += '<div class="te-body" id="te-body-'+i+'" style="display:none;padding:10px 12px;border-top:1px solid var(--border)">';
                // Name
                h += '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-muted)">Nom *</label>';
                h += '<input type="text" class="ce-input te-title" data-i="'+i+'" value="'+Utils.esc(item.title)+'" placeholder="Etap nomi" style="width:100%;font-size:13px"></div>';
                // Icon picker
                h += '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-muted)">Emoji</label>';
                h += '<div style="display:flex;flex-wrap:wrap;gap:3px">';
                icons.forEach(function(ic) {
                    var sel = item.icon === ic;
                    h += '<span class="te-ic" data-i="'+i+'" data-icon="'+ic+'" style="font-size:18px;cursor:pointer;padding:3px;border-radius:6px;'+(sel?'background:var(--accent);':'')+'">'+ic+'</span>';
                });
                h += '</div></div>';
                // Color picker
                h += '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-muted)">Rang</label>';
                h += '<div style="display:flex;flex-wrap:wrap;gap:5px">';
                colors.forEach(function(c) {
                    var sel = item.color === c;
                    h += '<span class="te-cl" data-i="'+i+'" data-color="'+c+'" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:'+c+';cursor:pointer;border:'+(sel?'3px solid var(--text)':'2px solid transparent')+'"></span>';
                });
                h += '</div></div>';
                // Note
                h += '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-muted)">Izoh</label>';
                h += '<input type="text" class="ce-input te-note" data-i="'+i+'" value="'+Utils.esc(item.note)+'" placeholder="Qo\'shimcha izoh..." style="width:100%;font-size:12px"></div>';
                // Cost
                h += '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-muted)">Taxminiy xarajat</label>';
                h += '<input type="number" class="ce-input te-cost" data-i="'+i+'" value="'+(item.estimated_cost||'')+'" placeholder="0" style="width:100%;font-size:12px"></div>';
                // Checklist
                h += '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-muted)">Checklist (har biri yangi qator)</label>';
                h += '<textarea class="ce-input te-checklist" data-i="'+i+'" rows="3" style="width:100%;font-size:12px" placeholder="1-band\n2-band\n3-band">'+(item.checklist||[]).join('\n')+'</textarea></div>';
                // MebelCity flag
                h += '<label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" class="te-mc" data-i="'+i+'"'+(item.is_mebelcity?' checked':'')+' > 🏭 MebelCity etapi</label>';
                h += '</div></div>';
            });
            return h;
        }

        function renderPreview() {
            if (!items.length) return '';
            var h = '<div style="display:flex;align-items:center;gap:0;margin-top:12px;padding:8px 0;overflow-x:auto">';
            items.forEach(function(item, i) {
                if (i > 0) h += '<span style="color:var(--text-muted);font-size:12px;margin:0 4px">→</span>';
                h += '<span style="display:inline-flex;align-items:center;gap:3px;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:500;background:'+(item.color||'#6366f1')+'18;color:'+(item.color||'#6366f1')+';white-space:nowrap;border:1px solid '+(item.color||'#6366f1')+'30">';
                h += item.icon + ' ' + Utils.esc(item.title || 'Etap '+(i+1));
                h += '</span>';
            });
            h += '</div>';
            return h;
        }

        Modal.open(tmpl ? 'Shablonni tahrirlash' : 'Yangi shablon',
            '<div style="margin-bottom:14px"><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Shablon nomi</label><input type="text" id="tmpl-name" class="ce-input" style="width:100%;font-size:15px;font-weight:600" value="'+Utils.esc(tmpl?tmpl.name:'')+'" placeholder="Masalan: Oshxona mebeli"></div>' +
            '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px">Etaplar</label>' +
            '<div id="tmpl-items">' + renderItems() + '</div>' +
            '<button class="ce-btn ce-btn-secondary" id="tmpl-add-item" style="font-size:13px;padding:8px 14px;margin-top:4px;width:100%;border-style:dashed"><i class="fas fa-plus"></i> Etap qo\'shish</button>' +
            '<div id="tmpl-preview">' + renderPreview() + '</div>',
            {footer: '<button class="ce-btn ce-btn-primary" id="tmpl-save-btn" style="width:100%">Saqlash</button>'});

        function syncItems() {
            document.querySelectorAll('.te-title').forEach(function(el) {
                var idx = parseInt(el.dataset.i);
                if (items[idx]) items[idx].title = el.value;
            });
            document.querySelectorAll('.te-note').forEach(function(el) {
                var idx = parseInt(el.dataset.i);
                if (items[idx]) items[idx].note = el.value;
            });
            document.querySelectorAll('.te-cost').forEach(function(el) {
                var idx = parseInt(el.dataset.i);
                if (items[idx]) items[idx].estimated_cost = parseInt(el.value) || 0;
            });
            document.querySelectorAll('.te-checklist').forEach(function(el) {
                var idx = parseInt(el.dataset.i);
                if (items[idx]) items[idx].checklist = el.value.split('\n').filter(function(l){return l.trim();});
            });
            document.querySelectorAll('.te-mc').forEach(function(el) {
                var idx = parseInt(el.dataset.i);
                if (items[idx]) items[idx].is_mebelcity = el.checked;
            });
        }

        var openIdx = items.length === 1 ? 0 : -1;

        function rebind() {
            var container = document.getElementById('tmpl-items');
            if (container) container.innerHTML = renderItems();
            var preview = document.getElementById('tmpl-preview');
            if (preview) preview.innerHTML = renderPreview();

            // Show open panel
            if (openIdx >= 0) {
                var body = document.getElementById('te-body-'+openIdx);
                if (body) body.style.display = 'block';
            }
            // Toggle expand/collapse
            document.querySelectorAll('.te-header').forEach(function(hdr) {
                hdr.onclick = function(e) {
                    if (e.target.closest('.te-move') || e.target.closest('.te-del')) return;
                    syncItems();
                    var idx = parseInt(hdr.dataset.i);
                    openIdx = openIdx === idx ? -1 : idx;
                    rebind();
                };
            });
            // Icon select
            document.querySelectorAll('.te-ic').forEach(function(b) {
                b.onclick = function(e) {
                    e.stopPropagation();
                    syncItems();
                    items[parseInt(b.dataset.i)].icon = b.dataset.icon;
                    openIdx = parseInt(b.dataset.i);
                    rebind();
                };
            });
            // Color select
            document.querySelectorAll('.te-cl').forEach(function(b) {
                b.onclick = function(e) {
                    e.stopPropagation();
                    syncItems();
                    items[parseInt(b.dataset.i)].color = b.dataset.color;
                    openIdx = parseInt(b.dataset.i);
                    rebind();
                };
            });
            // Delete
            document.querySelectorAll('.te-del').forEach(function(b) {
                b.onclick = function(e) {
                    e.stopPropagation();
                    if (items.length <= 1) return;
                    syncItems();
                    var idx = parseInt(b.dataset.i);
                    items.splice(idx, 1);
                    if (openIdx === idx) openIdx = -1;
                    else if (openIdx > idx) openIdx--;
                    rebind();
                };
            });
            // Move up/down
            document.querySelectorAll('.te-move').forEach(function(b) {
                b.onclick = function(e) {
                    e.stopPropagation();
                    syncItems();
                    var idx = parseInt(b.dataset.i);
                    var dir = parseInt(b.dataset.dir);
                    var newIdx = idx + dir;
                    if (newIdx < 0 || newIdx >= items.length) return;
                    var tmp = items[idx];
                    items[idx] = items[newIdx];
                    items[newIdx] = tmp;
                    if (openIdx === idx) openIdx = newIdx;
                    else if (openIdx === newIdx) openIdx = idx;
                    rebind();
                };
            });
        }
        rebind();

        document.getElementById('tmpl-add-item').onclick = function() {
            syncItems();
            items.push(newItem());
            openIdx = items.length - 1;
            rebind();
        };

        document.getElementById('tmpl-save-btn').onclick = function() {
            syncItems();
            var name = document.getElementById('tmpl-name').value.trim();
            if (!name) return Toast.error('Shablon nomini kiriting');
            var validItems = items.filter(function(it) { return it.title.trim(); });
            if (!validItems.length) return Toast.error('Kamida 1 ta etap kerak');
            WS.send('template.save', {
                id: tmpl ? tmpl.id : null,
                name: name,
                items: validItems.map(function(it) {
                    return {title:it.title.trim(), icon:it.icon, color:it.color, note:it.note||'', estimated_cost:it.estimated_cost||0, is_mebelcity:it.is_mebelcity||false, checklist:it.checklist||[]};
                })
            }, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Shablon saqlandi');
                Settings.render();
            });
        };
    },

    // ── Admin bo'limi (2026-09-23, additive) ─────────────────────────
    // Faqat is_app_admin userlarga ko'rinadi. Havolalarni ilova ichidan
    // o'zgartirish + admin tayinlash/olib tashlash (max 3 ta).
    _adminCard: function(u) {
        if (!u || !u.is_app_admin) return '';
        var h = '<div class="ce-card" id="admin-card" style="padding:16px;border:1px solid var(--acc,#DCF262)">';
        h += '<h3 style="font-size:14px;margin:0 0 12px">🛡 Admin</h3>';
        h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Taklif havolalari (dinamik — kodga tegilmaydi)</div>';
        h += '<div style="margin-bottom:8px"><label style="font-size:11px;color:var(--text-muted)">Play Market</label><input type="text" id="adm-play" class="ce-input" style="width:100%;font-size:12px" placeholder="https://..."></div>';
        h += '<div style="margin-bottom:8px"><label style="font-size:11px;color:var(--text-muted)">Bot</label><input type="text" id="adm-bot" class="ce-input" style="width:100%;font-size:12px" placeholder="https://t.me/..."></div>';
        h += '<button class="ce-btn ce-btn-primary" id="btn-adm-save" style="width:100%;margin-bottom:14px">Saqlash</button>';
        h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Adminlar (<span id="adm-count">…</span>/3)</div>';
        h += '<div id="adm-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"></div>';
        h += '<div style="display:flex;gap:6px"><input type="text" id="adm-new" class="ce-input" style="flex:1;font-size:12px" placeholder="+998..."><button class="ce-btn ce-btn-primary" id="btn-adm-add" style="font-size:12px;white-space:nowrap">+ Admin</button></div>';
        // Tarif boshqaruvi (2026-09-23, additive — server: admin.plans_list/save)
        h += '<div style="font-size:12px;color:var(--text-muted);margin:14px 0 6px">💳 Tariflar (narx/limit)</div>';
        h += '<div id="adm-plans" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"><div style="font-size:12px;color:var(--text-muted)">Yuklanmoqda...</div></div>';
        h += '<button class="ce-btn" id="btn-plan-new" style="width:100%;font-size:12px">+ Yangi tarif</button>';
        h += '</div>';
        return h;
    },

    _adminBind: function() {
        var card = document.getElementById('admin-card');
        if (!card) return;
        WS.send('admin.settings_get', {}, function(msg) {
            if (msg.ok && msg.data) {
                document.getElementById('adm-play').value = msg.data.invite_play_url || '';
                document.getElementById('adm-bot').value = msg.data.invite_bot_url || '';
            }
        });
        function loadAdmins() {
            WS.send('admin.admins_list', {}, function(msg) {
                if (!msg.ok) return;
                var d = msg.data || {};
                document.getElementById('adm-count').textContent = d.count || 0;
                var h = '';
                (d.admins || []).forEach(function(a) {
                    h += '<div class="ce-card" style="padding:8px 10px;display:flex;align-items:center;gap:8px">';
                    h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">' + Utils.esc(a.name) + (a.chief ? ' 👑' : '') + '</div>';
                    h += '<div style="font-size:11px;color:var(--text-muted)">' + Utils.esc(a.phone) + '</div></div>';
                    if (!a.chief) h += '<button class="ce-btn btn-adm-del" data-id="' + a.id + '" style="font-size:10px;padding:4px 8px;background:var(--danger);color:#fff;border:none;border-radius:4px">✕</button>';
                    h += '</div>';
                });
                document.getElementById('adm-list').innerHTML = h || '<div style="font-size:12px;color:var(--text-muted)">Hali admin yo‘q</div>';
                Array.prototype.forEach.call(document.querySelectorAll('.btn-adm-del'), function(b) {
                    b.onclick = function() {
                        Modal.confirm("Adminlikni olish", "Rostdan ham olib tashlaysizmi?", function() {
                            WS.send('admin.admin_remove', {user_id: parseInt(b.dataset.id)}, function(m2) {
                                if (!m2.ok) return Toast.error(m2.error);
                                Toast.success('Olib tashlandi');
                                loadAdmins();
                            });
                        });
                    };
                });
            });
        }
        loadAdmins();
        document.getElementById('btn-adm-save').onclick = function() {
            WS.send('admin.settings_set', {
                invite_play_url: document.getElementById('adm-play').value.trim(),
                invite_bot_url: document.getElementById('adm-bot').value.trim()
            }, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Toast.success('Saqlandi');
            });
        };
        document.getElementById('btn-adm-add').onclick = function() {
            var q = document.getElementById('adm-new').value.trim();
            if (!q) return Toast.error('Telefon/username kiritilmagan');
            WS.send('admin.admin_add', {query: q}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                document.getElementById('adm-new').value = '';
                Toast.success('Admin qo‘shildi');
                loadAdmins();
            });
        };
        // Tariflar (2026-09-23)
        Settings._plansBind();
    },

    // ── Tarif jadvali + forma (server: admin.plans_list / admin.plans_save)
    _plansBind: function() {
        var wrap = document.getElementById('adm-plans');
        if (!wrap) return;
        function money(v) { try { return Number(v || 0).toLocaleString('uz-UZ'); } catch (e) { return v; } }
        function loadPlans() {
            WS.send('admin.plans_list', {}, function(msg) {
                if (!msg.ok) { wrap.innerHTML = '<div style="font-size:12px;color:var(--danger)">' + Utils.esc(msg.error || 'Xatolik') + '</div>'; return; }
                var plans = ((msg.data || {}).plans) || [];
                if (!plans.length) { wrap.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Tarif yo‘q</div>'; return; }
                var h = '';
                plans.forEach(function(p) {
                    h += '<div class="ce-card" style="padding:8px 10px;display:flex;align-items:center;gap:8px' + (p.is_active ? '' : ';opacity:.55') + '">';
                    h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">' + Utils.esc(p.name) + '</div>';
                    h += '<div style="font-size:11px;color:var(--text-muted)">' + money(p.price_uzs) + ' so‘m/oy' + (p.is_free ? ' · bepul' : '') + (p.is_active ? '' : ' · o‘chiq') + '</div></div>';
                    h += '<button class="ce-btn btn-plan-edit" data-id="' + p.id + '" style="font-size:10px;padding:4px 8px">✏️</button>';
                    h += '</div>';
                });
                wrap.innerHTML = h;
                Array.prototype.forEach.call(document.querySelectorAll('.btn-plan-edit'), function(b) {
                    b.onclick = function() {
                        var found = null;
                        plans.forEach(function(p) { if (String(p.id) === String(b.dataset.id)) found = p; });
                        if (found) Settings._planEditModal(found, loadPlans);
                    };
                });
            });
        }
        loadPlans();
        var nb = document.getElementById('btn-plan-new');
        if (nb) nb.onclick = function() { Settings._planEditModal(null, loadPlans); };
    },

    _planEditModal: function(p, cb) {
        p = p || {};
        var lim = p.limits || {};
        function numRow(key, label) {
            var v = (lim[key] === undefined || lim[key] === null) ? '' : lim[key];
            return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><label style="flex:1;font-size:12px;color:var(--text-muted)">' + label + '</label>' +
                '<input type="number" class="ce-input pl-lim" data-k="' + key + '" value="' + v + '" placeholder="∞" style="width:90px;font-size:12px;padding:6px;text-align:center"></div>';
        }
        var body =
            '<div style="margin-bottom:8px"><label style="font-size:12px;color:var(--text-muted)">Nom *</label><input type="text" id="pl-name" class="ce-input" style="width:100%" value="' + Utils.esc(p.name || '') + '"></div>' +
            '<div style="display:flex;gap:8px;margin-bottom:8px">' +
            '<div style="flex:1"><label style="font-size:12px;color:var(--text-muted)">Narx (so‘m/oy)</label><input type="number" id="pl-price" class="ce-input" style="width:100%" value="' + (p.price_uzs === undefined ? '' : p.price_uzs) + '"></div>' +
            '<div style="flex:1"><label style="font-size:12px;color:var(--text-muted)">Muddat (kun)</label><input type="number" id="pl-period" class="ce-input" style="width:100%" value="' + (p.period_days === undefined ? '30' : p.period_days) + '"></div></div>' +
            '<div style="margin-bottom:8px"><label style="font-size:12px;color:var(--text-muted)">Coin grant</label><input type="number" id="pl-coin" class="ce-input" style="width:100%" value="' + (p.coin_grant === undefined ? '' : p.coin_grant) + '"></div>' +
            '<div style="font-size:12px;color:var(--text-muted);margin:6px 0 4px">Limitlar (bo‘sh = cheksiz)</div>' +
            numRow('orders_month', 'Oyiga buyurtmalar') +
            numRow('active_orders', 'Faol buyurtmalar') +
            numRow('customers', 'Mijozlar') +
            numRow('team_members', 'Jamoa a’zolari') +
            numRow('ai_autonomous_daily', 'AI amal/kun') +
            '<div style="margin:8px 0"><label style="font-size:12px;color:var(--text-muted)">Feature keys (vergul bilan)</label><input type="text" id="pl-feats" class="ce-input" style="width:100%;font-size:12px" value="' + Utils.esc((p.feature_keys || []).join(', ')) + '" placeholder="bo‘sh = hammasi ochiq"></div>' +
            '<div style="display:flex;gap:14px;font-size:13px">' +
            '<label><input type="checkbox" id="pl-ai" ' + (p.ai_included ? 'checked' : '') + '> AI bor</label>' +
            '<label><input type="checkbox" id="pl-active" ' + (p.is_active === false ? '' : 'checked') + '> Faol</label></div>';
        Modal.open(p.id ? 'Tarif: ' + Utils.esc(p.name || '') : 'Yangi tarif', body,
            {footer: '<button class="ce-btn ce-btn-primary" id="btn-plan-save">Saqlash</button>'});
        document.getElementById('btn-plan-save').onclick = function() {
            var name = document.getElementById('pl-name').value.trim();
            if (!name) return Toast.error('Nom kiritilmagan');
            var limits = {};
            Array.prototype.forEach.call(document.querySelectorAll('.pl-lim'), function(el) {
                var v = el.value.trim();
                if (v !== '') limits[el.dataset.k] = parseInt(v, 10) || 0;
            });
            var feats = document.getElementById('pl-feats').value.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
            var payload = {
                name: name,
                price_uzs: parseInt(document.getElementById('pl-price').value, 10) || 0,
                period_days: parseInt(document.getElementById('pl-period').value, 10) || 30,
                coin_grant: parseInt(document.getElementById('pl-coin').value, 10) || 0,
                feature_keys: feats,
                limits: limits,
                ai_included: document.getElementById('pl-ai').checked,
                is_active: document.getElementById('pl-active').checked
            };
            if (p.id) payload.id = p.id;
            WS.send('admin.plans_save', payload, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Tarif saqlandi');
                if (cb) cb();
            });
        };
    },
};
