/* client_erp/js/pages/zamers.js — 3D Zamerlar sahifasi */
var Zamers = {
    _zamers: [],

    render: function() {
        var app = document.getElementById('app');
        app.innerHTML = Skeleton.genericList();
        WS.send('page.zamers', {}, function(msg) {
            if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
            Zamers._zamers = msg.data.zamers || [];
            app.innerHTML = Zamers.template(Zamers._zamers);
            Zamers.bind();
        });
    },

    template: function(zamers) {
        var h = '';
        h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">';
        h += '<h2 style="font-size:18px;margin:0"><i class="fas fa-ruler-combined" style="color:var(--accent);margin-right:6px"></i> 3D Zamerlar</h2>';
        h += '<div style="display:flex;align-items:center;gap:8px">';
        // BLE Lazer O'lchagich — mavjud ble-adapter.js panelini ochadi (o'lchov olish uchun)
        h += '<button class="ce-btn ce-btn-sm" id="zm-ble-btn" onclick="if(typeof BLE!==\'undefined\'){BLE.togglePanel();}else{Toast&&Toast.error(\'BLE moduli yuklanmagan\');}" style="font-size:12px;padding:6px 12px;background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe"><i class="fas fa-satellite-dish" style="margin-right:4px"></i>BLE o\'lchagich</button>';
        h += '<button class="ce-btn ce-btn-sm" id="zm-new-btn" style="font-size:12px;padding:6px 14px"><i class="fas fa-plus" style="margin-right:4px"></i>Yangi zamer</button>';
        h += '</div>';
        h += '</div>';

        if (!zamers.length) {
            h += '<div class="ce-empty">';
            h += '<div class="ce-empty-icon"><i class="fas fa-ruler-combined"></i></div>';
            h += '<p>Zamerlar hali yo\'q</p>';
            h += '<div style="font-size:12px;color:var(--text-muted)">Yangi zamer qo\'shish uchun "Yangi zamer" tugmasini bosing</div>';
            h += '</div>';
            return h;
        }

        h += '<div class="zm-grid">';
        zamers.forEach(function(z) {
            h += '<div class="zm-card" data-id="'+z.id+'">';
            h += '<div class="zm-thumb">';
            if (z.thumbnail) {
                h += '<img src="'+Utils.esc(z.thumbnail)+'" alt="" loading="lazy">';
            } else {
                h += '<div class="zm-thumb-empty"><i class="fas fa-cube"></i></div>';
            }
            h += '<div class="zm-badge-3d">3D</div>';
            if (z.blocks_count > 0) {
                h += '<div class="zm-badge-blocks"><i class="fas fa-cubes"></i> '+z.blocks_count+'</div>';
            }
            h += '</div>';
            h += '<div class="zm-info">';
            h += '<div class="zm-name">'+Utils.esc(z.room_name || 'Xona #'+z.id)+'</div>';

            var dims = [];
            if (z.width) dims.push(Math.ceil(z.width));
            if (z.height) dims.push(Math.ceil(z.height));
            if (z.depth) dims.push(Math.ceil(z.depth));
            var dimStr = dims.length ? dims.join(' × ') + ' mm' : '';

            var meta = [];
            if (dimStr) meta.push(dimStr);
            if (z.order_hash) meta.push('#'+Utils.esc(z.order_hash));
            if (z.created_at) meta.push(Utils.timeAgo(z.created_at));
            if (meta.length) h += '<div class="zm-meta">'+meta.join(' · ')+'</div>';

            var hasLinks = z.order_hash || z.client_order_id;
            if (hasLinks) {
                h += '<div class="zm-links" style="display:flex;gap:4px;margin-top:5px;flex-wrap:wrap">';
                if (z.order_hash) {
                    h += '<button class="zm-btn-mc" data-hash="'+Utils.esc(z.order_hash)+'" style="font-size:10px;padding:2px 7px;border-radius:5px;border:1px solid rgba(99,102,241,.25);background:rgba(99,102,241,.08);color:#6366f1;cursor:pointer;display:flex;align-items:center;gap:3px"><i class="fas fa-industry" style="font-size:8px"></i>#'+Utils.esc(z.order_hash)+'</button>';
                }
                if (z.client_order_id) {
                    h += '<button class="zm-btn-erp" data-id="'+z.client_order_id+'" style="font-size:10px;padding:2px 7px;border-radius:5px;border:1px solid rgba(16,185,129,.25);background:rgba(16,185,129,.08);color:#10b981;cursor:pointer;display:flex;align-items:center;gap:3px"><i class="fas fa-clipboard-list" style="font-size:8px"></i>'+Utils.esc(z.client_order_title || 'Buyurtma')+'</button>';
                }
                h += '</div>';
            }
            if (!z.client_order_id) {
                h += '<button class="zm-btn-link" data-zid="'+z.id+'" style="font-size:10px;padding:2px 7px;margin-top:4px;border-radius:5px;border:1px dashed var(--text-muted);background:transparent;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;gap:3px"><i class="fas fa-link" style="font-size:8px"></i>Bog\'lash</button>';
            }

            h += '</div>';
            h += '</div>';
        });
        h += '</div>';

        h += '<style>';
        h += '.zm-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}';
        h += '@media(min-width:600px){.zm-grid{grid-template-columns:repeat(3,1fr)}}';
        h += '.zm-card{border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08);cursor:pointer;transition:transform .2s,box-shadow .2s}';
        h += '.zm-card:active{transform:scale(.97)}';
        h += '.zm-thumb{position:relative;aspect-ratio:1;overflow:hidden;background:#f1f5f9}';
        h += '.zm-thumb img{width:100%;height:100%;object-fit:cover}';
        h += '.zm-thumb-empty{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:36px}';
        h += '.zm-badge-3d{position:absolute;top:6px;left:6px;background:rgba(0,0,0,.65);color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;backdrop-filter:blur(4px)}';
        h += '.zm-badge-blocks{position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.65);color:#fff;font-size:10px;padding:2px 6px;border-radius:6px;backdrop-filter:blur(4px)}';
        h += '.zm-info{padding:8px 10px}';
        h += '.zm-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
        h += '.zm-meta{font-size:11px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
        h += '</style>';

        return h;
    },

    bind: function() {
        var newBtn = document.getElementById('zm-new-btn');
        if (newBtn) newBtn.addEventListener('click', function() { Zamers._openNewZamer(); });

        document.querySelectorAll('.zm-card').forEach(function(card) {
            card.addEventListener('click', function(e) {
                if (e.target.closest('.zm-btn-mc') || e.target.closest('.zm-btn-erp') || e.target.closest('.zm-btn-link')) return;
                var zid = parseInt(card.dataset.id);
                var z = null;
                for (var i = 0; i < Zamers._zamers.length; i++) {
                    if (Zamers._zamers[i].id === zid) { z = Zamers._zamers[i]; break; }
                }
                if (z && z.zamer_url) {
                    Zamers._openIframe(z.zamer_url, z.room_name || 'Zamer #'+z.id);
                } else if (z) {
                    Zamers._openZamerDetail(z);
                }
            });
        });
        document.querySelectorAll('.zm-btn-mc').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var hash = btn.dataset.hash;
                Zamers._openIframe('/order/' + hash + '/', '#' + hash);
            });
        });
        document.querySelectorAll('.zm-btn-erp').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                Router.go('/orders/' + btn.dataset.id);
            });
        });
        document.querySelectorAll('.zm-btn-link').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                Zamers._showLinkModal(parseInt(btn.dataset.zid));
            });
        });
    },

    _openNewZamer: function() {
        fetch('/mini/api/zamer-new/', {
            method: 'GET',
            credentials: 'same-origin',
        }).then(function(r) { return r.json(); }).then(function(d) {
            if (d.ok && d.iframe_url) {
                Zamers._openIframe(d.iframe_url, 'Yangi zamer');
            } else {
                Toast.error('Xatolik');
            }
        }).catch(function() { Toast.error('Server xatolik'); });
    },

    _openIframe: function(url, title) {
        var ov = document.createElement('div');
        ov.className = 'mc-iframe-overlay';
        ov.innerHTML =
            '<div class="mc-iframe-wrap">' +
                '<div class="mc-iframe-header">' +
                    '<button class="mc-iframe-back" id="zm-ifr-back"><i class="fas fa-arrow-left"></i></button>' +
                    '<span class="mc-iframe-title">' + Utils.esc(title) + '</span>' +
                    '<button class="mc-iframe-close" id="zm-ifr-close">&times;</button>' +
                '</div>' +
                '<div class="mc-iframe-body">' +
                    '<div class="mc-iframe-loading"><div class="mc-iframe-spinner"></div></div>' +
                    '<iframe src="' + url + '" frameborder="0"></iframe>' +
                '</div>' +
            '</div>';
        document.body.appendChild(ov);
        document.body.classList.add('modal-open');
        Zamers._ifrOverlay = ov;
        var iframe = ov.querySelector('iframe');
        var loading = ov.querySelector('.mc-iframe-loading');
        iframe.onload = function() { loading.style.display = 'none'; };
        function close() {
            if (Zamers._ifrOverlay) { Zamers._ifrOverlay.remove(); Zamers._ifrOverlay = null; document.body.classList.remove('modal-open'); }
            document.removeEventListener('keydown', escH);
            Zamers.render();
        }
        ov.querySelector('#zm-ifr-back').onclick = close;
        ov.querySelector('#zm-ifr-close').onclick = close;
        ov.addEventListener('click', function(e) { if (e.target === ov) close(); });
        var escH = function(e) { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', escH);
    },

    _openZamerDetail: function(z) {
        var dims = [];
        if (z.width) dims.push('<b>Eni:</b> '+Math.ceil(z.width)+' mm');
        if (z.height) dims.push('<b>Bo\'yi:</b> '+Math.ceil(z.height)+' mm');
        if (z.depth) dims.push('<b>Chuqurligi:</b> '+Math.ceil(z.depth)+' mm');
        if (z.length) dims.push('<b>Uzunligi:</b> '+Math.ceil(z.length)+' mm');

        var body = '';
        if (z.thumbnail) {
            body += '<div style="text-align:center;margin-bottom:12px"><img src="'+Utils.esc(z.thumbnail)+'" style="max-width:100%;max-height:200px;border-radius:10px;object-fit:contain"></div>';
        }
        if (dims.length) {
            body += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">';
            dims.forEach(function(d) { body += '<div style="font-size:12px;padding:6px 8px;background:var(--bg-secondary);border-radius:6px">'+d+'</div>'; });
            body += '</div>';
        }
        if (z.blocks_count) {
            body += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px"><i class="fas fa-cubes" style="margin-right:4px"></i>'+z.blocks_count+' ta mebel blok</div>';
        }
        if (z.note) {
            body += '<div style="font-size:12px;color:var(--text-muted);padding:8px;background:var(--bg-secondary);border-radius:8px;margin-top:6px">'+Utils.esc(z.note)+'</div>';
        }

        Modal.open(Utils.esc(z.room_name || 'Zamer #'+z.id), body);
    },

    _linkOrders: [],
    _linkSelected: null,

    _showLinkModal: function(zamerId) {
        Zamers._linkSelected = null;
        Zamers._linkOrders = [];

        var body = '';
        body += '<input id="zm-link-search" class="ce-input" placeholder="Qidirish..." style="width:100%;font-size:13px;margin-bottom:8px;padding:8px 10px;border-radius:8px">';
        body += '<div id="zm-link-list" style="max-height:50vh;overflow-y:auto;margin-bottom:4px">';
        body += '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px"><i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...</div>';
        body += '</div>';

        Modal.open('Buyurtmaga bog\'lash', body, {
            footer: '<button class="ce-btn ce-btn-primary" id="zm-link-save" disabled style="opacity:.5">Bog\'lash</button>'
        });

        setTimeout(function() {
            var saveBtn = document.getElementById('zm-link-save');
            if (saveBtn) saveBtn.onclick = function() {
                if (!Zamers._linkSelected) { Toast.error('Buyurtma tanlang'); return; }
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                WS.send('zamer.link', {zamer_id: zamerId, client_order_id: Zamers._linkSelected}, function(msg) {
                    if (msg.ok) { Toast.success('Bog\'landi!'); Modal.close(); Zamers.render(); }
                    else { Toast.error(msg.error || 'Xatolik'); saveBtn.disabled = false; saveBtn.textContent = 'Bog\'lash'; }
                });
            };

            var searchInput = document.getElementById('zm-link-search');
            if (searchInput) {
                searchInput.oninput = function() { Zamers._filterLinkOrders(searchInput.value); };
                searchInput.focus();
            }
        }, 50);

        WS.send('page.orders', {}, function(msg) {
            if (!msg.ok) return;
            Zamers._linkOrders = msg.data.orders || [];
            Zamers._renderLinkOrders(Zamers._linkOrders);
        });
    },

    _renderLinkOrders: function(orders) {
        var list = document.getElementById('zm-link-list');
        if (!list) return;

        if (!orders.length) {
            list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">Buyurtma topilmadi</div>';
            return;
        }

        var h = '';
        orders.forEach(function(o) {
            var sel = Zamers._linkSelected === o.id;
            var statusColor = o.status === 'completed' ? '#10b981' : o.status === 'in_progress' ? '#3b82f6' : o.status === 'cancelled' ? '#ef4444' : '#f59e0b';
            var date = o.created_at ? Utils.timeAgo(o.created_at) : '';

            h += '<div class="zm-link-item" data-id="'+o.id+'" style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;cursor:pointer;margin-bottom:4px;border:2px solid '+(sel?'var(--accent)':'transparent')+';background:'+(sel?'rgba(99,102,241,.06)':'var(--bg-secondary)')+';transition:all .15s">';
            h += '<div style="width:36px;height:36px;border-radius:8px;background:'+statusColor+'15;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-clipboard-list" style="color:'+statusColor+';font-size:13px"></i></div>';
            h += '<div style="flex:1;min-width:0">';
            h += '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+Utils.esc(o.title)+'</div>';
            var meta = [];
            if (o.customer && o.customer.name) meta.push(Utils.esc(o.customer.name));
            if (date) meta.push(date);
            if (meta.length) h += '<div style="font-size:11px;color:var(--text-muted);margin-top:1px">'+meta.join(' · ')+'</div>';
            h += '</div>';
            if (sel) h += '<i class="fas fa-check-circle" style="color:var(--accent);font-size:16px;flex-shrink:0"></i>';
            h += '</div>';
        });

        list.innerHTML = h;

        list.querySelectorAll('.zm-link-item').forEach(function(item) {
            item.onclick = function() {
                var id = parseInt(item.dataset.id);
                Zamers._linkSelected = id;
                var saveBtn = document.getElementById('zm-link-save');
                if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
                Zamers._renderLinkOrders(Zamers._linkOrders.filter(function(o) {
                    var q = (document.getElementById('zm-link-search') || {}).value || '';
                    if (!q) return true;
                    q = q.toLowerCase();
                    var txt = (o.title + ' ' + (o.customer ? o.customer.name : '')).toLowerCase();
                    return txt.indexOf(q) !== -1;
                }));
            };
        });
    },

    _filterLinkOrders: function(query) {
        var q = (query || '').toLowerCase().trim();
        var filtered = Zamers._linkOrders.filter(function(o) {
            if (!q) return true;
            var txt = (o.title + ' ' + (o.customer ? o.customer.name : '')).toLowerCase();
            return txt.indexOf(q) !== -1;
        });
        Zamers._renderLinkOrders(filtered);
    },
};
