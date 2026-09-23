"""client_erp/models/user.py — ClientUser (Mini ERP foydalanuvchisi)."""
from django.db import models
from django.contrib.auth.hashers import make_password, check_password


class ClientUser(models.Model):
    """B2B mijoz — Mini ERP foydalanuvchisi.

    AUTH_USER_MODEL emas — oddiy model + o'z auth.
    Django session ga teginmaydi — JWT token ishlatadi.
    """

    phone = models.CharField(max_length=20, unique=True, verbose_name="Telefon (login)")
    username = models.CharField(max_length=50, unique=True, verbose_name="Username")
    password_hash = models.CharField(max_length=128, verbose_name="Parol (hash)")

    # Katta ERP dagi Client ga bog'lash
    client = models.OneToOneField(
        'clients.Client', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='mini_erp_user',
        verbose_name="Katta ERP Client",
    )

    full_name = models.CharField(max_length=200, verbose_name="Ism")
    organization = models.CharField(max_length=200, blank=True, default='', verbose_name="Tashkilot")
    avatar = models.ImageField(upload_to='client_erp/avatars/', blank=True, null=True)

    # Foydalanuvchi qo'shgan chiqim kategoriyalari — [{key, name, icon, color}]
    expense_categories = models.JSONField(default=list, blank=True,
                                          verbose_name="Chiqim kategoriyalari")

    is_active = models.BooleanField(default=True)
    is_verified = models.BooleanField(default=False, verbose_name="Admin tasdiqlagan")
    is_blocked = models.BooleanField(default=False, verbose_name="Bloklangan")
    # Ommaviy oferta roziligi (1-marta ro'yxatdan o'tishда — Payme talabi)
    oferta_accepted = models.BooleanField(default=False, verbose_name="Ofertani qabul qilgan")
    oferta_accepted_at = models.DateTimeField(null=True, blank=True, verbose_name="Oferta qabul sanasi")

    # Telegram
    telegram_chat_id = models.BigIntegerField(null=True, blank=True, unique=True)
    telegram_username = models.CharField(max_length=100, blank=True, default='')

    # ── Demo akkaunt (2026-09-23, additive) ──────────────────────────
    # 24 soatlik vaqtinchalik akkaunt. Muddati o'tgach user + BARCHA
    # datasi to'liq o'chadi (CASCADE + fayl tozalash). Real akkaunt
    # ochilganda shu qator convert qilinadi (data ko'chadi = o'zida qoladi).
    is_demo = models.BooleanField(default=False, verbose_name="Demo akkaunt")
    demo_expires_at = models.DateTimeField(null=True, blank=True, verbose_name="Demo tugash vaqti")

    # ── Ilova admini (2026-09-23, additive) ──────────────────────────
    # Bosh admin (+998945876003) kodda zahiralangan; qo'shimcha adminlar
    # shu bayroq bilan belgilanadi (jami max 3 ta). Admin ilova ichidan
    # sozlamalarni o'zgartiradi (AppSetting) va admin tayinlaydi.
    is_app_admin = models.BooleanField(default=False, verbose_name="Ilova admini")

    # ── Gamifikatsiya ──
    xp = models.IntegerField(default=0, verbose_name="XP (tajriba)")
    coins = models.IntegerField(default=0, verbose_name="Tanga (sarflanmagan)")
    coins_total_earned = models.IntegerField(default=0, verbose_name="Jami yig'ilgan tanga")
    vip_level = models.ForeignKey(
        'client_erp.ClientVIPLevel', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='users',
        verbose_name="VIP daraja",
    )
    turnover_year = models.DecimalField(
        max_digits=20, decimal_places=2, default=0,
        verbose_name="Yillik aylanma (UZS)",
    )
    turnover_total = models.DecimalField(
        max_digits=20, decimal_places=2, default=0,
        verbose_name="Umumiy aylanma (UZS)",
    )
    streak_days = models.IntegerField(default=0, verbose_name="Ketma-ket kun")

    # ── i18n (2026-08-07) ────────────────────────────────────────────
    # Interfeys tili. Frontend `localStorage` da ham saqlaydi; bu maydon
    # SERVER tomonda kerak: Telegram xabarlari, PDF va server matnlari.
    language = models.CharField(
        max_length=2, default='uz',
        choices=[('uz', "O'zbekcha"), ('ru', 'Русский'), ('en', 'English')],
        verbose_name='Interfeys tili')
    streak_last_date = models.DateField(null=True, blank=True, verbose_name="Oxirgi streak sanasi")
    referral_code = models.CharField(
        max_length=20, unique=True, blank=True, null=True,
        verbose_name="Tavsiya kodi",
    )
    referred_by = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='referrals',
        verbose_name="Kim tavsiya qilgan",
    )
    referral_count = models.IntegerField(default=0, verbose_name="Tavsiya qilinganlar soni")
    referral_earnings = models.DecimalField(
        max_digits=20, decimal_places=2, default=0,
        verbose_name="Tavsiya komissiyasi jami (UZS)",
    )
    # ── Tarif / obuna (F1 SaaS poydevor) ──
    plan = models.ForeignKey(
        'client_erp.ClientPlan', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='users',
        verbose_name="Tarif",
    )
    plan_expires_at = models.DateTimeField(null=True, blank=True, verbose_name="Tarif muddati")
    plan_since = models.DateTimeField(null=True, blank=True, verbose_name="Tarif boshlangan")

    birth_date = models.DateField(null=True, blank=True, verbose_name="Tug'ilgan kun")
    profile_completion = models.IntegerField(default=0, verbose_name="Profil to'liqligi %")
    last_activity = models.DateTimeField(null=True, blank=True, verbose_name="Oxirgi faollik")

    # Notification sozlamalari
    notify_telegram = models.BooleanField(default=True)
    notify_order_status = models.BooleanField(default=True)
    notify_debt_reminder = models.BooleanField(default=True)
    notify_deadline = models.BooleanField(default=True)
    notify_daily_report = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)

    # ── Balans-kesim (2026-08-12, TZ-Moliya-Tarix-Arxiv-Avgust-Boshlanish.md) ──
    # `null` — eski xatti-harakat (Balans/Kirim/Chiqim to'liq tarixiy yig'indi),
    # boshqa akkauntlarga TA'SIR QILMAYDI. O'rnatilsa — barcha "umumiy" moliya
    # ko'rsatkichlari (Dashboard/Moliya/Analitika) FAQAT shu sanadan boshlab
    # `balance_cutover_amount`ni boshlang'ich qilib hisoblanadi, undan oldingi
    # xom yozuvlar live hisobga qo'shilmaydi (arxivga muzlatilgan, alohida
    # ClientFinanceMonthArchive orqali ko'rinadi).
    balance_cutover_date = models.DateField(
        null=True, blank=True, verbose_name="Balans-kesim sanasi")
    balance_cutover_amount = models.DecimalField(
        max_digits=20, decimal_places=2, null=True, blank=True,
        verbose_name="Balans-kesim boshlang'ich summasi")

    class Meta:
        app_label = 'client_erp'
        verbose_name = "Mini ERP Foydalanuvchi"
        verbose_name_plural = "Mini ERP Foydalanuvchilar"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.full_name} (@{self.username})"

    def save(self, *args, **kwargs):
        if self.phone:
            digits = ''.join(c for c in self.phone if c.isdigit())
            if len(digits) == 9:
                self.phone = f'+998{digits}'
            elif len(digits) >= 12 and digits.startswith('998'):
                self.phone = f'+{digits[:12]}'
            elif not self.phone.startswith('+') and digits:
                self.phone = f'+{digits}'
        if not self.referral_code:
            import random, string
            while True:
                code = 'MC-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
                if not ClientUser.objects.filter(referral_code=code).exists():
                    self.referral_code = code
                    break
        super().save(*args, **kwargs)

    def set_password(self, raw):
        self.password_hash = make_password(raw)

    def check_password(self, raw):
        return check_password(raw, self.password_hash)

    @staticmethod
    def generate_username(name):
        """Ism dan unique username yaratish: sardor_cl, sardor_cl2..."""
        import re
        base = re.sub(r'[^a-z0-9]', '', (name or 'user').lower().split()[0][:20])
        slug = f"{base}_cl"
        if not ClientUser.objects.filter(username=slug).exists():
            return slug
        i = 2
        while ClientUser.objects.filter(username=f"{slug}{i}").exists():
            i += 1
        return f"{slug}{i}"


class ClientLoginAttempt(models.Model):
    """Login urinishlar — brute force himoya."""
    WEB = 'web'
    TELEGRAM = 'telegram'
    QR = 'qr'
    LOGIN_TYPE_CHOICES = [
        (WEB, 'Web'),
        (TELEGRAM, 'Telegram'),
        (QR, 'QR kod'),
    ]

    phone = models.CharField(max_length=20)
    ip_address = models.GenericIPAddressField()
    attempted_at = models.DateTimeField(auto_now_add=True)
    success = models.BooleanField(default=False)
    login_type = models.CharField(max_length=10, choices=LOGIN_TYPE_CHOICES, default=WEB)
    user = models.ForeignKey(
        ClientUser, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='login_attempts',
    )

    class Meta:
        app_label = 'client_erp'
        ordering = ['-attempted_at']

    @staticmethod
    def is_blocked(phone):
        from django.utils import timezone
        from datetime import timedelta
        cutoff = timezone.now() - timedelta(minutes=30)
        failed = ClientLoginAttempt.objects.filter(
            phone=phone, success=False, attempted_at__gte=cutoff
        ).count()
        return failed >= 10
