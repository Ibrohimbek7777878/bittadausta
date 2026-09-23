"""client_erp/models/supplier_debt.py — USTANING QARZI (kreditor).

TZ-Moliya-Qayta-Qurish-2026-08-15.md §F4. Qo'lyozmadagi «Жами кредитор
қарзлар» shu modelning yig'indisi.

MUHIM FARQ: mavjud `ClientDebt` — MIJOZ bizga qarzdor (debitor).
Bu model — BIZ boshqaga qarzdormiz (do'kon, ustanovchik, shaxs) — kreditor.
Ikkalasi boshqa-boshqa yo'nalish, shuning uchun alohida model.

BUTUNLAY YANGI, ADDITIVE — mavjud moliya yozuvlariga (`ClientFinanceRecord`)
tegmaydi, kassa/balansga ta'sir qilmaydi (faqat ko'rsatiladi).
"""
from django.db import models


class ClientSupplierDebt(models.Model):
    """Usta kimdandir olgan qarz — do'kon / ustanovchik / shaxs."""

    CREDITOR_TYPES = [
        ('dokon', "Do'kon"),
        ('ustanovchik', 'Ustanovchik'),
        ('shaxs', 'Shaxs'),
        ('boshqa', 'Boshqa'),
    ]

    owner = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE,
                              related_name='supplier_debts')
    creditor_name = models.CharField(max_length=150)
    creditor_type = models.CharField(max_length=20, choices=CREDITOR_TYPES, default='dokon')
    # Ixtiyoriy — qaysi buyurtma uchun olingan (bog'lanmasa ham bo'ladi)
    order = models.ForeignKey('client_erp.ClientOrder', on_delete=models.SET_NULL,
                              null=True, blank=True, related_name='supplier_debts')
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # «Nima uchun qarz olingan» — UI da MAJBURIY (2026-08-15 talabi).
    note = models.CharField(max_length=255, blank=True, default='')
    # «Qachon olingan» — qo'lda tanlanadi (eski qarzni ham kiritish mumkin).
    # `created_at` yozuv YARATILGAN vaqti, bu esa qarz OLINGAN sana — ikkisi
    # boshqa-boshqa narsa (eski qarz bugun kiritilishi mumkin).
    taken_date = models.DateField(null=True, blank=True, verbose_name='Qachon olingan')
    due_date = models.DateField(null=True, blank=True)
    is_closed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']

    @property
    def remaining(self):
        return (self.amount or 0) - (self.paid or 0)

    def __str__(self):
        return f"{self.creditor_name}: {self.remaining}"
