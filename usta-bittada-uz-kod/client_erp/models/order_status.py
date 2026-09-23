"""client_erp/models/order_status.py — Admin boshqaradigan buyurtma statuslari."""
from django.db import models

# Tizim kalitlari — bularga kod ichida (portal.py, consumers.py, order.py) real mantiq bog'langan.
# Admin bularning NOMI/RANGI/TARTIBI/ko'rinishini o'zgartira oladi, lekin key'ini o'chira olmaydi.
SYSTEM_KEYS = ['new', 'in_progress', 'at_mebelcity', 'ready', 'delivered', 'cancelled']


class ClientOrderStatusDef(models.Model):
    """Buyurtma statusi ta'rifi — admin panel orqali boshqariladi."""
    key = models.SlugField(max_length=30, unique=True)
    label = models.CharField(max_length=50)
    color = models.CharField(max_length=7, default='#6366f1')
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True, verbose_name="Filterda ko'rinadimi")
    is_system = models.BooleanField(default=False, verbose_name="Tizim statusi (key o'zgarmas)")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['sort_order', 'id']
        verbose_name = "Buyurtma statusi"
        verbose_name_plural = "Buyurtma statuslari"

    def __str__(self):
        return self.label
