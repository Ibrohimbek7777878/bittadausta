"""client_erp/views/contract_print.py — Shartnoma varaqasi (2026-08-25).

Foydalanuvchi talabi:
  · Zakazga QR kod ulanadi → mijoz skaner qilib holatni ko'radi
  · Yuqorida «Bittada ERP» brendi (katta ERP chekidagi dizayn)
  · Blank dizayni O'ZGARMAYDI — faqat moslashadi
  · **DINAMIK**: tanlangan etap shabloniga qarab o'ng ustun o'zgaradi
    («Blanka BigOne» → 9 bosqich, «Umumiy mebel» → 7 bosqich)

Moliyaviy hisobot qatorlari xarajat izohiga qarab taqsimlanadi.
Mos kelmagani «Ko'zda tutilmagan» ga tushadi — hech narsa YO'QOLMAYDI,
jami har doim `order.total_expense` ga teng bo'ladi (tekshiruv).
"""
import re
import uuid as _uuid

from django.http import Http404
from django.shortcuts import render


# ── Moliyaviy hisobot qatorlari (PDF blankidagi tartib) ────────────────
# Har qator: (sarlavha, izohda qidiriladigan kalit so'zlar)
# ⚠️ TARTIB MUHIM — birinchi mos kelgani oladi. Shuning uchun aniqroq
# kalit so'zlar (masalan «oval») umumiyroqlaridan («kromka») OLDIN turadi.
FIN_ROWS = [
    ('Plita (Material)',            ['plita', 'pilita', 'ldsp', 'лдсп']),
    ('Oval kromka xizmati',         ['oval', 'toshka zaklad']),
    ('CHiziqli kromka xizmati',     ['chiziqli kromka', 'frenti', 'fasad', 'kromka']),
    ('Zapchast (Furnitura)',        ['zapchast', 'zabchast', 'furnitura']),
    ('Bazis xizmati',               ['bazis', 'kansultant', 'konsultant']),
    ('Rover xizmati',               ['rover', 'toshka']),
    ('Oyna xarajatlari',            ['oyna', 'kargo', 'miyaxki', 'vikodan']),
    # ⚠️ «Ustanovka yol xaqqi xammasi ichida» — ikkala kalit ham bor.
    # Ustanovka ANIQROQ, shuning uchun yo'l haqidan OLDIN tekshiriladi.
    ("USTANOFKA (O'rnatish)",       ['ustanovka', 'ustanofka', "o'rnatish", 'ornatish']),
    ('YOL XAQI (Yetkazib berish)',  ['yol xaq', "yo'l haq", 'yolxaq', 'abed']),
]

# Blankdagi ko'rsatiladigan TARTIB (PDF bo'yicha) — `FIN_ROWS` dagi indeks
DISPLAY_ORDER = [0, 2, 1, 3, 4, 5, 6, 8, 7]


def _match_row(desc, category):
    """Xarajat qaysi qatorga tushishini aniqlaydi. Topilmasa None."""
    d = (desc or '').lower()
    for idx, (_title, keys) in enumerate(FIN_ROWS):
        for k in keys:
            if k in d:
                return idx
    # Kategoriya bo'yicha zaxira moslik
    if category == 'transport':
        return 8                       # yo'l haqi
    if category == 'service':
        return 7                       # ustanovka
    return None


def _money(v):
    """12 400 000 — o'zbekcha uch xonali bo'sh joy bilan."""
    try:
        return f"{int(round(float(v or 0))):,}".replace(',', '\u00a0')
    except (TypeError, ValueError):
        return ''


