"""client_erp/models/portfolio.py — Portfolio + Notification + Achievement."""
from django.db import models


class ClientPortfolioItem(models.Model):
    """Mebelchining portfolio — panoramalar, loyihalar."""
    owner = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='portfolio_items')
    ITEM_TYPES = [('panorama', '360° Panorama'), ('photo', 'Foto'), ('project', 'Loyiha')]
    item_type = models.CharField(max_length=10, choices=ITEM_TYPES, default='photo')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    mebelcity_order_id = models.IntegerField(null=True, blank=True)
    images = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']


class ClientNotification(models.Model):
    """Bildirishnoma."""
    user = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='notifications')
    CHANNELS = [('telegram', 'Telegram'), ('push', 'Push'), ('sms', 'SMS'), ('in_app', 'Tizim')]
    TYPES = [
        ('order_status', 'Buyurtma holati'), ('debt_reminder', 'Qarz eslatma'),
        ('deadline_warning', 'Muddat'), ('mebelcity_update', 'MebelCity'),
        ('daily_report', 'Kundalik'), ('weekly_report', 'Haftalik'),
        ('achievement', 'Yutuq'), ('promo', 'Aksiya'), ('custom', 'Boshqa'),
    ]
    channel = models.CharField(max_length=10, choices=CHANNELS, default='in_app')
    notification_type = models.CharField(max_length=20, choices=TYPES, default='custom')
    title = models.CharField(max_length=200)
    message = models.TextField()

    # ── Ko'zga tashlanadigan bildirishnoma (2026-08-04) ──────────────────────
    # Ilgari faqat title+message bor edi — foydalanuvchi «ko'rinmayapti,
    # summa ham yo'q» dedi. Endi summa ALOHIDA katta shrift bilan chiqadi,
    # `link` esa bosilganda qayerga o'tishini belgilaydi (masalan '/finance').
    amount = models.DecimalField(
        max_digits=20, decimal_places=2, null=True, blank=True,
        verbose_name="Summa (kartada katta ko'rsatiladi)")
    link = models.CharField(
        max_length=120, blank=True, default='',
        verbose_name="Bosilganda o'tadigan sahifa (SPA yo'li)")
    icon = models.CharField(max_length=8, blank=True, default='',
                            verbose_name="Ikonka (emoji)")

    is_sent = models.BooleanField(default=False)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']


class ClientAchievement(models.Model):
    """Yutuq turi."""
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    icon = models.CharField(max_length=10, default='🏆')
    description = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        app_label = 'client_erp'

    def __str__(self):
        return f"{self.icon} {self.name}"


class ClientUserAchievement(models.Model):
    """Foydalanuvchi yutug'i."""
    user = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='achievements')
    achievement = models.ForeignKey(ClientAchievement, on_delete=models.CASCADE)
    earned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        unique_together = ('user', 'achievement')


class ClientVIPLevel(models.Model):
    """VIP daraja — 5 bosqichli status tizimi."""
    level_number = models.IntegerField(default=1, verbose_name="Daraja raqami (1-5)")
    name = models.CharField(max_length=50)
    min_orders = models.IntegerField(default=0, verbose_name="Min buyurtmalar soni")
    min_amount = models.DecimalField(max_digits=20, decimal_places=2, default=0, verbose_name="Min summa (eski)")
    min_turnover = models.DecimalField(
        max_digits=20, decimal_places=2, default=0,
        verbose_name="Yillik min aylanma (UZS)",
    )
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0, verbose_name="Chegirma %")
    cashback_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    referral_commission = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        verbose_name="Tavsiya komissiyasi %",
    )
    color = models.CharField(max_length=20, default='#cd7f32', verbose_name="Rang (HEX)")
    badge_icon = models.CharField(max_length=10, default='⭐', verbose_name="Emoji")
    badge_image = models.ImageField(
        upload_to='client_erp/badges/', null=True, blank=True,
        verbose_name="Karta dizayn rasmi",
    )
    description = models.TextField(blank=True, default='', verbose_name="Imtiyozlar tavsifi")
    auto_promote = models.BooleanField(default=True, verbose_name="Avtomatik ko'tarilish")
    require_admin_approval = models.BooleanField(
        default=False, verbose_name="Admin tasdiqlashi kerak",
    )
    downgrade_after_months = models.IntegerField(
        default=6, verbose_name="Faolsizlikdan keyin pasaytirish (oy)",
    )

    class Meta:
        app_label = 'client_erp'
        ordering = ['level_number']

    def __str__(self):
        return f"{self.badge_icon} {self.name}"
