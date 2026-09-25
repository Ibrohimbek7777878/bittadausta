/* client_erp/js/redesign/rc-actions.js — Gemini Live tool-call → frontend amal registri.
   Maqsad: Gemini Live "function call" chiqarsa → mos frontend funksiya chaqiriladi.
   Mavjud GLOBAL obyektlar qayta ishlatiladi (yangi mantiq YO'Q):
     - Router.go(path) / Router.back()                (mini-erp.js)
     - RcOrderDetail.completeStage/checkItem/addStage/changeStatus/addIncome/
       addExpense/skipStage/reopenStage/reload/_data/_id  (rc-order-detail.js)
   Global yo'q bo'lsa xavfsiz degrade — har amal qisqa STRING natija qaytaradi
   (Gemini shu string'ni foydalanuvchiga aytadi).
   Eksport: window.RcActions = { run(name,args) }  +  window.GEMINI_TOOLS = [...] */
(function () {
  'use strict';

  /* ── Xavfsiz global olish (yo'q bo'lsa null) ── */
  function _router() {
    if (typeof window !== 'undefined' && window.Router) return window.Router;
    return (typeof Router !== 'undefined') ? Router : null;
  }
  function _od() {
    if (typeof window !== 'undefined' && window.RcOrderDetail) return window.RcOrderDetail;
    return (typeof RcOrderDetail !== 'undefined') ? RcOrderDetail : null;
  }
  function _state() {
    if (typeof window !== 'undefined' && window.STATE) return window.STATE;
    return (typeof STATE !== 'undefined') ? STATE : null;
  }
  function _ws() {
    if (typeof window !== 'undefined' && window.WS) return window.WS;
    return (typeof WS !== 'undefined') ? WS : null;
  }
  /* Xatoni foydalanuvchiga ko'rsatish (Toast bo'lsa) — async WS callback uchun */
  function _toast(msg) {
    try {
      var T = (typeof window !== 'undefined' && window.Toast) ? window.Toast
        : (typeof Toast !== 'undefined' ? Toast : null);
      if (T && typeof T.error === 'function') T.error(msg);
    } catch (e) { /* jim */ }
  }
  /* Pul formatlash (Utils.money bo'lsa undan, yo'q bo'lsa xom son) */
  function _money(v) {
    var U = (typeof window !== 'undefined' && window.Utils) ? window.Utils
      : (typeof Utils !== 'undefined' ? Utils : null);
    if (U && typeof U.money === 'function') { try { return U.money(v); } catch (e) {} }
    return String(v == null ? 0 : v);
  }

  /* status kodi → o'zbekcha yorliq (RcStatus.MAP bo'lsa undan) */
  function statusLabel(code) {
    var M = (typeof window !== 'undefined' && window.RcStatus && window.RcStatus.MAP) || null;
    if (M && M[code]) return M[code][0];
    return code || '—';
  }

  /* Joriy sahifa order-detail ekanini tekshir: RcOrderDetail._id bo'lishi shart */
  function requireOrder() {
    var od = _od();
    if (!od || !od._id) return null;
    return od;
  }

  /* Inson tilidagi sahifa nomi → route xaritasi (open_page uchun) */
  var PAGE_MAP = {
    'bosh': '/', 'bosh sahifa': '/', 'asosiy': '/', 'home': '/', 'dashboard': '/',
    'buyurtmalar': '/orders', 'buyurtma': '/orders', 'zakazlar': '/orders', 'zakaz': '/orders', 'orders': '/orders',
    'mijozlar': '/clients', 'mijoz': '/clients', 'clients': '/clients',
    'moliya': '/finance', 'finance': '/finance', 'pul': '/finance', 'kassa': '/finance',
    'analitika': '/analytics', 'analytics': '/analytics', 'statistika': '/analytics', 'hisobot': '/analytics',
    'tanga': '/tanga', 'tangalar': '/tanga', 'coin': '/tanga', 'hamyon': '/tanga', 'wallet': '/tanga',
    'tarif': '/tarif', 'tarif rejasi': '/tarif', 'tariff': '/tarif',
    'jamoa': '/team', 'team': '/team', 'komanda': '/team',
    'sozlamalar': '/settings', 'settings': '/settings',
    'mebelcity': '/mebelcity', 'vizualizatsiya': '/vizualizatsiya',
    'zamerlar': '/zamers', 'zamer': '/zamers', 'oldi-berdi': '/oldi-berdi', 'oldi berdi': '/oldi-berdi'
  };

  /* Inson tilidagi tab nomi → RcOrderDetail.setTab kaliti (open_tab uchun) */
  var TAB_MAP = {
    'umumiy': 'umumiy',
    'moliya': 'moliya', 'pul': 'moliya',
    'etap': 'etap', 'etaplar': 'etap', 'bosqich': 'etap', 'bosqichlar': 'etap',
    'fayl': 'fayl', 'fayllar': 'fayl',
    'jamoa': 'jamoa', 'komanda': 'jamoa'
  };

  /* ── Amal-registri: nom → funksiya (har biri qisqa string qaytaradi) ── */
  var ACTIONS = {

    navigate: function (args) {
      var r = _router(); if (!r) return 'Router mavjud emas';
      var page = (args && (args.page || args.path)) || '';
      page = (page || '').toString().trim();
      if (!page) return 'page berilmadi';
      if (page.charAt(0) !== '/') page = '/' + page;
      r.go(page);
      return 'Sahifa ochildi: ' + page;
    },

    open_order: function (args) {
      var r = _router(); if (!r) return 'Router mavjud emas';
      var id = args && (args.order_id != null ? args.order_id : args.id);
      if (id == null || id === '') return 'order_id berilmadi';
      r.go('/orders/' + id);
      return 'Buyurtma #' + id + ' ochildi';
    },

    open_page: function (args) {
      var r = _router(); if (!r) return 'Router mavjud emas';
      var raw = (args && args.name) || '';
      var name = raw.toString().trim().toLowerCase();
      var path = PAGE_MAP[name];
      if (!path) return "Noma'lum sahifa: " + (raw || '(bo\'sh)');
      r.go(path);
      return 'Sahifa ochildi: ' + path;
    },

    complete_stage: function (args) {
      var od = requireOrder();
      if (!od) return 'Bu amal faqat buyurtma sahifasida ishlaydi';
      var id = args && (args.stage_id != null ? args.stage_id : args.id);
      if (id == null || id === '') return 'stage_id berilmadi';
      od.completeStage(parseInt(id, 10));
      return 'Etap #' + id + ' tugatilmoqda';
    },

    check_item: function (args) {
      var od = requireOrder();
      if (!od) return 'Bu amal faqat buyurtma sahifasida ishlaydi';
      var sid = args && args.stage_id, iid = args && args.item_id;
      if (sid == null || sid === '' || iid == null || iid === '') return 'stage_id va item_id kerak';
      od.checkItem(parseInt(sid, 10), parseInt(iid, 10));
      return 'Checklist band belgisi almashtirildi';
    },

    add_stage: function () {
      var od = requireOrder();
      if (!od) return 'Bu amal faqat buyurtma sahifasida ishlaydi';
      od.addStage();
      return 'Yangi etap qo\'shish oynasi ochildi';
    },

    change_status: function () {
      var od = requireOrder();
      if (!od) return 'Bu amal faqat buyurtma sahifasida ishlaydi';
      od.changeStatus();
      return 'Holat tanlash oynasi ochildi';
    },

    add_income: function () {
      var od = requireOrder();
      if (!od) return 'Bu amal faqat buyurtma sahifasida ishlaydi';
      od.addIncome();
      return 'Kirim qo\'shish oynasi ochildi';
    },

    add_expense: function () {
      var od = requireOrder();
      if (!od) return 'Bu amal faqat buyurtma sahifasida ishlaydi';
      od.addExpense();
      return 'Chiqim qo\'shish oynasi ochildi';
    },

    go_back: function () {
      var r = _router(); if (!r) return 'Router mavjud emas';
      r.back();
      return 'Orqaga qaytildi';
    },

    /* Yangi buyurtma (zakaz) yaratadi va uni ochadi (customer/template yo'q) */
    create_order: function (args) {
      var W = _ws(); if (!W || typeof W.send !== 'function') return 'WS mavjud emas';
      var r = _router();
      var title = (args && args.title != null) ? String(args.title).trim() : '';
      if (!title) return 'Buyurtma nomi kerak';
      W.send('order.create', { title: title, customer_id: null, template_id: null }, function (cb) {
        if (cb && cb.ok && cb.data && cb.data.id != null) {
          if (r) r.go('/orders/' + cb.data.id);
        } else {
          _toast((cb && cb.error) ? cb.error : 'Buyurtma yaratilmadi');
        }
      });
      return 'Buyurtma yaratildi: ' + title;
    },

    /* Buyurtma sahifasida tab almashtiradi (umumiy/moliya/etap/fayl/jamoa) */
    open_tab: function (args) {
      var od = requireOrder();
      if (!od || typeof od.setTab !== 'function') return 'Bu amal buyurtma sahifasida ishlaydi';
      var raw = (args && args.tab != null) ? String(args.tab).trim() : '';
      var key = TAB_MAP[raw.toLowerCase()];
      if (!key) return "Noma'lum tab: " + (raw || "(bo'sh)");
      od.setTab(key);
      return 'Tab: ' + raw;
    },

    /* Yangi mijoz (klient) qo'shadi */
    add_customer: function (args) {
      var W = _ws(); if (!W || typeof W.send !== 'function') return 'WS mavjud emas';
      var name = (args && args.name != null) ? String(args.name).trim() : '';
      var phone = (args && args.phone != null) ? String(args.phone).trim() : '';
      if (!name) return 'Mijoz ismi kerak';
      W.send('client.create', { name: name, phone: phone || '' }, function (cb) {
        if (!(cb && cb.ok)) _toast((cb && cb.error) ? cb.error : "Mijoz qo'shilmadi");
      });
      return "Mijoz qo'shildi: " + name;
    },

    /* Joriy ochiq buyurtma haqida qisqa ma'lumot (ovoz bilan o'qish uchun matn) */
    order_info: function () {
      var od = _od();
      if (!od || !od._data) return 'Buyurtma ochilmagan';
      var d = od._data;
      var inc = parseInt(d.total_income) || 0;
      var exp = parseInt(d.total_expense) || 0;
      var profit = inc - exp;
      var out = 'Buyurtma: ' + (d.title || 'Buyurtma');
      out += '\nHolat: ' + statusLabel(d.status);
      if (d.customer && d.customer.name) out += '\nMijoz: ' + d.customer.name;
      out += '\nKirim: ' + _money(inc) + '; Chiqim: ' + _money(exp) + '; Foyda: ' + _money(profit);
      var stages = d.stages || [];
      if (stages.length) {
        var doneN = 0;
        var parts = stages.map(function (s) {
          var lbl = s.status === 'completed' ? 'bajarildi'
            : s.status === 'skipped' ? "o'tkazildi" : 'jarayonda';
          if (s.status === 'completed') doneN++;
          return (s.title || 'Etap') + ' (' + lbl + ')';
        });
        out += '\nEtaplar (' + doneN + '/' + stages.length + '): ' + parts.join('; ');
      } else {
        out += "\nEtaplar yo'q";
      }
      return out;
    },

    /* Umumiy moliya holati: kassa oy oxiri qoldiq + sof foyda (ovoz uchun matn) */
    finance_summary: function () {
      var st = _state();
      if (st && st.finance) {
        var f = st.finance;
        var k = f.kassa || {};
        var sf = f.sof_foyda || {};
        var out = 'Kassa oy oxiri qoldiq: ' + _money(k.closing);
        out += '\nSof foyda: ' + _money(sf.total) + ' (' + (sf.count || 0) + ' topshirilgan buyurtma)';
        return out;
      }
      var r = _router(); if (!r) return 'Router mavjud emas';
      r.go('/finance');
      return 'Moliya sahifasi ochildi, hozir yuklanmoqda';
    },

    current_context: function () {
      var st = _state();
      var page = (st && st.currentPage) ||
        (typeof location !== 'undefined' ? (location.hash.slice(1) || '/') : '/');
      var out = 'Joriy sahifa: ' + page;
      var od = _od();
      if (od && od._data) {
        var d = od._data;
        out += '\nBuyurtma: ' + (d.title || 'Buyurtma');
        out += '\nHolat: ' + statusLabel(d.status);
        if (d.customer && d.customer.name) out += '\nMijoz: ' + d.customer.name;
        var stages = d.stages || [];
        if (stages.length) {
          var doneN = 0;
          var parts = stages.map(function (s) {
            var lbl = s.status === 'completed' ? 'bajarildi'
              : s.status === 'skipped' ? "o'tkazildi" : 'jarayonda';
            if (s.status === 'completed') doneN++;
            return '#' + s.id + ' ' + (s.title || '') + ' (' + lbl + ')';
          });
          out += '\nEtaplar (' + doneN + '/' + stages.length + '): ' + parts.join('; ');
        }
      }
      return out;
    }
  };

  /* ── Dispatcher: nom → funksiya, try/catch, doim string ── */
  window.RcActions = {
    _actions: ACTIONS,
    has: function (name) { return typeof ACTIONS[name] === 'function'; },
    run: function (name, args) {
      var fn = ACTIONS[name];
      if (typeof fn !== 'function') return "Noma'lum amal: " + name;
      try {
        var res = fn(args || {});
        return (res == null) ? 'Bajarildi' : String(res);
      } catch (e) {
        return 'Xatolik: ' + ((e && e.message) ? e.message : e);
      }
    }
  };

  /* ── Gemini Live function declarations ── */
  window.GEMINI_TOOLS = [
    {
      name: 'navigate',
      description: 'Berilgan ichki yo\'l (path) bo\'yicha sahifaga o\'tadi. Masalan "/orders" yoki "/finance". Aniq path ma\'lum bo\'lganda ishlatiladi.',
      parameters: {
        type: 'object',
        properties: {
          page: { type: 'string', description: 'Sahifa yo\'li, masalan "/orders" yoki "/clients"' }
        },
        required: ['page']
      }
    },
    {
      name: 'open_order',
      description: 'Berilgan raqamli buyurtmani (zakazni) ochadi.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'integer', description: 'Buyurtma (zakaz) raqami' }
        },
        required: ['order_id']
      }
    },
    {
      name: 'open_page',
      description: 'Nomi bo\'yicha asosiy sahifani ochadi. Ruxsat etilgan nomlar: bosh, buyurtmalar, mijozlar, moliya, analitika, tanga, tarif, jamoa (shuningdek sozlamalar, mebelcity, vizualizatsiya, zamerlar, oldi-berdi).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Sahifa nomi, masalan "buyurtmalar" yoki "moliya"' }
        },
        required: ['name']
      }
    },
    {
      name: 'complete_stage',
      description: 'Joriy buyurtmadagi berilgan etapni (bosqichni) tugatilgan deb belgilaydi. Faqat buyurtma sahifasi ochiq bo\'lganda ishlaydi.',
      parameters: {
        type: 'object',
        properties: {
          stage_id: { type: 'integer', description: 'Tugatiladigan etap raqami' }
        },
        required: ['stage_id']
      }
    },
    {
      name: 'check_item',
      description: 'Joriy buyurtmadagi etap ichidagi checklist bandini belgilaydi/olib tashlaydi. Faqat buyurtma sahifasida ishlaydi.',
      parameters: {
        type: 'object',
        properties: {
          stage_id: { type: 'integer', description: 'Etap raqami' },
          item_id: { type: 'integer', description: 'Checklist band raqami' }
        },
        required: ['stage_id', 'item_id']
      }
    },
    {
      name: 'add_stage',
      description: 'Joriy buyurtmaga yangi etap (bosqich) qo\'shish oynasini ochadi. Faqat buyurtma sahifasida ishlaydi.',
      parameters: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'change_status',
      description: 'Joriy buyurtma holatini (statusini) o\'zgartirish oynasini ochadi. Faqat buyurtma sahifasida ishlaydi.',
      parameters: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'add_income',
      description: 'Joriy buyurtmaga kirim (pul tushumi) qo\'shish oynasini ochadi. Faqat buyurtma sahifasida ishlaydi.',
      parameters: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'add_expense',
      description: 'Joriy buyurtmaga chiqim (xarajat) qo\'shish oynasini ochadi. Faqat buyurtma sahifasida ishlaydi.',
      parameters: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'go_back',
      description: 'Bir qadam orqaga qaytadi (oldingi sahifaga).',
      parameters: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'create_order',
      description: 'Berilgan nom bilan yangi buyurtma (zakaz) yaratadi va uni ochadi. Mijoz yoki shablon biriktirilmaydi.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Buyurtma nomi (sarlavhasi)' }
        },
        required: ['title']
      }
    },
    {
      name: 'open_tab',
      description: 'Ochiq buyurtma sahifasidagi tabni almashtiradi. Ruxsat etilgan tablar: umumiy, moliya, etap (etaplar), fayl (fayllar), jamoa. Faqat buyurtma sahifasida ishlaydi.',
      parameters: {
        type: 'object',
        properties: {
          tab: { type: 'string', description: 'Tab nomi, masalan "moliya" yoki "etaplar"' }
        },
        required: ['tab']
      }
    },
    {
      name: 'add_customer',
      description: 'Yangi mijoz (klient) qo\'shadi. Ism majburiy, telefon ixtiyoriy.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Mijoz to\'liq ismi' },
          phone: { type: 'string', description: 'Telefon raqami (ixtiyoriy)' }
        },
        required: ['name']
      }
    },
    {
      name: 'order_info',
      description: 'Joriy ochiq buyurtma haqida qisqa ma\'lumot qaytaradi: nomi, holati, kirim/chiqim/foyda va etaplar ro\'yxati. Faqat buyurtma sahifasi ochiq bo\'lganda ma\'lumot beradi. Ovoz bilan aytish uchun ishlatiladi.',
      parameters: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'finance_summary',
      description: 'Umumiy moliya holatini qisqa qaytaradi: kassa oy oxiri qoldig\'i va sof foyda. Ma\'lumot yuklanmagan bo\'lsa moliya sahifasini ochadi. Ovoz bilan aytish uchun ishlatiladi.',
      parameters: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'current_context',
      description: 'Foydalanuvchi hozir qaysi sahifada ekanini qaytaradi. Agar buyurtma sahifasi ochiq bo\'lsa — buyurtma nomi, holati va etaplari qisqacha ham qaytariladi. Amal bajarishdan oldin holatni bilish uchun ishlatiladi.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  ];
})();
