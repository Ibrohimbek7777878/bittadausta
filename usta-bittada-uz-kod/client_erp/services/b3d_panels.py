"""client_erp/services/b3d_panels.py — .b3d fayldan interaktiv panel-ma'lumot (2026-09-04/05).

TZ-Detal-QR-Interaktiv-3D-2026-09.md §2.1. `b3d_render.py` (statik PNG) dan
FARQLI — bu modul har panel uchun TO'LIQ ma'lumot (mesh + nom + o'lcham +
material + kromka) chiqaradi, frontend Three.js orqali interaktiv ko'rsatadi
(sichqoncha bilan tanlash, pastda ma'lumot kartochkasi).

Xom parslash — mavjud, sinovdan o'tgan `bom/parser_b3d.py` va
`bom/module_mining.py::parse_b3d_bytes` orqali (Detal QR statik render bilan
BIR XIL parser). Bu yerda YANGI qism — panel-darajasidagi o'lcham/kromka
matnini formatlash (mavjud kodda yo'q edi, Explore tekshiruvi bilan
tasdiqlangan)."""
import logging
import re

logger = logging.getLogger('client_erp.b3d_panels')

# ── Mahkamlagich/furnitura montaj-nuqtasi (2026-09-05, TZ-Detal-QR-
# Hole-Drilling-Research) — TASDIQLANGAN naqsh (real fayl bilan qo'lda
# tekshirildi, DOCS/B3D_PARSER_BILIM.md §11.5 "OCHILMAGAN" bo'limiga
# QO'SHIMCHA yozuv sifatida hisoblanadi):
#   - Furnitura obyekti (masalan "Евро 51мм Алкан", modelCode 3001/1005)
#     stream tartibida bevosita bitta panelga OLDIN keladi va uning
#     `tf.Rx` (yoki ba'zan `tf.Rz`) qiymati — panelning contour_outer
#     LOKAL X-koordinatasi bilan bevosita mos keladi (qo'shimcha
#     transformatsiyasiz) — panel bbox ichiga tushadigan komponent
#     ANIQLASH orqali topiladi (Rx yoki Rz, qaysi biri mos kelsa).
#   - "Линия стыка" (modelCode 1001) — ikki panel-fastener guruhi
#     orasidagi ajratuvchi marker (yangi panel guruhi boshlanishi belgisi).
# ⚠️ Bu — 1 ta real faylda (`Ekologiya.b3d`) qo'lda tasdiqlangan evristika,
# universal EMAS — boshqa fayllarda mos kelmasligi mumkin, shuning uchun
# xato bo'lsa jim o'tkazib yuboriladi (`_fastener_dot_for_panel` try/except).
_FASTENER_NAME_RE = re.compile(
    r'эксцентр|шкант|евро|конфирмат|полкодержат|петл|евровинт', re.I)


def _parse_all_objects(data):
    """`bom.module_mining.parse_b3d_bytes`ning TO'LIQ (filtrlanmagan) versiyasi
    — bizga furnitura/mahkamlagich obyektlari (modelCode != 4002) HAM kerak
    (teshik-nuqta topish uchun), asl funksiya esa faqat panellarni (4002)
    qaytaradi. `bom/module_mining.py`ga TEGILMADI (ishlab chiqarish kodi,
    boshqa joyda ham ishlatiladi) — shu sabab shu yerda mustaqil, kichik
    nusxa. Qaytaradi: (objs, status)."""
    from bom import parser_b3d as P
    if not data:
        return [], 'empty'
    model = P.inflate_biggest(data)
    if P.looks_encrypted(model):
        return [], 'encrypted'
    names, sstart, vstart = P.read_schema(model)
    stream = P.decode_stream(model, vstart, names)
    objs = P.parse_objects(stream)
    if not any(o.get('modelCode') == 4002 for o in objs):
        stream = P.decode_stream_nameless(model)
        objs = P.parse_objects(stream)
    if not any(o.get('modelCode') == 4002 for o in objs):
        return [], 'empty'
    return objs, 'ok'


