/* client_erp/js/pages/vizualizatsiya.js — 360° VR Galeriya */
var Vizualizatsiya = {
    _galleries: [],
    _pollTimer: null,

    render: function() {
        Vizualizatsiya._stopPoll();
        var app = document.getElementById('app');
        app.innerHTML = Skeleton.genericList();
        Vizualizatsiya._load();
    },

    // AI-VR generatsiya (fal/PanoPulse) hali "pending" bo'lgan gallery bo'lsa,
    // sahifa shu yerda o'zi qayta so'rab turadi — task_id'ni frontendda
    // saqlab yurishga hojat yo'q, holat backend'da (PanoramaGallery) yashaydi,
    // shuning uchun sahifadan chiqib qaytib kelsa yoki reload qilsa ham ishlaydi.
    _load: function() {
        WS.send('page.vizualizatsiya', {}, function(msg) {
            if (STATE.currentPage !== '/vizualizatsiya') return;
            if (!msg.ok) return Toast.error(msg.error || 'Xatolik');
            Vizualizatsiya._galleries = msg.data.galleries || [];
            var app = document.getElementById('app');
            app.innerHTML = Vizualizatsiya.template(Vizualizatsiya._galleries);
            Vizualizatsiya.bind();
            Vizualizatsiya._scheduleRepollIfNeeded();
        });
    },

    _scheduleRepollIfNeeded: function() {
        Vizualizatsiya._stopPoll();
        var hasPending = Vizualizatsiya._galleries.some(function(g) { return g.pending; });
        if (!hasPending) return;
        Vizualizatsiya._pollTimer = setTimeout(function() {
            if (STATE.currentPage !== '/vizualizatsiya') return;
            Vizualizatsiya._load();
        }, 5000);
    },

    _stopPoll: function() {
        if (Vizualizatsiya._pollTimer) { clearTimeout(Vizualizatsiya._pollTimer); Vizualizatsiya._pollTimer = null; }
    },

    template: function(galleries) {
        var h = '';
        h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">';
        h += '<h2 style="font-size:18px;margin:0">🌐 Vizualizatsiya</h2>';
        h += '<button class="ce-btn ce-btn-sm" id="vz-upload-btn" style="font-size:12px;padding:6px 14px"><i class="fas fa-plus" style="margin-right:4px"></i>Yuklash</button>';
        h += '</div>';

        if (!galleries.length) {
            h += '<div class="ce-empty">';
            h += '<div class="ce-empty-icon">🌐</div>';
            h += '<p>360° panoramalar hali yo\'q</p>';
            h += '<div style="font-size:12px;color:var(--text-muted)">360° rasmlarni yuklash uchun "Yuklash" tugmasini bosing</div>';
            h += '</div>';
            return h;
        }

        h += '<div class="vz-grid">';
        galleries.forEach(function(g) {
            h += '<div class="vz-card'+(g.pending?' vz-card-pending':'')+'" data-uuid="'+Utils.esc(g.uuid)+'"'+(g.pending?' data-pending="1"':'')+'>';
            h += '<div class="vz-thumb">';
            if (g.pending) {
                h += '<div class="vz-thumb-loading"><div class="vz-spin"></div><div class="vz-loading-label">Yaratilmoqda...</div></div>';
            } else if (g.thumbnail) {
                h += '<img src="'+Utils.esc(g.thumbnail)+'" alt="" loading="lazy">';
            } else {
                h += '<div class="vz-thumb-empty"><i class="fas fa-globe-americas"></i></div>';
            }
            h += '<div class="vz-badge-360">360°</div>';
            if (g.panorama_count > 1) {
                h += '<div class="vz-badge-count"><i class="fas fa-images"></i> '+g.panorama_count+'</div>';
            }
            h += '</div>';
            h += '<div class="vz-info">';
            h += '<div class="vz-name">'+Utils.esc(g.name || 'Panorama')+'</div>';
            var meta = [];
            if (g.order_hash) meta.push('#'+Utils.esc(g.order_hash));
            if (g.designer_name) meta.push(Utils.esc(g.designer_name));
            if (g.created_at) meta.push(Utils.timeAgo(g.created_at));
            if (meta.length) h += '<div class="vz-meta">'+meta.join(' · ')+'</div>';

            var hasLinks = g.order_hash || g.client_order_id;
            if (hasLinks) {
                h += '<div class="vz-links" style="display:flex;gap:4px;margin-top:5px;flex-wrap:wrap">';
                if (g.order_hash) {
                    h += '<button class="vz-btn-mc" data-hash="'+Utils.esc(g.order_hash)+'" style="font-size:10px;padding:2px 7px;border-radius:5px;border:1px solid rgba(99,102,241,.25);background:rgba(99,102,241,.08);color:#6366f1;cursor:pointer;display:flex;align-items:center;gap:3px"><i class="fas fa-industry" style="font-size:8px"></i>#'+Utils.esc(g.order_hash)+'</button>';
                }
                if (g.client_order_id) {
                    h += '<button class="vz-btn-erp" data-id="'+g.client_order_id+'" style="font-size:10px;padding:2px 7px;border-radius:5px;border:1px solid rgba(16,185,129,.25);background:rgba(16,185,129,.08);color:#10b981;cursor:pointer;display:flex;align-items:center;gap:3px"><i class="fas fa-clipboard-list" style="font-size:8px"></i>'+Utils.esc(g.client_order_title || 'Buyurtma')+'</button>';
                }
                h += '</div>';
            }
            if (!g.client_order_id) {
                h += '<button class="vz-btn-link" data-uuid="'+Utils.esc(g.uuid)+'" style="font-size:10px;padding:2px 7px;margin-top:4px;border-radius:5px;border:1px dashed var(--text-muted);background:transparent;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;gap:3px"><i class="fas fa-link" style="font-size:8px"></i>Bog\'lash</button>';
            }

            h += '</div>';
            h += '</div>';
        });
        h += '</div>';

        h += '<style>';
        h += '.vz-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}';
        h += '@media(min-width:600px){.vz-grid{grid-template-columns:repeat(3,1fr)}}';
        h += '.vz-card{border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08);cursor:pointer;transition:transform .2s,box-shadow .2s}';
        h += '.vz-card:active{transform:scale(.97)}';
        h += '.vz-thumb{position:relative;aspect-ratio:1;overflow:hidden;background:#f1f5f9}';
        h += '.vz-thumb img{width:100%;height:100%;object-fit:cover}';
        h += '.vz-thumb-empty{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:36px}';
        h += '.vz-badge-360{position:absolute;top:6px;left:6px;background:rgba(0,0,0,.65);color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;backdrop-filter:blur(4px)}';
        h += '.vz-badge-count{position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.65);color:#fff;font-size:10px;padding:2px 6px;border-radius:6px;backdrop-filter:blur(4px)}';
        h += '.vz-info{padding:8px 10px}';
        h += '.vz-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
        h += '.vz-meta{font-size:11px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
        h += '.vz-card-pending{cursor:default}';
        h += '.vz-thumb-loading{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:linear-gradient(135deg,#f1f5f9,#e2e8f0);color:#94a3b8}';
        h += '.vz-spin{width:22px;height:22px;border:3px solid rgba(99,102,241,.2);border-top-color:#6366f1;border-radius:50%;animation:vz-spin-rot .8s linear infinite}';
        h += '.vz-loading-label{font-size:10px;font-weight:600}';
        h += '@keyframes vz-spin-rot{to{transform:rotate(360deg)}}';
        h += '</style>';

        return h;
    },

    bind: function() {
        document.querySelectorAll('.vz-card').forEach(function(card) {
            card.addEventListener('click', function(e) {
                if (e.target.closest('.vz-btn-mc') || e.target.closest('.vz-btn-erp') || e.target.closest('.vz-btn-link')) return;
                if (card.dataset.pending) return;
                var uuid = card.dataset.uuid;
                if (uuid) Vizualizatsiya.openViewer(uuid);
            });
        });
        document.querySelectorAll('.vz-btn-mc').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                Vizualizatsiya._openMcOrder(btn.dataset.hash);
            });
        });
        document.querySelectorAll('.vz-btn-erp').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                Router.go('/orders/' + btn.dataset.id);
            });
        });
        document.querySelectorAll('.vz-btn-link').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                Vizualizatsiya._showLinkModal(btn.dataset.uuid);
            });
        });
        var uploadBtn = document.getElementById('vz-upload-btn');
        if (uploadBtn) uploadBtn.addEventListener('click', function() { Vizualizatsiya.openUpload(); });
    },

    openViewer: function(uuid) {
        var username = STATE.user && STATE.user.username;
        if (!username) return;
        window.location.href = '/mini/' + encodeURIComponent(username) + '/panorama/' + encodeURIComponent(uuid) + '/';
    },

    openUpload: function() {
        var username = STATE.user && STATE.user.username;
        if (!username) return;
        window.location.href = '/mini/' + encodeURIComponent(username) + '/panorama/upload/';
    },

    _openMcOrder: function(hash) {
        var ov = document.createElement('div');
        ov.className = 'mc-iframe-overlay';
        ov.innerHTML =
            '<div class="mc-iframe-wrap">' +
                '<div class="mc-iframe-header">' +
                    '<button class="mc-iframe-back" id="vz-mc-back"><i class="fas fa-arrow-left"></i></button>' +
                    '<span class="mc-iframe-title">#' + Utils.esc(hash) + '</span>' +
                    '<button class="mc-iframe-close" id="vz-mc-close">&times;</button>' +
                '</div>' +
                '<div class="mc-iframe-body">' +
                    '<div class="mc-iframe-loading"><div class="mc-iframe-spinner"></div></div>' +
                    '<iframe src="/order/' + Utils.esc(hash) + '/" frameborder="0"></iframe>' +
                '</div>' +
            '</div>';
        document.body.appendChild(ov);
        document.body.classList.add('modal-open');
        Vizualizatsiya._mcOverlay = ov;
        var iframe = ov.querySelector('iframe');
        var loading = ov.querySelector('.mc-iframe-loading');
        iframe.onload = function() { loading.style.display = 'none'; };
        function close() {
            if (Vizualizatsiya._mcOverlay) { Vizualizatsiya._mcOverlay.remove(); Vizualizatsiya._mcOverlay = null; document.body.classList.remove('modal-open'); }
            document.removeEventListener('keydown', escH);
        }
        ov.querySelector('#vz-mc-back').onclick = close;
        ov.querySelector('#vz-mc-close').onclick = close;
        ov.addEventListener('click', function(e) { if (e.target === ov) close(); });
        var escH = function(e) { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', escH);
    },

    _linkOrders: [],
    _linkSelected: null,

    _showLinkModal: function(galleryUuid) {
        Vizualizatsiya._linkSelected = null;
        Vizualizatsiya._linkOrders = [];

        var body = '';
        body += '<input id="vz-link-search" class="ce-input" placeholder="Qidirish..." style="width:100%;font-size:13px;margin-bottom:8px;padding:8px 10px;border-radius:8px">';
        body += '<div id="vz-link-list" style="max-height:50vh;overflow-y:auto;margin-bottom:4px">';
        body += '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px"><i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...</div>';
        body += '</div>';

        Modal.open('Buyurtmaga bog\'lash', body, {
            footer: '<button class="ce-btn ce-btn-primary" id="vz-link-save" disabled style="opacity:.5">Bog\'lash</button>'
        });

        setTimeout(function() {
            var saveBtn = document.getElementById('vz-link-save');
            if (saveBtn) saveBtn.onclick = function() {
                if (!Vizualizatsiya._linkSelected) { Toast.error('Buyurtma tanlang'); return; }
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                WS.send('panorama.link', {gallery_uuid: galleryUuid, client_order_id: Vizualizatsiya._linkSelected}, function(msg) {
                    if (msg.ok) { Toast.success('Bog\'landi!'); Modal.close(); Vizualizatsiya.render(); }
                    else { Toast.error(msg.error || 'Xatolik'); saveBtn.disabled = false; saveBtn.textContent = 'Bog\'lash'; }
                });
            };

            var searchInput = document.getElementById('vz-link-search');
            if (searchInput) {
                searchInput.oninput = function() { Vizualizatsiya._filterLinkOrders(searchInput.value); };
                searchInput.focus();
            }
        }, 50);

        WS.send('page.orders', {}, function(msg) {
            if (!msg.ok) return;
            Vizualizatsiya._linkOrders = msg.data.orders || [];
            Vizualizatsiya._renderLinkOrders(Vizualizatsiya._linkOrders);
        });
    },

    _renderLinkOrders: function(orders) {
        var list = document.getElementById('vz-link-list');
        if (!list) return;

        if (!orders.length) {
            list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">Buyurtma topilmadi</div>';
            return;
        }

        var h = '';
        orders.forEach(function(o) {
            var sel = Vizualizatsiya._linkSelected === o.id;
            var statusColor = o.status === 'completed' ? '#10b981' : o.status === 'in_progress' ? '#3b82f6' : o.status === 'cancelled' ? '#ef4444' : '#f59e0b';
            var date = o.created_at ? Utils.timeAgo(o.created_at) : '';

            h += '<div class="vz-link-item" data-id="'+o.id+'" style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;cursor:pointer;margin-bottom:4px;border:2px solid '+(sel?'var(--accent)':'transparent')+';background:'+(sel?'rgba(99,102,241,.06)':'var(--bg-secondary)')+';transition:all .15s">';
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

        list.querySelectorAll('.vz-link-item').forEach(function(item) {
            item.onclick = function() {
                var id = parseInt(item.dataset.id);
                Vizualizatsiya._linkSelected = id;
                var saveBtn = document.getElementById('vz-link-save');
                if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
                Vizualizatsiya._renderLinkOrders(Vizualizatsiya._linkOrders.filter(function(o) {
                    var q = (document.getElementById('vz-link-search') || {}).value || '';
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
        var filtered = Vizualizatsiya._linkOrders.filter(function(o) {
            if (!q) return true;
            var txt = (o.title + ' ' + (o.customer ? o.customer.name : '')).toLowerCase();
            return txt.indexOf(q) !== -1;
        });
        Vizualizatsiya._renderLinkOrders(filtered);
    },
};
