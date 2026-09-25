"""client_erp/services/ai_diagnose.py — moliya tashxisi.

TZ: client_erp/TZ-AI-Tushuntiruvchi-Tashxischi.md §3, §4

╔══════════════════════════════════════════════════════════════════════════╗
║  QAT'IY QOIDA — TASHXISNI AI TO'QIMAYDI                                  ║
║                                                                          ║
║  Bu modul DETERMINISTIK tekshiruvlar to'plami. Har bir muammo, uning     ║
║  summasi, qaysi buyurtmalarga tegishli ekani va TUZATISH matni — hammasi ║
║  SHU YERDA hisoblanadi. AI faqat natijani odam tilida gapirib beradi.    ║
║                                                                          ║
║  Sabab: AI moliyaviy xulosa to'qisa — usta noto'g'ri qaror qabul qiladi. ║
║  Raqam va sabab HAR DOIM koddan, faqat SO'Z AI'dan.                      ║
║                                                                          ║
║  FAQAT O'QIYDI — bitta ham yozuv yaratilmaydi/o'zgartirilmaydi.          ║
╚══════════════════════════════════════════════════════════════════════════╝

Natija formati (har bir topilma):
    {
      'code':     'no_contract_amount',     # mashina uchun
      'severity': 'high' | 'medium' | 'low',
      'title':    "4 ta buyurtmada shartnoma summasi yo'q",
      'effect':   "Ular bo'yicha foyda 0 chiqadi",
      'amount':   0,                         # tegishli summa (bo'lsa)
      'items':    [{'order_id': 331, 'title': '...'}, ...],   # max 5 ta
      'more':     2,                         # ro'yxatga sig'magani
      'fix':      "Har biriga kelishilgan summani kiriting",
    }
"""
from decimal import Decimal

from django.db.models import Q, Sum


def _m(v):
    """12345678 → '12 345 678'"""
    try:
        return f"{float(v or 0):,.0f}".replace(',', ' ')
    except (TypeError, ValueError):
        return '0'


def _pack(qs_list, limit=5):
    """Buyurtmalar ro'yxatini qisqartirib qaytaradi."""
    items = [{'order_id': o.id, 'title': (o.title or '')[:40]} for o in qs_list[:limit]]
    return items, max(len(qs_list) - limit, 0)


