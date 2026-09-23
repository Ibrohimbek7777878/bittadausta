/* rc-module-catalog.js — TZ-Usta-Bittada-Modul-Tanlash.md §7 (2026-08-14).
   BUTUNLAY YANGI, ALOHIDA fayl — mavjud rc-*.js fayllarga tegilmaydi.
   "BLE lazer" tugmasi bosilganda (hozircha faqat bigone_cl2 akkaunti,
   redesign-app.js::navlink()) YAGONA, integratsiyalangan sahifani ochadi
   (Coohom-uslubidagi xona+katalog+BLE-o'lchash, client_erp/module_pick.html)
   — 2026-08-14: alohida havola BERILMAYDI, hammasi shu bitta joyda. */
window.ModuleCatalog = (function () {
  var overlay = null;

  function build() {
    overlay = document.createElement('div');
    overlay.id = 'mc-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:60;background:#14171b;' +
      'display:flex;flex-direction:column';
    var username = (STATE.user && STATE.user.username) || 'bigone_cl2';
    overlay.innerHTML =
      '<div style="background:#14171b;display:flex;flex-direction:column;flex:1;overflow:hidden">' +
      '<div style="display:flex;align-items:center;gap:12px;padding:8px 14px;' +
      'border-bottom:1px solid #2a2f35;font-family:ui-monospace,monospace;font-size:.82rem;color:#e7e4de">' +
      '<button id="mc-back" style="background:#20252b;border:1px solid #383e45;color:#e7e4de;' +
      'border-radius:6px;padding:5px 12px;font-size:.8rem;cursor:pointer;font-weight:600">← Bosh sahifaga o\'tish</button>' +
      '</div>' +
      '<iframe id="mc-iframe" style="flex:1;border:none;width:100%;background:#14171b" ' +
      // ID siz yo'l — server o'zi shu foydalanuvchining zamerini topadi
      // (yo'q bo'lsa yaratadi). Ilgari `.../1/` qattiq yozilgan edi va
      // faqat bigone_cl2 da ishlardi (2026-08-15).
      'src="/mini/' + username + '/modules-pick/"></iframe>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#mc-back').addEventListener('click', close);
  }

  function open() {
    if (!overlay) build();
    overlay.style.display = 'flex';
  }

  function close() {
    // ⚠️ 2026-08-18: ilgari faqat YASHIRILARDI (`display:none`) — iframe DOM da
    // qolib, ichidagi BARCHA WebGL kontekstlari band turardi. Brauzer limiti
    // (~8-16) tugab, keyingi safar 3D umuman ochilmasdi
    // («Error creating WebGL context»). Endi butunlay olib tashlanadi —
    // kontekstlar darhol bo'shaydi, keyingi ochishda qaytadan quriladi.
    if (overlay) { overlay.remove(); overlay = null; }
  }

  return { open: open, close: close };
})();
