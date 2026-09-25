"""client_erp/models/room_plan_import.py — TZ-Xona-Qoshish-Chizmadan.md §F2.

Chizmadan (rasm / PDF / DXF / .b3d) xona qurish jarayoni. AI chaqiruvi
bir necha soniya davom etadi va gunicorn so'rovini bloklamasligi kerak,
shuning uchun natija SHU YERDA saqlanadi: veb-so'rov faqat qatorni
yaratadi, fon-oqim to'ldiradi, brauzer holatni so'rab turadi.

⚠️ BUTUNLAY YANGI, ALOHIDA model — mavjud `RoomCapture`/`PlacedModule`ga
bitta ham maydon qo'shilmaydi. Natija tasdiqlangandan keyingina xona
yaratiladi/yangilanadi.
"""
from django.db import models


class RoomPlanImport(models.Model):
    STATUS = [
        ('pending', 'Navbatda'),
        ('running', 'Ishlanmoqda'),
        ('done', 'Tayyor'),
        ('error', 'Xato'),
    ]
    KIND = [
        ('image', 'Rasm'),
        ('pdf', 'PDF'),
        ('dxf', 'DXF/AutoCAD'),
        ('b3d', 'Bazis .b3d'),
    ]

    client_user = models.ForeignKey(
        'client_erp.ClientUser', on_delete=models.CASCADE, related_name='plan_imports')
    zamer_id = models.IntegerField(null=True, blank=True)
    # Tasdiqlangach yaratilgan xona (tasdiqlanmaguncha bo'sh)
    room_id = models.IntegerField(null=True, blank=True)

    kind = models.CharField(max_length=10, choices=KIND, default='image')
    source_file = models.FileField(upload_to='room_plans/%Y/%m/')
    # Ko'rsatish uchun tayyorlangan PNG (PDF sahifasi / kichraytirilgan rasm)
    preview = models.ImageField(upload_to='room_plans/%Y/%m/', null=True, blank=True)

    status = models.CharField(max_length=10, choices=STATUS, default='pending')
    error_text = models.TextField(blank=True, default='')
    # AI/parser natijasi:
    # {"points": [[x,y],…], "openings": [{…}], "scale_known": true,
    #  "confidence": 0.0-1.0, "notes": "…", "provider": "claude"}
    result = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'client_erp'
        ordering = ['-created_at']

    def __str__(self):
        return f"RoomPlanImport#{self.pk} {self.kind} {self.status}"
