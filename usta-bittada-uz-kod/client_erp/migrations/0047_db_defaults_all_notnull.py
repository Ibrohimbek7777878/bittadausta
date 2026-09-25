"""client_erp — BARCHA NOT NULL maydonlarga DB DEFAULT (2026-08-08).

`0046` ikkita ustunni tuzatgan edi; bu migratsiya **butun app**ni shu bug
sinfidan himoyalaydi va yangi tenantlarda ham avtomatik qo'llanadi.

MUAMMO SINFI
    Django `AddField(default=...)` ustunni `NOT NULL DEFAULT x` qilib
    qo'shadi, so'ng DEFAULT ni **olib tashlaydi** — chunki Django har
    INSERT da qiymatni o'zi yozadi.

    Lekin `bittada-manager-ws` (daphne) kunlab qayta ishga tushmasligi
    mumkin. Uning xotirasidagi ESKI model klassi yangi maydonni bilmaydi
    va INSERT da yozmaydi:

        null value in column "<yangi>" violates not-null constraint

    2026-08-08: `dup_reviewed` (0044) shu sababli WS orqali kiritilgan
    HAR QANDAY kirim/chiqimni sindirgan. Foydalanuvchi «ba'zi akkauntlarda
    ishlamayapti» deb shikoyat qilgan (gunicorn reload bo'lgan, daphne yo'q).

YECHIM
    Modelda **doimiy** (callable emas) default e'lon qilingan har bir
    NOT NULL ustunga o'sha qiymat DB defaulti qilib qo'yiladi.
    Semantika O'ZGARMAYDI — yangi kod baribir qiymatni ochiq yozadi;
    default faqat eski kod uchun to'r.

TEGILMAYDI
    nullable ustunlar · callable default (`timezone.now`, `uuid4`) ·
    defaultsiz maydonlar · PK · FK · qochirish talab qiladigan matnlar.
"""
from django.db import migrations
from django.db.models import NOT_PROVIDED


def _literal(val):
    """Python default → xavfsiz SQL literal, yoki None (o'tkazish)."""
    from decimal import Decimal
    if isinstance(val, bool):
        return 'true' if val else 'false'
    if isinstance(val, int):
        return str(val)
    if isinstance(val, float):
        return repr(val)
    if isinstance(val, Decimal):
        return str(val)
    if isinstance(val, str):
        # Qochirish talab qiladigan matnga tegmaymiz — xavfsizlik
        return None if ("'" in val or '\\' in val) else f"'{val}'"
    return None


def _targets(apps):
    """(jadval, ustun, literal) ro'yxati — TARIXIY modellardan (apps registry)."""
    out = []
    app = apps.get_app_config('client_erp')
    for model in app.get_models():
        table = model._meta.db_table
        for f in model._meta.local_fields:
            if f.null or f.primary_key or f.is_relation:
                continue
            if f.default is NOT_PROVIDED or callable(f.default):
                continue
            lit = _literal(f.default)
            if lit is not None:
                out.append((table, f.column, lit))
    return out


def set_defaults(apps, schema_editor):
    con = schema_editor.connection
    with con.cursor() as c:
        for table, col, lit in _targets(apps):
            c.execute(
                "SELECT is_nullable, column_default FROM information_schema.columns "
                "WHERE table_name=%s AND column_name=%s",
                [table, col],
            )
            row = c.fetchone()
            # Faqat: ustun bor + NOT NULL + defaulti yo'q
            if row and row[0] == 'NO' and row[1] is None:
                c.execute(f'ALTER TABLE {table} ALTER COLUMN {col} SET DEFAULT {lit}')


def noop_reverse(apps, schema_editor):
    """Orqaga qaytarilmaydi — DEFAULT ni olib tashlash faqat zarar keltiradi
    (eski jarayonlar yana sinadi). Ataylab bo'sh."""


class Migration(migrations.Migration):

    dependencies = [
        ('client_erp', '0046_db_defaults_for_rolling_deploy'),
    ]

    operations = [
        migrations.RunPython(set_defaults, noop_reverse),
    ]
