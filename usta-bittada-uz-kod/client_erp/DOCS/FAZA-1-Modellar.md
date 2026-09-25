# FAZA 1: Modellar + Migration

**Fayl:** `client_erp/DOCS/FAZA-1-Modellar.md`
**Davomiyligi:** ~1 soat
**Natija:** 5 ta yangi model, 2 ta mavjud model kengaytirilgan, migration yaratilgan va qo'llanilgan

---

## PROMPT (Claude uchun)

```
Sening vazifang MebelCity Client ERP buyurtma tizimiga dinamik etaplar (stages) qo'shish — FAQAT modellar va migration.

KONTEKST:
- Loyiha: /home/user/mebelcity_platform
- App: client_erp
- Mavjud modellar: ClientOrder (order.py), ClientFinanceRecord (finance.py), ClientUser (user.py)
- Migration fayllari: client_erp/migrations/ (oxirgi: 0003_finance_upgrade.py)
- __init__.py: client_erp/models/__init__.py — barcha modellar shu yerda import qilinadi
- Django 5.x, PostgreSQL

YARATILISHI KERAK BO'LGAN MODELLAR:

═══ 1. ClientOrderStage (order.py ga qo'shish) ═══
Buyurtmaning bir etapi. Har buyurtmada 0..N ta etap.

Fieldlar:
- order: FK → ClientOrder, on_delete=CASCADE, related_name='stages'
- template_item: FK → ClientOrderStageTemplateItem, null=True, blank=True, on_delete=SET_NULL
- title: CharField(max_length=200)
- icon: CharField(max_length=10, default='📋') — emoji
- color: CharField(max_length=7, default='#6366f1') — hex rang
- sort_order: IntegerField(default=0)
- status: CharField(max_length=15, choices=[('pending','Kutilmoqda'),('active','Faol'),('completed','Tugallangan'),('skipped','O\'tkazildi')], default='pending')
- assigned_to: FK → ClientUser, null=True, blank=True, on_delete=SET_NULL, related_name='assigned_stages'
- started_at: DateTimeField(null=True, blank=True)
- completed_at: DateTimeField(null=True, blank=True)
- completed_by: FK → ClientUser, null=True, blank=True, on_delete=SET_NULL, related_name='completed_stages'
- note: TextField(blank=True, default='')
- estimated_cost: DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
- deadline: DateTimeField(null=True, blank=True)
- is_mebelcity: BooleanField(default=False) — MebelCity zakaz etapi
- created_at: DateTimeField(auto_now_add=True)

Meta: app_label='client_erp', ordering=['sort_order','id']
__str__: f"{self.sort_order}. {self.title}"

Property:
- total_expense: shu stage ga bog'langan ClientFinanceRecord(record_type='expense', is_deleted=False).aggregate(Sum('amount'))

═══ 2. ClientOrderStageItem (order.py ga qo'shish) ═══
Etap ichidagi checklist element.

Fieldlar:
- stage: FK → ClientOrderStage, on_delete=CASCADE, related_name='checklist'
- title: CharField(max_length=300)
- is_done: BooleanField(default=False)
- done_by: FK → ClientUser, null=True, blank=True, on_delete=SET_NULL
- done_at: DateTimeField(null=True, blank=True)
- sort_order: IntegerField(default=0)

Meta: app_label='client_erp', ordering=['sort_order','id']

═══ 3. ClientOrderStageTemplate (yangi fayl: models/stage_template.py) ═══
Foydalanuvchining etap shabloni.

Fieldlar:
- owner: FK → ClientUser, on_delete=CASCADE, related_name='stage_templates'
- name: CharField(max_length=200) — "Oshxona mebel", "Shkaf-kupe"
- is_default: BooleanField(default=False)
- created_at: DateTimeField(auto_now_add=True)

Meta: app_label='client_erp', ordering=['-is_default','name']
__str__: self.name

═══ 4. ClientOrderStageTemplateItem (stage_template.py ga qo'shish) ═══
Shablon ichidagi etap.

Fieldlar:
- template: FK → ClientOrderStageTemplate, on_delete=CASCADE, related_name='items'
- title: CharField(max_length=200)
- icon: CharField(max_length=10, default='📋')
- color: CharField(max_length=7, default='#6366f1')
- sort_order: IntegerField(default=0)
- is_mebelcity: BooleanField(default=False)
- checklist_json: JSONField(default=list, blank=True) — ["ЛДСП kesish", "Furnitura"]

Meta: app_label='client_erp', ordering=['sort_order']

═══ 5. ClientOrderPermission (yangi fayl: models/permission.py) ═══
Boshqa foydalanuvchiga buyurtmaga ruxsat.

Fieldlar:
- order: FK → ClientOrder, on_delete=CASCADE, related_name='permissions'
- user: FK → ClientUser, on_delete=CASCADE, related_name='order_permissions'
- role: CharField(max_length=10, choices=[('viewer','Ko\'ruvchi'),('worker','Ishchi'),('manager','Menejer')], default='worker')
- stages: M2M → ClientOrderStage, blank=True, related_name='permitted_users'
- can_add_expense: BooleanField(default=False)
- can_complete_stage: BooleanField(default=True)
- created_at: DateTimeField(auto_now_add=True)

Meta: app_label='client_erp', unique_together=[('order','user')]

═══ MAVJUD MODELLARNI KENGAYTIRISH ═══

6. ClientOrder (order.py) ga qo'shish:
   - use_stages: BooleanField(default=True)
   - stage_template: FK → ClientOrderStageTemplate, null=True, blank=True, on_delete=SET_NULL
   - overall_progress: IntegerField(default=0) — 0-100, cached

   Yangi method:
   def update_progress(self):
       stages = self.stages.exclude(status='skipped')
       total = stages.count()
       if total == 0:
           self.overall_progress = 0
       else:
           done = stages.filter(status='completed').count()
           self.overall_progress = int(done / total * 100)
       self.save(update_fields=['overall_progress'])

7. ClientFinanceRecord (finance.py) ga qo'shish:
   - stage: FK → ClientOrderStage, null=True, blank=True, on_delete=SET_NULL, related_name='expenses'

═══ __init__.py YANGILASH ═══

client_erp/models/__init__.py ga yangi importlar qo'shish:
- from .order import ClientOrderStage, ClientOrderStageItem (mavjud importga qo'shish)
- from .stage_template import ClientOrderStageTemplate, ClientOrderStageTemplateItem
- from .permission import ClientOrderPermission
- __all__ ga ham qo'shish

═══ MIGRATION ═══

Fayllarni yozgandan keyin:
/home/user/mebelcity_platform/platform_venv/bin/python /home/user/mebelcity_platform/manage.py makemigrations client_erp

Keyin qo'llash:
/home/user/mebelcity_platform/platform_venv/bin/python /home/user/mebelcity_platform/manage.py migrate client_erp

═══ QOIDALAR ═══
- Hech qanday view, URL, template YARATMA — faqat modellar
- Mavjud modellarning boshqa fieldlariga tegma
- app_label = 'client_erp' har bir Meta da bo'lishi SHART
- JSONField default=list (lambda emas)
- DecimalField max_digits=20, decimal_places=2
- Restart: sudo systemctl restart bittada-manager
```

