"""
client_erp/services/crypto.py — To'lov token shifrlash servisi.

SavedCard.token (Payme recurring token) shifrlangan holda saqlanadi
(TZ-Payme-Subscribe-API.md xavfsizlik talabi). PAN hech qachon saqlanmaydi —
faqat token shifrlanadi.

Kalit: settings.PAYME_CARD_ENCRYPTION_KEY (Fernet kaliti, base64, 32 bayt).
  - Kalit bo'lsa       -> Fernet bilan shifrlash (prefiks "enc:").
  - Kalit bo'lmasa     -> shifrlashsiz (sandbox / F3), token o'zgarishsiz saqlanadi.

Deshifrlashda "enc:" prefiksiga qarab avtomatik aniqlanadi, shuning uchun
kalit keyinchalik qo'shilsa/o'chirilsa ham eski yozuvlar to'g'ri o'qiladi.

cryptography kutubxonasi (Fernet) o'rnatilgan (voicebot ishlatadi).
Import funksiya ichida — modul yuklanishi og'ir bog'liqlikka bog'lanmasin.
"""
from django.conf import settings

# Shifrlangan qiymat oldidagi belgi. Faqat shu prefiks bilan boshlanuvchi
# qiymatlar deshifrlanadi; qolganlari oddiy matn deb qabul qilinadi.
_ENC_PREFIX = "enc:"


def _fernet():
    """settings.PAYME_CARD_ENCRYPTION_KEY dan Fernet obyekti yaratadi.

    Kalit yo'q bo'lsa (yoki noto'g'ri bo'lsa) None qaytaradi — bu holda
    shifrlash o'tkazib yuboriladi (sandbox rejimi).
    """
    key = getattr(settings, "PAYME_CARD_ENCRYPTION_KEY", None)
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet
        if isinstance(key, str):
            key = key.encode("utf-8")
        return Fernet(key)
    except Exception:
        return None


def encrypt_token(plain):
    """Tokenni shifrlab str qaytaradi.

    - Kalit bo'lsa: Fernet bilan shifrlanadi, "enc:" prefiksi bilan qaytadi.
    - Kalit yo'q bo'lsa: plain o'zgarishsiz qaytadi (sandbox).
    - Har qanday xato: plain o'zgarishsiz qaytadi (to'lov oqimi buzilmasin).
    """
    if plain is None:
        return plain
    f = _fernet()
    if f is None:
        return plain
    try:
        token = f.encrypt(str(plain).encode("utf-8")).decode("utf-8")
        return _ENC_PREFIX + token
    except Exception:
        return plain


def decrypt_token(stored):
    """Saqlangan qiymatni deshifrlab str qaytaradi.

    - "enc:" prefiksi bo'lsa: Fernet bilan deshifrlanadi.
    - Prefiks bo'lmasa: stored o'zgarishsiz qaytadi (oddiy saqlangan / sandbox).
    - Har qanday xato: stored o'zgarishsiz qaytadi.
    """
    if stored is None:
        return stored
    if not str(stored).startswith(_ENC_PREFIX):
        return stored
    f = _fernet()
    if f is None:
        return stored
    try:
        token = str(stored)[len(_ENC_PREFIX):]
        return f.decrypt(token.encode("utf-8")).decode("utf-8")
    except Exception:
        return stored