def contract_print(request, username, order_id):
    """GET /mini/<username>/orders/<id>/contract/ — shartnoma varaqasi."""
    from client_erp.models import (ClientOrder, ClientFinanceRecord,
                                   ClientOrderStage, ClientOrderStageItem,
                                   ClientOrderProfitShare)
    # ⚠️ `.using(db)` ISHLATILMAYDI — mavjud `order_print.py` kabi router
    # tenant'ni o'zi hal qiladi (middleware `_thread_local.db_alias` ni
    # o'rnatib qo'yadi). Aniq alias berish `default` bazaga tushirib
    # yuborardi va 404 chiqardi.
    user = getattr(request, 'client_user', None)
    if user is None or user.username != username:
        raise Http404()
    try:
        order = ClientOrder.objects.select_related(
            'customer', 'stage_template').get(pk=order_id, owner=user, is_deleted=False)
    except ClientOrder.DoesNotExist:
        raise Http404()

    # ── QR uchun mijoz havolasi (yo'q bo'lsa YARATILADI) ──────────────
    if not order.share_uuid:
        order.share_uuid = _uuid.uuid4()
        order.save(update_fields=['share_uuid'])
    host = request.get_host()
    prefix = '' if host.split(':')[0].lower().startswith('usta.') else '/mini'
    share_url = f"{request.scheme}://{host}{prefix}/{order.share_uuid}/"

    # ── MOLIYAVIY HISOBOT ─────────────────────────────────────────────
    exp = list(ClientFinanceRecord.objects.filter(
        order=order, is_deleted=False, record_type='expense'))

    # ⚠️ «Zaklad» — MIJOZ HAQIQATAN bergan pul. `order.total_income`
    # ishlatilmaydi: shartnoma-asosli hisobda u shartnoma summasiga
    # tenglashib qolishi mumkin (jonli tekshiruvda #308 da shunday bo'ldi).
    from django.db.models import Sum as _Sum
    zaklad = ClientFinanceRecord.objects.filter(
        order=order, is_deleted=False, record_type='income',
        is_reversal=False).aggregate(s=_Sum('amount'))['s'] or 0
    sums = [0] * len(FIN_ROWS)
    other = 0                              # «Ko'zda tutilmagan»
    for r in exp:
        i = _match_row(r.description, r.category)
        if i is None:
            other += float(r.amount)
        else:
            sums[i] += float(r.amount)

    fin_rows = [{'title': FIN_ROWS[i][0],
                 'amount': sums[i] or None,
                 'fmt': _money(sums[i]) if sums[i] else ''}
                for i in DISPLAY_ORDER]
    fin_rows.append({'title': "Ko'zda tutilmagan xarajatlar",
                     'amount': other or None,
                     'fmt': _money(other) if other else ''})

    total_expense = float(order.total_expense or 0)
    computed = sum(sums) + other
    # ⚠️ Tekshiruv: taqsimlash yig'indisi jamiga TENG bo'lishi shart
    mismatch = abs(computed - total_expense) > 1

    # ── MAS'ULLAR VA ULUSHLAR ─────────────────────────────────────────
    shares = []
    for p in ClientOrderProfitShare.objects.filter(
            order=order).select_related('user'):
        nm = (p.user.username if p.user_id else '') or getattr(p, 'name', '') or '—'
        shares.append({'name': nm, 'role': getattr(p, 'role', '') or '',
                       'percent': float(p.percent or 0)})
    while len(shares) < 3:                 # blankda 3 qator bo'sh turadi
        shares.append({'name': '', 'role': '', 'percent': None})

    # ── ISHLAB CHIQARISH BOSQICHLARI — DINAMIK ────────────────────────
    # Zakazning HAQIQIY bosqichlari olinadi (ular tanlangan shablondan
    # yaratilgan). Shablon o'zgarsa — bu ro'yxat ham o'zgaradi.
    stages = []
    for s in ClientOrderStage.objects.filter(
            order=order).order_by('sort_order'):
        items = list(ClientOrderStageItem.objects
                     .filter(stage=s).order_by('sort_order'))
        stages.append({
            'title': s.title, 'icon': s.icon,
            'items': [{'title': it.title, 'done': it.is_done} for it in items],
        })

    return render(request, 'client_erp/contract_print.html', {
        'order': order,
        'customer': order.customer,
        'share_url': share_url,
        'fin_rows': fin_rows,
        'total_expense': total_expense,
        'mismatch': mismatch,
        'shares': shares,
        'stages': stages,
        'template_name': (order.stage_template.name
                          if order.stage_template_id else ''),
        'v_contract': _money(order.contract_amount),
        'v_income': _money(zaklad),
        'v_expense': _money(total_expense),
        'v_profit': _money(order.contract_profit),
    })
