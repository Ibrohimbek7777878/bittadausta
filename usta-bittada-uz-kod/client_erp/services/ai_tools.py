"""client_erp/services/ai_tools.py — AI uchun SERVER tomonidagi ma'lumot tool'lari.

TZ: client_erp/TZ-AI-Tushuntiruvchi-Tashxischi.md §6.3

NEGA SERVERDA (brauzerda emas)
    Mavjud `RcActions.run` (rc-actions.js) SINXRON — string qaytaradi va
    WS javobini kuta olmaydi. Shuning uchun UI amallari (sahifa ochish,
    etap tugatish) brauzerda qoladi, MA'LUMOT so'rovlari esa shu yerda
    to'g'ridan-to'g'ri bazadan olinadi.

╔══════════════════════════════════════════════════════════════════════════╗
║  QAT'IY: FAQAT O'QIYDI + FAQAT O'Z MA'LUMOTI                             ║
║  Har bir funksiya `user` bo'yicha qat'iy filtrlanadi. Boshqa akkaunt     ║
║  ma'lumoti hech qachon qaytmaydi. Hech narsa yozilmaydi/o'chirilmaydi.   ║
╚══════════════════════════════════════════════════════════════════════════╝

Barcha funksiya MATN qaytaradi — AI shuni o'qib odam tilida gapiradi.
Xato bo'lsa ham hech qachon exception ko'tarilmaydi (AI yiqilmasin).
"""
from decimal import Decimal


def _m(v):
    try:
        return f"{float(v or 0):,.0f}".replace(',', ' ')
    except (TypeError, ValueError):
        return '0'


# ─────────────────────────────────────────────────────────────────────────────
def tool_diagnose(user, args=None):
    """«Nega foydam kam?», «xatoyim bor, ko'rsat» — tashxis."""
    from client_erp.services.ai_diagnose import diagnose_text
    try:
        return diagnose_text(user)
    except Exception as e:                                        # noqa: BLE001
        return f"Tashxis qilib bo'lmadi: {str(e)[:120]}"


# ─────────────────────────────────────────────────────────────────────────────
def tool_explain_metric(user, args=None):
    """Ko'rsatkich formulasi + FOYDALANUVCHINING haqiqiy raqami.

    args: {'metric': 'balans'|'foyda'|'kassa_foyda'|'qarz'}
    """
    metric = ((args or {}).get('metric') or '').strip().lower()
    try:
        from client_erp.serializers import serialize_finance_page
        d = serialize_finance_page(user, period='month')
        s = d.get('stats') or {}
        k = d.get('kassa') or {}
        sf = d.get('sof_foyda') or {}
        c = d.get('contracts') or {}

        if 'balans' in metric or 'qoldiq' in metric or 'hamyon' in metric:
            return (
                "BALANS — hozir qo'lda turgan pul.\n"
                "Formula: barcha kirim − barcha chiqim − barcha pul yechish\n"
                f"Sizda hozir: {_m(s.get('balance'))} so'm\n"
                "Oy filtriga bog'liq emas. Shartnoma summasi, mijoz qarzi va "
                "kutilayotgan ulush bunga KIRMAYDI — faqat haqiqiy pul."
            )
        if 'kassa' in metric:
            return (
                "PUL O'ZGARISHI (ekranda shu nom) = shu oy kirim − shu oy chiqim\n"
                f"Sizda: {_m(s.get('total_income'))} − {_m(s.get('total_expense'))} "
                f"= {_m(s.get('profit'))} so'm\n"
                "⚠️ Bu haqiqiy foyda EMAS. Material bir oyda olinib, pul "
                "boshqa oyda kelsa — raqam aldamchi bo'ladi. Haqiqiy foyda "
                "«Sof foyda» yoki «Shartnomalar» tabida."
            )
        if 'foyda' in metric or 'sof' in metric or 'daromad' in metric:
            n = sf.get('count') or 0
            txt = (
                "SOF FOYDA = shartnoma summasi − chiqim\n"
                "Faqat shu oyda TOPSHIRILGAN buyurtmalar sanaladi.\n"
                f"Sizda: {_m(sf.get('total'))} so'm ({n} ta topshirilgan)\n"
            )
            if not n:
                txt += ("Shu oyda hech nima topshirilmagan — shuning uchun 0. "
                        "Bu xato emas; davr filtrini «Hammasi» ga o'zgartirib "
                        "ko'ring.\n")
            txt += ("Foyda shartnomadan hisoblanadi, kelgan puldan emas — "
                    "ish topshirilsa foyda to'liq yoziladi, pul keyin kelsa ham.")
            return txt
        if 'qarz' in metric:
            n = len(c.get('debtors') or [])
            return (
                "QARZ = kelishilgan summa − olingan pul\n"
                f"Sizda: {_m(c.get('debtors_total'))} so'm, {n} ta buyurtmada\n"
                "Moliya → Qarzlar tabida kim qancha qarzdorligi ko'rinadi. "
                "Bu qarz tizim tomonidan o'zi hisoblanadi (qizil). Muddat "
                "kelishilgan qarzni esa o'zingiz yozasiz (sariq)."
            )
        # metric noma'lum — umumiy holat
        return (
            f"Balans: {_m(s.get('balance'))}\n"
            f"Sof foyda: {_m(sf.get('total'))} ({sf.get('count') or 0} topshirilgan)\n"
            f"Pul o'zgarishi (shu oy, foyda emas): {_m(s.get('profit'))}\n"
            f"Mijozlar qarzi: {_m(c.get('debtors_total'))}\n"
            f"Oy oxiri qoldiq: {_m(k.get('closing'))}"
        )
    except Exception as e:                                        # noqa: BLE001
        return f"Ma'lumot olinmadi: {str(e)[:120]}"


