"""
client_erp/models/plan.py — Tarif (obuna) modellari.

ClientPlan          — tarif paketi (admin yaratadi: Bepul/Start/Biznes/Premium)
ClientSubscription  — foydalanuvchi obunasi (tarix + joriy holat)
"""
from django.db import models


# ═══════════════════════════════════════════════════════════════════
#  TARIF PAKETI
# ═══════════════════════════════════════════════════════════════════

class ClientPlan(models.Model):
    """Mini ERP tarif paketi — admin yaratadi va boshqaradi."""
    name = models.CharField(max_length=100, verbose_name="Nomi")
    slug = models.SlugField(unique=True, verbose_name="Slug")
    price_uzs = models.BigIntegerField(default=0, verbose_name="Narx (UZS)")
    period_days = models.IntegerField(default=30, verbose_name="Davr (kun)")
    coin_grant = models.IntegerField(default=0, verbose_name="Har davrda beriladigan tanga")
    feature_keys = models.JSONField(
        default=list, blank=True,
        verbose_name="Ruxsat etilgan feature kalitlari",
        help_text="Bo'sh = hammasi ruxsat etilgan",
    )
    limits = models.JSONField(
        default=dict, blank=True,
        verbose_name="Miqdoriy limitlar",
        help_text="{limit_kaliti: son}. Kalit yo'q yoki manfiy (-1) = CHEKSIZ. "
                  "Masalan {'orders_month': 15, 'customers': 50, 'team_members': 1}",
    )
    ai_included = models.BooleanField(default=False, verbose_name="AI kiritilgan")
    is_free = models.BooleanField(
        default=False,
        verbose_name="Standart (bepul) tarif",
        help_text="Login uchun default tarif — faqat bittasi bo'lishi kerak",
    )
    is_active = models.BooleanField(default=True, verbose_name="Faol")
    sort = models.IntegerField(default=0, verbose_name="Tartib")
    color = models.CharField(max_length=20, blank=True, default='', verbose_name="Rang")
    icon = models.CharField(max_length=20, blank=True, default='', verbose_name="Emoji/Ikonka")
    description = models.TextField(blank=True, default='', verbose_name="Tavsif")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['sort', 'id']
        verbose_name = "Mini ERP Tarif"
        verbose_name_plural = "Mini ERP Tariflar"

    def __str__(self):
        return f"{self.name} ({self.price_uzs} UZS)"


# ═══════════════════════════════════════════════════════════════════
#  OBUNA (TARIX + JORIY)
# ═══════════════════════════════════════════════════════════════════

class ClientSubscription(models.Model):
    """Foydalanuvchi obunasi — tarix va joriy holat."""

    class Status(models.TextChoices):
        TRIAL = 'trial', 'Sinov'
        ACTIVE = 'active', 'Faol'
        EXPIRED = 'expired', 'Muddati tugagan'
        CANCELLED = 'cancelled', 'Bekor qilingan'

    user = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE,
        related_name='subscriptions', verbose_name="Foydalanuvchi",
    )
    plan = models.ForeignKey(
        'client_erp.ClientPlan', on_delete=models.PROTECT,
        related_name='subscriptions', verbose_name="Tarif",
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE,
        verbose_name="Holat",
    )
    period_start = models.DateTimeField(verbose_name="Davr boshi")
    period_end = models.DateTimeField(verbose_name="Davr oxiri")
    source = models.CharField(
        max_length=50, blank=True, default='',
        verbose_name="Manba",
        help_text="'admin' | 'trial' | to'lov id",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']
        verbose_name = "Mini ERP Obuna"
        verbose_name_plural = "Mini ERP Obunalar"

    def __str__(self):
        return f"{self.user_id} → {self.plan_id} [{self.status}]"
