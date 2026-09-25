"""client_erp/models/permission.py — Buyurtma ruxsatlari."""
from django.db import models


class ClientOrderPermission(models.Model):
    """Boshqa foydalanuvchiga buyurtmaga ruxsat."""
    order = models.ForeignKey(
        'client_erp.ClientOrder', on_delete=models.CASCADE, related_name='permissions',
    )
    user = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE, related_name='order_permissions',
    )
    ROLE_CHOICES = [
        ('viewer', "Ko'ruvchi"),
        ('worker', 'Ishchi'),
        ('manager', 'Menejer'),
    ]
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='worker')
    stages = models.ManyToManyField(
        'client_erp.ClientOrderStage', blank=True, related_name='permitted_users',
    )
    can_add_expense = models.BooleanField(default=False)
    can_complete_stage = models.BooleanField(default=True)
    # 💰 Pul ko'rinadimi — False bo'lsa server-side barcha moliyaviy maydonlar
    # (kirim/chiqim/foyda/shartnoma summasi/tranzaksiyalar) yashiriladi.
    # Default: mavjud manager'lar uchun True (migration 0024 data-migration).
    can_see_money = models.BooleanField(default=False, verbose_name="Pul ko'rinadi")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        unique_together = [('order', 'user')]

    def __str__(self):
        return f"{self.user} → {self.order} ({self.role})"