# ─────────────────────────────────────────────────────────────────────────────
def tool_my_debtors(user, args=None):
    """Kim qancha qarzdor — mijoz bo'yicha guruhlangan."""
    try:
        from client_erp.serializers import serialize_finance_page
        c = serialize_finance_page(user, period='month').get('contracts') or {}
        rows = c.get('debtors') or []
        if not rows:
            return "Qarzdor yo'q — barcha mijozlar kelishilgan pulni to'liq bergan."

        groups = {}
        for d in rows:
            key = d.get('customer_id') or ('o%s' % d['order_id'])
            g = groups.setdefault(key, {
                'name': d.get('customer') or 'Mijoz belgilanmagan',
                'total': Decimal('0'), 'orders': [],
            })
            g['total'] += Decimal(str(d.get('remaining') or 0))
            g['orders'].append(d)

        items = sorted(groups.values(), key=lambda g: -float(g['total']))
        out = [f"Jami qarz: {_m(c.get('debtors_total'))} so'm, {len(items)} ta mijozda.", '']
        for g in items[:10]:
            out.append(f"{g['name']} — {_m(g['total'])} so'm ({len(g['orders'])} ta buyurtma)")
            for d in g['orders'][:4]:
                out.append(f"   #{d['order_id']} {d.get('title', '')}: "
                           f"kelishdik {_m(d.get('contract_amount'))}, "
                           f"oldik {_m(d.get('received'))}, qarz {_m(d.get('remaining'))}")
        if len(items) > 10:
            out.append(f"... yana {len(items) - 10} ta mijoz")
        return '\n'.join(out)
    except Exception as e:                                        # noqa: BLE001
        return f"Qarzlar olinmadi: {str(e)[:120]}"


