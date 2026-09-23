/* client_erp/js/components/utils.js — Formatting & helpers */
var Utils = {
    // ── i18n (2026-08-07): format tilga bog'landi ─────────────────────
    // UZ/RU → 1 250 000, 07.08.2026, 14:30
    // EN    → 1,250,000, Aug 7, 2026, 2:30 PM
    // I18n yuklanmagan bo'lsa eski xatti-harakat saqlanadi (degrade).
    money: function(val) {
        if (window.I18n) return I18n.num(val);
        var num = parseInt(val) || 0;
        return num.toLocaleString('ru-RU');
    },
    date: function(iso) {
        if (!iso) return '';
        if (window.I18n) return I18n.date(iso);
        var d = new Date(iso);
        return d.toLocaleDateString('ru-RU');
    },
    datetime: function(iso) {
        if (!iso) return '';
        if (window.I18n) return I18n.date(iso) + ' ' + I18n.time(iso);
        var d = new Date(iso);
        return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
    },
    timeAgo: function(iso) {
        if (!iso) return '';
        var diff = Math.floor((Date.now() - new Date(iso)) / 1000);
        var _t = window.T || function (x) { return x; };
        if (diff < 60) return _t('hozirgina');
        if (diff < 3600) return Math.floor(diff / 60) + ' ' + _t('min oldin');
        if (diff < 86400) return Math.floor(diff / 3600) + ' ' + _t('soat oldin');
        if (diff < 604800) return Math.floor(diff / 86400) + ' ' + _t('kun oldin');
        return Utils.date(iso);
    },
    debounce: function(fn, delay) {
        var t;
        return function() {
            var ctx = this, args = arguments;
            clearTimeout(t);
            t = setTimeout(function() { fn.apply(ctx, args); }, delay || 300);
        };
    },
    statusBadge: function(status) {
        var m = {
            // Order status
            'new':          {l:'Yangi',         c:'ce-badge-new'},
            'waiting':      {l:'Kutilmoqda',    c:'ce-badge-new'},
            'in_progress':  {l:'Jarayonda',     c:'ce-badge-progress'},
            'at_mebelcity': {l:'MebelCity da',  c:'ce-badge-progress'},
            'ready':        {l:'Tayyor',        c:'ce-badge-ready'},
            'delivered':    {l:'Topshirildi',   c:'ce-badge-ready'},
            'completed':    {l:'Tugallangan',   c:'ce-badge-ready'},
            'cancelled':    {l:'Bekor',         c:'ce-badge-danger'},
            // Stage status
            'pending':      {l:'Kutilmoqda',    c:'ce-badge-new'},
            'active':       {l:'Faol',          c:'ce-badge-progress'},
            'skipped':      {l:"O'tkazildi",    c:'ce-badge-danger'},
            // Announcement type
            'news':         {l:'Yangilik',      c:'ce-badge-new'},
            'promo':        {l:'Aksiya',        c:'ce-badge-progress'},
            'discount':     {l:'Chegirma',      c:'ce-badge-ready'},
            'event':        {l:'Tadbir',        c:'ce-badge-new'},
            'notification': {l:'Eslatma',       c:'ce-badge-new'},
            // Permission role
            'viewer':       {l:"Ko'ruvchi",     c:'ce-badge-new'},
            'worker':       {l:'Ishchi',        c:'ce-badge-progress'},
            'manager':      {l:'Menejer',       c:'ce-badge-progress'},
            'owner':        {l:'Egasi',         c:'ce-badge-ready'},
            // Debt status
            'partial':      {l:'Qisman',        c:'ce-badge-new'},
            'paid':         {l:"To'langan",     c:'ce-badge-ready'},
            'written_off':  {l:'Hisobdan chiqarilgan', c:'ce-badge-danger'},
            // Finance type
            'income':       {l:'Kirim',         c:'ce-badge-ready'},
            'expense':      {l:'Chiqim',        c:'ce-badge-danger'},
            'withdrawal':   {l:'Yechish',       c:'ce-badge-danger'},
            'debt_given':   {l:'Qarz berish',   c:'ce-badge-new'},
            'debt_received':{l:'Qarz olish',    c:'ce-badge-new'},
            'debt_paid':    {l:"Qarz to'lash",  c:'ce-badge-ready'},
        };
        // Admin boshqaradigan buyurtma statuslari (STATE.orderStatuses) — bo'lsa ustunlik beriladi
        if (window.STATE && STATE.orderStatuses) {
            for (var i = 0; i < STATE.orderStatuses.length; i++) {
                if (STATE.orderStatuses[i].key === status) {
                    var ds = STATE.orderStatuses[i];
                    return '<span class="ce-badge" style="background:'+ds.color+'22;color:'+ds.color+'">'+Utils.esc(ds.label)+'</span>';
                }
            }
        }
        var s = m[status] || {l:status, c:''};
        return '<span class="ce-badge '+s.c+'">'+s.l+'</span>';
    },
    roleLabel: function(role) {
        var m = {viewer:"Ko'ruvchi", worker:'Ishchi', manager:'Menejer', owner:'Egasi'};
        return m[role] || role;
    },
    initials: function(name) {
        if (!name) return '?';
        return name.split(' ').map(function(w){return w[0]||''}).join('').toUpperCase().slice(0,2);
    },
    esc: function(str) {
        if (str === null || str === undefined) return '';
        var el = document.createElement('span');
        el.textContent = String(str);
        return el.innerHTML;
    },
    progressBar: function(percent) {
        var p = Math.min(100, Math.max(0, parseInt(percent) || 0));
        var color = p === 100 ? 'var(--accent)' : (p > 50 ? '#f59e0b' : 'var(--secondary)');
        return '<div class="ce-progress"><div class="ce-progress-bar" style="width:'+p+'%;background:'+color+'"></div></div>';
    },
    formatMoneyValue: function(val) {
        var digits = String(val).replace(/\D/g, '');
        if (!digits) return '';
        return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    },
    rawMoney: function(val) {
        return parseInt(String(val).replace(/\s/g, '')) || 0;
    },
    bindMoneyInputs: function(container) {
        (container || document).querySelectorAll('.ce-money-input').forEach(function(el) {
            if (el._moneyBound) return;
            el._moneyBound = true;
            el.addEventListener('input', function() {
                var pos = el.selectionStart;
                var oldLen = el.value.length;
                var raw = el.value.replace(/\D/g, '');
                el.value = Utils.formatMoneyValue(raw);
                var newLen = el.value.length;
                var newPos = pos + (newLen - oldLen);
                el.setSelectionRange(newPos, newPos);
                Utils._updateUsdHint(el);
            });
            if (el.value) el.value = Utils.formatMoneyValue(el.value);
            // 💵 Dollar hisob-kitobi — har bir pul inputi ostida jonli ko'rinadi
            Utils._attachUsdHint(el);
        });
    },

    // ── Telefon formatlash: "93 042 15 02" (O'zbek, 9 xona) ──
    formatPhoneValue: function(val) {
        var d = String(val || '').replace(/\D/g, '');
        if (d.length > 9 && d.slice(0, 3) === '998') d = d.slice(3);   // +998 prefiksni olib tashlaymiz
        d = d.slice(0, 9);
        var p = [];
        if (d.length > 0) p.push(d.slice(0, 2));
        if (d.length > 2) p.push(d.slice(2, 5));
        if (d.length > 5) p.push(d.slice(5, 7));
        if (d.length > 7) p.push(d.slice(7, 9));
        return p.join(' ');
    },
    // Yuborish uchun: normallashtirilgan "+998XXXXXXXXX" (backend shu shaklni kutadi)
    rawPhone: function(val) {
        var d = String(val || '').replace(/\D/g, '');
        if (d.slice(0, 3) === '998') d = d.slice(3);
        d = d.slice(0, 9);
        return d ? ('+998' + d) : '';
    },
    bindPhoneInputs: function(container) {
        (container || document).querySelectorAll('.ce-phone-input,[data-phone]').forEach(function(el) {
            if (el._phoneBound) return;
            el._phoneBound = true;
            try { el.setAttribute('inputmode', 'tel'); } catch (e) {}
            el.addEventListener('input', function() {
                var pos = el.selectionStart, oldLen = el.value.length;
                el.value = Utils.formatPhoneValue(el.value);
                var newLen = el.value.length;
                var np = pos + (newLen - oldLen);
                try { el.setSelectionRange(np, np); } catch (e) {}
            });
            if (el.value) el.value = Utils.formatPhoneValue(el.value);
        });
    },

    // ── GLOBAL auto-format: barcha .ce-money-input + .ce-phone-input avtomatik ──
    // (dinamik qo'shilgan formalar ham — MutationObserver bilan qayta bog'lanadi)
    initAutoFormat: function() {
        if (Utils._autoFmt) return;
        Utils._autoFmt = true;
        var rebind = function() {
            try { Utils.bindMoneyInputs(document); } catch (e) {}
            try { Utils.bindPhoneInputs(document); } catch (e) {}
        };
        rebind();
        try {
            var mo = new MutationObserver(function() {
                clearTimeout(Utils._fmtT);
                Utils._fmtT = setTimeout(rebind, 60);
            });
            mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
        } catch (e) {}
    },

    // ── USD kurs (bir marta yuklanadi, keshda saqlanadi) ──
    _usdRate: null,
    _usdRateLoading: false,
    _loadUsdRate: function(cb) {
        if (Utils._usdRate) { if (cb) cb(Utils._usdRate); return; }
        if (Utils._usdRateLoading) return;
        Utils._usdRateLoading = true;
        try {
            WS.send('rate.get', {}, function(msg) {
                Utils._usdRateLoading = false;
                if (msg && msg.ok && msg.data && msg.data.rate) {
                    Utils._usdRate = msg.data.rate;
                    // Ochiq turgan barcha hintlarni yangilash
                    document.querySelectorAll('.ce-money-input').forEach(function(el) {
                        Utils._updateUsdHint(el);
                    });
                    if (cb) cb(Utils._usdRate);
                }
            });
        } catch (e) { Utils._usdRateLoading = false; }
    },
    _attachUsdHint: function(el) {
        if (el._usdHint) return;
        var hint = document.createElement('div');
        hint.className = 'ce-usd-hint';
        hint.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:3px;min-height:14px;text-align:right';
        el.insertAdjacentElement('afterend', hint);
        el._usdHint = hint;
        Utils._loadUsdRate();
        Utils._updateUsdHint(el);
    },
    _updateUsdHint: function(el) {
        if (!el._usdHint) return;
        var amt = Utils.rawMoney(el.value);
        if (!amt) { el._usdHint.textContent = ''; return; }
        if (!Utils._usdRate) { el._usdHint.textContent = '...'; Utils._loadUsdRate(); return; }
        var usd = amt / Utils._usdRate;
        el._usdHint.innerHTML = '&asymp; <b style="color:#2563eb">$' +
            usd.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) +
            '</b> <span style="opacity:.7">(kurs ' + Utils.formatMoneyValue(String(Math.round(Utils._usdRate))) + ')</span>';
    },
};

// GLOBAL summa + telefon avtomatik formatlash (butun SPA bo'ylab)
try {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { Utils.initAutoFormat(); });
    } else {
        Utils.initAutoFormat();
    }
} catch (e) {}
