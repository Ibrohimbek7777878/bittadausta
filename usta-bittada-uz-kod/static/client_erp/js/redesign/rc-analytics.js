/* client_erp/js/redesign/rc-analytics.js — Redesign Analitika (real page.analytics + AI).
   Ko'rinish qatlami yangi (rc- dizayn tizimi). Ma'lumot/WS mavjud analytics.js dan:
   WS.send('page.analytics', {period,[date_from,date_to]}) → summary/totals/chart/
   status_distribution/expense_categories/top_customers/months; analytics.ai_history;
   analytics.ai (stream: ai.chunk/ai.done/ai.error). Grafiklar: CUSTOM SVG/CSS. */
window.RC_PAGES = window.RC_PAGES || {};

var RcAnalytics = {
  _st: null,        // RcPeriod holati {period, ym, date_from, date_to} — default: Shu oy
  data: null,
  aiLoading: false,
  _streamText: '',

  // Grafiklar uchun yagona dizayn palitrasi (rc- ranglar)
  PALETTE: ['var(--cyan)', 'var(--acc)', 'var(--lav)', 'var(--pch)', 'var(--danger)', '#B8D93E', '#7FD0E0', '#B197EE'],

  MONTHS: ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'],

  STATUS_LABELS: {
    'new': 'Yangi', 'waiting': 'Kutilmoqda', 'in_progress': 'Jarayonda', 'at_mebelcity': 'MebelCity',
    'ready': 'Tayyor', 'delivered': 'Topshirildi', 'completed': 'Tugallangan', 'cancelled': 'Bekor',
  },
  CAT_LABELS: { material: 'Material', service: 'Xizmat', transport: 'Transport', furniture: 'Mebel', mebelcity: 'MebelCity', other: 'Boshqa' },

  render: function () {
    var app = document.getElementById('app');
    app.innerHTML = Skeleton.list(5);
    RcAnalytics._st = RcPeriod.init();   // default: Shu oy
    RcAnalytics.load();
  },

  load: function () {
    WS.send('page.analytics', RcPeriod.query(RcAnalytics._st), function (msg) {
      if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
      RcAnalytics.data = msg.data;
      var app = document.getElementById('app');
      app.innerHTML = RcAnalytics.template(msg.data);
      RcAnalytics.bind();
      RcAnalytics.drawCharts(msg.data);
      RcAnalytics._loadAIHistory();
    });
  },

  template: function (d) {
    var s = d.summary, t = d.totals;
    var money = Utils.money, esc = Utils.esc;
    var h = '<div data-screen>';

    // ── Professional davr filtri (RcPeriod: Shu oy / O'tgan oy / Aniq oy / Davr / Yil / Hammasi) ──
    h += RcPeriod.html(RcAnalytics._st, d.months);

    // ── 4 summary rc-stat (o'zgarish % rangli) ──
    var pos = parseInt(s.profit) >= 0;
    // (2026-08-12) Oldingi davr bilan foiz-taqqoslash (▲/▼ N%) OLIB TASHLANDI —
    // "Shu oy" kabi chala davrda chalkash/tushunarsiz ko'rinardi (foydalanuvchi
    // so'rovi bilan). Backend hali `income_change`/`expense_change`/
    // `orders_change` qaytaradi (zararsiz, ishlatilmaydi) — kerak bo'lsa qayta
    // yoqish uchun shu joyga qaytariladi.
    var stats = [
      { label: 'Kirim', val: money(s.income), clr: 'var(--acc-text)' },
      { label: 'Chiqim', val: money(s.expense), clr: 'var(--pch-text)' },
      { label: 'Foyda', val: money(s.profit), clr: pos ? 'var(--acc-text)' : 'var(--danger)' },
      // 2026-08-26: nomi aniqlashtirildi — bosh sahifadagi «Buyurtmalar»
      // (faol/jarayondagi) bilan CHALKASHARDI. Bu — shu davrda OCHILGAN
      // barcha zakaz (holatidan qat'iy nazar, hatto allaqachon topshirilgan
      // bo'lsa ham), bosh sahifadagi esa faqat FAOL (tugallanmagan).
      { label: 'Ochilgan buyurtmalar', val: s.orders, clr: 'var(--cyan-text)', count: true },
    ];
    h += '<div class="rc-grid rc-grid-auto">';
    stats.forEach(function (st, i) {
      h += '<div class="rc-stat" style="animation-delay:' + (i * .05) + 's">';
      h += '<div class="rc-stat-label">' + st.label + '</div>';
      h += '<div class="rc-stat-val" style="color:' + st.clr + '">' + st.val + '</div>';
      h += '</div>';
    });
    h += '</div>';

    // ── Topshirilgan buyurtmalar (shartnoma + deadline + topshirilgan sana) va Muddati o'tgan ──
    var dv = d.deliveries;
    if (dv) {
      var fdate = function (iso) { try { return Utils.date ? Utils.date(iso) : (iso || '').slice(0, 10); } catch (e) { return (iso || '').slice(0, 10); } };
      h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:12px">';
      h += '<div style="display:flex;align-items:center;justify-content:space-between">';
      h += '<div style="font-weight:800;font-size:14px">✅ Topshirilgan buyurtmalar</div>';
      h += '<span class="rc-chip-acc rc-chip">' + dv.delivered_count + ' ta · ' + money(dv.contract_total) + '</span></div>';
      if (dv.delivered_late > 0) h += '<div style="font-size:11px;color:var(--mut)">' + dv.delivered_on_time + ' vaqtida · <span style="color:var(--pch);font-weight:700">' + dv.delivered_late + ' kech</span></div>';
      (dv.delivered || []).forEach(function (o) {
        var late = o.days_late > 0;
        h += '<div' + (o.id ? ' onclick="Router.go(\'/orders/' + o.id + '\')" style="cursor:pointer;' : ' style="') + 'display:flex;align-items:center;gap:10px;background:var(--sfc2);border-radius:14px;padding:10px 12px">';
        h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</div>';
        h += '<div style="font-size:11px;color:var(--mut);margin-top:2px">📄 ' + money(o.contract) + ' · 📅 ' + fdate(o.deadline) + ' → 🚚 ' + fdate(o.delivered_at) + '</div></div>';
        h += '<span class="rc-badge" style="background:' + (late ? 'var(--pch)' : 'var(--acc)') + ';color:var(--acc-ink)">' + (late ? o.days_late + ' kun kech' : 'vaqtida') + '</span></div>';
      });
      if (!dv.delivered || !dv.delivered.length) h += '<div style="font-size:12px;color:var(--mut)">Bu davrda topshirilgan buyurtma yo\'q</div>';
      h += '</div>';

      // Muddati o'tgan (overdue) — aktiv buyurtmalar
      if (dv.overdue_count > 0) {
        h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:10px;border-color:color-mix(in srgb,var(--pch) 45%,var(--brd))">';
        h += '<div style="display:flex;align-items:center;justify-content:space-between"><div style="font-weight:800;font-size:14px;color:var(--pch)">⚠️ Muddati o\'tgan</div>';
        h += '<span class="rc-badge" style="background:var(--pch);color:var(--acc-ink)">' + dv.overdue_count + ' ta</span></div>';
        (dv.overdue || []).forEach(function (o) {
          h += '<div onclick="Router.go(\'/orders/' + o.id + '\')" style="display:flex;align-items:center;gap:10px;background:var(--sfc2);border-radius:14px;padding:10px 12px;cursor:pointer">';
          h += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</div>';
          h += '<div style="font-size:11px;color:var(--mut);margin-top:2px">' + esc(o.customer || '') + ' · 📅 ' + fdate(o.deadline) + '</div></div>';
          h += '<span class="rc-badge" style="background:var(--danger);color:var(--acc-ink)">' + o.days_over + ' kun</span></div>';
        });
        h += '</div>';
      }
    }

    // ── Bajarilgan bosqichlar ──
    if (d.stage_performance && d.stage_performance.length) {
      var maxCnt = 1; d.stage_performance.forEach(function (s) { if (s.count > maxCnt) maxCnt = s.count; });
      h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:8px">';
      h += '<div style="font-weight:800;font-size:14px">📊 Bajarilgan bosqichlar</div>';
      d.stage_performance.forEach(function (s) {
        var w = Math.max(4, Math.round(s.count / maxCnt * 100));
        h += '<div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span>' + esc(s.title) + '</span><span style="font-weight:700">' + s.count + '</span></div>';
        h += '<div style="height:7px;border-radius:99px;background:var(--sfc2);overflow:hidden"><div style="height:100%;width:' + w + '%;background:var(--acc);border-radius:99px"></div></div></div>';
      });
      h += '</div>';
    }
    // ── To'lov usullari (Kirim / Chiqim alohida) ──
    h += RcAnalytics._paymentSection("Kirim to'lov usullari", d.payment_data_income, 'var(--acc)');
    h += RcAnalytics._paymentSection("Chiqim to'lov usullari", d.payment_data_expense, 'var(--pch)');

    // ── AI Biznes Tahlil kartasi (lavender ikon) ──
    h += '<div class="rc-card rc-card-lg" id="rc-ai-card" style="display:flex;flex-direction:column;gap:14px">';
    h += '<div style="display:flex;align-items:center;gap:12px">';
    h += '<div style="width:40px;height:40px;border-radius:14px;background:var(--lav);color:var(--acc-ink);display:flex;align-items:center;justify-content:center;font-size:18px;flex:none">🤖</div>';
    h += '<div style="flex:1;min-width:0"><div style="font-weight:800;font-size:15px">AI Biznes Tahlil</div>';
    h += '<div style="font-size:11px;color:var(--mut)">Claude AI — chuqur tahlil, tavsiyalar, optimizatsiya</div></div>';
    h += '<button class="rc-btn rc-btn-sm" id="rc-ai-btn">✨ Tahlil <span style="opacity:.75;margin-left:2px">50🪙</span></button>';
    h += '</div>';
    h += '<div id="rc-ai-result"></div>';
    h += '<div id="rc-ai-history-wrap" style="display:none;border-top:1px solid var(--brd);padding-top:12px">';
    h += '<button class="rc-btn-ghost rc-btn-sm" id="rc-ai-hist-btn" style="width:100%"><i class="fas fa-history"></i> Oldingi tahlillar</button>';
    h += '<div id="rc-ai-hist-list" style="display:none;margin-top:10px"></div>';
    h += '</div>';
    h += '</div>';

    // ── Kirim / Chiqim bar grafik ──
    h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:12px">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between">';
    h += '<div style="font-weight:800;font-size:14px">Kirim / Chiqim</div>';
    h += '<div style="display:flex;gap:12px;font-size:11px;color:var(--mut);font-weight:600">';
    h += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--acc);vertical-align:middle"></span> Kirim</span>';
    h += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--pch);vertical-align:middle"></span> Chiqim</span>';
    h += '</div></div>';
    h += '<div id="rc-revenue-chart" style="width:100%;height:200px;position:relative"></div>';
    h += '</div>';

    // ── Oylik SOF FOYDA grafigi (topshirilgan-oy bo'yicha, oxirgi 6 oy trendi) ──
    if (d.profit_monthly && d.profit_monthly.length) {
      h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:12px">';
      h += '<div style="display:flex;align-items:center;justify-content:space-between">';
      h += '<div style="font-weight:800;font-size:14px">💰 Oylik sof foyda</div>';
      h += '<div style="font-size:11px;color:var(--mut);font-weight:600">topshirilgan buyurtma bo\'yicha</div>';
      h += '</div>';
      h += '<div id="rc-profit-chart" style="width:100%;height:200px;position:relative"></div>';
      h += '</div>';
    }

    // ── Buyurtma holati donut ──
    h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:12px">';
    h += '<div style="font-weight:800;font-size:14px">Buyurtma holatlari</div>';
    h += '<div id="rc-status-chart" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap"></div>';
    h += '</div>';

    // ── Chiqim turlari horizontal bar ──
    h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:12px">';
    h += '<div style="font-weight:800;font-size:14px">Chiqim turlari</div>';
    h += '<div id="rc-category-chart" style="display:flex;flex-direction:column;gap:10px"></div>';
    h += '</div>';

    // ── Top mijozlar ──
    if (d.top_customers && d.top_customers.length) {
      h += '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:10px">';
      h += '<div style="font-weight:800;font-size:14px">Top mijozlar</div>';
      var maxC = d.top_customers[0].total || 1;
      d.top_customers.forEach(function (c, i) {
        var pct = Math.round(c.total / maxC * 100);
        h += '<div style="display:flex;flex-direction:column;gap:5px">';
        h += '<div style="display:flex;justify-content:space-between;font-size:12px">';
        h += '<span style="font-weight:600">' + (i + 1) + '. ' + esc(c.name) + '</span>';
        h += '<span style="font-weight:800;color:var(--acc-text)">' + money(c.total) + '</span></div>';
        h += '<div class="rc-progress"><div class="rc-progress-fill" style="width:' + pct + '%"></div></div>';
        h += '</div>';
      });
      h += '</div>';
    }

    // ── Umumiy ko'rsatkichlar (footer grid) ──
    var foot = [
      { label: 'Jami kirim', val: money(t.income), clr: 'var(--acc-text)' },
      { label: 'Jami chiqim', val: money(t.expense), clr: 'var(--pch-text)' },
      { label: 'Jami foyda', val: money(t.profit), clr: parseInt(t.profit) >= 0 ? 'var(--acc-text)' : 'var(--danger)' },
      { label: 'Balans', val: money(t.balance), clr: 'var(--cyan-text)' },
      /* Eslatma: «Jami foyda» — o'chirilgan/bekor zakazlarsiz (biznes ko'rsatkichi).
         Moliya sahifasidagi «Kassa foyda» — butun pul oqimi, shuning uchun kattaroq.
         «Balans» esa ikkala sahifada AYNAN bir xil (fizik kassadagi pul). */
      { label: 'Qarzlar', val: money(t.debt), clr: parseInt(t.debt) > 0 ? 'var(--danger)' : 'var(--acc-text)' },
      { label: 'Jami buyurtmalar', val: t.orders, clr: 'var(--txt)', go: '/orders' },
      { label: 'Bajarilgan', val: t.completed, clr: 'var(--acc-text)' },
      { label: 'Mijozlar', val: t.customers, clr: 'var(--lav-text)', go: '/clients' },
    ];
    h += '<div class="rc-grid rc-grid-auto">';
    foot.forEach(function (m) {
      h += '<div class="rc-stat"' + (m.go ? ' data-go="' + m.go + '" style="cursor:pointer"' : '') + '><div class="rc-stat-label">' + m.label + '</div><div class="rc-stat-val" style="color:' + m.clr + '">' + m.val + '</div></div>';
    });
    h += '</div>';
    /* Nega Moliya sahifasidagi "Kassa foyda" bilan teng emas — 2026-07-30 audit */
    h += '<div style="font-size:10px;color:var(--mut);line-height:1.5;margin-top:8px;'
       + 'padding:7px 9px;border-radius:10px;background:var(--sfc2);border:1px dashed var(--brd)">'
       + 'ℹ️ «Jami foyda» — <b>o\'chirilgan va bekor qilingan</b> zakazlarsiz (sof biznes ko\'rsatkichi). '
       + 'Moliya sahifasidagi «Kassa foyda» esa butun pul oqimi, shuning uchun kattaroq bo\'ladi. '
       + '<b>«Balans» ikkala sahifada bir xil</b> — kassadagi haqiqiy pul.</div>';

    h += '</div>';
    return h;
  },

  bind: function () {
    // Tanishtiruv + izohlar (2026-08-06)
    if (window.RcTour && RcTour.auto) { try { RcTour.auto('analytics'); } catch (e) {} }
    if (window.RcHint && RcHint.bind) { try { RcHint.bind(); } catch (e) {} }

    // Professional davr filtri (RcPeriod) → o'zgarsa qayta yuklash
    RcPeriod.bind(document.getElementById('app'), RcAnalytics._st, (RcAnalytics.data || {}).months, function () {
      RcAnalytics.load();
    });

    document.querySelectorAll('.rc-stat[data-go]').forEach(function (el) {
      el.onclick = function () { Router.go(el.dataset.go); };
    });

    // AI tahlil tugmasi
    var aiBtn = document.getElementById('rc-ai-btn');
    if (aiBtn) aiBtn.onclick = function () { if (!RcAnalytics.aiLoading) RcAnalytics._runAIAnalysis(); };

    // Tarix toggle
    var histBtn = document.getElementById('rc-ai-hist-btn');
    if (histBtn) histBtn.onclick = function () {
      var list = document.getElementById('rc-ai-hist-list');
      if (!list) return;
      var open = list.style.display !== 'none';
      list.style.display = open ? 'none' : 'block';
      histBtn.innerHTML = open
        ? '<i class="fas fa-history"></i> Oldingi tahlillar'
        : '<i class="fas fa-times"></i> Yopish';
    };
  },

  // ─── AI ───

  _runAIAnalysis: function () {
    RcAnalytics.aiLoading = true;
    RcAnalytics._streamText = '';
    var btn = document.getElementById('rc-ai-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Tahlil...'; }

    var resultEl = document.getElementById('rc-ai-result');
    if (resultEl) {
      resultEl.innerHTML = '<div style="background:var(--sfc2);border-radius:16px;padding:14px">' +
        '<div style="font-size:12px;color:var(--mut);font-weight:600;animation:rc-pulse 1.2s ease-in-out infinite">🤖 Laylo ma\'lumotlarni tahlil qilmoqda...</div>' +
        '<div id="rc-ai-stream" style="font-size:13px;line-height:1.55;margin-top:10px"></div></div>';
    }

    function cleanup() { WS.off('ai.chunk'); WS.off('ai.done'); WS.off('ai.error'); }
    function resetBtn() {
      RcAnalytics.aiLoading = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '✨ Qayta tahlil <span style="opacity:.75;margin-left:2px">50🪙</span>'; }
    }

    WS.on('ai.chunk', function (msg) {
      RcAnalytics._streamText += msg.data.text;
      var el = document.getElementById('rc-ai-stream');
      if (el) { el.innerHTML = RcAnalytics._formatContent(RcAnalytics._streamText); el.scrollTop = el.scrollHeight; }
    });
    WS.on('ai.done', function (msg) {
      cleanup(); resetBtn();
      RcAnalytics._renderAIResult(msg.data);
      Toast.success('AI tahlil tayyor!');
      RcAnalytics._loadAIHistory();
    });
    WS.on('ai.error', function (msg) {
      cleanup(); resetBtn();
      if (resultEl) resultEl.innerHTML = '';
      Toast.error((msg.data && msg.data.error) || 'AI tahlil xatosi');
    });

    WS.send('analytics.ai', RcPeriod.query(RcAnalytics._st), function (msg) {
      if (!msg.ok) {
        cleanup(); resetBtn();
        if (resultEl) resultEl.innerHTML = '';
        Toast.error(msg.error || 'AI tahlil xatosi');
      }
    }, 30000);
  },

  _renderAIResult: function (data) {
    var container = document.getElementById('rc-ai-result');
    if (!container) return;
    var esc = Utils.esc;
    var h = '<div style="display:flex;flex-direction:column;gap:10px;animation:rc-fadein .4s ease">';

    var sections = data.sections || [];
    if (sections.length) {
      sections.forEach(function (sec, i) {
        var clr = RcAnalytics.PALETTE[i % RcAnalytics.PALETTE.length];
        h += '<div style="background:var(--sfc2);border-left:3px solid ' + clr + ';border-radius:14px;padding:12px">';
        h += '<div style="font-weight:800;font-size:13px;margin-bottom:6px">' + (sec.icon || '') + ' ' + esc(sec.title) + '</div>';
        h += '<div style="font-size:13px;line-height:1.55">' + RcAnalytics._formatContent(sec.content) + '</div>';
        h += '</div>';
      });
    } else if (data.text) {
      h += '<div style="background:var(--sfc2);border-radius:14px;padding:12px;font-size:13px;line-height:1.55">' + RcAnalytics._formatContent(data.text) + '</div>';
    }

    if (data.recommendations && data.recommendations.length) {
      h += '<div style="background:var(--sfc2);border-radius:14px;padding:12px">';
      h += '<div style="font-size:13px;font-weight:800;color:var(--acc-text);margin-bottom:8px">💡 Amaliy tavsiyalar (' + data.recommendations.length + ')</div>';
      data.recommendations.forEach(function (r, i) {
        var clr = RcAnalytics.PALETTE[i % RcAnalytics.PALETTE.length];
        h += '<div style="display:flex;gap:10px;align-items:flex-start;padding:6px 0">';
        h += '<span style="width:20px;height:20px;border-radius:50%;background:' + clr + ';color:var(--acc-ink);font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex:none">' + (i + 1) + '</span>';
        h += '<span style="font-size:13px;line-height:1.5">' + esc(r) + '</span></div>';
      });
      h += '</div>';
    }

    // Meta
    var coinInfo = (data.coins_remaining !== '' && data.coins_remaining !== undefined) ? ' · qoldi: ' + data.coins_remaining : '';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--mut);padding-top:4px">';
    h += '<span>🤖 Claude AI · ' + Utils.datetime(data.created_at) + '</span>';
    h += '<span style="color:var(--pch);font-weight:700">-' + data.coins_spent + ' 🪙' + coinInfo + '</span>';
    h += '</div>';

    h += '</div>';
    container.innerHTML = h;
  },

  _formatContent: function (text) {
    if (!text) return '';
    var esc = Utils.esc;
    var lines = text.split('\n');
    var html = '';
    lines.forEach(function (line) {
      var s = line.trim();
      if (!s || s.indexOf('---') === 0) return;
      var f = esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
      if (/^[-•]\s/.test(s)) {
        f = f.replace(/^[-•]\s*/, '');
        html += '<div style="display:flex;gap:8px;align-items:flex-start;padding:2px 0"><span style="width:5px;height:5px;border-radius:50%;background:var(--acc);margin-top:7px;flex:none"></span><span>' + f + '</span></div>';
      } else if (/^\d+[\.\)]\s/.test(s)) {
        html += '<div style="padding:2px 0;font-weight:600">' + f + '</div>';
      } else if (s.charAt(0) === '>') {
        f = f.replace(/^&gt;\s*/, '');
        html += '<div style="border-left:2px solid var(--lav);padding-left:8px;color:var(--mut);margin:3px 0">' + f + '</div>';
      } else {
        html += '<div style="padding:2px 0">' + f + '</div>';
      }
    });
    return html;
  },

  _loadAIHistory: function () {
    WS.send('analytics.ai_history', {}, function (msg) {
      if (!msg.ok) return;
      var wrap = document.getElementById('rc-ai-history-wrap');
      if (wrap && msg.data && msg.data.length) {
        wrap.style.display = 'block';
        RcAnalytics._renderAIHistory(msg.data);
      }
    });
  },

  _renderAIHistory: function (analyses) {
    var container = document.getElementById('rc-ai-hist-list');
    if (!container) return;
    var periodLabels = { day: 'Bugun', week: 'Hafta', month: 'Oy', year: 'Yil', all: 'Barchasi', custom: 'Oraliq' };
    var h = '';
    analyses.forEach(function (a) {
      var recCount = (a.recommendations || []).length;
      var secCount = (a.sections || []).length;
      h += '<div class="rc-hist-item" data-id="' + a.id + '" style="background:var(--sfc2);border-radius:12px;padding:10px 12px;margin-bottom:8px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px">';
      h += '<div style="min-width:0"><div style="font-size:12px;font-weight:700">🤖 ' + (periodLabels[a.period] || a.period) + ' tahlili</div>';
      h += '<div style="font-size:11px;color:var(--mut);margin-top:2px">' + Utils.datetime(a.created_at) + ' · ' + secCount + ' bo\'lim · ' + recCount + ' tavsiya · -' + a.coins_spent + ' 🪙</div></div>';
      h += '<i class="fas fa-chevron-right" style="font-size:11px;color:var(--mut);flex:none"></i></div>';
    });
    container.innerHTML = h;

    container.querySelectorAll('.rc-hist-item').forEach(function (el) {
      el.onclick = function () {
        var id = parseInt(el.dataset.id);
        var item = null;
        analyses.forEach(function (a) { if (a.id === id) item = a; });
        if (item) {
          RcAnalytics._renderAIResult({
            text: item.text, recommendations: item.recommendations, sections: item.sections || [],
            coins_spent: item.coins_spent, coins_remaining: '', created_at: item.created_at,
          });
          var r = document.getElementById('rc-ai-result');
          if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
    });
  },

  // ─── Grafiklar (custom SVG/CSS, rc- ranglar) ───

  drawCharts: function (d) {
    RcAnalytics._drawRevenueChart(d.chart);
    RcAnalytics._drawProfitMonthly(d.profit_monthly);
    RcAnalytics._drawStatusDonut(d.status_distribution);
    RcAnalytics._drawCategoryBars(d.expense_categories);
  },

  // ── Oylik sof foyda bar grafigi (nol chizig'i; musbat=acc, manfiy=danger) ──
  _drawProfitMonthly: function (pm) {
    var container = document.getElementById('rc-profit-chart');
    if (!container) return;
    if (!pm || !pm.length) { container.innerHTML = '<div class="rc-empty" style="padding:20px"><div class="rc-empty-ic">💰</div>Ma\'lumot yo\'q</div>'; return; }

    var vals = pm.map(function (r) { return parseInt(r.profit) || 0; });
    var maxV = Math.max.apply(null, vals);
    var minV = Math.min.apply(null, vals);
    if (maxV < 0) maxV = 0;
    if (minV > 0) minV = 0;
    var span = (maxV - minV) || 1;

    var w = container.offsetWidth || 320;
    var h = 200;
    var pad = { top: 14, right: 8, bottom: 34, left: 8 };
    var chartW = w - pad.left - pad.right;
    var chartH = h - pad.top - pad.bottom;
    var n = pm.length;
    var groupW = chartW / n;
    var barW = Math.min(Math.max(groupW * 0.5, 8), 34);
    var zeroY = pad.top + (maxV / span) * chartH;   // nol chizig'ining y koordinatasi

    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:100%">';
    // gorizontal to'r
    for (var g = 0; g <= 4; g++) {
      var gy = pad.top + (chartH / 4) * g;
      svg += '<line x1="' + pad.left + '" y1="' + gy + '" x2="' + (w - pad.right) + '" y2="' + gy + '" stroke="var(--brd)" stroke-width="0.5" stroke-dasharray="3,3"/>';
    }
    // nol chizig'i (aniq)
    svg += '<line x1="' + pad.left + '" y1="' + zeroY + '" x2="' + (w - pad.right) + '" y2="' + zeroY + '" stroke="var(--brd2)" stroke-width="1"/>';

    for (var i = 0; i < n; i++) {
      var cx = pad.left + groupW * i + groupW / 2;
      var v = vals[i];
      var barH = Math.abs(v) / span * chartH;
      if (barH < 1 && v !== 0) barH = 1;
      var pos = v >= 0;
      var by = pos ? (zeroY - barH) : zeroY;
      var bx = cx - barW / 2;
      var clr = pos ? 'var(--acc)' : 'var(--danger)';
      svg += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + barH + '" rx="' + Math.min(barW / 2, 4) + '" fill="' + clr + '">';
      svg += '<animate attributeName="height" from="0" to="' + barH + '" dur="0.6s" fill="freeze"/>';
      svg += '<animate attributeName="y" from="' + zeroY + '" to="' + by + '" dur="0.6s" fill="freeze"/></rect>';
      // qiymat yorlig'i (qisqa)
      var lblY = pos ? (by - 4) : (by + barH + 11);
      svg += '<text x="' + cx + '" y="' + lblY + '" text-anchor="middle" font-size="9" font-weight="700" fill="' + clr + '" font-family="Plus Jakarta Sans,system-ui">' + RcAnalytics._shortNum(v) + '</text>';
      // oy yorlig'i
      var p = pm[i].month.split('-');
      var mlbl = (RcAnalytics.MONTHS[parseInt(p[1], 10) - 1] || p[1]).slice(0, 3);
      svg += '<text x="' + cx + '" y="' + (h - 8) + '" text-anchor="middle" font-size="9" fill="var(--mut)" font-family="Plus Jakarta Sans,system-ui">' + mlbl + '</text>';
    }
    svg += '</svg>';
    container.innerHTML = svg;
  },

  // Raqamni qisqa ko'rinishga (mln/ming) — grafik yorlig'i uchun
  _shortNum: function (v) {
    var a = Math.abs(v), sign = v < 0 ? '-' : '';
    if (a >= 1e9) return sign + (a / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return sign + (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return sign + Math.round(a / 1e3) + 'K';
    return sign + a;
  },

  _drawRevenueChart: function (chart) {
    var container = document.getElementById('rc-revenue-chart');
    if (!container) return;
    if (!chart || !chart.labels.length) { container.innerHTML = '<div class="rc-empty" style="padding:20px"><div class="rc-empty-ic">📊</div>Ma\'lumot yo\'q</div>'; return; }

    var allVals = chart.income.concat(chart.expense);
    var maxVal = Math.max.apply(null, allVals) || 1;
    var w = container.offsetWidth || 320;
    var h = 200;
    var pad = { top: 10, right: 8, bottom: 26, left: 8 };
    var chartW = w - pad.left - pad.right;
    var chartH = h - pad.top - pad.bottom;
    var n = chart.labels.length;
    var groupW = chartW / n;
    var barW = Math.min(Math.max(groupW * 0.28, 4), 14);
    var gap = Math.max(barW * 0.3, 2);

    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:100%">';
    for (var g = 0; g <= 4; g++) {
      var gy = pad.top + (chartH / 4) * g;
      svg += '<line x1="' + pad.left + '" y1="' + gy + '" x2="' + (w - pad.right) + '" y2="' + gy + '" stroke="var(--brd)" stroke-width="0.5" stroke-dasharray="3,3"/>';
    }
    for (var i = 0; i < n; i++) {
      var cx = pad.left + groupW * i + groupW / 2;
      var incH = (chart.income[i] / maxVal) * chartH;
      var expH = (chart.expense[i] / maxVal) * chartH;
      if (chart.income[i] > 0) {
        var ix = cx - gap / 2 - barW;
        var iy = pad.top + chartH - incH;
        svg += '<rect x="' + ix + '" y="' + iy + '" width="' + barW + '" height="' + incH + '" rx="' + Math.min(barW / 2, 3) + '" fill="var(--acc)">';
        svg += '<animate attributeName="height" from="0" to="' + incH + '" dur="0.6s" fill="freeze"/>';
        svg += '<animate attributeName="y" from="' + (pad.top + chartH) + '" to="' + iy + '" dur="0.6s" fill="freeze"/></rect>';
      }
      if (chart.expense[i] > 0) {
        var ex = cx + gap / 2;
        var ey = pad.top + chartH - expH;
        svg += '<rect x="' + ex + '" y="' + ey + '" width="' + barW + '" height="' + expH + '" rx="' + Math.min(barW / 2, 3) + '" fill="var(--pch)">';
        svg += '<animate attributeName="height" from="0" to="' + expH + '" dur="0.6s" fill="freeze"/>';
        svg += '<animate attributeName="y" from="' + (pad.top + chartH) + '" to="' + ey + '" dur="0.6s" fill="freeze"/></rect>';
      }
      if (n <= 12 || i % Math.ceil(n / 12) === 0) {
        svg += '<text x="' + cx + '" y="' + (h - 6) + '" text-anchor="middle" font-size="9" fill="var(--mut)" font-family="Plus Jakarta Sans,system-ui">' + chart.labels[i] + '</text>';
      }
    }
    svg += '</svg>';
    container.innerHTML = svg;
  },

  _drawStatusDonut: function (dist) {
    var container = document.getElementById('rc-status-chart');
    if (!container) return;
    if (!dist || !dist.length) { container.innerHTML = '<div class="rc-empty" style="padding:20px;width:100%"><div class="rc-empty-ic">🍩</div>Ma\'lumot yo\'q</div>'; return; }

    var total = 0; dist.forEach(function (s) { total += s.count; });
    if (total === 0) { container.innerHTML = '<div class="rc-empty" style="padding:20px;width:100%"><div class="rc-empty-ic">🍩</div>Ma\'lumot yo\'q</div>'; return; }

    var size = 132, cx = size / 2, cy = size / 2, r = 56, r2 = 38;
    var svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" style="width:' + size + 'px;height:' + size + 'px;flex:none">';
    var angle = -90;
    dist.forEach(function (s, i) {
      var sweep = (s.count / total) * 360;
      if (sweep < 0.5) return;
      var clr = RcAnalytics.PALETTE[i % RcAnalytics.PALETTE.length];
      var sR = angle * Math.PI / 180, eR = (angle + sweep) * Math.PI / 180;
      var x1 = cx + r * Math.cos(sR), y1 = cy + r * Math.sin(sR);
      var x2 = cx + r * Math.cos(eR), y2 = cy + r * Math.sin(eR);
      var x3 = cx + r2 * Math.cos(eR), y3 = cy + r2 * Math.sin(eR);
      var x4 = cx + r2 * Math.cos(sR), y4 = cy + r2 * Math.sin(sR);
      var large = sweep > 180 ? 1 : 0;
      svg += '<path d="M' + x1 + ',' + y1 + ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x2 + ',' + y2 + ' L' + x3 + ',' + y3 + ' A' + r2 + ',' + r2 + ' 0 ' + large + ' 0 ' + x4 + ',' + y4 + ' Z" fill="' + clr + '">';
      svg += '<animate attributeName="opacity" from="0" to="1" dur="0.5s" fill="freeze"/></path>';
      angle += sweep;
    });
    svg += '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" font-size="20" font-weight="800" fill="var(--txt)" font-family="Plus Jakarta Sans,system-ui">' + total + '</text>';
    svg += '<text x="' + cx + '" y="' + (cy + 13) + '" text-anchor="middle" font-size="9" fill="var(--mut)" font-family="Plus Jakarta Sans,system-ui">buyurtma</text>';
    svg += '</svg>';

    var legend = '<div style="flex:1;min-width:150px;display:flex;flex-direction:column;gap:7px">';
    dist.forEach(function (s, i) {
      var pct = Math.round(s.count / total * 100);
      var clr = RcAnalytics.PALETTE[i % RcAnalytics.PALETTE.length];
      legend += '<div style="display:flex;align-items:center;gap:8px;font-size:12px">';
      legend += '<span style="width:10px;height:10px;border-radius:50%;background:' + clr + ';flex:none"></span>';
      legend += '<span style="flex:1;color:var(--mut)">' + (RcAnalytics.STATUS_LABELS[s.status] || s.status) + '</span>';
      legend += '<span style="font-weight:800">' + s.count + ' <span style="color:var(--mut);font-weight:400">(' + pct + '%)</span></span>';
      legend += '</div>';
    });
    legend += '</div>';
    container.innerHTML = svg + legend;
  },

  _drawCategoryBars: function (cats) {
    var container = document.getElementById('rc-category-chart');
    if (!container) return;
    if (!cats || !cats.length) { container.innerHTML = '<div class="rc-empty" style="padding:16px"><div class="rc-empty-ic">💸</div>Chiqim yo\'q</div>'; return; }

    var maxCat = cats[0].total || 1;
    var h = '';
    cats.forEach(function (c, i) {
      var pct = Math.round(c.total / maxCat * 100);
      var clr = RcAnalytics.PALETTE[i % RcAnalytics.PALETTE.length];
      h += '<div style="display:flex;flex-direction:column;gap:5px">';
      h += '<div style="display:flex;justify-content:space-between;font-size:12px">';
      h += '<span style="color:var(--mut)">' + (RcAnalytics.CAT_LABELS[c.category] || c.category) + '</span>';
      h += '<span style="font-weight:800;color:' + clr + '">' + Utils.money(c.total) + '</span></div>';
      h += '<div class="rc-progress"><div class="rc-progress-fill" style="width:' + pct + '%;background:' + clr + '"></div></div>';
      h += '</div>';
    });
    container.innerHTML = h;
  },
};

RcAnalytics._PM_LABELS = { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma", click: 'Click', payme: 'Payme', uzcard: 'UzCard', humo: 'Humo', bank: 'Bank', perech: 'Perechisleniya', other: 'Boshqa' };
RcAnalytics._paymentSection = function (title, items, clr) {
  items = items || [];
  if (!items.length) return '';
  var esc = Utils.esc, money = Utils.money;
  var total = items.reduce(function (a, p) { return a + (p.total || 0); }, 0) || 1;
  var h = '<div class="rc-card rc-card-lg" style="display:flex;flex-direction:column;gap:8px">';
  h += '<div style="font-weight:800;font-size:14px">' + title + '</div>';
  items.forEach(function (p) {
    var w = Math.max(3, Math.round((p.total || 0) / total * 100));
    h += '<div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span>' + (RcAnalytics._PM_LABELS[p.method] || esc(p.method || '—')) + '</span><span style="font-weight:700">' + money(p.total) + '</span></div>';
    h += '<div style="height:7px;border-radius:99px;background:var(--sfc2);overflow:hidden"><div style="height:100%;width:' + w + '%;background:' + clr + ';border-radius:99px"></div></div></div>';
  });
  h += '</div>';
  return h;
};

window.RcAnalytics = RcAnalytics;
RC_PAGES['/analytics'] = function () { RcAnalytics.render(); };
