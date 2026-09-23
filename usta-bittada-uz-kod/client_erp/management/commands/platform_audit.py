"""`manage.py platform_audit` — Bittada Usta platformasi sog'lig'i tekshiruvi.

FAQAT O'QIYDI — hech narsani o'zgartirmaydi, hech qanday yozuv yaratmaydi.

NIMA UCHUN
    Har o'zgarishdan keyin «hammasi joyidami?» degan savolga BIR BUYRUQ
    bilan javob berish uchun. Boshqa dasturchi (yoki AI) loyihaga kelganda
    avval shuni ishga tushirsa — platformaning holatini aniq ko'radi va
    integratsiya qilinmagan joylarga tegmasdan ishlay oladi.

ISHLATISH
    platform_venv/bin/python manage.py platform_audit
    platform_venv/bin/python manage.py platform_audit --db tenant_mebelcity
    platform_venv/bin/python manage.py platform_audit --quiet   # faqat xulosa

CHIQISH KODI
    0 — jiddiy muammo yo'q
    1 — jiddiy muammo bor (CI/cron uchun)
"""
import os
import re
import subprocess

from django.apps import apps as dj_apps
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connections
from django.db.models import NOT_PROVIDED

ROOT = settings.BASE_DIR if hasattr(settings, 'BASE_DIR') else '/home/user/mebelcity_platform'
ROOT = str(ROOT)

TENANT_DBS = ['default', 'tenant_mebelcity', 'tenant_sap']
SERVICES = ['bittada-manager', 'bittada-manager-ws',
            'bittada-cp-poller', 'bittada-media-worker']

JS_ROOT = os.path.join(ROOT, 'static/client_erp/js')
SPA_TPL = os.path.join(ROOT, 'template/client_erp/spa_redesign.html')
CONSUMERS = os.path.join(ROOT, 'client_erp/consumers.py')
I18N_DIR = os.path.join(JS_ROOT, 'i18n')
COLLECTED = '/var/www/erp-manager/static'


