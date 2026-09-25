from django.db import migrations

SEED = [
    # (key, label, color, sort_order, is_system)
    ('new', 'Yangi', '#6366f1', 1, True),
    ('waiting', 'Kutilmoqda', '#f59e0b', 2, False),
    ('in_progress', 'Jarayonda', '#0ea5e9', 3, True),
    ('at_mebelcity', 'MebelCity da', '#8b5cf6', 4, True),
    ('ready', 'Tayyor', '#10b981', 5, True),
    ('delivered', 'Topshirildi', '#16a34a', 6, True),
    ('cancelled', 'Bekor', '#dc2626', 7, True),
]


def seed_statuses(apps, schema_editor):
    ClientOrderStatusDef = apps.get_model('client_erp', 'ClientOrderStatusDef')
    db = schema_editor.connection.alias
    for key, label, color, sort_order, is_system in SEED:
        ClientOrderStatusDef.objects.using(db).get_or_create(
            key=key,
            defaults={
                'label': label, 'color': color,
                'sort_order': sort_order, 'is_system': is_system,
            },
        )


def unseed_statuses(apps, schema_editor):
    ClientOrderStatusDef = apps.get_model('client_erp', 'ClientOrderStatusDef')
    db = schema_editor.connection.alias
    ClientOrderStatusDef.objects.using(db).filter(
        key__in=[k for k, *_ in SEED],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('client_erp', '0021_clientorderstatusdef'),
    ]

    operations = [
        migrations.RunPython(seed_statuses, unseed_statuses),
    ]