def _assign_fasteners_nearest(objs, indexed_panels):
    """Fayl bo'yicha BIR MARTA hisoblanadi: har bir fastener (mahkamlagich)
    obyektini ENG YAQIN (stream-masofa bo'yicha) mos panelga biriktiradi.

    TASDIQLANGAN naqsh (2026-09-05): fastener obyektlari stream tartibida
    bitta "panel guruhi" (oldingi 4002/1001 markeridan keyingi 1001
    markerigacha) ichida keladi; qaysi panelga tegishli ekani koordinata
    mosligi orqali (`tf.Rx/Ry` yoki `tf.Rz/Ry` panel lokal bbox'iga tushishi)
    aniqlanadi.

    2026-09-10 TUZATISH #1 (994 ta real fayl bilan tasdiqlangan, 82.8% faylda
    muammo topilgan): oldingi mexanizm ("global claimed — kim birinchi
    so'rasa oladi") Bazis loyihalarida DOIM takrorlanadigan bir xil
    shakldagi panellarni (masalan 4 ta javon, tortma qutining chap/o'ng
    devori — LOKAL bbox'lari bir xil, garchi GLOBAL joylari turlicha
    bo'lsa ham) chalkashtirib, faqat BIRINCHI panelga teshik berib,
    qolganlarini BUTUNLAY bo'sh qoldirardi (bitta faylda 1050 paneldan
    atigi 5 tasida teshik chiqqan holat tasdiqlangan). Endi: bir fastener
    bir nechta panelga mos kelsa, ENG YAQIN (stream-index farqi eng kichik)
    panelga beriladi — Bazis fayl formatida fastener odatda o'z panelidan
    DARHOL OLDIN/KEYIN kelgani uchun bu qoida mirror-panel va ko'p-marta-
    takrorlanish holatlarini ham to'g'ri hal qiladi.

    2026-09-10 TUZATISH #2 (994 fayl statistikasi bilan tasdiqlangan): guruh
    oynasining YUQORI chegarasi faqat "keyingi 1001" edi — ba'zi fayllarda
    "1001" markerlari LOKAL zich joylashgani uchun (masalan har 2-4 obyektda
    bittadan) oyna sun'iy torayib, haqiqiy fastener oynadan TASHQARIDA qolib
    ketardi (nishon faylda mediana-oyna atigi ~5 obyekt, oddiy faylda ~42).
    Endi yuqori chegara "keyingi 1001" VA "keyingi panel (4002)"dan QAYSI BIRI
    UZOQROQ bo'lsa — shunga cho'ziladi (pastki chegara — eski, o'zgarmadi).
    Xavfsiz, chunki noto'g'ri-biriktirish xavfini oyna EMAS, balki
    masofa-asosli tanlov (`dist = abs(k - idx)`, pastda) nazorat qiladi —
    oyna kengaysa ham fastener baribir eng yaqin panelga beriladi.

    2026-09-11 TUZATISH #3 (200 fayl / 49,959 juftlik bilan tasdiqlangan,
    ±1.5mm tolerantlikda 91.9% aniqlik, tasodifiy-nazorat 1.9%): ko'p fayllarda
    fastener IKKI OBYEKTLI keladi — oldingi `1005` ("Евровинт...") + keyingi
    bola-obyekt (masalan `3001`, "Евро 51мм Алкан"). ESKI kod ikkalasini ham
    "fastener" deb hisoblab, ularning tf.Rx/Ry/Rz'sini TO'G'RIDAN-TO'G'RI panel
    LOKAL bbox bilan solishtirar edi — lekin bola-obyektning tf'i panelga
    ALOQASI YO'Q ichki parametr (masalan vint ichidagi qadama-chuqurlik),
    faqat OTA (`1005`) obyektning tf.Rx/Ry/Rz — HECH QANDAY qo'shimcha
    hisob-kitobsiz — haqiqiy global montaj-nuqta ekani aniqlandi. Bundan
    tashqari, panel bilan solishtirish endi LOKAL emas, panelning haqiqiy
    GLOBAL (rotatsiyalangan) bbox'i bilan qilinadi.

    Qaytaradi: {panel_stream_idx: [{'lx','ly','name'}, ...]} — 'lx'/'ly'
    panelning LOKAL tekisligidagi koordinata (mavjud `_hole_global_positions`
    formulasi bilan bir xil, o'zgarmagan)."""
    from bom.parser_b3d import contour_polygon, quat_to_matrix

    def _panel_local_bbox(rec):
        els = rec.get('contour_outer')
        if not els:
            return None
        try:
            poly = contour_polygon(els)
        except Exception:
            return None
        if len(poly) < 3:
            return None
        xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
        return (min(xs), max(xs), min(ys), max(ys))

    def _panel_global_bbox(rec, local_bbox):
        """Panel lokal bbox burchaklarini GLOBAL koordinataga aylantiradi
        (`_hole_global_positions`dagi bilan bir xil transform, faqat nuqta
        emas — bbox burchaklari uchun)."""
        tf = rec.get('tf', {})
        px, py, pz = tf.get('Rx', 0), tf.get('Ry', 0), tf.get('Rz', 0)
        q = (tf.get('Anim', 0), tf.get('Axis', 0), tf.get('Butt', 0), tf.get('Vis', 1))
        ax, ay, az = quat_to_matrix(*q)
        bx0, bx1, by0, by1 = local_bbox
        th = rec.get('thickness', 16.0) or 16.0
        xs_g = []; ys_g = []; zs_g = []
        for lx, ly in ((bx0, by0), (bx1, by0), (bx0, by1), (bx1, by1)):
            for lz in (-th / 2, th / 2):
                xs_g.append(px + lx * ax[0] + ly * ay[0] + lz * az[0])
                ys_g.append(py + lx * ax[1] + ly * ay[1] + lz * az[1])
                zs_g.append(pz + lx * ax[2] + ly * ay[2] + lz * az[2])
        return (min(xs_g) - 3, max(xs_g) + 3, min(ys_g) - 3, max(ys_g) + 3,
                min(zs_g) - 3, max(zs_g) + 3)

    panel_idx_set = {idx for idx, _ in indexed_panels}
    panel_local_bbox = {}
    panel_global_bbox = {}
    for idx, rec in indexed_panels:
        lb = _panel_local_bbox(rec)
        if not lb:
            continue
        panel_local_bbox[idx] = lb
        panel_global_bbox[idx] = _panel_global_bbox(rec, lb)

    n = len(objs)
    best = {}   # fastener_stream_idx -> (panel_idx, dist, lx, ly, name)
    for idx, rec in indexed_panels:
        lbbox = panel_local_bbox.get(idx)
        gbbox = panel_global_bbox.get(idx)
        if not lbbox or not gbbox:
            continue
        bx0, bx1, by0, by1 = lbbox
        gx0, gx1, gy0, gy1, gz0, gz1 = gbbox
        # Pastki chegara — eski mantiq bilan BIR XIL.
        start = idx
        j = idx - 1
        while j >= 0 and objs[j].get('modelCode') not in (4002, 1001):
            start = j
            j -= 1
        # Yuqori chegara — TUZATISH #2: "keyingi 1001" VA "keyingi 4002"dan
        # qaysi biri uzoqroq, shunga cho'ziladi (tor-1001-segment muammosi).
        end_1001 = idx
        j = idx + 1
        while j < n and objs[j].get('modelCode') != 1001:
            end_1001 = j
            j += 1
        end_panel = idx
        j = idx + 1
        while j < n and objs[j].get('modelCode') != 4002:
            end_panel = j
            j += 1
        end = max(end_1001, end_panel)

        for k in range(start, end + 1):
            if k in panel_idx_set:
                continue
            o = objs[k]
            tf = o.get('tf')
            nm = o.get('name') or ''
            if not (tf and _FASTENER_NAME_RE.search(nm)):
                continue
            # TUZATISH #3: agar bevosita oldingi obyekt `1005` bo'lsa va
            # o'zi tf'ga ega bo'lsa — HAQIQIY global koordinata SHU (ota),
            # bolaning (`o`) tf'i e'tiborsiz qoldiriladi. Aks holda (ota
            # yo'q/mos emas) — eski xavfsiz zaxira: o'zining tf'i ishlatiladi.
            parent = objs[k - 1] if k > 0 else None
            if parent is not None and parent.get('modelCode') == 1005 and parent.get('tf'):
                gx, gy, gz = parent['tf'].get('Rx', 0), parent['tf'].get('Ry', 0), parent['tf'].get('Rz', 0)
            else:
                gx, gy, gz = tf.get('Rx', 0), tf.get('Ry', 0), tf.get('Rz', 0)
            if not (gx0 <= gx <= gx1 and gy0 <= gy <= gy1 and gz0 <= gz <= gz1):
                continue
            # Lokal (lx,ly) — `_hole_global_positions` shu panelning O'Z
            # lokal tf'i bilan qayta hisoblaydi, shuning uchun eski
            # (tf.Rx/Ry yoki tf.Rz/Ry) taxminni ZAXIRA sifatida saqlaymiz.
            lx, ly = tf.get('Rx', 0), tf.get('Ry', 0)
            if not (bx0 - 2 <= lx <= bx1 + 2 and by0 - 2 <= ly <= by1 + 2):
                lx, ly = tf.get('Rz', 0), tf.get('Ry', 0)
            dist = abs(k - idx)
            prev = best.get(k)
            if prev is None or dist < prev[1]:
                best[k] = (idx, dist, lx, ly, nm)

    result = {}
    for _k, (panel_idx, _dist, lx, ly, nm) in best.items():
        result.setdefault(panel_idx, []).append({'lx': lx, 'ly': ly, 'name': nm})
    return result


