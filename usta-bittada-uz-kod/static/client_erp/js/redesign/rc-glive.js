/* client_erp/js/redesign/rc-glive.js — Birlashtirilgan AI yordamchi FAB.

   window.RcGLive — ✨ AI ovozli yordamchi FAB (yagona tugma, 2026-07-13).
   Ilgari 2 ta suzuvchi tugma bor edi: sariq mikrofon (Gemini Live ovozli) va
   qora robot (Laylo chat). Foydalanuvchi so'roviga ko'ra faqat ovozli yordamchi
   qoldirildi — bitta ✨ FAB (gradient): bosilsa DARHOL jonli ovozli rejim
   (Gemini Live real-time: gapiradi -> tool-call -> RcActions amalni bajaradi).
   Eski `#laylo-fab` v2'da CSS bilan yashirinadi (laylo-popup.js'ga TEGILMAYDI;
   v1 shell'da Laylo FAB o'z holicha qoladi).

   ARXITEKTURA: SERVER-SIDE PROXY (v9 dan).
     Brauzer Gemini'ga TO'G'RIDAN-TO'G'RI ulanmaydi. Sabab:
     gemini-3.1-flash-live-preview brauzer-direct (ephemeral+constrained) yo'lida
     `1011 internal error` beradi (Google constrained endpoint 3.1 bilan nomos).
     Shuning uchun bizning WS orqali: brauzer -> /ws/mini/<user>/glive/ (Django
     Channels GeminiLiveConsumer) -> Gemini Live (SDK, server header-auth, 3.1
     mukammal ishlaydi). API kaliti brauzerga umuman chiqmaydi.

   Oqim:
     1) FAB bosiladi -> proxy WS ochiladi -> {type:'start', page, tools}.
     2) server {type:'ready'} -> mikrofon: getUserMedia -> AudioContext 16kHz +
        AudioWorklet (ScriptProcessor fallback) -> PCM16 mono 16kHz -> base64 ->
        {type:'audio', data}.
     3) server {type:'audio', data} (PCM 24kHz) -> navbat + AudioContext(24k) ijro
        (barge-in). {type:'tool_call', id, name, args} -> RcActions.run ->
        {type:'tool_response', id, name, result}. {type:'interrupted'} -> to'xtat.
     4) server {type:'error'|'ended'} -> yumshoq degradatsiya/yakun.

   Barcha brauzer API try/catch — qo'llab-quvvatlanmasa Toast bilan yumshoq
   degradatsiya (hech qachon CRASH emas). GEMINI_TOOLS (rc-actions.js) proxy'ga
   uzatiladi; yo'q bo'lsa xavfsiz ishlaydi. */
