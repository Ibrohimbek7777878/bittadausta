/* client_erp/js/pages/finance.js — Finance page */
var Finance = {
    _data: null,
    _allRecords: [],
    _st: null,        // PeriodFilter holati {period, ym, date_from, date_to}
    _search: '',

    _typeMap: {income:'Kirim',expense:'Chiqim',withdrawal:'Pul yechish',debt_given:'Qarz berish',debt_received:'Qarz olish',debt_paid:"Qarz to'lash"},
    _typeIcon: {income:'↗',expense:'↘',withdrawal:'💰',debt_given:'📤',debt_received:'📥',debt_paid:'✅'},
    _catMap: {material:'Material',service:'Xizmat',transport:'Transport',furniture:'Furnitura',mebelcity:'MebelCity',other:'Boshqa',income_return:"↩ Kirim qaytarish",expense_return:"↩ Chiqim qaytarish"},
    _payMap: {cash:'Naqd',card:'Karta',transfer:"O'tkazma"},

    render: function() {
        var app = document.getElementById('app');
        app.innerHTML = Skeleton.finance();
        Finance._st = PeriodFilter.init();   // default davr: SHU OY
        Finance._search = '';
        Finance._reload();
    },

    // Davr almashtirilsa hammasi BACKEND'dan qayta yuklanadi — kassa/sof foyda/
    // band pul/stats/records aggregate to'liq (100 yozuv chegarasiga bog'liq emas).
    // PeriodFilter.query ym/period ni page.finance ga yuboradi (default SHU OY);
    // page.finance action o'zgarmaydi.
    _reload: function() {
        WS.send('page.finance', PeriodFilter.query(Finance._st), function(msg) {
            if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
            Finance._data = msg.data;
            Finance._allRecords = msg.data.records || [];
            Finance._search = '';
            STATE.finance = msg.data;
            var app = document.getElementById('app');
            app.innerHTML = Finance.template(msg.data);
            Finance.bind();
        });
    },

    // Faqat qidiruv (matn) bo'yicha frontend filtri — davr filtri backendda
    // bajariladi (_reload), shu sabab bu yerda davr mantiqiga hojat yo'q.
    _filtered: function() {
        var records = this._allRecords;
        var search = (this._search || '').toLowerCase().trim();

        if (search) {
            records = records.filter(function(t) {
                var typeLabel = (Finance._typeMap[t.record_type] || t.record_type).toLowerCase();
                var catLabel = (Finance._catMap[t.category] || t.category || '').toLowerCase();
                var payLabel = (Finance._payMap[t.payment_method] || t.payment_method || '').toLowerCase();
                var desc = (t.description || '').toLowerCase();
                var order = (t.order_title || '').toLowerCase();
                var customer = (t.customer_name || '').toLowerCase();
                var recipient = (t.recipient_name || '').toLowerCase();
                var stage = (t.stage_name || '').toLowerCase();
                return typeLabel.indexOf(search) !== -1 ||
                    catLabel.indexOf(search) !== -1 ||
                    payLabel.indexOf(search) !== -1 ||
                    desc.indexOf(search) !== -1 ||
                    order.indexOf(search) !== -1 ||
                    customer.indexOf(search) !== -1 ||
                    recipient.indexOf(search) !== -1 ||
                    stage.indexOf(search) !== -1;
            });
        }

        return records;
    },

    _calcStats: function(records) {
        var income = 0, expense = 0, withdrawal = 0;
        records.forEach(function(t) {
            var a = parseInt(t.amount) || 0;
            if (t.record_type === 'income') income += a;
            else if (t.record_type === 'expense') expense += a;
            else if (t.record_type === 'withdrawal') withdrawal += a;
        });
        // Balans — HAR DOIM backend'ning barcha-vaqt (davr/qidiruvdan mustaqil)
        // qiymatidan olinadi, bu yerda LOKAL qayta hisoblanmaydi. Sabab: Balans
        // joriy kassa qoldig'i (nuqta-vaqt), qidiruv natijasi ustidagi oqim emas —
        // "Pul yechish" (profit-split) moduli shu qiymatga tayanadi.
        var balance = (Finance._data && Finance._data.stats && Finance._data.stats.balance !== undefined)
            ? (parseInt(Finance._data.stats.balance) || 0)
            : (income - expense - withdrawal);
        return {
            total_income: income,
            total_expense: expense,
            total_withdrawal: withdrawal,
            profit: income - expense,
            balance: balance,
        };
    },

    // ── Oylik breakdown (faqat frontend — record date bo'yicha guruh) ──
    _MONTHS: ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'],

    _monthlyStats: function(records) {
        var months = {};
        records.forEach(function(t) {
            var m = String(t.date || t.created_at || '').slice(0, 7); // 'YYYY-MM'
            if (m.length < 7) return;
            if (!months[m]) months[m] = {income:0, expense:0, withdrawal:0};
            var a = parseInt(t.amount) || 0;
            if (t.record_type === 'income') months[m].income += a;
            else if (t.record_type === 'expense') months[m].expense += a;
            else if (t.record_type === 'withdrawal') months[m].withdrawal += a;
        });
        return months;
    },

    _toggleBreakdown: function(metric) {
        var panel = document.getElementById('fin-breakdown');
        if (!panel) return;
        // shu metric ochiq bo'lsa — yop
        if (panel.style.display !== 'none' && panel.dataset.metric === metric) {
            panel.style.display = 'none'; panel.dataset.metric = ''; return;
        }
        // Backend 'monthly' (HAMMA yozuvdan, to'liq) — bo'lmasa frontenddan (zaxira)
        var months = (Finance._data && Finance._data.monthly) ? Finance._data.monthly : Finance._monthlyStats(Finance._filtered());
        var keys = Object.keys(months).sort().reverse(); // yangi oy birinchi
        var meta = {
            income:  ['↗','Kirim','var(--accent)'],
            expense: ['↘','Chiqim','var(--danger)'],
            profit:  ['💰','Foyda','inherit'],
            balance: ['⚖','Balans','var(--accent)']
        };
        var lb = meta[metric] || ['','','inherit'];
        function num(x) { return parseInt(x) || 0; }
        function val(d) {
            if (metric === 'income')  return num(d.income);
            if (metric === 'expense') return num(d.expense);
            if (metric === 'profit')  return num(d.income) - num(d.expense);
            return num(d.income) - num(d.expense) - num(d.withdrawal); // balance
        }
        var total = 0;
        var h = '<div class="ce-card" style="padding:12px">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        h += '<div style="font-weight:700;font-size:13px">' + lb[0] + ' ' + lb[1] + ' — oylik</div>';
        h += '<div id="fin-bd-close" style="cursor:pointer;color:var(--text-muted);font-size:16px;line-height:1">✕</div></div>';
        if (!keys.length) {
            h += '<div style="font-size:12px;color:var(--text-muted)">Ma\'lumot yo\'q</div>';
        } else {
            keys.forEach(function(m) {
                var p = m.split('-');
                var lbl = (Finance._MONTHS[parseInt(p[1],10)-1] || p[1]) + ' ' + p[0];
                var v = val(months[m]); total += v;
                h += '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:13px">';
                h += '<span style="color:var(--text-muted)">📅 ' + lbl + '</span>';
                h += '<span style="font-weight:600;color:' + lb[2] + '">' + Utils.money(v) + '</span></div>';
            });
            h += '<div style="display:flex;justify-content:space-between;padding:8px 0 0;font-weight:700;font-size:13px"><span>Jami</span><span>' + Utils.money(total) + '</span></div>';
        }
        h += '</div>';
        panel.innerHTML = h;
        panel.style.display = '';
        panel.dataset.metric = metric;
        var cl = document.getElementById('fin-bd-close');
        if (cl) cl.onclick = function() { panel.style.display = 'none'; panel.dataset.metric = ''; };
    },

    _bindStatCards: function() {
        document.querySelectorAll('.fin-stat-card').forEach(function(card) {
            card.onclick = function() {
                if (card.dataset.metric === 'profit') Finance._toggleUstalar();
                else Finance._toggleBreakdown(card.dataset.metric);
            };
        });
    },

    template: function(d) {
        var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
        h += '<h2 style="font-size:18px;margin:0">Moliya</h2>';
        h += '<div style="display:flex;gap:6px">';
        h += '<button class="ce-btn ce-btn-primary" id="btn-add-fin" style="font-size:12px;padding:6px 12px"><i class="fas fa-plus"></i> Kirim/Chiqim</button>';
        h += '<button class="ce-btn ce-btn-secondary" id="btn-withdraw" style="font-size:12px;padding:6px 12px">💰 Yechish</button>';
        h += '</div></div>';

        // Professional davr filtri (default: SHU OY) — kassa/sof foyda/stats/records
        h += '<div id="fin-period" style="margin-bottom:12px">' + PeriodFilter.html(Finance._st, d.months) + '</div>';

        // ── YANGI MOLIYA MODELI: Kassa + Sof foyda ──
        h += Finance._kassaHtml(d.kassa);
        h += Finance._sofFoydaHtml(d.sof_foyda, d.wip);

        h += Finance._statsHtml(d.stats);
        h += '<div id="fin-breakdown" style="display:none;margin-bottom:14px"></div>';

        // Tabs
        h += '<div style="display:flex;gap:6px;margin-bottom:14px" id="fin-tabs">';
        h += '<button class="ce-btn ce-btn-secondary fin-tab active" data-tab="records" style="font-size:12px;padding:6px 12px">Tranzaksiyalar</button>';
        h += '<button class="ce-btn fin-tab" data-tab="debts" style="font-size:12px;padding:6px 12px">Qarzlar' + (d.debts && d.debts.length ? ' (' + d.debts.length + ')' : '') + '</button>';
        h += '</div>';

        // Records tab
        h += '<div id="tab-records">';
        // Search
        h += '<div style="margin-bottom:12px"><input type="text" id="fin-search" class="ce-input" style="width:100%;font-size:13px" placeholder="Qidiruv: izoh, turi, kategoriya, mijoz, buyurtma..."></div>';
        // Records list
        h += '<div id="records-list">';
        h += Finance._recordsHtml(d.records);
        h += '</div>';
        h += '</div>';

        // Debts tab
        h += '<div id="tab-debts" style="display:none">';
        h += '<button class="ce-btn ce-btn-secondary" id="btn-add-debt" style="font-size:12px;padding:6px 12px;margin-bottom:10px"><i class="fas fa-plus"></i> Qarz</button>';
        if (!d.debts.length) {
            h += '<div class="ce-empty"><div class="ce-empty-icon">📝</div><p>Qarz yo\'q</p></div>';
        } else {
            d.debts.forEach(function(debt) { h += Finance._debtCard(debt); });
        }
        h += '</div>';

        return h;
    },

    // ── KASSA: oy boshi qoldiq → +kirim −chiqim −yechim → oy oxiri (o'tadi) ──
    _kassaHtml: function(k) {
        k = k || {};
        var money = Utils.money;
        var row = function(label, val, clr, sign) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:13px">' +
                '<span style="color:var(--text-muted)">' + label + '</span>' +
                '<span style="font-weight:700;color:' + (clr || 'inherit') + '">' + (sign || '') + money(val) + '</span></div>';
        };
        var h = '<div class="ce-card" style="padding:14px;margin-bottom:10px">';
        h += '<div style="font-weight:800;font-size:14px;margin-bottom:6px">🏦 Kassa — ' + PeriodFilter.label(Finance._st) + '</div>';
        h += row('Oy boshi qoldiq', k.opening, 'var(--text-muted)');
        h += '<div style="height:1px;background:var(--border)"></div>';
        h += row('Kirim', k.income, 'var(--accent)', '+');
        h += row('Chiqim', k.expense, 'var(--danger)', '−');
        h += row('Pul yechish', k.withdrawal, '#8b5cf6', '−');
        h += '<div style="height:1px;background:var(--border)"></div>';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0 2px">' +
            '<span style="font-weight:800;font-size:14px">Oy oxiri qoldiq</span>' +
            '<span style="font-weight:800;font-size:16px;color:var(--accent)">' + money(k.closing) + " so'm</span></div>";
        h += '<div style="font-size:11px;color:var(--text-muted)">→ keyingi oyga o\'tadi (astatka)</div>';
        h += '</div>';
        return h;
    },

    // ── SOF FOYDA: topshirilgan buyurtmalar (kirim − barcha xarajat) + Band pul (WIP) ──
    _sofFoydaHtml: function(sf, wip) {
        sf = sf || {};
        var money = Utils.money, esc = Utils.esc;
        var orders = sf.orders || [];
        var h = '<div class="ce-card" style="padding:14px;margin-bottom:10px">';
        h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
        h += '<div style="font-weight:800;font-size:14px">💰 Sof foyda</div>';
        h += '<span class="ce-badge" style="background:var(--accent);color:#fff">' + (sf.count || 0) + ' topshirilgan · ' + money(sf.total) + '</span></div>';
        h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Topshirilgan buyurtma foydasi shu oyga yoziladi (boshlangan oy emas)</div>';
        orders.forEach(function(o) {
            var pf = parseInt(o.profit) || 0;
            h += '<div class="fin-sof-order" data-id="' + o.id + '" style="display:flex;align-items:center;gap:10px;background:var(--surface2);border-radius:12px;padding:10px 12px;cursor:pointer;margin-bottom:6px">';
            h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</div>';
            h += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">↗' + money(o.income) + ' · ↘' + money(o.expense) + '</div></div>';
            h += '<span style="font-size:14px;font-weight:800;color:' + (pf >= 0 ? 'var(--accent)' : 'var(--danger)') + '">' + money(pf) + '</span></div>';
        });
        if (!orders.length) h += '<div style="font-size:12px;color:var(--text-muted)">Bu davrda topshirilgan buyurtma yo\'q</div>';
        // Band pul (WIP)
        if (wip && parseInt(wip) > 0) {
            h += '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border-radius:12px;padding:10px 12px;margin-top:4px">';
            h += '<div style="font-size:12px;color:var(--text-muted)">🔧 Jarayonda band pul<br><span style="font-size:10px">tugamagan ishlarga ketgan xarajat</span></div>';
            h += '<span style="font-size:14px;font-weight:800;color:#06b6d4">' + money(wip) + '</span></div>';
        }
        h += '</div>';
        return h;
    },

    _statsHtml: function(s) {
        var h = '<div id="fin-stats" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">';
        h += '<div class="ce-card fin-stat-card" data-metric="income" style="padding:10px;cursor:pointer"><div style="font-size:10px;color:var(--text-muted)">Kirim <span style="opacity:.5">›</span></div><div style="font-weight:700;color:var(--accent)">'+Utils.money(s.total_income)+'</div></div>';
        h += '<div class="ce-card fin-stat-card" data-metric="expense" style="padding:10px;cursor:pointer"><div style="font-size:10px;color:var(--text-muted)">Chiqim <span style="opacity:.5">›</span></div><div style="font-weight:700;color:var(--danger)">'+Utils.money(s.total_expense)+'</div></div>';
        h += '<div class="ce-card fin-stat-card" data-metric="profit" style="padding:10px;cursor:pointer"><div style="font-size:10px;color:var(--text-muted)">Foyda <span style="opacity:.5">›</span></div><div style="font-weight:700">'+Utils.money(s.profit)+'</div></div>';
        h += '<div class="ce-card fin-stat-card" data-metric="balance" style="padding:10px;cursor:pointer"><div style="font-size:10px;color:var(--text-muted)">Balans <span style="opacity:.5">›</span></div><div style="font-weight:700;color:var(--accent)">'+Utils.money(s.balance)+'</div></div>';
        h += '</div>';
        return h;
    },

    _recordsHtml: function(records) {
        if (!records.length) return '<div class="ce-empty"><div class="ce-empty-icon">💸</div><p>Tranzaksiya topilmadi</p></div>';
        var h = '';
        records.forEach(function(t) { h += Finance._txCard(t); });
        return h;
    },

    _txCard: function(t) {
        var typeLabel = (Finance._typeIcon[t.record_type]||'') + ' ' + (Finance._typeMap[t.record_type]||t.record_type);
        var isPositive = t.record_type === 'income' || t.record_type === 'debt_received' || t.record_type === 'debt_paid';
        var h = '<div class="ce-card fin-tx-card" data-id="'+t.id+'" style="padding:10px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">';
        h += '<div style="flex:1;min-width:0">';
        h += '<div style="font-size:13px;font-weight:500">'+typeLabel+'</div>';
        if (t.record_type === 'withdrawal' && t.recipient_name) h += '<div style="font-size:11px;color:var(--text-muted)">👤 '+Utils.esc(t.recipient_name)+'</div>';
        if (t.description) h += '<div style="font-size:11px;color:var(--text-muted);word-break:break-word">💬 '+Utils.esc(t.description)+'</div>';
        if (t.order_title) h += '<div style="font-size:11px;color:var(--text-muted)">📦 '+Utils.esc(t.order_title)+'</div>';
        h += '<div style="font-size:10px;color:var(--text-muted)">'+Utils.datetime(t.created_at)+' · '+(Finance._payMap[t.payment_method]||t.payment_method)+'</div>';
        h += '</div>';
        h += '<div style="font-weight:700;font-size:14px;white-space:nowrap;margin-left:8px;color:'+(isPositive?'var(--accent)':'var(--danger)')+'">'+(isPositive?'+':'-')+Utils.money(t.amount)+'</div>';
        h += '</div>';
        return h;
    },

    _debtCard: function(debt) {
        var statusMap = {active:'Faol',partial:'Qisman',paid:'To\'langan',written_off:'Hisobdan chiqarilgan'};
        var statusColor = {active:'var(--danger)',partial:'#f59e0b',paid:'var(--accent)',written_off:'var(--text-muted)'};
        // To'langan ulush (parity: v2 rc-finance debt kartasi progress ko'rsatadi)
        var _orig = parseInt(debt.original_amount) || 0;
        var _paid = parseInt(debt.paid_amount) || 0;
        var _pct = _orig > 0 ? Math.min(100, Math.round(_paid / _orig * 100)) : 0;
        var h = '<div class="ce-card debt-card" data-id="'+debt.id+'" style="padding:12px;margin-bottom:8px">';
        h += '<div style="display:flex;justify-content:space-between;align-items:start">';
        h += '<div>';
        if (debt.customer) h += '<div style="font-size:13px;font-weight:500">'+Utils.esc(debt.customer.name)+'</div>';
        h += '<div style="font-size:12px;color:var(--text-muted)">'+Utils.money(debt.paid_amount)+' / '+Utils.money(debt.original_amount)+'</div>';
        h += '</div>';
        h += '<span style="font-size:11px;padding:3px 8px;border-radius:10px;background:'+statusColor[debt.status]+';color:#fff">'+(statusMap[debt.status]||debt.status)+'</span>';
        h += '</div>';
        // To'langan ulush progress bari
        h += '<div style="display:flex;align-items:center;gap:8px;margin-top:8px">';
        h += '<div style="flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+_pct+'%;background:var(--accent);border-radius:3px;transition:width .6s ease"></div></div>';
        h += '<span style="font-size:11px;font-weight:600;color:var(--text-muted)">'+_pct+'%</span>';
        h += '</div>';
        if (parseInt(debt.remaining) > 0) {
            h += '<div style="margin-top:8px;display:flex;gap:6px">';
            h += '<div style="font-size:13px;font-weight:600;color:var(--danger)">Qoldiq: '+Utils.money(debt.remaining)+'</div>';
            h += '<button class="ce-btn ce-btn-primary btn-pay-debt" data-id="'+debt.id+'" style="font-size:11px;padding:4px 10px;margin-left:auto">To\'lash</button>';
            h += '</div>';
        }
        h += '</div>';
        return h;
    },

    _refreshList: function() {
        var filtered = this._filtered();
        // Qidiruv bo'lmasa — backend'ning to'liq (100 yozuv chegarasiz) aggregate
        // stats'idan foydalanamiz (davr bo'yicha to'g'ri). Qidiruv bo'lsa — hozir
        // yuklangan (davr bo'yicha cheklangan) ro'yxat ustida frontendda hisoblaymiz
        // (avvalgidek taxminiy, faqat qidiruv holatida — bu bug emas).
        var stats = this._search ? this._calcStats(filtered) : ((this._data && this._data.stats) || this._calcStats(filtered));
        var statsEl = document.getElementById('fin-stats');
        if (statsEl) {
            statsEl.outerHTML = Finance._statsHtml(stats);
            Finance._bindStatCards();
            var bd = document.getElementById('fin-breakdown');
            if (bd) { bd.style.display = 'none'; bd.dataset.metric = ''; }
        }
        var listEl = document.getElementById('records-list');
        if (listEl) {
            listEl.innerHTML = Finance._recordsHtml(filtered);
            Finance._bindTxCards();
        }
    },

    bind: function() {
        // Tab switching
        document.querySelectorAll('.fin-tab').forEach(function(btn) {
            btn.onclick = function() {
                document.querySelectorAll('.fin-tab').forEach(function(b){b.classList.remove('active','ce-btn-secondary')});
                btn.classList.add('active','ce-btn-secondary');
                var tab = btn.dataset.tab;
                document.getElementById('tab-records').style.display = tab === 'records' ? '' : 'none';
                document.getElementById('tab-debts').style.display = tab === 'debts' ? '' : 'none';
            };
        });

        // Professional davr filtri (PeriodFilter) → o'zgarsa hammasi qayta yuklanadi
        // (kassa/sof foyda/band pul/stats/records). Default SHU OY.
        PeriodFilter.bind(document.getElementById('fin-period'), Finance._st, (Finance._data || {}).months, function() {
            Finance._reload();
        });

        // Sof foyda buyurtma kartasi → order detali
        document.querySelectorAll('.fin-sof-order').forEach(function(el) {
            el.onclick = function() { Router.go('/orders/' + el.dataset.id); };
        });

        // Search
        var searchEl = document.getElementById('fin-search');
        if (searchEl) {
            searchEl.oninput = Utils.debounce(function() {
                Finance._search = searchEl.value;
                Finance._refreshList();
            }, 200);
        }

        // Add income/expense
        var finBtn = document.getElementById('btn-add-fin');
        if (finBtn) finBtn.onclick = function() { Finance._showAddModal(); };

        // Withdraw
        var wdBtn = document.getElementById('btn-withdraw');
        if (wdBtn) wdBtn.onclick = function() { Finance._showWithdrawModal(); };


        // Stat kartalar — bosilganda oylik breakdown
        Finance._bindStatCards();

        // Add debt
        var debtBtn = document.getElementById('btn-add-debt');
        if (debtBtn) debtBtn.onclick = function() { Finance._showDebtModal(); };

        // Pay debt
        document.querySelectorAll('.btn-pay-debt').forEach(function(b) {
            b.onclick = function(e) { e.stopPropagation(); Finance._showPayDebtModal(parseInt(b.dataset.id)); };
        });

        // Tx card clicks
        Finance._bindTxCards();
    },

    _bindTxCards: function() {
        document.querySelectorAll('.fin-tx-card').forEach(function(card) {
            card.onclick = function() {
                var id = parseInt(card.dataset.id);
                var tx = Finance._allRecords.filter(function(r){ return r.id === id; })[0];
                if (tx) Finance._showDetail(tx);
            };
        });
    },

    _showDetail: function(t) {
        var typeLabel = (Finance._typeIcon[t.record_type]||'') + ' ' + (Finance._typeMap[t.record_type]||t.record_type);
        var isPositive = t.record_type === 'income' || t.record_type === 'debt_received' || t.record_type === 'debt_paid';
        var amountColor = isPositive ? 'var(--accent)' : 'var(--danger)';

        var h = '<div style="text-align:center;margin-bottom:16px">';
        h += '<div style="font-size:28px;font-weight:700;color:'+amountColor+'">'+(isPositive?'+':'-')+Utils.money(t.amount)+' so\'m</div>';
        h += '<div style="font-size:13px;color:var(--text-muted);margin-top:4px">'+typeLabel+'</div>';
        h += '</div>';

        h += '<div style="background:var(--bg-tertiary,#f8fafc);border-radius:10px;padding:12px">';
        var rows = [];
        rows.push(['Sana va vaqt', Utils.datetime(t.created_at)]);
        if (t.category) rows.push(['Kategoriya', Finance._catMap[t.category] || t.category]);
        rows.push(["To'lov usuli", Finance._payMap[t.payment_method] || t.payment_method]);
        if (t.description) rows.push(['Izoh', Utils.esc(t.description)]);
        if (t.order_title) rows.push(['Buyurtma', '📦 ' + Utils.esc(t.order_title)]);
        if (t.stage_name) rows.push(['Etap', Utils.esc(t.stage_name)]);
        if (t.customer_name) rows.push(['Mijoz', Utils.esc(t.customer_name)]);
        if (t.recipient_name) rows.push(['Oluvchi', '👤 ' + Utils.esc(t.recipient_name)]);

        rows.forEach(function(r, i) {
            h += '<div style="display:flex;justify-content:space-between;padding:8px 0;'+(i < rows.length-1 ? 'border-bottom:1px solid var(--border,#e2e8f0)':'')+'">';
            h += '<span style="font-size:12px;color:var(--text-muted)">'+r[0]+'</span>';
            h += '<span style="font-size:12px;font-weight:500;text-align:right;max-width:60%">'+r[1]+'</span>';
            h += '</div>';
        });
        h += '</div>';

        Modal.open(typeLabel, h, {});
    },

    _showAddModal: function() {
        Modal.open("Tranzaksiya",
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Turi</label><select name="type" class="ce-input" style="width:100%"><option value="income">Kirim</option><option value="expense">Chiqim</option></select></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Summa *</label><input type="text" inputmode="numeric" name="amount" class="ce-input ce-money-input" style="width:100%" required></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Izoh</label><input type="text" name="description" class="ce-input" style="width:100%"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Kategoriya</label><select name="category" class="ce-input" style="width:100%"><option value="other">Boshqa</option><option value="material">Material</option><option value="service">Xizmat</option><option value="transport">Transport</option><option value="furniture">Mebel</option></select></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">To\'lov turi</label><select name="payment_method" class="ce-input" style="width:100%"><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O\'tkazma</option></select></div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-save-fin">Saqlash</button>'});
        Utils.bindMoneyInputs();
        document.getElementById('btn-save-fin').onclick = function() {
            var f = Modal.getFormData();
            if (!f.amount || parseInt(f.amount) <= 0) return Toast.error('Summa kiriting');
            WS.send('finance.create', {type: f.type, amount: parseInt(f.amount), description: f.description, payment_method: f.payment_method, category: f.category}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Saqlandi');
                Finance.render();
            });
        };
    },

    // ══════════════════════════════════════════════════════════
    //  USTALAR FOYDASI — "Foyda" kartasi bosilganda (kanonik + drill-down)
    // ══════════════════════════════════════════════════════════
    _ustaData: null,
    _ustaColors: ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'],

    _ustaColor: function(idx, name) {
        if (name === 'Taqsimlanmagan') return '#94a3b8';
        return Finance._ustaColors[idx % Finance._ustaColors.length];
    },
    _ustaInitial: function(name) {
        var s = (name || '').trim();
        return s ? s.charAt(0).toUpperCase() : '?';
    },

    _toggleUstalar: function() {
        var panel = document.getElementById('fin-breakdown');
        if (!panel) return;
        // Ustalar ochiq bo'lsa — yop
        if (panel.style.display !== 'none' && panel.dataset.metric === 'ustalar') {
            panel.style.display = 'none'; panel.dataset.metric = ''; return;
        }
        panel.dataset.metric = 'ustalar';
        panel.style.display = '';
        panel.innerHTML = '<div class="ce-card" style="padding:18px;text-align:center;color:var(--text-muted);font-size:12px">👷 Yuklanmoqda...</div>';
        Finance._loadUstalar();
    },

    _loadUstalar: function(cb) {
        // Sahifa tepasidagi davr filtriga (Finance._st) mos — alohida ichki filtr yo'q,
        // shu bilan "Foyda" kartochkasidagi son bilan izchil bo'ladi.
        WS.send('team.profit.detail', PeriodFilter.query(Finance._st), function(msg) {
            var panel = document.getElementById('fin-breakdown');
            if (!panel) return;
            if (!msg.ok) { panel.innerHTML = '<div class="ce-card" style="padding:16px;text-align:center;color:var(--danger);font-size:12px">Xatolik</div>'; return; }
            Finance._ustaData = msg.data;
            if (typeof cb === 'function') cb();
            else Finance._renderUstalarList();
        });
    },

    _renderUstalarList: function() {
        var panel = document.getElementById('fin-breakdown');
        if (!panel) return;
        var d = Finance._ustaData || {people: []};
        var people = d.people || [];
        var maxCalc = 1;
        people.forEach(function(m) { if (Math.abs(m.calculated) > maxCalc) maxCalc = Math.abs(m.calculated); });

        var h = '<div class="ce-card" style="padding:14px;overflow:hidden">';

        // Sarlavha + yopish
        h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">';
        h += '<div><div style="font-size:15px;font-weight:800;letter-spacing:-.2px">👷 Ustalar foydasi — ' + Utils.esc(PeriodFilter.label(Finance._st)) + '</div>';
        h += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Jami taqsimlangan: <b style="color:var(--accent)">'+Utils.money(d.total_profit||0)+'</b>'+((d.total_withdrawn)?' · olindi <b style="color:#8b5cf6">'+Utils.money(d.total_withdrawn)+'</b>':'')+'</div></div>';
        h += '<div id="fin-bd-close" style="cursor:pointer;color:var(--text-muted);font-size:18px;line-height:1">✕</div>';
        h += '</div>';

        if (!people.length) {
            h += '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">Hali foyda taqsimlanmagan</div>';
        } else {
            people.forEach(function(m, idx) {
                var color = Finance._ustaColor(idx, m.name);
                var barW = Math.max(4, Math.round(Math.abs(m.calculated) / maxCalc * 100));
                h += '<div class="usta-row" data-idx="'+idx+'" style="display:flex;align-items:center;gap:11px;padding:10px 12px;margin-bottom:8px;border-radius:14px;background:var(--bg-tertiary);cursor:pointer">';
                // avatar
                h += '<div style="width:40px;height:40px;border-radius:50%;background:'+color+';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0;box-shadow:0 2px 8px '+color+'55">'+Finance._ustaInitial(m.name)+'</div>';
                // middle
                h += '<div style="flex:1;min-width:0">';
                h += '<div style="display:flex;align-items:center;gap:6px"><span style="font-size:14px;font-weight:700">'+Utils.esc(m.name)+'</span>';
                if (m.percent) h += '<span style="font-size:10px;color:'+color+';background:'+color+'22;padding:1px 8px;border-radius:20px;font-weight:700">'+m.percent+'%</span>';
                h += '</div>';
                h += '<div style="height:6px;border-radius:20px;background:var(--border,#e2e8f0);margin-top:7px;overflow:hidden"><div style="height:100%;width:'+barW+'%;background:linear-gradient(90deg,'+color+','+color+'bb);border-radius:20px"></div></div>';
                h += '<div style="font-size:10px;color:var(--text-muted);margin-top:5px">📦 '+m.orders_count+' zakaz'+(m.withdrawn?' · qoldiq '+Utils.money(m.remaining):'')+'</div>';
                h += '</div>';
                // right
                h += '<div style="text-align:right;flex-shrink:0"><div style="font-size:15px;font-weight:800;color:'+color+'">'+Utils.money(m.calculated)+'</div><div style="font-size:15px;color:var(--text-muted);line-height:1;margin-top:2px">›</div></div>';
                h += '</div>';
            });
        }

        // ── TAQSIMLANMAGAN (foydasi bo'linmagan zakazlar) ──
        if ((d.undistributed_count || 0) > 0) {
            h += '<div id="usta-undist" style="display:flex;align-items:center;gap:11px;padding:11px 12px;margin-top:4px;border-radius:14px;background:linear-gradient(135deg,#f59e0b18,#f59e0b08);border:1px dashed #f59e0b88;cursor:pointer">';
            h += '<div style="width:40px;height:40px;border-radius:50%;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;flex-shrink:0">⚠</div>';
            h += '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700">Taqsimlanmagan</div>';
            h += '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">'+d.undistributed_count+' ta zakaz foydasi bo\'linmagan · bosing → bo\'lib yuboring</div></div>';
            h += '<div style="text-align:right;flex-shrink:0"><div style="font-size:15px;font-weight:800;color:#f59e0b">'+Utils.money(d.total_undistributed||0)+'</div><div style="font-size:15px;color:#f59e0b;line-height:1;margin-top:2px">›</div></div>';
            h += '</div>';
        }

        h += '</div>';
        panel.innerHTML = h;

        var cl = document.getElementById('fin-bd-close');
        if (cl) cl.onclick = function() { panel.style.display = 'none'; panel.dataset.metric = ''; };
        var undBtn = document.getElementById('usta-undist');
        if (undBtn) undBtn.onclick = function() { Finance._openUndistributed(); };
        panel.querySelectorAll('.usta-row').forEach(function(row) {
            row.onclick = function() { Finance._openUsta(parseInt(row.dataset.idx)); };
        });
    },

    _openUsta: function(idx) {
        var panel = document.getElementById('fin-breakdown');
        if (!panel || !Finance._ustaData) return;
        var m = Finance._ustaData.people[idx];
        if (!m) return;
        var color = Finance._ustaColor(idx, m.name);
        var qColor = m.remaining > 0 ? 'var(--accent)' : (m.remaining < 0 ? 'var(--danger)' : 'var(--text-muted)');
        var maxAmt = 1;
        (m.orders || []).forEach(function(o) { if (Math.abs(o.amount) > maxAmt) maxAmt = Math.abs(o.amount); });

        var h = '<div class="ce-card" style="padding:14px;overflow:hidden">';

        // Header: nazad + avatar + ism
        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">';
        h += '<button class="usta-back" style="font-size:16px;line-height:1;padding:6px 11px;border-radius:10px;border:none;background:var(--bg-tertiary);color:var(--text-muted);cursor:pointer">←</button>';
        h += '<div style="width:40px;height:40px;border-radius:50%;background:'+color+';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0;box-shadow:0 2px 8px '+color+'55">'+Finance._ustaInitial(m.name)+'</div>';
        h += '<div style="flex:1;min-width:0"><div style="font-size:16px;font-weight:800">'+Utils.esc(m.name)+'</div><div style="font-size:11px;color:var(--text-muted)">📦 '+m.orders_count+' zakaz'+(m.percent?' · '+m.percent+'%':'')+'</div></div>';
        h += '</div>';

        // 3 stat chip
        h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:14px">';
        h += '<div style="padding:10px;background:linear-gradient(135deg,'+color+'18,'+color+'08);border-radius:12px;text-align:center"><div style="font-size:10px;color:var(--text-muted)">Jami foyda</div><div style="font-weight:800;color:'+color+';font-size:13px;margin-top:2px">'+Utils.money(m.calculated)+'</div></div>';
        h += '<div style="padding:10px;background:var(--bg-tertiary);border-radius:12px;text-align:center"><div style="font-size:10px;color:var(--text-muted)">Olindi</div><div style="font-weight:800;color:#8b5cf6;font-size:13px;margin-top:2px">'+Utils.money(m.withdrawn)+'</div></div>';
        h += '<div style="padding:10px;background:var(--bg-tertiary);border-radius:12px;text-align:center"><div style="font-size:10px;color:var(--text-muted)">Qoldiq</div><div style="font-weight:800;color:'+qColor+';font-size:13px;margin-top:2px">'+Utils.money(m.remaining)+'</div></div>';
        h += '</div>';

        // Zakazlar ro'yxati
        h += '<div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text-muted)">Qaysi zakazlardan tushgan</div>';
        (m.orders || []).forEach(function(o) {
            var barW = Math.max(4, Math.round(Math.abs(o.amount) / maxAmt * 100));
            h += '<div style="padding:10px 12px;margin-bottom:7px;background:var(--bg-tertiary);border-radius:12px;border-left:3px solid '+color+'">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">';
            h += '<span style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+Utils.esc(o.client_name)+'</span>';
            h += '<span style="font-size:14px;font-weight:800;color:'+color+';flex-shrink:0">'+Utils.money(o.amount)+'</span>';
            h += '</div>';
            h += '<div style="height:4px;border-radius:20px;background:var(--border,#e2e8f0);margin-top:6px;overflow:hidden"><div style="height:100%;width:'+barW+'%;background:'+color+';border-radius:20px;opacity:.7"></div></div>';
            h += '<div style="display:flex;justify-content:space-between;margin-top:5px;font-size:10px;color:var(--text-muted)">';
            h += '<span>' + ((o.order_profit === null || o.order_profit === undefined)
                ? 'ulushingiz ' + o.percent + '%'
                : 'zakaz foydasi ' + Utils.money(o.order_profit) + ' × ' + o.percent + '%') + '</span>';
            h += '<span>'+(o.date || '')+'</span>';
            h += '</div></div>';
        });
        h += '</div>';
        panel.innerHTML = h;

        var bk = panel.querySelector('.usta-back');
        if (bk) bk.onclick = function() { Finance._renderUstalarList(); };
    },

    _statusLabels: {new:'Yangi', in_progress:'Jarayonda', at_mebelcity:'MebelCity da', ready:'Tayyor', delivered:'Topshirildi'},

    // ── Taqsimlanmagan zakazlar ro'yxati ──
    _openUndistributed: function() {
        var panel = document.getElementById('fin-breakdown');
        if (!panel || !Finance._ustaData) return;
        var d = Finance._ustaData;
        var list = d.undistributed || [];
        var h = '<div class="ce-card" style="padding:14px;overflow:hidden">';

        h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">';
        h += '<button class="usta-back" style="font-size:16px;line-height:1;padding:6px 11px;border-radius:10px;border:none;background:var(--bg-tertiary);color:var(--text-muted);cursor:pointer">←</button>';
        h += '<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:800">⚠️ Taqsimlanmagan</div>';
        h += '<div style="font-size:11px;color:var(--text-muted)">Jami <b style="color:#f59e0b">'+Utils.money(d.total_undistributed||0)+'</b> · '+list.length+' zakaz</div></div>';
        h += '</div>';
        h += '<div style="font-size:11px;color:var(--text-muted);margin:8px 0 12px">Zakazni bosib foydani ustalarga bo\'ling — hisobotga darhol tushadi.</div>';

        list.forEach(function(o) {
            var fin = (o.status === 'delivered' || o.status === 'ready');
            var badgeC = fin ? '#10b981' : '#f59e0b';
            var stLbl = Finance._statusLabels[o.status] || o.status;
            h += '<div class="undist-row" data-id="'+o.order_id+'" style="padding:11px 12px;margin-bottom:8px;background:var(--bg-tertiary);border-radius:12px;border-left:3px solid '+badgeC+';cursor:pointer">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">';
            h += '<span style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+Utils.esc(o.client_name)+'</span>';
            h += '<span style="font-size:14px;font-weight:800;color:#f59e0b;flex-shrink:0">'+Utils.money(o.unassigned_amount)+'</span>';
            h += '</div>';
            h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:10px;color:var(--text-muted)">';
            h += '<span><span style="color:'+badgeC+';font-weight:700">'+stLbl+'</span> · foyda '+Utils.money(o.profit)+(o.unassigned_pct<100?' · '+o.unassigned_pct+'% qolgan':'')+'</span>';
            h += '<span style="color:#6366f1;font-weight:700">Bo\'lish →</span>';
            h += '</div></div>';
        });
        if (!list.length) h += '<div style="text-align:center;padding:18px;color:var(--accent);font-size:12px">✅ Hammasi taqsimlangan</div>';
        h += '</div>';
        panel.innerHTML = h;

        var bk = panel.querySelector('.usta-back');
        if (bk) bk.onclick = function() { Finance._renderUstalarList(); };
        panel.querySelectorAll('.undist-row').forEach(function(row) {
            row.onclick = function() { Finance._openDistributeModal(parseInt(row.dataset.id)); };
        });
    },

    // ── Foyda bo'lish oynasi (Taqsimlanmagan → ustalarga) ──
    _distOrderId: null,
    _distRows: [],

    // Standart usta ro'yxati — 2026-07-30: Nursulton ishdan bo'shadi (3 kishi qoldi).
    // FOIZLAR ATAYLAB BO'SH (pct:0) — ustalar o'zlari kelishib qo'lda yozadi.
    _stdSplit: [
        {key: 'oybek',     name: 'Oybek aka',  pct: 0},
        {key: 'ganisher',  name: 'Ganisher',   pct: 0},
        {key: 'rustam',    name: 'Rustam aka', pct: 0},
    ],
    _stdRows: function() {
        var names = (Finance._ustaData && Finance._ustaData.people_names) || [];
        return Finance._stdSplit.map(function(sd) {
            var found = names.filter(function(n) {
                var ln = n.toLowerCase();
                return ln.indexOf(sd.key) !== -1 || (sd.key === 'ganisher' && ln.indexOf("g'anisher") !== -1);
            })[0];
            return {name: found || sd.name, percent: sd.pct};
        });
    },

    _openDistributeModal: function(orderId) {
        var d = Finance._ustaData || {};
        var o = (d.undistributed || []).filter(function(x) { return x.order_id === orderId; })[0];
        if (!o) return;
        var names = d.people_names || [];
        Finance._distOrderId = orderId;

        // Boshlang'ich qatorlar: mavjud ulush bo'lsa — o'sha; aks holda standart bo'linish
        if (o.shares && o.shares.length) {
            Finance._distRows = o.shares.map(function(s) { return {name: s.name || '', percent: s.percent || 0}; });
        } else {
            Finance._distRows = Finance._stdRows();
        }

        var dl = '<datalist id="dist-names">' + names.map(function(n) { return '<option value="' + Utils.esc(n) + '">'; }).join('') + '</datalist>';
        var body = dl;
        body += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;padding:8px 10px;background:var(--bg-tertiary);border-radius:8px">📦 <b>' + Utils.esc(o.client_name) + '</b> · foyda <b style="color:var(--accent)">' + Utils.money(o.profit) + '</b></div>';
        body += '<div id="dist-rows"></div>';
        body += '<div style="display:flex;gap:6px;margin:8px 0 4px">';
        body += '<button type="button" id="dist-add" class="ce-btn ce-btn-secondary" style="font-size:11px;padding:5px 10px">+ Odam</button>';
        body += '<button type="button" id="dist-std" class="ce-btn ce-btn-secondary" style="font-size:11px;padding:5px 10px">Ustalar ro\'yxati</button>';
        body += '</div>';
        body += '<div style="font-size:11px;color:var(--text-muted)">Foizlarni o\'zingiz kiritasiz — jami 100% bo\'lsin</div>';
        body += '<div id="dist-total" style="margin-top:8px;font-size:12px;font-weight:700"></div>';

        Modal.open("Foydani bo'lish", body, {footer: '<button class="ce-btn ce-btn-primary" id="dist-save">Saqlash → hisobotga</button>'});
        Finance._renderDistRows();

        document.getElementById('dist-add').onclick = function() {
            Finance._distRows.push({name: '', percent: 0}); Finance._renderDistRows();
        };
        document.getElementById('dist-std').onclick = function() {
            Finance._distRows = Finance._stdRows();
            Finance._renderDistRows();
        };
        document.getElementById('dist-save').onclick = function() { Finance._saveDistribute(o); };
    },

    _renderDistRows: function() {
        var box = document.getElementById('dist-rows');
        if (!box) return;
        var h = '';
        Finance._distRows.forEach(function(r, i) {
            h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">';
            h += '<input list="dist-names" class="ce-input dist-name" data-i="' + i + '" value="' + Utils.esc(r.name) + '" placeholder="Ism" style="flex:1;font-size:13px">';
            h += '<input type="number" class="ce-input dist-pct" data-i="' + i + '" value="' + (r.percent || '') + '" min="0" max="100" step="1" style="width:66px;font-size:13px;text-align:center">';
            h += '<span style="font-size:11px;color:var(--text-muted);width:14px">%</span>';
            h += '<button type="button" class="dist-del" data-i="' + i + '" style="border:none;background:none;color:var(--danger);cursor:pointer;font-size:16px;line-height:1">✕</button>';
            h += '</div>';
        });
        box.innerHTML = h;

        box.querySelectorAll('.dist-name').forEach(function(el) {
            el.oninput = function() { Finance._distRows[parseInt(el.dataset.i)].name = el.value; };
        });
        box.querySelectorAll('.dist-pct').forEach(function(el) {
            el.oninput = function() { Finance._distRows[parseInt(el.dataset.i)].percent = parseFloat(el.value) || 0; Finance._updateDistTotal(); };
        });
        box.querySelectorAll('.dist-del').forEach(function(el) {
            el.onclick = function() { Finance._distRows.splice(parseInt(el.dataset.i), 1); Finance._renderDistRows(); };
        });
        Finance._updateDistTotal();
    },

    _updateDistTotal: function() {
        var el = document.getElementById('dist-total');
        if (!el) return;
        var sum = Finance._distRows.reduce(function(s, r) { return s + (parseFloat(r.percent) || 0); }, 0);
        var ok = Math.abs(sum - 100) < 0.5;
        var color = ok ? 'var(--accent)' : (sum > 100 ? 'var(--danger)' : '#f59e0b');
        el.innerHTML = 'Jami: <span style="color:' + color + '">' + sum + '%</span> ' + (ok ? '✅' : (sum > 100 ? '⚠️ 100% dan oshdi' : '(100% bo\'lsin)'));
    },

    _saveDistribute: function(o) {
        var rows = Finance._distRows
            .map(function(r) { return {name: (r.name || '').trim(), percent: parseFloat(r.percent) || 0}; })
            .filter(function(r) { return r.name && r.percent > 0; });
        if (!rows.length) return Toast.error("Ism va foiz kiriting");
        var sum = rows.reduce(function(s, r) { return s + r.percent; }, 0);
        if (sum > 100.5) return Toast.error("Jami 100% dan oshib ketdi (" + sum + "%)");
        WS.send('profit.save', {order_id: Finance._distOrderId, shares: rows}, function(msg) {
            if (!msg.ok) return Toast.error(msg.error || "Xatolik");
            Modal.close();
            Toast.success("Foyda bo'lindi va hisobotga tushdi");
            Finance._loadUstalar(function() { Finance._openUndistributed(); });
        });
    },

    _showWithdrawModal: function() {
        var recipients = (Finance._data && Finance._data.withdrawal_recipients) || [];
        var profitShares = (Finance._data && Finance._data.last_profit_shares) || [];
        var balance = Finance._data ? parseInt(Finance._data.stats.balance) || 0 : 0;

        var h = '';

        if (profitShares.length) {
            h += '<div style="font-size:12px;font-weight:700;margin-bottom:6px">💰 Foyda taqsimotidan yechish:</div>';
            h += '<div id="wd-shares" style="margin-bottom:12px">';
            profitShares.forEach(function(s, i) {
                var amt = Math.round(balance * s.percent / 100);
                h += '<div style="display:flex;align-items:center;gap:8px;padding:6px;margin-bottom:4px;background:var(--bg-tertiary);border-radius:8px;border:1px solid var(--border)">';
                h += '<input type="checkbox" class="wd-share-chk" data-i="'+i+'" checked>';
                h += '<span style="flex:1;font-size:13px;font-weight:500">'+Utils.esc(s.name)+'</span>';
                h += '<span style="font-size:11px;color:var(--text-muted)">'+s.percent+'%</span>';
                h += '<span style="font-size:13px;font-weight:700;color:var(--accent)">'+Utils.money(Math.abs(amt))+'</span>';
                h += '</div>';
            });
            h += '</div>';
            h += '<div style="text-align:center;margin-bottom:12px"><button class="ce-btn ce-btn-primary" id="btn-wd-all" style="font-size:12px;padding:8px 20px"><i class="fas fa-check-double"></i> Barchasini yechish</button></div>';
            h += '<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px;font-size:12px;color:var(--text-muted);text-align:center">yoki alohida yechish:</div>';
        }

        var recipientChips = '';
        if (recipients.length) {
            recipientChips = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">';
            recipients.forEach(function(name) {
                recipientChips += '<span class="wd-recip-chip" style="font-size:11px;padding:4px 10px;border-radius:12px;background:var(--bg-tertiary);cursor:pointer;border:1px solid var(--border)">' + Utils.esc(name) + '</span>';
            });
            recipientChips += '</div>';
        }

        h += '<div style="margin-top:8px"><div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Kim yechadi *</label>' + recipientChips +
            '<input type="text" name="recipient_name" class="ce-input" style="width:100%" placeholder="Ism kiriting"></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Summa *</label><input type="text" inputmode="numeric" name="amount" class="ce-input ce-money-input" style="width:100%" required></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Izoh</label><input type="text" name="description" class="ce-input" style="width:100%"></div></div>';

        Modal.open("Pul yechish", h,
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-save-wd">Yechish</button>'});
        Utils.bindMoneyInputs();

        if (document.getElementById('btn-wd-all')) {
            document.getElementById('btn-wd-all').onclick = function() {
                var lines = [];
                document.querySelectorAll('.wd-share-chk').forEach(function(chk) {
                    if (chk.checked) {
                        var s = profitShares[parseInt(chk.dataset.i)];
                        lines.push({name: s.name, amount: Math.round(balance * s.percent / 100)});
                    }
                });
                if (!lines.length) return Toast.error('Kamida 1 ta tanlang');
                var total = lines.reduce(function(s,l){return s+l.amount},0);
                Modal.confirm("Tasdiqlash", lines.length+" ta xodimga jami "+Utils.money(total)+" yechiladi. Davom etasizmi?", function() {
                    var done = 0;
                    lines.forEach(function(ln) {
                        WS.send('finance.withdrawal', {
                            amount: ln.amount, recipient_name: ln.name,
                            description: 'Foyda taqsimoti', payment_method: 'cash'
                        }, function(msg) {
                            done++;
                            if (done === lines.length) {
                                Modal.close();
                                Toast.success(lines.length+' ta yozuv yaratildi');
                                Finance.render();
                            }
                        });
                    });
                });
            };
        }

        document.querySelectorAll('.wd-recip-chip').forEach(function(chip) {
            chip.onclick = function() {
                document.querySelector('[name="recipient_name"]').value = chip.textContent;
                document.querySelectorAll('.wd-recip-chip').forEach(function(c) { c.style.background = 'var(--bg-tertiary)'; c.style.color = ''; });
                chip.style.background = 'var(--accent)';
                chip.style.color = '#fff';
            };
        });

        document.getElementById('btn-save-wd').onclick = function() {
            var f = Modal.getFormData();
            if (!(f.recipient_name || '').trim()) return Toast.error('Kim yechishini kiriting');
            if (!f.amount || parseInt(f.amount) <= 0) return Toast.error('Summa kiriting');
            WS.send('finance.withdrawal', {
                amount: parseInt(f.amount),
                recipient_name: f.recipient_name.trim(),
                description: f.description || '',
                payment_method: f.payment_method || 'cash'
            }, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Pul yechildi');
                Finance.render();
            });
        };
    },

    _showDebtModal: function() {
        var custOpts = STATE.clients.map(function(c){return '<option value="'+c.id+'">'+Utils.esc(c.name)+'</option>'}).join('');
        Modal.open("Yangi qarz",
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Mijoz *</label><select name="customer_id" class="ce-input" style="width:100%" required>'+custOpts+'</select></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Summa *</label><input type="text" inputmode="numeric" name="amount" class="ce-input ce-money-input" style="width:100%" required></div>' +
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Izoh</label><input type="text" name="description" class="ce-input" style="width:100%"></div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-save-debt">Saqlash</button>'});
        Utils.bindMoneyInputs();
        document.getElementById('btn-save-debt').onclick = function() {
            var f = Modal.getFormData();
            if (!f.customer_id) return Toast.error('Mijoz tanlang');
            if (!f.amount || parseInt(f.amount) <= 0) return Toast.error('Summa kiriting');
            WS.send('debt.create', {customer_id: parseInt(f.customer_id), amount: parseInt(f.amount), description: f.description}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('Qarz saqlandi');
                Finance.render();
            });
        };
    },

    _showPayDebtModal: function(debtId) {
        Modal.open("Qarz to'lash",
            '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Summa *</label><input type="text" inputmode="numeric" name="amount" class="ce-input ce-money-input" style="width:100%" required></div>',
            {footer:'<button class="ce-btn ce-btn-primary" id="btn-pay-save">To\'lash</button>'});
        Utils.bindMoneyInputs();
        document.getElementById('btn-pay-save').onclick = function() {
            var f = Modal.getFormData();
            if (!f.amount || parseInt(f.amount) <= 0) return Toast.error('Summa kiriting');
            WS.send('debt.pay', {id: debtId, amount: parseInt(f.amount)}, function(msg) {
                if (!msg.ok) return Toast.error(msg.error);
                Modal.close();
                Toast.success('To\'lov saqlandi');
                Finance.render();
            });
        };
    },
};
