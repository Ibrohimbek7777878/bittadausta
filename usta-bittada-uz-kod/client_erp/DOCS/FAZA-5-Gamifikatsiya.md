# FAZA 5: Gamifikatsiya integratsiya

**Fayl:** `client_erp/DOCS/FAZA-5-Gamifikatsiya.md`
**Davomiyligi:** ~30 daqiqa
**Oldingi shart:** Faza 1-4 tugatilgan
**Natija:** Etap tugallash → XP/tanga, quest integratsiya, bonus tizim

---

## PROMPT (Claude uchun)

```
Sening vazifang Client ERP order stages tizimini gamifikatsiya bilan bog'lash. Faza 1-4 da etaplar, UI, shared access tayyor. Endi har etap tugallanganda XP/tanga berilishi va quest lar triggerlash kerak.

KONTEKST:
- Loyiha: /home/user/mebelcity_platform
- App: client_erp
- Gamifikatsiya modellari: GamificationRule, XPTransaction, Quest, QuestCompletion (gamification.py)
- ClientUser fieldlari: xp, coins, coins_total_earned (user.py)
- Stage complete view: client_erp/views/stages.py → mini_stage_complete
- Order complete: order.status = 'ready' bo'lganda (barcha stage tugallanganda)

═══ 1. YANGI GAMIFIKATSIYA QOIDALAR ═══

Fayl: Faza 1 da yaratilgan management command ga qo'shish yoki alohida
Yoki to'g'ridan-to'g'ri shell orqali yaratish:

GamificationRule yaratish (agar mavjud bo'lmasa):

| code | name | icon | xp_reward | coin_reward | is_repeatable |
|------|------|------|-----------|-------------|---------------|
| complete_stage | Etap tugallash | ✅ | 15 | 5 | True |
| complete_order | Buyurtma tugallash | 🏆 | 100 | 30 | True |
| complete_order_ontime | Muddatida tugallash | ⏰ | 50 | 20 | True |
| first_order_stages | Birinchi buyurtma (etaplar bilan) | 🎯 | 200 | 50 | False |
| share_order | Buyurtmani ulashish | 🤝 | 20 | 10 | True |
| checklist_streak | 5 ta checklist ketma-ket | 🔥 | 10 | 3 | True |

═══ 2. GAMIFIKATSIYA SERVICE ═══

Fayl: client_erp/services/gamification.py (YANGI)

Bu fayl barcha XP/tanga logikani markazlashtiradi.

def award_xp(user, rule_code, description=''):
    """
    Foydalanuvchiga XP va tanga berish.
    
    1. GamificationRule topish (code bo'yicha, is_active=True)
    2. Agar not is_repeatable — avval berilganmi tekshirish (XPTransaction)
    3. Agar max_per_day — bugungi count tekshirish
    4. Agar min_level — user.vip_level tekshirish
    5. XPTransaction yaratish
    6. user.xp += rule.xp_reward
    7. user.coins += rule.coin_reward
    8. user.coins_total_earned += rule.coin_reward
    9. user.save(update_fields=['xp','coins','coins_total_earned'])
    10. _check_level_up(user)  — daraja ko'tarilishini tekshirish
    11. return (xp_gained, coins_gained) yoki (0, 0)
    """

def _check_level_up(user):
    """
    XP/turnover asosida VIP daraja yangilash.
    
    1. ClientVIPLevel.objects.filter(auto_promote=True).order_by('-level_number')
    2. user.turnover_year bilan solishtirish
    3. Agar yangi daraja topilsa va user.vip_level dan yuqori:
       - user.vip_level = new_level
       - user.save(update_fields=['vip_level'])
       - XPTransaction yaratish (description="Daraja ko'tarildi: {level.name}")
       - return new_level
    4. return None
    """

def check_quest_progress(user, action, count=1):
    """
    Quest progressini yangilash.
    
    action: 'purchase', 'review', 'referral', 'login', 'view_products', 'share', 'custom'
    Lekin bu yerda 'complete_stage' va 'complete_order' ham qo'shamiz.
    
    Logika:
    1. Bugungi Quest lar (quest_type='daily', is_active=True)
    2. Har quest uchun action tekshirish
    3. QuestCompletion topish/yaratish
    4. progress += count
    5. Agar progress >= quest.action_count → is_completed=True, award_xp
    """

═══ 3. STAGE COMPLETE GA INTEGRATSIYA ═══

Fayl: client_erp/views/stages.py → mini_stage_complete

Mavjud kodni kengaytirish. Stage tugallangandan KEYIN:

from ..services.gamification import award_xp, check_quest_progress

# Stage tugallangandan keyin:
# 1. XP berish
xp, coins = award_xp(request.client_user, 'complete_stage', 
    description=f"Etap tugallandi: {stage.title}")

# 2. Agar buyurtma to'liq tugallangan
if order.overall_progress == 100:
    xp2, coins2 = award_xp(request.client_user, 'complete_order',
        description=f"Buyurtma tugallandi: {order.title}")
    
    # 3. Muddatida tugallangan bo'lsa
    if order.deadline and timezone.now() <= order.deadline:
        award_xp(request.client_user, 'complete_order_ontime',
            description=f"Muddatida tugallandi: {order.title}")
    
    # 4. Birinchi buyurtma (etaplar bilan)
    completed_count = ClientOrder.objects.filter(
        owner=request.client_user, overall_progress=100
    ).count()
    if completed_count == 1:
        award_xp(request.client_user, 'first_order_stages',
            description="Birinchi buyurtma etaplar bilan tugallandi!")

# 5. Quest progress
check_quest_progress(request.client_user, 'complete_stage')
if order.overall_progress == 100:
    check_quest_progress(request.client_user, 'complete_order')

# 6. Response ga XP ma'lumot qo'shish
return JsonResponse({
    'ok': True, 
    'progress': order.overall_progress,
    'xp_gained': xp,
    'coins_gained': coins,
})

═══ 4. PERMISSION YARATISHDA XP ═══

Fayl: client_erp/views/stages.py → mini_permission_save

Permission yaratilgandan keyin:
award_xp(request.client_user, 'share_order',
    description=f"Buyurtma ulashildi: {order.title} → {target_user.full_name}")

═══ 5. CHECKLIST STREAK BONUS ═══

Fayl: client_erp/views/stages.py → mini_stage_check

5 ta ketma-ket checklist tugallanganda bonus:
if item.is_done:
    # Bugungi tugallangan checklistlar soni
    from django.utils import timezone
    today = timezone.localdate()
    today_checks = ClientOrderStageItem.objects.filter(
        done_by=request.client_user,
        done_at__date=today,
        is_done=True
    ).count()
    
    if today_checks % 5 == 0:  # Har 5 taga
        award_xp(request.client_user, 'checklist_streak',
            description=f"{today_checks} ta checklist tugallandi bugun")

═══ 6. FRONTEND XP NOTIFICATION ═══

Fayl: template/client_erp/pages/orders/detail.html

Stage complete response da xp_gained va coins_gained qaytariladi.
Frontend da toast notification ko'rsatish:

function showXpToast(xp, coins) {
    if (!xp && !coins) return;
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;padding:12px 20px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:700;font-size:14px;box-shadow:0 4px 20px rgba(99,102,241,.4);animation:slideIn .3s ease-out;display:flex;gap:12px;align-items:center';
    let text = '';
    if (xp) text += `+${xp} XP `;
    if (coins) text += `+${coins} 🪙`;
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        toast.style.transition = 'all .3s';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// stageComplete funksiyasida:
stageComplete(stageId) {
    // ... fetch POST ...
    .then(d => {
        if (d.ok) {
            showXpToast(d.xp_gained, d.coins_gained);
            setTimeout(() => location.reload(), 1000);
        }
    });
}

═══ 7. QUEST ACTION TYPES KENGAYTIRISH ═══

Fayl: client_erp/models/gamification.py → Quest

Mavjud ACTION_TYPES ga qo'shish (agar yo'q bo'lsa):
- ('complete_stage', 'Etap tugallash')
- ('complete_order', 'Buyurtma tugallash')

Agar ACTION_TYPES list formatda — qo'shish. Agar tuple — o'zgartirish kerak.

═══ 8. MANAGEMENT COMMAND — QOIDALAR GENERATSIYA ═══

Mavjud generate_stage_templates command ga yoki alohida:

/home/user/mebelcity_platform/platform_venv/bin/python /home/user/mebelcity_platform/manage.py shell -c "
from client_erp.models import GamificationRule

rules = [
    {'code':'complete_stage','name':'Etap tugallash','icon':'✅','xp_reward':15,'coin_reward':5,'is_repeatable':True,'is_active':True,'sort_order':20},
    {'code':'complete_order','name':'Buyurtma tugallash','icon':'🏆','xp_reward':100,'coin_reward':30,'is_repeatable':True,'is_active':True,'sort_order':21},
    {'code':'complete_order_ontime','name':'Muddatida tugallash','icon':'⏰','xp_reward':50,'coin_reward':20,'is_repeatable':True,'is_active':True,'sort_order':22},
    {'code':'first_order_stages','name':'Birinchi buyurtma (etaplar)','icon':'🎯','xp_reward':200,'coin_reward':50,'is_repeatable':False,'is_active':True,'sort_order':23},
    {'code':'share_order','name':'Buyurtmani ulashish','icon':'🤝','xp_reward':20,'coin_reward':10,'is_repeatable':True,'is_active':True,'sort_order':24},
    {'code':'checklist_streak','name':'5 ta checklist ketma-ket','icon':'🔥','xp_reward':10,'coin_reward':3,'is_repeatable':True,'is_active':True,'sort_order':25},
]

for r in rules:
    obj, created = GamificationRule.objects.update_or_create(code=r['code'], defaults=r)
    print(f\"{'YARATILDI' if created else 'YANGILANDI'}: {r['code']}\")
"

═══ QOIDALAR ═══
- award_xp xavfsiz bo'lishi kerak — rule topilmasa hech narsa qilmasligi
- Race condition: user.save(update_fields=[...]) — to'liq save emas
- Quest progress: daily quest uchun date=today filter
- XP toast: 2.5 soniyadan keyin yo'qoladi
- Restart: sudo systemctl restart bittada-manager
- Test: Etap tugallab XP ortganini tekshirish
```

