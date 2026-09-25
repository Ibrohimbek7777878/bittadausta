"""client_erp/models/zamer.py — Erkin zamer."""
from django.db import models


class ClientZamer(models.Model):
    """Mebelchining erkin zameri."""
    owner = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='zamers')
    customer = models.ForeignKey('client_erp.ClientCustomer', null=True, blank=True, on_delete=models.SET_NULL, related_name='zamers')
    order = models.ForeignKey('client_erp.ClientOrder', null=True, blank=True, on_delete=models.SET_NULL, related_name='zamers')

    title = models.CharField(max_length=200)
    note = models.TextField(blank=True, default='')
    photos = models.JSONField(default=list, blank=True)

    # MebelCity zameriga bog'lash
    mebelcity_zamer_id = models.IntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class ClientZamerRoom(models.Model):
    """Xona o'lchamlari."""
    zamer = models.ForeignKey(ClientZamer, on_delete=models.CASCADE, related_name='rooms')
    room_name = models.CharField(max_length=100)
    width = models.IntegerField(default=0)
    height = models.IntegerField(default=0)
    depth = models.IntegerField(default=0)

    class Meta:
        app_label = 'client_erp'


class ClientZamerItem(models.Model):
    """Xona ichidagi element."""
    room = models.ForeignKey(ClientZamerRoom, on_delete=models.CASCADE, related_name='items')
    ITEM_TYPES = [('door', 'Eshik'), ('window', 'Deraza'), ('column', 'Ustun'), ('pipe', 'Quvur'), ('socket', 'Rozetka'), ('other', 'Boshqa')]
    item_type = models.CharField(max_length=10, choices=ITEM_TYPES, default='other')
    x = models.IntegerField(default=0)
    y = models.IntegerField(default=0)
    width = models.IntegerField(default=0)
    height = models.IntegerField(default=0)
    note = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        app_label = 'client_erp'
