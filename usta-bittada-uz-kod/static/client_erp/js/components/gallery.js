/* client_erp/js/components/gallery.js — Gallery Viewer + Image Editor + BLE */
var Gallery = {
    _ov: null,
    _files: [],
    _idx: 0,
    _zoom: 1,
    _panX: 0,
    _panY: 0,
    _editing: false,
    _canvas: null,
    _ctx: null,
    _history: [],
    _tool: 'pen',
    _color: '#ef4444',
    _lineWidth: 3,
    _fontSize: 18,
    _drawing: false,
    _measureState: 'idle',
    _measureP1: null,
    _measureP2: null,
    _previewImg: null,

    // Fayl yuklab olish/ochish — Telegram WebApp ichida oddiy `<a download>`
    // / `a.click()` ishonchsiz (2026-09-03, foydalanuvchi: "botdan kirganda
    // yuklanmayapti"). Telegram.WebApp mavjud bo'lsa, tashqi brauzerda
    // ochamiz (xuddi ble-adapter.js'dagi kabi) — u yerda yuklab olish odatiy
    // ishlaydi. Oddiy brauzerda (Telegram tashqarisida) — eski yo'l saqlanadi.
    _downloadOrOpen: function (url, filename) {
        var abs = /^https?:\/\//.test(url) ? url : (window.location.origin + url);
        try {
            if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openLink) {
                Telegram.WebApp.openLink(abs, { try_browser: 'chrome' });
                if (window.Toast) Toast.info('Fayl brauzerda ochildi — u yerdan yuklab oling');
                return;
            }
        } catch (e) {}
        var a = document.createElement('a');
        a.href = url; a.download = filename || ''; a.target = '_blank'; a.rel = 'noopener';
        a.click();
    },

    open: function(files, startIdx) {
        if (!files || !files.length) return;
        Gallery._files = files;
        Gallery._idx = startIdx || 0;
        Gallery._zoom = 1;
        Gallery._panX = 0;
        Gallery._panY = 0;
        Gallery._editing = false;

        var ov = document.createElement('div');
        ov.id = 'gal-overlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;touch-action:none';
        Gallery._ov = ov;
        document.body.appendChild(ov);
        document.body.style.overflow = 'hidden';

        Gallery._ensureStyles();
        Gallery._render();
        Gallery._bindKeys();
    },

    // Responsiv + hover uslublari (bir marta inject qilinadi)
    _ensureStyles: function() {
        if (document.getElementById('gal-responsive-style')) return;
        var st = document.createElement('style');
        st.id = 'gal-responsive-style';
        st.textContent =
            '#gal-overlay button{-webkit-tap-highlight-color:transparent}' +
            '#gal-top button:hover{background:rgba(255,255,255,.26)!important}' +
            '#gal-prev:hover,#gal-next:hover{background:rgba(255,255,255,.24)!important}' +
            '#gal-overlay .gal-title{max-width:42vw}' +
            '@media(min-width:900px){#gal-prev,#gal-next{width:54px!important;height:54px!important;font-size:22px!important}}' +
            '@media(max-width:600px){' +
              '#gal-top{padding-left:10px!important;padding-right:10px!important;gap:6px!important}' +
              '#gal-top button{width:34px!important;height:34px!important;font-size:13px!important}' +
              '#gal-overlay .gal-title{max-width:36vw}' +
              '#gal-prev,#gal-next{width:40px!important;height:40px!important;font-size:16px!important}' +
            '}' +
            // Editor toolbar — bazaviy (label/ikonка/ajratkich)
            '#ed-toolbar button i{font-size:15px;line-height:1}' +
            '#ed-toolbar button span{font-size:9px;font-weight:600;opacity:.9;line-height:1}' +
            '#ed-toolbar button:active{transform:scale(.94)}' +
            '#ed-toolbar .ed-div{width:1px;height:30px;background:rgba(255,255,255,.12);flex-shrink:0;margin:0 3px}' +
            '#ed-tb-inner{scrollbar-width:none}#ed-tb-inner::-webkit-scrollbar{display:none}' +
            '@media(max-width:420px){' +
              '#gal-top button{width:31px!important;height:31px!important;font-size:12px!important}' +
              '#gal-top{gap:5px!important}' +
              '#ed-tb-inner{justify-content:flex-start!important}' +
              '#ed-toolbar button,#ed-toolbar #ed-color,#ed-toolbar #ed-size{width:46px!important;height:44px!important}' +
              '#ed-toolbar .ed-div{margin:0 1px}' +
            '}' +
            '@media(max-width:600px){' +
              '#ed-toolbar button{width:48px!important}' +
            '}' +
            '@media(max-height:520px){#ed-toolbar button span{display:none}#ed-toolbar button{height:40px!important}}';

        // ── LIGHT THEME moslashuvi (additiv — dark inline uslublar tegilmaydi) ──
        // Qora fon ustiga och chrome yaxshi turmaydi, shu sabab light'da BUTUN
        // viewer ochadi: fon + panellar + tugmalar + matn. Faol asbob lime + save/
        // cancel/ble ranglari ikkala temada ishlaydi.
        var L = ':root[data-theme="light"] ';
        st.textContent +=
            L + '#gal-overlay{background:#ECE9E1!important}' +
            // Top bar
            L + '#gal-top{background:linear-gradient(rgba(236,233,225,.96),rgba(236,233,225,0))!important}' +
            L + '#gal-top button{background:rgba(0,0,0,.07)!important;color:#1B1A20!important}' +
            L + '#gal-top button:hover{background:rgba(0,0,0,.13)!important}' +
            L + '#gal-overlay .gal-title{color:#1B1A20!important}' +
            L + '#gal-overlay .gal-title + div{color:rgba(0,0,0,.5)!important}' +
            // Nav strelkalar
            L + '#gal-prev,' + L + '#gal-next{background:rgba(0,0,0,.07)!important;color:#1B1A20!important}' +
            L + '#gal-prev:hover,' + L + '#gal-next:hover{background:rgba(0,0,0,.14)!important}' +
            // Editor toolbar
            L + '#ed-toolbar{background:rgba(248,247,244,.96)!important;border-top-color:rgba(0,0,0,.1)!important}' +
            L + '#ed-toolbar button:not(.active):not(#ed-save):not(#ed-cancel):not(#ed-ble){background:rgba(0,0,0,.05)!important;color:#1B1A20!important;border-color:rgba(0,0,0,.12)!important}' +
            L + '#ed-toolbar .ed-div{background:rgba(0,0,0,.12)!important}' +
            L + '#ed-size{background:rgba(0,0,0,.05)!important;color:#1B1A20!important;border-color:rgba(0,0,0,.14)!important}' +
            L + '#ed-color{border-color:rgba(0,0,0,.18)!important}' +
            L + '#ed-save{background:rgba(5,150,105,.16)!important;color:#047857!important;border-color:rgba(5,150,105,.4)!important}' +
            L + '#ed-cancel{background:rgba(220,38,38,.12)!important;color:#dc2626!important;border-color:rgba(220,38,38,.35)!important}' +
            L + '#ed-ble{background:rgba(26,115,232,.14)!important;color:#1a73e8!important;border-color:rgba(26,115,232,.4)!important}' +
            // O'lchov hint + input
            L + '#ed-measure-hint{background:rgba(255,255,255,.92)!important;color:#1B1A20!important;border-color:rgba(92,138,12,.45)!important}' +
            L + '#ed-measure-input{background:rgba(255,255,255,.97)!important;border-color:rgba(0,0,0,.15)!important}' +
            L + '#ed-measure-input > div:first-child{color:rgba(0,0,0,.5)!important}' +
            L + '#ed-mm-val{background:rgba(0,0,0,.05)!important;color:#1B1A20!important;border-color:rgba(0,0,0,.2)!important}' +
            L + '#ed-mm-cancel{background:rgba(0,0,0,.06)!important;color:rgba(0,0,0,.55)!important}' +
            // AI panel
            L + '#gal-ai-panel{background:rgba(248,247,244,.97)!important;border-top-color:rgba(139,92,246,.4)!important}' +
            L + '#gal-ai-prompt{background:rgba(0,0,0,.05)!important;color:#1B1A20!important;border-color:rgba(0,0,0,.15)!important}' +
            L + '#gal-ai-status{color:rgba(0,0,0,.5)!important}' +
            L + '#gal-ai-featured button{color:#1B1A20!important}' +
            L + '#gal-ai-models .gal-ai-model{color:#1B1A20!important}' +
            L + '#gal-ai-close{background:rgba(0,0,0,.08)!important;color:#1B1A20!important}' +
            // VR panel + menu
            L + '#gal-vr-panel{background:rgba(248,247,244,.97)!important}' +
            L + '#gal-vr-prompt{background:rgba(0,0,0,.05)!important;color:#1B1A20!important;border-color:rgba(0,0,0,.15)!important}' +
            L + '#gal-vr-panel-close{background:rgba(0,0,0,.08)!important;color:#1B1A20!important}' +
            L + '#gal-vr-menu{background:rgba(255,255,255,.98)!important;border-color:rgba(0,0,0,.12)!important}' +
            L + '#gal-vr-menu .gal-vr-opt{color:#1B1A20!important}' +
            // AI loading overlay
            L + '#gal-ai-overlay{background:rgba(255,255,255,.82)!important;color:#1B1A20!important}';

        document.head.appendChild(st);
    },

    // Tarif gating YOQILGAN bo'lsa (features massiv) — funksiya ruxsatini tekshirish.
    // O'chiq bo'lsa (features=null) — hammaga ochiq (backend ham shunday).
    _featureAllowed: function(key) {
        try {
            var f = window.__USER_DATA__ && window.__USER_DATA__.features;
            if (f == null) return true;
            if (Array.isArray(f)) return f.indexOf(key) !== -1;
        } catch (e) {}
        return true;
    },

    // Limit/tanga/tarif xatolarini foydalanuvchiga tushunarli matnga aylantirish
    _limitErrMsg: function(r, what) {
        if (!r) return 'Xatolik';
        if (r.error === 'coins') {
            var need = r.need != null ? r.need : '?';
            var bal = r.balance != null ? r.balance : 0;
            return '🪙 ' + (what || 'AI') + ' limiti tugagan — kerak: ' + need + ' tanga (balans: ' + bal + '). Tarifni oshiring yoki tanga to\'ldiring.';
        }
        if (r.upgrade) return '🔒 ' + (r.error || 'Bu funksiya tarifingizda yo\'q') + ' — tarifni oshiring.';
        return r.error || 'Xatolik';
    },

    close: function() {
        if (Gallery._ov) { Gallery._ov.remove(); Gallery._ov = null; }
        document.body.style.overflow = '';
        document.removeEventListener('keydown', Gallery._keyHandler);
        Gallery._editing = false;
        Gallery._canvas = null;
        if (Gallery._mResizeHandler) { window.removeEventListener('resize', Gallery._mResizeHandler); Gallery._mResizeHandler = null; }
        // AI jarayon davom etayotgan bo'lsa — kichik suzuvchi pill bilan kuzatamiz
        if (Gallery._aiBusy) Gallery._aiEnsurePill();
    },

    _render: function() {
        var f = Gallery._files[Gallery._idx];
        var ov = Gallery._ov;
        if (!ov) return;
        if (Gallery._mResizeHandler) { window.removeEventListener('resize', Gallery._mResizeHandler); Gallery._mResizeHandler = null; }
        var total = Gallery._files.length;

        var btn = 'width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,255,255,.14);color:#fff;cursor:pointer;font-size:14px;display:inline-flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);transition:background .15s';
        var h = '';
        h += '<div id="gal-top" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:calc(10px + env(safe-area-inset-top)) 14px 22px;flex-shrink:0;background:linear-gradient(rgba(0,0,0,.72),transparent);z-index:2;position:relative">';
        h += '<div style="display:flex;align-items:center;gap:10px;min-width:0">';
        h += '<button id="gal-close" style="'+btn+';font-size:18px">&times;</button>';
        h += '<div style="min-width:0"><div class="gal-title" style="color:#fff;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+Gallery._esc(f.file_name)+'</div>';
        h += '<div style="color:rgba(255,255,255,.6);font-size:11px;font-weight:600">'+(Gallery._idx+1)+' / '+total+'</div></div>';
        h += '</div>';
        h += '<div style="display:flex;gap:6px;flex-shrink:0">';
        if (f.file_type === 'image') h += '<button id="gal-edit" style="'+btn+'" title="Tahrirlash (o\'lchov · BLE · chizish)"><i class="fas fa-pen"></i></button>';
        if (f.file_type === 'image') h += '<button id="gal-ai" style="'+btn+';background:linear-gradient(135deg,#6366f1,#a855f7);font-weight:800;font-size:12px" title="AI bilan tahrirlash">AI</button>';
        if (f.file_type === 'image') h += '<button id="gal-vr" style="'+btn+';background:linear-gradient(135deg,#0ea5e9,#06b6d4)" title="360° VR qilish"><i class="fas fa-vr-cardboard"></i></button>';
        h += '<button id="gal-fullscreen" style="'+btn+'" title="To\'liq ekran"><i class="fas fa-expand"></i></button>';
        h += '<button id="gal-share" style="'+btn+'" title="Ulashish"><i class="fas fa-share-alt"></i></button>';
        h += '<button id="gal-dl" style="'+btn+'" title="Yuklab olish"><i class="fas fa-download"></i></button>';
        h += '</div></div>';

        h += '<div id="gal-body" style="flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center">';
        if (total > 1) {
            h += '<button id="gal-prev" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);z-index:3;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:16px;backdrop-filter:blur(4px)"><i class="fas fa-chevron-left"></i></button>';
            h += '<button id="gal-next" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:3;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:16px;backdrop-filter:blur(4px)"><i class="fas fa-chevron-right"></i></button>';
        }
        h += '<div id="gal-media" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;transition:transform .05s">';
        h += Gallery._mediaHtml(f);
        h += '</div></div>';
        // O'lchov ro'yxati (READ-ONLY) — 2026-09-08, TZ-Olchov-Interaktiv-Saqlash.
        // Faqat saqlangan rasmda `measurements` bo'lsa ko'rinadi.
        if (f.file_type === 'image' && f.measurements && f.measurements.length) {
            h += '<div id="gal-mlist" style="flex-shrink:0;max-height:26vh;overflow-y:auto;'
              + 'padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:rgba(0,0,0,.55);'
              + 'backdrop-filter:blur(6px)"></div>';
        }

        if (total > 1 && total <= 20) {
            h += '<div style="display:flex;justify-content:center;align-items:center;gap:6px;padding:10px 6px calc(10px + env(safe-area-inset-bottom));flex-shrink:0;background:linear-gradient(transparent,rgba(0,0,0,.55))">';
            for (var i = 0; i < total; i++) {
                var on = i === Gallery._idx;
                h += '<div data-dot="'+i+'" style="width:'+(on?'22px':'7px')+';height:7px;border-radius:99px;cursor:pointer;transition:all .25s;background:'+(on?'#DCF262':'rgba(255,255,255,.28)')+'"></div>';
            }
            h += '</div>';
        }

        ov.innerHTML = h;
        Gallery._bindUI();
        Gallery._initTouch();
        // AI jarayon ketayotgan bo'lsa overlay _render()'dan omon qolsin
        if (Gallery._aiBusy) Gallery._aiEnsureOverlay();
        // O'lchov qatlami (READ-ONLY) — 2026-09-08.
        if (f.file_type === 'image' && f.measurements && f.measurements.length) {
            Gallery._mActive = null;
            Gallery._mInit(f);
        }
    },

    // ═══ O'LCHOV QATLAMI — READ-ONLY (2026-09-08, TZ-Olchov-Interaktiv-Saqlash) ═══
    // Saqlangan rasm qayta ochilganda o'lchov chiziqlarini qayta chizadi va
    // ro'yxat ko'rsatadi. Editor (`_paintMeasure`/`_redraw`/`_renderMeasureList`)
    // mantig'iga TEGILMAYDI — bu ALOHIDA, mustaqil, faqat KO'RISH uchun nusxa
    // (editor `Gallery._ctx`/`Gallery._canvas`ga bog'liq, bu yerda ular yo'q —
    // shu sabab READ-ONLY holat uchun alohida yozildi, dublikat emas — ikkalasi
    // turli DOM elementlarda, turli holatda ishlaydi).
    _mInit: function (f) {
        var img = document.getElementById('gal-img');
        var cv = document.getElementById('gal-mcanvas');
        if (!img || !cv) return;
        var draw = function () {
            var w = img.clientWidth, h = img.clientHeight;
            if (!w || !h) return;
            cv.style.width = w + 'px'; cv.style.height = h + 'px';
            cv.style.left = img.offsetLeft + 'px'; cv.style.top = img.offsetTop + 'px';
            // Naturalga nisbatan masshtab — measurements koordinatasi asl
            // (yuklangan) rasm piksel o'lchamida saqlangan.
            var sx = w / (img.naturalWidth || w), sy = h / (img.naturalHeight || h);
            cv.width = w; cv.height = h;
            Gallery._mDrawAll(cv, f.measurements, sx, sy);
        };
        if (img.complete && img.naturalWidth) draw(); else img.onload = draw;
        window.addEventListener('resize', draw);
        Gallery._mResizeHandler = draw;
        Gallery._mRenderList(f);
    },
    _mDrawAll: function (cv, measures, sx, sy) {
        var ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, cv.width, cv.height);
        (measures || []).forEach(function (m, i) { Gallery._mDrawOne(ctx, m, i + 1, sx, sy); });
    },
    _mDrawOne: function (ctx, m, num, sx, sy) {
        var p1 = { x: m.p1.x * sx, y: m.p1.y * sy }, p2 = { x: m.p2.x * sx, y: m.p2.y * sy };
        var dim = (Gallery._mActive != null && Gallery._mActive !== m.id);
        var col = m.color || '#DCF262';
        ctx.save();
        if (dim) ctx.globalAlpha = 0.25;
        var hot = (Gallery._mActive === m.id);
        ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = hot ? 4 : 2;
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        var angle = Math.atan2(p2.y - p1.y, p2.x - p1.x), pa = angle + Math.PI / 2, markLen = 8;
        [p1, p2].forEach(function (pt) {
            ctx.beginPath(); ctx.lineWidth = 2;
            ctx.moveTo(pt.x + Math.cos(pa) * markLen, pt.y + Math.sin(pa) * markLen);
            ctx.lineTo(pt.x - Math.cos(pa) * markLen, pt.y - Math.sin(pa) * markLen);
            ctx.stroke();
            ctx.beginPath(); ctx.arc(pt.x, pt.y, hot ? 5 : 3, 0, Math.PI * 2);
            ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        });
        var text = Gallery._numGlyph(num) + ' ' + m.mm + ' mm';
        var midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
        var fs = Math.max(11, Math.round(ctx.canvas.width / 60));
        ctx.font = 'bold ' + fs + 'px Inter, sans-serif';
        var tw = ctx.measureText(text).width, pad = Math.round(fs * 0.4), rw = tw + pad * 2, rh = Math.round(fs * 1.6);
        var rx = Math.max(2, Math.min(midX - rw / 2, ctx.canvas.width - rw - 2));
        var ry = Math.max(2, Math.min(midY - rh - 4, ctx.canvas.height - rh - 2));
        ctx.fillStyle = hot ? col : 'rgba(0,0,0,.8)';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(rx, ry, rw, rh, 5) : ctx.rect(rx, ry, rw, rh);
        ctx.fill();
        ctx.fillStyle = hot ? '#000' : '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, rx + pad, ry + rh / 2);
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    },
    _mRenderList: function (f) {
        var box = document.getElementById('gal-mlist');
        if (!box) return;
        var esc = Gallery._esc, ms = f.measurements || [];
        var h = '<div style="font-size:11.5px;font-weight:800;color:#fff;padding:2px 2px 6px">📏 O‘lchamlar (' + ms.length + ')</div>';
        h += '<div style="display:flex;flex-direction:column;gap:5px">';
        ms.forEach(function (m, i) {
            var act = (Gallery._mActive === m.id);
            h += '<div class="gal-mrow" data-id="' + m.id + '" style="display:flex;align-items:center;gap:7px;'
              + 'padding:7px 9px;border-radius:9px;cursor:pointer;'
              + 'background:' + (act ? 'rgba(220,252,98,.16)' : 'rgba(255,255,255,.05)') + ';'
              + 'border:1px solid ' + (act ? 'rgba(220,252,98,.5)' : 'transparent') + '">'
              + '<span style="font-size:12px;flex:none">' + Gallery._numGlyph(i + 1) + '</span>'
              + '<div style="flex:1;min-width:0">'
              + '<div style="font-size:12px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (esc(m.note) || '—') + '</div>'
              + '<div style="font-size:10.5px;color:rgba(255,255,255,.55)">' + esc(m.mm) + ' mm</div></div></div>';
        });
        h += '</div>';
        box.innerHTML = h;
        Array.prototype.forEach.call(box.querySelectorAll('.gal-mrow'), function (row) {
            row.onclick = function () {
                var id = parseInt(row.getAttribute('data-id'), 10);
                Gallery._mActive = (Gallery._mActive === id) ? null : id;
                var cv = document.getElementById('gal-mcanvas');
                if (cv && Gallery._mResizeHandler) Gallery._mResizeHandler();
                Gallery._mRenderList(f);
            };
        });
    },

    _mediaHtml: function(f) {
        if (f.file_type === 'image') {
            // O'lchov qatlami (2026-09-08) — rasm ustiga shaffof <canvas>,
            // faqat `measurements` bo'lsa. `position:relative` wrapper —
            // canvas rasmning haqiqiy ko'rsatilgan o'lchamiga moslanadi
            // (img.onload'da _mRedraw orqali, chunki object-fit:contain
            // rasmni kichraytirishi mumkin).
            var hasM = f.measurements && f.measurements.length;
            var img = '<img id="gal-img" src="'+Gallery._esc(f.file_url)+'" style="max-width:100%;max-height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none" draggable="false">';
            if (!hasM) return img;
            return '<div style="position:relative;max-width:100%;max-height:100%;display:flex;align-items:center;justify-content:center">'
              + img + '<canvas id="gal-mcanvas" style="position:absolute;left:0;top:0;pointer-events:none"></canvas></div>';
        }
        if (f.file_type === 'video') return '<video id="gal-vid" src="'+Gallery._esc(f.file_url)+'" controls autoplay playsinline style="max-width:100%;max-height:100%;background:#000;border-radius:4px"></video>';
        if (f.file_name.toLowerCase().endsWith('.pdf')) return '<iframe src="'+Gallery._esc(f.file_url)+'" style="width:100%;height:100%;border:none;background:#fff"></iframe>';
        // SketchUp (.skp) — to'liq 3D emas (fayl ichida geometriya yopiq
        // formatda, o'qib bo'lmaydi, 2026-09-03 tekshirildi), lekin dastur
        // o'zi saqlagan tayyor preview rasm bor (thumbnail_url) — shuni
        // ko'rsatamiz, ostida ochiq tushuntirish bilan.
        if (f.file_name.toLowerCase().endsWith('.skp') && f.thumbnail_url) {
            return '<div style="text-align:center;color:#fff;padding:20px;max-width:100%">' +
                '<img src="'+Gallery._esc(f.thumbnail_url)+'" style="max-width:100%;max-height:60vh;object-fit:contain;border-radius:8px;background:#fff" draggable="false">' +
                '<div style="font-size:13px;margin-top:14px;color:#fff">'+Gallery._esc(f.file_name)+'</div>' +
                '<div style="font-size:11.5px;opacity:.65;margin-top:6px;max-width:280px;margin-left:auto;margin-right:auto">Bu — faylning ichki ko‘rinishi. To‘liq 3D holda ochish uchun kompyuteringizda SketchUp dasturida oching.</div>' +
                '<a href="javascript:void(0)" onclick="Gallery._downloadOrOpen(\''+Gallery._esc(f.file_url)+'\', \''+Gallery._esc(f.file_name)+'\')" style="display:inline-block;margin-top:14px;padding:8px 20px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-size:13px"><i class="fas fa-download"></i> Yuklab olish</a></div>';
        }
        return '<div style="text-align:center;color:#fff;padding:40px"><i class="fas fa-file" style="font-size:48px;margin-bottom:12px;display:block;opacity:.6"></i><div style="font-size:14px;margin-bottom:8px">'+Gallery._esc(f.file_name)+'</div><div style="font-size:12px;opacity:.5">'+Gallery._formatSize(f.file_size)+'</div><a href="javascript:void(0)" onclick="Gallery._downloadOrOpen(\''+Gallery._esc(f.file_url)+'\', \''+Gallery._esc(f.file_name)+'\')" style="display:inline-block;margin-top:16px;padding:8px 20px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-size:13px"><i class="fas fa-download"></i> Yuklab olish</a></div>';
    },

    _bindUI: function() {
        var f = Gallery._files[Gallery._idx];
        document.getElementById('gal-close').onclick = Gallery.close;
        var prev = document.getElementById('gal-prev');
        var next = document.getElementById('gal-next');
        if (prev) prev.onclick = function() { Gallery._go(-1); };
        if (next) next.onclick = function() { Gallery._go(1); };
        document.getElementById('gal-fullscreen').onclick = function() {
            if (!document.fullscreenElement) Gallery._ov.requestFullscreen().catch(function(){});
            else document.exitFullscreen();
        };
        document.getElementById('gal-share').onclick = function() {
            var url = window.location.origin + f.file_url;
            if (navigator.share) navigator.share({url: url}).catch(function(){});
            else navigator.clipboard.writeText(url).then(function() { Toast.success('URL nusxalandi'); });
        };
        document.getElementById('gal-dl').onclick = function() {
            Gallery._downloadOrOpen(f.file_url, f.file_name);
        };
        var editBtn = document.getElementById('gal-edit');
        if (editBtn) editBtn.onclick = function() { Gallery._startEditor(); };
        var aiBtn = document.getElementById('gal-ai');
        if (aiBtn) aiBtn.onclick = function() { Gallery._toggleAIPanel(); };
        var vrBtn = document.getElementById('gal-vr');
        if (vrBtn) vrBtn.onclick = function() { Gallery._showVRMenu(vrBtn); };
        // Dots — to'g'ridan-to'g'ri o'tish
        Array.prototype.forEach.call(Gallery._ov.querySelectorAll('[data-dot]'), function(dot) {
            dot.onclick = function() {
                var n = parseInt(dot.getAttribute('data-dot'));
                if (!isNaN(n) && n !== Gallery._idx) {
                    Gallery._idx = n; Gallery._zoom = 1; Gallery._panX = 0; Gallery._panY = 0;
                    Gallery._editing = false; Gallery._render();
                }
            };
        });
    },

    // ── AI tahrirlash paneli (fal.ai) ────────────────────────────────────────
    _aiBusy: false,

    _toggleAIPanel: function() {
        var existing = document.getElementById('gal-ai-panel');
        if (existing) { if (!Gallery._aiBusy) existing.remove(); return; }
        // Tarif gating: AI tahrir funksiyasi yopiq bo'lsa — darhol xato (panel ochilmaydi)
        if (!Gallery._featureAllowed('ai_image')) {
            if (window.Toast) Toast.error('🔒 AI tahrir tarifingizda yo\'q — tarifni oshiring');
            return;
        }
        Gallery._aiPreset = null;
        Gallery._aiBaseInstruction = '';
        Gallery._aiFeaturedList = [];
        var p = document.createElement('div');
        p.id = 'gal-ai-panel';
        p.style.cssText = 'position:absolute;left:0;right:0;bottom:0;z-index:6;' +
            'background:rgba(13,15,22,.96);backdrop-filter:blur(12px);' +
            'border-top:1px solid rgba(139,92,246,.35);padding:12px 14px;' +
            'display:flex;flex-direction:column;gap:10px';
        p.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<span style="background:linear-gradient(135deg,#6366f1,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:13px;font-weight:800">✨ AI tahrirlash</span>' +
              '<span id="gal-ai-status" style="color:#9ca3af;font-size:11px;flex:1;text-align:right"></span>' +
              '<button id="gal-ai-close" style="width:26px;height:26px;border-radius:50%;border:none;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:13px">&times;</button>' +
            '</div>' +
            '<div id="gal-ai-models" style="display:flex;flex-wrap:wrap;gap:6px"></div>' +
            '<div id="gal-ai-featured" style="display:none;flex-wrap:wrap;gap:6px"></div>' +
            '<div id="gal-ai-preset-chip" style="display:none;flex-direction:column;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.4);border-radius:8px;padding:8px 10px;font-size:12px;color:#c4b5fd"></div>' +
            '<div style="display:flex;gap:8px">' +
              '<input id="gal-ai-prompt" placeholder="Nima o\'zgartirilsin? Masalan: divanni yashil rangga bo\'ya" ' +
                'style="flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 12px;color:#fff;font-size:13px;outline:none">' +
              '<button id="gal-ai-send" style="border:none;border-radius:10px;padding:10px 16px;' +
                'background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">✨ Yuborish</button>' +
            '</div>';
        Gallery._ov.appendChild(p);
        document.getElementById('gal-ai-close').onclick = function() {
            if (!Gallery._aiBusy) p.remove();
        };
        document.getElementById('gal-ai-send').onclick = Gallery._aiSubmit;
        var inp = document.getElementById('gal-ai-prompt');
        inp.onkeydown = function(e) {
            e.stopPropagation(); // galereya ←/→ klavishlarini bloklamaslik
            if (e.key === 'Enter') Gallery._aiSubmit();
        };

        Gallery._loadModels();
        Gallery._loadFeatured();
        inp.focus();
    },

    // ── Model tanlash (sifat/tanga farqli) ────────────────────────────────────
    _aiModels: null,
    _aiModel: null,
    _loadModels: function() {
        var box = document.getElementById('gal-ai-models');
        if (!box) return;
        if (Gallery._aiModels) { Gallery._renderModels(); return; }
        fetch('/mini/api/ai-image-edit/?models=1')
            .then(function(r){ return r.json(); })
            .then(function(r){
                if (!r.ok || !r.data) return;
                Gallery._aiModels = r.data.models || [];
                if (!Gallery._aiModel) Gallery._aiModel = r.data.default || (Gallery._aiModels[0] && Gallery._aiModels[0].key);
                Gallery._renderModels();
            })
            .catch(function(){});
    },
    _renderModels: function() {
        var box = document.getElementById('gal-ai-models');
        if (!box || !Gallery._aiModels) return;
        box.innerHTML = Gallery._aiModels.map(function(m){
            var on = m.key === Gallery._aiModel;
            var coin = (typeof m.coins === 'number' && m.coins > 0) ? ' · 🪙' + m.coins : '';
            return '<button type="button" class="gal-ai-model" data-key="' + m.key + '" title="' + String(m.desc||'').replace(/"/g,'') + '" style="' +
                'border:1px solid ' + (on ? '#a855f7' : 'rgba(255,255,255,.2)') + ';border-radius:20px;padding:6px 11px;font-size:12px;cursor:pointer;white-space:nowrap;font-weight:600;' +
                'background:' + (on ? 'rgba(168,85,247,.28)' : 'rgba(255,255,255,.06)') + ';color:#fff">' +
                (m.icon || '🎨') + ' ' + String(m.name).replace(/</g,'&lt;') + coin + '</button>';
        }).join('');
        Array.prototype.forEach.call(box.querySelectorAll('.gal-ai-model'), function(btn){
            btn.onclick = function(){ Gallery._aiModel = btn.dataset.key; Gallery._renderModels(); };
        });
    },

    // Har panel ochilganda 3 ta tasodifiy uslub tugmasi (masalan Oshxona, Ispancha)
    _loadFeatured: function() {
        fetch('/mini/api/prompt-presets/')
            .then(function(r) { return r.json(); })
            .then(function(r) {
                if (!r.ok) return;
                Gallery._aiBaseInstruction = r.base_instruction || '';
                Gallery._aiFeaturedList = r.featured || [];
                Gallery._renderFeatured();
            })
            .catch(function() {});
    },

    _renderFeatured: function() {
        var box = document.getElementById('gal-ai-featured');
        if (!box) return;
        var list = Gallery._aiFeaturedList || [];
        if (!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
        box.style.display = 'flex';
        box.innerHTML = list.map(function(it, idx) {
            var active = Gallery._aiPreset && Gallery._aiPreset.id === it.id;
            return '<button type="button" class="gal-ai-featured-btn" data-idx="' + idx + '" style="' +
                'border:1px solid ' + (active ? '#a855f7' : 'rgba(255,255,255,.2)') + ';border-radius:20px;' +
                'padding:6px 12px;font-size:12px;cursor:pointer;white-space:nowrap;' +
                'background:' + (active ? 'rgba(168,85,247,.25)' : 'rgba(255,255,255,.06)') + ';color:#fff">' +
                String(it.title).replace(/</g, '&lt;') + '</button>';
        }).join('') +
            '<button type="button" id="gal-ai-shuffle" title="Boshqa 3 tasini ko\'rsatish" style="' +
                'border:1px solid rgba(255,255,255,.2);border-radius:20px;padding:6px 10px;font-size:12px;' +
                'cursor:pointer;white-space:nowrap;background:rgba(255,255,255,.06);color:#fff">' +
                '<i class="fas fa-random"></i> Almashtirish</button>';
        Array.prototype.forEach.call(box.querySelectorAll('.gal-ai-featured-btn'), function(btn, idx) {
            btn.onclick = function() {
                var cur = Gallery._aiPreset;
                Gallery._aiPreset = (cur && cur.id === list[idx].id) ? null : list[idx];
                Gallery._renderFeatured();
                Gallery._renderPresetChip();
            };
        });
        var shuffleBtn = document.getElementById('gal-ai-shuffle');
        if (shuffleBtn) shuffleBtn.onclick = function() {
            Gallery._aiPreset = null;
            Gallery._renderPresetChip();
            Gallery._loadFeatured();
        };
    },

    _renderPresetChip: function() {
        var chip = document.getElementById('gal-ai-preset-chip');
        if (!chip) return;
        if (!Gallery._aiPreset) { chip.style.display = 'none'; chip.innerHTML = ''; return; }
        chip.style.display = 'flex';
        chip.innerHTML =
            '<div style="display:flex;align-items:center;gap:6px">' +
              '<span style="font-weight:700">🏷 ' + String(Gallery._aiPreset.title).replace(/</g, '&lt;') + '</span>' +
              '<span id="gal-ai-preset-clear" style="cursor:pointer;color:#f87171;font-weight:700;margin-left:auto">&times;</span>' +
            '</div>' +
            '<div style="color:#9ca3af;font-size:11px;margin-top:4px">' +
              String(Gallery._aiPreset.prompt_text).replace(/</g, '&lt;') +
            '</div>';
        document.getElementById('gal-ai-preset-clear').onclick = function() {
            Gallery._aiPreset = null;
            Gallery._renderPresetChip();
            Gallery._renderFeatured();
        };
    },

    _aiSetStatus: function(text, isError) {
        Gallery._aiLastStep = text || '';
        var el = document.getElementById('gal-ai-status');
        if (el) { el.textContent = text || ''; el.style.color = isError ? '#f87171' : '#9ca3af'; }
        var stepEl = document.getElementById('gal-ai-overlay-step');
        if (stepEl) stepEl.textContent = text || '';
        var pillStep = document.getElementById('ce-ai-pill-step');
        if (pillStep) pillStep.textContent = text || '';
    },

    // ── AI jarayon UI: overlay (galereya ichida) + pill (galereya tashqarisida) ──

    _aiSpinStyle: function() {
        if (document.getElementById('gal-ai-spin-style')) return;
        var st = document.createElement('style');
        st.id = 'gal-ai-spin-style';
        st.textContent = '@keyframes galspin{to{transform:rotate(360deg)}}';
        document.head.appendChild(st);
    },

    _aiEnsureOverlay: function() {
        if (!Gallery._aiBusy || !Gallery._ov) return;
        var body = document.getElementById('gal-body');
        if (!body) return;
        var ov = document.getElementById('gal-ai-overlay');
        if (!ov) {
            Gallery._aiSpinStyle();
            ov = document.createElement('div');
            ov.id = 'gal-ai-overlay';
            ov.style.cssText = 'position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;' +
                'align-items:center;justify-content:center;gap:12px;background:rgba(0,0,0,.72);' +
                'backdrop-filter:blur(3px);color:#fff;text-align:center;padding:20px';
            ov.innerHTML =
                '<div style="width:44px;height:44px;border-radius:50%;border:4px solid rgba(255,255,255,.2);border-top-color:#a855f7;animation:galspin 1s linear infinite"></div>' +
                '<div style="font-size:14px;font-weight:700">✨ AI tahrirlamoqda...</div>' +
                '<div id="gal-ai-overlay-step" style="font-size:12px;color:#c4b5fd;max-width:280px"></div>' +
                '<div style="font-size:11px;color:#9ca3af;max-width:280px">Kutish shart emas — yopsangiz ham jarayon orqada davom etadi, tayyor bo\'lganda rasm buyurtma fayllariga qo\'shiladi</div>';
            body.appendChild(ov);
        }
        var stepEl = document.getElementById('gal-ai-overlay-step');
        if (stepEl) stepEl.textContent = Gallery._aiLastStep || '';
    },

    _aiRemoveOverlay: function() {
        var ov = document.getElementById('gal-ai-overlay');
        if (ov) ov.remove();
    },

    _aiEnsurePill: function() {
        if (document.getElementById('ce-ai-pill')) return;
        Gallery._aiSpinStyle();
        var p = document.createElement('div');
        p.id = 'ce-ai-pill';
        p.style.cssText = 'position:fixed;left:50%;bottom:74px;transform:translateX(-50%);z-index:9998;' +
            'background:rgba(13,15,22,.92);border:1px solid rgba(139,92,246,.5);color:#fff;border-radius:20px;' +
            'padding:8px 14px;font-size:12px;display:flex;align-items:center;gap:8px;max-width:92vw;' +
            'box-shadow:0 4px 16px rgba(0,0,0,.35)';
        p.innerHTML =
            '<span style="display:inline-block;flex-shrink:0;width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.25);border-top-color:#a855f7;animation:galspin 1s linear infinite"></span>' +
            '<span style="white-space:nowrap">✨ AI tahrir</span>' +
            '<span id="ce-ai-pill-step" style="color:#c4b5fd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            (Gallery._aiLastStep ? String(Gallery._aiLastStep).replace(/</g, '&lt;') : '') + '</span>';
        document.body.appendChild(p);
    },

    _aiRemovePill: function() {
        var p = document.getElementById('ce-ai-pill');
        if (p) p.remove();
    },

    // Jarayon tugadi (muvaffaqiyat/xato) — UI va sessionStorage'ni tozalash
    _aiFinish: function() {
        Gallery._aiBusy = false;
        Gallery._aiRemoveOverlay();
        Gallery._aiRemovePill();
        try {
            if (Gallery._aiOrderId != null) sessionStorage.removeItem('ce_ai_task_' + Gallery._aiOrderId);
        } catch (e) {}
        Gallery._aiOrderId = null;
    },

    // Buyurtma sahifasi qayta ochilganda tugallanmagan AI task pollingini davom ettirish
    aiResume: function(orderId) {
        if (Gallery._aiBusy || !orderId) return;
        var tid = null;
        try { tid = sessionStorage.getItem('ce_ai_task_' + orderId); } catch (e) {}
        if (!tid) return;
        Gallery._aiBusy = true;
        Gallery._aiOrderId = orderId;
        if (Gallery._ov) Gallery._aiEnsureOverlay();
        else Gallery._aiEnsurePill();
        Gallery._aiPoll(tid);
    },

    // Tayyor natijani JORIY OrderDetail._data.files ga qo'shish (stale massivga emas)
    _aiApplyResult: function(file, taskOrderId) {
        if (!file) return;
        var odObj = Gallery._od();
        var od = odObj && odObj._data;
        // Boshqa buyurtma ochiq bo'lsa — uning ro'yxatiga qo'shmaymiz (WS broadcast o'zi yangilaydi)
        if (od && taskOrderId && od.id !== taskOrderId) od = null;
        var files = od && od.files;
        if (files) {
            var exists = false, i;
            for (i = 0; i < files.length; i++) {
                if (files[i].id === file.id) { exists = true; break; }
            }
            if (!exists) files.unshift(file); // serializer tartibi: eng yangisi birinchi
            if (odObj && odObj._refreshFilesGrid) odObj._refreshFilesGrid();
            if (Gallery._ov) {
                Gallery._files = files;
                var idx = 0;
                for (i = 0; i < files.length; i++) {
                    if (files[i].id === file.id) { idx = i; break; }
                }
                Gallery._idx = idx;
                Gallery._render(); // yangi rasm ochiladi, AI panel yopiladi
            }
        } else if (Gallery._ov) {
            // OrderDetail konteksti yo'q (fallback) — faqat ochiq galereyaga qo'shamiz
            Gallery._files.push(file);
            Gallery._idx = Gallery._files.length - 1;
            Gallery._render();
        }
    },

    _aiSubmit: function() {
        if (Gallery._aiBusy) return;
        var f = Gallery._files[Gallery._idx];
        var inp = document.getElementById('gal-ai-prompt');
        var typed = (inp && inp.value || '').trim();
        if (!typed && !Gallery._aiPreset) {
            Gallery._aiSetStatus('Prompt yozing yoki mahsulot tanlang', true);
            return;
        }
        var parts = [];
        if (Gallery._aiBaseInstruction) parts.push(Gallery._aiBaseInstruction);
        if (Gallery._aiPreset) parts.push(Gallery._aiPreset.prompt_text);
        if (typed) parts.push(typed);
        var prompt = parts.join('. ');

        Gallery._aiBusy = true;
        var btn = document.getElementById('gal-ai-send');
        if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
        Gallery._aiSetStatus('Boshlanmoqda...');
        Gallery._aiEnsureOverlay();

        fetch('/mini/api/ai-image-edit/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({file_id: f.id, prompt: prompt, model: Gallery._aiModel || undefined}),
        }).then(function(r) { return r.json(); }).then(function(r) {
            if (!r.ok) throw new Error(Gallery._limitErrMsg(r, 'AI tahrir'));
            // Sahifadan chiqib ketilsa ham qayta ochilganda davom ettirish uchun
            try {
                var odObj = Gallery._od();
                var od = odObj && odObj._data;
                if (od) {
                    Gallery._aiOrderId = od.id;
                    sessionStorage.setItem('ce_ai_task_' + od.id, r.data.task_id);
                }
            } catch (e) {}
            Gallery._aiPoll(r.data.task_id);
        }).catch(function(err) {
            Gallery._aiFinish();
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
            Gallery._aiSetStatus(err.message, true);
            if (window.Toast) Toast.error(err.message);
        });
    },

    _aiPoll: function(taskId) {
        var iv = setInterval(function() {
            // Galereya yopilgan bo'lsa ham polling davom etadi — pill ko'rsatamiz
            if (Gallery._aiBusy && !Gallery._ov) Gallery._aiEnsurePill();
            fetch('/mini/api/ai-image-edit/?task_id=' + taskId)
                .then(function(r) { return r.json(); })
                .then(function(r) {
                    if (!r.ok) throw new Error(r.error || 'Task topilmadi yoki eskirgan');
                    var d = r.data;
                    Gallery._aiSetStatus(d.step || d.status);
                    if (d.status === 'done') {
                        clearInterval(iv);
                        var taskOrderId = Gallery._aiOrderId;
                        Gallery._aiFinish();
                        Gallery._aiApplyResult(d.file, taskOrderId);
                        if (window.Toast) Toast.success('AI tahrir tayyor — buyurtma fayliga qo\'shildi');
                    } else if (d.status === 'error') {
                        clearInterval(iv);
                        Gallery._aiFinish();
                        var btn = document.getElementById('gal-ai-send');
                        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
                        Gallery._aiSetStatus(d.error || 'AI xatosi', true);
                        if (window.Toast && !document.getElementById('gal-ai-status')) Toast.error(d.error || 'AI xatosi');
                    }
                })
                .catch(function(err) {
                    clearInterval(iv);
                    Gallery._aiFinish();
                    var btn = document.getElementById('gal-ai-send');
                    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
                    Gallery._aiSetStatus(err.message, true);
                    if (window.Toast && !document.getElementById('gal-ai-status')) Toast.error(err.message);
                });
        }, 2000);
    },

    // ── 360° VR (PanoPulse yoki Fal AI/Hunyuan World orqali panorama yaratish) ──
    _vrBusy: false,

    // Tugma bosilganda qaysi provayder ishlatilishini so'raydigan kichik popup.
    _showVRMenu: function(btn) {
        if (Gallery._vrBusy) return;
        var f = Gallery._files[Gallery._idx];
        if (!f || f.file_type !== 'image') return;
        // Tarif gating: 360° VR yopiq bo'lsa — darhol xato
        if (!Gallery._featureAllowed('ai_panorama')) {
            if (window.Toast) Toast.error('🔒 360° VR tarifingizda yo\'q — tarifni oshiring');
            return;
        }

        var existing = document.getElementById('gal-vr-menu');
        if (existing) { existing.remove(); return; }

        var rect = btn.getBoundingClientRect();
        var menu = document.createElement('div');
        menu.id = 'gal-vr-menu';
        menu.style.cssText = 'position:fixed;z-index:10000;top:' + (rect.bottom + 6) + 'px;right:' +
            (window.innerWidth - rect.right) + 'px;background:rgba(15,15,20,.97);' +
            'backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.15);border-radius:12px;' +
            'padding:6px;display:flex;flex-direction:column;gap:2px;min-width:220px;box-shadow:0 8px 24px rgba(0,0,0,.4)';
        var optCss = 'text-align:left;padding:10px 12px;border:none;background:transparent;color:#fff;' +
            'border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;width:100%';
        menu.innerHTML =
            '<button class="gal-vr-opt" data-p="panopulse" style="' + optCss + '">' +
                '<i class="fas fa-vr-cardboard" style="width:16px;color:#38bdf8"></i> PanoPulse (Bittada 360)</button>' +
            '<button class="gal-vr-opt" data-p="fal_hunyuan" style="' + optCss + '">' +
                '<i class="fas fa-globe" style="width:16px;color:#a855f7"></i> Fal AI (Hunyuan World)</button>';
        // Overlay ichiga qo'yiladi — Gallery._render()/close() bilan avtomatik tozalanadi.
        Gallery._ov.appendChild(menu);

        function closeMenu(e) {
            if (menu.parentNode && !menu.contains(e.target) && e.target !== btn) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        }
        Array.prototype.forEach.call(menu.querySelectorAll('.gal-vr-opt'), function(b) {
            b.onmouseenter = function() { b.style.background = 'rgba(255,255,255,.08)'; };
            b.onmouseleave = function() { b.style.background = 'transparent'; };
            b.onclick = function(e) {
                e.stopPropagation();
                menu.remove();
                document.removeEventListener('click', closeMenu);
                Gallery._showVRPromptPanel(btn, b.dataset.p);
            };
        });
        setTimeout(function() { document.addEventListener('click', closeMenu); }, 0);
    },

    // Provayder tanlangandan keyin — ixtiyoriy tavsif kiritish paneli
    // (gal-ai-panel bilan bir xil uslub). Bo'sh qoldirilsa avtomatik/statik
    // prompt ishlatiladi (backend'dagi mavjud xatti-harakat); yozilsa Claude
    // orqali provayderga mos promptga aylantiriladi (panorama_ai.py).
    _showVRPromptPanel: function(btn, provider) {
        var existing = document.getElementById('gal-vr-panel');
        if (existing) existing.remove();

        var label = provider === 'fal_hunyuan' ? 'Fal AI (Hunyuan World)' : 'PanoPulse (Bittada 360)';
        var p = document.createElement('div');
        p.id = 'gal-vr-panel';
        p.style.cssText = 'position:absolute;left:0;right:0;bottom:0;z-index:6;' +
            'background:rgba(13,15,22,.96);backdrop-filter:blur(12px);' +
            'border-top:1px solid rgba(14,165,233,.35);padding:12px 14px;' +
            'display:flex;flex-direction:column;gap:10px';
        p.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<span style="color:#38bdf8;font-size:13px;font-weight:800"><i class="fas fa-vr-cardboard"></i> ' + label + '</span>' +
              '<button id="gal-vr-panel-close" style="margin-left:auto;width:26px;height:26px;border-radius:50%;border:none;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:13px">&times;</button>' +
            '</div>' +
            '<div style="display:flex;gap:8px">' +
              '<input id="gal-vr-prompt" placeholder="Qo\'shimcha tavsif (ixtiyoriy)... masalan: yorqinroq, zamonaviy uslub" ' +
                'style="flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 12px;color:#fff;font-size:13px;outline:none">' +
              '<button id="gal-vr-send" style="border:none;border-radius:10px;padding:10px 16px;' +
                'background:linear-gradient(135deg,#0ea5e9,#06b6d4);color:#fff;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">' +
                '<i class="fas fa-vr-cardboard"></i> Yaratish</button>' +
            '</div>';
        Gallery._ov.appendChild(p);

        document.getElementById('gal-vr-panel-close').onclick = function() { p.remove(); };
        var inp = document.getElementById('gal-vr-prompt');
        var send = function() {
            var val = (inp.value || '').trim();
            p.remove();
            Gallery._runVR(btn, provider, val);
        };
        document.getElementById('gal-vr-send').onclick = send;
        inp.onkeydown = function(e) {
            e.stopPropagation(); // galereya ←/→ klavishlarini bloklamaslik
            if (e.key === 'Enter') send();
        };
        inp.focus();
    },

    _runVR: function(btn, provider, userPrompt) {
        if (Gallery._vrBusy) return;
        var f = Gallery._files[Gallery._idx];
        if (!f || f.file_type !== 'image') return;

        Gallery._vrBusy = true;
        var origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;
        btn.style.opacity = '.6';
        if (window.Toast) Toast.info('360° VR yaratish boshlandi (1-3 daqiqa)...');

        fetch('/mini/api/panorama-generate/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({file_id: f.id, provider: provider, prompt: userPrompt || ''}),
        }).then(function(r) { return r.json(); }).then(function(r) {
            if (!r.ok) throw new Error(Gallery._limitErrMsg(r, '360° VR'));
            Gallery._pollVR(r.data.task_id, btn, origHtml);
        }).catch(function(err) {
            Gallery._vrDone(btn, origHtml, null, err.message);
        });
    },

    _pollVR: function(taskId, btn, origHtml) {
        var iv = setInterval(function() {
            fetch('/mini/api/panorama-generate/?task_id=' + taskId)
                .then(function(r) { return r.json(); })
                .then(function(r) {
                    if (!r.ok) throw new Error(r.error || 'Task xatosi');
                    var d = r.data;
                    if (btn) btn.title = d.step || d.status;
                    if (d.status === 'done') {
                        clearInterval(iv);
                        Gallery._vrDone(btn, origHtml, d.viewer_url, null);
                    } else if (d.status === 'error') {
                        clearInterval(iv);
                        Gallery._vrDone(btn, origHtml, null, d.error || 'VR xatosi');
                    }
                })
                .catch(function(err) {
                    clearInterval(iv);
                    Gallery._vrDone(btn, origHtml, null, err.message);
                });
        }, 4000);
    },

    // Generatsiya tugagandan KEYIN chaqiriladi — bu vaqtda tugma bosilgan
    // click hodisasidan ancha vaqt (1-3 daqiqa) o'tgan, shu sababli
    // window.open ko'p brauzerda popup-blocker tomonidan to'silishi mumkin.
    // Shu holat uchun bosiladigan havola bilan Toast zaxira sifatida ko'rsatiladi.
    _vrDone: function(btn, origHtml, viewerUrl, errorMsg) {
        Gallery._vrBusy = false;
        if (btn) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.title = '360° VR qilish';
        }
        if (errorMsg) {
            if (window.Toast) Toast.error(errorMsg);
            else alert(errorMsg);
            return;
        }
        var opened = window.open(viewerUrl, '_blank');
        if (opened) {
            if (window.Toast) Toast.success('360° VR tayyor!');
            return;
        }
        if (window.Toast) {
            Toast.show('360° VR tayyor! <a href="' + viewerUrl + '" target="_blank" ' +
                'style="color:#38bdf8;text-decoration:underline;font-weight:600">Ochish</a>',
                'success', 10000);
        } else {
            window.location.href = viewerUrl;
        }
    },

    _go: function(dir) {
        Gallery._idx = (Gallery._idx + dir + Gallery._files.length) % Gallery._files.length;
        Gallery._zoom = 1; Gallery._panX = 0; Gallery._panY = 0;
        Gallery._editing = false;
        Gallery._render();
    },

    _bindKeys: function() {
        Gallery._keyHandler = function(e) {
            if (Gallery._editing) { if (e.key === 'Escape') Gallery._exitEditor(); return; }
            if (e.key === 'Escape') Gallery.close();
            if (e.key === 'ArrowLeft') Gallery._go(-1);
            if (e.key === 'ArrowRight') Gallery._go(1);
            if (e.key === 'f') {
                if (!document.fullscreenElement) Gallery._ov.requestFullscreen().catch(function(){});
                else document.exitFullscreen();
            }
        };
        document.addEventListener('keydown', Gallery._keyHandler);
    },

    _initTouch: function() {
        var body = document.getElementById('gal-body');
        if (!body) return;
        var startX = 0, startDist = 0, startZoom = 1, pinching = false;
        body.addEventListener('touchstart', function(e) {
            if (Gallery._editing) return;
            if (e.touches.length === 2) { pinching = true; startDist = Gallery._touchDist(e); startZoom = Gallery._zoom; }
            else if (e.touches.length === 1) { startX = e.touches[0].clientX; pinching = false; }
        }, {passive: true});
        body.addEventListener('touchmove', function(e) {
            if (Gallery._editing) return;
            if (pinching && e.touches.length === 2) {
                Gallery._zoom = Math.max(0.5, Math.min(8, startZoom * Gallery._touchDist(e) / startDist));
                Gallery._applyZoom();
            }
        }, {passive: true});
        body.addEventListener('touchend', function(e) {
            if (Gallery._editing) return;
            if (pinching) { pinching = false; return; }
            if (e.changedTouches.length === 1) {
                var dx = e.changedTouches[0].clientX - startX;
                if (Math.abs(dx) > 60 && Gallery._zoom <= 1.1) Gallery._go(dx > 0 ? -1 : 1);
            }
        }, {passive: true});
        body.addEventListener('wheel', function(e) {
            if (Gallery._editing) return;
            e.preventDefault();
            Gallery._zoom = Math.max(0.5, Math.min(8, Gallery._zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
            Gallery._applyZoom();
        }, {passive: false});
        var lastTap = 0;
        body.addEventListener('click', function() {
            if (Gallery._editing) return;
            var now = Date.now();
            if (now - lastTap < 300) { Gallery._zoom = Gallery._zoom > 1.5 ? 1 : 3; Gallery._applyZoom(); }
            lastTap = now;
        });
    },

    _touchDist: function(e) {
        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;
        return Math.sqrt(dx*dx + dy*dy);
    },

    _applyZoom: function() {
        var m = document.getElementById('gal-media');
        if (m) m.style.transform = 'scale('+Gallery._zoom+')';
    },

    // ── Editor ──
    _startEditor: function() {
        var f = Gallery._files[Gallery._idx];
        if (f.file_type !== 'image') return;
        Gallery._editing = true;
        Gallery._history = [];
        Gallery._measureState = 'idle';
        Gallery._measureP1 = null;
        Gallery._measureP2 = null;
        Gallery._tool = 'measure';   // default: avval O'lchov, keyin qalamcha

        var body = document.getElementById('gal-body');
        var img = document.getElementById('gal-img');
        if (!img || !body) return;

        var w = img.naturalWidth || 1920;
        var h = img.naturalHeight || 1080;
        var maxW = body.clientWidth;
        var maxH = body.clientHeight - 84;   // pastdagi toolbar uchun joy
        var scale = Math.min(maxW / w, maxH / h, 1);
        var cw = Math.round(w * scale);
        var ch = Math.round(h * scale);
        Gallery._editorScale = scale;

        body.innerHTML = '';
        // Editor davomida canvas tepaga tekislanadi (pastdagi toolbar ustiga chiqmasin).
        // _render() keyingi safar gal-body'ni qaytadan yaratadi — tozalash shart emas.
        body.style.alignItems = 'flex-start';
        body.style.paddingTop = '10px';

        var bleConnected = typeof BLE !== 'undefined' && BLE._connected;

        // Toolbar — pastda full-width, guruhlangan (o'lchov birinchi, faol)
        var tb = document.createElement('div');
        tb.id = 'ed-toolbar';
        tb.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:5;background:rgba(15,15,20,.94);backdrop-filter:blur(14px);border-top:1px solid rgba(255,255,255,.08);padding:9px 0 calc(9px + env(safe-area-inset-bottom));display:flex;justify-content:center;align-items:center';
        var divd = '<span class="ed-div"></span>';

        var inner = '<div id="ed-tb-inner" style="display:flex;align-items:center;gap:6px;padding:0 12px;width:100%;max-width:660px;justify-content:center;overflow-x:auto">';
        // Asboblar — O'lchov BIRINCHI va FAOL, keyin Chizish, Matn
        inner += '<button class="ed-tool active" data-t="measure" style="'+Gallery._tbtn('active')+'"><i class="fas fa-ruler"></i><span>O\'lchov</span></button>';
        inner += '<button class="ed-tool" data-t="pen" style="'+Gallery._tbtn()+'"><i class="fas fa-pen"></i><span>Chizish</span></button>';
        inner += '<button class="ed-tool" data-t="text" style="'+Gallery._tbtn()+'"><i class="fas fa-font"></i><span>Matn</span></button>';
        inner += divd;
        // Rang + qalinlik
        inner += '<input type="color" id="ed-color" value="'+Gallery._color+'" title="Rang" style="width:44px;height:46px;border:2px solid rgba(255,255,255,.15);border-radius:12px;cursor:pointer;padding:0;background:transparent;flex-shrink:0">';
        inner += '<select id="ed-size" title="Qalinlik" style="height:46px;padding:0 8px;border-radius:12px;font-size:13px;font-weight:700;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.12);flex-shrink:0;cursor:pointer"><option value="2">S</option><option value="3" selected>M</option><option value="5">L</option><option value="8">XL</option></select>';
        inner += divd;
        // Qaytarish + BLE
        inner += '<button id="ed-undo" style="'+Gallery._tbtn()+'"><i class="fas fa-undo"></i><span>Qaytarish</span></button>';
        if (bleConnected) inner += '<button id="ed-ble" style="'+Gallery._tbtn('ble')+'"><i class="fas fa-satellite-dish"></i><span>BLE</span></button>';
        inner += divd;
        // Saqlash + Bekor
        inner += '<button id="ed-save" style="'+Gallery._tbtn('save')+'"><i class="fas fa-check"></i><span>Saqlash</span></button>';
        inner += '<button id="ed-cancel" style="'+Gallery._tbtn('cancel')+'"><i class="fas fa-times"></i><span>Bekor</span></button>';
        inner += '</div>';
        tb.innerHTML = inner;

        // Canvas
        var cvs = document.createElement('canvas');
        cvs.id = 'ed-canvas';
        cvs.width = cw;
        cvs.height = ch;
        cvs.style.cssText = 'cursor:crosshair;border-radius:4px;touch-action:none';
        Gallery._canvas = cvs;
        Gallery._ctx = cvs.getContext('2d');

        // ── QATLAMLI MODEL (2026-08-18) ──────────────────────────────────
        // Ilgari HAMMASI (rasm + chizma + o'lchov) bitta rasterga chizilardi,
        // shuning uchun bitta o'lchovni tahrirlash/o'chirish IMKONSIZ edi va
        // yorliqlar rasmni bosib ketardi.
        // Endi:
        //   `_baseCv`   — rasm + qalam + matn (o'lchovsiz), ko'rinmas canvas
        //   `_measures` — o'lchovlar RO'YXATI, har biri alohida obyekt
        //   `_redraw()` — baza ustiga o'lchovlarni qaytadan chizadi
        // Shu tufayli ro'yxatdan o'chirish/tahrirlash/ajratib ko'rsatish mumkin.
        var bcv = document.createElement('canvas');
        bcv.width = cw; bcv.height = ch;
        Gallery._baseCv = bcv;
        Gallery._bctx = bcv.getContext('2d');
        Gallery._measures = [];
        Gallery._actions = [];          // 'b' = baza qadami, 'm' = o'lchov
        Gallery._mSeq = 0;
        Gallery._activeMeasure = null;

        var bgImg = new Image();
        bgImg.crossOrigin = 'anonymous';
        bgImg.onload = function() {
            Gallery._bgImg = bgImg;
            Gallery._bctx.drawImage(bgImg, 0, 0, cw, ch);
            Gallery._redraw();
            Gallery._saveState();
            Gallery._renderMeasureList();
        };
        bgImg.src = f.file_url;

        // Measure hint label — default O'lchov, shu sabab darhol ko'rinadi
        var hint = document.createElement('div');
        hint.id = 'ed-measure-hint';
        hint.style.cssText = 'display:block;position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:6;background:rgba(0,0,0,.78);color:#fff;font-size:12px;font-weight:600;padding:7px 16px;border-radius:20px;pointer-events:none;backdrop-filter:blur(4px);border:1px solid rgba(220,252,98,.35)';
        hint.textContent = '📏 O\'lchash uchun birinchi nuqtani bosing';

        // Measure input popup
        var mDiv = document.createElement('div');
        mDiv.id = 'ed-measure-input';
        mDiv.style.cssText = 'display:none;position:absolute;z-index:7;background:rgba(0,0,0,.9);border-radius:12px;padding:12px;flex-direction:column;gap:6px;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.15);min-width:180px';
        var bleBtn = bleConnected ? '<button id="ed-mm-ble" style="padding:8px;border:none;border-radius:8px;background:#1a73e8;color:#fff;cursor:pointer;font-size:12px;width:100%;font-weight:600"><i class="fas fa-satellite-dish" style="margin-right:4px"></i>Lazerdan o\'qish</button>' : '';
        mDiv.innerHTML =
            '<div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:2px">O\'lchovni kiriting</div>' +
            '<div style="display:flex;gap:6px"><input id="ed-mm-val" type="number" inputmode="numeric" placeholder="mm" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;font-size:15px;font-weight:600;-webkit-appearance:none"><button id="ed-mm-ok" style="padding:8px 16px;border:none;border-radius:8px;background:#059669;color:#fff;cursor:pointer;font-size:13px;font-weight:600">OK</button></div>' +
            // IZOH (2026-08-18): o'lcham nimaniki ekani yozib qo'yiladi —
            // «2204 mm» o'rniga «Eshik · 2204 mm» bo'lib chiqadi.
            // Ixtiyoriy: bo'sh qoldirilsa faqat raqam chiziladi.
            '<input id="ed-mm-note" type="text" maxlength="24" placeholder="Izoh (Eshik, Deraza...)" ' +
            'style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.2);' +
            'background:rgba(255,255,255,.1);color:#fff;font-size:13px">' +
            '<div id="ed-mm-quick" style="display:flex;gap:5px;flex-wrap:wrap"></div>' +
            bleBtn +
            '<button id="ed-mm-cancel" style="padding:6px;border:none;border-radius:8px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.5);cursor:pointer;font-size:11px;width:100%">Bekor qilish</button>';

        Gallery._labelBoxes = [];      // yangi tahrir — yorliq ro'yxati toza

        // ── O'LCHOVLAR RO'YXATI paneli (2026-08-18) ───────────────────────
        // Kompyuterda rasm yonida (o'ngda), telefonda rasm OSTIDA — ekran
        // tor bo'lgani uchun yon panel rasmni juda kichraytirib yuborardi.
        var mlist = document.createElement('div');
        mlist.id = 'ed-mlist';
        var _mob = window.innerWidth < 900;
        mlist.style.cssText = _mob
            ? ('position:absolute;left:8px;right:8px;bottom:calc(74px + env(safe-area-inset-bottom));'
               + 'z-index:6;background:rgba(15,15,20,.94);backdrop-filter:blur(14px);'
               + 'border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:8px')
            : ('position:absolute;right:10px;top:10px;bottom:86px;width:240px;z-index:6;'
               + 'background:rgba(15,15,20,.92);backdrop-filter:blur(14px);'
               + 'border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:10px;'
               + 'display:flex;flex-direction:column');

        body.appendChild(cvs);
        body.appendChild(mlist);
        body.appendChild(tb);
        body.appendChild(hint);
        body.appendChild(mDiv);

        Gallery._bindEditor(cvs, tb, body);
    },

    _tbtn: function(kind) {
        var base = 'width:52px;height:46px;flex-shrink:0;border-radius:12px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;transition:all .15s;-webkit-tap-highlight-color:transparent;';
        var map = {
            active: 'background:#DCF262;color:#0D0C10;border:none;',
            save:   'background:rgba(5,150,105,.32);color:#34d399;border:1px solid rgba(5,150,105,.5);',
            cancel: 'background:rgba(220,38,38,.22);color:#f87171;border:1px solid rgba(220,38,38,.42);',
            ble:    'background:rgba(26,115,232,.3);color:#60a5fa;border:1px solid rgba(26,115,232,.5);'
        };
        return base + (map[kind] || 'background:rgba(255,255,255,.07);color:#fff;border:1px solid rgba(255,255,255,.1);');
    },

    _bindEditor: function(cvs, tb, body) {
        // Tool selection
        tb.querySelectorAll('.ed-tool').forEach(function(btn) {
            btn.onclick = function() {
                tb.querySelectorAll('.ed-tool').forEach(function(b) { b.style.background = 'rgba(255,255,255,.07)'; b.style.color = '#fff'; b.style.border = '1px solid rgba(255,255,255,.1)'; b.classList.remove('active'); });
                btn.style.background = '#DCF262';
                btn.style.color = '#0D0C10';
                btn.style.border = 'none';
                btn.classList.add('active');
                Gallery._tool = btn.dataset.t;
                Gallery._measureState = 'idle';
                Gallery._measureP1 = null;
                Gallery._measureP2 = null;
                var hint = document.getElementById('ed-measure-hint');
                if (btn.dataset.t === 'measure') {
                    cvs.style.cursor = 'crosshair';
                    if (hint) { hint.style.display = 'block'; hint.textContent = '📏 O\'lchash uchun birinchi nuqtani bosing'; }
                } else {
                    cvs.style.cursor = btn.dataset.t === 'text' ? 'text' : 'crosshair';
                    if (hint) hint.style.display = 'none';
                }
                var mInput = document.getElementById('ed-measure-input');
                if (mInput) mInput.style.display = 'none';
            };
        });

        document.getElementById('ed-color').oninput = function(e) { Gallery._color = e.target.value; };
        document.getElementById('ed-size').onchange = function(e) { Gallery._lineWidth = parseInt(e.target.value); };
        document.getElementById('ed-undo').onclick = function() { Gallery._undo(); };
        document.getElementById('ed-save').onclick = function() { Gallery._saveImage(); };
        document.getElementById('ed-cancel').onclick = function() { Gallery._exitEditor(); };

        var bleBtn = document.getElementById('ed-ble');
        if (bleBtn) bleBtn.onclick = function() { Gallery._showBLEPanel(); };

        // Drawing / measure
        var lastX, lastY;

        function getPos(e) {
            var r = cvs.getBoundingClientRect();
            // touchend da e.touches BO'SH — changedTouches da ko'tarilgan barmoq turadi
            var t = (e.touches && e.touches.length) ? e.touches[0]
                  : (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0]
                  : (typeof e.clientX === 'number') ? e
                  : null;
            if (!t) return null;
            return { x: t.clientX - r.left, y: t.clientY - r.top };
        }

        function onDown(e) {
            var p = getPos(e);
            if (!p) return;

            if (Gallery._tool === 'measure') {
                if (Gallery._measureState === 'idle') {
                    // 1-nuqta belgilash
                    Gallery._measureP1 = p;
                    Gallery._measureState = 'p1_set';
                    Gallery._redraw();
                    Gallery._drawPoint(p, 6);
                    var hint = document.getElementById('ed-measure-hint');
                    if (hint) { hint.style.display = 'block'; hint.textContent = 'Ikkinchi nuqtani bosing yoki suring'; }
                } else if (Gallery._measureState === 'p1_set') {
                    // 2-nuqta boshlandi — dragging
                    Gallery._measureP2 = p;
                    Gallery._measureState = 'dragging';
                    Gallery._drawMeasurePreview();
                }
                return;
            }
            if (Gallery._tool === 'text') {
                Gallery._addText(p.x, p.y);
                return;
            }
            // Pen — KO'RINADIGAN va BAZA qatlamiga bir vaqtda (baza o'lchovsiz
            // saqlanishi kerak, aks holda o'lchovni o'chirib bo'lmaydi)
            Gallery._drawing = true;
            lastX = p.x; lastY = p.y;
            [Gallery._ctx, Gallery._bctx].forEach(function (c) {
                if (!c) return;
                c.beginPath();
                c.strokeStyle = Gallery._color;
                c.lineWidth = Gallery._lineWidth;
                c.lineCap = 'round';
                c.lineJoin = 'round';
                c.moveTo(lastX, lastY);
            });
        }

        function onMove(e) {
            var p = getPos(e);
            if (!p) return;

            if (Gallery._tool === 'measure' && Gallery._measureState === 'dragging') {
                e.preventDefault();
                Gallery._measureP2 = p;
                Gallery._drawMeasurePreview();
                return;
            }
            if (!Gallery._drawing) return;
            e.preventDefault();
            [Gallery._ctx, Gallery._bctx].forEach(function (c) {
                if (!c) return;
                c.lineTo(p.x, p.y);
                c.stroke();
            });
            lastX = p.x; lastY = p.y;
        }

        function onUp(e) {
            if (Gallery._tool === 'measure' && Gallery._measureState === 'dragging') {
                // Release pozitsiyasi aniq bo'lsa yangilaymiz; aks holda oxirgi
                // onMove dagi P2 qoladi (sakrab ketmasligi uchun)
                var p = getPos(e);
                if (p) Gallery._measureP2 = p;
                Gallery._drawMeasurePreview();
                Gallery._measureState = 'input';
                Gallery._showMeasureInput(body);
                return;
            }
            if (Gallery._drawing) {
                Gallery._drawing = false;
                Gallery._saveState();
                Gallery._actions.push('b');
            }
        }

        cvs.addEventListener('mousedown', onDown);
        cvs.addEventListener('mousemove', onMove);
        cvs.addEventListener('mouseup', onUp);
        cvs.addEventListener('mouseleave', function() { if (Gallery._drawing) { Gallery._drawing = false; Gallery._saveState(); Gallery._actions.push('b'); } });
        cvs.addEventListener('touchstart', function(e) { e.preventDefault(); onDown(e); }, {passive: false});
        cvs.addEventListener('touchmove', function(e) { onMove(e); }, {passive: false});
        cvs.addEventListener('touchend', function(e) { onUp(e); });
    },

    // ── Measure tool ──

    _drawPoint: function(p, r) {
        var ctx = Gallery._ctx;
        // Outer ring
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.fill();
        // Inner dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = Gallery._color;
        ctx.fill();
        // Crosshair
        ctx.strokeStyle = 'rgba(255,255,255,.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - r - 6, p.y); ctx.lineTo(p.x - r, p.y);
        ctx.moveTo(p.x + r, p.y); ctx.lineTo(p.x + r + 6, p.y);
        ctx.moveTo(p.x, p.y - r - 6); ctx.lineTo(p.x, p.y - r);
        ctx.moveTo(p.x, p.y + r); ctx.lineTo(p.x, p.y + r + 6);
        ctx.stroke();
    },

    _drawMeasurePreview: function() {
        // Avval barcha tayyor o'lchovlar qayta chiziladi, so'ng ustiga
        // vaqtinchalik (nuqtali) chiziq — eski «rasterga yozib borish»
        // usulida oldingi holatni tiklash kerak edi, endi shart emas.
        Gallery._redraw();
        // Restore to state before measure started
        if (Gallery._history.length > 0) {
            var prev = Gallery._history[Gallery._history.length - 1];
            var img = new Image();
            var p1 = Gallery._measureP1;
            var p2 = Gallery._measureP2;
            img.onload = function() {
                Gallery._ctx.clearRect(0, 0, Gallery._canvas.width, Gallery._canvas.height);
                Gallery._ctx.drawImage(img, 0, 0);
                // Draw P1
                Gallery._drawPoint(p1, 6);
                // Draw P2
                Gallery._drawPoint(p2, 6);
                // Dashed line
                var ctx = Gallery._ctx;
                ctx.beginPath();
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = Gallery._color;
                ctx.lineWidth = 2;
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                ctx.setLineDash([]);
                // Pixel distance label
                var dx = p2.x - p1.x;
                var dy = p2.y - p1.y;
                var px = Math.round(Math.sqrt(dx*dx + dy*dy));
                var midX = (p1.x + p2.x) / 2;
                var midY = (p1.y + p2.y) / 2;
                ctx.font = 'bold 13px Inter, sans-serif';
                var txt = px + ' px';
                var tw = ctx.measureText(txt).width;
                ctx.fillStyle = 'rgba(0,0,0,.6)';
                ctx.fillRect(midX - tw/2 - 4, midY - 20, tw + 8, 22);
                ctx.fillStyle = 'rgba(255,255,255,.8)';
                ctx.fillText(txt, midX - tw/2, midY - 4);
            };
            img.src = prev;
        }
    },

    _showMeasureInput: function(container) {
        var p1 = Gallery._measureP1;
        var p2 = Gallery._measureP2;
        if (!p1 || !p2) return;

        var hint = document.getElementById('ed-measure-hint');
        if (hint) hint.style.display = 'none';

        var mDiv = document.getElementById('ed-measure-input');

        // Ekran MARKAZIDA, yuqoriroqda — mobil klaviatura ostida qolmasligi
        // va tugmalar qulay bosilishi uchun (nuqta yonida emas)
        mDiv.style.display = 'flex';
        mDiv.style.position = 'fixed';
        mDiv.style.left = '50%';
        mDiv.style.top = '28%';
        mDiv.style.transform = 'translate(-50%, -50%)';
        mDiv.style.zIndex = '10000';

        var valInput = document.getElementById('ed-mm-val');
        var noteInput = document.getElementById('ed-mm-note');
        valInput.value = '';
        if (noteInput) noteInput.value = '';
        setTimeout(function() { valInput.focus(); }, 50);

        // Tez-tanlov: eng ko'p ishlatiladigan nomlar (yozib o'tirmaslik uchun)
        var qz = document.getElementById('ed-mm-quick');
        if (qz) {
            qz.innerHTML = ['Eni', 'Bo\'yi', 'Balandlik', 'Eshik', 'Deraza', 'Devor']
              .map(function (t) {
                return '<button type="button" class="ed-mm-q" data-t="' + t + '" '
                  + 'style="padding:4px 9px;border:1px solid rgba(255,255,255,.2);border-radius:999px;'
                  + 'background:rgba(255,255,255,.06);color:#fff;font-size:11px;cursor:pointer">' + t + '</button>';
              }).join('');
            qz.querySelectorAll('.ed-mm-q').forEach(function (b) {
                b.onclick = function () { if (noteInput) { noteInput.value = b.dataset.t; valInput.focus(); } };
            });
        }

        document.getElementById('ed-mm-ok').onclick = function() {
            var val = valInput.value.trim();
            var note = (noteInput && noteInput.value.trim()) || '';
            if (val) {
                // Rasterga chizmaymiz — RO'YXATGA qo'shamiz va qayta chizamiz
                Gallery._measures.push({
                    id: ++Gallery._mSeq, p1: p1, p2: p2,
                    mm: val, note: note, color: Gallery._color
                });
                Gallery._actions.push('m');
                Gallery._redraw();
                Gallery._renderMeasureList();
            }
            mDiv.style.display = 'none';
            Gallery._measureState = 'idle';
            Gallery._measureP1 = null;
            Gallery._measureP2 = null;
            var h2 = document.getElementById('ed-measure-hint');
            if (h2) { h2.style.display = 'block'; h2.textContent = 'Birinchi nuqtani bosing'; }
        };

        document.getElementById('ed-mm-cancel').onclick = function() {
            Gallery._redraw();
            mDiv.style.display = 'none';
            Gallery._measureState = 'idle';
            Gallery._measureP1 = null;
            Gallery._measureP2 = null;
            var h2 = document.getElementById('ed-measure-hint');
            if (h2) { h2.style.display = 'block'; h2.textContent = 'Birinchi nuqtani bosing'; }
        };

        var bleBtn = document.getElementById('ed-mm-ble');
        if (bleBtn) {
            bleBtn.onclick = function() { Gallery._bleMeasureToInput(valInput); };
        }
    },

    _restoreLastState: function(cb) {
        if (Gallery._history.length < 1) { if (cb) cb(); return; }
        var prev = Gallery._history[Gallery._history.length - 1];
        var img = new Image();
        img.onload = function() {
            Gallery._ctx.clearRect(0, 0, Gallery._canvas.width, Gallery._canvas.height);
            Gallery._ctx.drawImage(img, 0, 0);
            if (cb) cb();
        };
        img.src = prev;
    },

    // ── O'LCHOV QATLAMINI QAYTA CHIZISH (2026-08-18) ────────────────────
    // Baza (rasm+chizma) ustiga BARCHA o'lchovlar qaytadan chiziladi.
    // Shu sababli bittasini o'chirish/tahrirlash/ajratib ko'rsatish mumkin.
    _redraw: function () {
        if (!Gallery._ctx || !Gallery._baseCv) return;
        var ctx = Gallery._ctx, W = Gallery._canvas.width, H = Gallery._canvas.height;
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(Gallery._baseCv, 0, 0);
        Gallery._labelBoxes = [];
        (Gallery._measures || []).forEach(function (m, i) {
            Gallery._paintMeasure(m, i + 1);
        });
    },

    // Bitta o'lchov: chiziq + uchlari + «① 1800 mm» yorlig'i.
    // IZOH chizmaga YOZILMAYDI — u yon ro'yxatda turadi (foydalanuvchi qarori
    // 2026-08-18: «raqam va o'lcham»). Uzun izohlar rasmni bosmaydi.
    _paintMeasure: function (m, num) {
        var ctx = Gallery._ctx, p1 = m.p1, p2 = m.p2;
        var dim = (Gallery._activeMeasure != null && Gallery._activeMeasure !== m.id);
        var col = m.color || Gallery._color;
        ctx.save();
        if (dim) ctx.globalAlpha = 0.28;            // tanlanmaganlari xiralashadi
        var hot = (Gallery._activeMeasure === m.id);

        ctx.beginPath();
        ctx.strokeStyle = col;
        ctx.lineWidth = hot ? 4 : 2;
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();

        var angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        var pa = angle + Math.PI / 2, markLen = 10;
        [p1, p2].forEach(function (pt) {
            ctx.beginPath(); ctx.lineWidth = 2;
            ctx.moveTo(pt.x + Math.cos(pa) * markLen, pt.y + Math.sin(pa) * markLen);
            ctx.lineTo(pt.x - Math.cos(pa) * markLen, pt.y - Math.sin(pa) * markLen);
            ctx.stroke();
            ctx.beginPath(); ctx.arc(pt.x, pt.y, hot ? 6 : 4, 0, Math.PI * 2);
            ctx.fillStyle = col; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        });

        // ── Yorliq: «① 1800 mm» ──
        var text = Gallery._numGlyph(num) + ' ' + m.mm + ' mm';
        var midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
        var fs = Math.max(13, Math.round(Gallery._canvas.width / 55));
        ctx.font = 'bold ' + fs + 'px Inter, sans-serif';
        var tw = ctx.measureText(text).width;
        var pad = Math.round(fs * 0.45), rw = tw + pad * 2, rh = Math.round(fs * 1.75), cr = 6;

        if (!Gallery._labelBoxes) Gallery._labelBoxes = [];
        var hit = function (x, y) {
            for (var i = 0; i < Gallery._labelBoxes.length; i++) {
                var bx = Gallery._labelBoxes[i];
                if (x < bx.x + bx.w + 4 && x + rw + 4 > bx.x && y < bx.y + bx.h + 4 && y + rh + 4 > bx.y) return true;
            }
            return false;
        };
        var ox = Math.cos(pa), oy = Math.sin(pa);
        var rx = midX - rw / 2, ry = midY - rh - 4, off = 0, dir = 1, step = rh + 6;
        for (var g = 0; g < 14 && hit(rx, ry); g++) {
            off += step; dir = -dir;
            var dd = off * dir;
            rx = midX - rw / 2 + ox * dd;
            ry = midY - rh - 4 + oy * dd;
        }
        // Rasm chegarasidan chiqib KESILMASIN (har doim, to'qnashuvsiz ham)
        rx = Math.max(4, Math.min(rx, Gallery._canvas.width - rw - 4));
        ry = Math.max(4, Math.min(ry, Gallery._canvas.height - rh - 4));
        Gallery._labelBoxes.push({ x: rx, y: ry, w: rw, h: rh });

        var lcx = rx + rw / 2, lcy = ry + rh / 2;
        if (Math.abs(lcx - midX) > rw / 2 || Math.abs(lcy - midY) > rh) {
            ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.moveTo(midX, midY); ctx.lineTo(lcx, lcy); ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.fillStyle = hot ? col : 'rgba(0,0,0,.82)';
        ctx.beginPath();
        ctx.moveTo(rx + cr, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, cr);
        ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, cr);
        ctx.arcTo(rx, ry + rh, rx, ry, cr);
        ctx.arcTo(rx, ry, rx + rw, ry, cr);
        ctx.fill();
        if (hot) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.fillStyle = hot ? '#000' : '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, rx + pad, ry + rh / 2);
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    },

    // ═══════════════════════════════════════════════════════════════════
    //  📏 O'LCHOVLAR RO'YXATI (2026-08-18, TZ-Olchov-Royxat-Paneli.md)
    //  Chizmada faqat «① 1800 mm» turadi, IZOH shu ro'yxatda.
    //  Kompyuterda — o'ngda yon panel; telefonda — pastda YIG'ILADIGAN ro'yxat
    //  (foydalanuvchi qarori: rasm to'liq kenglikda qolsin).
    // ═══════════════════════════════════════════════════════════════════
    _renderMeasureList: function () {
        var box = document.getElementById('ed-mlist');
        if (!box) return;
        var ms = Gallery._measures || [];
        var mob = window.innerWidth < 900;
        var esc = function (t) { return String(t || '').replace(/</g, '&lt;'); };

        if (!ms.length) {
            box.style.display = mob ? 'block' : 'flex';
            box.innerHTML = '<div style="font-size:11.5px;color:rgba(255,255,255,.45);'
              + 'padding:10px 12px;line-height:1.5">📏 Hali o‘lcham olinmagan.<br>'
              + 'Rasmda ikki nuqtani bosing.</div>';
            return;
        }
        var open = Gallery._mlistOpen !== false;
        var h = '';
        if (mob) {
            h += '<button id="ed-mlist-tgl" style="width:100%;display:flex;align-items:center;'
              + 'justify-content:space-between;gap:8px;padding:10px 12px;border:none;'
              + 'background:rgba(255,255,255,.06);color:#fff;font-size:12.5px;font-weight:700;'
              + 'cursor:pointer;border-radius:10px">'
              + '<span>📏 ' + ms.length + ' ta o‘lcham</span><span>' + (open ? '▾' : '▸') + '</span></button>';
        } else {
            h += '<div style="font-size:12px;font-weight:800;color:#fff;padding:2px 2px 8px">'
              + '📏 O‘lchamlar (' + ms.length + ')</div>';
        }
        if (open || !mob) {
            h += '<div style="display:flex;flex-direction:column;gap:5px;margin-top:' + (mob ? '6px' : '0') + ';'
              + (mob ? 'max-height:34vh;overflow-y:auto' : 'overflow-y:auto;flex:1') + '">';
            ms.forEach(function (m, i) {
                var act = (Gallery._activeMeasure === m.id);
                h += '<div class="ed-mrow" data-id="' + m.id + '" style="display:flex;align-items:center;gap:7px;'
                  + 'padding:7px 9px;border-radius:9px;cursor:pointer;'
                  + 'background:' + (act ? 'rgba(220,252,98,.16)' : 'rgba(255,255,255,.05)') + ';'
                  + 'border:1px solid ' + (act ? 'rgba(220,252,98,.5)' : 'transparent') + '">'
                  + '<span style="font-size:13px;flex:none">' + Gallery._numGlyph(i + 1) + '</span>'
                  + '<div style="flex:1;min-width:0">'
                  + '<div style="font-size:12.5px;font-weight:700;color:#fff;overflow:hidden;'
                  + 'text-overflow:ellipsis;white-space:nowrap">' + (esc(m.note) || '—') + '</div>'
                  + '<div style="font-size:11px;color:rgba(255,255,255,.55)">' + esc(m.mm) + ' mm</div></div>'
                  + '<button class="ed-medit" data-id="' + m.id + '" title="Tahrirlash" style="border:none;'
                  + 'background:transparent;color:rgba(255,255,255,.6);cursor:pointer;font-size:12px;padding:4px">✏️</button>'
                  + '<button class="ed-mdel" data-id="' + m.id + '" title="O‘chirish" style="border:none;'
                  + 'background:transparent;color:#f0705a;cursor:pointer;font-size:12px;padding:4px">🗑</button>'
                  + '</div>';
            });
            h += '</div>';
        }
        box.innerHTML = h;

        var tgl = document.getElementById('ed-mlist-tgl');
        if (tgl) tgl.onclick = function () {
            Gallery._mlistOpen = !(Gallery._mlistOpen !== false);
            Gallery._renderMeasureList();
        };
        // Qatorga bosilsa — chizmada AJRATIB ko'rsatiladi
        box.querySelectorAll('.ed-mrow').forEach(function (r) {
            r.onclick = function (e) {
                if (e.target.closest('.ed-medit') || e.target.closest('.ed-mdel')) return;
                var id = parseInt(r.dataset.id);
                Gallery._activeMeasure = (Gallery._activeMeasure === id) ? null : id;
                Gallery._redraw();
                Gallery._renderMeasureList();
            };
        });
        box.querySelectorAll('.ed-mdel').forEach(function (b) {
            b.onclick = function (e) {
                e.stopPropagation();
                var id = parseInt(b.dataset.id);
                Gallery._measures = Gallery._measures.filter(function (m) { return m.id !== id; });
                if (Gallery._activeMeasure === id) Gallery._activeMeasure = null;
                Gallery._redraw();
                Gallery._renderMeasureList();
            };
        });
        box.querySelectorAll('.ed-medit').forEach(function (b) {
            b.onclick = function (e) {
                e.stopPropagation();
                var id = parseInt(b.dataset.id);
                var m = Gallery._measures.filter(function (x) { return x.id === id; })[0];
                if (!m) return;
                var mm = prompt("O'lcham (mm):", m.mm);
                if (mm === null) return;
                var nt = prompt('Izoh:', m.note || '');
                if (nt === null) nt = m.note;
                m.mm = String(mm).trim() || m.mm;
                m.note = String(nt).trim();
                Gallery._redraw();
                Gallery._renderMeasureList();
            };
        });
    },

    _numGlyph: function (n) {
        var g = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮'];
        return g[n - 1] || ('#' + n);
    },

    _saveState: function() {
        // BAZA qatlami saqlanadi (o'lchovsiz) — qaytarish shu bo'yicha ishlaydi
        if (!Gallery._baseCv) return;
        Gallery._history.push(Gallery._baseCv.toDataURL());
        if (Gallery._history.length > 30) Gallery._history.shift();
    },

    // ── QAYTARISH — oxirgi amal turiga qarab (2026-08-18) ────────────────
    // Amallar ikki xil: 'm' (o'lchov qo'shildi) va 'b' (qalam/matn).
    // Shuning uchun qaysi biri oxirgi bo'lsa, o'shani qaytaramiz.
    _undo: function() {
        var last = (Gallery._actions || []).pop();
        if (last === 'm') {
            Gallery._measures.pop();
            Gallery._redraw();
            Gallery._renderMeasureList();
            return;
        }
        if (Gallery._history.length < 2) { Gallery._redraw(); return; }
        Gallery._history.pop();
        var prev = Gallery._history[Gallery._history.length - 1];
        var img = new Image();
        img.onload = function() {
            // Baza qatlamini tiklaymiz, o'lchovlar ustiga qaytadan chiziladi
            Gallery._bctx.clearRect(0, 0, Gallery._canvas.width, Gallery._canvas.height);
            Gallery._bctx.drawImage(img, 0, 0);
            Gallery._redraw();
        };
        img.src = prev;
    },

    _addText: function(x, y) {
        var text = prompt("Matn kiriting:");
        if (!text) return;
        [Gallery._ctx, Gallery._bctx].forEach(function (ctx) {
            if (!ctx) return;
            ctx.font = 'bold ' + Gallery._fontSize + 'px Inter, sans-serif';
            ctx.fillStyle = Gallery._color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText(text, x, y);
            ctx.fillText(text, x, y);
        });
        Gallery._saveState();
        Gallery._actions.push('b');
    },

    _saveImage: function() {
        if (!Gallery._canvas) return;
        Gallery._canvas.toBlob(function(blob) {
            if (!blob) return;
            var fd = new FormData();
            var cur = Gallery._files[Gallery._idx] || {};
            // ── TAHRIRNI ALMASHTIRISH (2026-08-18) ────────────────────────
            // Ilgari har «Saqlash» YANGI fayl yaratardi — #328 da bitta
            // rasmdan 14 nusxa yig'ilgan. Endi:
            //   • ASL surat tahrir qilinsa → 1 marta yangi «edited_» nusxa
            //   • O'sha nusxa qayta tahrir qilinsa → USTIGA yoziladi
            // Natijada galereyada asl + bitta tahrir turadi, ko'paymaydi.
            var isEdited = /(^|\/)edited_/.test(String(cur.name || cur.file_name || cur.url || ''));
            fd.append('file', blob, isEdited ? (cur.file_name || cur.name || ('edited_' + Date.now() + '.jpg'))
                                             : ('edited_' + Date.now() + '.jpg'));
            var odObj = Gallery._od();
            var d = odObj && odObj._data;
            if (!d) { Toast.error('Order topilmadi'); return; }
            fd.append('order_id', d.id);
            if (isEdited && cur.id) fd.append('replace_id', cur.id);
            // O'lchov chizmalari (2026-09-08) — alohida ma'lumot sifatida ham
            // yuboriladi (rasm o'zi hamon chiziqlar bilan "kuydirilgan" holda
            // saqlanadi, bu esa qayta ochilganda INTERAKTIV chizish uchun).
            if (Gallery._measures && Gallery._measures.length) {
                fd.append('measurements', JSON.stringify(Gallery._measures));
            }
            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/mini/api/file-upload/');
            xhr.onload = function() {
                try {
                    var r = JSON.parse(xhr.responseText);
                    if (r.ok) {
                        var newFile = r.data && r.data.file;
                        var replaced = r.data && r.data.replaced;
                        Toast.success(replaced ? 'Saqlandi (ustiga yozildi)' : 'Saqlandi');
                        if (newFile) {
                            if (replaced) {
                                // Ayni o'rniga qo'yamiz — galereya o'smaydi
                                Gallery._files[Gallery._idx] = newFile;
                            } else {
                                Gallery._files.push(newFile);
                                Gallery._idx = Gallery._files.length - 1;
                            }
                        }
                    }
                } catch(e) {}
                Gallery._editing = false;
                Gallery._canvas = null;
                Gallery._render();
            };
            xhr.onerror = function() { Toast.error('Xatolik'); };
            xhr.send(fd);
        }, 'image/jpeg', 0.92);
    },

    _exitEditor: function() {
        Gallery._editing = false;
        Gallery._canvas = null;
        Gallery._measureState = 'idle';
        Gallery._render();
    },

    // ── BLE ──
    _showBLEPanel: function() {
        if (typeof BLE === 'undefined') { Toast.error('BLE modul yuklanmagan'); return; }
        if (!navigator.bluetooth) { Toast.error('Web Bluetooth qo\'llab-quvvatlanmaydi'); return; }
        BLE.showPanel();
    },

    _bleMeasureToInput: function(input) {
        if (typeof BLE === 'undefined' || !BLE._connected) {
            Toast.error('BLE ulanmagan. Avval qurilmani ulang');
            Gallery._showBLEPanel();
            return;
        }
        var origTarget = BLE._targetInput;
        var origCb = BLE._onMeasure;
        BLE._targetInput = input;
        BLE._onMeasure = function(mm) {
            input.value = mm;
            input.dispatchEvent(new Event('input'));
            BLE._targetInput = origTarget;
            BLE._onMeasure = origCb;
        };
        BLE.measure();
        Toast.info('Lazerdan o\'lchov kutilmoqda...');
    },

    // v1 (OrderDetail) va v2 redesign (RcOrderDetail) — ikkalasi bilan ishlaydi.
    // Buyurtma konteksti: _data (id, files) + fayl ro'yxatini yangilash.
    _od: function() {
        if (window.OrderDetail && OrderDetail._data) return OrderDetail;
        if (window.RcOrderDetail && RcOrderDetail._data) {
            return {
                _data: RcOrderDetail._data,
                _refreshFilesGrid: function() { if (RcOrderDetail.reload) RcOrderDetail.reload(); }
            };
        }
        return null;
    },

    // ── Utils ──
    _esc: function(s) { return typeof Utils !== 'undefined' ? Utils.esc(s) : (s||'').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
    _formatSize: function(b) {
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
        return (b/1048576).toFixed(1) + ' MB';
    }
};
