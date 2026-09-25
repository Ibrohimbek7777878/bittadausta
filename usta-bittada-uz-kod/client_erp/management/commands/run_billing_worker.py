"""
run_billing_worker — Mini ERP (client_erp) TARIF AVTO-YANGILASH poll-worker.

systemd: bittada-billing-worker.service (yoki cron --once)

NEGA ALOHIDA WORKER (media-worker / cp-poller pattern)?
    Recurring billing UZOQ, davriy ish. Celery O'LIK (worker yo'q) —
    .delay() jim yo'qoladi. gunicorn ichida threading.Thread ochsak, worker
    recycle qilinganda o'lib qoladi. Shuning uchun mustaqil systemd poll-worker:
    while True → sleep(interval) → DB poll → har sikldan keyin close_all().

XAVFSIZLIK (eng muhim qoida)
============================
`billing_live()` STANDART False (sandbox). False bo'lganda bu worker
HECH NARSA qilmaydi (no-op) — real pul harakati YO'Q. Real avto-to'lov FAQAT
settings.BILLING_LIVE=True VA Payme kalitlari sozlangan bo'lsagina ishga tushadi.

OQIM (billing_live() True bo'lganda)
====================================
  1. Muddati yaqinlashgan tariflarni tanla:
       ClientUser(plan!=None, is_active, plan_expires_at <= now + 1 kun),
       bepul (is_free) tariflar ISTISNO.
  2. Har biri uchun aktiv Payme SavedCard bo'lsa → recurring charge urinishi
       (receipts.create + receipts.pay(token)). Muvaffaqiyat →
       service.confirm() (plan_expires_at uzaytiriladi + ClientSubscription).
  3. Retry jadvali 0/2/4 kun (har urinish orasi 2 kun). 3 marta ketma-ket
       muvaffaqiyatsiz → plan=None (Free) + AdminNotification/log.
  4. Har user try/except (bittasi yiqilsa qolganlari davom etadi), butun sikl
       ham try/except; har sikldan keyin connections.close_all() (DB leak yo'q).

Ishlatish:
    manage.py run_billing_worker --tenant mebelcity                # doimiy (default 3600s)
    manage.py run_billing_worker --tenant mebelcity --interval 1800
    manage.py run_billing_worker --tenant mebelcity --once         # bitta sikl (cron)

KATTA ERP ga TEGINMAYDI — faqat client_erp (mini ERP) modellari; AdminNotification
yozuvi additiv/best-effort.
"""
import logging
import time
from collections import Counter
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger('client_erp.billing')

# Recurring urinish jadvali (expiry'dan kun; har urinish orasi 2 kun).
# 3 urinish (0, 2, 4-kun) — hammasi fail bo'lsa → Bepul (Free) ga tushiriladi.
RETRY_OFFSET_DAYS = [0, 2, 4]


