"""
client_erp/models/gamification.py — Gamifikatsiya modellari.

GamificationRule  — XP/tanga qoidalari (admin o'zgartiradi)
Announcement      — reklama, e'lon, aksiya
MonthlyDiscount   — oylik chegirmalar (daraja bo'yicha)
Event             — tadbirat/yig'ilish
EventParticipant  — ishtirokchi
RewardItem        — sovg'alar do'koni
RewardClaim       — sovg'a so'rovi
Quest             — topshiriq (kunlik/haftalik/mavsumiy)
QuestCompletion   — bajarilgan topshiriq
XPTransaction     — XP/tanga tarix (audit trail)
"""
from django.db import models


# ═══════════════════════════════════════════════════════════════════
#  XP / TANGA QOIDALARI
# ═══════════════════════════════════════════════════════════════════

class GamificationRule(models.Model):
    """Admin o'zgartira oladigan ball/tanga qoidasi."""
    code = models.CharField(max_length=50, unique=True, verbose_name="Kod")
    name = models.CharField(max_length=200, verbose_name="Nomi")
    description = models.TextField(blank=True, default='', verbose_name="Tavsif")
    icon = models.CharField(max_length=10, default='⭐', verbose_name="Emoji")

    xp_reward = models.IntegerField(default=0, verbose_name="XP mukofoti")
    coin_reward = models.IntegerField(default=0, verbose_name="Tanga mukofoti")

    is_active = models.BooleanField(default=True, verbose_name="Faol")
    is_repeatable = models.BooleanField(default=True, verbose_name="Takroriy")
    max_per_day = models.IntegerField(
        null=True, blank=True,
        verbose_name="Kuniga maks",
        help_text="0 yoki bo'sh = cheksiz",
    )
    min_level = models.ForeignKey(
        'client_erp.ClientVIPLevel', null=True, blank=True,
        on_delete=models.SET_NULL, verbose_name="Minimal daraja",
    )
    sort_order = models.IntegerField(default=0)

    class Meta:
        app_label = 'client_erp'
        verbose_name = "Gamifikatsiya qoidasi"
        verbose_name_plural = "Gamifikatsiya qoidalari"
        ordering = ['sort_order', 'name']

    def __str__(self):
        return f"{self.icon} {self.name} (+{self.xp_reward} XP, +{self.coin_reward} tanga)"


class XPTransaction(models.Model):
    """XP/tanga tarix — har bir o'zgarish saqlanadi."""
    user = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='xp_transactions')
    rule = models.ForeignKey(GamificationRule, null=True, blank=True, on_delete=models.SET_NULL)
    xp_change = models.IntegerField(default=0)
    coin_change = models.IntegerField(default=0)
    description = models.CharField(max_length=300, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    stage = models.ForeignKey(
        'client_erp.ClientOrderStage', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='xp_transactions',
    )
    order = models.ForeignKey(
        'client_erp.ClientOrder', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='xp_transactions',
    )
    is_reversed = models.BooleanField(default=False)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']


# ═══════════════════════════════════════════════════════════════════
#  E'LONLAR VA AKSIYALAR
# ═══════════════════════════════════════════════════════════════════

class Announcement(models.Model):
    """Reklama, aksiya, chegirma, tadbirat e'loni."""
    TYPES = [
        ('news', 'Yangilik'),
        ('promo', 'Aksiya'),
        ('discount', 'Chegirma'),
        ('event', "Yig'ilish/Tadbirat"),
        ('notification', 'Bildirishnoma'),
    ]
    announcement_type = models.CharField(max_length=20, choices=TYPES, default='news', verbose_name="Turi")
    title = models.CharField(max_length=200, verbose_name="Sarlavha")
    body = models.TextField(verbose_name="Matn")
    image = models.ImageField(upload_to='client_erp/announcements/', null=True, blank=True, verbose_name="Banner rasm")

    # Kimga ko'rinadi
    target_all = models.BooleanField(default=True, verbose_name="Hammaga")
    target_levels = models.ManyToManyField(
        'client_erp.ClientVIPLevel', blank=True,
        related_name='announcements', verbose_name="Faqat shu darajalar",
    )
    target_users = models.ManyToManyField(
        'client_erp.ClientUser', blank=True,
        related_name='targeted_announcements', verbose_name="Faqat shu foydalanuvchilar",
    )

    # Chegirma (agar promo/discount bo'lsa)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name="Chegirma %")
    discount_amount = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True, verbose_name="Chegirma (so'm)")
    discount_code = models.CharField(max_length=50, blank=True, default='', verbose_name="Kupon kodi")

    # Muddat
    start_date = models.DateTimeField(verbose_name="Boshlanish")
    end_date = models.DateTimeField(null=True, blank=True, verbose_name="Tugash")

    # Holat
    is_active = models.BooleanField(default=True, verbose_name="Faol")
    is_pinned = models.BooleanField(default=False, verbose_name="Tepaga qadash")

    # Telegram
    send_telegram = models.BooleanField(default=False, verbose_name="Telegram ga yuborish")
    telegram_sent = models.BooleanField(default=False, verbose_name="Yuborildi")

    created_by = models.ForeignKey(
        'dashboard.CustomUser', null=True, blank=True,
        on_delete=models.SET_NULL, verbose_name="Yaratgan",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        verbose_name = "E'lon"
        verbose_name_plural = "E'lonlar"
        ordering = ['-is_pinned', '-created_at']

    def __str__(self):
        return f"[{self.get_announcement_type_display()}] {self.title}"


# ═══════════════════════════════════════════════════════════════════
#  OYLIK CHEGIRMALAR
# ═══════════════════════════════════════════════════════════════════

class MonthlyDiscount(models.Model):
    """Har oy daraja bo'yicha chegirma."""
    month = models.DateField(verbose_name="Oy (1-kuni)")
    vip_level = models.ForeignKey(
        'client_erp.ClientVIPLevel', on_delete=models.CASCADE,
        related_name='monthly_discounts', verbose_name="Daraja",
    )
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, verbose_name="Chegirma %")
    bonus_coins = models.IntegerField(default=0, verbose_name="Qo'shimcha tanga")
    note = models.CharField(max_length=200, blank=True, default='', verbose_name="Izoh")
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        'dashboard.CustomUser', null=True, blank=True,
        on_delete=models.SET_NULL,
    )

    class Meta:
        app_label = 'client_erp'
        verbose_name = "Oylik chegirma"
        verbose_name_plural = "Oylik chegirmalar"
        unique_together = ('month', 'vip_level')
        ordering = ['-month', 'vip_level']


