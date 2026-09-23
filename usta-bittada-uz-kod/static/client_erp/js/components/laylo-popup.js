/* client_erp/js/components/laylo-popup.js — Laylo AI Popup for Client ERP.
   MiniERP.WS orqali laylo.chat / laylo.tts / laylo.permissions bilan ishlaydi.
   STT (ovozdan matn), TTS (matndan ovoz), to'liq MCP qo'llab-quvvatlash. */

var LayloPopup = (function() {
    'use strict';

    var isOpen = false;
    var isLoading = false;
    var isRecording = false;
    var ttsEnabled = true;
    var perms = null;
    var mediaRecorder = null;
    var audioChunks = [];
    var currentAudio = null;

    function init() {
        _createDOM();
        _bindEvents();
        _loadPermissions();
    }

    function _createDOM() {
        var fab = document.createElement('button');
        fab.id = 'laylo-fab';
        fab.className = 'laylo-popup-fab';
        fab.innerHTML = '<i class="fas fa-robot"></i>';
        fab.title = 'Laylo AI';
        document.body.appendChild(fab);

        var popup = document.createElement('div');
        popup.id = 'laylo-popup';
        popup.className = 'laylo-popup laylo-popup-hidden';
        popup.innerHTML =
            '<div class="laylo-popup-header">' +
                '<div class="laylo-popup-header-left">' +
                    '<div class="laylo-popup-avatar"><i class="fas fa-robot"></i></div>' +
                    '<div>' +
                        '<div class="laylo-popup-title">Laylo AI</div>' +
                        '<div class="laylo-popup-subtitle" id="laylo-popup-status">' +
                            '<span class="laylo-popup-dot"></span> Tayyor' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="laylo-popup-header-right">' +
                    '<button class="laylo-popup-tts-toggle' + (ttsEnabled ? ' active' : '') + '" id="laylo-popup-tts-toggle" title="Ovozli javob">' +
                        '<i class="fas fa-volume-up"></i>' +
                    '</button>' +
                    '<button class="laylo-popup-close" id="laylo-popup-close">' +
                        '<i class="fas fa-times"></i>' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="laylo-popup-chat" id="laylo-popup-chat">' +
                '<div class="laylo-popup-msg laylo-popup-msg-bot">' +
                    '<div class="laylo-popup-who">LAYLO</div>' +
                    'Salom! Men Laylo — AI yordamchi. Savolingizni yozing yoki ovozli xabar yuboring.' +
                '</div>' +
            '</div>' +
            '<div class="laylo-popup-actions" id="laylo-popup-actions"></div>' +
            '<div class="laylo-popup-input-bar">' +
                '<button class="laylo-popup-mic" id="laylo-popup-mic" title="Ovozli xabar">' +
                    '<i class="fas fa-microphone"></i>' +
                '</button>' +
                '<input class="laylo-popup-input" id="laylo-popup-input" placeholder="Savolingizni yozing..." autocomplete="off">' +
                '<button class="laylo-popup-send" id="laylo-popup-send">' +
                    '<i class="fas fa-paper-plane"></i>' +
                '</button>' +
            '</div>';

        document.body.appendChild(popup);
    }

    function _bindEvents() {
        document.getElementById('laylo-fab').addEventListener('click', toggle);
        document.getElementById('laylo-popup-close').addEventListener('click', toggle);
        document.getElementById('laylo-popup-send').addEventListener('click', _send);
        document.getElementById('laylo-popup-mic').addEventListener('click', _toggleMic);
        document.getElementById('laylo-popup-tts-toggle').addEventListener('click', _toggleTTS);
        document.getElementById('laylo-popup-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _send(); }
        });
    }

    function toggle() {
        isOpen = !isOpen;
        var popup = document.getElementById('laylo-popup');
        var fab = document.getElementById('laylo-fab');
        if (isOpen) {
            popup.classList.remove('laylo-popup-hidden');
            fab.classList.add('laylo-popup-fab-hidden');
            document.getElementById('laylo-popup-input').focus();
        } else {
            popup.classList.add('laylo-popup-hidden');
            fab.classList.remove('laylo-popup-fab-hidden');
            _stopAudio();
        }
    }

    function _loadPermissions() {
        WS.send('laylo.permissions', {}, function(resp) {
            if (resp.ok && resp.data) {
                perms = new Set(resp.data.permissions || []);
                _renderQuickActions();
            }
        });
    }

    function _renderQuickActions() {
        var el = document.getElementById('laylo-popup-actions');
        if (!perms || !el) return;

        var actions = [];
        if (perms.has('orders.read'))
            actions.push({icon: 'fa-clipboard-list', label: 'Buyurtmalarim', text: 'Mening faol buyurtmalarimni ko\'rsat'});
        if (perms.has('finance.read'))
            actions.push({icon: 'fa-chart-line', label: 'Qarz holati', text: 'Qarzlarim qancha?'});
        if (perms.has('finance.read'))
            actions.push({icon: 'fa-coins', label: 'Moliya', text: 'Bugungi kirim-chiqimni ko\'rsat'});
        if (perms.has('products.read'))
            actions.push({icon: 'fa-boxes', label: 'Mahsulotlar', text: 'Mahsulotlar katalogini ko\'rsat'});

        if (!actions.length) { el.style.display = 'none'; return; }

        var html = '';
        actions.forEach(function(a) {
            html += '<button class="laylo-popup-quick" onclick="LayloPopup.ask(\'' +
                a.text.replace(/'/g, "\\'") + '\')">' +
                '<i class="fas ' + a.icon + '"></i> ' + a.label + '</button>';
        });
        el.innerHTML = html;
    }

    function ask(text) {
        document.getElementById('laylo-popup-input').value = text;
        _send();
        var el = document.getElementById('laylo-popup-actions');
        if (el) el.style.display = 'none';
    }

    // ── Send text message ──
    function _send() {
        var input = document.getElementById('laylo-popup-input');
        var text = input.value.trim();
        if (!text || isLoading) return;
        input.value = '';

        _addMsg('user', _esc(text));
        _doChat({text: text, quality: 'standard', tts: ttsEnabled});
    }

    // ── Send audio message ──
    function _sendAudio(base64Audio) {
        _addMsg('user', '<i class="fas fa-microphone" style="margin-right:4px;opacity:.6"></i> Ovozli xabar');
        _doChat({audio_base64: base64Audio, quality: 'standard', tts: ttsEnabled});
    }

    // ── Core chat handler ──
    function _doChat(payload) {
        isLoading = true;
        _addTyping();
        _setStatus('thinking');

        var actionsEl = document.getElementById('laylo-popup-actions');
        if (actionsEl) actionsEl.style.display = 'none';

        WS.send('laylo.chat', payload, function(resp) {
            _removeTyping();
            isLoading = false;
            _setStatus('ready');

            if (resp.ok && resp.data) {
                if (resp.data.transcript) {
                    var chat = document.getElementById('laylo-popup-chat');
                    var lastUser = chat.querySelector('.laylo-popup-msg-user:last-of-type');
                    if (lastUser) {
                        lastUser.innerHTML = '<i class="fas fa-microphone" style="margin-right:4px;opacity:.5"></i> ' + _esc(resp.data.transcript);
                    }
                }

                _addMsg('bot', resp.data.html, resp.data.tts_text);

                if (resp.data.audio_base64) {
                    _playBase64Audio(resp.data.audio_base64, resp.data.audio_mime || 'audio/ogg');
                }

                if (resp.data.tools_used && resp.data.tools_used.length) {
                    var toolsHtml = '<div class="laylo-popup-tools">';
                    resp.data.tools_used.forEach(function(t) {
                        toolsHtml += '<span class="laylo-popup-tool-badge"><i class="fas fa-cog"></i> ' + _esc(t) + '</span>';
                    });
                    toolsHtml += '</div>';
                    var chat = document.getElementById('laylo-popup-chat');
                    var lastBot = chat.querySelectorAll('.laylo-popup-msg-bot');
                    if (lastBot.length) {
                        lastBot[lastBot.length - 1].insertAdjacentHTML('beforeend', toolsHtml);
                    }
                }
            } else {
                _addMsg('sys', resp.error || 'Xatolik yuz berdi');
            }
        }, 90000);
    }

    // ── Microphone ──
    function _toggleMic() {
        if (isLoading) return;
        if (isRecording) {
            _stopRecording();
        } else {
            _startRecording();
        }
    }

    function _startRecording() {
        navigator.mediaDevices.getUserMedia({audio: true}).then(function(stream) {
            isRecording = true;
            audioChunks = [];
            var micBtn = document.getElementById('laylo-popup-mic');
            micBtn.classList.add('recording');
            micBtn.innerHTML = '<i class="fas fa-stop"></i>';
            _setStatus('recording');

            mediaRecorder = new MediaRecorder(stream, {mimeType: 'audio/webm;codecs=opus'});
            mediaRecorder.ondataavailable = function(e) { audioChunks.push(e.data); };
            mediaRecorder.onstop = function() {
                stream.getTracks().forEach(function(t) { t.stop(); });
                var blob = new Blob(audioChunks, {type: 'audio/webm'});
                _blobToBase64(blob, function(b64) {
                    _sendAudio(b64);
                });
            };
            mediaRecorder.start();
        }).catch(function() {
            _addMsg('sys', 'Mikrofon ruxsati berilmadi');
        });
    }

    function _stopRecording() {
        isRecording = false;
        var micBtn = document.getElementById('laylo-popup-mic');
        micBtn.classList.remove('recording');
        micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }

    function _blobToBase64(blob, callback) {
        var reader = new FileReader();
        reader.onload = function() {
            var b64 = reader.result.split(',')[1];
            callback(b64);
        };
        reader.readAsDataURL(blob);
    }

    // ── TTS toggle ──
    function _toggleTTS() {
        ttsEnabled = !ttsEnabled;
        var btn = document.getElementById('laylo-popup-tts-toggle');
        btn.classList.toggle('active', ttsEnabled);
        if (!ttsEnabled) _stopAudio();
    }

    // ── TTS playback from message button ──
    function playTTS(text) {
        if (!text) return;
        _setStatus('speaking');
        WS.send('laylo.tts', {text: text}, function(resp) {
            _setStatus('ready');
            if (resp.ok && resp.data && resp.data.audio_base64) {
                _playBase64Audio(resp.data.audio_base64, resp.data.audio_mime || 'audio/ogg');
            }
        }, 30000);
    }

    // ── Audio playback ──
    function _playBase64Audio(b64, mime) {
        try {
            _stopAudio();
            var raw = atob(b64);
            var arr = new Uint8Array(raw.length);
            for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
            var blob = new Blob([arr], {type: mime});
            var url = URL.createObjectURL(blob);
            currentAudio = new Audio(url);
            currentAudio.onended = function() { currentAudio = null; _setStatus('ready'); };
            currentAudio.onplay = function() { _setStatus('speaking'); };
            currentAudio.play().catch(function(){});
        } catch(e) {}
    }

    function _stopAudio() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
    }

    // ── Messages ──
    function _addMsg(type, html, ttsText) {
        var chat = document.getElementById('laylo-popup-chat');
        var div = document.createElement('div');
        div.className = 'laylo-popup-msg laylo-popup-msg-' + type;
        if (type === 'bot') {
            var ttsBtn = '';
            if (ttsText) {
                var safeText = ttsText.replace(/'/g, "\\'").replace(/\n/g, ' ');
                ttsBtn = '<button class="laylo-popup-listen-btn" onclick="LayloPopup.playTTS(\'' + safeText + '\')" title="Tinglash">' +
                    '<i class="fas fa-volume-up"></i></button>';
            }
            div.innerHTML = '<div class="laylo-popup-msg-header"><div class="laylo-popup-who">LAYLO</div>' + ttsBtn + '</div>' + html;
        } else {
            div.innerHTML = html;
        }
        chat.appendChild(div);
        chat.scrollTop = chat.scrollHeight;
    }

    function _addTyping() {
        _removeTyping();
        var chat = document.getElementById('laylo-popup-chat');
        var div = document.createElement('div');
        div.className = 'laylo-popup-msg laylo-popup-msg-bot laylo-popup-typing';
        div.innerHTML = '<div class="laylo-popup-who">LAYLO</div>' +
            '<div class="laylo-popup-dots"><span></span><span></span><span></span></div>';
        chat.appendChild(div);
        chat.scrollTop = chat.scrollHeight;
    }

    function _removeTyping() {
        var el = document.querySelector('.laylo-popup-typing');
        if (el) el.remove();
    }

    // ── Status ──
    function _setStatus(state) {
        var el = document.getElementById('laylo-popup-status');
        if (!el) return;
        var labels = {
            ready: '<span class="laylo-popup-dot"></span> Tayyor',
            thinking: '<span class="laylo-popup-dot thinking"></span> O\'ylayapti...',
            recording: '<span class="laylo-popup-dot recording"></span> Yozilmoqda...',
            speaking: '<span class="laylo-popup-dot speaking"></span> Gapiryapti...',
        };
        el.innerHTML = labels[state] || labels.ready;
    }

    function _esc(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    return {
        init: init,
        toggle: toggle,
        ask: ask,
        playTTS: playTTS,
    };
})();
