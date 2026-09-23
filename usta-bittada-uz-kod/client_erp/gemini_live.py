"""client_erp/gemini_live.py — Gemini Live (real-time ovozli) BACKEND yordamchisi.

Bittada Usta mini ERP uchun Gemini Live ovozli yordamchi. Bu fayl FAQAT
backend yordamchi FUNKSIYALARni beradi — consumers.py `glive.*` handleri shu
funksiyalarni chaqiradi (bu fayl hech kimga o'zi ulanmaydi, additiv).

Oqim (ephemeral token pattern):
    1) Frontend `glive.token` so'raydi -> consumers `mint_ephemeral_token()`
       chaqiradi.
    2) Backend qisqa muddatli (uses=1, ~30 daqiqa) auth-token yaratadi va
       token + model nomini qaytaradi. API kaliti (GEMINI_API_KEY) HECH QACHON
       frontendga chiqmaydi.
    3) Frontend shu token bilan to'g'ridan-to'g'ri Gemini Live WSS ga ulanadi.

SDK: google-genai (voicebot/ai_providers/providers/gemini/client.py bilan bir xil
uslub). Ephemeral tokenlar `client.auth_tokens.create(...)` orqali, `v1alpha`
http_options talab qiladi. SDK bu API ni qo'llamasa yoki xato bo'lsa — CRASH
YO'Q, `{'error': 'gemini_live_unavailable', 'detail': ...}` qaytadi.
"""
from django.conf import settings


# ─────────────────────────────────────────────────────────────────────────────
# 1) live_model — Gemini Live audio modeli
# ─────────────────────────────────────────────────────────────────────────────
# gemini-2.0-flash-live-001 — Gemini Live API uchun barqaror, tezkor va arzon
# ovozli (real-time audio) model. `settings.GEMINI_LIVE_MODEL` bilan almashtirsa
# bo'ladi (masalan yangiroq preview modelga o'tish uchun).
_DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview'  # server-proxy orqali (browser-direct constrained 1011 beradi; SDK direct ishlaydi)


def live_model():
    """Eng mos Gemini Live audio modelini qaytaradi (str).

    Standart: gemini-2.0-flash-live-001. Override: settings.GEMINI_LIVE_MODEL.
    """
    return getattr(settings, 'GEMINI_LIVE_MODEL', _DEFAULT_LIVE_MODEL) or _DEFAULT_LIVE_MODEL


# ─────────────────────────────────────────────────────────────────────────────
#  BEPUL POOL — Gemini Live kalit rotatsiyasi (2026-07-26, foydalanuvchi so'rovi)
# ─────────────────────────────────────────────────────────────────────────────
# CRM "Tekin API Kalitlar" (FreeApiKey) dagi Gemini kalitlarini Live uchun
# ishlatamiz. Kalit statusiga (valid/unknown/rate_limited) qarab navbat bilan
# sinaladi; sessiya limit/yaroqsiz bo'lsa `mark_live_key` orqali belgilanadi va
# keyingi kalitga o'tiladi. Oxirida settings.GEMINI_API_KEY (agar bo'lsa) zaxira.

def live_key_candidates():
    """Gemini Live uchun sinaladigan kalitlar ro'yxati (tartib: valid → unknown →
    rate_limited; invalid tashlanadi). Har element:
        {'key': str, 'row_id': int|None, 'idx': int|None, 'name': str}
    """
    out = []
    try:
        from free_api_key.models import FreeApiKey
        cands = []
        for row in FreeApiKey.objects.filter(is_active=True):
            prov = (row.provider or '')
            model = (row.model_name or '').lower()
            # Gemini kalitlari: provider gemini/google_openai YOKI model nomida "gemini"
            is_gemini = prov in ('gemini', 'google_openai') or 'gemini' in model
            if not is_gemini:
                continue
            for i, k in enumerate(row.keys or []):
                st = k.get('status') or 'unknown'
                if st == 'invalid':
                    continue
                rank = {'valid': 0, 'unknown': 1, 'rate_limited': 2}.get(st, 1)
                key = (k.get('key') or '').strip()
                if key:
                    cands.append((rank, row.priority, row.id, i, key, row.name))
        cands.sort(key=lambda c: (c[0], c[1], c[2]))
        for _rank, _prio, rid, i, key, name in cands:
            out.append({'key': key, 'row_id': rid, 'idx': i, 'name': name})
    except Exception:
        pass
    sk = (getattr(settings, 'GEMINI_API_KEY', '') or '').strip()
    if sk:
        out.append({'key': sk, 'row_id': None, 'idx': None, 'name': 'settings.GEMINI_API_KEY'})
    return out


