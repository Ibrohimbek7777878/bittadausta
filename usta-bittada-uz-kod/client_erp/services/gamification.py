"""client_erp/services/gamification.py — XP/tanga berish va quest progress."""
from django.utils import timezone


def _coin_gifts_on():
    """Tanga SOVG'ASI yoqilganmi? (2026-07-26 dan default OFF — tanga faqat Payme
    orqali sotib olinadi). settings.CLIENT_COIN_GIFTS_ENABLED=True bilan qaytariladi.
    XP mukofoti bundan mustaqil — har doim ishlaydi."""
    try:
        from django.conf import settings
        return bool(getattr(settings, 'CLIENT_COIN_GIFTS_ENABLED', False))
    except Exception:
        return False


def award_xp(user, rule_code, description='', stage=None, order=None):
    from client_erp.models import GamificationRule, XPTransaction

    rule = GamificationRule.objects.filter(code=rule_code, is_active=True).first()
    if not rule:
        return 0, 0

    if not rule.is_repeatable:
        if XPTransaction.objects.filter(user=user, rule=rule).exists():
            return 0, 0

    if rule.max_per_day:
        today = timezone.localdate()
        today_count = XPTransaction.objects.filter(
            user=user, rule=rule, created_at__date=today
        ).count()
        if today_count >= rule.max_per_day:
            return 0, 0

    if rule.min_level and user.vip_level:
        if user.vip_level.level_number < rule.min_level.level_number:
            return 0, 0

    # Tanga SOVG'ASI o'chirilgan (2026-07-26 — foydalanuvchi so'rovi): tanga faqat
    # Payme orqali sotib olinadi. XP mukofoti qoladi. settings.CLIENT_COIN_GIFTS_ENABLED
    # bilan qayta yoqiladi (default False).
    _coins = rule.coin_reward if _coin_gifts_on() else 0

    XPTransaction.objects.create(
        user=user, rule=rule,
        xp_change=rule.xp_reward,
        coin_change=_coins,
        description=description or rule.name,
        stage=stage, order=order,
    )

    user.xp += rule.xp_reward
    user.coins += _coins
    user.coins_total_earned += _coins
    user.save(update_fields=['xp', 'coins', 'coins_total_earned'])

    _check_level_up(user)

    if rule.xp_reward or _coins:
        from client_erp.services.realtime import push_wallet_update
        push_wallet_update(user)

    return rule.xp_reward, _coins


def _check_level_up(user):
    from client_erp.models import ClientVIPLevel

    levels = ClientVIPLevel.objects.filter(
        auto_promote=True
    ).order_by('-level_number')

    for level in levels:
        if float(user.turnover_year) >= float(level.min_turnover):
            if not user.vip_level or user.vip_level.level_number < level.level_number:
                user.vip_level = level
                user.save(update_fields=['vip_level'])
                return level
            break

    return None


def check_quest_progress(user, action, count=1):
    """Qaytaradi: shu chaqiruvda YANGI bajarilgan topshiriqlar ro'yxati
    [{'xp':.., 'coins':.., 'title':..}] — chaqiruvchi CoinBurst animatsiya
    ko'rsatishi uchun (bo'sh ro'yxat — hali bajarilmadi/allaqachon bajarilgan)."""
    from client_erp.models import Quest, QuestCompletion

    today = timezone.localdate()
    quests = Quest.objects.filter(
        quest_type='daily', is_active=True, action_type=action
    )
    awarded = []

    for quest in quests:
        completion, created = QuestCompletion.objects.get_or_create(
            user=user, quest=quest, date=today,
            defaults={'progress': 0, 'is_completed': False},
        )
        if completion.is_completed:
            continue

        completion.progress += count
        if completion.progress >= quest.action_count:
            completion.is_completed = True
            completion.completed_at = timezone.now()
            completion.xp_awarded = True
            completion.save()
            # Mukofot Quest'ning O'ZIDA (xp_reward/coin_reward) — GamificationRule
            # tizimidan MUSTAQIL (Quest.action da mos rule.code bo'lishi shart emas).
            # Tanga SOVG'ASI o'chirilgan (2026-07-26) — XP qoladi, tanga=0.
            _qc = quest.coin_reward if _coin_gifts_on() else 0
            if quest.xp_reward or _qc:
                user.xp += quest.xp_reward
                user.coins += _qc
                user.coins_total_earned += _qc
                user.save(update_fields=['xp', 'coins', 'coins_total_earned'])
                _check_level_up(user)
                from client_erp.services.realtime import push_wallet_update, push_xp_awarded
                push_wallet_update(user)
                push_xp_awarded(user, quest.xp_reward, _qc, quest.title)
                awarded.append({'xp': quest.xp_reward, 'coins': _qc, 'title': quest.title})
        else:
            completion.save(update_fields=['progress'])

    return awarded
