"""client_erp/services/b3d_render.py — .b3d fayldan server-side 3D rasm (2026-09-04).

TZ-Detal-QR-2026-09.md yangilanishi: avvalgi tekshiruvda .b3d formatini
"yopiq, o'qib bo'lmaydi" deb xulosa qilingan edi — bu XATO edi (faqat .skp
tekshirilgan edi). Loyihada allaqachon .b3d'ni to'liq teskari muhandislik
qilib, har panelning 3D geometriyasini (pozitsiya+aylanish+kontur) o'qiydigan
parser bor: `bom/module_mining.py::parse_b3d_bytes` + `bom/parser_b3d.py::
build_panel_mesh` — bular "Furniture Module Mining" admin vositasida
(bom/templates/bom/modules_bulk_upload.html, Three.js) allaqachon ishlatiladi.

Bu modul o'sha PARSER + Three.js RENDER KODINI (mesh yaratish qismi, drag/
animatsiya YO'Q — statik bitta kadr) headless Playwright orqali qayta
ishlatib, natijani PNG rasm sifatida qaytaradi. Xech qanday yangi parslash
mantig'i yozilmagan — mavjud, sinovdan o'tgan koddan foydalanilgan.
"""
import json
import logging

from django.conf import settings

logger = logging.getLogger('client_erp.b3d_render')

# bom/templates/bom/modules_bulk_upload.html:257-306 (initSceneWebGL) bilan
# BIR XIL mantiq — faqat animatsiya/drag olib tashlangan, bitta statik kadr.
_HTML_TEMPLATE = """<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#14171b;overflow:hidden}
#c{width:960px;height:720px;display:block}</style></head>
<body><div id="c"></div>
<script>__THREE_JS__</script>
<script>
function boundsOf(parts){
  var minX=1e9,minY=1e9,minZ=1e9,maxX=-1e9,maxY=-1e9,maxZ=-1e9;
  parts.forEach(function(p){
    for (var i=0;i<p.positions.length;i+=3){
      var x=p.positions[i], y=p.positions[i+1], z=p.positions[i+2];
      if (x<minX) minX=x; if (x>maxX) maxX=x;
      if (y<minY) minY=y; if (y>maxY) maxY=y;
      if (z<minZ) minZ=z; if (z>maxZ) maxZ=z;
    }
  });
  return {cx:(minX+maxX)/2, cy:(minY+maxY)/2, cz:(minZ+maxZ)/2,
          size: Math.max(maxX-minX, maxY-minY, maxZ-minZ, 0.2)};
}
var parts = __PARTS_JSON__;
var wrap = document.getElementById('c');
var w = 960, h = 720;
var scene = new THREE.Scene();
scene.background = new THREE.Color(0x14171b);
var camera = new THREE.PerspectiveCamera(45, w/h, 0.01, 100);
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
var dir = new THREE.DirectionalLight(0xffffff, 0.7); dir.position.set(2,3,2); scene.add(dir);
var dir2 = new THREE.DirectionalLight(0xffffff, 0.35); dir2.position.set(-2,-1,-2); scene.add(dir2);
var mesh_group = new THREE.Group();
parts.forEach(function(p){
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p.positions), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(p.indices), 1));
  geo.computeVertexNormals();
  var mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(p.color[0], p.color[1], p.color[2]),
    roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide,
  });
  mesh_group.add(new THREE.Mesh(geo, mat));
});
var b = boundsOf(parts);
mesh_group.position.set(-b.cx, -b.cy, -b.cz);
scene.add(mesh_group);
var dist = b.size * 1.6;
var renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
renderer.setSize(w, h);
wrap.appendChild(renderer.domElement);
// Izometrikka yaqin, biroz yuqoridan burchak — statik "hero" kadr.
camera.position.set(dist*0.62, dist*0.55 + b.size*0.3, dist*0.62);
camera.lookAt(0, 0, 0);
renderer.render(scene, camera);
window.__RENDER_DONE__ = true;
</script></body></html>"""


def b3d_to_png(data, timeout_ms=20000):
    """.b3d bayt-oqimini rasmga aylantiradi.

    Qaytaradi: (png_bytes, error) — muvaffaqiyatli bo'lsa error=None,
    aks holda png_bytes=None va error — foydalanuvchiga ko'rsatsa bo'ladigan
    qisqa xabar (masalan "shifrlangan fayl", "panel topilmadi")."""
    from bom.module_mining import parse_b3d_bytes
    from bom.parser_b3d import build_panel_mesh, material_color

    try:
        indexed_panels, status = parse_b3d_bytes(data)
    except Exception as e:
        logger.warning("b3d parse xato: %s", e)
        return None, "Fayl o'qilmadi — buzilgan yoki noto'g'ri format"

    if status == 'encrypted':
        return None, "Fayl shifrlangan — o'qib bo'lmaydi"
    if status != 'ok' or not indexed_panels:
        return None, "Fayl ichida panel topilmadi"

    parts = []
    for _idx, rec in indexed_panels:
        try:
            bm = build_panel_mesh(rec)
        except Exception:
            bm = None
        if not bm:
            continue
        verts, idx = bm
        color = material_color(rec.get('material', ''))
        parts.append({
            'positions': [c for v in verts for c in v],
            'indices': list(idx),
            'color': color,
        })

    if not parts:
        return None, "Panel geometriyasi o'qilmadi"

    three_js = (settings.BASE_DIR / 'static' / 'voice' / 'js' / 'three.min.js').read_text(encoding='utf-8')
    html = _HTML_TEMPLATE.replace('__THREE_JS__', three_js).replace('__PARTS_JSON__', json.dumps(parts))

    from playwright.sync_api import sync_playwright
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=[
                '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
                '--disable-dev-shm-usage', '--no-sandbox',
            ])
            page = browser.new_page(viewport={'width': 960, 'height': 720})
            page.set_content(html, timeout=timeout_ms)
            page.wait_for_function('window.__RENDER_DONE__ === true', timeout=timeout_ms)
            png = page.locator('#c canvas').screenshot()
            browser.close()
        return png, None
    except Exception as e:
        logger.exception("b3d render xato")
        from .server_error import log_server_error
        log_server_error('render', 'b3d_render.b3d_to_png', e)
        return None, "Render vaqtida xatolik"
