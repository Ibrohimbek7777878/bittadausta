# FAZA 2: Backend API (Views + URLs)

**Fayl:** `client_erp/DOCS/FAZA-2-Backend-API.md`
**Davomiyligi:** ~1.5 soat
**Oldingi shart:** Faza 1 (modellar) tugatilgan
**Natija:** 14 ta yangi endpoint, 3 ta mavjud endpoint kengaytirilgan, permission helper

---

## PROMPT (Claude uchun)

```
Sening vazifang Client ERP order stages tizimiga backend API yozish. Faza 1 da modellar yaratilgan, endi views va URL lar kerak.

KONTEKST:
- Loyiha: /home/user/mebelcity_platform
- App: client_erp
- Views papka: client_erp/views/ (mavjud: orders.py, finance.py, dashboard.py, auth.py, admin.py, customers.py, zamers.py, portfolio.py, mebelcity.py, settings.py)
- URLs: client_erp/urls.py
- Modellar: ClientOrderStage, ClientOrderStageItem, ClientOrderStageTemplate, ClientOrderStageTemplateItem, ClientOrderPermission (Faza 1 da yaratilgan)
- Middleware: request.client_user — hozirgi foydalanuvchi (ClientUser)
- Autentifikatsiya: session-based, middleware bilan
- JSON API: barcha POST lar JSON body qabul qiladi, JsonResponse qaytaradi

═══ 1. PERMISSION HELPER ═══

Fayl: client_erp/views/orders.py (tepasiga qo'shish)

def _check_order_access(request, order, require_role=None, stage=None):
    """
    Buyurtmaga ruxsat tekshirish.
    Returns: (allowed: bool, role: str, permission: ClientOrderPermission|None)
    
    Logika:
    1. order.owner == request.client_user → ('owner', None) — to'liq huquq
    2. ClientOrderPermission mavjud → (perm.role, perm)
    3. Aks holda → ruxsat yo'q
    
    require_role qabul qilsa tekshiradi:
    - 'viewer' — barcha rollar o'tadi
    - 'worker' — worker va manager o'tadi
    - 'manager' — faqat manager va owner o'tadi
    
    stage qabul qilsa — worker uchun shu stage ruxsat borligini tekshiradi:
    - perm.stages.count()==0 → barcha etaplarga ruxsat
    - aks holda perm.stages.filter(pk=stage.pk).exists()
    """

def _require_access(request, order, require_role='viewer', stage=None):
    """
    _check_order_access wrapper — ruxsat yo'q bo'lsa JsonResponse(403) qaytaradi.
    Returns: (role, permission) yoki JsonResponse
    """

═══ 2. STAGE VIEWS ═══

Fayl: client_erp/views/stages.py (YANGI)

Import: json, Decimal, django.shortcuts, django.http, django.utils.timezone
Models: ClientOrder, ClientOrderStage, ClientOrderStageItem, ClientOrderStageTemplate, ClientOrderStageTemplateItem, ClientOrderTimeline, ClientFinanceRecord, ClientOrderPermission

--- 2a. mini_stage_create ---
POST /mini/<username>/orders/<pk>/stages/create/
Body: {title, icon?, color?, sort_order?, deadline?, is_mebelcity?, checklist?: ["item1","item2"]}
Ruxsat: owner yoki manager
Logika:
1. Order topish (get_object_or_404)
2. _require_access(request, order, 'manager')
3. sort_order bo'lmasa — mavjud max + 1
4. Stage yaratish
5. checklist bo'lsa — ClientOrderStageItem lar yaratish (har biri uchun)
6. Agar bu birinchi stage → status='active', started_at=now()
7. Timeline: "📋 Etap qo'shildi: {title}"
8. JsonResponse({'ok': True, 'id': stage.id})

--- 2b. mini_stage_update ---
POST /mini/<username>/orders/<pk>/stages/<stage_id>/update/
Body: {title?, icon?, color?, note?, estimated_cost?, deadline?, assigned_to_id?}
Ruxsat: owner yoki manager
Logika: fieldlarni yangilash, save

--- 2c. mini_stage_complete ---
POST /mini/<username>/orders/<pk>/stages/<stage_id>/complete/
Body: {} (ixtiyoriy note)
Ruxsat: owner, manager, yoki worker (shu stage ga ruxsat bo'lsa)
Logika:
1. _require_access(request, order, 'worker', stage=stage)
2. Checklist tekshirish: agar stage.checklist.filter(is_done=False).exists() → xatolik
3. stage.status = 'completed'
4. stage.completed_at = timezone.now()
5. stage.completed_by = request.client_user
6. stage.save()
7. Keyingi pending stage ni activate:
   next_stage = order.stages.filter(status='pending').order_by('sort_order').first()
   if next_stage: next_stage.status='active', next_stage.started_at=now(), next_stage.save()
8. order.update_progress()
9. Agar barcha stage completed → order.status = 'ready', order.save()
10. Timeline: "✅ Etap tugallandi: {title}"
11. JsonResponse({'ok': True, 'progress': order.overall_progress})

--- 2d. mini_stage_skip ---
POST /mini/<username>/orders/<pk>/stages/<stage_id>/skip/
Ruxsat: owner yoki manager
Logika:
1. stage.status = 'skipped', save
2. Keyingi pending stage ni activate (xuddi complete dek)
3. order.update_progress()
4. Timeline: "⏭️ Etap o'tkazildi: {title}"

--- 2e. mini_stage_delete ---
POST /mini/<username>/orders/<pk>/stages/<stage_id>/delete/
Ruxsat: owner yoki manager
Logika:
1. stage.delete()
2. order.update_progress()
3. Timeline: "🗑 Etap o'chirildi: {title}"

--- 2f. mini_stages_reorder ---
POST /mini/<username>/orders/<pk>/stages/reorder/
Body: {order: [stage_id, stage_id, ...]}
Ruxsat: owner yoki manager
Logika: enumerate bilan sort_order yangilash (bulk_update)

--- 2g. mini_stage_check ---
POST /mini/<username>/orders/<pk>/stages/<stage_id>/check/
Body: {item_id: int}
Ruxsat: owner, manager, yoki worker (shu stage)
Logika:
1. item = get_object_or_404(ClientOrderStageItem, pk=item_id, stage=stage)
2. Toggle: item.is_done = not item.is_done
3. Agar is_done: item.done_by=user, item.done_at=now()
4. Agar not is_done: item.done_by=None, item.done_at=None
5. item.save()
6. JsonResponse({'ok': True, 'is_done': item.is_done})

═══ 3. PERMISSION VIEWS ═══

Fayl: client_erp/views/stages.py (davomi)

--- 3a. mini_permission_save ---
POST /mini/<username>/orders/<pk>/permissions/save/
Body: {user_id, role, stage_ids?: [int], can_add_expense?, can_complete_stage?}
Ruxsat: faqat owner
Logika:
1. target_user = get_object_or_404(ClientUser, pk=user_id)
2. perm, created = ClientOrderPermission.objects.update_or_create(
       order=order, user=target_user,
       defaults={role, can_add_expense, can_complete_stage}
   )
3. Agar stage_ids → perm.stages.set(stage_ids)
4. Timeline: "👤 Ruxsat berildi: {user.full_name} ({role})"

--- 3b. mini_permission_delete ---
POST /mini/<username>/orders/<pk>/permissions/<perm_id>/delete/
Ruxsat: faqat owner
Logika: perm.delete() + Timeline

═══ 4. TEMPLATE VIEWS ═══

Fayl: client_erp/views/stages.py (davomi)

--- 4a. mini_template_save ---
POST /mini/<username>/stages/templates/save/
Body: {id?: int, name, items: [{title, icon, color, sort_order, is_mebelcity, checklist: []}]}
Ruxsat: owner (o'z shablonlari)
Logika:
1. id bo'lsa — update, bo'lmasa create
2. template.items.all().delete() — eski itemlar tozalash
3. Yangi itemlar yaratish (bulk_create)

--- 4b. mini_template_list ---
GET /mini/<username>/stages/templates/
Ruxsat: owner
Logika: JsonResponse bilan template ro'yxati + itemlari

--- 4c. mini_template_apply ---
POST /mini/<username>/stages/templates/<tmpl_id>/apply/<order_pk>/
Ruxsat: owner yoki manager
Logika:
1. Template va Order topish
2. Har bir TemplateItem uchun ClientOrderStage yaratish
3. checklist_json dan ClientOrderStageItem lar yaratish
4. Birinchi stage ni activate
5. order.update_progress()
6. Timeline: "📋 Shablon qo'llanildi: {template.name}"

═══ 5. MAVJUD VIEWLARNI KENGAYTIRISH ═══

--- 5a. mini_order_detail (orders.py) ---
Context ga qo'shish:
- stages: order.stages.all().prefetch_related('checklist','expenses','assigned_to','completed_by')
- permissions: order.permissions.select_related('user').prefetch_related('stages') (faqat owner ko'radi)
- is_owner: order.owner == request.client_user
- user_role: _check_order_access natijasi
- user_permission: agar owner emas — permission object
- stage_templates: ClientOrderStageTemplate.objects.filter(owner=user) (faqat owner uchun)

Muhim: agar user owner emas — _check_order_access tekshirish. Ruxsat yo'q bo'lsa 404.

--- 5b. mini_order_expense (orders.py) ---
Body ga stage_id qo'shish:
- stage_id = body.get('stage_id')
- Agar stage_id → stage = get_object_or_404(ClientOrderStage, pk=stage_id, order=order)
- ClientFinanceRecord.objects.create(..., stage=stage)
- Permission tekshirish: worker + can_add_expense yoki manager/owner

--- 5c. mini_order_create (orders.py) ---
Body ga template_id qo'shish:
- template_id = body.get('template_id')
- Agar template_id → shablondan etaplar yaratish (mini_template_apply logikasi inline)

═══ 6. URL PATTERNS ═══

Fayl: client_erp/urls.py

Yuqoridagi importga qo'shish:
from .views import stages

Yangi URL lar (# Etaplar komment ostida, orders URLlaridan keyin):

# Etaplar (Stages)
path('<str:username>/orders/<int:pk>/stages/create/', stages.mini_stage_create, name='stage-create'),
path('<str:username>/orders/<int:pk>/stages/<int:stage_id>/update/', stages.mini_stage_update, name='stage-update'),
path('<str:username>/orders/<int:pk>/stages/<int:stage_id>/complete/', stages.mini_stage_complete, name='stage-complete'),
path('<str:username>/orders/<int:pk>/stages/<int:stage_id>/skip/', stages.mini_stage_skip, name='stage-skip'),
path('<str:username>/orders/<int:pk>/stages/<int:stage_id>/delete/', stages.mini_stage_delete, name='stage-delete'),
path('<str:username>/orders/<int:pk>/stages/reorder/', stages.mini_stages_reorder, name='stages-reorder'),
path('<str:username>/orders/<int:pk>/stages/<int:stage_id>/check/', stages.mini_stage_check, name='stage-check'),

# Ruxsatlar
path('<str:username>/orders/<int:pk>/permissions/save/', stages.mini_permission_save, name='permission-save'),
path('<str:username>/orders/<int:pk>/permissions/<int:perm_id>/delete/', stages.mini_permission_delete, name='permission-delete'),

# Shablonlar
path('<str:username>/stages/templates/', stages.mini_template_list, name='template-list'),
path('<str:username>/stages/templates/save/', stages.mini_template_save, name='template-save'),
path('<str:username>/stages/templates/<int:tmpl_id>/apply/<int:order_pk>/', stages.mini_template_apply, name='template-apply'),

MUHIM: bu URLlar orders URLlaridan OLDIN bo'lishi kerak (chunki <str:username> catch-all)
Aslida stages/templates/ URLlar <str:username>/orders/ bilan boshlanmaydi, shuning uchun muammo yo'q.
Lekin orders ichidagi stages URLlar <int:pk>/stages/... bilan davom etadi — bu <int:pk>/ dan keyin keladi shuning uchun order-detail URLdan OLDIN qo'yish kerak.

═══ QOIDALAR ═══
- Barcha POST endpointlar @require_POST decorator bilan
- Barcha endpointlar JSON body qabul qiladi (json.loads(request.body))
- Xatolik: JsonResponse({'error': '...'}, status=400/403/404)
- Timeline yozish: ClientOrderTimeline.objects.create(order=order, action=...)
- Template va UI yozma — faqat backend
- Restart: sudo systemctl restart bittada-manager
```

---

## Fayl xaritasi

| Fayl | Harakat |
|------|---------|
| `client_erp/views/stages.py` | YANGI — 11 ta view funksiya |
| `client_erp/views/orders.py` | `_check_order_access`, `_require_access` + 3 ta view kengaytirish |
| `client_erp/urls.py` | 13 ta yangi URL pattern + stages import |

---

## Tekshirish

```bash
# URL test
/home/user/mebelcity_platform/platform_venv/bin/python /home/user/mebelcity_platform/manage.py shell -c "
from django.urls import reverse
print(reverse('client_erp:stage-create', kwargs={'username':'test','pk':1}))
print(reverse('client_erp:stage-complete', kwargs={'username':'test','pk':1,'stage_id':1}))
print(reverse('client_erp:permission-save', kwargs={'username':'test','pk':1}))
print(reverse('client_erp:template-list', kwargs={'username':'test'}))
print('OK — barcha URLlar ishlaydi')
"
```
