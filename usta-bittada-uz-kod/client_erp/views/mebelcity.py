"""client_erp/views/mebelcity.py — MebelCity buyurtmalar (haqiqiy orderlar)."""
import re
from django.shortcuts import render
from django.db.models import Q


def mini_mebelcity(request, username):
    """Mijozning telefon raqami bo'yicha MebelCity orderlari."""
    user = request.client_user

    # Telefon oxirgi 9 raqami
    digits = re.sub(r'\D', '', user.phone or '')
    last9 = digits[-9:] if len(digits) >= 9 else digits

    orders = []
    if last9 and len(last9) >= 7:
        try:
            from manfacturing.models import Order
            from hashids import Hashids
            hashids = Hashids(
                salt="Alloh nomi bilan boshlayman", min_length=6,
                alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            )

            qs = Order.objects.filter(
                Q(client__phone__endswith=last9) |
                Q(client__phone2__endswith=last9)
            ).exclude(
                partner_name__startswith='_mini_'
            ).select_related('client').prefetch_related('steps__step_type').order_by('-order_date')[:30]

            state_labels = {
                'draft': 'Yangi', 'in_progress': 'Jarayonda',
                'done': 'Tugallangan', 'cancel': 'Bekor qilingan',
            }

            for o in qs:
                # Hozirgi etap
                current_step = o.steps.exclude(state__in=['done', 'cancel']).order_by('sequence').first()
                # Progress
                total_steps = o.steps.count()
                done_steps = o.steps.filter(state='done').count()
                progress = round(done_steps / total_steps * 100) if total_steps else 0

                orders.append({
                    'id': o.id,
                    'code': hashids.encode(o.id),
                    'partner_name': o.partner_name,
                    'state': o.state,
                    'state_display': state_labels.get(o.state, o.state),
                    'is_urgent': o.is_urgent,
                    'order_date': o.order_date,
                    'deadline_at': o.deadline_at,
                    'current_step': current_step.step_type.name if current_step and current_step.step_type_id else None,
                    'current_step_icon': current_step.step_type.icon if current_step and current_step.step_type_id else '',
                    'progress': progress,
                    'done_steps': done_steps,
                    'total_steps': total_steps,
                    'steps': [{
                        'name': s.step_type.name if s.step_type_id else '?',
                        'icon': s.step_type.icon if s.step_type_id else '',
                        'state': s.state,
                    } for s in o.steps.order_by('sequence')],
                })
        except Exception:
            pass

    return render(request, 'client_erp/pages/mebelcity/list.html', {
        'user': user,
        'orders': orders,
    })
