"""client_erp/services/ai_chat.py — Bittada Usta MATNLI AI chat.

TZ: client_erp/TZ-AI-Tushuntiruvchi-Tashxischi.md §6.4

NEGA GEMINI LIVE EMAS
    Gemini Live — ovozli, real-time va qimmat. Matnli savol uchun
    `ai_analysis.get_ai_providers()` zanjiri yetarli va ancha arzon
    (fal → github → cohere → gemini → openrouter → claude → tekin kalitlar).

╔══════════════════════════════════════════════════════════════════════════╗
║  QAT'IY: RAQAM AI'DAN EMAS                                               ║
║                                                                          ║
║  Provayderlarning hammasi function-calling'ni bir xil qo'llab-quvvatlamaydi║
║  — shuning uchun tool'ni AI CHAQIRMAYDI. Biz savolni o'qib, KERAKLI      ║
║  tool'larni O'ZIMIZ oldindan bajaramiz va natijani promptga «FAKTLAR»     ║
║  bo'lib qo'shamiz. AI faqat shu faktlarni odam tilida gapiradi.          ║
║                                                                          ║
║  Natija: AI hech qachon raqam to'qiy olmaydi — u promptda tayyor turadi. ║
╚══════════════════════════════════════════════════════════════════════════╝
"""
import logging

logger = logging.getLogger(__name__)

# Savoldagi kalit so'z → FRONTEND amal (rc-actions.js:ACTIONS). AI o'zi
# function-call qila olmaydi (provayderlar oddiy matn in/out) — shuning
# uchun ANIQ buyruq so'zlarini biz o'zimiz aniqlaymiz va AI'ga «shu amalni
# taklif qil» deb ko'rsatma beramiz (2026-09-11, TZ-AI-Chat-Amal-Bajarish).
_ACTION_INTENT = (
    (('tugat', 'tugalla', 'bajarildi deb belgila'), 'complete_stage'),
    (('belgila', 'chek qil', "check qil", 'galochka'), 'check_item'),
    (('yangi etap', 'etap qosh', "etap qo'sh"), 'add_stage'),
    (('holatini ozgartir', "holatini o'zgartir", 'statusini ozgartir'), 'change_status'),
    (('kirim qosh', "kirim qo'sh", 'pul tushdi', 'pul keldi'), 'add_income'),
    (('chiqim qosh', "chiqim qo'sh", 'xarajat qosh', "xarajat qo'sh"), 'add_expense'),
    (('yangi buyurtma', 'yangi zakaz', 'buyurtma yarat', 'zakaz yarat'), 'create_order'),
    (('yangi mijoz', 'mijoz qosh', "mijoz qo'sh"), 'add_customer'),
)


def _detect_action(question):
    """Savolda amal-so'z bormi — bo'lsa (nom) qaytaradi, aks holda None.
    Bu AI'ga EMAS, bizga tegishli aniqlash — xato buyruq AI'dan chiqib
    ketmasin (raqam kabi, amal ham «to'qilmaydi»)."""
    q = (question or '').lower()
    for words, name in _ACTION_INTENT:
        if any(w in q for w in words):
            return name
    return None


# Savoldagi kalit so'z → qaysi server tool'ni oldindan bajarish kerak
_INTENT = (
    # (kalit so'zlar, tool nomi, argumentlar)
    (('nega', 'xato', 'muammo', 'tekshir', 'noto\'g\'ri', 'kam', 'tushmayapti',
      'kamayib', 'yo\'qol', 'topolmadim', 'topa olmadim', 'ko\'rsat'),
     'diagnose_my_finance', {}),
    (('qarz', 'qarzdor', 'bermagan', 'to\'lamagan', 'kim menga'),
     'my_debtors', {}),
    (('balans', 'qoldiq', 'hamyon', 'qancha pulim'),
     'explain_metric', {'metric': 'balans'}),
    (('sof foyda', 'foyda qanday', 'foyda nima', 'qancha ishlab', 'daromad'),
     'explain_metric', {'metric': 'foyda'}),
    (('kassa foyda', 'kassa'),
     'explain_metric', {'metric': 'kassa_foyda'}),
    (('shartnoma summasi yo', 'summa kiritilmagan', 'summasiz'),
     'orders_without_contract', {}),
    (('bog\'lanmagan', 'boglanmagan', 'zakazsiz', 'buyurtmasiz'),
     'unlinked_records', {}),
)