# ═══════════════════════════════════════════════════════════════════
#  TADBIRATLAR
# ═══════════════════════════════════════════════════════════════════

class Event(models.Model):
    """Tadbirat / yig'ilish."""
    title = models.CharField(max_length=200, verbose_name="Nomi")
    description = models.TextField(blank=True, default='', verbose_name="Tavsif")
    image = models.ImageField(upload_to='client_erp/events/', null=True, blank=True)

    event_date = models.DateTimeField(verbose_name="Sana va vaqt")
    location = models.CharField(max_length=300, blank=True, default='', verbose_name="Joy")
    location_url = models.URLField(blank=True, default='', verbose_name="Xarita havolasi")

    max_participants = models.IntegerField(default=0, verbose_name="Maks ishtirokchilar (0=cheksiz)")
    xp_reward = models.IntegerField(default=500, verbose_name="Ishtirok uchun XP")
    coin_reward = models.IntegerField(default=150, verbose_name="Ishtirok uchun tanga")

    # Kimga
    target_all = models.BooleanField(default=True, verbose_name="Hammaga")
    target_levels = models.ManyToManyField(
        'client_erp.ClientVIPLevel', blank=True,
        related_name='events', verbose_name="Faqat shu darajalar",
    )

    # QR
    qr_code = models.CharField(max_length=50, unique=True, blank=True, verbose_name="QR kod")

    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        'dashboard.CustomUser', null=True, blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        verbose_name = "Tadbirat"
        verbose_name_plural = "Tadbiratlar"
        ordering = ['-event_date']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.qr_code:
            import random, string
            self.qr_code = 'EVT-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        super().save(*args, **kwargs)


class EventParticipant(models.Model):
    """Tadbirat ishtirokchisi."""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='participants')
    user = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='event_participations')
    registered_at = models.DateTimeField(auto_now_add=True)
    attended = models.BooleanField(default=False, verbose_name="Keldi (QR tasdiqlangan)")
    attended_at = models.DateTimeField(null=True, blank=True)
    xp_awarded = models.BooleanField(default=False)

    class Meta:
        app_label = 'client_erp'
        unique_together = ('event', 'user')


# ═══════════════════════════════════════════════════════════════════
#  SOVG'ALAR DO'KONI
# ═══════════════════════════════════════════════════════════════════

