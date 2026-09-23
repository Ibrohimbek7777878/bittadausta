"""client_erp/services/partner_remove.py — buyurtmadan sherikni chiqarish.

TZ-Moliya-Qayta-Qurish-2026-08-15 §F3 + TZ-Zakaz-Ochishda-Foiz-va-Rasxod-Ulushi.

Foydalanuvchi talabi (aynan):
  «buyurtmadan sherikni chiqarib yuborsa kirim chiqim savdo hammasi qolgan
   odamning o'ziga va analitikasiga yozilishi kerak, chiqarilganlarga esa
   yozilmaydi»

Ya'ni sherik chiqarilgandan keyin o'sha buyurtma bo'yicha unga HECH NARSA
yozilmaydi: na foyda ulushi, na rasxod ulushi, na qarz. Hammasi qolgan
odamniki bo'ladi.

⚠️ BITTA ISTISNO — ALLAQACHON TO'LANGAN QARZ. Pul jismonan harakat qilgan
bo'lsa uni «yo'q» deb bo'lmaydi: bunday qarz o'chirilmaydi, yopiladi va
izohiga sabab yoziladi (audit izi saqlanadi).

Consumer (`handle_order_unshare`) ham, sinov ham SHU funksiyani chaqiradi —
ikki xil mantiq bo'lib ketmasligi uchun.
"""
from decimal import Decimal


def _pct(v):
    """Foizni odam o'qiydigan ko'rinishda: 30.00 → «30», 12.50 → «12.5».

    ⚠️ `Decimal.normalize()` YOLG'IZ ISHLATILMAYDI — u 30.00 ni `3E+1` ga
    aylantirib yuboradi va ekranga «3E+1%» bo'lib chiqadi (2026-08-15 da
    aynan shu xato chiqdi). `format(..., 'f')` ilmiy yozuvni o'chiradi.
    """
    d = Decimal(str(v or 0)).normalize()
    return format(d, 'f')