def _detect_tools(question):
    """Savolga qarab bajariladigan tool'lar ro'yxati. Dublikat bo'lmaydi."""
    q = (question or '').lower()
    picked, seen = [], set()
    for words, name, args in _INTENT:
        if any(w in q for w in words):
            key = (name, tuple(sorted(args.items())))
            if key not in seen:
                seen.add(key)
                picked.append((name, args))
    # «#319 qancha foyda berdi?» — buyurtma raqami aytilgan bo'lsa
    import re
    m = re.search(r'#\s*(\d{1,6})', q) or re.search(r'\b(\d{2,6})[- ]?(?:raqamli|zakaz|buyurtma)', q)
    if m:
        picked.append(('contract_detail', {'order_id': int(m.group(1))}))
    if not picked:
        # Hech narsa aniqlanmasa — umumiy holat (raqamsiz javob bermaslik uchun)
        picked.append(('explain_metric', {'metric': ''}))
    return picked[:2]                      # prompt shishmasin (3→2, token tejash)


def _facts(user, question):
    """Kerakli tool'larni bajarib, «FAKTLAR» matnini quradi."""
    from client_erp.services.ai_tools import run_server_tool
    out = []
    for name, args in _detect_tools(question):
        try:
            res = run_server_tool(user, name, args)
        except Exception as e:                                    # noqa: BLE001
            logger.warning('ai_chat tool xato %s: %s', name, e)
            continue
        if res:
            out.append(f"[{name}]\n{res}")
    # Token tejash (§2.5.3): FAKTLAR eng ko'pi 2500 belgi
    return '\n\n'.join(out)[:2500]


