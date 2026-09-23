"""client_erp/services/plan_vision.py — TZ-Xona-Qoshish-Chizmadan.md §F2.

Chizma (rasm/PDF) dan xona poligonini o'qiydi.

Oqim:  fayl → `prepare_image()` (PDF sahifasi → PNG, katta rasm kichraytirish)
       → `analyze_plan()` (Claude vision, zaxira: bepul kalitlar)
       → normalizatsiya (mm ga keltirish, poligonni tozalash)

⚠️ Natija HECH QACHON to'g'ridan-to'g'ri xonaga aylanmaydi — foydalanuvchi
tasdiqlash ekranida ko'radi va tuzatadi (TZ §F2-4).
"""
import json
import logging
import math
import os
import re

logger = logging.getLogger(__name__)

MAX_PX = 2000          # AI ga yuboriladigan rasmning eng katta tomoni
PDF_DPI = 150


# ─────────────────────────────────────────────────────────────────────────
#  1. Rasm tayyorlash
# ─────────────────────────────────────────────────────────────────────────
def prepare_image(src_path, out_path, page=0):
    """Manba fayldan AI uchun PNG tayyorlaydi. Muvaffaqiyatda `out_path`,
    aks holda `None` qaytaradi. Hech qachon Exception ko'tarmaydi."""
    try:
        low = (src_path or '').lower()
        if low.endswith('.pdf'):
            import fitz                      # PyMuPDF
            doc = fitz.open(src_path)
            if doc.page_count < 1:
                return None
            pg = doc.load_page(max(0, min(page, doc.page_count - 1)))
            zoom = PDF_DPI / 72.0
            pix = pg.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
            pix.save(out_path)
            doc.close()
            return _shrink(out_path)
        # Oddiy rasm
        from PIL import Image
        try:
            from pillow_heif import register_heif_opener
            register_heif_opener()
        except Exception:
            pass
        im = Image.open(src_path)
        if im.mode not in ('RGB', 'L'):
            im = im.convert('RGB')
        im.save(out_path, 'PNG')
        return _shrink(out_path)
    except Exception as e:  # noqa: BLE001
        logger.warning("plan_vision.prepare_image xato: %s", e)
        return None


def _shrink(path):
    """Rasmni MAX_PX ga kichraytiradi (AI narxi va tezligi uchun)."""
    try:
        from PIL import Image
        im = Image.open(path)
        w, h = im.size
        if max(w, h) > MAX_PX:
            k = MAX_PX / float(max(w, h))
            im = im.resize((max(1, int(w * k)), max(1, int(h * k))), Image.LANCZOS)
            im.save(path, 'PNG')
    except Exception as e:  # noqa: BLE001
        logger.warning("plan_vision._shrink xato: %s", e)
    return path


