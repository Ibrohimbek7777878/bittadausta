"""client_erp/models/room_capture.py — TZ-Usta-Bittada-Modul-Tanlash.md §7.

BUTUNLAY YANGI, ALOHIDA model-fayl — mavjud ClientZamer/ClientZamerRoom
(client_erp/models/zamer.py, "erkin zamer") ga TEGILMAYDI, alohida maqsad:
BLE-lazer bilan devor-devor o'lchov + harf-belgili poligon.
"""
from django.db import models


class RoomCapture(models.Model):
    """Bitta BLE-o'lchov sessiyasi — bir xona (TZ §7.4)."""
    client_user = models.ForeignKey('client_erp.ClientUser', on_delete=models.CASCADE, related_name='room_captures')
    zamer_id = models.IntegerField(null=True, blank=True)  # widget_zamer.Zamer.pk (ixtiyoriy bog'lanish, real FK emas — boshqa app)
    room_name = models.CharField(max_length=100, blank=True, default='')
    height_mm = models.IntegerField(default=2700)
    # Qo'lda kiritilgan/o'zgartirilgan xona kengligi/chuqurligi (2026-08-14,
    # TZ §8.7 — davom ettirish uchun saqlanadi; null bo'lsa Zamer'dan olingan
    # boshlang'ich qiymat ishlatiladi, hech narsa buzilmaydi).
    width_mm = models.IntegerField(null=True, blank=True)
    depth_mm = models.IntegerField(null=True, blank=True)
    # Bezak: devor / shift / pol / mebel uchun rang va tekstura tanlovi
    # (2026-08-15). Shakli: {"wall": {"color": "#e8e4dc", "tex": "White.jpg"},
    # "ceil": {...}, "floor": {...}, "mod": {"color": null}}
    finish = models.JSONField(null=True, blank=True)
    # ── 2026-08-18, TZ-Xona-Qoshish-Chizmadan.md §F1 ────────────────────
    # `outline`  — xona shakli (Coohom uslubidagi poligon):
    #     {"points": [[x, y], ...], "thickness_mm": 100}
    #     Koordinata MM da, xonaning o'z koordinata tizimida.
    #     null = eski xona → `RoomWallSegment` (A/B/C uzunliklari) bo'yicha
    #     avvalgidek quriladi. HECH NARSA BUZILMAYDI.
    # `openings` — devordagi eshik/deraza teshiklari:
    #     [{"wall": 0, "offset": 800, "width": 900, "height": 2100,
    #       "sill": 0, "kind": "eshik"|"deraza"}]
    #     `wall` — outline.points dagi segment indeksi (0 dan boshlab),
    #     `offset` — segment boshidan mm, `sill` — poldan balandlik.
    outline = models.JSONField(null=True, blank=True)
    openings = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']

    def __str__(self):
        return f"RoomCapture#{self.pk} {self.room_name}"


class PlacedModule(models.Model):
    """Xonaga joylashtirilgan bitta modul — joylashuv+hajm saqlanadi, sahifa
    yopilib qayta ochilganda davom etish uchun (TZ §8.7, 2026-08-14).
    Katalogdan (source='catalog') kelgan bo'lsa `furniture_module_id` orqali
    haqiqiy mesh qayta so'raladi; o'z faylidan (source='upload') kelgan
    bo'lsa mesh ma'lumoti QAYTA HOSIL BO'LMAYDI (asl fayl saqlanmaydi) —
    shuning uchun `mesh_parts`ning o'zi to'liq saqlanadi."""
    room = models.ForeignKey(RoomCapture, on_delete=models.CASCADE, related_name='placed_modules')
    source = models.CharField(max_length=10, default='catalog', choices=[
        ('catalog', 'Katalog'), ('upload', 'Fayldan'),
        ('wall', 'Devor jihozi'),      # rozetka/oyna/kartina… (2026-08-18 §M5)
    ])
    furniture_module_id = models.IntegerField(null=True, blank=True)
    width_mm = models.FloatField()
    height_mm = models.FloatField()
    depth_mm = models.FloatField()
    category = models.CharField(max_length=30, blank=True, default='')
    px = models.FloatField()
    py = models.FloatField()
    scale_f = models.FloatField(default=1)
    rot_deg = models.FloatField(default=0)        # Y o'qi (gorizontal burilish)
    rot_x_deg = models.FloatField(default=0)      # X o'qi (oldinga/orqaga ag'darish)
    rot_z_deg = models.FloatField(default=0)      # Z o'qi (yonga ag'darish)
    # ── 2026-08-18 (TZ-3D-Modul §M3/§M5) ──────────────────────────────
    # `color`      — foydalanuvchi tanlagan rang (bo'sh = fayldagi asl rang)
    # `part_label` — bo'lak nomi («Tortma 3», «Korpus») ajratilgan bo'lsa
    # `is_wall_item` — devorga qo'yilgan jihoz (rozetka, oyna, kartina...)
    color = models.CharField(max_length=16, blank=True, default='')
    part_label = models.CharField(max_length=40, blank=True, default='')
    is_wall_item = models.BooleanField(default=False)
    # ── 2026-08-18 (TZ-Detal-Joyiga-Qoyish.md §D1/§D7) ────────────────
    # `pz`    — poldan balandlik (mm). Detalni "ushlab ko'tarish" shu
    #           maydonni o'zgartiradi; 0 = polda turadi (eski xatti-harakat).
    # `home_*`— detal ajratilgandagi ASL joyi. Mo'ljal ("arvoh") shu yerda
    #           ko'rsatiladi va sudrab yaqin kelinganda shu yerga yopishadi.
    #           null = mo'ljal yo'q (ajratilmagan modul) — hech narsa
    #           ko'rsatilmaydi, avvalgidek erkin ko'chadi.
    pz = models.FloatField(default=0)
    home_x = models.FloatField(null=True, blank=True)
    home_y = models.FloatField(null=True, blank=True)
    home_z = models.FloatField(null=True, blank=True)

    mesh_parts = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'

    def __str__(self):
        return f"PlacedModule#{self.pk} room={self.room_id}"


class RoomWallSegment(models.Model):
    """Bitta devor o'lchovi — harf-belgili, ketma-ket (TZ §7.4)."""
    room = models.ForeignKey(RoomCapture, on_delete=models.CASCADE, related_name='segments')
    label = models.CharField(max_length=1)   # A/B/C/D/E/F
    length_mm = models.IntegerField()
    order = models.IntegerField(default=0)   # poligon yopish ketma-ketligi
    source = models.CharField(max_length=10, choices=[('ble', 'BLE lazer'), ('manual', "Qo'lda")], default='manual')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['order']

    def __str__(self):
        return f"{self.label}: {self.length_mm}mm ({self.source})"
