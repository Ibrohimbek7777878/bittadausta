"""client_erp/models/server_error.py — SERVER (backend/Python) xatolari jurnali (2026-09-04).

`ClientErrorLog` (client_error.py) — brauzer/frontend xatolarini ushlaydi.
Bu model — SERVER tomonida (view, servis, worker) yuz bergan har qanday
Python xatosini ushlaydi (masalan Detal QR render xatosi, Chromium
topilmadi, parser xatosi va h.k.) — foydalanuvchi so'rovi (2026-09-04):
«har bir turdagi errorni ushlay oladigan bo'lishi kerak».

Chaqirish: `client_erp.services.server_error.log_server_error(...)` —
istalgan try/except blokidan bir qatorda chaqiriladi, HECH QACHON o'zi
xato bermaydi (log yozib bo'lmasa jim ravishda o'tkazib yuboradi).

⚠️ BUTUNLAY YANGI, ALOHIDA jadval — mavjud biror modelga bitta ham
maydon qo'shilmaydi.
"""
import hashlib

from django.db import models


class ServerErrorLog(models.Model):
    KIND = [
        ('view', 'HTTP view xatosi'),
        ('render', '.b3d / rasm render'),
        ('parser', 'Fayl parslash'),
        ('ws', 'WebSocket handler'),
        ('worker', 'Fon jarayon / worker'),
        ('external', 'Tashqi API/servis'),
        ('other', 'Boshqa'),
    ]

    kind = models.CharField(max_length=12, choices=KIND, default='other', db_index=True)
    message = models.TextField()
    traceback = models.TextField(blank=True, default='')

    # Qayerda yuz berdi
    source = models.CharField(max_length=300, blank=True, default='')   # modul.funksiya
    username = models.CharField(max_length=64, blank=True, default='')  # aloqador foydalanuvchi (bo'lsa)
    request_path = models.CharField(max_length=300, blank=True, default='')

    # Qo'shimcha kontekst (masalan fayl nomi, order_id)
    extra = models.JSONField(null=True, blank=True)

    # ── DEDUPLIKATSIYA ── (ClientErrorLog bilan bir xil naqsh)
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
        import re
        base = re.sub(r'\d+', 'N', (message or '')[:300]) + '|' + (source or '')[:120]
        return hashlib.sha1(base.encode('utf-8', 'replace')).hexdigest()[:40]
