"""client_erp/management/commands/purge_demos.py — Muddati o'tgan demo akkauntlarni o'chirish.

Demo user kirganda (auth_backend) avtomatik o'chadi, lekin hech qachon
kirmasa — qator DB'da qoladi. Bu komanda cron (har soat) orqali tozalaydi.

Ishlatish:
    manage.py purge_demos
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Muddati o'tgan demo akkauntlar + datalarini o'chiradi"

    def handle(self, *args, **options):
        from client_erp.services.team_invites import purge_expired_demos
        n = purge_expired_demos()
        self.stdout.write(self.style.SUCCESS(f"O'chirildi: {n} ta demo"))