class Command(BaseCommand):
    help = "Mini ERP tarif avto-yangilash worker (bittada-billing-worker service)"

    def add_arguments(self, parser):
        parser.add_argument("--tenant", default="mebelcity",
                            help="Tenant slug (default: mebelcity)")
        parser.add_argument("--interval", type=int, default=3600,
                            help="Sikllar orasidagi kutish (soniya, default: 3600)")
        parser.add_argument("--once", action="store_true",
                            help="Faqat bitta sikl ishlatib chiqib ketadi (cron uchun)")

    # ─────────────────────────────────────────────────────────────────
    #  Asosiy tsikl
    # ─────────────────────────────────────────────────────────────────
    def handle(self, *args, **opts):
        from django.db import connections

        tenant = opts["tenant"]
        interval = int(opts["interval"] or 3600)
        once = bool(opts["once"])

        # Tenant kontekstini o'rnat (HTTP request yo'q — middleware ishlamaydi).
        # activate_tenant: DATABASES ro'yxatga olish + _thread_local.db_alias.
        from core.sync_engine import activate_tenant
        from tenant_manager.middleware import _thread_local, get_current_db_alias
        try:
            activate_tenant(tenant)
        except ValueError as e:
            raise CommandError(str(e))
        db = get_current_db_alias() or "default"

        self.stdout.write(self.style.SUCCESS(
            f"[billing-worker] boshlandi tenant={tenant} db={db} "
            f"interval={interval}s once={once}"))

        while True:
            # Thread-local'ni har sikl boshida qayta tasdiqlaymiz (close_all() uni
            # o'zgartirmaydi, lekin xavfsizlik uchun — arzon, DB so'rov yo'q).
            _thread_local.db_alias = db
            try:
                self._run_cycle(db)
            except Exception:
                logger.exception("[billing-worker] sikl xatosi")
                self.stderr.write("[billing-worker] sikl xatosi (log'ga yozildi)")
            finally:
                # Uzoq yashovchi process — har sikldan keyin ulanishlarni yop
                # (DB leak qoidasi: "too many clients" oldini olish).
                try:
                    connections.close_all()
                except Exception as e:
                    logger.warning("[billing-worker] close_all() xato: %s", e)

            if once:
                break
            time.sleep(interval)

    # ─────────────────────────────────────────────────────────────────
    #  Bitta sikl
    # ─────────────────────────────────────────────────────────────────
    def _run_cycle(self, db):
        from django.utils import timezone
        from client_erp.payments import billing_live, get_provider

        # XAVFSIZLIK: sandbox rejim → HECH NARSA qilmaymiz (no-op).
        if not billing_live():
            self.stdout.write(
                "[billing-worker] sandbox rejim — avto-to'lov o'tkazib yuborildi (no-op)")
            return

        # billing_live() True, lekin Payme kalitlari yo'q bo'lsa — real API
        # chaqirilmaydi (barcha urinish fail bo'lib users'ni noto'g'ri Free'ga
        # tushirmasligi uchun) → no-op.
        provider = get_provider("payme")
        if not (hasattr(provider, "is_configured") and provider.is_configured()):
            self.stdout.write(
                "[billing-worker] payme sozlanmagan — avto-to'lov o'tkazib yuborildi")
            return

        from client_erp.models import ClientUser

        now = timezone.now()
        due = (ClientUser.objects.using(db)
               .filter(plan__isnull=False, is_active=True,
                       plan_expires_at__isnull=False,
                       plan_expires_at__lte=now + timedelta(days=1))
               .exclude(plan__is_free=True)
               .select_related("plan"))

        counts = Counter()
        total = 0
        for user in due.iterator():
            total += 1
            try:
                outcome = self._process_user(db, user, now)
            except Exception:
                logger.exception("[billing-worker] user #%s ishlovda xato", user.pk)
                outcome = "error"
            counts[outcome] += 1

        self.stdout.write(
            f"[billing-worker] sikl yakuni: due={total} {dict(counts)}")

    # ─────────────────────────────────────────────────────────────────
    #  Bitta foydalanuvchi
    # ─────────────────────────────────────────────────────────────────
    def _process_user(self, db, user, now):
        """Bitta muddati yaqinlashgan foydalanuvchini qayta ishlaydi.

        Qaytaradi (statistika uchun): no_card | waiting | not_implemented |
        charged | failed | failed_downgraded | downgraded.
        """
        from client_erp.models import ClientPayment, SavedCard
        from client_erp.payments import service

        plan = user.plan
        if plan is None or getattr(plan, "is_free", False):
            return "skip"

        # Aktiv Payme karta (recurring token). Yo'q bo'lsa — hech narsa
        # yechib bo'lmaydi, o'tkazib yuboramiz.
        card = (SavedCard.objects.using(db)
                .filter(user=user, is_active=True, provider="payme")
                .order_by("-created_at").first())
        if card is None:
            logger.info("[billing-worker] user #%s: aktiv Payme karta yo'q — o'tkazildi", user.pk)
            return "no_card"

        # Shu billing oynasidagi muvaffaqiyatsiz urinishlar (retry hisobi).
        # Oyna: expiry - 1 kun (tanlash chegarasi) dan boshlab. Muvaffaqiyatli
        # to'lovda plan_expires_at oldinga siljiydi → eski fail'lar oynadan chiqadi.
        window_start = (user.plan_expires_at or now) - timedelta(days=1)
        failed_qs = (ClientPayment.objects.using(db)
                     .filter(user=user, purpose="plan_purchase", status="failed",
                             created_at__gte=window_start)
                     .order_by("-created_at"))
        fail_count = failed_qs.count()

        # Allaqachon 3 marta fail — Bepul (Free) ga tushiramiz.
        if fail_count >= len(RETRY_OFFSET_DAYS):
            self._downgrade(db, user, plan, fail_count)
            return "downgraded"

        # Retry kadensi: oxirgi fail'dan keyin kamida (gap) kun o'tsin.
        last_failed = failed_qs.first()
        if last_failed is not None:
            gap_needed = RETRY_OFFSET_DAYS[fail_count] - RETRY_OFFSET_DAYS[fail_count - 1]
            days_since = (now - last_failed.created_at).total_seconds() / 86400.0
            if days_since < gap_needed:
                # Hali keyingi urinish vaqti kelmadi.
                return "waiting"

        # ── Recurring charge urinishi ──
        payment = ClientPayment.objects.using(db).create(
            user=user, provider="payme", purpose="plan_purchase",
            target_id=int(plan.id), amount_uzs=int(plan.price_uzs or 0),
            status="pending",
        )
        try:
            result = self._recurring_charge(db, payment, card)
        except NotImplementedError:
            # Recurring oqimi hali ulanmagan (Subscribe API skeleton).
            payment.status = "cancelled"
            payment.save(update_fields=["status"])
            logger.info("[billing-worker] user #%s: recurring hali ulanmagan — o'tkazildi", user.pk)
            self.stdout.write("[billing-worker] recurring hali ulanmagan — o'tkazib yuborildi")
            return "not_implemented"

        if self._is_charge_ok(result):
            # Muvaffaqiyat → plan_expires_at uzaytir + ClientSubscription (service._fulfill).
            raw = result if isinstance(result, dict) else {}
            service.confirm(payment, external_id=str(payment.external_id or ""), raw=raw)
            logger.info("[billing-worker] user #%s: tarif avto-yangilandi (plan=%s)", user.pk, plan.name)
            self.stdout.write(f"[billing-worker] user #{user.pk}: tarif avto-yangilandi ({plan.name})")
            return "charged"

        # Muvaffaqiyatsiz urinish.
        service.fail(payment, code="recurring", msg=str(result)[:200])
        new_fail_count = fail_count + 1
        if new_fail_count >= len(RETRY_OFFSET_DAYS):
            self._downgrade(db, user, plan, new_fail_count)
            return "failed_downgraded"
        logger.warning("[billing-worker] user #%s: avto-to'lov muvaffaqiyatsiz (%s/%s)",
                       user.pk, new_fail_count, len(RETRY_OFFSET_DAYS))
        return "failed"

    # ─────────────────────────────────────────────────────────────────
    #  Yordamchilar
    # ─────────────────────────────────────────────────────────────────
    def _recurring_charge(self, db, payment, card):
        """Payme recurring: chek yaratish (receipts.create) + saqlangan token
        bilan to'lash (receipts.pay). Oqim hali ulanmagan bo'lsa NotImplementedError.
        """
        from client_erp.payments import get_provider

        provider = get_provider("payme")

        # 1) Chek yaratish → external_id (receipt_id). Sandbox/live gate provayder
        #    ichida; live'da receipts.create real chaqiriladi.
        inv = provider.create_invoice(payment) or {}
        receipt_id = str(inv.get("external_id") or "")
        payment.external_id = receipt_id
        payment.checkout_url = str(inv.get("checkout_url") or "")
        payment.save(update_fields=["external_id", "checkout_url"])

        # 2) Saqlangan karta token bilan to'lash (receipts.pay). Provayder bu
        #    metodni bermasa yoki hali ulanmagan bo'lsa — NotImplementedError.
        pay_fn = getattr(provider, "pay_receipt", None)
        if not callable(pay_fn):
            raise NotImplementedError("payme.pay_receipt mavjud emas")
        if not receipt_id:
            raise NotImplementedError("receipt_id olinmadi (recurring oqimi to'liq emas)")
        return pay_fn(receipt_id, card.token)

    @staticmethod
    def _is_charge_ok(result):
        """Payme JSON-RPC / provayder javobidan to'lov muvaffaqiyatliligini aniqlaydi."""
        if not isinstance(result, dict):
            return False
        if result.get("error"):
            return False
        if result.get("ok") is True:
            return True
        res = result.get("result")
        if isinstance(res, dict):
            receipt = res.get("receipt")
            if isinstance(receipt, dict):
                # Payme: receipt.state == 4 → to'langan.
                try:
                    return int(receipt.get("state") or 0) == 4
                except (TypeError, ValueError):
                    return False
            return True  # 'result' bor, xato yo'q — muvaffaqiyatli deb qabul qilamiz
        return False

    def _downgrade(self, db, user, plan, fail_count):
        """3 marta fail → plan=None (Free) + AdminNotification/log."""
        plan_name = getattr(plan, "name", "?")
        user.plan = None
        user.plan_expires_at = None
        user.save(update_fields=["plan", "plan_expires_at"])

        msg = (f"{user.full_name} (@{user.username}) — '{plan_name}' tarifi "
               f"avto-to'lovi {fail_count} marta muvaffaqiyatsiz bo'ldi. "
               f"Foydalanuvchi Bepul (Free) tarifga tushirildi.")
        logger.warning("[billing-worker] DOWNGRADE user #%s: %s", user.pk, msg)
        self.stdout.write(self.style.WARNING(f"[billing-worker] DOWNGRADE user #{user.pk}: {plan_name} → Free"))

        # Additiv/best-effort bildirishnoma (katta ERP moliyasiga tegmaydi).
        try:
            from warehouse.models.procurement import AdminNotification
            AdminNotification.objects.using(db).create(
                title="Tarif avto-to'lov muvaffaqiyatsiz",
                message=msg,
                notif_type="billing_downgrade",
            )
        except Exception as e:
            logger.warning("[billing-worker] AdminNotification yozib bo'lmadi: %s", e)
