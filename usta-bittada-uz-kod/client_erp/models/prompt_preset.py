"""client_erp/models/prompt_preset.py — AI-rasm tayyor promptlar kutubxonasi."""
from django.db import models


class PromptPreset(models.Model):
    """Xodim bosishi bilan AI tahrirlash oynasiga to'ladigan tayyor prompt."""
    title = models.CharField(max_length=200, verbose_name="Nomi")
    prompt_text = models.TextField(verbose_name="Prompt matni")
    CATEGORY_CHOICES = [
        ('color', 'Rang'),
        ('product', 'Mahsulot'),
        ('style', 'Uslub (umumiy, panelda tugma sifatida ko\'rinadi)'),
        ('other', 'Boshqa'),
    ]
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_base = models.BooleanField(
        default=False, verbose_name="Umumiy standart instruksiya",
        help_text="Belgilansa — tugma sifatida ko'rinmaydi, lekin matni HAR BIR "
                   "AI so'roviga (tugma orqalimi, o'zi yozganmi) avtomatik qo'shiladi.",
    )
    # Eng ko'p sotilgan mahsulotdan avtomatik yaratilgan bo'lsa — manba nomi (audit uchun)
    source_product_name = models.CharField(max_length=500, blank=True, default='')
    created_by = models.ForeignKey(
        'client_erp.ClientUser', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='prompt_presets',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['category', 'sort_order', 'id']
        verbose_name = "AI prompt preset"
        verbose_name_plural = "AI prompt presetlar"

    def __str__(self):
        return self.title
