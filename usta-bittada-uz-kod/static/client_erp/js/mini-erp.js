/* client_erp/js/mini-erp.js — SPA Entry: Router + WS Client + State */

var STATE = {
    user: null,
    currentPage: '',
    dashboard: null,
    clients: [],
    orders: [],
    sharedOrders: [],
    currentOrder: null,
    finance: null,
    mcOrders: [],
    templates: [],
    ws: null,
    loading: {},
    pendingCallbacks: {},
    requestCounter: 0,
};

/* ══════════════ WebSocket Client ══════════════ */

var WS = {
    url: null,
    socket: null,
    reconnectAttempts: 0,
    maxReconnect: 10,
    heartbeatInterval: null,
    isConnecting: false,

    onReady: null,
    _firstOpen: true,
    _queue: [],
    _listeners: {},

    on: function(type, handler) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(handler);
    },

    off: function(type, handler) {
        if (!this._listeners[type]) return;
        if (handler) {
            this._listeners[type] = this._listeners[type].filter(function(h) { return h !== handler; });
        } else {
            delete this._listeners[type];
        }
    },

    init: function(username, onReady) {
        var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.url = protocol + '//' + location.host + '/ws/mini/' + username + '/';
        this.onReady = onReady || null;
        this._firstOpen = true;
        this._queue = [];
        this.connect();
    },

    connect: function() {
        if (this.isConnecting) return;
        this.isConnecting = true;
        var self = this;

        try { this.socket = new WebSocket(this.url); } catch(e) { this.isConnecting = false; return; }

        this.socket.onopen = function() {
            self.isConnecting = false;
            self.reconnectAttempts = 0;
            document.body.classList.remove('ws-offline');
            clearInterval(self.heartbeatInterval);
            self.heartbeatInterval = setInterval(function() {
                if (self.socket && self.socket.readyState === WebSocket.OPEN) {
                    self.socket.send(JSON.stringify({type:'ping', data:{}, request_id:'hb'}));
                }
            }, 30000);
            self._flushQueue();
            if (self._firstOpen) {
                self._firstOpen = false;
                if (self.onReady) self.onReady();
            } else {
                if (STATE.currentPage) Router.navigate(STATE.currentPage, true);
            }
        };

        this.socket.onmessage = function(e) {
            try { self._handleMessage(JSON.parse(e.data)); } catch(err) { console.error('[WS]', err); }
        };

        this.socket.onclose = function(e) {
            self.isConnecting = false;
            clearInterval(self.heartbeatInterval);
            document.body.classList.add('ws-offline');
            if (e.code === 4001 || e.code === 4003) {
                Toast.error('Sessiya tugadi. Qayta kiring.');
                setTimeout(function() { location.href = '/mini/login/'; }, 2000);
                return;
            }
            if (e.code === 1000) return;
            if (self.reconnectAttempts < self.maxReconnect) {
                var delay = Math.min(1000 * Math.pow(2, self.reconnectAttempts), 30000);
                self.reconnectAttempts++;
                setTimeout(function() { self.connect(); }, delay);
            } else {
                Toast.error('Server bilan aloqa uzildi. Sahifani yangilang.');
            }
        };

        this.socket.onerror = function() { self.isConnecting = false; };
    },

    send: function(type, data, callback, timeout) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            if (this.isConnecting || this.reconnectAttempts > 0) {
                this._queue.push({type:type, data:data, callback:callback, timeout:timeout});
                return null;
            }
            Toast.error("Server bilan aloqa yo'q");
            if (callback) callback({ok:false, error:"Server bilan aloqa yo'q"});
            return null;
        }
        return this._doSend(type, data, callback, timeout);
    },

    _doSend: function(type, data, callback, timeout) {
        var rid = String(++STATE.requestCounter);
        if (callback) {
            STATE.pendingCallbacks[rid] = callback;
            setTimeout(function() {
                if (STATE.pendingCallbacks[rid]) {
                    var cb = STATE.pendingCallbacks[rid];
                    delete STATE.pendingCallbacks[rid];
                    cb({ok:false, error:'Server javob bermadi (timeout)'});
                }
            }, timeout || 15000);
        }
        this.socket.send(JSON.stringify({type:type, data:data||{}, request_id:rid}));
        return rid;
    },

    _flushQueue: function() {
        var q = this._queue;
        this._queue = [];
        var self = this;
        q.forEach(function(m) { self._doSend(m.type, m.data, m.callback, m.timeout); });
    },

    _handleMessage: function(msg) {
        if (msg.request_id && msg.request_id !== 'hb' && STATE.pendingCallbacks[msg.request_id]) {
            var cb = STATE.pendingCallbacks[msg.request_id];
            delete STATE.pendingCallbacks[msg.request_id];
            cb(msg);
            return;
        }
        if (msg.type === 'broadcast') {
            this._handleBroadcast(msg);
            return;
        }
        if (msg.type === 'xp.awarded') {
            Toast.xp(msg.data.xp, msg.data.coins);
            if (typeof CoinBurst !== 'undefined') CoinBurst.award();
            return;
        }
        if (msg.type === 'xp.revoked') {
            Toast.xpLost(msg.data.xp, msg.data.coins);
            if (typeof CoinBurst !== 'undefined') CoinBurst.lost();
            return;
        }
        if (msg.type === 'wallet.push') {
            // Tanga o'zgardi (quest, mukofot, to'lov...) — reload SHART emas.
            if (msg.data && msg.data.balance != null && window.Wallet && Wallet.set) Wallet.set(msg.data.balance);
            return;
        }
        if (msg.type && this._listeners[msg.type]) {
            var handlers = this._listeners[msg.type].slice();
            handlers.forEach(function(h) { h(msg); });
            return;
        }
    },

    _handleBroadcast: function(msg) {
        var onOrder = STATE.currentPage && STATE.currentPage.match(/^\/orders\/\d+$/);
        if (onOrder && typeof OrderDetail !== 'undefined' && OrderDetail.handleBroadcast) {
            OrderDetail.handleBroadcast(msg.action, msg.data, msg.by);
            return;
        }
        // Redesign (v2) buyurtma sahifasi — jonli yangilanish
        if (onOrder && typeof RcOrderDetail !== 'undefined' && RcOrderDetail.handleBroadcast) {
            RcOrderDetail.handleBroadcast(msg.action, msg.data, msg.by);
            return;
        }
        if (msg.by) Toast.info(msg.by + ' yangiladi');
    },
};

