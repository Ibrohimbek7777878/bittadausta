"""Server (backend) xatolarini ko'rish (2026-09-04, show_client_errors bilan bir xil naqsh).

    manage.py show_server_errors                     — oxirgi 20 ta
    manage.py show_server_errors --kind render        — faqat render xatolari
    manage.py show_server_errors --full 12             — 12-xatoning traceback'i
    manage.py show_server_errors --resolve 12          — hal qilindi deb belgilash
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Server (backend) xatolari jurnali"

    def add_arguments(self, p):
        p.add_argument('--db', default='tenant_mebelcity')
        p.add_argument('--kind', default=None)
        p.add_argument('--limit', type=int, default=20)
        p.add_argument('--full', type=int, default=None)
        p.add_argument('--resolve', type=int, default=None)
        p.add_argument('--all', action='store_true', help='hal qilinganlarni ham')

    def handle(self, *a, **o):
        from tenant_manager.middleware import _thread_local
        _thread_local.db_alias = o['db']
        from client_erp.models import ServerErrorLog
        db = o['db']

        if o['resolve']:
            n = ServerErrorLog.objects.using(db).filter(pk=o['resolve']).update(is_resolved=True)
            self.stdout.write(f"#{o['resolve']} hal qilindi deb belgilandi ({n})")
            return

        if o['full']:
            e = ServerErrorLog.objects.using(db).filter(pk=o['full']).first()
            if not e:
                self.stdout.write('topilmadi')
                return
            self.stdout.write(f"#{e.pk} [{e.kind}] ×{e.count}")
            self.stdout.write(f"  manba         : {e.source}")
            if e.username:
                self.stdout.write(f"  foydalanuvchi : {e.username}")
            if e.request_path:
                self.stdout.write(f"  so'rov yo'li  : {e.request_path}")
            self.stdout.write(f"  birinchi/oxirgi: {e.first_seen:%d.%m %H:%M} → {e.last_seen:%d.%m %H:%M}")
            self.stdout.write(f"\n  {e.message}\n")
            if e.traceback:
                self.stdout.write('  ── traceback ──')
                for ln in e.traceback.split('\n')[:40]:
                    self.stdout.write('  ' + ln)
            if e.extra:
                self.stdout.write(f"  extra: {e.extra}")
            return

        qs = ServerErrorLog.objects.using(db).all()
        if not o['all']:
            qs = qs.filter(is_resolved=False)
        if o['kind']:
            qs = qs.filter(kind=o['kind'])
        rows = list(qs[:o['limit']])
        if not rows:
            self.stdout.write('Xato yo\'q ✅')
            return
        self.stdout.write('%-5s %-8s %-5s %-30s %s' % (
            'id', 'tur', 'soni', 'manba', 'xabar'))
        for e in rows:
            self.stdout.write('%-5s %-8s %-5s %-30s %s' % (
                e.pk, e.kind, e.count, (e.source or '—')[:30],
                (e.message or '')[:70].replace('\n', ' ')))
        self.stdout.write(f"\nJami: {qs.count()} ta (hal qilinmagan)")
        self.stdout.write("Batafsil: manage.py show_server_errors --full <id>")
