"""client_erp/services/coins.py — AI funksiyalar uchun tanga narxlash + yechish servisi.

MUHIM XAVFSIZLIK
================
AI-tanga standart O'CHIQ. Agar `ai_coins_enabled()` False bo'lsa YOKI narx
topilmasa / 0 bo'lsa — HECH KIM tanga sarflamaydi va HECH KIM bloklanmaydi:
`charge()` doim muvaffaqiyatli qaytadi (0 yechadi), `can_afford()` True qaytaradi.

Tanga = `ClientUser.coins` (INTEGER, mavjud).

Billing modellari (hali migratsiya QILINMAGAN — shu sabab import funksiya ICHIDA
va try/except bilan o'raladi; model bo'lmasa jim o'tadi):
    client_erp/models/billing.py
        - ClientAIPrice(action_key, coin_cost, is_active)
        - CoinLedger(user, kind, amount, balance_after, reason, ref_id)
        - CoinPack

Mavjud AI Analitika consumers.py da `user.coins -= cost` qilinardi — shu logika
shu yerda umumlashtiriladi.
"""
from django.conf import settings


# ClientAIPrice yozuvi bo'lmasa (yoki model hali migratsiya qilinmagan bo'lsa)
# ishlatiladigan standart narxlar. 0 = bepul (tanga yechilmaydi).
# AI funksiya tanga narxi (ClientAIPrice yozuvi bo'lmasa fallback).
# 1 tanga = 1000 so'm; qiymatlar real provider xarajati + marja asosida.
DEFAULT_PRICES = {
    'analytics_ai': 3,
    'ai_image': 2,          # FLUX Kontext — tez, arzon
    'ai_image_fast': 3,     # Nano Banana — tez muqobil
    'ai_image_precise': 5,  # Seedream 5.0 Pro Edit — aniq (mebel)
    'ai_image_smart': 8,    # Nano Banana Pro — aqlli/murakkab
    'ai_panorama': 5,
    'laylo_chat': 1,
    'gemini_live': 2,
}

# CoinLedger.kind qiymatlari (model kind maydoni tayyor bo'lmasa ham string ketadi).
KIND_SPEND = 'spend'
KIND_GRANT = 'grant'
KIND_REFUND = 'refund'


def ai_coins_enabled():
    """AI-tanga tizimi yoqilganmi? STANDART False (o'chiq)."""
    return bool(getattr(settings, 'CLIENT_AI_COINS', False))


def ai_price(action_key):
    """`action_key` uchun tanga narxi (int).

    Prioritet:
      1) ClientAIPrice(is_active=True).coin_cost — agar mavjud bo'lsa
      2) DEFAULT_PRICES[action_key]
      3) 0 (noma'lum kalit / model yo'q / xato => bepul)

    Model migratsiya qilinmagan yoki DB xatosi bo'lsa — jim ravishda DEFAULT/0.
    """
    try:
        from client_erp.models.billing import ClientAIPrice
        row = ClientAIPrice.objects.filter(
            action_key=action_key, is_active=True
        ).first()
        if row is not None and row.coin_cost is not None:
            return int(row.coin_cost)
    except Exception:
        # Model hali yo'q / migratsiya qilinmagan / DB xatosi — jim o'tamiz.
        pass
    try:
        return int(DEFAULT_PRICES.get(action_key, 0))
    except Exception:
        return 0


class InsufficientCoins(Exception):
    """Tanga yetarli emas. `need` — kerak, `balance` — hozirgi balans."""

    def __init__(self, need, balance):
        self.need = need
        self.balance = balance
        super().__init__(
            f"Tangalar yetarli emas. Kerak: {need}, Sizda: {balance}"
        )


def _write_ledger(user, kind, amount, balance_after, reason='', ref_id=''):
    """CoinLedger yozuvini yaratadi. Model yo'q / xato bo'lsa jim o'tadi."""
    try:
        from client_erp.models.billing import CoinLedger
        CoinLedger.objects.create(
            user=user,
            kind=kind,
            amount=amount,
            balance_after=balance_after,
            reason=reason or '',
            ref_id=str(ref_id or ''),
        )
    except Exception:
        # CoinLedger hali yo'q / migratsiya qilinmagan — moliya oqimini buzmaymiz.
        pass


def can_afford(user, action_key, hard=False):
    """Foydalanuvchi shu amalni bajara oladimi? (bool)

    O'chiq bo'lsa yoki narx 0 bo'lsa — doim True.
    hard=True — global gating (ai_coins_enabled) O'CHIQ bo'lsa ham tanga tekshiriladi
    (masalan Gemini Live: tanga bo'lmasa umuman yonmasin).
    """
    if not hard and not ai_coins_enabled():
        return True
    cost = ai_price(action_key)
    if cost <= 0:
        return True
    return (user.coins or 0) >= cost


