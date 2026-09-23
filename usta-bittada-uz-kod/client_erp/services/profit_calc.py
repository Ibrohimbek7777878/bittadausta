"""client_erp/services/profit_calc.py — YAGONA foyda-hisoblagich (2026-09-09).

TZ-Moliya-Yagona-Foyda-Hisoblagich-2026-09.md. Sabab: loyihada "foyda" 11 ta
mustaqil joyda alohida-alohida hisoblanardi (Moliya, Analitika, Bosh sahifa,
Ustalar foydasi, Jamoa hisoboti...), ba'zilari `ClientOrder.contract_profit`
(rasmiy "yagona manba", 2026-08-03) ni umuman chaqirmasdan `income − expense`
formulasini QAYTA yozgan edi. Natija: bir xil buyurtma turli sahifada turli
foyda ko'rsatardi (masalan #451/#453 — Ustalar foydasi paneli eski ulush
foizidan, Moliya esa yangi yechimdan hisoblardi).

Bu modul HECH QANDAY yangi formula O'YLAB TOPMAYDI — faqat mavjud
`ClientOrder.contract_profit` (models/order.py:167-199) ni BIR JOYDAN,
turli scope/status/sana parametrlari bilan chaqirish imkonini beradi.
Chaqiruvchi joylar BOSQICHMA-BOSQICH shu funksiyaga o'tkaziladi (§3-reja) —
har biri o'zgartirilgandan keyin ESKI natija bilan solishtirilib tasdiqlanadi.
"""
import logging

logger = logging.getLogger('client_erp.profit_calc')


def get_orders_profit(user, scope_mode='own_and_shared', status_filter=('delivered', 'ready'),
                       date_field='delivered_ready_coalesce', start=None, end=None):
    """Foydalanuvchiga tegishli buyurtmalarning YAGONA-MANBALI foyda ro'yxati.

    `scope_mode`:
      'own_only'              — faqat `owner=user`.
      'own_and_shared'        — + `ClientOrderShare`/`ClientTeamMember` orqali
                                 ulashilgan zakazlar (`shared_order_ids`).
      'own_shared_and_claim'  — + BETA "claim" (`profit_claim_map`, foiz bilan
                                 masshtablanadi) — FAQAT TEAM_FINANCE_BETA_USER_IDS.

    `status_filter`: iterable (masalan `('delivered','ready')`) yoki `None`
      (filtrsiz — faqat `cancelled` har doim chiqarib tashlanadi, chunki
      `contract_profit` o'zi `cancelled` uchun 0 qaytaradi).

    `date_field`:
      'delivered_ready_coalesce' — `Coalesce(delivered_at, ready_at)` bo'yicha.
      'created_at'               — `created_at` bo'yicha.
      None                       — davr filtri qo'llanmaydi (butun tarix).

    `start`/`end` — `date` obyektlar, faqat `date_field` bilan birga ishlaydi.

    Qaytaradi: [{'order_id', 'title', 'income', 'expense', 'contract_amount',
    'profit', 'by_contract', 'claim_pct', 'delivered_at'}, ...] — `profit`
    HAR DOIM `order.contract_profit`dan (claim_pct bo'lsa shunga masshtablanib)
    olinadi, `income - expense` bu yerda QAYTA HISOBLANMAYDI.
    """
    from django.db.models import Q
    from client_erp.models import ClientOrder
    from client_erp.services.scope import shared_order_ids, profit_claim_map

    scope_q = Q(owner=user)
    claim_map = {}
    if scope_mode in ('own_and_shared', 'own_shared_and_claim'):
        sh_ids = shared_order_ids(user)
        if sh_ids:
            scope_q = scope_q | Q(pk__in=sh_ids)
    if scope_mode == 'own_shared_and_claim':
        claim_map = profit_claim_map(user)
        if claim_map:
            scope_q = scope_q | Q(pk__in=claim_map.keys())

    qs = ClientOrder.objects.filter(scope_q, is_deleted=False).exclude(status='cancelled')
    if status_filter:
        qs = qs.filter(status__in=list(status_filter))

    dt_field = None
    if date_field == 'delivered_ready_coalesce':
        from django.db.models.functions import Coalesce
        qs = qs.annotate(_pf_dt=Coalesce('delivered_at', 'ready_at'))
        dt_field = '_pf_dt'
    elif date_field == 'created_at':
        dt_field = 'created_at'

    if dt_field and start:
        qs = qs.filter(**{f'{dt_field}__date__gte': start})
    if dt_field and end:
        qs = qs.filter(**{f'{dt_field}__date__lte': end})

    out = []
    for o in qs.select_related('customer'):
        base_profit = float(o.contract_profit or 0)
        pct = claim_map.get(o.pk)
        profit = base_profit * (pct / 100.0) if pct is not None else base_profit
        out.append({
            'order_id': o.pk,
            'title': o.title or '',
            'income': float(o.total_income or 0),
            'expense': float(o.total_expense or 0),
            'contract_amount': float(o.contract_amount or 0),
            'profit': profit,
            'by_contract': bool(o.uses_contract_profit),
            'claim_pct': pct,
            'delivered_at': o.delivered_at.isoformat() if o.delivered_at else None,
            'ready_at': o.ready_at.isoformat() if o.ready_at else None,
        })
    return out