def answer(user, question, history=None, context=None):
    """Savolga javob. Qaytaradi: (matn, xato_bormi, usage_bloki, action).

    history — [{'role': 'user'|'ai', 'text': ...}] oxirgi bir necha xabar.
    context — frontend `RcActions.run('current_context')` natijasi (joriy
        sahifa/buyurtma/etaplar matni) — amal uchun kerakli ID'larni AI
        shundan o'qiydi, o'zidan TO'QIMAYDI (raqamlar kabi qat'iy qoida).
    action — {'name': ..., 'args': {...}} yoki None. HECH QACHON avtomatik
        BAJARILMAYDI — faqat TAKLIF, frontend foydalanuvchidan tasdiq
        so'raydi (TZ-AI-Chat-Amal-Bajarish-2026-09.md §5.2).
    """
    from django.utils import timezone
    from client_erp.services import ai_usage

    question = (question or '').strip()
    if not question:
        return ('Savolingizni yozing.', False, None, None)
    if len(question) > 1000:
        question = question[:1000]

    # ── Kunlik limit (TZ §2.5) — tekin AI hovuzini asrash uchun ──
    ok, msg = ai_usage.check_limit(user)
    if not ok:
        return (msg, True, ai_usage.usage_block(user), None)

    _t0 = timezone.now()

    try:
        from client_erp import ai_knowledge
        knowledge = ai_knowledge.build(question)
    except Exception:                                             # noqa: BLE001
        knowledge = ''

    facts = _facts(user, question)

    # ── Amal aniqlash (2026-09-11) — savolda amal-so'z bo'lsa, AI'dan
    # JSON buyruq chiqarishni SO'RAYMIZ (o'zimiz emas — chunki kerakli
    # stage_id/args'ni faqat CONTEXT'ni o'qib AI aniqlay oladi). AI hech
    # qachon bu qatorni TO'QIMASIN deb qat'iy cheklanadi.
    wants_action = _detect_action(question) is not None

    system = (
        "Sen Bittada Usta mini ERP yordamchisisan. Foydalanuvchi — oddiy "
        "mebelchi usta. Sodda, iliq va aniq gapir. Buxgalteriya atamasi "
        "ishlatma.\n\n"
        "QAT'IY QOIDALAR:\n"
        "1. Quyidagi FAKTLAR bo'limidagi raqamlardan CHETGA CHIQMA. "
        "O'zingdan raqam TO'QIMA, taxmin qilma.\n"
        "2. Faktlarda javob yo'q bo'lsa — «bu ma'lumot menda yo'q» deb ayt.\n"
        "3. Javob qisqa bo'lsin, lekin savol tushuntirish talab qilsa — "
        "bosqichma-bosqich tushuntir.\n"
        "4. Faqat adabiy o'zbek tilida yoz.\n\n"
        f"═══ BILIM BAZASI ═══\n{knowledge}"
    )
    if wants_action:
        system += (
            "\n\n═══ AMAL BAJARISH ═══\n"
            "Usta senga tizimda biror amal (masalan etap tugatish, kirim/"
            "chiqim qo'shish) bajarishni so'ramoqda.\n\n"
            "«JORIY HOLAT» bo'limida etaplar shu ko'rinishda yoziladi:\n"
            "  #1 Zamer va Kelishuv (jarayonda); #2 Bazis va Chizma (jarayonda)\n"
            "Bu yerda `#1`, `#2` — AYNAN o'sha etapning stage_id raqami "
            "(# belgisidan keyingi son). Usta etap NOMINI aytsa (masalan "
            "«Zamer va Kelishuv etapini tugat»), nomni JORIY HOLATdagi "
            "ro'yxatdan qidirib top va # dan keyingi sonni stage_id sifatida "
            "ISHLAT — ustadan qayta ID so'rama, nom orqali topa olasan.\n\n"
            "ID/stage aniq topilsa — javobingning ENG OXIRIGA, ALOHIDA "
            "qatorda, ANIQ shu formatda yoz (namuna, o'zingning raqamlaring "
            "bilan):\n"
            'ACTION: {"name": "complete_stage", "args": {"stage_id": 1}}\n\n'
            "Ruxsat etilgan amal_nomi: complete_stage, check_item, add_stage, "
            "change_status, add_income, add_expense, create_order, "
            "add_customer.\n"
            "Bu qatorni USTAGA emas — faqat tizimga signal sifatida yoz, "
            "undan oldingi matningda amalni oddiy so'z bilan tasvirla "
            "(masalan «Zamer va Kelishuv etapini tugataymi?»).\n"
            "Faqat JORIY HOLATda buyurtma/etap RO'YXATI umuman ko'rinmasa "
            "(masalan hech qanday buyurtma ochilmagan) — ACTION qatorini "
            "YOZMA, ustadan qaysi buyurtmani nazarda tutganini so'ra.\n"
            "ACTION qatorini HECH QACHON o'zingdan TO'QIMA — faqat "
            "JORIY HOLATdagi # raqami bilan mos bo'lsa yoz."
        )

    parts = []
    # Token tejash (§2.5.3): tarix 6→4, har biri 400→250 belgi
    for h in (history or [])[-4:]:
        role = 'Usta' if h.get('role') == 'user' else 'Sen'
        txt = (h.get('text') or '')[:250]
        if txt:
            parts.append(f"{role}: {txt}")
    if parts:
        parts.append('')
    if facts:
        parts.append("═══ FAKTLAR (foydalanuvchining haqiqiy ma'lumoti) ═══")
        parts.append(facts)
        parts.append('')
    if wants_action and context:
        parts.append("═══ JORIY HOLAT (sahifa, buyurtma, etaplar) ═══")
        parts.append(str(context)[:1500])
        parts.append('')
    parts.append(f"Usta savoli: {question}")
    prompt = '\n'.join(parts)

    try:
        from client_erp.services.ai_analysis import get_ai_providers
        # free_first: /crm/free-api-key/ dagi tekin AI'lar BIRINCHI sinaladi,
        # limit tugasa o'zi keyingisiga o'tadi (chat.py rotatsiyasi), pulli
        # provayderlar esa zaxira bo'lib qoladi.
        providers = get_ai_providers(system=system, free_first=True)
    except Exception as e:                                        # noqa: BLE001
        logger.exception('ai_chat provayderlar yuklanmadi')
        return (f"AI hozir ishlamayapti: {str(e)[:100]}", True, None, None)

    last_err = ''
    for name, model, fn in providers:
        try:
            res = fn(prompt)
            if isinstance(res, (tuple, list)):
                text = res[0]
                tin = res[1] if len(res) > 1 else 0
                tout = res[2] if len(res) > 2 else 0
            else:
                text, tin, tout = res, 0, 0
            text = (text or '').strip()
            if not text:
                continue
            logger.info('ai_chat javob: provayder=%s model=%s', name, model)
            text, action = _extract_action(text) if wants_action else (text, None)

            # ── O'lchov (§2.3) + sarf hisoboti (§2.6) ──
            # `fal` va ba'zi tekin kalitlar token qaytarmaydi → taxmin
            # qilamiz va shunday BELGILAYMIZ (foydalanuvchi «0 token»
            # ko'rib tekin deb o'ylamasin).
            est = not (tin or tout)
            if est:
                tin = ai_usage.estimate_tokens(prompt)
                tout = ai_usage.estimate_tokens(text)
            dur = int((timezone.now() - _t0).total_seconds())
            ai_usage.log(
                user, 'chat', started_at=_t0, ended_at=timezone.now(),
                duration_sec=dur, tokens_in=tin, tokens_out=tout,
                tokens_estimated=est, provider=name, model_name=str(model),
                charge_reason='chat_free',
            )
            block = ai_usage.usage_block(
                user, tokens=(tin + tout), estimated=est, duration_sec=dur)
            return (text, False, block, action)
        except Exception as e:                                    # noqa: BLE001
            last_err = f"{name}: {str(e)[:80]}"
            continue

    # Hech bir provayder ishlamadi — faktlarni O'ZIMIZ qaytaramiz.
    # Foydalanuvchi javobsiz qolmasin (raqamlar baribir koddan).
    if facts:
        return (facts, False, ai_usage.usage_block(user), None)
    return (f"AI provayderlar javob bermadi. {last_err}", True, None, None)


