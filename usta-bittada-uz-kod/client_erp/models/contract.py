"""client_erp/models/contract.py — Mijoz portali: raqamli shartnoma (link + tasdiqlash)."""
import uuid as _uuid
from django.db import models


class ClientContract(models.Model):
    """Mijozga link/QR orqali yuboriladigan shartnoma. O'CHIRISH FUNKSIYASI ATAYLAB YO'Q."""
    uuid = models.UUIDField(default=_uuid.uuid4, editable=False, unique=True, db_index=True)
    order = models.ForeignKey('client_erp.ClientOrder', on_delete=models.CASCADE, related_name='contracts')

    contract_amount = models.DecimalField(max_digits=20, decimal_places=2)
    terms_text = models.TextField(blank=True, default='')

    STATUS_CHOICES = [
        ('sent', 'Mijozga yuborilgan'),
        ('confirmed', 'Mijoz tasdiqladi'),
        ('rejected', 'Mijoz rad etdi'),
        ('cancelled', 'Bekor qilingan'),
    ]
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='sent')

    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_ip = models.GenericIPAddressField(null=True, blank=True)

    rejected_at = models.DateTimeField(null=True, blank=True)
    rejected_ip = models.GenericIPAddressField(null=True, blank=True)
    rejection_note = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        'client_erp.ClientUser', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='created_contracts',
    )

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']
        verbose_name = "Mijoz shartnomasi"
        verbose_name_plural = "Mijoz shartnomalari"

    def __str__(self):
        return f"Shartnoma #{self.pk} — {self.order.title} ({self.get_status_display()})"