# ─────────────────────────────────────────────────────────────────────────────
def tool_contract_detail(user, args=None):
    """Bitta buyurtmaning to'liq moliya hisobi. args: {'order_id': 319}"""
    oid = (args or {}).get('order_id')
    try:
        oid = int(oid)
    except (TypeError, ValueError):
        return "Buyurtma raqamini ayting (masalan: 319)."
    try:
        from client_erp.models import ClientOrder, ClientFinanceRecord
        from django.db.models import Sum, Q
        o = ClientOrder.objects.filter(pk=oid, owner=user, is_deleted=False).first()
        if not o:
            return f"#{oid} buyurtma topilmadi (yoki sizga tegishli emas)."

        ca = Decimal(str(o.contract_amount or 0))
        recv = Decimal(str(o.real_income or 0))
        exp = Decimal(str(o.total_expense or 0))
        wd = ClientFinanceRecord.objects.filter(
            order=o, record_type='withdrawal', is_deleted=False,
        ).aggregate(s=Sum('amount'))['s'] or 0
        rev = ClientFinanceRecord.objects.filter(
            order=o, record_type='income', is_reversal=True, is_deleted=False,
        ).aggregate(s=Sum('amount'))['s'] or 0
        dist = Decimal(str(wd)) - Decimal(str(rev))
        profit = ca - exp

        lines = [
            f"#{o.id} «{o.title}»",
            f"Mijoz: {getattr(o.customer, 'full_name', '') if o.customer_id else 'belgilanmagan'}",
            f"Holat: {o.get_status_display()}",
            '',
            f"Kelishdik: {_m(ca)}",
            f"Oldik: {_m(recv)}",
            f"Mijoz qarzi: {_m(max(ca - recv, Decimal('0')))}",
            f"Sarfladik: {_m(exp)}",
            f"FOYDA: {_m(profit)}" + (f" ({profit / ca * 100:.0f}%)" if ca > 0 else ''),
        ]
        if dist:
            lines.append(f"Ulushga berildi: {_m(dist)}")
            lines.append(f"Sizga qoldi: {_m(profit - dist)}")
        if ca <= 0:
            lines.append('')
            lines.append("⚠️ Kelishilgan summa kiritilmagan — shuning uchun foyda 0.")
        # Xarajat kategoriyalari
        cats = ClientFinanceRecord.objects.filter(
            order=o, record_type='expense', is_deleted=False,
        ).values('category').annotate(s=Sum('amount')).order_by('-s')
        if cats:
            lines.append('')
            lines.append('Nimalarga sarflandi:')
            for c in cats:
                lines.append(f"   {c['category'] or 'boshqa'}: {_m(c['s'])}")
        return '\n'.join(lines)
    except Exception as e:                                        # noqa: BLE001
        return f"Buyurtma ma'lumoti olinmadi: {str(e)[:120]}"


# ─────────────────────────────────────────────────────────────────────────────
def tool_orders_without_contract(user, args=None):
    """Kelishilgan summasi kiritilmagan buyurtmalar."""
    try:
        from client_erp.models import ClientOrder
        qs = (ClientOrder.objects.filter(owner=user, is_deleted=False)
              .exclude(status='cancelled').prefetch_related('contracts'))
        bad = [o for o in qs if float(o.contract_amount or 0) <= 0]
        if not bad:
            return "Barcha buyurtmalarda kelishilgan summa kiritilgan."
        out = [f"{len(bad)} ta buyurtmada kelishilgan summa yo'q "
               f"— ular bo'yicha foyda 0 chiqadi:"]
        for o in bad[:15]:
            out.append(f"   #{o.id} {o.title} ({o.get_status_display()})")
        if len(bad) > 15:
            out.append(f"   ... yana {len(bad) - 15} ta")
        out.append("Yechim: buyurtmani ochib kelishilgan umumiy summani kiriting.")
        return '\n'.join(out)
    except Exception as e:                                        # noqa: BLE001
        return f"Ma'lumot olinmadi: {str(e)[:120]}"


