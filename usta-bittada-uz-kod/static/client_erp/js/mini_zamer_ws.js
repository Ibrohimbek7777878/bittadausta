// ════════════════════════════════════════════════════
// mini_zamer_ws.js — Mini ERP uchun WS o'rniga fetch POST
// ════════════════════════════════════════════════════

function connectWS() {
    // Mini ERP — WS yo'q, Django dan to'liq state yuklash
    console.log('connectWS called, _MINI_STATE:', !!window._MINI_STATE, window._MINI_STATE ? window._MINI_STATE.rooms.length + ' rooms' : 'no state');
    if (window._MINI_STATE) {
        state = window._MINI_STATE;
        console.log('state set, rooms:', state.rooms.length, 'calling render...');
        if (typeof render === 'function') {
            try { render(); console.log('render OK'); } catch(e) { console.error('render ERROR:', e.message, e.stack); }
        } else {
            console.error('render function not found!');
        }
    }
}

function wsSend(obj) {
    const action = obj.action;
    console.log('mini wsSend:', action, obj);

    // Delete amallar — URL param orqali
    if (action === 'delete_zamer' && obj.id) {
        window.location.href = window.location.pathname + '?delzamer=' + obj.id;
        return;
    }
    if (action === 'delete_block' && obj.id) {
        window.location.href = window.location.pathname + '?delblock=' + obj.id;
        return;
    }
    if (action === 'delete_section' && obj.id) {
        const holat = new URLSearchParams(window.location.search).get('holat') || '';
        window.location.href = window.location.pathname + '?delsection=' + obj.id + (holat ? '&holat=' + holat : '');
        return;
    }

    // Action → type_form mapping
    const mapping = {
        'add_zamer': 'zamer',
        'add_block': 'block',
        'add_section': 'section',
    };
    const typeForm = mapping[action];
    if (!typeForm) {
        console.warn('mini_zamer_ws: unknown action', action);
        return;
    }

    // Fetch POST
    const fd = new FormData();
    fd.append('type_form', typeForm);

    for (const [key, val] of Object.entries(obj)) {
        if (key === 'action') continue;
        // Field name mapping
        if (key === 'zamer_id') fd.append('zamer', val);
        else if (key === 'block_id') fd.append('block_id', val);
        else fd.append(key, val || '');
    }

    fetch(window.location.pathname, {
        method: 'POST',
        body: fd,
    }).then(() => {
        window.location.reload();
    }).catch(err => {
        console.error('wsSend xato:', err);
        window.location.reload();
    });
}

function getCSRF() {
    const m = document.cookie.match(/csrftoken=([^;]+)/);
    if (m) return m[1];
    const el = document.querySelector('[name=csrfmiddlewaretoken]');
    return el ? el.value : '';
}
