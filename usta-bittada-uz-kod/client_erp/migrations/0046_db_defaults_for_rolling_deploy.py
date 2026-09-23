"""DB-darajasidagi DEFAULT — «yumshoq deploy» uchun (2026-08-08).

MUAMMO (jonli serverda aniqlangan):
    Django `AddField(default=...)` ustunni `NOT NULL DEFAULT x` qilib
    qo'shadi, keyin DEFAULT ni **olib tashlaydi**. Django uchun bu to'g'ri —
    u har INSERT da qiymatni o'zi yozadi.

    Lekin bizda uzoq ishlaydigan jarayonlar bor (`bittada-manager-ws`
    daphne — kunlab qayta ishga tushmasligi mumkin). Ular xotirasida
    ESKI model klassi turadi va yangi maydonni BILMAYDI, shuning uchun
    INSERT da uni umuman yozmaydi:

        null value in column "dup_reviewed" violates not-null constraint

    Natija: WS orqali kiritilgan HAR QANDAY kirim/chiqim yiqilardi —
    foydalanuvchilar «kirim qila olmayapman» deb shikoyat qildi
    (2026-08-08, `client_erp` 0044/0045 dan keyin).

YECHIM:
    Yangi NOT NULL ustunlarga DB darajasida DEFAULT qoldiramiz. Shunda
    eski kod ustunni yozmasa ham baza o'zi to'ldiradi. Yangi kod esa
    qiymatni ochiq yozadi — hech narsa o'zgarmaydi.

QOIDA (kelajak uchun):
    `client_erp` ga NOT NULL maydon qo'shilsa — SHU migratsiyadagi kabi
    `SET DEFAULT` ham qo'shilsin, aks holda WS restart qilinmaguncha
    yozuv operatsiyalari sinadi.
"""
from django.db import migrations


# (jadval, ustun, SQL-default)
DEFAULTS = [
    ('client_erp_clientfinancerecord', 'dup_reviewed', 'false'),
    ('client_erp_clientuser', 'language', "'uz'"),
]


def set_defaults(apps, schema_editor):
    con = schema_editor.connection
    with con.cursor() as c:
        for table, col, dflt in DEFAULTS:
            c.execute(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name=%s AND column_name=%s",
                [table, col],
            )
            if c.fetchone():
                c.execute(f'ALTER TABLE {table} ALTER COLUMN {col} SET DEFAULT {dflt}')


def drop_defaults(apps, schema_editor):
    con = schema_editor.connection
    with con.cursor() as c:
        for table, col, _ in DEFAULTS:
            c.execute(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name=%s AND column_name=%s",
                [table, col],
            )
            if c.fetchone():
                c.execute(f'ALTER TABLE {table} ALTER COLUMN {col} DROP DEFAULT')


class Migration(migrations.Migration):

    dependencies = [
        ('client_erp', '0045_clientuser_language'),
    ]

    operations = [
        migrations.RunPython(set_defaults, drop_defaults),
    ]
