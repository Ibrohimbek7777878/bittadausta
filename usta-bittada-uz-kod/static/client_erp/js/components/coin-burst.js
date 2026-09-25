/* client_erp/js/components/coin-burst.js — Game-quality coin-burst animation (XP award/clawback) */
var CoinBurst = {
    _styleInjected: false,
    _audioCtx: null,

    _injectStyle: function() {
        if (this._styleInjected) return;
        this._styleInjected = true;
        var css = [
            '.cb-layer{position:fixed;inset:0;pointer-events:none;z-index:10500;overflow:hidden;}',
            '.cb-coin{position:absolute;width:26px;height:26px;border-radius:50%;',
            'background:radial-gradient(circle at 32% 28%, #fff7cf 0%, #ffe066 12%, #ffd700 42%, #e8a900 68%, #b8860b 100%);',
            'box-shadow:0 0 6px 1px rgba(255,215,0,.55), 0 2px 6px rgba(0,0,0,.35), inset 0 0 3px rgba(255,255,255,.6);',
            'display:flex;align-items:center;justify-content:center;',
            'font-size:12px;font-weight:800;color:#8a5b00;text-shadow:0 1px 0 rgba(255,255,255,.4);',
            'will-change:transform,opacity;opacity:0;}',
            '.cb-coin::before{content:"$";}',
            '.cb-coin.cb-out{animation:cbFlyOut var(--cb-dur,900ms) cubic-bezier(.17,.89,.32,1.5) forwards,',
            'cbSpin var(--cb-dur,900ms) linear forwards;}',
            '.cb-coin.cb-in{animation:cbFlyIn var(--cb-dur,750ms) cubic-bezier(.55,0,.85,.35) forwards,',
            'cbSpin var(--cb-dur,750ms) linear forwards;}',
            '.cb-coin.cb-in{background:radial-gradient(circle at 32% 28%, #ffe9e9 0%, #ff9a9a 12%, #e34848 42%, #b32424 68%, #7a1414 100%);',
            'box-shadow:0 0 6px 1px rgba(227,72,72,.55), 0 2px 6px rgba(0,0,0,.35), inset 0 0 3px rgba(255,255,255,.5);',
            'color:#5a0f0f;}',
            '@keyframes cbFlyOut{',
            '0%{opacity:0;transform:translate(var(--x0,0),var(--y0,0)) scale(.3) scaleX(1);}',
            '8%{opacity:1;transform:translate(var(--x0,0),var(--y0,0)) scale(1.25) scaleX(1);}',
            '20%{transform:translate(calc(var(--x0,0) + var(--dx,0)*.35), calc(var(--y0,0) + var(--dy,0)*.35 - 14px)) scale(1) scaleX(1);}',
            '70%{opacity:1;transform:translate(calc(var(--x0,0) + var(--dx,0)*.85), calc(var(--y0,0) + var(--dy,0)*.85 + var(--fall,40px))) scale(1) scaleX(1);}',
            '100%{opacity:0;transform:translate(calc(var(--x0,0) + var(--dx,0)), calc(var(--y0,0) + var(--dy,0) + var(--fall,90px) + 30px)) scale(.5) scaleX(1);}',
            '}',
            '@keyframes cbFlyIn{',
            '0%{opacity:0;transform:translate(calc(var(--x0,0) + var(--dx,0)), calc(var(--y0,0) + var(--dy,0))) scale(1) scaleX(1);}',
            '10%{opacity:1;transform:translate(calc(var(--x0,0) + var(--dx,0)*.9), calc(var(--y0,0) + var(--dy,0)*.9)) scale(1) scaleX(1);}',
            '75%{opacity:1;transform:translate(calc(var(--x0,0) + var(--dx,0)*.15), calc(var(--y0,0) + var(--dy,0)*.15)) scale(.85) scaleX(1);}',
            '100%{opacity:0;transform:translate(var(--x0,0), var(--y0,0)) scale(.15) scaleX(1);}',
            '}',
            '@keyframes cbSpin{',
            '0%{}',
            '25%{}',
            '}',
            '.cb-coin.cb-out,.cb-coin.cb-in{}',
        ].join('');
        // Spin (edge-flip) handled via a separate inline element to combine transforms cleanly.
        var css2 = [
            '.cb-coin-inner{width:100%;height:100%;border-radius:50%;animation:cbFlip var(--cb-flip,420ms) linear infinite;}',
            '@keyframes cbFlip{0%{transform:scaleX(1);}50%{transform:scaleX(.12);}100%{transform:scaleX(1);}}',
        ].join('');
        var tag = document.createElement('style');
        tag.id = 'cb-styles';
        tag.textContent = css + css2;
        document.head.appendChild(tag);
    },

    _getOrigin: function() {
        var c = document.getElementById('toast-container');
        if (c) {
            var r = c.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: Math.max(r.top, 20) + 20 };
        }
        return { x: window.innerWidth / 2, y: 60 };
    },

    _beep: function(freq, delay, dur, type) {
        try {
            if (!this._audioCtx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                this._audioCtx = new AC();
            }
            var ctx = this._audioCtx;
            var t0 = ctx.currentTime + delay / 1000;
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(freq, t0);
            gain.gain.setValueAtTime(0, t0);
            gain.gain.linearRampToValueAtTime(.16, t0 + .01);
            gain.gain.exponentialRampToValueAtTime(.001, t0 + dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + dur + .02);
        } catch (e) { /* audio not available — silently skip */ }
    },

    _playAward: function() {
        // Rising arpeggio "coin ding" chime across the burst — 4 notes.
        var notes = [1046.5, 1318.5, 1568, 2093]; // C6 E6 G6 C7
        var self = this;
        notes.forEach(function(f, i) {
            self._beep(f, i * 90, .28, 'triangle');
        });
    },

    _playLoss: function() {
        // Descending lower-pitched "loss" tone — 3 notes falling.
        var notes = [523.3, 415.3, 311.1]; // C5 -> Ab4 -> Eb4
        var self = this;
        notes.forEach(function(f, i) {
            self._beep(f, i * 110, .32, 'sawtooth');
        });
    },

    _spawn: function(mode) {
        this._injectStyle();
        var origin = this._getOrigin();
        var layer = document.createElement('div');
        layer.className = 'cb-layer';
        document.body.appendChild(layer);

        var COUNT = 15;
        var isOut = mode === 'out';

        for (var i = 0; i < COUNT; i++) {
            (function(i) {
                var coin = document.createElement('div');
                coin.className = 'cb-coin ' + (isOut ? 'cb-out' : 'cb-in');

                var angle = (Math.PI * 2 * i) / COUNT + (Math.random() * 0.4 - 0.2);
                var dist = isOut ? (90 + Math.random() * 140) : (70 + Math.random() * 120);
                var dx = Math.cos(angle) * dist;
                var dy = Math.sin(angle) * dist * 0.6 - (isOut ? 20 : 0);

                coin.style.setProperty('--x0', origin.x + 'px');
                coin.style.setProperty('--y0', origin.y + 'px');
                coin.style.setProperty('--dx', dx + 'px');
                coin.style.setProperty('--dy', dy + 'px');
                coin.style.setProperty('--fall', (isOut ? (50 + Math.random() * 60) : 0) + 'px');
                coin.style.setProperty('--cb-dur', (isOut ? (800 + Math.random() * 260) : (650 + Math.random() * 220)) + 'ms');
                coin.style.setProperty('--cb-flip', (340 + Math.random() * 160) + 'ms');
                coin.style.left = '0';
                coin.style.top = '0';

                var inner = document.createElement('div');
                inner.className = 'cb-coin-inner';
                coin.appendChild(inner);

                var delay = i * (isOut ? (30 + Math.random() * 20) : (25 + Math.random() * 20));
                setTimeout(function() {
                    layer.appendChild(coin);
                }, delay);

                var totalLife = delay + (isOut ? 1100 : 900);
                setTimeout(function() {
                    if (coin.parentNode) coin.parentNode.removeChild(coin);
                }, totalLife);
            })(i);
        }

        setTimeout(function() {
            if (layer.parentNode) layer.parentNode.removeChild(layer);
        }, isOut ? 1500 : 1300);
    },

    award: function() {
        this._spawn('out');
        this._playAward();
    },

    lost: function() {
        this._spawn('in');
        this._playLoss();
    },
};
