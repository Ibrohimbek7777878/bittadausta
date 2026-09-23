/* client_erp/js/pages/analytics.js — Professional Analytics Dashboard + AI */
var Analytics = {
    st: null,        // PeriodFilter holati {period, ym, date_from, date_to} — default: Shu oy
    data: null,
    aiLoading: false,
    aiHistory: null,

    render: function() {
        var app = document.getElementById('app');
        app.innerHTML = '<div style="padding:20px"><div class="skeleton-block" style="height:40px;margin-bottom:16px"></div><div class="skeleton-block" style="height:120px;margin-bottom:12px"></div><div class="skeleton-block" style="height:200px;margin-bottom:12px"></div><div class="skeleton-block" style="height:160px"></div></div>';
        Analytics.aiHistory = null;
        Analytics.st = PeriodFilter.init();   // default: Shu oy
        Analytics.load();
    },

    load: function() {
        WS.send('page.analytics', PeriodFilter.query(Analytics.st), function(msg) {
            if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
            Analytics.data = msg.data;
            document.getElementById('app').innerHTML = Analytics.template(msg.data);
            Analytics.bind();
            Analytics.drawCharts(msg.data);
            Analytics._loadAIHistory();
        });
    },

    template: function(d) {
        var s = d.summary, t = d.totals;
        var h = '';

        // Header
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
        h += '<h2 style="font-size:18px;margin:0;font-weight:800"><i class="fas fa-chart-bar" style="color:var(--accent);margin-right:6px"></i>Analitika</h2>';
        h += '</div>';

        // Professional davr filtri (PeriodFilter — Shu oy default / O'tgan oy / Aniq oy 'ym' / Davr / Yil / Hammasi)
        h += '<div style="margin-bottom:12px">' + PeriodFilter.html(Analytics.st, d.months) + '</div>';

        // Summary cards
        h += '<div class="an-summary-grid">';
        h += Analytics._summaryCard('Kirim', s.income, s.income_change, 'var(--accent)', 'fas fa-arrow-down');
        h += Analytics._summaryCard('Chiqim', s.expense, s.expense_change, 'var(--danger)', 'fas fa-arrow-up', true);
        h += Analytics._summaryCard('Foyda', s.profit, null, parseInt(s.profit) >= 0 ? 'var(--accent)' : 'var(--danger)', 'fas fa-chart-line');
        h += Analytics._summaryCard('Buyurtmalar', s.orders, s.orders_change, 'var(--accent2)', 'fas fa-box', false, true);
        h += '</div>';

        // AI Analysis Section
        h += Analytics._aiSection();

        // Revenue chart
        h += '<div class="ce-card an-chart-card">';
        h += '<div class="an-chart-header"><span class="an-chart-title">Kirim va Chiqim</span></div>';
        h += '<div id="revenue-chart" style="width:100%;height:220px;position:relative"></div>';
        h += '</div>';

        // (A) Oylik SOF FOYDA — topshirilgan-oy bo'yicha (d.profit_monthly)
        h += '<div class="ce-card an-chart-card">';
        h += '<div class="an-chart-header"><span class="an-chart-title">Oylik sof foyda</span>';
        h += '<span style="font-size:11px;color:var(--text-muted)">topshirilgan buyurtmalar bo\'yicha</span></div>';
        h += '<div id="profit-monthly-chart" style="width:100%;height:200px;position:relative"></div>';
        h += '</div>';

        // Two-column layout
        h += '<div class="an-grid-2">';

        // Order status donut
        h += '<div class="ce-card an-chart-card">';
        h += '<div class="an-chart-header"><span class="an-chart-title">Buyurtma holatlari</span></div>';
        h += '<div id="status-chart" style="display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;padding:8px 0"></div>';
        h += '</div>';

        // Expense categories
        h += '<div class="ce-card an-chart-card">';
        h += '<div class="an-chart-header"><span class="an-chart-title">Chiqim turlari</span></div>';
        h += '<div id="category-chart" style="padding:4px 0"></div>';
        h += '</div>';

        h += '</div>';

        // (B) Topshirilgan buyurtmalar + deadline + overdue (d.deliveries)
        h += Analytics._deliveriesHtml(d.deliveries);

        // Top customers
        if (d.top_customers.length) {
            h += '<div class="ce-card an-chart-card">';
            h += '<div class="an-chart-header"><span class="an-chart-title">Top mijozlar</span></div>';
            var maxCust = d.top_customers[0].total;
            d.top_customers.forEach(function(c, i) {
                var pct = Math.round(c.total / maxCust * 100);
                h += '<div style="padding:8px 0;'+(i < d.top_customers.length - 1 ? 'border-bottom:1px solid var(--border)' : '')+'">';
                h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">';
                h += '<span style="font-size:13px;font-weight:600">'+(i+1)+'. '+Utils.esc(c.name)+'</span>';
                h += '<span style="font-size:13px;font-weight:700;color:var(--accent)">'+Utils.money(c.total)+'</span>';
                h += '</div>';
                h += '<div style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:var(--accent);border-radius:3px;transition:width .6s ease"></div></div>';
                h += '</div>';
            });
            h += '</div>';
        }

        // Stage performance
        if (d.stage_performance.length) {
            h += '<div class="ce-card an-chart-card">';
            h += '<div class="an-chart-header"><span class="an-chart-title">Bajarilgan bosqichlar</span></div>';
            h += '<div id="stage-chart" style="padding:4px 0"></div>';
            h += '</div>';
        }

        // Payment methods (Kirim va Chiqim alohida — aralashtirilmagan)
        h += Analytics._paymentSection('Kirim to\'lov usullari', d.payment_data_income);
        h += Analytics._paymentSection('Chiqim to\'lov usullari', d.payment_data_expense);

        // Totals footer
        h += '<div class="ce-card an-chart-card" style="background:linear-gradient(135deg,var(--surface),var(--surface2))">';
        h += '<div class="an-chart-header"><span class="an-chart-title">Umumiy ko\'rsatkichlar</span></div>';
        h += '<div class="an-totals-grid">';
        h += Analytics._totalItem('Jami kirim', t.income, 'var(--accent)');
        h += Analytics._totalItem('Jami chiqim', t.expense, 'var(--danger)');
        h += Analytics._totalItem('Jami foyda', t.profit, parseInt(t.profit) >= 0 ? 'var(--accent)' : 'var(--danger)');
        h += Analytics._totalItem('Balans', t.balance, 'var(--accent2)');
        h += Analytics._totalItem('Qarzlar', t.debt, parseInt(t.debt) > 0 ? 'var(--danger)' : 'var(--accent)');
        h += Analytics._totalItem('Buyurtmalar', t.orders, 'var(--text)', true);
        h += Analytics._totalItem('Bajarilgan', t.completed, 'var(--accent)', true);
        h += Analytics._totalItem('Mijozlar', t.customers, 'var(--accent2)', true);
        h += '</div></div>';

        return h;
    },

    // ─── AI Section ───

    _aiSection: function() {
        var h = '<div class="ce-card an-ai-card" id="ai-section">';
        h += '<div class="an-ai-header">';
        h += '<div style="display:flex;align-items:center;gap:10px">';
        h += '<div class="an-ai-icon"><i class="fas fa-robot"></i></div>';
        h += '<div><div class="an-ai-title">AI Biznes Tahlil</div>';
        h += '<div style="font-size:11px;color:var(--text-muted)">Claude AI — chuqur tahlil, tavsiyalar, optimizatsiya</div></div>';
        h += '</div>';
        h += '<button class="ce-btn ce-btn-primary an-ai-btn" id="btn-ai-analyze" style="font-size:12px;padding:8px 16px">';
        h += '<i class="fas fa-magic" style="margin-right:4px"></i> Tahlil qilish <span class="an-ai-cost">50 🪙</span></button>';
        h += '</div>';

        h += '<div id="ai-result"></div>';

        h += '<div id="ai-history-section" style="display:none">';
        h += '<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px">';
        h += '<button class="an-ai-history-toggle" id="btn-ai-history"><i class="fas fa-history" style="margin-right:4px"></i> Oldingi tahlillar</button>';
        h += '<div id="ai-history-list" style="display:none;margin-top:10px"></div>';
        h += '</div></div>';

        h += '</div>';
        return h;
    },

    _renderAIResult: function(data) {
        var container = document.getElementById('ai-result');
        if (!container) return;

        var h = '<div class="an-ai-result" style="animation:fadeSlideIn .4s ease-out">';

        // Sections as cards
        var sections = data.sections || [];
        if (sections.length) {
            h += '<div class="an-ai-sections">';
            var sectionColors = {
                '📊': {bg:'#3b82f620', border:'#3b82f640', accent:'#3b82f6'},
                '💰': {bg:'#10b98120', border:'#10b98140', accent:'#10b981'},
                '📦': {bg:'#f59e0b20', border:'#f59e0b40', accent:'#f59e0b'},
                '⏱️': {bg:'#8b5cf620', border:'#8b5cf640', accent:'#8b5cf6'},
                '🤝': {bg:'#06b6d420', border:'#06b6d440', accent:'#06b6d4'},
                '⚠️': {bg:'#ef444420', border:'#ef444440', accent:'#ef4444'},
                '📌': {bg:'#10b98120', border:'#10b98140', accent:'#10b981'},
                '🏁': {bg:'#6366f120', border:'#6366f140', accent:'#6366f1'},
            };
            sections.forEach(function(sec, idx) {
                var colors = sectionColors[sec.icon] || {bg:'var(--surface2)', border:'var(--border)', accent:'var(--accent2)'};
                h += '<div class="an-ai-sec" style="border-left:3px solid '+colors.accent+';background:'+colors.bg+'">';
                h += '<div class="an-ai-sec-header" data-idx="'+idx+'">';
                h += '<span style="font-size:16px;margin-right:6px">'+sec.icon+'</span>';
                h += '<span class="an-ai-sec-title" style="color:'+colors.accent+'">'+Utils.esc(sec.title)+'</span>';
                h += '<i class="fas fa-chevron-down an-ai-sec-arrow" style="color:'+colors.accent+'"></i>';
                h += '</div>';
                h += '<div class="an-ai-sec-body">' + Analytics._formatContent(sec.content) + '</div>';
                h += '</div>';
            });
            h += '</div>';
        } else {
            h += '<div class="an-ai-text">' + Analytics._formatContent(data.text) + '</div>';
        }

        // Recommendations
        if (data.recommendations && data.recommendations.length) {
            var priorityColors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#6366f1', '#06b6d4', '#ec4899'];
            h += '<div class="an-ai-recs">';
            h += '<div style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:10px;display:flex;align-items:center;gap:6px">';
            h += '<i class="fas fa-lightbulb"></i> Amaliy tavsiyalar ('+data.recommendations.length+')</div>';
            data.recommendations.forEach(function(r, i) {
                var color = priorityColors[i % priorityColors.length];
                h += '<div class="an-ai-rec-card" style="border-left:3px solid '+color+'">';
                h += '<div class="an-ai-rec-num" style="background:'+color+'">'+( i+1)+'</div>';
                h += '<div class="an-ai-rec-text">'+Utils.esc(r)+'</div>';
                h += '</div>';
            });
            h += '</div>';
        }

        // Meta footer
        h += '<div class="an-ai-meta">';
        h += '<span><i class="fas fa-robot" style="margin-right:3px;color:var(--accent2)"></i> Claude AI · '+Utils.datetime(data.created_at)+'</span>';
        var coinInfo = data.coins_remaining !== '' && data.coins_remaining !== undefined
            ? ' · qoldi: '+data.coins_remaining
            : '';
        h += '<span style="color:var(--warning)">-'+data.coins_spent+' 🪙'+coinInfo+'</span>';
        h += '</div>';

        h += '</div>';
        container.innerHTML = h;

        // Bind section toggles
        container.querySelectorAll('.an-ai-sec-header').forEach(function(hdr) {
            hdr.onclick = function() {
                var sec = hdr.parentElement;
                sec.classList.toggle('collapsed');
            };
        });
    },

    _formatContent: function(text) {
        if (!text) return '';
        var lines = text.split('\n');
        var html = '';
        lines.forEach(function(line) {
            var s = line.trim();
            if (!s) return;
            if (s.startsWith('---')) return;
            // Bold text **...**
            var formatted = Utils.esc(s)
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\*([^*]+)\*/g, '<em>$1</em>');
            if (/^[-•]\s/.test(s)) {
                formatted = formatted.replace(/^[-•]\s*/, '');
                html += '<div class="an-ai-bullet"><span class="an-ai-dot"></span>'+formatted+'</div>';
            } else if (/^\d+[\.\)]\s/.test(s)) {
                html += '<div class="an-ai-numbered">'+formatted+'</div>';
            } else if (s.startsWith('>')) {
                formatted = formatted.replace(/^&gt;\s*/, '');
                html += '<div class="an-ai-quote">'+formatted+'</div>';
            } else {
                html += '<div class="an-ai-para">'+formatted+'</div>';
            }
        });
        return html;
    },

    _renderAIHistory: function(analyses) {
        var container = document.getElementById('ai-history-list');
        if (!container) return;

        if (!analyses.length) {
            container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Hali tahlil qilinmagan</div>';
            return;
        }

        var periodLabels = {today: 'Bugun', day: 'Bugun', week: 'Hafta', month: 'Oy', last_month: "O'tgan oy", year: 'Yil', all: 'Hammasi', custom: 'Davr'};
        var h = '';
        analyses.forEach(function(a) {
            var recCount = (a.recommendations||[]).length;
            var secCount = (a.sections||[]).length;
            h += '<div class="an-ai-history-item" data-id="'+a.id+'">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center">';
            h += '<div>';
            h += '<span style="font-size:12px;font-weight:600"><i class="fas fa-robot" style="color:var(--accent2);margin-right:4px"></i>'+(periodLabels[a.period]||a.period)+' tahlili</span>';
            h += '<div style="font-size:11px;color:var(--text-muted)">'+Utils.datetime(a.created_at)+' · '+secCount+' bo\'lim · '+recCount+' tavsiya · -'+a.coins_spent+' 🪙</div>';
            h += '</div>';
            h += '<i class="fas fa-chevron-right" style="font-size:11px;color:var(--text-muted)"></i>';
            h += '</div></div>';
        });
        container.innerHTML = h;

        container.querySelectorAll('.an-ai-history-item').forEach(function(el) {
            el.onclick = function() {
                var id = parseInt(el.dataset.id);
                var item = analyses.find(function(a) { return a.id === id; });
                if (item) {
                    Analytics._renderAIResult({
                        text: item.text,
                        recommendations: item.recommendations,
                        sections: item.sections || [],
                        coins_spent: item.coins_spent,
                        coins_remaining: '',
                        created_at: item.created_at,
                    });
                    var resultEl = document.getElementById('ai-result');
                    if (resultEl) resultEl.scrollIntoView({behavior:'smooth', block:'start'});
                }
            };
        });
    },

    _loadAIHistory: function() {
        WS.send('analytics.ai_history', {}, function(msg) {
            if (!msg.ok) return;
            Analytics.aiHistory = msg.data;
            var section = document.getElementById('ai-history-section');
            if (section && msg.data.length) {
                section.style.display = 'block';
                Analytics._renderAIHistory(msg.data);
            }
        });
    },

    // ─── Helpers ───

    // Ixcham pul (grafik yorlig'i uchun): 12.5M / 340K / \u22128.1M
    _shortMoney: function(v) {
        v = parseInt(v) || 0;
        var neg = v < 0, a = Math.abs(v), s;
        if (a >= 1e9) s = (a / 1e9).toFixed(1) + 'B';
        else if (a >= 1e6) s = (a / 1e6).toFixed(1) + 'M';
        else if (a >= 1e3) s = Math.round(a / 1e3) + 'K';
        else s = '' + a;
        return (neg ? '\u2212' : '') + s;
    },

    // (B) Topshirilgan buyurtmalar + deadline + overdue
    _deliveriesHtml: function(dv) {
        if (!dv) return '';
        var money = Utils.money, esc = Utils.esc;
        var h = '<div class="ce-card an-chart-card">';
        h += '<div class="an-chart-header"><span class="an-chart-title">Topshirilgan buyurtmalar va muddatlar</span></div>';

        // Svodka chiplar
        h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
        h += Analytics._delChip('Topshirilgan', dv.delivered_count, 'var(--accent)');
        h += Analytics._delChip('Vaqtida', dv.delivered_on_time, 'var(--accent2)');
        h += Analytics._delChip('Kechikkan', dv.delivered_late, 'var(--danger)');
        h += Analytics._delChip("Muddati o'tgan", dv.overdue_count, 'var(--warning)');
        h += '</div>';
        h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Shartnoma jami: <b style="color:var(--text)">' + money(dv.contract_total) + '</b></div>';

        // Topshirilgan ro'yxat
        var dl = dv.delivered || [];
        if (dl.length) {
            dl.forEach(function(o, i) {
                var late = o.days_late > 0;
                var badgeClr = late ? 'var(--danger)' : 'var(--accent)';
                h += '<div onclick="Router.go(\'/orders/' + o.id + '\')" style="cursor:pointer;padding:9px 0;' + (i < dl.length - 1 ? 'border-bottom:1px solid var(--border)' : '') + '">';
                h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">';
                h += '<span style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</span>';
                h += '<span class="ce-badge" style="background:' + badgeClr + '20;color:' + badgeClr + ';flex:none;white-space:nowrap">' + (late ? ('\u23f0 ' + o.days_late + ' kun kech') : '\u2713 Vaqtida') + '</span>';
                h += '</div>';
                h += '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:3px;font-size:11px;color:var(--text-muted);flex-wrap:wrap">';
                h += '<span>' + (o.customer ? esc(o.customer) + ' \u00b7 ' : '') + money(o.contract) + '</span>';
                h += '<span>\ud83d\udcc5 ' + (o.deadline ? Utils.date(o.deadline) : '\u2014') + ' \u2192 ' + (o.delivered_at ? Utils.date(o.delivered_at) : '\u2014') + '</span>';
                h += '</div></div>';
            });
        } else {
            h += '<div style="font-size:12px;color:var(--text-muted);padding:6px 0">Bu davrda topshirilgan buyurtma yo\'q</div>';
        }

        // Muddati o'tgan (overdue) \u2014 aktiv, deadline o'tgan
        var ov = dv.overdue || [];
        if (ov.length) {
            h += '<div style="margin-top:14px;padding-top:12px;border-top:2px solid var(--border)">';
            h += '<div style="font-size:13px;font-weight:700;color:var(--danger);margin-bottom:8px"><i class="fas fa-exclamation-triangle" style="margin-right:5px"></i>Muddati o\'tgan (' + ov.length + ')</div>';
            ov.forEach(function(o, i) {
                h += '<div onclick="Router.go(\'/orders/' + o.id + '\')" style="cursor:pointer;padding:8px 0;' + (i < ov.length - 1 ? 'border-bottom:1px solid var(--border)' : '') + '">';
                h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">';
                h += '<span style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</span>';
                h += '<span class="ce-badge" style="background:var(--danger)20;color:var(--danger);flex:none;white-space:nowrap">' + o.days_over + ' kun</span>';
                h += '</div>';
                h += '<div style="margin-top:3px;font-size:11px;color:var(--text-muted)">' + (o.customer ? esc(o.customer) + ' \u00b7 ' : '') + '\ud83d\udcc5 ' + (o.deadline ? Utils.date(o.deadline) : '\u2014') + '</div>';
                h += '</div>';
            });
            h += '</div>';
        }

        h += '</div>';
        return h;
    },

    _delChip: function(label, count, color) {
        return '<div style="flex:1;min-width:78px;text-align:center;padding:10px 6px;background:' + color + '12;border:1px solid ' + color + '30;border-radius:10px">'
            + '<div style="font-size:18px;font-weight:800;color:' + color + '">' + (count || 0) + '</div>'
            + '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + label + '</div></div>';
    },

    _summaryCard: function(label, value, change, color, icon, invertChange, isCount) {
        var formatted = isCount ? value : Utils.money(value);
        var h = '<div class="an-summary-card">';
        h += '<div style="display:flex;justify-content:space-between;align-items:start">';
        h += '<div class="an-summary-icon" style="background:'+color+'20;color:'+color+'"><i class="'+icon+'"></i></div>';
        if (change !== null && change !== undefined) {
            var isPos = change >= 0;
            var changeColor = invertChange ? (isPos ? 'var(--danger)' : 'var(--accent)') : (isPos ? 'var(--accent)' : 'var(--danger)');
            h += '<span class="an-change" style="color:'+changeColor+'">'+(isPos?'+':'')+change+'%</span>';
        }
        h += '</div>';
        h += '<div class="an-summary-value" style="color:'+color+'">'+formatted+'</div>';
        h += '<div class="an-summary-label">'+label+'</div>';
        h += '</div>';
        return h;
    },

    _paymentSection: function(title, items) {
        if (!items || !items.length) return '';
        var h = '<div class="ce-card an-chart-card">';
        h += '<div class="an-chart-header"><span class="an-chart-title">'+title+'</span></div>';
        h += '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 0">';
        var pmLabels = {cash: "Naqd", card: "Karta", transfer: "O'tkazma"};
        var pmIcons = {cash: "💵", card: "💳", transfer: "🏦"};
        var pmColors = ['var(--accent)', 'var(--accent2)', 'var(--warning)'];
        var pmTotal = 0;
        items.forEach(function(p) { pmTotal += p.total; });
        items.forEach(function(p, i) {
            var pct = pmTotal > 0 ? Math.round(p.total / pmTotal * 100) : 0;
            h += '<div class="ce-card" style="flex:1;min-width:90px;padding:12px;text-align:center;border:1px solid var(--border)">';
            h += '<div style="font-size:20px">'+((pmIcons[p.method]) || '💰')+'</div>';
            h += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">'+(pmLabels[p.method] || p.method)+'</div>';
            h += '<div style="font-size:15px;font-weight:700;color:'+(pmColors[i] || 'var(--text)')+';margin-top:2px">'+pct+'%</div>';
            h += '<div style="font-size:11px;color:var(--text-muted)">'+Utils.money(p.total)+'</div>';
            h += '</div>';
        });
        h += '</div></div>';
        return h;
    },

    _totalItem: function(label, value, color, isCount) {
        return '<div class="an-total-item"><div style="font-size:11px;color:var(--text-muted)">'+label+'</div><div style="font-size:16px;font-weight:700;color:'+color+'">'+(isCount ? value : Utils.money(value))+'</div></div>';
    },

    bind: function() {
        // Professional davr filtri (PeriodFilter) → o'zgarsa backenddan qayta yuklash
        PeriodFilter.bind(document.getElementById('app'), Analytics.st, (Analytics.data || {}).months, function() {
            Analytics.load();
        });

        // AI analyze button
        var aiBtn = document.getElementById('btn-ai-analyze');
        if (aiBtn) {
            aiBtn.onclick = function() {
                if (Analytics.aiLoading) return;
                Analytics._runAIAnalysis();
            };
        }

        // AI history toggle
        var histBtn = document.getElementById('btn-ai-history');
        if (histBtn) {
            histBtn.onclick = function() {
                var list = document.getElementById('ai-history-list');
                if (list) {
                    var isOpen = list.style.display !== 'none';
                    list.style.display = isOpen ? 'none' : 'block';
                    histBtn.innerHTML = isOpen
                        ? '<i class="fas fa-history" style="margin-right:4px"></i> Oldingi tahlillar'
                        : '<i class="fas fa-times" style="margin-right:4px"></i> Yopish';
                }
            };
        }
    },

    _runAIAnalysis: function() {
        Analytics.aiLoading = true;
        Analytics._streamText = '';
        var btn = document.getElementById('btn-ai-analyze');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:4px"></i> Tahlil qilinmoqda...';
        }

        var resultEl = document.getElementById('ai-result');
        if (resultEl) {
            resultEl.innerHTML = '<div class="an-ai-stream">' +
                '<div class="an-ai-stream-header">' +
                '<div class="an-ai-loading-dots"><span></span><span></span><span></span></div>' +
                '<span style="font-size:12px;color:var(--text-muted);margin-left:8px">AI yozmoqda...</span></div>' +
                '<div class="an-ai-stream-text" id="ai-stream-text"></div></div>';
        }

        function cleanup() {
            WS.off('ai.chunk');
            WS.off('ai.done');
            WS.off('ai.error');
        }

        function resetBtn() {
            Analytics.aiLoading = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-magic" style="margin-right:4px"></i> Qayta tahlil <span class="an-ai-cost">50 🪙</span>';
            }
        }

        WS.on('ai.chunk', function(msg) {
            Analytics._streamText += msg.data.text;
            var el = document.getElementById('ai-stream-text');
            if (el) {
                el.innerHTML = Analytics._formatContent(Analytics._streamText);
                el.scrollTop = el.scrollHeight;
            }
        });

        WS.on('ai.done', function(msg) {
            cleanup();
            resetBtn();
            Analytics._renderAIResult(msg.data);
            Toast.success('AI tahlil tayyor!');
            Analytics._loadAIHistory();
        });

        WS.on('ai.error', function(msg) {
            cleanup();
            resetBtn();
            if (resultEl) resultEl.innerHTML = '';
            Toast.error(msg.data.error || 'AI tahlil xatosi');
        });

        WS.send('analytics.ai', PeriodFilter.query(Analytics.st), function(msg) {
            if (!msg.ok) {
                cleanup();
                resetBtn();
                if (resultEl) resultEl.innerHTML = '';
                Toast.error(msg.error || 'AI tahlil xatosi');
            }
        }, 30000);
    },

    // ─── Charts ───

    drawCharts: function(d) {
        Analytics._drawRevenueChart(d.chart);
        Analytics._drawProfitMonthly(d.profit_monthly);
        Analytics._drawStatusDonut(d.status_distribution);
        Analytics._drawCategoryBars(d.expense_categories);
        Analytics._drawStageBars(d.stage_performance);
    },

    // (A) Oylik sof foyda — topshirilgan-oy bo'yicha ustun grafik (musbat/manfiy)
    _drawProfitMonthly: function(pm) {
        var container = document.getElementById('profit-monthly-chart');
        if (!container) return;
        if (!pm || !pm.length) {
            container.innerHTML = '<div class="ce-empty" style="padding:20px"><p>Topshirilgan buyurtma yo\'q</p></div>';
            return;
        }

        var vals = pm.map(function(x) { return parseInt(x.profit) || 0; });
        var maxV = Math.max.apply(null, vals.concat([0]));
        var minV = Math.min.apply(null, vals.concat([0]));
        var range = (maxV - minV) || 1;
        var w = container.offsetWidth || 320;
        var h = 200;
        var pad = {top: 18, right: 12, bottom: 34, left: 12};
        var chartW = w - pad.left - pad.right;
        var chartH = h - pad.top - pad.bottom;
        var n = pm.length;
        var groupW = chartW / n;
        var barW = Math.min(Math.max(groupW * 0.5, 10), 44);
        var zeroY = pad.top + (maxV / range) * chartH;   // 0-qiymat uchun y

        var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:100%">';
        // 0-chiziq (baseline)
        svg += '<line x1="' + pad.left + '" y1="' + zeroY + '" x2="' + (w - pad.right) + '" y2="' + zeroY + '" stroke="var(--border)" stroke-width="1"/>';

        for (var i = 0; i < n; i++) {
            var cx = pad.left + groupW * i + groupW / 2;
            var v = vals[i];
            var barH = Math.max(Math.abs(v) / range * chartH, 1);
            var isPos = v >= 0;
            var by = isPos ? (zeroY - barH) : zeroY;
            var color = isPos ? 'var(--accent)' : 'var(--danger)';
            var bx = cx - barW / 2;
            svg += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + barH + '" rx="4" fill="' + color + '" opacity="0.85">';
            svg += '<animate attributeName="height" from="0" to="' + barH + '" dur="0.6s" fill="freeze"/>';
            svg += '<animate attributeName="y" from="' + zeroY + '" to="' + by + '" dur="0.6s" fill="freeze"/>';
            svg += '</rect>';
            // Qiymat yorlig'i
            var lblY = isPos ? (by - 5) : (by + barH + 11);
            svg += '<text x="' + cx + '" y="' + lblY + '" text-anchor="middle" font-size="9" font-weight="700" fill="' + color + '" font-family="Inter,system-ui">' + Analytics._shortMoney(v) + '</text>';
            // Oy yorlig'i
            svg += '<text x="' + cx + '" y="' + (h - 4) + '" text-anchor="middle" font-size="9" fill="var(--text-muted)" font-family="Inter,system-ui">' + PeriodFilter.mlabel(pm[i].month, true) + '</text>';
        }
        svg += '</svg>';
        container.innerHTML = svg;
    },

    _drawRevenueChart: function(chart) {
        var container = document.getElementById('revenue-chart');
        if (!container || !chart.labels.length) return;

        var allVals = chart.income.concat(chart.expense);
        var maxVal = Math.max.apply(null, allVals) || 1;
        var w = container.offsetWidth;
        var h = 200;
        var padding = {top: 10, right: 12, bottom: 30, left: 12};
        var chartW = w - padding.left - padding.right;
        var chartH = h - padding.top - padding.bottom;
        var n = chart.labels.length;
        var barGroupW = chartW / n;
        var barW = Math.min(Math.max(barGroupW * 0.3, 4), 16);
        var gap = Math.max(barW * 0.3, 2);

        var svg = '<svg viewBox="0 0 '+w+' '+h+'" style="width:100%;height:100%">';

        for (var g = 0; g <= 4; g++) {
            var gy = padding.top + (chartH / 4) * g;
            svg += '<line x1="'+padding.left+'" y1="'+gy+'" x2="'+(w-padding.right)+'" y2="'+gy+'" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3,3"/>';
        }

        for (var i = 0; i < n; i++) {
            var cx = padding.left + barGroupW * i + barGroupW / 2;
            var incH = (chart.income[i] / maxVal) * chartH;
            var expH = (chart.expense[i] / maxVal) * chartH;

            if (chart.income[i] > 0) {
                var ix = cx - gap/2 - barW;
                var iy = padding.top + chartH - incH;
                svg += '<rect x="'+ix+'" y="'+iy+'" width="'+barW+'" height="'+incH+'" rx="'+Math.min(barW/2,3)+'" fill="var(--accent)" opacity="0.85">';
                svg += '<animate attributeName="height" from="0" to="'+incH+'" dur="0.6s" fill="freeze"/>';
                svg += '<animate attributeName="y" from="'+(padding.top+chartH)+'" to="'+iy+'" dur="0.6s" fill="freeze"/>';
                svg += '</rect>';
            }

            if (chart.expense[i] > 0) {
                var ex = cx + gap/2;
                var ey = padding.top + chartH - expH;
                svg += '<rect x="'+ex+'" y="'+ey+'" width="'+barW+'" height="'+expH+'" rx="'+Math.min(barW/2,3)+'" fill="var(--danger)" opacity="0.7">';
                svg += '<animate attributeName="height" from="0" to="'+expH+'" dur="0.6s" fill="freeze"/>';
                svg += '<animate attributeName="y" from="'+(padding.top+chartH)+'" to="'+ey+'" dur="0.6s" fill="freeze"/>';
                svg += '</rect>';
            }

            if (n <= 12 || i % Math.ceil(n / 12) === 0) {
                svg += '<text x="'+cx+'" y="'+(h - 4)+'" text-anchor="middle" font-size="9" fill="var(--text-muted)" font-family="Inter,system-ui">'+chart.labels[i]+'</text>';
            }
        }

        svg += '<rect x="'+padding.left+'" y="2" width="8" height="8" rx="2" fill="var(--accent)" opacity="0.85"/>';
        svg += '<text x="'+(padding.left+12)+'" y="9" font-size="9" fill="var(--text-muted)" font-family="Inter,system-ui">Kirim</text>';
        svg += '<rect x="'+(padding.left+50)+'" y="2" width="8" height="8" rx="2" fill="var(--danger)" opacity="0.7"/>';
        svg += '<text x="'+(padding.left+62)+'" y="9" font-size="9" fill="var(--text-muted)" font-family="Inter,system-ui">Chiqim</text>';

        svg += '</svg>';
        container.innerHTML = svg;
    },

    _drawStatusDonut: function(dist) {
        var container = document.getElementById('status-chart');
        if (!container || !dist.length) { if (container) container.innerHTML = '<div class="ce-empty" style="padding:20px"><p>Ma\'lumot yo\'q</p></div>'; return; }

        var total = 0;
        dist.forEach(function(s) { total += s.count; });
        if (total === 0) { container.innerHTML = '<div class="ce-empty" style="padding:20px"><p>Ma\'lumot yo\'q</p></div>'; return; }

        var statusColors = {
            'new': '#3b82f6', 'in_progress': '#f59e0b', 'at_mebelcity': '#8b5cf6',
            'ready': '#10b981', 'delivered': '#059669', 'completed': '#047857', 'cancelled': '#ef4444'
        };
        var statusLabels = {
            'new': 'Yangi', 'in_progress': 'Jarayonda', 'at_mebelcity': 'MebelCity',
            'ready': 'Tayyor', 'delivered': 'Topshirildi', 'completed': 'Tugallangan', 'cancelled': 'Bekor'
        };

        var size = 140;
        var cx = size/2, cy = size/2, r = 52, r2 = 34;
        var svg = '<svg viewBox="0 0 '+size+' '+size+'" style="width:'+size+'px;height:'+size+'px">';

        var angle = -90;
        dist.forEach(function(s) {
            var sweep = (s.count / total) * 360;
            if (sweep < 0.5) return;
            var startRad = angle * Math.PI / 180;
            var endRad = (angle + sweep) * Math.PI / 180;

            var x1 = cx + r * Math.cos(startRad);
            var y1 = cy + r * Math.sin(startRad);
            var x2 = cx + r * Math.cos(endRad);
            var y2 = cy + r * Math.sin(endRad);
            var x3 = cx + r2 * Math.cos(endRad);
            var y3 = cy + r2 * Math.sin(endRad);
            var x4 = cx + r2 * Math.cos(startRad);
            var y4 = cy + r2 * Math.sin(startRad);
            var large = sweep > 180 ? 1 : 0;

            svg += '<path d="M'+x1+','+y1+' A'+r+','+r+' 0 '+large+' 1 '+x2+','+y2+' L'+x3+','+y3+' A'+r2+','+r2+' 0 '+large+' 0 '+x4+','+y4+' Z" fill="'+(statusColors[s.status]||'#9ca3af')+'" opacity="0.9">';
            svg += '<animate attributeName="opacity" from="0" to="0.9" dur="0.5s" fill="freeze"/>';
            svg += '</path>';
            angle += sweep;
        });

        svg += '<text x="'+cx+'" y="'+(cy-4)+'" text-anchor="middle" font-size="18" font-weight="800" fill="var(--text)" font-family="Inter,system-ui">'+total+'</text>';
        svg += '<text x="'+cx+'" y="'+(cy+12)+'" text-anchor="middle" font-size="9" fill="var(--text-muted)" font-family="Inter,system-ui">buyurtma</text>';
        svg += '</svg>';

        var legend = '<div style="display:flex;flex-direction:column;gap:4px">';
        dist.forEach(function(s) {
            var pct = Math.round(s.count / total * 100);
            legend += '<div style="display:flex;align-items:center;gap:6px;font-size:12px">';
            legend += '<div style="width:10px;height:10px;border-radius:3px;background:'+(statusColors[s.status]||'#9ca3af')+'"></div>';
            legend += '<span style="color:var(--text-muted)">'+(statusLabels[s.status]||s.status)+'</span>';
            legend += '<span style="font-weight:700;margin-left:auto">'+s.count+' <span style="color:var(--text-muted);font-weight:400">('+pct+'%)</span></span>';
            legend += '</div>';
        });
        legend += '</div>';

        container.innerHTML = svg + legend;
    },

    _drawCategoryBars: function(cats) {
        var container = document.getElementById('category-chart');
        if (!container) return;
        if (!cats.length) { container.innerHTML = '<div class="ce-empty" style="padding:16px"><p>Chiqim yo\'q</p></div>'; return; }

        var catLabels = {material:'Material', service:'Xizmat', transport:'Transport', furniture:'Mebel', mebelcity:'MebelCity', other:'Boshqa'};
        var catColors = {material:'#3b82f6', service:'#8b5cf6', transport:'#f59e0b', furniture:'#10b981', mebelcity:'#6366f1', other:'#9ca3af'};
        var maxCat = cats[0].total;

        var h = '';
        cats.forEach(function(c) {
            var pct = Math.round(c.total / maxCat * 100);
            var color = catColors[c.category] || '#9ca3af';
            h += '<div style="padding:6px 0">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">';
            h += '<span style="font-size:12px;font-weight:500">'+(catLabels[c.category]||c.category)+'</span>';
            h += '<span style="font-size:12px;font-weight:700;color:'+color+'">'+Utils.money(c.total)+'</span>';
            h += '</div>';
            h += '<div style="height:8px;background:var(--surface2);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:4px;transition:width .8s ease"></div></div>';
            h += '</div>';
        });
        container.innerHTML = h;
    },

    _drawStageBars: function(stages) {
        var container = document.getElementById('stage-chart');
        if (!container || !stages.length) return;

        var maxStg = stages[0].count;
        var stageColors = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#6366f1','#ef4444','#059669','#ec4899'];

        var h = '';
        stages.forEach(function(s, i) {
            var pct = Math.round(s.count / maxStg * 100);
            var color = stageColors[i % stageColors.length];
            h += '<div style="padding:6px 0">';
            h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">';
            h += '<span style="font-size:12px;font-weight:500">'+Utils.esc(s.title)+'</span>';
            h += '<span style="font-size:12px;font-weight:700;color:'+color+'">'+s.count+' ta</span>';
            h += '</div>';
            h += '<div style="height:8px;background:var(--surface2);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:4px;transition:width .8s ease"></div></div>';
            h += '</div>';
        });
        container.innerHTML = h;
    },
};