---

## Fayl xaritasi

| Fayl | Harakat |
|------|---------|
| `client_erp/services/__init__.py` | YANGI (bo'sh fayl) |
| `client_erp/services/gamification.py` | YANGI — award_xp, check_quest_progress, _check_level_up |
| `client_erp/views/stages.py` | 3 joyda gamifikatsiya trigger qo'shish |
| `client_erp/models/gamification.py` | ACTION_TYPES ga 2 ta qo'shish |
| `template/client_erp/pages/orders/detail.html` | showXpToast, stageComplete yangilash |

---

## Tekshirish

```bash
# 1. Qoidalar yaratish (yuqoridagi shell command)

# 2. Restart
sudo systemctl restart bittada-manager

# 3. Browser test:
# - /mini/bigone_cl/orders/1/ → etap tugatish → XP toast ko'rinishi
# - /mini/bigone_cl/ → XP/tanga oshganini tekshirish
# - Admin panel → XPTransaction da yozuv bor

# 4. Shell tekshirish
/home/user/mebelcity_platform/platform_venv/bin/python /home/user/mebelcity_platform/manage.py shell -c "
from client_erp.models import ClientUser, XPTransaction
user = ClientUser.objects.get(username='bigone_cl')
print(f'XP: {user.xp}, Coins: {user.coins}')
print(f'Tranzaksiyalar: {XPTransaction.objects.filter(user=user).count()}')
for t in XPTransaction.objects.filter(user=user).order_by('-created_at')[:5]:
    print(f'  {t.description}: +{t.xp_change} XP, +{t.coin_change} coins')
"
```

---

## Gamifikatsiya oqimi (yakuniy)

```
User etap tugallaydi
    │
    ├── award_xp('complete_stage') → +15 XP, +5 tanga
    │
    ├── Agar barcha etaplar tugallangan:
    │   ├── award_xp('complete_order') → +100 XP, +30 tanga
    │   ├── Agar muddatida: award_xp('complete_order_ontime') → +50 XP
    │   └── Agar birinchi: award_xp('first_order_stages') → +200 XP
    │
    ├── check_quest_progress('complete_stage')
    │   └── Agar daily quest tugallangan → quest XP/tanga
    │
    ├── _check_level_up(user)
    │   └── Agar yangi daraja → VIP level yangilash
    │
    └── Frontend: XP toast notification → 1s keyin reload
```
