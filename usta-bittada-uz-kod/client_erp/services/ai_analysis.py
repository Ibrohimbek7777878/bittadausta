"""client_erp/services/ai_analysis.py — Claude AI analitika tahlili."""
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Sen MebelCity mebel ishlab chiqarish ERP tizimi uchun senior biznes-konsultant AI'san.
Sening vazifang — foydalanuvchining BARCHA ma'lumotlarini chuqur tahlil qilib, professional darajada batafsil tahlil va aniq tavsiyalar berish.

MUHIM QOIDALAR:
- Javobni O'ZBEK tilida yoz
- Juda BATAFSIL va CHUQUR tahlil ber — yuzaki emas
- ANIQ raqamlar, foizlar, kunlar bilan gapir
- Har bir buyurtmani individual tahlil qil (agar muammo bo'lsa)
- Qarzlarni individual ko'rib chiq — muddati o'tganlarni alohida ta'kidla
- Shared (ulashilgan) buyurtmalarni tahlil qil — kim nima qilayotganini baholab ber
- Bottleneck'larni aniqlash — qaysi bosqichda ishlar sekinlashmoqda
- Pul oqimini (cashflow) batafsil tahlil qil
- Har bir tavsiya AMALIY bo'lsin — nima qilish, qachon, qanday

JAVOB FORMATI (har bir bo'limni emoji bilan boshla, ## sarlavha ishlatma):

📊 UMUMIY BIZNES HOLATI
(3-5 gap. Umumiy rasm — biznes qanday ketayotgani)

💰 MOLIYAVIY TAHLIL
(Kirim/chiqim/foyda tendensiyasi, cashflow, to'lov usullari tahlili)

📦 BUYURTMALAR TAHLILI
(Buyurtmalar holati, progress, qaysilari muammoli, qaysilari yaxshi)

⏱️ BOSQICH SAMARADORLIGI
(Bottleneck'lar — qaysi bosqichda vaqt ko'p ketayapti, optimizatsiya yo'llari)

🤝 JAMOA VA HAMKORLIK
(Ulashilgan buyurtmalar tahlili — kim qanday ishlayapti)

⚠️ QARZLAR VA XAVFLAR
(Har bir qarzni individual ko'rib chiq, muddati o'tganlarni alohida ta'kidla)

📌 TAVSIYALAR
(5-8 ta ANIQ va AMALIY tavsiya, har biri raqamlangan)

🏁 XULOSA
(2-3 gap. Asosiy xulosalar)"""


# OpenRouter modellari — ketma-ket sinaladi (birinchi ishlagani ishlatiladi).
# 2026-07: Anthropic + Gemini + OpenRouter-Claude kreditlari tugagan. OpenRouter
# balansi ham chegарада — bitta model 402/429 bersa, keyingisiga o'tamiz.
# Kredit qaytsa — ro'yxat boshiga "anthropic/claude-haiku-4.5" qo'yish kifoya.
OPENROUTER_MODELS = [
    "openai/gpt-4o-mini",
    "meta-llama/llama-3.3-70b-instruct",
]
OPENROUTER_MODEL = OPENROUTER_MODELS[0]  # yorliq/zaxira mosligi uchun
# Anthropic to'g'ridan-to'g'ri zaxira (kredit qaytsa avtomatik ishlaydi).
ANTHROPIC_MODEL = "claude-haiku-4-5"

# fal.ai any-llm — fal hisobida HAQIQIY kredit bor (media_agent bilan umumiy).
# 2026-07: Anthropic/Gemini/OpenRouter kreditlari tugagani uchun ASOSIY yo'l.
# Claude fal'да yo'q, lekin Gemini/GPT bor (o'zbekcha to'liq, sifatli javob beradi).
FAL_LLM_MODELS = [
    "google/gemini-pro-1.5",
    "openai/gpt-4o-mini",
    "google/gemini-flash-1.5",
]


def _call_fal(prompt, system=SYSTEM_PROMPT):
    """fal.ai any-llm orqali chaqiruv → (matn, 0, 0). fal token sonini qaytarmaydi.
    Modellar ketma-ket sinaladi (birinchi ishlagani).
    `system` — tizim ko'rsatmasi (default: biznes-tahlil; academy baholash o'z
    prompti bilan chaqiradi)."""
    import requests
    key = getattr(settings, 'FAL_KEY', '') or ''
    if not key:
        raise ValueError("FAL_KEY sozlanmagan")
    headers = {"Authorization": "Key " + key, "Content-Type": "application/json"}
    last_err = None
    for model in FAL_LLM_MODELS:
        try:
            r = requests.post(
                "https://fal.run/fal-ai/any-llm", headers=headers,
                json={"model": model, "prompt": prompt, "system_prompt": system},
                timeout=120,
            )
            if r.status_code != 200:
                last_err = f"{model}: HTTP {r.status_code} {r.text[:120]}"
                continue
            text = (r.json().get("output") or "").strip()
            if not text:
                last_err = f"{model}: bo'sh javob"
                continue
            return text, 0, 0
        except Exception as e:
            last_err = f"{model}: {e}"
            continue
    raise RuntimeError(f"fal.ai barcha modellar ishlamadi: {last_err}")


def _call_openrouter(prompt, system=SYSTEM_PROMPT):
    """OpenRouter (OpenAI-mos) orqali chaqiruv → (matn, kirim_token, chiqim_token).
    Anthropic krediti tugaganда asosiy yo'l — OpenRouter kreditidan foydalanadi."""
    import requests
    key = getattr(settings, 'OPENROUTER_API_KEY', '') or ''
    if not key:
        raise ValueError("OPENROUTER_API_KEY sozlanmagan")
    headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
    last_err = None
    # Modellarni ketma-ket sinaymiz — bittasi 402/429/xato bersa keyingisiga o'tamiz.
    for model in OPENROUTER_MODELS:
        try:
            r = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "max_tokens": 4000,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                },
                timeout=90,
            )
            if r.status_code != 200:
                last_err = f"{model}: HTTP {r.status_code} {r.text[:120]}"
                continue
            d = r.json()
            text = (d["choices"][0]["message"]["content"] or "")
            if not text.strip():
                last_err = f"{model}: bo'sh javob"
                continue
            usage = d.get("usage", {}) or {}
            return text, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
        except Exception as e:
            last_err = f"{model}: {e}"
            continue
    raise RuntimeError(f"OpenRouter barcha modellar ishlamadi: {last_err}")


def _call_anthropic(prompt, system=SYSTEM_PROMPT):
    """Anthropic to'g'ridan-to'g'ri (zaxira yo'l) → (matn, kirim_token, chiqim_token)."""
    from anthropic import Anthropic
    key = getattr(settings, 'ANTHROPIC_API_KEY', '') or ''
    if not key:
        raise ValueError("ANTHROPIC_API_KEY sozlanmagan")
    client = Anthropic(api_key=key)
    resp = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=4000,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.content[0].text, resp.usage.input_tokens, resp.usage.output_tokens


# ── OpenAI-mos ZAXIRA provayderlar (2026-07-22 qo'shildi) ───────────────────
# Asosiy AI (fal) krediti/limiti tugasa AVTOMATIK shularga o'tadi. Kalitlar .env'da.
# Test qilingan (2026-07-22): GitHub Models (gpt-4o-mini) TO'LIQ ishlaydi;
# Cohere/Gemini zaxira (Trial/kvota limiti bor, lekin limit tugaganда yordam beradi).
# (name, settings-kalit, base_url, model) — hammasi OpenAI /chat/completions formati.
OPENAI_COMPAT_PROVIDERS = [
    ('github', 'GITHUB_MODELS_KEY', 'https://models.inference.ai.azure.com',           'gpt-4o-mini'),
    ('cohere', 'COHERE_API_KEY',    'https://api.cohere.com/compatibility/v1',          'command-r'),
    ('gemini', 'GEMINI_OPENAI_KEY', 'https://generativelanguage.googleapis.com/v1beta/openai/', 'gemini-flash-latest'),
]


def _call_openai_compat(base, key, model, prompt, system=SYSTEM_PROMPT):
    """OpenAI-mos endpoint (GitHub Models / Cohere / Gemini) → (matn, kirim_tok, chiqim_tok)."""
    import requests
    if not key:
        raise ValueError("kalit sozlanmagan")
    r = requests.post(
        base.rstrip('/') + '/chat/completions',
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        json={
            "model": model, "max_tokens": 4000,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=90,
    )
    if r.status_code != 200:
        raise RuntimeError(f"{model}: HTTP {r.status_code} {r.text[:120]}")
    d = r.json()
    text = (d["choices"][0]["message"]["content"] or "")
    if not text.strip():
        raise RuntimeError(f"{model}: bo'sh javob")
    usage = d.get("usage", {}) or {}
    return text, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)


def _make_compat_caller(settings_key, base, model, system=SYSTEM_PROMPT):
    """Zanjir uchun (prompt)→natija funksiyasi (kalit har chaqiruvda settings'dan)."""
    def _fn(prompt):
        key = getattr(settings, settings_key, '') or ''
        return _call_openai_compat(base, key, model, prompt, system=system)
    return _fn


def get_ai_providers(system=SYSTEM_PROMPT, free_first=False):
    """AI provayderlar ZANJIRI (name, model, fn) — birinchi ishlagani ishlatiladi.
    run_ai_analysis VA consumers._stream_ai_response ikkalasi shu zanjirni ishlatadi
    (bitta joyda — limit tugasa avtomatik keyingisiga o'tadi).
    Tartib: fal (kredit bor) → github (bepul, ishonchli) → cohere → gemini (zaxira)
            → openrouter → claude (kredit qaytsa).

    `system` — tizim ko'rsatmasi (default: biznes-tahlil SYSTEM_PROMPT, mavjud
    chaqiruvchilar o'zgarmaydi). academy.services.ai_grade o'z baholash promptini
    berish uchun shu parametrni ishlatadi (fn(prompt) imzosi o'zgarmaydi)."""
    providers = [('fal', FAL_LLM_MODELS[0], lambda p, _s=system: _call_fal(p, system=_s))]
    for pname, skey, base, model in OPENAI_COMPAT_PROVIDERS:
        providers.append((pname, model, _make_compat_caller(skey, base, model, system=system)))

    # ── TEKIN KALITLAR (CRM → «Tekin API kalitlar», /crm/free-api-key/) ──────
    # 2026-07-31: ilgari faqat .env dagi 5-6 kalit ishlatilardi — ular limitga
    # yetgach AI tahlil BUTUNLAY ishlamay qolardi. Endi bazadagi tekin kalitlar
    # (Groq · Mistral · SambaNova · Pollinations · OpenRouter · GitHub Models …)
    # priority tartibida avtomatik sinaladi: biri limitga yetsa navbatdagisi.
    # Kalitlar HECH QACHON o'chirilmaydi — faqat `status` belgilanadi
    # (429/quota → 'rate_limited', 401/403 → 'invalid'), keyin qayta sinaladi.
    def _free_keys_caller(prompt, _s=system):
        from free_api_key.chat import try_free_keys_text
        txt, meta = try_free_keys_text(_s, prompt, max_tokens=4000)
        if not txt:
            raise RuntimeError('tekin kalitlar ishlamadi')
        return txt, (meta or {}).get('in_tokens', 0), (meta or {}).get('out_tokens', 0)
    providers.append(('free-keys', 'auto', _free_keys_caller))

    # ── free_first (2026-08-05) ──────────────────────────────────────────
    # Bittada Usta chat'i uchun TEKIN kalitlar BIRINCHI sinaladi
    # (/crm/free-api-key/ — 7 chat-provayder, 120 kalit, avtomatik rotatsiya).
    # Sabab: ular pul turmaydi, hovuz katta va limit tugasa o'zi keyingisiga
    # o'tadi. Pulli provayderlar ZAXIRA bo'lib qoladi.
    # ⚠️ Standart `free_first=False` — mavjud chaqiruvchilar (analitika AI,
    # academy baholash) TARTIBI O'ZGARMAYDI.
    if free_first:
        providers = ([p for p in providers if p[0] == 'free-keys']
                     + [p for p in providers if p[0] != 'free-keys'])

    providers += [
        ('openrouter', OPENROUTER_MODEL, lambda p, _s=system: _call_openrouter(p, system=_s)),
        ('claude',     ANTHROPIC_MODEL,  lambda p, _s=system: _call_anthropic(p, system=_s)),
    ]
    return providers


def run_ai_analysis(user, analytics_data, period):
    """AI orqali chuqur analitika tahlili.

    Provayder zanjiri (birinchi ishlagani ishlatiladi — get_ai_providers):
      fal → GitHub Models → Cohere → Gemini → OpenRouter → Anthropic.
    Bittasining limiti/krediti tugasa AVTOMATIK keyingisiga o'tadi.
    """
    import time as _time
    prompt = _build_detailed_prompt(user, analytics_data, period)

    providers = get_ai_providers()

    _t0 = _time.monotonic()
    analysis_text = None
    provider_used = model_used = None
    in_tok = out_tok = 0
    last_err = None
    for prov, mdl, fn in providers:
        try:
            analysis_text, in_tok, out_tok = fn(prompt)
            if analysis_text:
                provider_used, model_used = prov, mdl
                break
        except Exception as e:
            last_err = e
            continue

    if not analysis_text:
        raise RuntimeError(
            "AI tahlil ishlamadi — barcha provayderlar xato berdi "
            "(OpenRouter/Anthropic). Oxirgi xato: %s" % last_err
        )

    _dur = int((_time.monotonic() - _t0) * 1000)

    try:
        from voicebot.ai_logger import log_ai_call
        log_ai_call(
            provider=provider_used, model=model_used, action='analytics',
            endpoint='run_ai_analysis', duration_ms=_dur,
            input_tokens=in_tok, output_tokens=out_tok,
            prompt_preview=prompt[:200], response_preview=(analysis_text or '')[:200],
            request_meta={'period': period, 'provider': provider_used},
            user=user,
        )
    except Exception:
        pass

    recommendations = _extract_recommendations(analysis_text)
    sections = _extract_sections(analysis_text)

    return {
        'text': analysis_text,
        'recommendations': recommendations,
        'sections': sections,
    }


def _build_detailed_prompt(user, d, period):
    s = d.get('summary', {})
    t = d.get('totals', {})
    period_labels = {'week': 'Hafta', 'month': 'Oy', 'year': 'Yil'}

    lines = []
    lines.append(f"Mebel ishlab chiqarish biznesining BATAFSIL analitikasini tahlil qil.")
    lines.append(f"")
    lines.append(f"══════════════════════════════════════")
    lines.append(f"👤 FOYDALANUVCHI")
    lines.append(f"  Ism: {user.full_name}")
    lines.append(f"  Tashkilot: {user.organization or 'Belgilanmagan'}")
    # vip_level FK osilib qolgan (o'chirilgan daraja) bo'lsa DoesNotExist bermasin —
    # AI tahlil shu sabab crash bo'lmasin.
    try:
        _vip = user.vip_level.name if user.vip_level_id and user.vip_level else 'Oddiy'
    except Exception:
        _vip = 'Oddiy'
    lines.append(f"  VIP daraja: {_vip}")
    lines.append(f"  XP: {user.xp} | Tanga: {user.coins} | Streak: {user.streak_days} kun")
    lines.append(f"  Yillik aylanma: {_fmt(user.turnover_year)} so'm")
    lines.append(f"")
    lines.append(f"══════════════════════════════════════")
    lines.append(f"📅 DAVR: {period_labels.get(period, period)}")
    lines.append(f"")
    lines.append(f"── JORIY DAVR ──")
    lines.append(f"  Kirim: {_fmt(s.get('income', 0))} so'm")
    lines.append(f"  Chiqim: {_fmt(s.get('expense', 0))} so'm")
    lines.append(f"  Foyda: {_fmt(s.get('profit', 0))} so'm")
    lines.append(f"  Foyda marjasi: {_margin(s.get('income', 0), s.get('expense', 0))}%")
    lines.append(f"  Yangi buyurtmalar: {s.get('orders', 0)} ta")
    lines.append(f"  Bajarilgan: {s.get('completed', 0)} ta")
    lines.append(f"  Kirim o'zgarishi: {s.get('income_change', 0)}% (oldingi davrga)")
    lines.append(f"  Chiqim o'zgarishi: {s.get('expense_change', 0)}%")
    lines.append(f"  Buyurtma o'zgarishi: {s.get('orders_change', 0)}%")
    lines.append(f"")
    lines.append(f"── UMUMIY (barcha vaqt) ──")
    lines.append(f"  Jami kirim: {_fmt(t.get('income', 0))} so'm")
    lines.append(f"  Jami chiqim: {_fmt(t.get('expense', 0))} so'm")
    lines.append(f"  Jami foyda: {_fmt(t.get('profit', 0))} so'm")
    lines.append(f"  Balans (naqd): {_fmt(t.get('balance', 0))} so'm")
    lines.append(f"  Yechilgan: {_fmt(t.get('withdrawal', 0))} so'm")
    lines.append(f"  Qarzlar: {_fmt(t.get('debt', 0))} so'm")
    lines.append(f"  Jami buyurtmalar: {t.get('orders', 0)} ta")
    lines.append(f"  Jami bajarilgan: {t.get('completed', 0)} ta")
    lines.append(f"  Bajarilish %: {_safe_pct(t.get('completed', 0), t.get('orders', 0))}%")
    lines.append(f"  Mijozlar: {t.get('customers', 0)} ta")
    lines.append(f"  O'rtacha buyurtma: {_avg_order(t)} so'm")

    # Status distribution
    lines.append(f"")
    lines.append(f"══════════════════════════════════════")
    lines.append(f"📦 BUYURTMA HOLATLARI:")
    status_labels = {
        'new': 'Yangi', 'in_progress': 'Jarayonda', 'at_mebelcity': 'MebelCity da',
        'ready': 'Tayyor', 'delivered': 'Topshirildi',
        'completed': 'Tugallangan', 'cancelled': 'Bekor qilingan',
    }
    for s_item in d.get('status_distribution', []):
        lines.append(f"  {status_labels.get(s_item['status'], s_item['status'])}: {s_item['count']} ta")

    # Orders detail
    orders_detail = d.get('orders_detail', [])
    if orders_detail:
        lines.append(f"")
        lines.append(f"══════════════════════════════════════")
        lines.append(f"📋 BUYURTMALAR RO'YXATI (har birini tahlil qil):")
        for i, o in enumerate(orders_detail, 1):
            lines.append(f"")
            lines.append(f"  [{i}] {o['title']}")
            lines.append(f"     Status: {status_labels.get(o['status'], o['status'])}")
            lines.append(f"     Mijoz: {o.get('customer') or 'Belgilanmagan'}")
            lines.append(f"     Progress: {o['progress']}% ({o['done_stages']}/{o['total_stages']} bosqich)")
            if o.get('active_stage'):
                lines.append(f"     Hozirgi bosqich: {o['active_stage']}")
            if o['blocked_count'] > 0:
                lines.append(f"     Kutayotgan bosqichlar: {o['blocked_count']} ta")
            lines.append(f"     Kirim: {_fmt(o['income'])} | Chiqim: {_fmt(o['expense'])} | Foyda: {_fmt(o['profit'])}")
            lines.append(f"     Yaratilganiga: {o['days_since_created']} kun")
            if o.get('deadline'):
                lines.append(f"     Deadline: {o['deadline']}")
            if o.get('has_mc'):
                lines.append(f"     MebelCity buyurtmasi: Ha")
            if o.get('shared_with'):
                shared_str = ', '.join(
                    f"{sw['name']} ({sw['role']})"
                    for sw in o['shared_with']
                )
                lines.append(f"     Ulashilgan: {shared_str}")

    # Debts detail
    debts = d.get('debts_detail', [])
    if debts:
        lines.append(f"")
        lines.append(f"══════════════════════════════════════")
        lines.append(f"⚠️ QARZLAR BATAFSIL (har birini individual ko'rib chiq):")
        for i, debt in enumerate(debts, 1):
            overdue_mark = " ❌ MUDDATI O'TGAN!" if debt.get('overdue') else ""
            lines.append(f"  [{i}] {debt['customer']}{overdue_mark}")
            if debt.get('order'):
                lines.append(f"     Buyurtma: {debt['order']}")
            lines.append(f"     Asl summa: {_fmt(debt['original'])} | To'langan: {_fmt(debt['paid'])} | Qoldiq: {_fmt(debt['remaining'])}")
            lines.append(f"     Status: {debt['status']}")
            if debt.get('due_date'):
                lines.append(f"     Muddat: {debt['due_date']}")

    # Bottlenecks
    bottlenecks = d.get('bottlenecks', [])
    if bottlenecks:
        lines.append(f"")
        lines.append(f"══════════════════════════════════════")
        lines.append(f"⏱️ BOSQICH SAMARADORLIGI (o'rtacha kunlar):")
        for b in bottlenecks:
            lines.append(f"  {b['title']}: o'rtacha {b['avg_days']} kun ({b['count']} ta bajarilgan)")

    # Expense categories
    cats = d.get('expense_categories', [])
    if cats:
        lines.append(f"")
        lines.append(f"══════════════════════════════════════")
        lines.append(f"💸 CHIQIM KATEGORIYALARI:")
        cat_labels = {
            'material': 'Material', 'service': 'Xizmat', 'transport': 'Transport',
            'furniture': 'Mebel', 'mebelcity': 'MebelCity', 'other': 'Boshqa',
        }
        total_exp = sum(c['total'] for c in cats)
        for c in cats:
            pct = _safe_pct(c['total'], total_exp) if total_exp else 0
            lines.append(f"  {cat_labels.get(c['category'], c['category'])}: {_fmt(c['total'])} so'm ({pct}%)")

    # Payment methods
    pms = d.get('payment_methods', [])
    if pms:
        lines.append(f"")
        lines.append(f"💳 TO'LOV USULLARI:")
        pm_labels = {'cash': 'Naqd', 'card': 'Karta', 'transfer': "O'tkazma"}
        pm_total = sum(p['total'] for p in pms)
        for p in pms:
            pct = _safe_pct(p['total'], pm_total) if pm_total else 0
            lines.append(f"  {pm_labels.get(p['method'], p['method'])}: {_fmt(p['total'])} so'm ({pct}%)")

    # Top customers
    top_custs = d.get('top_customers', [])
    if top_custs:
        lines.append(f"")
        lines.append(f"👤 TOP MIJOZLAR (kirim bo'yicha):")
        for i, c in enumerate(top_custs, 1):
            lines.append(f"  {i}. {c['name']}: {_fmt(c['total'])} so'm")

    # Customer activity
    cust_activity = d.get('customer_activity', [])
    if cust_activity:
        lines.append(f"")
        lines.append(f"📊 MIJOZ AKTIVLIGI (buyurtma soni bo'yicha):")
        for c in cust_activity:
            lines.append(f"  {c['name']}: {c['orders']} ta buyurtma")

    # Shared orders IN
    shared_in = d.get('shared_orders_in', [])
    if shared_in:
        lines.append(f"")
        lines.append(f"══════════════════════════════════════")
        lines.append(f"🤝 MENGA ULASHILGAN BUYURTMALAR:")
        role_labels = {'viewer': "Ko'ruvchi", 'worker': 'Ishchi', 'manager': 'Menejer'}
        for so in shared_in:
            lines.append(f"  {so['order_title']} (egasi: {so['owner']}) — rol: {role_labels.get(so['role'], so['role'])} — status: {status_labels.get(so['status'], so['status'])}")

    # Stage performance
    stage_perf = d.get('stage_performance', [])
    if stage_perf:
        lines.append(f"")
        lines.append(f"🔧 BAJARILGAN BOSQICHLAR:")
        for sp in stage_perf:
            lines.append(f"  {sp['title']}: {sp['count']} ta")

    lines.append(f"")
    lines.append(f"══════════════════════════════════════")
    # (2026-08-12) SODDA/QISQA qilib yozish — foydalanuvchi so'radi, avvalgi
    # "CHUQUR/BATAFSIL" ko'rsatma juda uzun, texnik-og'ir javob berardi.
    # Struktura (🔴/🟡/🟢/⚠️/❌/✅/💡/📌/🎯 belgilar + "TAVSIYA" bo'limi) SAQLANADI —
    # `_extract_recommendations()` shu belgilarga tayanadi, ularsiz tavsiyalar
    # ro'yxati bo'sh chiqib qoladi.
    lines.append(f"Yuqoridagi ma'lumotlar asosida ODDIY, QISQA tahlil yoz — mebel ustasi")
    lines.append(f"tushunadigan sodda tilda, ortiqcha raqam/atama takrorlamasdan:")
    lines.append(f"  1. 2-3 gapda umumiy holat (yaxshimi, yomonmi, nega)")
    lines.append(f"  2. Eng muhim 3-5 ta TAVSIYA — har biri BITTA qisqa gap, aniq harakat")
    lines.append(f"     (masalan: \"🔴 Qarzlarni yig'ing — 3 mijozda muddati o'tgan\")")
    lines.append(f"Jami javob 8-10 qatordan oshmasin. Murakkab moliyaviy atamalar ishlatma.")

    return '\n'.join(lines)


def _fmt(val):
    try:
        return f"{int(val):,}".replace(',', ' ')
    except (ValueError, TypeError):
        return str(val)


def _margin(income, expense):
    try:
        inc = int(income)
        exp = int(expense)
        if inc == 0:
            return 0
        return round((inc - exp) / inc * 100)
    except (ValueError, TypeError):
        return 0


def _safe_pct(part, total):
    try:
        p, t = int(part), int(total)
        if t == 0:
            return 0
        return round(p / t * 100)
    except (ValueError, TypeError):
        return 0


def _avg_order(totals):
    try:
        income = int(totals.get('income', 0))
        orders = int(totals.get('orders', 0))
        if orders == 0:
            return '0'
        return _fmt(income // orders)
    except (ValueError, TypeError):
        return '0'


def _extract_recommendations(text):
    recs = []
    lines = text.split('\n')

    # Strategy 1: Find explicit TAVSIYA section
    in_recs = False
    for line in lines:
        stripped = line.strip()
        upper = stripped.upper()
        if 'TAVSIYA' in upper or 'REKOMEND' in upper:
            in_recs = True
            continue
        if in_recs:
            if 'XULOSA' in upper:
                break
            if stripped.startswith('#'):
                continue
            clean = _clean_rec_line(stripped)
            if clean:
                recs.append(clean)

    # Strategy 2: If no explicit section, find actionable items with markers
    if len(recs) < 3:
        for line in lines:
            stripped = line.strip()
            if any(marker in stripped for marker in ['🔴', '🟡', '🟢', '⚠️', '❌', '✅', '💡', '📌', '🎯']):
                clean = _clean_rec_line(stripped)
                if clean and clean not in recs and len(clean) > 15:
                    recs.append(clean)

    # Strategy 3: Extract from bold actionable patterns
    if len(recs) < 3:
        import re
        for line in lines:
            stripped = line.strip()
            if stripped.startswith(('- **', '- 🔴', '- 🟡', '- ⚡')):
                clean = _clean_rec_line(stripped)
                if clean and clean not in recs and len(clean) > 15:
                    recs.append(clean)

    return recs[:8]


def _clean_rec_line(stripped):
    if not stripped or len(stripped) < 6:
        return None
    if stripped.startswith(('#', '```', '|', '---')):
        return None
    clean = stripped.lstrip('0123456789.-•*✅💡📌🎯⚡🔑▶🔴🟡🟢⚠️❌ ')
    clean = clean.replace('**', '').strip('* ').strip()
    if clean.startswith(('←', '→')):
        return None
    if clean and len(clean) > 10:
        return clean
    return None


def _extract_sections(text):
    """Matnni bo'limlarga ajratish — frontend vizualizatsiya uchun."""
    import re

    # Main section markers — only top-level sections with emoji+bold pattern
    section_pattern = re.compile(
        r'^(?:#{1,3}\s+)?'  # optional markdown heading
        r'([📊💰📦⏱🤝⚠📌🏁🔧🔴🏭][️]?)\s*'  # section emoji
        r'\*{0,2}'  # optional bold
        r'([A-ZА-ЯЁA-Z\s]{4,})'  # UPPERCASE title
        r'\*{0,2}',  # optional bold close
        re.UNICODE
    )

    section_keywords = {
        'UMUMIY': '📊', 'BIZNES': '📊', 'HOLATI': '📊',
        'MOLIYA': '💰', 'KIRIM': '💰', 'CASHFLOW': '💰', 'DAROMAD': '💰',
        'BUYURTMA': '📦', 'ORDER': '📦',
        'BOSQICH': '⏱️', 'SAMARADORLIK': '⏱️', 'BOTTLENECK': '⏱️',
        'JAMOA': '🤝', 'HAMKORLIK': '🤝', 'ULASHILGAN': '🤝',
        'QARZ': '⚠️', 'XAVF': '⚠️', 'RISK': '⚠️', 'OGOHLANTIRISH': '⚠️',
        'TAVSIYA': '📌', 'REKOMEND': '📌',
        'XULOSA': '🏁',
    }

    sections = []
    current_title = None
    current_icon = '📊'
    current_lines = []

    for line in text.split('\n'):
        stripped = line.strip()
        is_heading = False

        if stripped.startswith('---'):
            continue

        if stripped and len(stripped) > 5:
            m = section_pattern.match(stripped)
            if m:
                title_text = m.group(2).strip()
                detected_icon = m.group(1)
                for kw, icon in section_keywords.items():
                    if kw in title_text.upper():
                        detected_icon = icon
                        break

                if current_title is not None:
                    sections.append({
                        'title': current_title,
                        'icon': current_icon,
                        'content': '\n'.join(current_lines).strip(),
                    })

                clean_title = stripped.lstrip('#').strip()
                clean_title = re.sub(r'^[📊💰📦⏱🤝⚠📌🏁🔧🔴🏭️\s*]+', '', clean_title)
                clean_title = clean_title.strip('* ').strip()
                current_title = clean_title
                current_icon = detected_icon
                current_lines = []
                is_heading = True

            elif stripped.startswith('#') and len(stripped) < 80:
                clean = stripped.lstrip('#').strip().strip('*').strip()
                upper = clean.upper()
                for kw, icon in section_keywords.items():
                    if kw in upper:
                        if current_title is not None:
                            sections.append({
                                'title': current_title,
                                'icon': current_icon,
                                'content': '\n'.join(current_lines).strip(),
                            })
                        current_title = clean
                        current_icon = icon
                        current_lines = []
                        is_heading = True
                        break

        if not is_heading:
            current_lines.append(line)

    if current_title and current_lines:
        sections.append({
            'title': current_title,
            'icon': current_icon,
            'content': '\n'.join(current_lines).strip(),
        })

    # Filter empty sections and merge too-small ones
    result = []
    for sec in sections:
        if len(sec['content'].strip()) > 20:
            result.append(sec)
        elif result:
            result[-1]['content'] += '\n\n' + sec['title'] + '\n' + sec['content']

    return result