# ─────────────────────────────────────────────────────────────────────────────
def tool_unlinked_records(user, args=None):
    """Buyurtmaga bog'lanmagan kirim/chiqim yozuvlari."""
    try:
        from client_erp.models import ClientFinanceRecord
        from django.db.models import Sum
        out = []
        for rt, nom in (('expense', 'CHIQIM'), ('income', 'KIRIM')):
            qs = ClientFinanceRecord.objects.filter(
                owner=user, record_type=rt, is_deleted=False,
                order__isnull=True, is_reversal=False,
            )
            n = qs.count()
            if not n:
                continue
            tot = qs.aggregate(s=Sum('amount'))['s'] or 0
            out.append(f"{nom}: {n} ta yozuv, jami {_m(tot)} so'm")
            for r in qs.order_by('-amount')[:8]:
                out.append(f"   {r.date}  {_m(r.amount)}  {r.description or ''}")
        if not out:
            return "Barcha kirim va chiqim yozuvlari buyurtmalarga bog'langan."
        out.append('')
        out.append("Chiqim bog'lanmasa — foyda haqiqatdan katta ko'rinadi. "
                   "Moliya → Tranzaksiyalar tabidan har birini buyurtmaga bog'lang.")
        return '\n'.join(out)
    except Exception as e:                                        # noqa: BLE001
        return f"Ma'lumot olinmadi: {str(e)[:120]}"


# ─────────────────────────────────────────────────────────────────────────────
# Server tomonida bajariladigan tool'lar reestri.
# Bu yerda BO'LMAGAN tool nomi brauzerga yuboriladi (UI amallari).
SERVER_TOOLS = {
    'diagnose_my_finance': tool_diagnose,
    'explain_metric': tool_explain_metric,
    'my_debtors': tool_my_debtors,
    'contract_detail': tool_contract_detail,
    'orders_without_contract': tool_orders_without_contract,
    'unlinked_records': tool_unlinked_records,
}


def run_server_tool(user, name, args):
    """Server tool'ini xavfsiz bajaradi. Topilmasa None (→ brauzerga)."""
    fn = SERVER_TOOLS.get(name)
    if fn is None:
        return None
    try:
        return fn(user, args or {})
    except Exception as e:                                        # noqa: BLE001
        return f"Xatolik: {str(e)[:120]}"


# Gemini uchun e'lonlar (rc-actions.js dagi GEMINI_TOOLS ga qo'shiladi)
SERVER_TOOL_DECLS = [
    {
        'name': 'diagnose_my_finance',
        'description': (
            "Foydalanuvchi moliyasini tekshirib, topilgan MUAMMOLARNI qaytaradi. "
            "«Nega foydam kam?», «xatoyim bor, topa olmadim», «nima noto'g'ri?», "
            "«tekshirib ber» kabi savollarda SHU tool'ni chaqir. Natijadagi raqam "
            "va sabablarni O'ZGARTIRMASDAN, sodda til bilan tushuntir."
        ),
        'parameters': {'type': 'object', 'properties': {}, 'required': []},
    },
    {
        'name': 'explain_metric',
        'description': (
            "Moliya ko'rsatkichining formulasini va foydalanuvchining HAQIQIY "
            "raqamini qaytaradi. «Balans nima?», «foyda qanday hisoblanadi?» "
            "kabi savollarda ishlat. Raqamni o'zingdan aytma — shu tool'dan ol."
        ),
        'parameters': {
            'type': 'object',
            'properties': {
                'metric': {
                    'type': 'string',
                    'description': "Ko'rsatkich: balans, foyda, kassa_foyda yoki qarz",
                },
            },
            'required': ['metric'],
        },
    },
    {
        'name': 'my_debtors',
        'description': "Kim qancha qarzdorligini mijoz bo'yicha qaytaradi.",
        'parameters': {'type': 'object', 'properties': {}, 'required': []},
    },
    {
        'name': 'contract_detail',
        'description': (
            "Bitta buyurtmaning to'liq moliya hisobi: kelishdik, oldik, qarz, "
            "sarfladik, foyda, xarajat kategoriyalari."
        ),
        'parameters': {
            'type': 'object',
            'properties': {
                'order_id': {'type': 'integer', 'description': 'Buyurtma raqami'},
            },
            'required': ['order_id'],
        },
    },
    {
        'name': 'orders_without_contract',
        'description': "Kelishilgan summasi kiritilmagan buyurtmalar ro'yxati.",
        'parameters': {'type': 'object', 'properties': {}, 'required': []},
    },
    {
        'name': 'unlinked_records',
        'description': "Buyurtmaga bog'lanmagan kirim/chiqim yozuvlari.",
        'parameters': {'type': 'object', 'properties': {}, 'required': []},
    },
]
