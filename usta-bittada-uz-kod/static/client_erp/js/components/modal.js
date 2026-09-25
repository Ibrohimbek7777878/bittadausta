/* client_erp/js/components/modal.js — Universal modal */
var Modal = {
    _o: null,
    _onClose: null,
    _escHandler: null,
    open: function(title, bodyHtml, opts) {
        opts = opts || {};
        this.close();
        var ov = document.createElement('div');
        ov.className = 'ce-modal-overlay';
        ov.innerHTML = '<div class="ce-modal-dialog">' +
            '<div class="ce-modal-header"><h3>' + title + '</h3>' +
            '<button class="ce-modal-close" onclick="Modal.close()">&times;</button></div>' +
            '<div class="ce-modal-body">' + bodyHtml + '</div>' +
            (opts.footer ? '<div class="ce-modal-footer">' + opts.footer + '</div>' : '') +
            '</div>';
        ov.addEventListener('click', function(e) { if (e.target === ov) Modal.close(); });
        document.body.appendChild(ov);
        document.body.classList.add('modal-open');
        this._o = ov;
        this._onClose = opts.onClose || null;
        this._escHandler = function(e) { if (e.key === 'Escape') Modal.close(); };
        document.addEventListener('keydown', this._escHandler);
        requestAnimationFrame(function() {
            var inp = ov.querySelector('input:not([type="hidden"]):not([type="checkbox"]), textarea, select');
            if (inp) inp.focus();
        });
    },
    close: function() {
        if (this._o) {
            this._o.remove();
            this._o = null;
            document.body.classList.remove('modal-open');
            if (this._escHandler) { document.removeEventListener('keydown', this._escHandler); this._escHandler = null; }
            if (this._onClose) this._onClose();
            this._onClose = null;
        }
    },
    confirm: function(title, msg, onConfirm) {
        this.open(title, '<p style="font-size:14px">' + msg + '</p>', {
            footer: '<button class="ce-btn ce-btn-secondary" onclick="Modal.close()">Bekor</button>' +
                '<button class="ce-btn ce-btn-primary" id="modal-ok">Tasdiqlash</button>',
        });
        document.getElementById('modal-ok').onclick = function() { Modal.close(); onConfirm(); };
    },
    getFormData: function() {
        if (!this._o) return {};
        var d = {};
        this._o.querySelectorAll('[name]').forEach(function(el) {
            if (el.type === 'checkbox') d[el.name] = el.checked;
            else if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; }
            else if (el.classList.contains('ce-money-input')) d[el.name] = String(Utils.rawMoney(el.value));
            else d[el.name] = el.value;
        });
        return d;
    },
};
