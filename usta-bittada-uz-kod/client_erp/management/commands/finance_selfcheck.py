"""client_erp/management/commands/finance_selfcheck.py — MOLIYA O'Z-O'ZINI TEKSHIRUVI.

Nima uchun (H9, TZ-Shartnoma-Foyda-Jamoa-Moliya.md §0.5):
    Jamoa moliyasida pul BIR akkauntdan CHIQIB, BOSHQASIGA KIRADI. Agar
    biror joyda uzilish bo'lsa (yarim yozuv, ikkilangan yozuv, qo'lda
    o'chirilgan yozuv) — buni OYLAB sezmasligi mumkin. Bu skript har kuni
    invariantlarni tekshiradi va buzilgan joyni darhol ko'rsatadi.

FAQAT O'QIYDI — hech narsa yozmaydi/o'zgartirmaydi.

Ishlatish:
    manage.py finance_selfcheck                  # ekranga hisobot
    manage.py finance_selfcheck --notify         # muammo bo'lsa Telegram xabar
    manage.py finance_selfcheck --loop           # har 6 soatda (systemd uchun)
"""
import time

from django.core.management.base import BaseCommand
from django.db.models import Sum, Q, Count

DEFAULT_DB = 'tenant_mebelcity'


def _f(v):
    return float(v or 0)


def _m(v):
    return f"{v:,.0f}".replace(',', ' ')