def _db_alias():
    """Joriy tenant DB alias — atomic + select_for_update AYNI alias'da bo'lishi shart."""
    try:
        from tenant_manager.middleware import get_current_db_alias
        return get_current_db_alias() or 'default'
    except Exception:
        return 'default'


def charge(user, action_key, ref_id='', hard=False):
    """AI funksiya BOSHIDA chaqiriladi — tangani yechadi.

    Qaytaradi: haqiqatda yechilgan tanga miqdori (int).
      - O'chiq / narx 0  => HECH KIM bloklanmaydi, 0 yechiladi, `0` qaytadi.
      - Yetarli          => `cost` yechiladi, ledger yoziladi, `cost` qaytadi.
      - Yetmasa          => InsufficientCoins(need, balance) ko'tariladi.

    MUHIM: muvaffaqiyatsizlik FAQAT InsufficientCoins orqali bildiriladi.
    Chaqiruvchi natijaning "truthy"ligiga emas, exception'ga tayanishi kerak
    (aks holda tekin amal `0` qaytargani uchun noto'g'ri bloklanadi).

    Eslatma: `ai_coins_enabled()` standart False bo'lgani uchun (F2) amalda
    InsufficientCoins holati kelib chiqmaydi.
    """
    if not hard and not ai_coins_enabled():
        return 0

    cost = ai_price(action_key)
    if cost <= 0:
        return 0

    # Qatorni lock — parallel AI so'rovlarда lost-update/double-charge oldini oladi.
    from django.db import transaction
    from client_erp.models import ClientUser
    db = _db_alias()
    with transaction.atomic(using=db):
        u = ClientUser.objects.using(db).select_for_update().get(pk=user.pk)
        balance = u.coins or 0
        if balance < cost:
            raise InsufficientCoins(need=cost, balance=balance)
        new_balance = balance - cost
        u.coins = new_balance
        u.save(update_fields=['coins'])
        _write_ledger(u, KIND_SPEND, -cost, new_balance, reason=action_key, ref_id=ref_id)
    user.coins = new_balance  # chaqiruvchi obyektini sinxronlash
    from client_erp.services.realtime import push_wallet_update
    push_wallet_update(u)
    return cost


def recently_charged(user, action_key, window_sec=50):
    """Oxirgi `window_sec` soniya ichida shu amal uchun to'lov bo'lganmi?

    TZ-Tanga-Tolov-Adolat.md §2.2 — qayta ulanish oynasi.
    Internet uzilib qayta ulanganda / sahifa yangilanganda IKKINCHI marta
    to'lov olinmasligi uchun. Xato bo'lsa False (ya'ni to'lov olinadi —
    xavfsiz tomonga).
    """
    try:
        from django.utils import timezone
        from datetime import timedelta
        from client_erp.models import CoinLedger
        since = timezone.now() - timedelta(seconds=int(window_sec or 0))
        return CoinLedger.objects.using(_db_alias()).filter(
            user=user, kind=KIND_SPEND, reason=action_key,
            created_at__gte=since,
        ).exists()
    except Exception:                                             # noqa: BLE001
        return False


def grant(user, amount, reason='', kind=KIND_GRANT, ref_id=''):
    """Foydalanuvchiga tanga beradi (admin qo'lda / paket sotib olgach).

    Qaytaradi: berilgan miqdor (int). amount <= 0 bo'lsa hech nima qilmaydi.
    """
    try:
        amount = int(amount)
    except (TypeError, ValueError):
        return 0
    if amount <= 0:
        return 0

    from django.db import transaction
    from client_erp.models import ClientUser
    db = _db_alias()
    with transaction.atomic(using=db):
        u = ClientUser.objects.using(db).select_for_update().get(pk=user.pk)
        new_balance = (u.coins or 0) + amount
        u.coins = new_balance
        fields = ['coins']
        # coins_total_earned FAQAT haqiqiy daromadga (grant/refund musbat) oshadi.
        if amount > 0:
            u.coins_total_earned = (u.coins_total_earned or 0) + amount
            fields.append('coins_total_earned')
        u.save(update_fields=fields)
        _write_ledger(u, kind, amount, new_balance, reason=reason, ref_id=ref_id)
    user.coins = new_balance  # chaqiruvchi obyektini sinxronlash
    from client_erp.services.realtime import push_wallet_update
    push_wallet_update(u)
    return amount


def refund(user, amount, reason='', ref_id=''):
    """Tangani qaytaradi (masalan, AI amali muvaffaqiyatsiz tugagach)."""
    return grant(user, amount, reason=reason, kind=KIND_REFUND, ref_id=ref_id)
