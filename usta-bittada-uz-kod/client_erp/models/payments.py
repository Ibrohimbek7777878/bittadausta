"""
client_erp/models/payments.py — To'lov modellari (bir martalik to'lov + saqlangan karta).

ClientPayment  — bir martalik to'lov (tanga / tarif sotib olish)
SavedCard      — Payme recurring token (kelajak avtoto'lov; PAN saqlanmaydi)
PaymentAttempt — har bir to'lov urinishi audit trail

Provider: Payme / Click / Octobank / Multicard / Sandbox.
Idempotency: fulfilled bayrog'i tanga berilgan / tarif tayinlangan holatni belgilaydi.
"""
from django.db import models


# ═══════════════════════════════════════════════════════════════════
#  BIR MARTALIK TO'LOV
# ═══════════════════════════════════════════════════════════════════

class ClientPayment(models.Model):
    """Bir martalik to'lov (tanga yoki tarif sotib olish)."""
    class Provider(models.TextChoices):
        PAYME = 'payme', 'Payme'
        CLICK = 'click', 'Click'
        OCTOBANK = 'octobank', 'Octobank'
        MULTICARD = 'multicard', 'Multicard'
        SANDBOX = 'sandbox', 'Sandbox'

    class Purpose(models.TextChoices):
        COIN_TOPUP = 'coin_topup', 'Tanga to\'ldirish'
        PLAN_PURCHASE = 'plan_purchase', 'Tarif sotib olish'

    class Status(models.TextChoices):
        CREATED = 'created', 'Yaratildi'
        PENDING = 'pending', 'Kutilmoqda'
        PAID = 'paid', 'To\'landi'
        FAILED = 'failed', 'Muvaffaqiyatsiz'
        CANCELLED = 'cancelled', 'Bekor qilindi'

    user = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE,
        related_name='payments',
    )
    provider = models.CharField(max_length=20, choices=Provider.choices)
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    target_id = models.IntegerField(default=0, verbose_name="CoinPack.id yoki ClientPlan.id")
    amount_uzs = models.BigIntegerField(default=0, verbose_name="Summa (UZS)")
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.CREATED, db_index=True,
    )
    external_id = models.CharField(
        max_length=128, blank=True, default='', db_index=True,
        verbose_name="Provider tranzaksiya ID",
    )
    checkout_url = models.TextField(blank=True, default='')
    fulfilled = models.BooleanField(
        default=False, verbose_name="Bajarildi (tanga berildi / tarif tayinlandi)",
    )
    raw = models.JSONField(default=dict, blank=True, verbose_name="Provider javoblari (audit)")
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']
        verbose_name = "To'lov"
        verbose_name_plural = "To'lovlar"

    def __str__(self):
        return f"#{self.pk} {self.provider} {self.purpose} {self.amount_uzs} UZS [{self.status}]"


# ═══════════════════════════════════════════════════════════════════
#  SAQLANGAN KARTA (Payme recurring token)
# ═══════════════════════════════════════════════════════════════════

class SavedCard(models.Model):
    """Payme recurring token (kelajak avtoto'lov). PAN saqlanmaydi — faqat token."""
    user = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE,
        related_name='saved_cards',
    )
    provider = models.CharField(max_length=20, default='payme')
    token = models.TextField(verbose_name="Shifrlangan token (F3'da oddiy saqlanadi)")
    card_masked = models.CharField(max_length=24, blank=True, default='')
    expire = models.CharField(max_length=5, blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']
        verbose_name = "Saqlangan karta"
        verbose_name_plural = "Saqlangan kartalar"

    def __str__(self):
        return f"{self.user_id} {self.provider} {self.card_masked or '****'}"

    # ── Token shifrlash (client_erp.services.crypto) ─────────────────
    def set_token(self, plain):
        """Tokenni shifrlab (kalit bo'lsa) self.token ga yozadi."""
        from client_erp.services.crypto import encrypt_token
        self.token = encrypt_token(plain)

    def get_token(self):
        """Saqlangan tokenni deshifrlab qaytaradi (oddiy bo'lsa o'zgarishsiz)."""
        from client_erp.services.crypto import decrypt_token
        return decrypt_token(self.token)


# ═══════════════════════════════════════════════════════════════════
#  TO'LOV URINISHI (AUDIT TRAIL)
# ═══════════════════════════════════════════════════════════════════

class PaymentAttempt(models.Model):
    """Har bir to'lov urinishi audit trail."""
    payment = models.ForeignKey(
        'client_erp.ClientPayment', on_delete=models.CASCADE,
        related_name='attempts',
    )
    success = models.BooleanField(default=False)
    error_code = models.CharField(max_length=40, blank=True, default='')
    error_message = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']
        verbose_name = "To'lov urinishi"
        verbose_name_plural = "To'lov urinishlari"

    def __str__(self):
        return f"attempt #{self.pk} payment={self.payment_id} ok={self.success}"


# ═══════════════════════════════════════════════════════════════════
#  PAYME MERCHANT API (kassa — "biling bilan qabul") TRANZAKSIYASI
# ═══════════════════════════════════════════════════════════════════

class PaymeMerchantTxn(models.Model):
    """Payme Merchant API callback holat-mashinasi (kassa → bizga JSON-RPC).

    Har `ClientPayment` (= order_id) uchun Payme yaratadigan tranzaksiya.
    Vaqtlar millisekundда (unix epoch × 1000) — Payme talabi.
    """
    STATE_CREATED = 1
    STATE_PERFORMED = 2
    STATE_CANCELLED_AFTER_CREATE = -1
    STATE_CANCELLED_AFTER_PERFORM = -2

    payme_id = models.CharField(max_length=64, unique=True, db_index=True,
                                verbose_name="Payme tranzaksiya id (params.id)")
    payment = models.ForeignKey('client_erp.ClientPayment', on_delete=models.PROTECT,
                                related_name='payme_txns')
    amount_tiyin = models.BigIntegerField(default=0)
    state = models.IntegerField(default=STATE_CREATED, db_index=True)
    reason = models.IntegerField(null=True, blank=True, verbose_name="Bekor sababi")
    create_time = models.BigIntegerField(default=0)    # ms
    perform_time = models.BigIntegerField(default=0)   # ms
    cancel_time = models.BigIntegerField(default=0)    # ms
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']
        verbose_name = "Payme tranzaksiya (kassa)"
        verbose_name_plural = "Payme tranzaksiyalar (kassa)"

    def __str__(self):
        return f"PaymeTxn {self.payme_id} order={self.payment_id} state={self.state}"
