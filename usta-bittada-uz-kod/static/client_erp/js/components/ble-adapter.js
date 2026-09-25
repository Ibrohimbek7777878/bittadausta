/* client_erp/js/components/ble-adapter.js — BLE Laser Meter adapter for mini ERP */
var BLE = {
    _connected: false,
    _device: null,
    _char: null,
    _driver: null,
    _drivers: [],
    _uuidMap: {},
    _candidates: [],
    _svc: null,
    _pendingCmd: null,
    _targetInput: null,
    _panel: null,
    _offset: 0,
    _offsetEnabled: true,
    _onMeasure: null,
    _lastValue: 0,
    _log: [],

    init: function() {
        BLE._loadDrivers();
        BLE._bridgeInit();
    },

    // ═══════════════════════════════════════════════════════════════════
    //  📡 KO'PRIK — Chrome'dagi lazer sahifasidan kelgan o'lchov (2026-08-17)
    //  Bot (Telegram WebView) ichida Bluetooth YO'Q, shuning uchun lazer
    //  `/mini/<user>/lazer/` sahifasida (Chrome) ulanadi va o'lchovni WS
    //  orqali yuboradi. Bu yerda uni qabul qilib maydonga yozamiz — natijada
    //  usta bot ichida ishlaydi, lazer esa fonda Chrome'da turadi.
    // ═══════════════════════════════════════════════════════════════════
    _bridgeInit: function() {
        if (BLE._bridged || !window.WS || !WS.on) return;
        BLE._bridged = true;
        WS.on('ble.measure', function (msg) {
            var mm = msg && msg.data && parseInt(msg.data.mm);
            if (!mm || mm <= 0) return;
            BLE._lastValue = mm;
            BLE._log.push({ value: mm, ts: new Date().toLocaleTimeString() });
            BLE._dbg('📡 Chrome: ' + mm + ' mm');
            var rv = document.getElementById('ble-result-val');
            if (rv) rv.textContent = mm + ' mm';
            // 1) Kutayotgan callback (📡 tugma bosilgan maydon)
            if (BLE._onMeasure) { var cb = BLE._onMeasure; BLE._onMeasure = null; cb(mm); return; }
            if (BLE._pendingCb) { var pc = BLE._pendingCb; BLE._pendingCb = null; pc(mm); return; }
            // 2) Aks holda — oxirgi bosilgan/fokusdagi o'lcham maydoni
            var t = BLE._targetInput || BLE._lastFocused;
            if (t) {
                t.value = mm;
                t.dispatchEvent(new Event('input', { bubbles: true }));
                t.dispatchEvent(new Event('change', { bubbles: true }));
                if (window.Toast) Toast.success('📡 ' + mm + ' mm yozildi');
            } else if (window.Toast) {
                Toast.info('📡 Lazer: ' + mm + ' mm (maydonni tanlang)');
            }
        });
        // Fokusdagi o'lcham maydonini eslab turamiz
        document.addEventListener('focusin', function (e) {
            var el = e.target;
            if (el && el.tagName === 'INPUT' && el.hasAttribute('data-ble-input')) BLE._lastFocused = el;
        }, true);
    },

    // Bot ichida ochilganmi (Bluetooth yo'q) — panelga ko'prik tugmasi chiqadi
    _noBt: function() { return !navigator.bluetooth; },

    // Lazer sahifasini toza havola bilan ochish (tgWebAppData kesib tashlanadi)
    openBridge: function() {
        var u = (window.STATE && STATE.user && STATE.user.username)
             || (window.__USER_DATA__ && __USER_DATA__.username) || '';
        if (!u) { if (window.Toast) Toast.error('Foydalanuvchi aniqlanmadi'); return; }
        // ── Kalit SERVERDAN olinadi (2026-08-17) ──────────────────────────
        // Tashqi brauzerda sessiya YO'Q — havola kalitsiz bo'lsa login
        // sahifasiga tushib qolardi (foydalanuvchi xabari). Kalit 30 daqiqa
        // yashaydi va faqat o'lchov yuborishga yaraydi.
        // ⚠️ 2026-08-24 (2): `openLink(url)` Android'da Telegram'ning O'Z
        // brauzerini ochardi — unda Web Bluetooth YO'Q («Bu brauzerda
        // Bluetooth yo'q» ekrani). Endi HAQIQIY Chrome majburlanadi:
        //   1) Telegram `try_browser:'chrome'` (Bot API 8.0+)
        //   2) oddiy `window.open`
        // ⚠️ `intent://` BU YERDA ISHLATILMAYDI — Telegram WebView uni
        //    bilmaydi va butun ilova ERR_UNKNOWN_URL_SCHEME bilan yiqiladi.
        var open1 = function (url) {
            var isAndroid = /Android/i.test(navigator.userAgent || '');
            try {
                if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openLink) {
                    try {
                        Telegram.WebApp.openLink(url, { try_browser: 'chrome' });
                    } catch (e2) {
                        Telegram.WebApp.openLink(url);
                    }
                    if (window.Toast) Toast.info('Chrome ochildi — lazerni u yerda ulang');
                    // Eski Telegram `try_browser` ni bilmasa o'z brauzerini
                    // ochadi — u yerdagi sahifa o'zi Chrome'ga o'tkazadi.
                    return;
                }
            } catch (e) {}
            // ⚠️ 2026-08-24 (3): bu yerda `location.href='intent://…'` bor edi —
            // Telegram WebView bu sxemani BILMAYDI va butun ilova
            // `ERR_UNKNOWN_URL_SCHEME` bilan yiqilardi (foydalanuvchi
            // ekrani). Endi ASOSIY sahifa hech qachon intent'ga
            // yuborilmaydi — faqat xavfsiz `window.open`.
            var w2 = null;
            try { w2 = window.open(url, '_blank'); } catch (e) {}
            if (!w2 && window.Toast) {
                Toast.error('Brauzer ochilmadi — havolani nusxalab Chrome\'ga qo\'ying');
                if (window.ErrLog) ErrLog.push('ble', 'window.open bloklandi', {
                    extra: { android: isAndroid, url: String(url).slice(0, 120) }
                });
            }
        };
        // ⚠️ 2026-08-24 TUZATILDI: ilgari WS javob bermasa sahifa KALITSIZ
        // ochilardi va login («qaytadan registratsiya») chiqardi — bu
        // Telegramga bog'liq emas edi, har qanday brauzerda takrorlanardi.
        // Endi kalit UCH yo'l bilan olinadi va KALITSIZ HECH QACHON
        // ochilmaydi: WS → HTTP → aniq xato xabari.
        var httpKey = function () {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', '/mini/' + u + '/lazer-key/');
            xhr.withCredentials = true;
            xhr.timeout = 8000;
            xhr.onload = function () {
                var j = null;
                try { j = JSON.parse(xhr.responseText); } catch (e) {}
                if (j && j.ok && j.url) { open1(j.url); return; }
                if (window.Toast) Toast.error(
                    "Lazer havolasini olib bo'lmadi — sahifani yangilab qayta urining");
                if (window.ErrLog) ErrLog.push('ble', 'lazer-key javobi yaroqsiz',
                                               {req_status: xhr.status});
            };
            xhr.onerror = xhr.ontimeout = function () {
                if (window.Toast) Toast.error('Tarmoq xatosi — lazer havolasi olinmadi');
                if (window.ErrLog) ErrLog.push('ble', 'lazer-key so\'rovi muvaffaqiyatsiz');
            };
            xhr.send();
        };
        if (window.WS && WS.send) {
            var done = false;
            var t = setTimeout(function () { if (!done) { done = true; httpKey(); } }, 3000);
            WS.send('lazer.link', {}, function (msg) {
                if (done) return;
                done = true; clearTimeout(t);
                if (msg && msg.ok && msg.url) open1(msg.url);
                else httpKey();                       // ← kalitsiz OCHILMAYDI
            });
            return;
        }
        httpKey();
    },


    _loadDrivers: function() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/v2/widget-zamer/ble-drivers/');
        xhr.onload = function() {
            try {
                var r = JSON.parse(xhr.responseText);
                var _all = r.results || r || [];
                // ⚠️ Servisi (UUID) yo'q drayver HECH QACHON ulanmaydi —
                // masalan `unknown_device` (0 servis). Staff sifatida kirilsa
                // API faol bo'lmaganlarni ham beradi va ro'yxatda «Device»
                // bo'lib turardi, foydalanuvchi qaysinisini bosishni bilmasdi.
                BLE._drivers = _all.filter(function (d) {
                    return (d.services || []).some(function (sv) { return sv && sv.service_uuid; });
                });
            } catch(e) { BLE._drivers = []; }
            // ── UUID xaritasi (ISHLAYDIGAN `zamer_ble.js` dan) ─────────────
            // Ulanganda qurilmaning servisi bo'yicha drayver TOPILADI —
            // shuning uchun bir nechta qurilma turi ham qo'llanadi.
            BLE._uuidMap = {}; BLE._candidates = [];
            BLE._drivers.forEach(function (drv) {
                (drv.services || []).forEach(function (svc) {
                    if (!svc.service_uuid) return;
                    BLE._uuidMap[svc.service_uuid] = { driver: drv, service: svc };
                    BLE._candidates.push(svc.service_uuid);
                });
            });
        };
        xhr.onerror = function() { BLE._drivers = []; };
        xhr.send();
    },


    // ── DRAYVERNI NORMALLASHTIRISH (2026-08-17) ──────────────────────────
    // ⚠️ Adapter ESKI API shakli uchun yozilgan edi: `drv.service_uuid`,
    // `drv.characteristic_uuid`, `drv.measure_command`, `drv.device_offset`,
    // `drv.use_crc8`, `drv.max_range`, `drv.accuracy` — bu maydonlarning
    // BIRI HAM serverdan kelmaydi. Server esa `services[]`, `commands[]`,
    // `framing{}`, `mm_per_unit`, `offset_mm`, `max_range_m`, `accuracy_mm`
    // yuboradi. Shu sababli UUID topilmay, ulanish har doim yiqilardi va
    // «o'lchash» buyrug'i hech qachon yuborilmasdi. Endi ikkisi moslanadi.
    _norm: function(d) {
        if (!d) return null;
        if (d.__n) return d.__n;                  // bir marta hisoblanadi
        var svc = null, list = d.services || [];
        for (var i = 0; i < list.length; i++) { if (list[i].is_primary) { svc = list[i]; break; } }
        if (!svc && list.length) svc = list[0];
        var cmds = {};
        (d.commands || []).forEach(function (c) { cmds[c.key] = c; });
        var fr = d.framing || {};
        var n = {
            name: d.name || 'Qurilma',
            manufacturer: d.manufacturer || '',
            service_uuid: svc ? (svc.service_uuid || '').toLowerCase() : '',
            characteristic_uuid: svc ? (svc.characteristic_uuid || '').toLowerCase() : '',
            cmds: cmds,
            mode: (fr.mode === undefined || fr.mode === null) ? null : fr.mode,
            crc: fr.crc || null,
            dist_offset: (d.dist_offset === undefined || d.dist_offset === null) ? 2 : d.dist_offset,
            dist_size: d.dist_size || 4,
            dist_endian: d.dist_endian || 'little',
            mm_per_unit: parseFloat(d.mm_per_unit || 1) || 1,
            offset_mm: parseFloat(d.offset_mm || 0) || 0,
            write_with_response: d.write_with_response !== false,
            use_indication: !!d.use_indication,
            max_range_m: d.max_range_m,
            accuracy_mm: d.accuracy_mm,
        };
        try { Object.defineProperty(d, '__n', { value: n, enumerable: false }); } catch (e) { d.__n = n; }
        return n;
    },

    // Framing bo'yicha buyruq ramkasini yasaydi: [mode, cmd, ...payload, crc]
    // ⚠️ 2026-08-17: ramkada `payload.length` bayti YO'Q edi — Bosch GLM
    // buyruqni qabul qilmasdi. Ishlaydigan `widget_zamer/zamer_ble.js`
    // dagi AYNAN shu tartib: [mode, cmd, payload_len, ...payload, crc]
    _frame: function(n, cmd) {
        var pl = cmd.payload_hex ? Array.prototype.slice.call(BLE._hexToBytes(cmd.payload_hex)) : [];
        var out = [];
        if (n.mode !== null) out.push(n.mode & 0xFF);
        out.push(cmd.cmd_byte & 0xFF);
        out.push(pl.length & 0xFF);
        for (var i = 0; i < pl.length; i++) out.push(pl[i] & 0xFF);
        if (n.crc) out.push(BLE._crcCalc(out, n.crc));
        return new Uint8Array(out);
    },

    // Sozlanadigan CRC8 (init/poly/msb_first serverdan keladi).
    // Ilgari poly 0x31 QATTIQ yozilgan edi — Bosch GLM da init 0xAA, poly 0xA6.
    _crcCalc: function(data, cfg) {
        var crc = (cfg.init === undefined || cfg.init === null) ? 0 : (cfg.init & 0xFF);
        var poly = (cfg.poly === undefined || cfg.poly === null) ? 0x31 : (cfg.poly & 0xFF);
        var msb = cfg.msb_first !== false;
        for (var i = 0; i < data.length; i++) {
            crc ^= data[i] & 0xFF;
            for (var b = 0; b < 8; b++) {
                if (msb) crc = (crc & 0x80) ? (((crc << 1) ^ poly) & 0xFF) : ((crc << 1) & 0xFF);
                else crc = (crc & 0x01) ? (((crc >> 1) ^ poly) & 0xFF) : ((crc >> 1) & 0xFF);
            }
        }
        return crc & 0xFF;
    },

    togglePanel: function() {
        // ⚠️ 2026-08-17: bu yerda «muhit tekshiruvi» oynasi bor edi — panelni
        // ochishga QO'YMASDI va havola ko'rsatib boshqa brauzerga yuborardi.
        // Foydalanuvchi talabi: hech qayerga yubormasin, shu yerda ishlasin.
        // Endi panel HAR DOIM ochiladi (ilgari qanday bo'lsa shunday).
        if (BLE._panel) { BLE._closePanel(); return; }
        BLE.showPanel();
    },

    showPanel: function() {
        if (BLE._panel) BLE._panel.remove();

        var p = document.createElement('div');
        p.id = 'ble-panel';
        p.style.cssText = 'position:fixed;top:52px;right:12px;width:320px;max-width:calc(100vw - 24px);background:var(--sfc,#fff);color:var(--txt,#1B1A20);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:9999;font-family:Inter,-apple-system,sans-serif;font-size:13px;overflow:hidden auto;border:2px solid #1a73e8;max-height:calc(100vh - 70px);user-select:none;-webkit-user-select:none';

        var h = '';
        // Header
        h += '<div style="background:linear-gradient(135deg,#1a73e8,#1557b0);color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">';
        h += '<span style="font-weight:700;font-size:14px"><i class="fas fa-satellite-dish" style="margin-right:6px"></i> BLE Lazer O\'lchagich</span>';
        h += '<span id="ble-panel-close" style="cursor:pointer;font-size:18px;opacity:.8;line-height:1">&times;</span>';
        h += '</div>';

        h += '<div style="padding:14px">';

        // ── Qo'llab-quvvatlanadigan qurilma — FAQAT YOZUV (2026-08-17) ────
        // Ilgari bu bosiladigan ro'yxat edi va ikki qator chiqib, usta
        // qaysinisini bosishni bilmasdi. Aslida tanlash SHART EMAS: ulanganda
        // drayver qurilmaning servis UUID si bo'yicha O'ZI aniqlanadi.
        h += '<div style="font-size:11px;color:var(--mut,#6b7280);margin-bottom:10px">';
        if (BLE._drivers.length) {
            var _nm = BLE._drivers.map(function (d) {
                var t = BLE._esc(d.name || 'Qurilma');
                if (d.max_range_m) t += ' · ' + parseFloat(d.max_range_m) + 'm';
                if (d.accuracy_mm) t += ' ±' + parseFloat(d.accuracy_mm) + 'mm';
                return t;
            }).join(', ');
            h += '📏 ' + _nm;
        } else {
            h += 'Drayver yuklanmadi';
        }
        h += '</div>';

        // Status
        var statusColor = BLE._connected ? '#059669' : 'var(--mut,#d1d5db)';
        var statusText = BLE._connected ? ('Ulangan: ' + BLE._esc(BLE._device ? BLE._device.name : 'Qurilma')) : 'Ulanmagan';
        h += '<div style="padding:8px 12px;border-radius:8px;background:var(--sfc2,#f3f4f6);margin-bottom:10px;font-size:12px;display:flex;align-items:center;gap:8px;color:var(--txt,#111)">';
        h += '<span style="width:10px;height:10px;border-radius:50%;background:'+statusColor+';flex-shrink:0"></span>';
        h += '<span>'+statusText+'</span>';
        h += '</div>';

        // Connect / Disconnect button
        if (BLE._connected) {
            h += '<div style="display:flex;gap:6px;margin-bottom:10px">';
            h += '<button id="ble-disconnect-btn" style="flex:1;padding:10px;border:none;border-radius:8px;background:rgba(220,38,38,.14);color:#dc2626;font-weight:600;cursor:pointer;font-size:12px"><i class="fas fa-unlink" style="margin-right:4px"></i>Uzish</button>';
            h += '<button id="ble-measure-btn" style="flex:2;padding:10px;border:none;border-radius:8px;background:#1a73e8;color:#fff;font-weight:600;cursor:pointer;font-size:13px"><i class="fas fa-ruler" style="margin-right:4px"></i>O\'lchash</button>';
            h += '</div>';
        } else {
            h += '<button id="ble-connect-btn" style="width:100%;padding:10px;border:none;border-radius:8px;background:#1a73e8;color:#fff;font-weight:600;cursor:pointer;font-size:13px;margin-bottom:10px"><i class="fas fa-bluetooth-b" style="margin-right:4px"></i>Qurilmani ulash</button>';
        }

        // Offset
        if (BLE._driver && BLE._norm(BLE._driver).offset_mm) {
            h += '<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--sfc2,#f9fafb);border-radius:8px;margin-bottom:10px;cursor:pointer;font-size:12px;color:var(--txt,#111)">';
            h += '<input type="checkbox" id="ble-offset-chk" '+(BLE._offsetEnabled?'checked':'')+' style="width:16px;height:16px;accent-color:#1a73e8">';
            h += '<span>Qurilma uzunligi kompensatsiyasi (<b>'+Math.abs(BLE._norm(BLE._driver).offset_mm)+'</b>mm)</span>';
            h += '</label>';
        }

        // Result area (when connected)
        if (BLE._connected) {
            h += '<div style="text-align:center;padding:10px 0;margin-bottom:6px">';
            h += '<div style="font-size:10px;color:var(--mut,#6b7280);margin-bottom:4px">Oxirgi o\'lchov</div>';
            h += '<div id="ble-result-val" style="font-size:28px;font-weight:800;color:#1a73e8;min-height:38px;user-select:text;-webkit-user-select:text">';
            h += BLE._lastValue > 0 ? (BLE._lastValue + ' mm') : '—';
            h += '<div style="font-size:9.5px;color:var(--mut,#9ca3af);font-family:ui-monospace,monospace;margin-top:6px;word-break:break-all" id="ble-dbg">' + BLE._esc(BLE._dbgLast || '') + '</div>';
        h += '</div>';
            h += '</div>';
        }

        // Log button
        if (BLE._log.length > 0) {
            h += '<button id="ble-log-btn" style="width:100%;padding:6px;border:none;background:var(--sfc2,#f3f4f6);color:var(--mut,#6b7280);cursor:pointer;font-size:11px;border-radius:6px;margin-top:4px"><i class="fas fa-clipboard-list" style="margin-right:4px"></i>Log (' + BLE._log.length + ' ta o\'lchov)</button>';
        }

        h += '</div>';
        p.innerHTML = h;
        document.body.appendChild(p);
        BLE._panel = p;

        // Bind events
        document.getElementById('ble-panel-close').onclick = function() { BLE._closePanel(); };

        // (Drayver tanlash olib tashlandi — ulanganda o'zi aniqlanadi)

        // Connect button
        var cBtn = document.getElementById('ble-connect-btn');
        if (cBtn) cBtn.onclick = function() { BLE.connectSmart(); };

        // Disconnect button
        var dBtn = document.getElementById('ble-disconnect-btn');
        if (dBtn) dBtn.onclick = function() { BLE.disconnect(); BLE._updateTopbar(); BLE.showPanel(); };

        // Measure button
        var mBtn = document.getElementById('ble-measure-btn');
        if (mBtn) mBtn.onclick = function() { BLE.measure(); };

        // Offset checkbox
        var oChk = document.getElementById('ble-offset-chk');
        if (oChk) oChk.onchange = function() {
            BLE._offsetEnabled = oChk.checked;
            if (BLE._offsetEnabled && BLE._driver) {
                BLE._offset = BLE._norm(BLE._driver).offset_mm;
            } else {
                BLE._offset = 0;
            }
        };

        // Log button
        var lBtn = document.getElementById('ble-log-btn');
        if (lBtn) lBtn.onclick = function() { BLE.downloadLog(); };

        // Click outside to close
        setTimeout(function() {
            BLE._outsideHandler = function(e) {
                if (BLE._panel && !BLE._panel.contains(e.target) && !e.target.closest('#ble-topbar-btn') && !e.target.closest('#ble-sidebar-btn')) {
                    BLE._closePanel();
                }
            };
            document.addEventListener('click', BLE._outsideHandler);
        }, 100);
    },

    _closePanel: function() {
        if (BLE._panel) { BLE._panel.remove(); BLE._panel = null; }
        if (BLE._outsideHandler) { document.removeEventListener('click', BLE._outsideHandler); BLE._outsideHandler = null; }
    },

    _updateTopbar: function() {
        var dot = document.getElementById('ble-topbar-dot');
        var text = document.getElementById('ble-topbar-text');
        var btn = document.getElementById('ble-topbar-btn');
        var measureBtn = document.getElementById('ble-topbar-measure');
        if (dot) dot.style.background = BLE._connected ? '#059669' : '#6b7280';
        if (text) text.textContent = BLE._connected ? (BLE._device ? BLE._device.name : 'Ulangan') : 'BLE';
        if (btn) btn.style.borderColor = BLE._connected ? '#059669' : 'rgba(255,255,255,.15)';
        if (measureBtn) measureBtn.style.display = BLE._connected ? 'flex' : 'none';
        // Desktop sidebar nusxasi (topbar desktopda yashirin)
        var sDot = document.getElementById('ble-sidebar-dot');
        var sText = document.getElementById('ble-sidebar-text');
        var sMeasure = document.getElementById('ble-sidebar-measure');
        if (sDot) sDot.style.background = BLE._connected ? '#059669' : '#6b7280';
        if (sText) sText.textContent = BLE._connected ? (BLE._device ? BLE._device.name : 'Ulangan') : 'BLE lazer';
        if (sMeasure) sMeasure.style.display = BLE._connected ? 'flex' : 'none';

    },

    // ── YAGONA «Qurilmani ulash» tugmasi (2026-08-17) ────────────────────
    // Ilgari ikkita tugma bor edi (ulash + lazer sahifasini ochish) va usta
    // qaysinisini bosishni bilmasdi. Endi bitta:
    //   • Bluetooth BOR (Chrome)  → to'g'ridan-to'g'ri ulanadi
    //   • Bluetooth YO'Q (bot)    → Chrome'da lazer sahifasini ochadi;
    //     u yerda ulanadi, foydalanuvchi qaytadi, o'lchov WS orqali
    //     shu oynaga o'zi tushib turadi.
    connectSmart: function() {
        if (navigator.bluetooth) { BLE.connect(); return; }
        BLE.openBridge();
    },

    connect: function() {
        if (!navigator.bluetooth) {
            Toast.error("Web Bluetooth qo'llab-quvvatlanmaydi. Chrome yoki Edge brauzer kerak.");
            if (window.ErrLog) ErrLog.push('ble', 'navigator.bluetooth yo\'q');
            return;
        }
        // ── Drayver hali yuklanmagan bo'lsa — KUTAMIZ, xato bermaymiz ──
        // (sahifa endi ochilganda ro'yxat hali kelmagan bo'lishi mumkin)
        if (!BLE._candidates.length) {
            Toast.info('Drayver yuklanmoqda…');
            BLE._loadDrivers();
            setTimeout(function () {
                if (BLE._candidates.length) { BLE.connect(); return; }
                Toast.error('BLE drayveri yuklanmadi — sahifani yangilang');
                if (window.ErrLog) ErrLog.push('ble', 'drayver ro\'yxati bo\'sh');
            }, 1500);
            return;
        }
        // Bluetooth O'CHIQ bo'lsa oldindan aytamiz (Chrome qo'llasa)
        try {
            if (navigator.bluetooth.getAvailability) {
                navigator.bluetooth.getAvailability().then(function (ok) {
                    if (!ok) {
                        Toast.error('Telefonda Bluetooth o\'chiq — yoqing');
                        if (window.ErrLog) ErrLog.push('ble', 'adapter mavjud emas (getAvailability=false)');
                    }
                });
            }
        } catch (e) {}
        Toast.info('Qurilma qidirilmoqda...');
        BLE._dbg('scan: ' + BLE._candidates.length + ' servis');

        navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: BLE._candidates
        }).then(function (device) {
            BLE._device = device;
            device.addEventListener('gattserverdisconnected', function () {
                BLE._connected = false; BLE._char = null;
                BLE._updateTopbar(); Toast.error('BLE uzildi');
            });
            return device.gatt.connect();
        }).then(function (server) {
            // Qurilmada MAVJUD servisni topamiz va shu bo'yicha drayverni
            // aniqlaymiz (ilgari drayver "birinchisi" deb olinardi).
            var found = null;
            var checks = BLE._candidates.map(function (uuid) {
                return server.getPrimaryService(uuid).then(function (svc) {
                    if (!found && BLE._uuidMap[uuid]) {
                        found = { gattService: svc, driver: BLE._uuidMap[uuid].driver,
                                  service: BLE._uuidMap[uuid].service };
                    }
                }).catch(function () {});
            });
            return Promise.all(checks).then(function () { return found; });
        }).then(function (res) {
            if (!res) throw new Error('Mos drayver topilmadi — qurilma qo\'llab-quvvatlanmaydi');
            BLE._driver = res.driver;
            BLE._svc = res.service;
            BLE._dbg('drayver: ' + res.driver.name + ' / ' + res.service.label);
            return res.gattService.getCharacteristic(res.service.characteristic_uuid);
        }).then(function (char) {
            BLE._char = char;
            BLE._connected = true;
            char.addEventListener('characteristicvaluechanged', function (e) { BLE._onValue(e.target.value); });
            return BLE._norm(BLE._driver).use_indication ? char.startNotifications() : Promise.resolve();
        }).then(function () {
            Toast.success('BLE ulandi: ' + ((BLE._device && BLE._device.name) || ''));
            BLE._updateTopbar();
            BLE.showPanel();
        }).catch(function (err) {
            // Foydalanuvchi oynani yopdi — xato emas
            if (err && err.name === 'NotFoundError') return;
            var m = (err && err.message) || String(err);
            var nice = m;
            if (/User cancelled|cancell?ed/i.test(m)) return;
            if (/GATT|connect/i.test(m)) nice = 'Qurilmaga ulanib bo\'lmadi — o\'chirib-yoqing va qayta uring';
            else if (/permission|Security/i.test(m)) nice = 'Brauzer ruxsat bermadi — sahifa HTTPS ekanini tekshiring';
            else if (/not supported|unsupported/i.test(m)) nice = 'Bu brauzer Bluetooth\'ni qo\'llamaydi';
            Toast.error('Lazer: ' + nice);
            BLE._dbg('xato: ' + m);
            if (window.ErrLog) ErrLog.push('ble', m, {
                stack: (err && err.stack) || '',
                extra: { name: (err && err.name) || '', step: 'connect' }
            });
        });
    },

    disconnect: function() {
        if (BLE._device && BLE._device.gatt.connected) {
            BLE._device.gatt.disconnect();
        }
        BLE._connected = false;
        BLE._char = null;
    },

    measure: function() {
        if (!BLE._connected || !BLE._char) { Toast.error('BLE ulanmagan'); return; }
        var n = BLE._norm(BLE._driver);
        var cmd = n && n.cmds ? n.cmds.measure : null;
        if (!cmd) { Toast.info("Qurilmadagi o'lchash tugmasini bosing"); return; }
        var frame = BLE._frame(n, cmd);
        BLE._pendingCmd = cmd;
        BLE._dbg('→ ' + BLE._hex(frame));
        var p = n.write_with_response && BLE._char.writeValueWithResponse
            ? BLE._char.writeValueWithResponse(frame)
            : BLE._char.writeValue(frame);
        p.catch(function(e) { Toast.error("O'lchash xatolik: " + (e.message || e)); });
    },

    // Buyruq/javob baytlarini panelda ko'rsatish — natija noto'g'ri chiqsa
    // aynan nima kelganini aytish uchun (sozlashda kerak).
    _hex: function(u8) {
        var s = [];
        for (var i = 0; i < u8.length; i++) s.push(('0' + u8[i].toString(16)).slice(-2));
        return s.join(' ').toUpperCase();
    },
    _dbg: function(t) {
        BLE._dbgLast = t;
        var el = document.getElementById('ble-dbg');
        if (el) el.textContent = t;
    },

    // ── readOnce(cb) — BITTA o'lchov olib, callback'ga beradi (2026-08-15) ──
    // Zamer redaktori (`zamer_editor.html`) va boshqa sahifalar SHU nomni
    // chaqirardi, lekin funksiya YO'Q edi — shuning uchun kod `togglePanel`ga
    // tushib, panel ochilardi-yu maydonga hech narsa yozilmasdi. Aynan
    // «o'lchov o'zi yozilmayapti» shikoyatining sababi shu.
    //
    // Ulanmagan bo'lsa — avval panelni ochadi (ulanganidan keyin qayta bosiladi).
    readOnce: function(cb, opts) {
        opts = opts || {};
        if (!navigator.bluetooth) {
            if (window.Toast) Toast.error("Bluetooth yo'q — Chrome/Edge brauzer kerak");
            return false;
        }
        if (!BLE._connected) {
            if (window.Toast) Toast.info('Avval lazerni ulang');
            BLE.showPanel();
            BLE._pendingCb = cb || null;          // ulangach shu callback ishlaydi
            return false;
        }
        var origTarget = BLE._targetInput, origCb = BLE._onMeasure;
        var done = false;
        var finish = function (mm) {
            if (done) return;
            done = true;
            BLE._targetInput = origTarget;
            BLE._onMeasure = origCb;
            if (cb) cb(mm);
        };
        BLE._targetInput = null;                  // callback o'zi yozadi
        BLE._onMeasure = finish;
        BLE.measure();
        if (window.Toast && !opts.silent) Toast.info("Lazerdan o'lchov kutilmoqda...");
        // 30 soniyada javob bo'lmasa — eski holatni tiklaymiz (osilib qolmasin)
        setTimeout(function () {
            if (done) return;
            done = true;
            BLE._targetInput = origTarget;
            BLE._onMeasure = origCb;
        }, 30000);
        return true;
    },

    // ── attachInputs(root) — 📡 tugmalarini maydonlarga ulaydi ─────────────
    // `data-ble-input` bo'lgan HAR maydon yoniga kichik 📡 tugma qo'yiladi;
    // bosilsa lazer o'lchaydi va AYNAN o'sha maydonga yozadi.
    attachInputs: function(root) {
        root = root || document;
        var list = root.querySelectorAll('input[data-ble-input]:not([data-ble-done])');
        [].forEach.call(list, function (inp) {
            inp.setAttribute('data-ble-done', '1');
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'ble-inline-btn';
            b.title = "Lazer bilan o'lchash";
            b.innerHTML = '📡';
            b.style.cssText = 'position:absolute;right:6px;top:50%;transform:translateY(-50%);'
                + 'border:none;background:transparent;cursor:pointer;font-size:15px;line-height:1;'
                + 'padding:2px 4px;opacity:.75';
            var wrap = inp.parentNode;
            if (wrap && getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
            inp.style.paddingRight = '32px';
            b.onclick = function (e) {
                e.preventDefault(); e.stopPropagation();
                BLE.readOnce(function (mm) {
                    inp.value = Math.round(mm);
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                    inp.style.transition = 'background .3s';
                    var old = inp.style.background;
                    inp.style.background = 'rgba(26,115,232,.18)';
                    setTimeout(function () { inp.style.background = old; }, 600);
                });
            };
            if (wrap) wrap.appendChild(b);
        });
    },

    _onValue: function(dataView) {
        var n = BLE._norm(BLE._driver);
        var bytes = new Uint8Array(dataView.buffer);
        BLE._dbg('← ' + BLE._hex(bytes));
        var mm = 0;

        // ── Masofani DRAYVER SOZLAMASI bo'yicha o'qiymiz (2026-08-17) ──────
        // Ilgari baytlar QATTIQ yozilgan edi (`bytes[1]|bytes[2]<<8|...`) va
        // `mm_per_unit` umuman qo'llanmasdi — Bosch GLM da bitta birlik
        // 0.05 mm, ya'ni natija 20 barobar katta chiqardi.
        if (n && bytes.length >= (n.dist_offset + n.dist_size)) {
            var raw = 0;
            if (n.dist_endian === 'big') {
                for (var i = 0; i < n.dist_size; i++) raw = (raw * 256) + bytes[n.dist_offset + i];
            } else {
                for (var j = n.dist_size - 1; j >= 0; j--) raw = (raw * 256) + bytes[n.dist_offset + j];
            }
            mm = raw * n.mm_per_unit;
            if (raw === 0) {                     // qurilma masofani o'lchay olmadi
                if (window.Toast) Toast.info("Nishonga yo'naltiring");
                return;
            }
        }
        // Zaxira yo'l — qurilma MATN (ASCII raqam) yuborsa
        if (!mm) {
            for (var k = 0; k < bytes.length; k++) {
                if (bytes[k] >= 0x30 && bytes[k] <= 0x39) {
                    var str = '';
                    for (var m2 = k; m2 < bytes.length; m2++) {
                        if ((bytes[m2] >= 0x30 && bytes[m2] <= 0x39) || bytes[m2] === 0x2E) str += String.fromCharCode(bytes[m2]);
                        else break;
                    }
                    mm = parseFloat(str) || 0;
                    break;
                }
            }
        }
        // Offset (qurilma siljishi) — KO'PAYTIRISHDAN KEYIN qo'shiladi
        if (BLE._offsetEnabled) {
            var _n2 = BLE._norm(BLE._driver);
            if (_n2 && _n2.offset_mm) mm += _n2.offset_mm;
        }
        mm = Math.round(mm);

        if (mm > 0) {
            BLE._lastValue = mm;
            BLE._log.push({value: mm, ts: new Date().toLocaleTimeString()});

            // Update panel result
            var rv = document.getElementById('ble-result-val');
            if (rv) {
                rv.textContent = mm + ' mm';
                rv.style.transform = 'scale(1.1)';
                setTimeout(function() { rv.style.transform = 'scale(1)'; }, 200);
            }

            // Update topbar measure button with last value
            var mBtn = document.getElementById('ble-topbar-measure');
            if (mBtn) {
                mBtn.querySelector('span').textContent = mm + ' mm';
                mBtn.style.background = 'linear-gradient(135deg,#1a73e8,#1557b0)';
                setTimeout(function() { mBtn.style.background = 'linear-gradient(135deg,#059669,#047857)'; }, 1500);
            }

            // Set target input if any
            if (BLE._targetInput) {
                BLE._targetInput.value = mm;
                BLE._targetInput.dispatchEvent(new Event('input'));
                BLE._targetInput.dispatchEvent(new Event('change'));
            }

            // Callback
            if (BLE._onMeasure) BLE._onMeasure(mm);
            // Ulanmagan paytda bosilgan «o'lchash» — ulangach shu yerda bajariladi
            if (BLE._pendingCb) { var _p = BLE._pendingCb; BLE._pendingCb = null; _p(mm); }
        }
    },

    downloadLog: function() {
        if (!BLE._log.length) { Toast.info('Log bo\'sh'); return; }
        var text = 'Vaqt\tQiymat (mm)\n';
        BLE._log.forEach(function(l) { text += l.ts + '\t' + l.value + '\n'; });
        var blob = new Blob([text], {type: 'text/plain'});
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ble-log.txt';
        a.click();
        URL.revokeObjectURL(a.href);
    },

    _hexToBytes: function(hex) {
        hex = hex.replace(/\s/g, '');
        var bytes = new Uint8Array(hex.length / 2);
        for (var i = 0; i < hex.length; i += 2) bytes[i/2] = parseInt(hex.substr(i, 2), 16);
        return bytes;
    },

    _crc8: function(data) {
        var crc = 0;
        for (var i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (var j = 0; j < 8; j++) {
                if (crc & 0x80) crc = (crc << 1) ^ 0x31;
                else crc = crc << 1;
                crc &= 0xFF;
            }
        }
        return crc;
    },

    _esc: function(s) { return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
};

document.addEventListener('DOMContentLoaded', function() { BLE.init(); });