# ─────────────────────────────────────────────────────────────────────────
#  2. AI ga so'rov
# ─────────────────────────────────────────────────────────────────────────
PROMPT = """Sen — mebel ustasi uchun ishlaydigan qurilish chizmasi o'qigichsan.

Rasmda XONA yoki KVARTIRA PLANI (yuqoridan ko'rinish) bor.

⚠️ ENG MUHIM: agar chizmada BIR NECHA XONA bo'lsa (mehmonxona, yotoqxona,
oshxona, hammom, koridor…) — ularni BITTA katta to'rtburchak qilib BERMA.
HAR BIR XONANI ALOHIDA ber, o'z nomi va o'z konturi bilan. Usta bitta
xonaga mebel qo'yadi, butun kvartiraga emas.

Har xona uchun: ICHKI kontur (devorning ichki yuzasi bo'ylab) va shu
xonaning eshik/derazalari.

QAT'IY QOIDALAR:
1. Faqat JSON qaytar. Izoh, ```json belgisi, matn QO'SHMA.
2. O'lchamni O'YLAB TOPMA. Chizmada raqam (mm/sm/m) yoki maydon (m²)
   yozilgan bo'lsa — o'shandan foydalan va "scale_known": true qil.
   Hech qanday raqam yo'q bo'lsa — piksel koordinatasini ber va
   "scale_known": false qil.
3. Barcha o'lchamlar MILLIMETRDA. Chizmada sm bo'lsa ×10, m bo'lsa ×1000.
4. Nuqtalar soat strelkasi bo'yicha, ketma-ket; birinchi nuqta oxirida
   TAKRORLANMASIN.
5. Koordinata boshi — rasmning chap-yuqori burchagi. x — o'ngga, y — pastga.
   Barcha xonalar BIR XIL koordinata tizimida bo'lsin.
6. "wall" — shu xonaning nuqtalar ro'yxatidagi devor indeksi (0 dan;
   0-devor = 0-nuqtadan 1-nuqtaga). "offset" — shu devor boshidan mm.
7. Xona nomi chizmada yozilgan bo'lsa o'shani ol (mexmonxona, yotoqxona,
   oshxona, hammom, dush, kotelni, koridor…). Yozilmagan bo'lsa
   "Xona 1", "Xona 2" deb nomla.
8. Ishonching past bo'lsa "confidence" ni past qo'y — yolg'on aniqlik BERMA.
9. Har xona konturi odatda 4-8 ta nuqta. BIR XIL nuqtani takrorlama,
   bitta to'g'ri devorni ko'p nuqtaga bo'lma — faqat BURCHAKLARNI ber.
10. Javob qisqa bo'lsin: ortiqcha bo'shliq va yangi qator ISHLATMA.
11. ⚠️ O'LCHAM ZANJIRLARI — arxitektor chizmalarida chetlarda raqamlar
    QATORI bo'ladi (masalan yuqorida: 5150 · 120 · 2800 · 120 · 5520).
    Bu raqamlar KOORDINATA EMAS — ular ketma-ket bo'laklar UZUNLIGI,
    yig'indisi = shu tomonning to'liq uzunligi. Ularni "dim_chains" ga
    KO'RGANING BO'YICHA, TARTIB BILAN yoz. Bu masshtabning eng aniq
    manbasi — topsang albatta ber.

JSON tuzilishi:
{
  "unit": "mm",
  "scale_known": true,
  "rooms": [
    {
      "name": "oshxona",
      "points": [[x,y], [x,y], ...],
      "area_m2": 17.02,
      "openings": [
        {"wall": 0, "offset": 800, "width": 900, "height": 2100,
         "sill": 0, "kind": "eshik"}
      ]
    }
  ],
  "dim_chains": [
    {"side": "top",    "values": [5150, 120, 2800, 120, 5520]},
    {"side": "bottom", "values": [2080, 100, 4940, 850, 2190]},
    {"side": "left",   "values": [1860, 1460, 1190, 800]}
  ],
  "overall_width": 13710,
  "overall_depth": 6000,
  "wall_thickness": 100,
  "room_height": 2700,
  "confidence": 0.0,
  "notes": "o'zbekcha qisqa izoh: nima aniq, nima taxminiy"
}

Eshik: kind="eshik" (sill 0, height 2100). Deraza: kind="deraza"
(sill 800-900, height 1400). Chizmada eshik yoy (arc) bilan, deraza
devordagi ingichka uzilish bilan ko'rsatiladi.
Balandlik chizmada ko'rinmasa standart qiymatni ishlat."""


# ── 1-BOSQICH: faqat tashqi kontur va o'lcham zanjirlari (§A3) ────────
PROMPT_SCALE = """Sen — qurilish chizmasi o'qigichsan. Bu rasmda xona yoki
kvartira plani bor.

FAQAT quyidagilarni top (xonalarni SANAMA, ichki devorlarni CHIZMA):

1. Chetlardagi O'LCHAM ZANJIRLARI — chizma yonidagi raqamlar QATORI
   (masalan yuqorida: 5150 · 120 · 2800 · 120 · 5520). Ular ketma-ket
   bo'laklar uzunligi, yig'indisi = shu tomonning to'liq uzunligi.
   Qaysi tomonda ekanini ham yoz.
2. Umumiy kenglik va chuqurlik (mm da). Zanjir yig'indisidan hisobla.
3. O'lcham birligi: chizmada sm bo'lsa ×10, m bo'lsa ×1000 qilib mm ga o'tkaz.

Faqat JSON qaytar, izohsiz:
{"dim_chains":[{"side":"top","values":[5150,120,2800,120,5520]},
               {"side":"left","values":[1860,1460,1190,800]}],
 "overall_width": 13710, "overall_depth": 6000,
 "unit_found": "mm", "confidence": 0.0}

Raqam topolmasang bo'sh ro'yxat va 0 ber — O'YLAB TOPMA."""


