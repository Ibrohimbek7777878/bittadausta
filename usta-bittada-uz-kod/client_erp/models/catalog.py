"""client_erp/models/catalog.py — Mini ERP "Mahsulotlar" vitrinasi.

Katta ERP (products.Product) haqiqiy xomashyo/mahsulot katalogidan eng ko'p
sotilgan/trend 50 tasi shu jadvalda saqlanadi (haftalik avtomatik yangilanadi
— refresh_featured_products management command). Mijozga faqat shu 50 ta
ko'rsatiladi, butun 17000+ katalogga emas."""
from django.db import models


class ClientFeaturedProduct(models.Model):
    product = models.ForeignKey(
        'products.Product', on_delete=models.CASCADE, related_name='featured_entries',
    )
    added_at = models.DateTimeField(auto_now_add=True)
    sold_qty_30d = models.DecimalField(
        max_digits=18, decimal_places=4, default=0,
        help_text="Tanlangan paytdagi so'nggi 30 kunlik sotuv miqdori (ma'lumot uchun)",
    )

    class Meta:
        app_label = 'client_erp'
        ordering = ['added_at']
        verbose_name = "Vitrina mahsuloti"
        verbose_name_plural = "Vitrina mahsulotlari"