def mark_live_key(row_id, idx, status, error=''):
    """Pool kalitining holatini yangilaydi (Live sessiya natijasiga ko'ra)."""
    if row_id is None or idx is None:
        return
    try:
        from free_api_key.models import FreeApiKey
        from django.utils import timezone
        row = FreeApiKey.objects.filter(pk=row_id).first()
        if not row:
            return
        keys = row.keys or []
        if 0 <= idx < len(keys):
            now = timezone.now().isoformat()
            keys[idx]['status'] = status
            keys[idx]['last_checked_at'] = now
            if status == 'valid':
                keys[idx]['last_used_at'] = now
                keys[idx]['use_count'] = int(keys[idx].get('use_count') or 0) + 1
            if error:
                keys[idx]['last_error'] = str(error)[:200]
            row.keys = keys
            row.save(update_fields=['keys', 'updated_at'])
    except Exception:
        pass


def classify_live_error(exc):
    """Live ulanish xatosini turkumlaydi: 'rate_limited' | 'invalid' | 'transient'."""
    s = str(exc or '').lower()
    if any(w in s for w in ('resource_exhausted', 'rate limit', 'quota', 'exceeded', '429', 'spending cap')):
        return 'rate_limited'
    if any(w in s for w in ('api_key', 'api key', 'unauthorized', 'permission', 'invalid', '401', '403')):
        return 'invalid'
    return 'transient'