def analyze_scale(image_path):
    """1-bosqich: chizmadan faqat o'lcham zanjiri va umumiy gabarit.
    Kichik, aniq javob — ikkinchi so'rov uchun tayanch bo'ladi."""
    txt, _ = _ask_gemini(image_path, PROMPT_SCALE)
    if not txt:
        txt, _ = _ask_claude(image_path, PROMPT_SCALE)
    d = _parse_json(txt) if txt else None
    if not isinstance(d, dict):
        return None
    w, h = _chain_totals(d.get('dim_chains'))
    w = w or _num_or_none(d.get('overall_width'))
    h = h or _num_or_none(d.get('overall_depth'))
    if not w and not h:
        return None
    return {'overall_width': w, 'overall_depth': h,
            'dim_chains': d.get('dim_chains') or []}


def analyze_plan(image_path):
    """(natija_dict, meta) qaytaradi. Xato bo'lsa (None, {'error': ...}).

    ⚠️ IKKI BOSQICH (2026-08-19, §A3): bitta so'rovda AI ham gabaritni,
    ham 9 xonani, ham teshiklarni topishga urinib yanglishadi (arxitektor
    chizmasida butun kvartirani 5150×2450 deb o'qigan edi). Endi avval
    FAQAT o'lcham zanjiri so'raladi, keyin xonalar — ikkinchi so'rovda
    gabarit MA'LUM bo'lgani uchun AI unga moslashadi.

    Zaxira zanjiri: Claude → Gemini → bepul kalitlar."""
    # ⚠️ IKKI SO'ROV YONMA-YON (2026-08-19): ketma-ket bo'lsa 2-4 daqiqa
    # ketardi va foydalanuvchi «qotib qoldi» deb o'ylardi. Ikkalasi
    # bir-biriga bog'liq emas (gabarit natijaga KEYIN qo'shiladi),
    # shuning uchun birga yuboriladi — vaqt deyarli YARMIGA tushadi.
    import threading
    box = {}

    def _stage1():
        try:
            box['scale'] = analyze_scale(image_path)
        except Exception as e:  # noqa: BLE001
            logger.warning("plan_vision: 1-bosqich xato: %s", e)

    def _stage2():
        try:
            t, m = _ask_claude(image_path)
            if not t:
                t, m = _ask_gemini(image_path)
            if not t:
                t, m = _ask_free_keys(image_path)
            box['txt'], box['meta'] = t, m
        except Exception as e:  # noqa: BLE001
            logger.warning("plan_vision: 2-bosqich xato: %s", e)

    th1 = threading.Thread(target=_stage1, daemon=True)
    th2 = threading.Thread(target=_stage2, daemon=True)
    th1.start(); th2.start()
    th2.join(timeout=300)
    th1.join(timeout=60)
    try:
        from django.db import connections
        connections.close_all()          # fon-oqim ulanishini yopadi
    except Exception:
        pass

    scale = box.get('scale')
    if scale:
        logger.info("plan_vision: 1-bosqich gabarit: %sx%s mm",
                    scale.get('overall_width'), scale.get('overall_depth'))
    txt, meta = box.get('txt'), box.get('meta')
    if not txt:
        return None, {'error': "AI javob bermadi (Claude va zaxira kalitlar ishlamadi)"}
    data = _parse_json(txt)
    if not data:
        return None, {'error': "AI javobini o'qib bo'lmadi", 'raw': (txt or '')[:400]}
    # 1-bosqichda topilgan gabarit USTUN — ikkinchi so'rov uni bermagan
    # bo'lsa ham masshtab shundan hisoblanadi.
    if scale:
        if scale.get('overall_width'):
            data['overall_width'] = scale['overall_width']
        if scale.get('overall_depth'):
            data['overall_depth'] = scale['overall_depth']
        if scale.get('dim_chains') and not data.get('dim_chains'):
            data['dim_chains'] = scale['dim_chains']
    return data, (meta or {})


