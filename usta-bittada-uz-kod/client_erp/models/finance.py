"""client_erp/models/finance.py — Moliya (kirim-chiqim) + Qarz."""
from django.db import models


class ClientFinanceRecord(models.Model):
    """Kirim-chiqim yozuvi."""
    owner = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='finance_records')
    customer = models.ForeignKey('client_erp.ClientCustomer', null=True, blank=True, on_delete=models.SET_NULL, related_name='finance_records')
    order = models.ForeignKey('client_erp.ClientOrder', null=True, blank=True, on_delete=models.CASCADE, related_name='finance_records')

    RECORD_TYPES = [
        ('income', 'Kirim'),
        ('expense', 'Chiqim'),
        ('withdrawal', 'Pul yechish'),
        ('debt_given', 'Qarz berdim'),
        ('debt_received', 'Qarz oldim'),
        ('debt_paid', "Qarz to'ladi"),
    ]
    EXPENSE_CATEGORIES = [
        ('material', 'Material'),
        ('service', 'Xizmat'),
        ('transport', 'Transport'),
        ('furniture', 'Furnitura'),
        ('mebelcity', 'MebelCity'),
        ('other', 'Boshqa'),
    ]
    PAYMENT_METHODS = [
        ('cash', 'Naqd'),
        ('card', 'Karta'),
        ('transfer', "O'tkazma"),
    ]
    stage = models.ForeignKey(
        'client_erp.ClientOrderStage', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='expenses',
    )
    record_type = models.CharField(max_length=20, choices=RECORD_TYPES)
    category = models.CharField(max_length=20, choices=EXPENSE_CATEGORIES, blank=True, default='', verbose_name="Kategoriya")
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS, blank=True, default='cash', verbose_name="To'lov usuli")
    amount = models.DecimalField(max_digits=20, decimal_places=2)
    currency = models.CharField(max_length=5, default='UZS')
    exchange_rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    amount_uzs = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    description = models.CharField(max_length=300, blank=True, default='')
    recipient_name = models.CharField(max_length=200, blank=True, default='', verbose_name="Oluvchi ismi")
    date = models.DateField()
    is_deleted = models.BooleanField(default=False)

    # ── H5 (2026-08-04): BOG'LOVCHI FK ───────────────────────────────────────
    # Foyda yechilganda yaratiladigan yozuvlarni (egadagi `withdrawal` va
    # a'zodagi `income`) o'z manbasiga bog'laydi. Uchta muammoni bir yo'la
    # yopadi (audit: TZ §0.4-A/C):
    #   1. Takror yozuv DB darajasida imkonsiz (`unique_together` bilan);
    #   2. «Qaysi yechim qaysi kirimni tug'dirdi» — bazadan aniq ko'rinadi
    #      (ilgari hech qanday bog'lanish yo'q edi);
    #   3. Bekor qilish (H6) avtomatlashadi — qaysi yozuvlarni teskari
    #      qilish kerakligi aniq.
    source_line = models.ForeignKey(
        'client_erp.ClientProfitWithdrawalLine', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='finance_records',
        verbose_name="Manba: foyda-yechish qatori",
    )
    # Teskari (bekor qilish) yozuvimi — hisobotlarda ajratish uchun.
    is_reversal = models.BooleanField(default=False, verbose_name="Bekor qilish yozuvi")

    # ── DUBLIKAT TEKSHIRUVI (2026-08-06) ─────────────────────────────────
    # Jonli bazada topildi: 24 guruh, ~123 800 077 so'mlik ehtimoliy takror
    # yozuv (bir xil ega+zakaz+summa+sana+tur, ba'zilari 0-1 soniya farq bilan).
    # Har ortiqcha chiqim foydani kamaytiradi.
    # Foydalanuvchi «bu dublikat» yoki «bu haqiqiy» deb BELGILAYDI — tizim
    # o'zi hech narsa o'chirmaydi. Belgilangach ro'yxatda qayta chiqmaydi.
    dup_reviewed = models.BooleanField(
        default=False, db_index=True,
        verbose_name="Dublikat tekshiruvidan o'tgan")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-date', '-created_at']


class ClientFinanceLog(models.Model):
    """Audit trail — har bir o'zgarish saqlanadi."""
    record = models.ForeignKey(ClientFinanceRecord, on_delete=models.CASCADE, related_name='logs')
    ACTION_CHOICES = [('create', 'Yaratildi'), ('update', "O'zgartirildi"), ('delete', "O'chirildi")]
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    old_data = models.JSONField(null=True, blank=True)
    new_data = models.JSONField(null=True, blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-changed_at']


class ClientDebt(models.Model):
    """Qarz yozuvi."""
    owner = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='debts')
    customer = models.ForeignKey('client_erp.ClientCustomer', on_delete=models.CASCADE, related_name='debts')
    order = models.ForeignKey('client_erp.ClientOrder', null=True, blank=True, on_delete=models.SET_NULL)

    original_amount = models.DecimalField(max_digits=20, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    remaining = models.DecimalField(max_digits=20, decimal_places=2)

    STATUS_CHOICES = [('active', 'Faol'), ('partial', 'Qisman'), ('paid', "To'langan"), ('written_off', 'Hisobdan chiqarildi')]
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='active')
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']


class ClientFinanceMonthArchive(models.Model):
    """Muzlatilgan oylik moliya-hisobot (2026-08-12,
    TZ-Moliya-Tarix-Arxiv-Avgust-Boshlanish.md). FAQAT O'QISH uchun —
    yaratilgach hech qachon UPDATE qilinmaydi. `serialize_finance_page`/
    `serialize_analytics` natijasining o'sha vaqtdagi to'liq JSON nusxasi —
    kelajakda formula o'zgarsa ham bu yozuv o'zgarmaydi."""
    owner = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE,
        related_name='finance_month_archives')
    ym = models.CharField(max_length=7, verbose_name="Oy (YYYY-MM)")
    finance_snapshot = models.JSONField(verbose_name="Moliya sahifasi natijasi")
    analytics_snapshot = models.JSONField(verbose_name="Analitika sahifasi natijasi")
    frozen_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        unique_together = ('owner', 'ym')
        ordering = ['-ym']
        verbose_name = "Moliya oy-arxivi"
        verbose_name_plural = "Moliya oy-arxivlari"

    def __str__(self):
        return f"{self.owner.username} — {self.ym} (arxiv)"


class ClientDebtPayment(models.Model):
    """Qarz to'lovi."""
    debt = models.ForeignKey(ClientDebt, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=20, decimal_places=2)
    METHODS = [('cash', 'Naqd'), ('card', 'Karta'), ('transfer', "O'tkazma")]
    payment_method = models.CharField(max_length=10, choices=METHODS, default='cash')
    date = models.DateField()
    note = models.CharField(max_length=200, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-date']