def _hole_global_positions(rec, holes, scale=0.001):
    """Teshik-nuqtalarning LOKAL (lx,ly) koordinatasini panel yuzasi
    ustidagi GLOBAL 3D nuqtaga aylantiradi — `bom.parser_b3d.build_panel_mesh`
    dagi `G(x,y,z)` transformatsiyasi bilan BIR XIL formula (mesh bilan mos
    kelishi uchun; funksiyaning o'ziga TEGILMADI, bu yerda faqat nuqta uchun
    qayta hisoblanadi). Qaytaradi: [{x,y,z,name}, ...] (metrda, mesh bilan
    bir xil koordinata tizimida)."""
    from bom.parser_b3d import quat_to_matrix
    if not holes:
        return []
    tf = rec.get('tf', {})
    px, py, pz = tf.get('Rx', 0), tf.get('Ry', 0), tf.get('Rz', 0)
    q = (tf.get('Anim', 0), tf.get('Axis', 0), tf.get('Butt', 0), tf.get('Vis', 1))
    ax, ay, az = quat_to_matrix(*q)
    dpar = rec.get('drawerParent')
    if dpar:
        pq = (dpar.get('Anim', 0), dpar.get('Axis', 0), dpar.get('Butt', 0), dpar.get('Vis', 1))
        pax, pay, paz = quat_to_matrix(*pq)
        pp = (dpar.get('Rx', 0), dpar.get('Ry', 0), dpar.get('Rz', 0))

        def _cmb(a):
            return (a[0] * pax[0] + a[1] * pay[0] + a[2] * paz[0],
                    a[0] * pax[1] + a[1] * pay[1] + a[2] * paz[1],
                    a[0] * pax[2] + a[1] * pay[2] + a[2] * paz[2])
        ax, ay, az = _cmb(ax), _cmb(ay), _cmb(az)
        px, py, pz = (pp[0] + px * pax[0] + py * pay[0] + pz * paz[0],
                      pp[1] + px * pax[1] + py * pay[1] + pz * paz[1],
                      pp[2] + px * pax[2] + py * pay[2] + pz * paz[2])
    thickness = rec.get('thickness', 16.0) or 16.0
    out = []
    for h in holes:
        x, y, z = h['lx'], h['ly'], thickness / 2
        gx = px + x * ax[0] + y * ay[0] + z * az[0]
        gy = py + x * ax[1] + y * ay[1] + z * az[1]
        gz = pz + x * ax[2] + y * ay[2] + z * az[2]
        out.append({'x': round(gx * scale, 4), 'y': round(gy * scale, 4), 'z': round(gz * scale, 4), 'name': h['name']})
    return out


