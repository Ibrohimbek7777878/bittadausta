# FAZA 4: Shared Access + Dashboard + Shablonlar

**Fayl:** `client_erp/DOCS/FAZA-4-Shared-Access.md`
**Davomiyligi:** ~1 soat
**Oldingi shart:** Faza 1-3 tugatilgan
**Natija:** Worker/viewer dashboard, shared order access, default shablonlar, orders list yangilash

---

## PROMPT (Claude uchun)

```
Sening vazifang Client ERP ga shared order access va worker dashboard qo'shish. Faza 1-3 da modellar, API, UI tayyor. Endi:
1) Boshqa userlar shared orderlarni ko'ra olishi
2) Worker dashboardda "Vazifalarim" bo'limi
3) Default stage shablonlar generatsiya
4) Orders list sahifasida progress ko'rinishi

KONTEKST:
- Loyiha: /home/user/mebelcity_platform
- App: client_erp
- Middleware: client_erp/middleware.py — ClientERPMiddleware (request.client_user)
- Views: client_erp/views/ (orders.py, stages.py, dashboard.py)
- Templates: template/client_erp/pages/ (dashboard.html, orders/list.html, orders/detail.html)
- Models: ClientOrder, ClientOrderStage, ClientOrderPermission, ClientOrderStageTemplate, ClientOrderStageTemplateItem

═══ 1. SHARED ORDER ACCESS ═══

Fayl: client_erp/views/orders.py → mini_order_detail

Hozirgi holat: get_object_or_404(ClientOrder, pk=pk, owner=user) — faqat owner
Yangi logika:

def mini_order_detail(request, username, pk):
    user = request.client_user
    # 1. Avval owner sifatida izlash
    order = ClientOrder.objects.filter(pk=pk, owner=user).first()
    is_owner = bool(order)
    
    if not order:
        # 2. Permission bilan izlash
        order = ClientOrder.objects.filter(pk=pk).first()
        if not order:
            raise Http404
        perm = ClientOrderPermission.objects.filter(order=order, user=user).first()
        if not perm:
            raise Http404
        user_role = perm.role
        user_permission = perm
    else:
        user_role = 'owner'
        user_permission = None
    
    # Qolgan logika o'zgarmasdan...
    # Context ga qo'shish: is_owner, user_role, user_permission

MUHIM: mini_order_update, mini_order_income, mini_order_expense — bularni ham permission-aware qilish:
- owner → to'liq
- manager → to'liq
- worker + can_add_expense → faqat expense
- viewer → hech nima (403)

═══ 2. WORKER DASHBOARD — "VAZIFALARIM" ═══

Fayl: client_erp/views/dashboard.py → mini_dashboard

Mavjud context ga qo'shish:

# Menga berilgan vazifalar (boshqa userlardagi orderlar)
from ..models import ClientOrderPermission, ClientOrderStage
my_permissions = ClientOrderPermission.objects.filter(
    user=user
).select_related('order', 'order__customer', 'order__owner')

shared_tasks = []
for perm in my_permissions:
    order = perm.order
    # Shu permissiondagi aktiv etaplar
    if perm.stages.exists():
        my_stages = perm.stages.filter(status__in=['active', 'pending']).order_by('sort_order')
    else:
        my_stages = order.stages.filter(status__in=['active', 'pending']).order_by('sort_order')
    
    if my_stages.exists() or order.status not in ('delivered', 'cancelled'):
        shared_tasks.append({
            'order': order,
            'permission': perm,
            'active_stages': my_stages[:3],
            'stages_count': order.stages.count(),
            'completed_count': order.stages.filter(status='completed').count(),
        })

Context: 'shared_tasks': shared_tasks

Fayl: template/client_erp/pages/dashboard.html

Aktiv buyurtmalar bo'limidan KEYIN, yangi bo'lim qo'shish:

<!-- ═══ VAZIFALARIM ═══ -->
{% if shared_tasks %}
<div style="margin-bottom:24px;margin-top:20px">
    <h3 class="ce-section-title"><i class="fas fa-tasks" style="color:#6366f1"></i> Vazifalarim</h3>
    {% for t in shared_tasks %}
    <a href="/mini/{{ t.order.owner.username }}/orders/{{ t.order.id }}/" class="ce-card" style="margin-bottom:10px;display:flex;align-items:center;gap:14px;text-decoration:none;color:inherit">
        <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(99,102,241,.05));display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fas fa-user-cog" style="color:#6366f1;font-size:16px"></i>
        </div>
        <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:14px">{{ t.order.title }}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:1px">
                {{ t.order.owner.full_name }} · 
                {{ t.permission.get_role_display }} ·
                {{ t.completed_count }}/{{ t.stages_count }} etap
            </div>
            {% for s in t.active_stages %}
            <div style="font-size:11px;margin-top:2px">
                {% if s.status == 'active' %}🔄{% else %}⏳{% endif %} {{ s.title }}
            </div>
            {% endfor %}
        </div>
        <div style="text-align:right">
            <div style="font-size:20px;font-weight:900;color:#6366f1">{{ t.order.overall_progress }}%</div>
        </div>
    </a>
    {% endfor %}
</div>
{% endif %}

═══ 3. ORDERS LIST YANGILASH ═══

Fayl: template/client_erp/pages/orders/list.html

Har order card ga progress bar va etap soni qo'shish:

Mavjud card ichiga, status badge dan OLDIN:
{% if o.use_stages and o.overall_progress > 0 %}
<div style="width:40px;text-align:center">
    <div style="font-size:13px;font-weight:800;color:var(--accent)">{{ o.overall_progress }}%</div>
    <div style="background:var(--border);border-radius:3px;height:4px;margin-top:2px;overflow:hidden">
        <div style="background:var(--accent);height:100%;width:{{ o.overall_progress }}%"></div>
    </div>
</div>
{% endif %}

Fayl: client_erp/views/orders.py → mini_orders

Orders list da shared orders ham ko'rsatish:
# O'z buyurtmalari
own_orders = ClientOrder.objects.filter(owner=user).select_related('customer')

# Shared buyurtmalar (menga ruxsat berilgan)
shared_order_ids = ClientOrderPermission.objects.filter(user=user).values_list('order_id', flat=True)
shared_orders = ClientOrder.objects.filter(id__in=shared_order_ids).select_related('customer', 'owner')

Context: 'orders': own_orders, 'shared_orders': shared_orders

Template da shared orders alohida bo'lim:
{% if shared_orders %}
<h3 class="ce-section-title" style="margin-top:20px"><i class="fas fa-share-alt" style="color:#6366f1"></i> Ulashilgan buyurtmalar</h3>
{% for o in shared_orders %}
... (xuddi shu card, lekin owner ko'rsatiladi)
{% endfor %}
{% endif %}

═══ 4. DEFAULT SHABLONLAR GENERATSIYA ═══

Fayl: client_erp/management/commands/generate_stage_templates.py (YANGI)

Django management command:
/home/user/mebelcity_platform/platform_venv/bin/python /home/user/mebelcity_platform/manage.py generate_stage_templates

Logika:
1. Barcha ClientUser lar uchun default shablonlar yaratish (yoki bitta global user uchun)
   - Aslida: owner=None bo'lmasligi kerak (FK required)
   - Yechim: barcha userlarga emas, faqat birinchi ishga tushganda — user o'zi ko'radi
   - Yoki: ClientOrderStageTemplate ga owner=null, blank=True qo'shish (global shablonlar)
   
   QAROR: owner ni null=True, blank=True qilish. Global shablonlar owner=None bo'ladi.
   Bu uchun Faza 1 modelga o'zgartirish kerak — migration qilish.

2. 3 ta shablon yaratish:

SHABLON 1: "Umumiy mebel" (is_default=True)
Items:
| # | title | icon | color | is_mebelcity | checklist_json |
|---|-------|------|-------|-------------|----------------|
| 1 | Dizayn va o'lchov | 📐 | #6366f1 | False | ["Zamer olish","Chizma tayyorlash","Mijoz tasdiqlash"] |
| 2 | Material olish | 🧱 | #f59e0b | False | ["ЛДСП sotib olish","Furnitura olish","Aksessuarlar"] |
| 3 | Kesish | ✂️ | #ef4444 | False | ["Materiallarni kesish","Krom yapish"] |
| 4 | Yig'ish | 🔨 | #10b981 | False | ["Korpusni yig'ish","Eshiklarni o'rnatish"] |
| 5 | MebelCity zakaz | 🏢 | #8b5cf6 | True | [] |
| 6 | Bo'yash / Ishlov | 🎨 | #ec4899 | False | ["Sirtni tayyorlash","Bo'yash","Quritish"] |
| 7 | Yetkazish va o'rnatish | 🚛 | #3b82f6 | False | ["Transportga yuklash","Yetkazish","O'rnatish","Mijoz qabul"] |

SHABLON 2: "Oshxona mebel"
Items:
| # | title | icon | color | is_mebelcity | checklist_json |
|---|-------|------|-------|-------------|----------------|
| 1 | Loyiha | 📐 | #6366f1 | False | ["3D loyiha","Mijoz tasdiqlash"] |
| 2 | Material | 🧱 | #f59e0b | False | ["ЛДСП","Stoleshnitsa","Moskovka","Furnitura"] |
| 3 | MebelCity | 🏢 | #8b5cf6 | True | [] |
| 4 | Korpus yig'ish | 🔨 | #10b981 | False | ["Pastki shkaflar","Ustki shkaflar"] |
| 5 | O'rnatish | 🚛 | #3b82f6 | False | ["Yetkazish","O'rnatish","Texnika ulash","Topshirish"] |

SHABLON 3: "Shkaf-kupe"
Items:
| # | title | icon | color | is_mebelcity | checklist_json |
|---|-------|------|-------|-------------|----------------|
| 1 | O'lchov | 📐 | #6366f1 | False | ["Zamer","Chizma"] |
| 2 | Material | 🧱 | #f59e0b | False | ["ЛДСП","Oyna/Ko'zgu","Profil","Roliklar"] |
| 3 | Kesish va yig'ish | ✂️ | #ef4444 | False | ["ЛДСП kesish","Korpus yig'ish"] |
| 4 | Eshiklar | 🪟 | #8b5cf6 | False | ["Profil kesish","Oyna o'rnatish","Yig'ish"] |
| 5 | O'rnatish | 🚛 | #3b82f6 | False | ["Yetkazish","O'rnatish","Topshirish"] |

═══ 5. TIMELINE AVTOMATIK YOZUVLAR ═══

Barcha stage o'zgarishlarini timeline ga yozish — Faza 2 da qilingan.
Qo'shimcha: permission yaratish/o'chirish ham timeline ga yoziladi.

Formatlari:
- "📋 Etap qo'shildi: Material olish"
- "✅ Etap tugallandi: Dizayn (Sardor tomonidan)"
- "⏭️ Etap o'tkazildi: MebelCity zakaz"
- "☑️ Checklist: ЛДСП sotib olish ✓"
- "👤 Ruxsat berildi: Bobur (Ishchi)"
- "👤 Ruxsat olib tashlandi: Bobur"
- "📤 Chiqim: 1,200,000 so'm — Material olish etapida"
- "📋 Shablon qo'llanildi: Oshxona mebel (5 etap)"

═══ QOIDALAR ═══
- Middleware: request.client_user doimo mavjud (login qilingan)
- URL dagi username — sahifa egasi. Shared order da boshqa usernig URL si
- get_object_or_404 → endi owner yoki permission tekshirish
- 404 qaytarish (403 emas) — security through obscurity
- Restart: sudo systemctl restart bittada-manager
- Agar model o'zgartirish kerak (owner nullable) → migration ham qilish
```

