# 2026-09-23 (qo'lda yozildi, additive): taklif tizimi + demo + admin.
# DIQQAT DEPLOY: production'da 0069/0070 allaqachon band bo'lishi mumkin
# (has_seen_intro) — serverda bu faylni keyingi bo'sh raqamga ko'chiring.
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('client_erp', '0068_order_file_measurements'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientuser',
            name='is_demo',
            field=models.BooleanField(default=False, verbose_name='Demo akkaunt'),
        ),
        migrations.AddField(
            model_name='clientuser',
            name='demo_expires_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Demo tugash vaqti'),
        ),
        migrations.AddField(
            model_name='clientuser',
            name='is_app_admin',
            field=models.BooleanField(default=False, verbose_name='Ilova admini'),
        ),
        migrations.CreateModel(
            name='ClientPendingInvite',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('phone', models.CharField(max_length=20, verbose_name='Taklif qilingan nomer')),
                ('name', models.CharField(max_length=200, verbose_name='Taklif qilingan ism')),
                ('role', models.CharField(default='worker', max_length=10)),
                ('profit_percent', models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ('status', models.CharField(choices=[('waiting', 'Kutilmoqda'), ('registered', "Ro'yxatdan o'tdi"), ('cancelled', 'Bekor qilingan')], db_index=True, default='waiting', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('registered_at', models.DateTimeField(blank=True, null=True)),
                ('inviter', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sent_invites', to='client_erp.clientuser')),
                ('team', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pending_invites', to='client_erp.clientteam')),
            ],
            options={
                'verbose_name': 'Kutilayotgan taklif',
                'verbose_name_plural': 'Kutilayotgan takliflar',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='AppSetting',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=100, unique=True)),
                ('value', models.TextField(blank=True, default='')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='setting_updates', to='client_erp.clientuser')),
            ],
            options={
                'verbose_name': 'Ilova sozlamasi',
            },
        ),
    ]
