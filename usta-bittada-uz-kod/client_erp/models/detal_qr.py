"""client_erp/models/detal_qr.py — Detal QR (2026-09-04).

TZ-Detal-QR-2026-09.md: usta Bazis dasturida 3D ko'rinishni rasm sifatida
eksport qiladi (Bazisning o'z funksiyasi — .b3d fayldan avtomatik server
render qilib bo'lmaydi, format yopiq), keyin shu rasmni bu yerga yuklaydi.
Tizim avtomatik qisqa kod + QR-kod + login talab qilmaydigan jamoat sahifa
yaratadi (namuna: tashqi @detalqr_bot, natija bir xil — faqat render bosqichi
qo'lda). Buyurtmaga bog'lanishi ixtiyoriy — bitta buyurtmada bir nechta
(har modul uchun alohida) yoki buyurtmasiz mustaqil kartochka ham bo'lishi
mumkin (foydalanuvchi: "hohlasa bitalab qilib olsin hohlasa umumiy qilsin").
"""
import secrets

from django.db import models


def _gen_short_code():
    return secrets.token_urlsafe(6).replace('-', '').replace('_', '')[:8]


class ClientDetalCard(models.Model):
    order = models.ForeignKey(
        'client_erp.ClientOrder', on_delete=models.CASCADE,
        null=True, blank=True, related_name='detal_cards',
    )
    owner = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='detal_cards')
    short_code = models.CharField(max_length=16, unique=True, default=_gen_short_code, db_index=True)
    title = models.CharField(max_length=255)
    artikul = models.CharField(max_length=100, blank=True, default='')
    detal_count = models.PositiveIntegerField(null=True, blank=True)
    image = models.ImageField(upload_to='client_erp/detal_qr/')
    # Interaktiv 3D uchun panel-darajasidagi ma'lumot (2026-09-04, TZ-Detal-QR-
    # Interaktiv-3D). Har elementda: code/name/width_mm/height_mm/thickness_mm/
    # material/edges/positions/indices/color (client_erp/services/b3d_panels.py).
    # `.b3d` orqali yaratilganda to'ladi; `image` orqali (qo'lda rasm) yaratilsa
    # bo'sh qoladi — frontend bunda statik `image`ga tushadi (zaxira rejimi).
    panel_data = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']

    def __str__(self):
        return self.title