def _panel_size_mm(rec):
    """Panel konturidan (x,y nuqtalar) kenglik/balandlikni (mm) hisoblaydi."""
    from bom.parser_b3d import contour_polygon
    els = rec.get('contour_outer')
    if not els:
        return None, None
    poly = contour_polygon(els)
    if len(poly) < 3:
        return None, None
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return round(max(xs) - min(xs), 1), round(max(ys) - min(ys), 1)


def _edges_text(rec):
    """Kromka(lar)ni «22x2 ПВХ Кора · 4» kabi matn qatorlariga guruhlaydi
    (nom+qalinlik bo'yicha, nechta qirraga qo'yilgani sanaladi)."""
    butts = rec.get('butts') or []
    groups = {}
    for b in butts:
        fb = b.get('TFurnButt') or {}
        name = (fb.get('butt_name') or fb.get('name') or '').strip()
        if not name:
            continue
        thickness = fb.get('thickness')
        key = (name, thickness)
        groups[key] = groups.get(key, 0) + 1
    out = []
    for (name, thickness), count in groups.items():
        label = name
        if thickness:
            label = f"{thickness}mm {name}"
        out.append(f"{label} · {count}")
    return out


_GROUP_LABELS = {
    'shkaf': 'Shkaf', 'tortmali_blok': 'Tortmali blok',
    'pilyastra': 'Ustun (pilyastra)', 'javon': "Javon",
}


