/* client_erp/js/components/toast.js — Toast notifications */
var Toast = {
    _c: null,
    _getC: function() {
        if (!this._c) {
            this._c = document.getElementById('toast-container');
            if (!this._c) {
                this._c = document.createElement('div');
                this._c.id = 'toast-container';
                document.body.appendChild(this._c);
            }
        }
        return this._c;
    },
    show: function(msg, type, dur) {
        var c = this._getC();
        var t = document.createElement('div');
        t.className = 'ce-toast ce-toast-' + (type || 'info');
        var icons = {success:'✅', error:'❌', info:'ℹ️', warning:'⚠️', xp:'⭐'};
        t.innerHTML = (icons[type] || '') + ' ' + msg;
        c.appendChild(t);
        setTimeout(function() {
            t.classList.add('removing');
            setTimeout(function() { t.remove(); }, 300);
        }, dur || 3000);
    },
    success: function(m) { this.show(m, 'success'); },
    error: function(m) { this.show(m, 'error', 5000); },
    info: function(m) { this.show(m, 'info'); },
    warning: function(m) { this.show(m, 'warning', 4000); },
    xp: function(xp, coins) {
        var m = '';
        if (xp > 0) m += '+' + xp + ' XP';
        if (coins > 0) m += (m ? ' | ' : '') + '+' + coins + ' tanga';
        if (m) this.show(m, 'xp', 4000);
    },
    xpLost: function(xp, coins) {
        var m = '';
        if (xp > 0) m += '-' + xp + ' XP';
        if (coins > 0) m += (m ? ' | ' : '') + '-' + coins + ' tanga';
        if (m) this.show(m, 'warning', 4000);
    },
};
