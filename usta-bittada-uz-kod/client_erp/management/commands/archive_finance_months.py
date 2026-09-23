"""client_erp/management/commands/archive_finance_months.py — Oylik moliya arxivi.

Bir foydalanuvchining `--before` sanasidan OLDINGI har bir oy uchun
`serialize_finance_page`/`serialize_analytics` natijasini HOZIRGI holatida
"suratga oladi" (ClientFinanceMonthArchive), keyin bu yozuv hech qachon
o'zgartirilmaydi — kelajakda formula tuzatilsa ham arxivlangan oy raqamlari
o'zgarmay qoladi.

FAQAT O'QIYDI (ClientFinanceRecord/ClientOrderga bitta ham yozuv qo'shmaydi/
o'zgartirmaydi) — TZ: client_erp/DOCS/TZ-Moliya-Tarix-Arxiv-Avgust-Boshlanish.md

Ishlatish:
    manage.py archive_finance_months --user bigone_cl2 --before 2026-08
    manage.py archive_finance_months --user bigone_cl2 --before 2026-08 --dry-run
"""
import json
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError


def _clean(o):
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_clean(v) for v in o]
    return o


class Command(BaseCommand):
    help = "Avgustdan oldingi oylarni ClientFinanceMonthArchive'ga muzlatib yozadi"

    def add_arguments(self, parser):
        parser.add_argument('--user', type=str, required=True, help='ClientUser username')
        parser.add_argument('--before', type=str, required=True, help="'YYYY-MM' — shu oydan OLDINGI oylar arxivlanadi")
        parser.add_argument('--db', type=str, default='tenant_mebelcity', help='Tenant DB alias')
        parser.add_argument('--dry-run', action='store_true', help='Faqat ko\'rsatadi, DB\'ga yozmaydi')
        parser.add_argument('--force', action='store_true', help="Mavjud arxiv yozuvini o'chirib qayta yaratadi")

    def handle(self, *args, **opts):
        # ⚠️ TENANT KONTEKSTI SHART (finance_snapshot.py uslubida) — aks holda
        # so'rovlar DEFAULT bazaga ketadi va bo'sh natija qaytadi.
        from tenant_manager.middleware import _thread_local
        _thread_local.db_alias = opts['db']
        try:
            from tenant_manager.models import Tenant
            _thread_local.tenant = Tenant.objects.filter(db_name__icontains='mebelcity').first()
        except Exception:
            pass

        from django.db.models.functions import TruncMonth
        from client_erp.models import ClientUser, ClientFinanceRecord, ClientFinanceMonthArchive
        from client_erp.serializers import serialize_finance_page, serialize_analytics

        try:
            user = ClientUser.objects.using(opts['db']).get(username=opts['user'])
        except ClientUser.DoesNotExist:
            raise CommandError(f"ClientUser '{opts['user']}' topilmadi ({opts['db']})")

        before = opts['before']
        months = sorted({
            row['_m'].strftime('%Y-%m')
            for row in ClientFinanceRecord.objects.using(opts['db'])
                .filter(owner=user)
                .annotate(_m=TruncMonth('date')).values('_m').distinct()
            if row['_m'] and row['_m'].strftime('%Y-%m') < before
        })

        if not months:
            self.stdout.write(self.style.WARNING(f"'{before}'dan oldingi oy topilmadi."))
            return

        self.stdout.write(f"\nArxivlanadigan oylar: {', '.join(months)}\n")
        self.stdout.write(f"{'Oy':<9}{'Kirim':>16}{'Chiqim':>16}{'Foyda(KPI)':>16}{'Balans':>16}{'Sof foyda':>16}\n")
        self.stdout.write('-' * 89 + '\n')

        results = []
        for ym in months:
            fdata = serialize_finance_page(user, period='month', ym=ym)
            adata = serialize_analytics(user, period='month', ym=ym)
            stats = fdata['stats']
            sof = fdata['sof_foyda']
            self.stdout.write(
                f"{ym:<9}{stats['total_income']:>16}{stats['total_expense']:>16}"
                f"{stats['profit']:>16}{stats['balance']:>16}{sof['total']:>16}\n"
            )
            results.append((ym, fdata, adata))

        if opts['dry_run']:
            self.stdout.write(self.style.WARNING("\n--dry-run: DB'ga hech narsa yozilmadi."))
            return

        written = 0
        skipped = 0
        for ym, fdata, adata in results:
            existing = ClientFinanceMonthArchive.objects.using(opts['db']).filter(owner=user, ym=ym).first()
            if existing:
                if not opts['force']:
                    self.stdout.write(self.style.WARNING(f"  {ym}: arxiv allaqachon mavjud (frozen_at={existing.frozen_at}) — o'tkazib yuborildi (--force bilan qayta yozish mumkin)"))
                    skipped += 1
                    continue
                existing.delete()
            ClientFinanceMonthArchive.objects.using(opts['db']).create(
                owner=user, ym=ym,
                finance_snapshot=_clean(fdata),
                analytics_snapshot=_clean(adata),
            )
            written += 1

        self.stdout.write(self.style.SUCCESS(f"\n{written} ta oy arxivlandi, {skipped} ta o'tkazib yuborildi."))
