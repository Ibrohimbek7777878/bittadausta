"""client_erp/services/expense_split.py — rasxodni sheriklar ulushiga bo'lish.

TZ: `TZ-Zakaz-Ochishda-Foiz-va-Rasxod-Ulushi.md` §F3 (2026-08-15).

Bitta kirish nuqtasi: `split_expense(record, payer)`.

QAT'IY CHEGARA — bu modul MAVJUD MOLIYAGA TEGMAYDI:
  • `ClientFinanceRecord` yaratmaydi/o'zgartirmaydi (kassa, balans, foyda
    hisoblari avvalgidek qoladi)
  • faqat `ClientOrderExpenseShare` (kim qancha ko'tardi) va to'lamaganlar
    uchun `ClientSupplierDebt` (Ustalar qarzi) yozadi
  • Ustalar qarzi kassaga qo'shilmaydi — bu §M1 da o'rnatilgan qoida
"""
from decimal import Decimal


def is_shared(order):
    """Buyurtma sherikli — ya'ni foyda ulushi 2+ odamga bo'linganmi."""
    from client_erp.models.team import ClientOrderProfitShare
    return ClientOrderProfitShare.objects.filter(order=order).count() >= 2


def split_expense(record, payer=None):
    """Rasxodni foyda-foizlariga qarab sheriklar orasida bo'ladi.

    `record` — allaqachon yaratilgan `ClientFinanceRecord` (expense).
    `payer`  — pulni fizik to'lagan `ClientUser` (bo'sh bo'lsa: yozuv egasi).

    Qaytaradi: yaratilgan `ClientOrderExpenseShare` ro'yxati (bo'sh bo'lishi
    mumkin — sherik yo'q bo'lsa hech narsa qilinmaydi).
    """
    from client_erp.models import ClientOrderExpenseShare, ClientSupplierDebt
    from client_erp.models.team import ClientOrderProfitShare

    order = record.order
    if order is None:
        return []
    shares = list(ClientOrderProfitShare.objects.filter(order=order).order_by('sort_order', 'id'))
    if len(shares) < 2:
        return []                       # yolg'iz zakaz — bo'lish shart emas

    payer = payer or record.owner
    total = Decimal(str(record.amount or 0))
    if total <= 0:
        return []

    # Yaxlitlash farqi to'lovchida qolsin (jami AYNAN `total` bo'lishi shart).
    rows, assigned = [], Decimal('0')
    for i, sh in enumerate(shares):
        pct = Decimal(str(sh.percent or 0))
        if i == len(shares) - 1:
            amt = total - assigned
        else:
            amt = (total * pct / Decimal('100')).quantize(Decimal('1'))
            assigned += amt
        rows.append((sh, pct, amt))

    out = []
    for sh, pct, amt in rows:
        # ── EGASI QATORI (2026-08-15 tuzatildi) ──────────────────────────
        # «🧑‍💼 Men (buyurtma egasi)» qatorida `user_id` ATAYLAB bo'sh
        # (`profit.save` uni null yuboradi). Ilgari shu sabab sherik pul
        # to'laganda EGASIGA qarz yozilmasdi — jonli sinovda topildi.
        uid = sh.user_id
        if uid is None and (sh.is_remainder or 'buyurtma egasi' in (sh.name or '')):
            uid = order.owner_id

        is_payer = bool(uid and uid == payer.pk)
        debt = None
        # To'lamagan sherik → to'lovchiga qarzdor bo'ladi (Ustalar qarzi).
        # Ro'yxatdan o'tmagan (`uid` yo'q) ulush qatoriga qarz yozib
        # bo'lmaydi — u faqat hisobotda ulush sifatida qoladi.
        if not is_payer and uid and amt > 0:
            debt = ClientSupplierDebt.objects.create(
                owner_id=uid,
                creditor_name=(getattr(payer, 'full_name', '') or payer.username or '—')[:150],
                creditor_type='shaxs',
                order=order,
                amount=amt,
                note=f"Rasxod ulushi ({pct}%) — {(record.description or 'chiqim')[:80]}"[:255],
            )
        out.append(ClientOrderExpenseShare(
            record=record, order=order, user_id=uid,
            name=sh.name or '—', percent=pct, amount=amt,
            is_payer=is_payer, debt=debt,
        ))
    ClientOrderExpenseShare.objects.bulk_create(out)
    return out


def unsplit_expense(record):
    """Rasxod qaytarilganda/o'chirilganda — ulushlar va avtomatik qarzlarni olib tashlaydi.

    Qarz to'liq yoki qisman TO'LANGAN bo'lsa o'chirilmaydi (pul allaqachon
    harakat qilgan) — faqat yopiladi va izohiga sabab yoziladi.
    """
    from client_erp.models import ClientOrderExpenseShare, ClientSupplierDebt

    rows = list(ClientOrderExpenseShare.objects.filter(record=record))
    if not rows:
        return 0
    debt_ids = [r.debt_id for r in rows if r.debt_id]
    if debt_ids:
        for d in ClientSupplierDebt.objects.filter(pk__in=debt_ids):
            if (d.paid or 0) > 0:
                d.is_closed = True
                d.note = (d.note + ' · rasxod qaytarildi')[:255]
                d.save(update_fields=['is_closed', 'note'])
            else:
                ClientSupplierDebt.objects.filter(pk=d.pk).delete()
    ClientOrderExpenseShare.objects.filter(record=record).delete()
    return len(rows)
