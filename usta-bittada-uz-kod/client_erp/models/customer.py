"""client_erp/models/customer.py — Mebelchining o'z mijozi."""
from django.db import models


class ClientCustomer(models.Model):
    """B2B mijozning oxirgi mijozi (uy egasi)."""
    owner = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='customers')
    full_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, blank=True, default='')
    phone2 = models.CharField(max_length=20, blank=True, default='')
    address = models.TextField(blank=True, default='')
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']

    def __str__(self):
        return self.full_name