# ─────────────────────────────────────────────────────────────────────────────
# 2) mint_ephemeral_token — qisqa muddatli auth-token yaratish
# ─────────────────────────────────────────────────────────────────────────────
def mint_ephemeral_token():
    """Frontend Gemini Live WSS ga ulanishi uchun qisqa muddatli token yaratadi.

    Qaytaradi (muvaffaqiyat):
        {'token': '<auth_tokens/...>', 'model': '<live_model>',
         'expires': '<ISO-8601 UTC>'}
    Qaytaradi (xato/SDK qo'llamaydi — CRASH YO'Q):
        {'error': 'gemini_live_unavailable', 'detail': '<sabab>'}

    Token: uses=1 (bitta ulanish), ~30 daqiqa amal qiladi, model
    `live_connect_constraints` bilan qulflanadi (frontend modelni o'zgartira
    olmaydi). API kaliti serverdа qoladi.
    """
    try:
        from datetime import datetime, timedelta, timezone
        from google import genai
        from google.genai import types
    except Exception as e:  # noqa: BLE001 — SDK yo'q / import xatosi
        return {'error': 'gemini_live_unavailable', 'detail': str(e)}

    try:
        api_key = getattr(settings, 'GEMINI_API_KEY', '') or None
        if not api_key:
            return {'error': 'gemini_live_unavailable',
                    'detail': 'GEMINI_API_KEY sozlanmagan'}

        # Ephemeral tokenlar v1alpha API versiyasini talab qiladi.
        client = genai.Client(api_key=api_key,
                              http_options={'api_version': 'v1alpha'})

        # SDK bu build'da auth_tokens ni qo'llamasa — jim degradatsiya.
        auth_tokens = getattr(client, 'auth_tokens', None)
        if auth_tokens is None or not hasattr(auth_tokens, 'create'):
            return {'error': 'gemini_live_unavailable',
                    'detail': "o'rnatilgan google-genai SDK auth_tokens API ni "
                              "qo'llamaydi (yangilash kerak)"}

        model = live_model()
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=int(getattr(settings, 'GEMINI_LIVE_TOKEN_MINUTES', 30) or 30)
        )
        config = types.CreateAuthTokenConfig(
            uses=1,                       # bitta jonli ulanish
            expire_time=expire,           # umumiy amal muddati (~30 daqiqa)
            live_connect_constraints=types.LiveConnectConstraints(model=model),
        )

        token = auth_tokens.create(config=config)
        name = getattr(token, 'name', '') or ''
        if not name:
            return {'error': 'gemini_live_unavailable',
                    'detail': "token yaratildi, lekin bo'sh qaytdi"}

        return {'token': name, 'model': model, 'expires': expire.isoformat()}
    except AttributeError as e:  # SDK API shakli boshqacha
        return {'error': 'gemini_live_unavailable', 'detail': str(e)}
    except Exception as e:  # noqa: BLE001 — tarmoq/kvota/auth va h.k.
        return {'error': 'gemini_live_unavailable', 'detail': str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# 3) system_context — Gemini system-instruction matni (o'zbekcha)
# ─────────────────────────────────────────────────────────────────────────────
def system_context(user_full_name, page_path, order_summary=None):
    """Gemini Live sessiyasi uchun system-instruction matnini quradi.

    user_full_name — foydalanuvchi ismi, page_path — joriy SPA sahifasi,
    order_summary — (ixtiyoriy) joriy buyurtma qisqacha tavsifi.
    """
    name = (str(user_full_name).strip() if user_full_name else '') or 'Foydalanuvchi'
    page = (str(page_path).strip() if page_path else '') or '/'

    lines = [
        "Sen Bittada Usta mini ERP tizimining ovozli yordamchisisan.",
        f"Foydalanuvchi: {name}.",
        f"Joriy sahifa: {page}.",
        "MUHIM — TOOL ISHLATISH: Sening ASOSIY vazifang berilgan tool-funksiyalar "
        "orqali interfeysni boshqarish. Foydalanuvchi biror amal so'rasa (sahifa "
        "ochish, buyurtma ochish, etap tugatish, checklist belgilash, yangi etap, "
        "kirim/chiqim, holat o'zgartirish, buyurtma/moliya haqida so'rash...) — "
        "DARHOL tegishli tool-funksiyani CHAQIR. Faqat gapirib o'tirma — amalni "
        "tool orqali BAJAR. Qaysi tool ekaniga o'zing qaror qil va chaqir.",
        # ── TIL: qat'iy adabiy o'zbek, sheva EMAS ──
        "MUHIM: FAQAT toza ADABIY O'ZBEK TILIDA gapir — sheva, dialekt yoki "
        "boshqa til aralashmasin. Talaffuz aniq, rasmiy va tushunarli bo'lsin. "
        "Raqamlar va summalarni o'zbekcha ayt.",
        # ── 2026-08-05: AI endi TUSHUNTIRUVCHI ham (TZ-AI-Tushuntiruvchi-Tashxischi.md)
        # Ilgari bu yerda «Ortiqcha tushuntirish berma» deb yozilgan edi —
        # shu sabab AI moliyaviy savolga javob bermas, yoki O'ZIDAN TO'QIRDI.
        # Endi: AMAL so'ralsa — qisqa bajar; SAVOL berilsa — to'liq tushuntir.
        "AMAL so'ralganda qisqa bo'l: bajar va bir og'iz bilan tasdiqla "
        "(«Etap tugatildi»). Lekin SAVOL berilsa (nima, nega, qanday "
        "hisoblanadi, xatoyim bor) — to'liq va sodda tushuntir, shoshmasdan.",
        "Amal aniq bo'lsa qo'shimcha savol berma — to'g'ridan-to'g'ri bajar. "
        "Faqat ma'lumot yetishmasa yoki amal xavfli/qaytarib bo'lmas bo'lsa "
        "qisqacha aniqlashtiruvchi savol ber.",
    ]

    # ── BILIM BAZASI (2026-08-05) ────────────────────────────────────────
    # Ilgari system-prompt ~10 qator edi va moliya mantiqi UMUMAN yo'q edi —
    # «Balans nima?» degan savolga AI o'zidan to'qirdi. Endi platformaning
    # qoidalari va formulalari qo'shiladi. RAQAM emas, faqat QOIDA —
    # haqiqiy raqam har doim tool orqali olinadi.
    try:
        from client_erp import ai_knowledge
        lines.append("")
        lines.append("═══ BITTADA USTA — BILIM BAZASI ═══")
        lines.append(ai_knowledge.build(full=True))
    except Exception:                                             # noqa: BLE001
        pass                       # bilim yuklanmasa ham AI ishlayversin

    if order_summary:
        summary = str(order_summary).strip()
        if summary:
            lines.append("")
            lines.append("Joriy buyurtma ma'lumoti:")
            lines.append(summary)

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# 4) can_use_live — tarif (feature) + tanga (coins) tekshiruvi
# ─────────────────────────────────────────────────────────────────────────────
def can_use_live(user):
    """Foydalanuvchi Gemini Live'dan foydalana oladimi?

    Qaytaradi (allowed, affordable):
        allowed    — tarif ruxsati (features.user_can, 'gemini_live')
        affordable — tanga yetarli (coins.can_afford, 'gemini_live')

    Ikkalasi ham standart-ochiq (gating/tanga o'chiq bo'lsa True) — F1 xavfsiz.
    """
    from client_erp.services.features import user_can
    from client_erp.services import coins
    allowed = bool(user_can(user, 'gemini_live'))
    # HARD tanga tekshiruvi: global gating o'chiq bo'lsa ham — tanga bo'lmasa Live YONMAYDI.
    affordable = bool(coins.can_afford(user, 'gemini_live', hard=True))
    return (allowed, affordable)
