# -*- coding: utf-8 -*-
"""
run_month_end_profit_reminders — F9-b (2026-08-04).

Foydalanuvchi so'rovi: "oy oxirigacha jamoa a'zolariga ulush bo'lib
berilmasa, tizim o'zi avtomatik yechib yuborsin". PUL HARAKATINI
AVTOMATLASHTIRISH XAVFLI (H6 — bekor qilish mexanizmi hali yo'q, K4 — naqd
hali kelmagan bo'lishi mumkin), shuning uchun xavfsizroq muqobil tanlandi
(2026-08-04 qaror): tizim pul YUBORMAYDI, faqat EGAGA eslatma yuboradi.

Mantiq: har bir `owner` uchun, shu OYDA "delivered" bo'lgan, `profit_shares`
belgilangan buyurtmalar orasida `contract_profit` yig'indisi bilan
`ClientProfitWithdrawal.total_profit` yig'indisi solishtiriladi. Farq (hali
yechilmagan qism) > 0 bo'lsa va OYNING OXIRGI 3 KUNIDA bo'lsak — bitta
birlashtirilgan Telegram xabar yuboriladi (oyiga BIR MARTA,
`ClientMonthEndReminderLog` bilan idempotent — `run_daily_reminders.py`dagi
bilan bir xil falsafada).

Ikki rejim:
  - Bir martalik: --db bilan bitta tenant DB uchun ishga tushadi va chiqadi.
  - --loop: dedicated systemd servis sifatida uzluksiz ishlaydi, har
    --interval soniyada BARCHA faol tenantlar bo'yicha aylanadi.

Ishlatish:
  python manage.py run_month_end_profit_reminders --db=tenant_mebelcity
  python manage.py run_month_end_profit_reminders --loop --interval=3600
"""
from __future__ import annotations

import time
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connections
from django.db.models import Sum, Q
from django.utils import timezone

# Oyning oxirgi N kalendar kunida eslatma yuboriladi (xizmat vaqti-vaqti bilan
# to'xtab qolsa ham eslatma "yo'qolib" ketmasligi uchun bitta kunga emas,
# oynaga tayanadi).
REMINDER_WINDOW_DAYS = 3


class Command(BaseCommand):
    help = "Oy oxirida jamoaga hali bo'lib berilmagan foyda ulushi haqida egaga eslatma (pul o'tkazmaydi)."

    def add_arguments(self, parser):
        parser.add_argument('--db', type=str, default='tenant_mebelcity')
        parser.add_argument('--loop', action='store_true')
        parser.add_argument('--interval', type=int, default=3600)

    def handle(self, *args, **options):
        if options['loop']:
            self._loop_forever(options['interval'])
            return
        self._run_for_db(options['db'])

    def _loop_forever(self, interval):
        self.stdout.write(self.style.SUCCESS(
            "run_month_end_profit_reminders --loop ishga tushdi (har %ds)" % interval))
        while True:
            try:
                self._tick_all_tenants()
            except Exception as e:
                self.stderr.write("Xatolik (tsikl davom etadi): %s" % e)
            time.sleep(interval)

    def _tick_all_tenants(self):
        from tenant_manager.models import Tenant

        for tenant_obj in Tenant.objects.exclude(status='deleted'):
            alias = tenant_obj.get_db_alias()
            if alias not in settings.DATABASES:
                settings.DATABASES[alias] = tenant_obj.get_db_config()
                if alias in connections:
                    del connections[alias]
            try:
                self._run_for_db(alias)
            except Exception as e:
                self.stderr.write("[%s] xatolik: %s" % (alias, e))

    def _run_for_db(self, db):
        import tenant_manager.middleware as tmid
        prev_alias = getattr(tmid._thread_local, 'db_alias', 'default')
        prev_tenant = getattr(tmid._thread_local, 'tenant', None)
        tmid._thread_local.db_alias = db
        try:
            from tenant_manager.models import Tenant
            tmid._thread_local.tenant = Tenant.objects.filter(
                db_name__icontains=db.replace('tenant_', '')).first()
        except Exception:
            pass
        try:
            self._check(db)
        finally:
            tmid._thread_local.db_alias = prev_alias
            tmid._thread_local.tenant = prev_tenant

    def _check(self, db):
        today = timezone.localdate()
        # Oyning oxirgi kuni (keyingi oyning 1-kunidan 1 kun oldin)
        if today.month == 12:
            next_month_first = today.replace(year=today.year + 1, month=1, day=1)
        else:
            next_month_first = today.replace(month=today.month + 1, day=1)
        days_left = (next_month_first - today).days
        if days_left > REMINDER_WINDOW_DAYS:
            return  # oy oxiriga hali uzoq — hech narsa qilmaymiz

        from client_erp.models import ClientUser, ClientOrder, ClientProfitWithdrawal, ClientMonthEndReminderLog
        from client_erp.services.notifications import notify_month_end_pending_shares

        month_start = today.replace(day=1)
        for user in ClientUser.objects.using(db).filter(is_active=True, telegram_chat_id__isnull=False).exclude(telegram_chat_id=''):
            # Idempotentlik — shu oy shu egaga allaqachon yuborilganmi
            already = ClientMonthEndReminderLog.objects.using(db).filter(
                owner_id=user.id, year=today.year, month=today.month,
            ).exists()
            if already:
                continue

            orders = list(ClientOrder.objects.using(db).filter(
                owner_id=user.id, status='delivered', is_deleted=False,
                delivered_at__gte=month_start,
            ).filter(profit_shares__isnull=False).distinct())
            if not orders:
                continue

            pending_count = 0
            pending_total = Decimal('0')
            for o in orders:
                full = Decimal(str(o.contract_profit or 0))
                if full <= 0:
                    continue
                withdrawn = (ClientProfitWithdrawal.objects.using(db)
                             .filter(order=o)
                             .aggregate(s=Sum('total_profit'))['s'] or 0)
                remaining = full - Decimal(str(withdrawn))
                if remaining > 1:
                    pending_count += 1
                    pending_total += remaining

            if pending_count == 0:
                continue

            try:
                notify_month_end_pending_shares(user, pending_count, float(pending_total))
            except Exception as e:
                self.stderr.write(f"[{db}] xabar yuborilmadi (owner={user.id}): {e}")
                continue
            ClientMonthEndReminderLog.objects.using(db).create(
                owner_id=user.id, year=today.year, month=today.month,
            )