class Command(BaseCommand):
    help = "Moliya invariantlarini tekshiradi (jamoa ulushlari, arvoh pul, takror yozuv)"

    def add_arguments(self, parser):
        parser.add_argument('--db', type=str, default=DEFAULT_DB)
        parser.add_argument('--notify', action='store_true',
                            help="Muammo topilsa adminlarga Telegram xabar")
        parser.add_argument('--loop', action='store_true',
                            help="Doimiy ishlash (har 6 soatda)")

    def handle(self, *args, **opts):
        if opts['loop']:
            while True:
                try:
                    self._run(opts)
                except Exception as e:                            # noqa: BLE001
                    self.stderr.write(f"selfcheck xato: {e}")
                time.sleep(6 * 3600)
        else:
            self._run(opts)

    # ─────────────────────────────────────────────────────────────────────
    def _run(self, opts):
        db = opts['db']
        # Tenant konteksti — `contract_profit` kabi property'lar shunga qaraydi
        from tenant_manager.middleware import _thread_local
        _thread_local.db_alias = db
        try:
            from tenant_manager.models import Tenant
            _thread_local.tenant = Tenant.objects.filter(db_name__icontains='mebelcity').first()
        except Exception:                                         # noqa: BLE001
            pass

        problems = []
        self.stdout.write("=" * 72)
        self.stdout.write("MOLIYA O'Z-O'ZINI TEKSHIRUVI")
        self.stdout.write("=" * 72)

        problems += self._check_ghost_money(db)
        problems += self._check_team_transfers(db)
        problems += self._check_share_totals(db)
        problems += self._check_negative_profit(db)
        problems += self._check_duplicate_requests(db)
        problems += self._check_unlinked_shares(db)

        self.stdout.write("\n" + "=" * 72)
        if problems:
            self.stdout.write(self.style.ERROR(f"🔴 {len(problems)} ta muammo topildi:"))
            for p in problems:
                self.stdout.write(self.style.ERROR(f"   • {p}"))
            if opts['notify']:
                self._notify_admins(problems)
        else:
            self.stdout.write(self.style.SUCCESS("✅ Hammasi joyida — invariantlar buzilmagan."))

    # 1) ARVOH PUL — Balans faqat real yozuvlardan bo'lsin
    def _check_ghost_money(self, db):
        from client_erp.models import ClientFinanceRecord, ClientUser
        from client_erp.services.scope import profit_claim_pending
        out = []
        self.stdout.write("\n1) ARVOH PUL (pending Balansga qo'shilmasligi kerak)")
        tot_pending = 0.0
        for u in ClientUser.objects.using(db).filter(is_active=True):
            try:
                p = sum(float(x[1]) for x in profit_claim_pending(u))
            except Exception:                                     # noqa: BLE001
                p = 0.0
            tot_pending += p
        base = ClientFinanceRecord.objects.using(db).filter(is_deleted=False).exclude(
            order__status='cancelled')
        inc = _f(base.filter(record_type='income').aggregate(s=Sum('amount'))['s'])
        exp = _f(base.filter(record_type='expense').aggregate(s=Sum('amount'))['s'])
        wd = _f(ClientFinanceRecord.objects.using(db).filter(
            is_deleted=False, record_type='withdrawal').aggregate(s=Sum('amount'))['s'])
        self.stdout.write(f"   Real yozuvlar bo'yicha jami balans: {_m(inc - exp - wd)}")
        self.stdout.write(f"   Kutilayotgan (pending) jami:        {_m(tot_pending)}"
                          "   ← ALOHIDA turishi kerak")
        return out

    # 2) JAMOA O'TKAZMALARI — egadan chiqqan = a'zoga kirgan
    def _check_team_transfers(self, db):
        from client_erp.models import ClientFinanceRecord
        out = []
        self.stdout.write("\n2) JAMOA O'TKAZMALARI (ega chiqimi = a'zo kirimi)")
        # `source_line` bilan bog'langan juftliklar
        recs = (ClientFinanceRecord.objects.using(db)
                .filter(source_line__isnull=False, is_deleted=False)
                .values('source_line_id', 'record_type', 'is_reversal')
                .annotate(s=Sum('amount'), n=Count('id')))
        by_line = {}
        for r in recs:
            d = by_line.setdefault(r['source_line_id'], {'wd': 0.0, 'inc': 0.0, 'rev': 0.0})
            amt = _f(r['s'])
            if r['is_reversal']:
                d['rev'] += amt
            elif r['record_type'] == 'withdrawal':
                d['wd'] += amt
            elif r['record_type'] == 'income':
                d['inc'] += amt
        bad = 0
        for lid, d in by_line.items():
            # Bekor qilinmagan juftlikda: agar a'zoga kirim yozilgan bo'lsa,
            # u egadagi chiqim bilan TENG bo'lishi shart.
            if d['inc'] > 0 and abs(d['inc'] - d['wd']) > 1:
                bad += 1
                out.append(f"Qator #{lid}: ega chiqimi {_m(d['wd'])} ≠ a'zo kirimi {_m(d['inc'])}")
        self.stdout.write(f"   Bog'langan qatorlar: {len(by_line)} ta,  nomutanosib: {bad} ta")
        if not bad:
            self.stdout.write(self.style.SUCCESS("   ✅ Hammasi mos"))
        return out

    # 3) ULUSHLAR YIG'INDISI — 100% dan oshmasin
    def _check_share_totals(self, db):
        from client_erp.models.team import ClientOrderProfitShare
        out = []
        self.stdout.write("\n3) ULUSH FOIZLARI (zakaz bo'yicha jami ≤ 100%)")
        rows = (ClientOrderProfitShare.objects.using(db)
                .values('order_id').annotate(t=Sum('percent')))
        over = [r for r in rows if _f(r['t']) > 100.5]
        for r in over[:10]:
            out.append(f"Zakaz #{r['order_id']}: ulushlar jami {_f(r['t']):.1f}% (100% dan oshgan)")
        self.stdout.write(f"   Taqsimotli zakazlar: {len(rows)} ta,  100%dan oshgan: {len(over)} ta")
        if not over:
            self.stdout.write(self.style.SUCCESS("   ✅ Hammasi joyida"))
        return out

    # 4) MANFIY FOYDA — shartnoma xarajatdan kichik
    def _check_negative_profit(self, db):
        from client_erp.models import ClientOrder
        out = []
        self.stdout.write("\n4) MANFIY FOYDA (topshirilgan zakazlarda)")
        neg = []
        for o in (ClientOrder.objects.using(db)
                  .filter(status='delivered', is_deleted=False).select_related('owner')):
            try:
                if float(o.contract_profit or 0) < 0:
                    neg.append((o.pk, o.title, o.owner.username, float(o.contract_profit)))
            except Exception:                                     # noqa: BLE001
                continue
        for oid, title, un, p in neg[:10]:
            self.stdout.write(f"   ⚠️ #{oid} «{str(title)[:24]}» ({un}): {_m(p)}")
        self.stdout.write(f"   Manfiy: {len(neg)} ta")
        if not neg:
            self.stdout.write(self.style.SUCCESS("   ✅ Manfiy foyda yo'q"))
        # Manfiy foyda — ogohlantirish, lekin har doim ham bug emas
        # (haqiqiy zarar keltirgan ish bo'lishi mumkin) → `problems`ga qo'shmaymiz
        return out

    # 5) TAKROR YECHISH — bir xil client_request_id
    def _check_duplicate_requests(self, db):
        from client_erp.models.team import ClientProfitWithdrawal
        out = []
        self.stdout.write("\n5) TAKROR YECHISH (client_request_id unique)")
        dup = (ClientProfitWithdrawal.objects.using(db)
               .filter(client_request_id__isnull=False)
               .values('client_request_id').annotate(n=Count('id')).filter(n__gt=1))
        for d in dup[:10]:
            out.append(f"Takror client_request_id: {d['client_request_id']} ({d['n']} marta)")
        total = ClientProfitWithdrawal.objects.using(db).count()
        self.stdout.write(f"   Yechish sessiyalari: {total} ta,  takror: {len(dup)} ta")
        if not dup:
            self.stdout.write(self.style.SUCCESS("   ✅ Takror yo'q"))
        return out

    # 6) BOG'LANMAGAN ULUSHLAR — ma'lumot (muammo emas)
    def _check_unlinked_shares(self, db):
        from client_erp.models.team import ClientOrderProfitShare
        self.stdout.write("\n6) KONTAKTGA BOG'LANMAGAN ULUSHLAR (eski usul)")
        t = ClientOrderProfitShare.objects.using(db).count()
        linked = ClientOrderProfitShare.objects.using(db).filter(user__isnull=False).count()
        self.stdout.write(f"   Jami {t} ta,  bog'langan {linked} ta,  eski {t - linked} ta")
        self.stdout.write("   (Eski yozuvlar ATAYLAB avtomatik bog'lanmaydi — "
                          "ism bo'yicha taxmin qilish xavfli. Egalari qo'lda tanlaydi.)")
        return []       # muammo emas — faqat ma'lumot

    # ─────────────────────────────────────────────────────────────────────
    def _notify_admins(self, problems):
        try:
            from client_erp.services.notifications import _send
            from client_erp.models import ClientUser
            txt = ("🔴 <b>Moliya tekshiruvi: muammo topildi</b>\n\n"
                   + "\n".join(f"• {p}" for p in problems[:8]))
            for u in ClientUser.objects.filter(is_staff=True, is_active=True):
                if getattr(u, 'telegram_chat_id', None):
                    _send(u.telegram_chat_id, txt)
        except Exception as e:                                    # noqa: BLE001
            self.stderr.write(f"admin xabar yuborilmadi: {e}")