---

## Fayl xaritasi

| Fayl | Harakat |
|------|---------|
| `client_erp/views/orders.py` | Shared order access logikasi |
| `client_erp/views/dashboard.py` | "Vazifalarim" context qo'shish |
| `template/client_erp/pages/dashboard.html` | "Vazifalarim" bo'limi qo'shish |
| `template/client_erp/pages/orders/list.html` | Progress bar + shared orders bo'limi |
| `client_erp/management/commands/generate_stage_templates.py` | YANGI — management command |
| `client_erp/models/stage_template.py` | owner nullable qilish (agar kerak) |
| `client_erp/migrations/0005_*.py` | Agar model o'zgarsa |

---

## Tekshirish

```bash
# 1. Shablonlar generatsiya
/home/user/mebelcity_platform/platform_venv/bin/python /home/user/mebelcity_platform/manage.py generate_stage_templates

# 2. Shablonlar tekshirish
/home/user/mebelcity_platform/platform_venv/bin/python /home/user/mebelcity_platform/manage.py shell -c "
from client_erp.models import ClientOrderStageTemplate, ClientOrderStageTemplateItem
for t in ClientOrderStageTemplate.objects.all():
    items = t.items.all()
    print(f'{t.name}: {items.count()} etap')
    for i in items:
        print(f'  {i.sort_order}. {i.icon} {i.title} (mc={i.is_mebelcity}) checklist={i.checklist_json}')
"

# 3. Restart
sudo systemctl restart bittada-manager

# 4. Browser test
# - /mini/bigone_cl/ → "Vazifalarim" bo'limi (agar shared order bor bo'lsa)
# - /mini/bigone_cl/orders/ → progress bar, shared orders
# - /mini/bigone_cl/orders/1/ → boshqa user sifatida kirish (permission bilan)
```
