/* bom-settings.js — BOM sozlamalari sahifasi (#/bom-settings).
 * Tur→ombor, tur→usluga (standard/custom, combined), custom mahsulot, o'lchov qoidasi.
 */
window.BomSettings = (function () {
  'use strict';
  var D = null;
  function esc(s) { return (s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json(); });
  }
  function whName(id) { var w = (D.warehouses || []).find(function (x) { return x.id === id; }); return w ? w.name : ('#' + id); }
  function svcName(id) { var s = (D.services || []).find(function (x) { return x.id === id; }); return s ? s.name : ('#' + id); }
  function typeLabel(t) { var x = (D.bom_types || []).find(function (b) { return b[0] === t; }); return x ? x[1] : t; }
  function catName(id) { if (!id) return '—'; var c = (D.categories || []).find(function (x) { return x.id === id; }); return c ? c.name : ('#' + id); }
  function catOptions(sel, placeholder) {
    var cs = (D.categories || []).slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return '<option value="">' + (placeholder || '— kategoriya —') + '</option>' + cs.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
  }
  function typeOptionsBlank(lbl) { return '<option value="">' + (lbl || '— barcha tur —') + '</option>' + typeOptions(); }

  function whOptions(sel) {
    return '<option value="">— ombor —</option>' + (D.warehouses || []).map(function (w) {
      return '<option value="' + w.id + '"' + (w.id === sel ? ' selected' : '') + '>' + esc(w.name) + '</option>';
    }).join('');
  }
  function svcOptions() {
    return '<option value="">— usluga —</option>' + (D.services || []).map(function (s) {
      return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
    }).join('');
  }
  // ── Guruhlangan + qidiruvli usluga tanlovchi ──
  function svcGroup(name) {
    var n = name || '';
    if (/ПРИСАДКА|Присадка|prisadka/i.test(n)) return 'Присадка (parmalash)';
    if (/Распил/i.test(n)) return 'Распил / kesish';
    if (/ПВХ|AGT|ЭГГЕР|Кромк|кромир|kromla|oval kromka/i.test(n)) return 'Кромка (qirra)';
    if (/^VR|Vizualizatsiya|Dizayner|Bazis|Rover|Zamer|Konsultatsiya|Kassa|Sifat/i.test(n)) return 'Loyiha / boshqa';
    return 'Boshqa';
  }
  function svcOptgroups(filter, blankLabel) {
    var f = (filter || '').toLowerCase();
    var groups = {};
    (D.services || []).forEach(function (s) {
      if (f && (s.name || '').toLowerCase().indexOf(f) === -1) return;
      var g = svcGroup(s.name); (groups[g] = groups[g] || []).push(s);
    });
    var order = ['Распил / kesish', 'Кромка (qirra)', 'Присадка (parmalash)', 'Loyiha / boshqa', 'Boshqa'];
    var h = '<option value="">' + (blankLabel || '— usluga —') + '</option>';
    order.forEach(function (g) {
      if (!groups[g]) return;
      h += '<optgroup label="' + g + ' (' + groups[g].length + ')">' +
        groups[g].map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('') + '</optgroup>';
    });
    return h;
  }
  function svcSelect(selId, blankLabel) {
    var bl = blankLabel || '— usluga —';
    return '<div class="bs-svc" style="display:flex;flex-direction:column;gap:4px;grid-column:span 2">' +
      '<input class="bs-svc-q" data-sel="' + selId + '" placeholder="🔍 usluga qidirish…" style="' + FLD + '">' +
      '<select id="' + selId + '" data-blank="' + esc(bl) + '" style="' + FLD + '">' + svcOptgroups('', bl) + '</select></div>';
  }
  function whOptionsExcept(exclude) {
    var ex = exclude || [];
    return '<option value="">+ ombor qo\'shish…</option>' + (D.warehouses || []).filter(function (w) {
      return ex.indexOf(w.id) === -1;
    }).map(function (w) { return '<option value="' + w.id + '">' + esc(w.name) + '</option>'; }).join('');
  }

  // ── Ierarxik (daraxt) kategoriya tanlovchi: Ombor → Kategoriya → sub → sub… ──
  function buildCatIndex() {
    var byWh = {}, byParent = {};
    (D.categories || []).forEach(function (c) {
      if (c.parent_id) { (byParent[c.parent_id] = byParent[c.parent_id] || []).push(c); }
      else { (byWh[c.warehouse_id] = byWh[c.warehouse_id] || []).push(c); }
    });
    function srt(a) { a.sort(function (x, y) { return (x.name || '').localeCompare(y.name || ''); }); }
    Object.keys(byWh).forEach(function (k) { srt(byWh[k]); });
    Object.keys(byParent).forEach(function (k) { srt(byParent[k]); });
    D._catWh = byWh; D._catParent = byParent;
  }
  function catOptsHtml(items, label) {
    return '<option value="">— ' + label + ' —</option>' + (items || []).map(function (c) {
      return '<option value="cat:' + c.id + '">' + esc(c.name) + ((D._catParent || {})[c.id] ? ' ▸' : '') + '</option>';
    }).join('');
  }
  function catCascade(prefix) {
    var h = '<div class="bs-cat" data-prefix="' + prefix + '" style="display:flex;flex-direction:column;gap:5px;grid-column:span 2">';
    h += '<select class="bs-cat-sel" style="' + FLD + '"><option value="">— ombor (kategoriya uchun) —</option>' +
      (D.warehouses || []).map(function (w) { return '<option value="wh:' + w.id + '">🏬 ' + esc(w.name) + '</option>'; }).join('') + '</select>';
    h += '</div>';
    return h;
  }
  function catVal(prefix) {
    var wrap = document.querySelector('.bs-cat[data-prefix="' + prefix + '"]');
    if (!wrap) return '';
    var chosen = '';
    wrap.querySelectorAll('.bs-cat-sel').forEach(function (s) {
      if (s.value && s.value.indexOf('cat:') === 0) chosen = s.value.slice(4);
    });
    return chosen;
  }
  // Cascading change — bir marta document'ga ulanadi
  document.addEventListener('change', function (e) {
    var sel = e.target;
    if (!sel || !sel.classList || !sel.classList.contains('bs-cat-sel') || !D) return;
    var wrap = sel.closest('.bs-cat'); if (!wrap) return;
    var sels = Array.prototype.slice.call(wrap.querySelectorAll('.bs-cat-sel'));
    sels.slice(sels.indexOf(sel) + 1).forEach(function (s) { s.remove(); });   // pastki darajalarni tozalash
    var v = sel.value, children = null, label = 'kategoriya';
    if (v.indexOf('wh:') === 0) { children = (D._catWh || {})[v.slice(3)]; label = 'kategoriya'; }
    else if (v.indexOf('cat:') === 0) { children = (D._catParent || {})[v.slice(4)]; label = 'sub-kategoriya'; }
    if (children && children.length) {
      var ns = document.createElement('select');
      ns.className = 'bs-cat-sel'; ns.style.cssText = FLD;
      ns.innerHTML = catOptsHtml(children, label);
      wrap.appendChild(ns);
    }
  }, false);
  // Usluga qidiruv — input bo'yicha optgrouplarni filtrlaydi
  document.addEventListener('input', function (e) {
    var inp = e.target;
    if (!inp || !inp.classList || !inp.classList.contains('bs-svc-q') || !D) return;
    var sel = document.getElementById(inp.dataset.sel);
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = svcOptgroups(inp.value, sel.dataset.blank);
    if (cur) sel.value = cur;   // tanlovni saqlab qolishga urinish
  }, false);

  // ── Ombor mahsuloti qidiruv-tanlovchi (companion picker, server-side) ──
  var _prodTimer = {}, _prodCtrl = {};
  function productPicker(prefix) {
    return '<div class="bs-prod" data-prefix="' + prefix + '" style="grid-column:span 2;position:relative">' +
      '<input class="bs-prod-q" data-prefix="' + prefix + '" placeholder="🔍 ombor mahsuloti (komplekt) qidirish…" style="' + FLD + '">' +
      '<div class="bs-prod-res" data-prefix="' + prefix + '" style="display:none;position:absolute;left:0;right:0;top:38px;z-index:30;background:var(--card,#fff);border:1px solid var(--border);border-radius:8px;max-height:230px;overflow:auto;box-shadow:0 6px 18px rgba(0,0,0,.14)"></div>' +
      '<div class="bs-prod-sel" data-prefix="' + prefix + '" style="display:none;margin-top:6px"></div></div>';
  }
  function compVal(prefix) {
    var s = document.querySelector('.bs-prod-sel[data-prefix="' + prefix + '"]');
    return (s && s.dataset.balanceId) ? s.dataset.balanceId : '';
  }
  document.addEventListener('input', function (e) {
    var inp = e.target;
    if (!inp || !inp.classList || !inp.classList.contains('bs-prod-q')) return;
    var pfx = inp.dataset.prefix;
    var res = document.querySelector('.bs-prod-res[data-prefix="' + pfx + '"]');
    var q = inp.value.trim();
    clearTimeout(_prodTimer[pfx]);
    if (q.length < 2) { if (res) { res.style.display = 'none'; res.innerHTML = ''; } return; }
    _prodTimer[pfx] = setTimeout(function () {
      if (_prodCtrl[pfx]) { try { _prodCtrl[pfx].abort(); } catch (e2) {} }
      _prodCtrl[pfx] = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      res.style.display = 'block';
      res.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--text-muted)">⏳ qidirilmoqda…</div>';
      fetch('/bom/settings/product-search/?q=' + encodeURIComponent(q), _prodCtrl[pfx] ? { signal: _prodCtrl[pfx].signal } : {})
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var rs = (d && d.results) || [];
          if (!rs.length) { res.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--text-muted)">natija yo\'q</div>'; return; }
          res.innerHTML = rs.map(function (p) {
            var pr = (p.price == null) ? '⚠️ narx yo\'q' : (Math.round(p.price).toLocaleString('uz-UZ') + ' so\'m');
            return '<div class="bs-prod-item" data-prefix="' + pfx + '" data-id="' + p.balance_id + '" data-label="' + esc(p.name) + '" data-price="' + (p.price == null ? '' : p.price) + '" style="padding:7px 9px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border)">' +
              '<b>' + esc(p.name) + '</b><br><span style="font-size:10.5px;color:var(--text-muted)">' + pr + ' · ' + esc(p.category_name || '') + ' · ' + esc(p.warehouse_name || '') + '</span></div>';
          }).join('');
        }).catch(function (err) { if (err && err.name === 'AbortError') return; if (res) res.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--danger)">xato</div>'; });
    }, 250);
  }, false);
  document.addEventListener('click', function (e) {
    var clr = e.target.closest ? e.target.closest('.bs-prod-clear') : null;
    if (clr) {
      var s2 = document.querySelector('.bs-prod-sel[data-prefix="' + clr.dataset.prefix + '"]');
      if (s2) { s2.dataset.balanceId = ''; s2.style.display = 'none'; s2.innerHTML = ''; }
      return;
    }
    var it = e.target.closest ? e.target.closest('.bs-prod-item') : null;
    if (!it) return;
    var pfx = it.dataset.prefix;
    var sel = document.querySelector('.bs-prod-sel[data-prefix="' + pfx + '"]');
    var res = document.querySelector('.bs-prod-res[data-prefix="' + pfx + '"]');
    var inp = document.querySelector('.bs-prod-q[data-prefix="' + pfx + '"]');
    if (sel) {
      sel.dataset.balanceId = it.dataset.id;
      var pr = it.dataset.price ? (Math.round(Number(it.dataset.price)).toLocaleString('uz-UZ') + ' so\'m') : '⚠️ narx yo\'q';
      sel.style.display = 'block';
      sel.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:#fff;font-size:11px;font-weight:600;padding:4px 9px;border-radius:999px">🧩 ' + it.dataset.label + ' · ' + pr +
        '<button type="button" class="bs-prod-clear" data-prefix="' + pfx + '" style="border:none;background:none;color:#fff;cursor:pointer;font-size:13px;padding:0">✕</button></span>';
    }
    if (res) { res.style.display = 'none'; res.innerHTML = ''; }
    if (inp) inp.value = '';
  }, false);
  function typeOptions() {
    return (D.bom_types || []).map(function (b) { return '<option value="' + b[0] + '">' + esc(b[1]) + '</option>'; }).join('');
  }

  var FLD = 'width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;box-sizing:border-box';
  var CARD = 'background:var(--card,#fff);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px';

  function template() {
    var h = '<div style="padding:14px;max-width:680px;margin:0 auto">';
    h += '<h2 style="font-size:18px;margin:0 0 4px">⚙️ BOM sozlamalari</h2>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Tur→ombor, uslugalar, custom mahsulot va o\'lchov qoidalari. To\'g\'ri sozlansa, chizmadan narx aniq chiqadi.</div>';

    // 1) Tur → Ombor(lar) — bir turga BIR NECHTA ombor
    h += '<div style="' + CARD + '"><h3 style="font-size:14px;margin:0 0 10px">📦 Tur → Ombor(lar)</h3>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Har tur o\'z omborlaridan qidiriladi. Bir turga <b>bir nechta ombor</b> ulash mumkin — hammasidan qidiriladi.</div>';
    (D.bom_types || []).forEach(function (b) {
      var maps = (D.type_warehouse || []).filter(function (m) { return m.bom_type === b[0] && m.warehouse_id; });
      var linkedIds = maps.map(function (m) { return m.warehouse_id; });
      h += '<div style="padding:9px 0;border-bottom:1px solid var(--border)">';
      h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
      h += '<div style="font-size:12.5px;font-weight:700;flex:1">' + esc(b[1]) + '</div>';
      if (b[0] === 'material') {
        var anyM = (D.type_warehouse || []).find(function (m) { return m.bom_type === 'material' && m.pricing_mode; });
        var pm = (anyM && anyM.pricing_mode) || 'area';
        h += '<select class="bs-pm" data-type="material" style="' + FLD + ';flex:0 0 116px">' +
          '<option value="area"' + (pm === 'area' ? ' selected' : '') + '>m²×narx</option>' +
          '<option value="sheet"' + (pm === 'sheet' ? ' selected' : '') + '>List/раскрой</option></select>';
      }
      h += '</div>';
      if (maps.length) {
        h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:7px">';
        maps.forEach(function (m) {
          h += '<span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:#fff;font-size:11px;font-weight:600;padding:4px 9px;border-radius:999px">' +
            esc(whName(m.warehouse_id)) +
            '<button class="bs-del" data-kind="type-warehouse" data-id="' + m.id + '" title="Olib tashlash" style="border:none;background:none;color:#fff;cursor:pointer;font-size:13px;padding:0;line-height:1">✕</button></span>';
        });
        h += '</div>';
      } else {
        h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:7px">— ombor ulanmagan —</div>';
      }
      h += '<select class="bs-tw-add" data-type="' + b[0] + '" style="' + FLD + '">' + whOptionsExcept(linkedIds) + '</select>';
      h += '</div>';
    });
    h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">Panel narxlash: <b>m²×narx</b> yoki <b>List</b> (раскрой — ceil(yuza/list_yuza)×list_narx, Product o\'lchamidan).</div>';
    h += '</div>';

    // 5) Chiqindi % (tekstura/material risk)
    h += '<div style="' + CARD + '"><h3 style="font-size:14px;margin:0 0 10px">📉 Chiqindi % (tekstura)</h3>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Material/tekstura uchun qo\'shimcha %. Masalan tozza 5 m² + 10% = 5.5 m² (ишлаб чиқариш отходи).</div>';
    (D.material_risks || []).forEach(function (r) {
      var tgt = r.name_pattern ? esc(r.name_pattern) : ('🏷 ' + esc(catName(r.category_id)));
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">';
      h += '<span>' + tgt + ' → <b>+' + r.waste_percent + '%</b></span>';
      h += '<button class="bs-del" data-kind="material-risk" data-id="' + r.id + '" style="border:none;background:none;color:var(--danger);cursor:pointer">✕</button></div>';
    });
    h += '<div style="display:grid;grid-template-columns:2fr 1fr;gap:6px;margin-top:10px">';
    h += '<input id="bs-mr-name" placeholder="material/tekstura nomi (ixtiyoriy)" style="' + FLD + '">';
    h += '<input id="bs-mr-pct" type="number" placeholder="% (10)" style="' + FLD + '">';
    h += catCascade('mr');
    h += '<button id="bs-mr-add" class="ce-btn ce-btn-sm" style="font-size:12px;grid-column:span 2">+ Qo\'shish</button>';
    h += '</div></div>';

    // 2) Tur → Uslugalar
    h += '<div style="' + CARD + '"><h3 style="font-size:14px;margin:0 0 10px">🛠 Tur → Uslugalar</h3>';
    (D.type_services || []).forEach(function (s) {
      var nm = s.is_custom ? (esc(s.custom_name) + ' (' + Math.round(s.custom_price).toLocaleString('uz-UZ') + ')') : esc(svcName(s.service_id));
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">';
      h += '<span><b>' + esc(typeLabel(s.bom_type)) + '</b> → ' + nm + (s.combined ? ' <span style="color:#4338ca;font-size:10px">·birga</span>' : '') + '</span>';
      h += '<button class="bs-del" data-kind="type-service" data-id="' + s.id + '" style="border:none;background:none;color:var(--danger);cursor:pointer">✕</button></div>';
    });
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">';
    h += '<select id="bs-ts-type" style="' + FLD + '">' + typeOptions() + '</select>';
    h += svcSelect('bs-ts-svc', '— usluga —');
    h += '<input id="bs-ts-cname" placeholder="yoki custom usluga nomi" style="' + FLD + '">';
    h += '<input id="bs-ts-cprice" type="number" placeholder="custom narx" style="' + FLD + '">';
    h += '<label style="font-size:11px;display:flex;align-items:center;gap:5px"><input type="checkbox" id="bs-ts-combined"> mahsulot bilan birga</label>';
    h += '<button id="bs-ts-add" class="ce-btn ce-btn-sm" style="font-size:12px">+ Qo\'shish</button>';
    h += '</div></div>';

    // 3) Custom mahsulotlar
    h += '<div style="' + CARD + '"><h3 style="font-size:14px;margin:0 0 10px">🧩 Custom mahsulotlar</h3>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Katalogda yo\'q mahsulot/narx (standartni override ham qiladi).</div>';
    (D.custom_products || []).forEach(function (p) {
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">';
      h += '<span><b>' + esc(typeLabel(p.bom_type)) + '</b> · ' + esc(p.name) + ' — ' + Math.round(p.price_uzs).toLocaleString('uz-UZ') + '/' + esc(p.unit) + (p.linked_service_id ? ' +usluga' : '') + '</span>';
      h += '<button class="bs-del" data-kind="custom-product" data-id="' + p.id + '" style="border:none;background:none;color:var(--danger);cursor:pointer">✕</button></div>';
    });
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">';
    h += '<select id="bs-cp-type" style="' + FLD + '">' + typeOptions() + '</select>';
    h += '<input id="bs-cp-name" placeholder="mahsulot nomi" style="' + FLD + '">';
    h += '<input id="bs-cp-price" type="number" placeholder="narx (UZS)" style="' + FLD + '">';
    h += '<input id="bs-cp-unit" placeholder="birlik (dona/m2/m)" value="dona" style="' + FLD + '">';
    h += svcSelect('bs-cp-svc', '— bog\'langan usluga (ixtiyoriy) —');
    h += '<button id="bs-cp-add" class="ce-btn ce-btn-sm" style="font-size:12px">+ Qo\'shish</button>';
    h += '</div></div>';

    // 4) O'lchov qoidalari (kg↔dona)
    h += '<div style="' + CARD + '"><h3 style="font-size:14px;margin:0 0 10px">⚖️ O\'lchov qoidalari</h3>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Masalan евровинт: omborda <b>kg</b>, BOM\'da <b>dona</b> → 1 kg = nechta dona.</div>';
    (D.unit_rules || []).forEach(function (u) {
      var txt = esc(u.name_pattern) + ': ';
      if (u.per_warehouse_unit && u.per_warehouse_unit !== 1) txt += '1 ' + esc(u.warehouse_unit) + ' = ' + u.per_warehouse_unit + ' ' + esc(u.bom_unit);
      if (u.step_n) txt += (u.per_warehouse_unit !== 1 ? ' · ' : '') + 'har ' + u.step_n + ' da +' + u.step_add;
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">';
      h += '<span>' + txt + '</span>';
      h += '<button class="bs-del" data-kind="unit-rule" data-id="' + u.id + '" style="border:none;background:none;color:var(--danger);cursor:pointer">✕</button></div>';
    });
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">';
    h += '<input id="bs-ur-name" placeholder="nom (masalan: евровинт)" style="' + FLD + '">';
    h += '<input id="bs-ur-per" type="number" placeholder="1 kg = N dona (ixtiyoriy)" style="' + FLD + '">';
    h += '<input id="bs-ur-wu" placeholder="ombor birligi" value="kg" style="' + FLD + '">';
    h += '<input id="bs-ur-bu" placeholder="BOM birligi" value="dona" style="' + FLD + '">';
    h += '<input id="bs-ur-stepn" type="number" placeholder="har N da (масалан 3)" style="' + FLD + '">';
    h += '<input id="bs-ur-stepa" type="number" placeholder="+M qo\'shimcha (масалан 1)" style="' + FLD + '">';
    h += '<button id="bs-ur-add" class="ce-btn ce-btn-sm" style="font-size:12px;grid-column:span 2">+ Qo\'shish</button>';
    h += '</div></div>';

    // ════════ NARX ENGINE (kategoriya darajasi) ════════
    h += '<div style="margin:18px 0 8px;font-size:12px;font-weight:800;color:var(--accent,#4338ca)">⚡ Narx Engine — kategoriya qoidalari</div>';

    // 6) Kategoriya konvert (kg↔dona)
    h += '<div style="' + CARD + '"><h3 style="font-size:14px;margin:0 0 10px">🏷 Kategoriya konvert (kg↔dona)</h3>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Butun kategoriyaga. Mahkamlagichlar omborda <b>kg</b>, BOM\'da <b>dona</b> → 1 kg = N dona. Masalan евровинт: 1 kg = 120 dona.</div>';
    (D.category_unit_rules || []).forEach(function (c) {
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">';
      h += '<span>🏷 ' + esc(catName(c.category_id)) + (c.bom_type ? ' <small>(' + esc(c.bom_type) + ')</small>' : '') + ' → <b>1 ' + esc(c.warehouse_unit) + ' = ' + c.per_warehouse_unit + ' ' + esc(c.bom_unit) + '</b></span>';
      h += '<button class="bs-del" data-kind="category-unit-rule" data-id="' + c.id + '" style="border:none;background:none;color:var(--danger);cursor:pointer">✕</button></div>';
    });
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">';
    h += catCascade('cu');
    h += '<select id="bs-cu-type" style="' + FLD + '">' + typeOptionsBlank('— barcha tur —') + '</select>';
    h += '<input id="bs-cu-per" type="number" placeholder="1 kg = N dona" style="' + FLD + '">';
    h += '<input id="bs-cu-wu" placeholder="ombor birligi" value="kg" style="' + FLD + '">';
    h += '<input id="bs-cu-bu" placeholder="BOM birligi" value="dona" style="' + FLD + '">';
    h += '<button id="bs-cu-add" class="ce-btn ce-btn-sm" style="font-size:12px;grid-column:span 2">+ Qo\'shish</button>';
    h += '</div></div>';

    // 7) Qo'shimcha dona (zapas)
    h += '<div style="' + CARD + '"><h3 style="font-size:14px;margin:0 0 10px">➕ Qo\'shimcha dona (zapas)</h3>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Mahkamlagich/furnitura uchun sinish/zapasга ATAYIN ortiqcha dona (chiqindi emas). Har doim butun (ceil).</div>';
    (D.qty_buffers || []).forEach(function (b) {
      var tgt = b.name_pattern ? esc(b.name_pattern) : ('🏷 ' + esc(catName(b.category_id)));
      var rule = b.mode === 'pct' ? ('+' + b.extra_percent + '%') : ('har ' + b.step_n + ' da +' + b.step_add);
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">';
      h += '<span>' + tgt + ' → <b>' + rule + '</b>' + (b.min_qty ? ' · min ' + b.min_qty : '') + '</span>';
      h += '<button class="bs-del" data-kind="qty-buffer" data-id="' + b.id + '" style="border:none;background:none;color:var(--danger);cursor:pointer">✕</button></div>';
    });
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">';
    h += catCascade('qb');
    h += '<input id="bs-qb-name" placeholder="yoki nom (ixtiyoriy)" style="' + FLD + '">';
    h += '<select id="bs-qb-mode" style="' + FLD + '"><option value="per">Har N da +M</option><option value="pct">Foiz (+%)</option></select>';
    h += '<select id="bs-qb-type" style="' + FLD + '"><option value="">— fitting/fastener —</option><option value="fitting">Furnitura</option><option value="fastener">Mahkamlagich</option></select>';
    h += '<input id="bs-qb-stepn" type="number" placeholder="har N da (per)" style="' + FLD + '">';
    h += '<input id="bs-qb-stepa" type="number" placeholder="+M (per)" style="' + FLD + '">';
    h += '<input id="bs-qb-pct" type="number" placeholder="+% (pct)" style="' + FLD + '">';
    h += '<input id="bs-qb-min" type="number" placeholder="min dona (ixtiyoriy)" style="' + FLD + '">';
    h += '<button id="bs-qb-add" class="ce-btn ce-btn-sm" style="font-size:12px;grid-column:span 2">+ Qo\'shish</button>';
    h += '</div></div>';

    // 8) Kategoriya → Usluga
    h += '<div style="' + CARD + '"><h3 style="font-size:14px;margin:0 0 10px">🔗 Kategoriya → Usluga (zapchast → usluga)</h3>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Masalan "Petlelar" → присадка петля. Alohida (qo\'shiladi) yoki material ichida.</div>';
    (D.service_rules || []).forEach(function (s) {
      var tgt = s.name_pattern ? esc(s.name_pattern) : ('🏷 ' + esc(catName(s.category_id)));
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">';
      h += '<span>' + tgt + ' → ' + esc(svcName(s.service_id)) + ' <small style="color:#4338ca">(' + (s.attach_mode === 'embedded' ? 'ichida' : 'alohida') + '·' + esc(s.basis) + ')</small></span>';
      h += '<button class="bs-del" data-kind="service-rule" data-id="' + s.id + '" style="border:none;background:none;color:var(--danger);cursor:pointer">✕</button></div>';
    });
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">';
    h += catCascade('sr');
    h += svcSelect('bs-sr-svc', '— usluga —');
    h += '<select id="bs-sr-attach" style="' + FLD + '"><option value="separate">Alohida (qo\'shiladi)</option><option value="embedded">Material ichida</option></select>';
    h += '<select id="bs-sr-basis" style="' + FLD + '"><option value="dona">dona</option><option value="m2">m²</option><option value="m">metr</option></select>';
    h += '<button id="bs-sr-add" class="ce-btn ce-btn-sm" style="font-size:12px;grid-column:span 2">+ Qo\'shish</button>';
    h += '</div></div>';

    // 9) Komplekt (companion mahsulot)
    h += '<div style="' + CARD + '"><h3 style="font-size:14px;margin:0 0 10px">🧩 Komplekt (companion mahsulot)</h3>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Asosiy qism + hamroh mahsulot. Masalan <b>petlya → montajnaya planka</b>. 1 petlya narxi = petlya + planka (planka narxi ombordan, jonli).</div>';
    (D.companion_rules || []).forEach(function (r) {
      var tgt = r.name_pattern ? esc(r.name_pattern) : ('🏷 ' + esc(catName(r.category_id)));
      var miss = r.companion_balance_missing ? ' <span style="color:var(--danger)">⚠️ balans yo\'q</span>' : '';
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">';
      h += '<span>' + tgt + ' → 🧩 ' + esc(r.label || ('balans #' + r.companion_balance_id)) + (r.qty_per !== 1 ? (' ×' + r.qty_per) : '') + miss + '</span>';
      h += '<button class="bs-del" data-kind="companion-rule" data-id="' + r.id + '" style="border:none;background:none;color:var(--danger);cursor:pointer">✕</button></div>';
    });
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">';
    h += catCascade('comp');
    h += '<input id="bs-comp-name" placeholder="yoki trigger nom (ixtiyoriy)" style="' + FLD + ';grid-column:span 2">';
    h += productPicker('comp');
    h += '<input id="bs-comp-qty" type="number" placeholder="qty_per (1)" value="1" style="' + FLD + '">';
    h += '<input id="bs-comp-label" placeholder="yorliq (Монтажная планка)" style="' + FLD + '">';
    h += '<select id="bs-comp-type" style="' + FLD + ';grid-column:span 2"><option value="">— fitting/fastener —</option><option value="fitting">Furnitura</option><option value="fastener">Mahkamlagich</option></select>';
    h += '<button id="bs-comp-add" class="ce-btn ce-btn-sm" style="font-size:12px;grid-column:span 2">+ Qo\'shish</button>';
    h += '</div></div>';

    h += '</div>';
    return h;
  }

  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function reload() { render(); }

  function bind() {
    // Ombor QO'SHISH (boshqalar o'chmaydi) — bir turga bir nechta ombor
    document.querySelectorAll('.bs-tw-add').forEach(function (sel) {
      sel.addEventListener('change', function () {
        if (!sel.value) return;
        post('/bom/settings/type-warehouse/', { bom_type: sel.dataset.type, warehouse_id: Number(sel.value) }).then(reload);
      });
    });
    // Narxlash rejimi (faqat material) — turning barcha omborlariga
    document.querySelectorAll('.bs-pm').forEach(function (sel) {
      sel.addEventListener('change', function () {
        post('/bom/settings/type-warehouse/', { bom_type: sel.dataset.type, pricing_mode: sel.value })
          .then(function () { Toast && Toast.success('Saqlandi'); });
      });
    });
    document.querySelectorAll('.bs-del').forEach(function (b) {
      b.addEventListener('click', function () {
        post('/bom/settings/delete/' + b.dataset.kind + '/' + b.dataset.id + '/', {}).then(reload);
      });
    });
    var tsAdd = document.getElementById('bs-ts-add');
    if (tsAdd) tsAdd.onclick = function () {
      var cname = val('bs-ts-cname');
      post('/bom/settings/type-service/', {
        bom_type: val('bs-ts-type'), service_id: val('bs-ts-svc') ? Number(val('bs-ts-svc')) : null,
        is_custom: !!cname, custom_name: cname, custom_price: val('bs-ts-cprice'),
        combined: document.getElementById('bs-ts-combined').checked,
      }).then(reload);
    };
    var cpAdd = document.getElementById('bs-cp-add');
    if (cpAdd) cpAdd.onclick = function () {
      if (!val('bs-cp-name')) return Toast && Toast.error('Nom kerak');
      post('/bom/settings/custom-product/', {
        bom_type: val('bs-cp-type'), name: val('bs-cp-name'), price_uzs: val('bs-cp-price'),
        unit: val('bs-cp-unit') || 'dona', linked_service_id: val('bs-cp-svc') ? Number(val('bs-cp-svc')) : null,
      }).then(reload);
    };
    var urAdd = document.getElementById('bs-ur-add');
    if (urAdd) urAdd.onclick = function () {
      if (!val('bs-ur-name')) return Toast && Toast.error('Nom kerak');
      post('/bom/settings/unit-rule/', {
        name_pattern: val('bs-ur-name'), per_warehouse_unit: val('bs-ur-per') || 1,
        warehouse_unit: val('bs-ur-wu') || 'kg', bom_unit: val('bs-ur-bu') || 'dona',
        step_n: val('bs-ur-stepn') || 0, step_add: val('bs-ur-stepa') || 0,
      }).then(reload);
    };
    var mrAdd = document.getElementById('bs-mr-add');
    if (mrAdd) mrAdd.onclick = function () {
      if (!val('bs-mr-name') && !catVal('mr')) return Toast && Toast.error('Nom yoki kategoriya kerak');
      post('/bom/settings/material-risk/', {
        name_pattern: val('bs-mr-name'), waste_percent: val('bs-mr-pct'),
        category_id: catVal('mr') ? Number(catVal('mr')) : null,
      }).then(reload);
    };
    // Narx Engine: kategoriya konvert
    var cuAdd = document.getElementById('bs-cu-add');
    if (cuAdd) cuAdd.onclick = function () {
      if (!catVal('cu')) return Toast && Toast.error('Kategoriya kerak');
      post('/bom/settings/category-unit-rule/', {
        category_id: Number(catVal('cu')), bom_type: val('bs-cu-type'),
        per_warehouse_unit: val('bs-cu-per') || 1, warehouse_unit: val('bs-cu-wu') || 'kg', bom_unit: val('bs-cu-bu') || 'dona',
      }).then(reload);
    };
    // Narx Engine: qo'shimcha dona (zapas)
    var qbAdd = document.getElementById('bs-qb-add');
    if (qbAdd) qbAdd.onclick = function () {
      if (!catVal('qb') && !val('bs-qb-name')) return Toast && Toast.error('Kategoriya yoki nom kerak');
      post('/bom/settings/qty-buffer/', {
        category_id: catVal('qb') ? Number(catVal('qb')) : null, name_pattern: val('bs-qb-name'),
        bom_type: val('bs-qb-type'), mode: val('bs-qb-mode'),
        step_n: val('bs-qb-stepn') || 0, step_add: val('bs-qb-stepa') || 0,
        extra_percent: val('bs-qb-pct') || 0, min_qty: val('bs-qb-min') || 0,
      }).then(reload);
    };
    // Narx Engine: kategoriya → usluga
    var srAdd = document.getElementById('bs-sr-add');
    if (srAdd) srAdd.onclick = function () {
      if (!catVal('sr')) return Toast && Toast.error('Kategoriya kerak');
      if (!val('bs-sr-svc')) return Toast && Toast.error('Usluga kerak');
      post('/bom/settings/service-rule/', {
        category_id: Number(catVal('sr')), service_id: Number(val('bs-sr-svc')),
        attach_mode: val('bs-sr-attach'), basis: val('bs-sr-basis'),
      }).then(reload);
    };
    // Narx Engine: komplekt (companion)
    var compAdd = document.getElementById('bs-comp-add');
    if (compAdd) compAdd.onclick = function () {
      if (!catVal('comp') && !val('bs-comp-name')) return Toast && Toast.error('Kategoriya yoki nom kerak');
      if (!compVal('comp')) return Toast && Toast.error('Komplekt mahsulot tanlang');
      post('/bom/settings/companion-rule/', {
        bom_type: val('bs-comp-type') || '',
        category_id: catVal('comp') ? Number(catVal('comp')) : null,
        name_pattern: val('bs-comp-name'),
        companion_balance_id: Number(compVal('comp')),
        qty_per: val('bs-comp-qty') || 1,
        label: val('bs-comp-label'),
      }).then(reload);
    };
  }

  function render() {
    var app = document.getElementById('app');
    app.innerHTML = '<div style="padding:16px;color:var(--text-muted)">⏳ Yuklanmoqda…</div>';
    fetch('/bom/settings/').then(function (r) { return r.json(); }).then(function (d) {
      D = d; buildCatIndex(); app.innerHTML = template(); bind();
    }).catch(function () { app.innerHTML = '<div style="padding:16px;color:var(--danger)">Xato</div>'; });
  }

  return { render: render };
})();
