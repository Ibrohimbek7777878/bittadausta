"""client_erp/services/realtime.py — Tanga/XP balansi o'zgarganda barcha ochiq
sahifalarga (bir foydalanuvchining barcha WS ulanishlariga) jonli push.

Sabab: reload qilinmasa balans eski ko'rinib qolardi (faqat so'rovni yuborgan
tab'ning o'zi javobda yangi balansni olardi, boshqa ochiq tab'lar va
so'rovsiz (masalan quest/xp) o'zgarishlar hech qayerga push qilinmasdi)."""
import logging

logger = logging.getLogger(__name__)


def push_xp_awarded(user, xp, coins, rule=''):
    """XP/tanga mukofoti (quest bajarildi va h.k.) — ochiq sahifalarda
    CoinBurst animatsiyasi + toast ko'rsatiladi (mini-erp.js 'xp.awarded')."""
    if not xp and not coins:
        return
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        layer = get_channel_layer()
        if not layer or not getattr(user, 'pk', None):
            return
        from tenant_manager.ws_groups import tgroup
        async_to_sync(layer.group_send)(tgroup(user._state.db, f"mini_user_{user.pk}"), {
            'type': 'xp.awarded',
            'data': {'xp': xp, 'coins': coins, 'rule': rule},
        })
    except Exception as e:
        logger.warning('push_xp_awarded xato: %s', str(e)[:200])


def push_wallet_update(user):
    """user.coins / user.xp joriy qiymatini shu foydalanuvchining barcha ochiq
    WS ulanishlariga (mini_user_<id> guruhi) jo'natadi. Xatoda jim o'tadi —
    balans DB'da allaqachon to'g'ri, bu faqat UI-yangilanish uchun qulaylik."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        layer = get_channel_layer()
        if not layer or not getattr(user, 'pk', None):
            return
        from tenant_manager.ws_groups import tgroup
        async_to_sync(layer.group_send)(tgroup(user._state.db, f"mini_user_{user.pk}"), {
            'type': 'wallet.push',
            'data': {'balance': user.coins, 'xp': user.xp},
        })
    except Exception as e:
        logger.warning('push_wallet_update xato: %s', str(e)[:200])
