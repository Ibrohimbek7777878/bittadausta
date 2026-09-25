"""client_erp/services/standing_share.py — "Har doim" doimiy a'zolar.

Yangi ClientOrder yaratilganda owner'ning barcha ClientStandingShare
a'zolariga avtomatik ClientOrderPermission ochiladi va Telegram
bildirishnoma yuboriladi. FAIL-SAFE: xato buyurtma yaratishni buzmaydi.
"""
import logging

logger = logging.getLogger(__name__)


def apply_standing_shares(order):
    """Yangi buyurtmani doimiy a'zolarga avto-ulashish + bildirishnoma."""
    try:
        from client_erp.models import ClientOrderPermission
        from client_erp.models.team import ClientStandingShare
        from client_erp.services.notifications import notify_order_shared

        standing = ClientStandingShare.objects.filter(
            owner=order.owner,
        ).select_related('member')
        for ss in standing:
            try:
                _, created = ClientOrderPermission.objects.get_or_create(
                    order=order, user=ss.member,
                    defaults={
                        'role': ss.role,
                        'can_add_expense': ss.can_add_expense,
                        'can_complete_stage': ss.can_complete_stage,
                        'can_see_money': ss.can_see_money,
                    },
                )
                if created:
                    notify_order_shared(
                        ss.member, order.title,
                        order.owner.full_name or order.owner.username,
                    )
            except Exception:
                logger.exception(
                    "[standing_share] a'zoga ulashishda xato: member=%s order=%s",
                    ss.member_id, order.pk)
    except Exception:
        logger.exception("[standing_share] apply_standing_shares xato order=%s",
                         getattr(order, 'pk', None))

    # ── Jamoa avto-ulashish (auto_share_new_orders=True bo'lgan jamoalar) ──
    # Shaxsiy standing share'lardan KEYIN — mavjud permission bo'lsa
    # get_or_create tegmaydi (shaxsiy sozlama ustun). FAIL-SAFE.
    try:
        from client_erp.models import ClientOrderPermission
        from client_erp.models.team import ClientTeam
        from client_erp.services.notifications import notify_order_shared

        teams = ClientTeam.objects.filter(
            owner=order.owner, auto_share_new_orders=True,
        )
        for team in teams:
            members = team.members.filter(status='active').select_related('user')
            for m in members:
                if m.user_id == order.owner_id:
                    continue  # owner o'ziga permission ochmaydi
                try:
                    _, created = ClientOrderPermission.objects.get_or_create(
                        order=order, user=m.user,
                        defaults={
                            'role': team.auto_role,
                            'can_add_expense': team.auto_can_add_expense,
                            'can_complete_stage': team.auto_can_complete_stage,
                            'can_see_money': team.auto_can_see_money,
                        },
                    )
                    if created:
                        try:
                            notify_order_shared(
                                m.user, order.title,
                                order.owner.full_name or order.owner.username,
                            )
                        except Exception:
                            logger.exception(
                                "[team_autoshare] bildirishnoma xato: user=%s order=%s",
                                m.user_id, order.pk)
                except Exception:
                    logger.exception(
                        "[team_autoshare] a'zoga ulashishda xato: user=%s order=%s team=%s",
                        m.user_id, order.pk, team.pk)
    except Exception:
        logger.exception("[team_autoshare] jamoa avto-ulashish xato order=%s",
                         getattr(order, 'pk', None))