---

## Fayl xaritasi

| Fayl | Harakat |
|------|---------|
| `client_erp/models/order.py` | `ClientOrderStage`, `ClientOrderStageItem` qo'shish + `ClientOrder` ga 3 field |
| `client_erp/models/stage_template.py` | YANGI — `ClientOrderStageTemplate`, `ClientOrderStageTemplateItem` |
| `client_erp/models/permission.py` | YANGI — `ClientOrderPermission` |
| `client_erp/models/finance.py` | `ClientFinanceRecord` ga `stage` FK qo'shish |
| `client_erp/models/__init__.py` | Yangi modellar import + __all__ |
| `client_erp/migrations/0004_*.py` | Auto-generated |

---

## Tekshirish

Migration yaratilgandan keyin:
```bash
# Shell test
/home/user/mebelcity_platform/platform_venv/bin/python /home/user/mebelcity_platform/manage.py shell -c "
from client_erp.models import (
    ClientOrderStage, ClientOrderStageItem,
    ClientOrderStageTemplate, ClientOrderStageTemplateItem,
    ClientOrderPermission, ClientOrder, ClientFinanceRecord,
)
print('ClientOrderStage fields:', [f.name for f in ClientOrderStage._meta.get_fields()])
print('ClientOrder.use_stages:', ClientOrder._meta.get_field('use_stages'))
print('ClientFinanceRecord.stage:', ClientFinanceRecord._meta.get_field('stage'))
print('OK — barcha modellar tayyor')
"
```