class RewardItem(models.Model):
    """Sovg'alar do'konidagi element."""
    TYPES = [
        ('coupon', 'Chegirma kuponi'),
        ('delivery', 'Bepul yetkazish'),
        ('gift', "Jismoniy sovg'a"),
        ('service', 'Bepul xizmat'),
    ]
    name = models.CharField(max_length=200, verbose_name="Nomi")
    description = models.TextField(blank=True, default='')
    image = models.ImageField(upload_to='client_erp/rewards/', null=True, blank=True)
    reward_type = models.CharField(max_length=20, choices=TYPES, default='coupon')
    coin_price = models.IntegerField(verbose_name="Tanga narxi")
    discount_value = models.DecimalField(
        max_digits=20, decimal_places=2, null=True, blank=True,
        verbose_name="Kupon qiymati (so'm)",
    )
    min_level = models.ForeignKey(
        'client_erp.ClientVIPLevel', null=True, blank=True,
        on_delete=models.SET_NULL, verbose_name="Min daraja",
    )
    stock = models.IntegerField(default=0, verbose_name="Zaxira (0=cheksiz)")
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        app_label = 'client_erp'
        verbose_name = "Sovg'a"
        verbose_name_plural = "Sovg'alar"
        ordering = ['sort_order', 'coin_price']

    def __str__(self):
        return f"{self.name} ({self.coin_price} tanga)"


class RewardClaim(models.Model):
    """Sovg'a so'rovi."""
    STATUS = [
        ('pending', 'Kutilmoqda'),
        ('approved', 'Tasdiqlangan'),
        ('delivered', 'Berildi'),
        ('cancelled', 'Bekor'),
    ]
    user = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='reward_claims')
    reward = models.ForeignKey(RewardItem, on_delete=models.CASCADE, related_name='claims')
    coins_spent = models.IntegerField()
    status = models.CharField(max_length=20, choices=STATUS, default='pending')
    claimed_at = models.DateTimeField(auto_now_add=True)
    approved_by = models.ForeignKey(
        'dashboard.CustomUser', null=True, blank=True,
        on_delete=models.SET_NULL,
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-claimed_at']


# ═══════════════════════════════════════════════════════════════════
#  TOPSHIRIQLAR (QUESTS)
# ═══════════════════════════════════════════════════════════════════

class Quest(models.Model):
    """Topshiriq — kunlik, haftalik, bir martalik, mavsumiy."""
    TYPES = [
        ('daily', 'Kunlik'),
        ('weekly', 'Haftalik'),
        ('onetime', 'Bir martalik'),
        ('seasonal', 'Mavsumiy'),
    ]
    ACTION_TYPES = [
        ('login', 'Ilovaga kirish'),
        ('purchase', 'Xarid qilish'),
        ('review', 'Sharh yozish'),
        ('referral', "Do'st tavsiya"),
        ('view_products', "Mahsulot ko'rish"),
        ('share', 'Ulashish'),
        ('complete_stage', 'Etap tugallash'),
        ('complete_order', 'Buyurtma tugallash'),
        ('custom', 'Boshqa'),
    ]
    quest_type = models.CharField(max_length=20, choices=TYPES, default='daily')
    title = models.CharField(max_length=200, verbose_name="Nomi")
    description = models.TextField(blank=True, default='')
    icon = models.CharField(max_length=10, default='📋')

    xp_reward = models.IntegerField(default=0)
    coin_reward = models.IntegerField(default=0)

    action_type = models.CharField(max_length=20, choices=ACTION_TYPES, default='custom')
    action_count = models.IntegerField(default=1, verbose_name="Necha marta bajarish kerak")

    # Muddat (mavsumiy uchun)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    min_level = models.ForeignKey(
        'client_erp.ClientVIPLevel', null=True, blank=True,
        on_delete=models.SET_NULL,
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        app_label = 'client_erp'
        verbose_name = "Topshiriq"
        verbose_name_plural = "Topshiriqlar"
        ordering = ['sort_order']

    def __str__(self):
        return f"{self.icon} {self.title}"


class QuestCompletion(models.Model):
    """Bajarilgan topshiriq."""
    user = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='quest_completions')
    quest = models.ForeignKey(Quest, on_delete=models.CASCADE, related_name='completions')
    progress = models.IntegerField(default=0, verbose_name="Bajarilgan soni")
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    xp_awarded = models.BooleanField(default=False)
    date = models.DateField(verbose_name="Qaysi kun uchun")

    class Meta:
        app_label = 'client_erp'
        unique_together = ('user', 'quest', 'date')
        ordering = ['-date']
