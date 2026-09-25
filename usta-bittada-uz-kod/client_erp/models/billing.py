"""
client_erp/models/billing.py — Tanga (coin) sotib olish va sarflash modellari.

CoinPack       — sotiladigan tanga paketi (admin yaratadi)
ClientAIPrice  — AI funksiya tanga narxi (admin sozlaydi)
CoinLedger     — tanga harakati audit trail (sotib olish/sarflash/grant)

Eslatma: joriy tanga balansi ClientUser.coins (INTEGER) da saqlanadi.
"""
from django.db import models


# ═══════════════════════════════════════════════════════════════════
#  SOTILADIGAN TANGA PAKETLARI
# ═══════════════════════════════════════════════════════════════════

class CoinPack(models.Model):
    """Sotiladigan tanga paketi (admin yaratadi)."""
    name = models.CharField(max_length=100, verbose_name="Nomi")
    coins = models.IntegerField(verbose_name="Asosiy tanga")
    bonus_coins = models.IntegerField(default=0, verbose_name="Bonus tanga")
    price_uzs = models.BigIntegerField(verbose_name="Narx (UZS)")
    is_active = models.BooleanField(default=True, verbose_name="Faol")
    sort = models.IntegerField(default=0)
    color = models.CharField(max_length=20, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['sort', 'id']
        verbose_name = "Tanga paketi"
        verbose_name_plural = "Tanga paketlari"

    def __str__(self):
        return f"{self.name} ({self.coins}+{self.bonus_coins}) — {self.price_uzs} UZS"

    @property
    def total_coins(self):
        return self.coins + self.bonus_coins


# ═══════════════════════════════════════════════════════════════════
#  AI FUNKSIYA TANGA NARXI
# ═══════════════════════════════════════════════════════════════════

class ClientAIPrice(models.Model):
    """AI funksiya tanga narxi (admin sozlaydi)."""
    action_key = models.CharField(
        max_length=50, unique=True, verbose_name="Amal kodi",
        help_text="'analytics_ai','ai_image','ai_panorama','laylo_chat','gemini_live'",
    )
    label = models.CharField(max_length=100, blank=True, default='', verbose_name="Nomi")
    coin_cost = models.IntegerField(default=0, verbose_name="Tanga narxi")
    is_active = models.BooleanField(default=True, verbose_name="Faol (False => bu funksiya tekin)")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['action_key']
        verbose_name = "AI tanga narxi"
        verbose_name_plural = "AI tanga narxlari"

    def __str__(self):
        return f"{self.action_key}: {self.coin_cost} tanga"


# ═══════════════════════════════════════════════════════════════════
#  TANGA HARAKATI (AUDIT TRAIL)
# ═══════════════════════════════════════════════════════════════════

class CoinLedger(models.Model):
    """Tanga harakati audit — sotib olish / sarflash / grant / refund."""
    class Kind(models.TextChoices):
        PURCHASE = 'purchase', 'Sotib olish'
        SPEND = 'spend', 'Sarflash'
        GRANT = 'grant', 'Berildi (admin)'
        REFUND = 'refund', 'Qaytarish'

    user = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE,
        related_name='coin_ledger',
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    amount = models.IntegerField(verbose_name="Miqdor (+ kirim / - chiqim)")
    balance_after = models.IntegerField(default=0, verbose_name="Qoldiq")
    reason = models.CharField(max_length=200, blank=True, default='')
    ref_id = models.CharField(max_length=64, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']
        verbose_name = "Tanga harakati"
        verbose_name_plural = "Tanga harakatlari"

    def __str__(self):
        return f"{self.user_id} {self.kind} {self.amount:+d} (→{self.balance_after})"


class ClientAiUsage(models.Model):
    """AI foydalanish o'lchovi — TZ-Tanga-Tolov-Adolat.md §2.3.

    NEGA KERAK
        Ilgari faqat `CoinLedger` bor edi: «kim, qachon, necha tanga».
        Sessiya NECHA DAQIQA davom etgani va NECHA TOKEN ketgani hech
        qayerda yozilmasdi — shuning uchun «2 tanga to'g'rimi?» degan
        savolga faqat TAXMIN bilan javob berilardi
        (HISOBOT-Tanga-Token-Narx.md).

    NIMAGA ISHLATILADI
        1. Narxni o'lchovga asoslash (taxmin emas)
        2. Kunlik limitni sanash (§2.5) — alohida hisoblagich YO'Q
        3. Foydalanuvchiga sarfni ko'rsatish (§2.6)

    ⚠️ `duration_sec` HAR DOIM aniq (timestamp). `tokens_*` esa
    provayder bersa yoziladi — `fal` va ba'zi tekin kalitlar 0 qaytaradi,
    shuning uchun `tokens_estimated` bayrog'i bor.
    """
    class Kind(models.TextChoices):
        LIVE = 'live', 'Ovozli (Gemini Live)'
        CHAT = 'chat', 'Matnli chat'
        IMAGE = 'image', 'Rasm'
        OTHER = 'other', 'Boshqa'

    user = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE,
        related_name='ai_usage',
    )
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.CHAT, db_index=True)

    started_at = models.DateTimeField(db_index=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_sec = models.IntegerField(default=0, verbose_name="Davomiylik (soniya)")

    # Ovozli sessiya: foydalanuvchi qancha vaqt GAPIRGAN (jimlik emas).
    # PCM16 mono 16 kHz → 32 000 bayt/soniya bo'yicha hisoblanadi.
    audio_ms_in = models.IntegerField(default=0, verbose_name="Yuborilgan audio (ms)")

    tokens_in = models.IntegerField(default=0)
    tokens_out = models.IntegerField(default=0)
    tokens_estimated = models.BooleanField(
        default=False, verbose_name="Token taxminiy (provayder bermadi)")

    provider = models.CharField(max_length=40, blank=True, default='')
    model_name = models.CharField(max_length=80, blank=True, default='')

    coins_charged = models.IntegerField(default=0)
    # 'first_audio' | 'reuse_window' | 'skipped' | 'chat_free'
    charge_reason = models.CharField(max_length=24, blank=True, default='')

    class Meta:
        app_label = 'client_erp'
        ordering = ['-started_at']
        verbose_name = "AI foydalanish"
        verbose_name_plural = "AI foydalanish"
        indexes = [
            models.Index(fields=['user', 'started_at']),
        ]

    def __str__(self):
        return f"{self.user_id} {self.kind} {self.duration_sec}s {self.total_tokens}tok"

    @property
    def total_tokens(self):
        return (self.tokens_in or 0) + (self.tokens_out or 0)
