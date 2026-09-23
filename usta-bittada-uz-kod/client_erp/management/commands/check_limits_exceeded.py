"""client_erp/management/commands/check_limits_exceeded.py — Gating YOQISHdan
OLDINGI bir martalik xavfsizlik nazorati (2026-09-23, additive).

Har bir faol user uchun LIMITS registridagi barcha kalit bo'yicha
`status()['exceeded']` tekshiradi. `True` chiqqanlar ro'yxatini chiqaradi —
ULarga OLDIN xabar berib, keyin gating yoqiladi.

Ishlatish:
    manage.py check_limits_exceeded
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Gating oldidan limitdan oshgan userlarni topadi"

    def handle(self, *args, **options):
        from client_erp.models import ClientUser
        from client_erp.services.limits import LIMITS, status
        keys = list(LIMITS.keys())
        self.stdout.write(f"Tekshiriladi: {keys}")
        bad = 0
        total = 0
        for u in ClientUser.objects.filter(is_active=True).iterator():
            total += 1
            try:
                over = [k for k in keys if status(u, k).get('exceeded')]
            except Exception:
                continue
            if over:
                bad += 1
                self.stdout.write(
                    f"OSHGAN: {u.full_name} ({u.phone}) — {','.join(over)}")
        self.stdout.write(self.style.SUCCESS(
            f"Tayyor: {total} user, oshgan: {bad}"))
