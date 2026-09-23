/* client_erp/js/pages/oldi-berdi.js — MebelCity moliyaviy ma'lumotlar */
var OldiBerdi = {
    _data: null,
    _tab: 'sales',
    _period: 'all',
    _offsets: {},

    render: function() {
        this._tab = 'sales';
        this._period = 'all';
        this._reload('all');
    },

    _reload: function(period) {
        OldiBerdi._period = period || 'all';
        OldiBerdi._offsets = {sales: 20, returns: 20, operations: 20};
        var app = document.getElementById('app');
        app.innerHTML = Skeleton.oldiBerdi();
        WS.send('page.oldi_berdi', {period: OldiBerdi._period}, function(msg) {
            if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
            OldiBerdi._data = msg.data;
            app.innerHTML = OldiBerdi.template(msg.data);
            OldiBerdi.bind();
        });
    },

    template: function(d) {
        if (!d.linked) {
            return '<div class="ce-card" style="padding:24px;text-align:center;margin-top:20px">' +
                '<div style="font-size:40px;margin-bottom:12px">🔗</div>' +
                '<div style="font-size:15px;font-weight:600;margin-bottom:6px">Hisob ulanmagan</div>' +
                '<div style="font-size:13px;color:var(--text-muted)">Sizning hisobingiz MebelCity tizimiga ulanmagan. Admin bilan bog\'laning.</div>' +
                '</div>';
        }

        var h = '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:14px">';
        h += '<div>';
        h += '<h2 style="font-size:18px;margin:0 0 4px 0">Oldi-Berdi</h2>';
        h += '<div style="font-size:12px;color:var(--text-muted)">' + Utils.esc(d.client_name) + '</div>';
        h += '</div>';
        h += '<button class="ce-btn ce-btn-secondary" id="ob-refresh" title="Yangilash" style="font-size:16px;padding:6px 12px">&#8635;</button>';
        h += '</div>';

        // Period filter chips
        h += '<div style="display:flex;gap:6px;margin-bottom:12px;overflow-x:auto" id="ob-period">';
        [['all', 'Barchasi'], ['month', 'Shu oy'], ['last_month', "O'tgan oy"], ['year', 'Shu yil']].forEach(function(p) {
            var active = (OldiBerdi._period === p[0]);
            h += '<button class="ce-btn ob-period-chip' + (active ? ' ce-btn-secondary active' : '') +
                '" data-period="' + p[0] + '" style="font-size:11px;padding:5px 10px;white-space:nowrap">' + p[1] + '</button>';
        });
        h += '</div>';

        // Qarzdorlik cards (clients.balance_uzs = to'lanmagan qarz)
        var debtU = parseFloat(d.balance.uzs) || 0;
        var debtD = parseFloat(d.balance.usd) || 0;
        var gradRed = 'linear-gradient(135deg,#dc2626,#ef4444)';
        var gradGreen = 'linear-gradient(135deg,#059669,#10b981)';
        h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">';
        h += '<div class="ce-card" style="padding:12px;background:' + (debtU > 0 ? gradRed : gradGreen) + ';color:#fff;border:none">';
        h += '<div style="font-size:10px;opacity:.85">Qarzdorlik UZS</div>';
        h += '<div style="font-size:18px;font-weight:800">' + (debtU > 0 ? Utils.money(d.balance.uzs) : "Qarz yo'q") + '</div>';
        h += '</div>';
        h += '<div class="ce-card" style="padding:12px;background:' + (debtD > 0 ? gradRed : gradGreen) + ';color:#fff;border:none">';
        h += '<div style="font-size:10px;opacity:.85">Qarzdorlik USD</div>';
        h += '<div style="font-size:18px;font-weight:800">' + (debtD > 0 ? '$' + OldiBerdi._fmtUsd(d.balance.usd) : "Qarz yo'q") + '</div>';
        h += '</div></div>';

        // Summary cards
        var sm = d.summary;
        h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:14px">';
        h += OldiBerdi._summaryCard('Sotuvlar', sm.sales_count, Utils.money(sm.total_sales), 'var(--accent)');
        h += OldiBerdi._summaryCard('Qaytarish', sm.returns_count, Utils.money(sm.total_returns), '#f59e0b');
        h += OldiBerdi._summaryCard('Qarzlar', sm.debts_count, Utils.money(sm.total_debt), 'var(--danger)');
        h += OldiBerdi._summaryCard("To'lovlar", sm.operations_count, Utils.money(sm.total_payments), '#8b5cf6');
        h += '</div>';

        // Tabs
        h += '<div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto" id="ob-tabs">';
        var cur = OldiBerdi._tab || 'sales';
        h += OldiBerdi._tabBtn('sales', 'Sotuvlar', cur === 'sales');
        h += OldiBerdi._tabBtn('returns', 'Qaytarish', cur === 'returns');
        h += OldiBerdi._tabBtn('debts', 'Qarzlar', cur === 'debts');
        h += OldiBerdi._tabBtn('operations', "To'lovlar", cur === 'operations');
        h += '</div>';

        // Tab contents
        h += OldiBerdi._tabContent('sales', d.sales, OldiBerdi._saleCard, d.has_more.sales, cur === 'sales' ? '' : 'none');
        h += OldiBerdi._tabContent('returns', d.returns, OldiBerdi._returnCard, d.has_more.returns, cur === 'returns' ? '' : 'none');
        h += OldiBerdi._tabContent('debts', d.debts, OldiBerdi._debtCard, false, cur === 'debts' ? '' : 'none');
        h += OldiBerdi._tabContent('operations', d.operations, OldiBerdi._opCard, d.has_more.operations, cur === 'operations' ? '' : 'none');

        return h;
    },

    _fmtUsd: function(val) {
        var n = parseFloat(val) || 0;
        return n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    },

    _summaryCard: function(label, count, total, color) {
        return '<div class="ce-card" style="padding:8px;text-align:center">' +
            '<div style="font-size:16px;font-weight:700;color:' + color + '">' + count + '</div>' +
            '<div style="font-size:9px;color:var(--text-muted)">' + label + '</div>' +
            '</div>';
    },

    _tabBtn: function(tab, label, active) {
        return '<button class="ce-btn ob-tab' + (active ? ' ce-btn-secondary active' : '') +
            '" data-tab="' + tab + '" style="font-size:12px;padding:6px 12px;white-space:nowrap">' + label + '</button>';
    },

    _tabContent: function(tab, items, renderer, hasMore, display) {
        var h = '<div id="ob-tab-' + tab + '" style="display:' + (display || '') + '">';
        if (!items.length) {
            var emptyMap = {sales: 'Sotuv', returns: 'Qaytarish', debts: 'Qarz', operations: "To'lov"};
            h += '<div class="ce-empty"><div class="ce-empty-icon">📭</div><p>Hali ' + (emptyMap[tab] || '') + " yo'q</p></div>";
        } else {
            h += '<div id="ob-list-' + tab + '">';
            items.forEach(function(item) { h += renderer(item); });
            h += '</div>';
            if (hasMore) {
                h += '<div style="text-align:center;margin-top:10px" id="ob-more-' + tab + '">';
                h += '<button class="ce-btn ce-btn-secondary ob-load-more" data-section="' + tab + '" style="font-size:12px;padding:6px 16px">Ko\'proq yuklash</button>';
                h += '</div>';
            }
        }
        h += '</div>';
        return h;
    },

    _saleCard: function(s) {
        // 2026-08-06: bosilsa tafsilot ochiladi («nega qarz bo'lgan»)
        var h = '<div class="ce-card ob-sale" data-sid="' + s.id + '" '
              + 'style="padding:10px;margin-bottom:6px;cursor:pointer">';
        h += '<div style="display:flex;justify-content:space-between;align-items:start">';
        h += '<div>';
        h += '<div style="font-size:13px;font-weight:600">' + Utils.esc(s.doc_number || '—') + '</div>';
        h += '<div style="font-size:11px;color:var(--text-muted)">' + Utils.datetime(s.date) + (s.warehouse ? ' · ' + Utils.esc(s.warehouse) : '') + '</div>';
        h += '</div>';
        h += '<div style="text-align:right">';
        h += '<div style="font-size:14px;font-weight:700;color:var(--accent)">' + Utils.money(s.total_uzs) + '</div>';
        if (s.total_usd) h += '<div style="font-size:10px;color:var(--text-muted)">$' + OldiBerdi._fmtUsd(s.total_usd) + '</div>';
        h += '</div></div>';
        var paid = parseInt(s.paid_uzs) || 0;
        var total = parseInt(s.total_uzs) || 0;
        var debt = parseInt(s.debt_uzs) || 0;
        if (total > 0 && paid > 0) {
            // ⚠️ 2026-08-06: foiz 100% bilan CHEKLANADI.
            // Jonli bazada topildi: 501967 — sotuv 103 800, to'lov 1 200 000
            // (1156%), 501775 — 769%. MebelCity tomonida bitta katta to'lov
            // kichik chekka biriktirilgan. Ma'lumot o'zgartirilmaydi —
            // faqat ko'rinish to'g'rilanadi va ORTIQCHA ochiq aytiladi.
            var rawPct = Math.round(paid / total * 100);
            var pct = Math.min(100, rawPct);
            h += '<div style="margin-top:6px;font-size:10px;color:var(--text-muted)">To\'langan: '
               + Utils.money(paid) + ' (' + pct + '%)</div>';
            h += Utils.progressBar(pct);
            if (paid > total) {
                h += '<div style="margin-top:4px;font-size:10px;color:#f59e0b">'
                   + '⚠️ Ortiqcha: ' + Utils.money(paid - total) + ' — bu to\'lov boshqa cheklarga tegishli bo\'lishi mumkin</div>';
            }
        } else if (debt > 0) {
            h += '<div style="margin-top:6px;font-size:10px;color:var(--danger)">Qarz: ' + Utils.money(debt) + '</div>';
        }
        h += '<div style="margin-top:5px;font-size:9.5px;color:var(--text-muted);text-align:right">tafsilot uchun bosing ›</div>';
        h += '</div>';
        return h;
    },

    _returnCard: function(r) {
        var h = '<div class="ce-card" style="padding:10px;margin-bottom:6px">';
        h += '<div style="display:flex;justify-content:space-between;align-items:start">';
        h += '<div>';
        h += '<div style="font-size:13px;font-weight:600">' + Utils.esc(r.doc_number || '—') + '</div>';
        h += '<div style="font-size:11px;color:var(--text-muted)">' + Utils.datetime(r.date) + (r.warehouse ? ' · ' + Utils.esc(r.warehouse) : '') + '</div>';
        h += '</div>';
        h += '<div style="text-align:right">';
        h += '<div style="font-size:14px;font-weight:700;color:#f59e0b">' + Utils.money(r.total_uzs) + '</div>';
        if (r.total_usd) h += '<div style="font-size:10px;color:var(--text-muted)">$' + OldiBerdi._fmtUsd(r.total_usd) + '</div>';
        h += '</div></div></div>';
        return h;
    },

    _debtCard: function(d) {
        var h = '<div class="ce-card" style="padding:10px;margin-bottom:6px">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center">';
        h += '<div>';
        h += '<div style="font-size:14px;font-weight:700;color:var(--danger)">' + Utils.money(d.remaining || d.amount) + '</div>';
        if (d.ref_number) h += '<div style="font-size:11px;color:var(--text-muted)">' + Utils.esc(d.ref_number) + '</div>';
        var dates = [];
        if (d.recorded_date) dates.push('Yozilgan: ' + Utils.date(d.recorded_date));
        if (d.due_date) dates.push('Muddat: ' + Utils.date(d.due_date));
        if (dates.length) h += '<div style="font-size:11px;color:var(--text-muted)">' + dates.join(' · ') + '</div>';
        h += '</div>';
        if (parseInt(d.amount) > 0 && parseInt(d.remaining) < parseInt(d.amount)) {
            var pct = Math.round(parseInt(d.remaining) / parseInt(d.amount) * 100);
            h += '<div style="font-size:11px;color:var(--text-muted)">Qoldiq: ' + pct + '%</div>';
        }
        h += '</div></div>';
        return h;
    },

    _opCard: function(o) {
        var amountColor = o.is_income ? 'var(--accent)' : '#8b5cf6';
        var h = '<div class="ce-card" style="padding:10px;margin-bottom:6px">';
        h += '<div style="display:flex;justify-content:space-between;align-items:start">';
        h += '<div>';
        h += '<div style="font-size:13px;font-weight:600">' + Utils.esc(o.doc_number || o.doc_type || '—') + '</div>';
        var meta = [];
        if (o.payment_method) meta.push(Utils.esc(o.payment_method));
        if (o.date) meta.push(Utils.datetime(o.date));
        if (meta.length) h += '<div style="font-size:11px;color:var(--text-muted)">' + meta.join(' · ') + '</div>';
        if (o.note) h += '<div style="font-size:10px;color:var(--text-muted)">' + Utils.esc(o.note).substring(0, 80) + '</div>';
        if (o.related_doc) h += '<div style="font-size:10px;color:var(--text-muted)">Bog\'liq: ' + Utils.esc(o.related_doc) + '</div>';
        h += '</div>';
        h += '<div style="text-align:right">';
        h += '<div style="font-size:14px;font-weight:700;color:' + amountColor + '">' + (o.is_income ? '+' : '-') + Utils.money(o.total_uzs) + '</div>';
        if (o.total_usd) h += '<div style="font-size:10px;color:var(--text-muted)">$' + OldiBerdi._fmtUsd(o.total_usd) + '</div>';
        h += '</div></div></div>';
        return h;
    },

    // ══════════════════════════════════════════════════════════════════
    //  SOTUV TAFSILOTI (2026-08-06) — «nima uchun va nimaga qarz bo'lgan»
    //  Foydalanuvchi so'rovi. Ma'lumot WS orqali serverdan olinadi
    //  (`oldi_berdi.detail`), faqat bosilganda — ro'yxat og'irlashmasin.
    // ══════════════════════════════════════════════════════════════════
    _openDetail: function(saleId) {
        if (!(window.WS && WS.send)) return;
        var esc = Utils.esc, money = Utils.money;
        var box = document.getElementById('ob-detail');
        if (!box) {
            box = document.createElement('div');
            box.id = 'ob-detail';
            box.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.62);'
                + 'display:flex;align-items:flex-end;justify-content:center;padding:0';
            document.body.appendChild(box);
        }
        box.innerHTML = '<div style="background:var(--sfc,#1E1D24);width:100%;max-width:520px;'
            + 'max-height:88vh;overflow-y:auto;border-radius:20px 20px 0 0;padding:18px 16px 26px">'
            + '<div style="text-align:center;color:var(--mut,#9B9AA3);font-size:12px">Yuklanmoqda…</div></div>';
        box.onclick = function(e) { if (e.target === box) box.remove(); };

        WS.send('oldi_berdi.detail', { sale_id: saleId }, function(msg) {
            if (!msg || !msg.ok) { box.remove(); Toast.error((msg && msg.error) || 'Topilmadi'); return; }
            var d = msg.data, s = d.sale, dbt = d.debt;
            var h = '<div style="background:var(--sfc,#1E1D24);width:100%;max-width:520px;'
                  + 'max-height:88vh;overflow-y:auto;border-radius:20px 20px 0 0;padding:18px 16px 26px">';
            h += '<div style="width:38px;height:4px;background:var(--brd2,rgba(255,255,255,.2));'
               + 'border-radius:99px;margin:0 auto 14px"></div>';

            // Sarlavha
            h += '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px">'
               + '<div style="flex:1"><div style="font-weight:800;font-size:17px">' + esc(s.doc_number) + '</div>'
               + '<div style="font-size:11.5px;color:var(--mut)">' + Utils.datetime(s.date)
               + (s.warehouse ? ' · ' + esc(s.warehouse) : '') + ' · ' + esc(s.status) + '</div></div>'
               + '<button id="ob-det-x" style="background:none;border:none;color:var(--mut);'
               + 'font-size:22px;cursor:pointer;line-height:1">&times;</button></div>';

            // Hisob
            var row = function(lbl, val, clr, big) {
                return '<div style="display:flex;align-items:baseline;gap:8px;padding:4px 0">'
                     + '<span style="font-size:12.5px;color:var(--mut)">' + lbl + '</span>'
                     + '<span style="flex:1;border-bottom:1px dotted var(--brd,rgba(255,255,255,.12))"></span>'
                     + '<span style="font-size:' + (big ? '16px' : '13.5px') + ';font-weight:800;color:' + clr
                     + ';font-variant-numeric:tabular-nums">' + val + '</span></div>';
            };
            h += '<div style="background:var(--sfc2,#29282F);border-radius:14px;padding:12px 14px;margin-bottom:14px">';
            h += row('Mahsulot summasi', money(s.total), 'var(--txt,#F5F4F7)');
            h += row("To'langan", money(s.paid), 'var(--acc-text,#DCF262)');
            h += '<div style="height:2px;background:var(--brd2,rgba(255,255,255,.15));margin:7px 0"></div>';
            if (parseFloat(s.debt) > 0) {
                h += row('🔴 QARZ', money(s.debt), 'var(--danger,#F58B8B)', true);
            } else {
                h += row('✅ QARZ YO\'Q', '0', 'var(--mut)', true);
            }
            if (parseFloat(s.overpaid) > 0) {
                h += '<div style="margin-top:8px;font-size:11px;color:#f59e0b;line-height:1.5">'
                   + '⚠️ Ortiqcha to\'lov: <b>' + money(s.overpaid) + '</b><br>'
                   + 'Bu chekka kerakidan ko\'p pul biriktirilgan — ehtimol to\'lov '
                   + 'boshqa cheklarga taqsimlanishi kerak edi. MebelCity bilan tekshiring.</div>';
            }
            h += '</div>';

            // Nega qarz bo'lgan
            h += '<div style="font-weight:800;font-size:13px;margin-bottom:6px">Nega qarz bo\'lgan?</div>';
            if (dbt) {
                h += '<div style="font-size:12px;color:var(--mut);line-height:1.65;margin-bottom:12px">'
                   + 'Mahsulot olinganda pul to\'liq to\'lanmagan — shuning uchun '
                   + '<b>' + money(dbt.original) + '</b> so\'mlik qarz yozuvi ochilgan'
                   + (dbt.created_at ? ' (' + Utils.date(dbt.created_at) + ')' : '') + '.<br>'
                   + (dbt.is_paid
                      ? '✅ Qarz <b>to\'liq yopilgan</b>' + (dbt.paid_at ? ' — ' + Utils.date(dbt.paid_at) : '') + '.'
                      : 'Hozircha <b>' + money(dbt.remaining) + '</b> so\'m qoldiq bor.')
                   + (dbt.due_date ? '<br>📅 Muddat: ' + Utils.date(dbt.due_date) : '')
                   + '</div>';
            } else {
                h += '<div style="font-size:12px;color:var(--mut);line-height:1.65;margin-bottom:12px">'
                   + 'Bu chek bo\'yicha qarz yozuvi ochilmagan — mahsulot '
                   + '<b>darhol to\'langan</b> yoki qarz boshqa hujjatga yozilgan.</div>';
            }

            // To'lovlar tarixi
            if (d.payments && d.payments.length) {
                h += '<div style="font-weight:800;font-size:13px;margin-bottom:6px">To\'lovlar ('
                   + d.payments.length + ')</div><div style="margin-bottom:12px">';
                d.payments.forEach(function(p) {
                    h += '<div style="display:flex;gap:8px;padding:7px 10px;background:var(--sfc2,#29282F);'
                       + 'border-radius:10px;margin-bottom:5px">'
                       + '<div style="flex:1;min-width:0"><div style="font-size:12px">' + Utils.date(p.date) + '</div>'
                       + (p.note ? '<div style="font-size:10.5px;color:var(--mut);overflow:hidden;'
                         + 'text-overflow:ellipsis;white-space:nowrap">' + esc(p.note) + '</div>' : '')
                       + '</div><div style="font-weight:800;font-size:13px;color:var(--acc-text,#DCF262);'
                       + 'white-space:nowrap">' + money(p.amount) + '</div></div>';
                });
                h += '</div>';
            }

            // Nima olingan
            if (d.lines && d.lines.length) {
                h += '<div style="font-weight:800;font-size:13px;margin-bottom:6px">Nima olingan ('
                   + d.lines_count + ')</div>';
                d.lines.forEach(function(l) {
                    h += '<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid '
                       + 'var(--brd,rgba(255,255,255,.08))">'
                       + '<div style="flex:1;min-width:0;font-size:12px;overflow:hidden;'
                       + 'text-overflow:ellipsis;white-space:nowrap">' + esc(l.name || '—') + '</div>'
                       + '<div style="font-size:11px;color:var(--mut);white-space:nowrap">' + esc(l.qty) + '</div>'
                       + '<div style="font-size:12px;font-weight:700;white-space:nowrap">' + money(l.total) + '</div>'
                       + '</div>';
                });
            }
            h += '</div>';
            box.innerHTML = h;
            var x = document.getElementById('ob-det-x');
            if (x) x.onclick = function() { box.remove(); };
        });
    },

    bind: function() {
        // Sotuv kartasi — tafsilot (2026-08-06)
        document.querySelectorAll('.ob-sale').forEach(function(el) {
            el.onclick = function() { OldiBerdi._openDetail(el.dataset.sid); };
        });

        document.querySelectorAll('.ob-tab').forEach(function(btn) {
            btn.onclick = function() {
                document.querySelectorAll('.ob-tab').forEach(function(b) { b.classList.remove('active', 'ce-btn-secondary'); });
                btn.classList.add('active', 'ce-btn-secondary');
                var tab = btn.dataset.tab;
                OldiBerdi._tab = tab;
                ['sales', 'returns', 'debts', 'operations'].forEach(function(t) {
                    var el = document.getElementById('ob-tab-' + t);
                    if (el) el.style.display = (t === tab) ? '' : 'none';
                });
            };
        });

        document.querySelectorAll('.ob-load-more').forEach(function(btn) {
            btn.onclick = function() { OldiBerdi._loadMore(btn.dataset.section); };
        });

        document.querySelectorAll('.ob-period-chip').forEach(function(btn) {
            btn.onclick = function() {
                if (btn.dataset.period === OldiBerdi._period) return;
                OldiBerdi._reload(btn.dataset.period);
            };
        });

        var refreshBtn = document.getElementById('ob-refresh');
        if (refreshBtn) refreshBtn.onclick = function() { OldiBerdi._reload(OldiBerdi._period); };
    },

    _loadMore: function(section) {
        var offset = OldiBerdi._offsets[section] || 20;
        var btn = document.querySelector('.ob-load-more[data-section="' + section + '"]');
        if (btn) btn.textContent = 'Yuklanmoqda...';

        WS.send('oldi_berdi.load_more', {section: section, offset: offset, limit: 20, period: OldiBerdi._period}, function(msg) {
            if (!msg.ok) {
                if (btn) btn.textContent = "Ko'proq yuklash";
                return Toast.error(msg.error);
            }
            var renderers = {
                sales: OldiBerdi._saleCard,
                returns: OldiBerdi._returnCard,
                operations: OldiBerdi._opCard
            };
            var renderer = renderers[section];
            if (!renderer) return;

            var list = document.getElementById('ob-list-' + section);
            if (list && msg.data.items.length) {
                var html = '';
                msg.data.items.forEach(function(item) { html += renderer(item); });
                list.insertAdjacentHTML('beforeend', html);
            }

            OldiBerdi._offsets[section] = offset + msg.data.items.length;
            if (!msg.data.has_more) {
                var moreEl = document.getElementById('ob-more-' + section);
                if (moreEl) moreEl.style.display = 'none';
            } else {
                if (btn) btn.textContent = "Ko'proq yuklash";
            }
        });
    },
};