def _group_panels(indexed_panels):
    """Panellarni fayl ICHIDAGI joylashuvi bo'yicha "mebel bo'lagi"ga
    guruhlaydi (2026-09-04, katta — bir necha mebeldan iborat — fayllarda
    415 ta tekis ro'yxat o'rniga "Shkaf (120 ta)" kabi qisqa guruhlar
    ko'rsatish uchun). Mavjud, sinovdan o'tgan modul-mining klasterlash
    (`cluster_stream_index`) dan foydalanadi — yangi mantiq yozilmagan."""
    from bom.module_mining import cluster_stream_index, guess_category, _group_to_module_dict
    groups = cluster_stream_index(indexed_panels)
    labeled = []
    for gi, members in enumerate(groups, start=1):
        try:
            mdict = _group_to_module_dict(members)
            cat = guess_category(mdict)
        except Exception:
            cat = ''
        label = _GROUP_LABELS.get(cat) or f"{gi}-bo'lak"
        labeled.append((label, members))
    return labeled


def b3d_to_panels(data):
    """.b3d bayt-oqimini interaktiv panel-ro'yxatga aylantiradi.

    Qaytaradi: (panels, error) — muvaffaqiyatli bo'lsa error=None.
    Har panel: {code, name, group, width_mm, height_mm, thickness_mm,
    material, edges: [str], holes: [{x,y,name}], positions: [float],
    indices: [int], color: [r,g,b]}. `group` — qisqa mebel-bo'lak nomi
    (masalan "Shkaf"), frontend ro'yxatni shu bo'yicha yig'ib ko'rsatadi.
    `holes` — furnitura/mahkamlagich montaj-nuqtalari (2026-09-05 tadqiqoti,
    TASDIQLANGAN evristika, universal EMAS — ba'zi fayllarda bo'sh qolishi
    mumkin, xavfsiz: xato bo'lsa jim o'tkazib yuboriladi)."""
    from bom.module_mining import cluster_stream_index
    from bom.parser_b3d import build_panel_mesh, material_color

    try:
        objs, status = _parse_all_objects(data)
    except Exception as e:
        logger.warning("b3d panel parse xato: %s", e)
        return None, "Fayl o'qilmadi — buzilgan yoki noto'g'ri format"

    if status == 'encrypted':
        return None, "Fayl shifrlangan — o'qib bo'lmaydi"
    if status != 'ok':
        return None, "Fayl ichida panel topilmadi"

    indexed_panels = [(idx, o) for idx, o in enumerate(objs) if o.get('modelCode') == 4002]
    if not indexed_panels:
        return None, "Fayl ichida panel topilmadi"

    try:
        grouped = _group_panels(indexed_panels)
    except Exception as e:
        logger.warning("b3d guruhlash xato: %s", e)
        grouped = [('', indexed_panels)]

    # Fastener→panel biriktirish FAYL bo'yicha BIR MARTA, oldindan hisoblanadi
    # (2026-09-10 — eng yaqin panelga biriktirish, §994-fayl tadqiqoti).
    try:
        fastener_map = _assign_fasteners_nearest(objs, indexed_panels)
    except Exception as e:
        logger.warning("b3d fastener-biriktirish xato: %s", e)
        fastener_map = {}

    panels = []
    counter = 0
    for label, members in grouped:
        for stream_idx, rec in members:
            counter += 1
            try:
                bm = build_panel_mesh(rec)
            except Exception:
                bm = None
            if not bm:
                continue
            verts, idx = bm
            width_mm, height_mm = _panel_size_mm(rec)

            holes = []
            try:
                local_holes = fastener_map.get(stream_idx, [])
                if local_holes:
                    holes = _hole_global_positions(rec, local_holes)
            except Exception as e:
                logger.warning("b3d hole-detect xato (panel %s): %s", stream_idx, e)

            panels.append({
                'code': f"{counter:02d}_{counter:03d}",
                'name': rec.get('name') or 'Panel',
                'group': label,
                'width_mm': width_mm,
                'height_mm': height_mm,
                'thickness_mm': rec.get('thickness'),
                'material': rec.get('material') or '',
                'edges': _edges_text(rec),
                'holes': holes,
                'positions': [c for v in verts for c in v],
                'indices': list(idx),
                'color': material_color(rec.get('material', '')),
            })

    if not panels:
        return None, "Panel geometriyasi o'qilmadi"

    return panels, None
