"""client_erp/models/client_error.py — BRAUZER XATOLARI jurnali (2026-08-24).

Nega kerak (foydalanuvchi so'zi): «kod tomondan qilganda to'g'rilab
ketaveryapsan, lekin qo'lda real ishlatib ko'rganda xatolar to'xtovsiz
chiqayapti — har qanday turdagi errorni ushlaydigan bo'lsin».

Brauzerda yuz bergan HAR QANDAY xato shu jadvalga tushadi:
JS xatosi, ushlanmagan promise, muvaffaqiyatsiz fetch/XHR, WebSocket
uzilishi, BLE/kamera xatolari, `console.error`.

⚠️ BUTUNLAY YANGI, ALOHIDA jadval — mavjud biror modelga bitta ham
maydon qo'shilmaydi.
"""
import hashlib

from django.db import models


class ClientErrorLog(models.Model):
    KIND = [
        ('js', 'JS xatosi'),
        ('promise', 'Ushlanmagan promise'),
        ('fetch', 'So\'rov xatosi'),
        ('ws', 'WebSocket'),
        ('ble', 'Bluetooth / lazer'),
        ('media', 'Kamera / fayl'),
        ('console', 'console.error'),
        ('manual', 'Qo\'lda yuborilgan'),
    ]

    client_user = models.ForeignKey(
        'client_erp.ClientUser', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='error_logs')
    username = models.CharField(max_length=64, blank=True, default='')

    kind = models.CharField(max_length=12, choices=KIND, default='js', db_index=True)
    message = models.TextField()
    stack = models.TextField(blank=True, default='')

    # Qayerda yuz berdi
    page = models.CharField(max_length=300, blank=True, default='')   # location.href
    source = models.CharField(max_length=300, blank=True, default='') # fayl:qator
    # So'rov xatosi bo'lsa
    req_url = models.CharField(max_length=300, blank=True, default='')
    req_status = models.IntegerField(null=True, blank=True)

    # Qurilma
    user_agent = models.CharField(max_length=300, blank=True, default='')
    platform = models.CharField(max_length=60, blank=True, default='')  # telegram/chrome/ios…
    screen = models.CharField(max_length=32, blank=True, default='')

    # Qo'shimcha (oxirgi bosilgan tugma, tanlangan modul va h.k.)
    extra = models.JSONField(null=True, blank=True)

    # ── DEDUPLIKATSIYA ──────────────────────────────────────────────
    # Bir xil xato 100 marta takrorlansa 100 qator emas, BITTA qator
    # bo'lsin (`count` oshadi) — jadval to'lib ketmasin.
    fingerprint = models.CharField(max_length=40, db_index=True)
    count = models.IntegerField(default=1)

    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)
    is_resolved = models.BooleanField(default=False, db_index=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-last_seen']
        indexes = [models.Index(fields=['-last_seen', 'is_resolved'])]

    def __str__(self):
        return f"[{self.kind}] {self.message[:60]} ×{self.count}"

    @staticmethod
    def make_fingerprint(kind, message, source=''):
        """Bir xil xatoni tanish uchun barmoq izi. Xabardagi o'zgaruvchi
        raqamlar (id, vaqt) olib tashlanadi — aks holda har chaqiruv
        yangi qator bo'lardi."""
        import re
        base = re.sub(r'\d+', 'N', (message or '')[:300]) + '|' + (source or '')[:120]
        return hashlib.sha1(base.encode('utf-8', 'replace')).hexdigest()[:40]
