"""client_erp/models/team.py — Jamoa, a'zolar, foyda taqsimlash."""
from django.db import models


class ClientTeam(models.Model):
    """Jamoa."""
    AUTO_ROLE_CHOICES = [
        ('viewer', "Ko'ruvchi"),
        ('worker', 'Ishchi'),
        ('manager', 'Menejer'),
    ]
    name = models.CharField(max_length=200)
    owner = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='owned_teams')
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    # Avto-ulashish: owner'ning HAR BIR YANGI buyurtmasi jamoa a'zolariga
    # quyidagi auto_* ruxsatlar bilan avtomatik ochiladi (faqat yangi buyurtmalar).
    auto_share_new_orders = models.BooleanField(
        default=False, verbose_name="Yangi buyurtmalar jamoaga avto-ochilsin")
    auto_role = models.CharField(
        max_length=10, choices=AUTO_ROLE_CHOICES, default='worker',
        verbose_name="Avto-ruxsat roli")
    auto_can_add_expense = models.BooleanField(
        default=False, verbose_name="Avto: chiqim qo'sha oladi")
    auto_can_complete_stage = models.BooleanField(
        default=True, verbose_name="Avto: etap tugata oladi")
    auto_can_see_money = models.BooleanField(
        default=True, verbose_name="Avto: pul ko'rinadi")

    class Meta:
        app_label = 'client_erp'

    def __str__(self):
        return self.name


class ClientTeamMember(models.Model):
    """Jamoa a'zosi."""
    ROLE_CHOICES = [
        ('owner', 'Egasi'),
        ('admin', 'Admin'),
        ('worker', 'Ishchi'),
        ('viewer', 'Ko\'ruvchi'),
    ]
    STATUS_CHOICES = [
        ('invited', 'Taklif qilingan'),
        ('active', 'Faol'),
        ('blocked', 'Bloklangan'),
    ]
    team = models.ForeignKey(ClientTeam, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='team_memberships')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='worker')
    profit_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='invited')
    invited_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'client_erp'
        unique_together = ('team', 'user')

    def __str__(self):
        return f"{self.user} — {self.team} ({self.role})"


class ClientOrderShare(models.Model):
    """Buyurtma ulashish."""
    VISIBILITY_CHOICES = [
        ('full', 'To\'liq'),
        ('limited', 'Cheklangan'),
        ('finance_hidden', 'Moliya yashirin'),
    ]
    order = models.ForeignKey('client_erp.ClientOrder', on_delete=models.CASCADE, related_name='shares')
    team = models.ForeignKey(ClientTeam, on_delete=models.CASCADE, related_name='shared_orders')
    shared_by = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE)
    visibility = models.CharField(max_length=20, choices=VISIBILITY_CHOICES, default='full')
    can_edit = models.BooleanField(default=False)
    can_add_expense = models.BooleanField(default=False)
    can_complete = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        unique_together = ('order', 'team')


class ClientOrderProfitShare(models.Model):
    """Buyurtma foyda taqsimlash."""
    order = models.ForeignKey('client_erp.ClientOrder', on_delete=models.CASCADE, related_name='profit_shares')
    member = models.ForeignKey(ClientTeamMember, on_delete=models.SET_NULL, null=True, blank=True)

    # ── H1 to'liq (2026-08-04): KONTAKT-ASOSLI TAQSIMOT ──────────────────────
    # TZ: DOCS/TZ-Kontakt-Asosli-Foyda-Taqsimoti.md
    #
    # Ilgari ulush FAQAT `name` (erkin matn) edi — 144 ta yozuvning 0 tasi real
    # akkauntga bog'lanmagan. Bu ikki xavf tug'dirardi: (a) bir xil ismli ikki
    # akkaunt bo'lsa pul noto'g'ri odamga ketishi (bazada `dilshod` ×2),
    # (b) a'zo ismini boshqasinikiga o'zgartirib ulushni o'ziga oldirishi.
    #
    # Nega `member` emas, `user`: a'zo jamoadan chiqarilsa `ClientTeamMember`
    # o'chadi, lekin tarixiy ulush qolishi kerak. `ClientUser` esa doimiy.
    #
    # `name` QOLADI — faqat KO'RSATISH uchun snapshot (a'zo keyin ismini
    # o'zgartirsa ham eski hisobotda o'sha paytdagi ism turadi) va eski,
    # bog'lanmagan yozuvlar uchun.
    user = models.ForeignKey(
        'client_erp.ClientUser', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='profit_shares',
        verbose_name="Kontakt (ro'yxatdan o'tgan foydalanuvchi)",
    )

    name = models.CharField(max_length=100)
    percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    is_remainder = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)

    @property
    def is_linked(self):
        """Kontaktga bog'langanmi (yangi usul) yoki eski erkin-matnmi."""
        return self.user_id is not None

    class Meta:
        app_label = 'client_erp'
        ordering = ['sort_order', 'id']