def diagnose(user, limit_per_check=5):
    """Foydalanuvchi moliyasidagi muammolarni topadi.

    FAQAT O'QIYDI. Muhimlik bo'yicha tartiblangan ro'yxat qaytaradi.
    Xato bo'lsa — bo'sh ro'yxat (AI hech qachon yiqilmasin).
    """
    from client_erp.models import ClientOrder, ClientFinanceRecord

    out = []
    try:
        orders = list(
            ClientOrder.objects.filter(owner=user, is_deleted=False)
            .exclude(status='cancelled')
            .select_related('customer')
            .prefetch_related('contracts')
        )
    except Exception:                                             # noqa: BLE001
        return []

    if not orders:
        return []

    # ── 1) Shartnoma summasi yo'q → foyda 0 ──────────────────────────────
    # Eng ko'p uchraydigan sabab (jonli bazada 151 dan 40 tasi).
    try:
        bad = [o for o in orders if float(o.contract_amount or 0) <= 0]
        if bad:
            items, more = _pack(bad, limit_per_check)
            out.append({
                'code': 'no_contract_amount',
                'severity': 'high',
                'title': f"{len(bad)} ta buyurtmada kelishilgan summa kiritilmagan",
                'effect': "Foyda shartnoma summasidan hisoblanadi — summa yo'q "
                          "bo'lsa bu buyurtmalar bo'yicha foyda 0 chiqadi.",
                'amount': 0,
                'items': items, 'more': more,
                'fix': "Har bir buyurtmani ochib, mijoz bilan kelishilgan "
                       "umumiy summani kiriting.",
            })
    except Exception:                                             # noqa: BLE001
        pass

    # ── 2) Chiqim buyurtmaga bog'lanmagan ────────────────────────────────
    # Pul hamyondan chiqadi (Balans kamayadi), lekin hech qaysi buyurtmaning
    # xarajatiga qo'shilmaydi → foyda HAQIQATDAN KATTA ko'rinadi.
    try:
        qs = ClientFinanceRecord.objects.filter(
            owner=user, record_type='expense', is_deleted=False, order__isnull=True,
        )
        tot = qs.aggregate(s=Sum('amount'))['s'] or 0
        n = qs.count()
        if n:
            top = list(qs.order_by('-amount')[:limit_per_check])
            out.append({
                'code': 'unlinked_expense',
                'severity': 'high',
                'title': f"{n} ta chiqim hech qaysi buyurtmaga bog'lanmagan "
                         f"({_m(tot)} so'm)",
                'effect': "Bu pul hamyondan chiqdi — Balans kamaydi. Lekin hech "
                          "qaysi buyurtmaning xarajatiga qo'shilmadi, shuning "
                          "uchun foyda haqiqatdan KATTA ko'rinadi.",
                'amount': float(tot),
                'items': [{
                    'date': str(r.date),
                    'amount': float(r.amount),
                    'note': (r.description or '')[:40],
                } for r in top],
                'more': max(n - limit_per_check, 0),
                'fix': "Moliya → Tranzaksiyalar tabidan har birini ochib, qaysi "
                       "buyurtmaga tegishli ekanini belgilang.",
            })
    except Exception:                                             # noqa: BLE001
        pass

    # ── 3) Zarar: kelishilgan summa xarajatdan kam ───────────────────────
    try:
        loss = []
        for o in orders:
            ca = float(o.contract_amount or 0)
            te = float(o.total_expense or 0)
            if ca > 0 and ca < te:
                loss.append((o, te - ca))
        if loss:
            loss.sort(key=lambda x: -x[1])
            tot = sum(x[1] for x in loss)
            out.append({
                'code': 'loss_order',
                'severity': 'high',
                'title': f"{len(loss)} ta buyurtma zarar keltirgan ({_m(tot)} so'm)",
                'effect': "Xarajat kelishilgan summadan oshib ketgan.",
                'amount': tot,
                'items': [{
                    'order_id': o.id, 'title': (o.title or '')[:40],
                    'contract': float(o.contract_amount or 0),
                    'expense': float(o.total_expense or 0),
                    'loss': d,
                } for o, d in loss[:limit_per_check]],
                'more': max(len(loss) - limit_per_check, 0),
                'fix': "Xarajatlarni tekshiring — ortiqcha yozuv yoki noto'g'ri "
                       "buyurtmaga bog'langan chiqim bo'lishi mumkin. Haqiqiy "
                       "zarar bo'lsa keyingi safar narxni qayta hisoblang.",
            })
    except Exception:                                             # noqa: BLE001
        pass

    # ── 4) Mijoz qarzi ───────────────────────────────────────────────────
    try:
        debt = []
        for o in orders:
            ca = float(o.contract_amount or 0)
            ri = float(o.real_income or 0)
            if ca > 0 and ri < ca:
                debt.append((o, ca - ri))
        if debt:
            debt.sort(key=lambda x: -x[1])
            tot = sum(x[1] for x in debt)
            out.append({
                'code': 'client_debt',
                'severity': 'medium',
                'title': f"Mijozlarda {_m(tot)} so'm qarz ({len(debt)} ta buyurtma)",
                'effect': "Foyda hisoblangan, lekin pul hali kelmagan — "
                          "shuning uchun Balans foydadan kichik.",
                'amount': tot,
                'items': [{
                    'order_id': o.id, 'title': (o.title or '')[:40],
                    'customer': (getattr(o.customer, 'full_name', '') if o.customer_id else ''),
                    'debt': d,
                } for o, d in debt[:limit_per_check]],
                'more': max(len(debt) - limit_per_check, 0),
                'fix': "Moliya → Qarzlar tabida kim qancha qarzdorligi ko'rinadi. "
                       "Muddat kelishsangiz «Muddatli qarz» qilib yozing.",
            })
    except Exception:                                             # noqa: BLE001
        pass

    # ── 5) Topshirilgan, lekin xarajat yozilmagan ────────────────────────
    # Foyda 100% ko'rinadi — material pulini yozishni unutgan.
    try:
        bad = [o for o in orders
               if o.status == 'delivered'
               and float(o.total_expense or 0) <= 0
               and float(o.contract_amount or 0) > 0]
        if bad:
            items, more = _pack(bad, limit_per_check)
            out.append({
                'code': 'no_expense',
                'severity': 'medium',
                'title': f"{len(bad)} ta topshirilgan buyurtmada xarajat yozilmagan",
                'effect': "Foyda 100% ko'rinadi — material va boshqa xarajatlar "
                          "kiritilmagan bo'lishi mumkin.",
                'amount': 0,
                'items': items, 'more': more,
                'fix': "Bu buyurtmalarga sarflangan material, transport va ish "
                       "haqini chiqim qilib yozing.",
            })
    except Exception:                                             # noqa: BLE001
        pass

    # ── 6) Kirim buyurtmaga bog'lanmagan ─────────────────────────────────
    try:
        qs = ClientFinanceRecord.objects.filter(
            owner=user, record_type='income', is_deleted=False,
            order__isnull=True, is_reversal=False,
        )
        tot = qs.aggregate(s=Sum('amount'))['s'] or 0
        n = qs.count()
        if n:
            out.append({
                'code': 'unlinked_income',
                'severity': 'low',
                'title': f"{n} ta kirim buyurtmaga bog'lanmagan ({_m(tot)} so'm)",
                'effect': "Pul kelgani ko'rinadi, lekin qaysi buyurtmadan "
                          "ekani noma'lum — shartnoma qarzi noto'g'ri chiqadi.",
                'amount': float(tot),
                'items': [{
                    'date': str(r.date), 'amount': float(r.amount),
                    'note': (r.description or '')[:40],
                } for r in qs.order_by('-amount')[:limit_per_check]],
                'more': max(n - limit_per_check, 0),
                'fix': "Tranzaksiyalar tabidan har birini buyurtmaga bog'lang.",
            })
    except Exception:                                             # noqa: BLE001
        pass

    # ── 7) Mijozi belgilanmagan buyurtma ─────────────────────────────────
    try:
        bad = [o for o in orders if not o.customer_id]
        if bad:
            items, more = _pack(bad, limit_per_check)
            out.append({
                'code': 'no_customer',
                'severity': 'low',
                'title': f"{len(bad)} ta buyurtmada mijoz belgilanmagan",
                'effect': "Qarzdorni ism bilan ko'rsatib bo'lmaydi, mijoz "
                          "tarixi ham to'planmaydi.",
                'amount': 0,
                'items': items, 'more': more,
                'fix': "Buyurtmani ochib mijozni tanlang yoki yangi mijoz qo'shing.",
            })
    except Exception:                                             # noqa: BLE001
        pass

    # ── 8) Ulush 100% dan oshgan ─────────────────────────────────────────
    try:
        from client_erp.models.team import ClientOrderProfitShare
        rows = (ClientOrderProfitShare.objects
                .filter(order__owner=user, order__is_deleted=False)
                .values('order_id')
                .annotate(p=Sum('percent')))
        over = [r for r in rows if float(r['p'] or 0) > 100.01]
        if over:
            oid_map = {o.id: o for o in orders}
            out.append({
                'code': 'share_over_100',
                'severity': 'high',
                'title': f"{len(over)} ta buyurtmada ulushlar 100% dan oshgan",
                'effect': "Foyda mavjudidan ko'p taqsimlangan — kassada "
                          "yetishmovchilik chiqadi.",
                'amount': 0,
                'items': [{
                    'order_id': r['order_id'],
                    'title': (getattr(oid_map.get(r['order_id']), 'title', '') or '')[:40],
                    'percent': float(r['p'] or 0),
                } for r in over[:limit_per_check]],
                'more': max(len(over) - limit_per_check, 0),
                'fix': "Buyurtma → Ustalar foydasi bo'limida foizlarni tuzating.",
            })
    except Exception:                                             # noqa: BLE001
        pass

    order = {'high': 0, 'medium': 1, 'low': 2}
    out.sort(key=lambda x: (order.get(x['severity'], 3), -float(x.get('amount') or 0)))
    return out


