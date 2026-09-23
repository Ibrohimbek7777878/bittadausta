"""Brauzer xatolarini ko'rish (2026-08-24).

    manage.py show_client_errors                     — oxirgi 20 ta
    manage.py show_client_errors --kind ble          — faqat lazer/BLE
    manage.py show_client_errors --user bigone_cl2
    manage.py show_client_errors --full 12           — 12-xatoning stack'i
    manage.py show_client_errors --resolve 12        — hal qilindi deb belgilash
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Brauzerda yuz bergan xatolar jurnali"

    def add_arguments(self, p):
        p.add_argument('--db', default='tenant_mebelcity')
        p.add_argument('--kind', default=None)
        p.add_argument('--user', default=None)
        p.add_argument('--limit', type=int, default=20)
        p.add_argument('--full', type=int, default=None)
        p.add_argument('--resolve', type=int, default=None)
        p.add_argument('--all', action='store_true', help='hal qilinganlarni ham')

    def handle(self, *a, **o):
        from tenant_manager.middleware import _thread_local
        _thread_local.db_alias = o['db']
        from client_erp.models import ClientErrorLog
        db = o['db']

        if o['resolve']:
            n = ClientErrorLog.objects.using(db).filter(pk=o['resolve']).update(is_resolved=True)
            self.stdout.write(f"#{o['resolve']} hal qilindi deb belgilandi ({n})")
            return

        if o['full']:
            e = ClientErrorLog.objects.using(db).filter(pk=o['full']).first()
            if not e:
                self.stdout.write('topilmadi')
                return
            self.stdout.write(f"#{e.pk} [{e.kind}] ×{e.count}")
            self.stdout.write(f"  foydalanuvchi : {e.username}")
            self.stdout.write(f"  qurilma       : {e.platform} · {e.screen}")
            self.stdout.write(f"  sahifa        : {e.page}")
            self.stdout.write(f"  manba         : {e.source}")
            if e.req_url:
                self.stdout.write(f"  so'rov        : {e.req_status} {e.req_url}")
            self.stdout.write(f"  birinchi/oxirgi: {e.first_seen:%d.%m %H:%M} → {e.last_seen:%d.%m %H:%M}")
            self.stdout.write(f"\n  {e.message}\n")
            if e.stack:
                self.stdout.write('  ── stack ──')
                for ln in e.stack.split('\n')[:25]:
                    self.stdout.write('  ' + ln)
            if e.extra:
                self.stdout.write(f"  extra: {e.extra}")
            return

        qs = ClientErrorLog.objects.using(db).all()
        if not o['all']:
            qs = qs.filter(is_resolved=False)
        if o['kind']:
            qs = qs.filter(kind=o['kind'])
        if o['user']:
            qs = qs.filter(username=o['user'])
        rows = list(qs[:o['limit']])
        if not rows:
            self.stdout.write('Xato yo\'q ✅')
            return
        self.stdout.write('%-5s %-8s %-5s %-14s %-11s %s' % (
            'id', 'tur', 'soni', 'foydalanuvchi', 'qurilma', 'xabar'))
        for e in rows:
            self.stdout.write('%-5s %-8s %-5s %-14s %-11s %s' % (
                e.pk, e.kind, e.count, (e.username or '—')[:14],
                (e.platform or '?')[:11], (e.message or '')[:70].replace('\n', ' ')))
        self.stdout.write(f"\nJami: {qs.count()} ta (hal qilinmagan)")
        self.stdout.write("Batafsil: manage.py show_client_errors --full <id>")