def _ask_claude(image_path, prompt=None):
    try:
        import base64
        from django.conf import settings
        import anthropic

        key = getattr(settings, 'ANTHROPIC_API_KEY', '') or ''
        if not key:
            return None, None
        with open(image_path, 'rb') as f:
            b64 = base64.standard_b64encode(f.read()).decode()
        model = getattr(settings, 'ROOM_PLAN_AI_MODEL', 'claude-sonnet-5')
        cli = anthropic.Anthropic(api_key=key)
        resp = cli.messages.create(
            model=model,
            max_tokens=2000,
            messages=[{
                'role': 'user',
                'content': [
                    {'type': 'image', 'source': {
                        'type': 'base64', 'media_type': 'image/png', 'data': b64}},
                    {'type': 'text', 'text': prompt or PROMPT},
                ],
            }],
        )
        out = ''.join(getattr(b, 'text', '') for b in (resp.content or []))
        return out, {'provider': 'claude', 'model': model}
    except Exception as e:  # noqa: BLE001
        logger.warning("plan_vision: Claude xato: %s", e)
        return None, None


def _ask_gemini(image_path, prompt=None):
    """Gemini vision — Claude krediti tugaganda ASOSIY zaxira.

    Kalitlar CRM «Tekin API Kalitlar» hovuzidan olinadi (Gemini Live bilan
    bir xil ro'yxat) va navbat bilan sinaladi — biri limitga tushsa
    keyingisi ishlatiladi. ⚠️ Kalit `?key=` parametrida yuborilishi SHART:
    `AQ.…` ko'rinishidagi AI Studio kalitlari `x-goog-api-key` sarlavhasi
    bilan 401 beradi (2026-08-18 sinovda aniqlandi)."""
    try:
        import base64
        import requests

        keys = []
        try:
            from client_erp.gemini_live import live_key_candidates
            keys = [c['key'] for c in live_key_candidates() if c.get('key')]
        except Exception:
            pass
        if not keys:
            from django.conf import settings
            k = (getattr(settings, 'GEMINI_API_KEY', '') or '').strip()
            if k:
                keys = [k]
        if not keys:
            return None, None

        with open(image_path, 'rb') as f:
            b64 = base64.standard_b64encode(f.read()).decode()
        from django.conf import settings as st
        # Chizma o'qish — og'ir vazifa. Avval aniqroq `pro`, u limitga
        # tushsa/ishlamasa `flash` sinaladi (2026-08-18: kvartira planida
        # `flash` bir xil nuqtani takrorlab, javobni cho'zib yuborardi).
        # Tartib: yangi/kuchli → eskiroq/tez. Biri mavjud bo'lmasa (404)
        # yoki limitga tushsa keyingisi sinaladi.
        # ⚠️ 2026-08-19 SINALGAN: `gemini-2.5-flash` YANGI kalitlarga
        # berilmaydi («no longer available to new users») — 6 kalitdan
        # faqat 1 tasi ishlardi va u kunlik limitga tushgan edi, natijada
        # butun chizma-o'qish to'xtab qolgandi. Sinov natijasi:
        #   gemini-3-flash-preview  → 5/5 kalit
        #   gemini-flash-latest     → 4/5 kalit
        #   gemini-2.5-flash        → 1/5 kalit
        #   gemini-pro-latest       → 0/5 kalit
        models = getattr(st, 'ROOM_PLAN_GEMINI_MODELS',
                         ['gemini-3-flash-preview', 'gemini-flash-latest',
                          'gemini-2.5-flash'])
        body = {
            'contents': [{'parts': [
                {'inline_data': {'mime_type': 'image/png', 'data': b64}},
                {'text': prompt or PROMPT},
            ]}],
            'generationConfig': {
                'temperature': 0,
                'maxOutputTokens': 32000,
                # ⚠️ gemini-2.5-flash «o'ylash» rejimida ishlaydi va o'ylash
                # tokenlari HAM shu limitdan yeyiladi — natijada JSON
                # o'rtasida kesilib qolardi (2026-08-18 sinovda aniqlandi).
                # O'ylash o'chirilgach javob to'liq keladi.
                'thinkingConfig': {'thinkingBudget': 0},
            },
        }
        last = ''
        for model in models:
            for key in keys[:6]:
                url = ('https://generativelanguage.googleapis.com/v1beta/models/'
                       + model + ':generateContent?key=' + key)
                try:
                    r = requests.post(url, json=body, timeout=180)
                except Exception as e:  # noqa: BLE001
                    last = str(e)
                    continue
                if r.status_code != 200:
                    last = '%s %s' % (r.status_code, r.text[:150])
                    logger.warning("plan_vision: %s kalit ishlamadi: %s", model, last)
                    continue
                j = r.json()
                cand = (j.get('candidates') or [{}])[0]
                parts = ((cand.get('content') or {}).get('parts') or [])
                out = ''.join(p.get('text', '') for p in parts)
                if cand.get('finishReason') == 'MAX_TOKENS':
                    logger.warning("plan_vision: %s javobi kesildi (MAX_TOKENS)", model)
                if out:
                    return out, {'provider': 'gemini', 'model': model}
                last = "bo'sh javob"
        logger.warning("plan_vision: Gemini barcha kalit/model ishlamadi: %s", last)
        return None, None
    except Exception as e:  # noqa: BLE001
        logger.warning("plan_vision: Gemini xato: %s", e)
        return None, None