/* ══════════════ Router ══════════════ */

var Router = {
    routes: {},
    init: function() {
        this.routes = {
            '/':            function() { Dashboard.render(); },
            '/clients':     function() { Clients.render(); },
            '/clients/:id': function(p) { ClientDetail.render(p.id); },
            '/orders':      function() { Orders.render(); },
            '/orders/:id':  function(p) { OrderDetail.render(p.id); },
            '/finance':     function() { Finance.render(); },
            '/analytics':   function() { Analytics.render(); },
            '/mebelcity':       function() { MebelCity.render(); },
            '/vizualizatsiya':  function() { Vizualizatsiya.render(); },
            '/zamers':          function() { Zamers.render(); },
            '/oldi-berdi':      function() { OldiBerdi.render(); },
            '/team':        function() { Team.render(); },
            '/settings':    function() { Settings.render(); },
            '/bom-settings':function() { BomSettings.render(); },
        };
        var self = this;
        window.addEventListener('hashchange', function() { self._onHashChange(); });
        this._onHashChange();
    },

    _onHashChange: function() {
        var hash = location.hash.slice(1) || '/';
        this.navigate(hash);
    },

    _scrollMem: {},
    // Joriy sahifa scroll holatini eslab qolish (path bo'yicha)
    saveScroll: function(key) {
        if (!key) return;
        this._scrollMem[key] = window.scrollY || document.documentElement.scrollTop || 0;
    },
    // Saqlangan scrollni tiklash (async sahifalar render tugagach chaqiradi)
    restoreScrollFor: function(key) {
        var y = this._scrollMem[key] || 0;
        requestAnimationFrame(function() {
            requestAnimationFrame(function() { window.scrollTo(0, y); });
        });
    },

    navigate: function(path, force) {
        if (!force && path === STATE.currentPage) return;
        // Eski sahifadan chiqishdan oldin scroll holatini saqlash
        if (STATE.currentPage) this.saveScroll(STATE.currentPage);
        var handler = null, params = {};
        for (var pattern in this.routes) {
            var m = this._match(pattern, path);
            if (m !== null) { handler = this.routes[pattern]; params = m; break; }
        }
        if (!handler) { handler = this.routes['/']; params = {}; }
        STATE.currentPage = path;
        this._updateNav(path);
        var sidebar = document.getElementById('ce-sidebar');
        if (sidebar) sidebar.classList.remove('open');
        var app = document.getElementById('app');
        if (app) {
            app.classList.remove('page-enter');
            void app.offsetWidth;
            handler(params);
            app.classList.add('page-enter');
            // Forward-nav uchun default tepaga. Async sahifalar (orders) render
            // tugagach restoreScrollFor bilan o'zi tiklaydi (keyin ishlaydi → ustun).
            window.scrollTo(0, 0);
        }
        // Tepa "Nazad" tugmasi: ichki sahifalarda ko'rinadi
        this._updateBackBtn(path);
    },

    // Tepadagi ← Nazad tugmasini ko'rsatish/yashirish
    _updateBackBtn: function(path) {
        var b = document.getElementById('ce-topbar-back');
        if (!b) return;
        // Asosiy sahifalarda yashirin, ichki (detail) sahifalarda ko'rinadi
        var top = (path === '/' || path === '/orders' || path === '/clients' ||
                   path === '/finance' || path === '/analytics' || path === '/zamers' ||
                   path === '/mebelcity' || path === '/team' || path === '/settings' ||
                   path === '/vizualizatsiya' || path === '/oldi-berdi' || path === '/bom-settings');
        b.style.display = top ? 'none' : 'inline-flex';
    },

    _match: function(pattern, path) {
        var pp = pattern.split('/'), hp = path.split('/');
        if (pp.length !== hp.length) return null;
        var params = {};
        for (var i = 0; i < pp.length; i++) {
            if (pp[i].charAt(0) === ':') params[pp[i].slice(1)] = hp[i];
            else if (pp[i] !== hp[i]) return null;
        }
        return params;
    },

    _updateNav: function(path) {
        document.querySelectorAll('[data-page]').forEach(function(el) {
            var pg = el.getAttribute('data-page');
            el.classList.toggle('active', path === pg || (pg !== '/' && path.indexOf(pg + '/') === 0));
        });
    },

    go: function(path) { location.hash = '#' + path; },

    // Bitta qadam orqaga (hash tarixi bo'yicha). Tarix bo'sh bo'lsa — orders ro'yxatiga.
    back: function() {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            this.go('/orders');
        }
    },
};

/* ══════════════ App Init ══════════════ */

var App = {
    init: function() {
        STATE.user = window.__USER_DATA__ || {};
        if (!STATE.user.username) return;
        this._legacyRedirect();
        WS.init(STATE.user.username, function() {
            Router.init();
            if (typeof LayloPopup !== 'undefined') LayloPopup.init();
        });
    },

    _legacyRedirect: function() {
        var path = location.pathname;
        var prefix = '/mini/' + STATE.user.username + '/';
        if (path.startsWith(prefix) && path !== prefix && !location.hash) {
            var sub = path.slice(prefix.length).replace(/\/$/, '').replace(/^spa\/?/, '');
            if (sub) location.hash = '#/' + sub;
        }
    },
};

document.addEventListener('DOMContentLoaded', function() { App.init(); });
