"""client_erp/management/commands/finance_snapshot.py — Moliya SNAPSHOT.

Moliya o'zgarishidan OLDIN va KEYIN barcha akkauntlarning asosiy moliyaviy
ko'rsatkichlarini JSON'ga yozadi, so'ng ikkisini solishtirib FARQ jadvalini
chiqaradi.

Maqsad: «menda to'g'ri ko'rinyapti» degan xatoni oldini olish — o'zgarish
KUTILMAGAN akkauntga tegsa darhol ko'rinadi.

FAQAT O'QIYDI — hech narsa yozmaydi/o'zgartirmaydi.

Ishlatish:
    # 1. Deploy'dan OLDIN
    manage.py finance_snapshot --tag before

    # 2. Deploy'dan KEYIN
    manage.py finance_snapshot --tag after

    # 3. Solishtirish
    manage.py finance_snapshot --diff before after
"""
import json
import os
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum, Q

SNAP_DIR = '/home/user/mebelcity_platform/client_erp/DOCS/snapshots'


def _f(v):
    return float(v or 0)


class Command(BaseCommand):
    help = "Moliya ko'rsatkichlari snapshot (before/after) va farq jadvali"

    def add_arguments(self, parser):
        parser.add_argument('--tag', type=str, help="Snapshot nomi (masalan: before)")
        parser.add_argument('--diff', nargs=2, metavar=('A', 'B'), help='Ikki snapshotni solishtirish')
        parser.add_argument('--db', type=str, default='tenant_mebelcity', help='Tenant DB alias')

    def handle(self, *args, **opts):
        os.makedirs(SNAP_DIR, exist_ok=True)
        if opts.get('diff'):
            return self._diff(*opts['diff'])
        tag = opts.get('tag')
        if not tag:
            self.stderr.write("--tag yoki --diff kerak")
            return
        self._snapshot(tag, opts['db'])

    # ── Snapshot olish ────────────────────────────────────────────────────
    def _snapshot(self, tag, db):
        # ⚠️ TENANT KONTEKSTI — SHART. Aks holda `profit_claim_pending()` ichidagi
        # so'rovlar DEFAULT bazaga ketadi va HAR DOIM 0 qaytaradi (2026-08-03
        # da aynan shu xato snapshotni noto'g'ri chiqargan edi).
        from tenant_manager.middleware import _thread_local
        _thread_local.db_alias = db
        try:
            from tenant_manager.models import Tenant
            _thread_local.tenant = Tenant.objects.filter(db_name__icontains='mebelcity').first()
        except Exception:
            pass

        from client_erp.models import ClientUser, ClientFinanceRecord, ClientOrder
        from client_erp.services.scope import profit_claim_pending

        data = {}
        users = list(ClientUser.objects.using(db).values('id', 'username'))
        self.stdout.write(f"Snapshot «{tag}» — {len(users)} akkaunt...")

        for u in users:
            uid = u['id']
            fr = ClientFinanceRecord.objects.using(db).filter(owner_id=uid, is_deleted=False)
            # ⚠️ `serialize_finance_page` bilan AYNAN bir xil filtr bo'lishi SHART:
            # u FAQAT `~Q(order__status='cancelled')` ishlatadi, o'chirilgan
            # (is_deleted) zakazni ATAYLAB istisno QILMAYDI — balans = kassadagi
            # HAQIQIY pul (izoh: serializers.py:760-765). Ilgari bu yerda
            # `.exclude(order__is_deleted=True)` bor edi → o'chirilgan zakazi
            # bo'lgan akkauntlarda snapshot serializerdan farq qilardi.
            fr_live = fr.exclude(order__status='cancelled')

            inc = _f(fr_live.filter(record_type='income').aggregate(s=Sum('amount'))['s'])
            exp = _f(fr_live.filter(record_type='expense').aggregate(s=Sum('amount'))['s'])
            wd = _f(fr.filter(record_type='withdrawal').aggregate(s=Sum('amount'))['s'])

            # Sof foyda — topshirilgan zakazlar bo'yicha.
            # ⚠️ `serialize_finance_page` bilan bir xil QAMROV: o'z zakazlari
            # + ULASHILGANLAR. Ilgari faqat `owner_id=uid` edi → ulashilgan
            # zakazi bor akkauntlarda snapshot serializerdan farq qilardi
            # (bigone_cl2: 92.9M vs 108.7M — soxta «regressiya» ko'rinardi).
            uobj = ClientUser.objects.using(db).filter(pk=uid).first()
            _scope = Q(owner_id=uid)
            if uobj:
                try:
                    from client_erp.services.scope import shared_order_ids, profit_claim_map
                    _ids = shared_order_ids(uobj) | set(profit_claim_map(uobj).keys())
                    if _ids:
                        _scope = _scope | Q(pk__in=_ids)
                except Exception:
                    pass
            sof = 0.0
            sof_live = 0.0
            neg_live_orders = []
            for o in (ClientOrder.objects.using(db)
                      .filter(_scope, status='delivered', is_deleted=False)):
                sof += _f(o.total_income) - _f(o.total_expense)
                # LIVE (2026-08-04): haqiqiy `contract_profit` — FINANCE_V2
                # sinovida topilgan xato tufayli qo'shildi (TZ §0.9): eski
                # `sof` yuqoridagi kabi mustaqil naqd-hisob bo'lgani uchun
                # LIVE formula o'zgarishini UMUMAN ko'rsatmasdi, "0 farq"
                # degan yolg'on xotirjamlik berardi. Endi ikkalasi ham
                # yoziladi — diff'da ikkalasi solishtiriladi.
                cp = _f(o.contract_profit)
                sof_live += cp
                if cp < 0:
                    neg_live_orders.append(o.pk)

            # Kutilayotgan (pending) ulush — arvoh pul manbasi
            pend = 0.0
            try:
                uobj = ClientUser.objects.using(db).get(pk=uid)
                pend = float(sum((p[1] for p in profit_claim_pending(uobj)), Decimal('0')))
            except Exception:
                pass

            data[u['username']] = {
                'id': uid,
                'income': inc,
                'expense': exp,
                'withdrawal': wd,
                'balance': inc - exp - wd,
                'sof_foyda': sof,
                'sof_foyda_live': sof_live,
                'negative_live_orders': neg_live_orders,
                'pending': pend,
                'records': fr.count(),
                'orders_delivered': ClientOrder.objects.using(db).filter(
                    owner_id=uid, status='delivered', is_deleted=False).count(),
            }

        path = os.path.join(SNAP_DIR, f'snapshot_{tag}.json')
        with open(path, 'w') as f:
            json.dump(data, f, indent=1, sort_keys=True)

        tot = sum(v['balance'] for v in data.values())
        tot_p = sum(v['pending'] for v in data.values())
        self.stdout.write(self.style.SUCCESS(f"✅ Saqlandi: {path}"))
        self.stdout.write(f"   Jami balans:  {tot:>18,.0f}")
        self.stdout.write(f"   Jami pending: {tot_p:>18,.0f}  <- ARVOH PUL (balansga qo'shilmasligi kerak)")
        if tot_p:
            for un, v in sorted(data.items(), key=lambda r: -r[1]['pending']):
                if v['pending']:
                    self.stdout.write(f"      {un:<18} pending={v['pending']:>15,.0f}  balans={v['balance']:>15,.0f}")

    # ── Solishtirish ──────────────────────────────────────────────────────
    def _diff(self, a, b):
        pa = os.path.join(SNAP_DIR, f'snapshot_{a}.json')
        pb = os.path.join(SNAP_DIR, f'snapshot_{b}.json')
        for p in (pa, pb):
            if not os.path.exists(p):
                self.stderr.write(f"Topilmadi: {p}")
                return
        A = json.load(open(pa))
        B = json.load(open(pb))

        FIELDS = ['income', 'expense', 'withdrawal', 'balance', 'sof_foyda', 'sof_foyda_live', 'pending']
        changed = []
        for un in sorted(set(A) | set(B)):
            va, vb = A.get(un), B.get(un)
            if va is None:
                changed.append((un, 'YANGI AKKAUNT', None, None)); continue
            if vb is None:
                changed.append((un, "AKKAUNT YO'QOLDI", None, None)); continue
            for f in FIELDS:
                if abs(va.get(f, 0) - vb.get(f, 0)) > 0.5:
                    changed.append((un, f, va.get(f, 0), vb.get(f, 0)))

        # XAVFSIZLIK (2026-08-04, TZ §0.9): «KEYIN»da MANFIY `contract_profit`
        # chiqqan buyurtma — lekin FAQAT «OLDIN»da ham manfiy bo'lmagan bo'lsa
        # rollback signali (YANGI regressiya). Agar buyurtma «OLDIN»da HAM
        # manfiy bo'lsa (masalan haqiqiy zarar keltirgan ish, #259 «Office»
        # kabi) — bu formula xatosi EMAS, oddiy ma'lumot sifatida ko'rsatiladi.
        new_neg, known_neg = [], []
        for un, v in B.items():
            oids = v.get('negative_live_orders') or []
            if not oids:
                continue
            before_oids = set(A.get(un, {}).get('negative_live_orders') or [])
            fresh = [o for o in oids if o not in before_oids]
            (new_neg if fresh else known_neg).append((un, fresh or oids))

        self.stdout.write(f"\n{'='*78}\nSOLISHTIRISH:  {a}  →  {b}\n{'='*78}")
        if new_neg:
            self.stdout.write(self.style.ERROR("🔴 YANGI manfiy jonli foyda (regressiya) — DARHOL TO'XTATING:"))
            for un, oids in new_neg:
                self.stdout.write(f"   {un}: buyurtma(lar) {oids}")
        if known_neg:
            self.stdout.write(self.style.WARNING("ℹ️  Oldindan ma'lum manfiy buyurtmalar (formula xatosi emas, qo'lda ko'rib chiqilsin):"))
            for un, oids in known_neg:
                self.stdout.write(f"   {un}: buyurtma(lar) {oids}")
        if not changed and not new_neg and not known_neg:
            self.stdout.write(self.style.SUCCESS("✅ HECH QANDAY FARQ YO'Q — hech kimning raqami o'zgarmagan."))
            return
        if not changed:
            return
        self.stdout.write(f"O'zgargan: {len(set(c[0] for c in changed))} akkaunt, {len(changed)} ko'rsatkich\n")
        self.stdout.write(f"{'AKKAUNT':<20}{'KO‘RSATKICH':<14}{'OLDIN':>17}{'KEYIN':>17}{'FARQ':>17}")
        self.stdout.write('-' * 85)
        for un, f, x, y in changed:
            if x is None:
                self.stdout.write(f"{un:<20}{f}")
            else:
                self.stdout.write(f"{un:<20}{f:<14}{x:>17,.0f}{y:>17,.0f}{y-x:>17,.0f}")
        self.stdout.write('-' * 85)
        self.stdout.write(self.style.WARNING(
            "\n⚠️  KUTILGAN farqlarnigina qabul qiling. Kutilmagan akkaunt o'zgargan "
            "bo'lsa — DEPLOY'NI ORQAGA QAYTARING."))