(function () {
  'use strict';

  var IN_RATE = 16000;    // mikrofon -> Gemini
  var OUT_RATE = 24000;   // Gemini -> ijro
  var CHUNK_SEC = 0.12;   // ~120ms audio bo'lagi
  var VAD_RMS = 0.02;     // barge-in ovoz chegarasi

  /* ── holat ── */
  var uiState = 'idle';   // idle | connecting | listening | speaking
  var fab = null;
  var running = false;    // sessiya faol (yoki ulanmoqda)
  var setupDone = false;  // server 'ready' berdimi (mikrofon oqmoqda)
  var manualStop = false; // faqat foydalanuvchi bosib o'chirса true (o'z-o'zidan emas)
  var reconnectTries = 0, reconnectTimer = null;
  var MAX_RECONNECT = 5;  // o'zi uzilса shuncha marta qayta ulanadi

  /* audio kirish */
  var micStream = null;
  var micPromise = null;   // getUserMedia — TAP paytida (user-gesture) boshlanadi
  var inCtx = null, srcNode = null, workletNode = null, procNode = null, muteSink = null;
  var rawParts = [], rawLen = 0;

  /* audio chiqish (ijro navbati) */
  var outCtx = null, playHead = 0, playSources = [];

  /* proxy WSS */
  var sock = null;

  /* matn yozish (2026-07-15) — uzoq bosilganda chiqadigan panelda */
  var pendingText = null;   // sessiya hali tayyor bo'lmasa, 'ready' bo'lgach yuboriladi
  var transcript = [];      // {role:'user'|'model', text} — panelda ko'rsatish uchun

  /* ═══════════════ moslashtirish: drag + ikonka + rang (localStorage'da saqlanadi) ═══════════════ */
  var GRADS = [
    'linear-gradient(135deg,#DCF262 0%,#8B5CF6 100%)',  // 0 laym→binafsha (default)
    'linear-gradient(135deg,#A6E6F2 0%,#4F8CFF 100%)',  // 1 moviy→ko'k
    'linear-gradient(135deg,#FF9A9E 0%,#FF6A88 100%)',  // 2 pushti→qizil
    'linear-gradient(135deg,#8EE063 0%,#22B8A6 100%)',  // 3 yashil→teal
    'linear-gradient(135deg,#8B5CF6 0%,#EC4899 100%)',  // 4 binafsha→pushti
    'linear-gradient(135deg,#F6D365 0%,#FDA085 100%)',  // 5 oltin→marjon
  ];
  var ICONS = ['✨', '🎙️', '🤖', '🎧', '💬', '🔮', '⚡', '🌟', '🪄', '🧠'];
  var PREFS = { icon: '✨', grad: 0, left: null, top: null };
  var editMode = false;
  var press = { t: 0, x: 0, y: 0, offX: 0, offY: 0, lp: null, moved: false, dragging: false };

  function loadPrefs() {
    try {
      var s = JSON.parse(localStorage.getItem('rc_glive_prefs') || '{}');
      if (s && typeof s === 'object') {
        if (typeof s.icon === 'string') PREFS.icon = s.icon;
        if (typeof s.grad === 'number') PREFS.grad = s.grad;
        if (typeof s.left === 'number') PREFS.left = s.left;
        if (typeof s.top === 'number') PREFS.top = s.top;
      }
    } catch (e) {}
  }
  function savePrefs() {
    try { localStorage.setItem('rc_glive_prefs', JSON.stringify(PREFS)); } catch (e) {}
  }
  function clampPos(l, t) {
    var s = 56, m = 6;
    return {
      left: Math.max(m, Math.min(l, window.innerWidth - s - m)),
      top: Math.max(m, Math.min(t, window.innerHeight - s - m)),
    };
  }
  function applyPrefs() {
    if (!fab) return;
    fab.style.setProperty('--glive-grad', GRADS[PREFS.grad] || GRADS[0]);
    if (PREFS.left != null && PREFS.top != null) {
      var p = clampPos(PREFS.left, PREFS.top);
      fab.style.left = p.left + 'px'; fab.style.top = p.top + 'px';
      fab.style.right = 'auto'; fab.style.bottom = 'auto';
    }
    var icEl = fab.querySelector('.glive-ic');
    if (icEl && uiState === 'idle') icEl.textContent = PREFS.icon;
  }
  function haptic() { try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) {} }

  /* ── uzoq bosish → tahrir rejim (drag + panel) ── */
  function onDown(e) {
    if (!fab) return;
    press.x = e.clientX; press.y = e.clientY; press.moved = false; press.t = Date.now();
    var r = fab.getBoundingClientRect();
    press.offX = e.clientX - r.left; press.offY = e.clientY - r.top;
    try { if (e.pointerId != null) fab.setPointerCapture(e.pointerId); } catch (_) {}
    if (editMode) {
      press.dragging = true; fab.classList.add('glive-drag');
    } else {
      press.lp = setTimeout(function () {
        enterEdit(); press.dragging = true; fab.classList.add('glive-drag'); haptic();
      }, 1000);  // uzoq bosish → ko'chirish/sozlash (1 soniya; short chegarasi bilan mos)
    }
  }
  function onMove(e) {
    if (!press.t) return;
    var dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) press.moved = true;
    if (press.dragging) {
      if (e.cancelable) e.preventDefault();
      var c = clampPos(e.clientX - press.offX, e.clientY - press.offY);
      fab.style.left = c.left + 'px'; fab.style.top = c.top + 'px';
      fab.style.right = 'auto'; fab.style.bottom = 'auto';
      positionPanel();
    } else if (press.moved && !editMode) {
      clearTimeout(press.lp);   // ko'chirishдан oldin harakat → uzoq-bosish bekor
    }
  }
  function onUp() {
    clearTimeout(press.lp);
    var short = (Date.now() - press.t) < 1000;  // <1s → ovoz; >=1s → ko'chirish (o'lik zona yo'q)
    if (press.dragging) {
      press.dragging = false; fab.classList.remove('glive-drag');
      var r = fab.getBoundingClientRect();
      PREFS.left = Math.round(r.left); PREFS.top = Math.round(r.top);
      savePrefs();
    } else if (!editMode && short && !press.moved) {
      toggle();   // qisqa bosish → MATNLI CHAT (2026-08-05)
    }
    press.t = 0;
  }

  function enterEdit() {
    editMode = true;
    if (fab) fab.classList.add('glive-edit');
    buildPanel();
  }
  function exitEdit() {
    editMode = false;
    if (fab) fab.classList.remove('glive-edit', 'glive-drag');
    var p = document.getElementById('rc-glive-panel'); if (p) p.remove();
    savePrefs();
  }
  function buildPanel() {
    var old = document.getElementById('rc-glive-panel'); if (old) old.remove();
    var p = document.createElement('div'); p.id = 'rc-glive-panel'; p.className = 'rc-glive-panel';
    var html = '<div class="rc-glive-hint">✋ Sudrab ko\'chiring</div>';
    html += '<div id="rc-glive-transcript" style="max-height:130px;overflow-y:auto;margin-bottom:8px"></div>';
    html += '<div style="display:flex;gap:6px;margin-bottom:10px">' +
      '<input type="text" id="rc-glive-text-input" class="rc-input" placeholder="Yozing..." style="flex:1;font-size:12px;padding:8px 10px">' +
      '<button type="button" id="rc-glive-text-send" style="flex:none;width:36px;border:none;border-radius:10px;background:var(--acc);color:var(--acc-ink);cursor:pointer"><i class="fas fa-paper-plane"></i></button>' +
      '</div>';
    html += '<h5>Ikonka</h5><div class="rc-glive-icons">';
    ICONS.forEach(function (ic) {
      html += '<button type="button" data-ic="' + ic + '"' + (ic === PREFS.icon ? ' class="on"' : '') + '>' + ic + '</button>';
    });
    html += '</div><h5>Rang</h5><div class="rc-glive-colors">';
    GRADS.forEach(function (g, i) {
      html += '<button type="button" data-g="' + i + '" style="background:' + g + '"' + (i === PREFS.grad ? ' class="on"' : '') + '></button>';
    });
    html += '</div><button type="button" class="rc-glive-done">Tayyor</button>';
    p.innerHTML = html;
    document.body.appendChild(p);
    p.querySelectorAll('.rc-glive-icons button').forEach(function (b) {
      b.onclick = function () {
        PREFS.icon = b.getAttribute('data-ic'); applyPrefs(); savePrefs();
        p.querySelectorAll('.rc-glive-icons button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      };
    });
    p.querySelectorAll('.rc-glive-colors button').forEach(function (b) {
      b.onclick = function () {
        PREFS.grad = parseInt(b.getAttribute('data-g'), 10) || 0; applyPrefs(); savePrefs();
        p.querySelectorAll('.rc-glive-colors button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      };
    });
    var done = p.querySelector('.rc-glive-done'); if (done) done.onclick = exitEdit;

    var input = p.querySelector('#rc-glive-text-input');
    var sendBtn = p.querySelector('#rc-glive-text-send');
    function doSend() {
      if (!input) return;
      var v = input.value; input.value = '';
      sendText(v);
    }
    if (sendBtn) sendBtn.onclick = doSend;
    if (input) input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); doSend(); } };
    renderTranscript();

    positionPanel();
  }
  function positionPanel() {
    var p = document.getElementById('rc-glive-panel'); if (!p || !fab) return;
    var r = fab.getBoundingClientRect(), pw = 260, ph = p.offsetHeight || 210, m = 8;
    var left = Math.max(m, Math.min(r.left + r.width / 2 - pw / 2, window.innerWidth - pw - m));
    var top = r.top - ph - 10;
    if (top < m) top = r.bottom + 10;
    p.style.left = left + 'px'; p.style.top = top + 'px';
  }
  function onDocDown(e) {
    if (!editMode || !fab) return;
    if (fab.contains(e.target)) return;
    var p = document.getElementById('rc-glive-panel');
    if (p && p.contains(e.target)) return;
    exitEdit();
  }

  /* ═══════════════ util ═══════════════ */
  function toast(kind, msg) {
    try { if (window.Toast && Toast[kind]) Toast[kind](msg); } catch (e) {}
  }

  function sockSend(obj) {
    try {
      if (sock && sock.readyState === 1) sock.send(JSON.stringify(obj));
    } catch (e) {}
  }

  /* Matn yozib yuborish — sessiya hali ochilmagan bo'lsa avval ochadi, keyin yuboradi. */
  function sendText(text) {
    text = (text || '').trim();
    if (!text) return;
    if (!running) {
      pendingText = text;
      start();
    } else if (setupDone) {
      sockSend({ type: 'text', text: text });
    } else {
      pendingText = text;
    }
  }

  function addTranscript(role, text) {
    if (!text) return;
    transcript.push({ role: role, text: text });
    if (transcript.length > 40) transcript.shift();
    renderTranscript();
  }

  function renderTranscript() {
    var box = document.getElementById('rc-glive-transcript');
    if (!box) return;
    var esc = (window.Utils && Utils.esc) ? Utils.esc : function (s) { return String(s == null ? '' : s); };
    box.innerHTML = transcript.map(function (m) {
      var isUser = m.role === 'user';
      return '<div style="display:flex;justify-content:' + (isUser ? 'flex-end' : 'flex-start') + ';margin-bottom:6px">' +
        '<div style="max-width:85%;padding:6px 10px;border-radius:12px;font-size:12px;background:' +
        (isUser ? 'var(--acc)' : 'var(--sfc2)') + ';color:' + (isUser ? 'var(--acc-ink)' : 'var(--txt)') + '">' +
        esc(m.text) + '</div></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function proxyUrl() {
    var proto = (location.protocol === 'https:') ? 'wss:' : 'ws:';
    var user = (window.__USER_DATA__ && __USER_DATA__.username) || '';
    return proto + '//' + location.host + '/ws/mini/' + encodeURIComponent(user) + '/glive/';
  }

  /* ═══════════════ FAB / vizual holat ═══════════════ */
  function injectStyle() {
    if (document.getElementById('rc-glive-style')) return;
    var css =
      /* ── MATNLI CHAT (2026-08-05). Dark+Light: rang o'zgaruvchilardan
         olinadi, shuning uchun ikkala mavzuda ham to'g'ri ko'rinadi. ── */
      '#rc-ai-chat{position:fixed;right:12px;left:12px;bottom:12px;z-index:9998;' +
      'max-width:440px;margin-left:auto;height:min(72vh,560px);display:flex;flex-direction:column;' +
      'background:var(--sfc,#1E1D24);border:1px solid var(--brd,rgba(255,255,255,.12));' +
      'border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.35);overflow:hidden}' +
      '.rc-aic-head{display:flex;align-items:center;gap:8px;padding:11px 14px;' +
      'border-bottom:1px solid var(--line,rgba(255,255,255,.1));background:var(--sfc2,#29282F)}' +
      '.rc-aic-title{flex:1;font-weight:800;font-size:14px;color:var(--txt,#F5F4F7)}' +
      '.rc-aic-head button{background:none;border:none;cursor:pointer;color:var(--mut,#9B9AA3);' +
      'font-size:16px;line-height:1;padding:6px 8px;border-radius:9px}' +
      '.rc-aic-head button:hover{background:var(--brd,rgba(255,255,255,.1));color:var(--txt,#fff)}' +
      '#rc-aic-mic{color:var(--acc-text,#DCF262)!important;font-size:15px}' +
      '.rc-aic-body{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:9px}' +
      '.rc-aic-msg{max-width:88%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.55;' +
      'white-space:normal;word-break:break-word}' +
      '.rc-aic-msg.ai{align-self:flex-start;background:var(--sfc2,#29282F);color:var(--txt,#F5F4F7);' +
      'border-bottom-left-radius:5px}' +
      '.rc-aic-msg.me{align-self:flex-end;background:var(--acc,#DCF262);color:var(--acc-ink,#1B1A20);' +
      'font-weight:600;border-bottom-right-radius:5px}' +
      '.rc-aic-wait{opacity:.6;font-style:italic}' +
      // ── amal-tasdiq karta (2026-09-11) — AI amal taklif qilganda ──
      '.rc-aic-confirm{margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.14);' +
      'display:flex;flex-wrap:wrap;align-items:center;gap:7px}' +
      '.rc-aic-confirm-lbl{font-size:11.5px;font-weight:700;opacity:.85;width:100%}' +
      '.rc-aic-confirm button{border:none;border-radius:9px;padding:6px 12px;font-size:12px;' +
      'font-weight:700;cursor:pointer;font-family:inherit}' +
      '.rc-aic-yes{background:var(--acc,#DCF262);color:var(--acc-ink,#1B1A20)}' +
      '.rc-aic-no{background:rgba(255,255,255,.1);color:var(--txt,#F5F4F7)}' +
      '.rc-aic-meta{align-self:flex-start;font-size:10.5px;color:var(--mut);line-height:1.5;margin:-4px 0 2px 4px;max-width:88%}' +
      '.rc-aic-foot{display:flex;gap:7px;padding:10px 12px;' +
      'border-top:1px solid var(--line,rgba(255,255,255,.1));background:var(--sfc2,#29282F)}' +
      '#rc-aic-inp{flex:1;background:var(--sfc,#1E1D24);border:1px solid var(--brd,rgba(255,255,255,.12));' +
      'border-radius:12px;padding:10px 12px;font-size:13.5px;color:var(--txt,#F5F4F7);outline:none;' +
      'font-family:inherit}' +
      '#rc-aic-inp:focus{border-color:var(--acc,#DCF262)}' +
      '#rc-aic-send{flex:none;width:42px;border:none;border-radius:12px;cursor:pointer;' +
      'background:var(--acc,#DCF262);color:var(--acc-ink,#1B1A20);font-size:14px}' +
      '@media(max-width:520px){#rc-ai-chat{height:min(78vh,620px)}}' +
      // Asosiy FAB — gradient CSS o'zgaruvchida (--glive-grad, moslashuvchi), jonli oqadi.
      '.rc-glive-fab{position:fixed;right:16px;bottom:calc(150px + env(safe-area-inset-bottom,0px));' +
      /* z-index — tanishtiruv tur oynasidan (rc-tour.js, Z=100000) ham yuqori,
         aks holda tur ochiq turganda tugma bosilmay qoladi (2026-09-11 tuzatildi). */
      'z-index:100001;width:56px;height:56px;border-radius:50%;' +
      'background:var(--glive-grad,linear-gradient(135deg,#DCF262 0%,#8B5CF6 100%));background-size:180% 180%;' +
      'color:#fff;border:none;cursor:pointer;padding:0;line-height:1;font-size:23px;touch-action:none;' +
      'display:flex;align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(0,0,0,.35);' +
      '-webkit-tap-highlight-color:transparent;transition:transform .15s ease,box-shadow .2s ease;' +
      'animation:rc-glive-flow 7s ease infinite;}' +
      '.rc-glive-fab:active{transform:scale(.92);}' +
      '.rc-glive-fab .glive-ic{position:relative;z-index:1;pointer-events:none;}' +
      '.rc-glive-fab .glive-ring{position:absolute;inset:0;border-radius:50%;pointer-events:none;box-sizing:border-box;}' +
      // holatlar — fon oqishi tezligi + halqa animatsiyasi
      '.rc-glive-fab.glive-idle{animation:rc-glive-flow 7s ease infinite,rc-glive-bob 3s ease-in-out infinite;}' +
      '.rc-glive-fab.glive-connecting{opacity:.9;animation:rc-glive-flow 3s ease infinite;}' +
      '.rc-glive-fab.glive-connecting .glive-ring{border:3px solid rgba(255,255,255,.35);' +
      'border-top-color:#fff;animation:rc-glive-spin .8s linear infinite;}' +
      '.rc-glive-fab.glive-listening{animation:rc-glive-flow 3.5s ease infinite;}' +
      '.rc-glive-fab.glive-listening .glive-ring{animation:rc-glive-pulse 1.5s ease-out infinite;}' +
      '.rc-glive-fab.glive-speaking{filter:brightness(1.14) saturate(1.15);animation:rc-glive-flow 2.2s ease infinite;}' +
      '.rc-glive-fab.glive-speaking .glive-ring{animation:rc-glive-pulse2 .9s ease-out infinite;}' +
      // tahrir (ko\'chirish) rejimi
      '.rc-glive-fab.glive-edit{box-shadow:0 0 0 3px #fff,0 12px 28px rgba(0,0,0,.45);animation:rc-glive-flow 5s ease infinite,rc-glive-wiggle .55s ease-in-out infinite;cursor:grab;}' +
      '.rc-glive-fab.glive-drag{cursor:grabbing;transform:scale(1.08);animation:none;}' +
      '@keyframes rc-glive-flow{0%{background-position:0% 50%;}50%{background-position:100% 50%;}100%{background-position:0% 50%;}}' +
      '@keyframes rc-glive-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.5);}100%{box-shadow:0 0 0 20px rgba(255,255,255,0);}}' +
      '@keyframes rc-glive-pulse2{0%{box-shadow:0 0 0 0 rgba(255,255,255,.6);}100%{box-shadow:0 0 0 22px rgba(255,255,255,0);}}' +
      '@keyframes rc-glive-spin{to{transform:rotate(360deg);}}' +
      '@keyframes rc-glive-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}' +
      '@keyframes rc-glive-wiggle{0%,100%{transform:rotate(-4deg) scale(1.05);}50%{transform:rotate(4deg) scale(1.05);}}' +
      // ── moslashtirish paneli (ikonka + rang) ──
      '.rc-glive-panel{position:fixed;z-index:78;width:260px;background:var(--card,#26252B);' +
      'border:1px solid var(--line,rgba(255,255,255,.14));border-radius:16px;padding:12px;' +
      'box-shadow:0 16px 44px rgba(0,0,0,.55);color:var(--txt,#fff);font-size:12px;animation:rc-fadein .18s ease;}' +
      '.rc-glive-panel h5{margin:8px 0 6px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut,#9b9aa3);}' +
      '.rc-glive-hint{text-align:center;color:var(--mut,#9b9aa3);font-size:11px;margin-bottom:6px;}' +
      '.rc-glive-icons{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;}' +
      '.rc-glive-icons button{border:1.5px solid transparent;background:rgba(255,255,255,.06);border-radius:10px;' +
      'font-size:18px;padding:6px 0;cursor:pointer;line-height:1;color:#fff;}' +
      '.rc-glive-icons button.on{border-color:var(--acc,#DCF262);background:rgba(220,242,98,.14);}' +
      '.rc-glive-colors{display:flex;gap:8px;flex-wrap:wrap;}' +
      '.rc-glive-colors button{width:30px;height:30px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;}' +
      '.rc-glive-colors button.on{border-color:#fff;}' +
      '.rc-glive-done{width:100%;margin-top:12px;background:var(--acc,#DCF262);color:#1B1A20;border:none;' +
      'border-radius:10px;padding:9px;font-weight:800;cursor:pointer;font-size:13px;}' +
      '@keyframes rc-fadein{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}' +
      // ── eski Laylo robot FAB v2'da yashirin (faqat bitta ✨ ovozli yordamchi qoladi) ──
      '#laylo-fab{display:none!important;}';
    var st = document.createElement('style');
    st.id = 'rc-glive-style';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function setState(s) {
    uiState = s;
    if (!fab) return;
    // tahrir rejimida holat klassini almashtirmaymiz (wiggle saqlanadi)
    if (!editMode) fab.className = 'rc-glive-fab glive-' + s;
    var ic = { idle: (PREFS.icon || '✨'), connecting: '⏳', listening: '🎙️', speaking: '🔊' }[s] || (PREFS.icon || '✨');
    var ttl = {
      idle: 'AI yordamchi — ovozli boshqaruv', connecting: 'Ulanmoqda…',
      listening: 'Tinglayapti', speaking: 'Gapiryapti'
    }[s] || 'AI yordamchi';
    var icEl = fab.querySelector('.glive-ic');
    if (icEl) icEl.textContent = ic;
    fab.title = ttl;
    fab.setAttribute('aria-label', ttl);
  }

  /* ═══════════════ init ═══════════════ */
  function init() {
    if (fab) return;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    try { injectStyle(); } catch (e) {}
    try { loadPrefs(); } catch (e) {}
    fab = document.createElement('button');
    fab.id = 'rc-glive-fab';
    fab.type = 'button';
    fab.className = 'rc-glive-fab glive-idle';
    fab.innerHTML = '<span class="glive-ring"></span><span class="glive-ic">' + (PREFS.icon || '✨') + '</span>';
    fab.title = 'AI yordamchi — bosing (chat) · uzoq bosing (ko\'chirish/sozlash)';
    // Pointer: qisqa bosish = MATNLI CHAT; uzoq bosish = tahrir (drag + panel).
    // Ovozli rejim — chat ichidagi 🎤 tugmasidan (2026-08-05).
    fab.addEventListener('pointerdown', onDown);
    fab.addEventListener('pointermove', onMove);
    fab.addEventListener('pointerup', onUp);
    fab.addEventListener('pointercancel', onUp);
    fab.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); });
    document.body.appendChild(fab);
    try { applyPrefs(); } catch (e) {}
    document.addEventListener('pointerdown', onDocDown, true);   // tashqariga bosilsa tahrirdan chiqish
    window.addEventListener('resize', function () {
      if (PREFS.left != null && PREFS.top != null) { try { applyPrefs(); } catch (e) {} }
      if (editMode) positionPanel();
    });
    window.addEventListener('beforeunload', function () { try { cleanup(); } catch (e) {} });
  }

  // ── 2026-08-05: qisqa bosish endi MATNLI CHAT ochadi ──────────────────
  // Foydalanuvchi qarori (TZ-AI-Tushuntiruvchi-Tashxischi.md §6.4):
  // «✨ ustiga bosganda text chat ochilsin va mikrofon ikonkasi tursin,
  //  uni bosganda ovozli chat ochilsin».
  // FAB'ning o'zi (joyi, ikonkasi, rangi, drag/edit rejimi) TEGILMAGAN.
  function toggle() {
    if (running) { stop(); return; }           // ovoz ketayotgan bo'lsa — to'xtat
    openChat();
  }

  // Ovozli rejim — endi chat ichidagi 🎤 tugmasidan chaqiriladi
  function startVoice() {
    chargedNotified = false;   // yangi suhbat — xabar qaytadan berilishi mumkin
    if (running) { stop(); return; }
    if (micStream) { start(); return; }        // ruxsat allaqachon olingan
    ensureMicPermission();
  }

  /* ═══════════════ MATNLI CHAT (2026-08-05) ═══════════════
     Gemini Live ISHLATILMAYDI — arzonroq `ai_analysis` zanjiri
     (WS: 'ai.chat'). Raqamlar serverda tool orqali olinadi, AI
     to'qimaydi. */
  var chatEl = null;
  var chatHistory = [];        // [{role:'user'|'ai', text}]
  var chatBusy = false;
  var chargedNotified = false; // «tanga yechildi» sessiyada bir marta

  // ── Sarf ko'rsatkichi (2026-08-05, TZ §2.6) ──
  // Foydalanuvchi HAR safar nima sarflaganini va nima qolganini ko'rsin.
  function fmtUsage(u, withDuration) {
    if (!u) return '';
    var p = [];
    if (withDuration && u.duration_sec != null) {
      var mm = Math.floor(u.duration_sec / 60), ss = u.duration_sec % 60;
      p.push(mm ? (mm + ' daq ' + ss + ' s') : (ss + ' soniya'));
    }
    if (u.tokens) p.push('~' + u.tokens + ' token' + (u.estimated ? ' (taxminiy)' : ''));
    if (u.coins) p.push(u.coins + ' tanga');
    var line1 = p.join(' · ');
    var line2 = 'bugun ' + (u.msgs_today || 0) + '/' + (u.msgs_limit || 0) + ' · qolgan '
      + (u.tokens_left != null ? u.tokens_left : 0) + '/' + (u.tokens_limit || 0) + ' token';
    return line1 + (line1 ? '<br>' : '') + line2;
  }

  function showUsage(u, isVoice) {
    var html = fmtUsage(u, !!isVoice);
    if (!html) return;
    if (isVoice) {
      addTranscript('model', '📊 Suhbat yakuni');
      var box = document.getElementById('rc-glive-transcript');
      if (box) {
        var d = document.createElement('div');
        d.style.cssText = 'font-size:10.5px;color:var(--mut);padding:4px 0;line-height:1.5';
        d.innerHTML = html;
        box.appendChild(d);
        box.scrollTop = box.scrollHeight;
      }
      return;
    }
    // Matnli chat — oxirgi AI xabari ostiga
    var b = document.getElementById('rc-aic-body');
    if (!b) return;
    var msgs = b.querySelectorAll('.rc-aic-msg.ai');
    var last = msgs[msgs.length - 1];
    if (!last) return;
    var meta = document.createElement('div');
    meta.className = 'rc-aic-meta';
    meta.innerHTML = html;
    last.insertAdjacentElement('afterend', meta);
    b.scrollTop = b.scrollHeight;
  }

  function chatEsc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function openChat() {
    if (chatEl) { chatEl.style.display = 'flex'; chatFocus(); return; }
    chatEl = document.createElement('div');
    chatEl.id = 'rc-ai-chat';
    chatEl.innerHTML =
      '<div class="rc-aic-head">'
      + '<span class="rc-aic-title">✨ AI yordamchi</span>'
      + '<button type="button" id="rc-aic-mic" title="Ovozli rejim">'
      +   '<i class="fas fa-microphone"></i></button>'
      + '<button type="button" id="rc-aic-x" title="Yopish">&times;</button>'
      + '</div>'
      + '<div class="rc-aic-body" id="rc-aic-body"></div>'
      + '<div class="rc-aic-foot">'
      +   '<input type="text" id="rc-aic-inp" placeholder="Savolingizni yozing...">'
      +   '<button type="button" id="rc-aic-send"><i class="fas fa-paper-plane"></i></button>'
      + '</div>';
    document.body.appendChild(chatEl);

    document.getElementById('rc-aic-x').onclick = function () { chatEl.style.display = 'none'; };
    document.getElementById('rc-aic-mic').onclick = function () {
      chatEl.style.display = 'none';
      startVoice();
    };
    var inp = document.getElementById('rc-aic-inp');
    var snd = document.getElementById('rc-aic-send');
    snd.onclick = chatSend;
    inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); chatSend(); } };

    if (!chatHistory.length) {
      chatPush('ai', 'Salom! Bittada Usta bo\'yicha istalgan savolni bering.\n\n'
        + 'Masalan: «Balans nima?» · «Nega foydam kam?» · «Kim menga qarzdor?»');
      // Yangi funksiya izohi (rc-hint.js) — birinchi ochilishda
      if (window.RcHint && RcHint.html) {
        var b = document.getElementById('rc-aic-body');
        if (b) {
          var w = document.createElement('div');
          w.style.cssText = 'padding:0 2px';
          w.innerHTML = RcHint.html('ai_chat');
          b.appendChild(w);
          if (RcHint.bind) { try { RcHint.bind(b); } catch (e) {} }
        }
      }
    } else {
      chatRender();
    }
    chatFocus();
  }

  function chatFocus() {
    setTimeout(function () {
      var i = document.getElementById('rc-aic-inp');
      if (i) i.focus();
    }, 60);
  }

  function chatPush(role, text, action) {
    chatHistory.push({ role: role, text: text, action: action || null });
    if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);
    chatRender();
  }

  // Amal nomi → ustaga ko'rinadigan qisqa o'zbekcha yorliq (tasdiq tugmasida)
  var ACTION_LABELS = {
    complete_stage: 'Etapni tugatish', check_item: 'Belgini almashtirish',
    add_stage: 'Yangi etap qo\'shish', change_status: 'Holatni o\'zgartirish',
    add_income: 'Kirim qo\'shish oynasini ochish', add_expense: 'Chiqim qo\'shish oynasini ochish',
    create_order: 'Yangi buyurtma yaratish', add_customer: 'Yangi mijoz qo\'shish'
  };

  // Tasdiqlangan amalni HAQIQIY bajaradi — mavjud, sinovdan o'tgan
  // RcActions.run() orqali (ovozli rejim bilan bir xil funksiya, 2026-09-11).
  function chatRunAction(action, btnWrap) {
    if (btnWrap) btnWrap.remove();
    if (!(window.RcActions && typeof RcActions.run === 'function')) {
      chatPush('ai', 'Amal bajarish tizimi topilmadi — sahifani yangilang.');
      return;
    }
    var res = RcActions.run(action.name, action.args || {});
    chatPush('ai', String(res || 'Bajarildi'));
  }

  function chatRender() {
    var b = document.getElementById('rc-aic-body');
    if (!b) return;
    b.innerHTML = chatHistory.map(function (m, i) {
      var html = '<div class="rc-aic-msg ' + (m.role === 'user' ? 'me' : 'ai') + '">'
        + chatEsc(m.text).replace(/\n/g, '<br>');
      if (m.action) {
        var lbl = ACTION_LABELS[m.action.name] || m.action.name;
        html += '<div class="rc-aic-confirm" data-i="' + i + '">'
          + '<div class="rc-aic-confirm-lbl">⚙️ ' + chatEsc(lbl) + '</div>'
          + '<button type="button" class="rc-aic-yes" data-i="' + i + '">✅ Ha, bajar</button>'
          + '<button type="button" class="rc-aic-no" data-i="' + i + '">❌ Yo\'q</button>'
          + '</div>';
      }
      return html + '</div>';
    }).join('') + (chatBusy
      ? '<div class="rc-aic-msg ai rc-aic-wait">O\'ylayapman…</div>' : '');
    b.scrollTop = b.scrollHeight;
    // Tasdiq tugmalarini ulash (delegatsiyasiz — kichik ro'yxat, oddiy)
    b.querySelectorAll('.rc-aic-yes').forEach(function (btn) {
      btn.onclick = function () {
        var idx = parseInt(btn.dataset.i, 10);
        var m = chatHistory[idx];
        if (m && m.action) chatRunAction(m.action, btn.closest('.rc-aic-confirm'));
      };
    });
    b.querySelectorAll('.rc-aic-no').forEach(function (btn) {
      btn.onclick = function () {
        var wrap = btn.closest('.rc-aic-confirm');
        if (wrap) wrap.remove();
      };
    });
  }

  function chatSend() {
    if (chatBusy) return;
    var inp = document.getElementById('rc-aic-inp');
    if (!inp) return;
    var q = (inp.value || '').trim();
    if (!q) return;
    inp.value = '';
    chatPush('user', q);
    chatBusy = true; chatRender();

    if (!(window.WS && WS.send)) {
      chatBusy = false;
      chatPush('ai', 'Aloqa yo\'q — sahifani yangilang.');
      return;
    }
    var hist = chatHistory.slice(0, -1).slice(-6);
    // Joriy sahifa/buyurtma holati — AI amal uchun kerakli ID'larni shundan
    // o'qiydi (o'zidan to'qimaydi). Mavjud, sinovdan o'tgan funksiya.
    var ctx = '';
    try {
      if (window.RcActions && typeof RcActions.run === 'function') {
        ctx = RcActions.run('current_context') || '';
      }
    } catch (e) { /* jim — context ixtiyoriy */ }
    WS.send('ai.chat', { text: q, history: hist, context: ctx }, function (msg) {
      chatBusy = false;
      if (!msg || !msg.ok) {
        chatPush('ai', 'Xatolik: ' + ((msg && msg.error) || 'javob kelmadi'));
        return;
      }
      var d = msg.data || {};
      chatPush('ai', d.text || 'Javob bo\'sh.', d.action || null);
      if (d.usage) showUsage(d.usage, false);
    });
  }

  // Mikrofon ruxsatini SUZUVCHI FAB'дан AJRATIB, toza (oddiy tugmali) oyna orqali
  // so'raymiz — Android draggable overlay'ни "bubble" deb bloklamasin.
  function ensureMicPermission() {
    var openModal = function () { showMicModal(); };
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' }).then(function (st) {
        if (st.state === 'granted') start();   // ruxsat bor — oynasiz boshlaymiz
        else openModal();
      }).catch(openModal);
    } else {
      openModal();
    }
  }

  function showMicModal() {
    if (document.getElementById('rc-glive-mic')) return;
    var ov = document.createElement('div');
    ov.id = 'rc-glive-mic';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.62);' +
      'backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML =
      '<div style="width:100%;max-width:340px;background:#1b1a21;border:1px solid rgba(255,255,255,.12);' +
        'border-radius:20px;padding:26px 22px;text-align:center;color:#fff;font-family:inherit">' +
        '<div style="font-size:40px;line-height:1">🎙️</div>' +
        '<div style="font-weight:800;font-size:17px;margin-top:10px">Ovozli yordamchi</div>' +
        '<div style="font-size:13px;color:#9d9ca6;margin:8px 0 18px;line-height:1.5">Gaplashib boshqarish uchun mikrofonга ruxsat bering.</div>' +
        '<div id="rc-glive-mic-msg" style="font-size:12px;color:#f5a48b;margin-bottom:13px;display:none;line-height:1.5"></div>' +
        '<button id="rc-glive-mic-ok" style="width:100%;background:#DCF262;color:#15140f;border:none;' +
          'border-radius:12px;padding:14px;font-weight:800;font-size:14px;cursor:pointer">🎙️ Ruxsat berish va boshlash</button>' +
        '<button id="rc-glive-mic-no" style="width:100%;background:transparent;color:#9d9ca6;border:none;' +
          'padding:12px;margin-top:6px;font-size:13px;cursor:pointer">Bekor</button>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.getElementById('rc-glive-mic-no').onclick = function () { ov.remove(); };
    document.getElementById('rc-glive-mic-ok').onclick = function () {
      var msg = document.getElementById('rc-glive-mic-msg');
      // TOZA click ichida getUserMedia — draggable FAB umuman aralashmaydi
      navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      }).then(function (stream) {
        micStream = stream;      // olindi — start() endi qayta so'ramaydi
        ov.remove();
        start();
      }).catch(function (err) {
        var nm = (err && err.name) || '';
        if (msg) {
          msg.style.display = 'block';
          msg.textContent = (nm === 'NotAllowedError' || nm === 'SecurityError')
            ? "Ruxsat berilmadi. Telefonда suzuvchi oyna/bubble (Messenger, ekran-yozuvchi, tungi filtr) bo'lsa yoping — Android shu sababli bloklaydi. Yoki Chrome sozlamasida shu sayt uchun Mikrofon → Ruxsat."
            : 'Mikrofon ochilmadi' + (nm ? ' (' + nm + ')' : '') + '.';
        }
      });
    };
  }

  /* ═══════════════ 1) start — proxy WS ochish ═══════════════ */
  function start() {
    if (running) return;
    running = true;
    manualStop = false;      // faqat foydalanuvchi bosib o'chirса true
    reconnectTries = 0;
    setupDone = false;
    setState('connecting');

    // MUHIM: mikrofon ruxsatini AYNAN tap (user-gesture) ichida so'raymiz.
    requestMic();
    openSocket();
  }

  // WS ochish — start() va reconnect ikkalasi ishlatadi (mikrofon qayta so'ralmaydi).
  function openSocket() {
    var url;
    try { url = proxyUrl(); } catch (e) { url = ''; }
    if (!url) { fail('Server manzili topilmadi'); return; }
    try {
      sock = new WebSocket(url);
    } catch (e) {
      scheduleReconnect("Ovozli serverga ulanib bo'lmadi");
      return;
    }
    try { sock.binaryType = 'arraybuffer'; } catch (e) {}

    sock.onopen = function () {
      var tools = window.GEMINI_TOOLS;
      sockSend({ type: 'start', page: location.hash || '#/', tools: (tools && tools.length) ? tools : [] });
    };
    sock.onmessage = onSockMessage;
    sock.onerror = function () { /* onclose ergashadi */ };
    sock.onclose = function () {
      // Foydalanuvchi o'chirmagan bo'lsa — O'ZI o'chib qolmasin: qayta ulanamiz.
      if (running && !manualStop) { scheduleReconnect(); return; }
      cleanup();
    };
  }

  // O'zi uzilса qayta ulanish (cheklangan) — micStream saqlanadi, tanga qayta yechiladi.
  function scheduleReconnect(failMsg) {
    if (manualStop || !running) { cleanup(); return; }
    if (reconnectTries >= MAX_RECONNECT) {
      toast('info', "Ovozli rejim to'xtadi");
      cleanup();
      return;
    }
    reconnectTries++;
    if (failMsg && reconnectTries === 1) toast('info', 'Qayta ulanmoqda…');
    softTeardown();          // socket + audio yopiladi, micStream QOLADI
    setState('connecting');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(function () {
      if (running && !manualStop) openSocket();
    }, 900);
  }

  // Qayta ulanish uchun yumshoq tozalash — micStream va running SAQLANADI.
  function softTeardown() {
    setupDone = false;
    stopPlayback();
    try { if (workletNode) { workletNode.port.onmessage = null; workletNode.disconnect(); } } catch (e) {}
    try { if (procNode) { procNode.onaudioprocess = null; procNode.disconnect(); } } catch (e) {}
    try { if (srcNode) srcNode.disconnect(); } catch (e) {}
    try { if (muteSink) muteSink.disconnect(); } catch (e) {}
    try { if (inCtx && inCtx.state !== 'closed') inCtx.close(); } catch (e) {}
    try {
      if (sock) { sock.onopen = null; sock.onmessage = null; sock.onerror = null; sock.onclose = null;
        if (sock.readyState === 0 || sock.readyState === 1) sock.close(); }
    } catch (e) {}
    inCtx = null; srcNode = null; workletNode = null; procNode = null; muteSink = null; sock = null;
    // micStream ATAYLAB saqlanadi — reconnect'da qayta ishlatiladi (ruxsat qayta so'ralmaydi).
  }

  function fail(msg) {
    running = false;
    setState('idle');
    toast('error', msg);
    cleanup();
  }

  /* ═══════════════ 2) server xabarlari ═══════════════ */
  function onSockMessage(ev) {
    var data = ev.data;
    if (data instanceof ArrayBuffer) {
      try { handleServer(new TextDecoder('utf-8').decode(data)); } catch (e) {}
      return;
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      if (data.text) {
        data.text().then(function (t) { handleServer(t); }).catch(function () {});
      } else {
        var fr = new FileReader();
        fr.onload = function () { handleServer(fr.result); };
        try { fr.readAsText(data); } catch (e) {}
      }
      return;
    }
    handleServer(data);
  }

  function handleServer(text) {
    var msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;
    var t = msg.type || '';

    if (t === 'ready') {
      if (!running) return;
      setupDone = true;
      setState('listening');
      startCapture();       // mikrofon endi ochiladi (server tayyor)
      if (pendingText) { sockSend({ type: 'text', text: pendingText }); pendingText = null; }
      return;
    }
    if (t === 'transcript') {
      addTranscript(msg.role || 'model', msg.text || '');
      return;
    }
    if (t === 'audio') {
      if (msg.data) enqueueAudio(msg.data);
      return;
    }
    if (t === 'interrupted') {
      stopPlayback();
      if (running && uiState === 'speaking') setState('listening');
      return;
    }
    if (t === 'tool_call') {
      handleToolCall(msg);
      return;
    }
    // ── 2026-08-05: sarf va cheklov xabarlari (TZ §2.4, §2.6) ──
    if (t === 'charged') {
      // ⚠️ 2026-08-05 TUZATILDI: ilgari `reuse_window` uchun ham toast
      // chiqarardi. Ovozli sessiya UZILSA AVTOMATIK QAYTA ULANADI
      // (scheduleReconnect) — har qayta ulanishda «qo'shimcha tanga
      // olinmadi» toast'i chiqib, ekran to'lib ketardi.
      // Endi: pul YECHILGANDAGINA va sessiyada BIR MARTA xabar beriladi.
      // Tanga olinmagani — xabar bermaydigan holat (hech narsa bo'lmadi).
      if (msg.coins > 0 && !chargedNotified) {
        chargedNotified = true;
        toast('info', msg.coins + ' tanga yechildi');
      }
      return;
    }
    if (t === 'warn') {
      toast('info', msg.detail || '');
      addTranscript('model', '⏳ ' + (msg.detail || ''));
      return;
    }
    if (t === 'limit') {
      toast('error', msg.detail || "Vaqt limiti");
      addTranscript('model', '⛔ ' + (msg.detail || ''));
      return;
    }
    if (t === 'usage') {
      // Suhbat yakuni — sarf hisoboti (§2.6)
      showUsage(msg, true);
      return;
    }
    if (t === 'tool_result') {
      // Server tool javobi — ekranda ham ko'rinsin (ovoz eshitilmasa)
      if (msg.text) addTranscript('model', msg.text);
      return;
    }
    if (t === 'error') {
      var em = msg.detail || 'Ovozli rejim mavjud emas';
      if (msg.upgrade) em += ' (tarifni yangilang)';
      running = false;
      toast('error', em);
      cleanup();
      return;
    }
    if (t === 'ended') {
      // Gemini sessiyasi tugadi — foydalanuvchi o'chirmagan bo'lsa QAYTA ULANAMIZ
      // (o'z-o'zidan o'chib qolmasin). Manual stop bo'lsa — to'xtaydi.
      if (running && !manualStop) { scheduleReconnect(); return; }
      cleanup();
      return;
    }
    // 'pong' va boshqalar — e'tiborsiz
  }

  /* ── tool_call -> RcActions -> tool_response ── */
  function handleToolCall(msg) {
    var name = msg.name, args = msg.args || {}, id = msg.id;
    var p;
    try {
      if (window.RcActions && typeof RcActions.run === 'function') {
        p = Promise.resolve(RcActions.run(name, args));
      } else {
        p = Promise.resolve({ error: 'Amal mavjud emas: ' + name });
      }
    } catch (e) {
      p = Promise.resolve({ error: String((e && e.message) || e) });
    }
    p.then(function (result) {
      sendToolResponse(id, name, result);
    }).catch(function (err) {
      sendToolResponse(id, name, { error: String((err && err.message) || err) });
    });
  }

  function sendToolResponse(id, name, result) {
    var resStr;
    try {
      resStr = (typeof result === 'string') ? result : JSON.stringify(result);
    } catch (e) {
      resStr = String(result);
    }
    var out = { type: 'tool_response', name: name, result: resStr };
    if (id) out.id = id;
    sockSend(out);
  }

  /* ═══════════════ audio kirish (mikrofon -> PCM16 16kHz) ═══════════════ */
  // Mikrofonni user-gesture (TAP) ichida so'raymiz — Android ruxsatni bloklamasin.
  function requestMic() {
    if (micStream || micPromise) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('error', 'Mikrofon bu brauzerda ishlamaydi');
      stop();
      return;
    }
    var constraints = {
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    };
    micPromise = navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
      micPromise = null;
      if (!running) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} return; }
      micStream = stream;
      maybeStartPipeline();   // 'ready' allaqachon kelgan bo'lsa — darhol boshlanadi
    }).catch(function (err) {
      micPromise = null;
      var nm = (err && err.name) || '';
      var msg;
      if (nm === 'NotAllowedError' || nm === 'SecurityError') {
        // Android ko'pincha "boshqa ilova overlay chizyapti" himoyasi tufayli bloklaydi.
        msg = "Mikrofonga ruxsat berilmadi. Telefonда suzuvchi oyna/bubble (Messenger, " +
              "ekran-yozuvchi, tungi filtr) bo'lsa yoping; yoki Chrome sozlamasida shu sayt " +
              "uchun Mikrofon → Ruxsat bering.";
      } else if (nm === 'NotFoundError') {
        msg = 'Mikrofon topilmadi.';
      } else {
        msg = 'Mikrofon ochilmadi' + (nm ? ' (' + nm + ')' : '') + '.';
      }
      toast('error', msg);
      stop();
    });
  }

  // 'ready' (server tayyor) + micStream (ruxsat olindi) — IKKALASI bo'lgach pipeline.
  function maybeStartPipeline() {
    if (running && setupDone && micStream && !inCtx) beginAudioPipeline();
  }

  // 'ready' xabarida chaqiriladi — mic allaqachon so'ralgan (start'da), shu sabab
  // faqat koordinatsiya qilamiz (yangi getUserMedia YO'Q).
  function startCapture() {
    maybeStartPipeline();
  }

  function beginAudioPipeline() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { toast('error', 'AudioContext qo\'llab-quvvatlanmaydi'); return; }
      try { inCtx = new AC({ sampleRate: IN_RATE }); }
      catch (e) { inCtx = new AC(); }
      try { if (inCtx.resume) inCtx.resume(); } catch (e) {}
      srcNode = inCtx.createMediaStreamSource(micStream);
      muteSink = inCtx.createGain();
      muteSink.gain.value = 0;               // feedback bo'lmasligi uchun jim sink
      muteSink.connect(inCtx.destination);
      setupWorkletCapture();
    } catch (e) {
      toast('error', 'Mikrofon oqimini boshlab bo\'lmadi');
    }
  }

  function setupWorkletCapture() {
    var ok = false;
    try {
      if (inCtx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        var code =
          'class GLiveCap extends AudioWorkletProcessor{' +
          'process(inputs){var ch=inputs[0]&&inputs[0][0];' +
          'if(ch&&ch.length){this.port.postMessage(ch.slice(0));}return true;}}' +
          "registerProcessor('glive-cap',GLiveCap);";
        var url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
        inCtx.audioWorklet.addModule(url).then(function () {
          try {
            if (!running || !inCtx) return;
            workletNode = new AudioWorkletNode(inCtx, 'glive-cap');
            workletNode.port.onmessage = function (e) { onCapFrame(e.data); };
            srcNode.connect(workletNode);
            workletNode.connect(muteSink);
          } catch (err) {
            setupScriptProcessor();
          }
          try { URL.revokeObjectURL(url); } catch (e2) {}
        }).catch(function () {
          try { URL.revokeObjectURL(url); } catch (e3) {}
          setupScriptProcessor();
        });
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) setupScriptProcessor();
  }

  function setupScriptProcessor() {
    try {
      if (!inCtx || !srcNode) return;
      procNode = inCtx.createScriptProcessor(4096, 1, 1);
      procNode.onaudioprocess = function (e) {
        try {
          var ch = e.inputBuffer.getChannelData(0);
          onCapFrame(ch.slice(0));
        } catch (err) {}
      };
      srcNode.connect(procNode);
      procNode.connect(muteSink);
    } catch (e) {
      toast('error', 'Mikrofon oqimi ishlamadi');
    }
  }

  function onCapFrame(frame) {
    if (!running || !inCtx) return;
    rawParts.push(frame);
    rawLen += frame.length;
    var need = Math.round(inCtx.sampleRate * CHUNK_SEC);
    if (rawLen < need) return;

    var merged = new Float32Array(rawLen);
    var off = 0;
    for (var i = 0; i < rawParts.length; i++) { merged.set(rawParts[i], off); off += rawParts[i].length; }
    rawParts = []; rawLen = 0;

    // barge-in: model gapirayotganda foydalanuvchi gapirsa — ijroni to'xtat
    if (uiState === 'speaking' && rms(merged) > VAD_RMS) {
      stopPlayback();
      setState('listening');
    }

    var ds = downsample(merged, inCtx.sampleRate, IN_RATE);
    var b64 = floatToPCM16B64(ds);
    if (b64) sockSend({ type: 'audio', data: b64 });
  }

  function rms(f) {
    var s = 0;
    for (var i = 0; i < f.length; i++) s += f[i] * f[i];
    return f.length ? Math.sqrt(s / f.length) : 0;
  }

  function downsample(f, inRate, outRate) {
    if (inRate === outRate || !inRate) return f;
    var ratio = inRate / outRate;
    var n = Math.floor(f.length / ratio);
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var idx = i * ratio;
      var i0 = Math.floor(idx);
      var i1 = i0 + 1 < f.length ? i0 + 1 : f.length - 1;
      var frac = idx - i0;
      out[i] = f[i0] * (1 - frac) + f[i1] * frac;
    }
    return out;
  }

  function floatToPCM16B64(f) {
    try {
      var buf = new ArrayBuffer(f.length * 2);
      var view = new DataView(buf);
      for (var i = 0; i < f.length; i++) {
        var s = f[i] < -1 ? -1 : f[i] > 1 ? 1 : f[i];
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
      return abToB64(buf);
    } catch (e) { return null; }
  }

  function abToB64(buf) {
    var bytes = new Uint8Array(buf);
    var bin = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  /* ═══════════════ audio chiqish (Gemini PCM 24kHz -> ijro) ═══════════════ */
  function ensureOutCtx() {
    if (outCtx) return outCtx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { outCtx = new AC({ sampleRate: OUT_RATE }); }
    catch (e) { try { outCtx = new AC(); } catch (e2) { outCtx = null; } }
    try { if (outCtx && outCtx.resume) outCtx.resume(); } catch (e3) {}
    playHead = 0;
    return outCtx;
  }

  function enqueueAudio(b64) {
    var ctx = ensureOutCtx();
    if (!ctx) return;
    var pcm = b64ToPCM16Float(b64);
    if (!pcm || !pcm.length) return;
    var buf;
    try {
      buf = ctx.createBuffer(1, pcm.length, OUT_RATE); // buffer o'z rate'ida — ctx resample qiladi
      buf.getChannelData(0).set(pcm);
    } catch (e) { return; }

    var src;
    try {
      src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
    } catch (e) { return; }

    var now = ctx.currentTime;
    if (playHead < now) playHead = now + 0.03;
    try { src.start(playHead); } catch (e) { return; }
    playHead += buf.duration;
    playSources.push(src);
    src.onended = function () {
      var i = playSources.indexOf(src);
      if (i >= 0) playSources.splice(i, 1);
      if (!playSources.length && running && uiState === 'speaking') setState('listening');
    };
    if (running && uiState === 'listening') setState('speaking');
  }

  function b64ToPCM16Float(b64) {
    var bin;
    try { bin = atob(b64); } catch (e) { return null; }
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    var view = new DataView(bytes.buffer);
    var n = len >> 1;
    var out = new Float32Array(n);
    for (var j = 0; j < n; j++) out[j] = view.getInt16(j * 2, true) / 0x8000;
    return out;
  }

  function stopPlayback() {
    for (var i = 0; i < playSources.length; i++) {
      try { playSources[i].onended = null; playSources[i].stop(); } catch (e) {}
    }
    playSources = [];
    if (outCtx) { try { playHead = outCtx.currentTime; } catch (e) {} }
  }

  /* ═══════════════ 4) stop / cleanup ═══════════════ */
  function stop() {
    var wasRunning = running;
    manualStop = true;       // FOYDALANUVCHI o'chirdi — qayta ulanish YO'Q
    running = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (wasRunning) { try { sockSend({ type: 'stop' }); } catch (e) {} }
    cleanup();
  }

  function cleanup() {
    running = false;
    setupDone = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    stopPlayback();

    try { if (workletNode) { workletNode.port.onmessage = null; workletNode.disconnect(); } } catch (e) {}
    try { if (procNode) { procNode.onaudioprocess = null; procNode.disconnect(); } } catch (e) {}
    try { if (srcNode) srcNode.disconnect(); } catch (e) {}
    try { if (muteSink) muteSink.disconnect(); } catch (e) {}
    try { if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    try { if (inCtx && inCtx.state !== 'closed') inCtx.close(); } catch (e) {}
    try { if (outCtx && outCtx.state !== 'closed') outCtx.close(); } catch (e) {}
    try {
      if (sock) {
        sock.onopen = null; sock.onmessage = null; sock.onerror = null; sock.onclose = null;
        if (sock.readyState === 0 || sock.readyState === 1) sock.close();
      }
    } catch (e) {}

    micStream = null; micPromise = null; inCtx = null; srcNode = null; workletNode = null; procNode = null;
    muteSink = null; outCtx = null; sock = null;
    rawParts = []; rawLen = 0; playSources = []; playHead = 0;

    setState('idle');
  }

  /* ═══════════════ export ═══════════════ */
  var RcGLive = {
    init: init,
    start: start,
    stop: stop,
    toggle: toggle,
    openChat: openChat,        // matnli chat (2026-08-05)
    startVoice: startVoice,    // ovozli rejim (chat ichidagi 🎤)
    isActive: function () { return !!running; }
  };
  window.RcGLive = RcGLive;
})();