def remove_partner_team(order, team_id, actor=None, reason=''):
    """`team_id` jamoasi orqali qo'shilgan sheriklarni buyurtmadan chiqaradi.

    `actor`  — kim chiqaryapti (audit uchun)
    `reason` — nega chiqaryapti (audit + bildirishnoma uchun; UI da MAJBURIY)

    Qaytaradi: {'shares': n, 'expense_shares': n, 'debts_deleted': n,
                'debts_closed': n, 'freed_percent': '40.00', 'removed': [...]}
    """
    from client_erp.models import ClientOrderExpenseShare, ClientSupplierDebt
    from client_erp.models.team import (ClientOrderShare, ClientTeamMember,
                                        ClientOrderProfitShare, ClientProfitAudit)

    ClientOrderShare.objects.filter(order=order, team_id=team_id).delete()

    uids = set(ClientTeamMember.objects.filter(team_id=team_id)
               .exclude(user_id=order.owner_id).values_list('user_id', flat=True))
    out = {'shares': 0, 'expense_shares': 0, 'debts_deleted': 0,
           'debts_closed': 0, 'freed_percent': '0', 'removed': []}
    if not uids:
        return out

    # 1) FOYDA ulushi — o'chadi, bo'shagan foiz qolgan odamga o'tadi
    gone = list(ClientOrderProfitShare.objects.filter(order=order, user_id__in=uids))
    freed = sum((Decimal(str(g.percent or 0)) for g in gone), Decimal('0'))

    # ── AUDIT: chiqarishdan OLDIN «unga qancha tegardi» hisoblanadi ───────
    # Keyin hisoblab bo'lmaydi — ulush qatori o'chib ketadi. Jurnal
    # append-only, shuning uchun bu yagona imkoniyat.
    _profit = Decimal('0')
    try:
        _profit = Decimal(str(order.contract_amount or 0)) - Decimal(str(order.total_expense or 0))
    except Exception:
        pass
    for g in gone:
        _amt = (_profit * Decimal(str(g.percent or 0)) / Decimal('100')).quantize(Decimal('1'))
        ClientProfitAudit.objects.create(
            order=order, share_id=g.pk, action=ClientProfitAudit.Action.UNSHARE,
            actor=actor, target_user_id=g.user_id, target_name=(g.name or '')[:200],
            old_value=f"{_pct(g.percent)}% · {int(_amt):,} so'm".replace(',', ' ')[:200],
            new_value='0', reason=(reason or '')[:300],
        )
        out['removed'].append({'user_id': g.user_id, 'name': g.name,
                               'percent': _pct(g.percent), 'amount': str(_amt)})
    if gone:
        ClientOrderProfitShare.objects.filter(pk__in=[g.pk for g in gone]).delete()
        rest = (ClientOrderProfitShare.objects.filter(order=order, is_remainder=True).first()
                or ClientOrderProfitShare.objects.filter(order=order, user_id=order.owner_id).first()
                or ClientOrderProfitShare.objects.filter(order=order).order_by('sort_order', 'id').first())
        if rest and freed:
            rest.percent = Decimal(str(rest.percent or 0)) + freed
            rest.save(update_fields=['percent'])
    out['shares'] = len(gone)
    out['freed_percent'] = str(freed)

    # 2) RASXOD ulushi + undan kelib chiqqan qarz
    ex_rows = list(ClientOrderExpenseShare.objects.filter(order=order, user_id__in=uids))
    debt_ids = [r.debt_id for r in ex_rows if r.debt_id]
    if debt_ids:
        for d in ClientSupplierDebt.objects.filter(pk__in=debt_ids):
            if (d.paid or 0) > 0:
                # Pul allaqachon harakat qilgan — o'chirmaymiz, yopamiz
                d.is_closed = True
                d.note = (d.note + ' · sherik buyurtmadan chiqarildi')[:255]
                d.save(update_fields=['is_closed', 'note'])
                out['debts_closed'] += 1
            else:
                ClientSupplierDebt.objects.filter(pk=d.pk).delete()
                out['debts_deleted'] += 1
    if ex_rows:
        ClientOrderExpenseShare.objects.filter(pk__in=[r.pk for r in ex_rows]).delete()
    out['expense_shares'] = len(ex_rows)

    # 3) Qolgan (to'lovchi) qatorlar endi 100% ko'taradi — rasxod yozuvining
    #    o'zi allaqachon to'lovchining kassasida, shuning uchun summani
    #    o'zgartirish shart emas, faqat foiz/summa yangilanadi.
    from client_erp.models import ClientFinanceRecord
    for rec in ClientFinanceRecord.objects.filter(order=order, record_type='expense',
                                                  is_deleted=False):
        left = list(ClientOrderExpenseShare.objects.filter(record=rec))
        if len(left) == 1:
            r = left[0]
            r.percent = Decimal('100')
            r.amount = Decimal(str(rec.amount or 0))
            r.save(update_fields=['percent', 'amount'])
        elif not left:
            continue

    # 4) BILDIRISHNOMA — egasiga, qolgan sheriklarga va CHIQARILGANNING o'ziga
    try:
        _notify_removed(order, out['removed'], reason)
    except Exception:
        import logging
        logging.getLogger(__name__).warning('sherik-chiqarish bildirishnomasi yuborilmadi',
                                            exc_info=True)
    return out


def _notify_removed(order, removed, reason):
    """«Kim chiqdi + endi foyda qanday bo'linadi» — sodda, 1 tugmali xabar."""
    from client_erp.models import ClientUser
    from client_erp.models.team import ClientOrderProfitShare
    from client_erp.services.notifications import notify_partner_removed

    if not removed:
        return
    rows = list(ClientOrderProfitShare.objects.filter(order=order).order_by('sort_order', 'id'))
    profit = Decimal('0')
    try:
        profit = Decimal(str(order.contract_amount or 0)) - Decimal(str(order.total_expense or 0))
    except Exception:
        pass
    now_split = [{
        'name': r.name,
        'percent': _pct(r.percent),
        'amount': int((profit * Decimal(str(r.percent or 0)) / Decimal('100')).quantize(Decimal('1'))),
    } for r in rows]

    # Kimga yuboriladi: egasi + qolgan ulushdorlar + chiqarilganlar
    uids = {order.owner_id}
    uids |= {r.user_id for r in rows if r.user_id}
    uids |= {r['user_id'] for r in removed if r.get('user_id')}
    for u in ClientUser.objects.filter(pk__in=[x for x in uids if x]):
        notify_partner_removed(u, order, removed, now_split, reason)