class ClientProfitTemplate(models.Model):
    """Foyda taqsimot shabloni."""
    team = models.ForeignKey(ClientTeam, on_delete=models.CASCADE, related_name='profit_templates')
    name = models.CharField(max_length=200)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'

    def __str__(self):
        return self.name


class ClientProfitTemplateLine(models.Model):
    """Shablon satri."""
    template = models.ForeignKey(ClientProfitTemplate, on_delete=models.CASCADE, related_name='lines')
    member = models.ForeignKey(ClientTeamMember, on_delete=models.SET_NULL, null=True, blank=True)
    role_label = models.CharField(max_length=100)
    percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    is_remainder = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)

    class Meta:
        app_label = 'client_erp'
        ordering = ['sort_order', 'id']


class ClientProfitWithdrawal(models.Model):
    """Foyda yechish sessiyasi."""
    STATUS_CHOICES = [
        ('pending', 'Kutilmoqda'),
        ('confirmed', 'Tasdiqlangan'),
        ('completed', 'Yechilgan'),
        # H6 (2026-08-04): bekor qilingan. Yozuv O'CHIRILMAYDI (append-only) —
        # faqat statusi o'zgaradi va teskari moliyaviy yozuvlar yaratiladi.
        ('reversed', 'Bekor qilingan'),
    ]
    order = models.ForeignKey('client_erp.ClientOrder', on_delete=models.CASCADE, related_name='withdrawals')
    total_profit = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_by = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # ── H3 (2026-08-04): IDEMPOTENTLIK ───────────────────────────────────────
    # Brauzer har «Tasdiqlash» bosilganda bitta UUID yuboradi va qayta
    # urinishda AYNAN o'shani takrorlaydi. `unique` cheklov DB darajasida
    # ikkinchi yozuvni imkonsiz qiladi — tugma ikki marta bosilishi, WS
    # timeout'dan keyingi qayta urinish, reconnect-navbat qayta yuborishi
    # — hammasi bitta yozuvga tushadi (audit: TZ §0.4-B).
    # `null=True` — eski yozuvlar uchun (ular bo'sh qoladi).
    client_request_id = models.UUIDField(
        null=True, blank=True, unique=True, db_index=True,
        verbose_name="Mijoz so'rov ID (takrorlanishga qarshi)",
    )

    # ── H6 (2026-08-04): BEKOR QILISH ────────────────────────────────────────
    # Ilgari xato yechilgan pulni qaytarish mexanizmi UMUMAN yo'q edi —
    # moliyaviy yozuvga `is_deleted=True` qo'yadigan kod ham yo'q, `finance.
    # revert` esa faqat bitta akkaunt uchun va `order=None` yozuvni target
    # qila olmaydi (audit: TZ §0.4-C). Endi teskari yozuv bilan bekor qilinadi.
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversed_by = models.ForeignKey(
        'client_erp.ClientUser', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='reversed_withdrawals',
    )
    reverse_note = models.TextField(blank=True, default='', verbose_name="Bekor qilish sababi")

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']


class ClientProfitWithdrawalLine(models.Model):
    """Har bir xodimning ulushi."""
    withdrawal = models.ForeignKey(ClientProfitWithdrawal, on_delete=models.CASCADE, related_name='lines')
    name = models.CharField(max_length=100)
    # H1 (2026-08-03, audit TZ §0.4-D): ilgari kimga tushgani bazada UMUMAN
    # qayd etilmagan edi (faqat erkin `name` matni). Endi ism akkauntga mos
    # kelsa (`consumers.py:handle_profit_withdraw` dagi fuzzy-match orqali)
    # shu yerga ham yoziladi — audit-trail uchun, moliyaviy hisobga TA'SIR
    # QILMAYDI (faqat "kimga tushdi" degan qo'shimcha ma'lumot).
    user = models.ForeignKey(
        'client_erp.ClientUser', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='profit_withdrawal_lines',
    )
    percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    confirmed = models.BooleanField(default=False)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['id']