def _ask_free_keys(image_path):
    try:
        from free_api_key.chat import try_free_keys_vision
        return try_free_keys_vision(PROMPT, image_path)
    except Exception as e:  # noqa: BLE001
        logger.warning("plan_vision: bepul kalitlar xato: %s", e)
        return None, None


def _parse_json(txt):
    """AI javobidan JSON ajratib oladi (```json o'ramini ham yechadi)."""
    if not txt:
        return None
    t = txt.strip()
    t = re.sub(r'^```(?:json)?', '', t).strip()
    t = re.sub(r'```$', '', t).strip()
    try:
        return json.loads(t)
    except Exception:
        pass
    m = re.search(r'\{.*\}', t, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────
#  3. Normalizatsiya — tasdiqlash ekraniga tayyor ko'rinish
# ─────────────────────────────────────────────────────────────────────────
def normalize(data):
    """AI natijasini muharrir kutayotgan shaklga keltiradi.

    ⚠️ 2026-08-18: xonalar BIR KOORDINATA TIZIMIDA qoladi — kvartira
    bitta butun bo'lib chiqishi uchun (Coohom uslubi). Ilgari har xona
    o'z (0,0) iga ko'chirilardi va joylashuv butunlay yo'qolardi.

    Qaytadi: {"rooms": [{name, points, openings, area_m2}], scale_known,
              thickness_mm, room_height, confidence, notes}"""
    if not isinstance(data, dict):
        return None

    raw_rooms = data.get('rooms')
    if not isinstance(raw_rooms, list) or not raw_rooms:
        if isinstance(data.get('points'), list):
            raw_rooms = [{'name': data.get('name') or 'Xona',
                          'points': data.get('points'),
                          'openings': data.get('openings') or []}]
        else:
            return None

    scale_known = bool(data.get('scale_known')) and (data.get('unit') != 'px')

    rooms = []
    for r in raw_rooms[:40]:
        if not isinstance(r, dict):
            continue
        one = _one_room(r)
        if one:
            rooms.append(one)
    if not rooms:
        return None

    # ══ 1. YAGONA MASSHTAB — UCH POG'ONALI ANIQLASH (2026-08-19) ═════════
    # Bir xil koeffitsient hamma xonaga qo'llanadi, shuning uchun
    # xonalarning bir-biriga nisbatan joyi SAQLANADI.
    #
    # Tartib (ishonchlilik bo'yicha):
    #   1) O'LCHAM ZANJIRI — arxitektor chizmasidagi chetdagi raqamlar
    #      qatori (5150+120+2800+120+5520). Eng aniq manba.
    #   2) UMUMIY GABARIT — "1570x1000 sm" kabi yozuv.
    #   3) m² YORLIQLARI — uy-plani chizmalarida bo'ladi.
    # Hech biri yo'q bo'lsa — foydalanuvchidan so'raladi.
    xs_all = [p[0] for r in rooms for p in r['points']]
    ys_all = [p[1] for r in rooms for p in r['points']]
    span_x = (max(xs_all) - min(xs_all)) or 1
    span_y = (max(ys_all) - min(ys_all)) or 1

    k = None
    src = ''
    # (1) o'lcham zanjirlari
    cw, cd = _chain_totals(data.get('dim_chains'))
    if not cw:
        cw = _num_or_none(data.get('overall_width'))
    if not cd:
        cd = _num_or_none(data.get('overall_depth'))
    if cw and cw > 1000:
        k = cw / span_x
        src = 'zanjir/gabarit (kenglik)'
    elif cd and cd > 1000:
        k = cd / span_y
        src = 'zanjir/gabarit (chuqurlik)'

    # (3) m² yorliqlari — zanjir bo'lmasa
    ratios = []
    for r in rooms:
        calc = abs(_shoelace(r['points'])) / 2.0 / 1e6
        if r['area_m2'] > 0.5 and calc > 0.0001:
            ratios.append(r['area_m2'] / calc)
    if k is None and ratios:
        ratios.sort()
        med = ratios[len(ratios) // 2]
        if med > 1.3 or med < 0.77:
            k = math.sqrt(med)
            src = 'maydon (m²)'

    if k is None:
        if not scale_known:
            k = 10000.0 / span_x        # nisbatni saqlab ~10 m
            src = 'taxminiy (masshtab topilmadi)'
        else:
            k = 10.0 if span_x < 1000 else 1.0
            src = 'sm→mm' if k == 10.0 else 'o\'zgarishsiz'
    # Aqlga sig'maydigan koeffitsientni rad etamiz
    if not (0.001 < k < 1000):
        k = 1.0
        src = 'rad etildi (aqlsiz koeffitsient)'

    # ══ 2. UMUMIY KOORDINATA — hamma xona bir tizimda ════════════════════
    allp = [p for r in rooms for p in r['points']]
    mnx = min(p[0] for p in allp)
    mny = min(p[1] for p in allp)
    for r in rooms:
        r['points'] = [[round((p[0] - mnx) * k, 1), round((p[1] - mny) * k, 1)]
                       for p in r['points']]
        for o in r['openings']:
            o['offset'] = round(o['offset'] * k, 1)
            if not scale_known:
                _d = (o['kind'] == 'deraza')
                o['width'], o['height'] = (1200, 1400) if _d else (900, 2100)
                o['sill'] = 900 if _d else 0
        if r['area_m2'] <= 0:
            r['area_m2'] = round(abs(_shoelace(r['points'])) / 2.0 / 1e6, 2)

    if k != 1.0:
        logger.info("plan_vision: masshtab %.4fx (%s), %d xona", k, src, len(rooms))

    # ══ 3. AQL-IDROK TEKSHIRUVI (§A4, 2026-08-19) ════════════════════════
    # AI ba'zan 330 mm enli «xona» yoki 19 burchakli kontur qaytaradi —
    # bunday xona bo'lmaydi. Shubhalilarni BELGILAYMIZ (o'chirmaymiz —
    # qaror ustaники), konturni soddalashtiramiz.
    warns = []
    for r in rooms:
        r['points'] = _simplify(r['points'])
        xs = [p[0] for p in r['points']]
        ys = [p[1] for p in r['points']]
        w_ = max(xs) - min(xs)
        d_ = max(ys) - min(ys)
        r['w_mm'] = round(w_)
        r['d_mm'] = round(d_)
        r['suspect'] = ''
        if w_ < 800 or d_ < 800:
            r['suspect'] = 'juda kichik (%d×%d mm)' % (w_, d_)
        elif len(r['points']) > 12:
            r['suspect'] = '%d burchak — shakli shubhali' % len(r['points'])
        if r['suspect']:
            warns.append('%s: %s' % (r['name'], r['suspect']))
        r['area_m2'] = round(abs(_shoelace(r['points'])) / 2.0 / 1e6, 2)

    # Xonalar yig'indisi umumiy gabaritdan katta bo'lsa — ogohlantirish
    tot_area = sum(r['area_m2'] for r in rooms)
    xs2 = [p[0] for r in rooms for p in r['points']]
    ys2 = [p[1] for r in rooms for p in r['points']]
    gab_area = ((max(xs2) - min(xs2)) * (max(ys2) - min(ys2))) / 1e6
    if gab_area > 0 and tot_area > gab_area * 1.15:
        warns.append('xonalar yig\'indisi (%.1f m²) umumiy maydondan (%.1f m²) katta'
                     % (tot_area, gab_area))

    th = data.get('wall_thickness')
    rh = data.get('room_height')
    try:
        conf = float(data.get('confidence') or 0)
    except (TypeError, ValueError):
        conf = 0.0

    return {
        'rooms': rooms,
        'points': rooms[0]['points'],          # moslik uchun
        'openings': rooms[0]['openings'],
        'scale_known': scale_known or bool(ratios) or bool(cw or cd),
        'scale_src': src,
        'overall_w': round(max(xs2) - min(xs2)),
        'overall_d': round(max(ys2) - min(ys2)),
        'warnings': warns[:12],
        'thickness_mm': int(th) if isinstance(th, (int, float)) and 20 <= th <= 600 else 100,
        'room_height': int(rh) if isinstance(rh, (int, float)) and 1500 <= rh <= 6000 else 2700,
        'confidence': max(0.0, min(1.0, conf)),
        'notes': str(data.get('notes') or '')[:500],
    }


def _one_room(r):
    """Bitta xonani tozalaydi. Koordinata TEGILMAYDI — umumiy masshtab va
    siljish `normalize()` da, hamma xonaga BIR XIL qo'llanadi."""
    raw = r.get('points')
    if not isinstance(raw, list) or len(raw) < 3:
        return None
    pts = []
    for p in raw[:200]:
        try:
            pts.append([float(p[0]), float(p[1])])
        except (TypeError, ValueError, IndexError):
            continue
    if len(pts) < 3:
        return None
    # Ketma-ket takrorlangan nuqtalarni olib tashlaymiz (AI ba'zan bitta
    # to'g'ri devorni o'nlab bir xil nuqtaga bo'lib yuboradi — 2026-08-18)
    ded = [pts[0]]
    for q in pts[1:]:
        if not _near(q, ded[-1], 5.0):
            ded.append(q)
    pts = ded
    if len(pts) > 3 and _near(pts[0], pts[-1], 5.0):
        pts.pop()
    if len(pts) < 3:
        return None

    ops = []
    for o in (r.get('openings') or [])[:60]:
        if not isinstance(o, dict):
            continue
        try:
            w = float(o.get('width') or 0)
            h = float(o.get('height') or 0)
        except (TypeError, ValueError):
            continue
        if w <= 0 or h <= 0:
            continue
        kind = 'deraza' if str(o.get('kind', '')).startswith('der') else 'eshik'
        try:
            wall = int(o.get('wall') or 0)
            off = float(o.get('offset') or 0)
            sill = float(o.get('sill') or (900 if kind == 'deraza' else 0))
        except (TypeError, ValueError):
            continue
        if wall < 0 or wall >= len(pts):
            continue
        ops.append({'wall': wall, 'offset': round(off, 1), 'width': round(w, 1),
                    'height': round(h, 1), 'sill': round(sill, 1), 'kind': kind})

    try:
        area = float(r.get('area_m2') or 0)
    except (TypeError, ValueError):
        area = 0.0

    return {
        'name': str(r.get('name') or 'Xona')[:60],
        'points': pts,
        'openings': ops,
        'area_m2': round(area, 2),
    }


def _simplify(pts, tol=60.0):
    """Bir to'g'ri chiziqda yotgan ortiqcha nuqtalarni olib tashlaydi (§A4).
    `tol` — mm dagi og'ish chegarasi."""
    if len(pts) <= 4:
        return pts
    out = []
    n = len(pts)
    for i in range(n):
        a, b, c = pts[(i - 1) % n], pts[i], pts[(i + 1) % n]
        # b nuqtasining a→c chizig'idan og'ishi
        vx, vy = c[0] - a[0], c[1] - a[1]
        L = math.hypot(vx, vy)
        if L < 1:
            continue
        dist = abs(vx * (a[1] - b[1]) - (a[0] - b[0]) * vy) / L
        if dist > tol:
            out.append(b)
    return out if len(out) >= 3 else pts


def _num_or_none(v):
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def _chain_totals(chains):
    """O'lcham zanjirlaridan tomon uzunliklarini hisoblaydi (§A1).
    Qaytaradi: (kenglik_mm, chuqurlik_mm) — topilmasa (None, None)."""
    if not isinstance(chains, list):
        return None, None
    w, d = [], []
    for c in chains:
        if not isinstance(c, dict):
            continue
        vals = []
        for v in (c.get('values') or [])[:60]:
            f = _num_or_none(v)
            if f and 10 <= f <= 100000:
                vals.append(f)
        if len(vals) < 2:
            continue
        total = sum(vals)
        side = str(c.get('side') or '').lower()
        if side in ('top', 'bottom', 'yuqori', 'past'):
            w.append(total)
        elif side in ('left', 'right', 'chap', 'ong'):
            d.append(total)
    return (max(w) if w else None), (max(d) if d else None)


def _shoelace(pts):
    s = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        s += a[0] * b[1] - b[0] * a[1]
    return s


def _near(a, b, tol=1.0):
    return math.hypot(a[0] - b[0], a[1] - b[1]) < tol