class Command(BaseCommand):
    help = "Platforma sog'lig'i tekshiruvi (faqat o'qiydi)"

    def add_arguments(self, p):
        p.add_argument('--db', default='tenant_mebelcity',
                       help="Ma'lumot tekshiruvi uchun tenant (standart: tenant_mebelcity)")
        p.add_argument('--quiet', action='store_true', help='Faqat xulosa')

    # ── yordamchilar ───────────────────────────────────────────────────
    def hdr(self, t):
        if not self.quiet:
            self.stdout.write(f'\n{"═" * 74}\n {t}\n{"═" * 74}')

    def line(self, s):
        if not self.quiet:
            self.stdout.write(s)

    def fail(self, s):
        self.fails.append(s)

    def warn(self, s):
        self.warns.append(s)

    # ── asosiy ─────────────────────────────────────────────────────────
    def handle(self, *a, **o):
        self.quiet = o['quiet']
        self.fails, self.warns = [], []
        db = o['db']

        from tenant_manager.middleware import _thread_local
        from tenant_manager.models import Tenant
        _thread_local.db_alias = db
        _thread_local.tenant = Tenant.objects.filter(db_name__icontains='mebelcity').first()

        self.check_notnull_defaults()
        self.check_model_db_drift(db)
        self.check_migrations()
        self.check_ws_coverage()
        self.check_static()
        self.check_js_syntax()
        self.check_data_integrity(db)
        self.check_i18n()
        self.check_services()

        # ── xulosa ──
        self.stdout.write(f'\n{"═" * 74}\n XULOSA\n{"═" * 74}')
        if self.fails:
            self.stdout.write(self.style.ERROR(f'  🔴 JIDDIY: {len(self.fails)}'))
            for f in self.fails:
                self.stdout.write(f'      • {f}')
        if self.warns:
            self.stdout.write(self.style.WARNING(f'  ⚠️  OGOHLANTIRISH: {len(self.warns)}'))
            for w in self.warns:
                self.stdout.write(f'      • {w}')
        if not self.fails and not self.warns:
            self.stdout.write(self.style.SUCCESS('  ✅ HAMMASI JOYIDA'))
        elif not self.fails:
            self.stdout.write(self.style.SUCCESS('  ✅ Jiddiy muammo yo\'q'))
        if self.fails:
            raise SystemExit(1)

    # ── 1. NOT NULL + DB default (eski-jarayon minasi) ─────────────────
    def check_notnull_defaults(self):
        self.hdr('1. NOT NULL ustunlar — «eski jarayon» minasi')
        targets = []
        for model in dj_apps.get_app_config('client_erp').get_models():
            for f in model._meta.local_fields:
                if f.null or f.primary_key or f.is_relation:
                    continue
                if f.default is NOT_PROVIDED or callable(f.default):
                    continue
                targets.append((model._meta.db_table, f.column))

        for db in TENANT_DBS:
            mines = []
            with connections[db].cursor() as c:
                for table, col in targets:
                    c.execute(
                        "SELECT is_nullable, column_default FROM information_schema.columns "
                        "WHERE table_name=%s AND column_name=%s", [table, col])
                    r = c.fetchone()
                    if r and r[0] == 'NO' and r[1] is None:
                        mines.append(f'{table}.{col}')
            if mines:
                self.fail(f'{db}: {len(mines)} ta NOT NULL ustunda DB default yo\'q '
                          f'(eski WS jarayoni yozuvni sindiradi) — {mines[:3]}')
                self.line(f'  🔴 {db}: {len(mines)} ta mina')
            else:
                self.line(f'  ✅ {db}: mina yo\'q ({len(targets)} maydon tekshirildi)')

    # ── 2. Model ↔ DB drift ────────────────────────────────────────────
    def check_model_db_drift(self, db):
        self.hdr('2. Model maydonlari ↔ DB ustunlari')
        bad = 0
        models = list(dj_apps.get_app_config('client_erp').get_models())
        with connections[db].cursor() as c:
            for model in models:
                table = model._meta.db_table
                # `f.column` — FK uchun ham to'g'ri nom beradi (user_id)
                cols = {f.column for f in model._meta.local_fields}
                c.execute("SELECT column_name FROM information_schema.columns "
                          "WHERE table_name=%s", [table])
                db_cols = {r[0] for r in c.fetchall()}
                if not db_cols:
                    self.fail(f'{table} — jadval yo\'q'); bad += 1; continue
                missing = cols - db_cols
                if missing:
                    self.fail(f'{table} — DBda yo\'q: {sorted(missing)}'); bad += 1
        self.line(f'  {"✅ mos" if not bad else f"🔴 {bad} ta drift"}  ({len(models)} model)')

    # ── 3. Migratsiyalar ───────────────────────────────────────────────
    def check_migrations(self):
        self.hdr('3. Qo\'llanmagan migratsiyalar')
        py = os.path.join(ROOT, 'platform_venv/bin/python')
        for db in TENANT_DBS:
            try:
                out = subprocess.run(
                    [py, os.path.join(ROOT, 'manage.py'), 'showmigrations', f'--database={db}'],
                    capture_output=True, text=True, timeout=300).stdout
            except Exception as e:                            # noqa: BLE001
                self.warn(f'{db}: showmigrations ishlamadi ({e})'); continue
            pend = [l.strip() for l in out.split('\n') if l.startswith(' [ ]')]
            if pend:
                self.fail(f'{db}: {len(pend)} ta migratsiya qo\'llanmagan')
                self.line(f'  🔴 {db}: {len(pend)} ta')
            else:
                self.line(f'  ✅ {db}: 0')

    # ── 4. WS qamrovi ──────────────────────────────────────────────────
    def check_ws_coverage(self):
        self.hdr('4. WebSocket — JS chaqiruvi ↔ backend handler')
        js_types = set()
        for root, _, files in os.walk(JS_ROOT):
            for fn in files:
                if not fn.endswith('.js'):
                    continue
                src = open(os.path.join(root, fn), encoding='utf-8', errors='ignore').read()
                # Izohlarni tashlaymiz — hujjatdagi misol soxta signal bermasin
                src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
                src = re.sub(r'^\s*//.*$', '', src, flags=re.M)
                js_types |= set(re.findall(r"WS\.send\(\s*'([a-z_.]+)'", src))
        cons = open(CONSUMERS, encoding='utf-8').read()
        handlers = set(re.findall(r'async def handle_([a-z_0-9]+)\(', cons))
        miss = sorted(t for t in js_types if t.replace('.', '_') not in handlers)
        if miss:
            self.fail(f'Handleri yo\'q WS turlari: {miss}')
            for t in miss:
                self.line(f'  🔴 handler YO\'Q: {t}')
        else:
            self.line(f'  ✅ {len(js_types)} ta chaqiruvda handler bor '
                      f'({len(handlers)} handler mavjud)')

    # ── 5. Statik fayllar ──────────────────────────────────────────────
    def check_static(self):
        self.hdr('5. Statik fayllar (?v= ↔ manba ↔ collectstatic)')
        tpl = open(SPA_TPL, encoding='utf-8').read()
        srcs = re.findall(r'<script src="/static/([^"?]+)\?v=(\d+)"', tpl)
        bad = 0
        for path, _ver in srcs:
            p1 = os.path.join(ROOT, 'static', path)
            p2 = os.path.join(ROOT, path.split('/')[0], 'static', path)
            src = p1 if os.path.exists(p1) else (p2 if os.path.exists(p2) else None)
            if not src:
                self.fail(f'Manba fayl yo\'q: {path}'); bad += 1; continue
            coll = os.path.join(COLLECTED, path)
            if not os.path.exists(coll):
                self.fail(f'collectstatic qilinmagan: {path}'); bad += 1
            elif open(src, 'rb').read() != open(coll, 'rb').read():
                self.fail(f'collectstatic ESKIRGAN: {path} — `collectstatic --noinput` kerak')
                bad += 1
        self.line(f'  {"✅ hammasi yangi" if not bad else f"🔴 {bad} ta muammo"}'
                  f'  ({len(srcs)} skript)')

    # ── 6. JS sintaksis ────────────────────────────────────────────────
    def check_js_syntax(self):
        self.hdr('6. JavaScript sintaksis')
        n = err = 0
        for root, _, files in os.walk(JS_ROOT):
            for fn in files:
                if not fn.endswith('.js'):
                    continue
                n += 1
                p = os.path.join(root, fn)
                r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
                if r.returncode:
                    self.fail(f'JS sintaksis xatosi: {p}')
                    self.line(f'  🔴 {p}\n     {r.stderr.strip().splitlines()[-1][:100]}')
                    err += 1
        self.line(f'  {"✅ toza" if not err else f"🔴 {err} ta xato"}  ({n} fayl)')

    # ── 7. Ma'lumot butunligi ──────────────────────────────────────────
    def check_data_integrity(self, db):
        self.hdr('7. Ma\'lumot butunligi')
        from client_erp.models import ClientFinanceRecord, ClientOrder, ClientUser

        n_users = ClientUser.objects.filter(is_active=True).count()
        self.line(f'  Aktiv akkaunt: {n_users}')

        with connections[db].cursor() as c:
            c.execute("""SELECT COUNT(*) FROM client_erp_clientfinancerecord f
                         LEFT JOIN client_erp_clientorder o ON o.id = f.order_id
                         WHERE f.order_id IS NOT NULL AND o.id IS NULL""")
            dangling = c.fetchone()[0]
        self.line(f'  Yo\'q buyurtmaga ishora qiluvchi moliya yozuvi: {dangling}')
        if dangling:
            self.fail(f'{dangling} ta moliya yozuvi mavjud bo\'lmagan buyurtmaga ishora qiladi')

        probe = ClientFinanceRecord.objects.filter(description__startswith='__').count()
        self.line(f'  Test/probe qoldig\'i: {probe}')
        if probe:
            self.fail(f'{probe} ta test yozuvi bazada qolib ketgan')

        # Moliya invarianti: sof foyda = taqsimlangan + menga qoldi
        from decimal import Decimal
        from client_erp.serializers import serialize_finance_page
        bad = checked = 0
        for u in ClientUser.objects.filter(is_active=True).order_by('id'):
            try:
                sf = serialize_finance_page(u, period='all')['sof_foyda']
            except Exception as e:                            # noqa: BLE001
                self.fail(f'serialize_finance_page yiqildi ({u.username}): {str(e)[:70]}')
                continue
            checked += 1
            tot = Decimal(str(sf.get('total') or 0))
            dist = Decimal(str(sf.get('distributed') or 0))
            left = Decimal(str(sf.get('owner_left') or 0))
            if abs(tot - (dist + left)) > Decimal('1'):
                bad += 1
        if bad:
            self.fail(f'Moliya invarianti buzilgan: {bad}/{checked} akkaunt '
                      f'(sof ≠ taqsimlangan + menga qoldi)')
            self.line(f'  🔴 invariant: {bad}/{checked}')
        else:
            self.line(f'  ✅ moliya invarianti: {checked}/{checked}')

        # Kirim qabul qilmaydigan buyurtmalar (ma'lumot — xato emas)
        noc = sum(1 for o in ClientOrder.objects.exclude(status='cancelled')
                  if float(o.contract_amount or 0) <= 0)
        self.line(f'  ℹ️  shartnomasiz buyurtma (kirim blok): {noc}')

    # ── 8. i18n ────────────────────────────────────────────────────────
    def check_i18n(self):
        self.hdr('8. Ko\'p tillilik (UZ/RU/EN)')
        files = {}
        for f in ('i18n.js', 'uz.js', 'ru.js', 'en.js'):
            p = os.path.join(I18N_DIR, f)
            if not os.path.exists(p):
                self.fail(f'i18n fayl yo\'q: {f}')
                continue
            files[f] = open(p, encoding='utf-8').read()

        def keys(src):
            """Lug'at kalitlari. `'...'` va `"..."` — ikkala yozuv ham.

            ⚠️ Bitta umumiy naqsh ishlamaydi: `[^'"]` ikkala qo'shtirnoqni
            ham chetlab o'tadi, shuning uchun `"O'chirish"` kabi kalit
            tushib qolardi (2026-08-08 soxta signali)."""
            out = set()
            for m in re.finditer(r"^\s{4}'((?:[^'\\]|\\.)*)'\s*:", src, re.M):
                out.add(m.group(1).replace("\\'", "'"))
            for m in re.finditer(r'^\s{4}"((?:[^"\\]|\\.)*)"\s*:', src, re.M):
                out.add(m.group(1).replace('\\"', '"'))
            return out

        if 'ru.js' in files and 'en.js' in files:
            ru, en = keys(files['ru.js']), keys(files['en.js'])
            self.line(f'  RU: {len(ru)} kalit   EN: {len(en)} kalit')
            gap = (ru ^ en)
            if gap:
                self.warn(f'RU/EN kalitlari nomutanosib: {len(gap)} ta farq')
                self.line(f'  ⚠️  farq: {len(gap)} ta — {sorted(gap)[:5]}')
            else:
                self.line('  ✅ RU va EN to\'liq mos')

        # i18n.js SPA shablonida BIRINCHI yuklanadimi
        if os.path.exists(SPA_TPL):
            tpl = open(SPA_TPL, encoding='utf-8').read()
            order = re.findall(r'<script src="/static/client_erp/js/([^"?]+)', tpl)
            if order and 'i18n/i18n.js' in order:
                idx = order.index('i18n/i18n.js')
                after = [s for s in order[:idx] if s.startswith('redesign/')]
                if after:
                    self.fail('i18n.js rc-* skriptlaridan KEYIN yuklanmoqda — '
                              'T() aniqlanmagan bo\'lishi mumkin')
                else:
                    self.line('  ✅ i18n.js boshqa skriptlardan oldin yuklanadi')
            else:
                self.warn('i18n.js SPA shablonida ulanmagan')

    # ── 9. Servislar ───────────────────────────────────────────────────
    def check_services(self):
        self.hdr('9. Servislar')
        for s in SERVICES:
            try:
                st = subprocess.run(['systemctl', 'is-active', s],
                                    capture_output=True, text=True).stdout.strip()
                ts = subprocess.run(['systemctl', 'show', '-p', 'ActiveEnterTimestamp',
                                     '--value', s], capture_output=True, text=True).stdout.strip()
            except Exception:                                 # noqa: BLE001
                self.warn(f'{s}: holatini o\'qib bo\'lmadi'); continue
            if st != 'active':
                self.fail(f'{s} ishlamayapti ({st})')
                self.line(f'  🔴 {s:24} {st}')
            else:
                self.line(f'  ✅ {s:24} active   {ts[:24]}')
