"""client_erp/models/expense_share.py — RASXODNI SHERIKLAR ORASIDA BO'LISH.

TZ: `TZ-Zakaz-Ochishda-Foiz-va-Rasxod-Ulushi.md` §F3 (2026-08-15).

Talab: «kiritilgan foizga qarab rasxod va foyda bo'linadi», rasxod esa
**haqiqatda** — ya'ni har kim o'z ulushini to'laydi.

NEGA BITTA RASXOD YOZUVI + QARZ, N TA YOZUV EMAS:
pul fizik ravishda BITTA odamning cho'ntagidan chiqadi. Agar rasxod N ta
kassaga bo'lib yozilsa, hech kim to'lamagan pul kassadan chiqqan bo'lib
ko'rinadi va balans yolg'on bo'lardi. Shuning uchun:

  • `ClientFinanceRecord` — to'lovchining kassasidan TO'LIQ summa (bitta yozuv)
  • `ClientOrderExpenseShare` — har sherikning ulushi (kim qancha ko'targan)
  • to'lamaganlarga → `ClientSupplierDebt` (Ustalar qarzi) avtomatik qarz

ADDITIVE: mavjud moliya hisoblari (`total_expense`, foyda, kassa) shu
modeldan HECH NARSA o'qimaydi — ular avvalgidek `ClientFinanceRecord`ga
tayanadi. Ya'ni eski raqamlar o'zgarmaydi.
"""
from django.db import models


class ClientOrderExpenseShare(models.Model):
    """Bitta rasxod yozuvining bitta sherikka to'g'ri keladigan ulushi."""

    record = models.ForeignKey('client_erp.ClientFinanceRecord',
                               on_delete=models.CASCADE, related_name='expense_shares')
    order = models.ForeignKey('client_erp.ClientOrder',
                              on_delete=models.CASCADE, related_name='expense_shares')
    # Sherik ro'yxatdan o'tmagan bo'lishi mumkin (erkin matnli ulush qatori) —
    # o'shanda `user` bo'sh, faqat `name` qoladi va qarz yozilmaydi.
    user = models.ForeignKey('client_erp.ClientUser', null=True, blank=True,
                             on_delete=models.SET_NULL, related_name='expense_shares')
    name = models.CharField(max_length=100)
    # Yozilgan paytdagi foiz — SNAPSHOT. Keyin foiz o'zgarsa eski rasxod
    # ulushi o'zgarmaydi (aks holda to'langan qarz raqami «jonli» bo'lib ketardi).
    percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    is_payer = models.BooleanField(default=False, verbose_name="Pulni fizik to'lagan")
    # To'lamaganlar uchun ochilgan qarz (Ustalar qarzi bloki)
    debt = models.ForeignKey('client_erp.ClientSupplierDebt', null=True, blank=True,
                             on_delete=models.SET_NULL, related_name='expense_shares')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at', 'id']
        indexes = [models.Index(fields=['order', 'user'])]

    def __str__(self):
        return f"{self.name} {self.percent}% = {self.amount}"