class ClientStandingShare(models.Model):
    """"Har doim" ulashish — doimiy jamoa a'zosi.

    Owner "Har doim" rejimida a'zo qo'shsa, uning HAR BIR YANGI buyurtmasi
    avtomatik shu a'zoga standart ruxsatlar bilan ulashiladi va a'zoga
    yangi-buyurtma bildirishnomasi yuboriladi. Owner istalgan payt
    o'zgartirishi/o'chirishi mumkin (Ulashish modalidan).
    """
    owner = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE,
        related_name='standing_shares', verbose_name="Egasi",
    )
    member = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE,
        related_name='standing_memberships', verbose_name="A'zo",
    )
    ROLE_CHOICES = [
        ('viewer', "Ko'ruvchi"),
        ('worker', 'Ishchi'),
        ('manager', 'Menejer'),
    ]
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='worker')
    can_add_expense = models.BooleanField(default=False)
    can_complete_stage = models.BooleanField(default=True)
    can_see_money = models.BooleanField(default=False, verbose_name="Pul ko'rinadi")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        unique_together = [('owner', 'member')]

    def __str__(self):
        return f"{self.owner} ⇒ {self.member} (har doim, {self.role})"


class ClientProfitPerson(models.Model):
    """Foyda taqsimoti uchun USTA RO'YXATI — to'liq dinamik.

    TZ: `TZ-Ustalar-Dinamik.md`

    Nega kerak: ilgari usta ismlari faqat `ClientOrderProfitShare.name`
    (free-text) da yashardi — ro'yxatni boshqarib, ishdan bo'shaganini
    olib tashlab bo'lmasdi. Endi har akkaunt o'z ro'yxatini yuritadi.

    QOIDA:
      • Ro'yxatda YO'Q odam Moliya panelida ko'rinaveradi (tarixiy ma'lumot
        yo'qolmasin).
      • `is_active=False` (ARXIV) qilingan odam ko'rinmaydi — ishdan
        bo'shaganlar shu yerga tushadi.

    MOLIYAGA TEGMAYDI — bu faqat ro'yxat; kassa/kirim/chiqim hisobiga
    hech qanday aloqasi yo'q.
    """
    owner = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE,
        related_name='profit_people', verbose_name="Akkaunt",
    )
    name = models.CharField(max_length=100, verbose_name="Usta ismi")
    is_active = models.BooleanField(
        default=True, verbose_name="Faol",
        help_text="O'chirilsa — arxiv: ro'yxatda ham, hisobotda ham ko'rinmaydi",
    )
    sort_order = models.IntegerField(default=0, verbose_name="Tartib")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['sort_order', 'id']
        unique_together = [('owner', 'name')]
        verbose_name = "Usta (foyda ro'yxati)"
        verbose_name_plural = "Ustalar ro'yxati"

    def __str__(self):
        return f"{self.name}{'' if self.is_active else ' (arxiv)'}"


class ClientMonthEndReminderLog(models.Model):
    """F9-b (2026-08-04): oy oxiri "hali bo'lib berilmagan ulush" eslatmasi.

    PUL O'TKAZMAYDI — faqat egaga bir marta (oyiga) Telegram xabar yuboradi:
    "N ta buyurtmada jami X so'm hali jamoaga bo'lib berilmagan". Foydalanuvchi
    "tizim o'zi avtomatik yechib yuborsin" deb so'ragan edi, lekin H6
    (bekor qilish) hali yo'qligi sababli xavfsizroq variant — ESLATMA —
    tanlandi (2026-08-04 qarori). Bu yozuv FAQAT "shu oy shu egaga allaqachon
    yuborilganmi" tekshiruvi uchun (idempotentlik), moliyaviy ma'no yo'q.
    """
    owner = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE,
        related_name='month_end_reminders',
    )
    year = models.IntegerField()
    month = models.IntegerField()
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        unique_together = [('owner', 'year', 'month')]