def diagnose_text(user):
    """Tashxisni AI o'qishi uchun MATN ko'rinishida.

    AI shu matnni oladi va odam tilida qayta gapirib beradi. Raqamlar
    va sabablar shu yerda tayyor — AI ularni o'zgartirmasligi kerak.
    """
    found = diagnose(user)
    if not found:
        return ("Tekshirdim — moliyangizda muammo topilmadi. Barcha "
                "buyurtmalarda summa kiritilgan, xarajatlar bog'langan, "
                "ulushlar joyida.")

    sev_uz = {'high': 'MUHIM', 'medium': "O'RTA", 'low': 'KICHIK'}
    lines = [f"Tashxis natijasi — {len(found)} ta muammo topildi:", '']
    for i, f in enumerate(found, 1):
        lines.append(f"{i}. [{sev_uz.get(f['severity'], '')}] {f['title']}")
        lines.append(f"   Ta'siri: {f['effect']}")
        for it in f.get('items', []):
            if 'order_id' in it:
                extra = ''
                if 'debt' in it:
                    extra = f" — qarz {_m(it['debt'])}"
                elif 'loss' in it:
                    extra = f" — shartnoma {_m(it['contract'])}, xarajat {_m(it['expense'])}"
                elif 'percent' in it:
                    extra = f" — {it['percent']:.0f}%"
                cust = f" ({it['customer']})" if it.get('customer') else ''
                lines.append(f"   • #{it['order_id']} {it['title']}{cust}{extra}")
            else:
                lines.append(f"   • {it.get('date', '')} {_m(it.get('amount'))} "
                             f"{it.get('note', '')}")
        if f.get('more'):
            lines.append(f"   • ... yana {f['more']} ta")
        lines.append(f"   Yechim: {f['fix']}")
        lines.append('')
    return '\n'.join(lines)