# Ruxsat etilgan amal nomlari — AI matnidan chiqqan ACTION shu ro'yxatdan
# tashqarida bo'lsa E'TIBORGA OLINMAYDI (xavfsizlik: AI o'zidan yangi amal
# "o'ylab topa" olmaydi, faqat rc-actions.js dagi mavjud 16 tadan foydalana
# oladi — bu ro'yxat ular bilan mos, TZ §5.1).
_ALLOWED_ACTIONS = {
    'navigate', 'open_order', 'open_page', 'complete_stage', 'check_item',
    'add_stage', 'change_status', 'add_income', 'add_expense', 'go_back',
    'create_order', 'open_tab', 'add_customer', 'order_info',
    'finance_summary', 'current_context',
}


def _extract_action(text):
    """Javob oxiridagi `ACTION: {json}` qatorini ajratib oladi.

    Qaytaradi: (tozalangan_matn, {'name':..., 'args': {...}} yoki None).
    JSON buzuq yoki `name` ruxsat etilmagan bo'lsa — action=None, matn
    ACTION qatorisiz qaytariladi (usta xom JSON'ni ko'rmasin)."""
    import json
    import re
    m = re.search(r'ACTION:\s*(\{.*\})\s*$', text, flags=re.DOTALL)
    if not m:
        return text, None
    clean = text[:m.start()].rstrip()
    try:
        data = json.loads(m.group(1))
    except (ValueError, TypeError):
        return clean, None
    name = data.get('name')
    if name not in _ALLOWED_ACTIONS:
        return clean, None
    args = data.get('args') if isinstance(data.get('args'), dict) else {}
    return clean, {'name': name, 'args': args}