class ClientProfitAudit(models.Model):
    """Ulush o'zgarishlari AUDIT jurnali (2026-08-06).

    NEGA KERAK
        Foydalanuvchi so'rovi: «bu narsaning to'g'ri ekanligini qanday
        isbotlaymiz — ular xato deyishsa ayb bizda yoki ularda ekanini
        ko'rsatish kerak».

        Ilgari ulush o'zgarishi hech qayerda qayd qilinmasdi: kim, qachon,
        nimani o'zgartirgani noma'lum edi. Bahs chiqsa dalil yo'q edi.

    QAT'IY QOIDA
        Bu jadval FAQAT QO'SHILADI (append-only). Yozuv hech qachon
        o'chirilmaydi/tahrirlanmaydi — aks holda audit ma'nosini yo'qotadi.

    Har yozuv: qachon · kim · qaysi ulush · eski qiymat · yangi qiymat · sabab
    """
    class Action(models.TextChoices):
        CREATE = 'create', 'Yaratildi'
        UPDATE = 'update', "O'zgartirildi"
        DELETE = 'delete', "O'chirildi"
        LINK = 'link', 'Akkauntga bog\'landi'
        SHARE = 'share', 'Zakaz ulashildi'
        # 2026-08-15 — sherik buyurtmadan chiqarildi (TZ-Sherik-Chiqarish-Izi).
        # `old_value` = chiqarilgan paytdagi ulushi («40% · 6 000 000»).
        UNSHARE = 'unshare', 'Sherik chiqarildi'

    order = models.ForeignKey(
        'client_erp.ClientOrder', on_delete=models.CASCADE,
        related_name='profit_audit', null=True, blank=True,
    )
    share_id = models.IntegerField(null=True, blank=True, verbose_name="Ulush yozuvi id")
    action = models.CharField(max_length=16, choices=Action.choices, db_index=True)

    # Kim bajardi (tizim bo'lsa — bo'sh, `actor_note` to'ldiriladi)
    actor = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='profit_audit_actions',
    )
    actor_note = models.CharField(max_length=120, blank=True, default='')

    # Kimga tegishli (ulush egasi)
    target_user = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='profit_audit_received',
    )
    target_name = models.CharField(max_length=200, blank=True, default='')

    old_value = models.CharField(max_length=200, blank=True, default='')
    new_value = models.CharField(max_length=200, blank=True, default='')
    reason = models.CharField(max_length=300, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']
        verbose_name = "Ulush audit yozuvi"
        verbose_name_plural = "Ulush audit jurnali"
        indexes = [models.Index(fields=['order', 'created_at'])]

    def __str__(self):
        return f"{self.created_at:%d.%m.%Y %H:%M} {self.action} #{self.order_id}"


class ClientPendingInvite(models.Model):
    """Jamoa taklifi — RO'YXATDAN O'TMAGAN odamga (2026-09-23, additive).

    Oqim: usta ism+nomer kiritadi -> odam topilmasa, a'zo QO'SHILMAYDI,
    o'rniga shu yozuv yaratiladi (status='waiting') + taklif havolasi
    ko'rsatiladi. Odam ro'yxatdan o'tishi bilan (telefon mos kelsa)
    avtomatik jamoaga qo'shiladi, status='registered' bo'ladi.
    Hech qanday mavjud modelga tegilmaydi.
    """
    STATUS_CHOICES = [
        ('waiting', 'Kutilmoqda'),
        ('registered', "Ro'yxatdan o'tdi"),
        ('cancelled', 'Bekor qilingan'),
    ]
    team = models.ForeignKey(ClientTeam, on_delete=models.CASCADE, related_name='pending_invites')
    inviter = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='sent_invites')
    phone = models.CharField(max_length=20, verbose_name="Taklif qilingan nomer")
    name = models.CharField(max_length=200, verbose_name="Taklif qilingan ism")
    role = models.CharField(max_length=10, default='worker')
    profit_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='waiting', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    registered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']
        verbose_name = "Kutilayotgan taklif"
        verbose_name_plural = "Kutilayotgan takliflar"

    def __str__(self):
        return f"{self.name} ({self.phone}) -> {self.team}"


class AppSetting(models.Model):
    """Ilova sozlamalari — kodga tegmasdan ilova ichidan o'zgartiriladi.

    Kalitlar (2026-09-23): invite_play_url, invite_bot_url.
    Faqat admin (is_app_admin) o'zgartira oladi.
    """
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField(blank=True, default='')
    updated_by = models.ForeignKey(
        'client_erp.ClientUser', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='setting_updates',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'client_erp'
        verbose_name = "Ilova sozlamasi"

    def __str__(self):
        return self.key
