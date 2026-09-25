"""client_erp/serializers.py — Model → JSON serialization for WebSocket."""
from decimal import Decimal


def _is_app_admin(u):
    """2026-09-23 (additive): admin tekshiruvi (lazy import — cycle yo'q)."""
    try:
        from client_erp.services.team_invites import is_admin
        return bool(is_admin(u))
    except Exception:
        return bool(getattr(u, 'is_app_admin', False) or False)


def _dec(val):
    if val is None:
        return '0'
    return str(int(Decimal(str(val))))


def _profit_pct(profit, base):
    """Foyda foizi = profit / shartnoma summasi * 100 (bir xil formula _contract_slices bilan)."""
    try:
        base = Decimal(str(base or 0))
        if base <= 0:
            return None
        return round(float(Decimal(str(profit or 0)) / base * 100), 1)
    except Exception:
        return None


# ── Chiqim kategoriyalari (built-in + foydalanuvchi qo'shgan) ──
# Ranglar HEX pastel — qora ink bilan dark VA light temada o'qiladi (badge kabi).
BUILTIN_EXPENSE_CATS = [
    {'key': 'material',  'name': 'Material',  'icon': '🧱', 'color': '#DCF262'},
    {'key': 'service',   'name': 'Xizmat',    'icon': '🔧', 'color': '#A6E6F2'},
    {'key': 'transport', 'name': 'Transport', 'icon': '🚚', 'color': '#C9B4F7'},
    {'key': 'furniture', 'name': 'Furnitura', 'icon': '🔩', 'color': '#F5A48B'},
    {'key': 'mebelcity', 'name': 'MebelCity', 'icon': '🏭', 'color': '#C3C9D4'},
    {'key': 'other',     'name': 'Boshqa',    'icon': '📦', 'color': '#C3C9D4'},
]
_BUILTIN_KEYS = {c['key'] for c in BUILTIN_EXPENSE_CATS}


def expense_categories_for(user):
    """Built-in + foydalanuvchi qo'shgan chiqim kategoriyalari (custom bayroq bilan)."""
    out = [dict(c, custom=False) for c in BUILTIN_EXPENSE_CATS]
    for c in (getattr(user, 'expense_categories', None) or []):
        if isinstance(c, dict) and c.get('key') and c.get('name'):
            out.append({
                'key': c['key'], 'name': c['name'],
                'icon': c.get('icon') or '📦', 'color': c.get('color') or '#C3C9D4',
                'custom': True,
            })
    return out


# ── User ──

def serialize_user(u):
    return {
        'id': u.pk,
        'username': u.username,
        'full_name': u.full_name,
        'phone': u.phone,
        'organization': u.organization or '',
        'xp': u.xp,
        'coins': u.coins,
        'coins_total_earned': u.coins_total_earned,
        'streak_days': u.streak_days,
        'vip_level': serialize_level(u.vip_level) if u.vip_level_id else None,
        'avatar_url': u.avatar.url if u.avatar else None,
        'referral_code': u.referral_code,
        'referral_count': u.referral_count,
        'expense_categories': expense_categories_for(u),
        # Kirim/Chiqim qaytarish ruxsati — ilgari FAQAT HTML shablonida
        # (`__USER_DATA__`) bor edi va WS javobi `STATE.user`ni ustiga yozganda
        # yo'qolib ketardi (2026-08-15 bug). Endi server har javobda yuboradi.
        'can_revert_finance': u.username in ('bigone_cl2', 'artom_cl', 'ibrohim_cl'),
        # 2026-09-23 (additive): admin bayrog'i + demo holati (frontend shunga
        # qarab admin bo'limi va demo ogohlantirishini ko'rsatadi).
        # Bosh admin nomeri DB bayroqsiz ham admin sanaladi.
        'is_app_admin': _is_app_admin(u),
        'is_demo': bool(getattr(u, 'is_demo', False) or False),
    }


# ── VIP Level ──

def serialize_level(level):
    if not level:
        return None
    return {
        'id': level.pk,
        'name': level.name,
        'level_number': level.level_number,
        'icon': level.badge_icon,
        'color': level.color,
        'min_turnover': _dec(level.min_turnover),
    }


# ── Customer ──

def serialize_customer(c):
    return {
        'id': c.pk,
        'name': c.full_name,
        'phone': c.phone or '',
        'address': c.address or '',
        'note': c.note or '',
        'created_at': c.created_at.isoformat() if c.created_at else None,
    }


# ── Order brief (list uchun) ──

def serialize_order_brief(o, stage_linked_ids=None, waiting_note=None, zamer_order_ids=None, mc_progress=None,
                           bazis_link_url=None, vr_link_url=None):
    # MebelCity'ga ulanganmi: order-level YOKI biror etap (stage) ulangan bo'lsa.
    # stage_linked_ids berilsa — ro'yxat uchun N+1 siz; berilmasa — bitta order uchun .exists().
    is_linked = bool(o.mebelcity_order_id)
    if not is_linked:
        if stage_linked_ids is not None:
            is_linked = o.pk in stage_linked_ids
        else:
            try:
                from client_erp.models import ClientOrderStage
                is_linked = ClientOrderStage.objects.filter(
                    order_id=o.pk, mebelcity_order_id__isnull=False,
                ).exists()
            except Exception:
                is_linked = False
    return {
        'id': o.pk,
        'title': o.title,
        'status': o.status,
        'customer_name': o.customer.full_name if o.customer else '',
        'customer_id': o.customer_id,
        'overall_progress': o.overall_progress,
        'total_income': _dec(o.total_income),
        'total_expense': _dec(o.total_expense),
        'profit': _dec(o.contract_profit),
        'profit_pct': _profit_pct(o.contract_profit, o.contract_amount),
        'payment_percent': o.payment_percent,
        'created_at': o.created_at.isoformat(),
        # Topshirilgan sana — TUGAGAN buyurtma qaysi oyga tegishli ekanini
        # shu belgilaydi (2026-08-18): #296 iyulda ochilib avgustda
        # topshirilgan edi va «Shu oy» ro'yxatidan tushib qolgan edi.
        'delivered_at': o.delivered_at.isoformat() if o.delivered_at else None,
        'deadline': o.deadline.isoformat() if o.deadline else None,
        'mc_order_id': o.mebelcity_order_id,
        'is_linked': is_linked,
        # Zamer holati: ulangan MC zakaz(lar)ida zamer bormi. zamer_order_ids
        # berilmasa None — JS badge chiqarmaydi (faqat ro'yxat sahifasida hisoblanadi).
        'has_zamer': (o.pk in zamer_order_ids) if zamer_order_ids is not None else None,
        # Bazis oblaka / VR 3D havolasi URL'i — ro'yxat kartochkasida ikonka
        # ko'rsatish va bosilganda TO'G'RIDAN-TO'G'RI ochish uchun (2026-09-08,
        # foydalanuvchi: "zakazni ichiga kirmasdan ham ko'rish kere"). Havola
        # yo'q bo'lsa `None` — JS ikonka chiqarmaydi.
        'bazis_link_url': bazis_link_url,
        'vr_link_url': vr_link_url,
        'use_stages': o.use_stages,
        'waiting_note': waiting_note if o.status == 'waiting' else None,
        # MebelCity ishlab chiqarish progressi (ulangan bo'lsa) — ro'yxat
        # kartasida "🔗 Ulangan" chip endi foiz/bosqich bilan birga ko'rinadi.
        'mc_progress': mc_progress,
    }


# ── Pul maydonlarini yashirish (can_see_money=False bo'lganlar uchun) ──
# Server-side scrub: order/stage/broadcast payload'laridan moliyaviy
# maydonlar OLIB TASHLANADI (frontga umuman bormaydi).

MONEY_HIDDEN_KEYS = frozenset({
    'total_income', 'total_expense', 'profit', 'profit_pct',
    'zaklad_amount', 'zaklad_balance', 'payment_percent',
    'estimated_cost', 'total_sum',
})
MONEY_EMPTY_LIST_KEYS = frozenset({'transactions', 'profit_shares', 'expenses', 'withdrawal_history'})


def scrub_money_data(data, _top=True):
    """Rekursiv: pul maydonlarini olib tashlaydi, ro'yxatlarni bo'shatadi.

    dict/list dan yangi nusxa qaytaradi (asl payload o'zgarmaydi).
    Top-level dict'ga money_hidden=True bayrog'i qo'shiladi (JS moslashishi uchun).
    """
    if isinstance(data, dict):
        out = {}
        for k, v in data.items():
            if k in MONEY_HIDDEN_KEYS:
                continue
            if k in MONEY_EMPTY_LIST_KEYS:
                out[k] = []
                continue
            out[k] = scrub_money_data(v, _top=False)
        if _top:
            out['money_hidden'] = True
        return out
    if isinstance(data, list):
        return [scrub_money_data(x, _top=False) for x in data]
    return data


# ── Order full (detail uchun) ──

def serialize_order_full(order, user_role='owner', is_owner=True, can_see_money=True):
    stages = list(order.stages.select_related(
        'assigned_to', 'completed_by',
    ).prefetch_related('checklist').order_by('sort_order'))

    transactions = list(order.finance_records.filter(
        is_deleted=False,
    ).select_related('stage').order_by('-date', '-created_at')[:50])

    timeline_qs = list(order.timeline.order_by('-created_at')[:30])

    permissions = list(order.permissions.select_related(
        'user', 'user__vip_level',
    ).prefetch_related('stages'))

    files_qs = list(order.files.select_related('uploaded_by').order_by('-created_at'))
    notes_qs = list(order.notes.select_related('created_by').order_by('-created_at'))

    mc_order_ids = _get_mc_order_ids(order)
    panoramas = _get_order_panoramas(order.pk, mc_order_ids)
    zamers = _get_order_zamers(order.pk, mc_order_ids)
    bom = _get_order_bom(order.pk, mc_order_ids)

    # Topshirilgan sana — ASOSIY manba `order.delivered_at` maydoni, chunki foyda
    # AYNAN shu sana oyiga tan olinadi (consumers.py:3468 `Coalesce`). Timeline
    # yozuvi faqat ZAXIRA: eski/import qilingan zakazlarda (35 dan 16 tasida)
    # "→ Topshirildi" timeline yozuvi umuman yo'q — avval shu sabab sana
    # ko'rinmasdi, garchi maydon to'ldirilgan bo'lsa ham (2026-07-25).
    delivered_at = order.delivered_at.isoformat() if order.delivered_at else None
    if not delivered_at:
        delivered_entry = order.timeline.filter(
            action='status_change', note__icontains='→ Topshirildi',
        ).order_by('-created_at').first()
        delivered_at = delivered_entry.created_at.isoformat() if delivered_entry else None

    result = {
        'id': order.pk,
        'title': order.title,
        'description': order.description or '',
        'status': order.status,
        'customer': serialize_customer(order.customer) if order.customer else None,
        'overall_progress': order.overall_progress,
        'total_income': _dec(order.total_income),
        'total_expense': _dec(order.total_expense),
        # SHARTNOMA-ASOSLI (2026-08-03): buyurtma detalidagi «Foyda» kartasi
        # Moliya sahifasidagi «Sof foyda» bilan bir xil bo'lishi SHART.
        'profit': _dec(order.contract_profit),
        'profit_pct': _profit_pct(order.contract_profit, order.contract_amount),
        'by_contract': bool(order.uses_contract_profit),
        'extra_income': _dec(order.extra_income),
        # Rasmiy shartnoma summasi (tasdiqlangan ClientContract yoki zaklad).
        # Frontend shu bo'yicha «Foyda taqsimlash»/«Pul yechish»ni bloklaydi —
        # `zaklad_amount` yetarli emas, chunki summa ClientContract'dan ham
        # kelishi mumkin (2026-08-04).
        'contract_amount': _dec(order.contract_amount),
        'zaklad_amount': _dec(order.zaklad_amount),
        # Shartnomadan qolgan (to'lanmagan) qism — kirim shartnomadan oshsa 0.
        # `real_income`: bekor qilingan ulush qaytishi qarzni soxta yopmasin
        # (mijoz qarzdor bo'lsa ham «0 qoldi» ko'rinardi — 2026-08-04).
        'zaklad_balance': _dec(max(0, float(order.zaklad_amount or 0) - float(order.real_income or 0))),
        'payment_percent': order.payment_percent,
        'mc_order_id': order.mebelcity_order_id,
        'use_stages': order.use_stages,
        'deadline': order.deadline.isoformat() if order.deadline else None,
        'created_at': order.created_at.isoformat(),
        'delivered_at': delivered_at,

        'stages': [serialize_stage(s) for s in stages],
        'transactions': [serialize_transaction(t) for t in transactions],
        'timeline': [serialize_timeline(t) for t in timeline_qs],
        'permissions': [serialize_permission(p) for p in permissions],
        'profit_shares': _serialize_profit_shares(order),
        # ── OXIRGI ISHLATILGAN TAQSIMOT (2026-08-18) ─────────────────────
        # «Pul yechish» oynasi ulush jadvali BO'SH bo'lganda bo'sh ochilib
        # qolardi — usta har safar ism va foizni qaytadan yozishi kerak edi
        # (foydalanuvchi shikoyati). Endi oxirgi marta qanday bo'lingan
        # bo'lsa, o'sha oldindan qo'yiladi (o'zgartirish mumkin).
        # user_id bilan birga — pul AYNAN o'sha akkauntga o'tsin.
        'last_profit_shares': _get_last_profit_shares_full(order.owner),
        # 🔻 Buyurtmadan chiqarilgan sheriklar — qachon · nega · qancha tegardi
        # (2026-08-15, TZ-Sherik-Chiqarish-Izi §S3). Append-only jurnaldan.
        'removed_partners': _serialize_removed_partners(order),
        # 🧰 Shu buyurtma uchun olingan qarzlar (Ustalar qarzi) — kimdan,
        # nima uchun, qachon. Foydalanuvchi talabi: qarz buyurtma ICHIDA ham
        # ko'rinsin (2026-08-15).
        'supplier_debts': _serialize_order_debts(order),
        # H1 to'liq (2026-08-04): foyda taqsimlanishi mumkin bo'lgan kontaktlar
        # (jamoa a'zolari + shu buyurtmaga ulashilganlar). Frontend shu ro'yxatdan
        # tanlaydi — erkin matn yozish OLIB TASHLANDI.
        'contacts': order_contacts(order),
        # F8.1 (2026-08-03): "Pul yechish tarixi" — kim, qachon, qancha oldi.
        # Ma'lumot allaqachon bazada bor edi (`ClientProfitWithdrawal` +
        # `...Line`, TZ §F9 audit-trail), faqat UI'ga chiqarilmagan edi.
        'withdrawal_history': _serialize_withdrawal_history(order),
        'shares': _serialize_order_shares(order),
        'files': [serialize_file(f) for f in files_qs],
        # 📦 Detal QR (2026-09-04, TZ-Detal-QR-2026-09.md) — Bazisdan eksport
        # qilingan 3D rasm + QR-kod jamoat sahifasi. Fayllardan ALOHIDA
        # (ClientDetalCard modeli, ClientOrderFile emas).
        'detal_cards': [{
            'short_code': c.short_code, 'title': c.title, 'artikul': c.artikul,
            'detal_count': c.detal_count, 'image_url': c.image.url if c.image else '',
            'url': f'/mini/detal/{c.short_code}/',
        } for c in order.detal_cards.all().order_by('-created_at')],
        'notes': [serialize_note(n) for n in notes_qs],
        'panoramas': panoramas,
        'zamers': zamers,
        'bom': bom,

        'user_role': user_role,
        'is_owner': is_owner,
        # Chiqim oynasidagi «Kim to'ladi?» standart tanlovi uchun (2026-08-15 §F3)
        'owner_id': order.owner_id,
    }

    # 💰 Pul ko'rish ruxsati yo'q — moliyaviy maydonlar server-side yashiriladi
    if not can_see_money and not is_owner:
        result = scrub_money_data(result)
    else:
        result['money_hidden'] = False
    return result


def contact_label(user):
    """Kontakt ko'rinishi: «Ism · ...1234» (telefonning oxirgi 4 raqami).

    Nega oxirgi 4 raqam: bazada bir xil ismli akkauntlar bor (`dilshod` ×2) —
    ularni ajratish kerak, lekin to'liq raqamni ko'rsatish maxfiylikni buzadi
    (bank kartalaridagi kabi standart). TZ-Kontakt-Asosli-Foyda-Taqsimoti.md §2.2
    """
    if not user:
        return ''
    nm = (user.full_name or '').strip() or (user.username or '')
    ph = ''.join(ch for ch in (user.phone or '') if ch.isdigit())
    return f"{nm} · ...{ph[-4:]}" if len(ph) >= 4 else nm


def order_contacts(order):
    """Shu buyurtmada foyda taqsimlanishi MUMKIN bo'lgan kontaktlar.

    Manbalar (dublikatsiz): egasining jamoalaridagi faol a'zolar + shu
    buyurtmaga aniq ruxsat berilganlar. Egasi ALOHIDA («Men» qatori) —
    bu ro'yxatga kirmaydi.
    """
    from client_erp.models.team import ClientTeam, ClientTeamMember
    from client_erp.models.permission import ClientOrderPermission

    owner = order.owner
    out, seen = [], {owner.id}

    def _add(u, src):
        if not u or u.id in seen:
            return
        seen.add(u.id)
        # `phone` — QIDIRUV uchun (frontend faqat oxirgi 4 raqamni KO'RSATADI,
        # lekin foydalanuvchi to'liq raqamni yozib qidira olishi kerak).
        out.append({'id': u.id, 'label': contact_label(u),
                    'name': (u.full_name or u.username or ''),
                    'username': u.username or '',
                    'phone': ''.join(ch for ch in (u.phone or '') if ch.isdigit()),
                    'source': src})

    try:
        # 1) Egasining o'z jamoalari + a'zo bo'lgan jamoalari
        team_ids = set(ClientTeam.objects.filter(owner=owner).values_list('id', flat=True))
        team_ids |= set(ClientTeamMember.objects.filter(
            user=owner, status='active').values_list('team_id', flat=True))
        if team_ids:
            for m in (ClientTeamMember.objects
                      .filter(team_id__in=team_ids, status='active')
                      .select_related('user')):
                _add(m.user, 'team')
        # 2) Shu buyurtmaga ulashilganlar
        for p in ClientOrderPermission.objects.filter(order=order).select_related('user'):
            _add(p.user, 'shared')
    except Exception:                                             # noqa: BLE001
        logger.warning("[order_contacts] xato", exc_info=True)
    return out


def _serialize_profit_shares(order):
    from client_erp.models.team import ClientOrderProfitShare
    shares = (ClientOrderProfitShare.objects.filter(order=order)
              .select_related('user').order_by('sort_order', 'id'))
    return [{
        'id': s.pk,
        'name': s.name,
        'percent': float(s.percent),
        'is_remainder': s.is_remainder,
        # H1 to'liq: kontaktga bog'langanmi (yangi) yoki eski erkin-matnmi
        'user_id': s.user_id,
        'label': contact_label(s.user) if s.user_id else s.name,
        'is_linked': s.user_id is not None,
    } for s in shares]


def _serialize_order_debts(order):
    """Shu buyurtma bo'yicha olingan qarzlar — kimdan · nima uchun · qachon."""
    from client_erp.models import ClientSupplierDebt
    TYPE_LABEL = dict(ClientSupplierDebt.CREDITOR_TYPES)
    rows = (ClientSupplierDebt.objects.filter(order=order)
            .select_related('owner').order_by('-created_at')[:30])
    return [{
        'id': d.pk, 'name': d.creditor_name,
        'type': d.creditor_type, 'type_label': TYPE_LABEL.get(d.creditor_type, d.creditor_type),
        'amount': _dec(d.amount), 'paid': _dec(d.paid), 'remaining': _dec(d.remaining),
        'note': d.note or '',
        'taken_date': (d.taken_date or d.created_at.date()).isoformat(),
        'is_closed': d.is_closed,
        # Kim qarzdor (sherikli rasxodda egasi ham, sherik ham bo'lishi mumkin)
        'debtor': contact_label(d.owner) if d.owner_id else '',
        'is_auto': bool(d.creditor_type == 'shaxs'),
    } for d in rows]


def _serialize_removed_partners(order):
    """Buyurtmadan chiqarilgan sheriklar jurnali (append-only, o'chmaydi)."""
    from client_erp.models.team import ClientProfitAudit
    rows = (ClientProfitAudit.objects
            .filter(order=order, action=ClientProfitAudit.Action.UNSHARE)
            .select_related('actor').order_by('-created_at')[:20])
    return [{
        'name': r.target_name or '—',
        'user_id': r.target_user_id,
        # «40% · 6 000 000 so'm» — chiqarilgan PAYTDAGI ulushi (snapshot)
        'was': r.old_value or '',
        'reason': r.reason or '',
        'by': contact_label(r.actor) if r.actor_id else (r.actor_note or ''),
        'at': r.created_at.isoformat(),
    } for r in rows]


def _serialize_withdrawal_history(order):
    """F8.1 — har bir "Pul yechish" sessiyasi + qatorlari (kim/qachon/qancha).

    Append-only audit-trail: bu yerdagi yozuvlar HECH QACHON o'zgartirilmaydi/
    o'chirilmaydi (TZ §F9, §H6). Faqat o'qish uchun."""
    withdrawals = (order.withdrawals
                   .prefetch_related('lines')
                   .order_by('-created_at')[:20])
    out = []
    for w in withdrawals:
        out.append({
            'id': w.pk,
            'total_profit': _dec(w.total_profit),
            'status': w.status,
            'created_at': w.created_at.isoformat(),
            # H6 (2026-08-04): bekor qilish holati — UI shu bo'yicha tugma
            # ko'rsatadi yoki «Bekor qilingan» yorlig'ini chiqaradi.
            'reversed': w.status == 'reversed',
            'reversed_at': w.reversed_at.isoformat() if w.reversed_at else None,
            'reverse_note': w.reverse_note or '',
            'lines': [
                {'name': ln.name, 'percent': float(ln.percent), 'amount': _dec(ln.amount),
                 # Kimga tushgani (akkauntga bog'langan bo'lsa) — audit uchun
                 'user_id': ln.user_id}
                for ln in w.lines.all()
            ],
        })
    return out


def _serialize_order_shares(order):
    from client_erp.models.team import ClientOrderShare
    shares = ClientOrderShare.objects.filter(order=order).select_related('team')
    return [{'team_id': s.team_id, 'team_name': s.team.name, 'visibility': s.visibility,
             'can_edit': s.can_edit, 'can_complete': s.can_complete, 'can_add_expense': s.can_add_expense} for s in shares]


# ── Stage ──

def serialize_stage(s):
    items = list(s.checklist.order_by('sort_order'))
    expenses = list(s.expenses.filter(
        is_deleted=False,
    ).order_by('-date', '-created_at'))

    mc_info = None
    if s.is_mebelcity and s.mebelcity_order_id:
        mc_info = _get_mebelcity_order_info(s.mebelcity_order_id)

    return {
        'id': s.pk,
        'title': s.title,
        'icon': s.icon or '📋',
        'color': s.color or '#6366f1',
        'status': s.status,
        'sort_order': s.sort_order,
        'note': s.note or '',
        'estimated_cost': _dec(s.estimated_cost),
        'deadline': s.deadline.isoformat() if s.deadline else None,
        'is_mebelcity': s.is_mebelcity,
        'mebelcity_order_id': s.mebelcity_order_id,
        'mc_info': mc_info,
        'assigned_to': {
            'id': s.assigned_to.pk,
            'full_name': s.assigned_to.full_name,
        } if s.assigned_to else None,
        'completed_by': {
            'id': s.completed_by.pk,
            'full_name': s.completed_by.full_name,
        } if s.completed_by else None,
        'completed_at': s.completed_at.isoformat() if s.completed_at else None,
        'checklist': [serialize_checklist_item(i) for i in items],
        'total_expense': _dec(s.total_expense),
        'expenses': [serialize_transaction(e) for e in expenses],
    }


def _get_mebelcity_order_info(mc_order_id):
    try:
        from manfacturing.models import Order, OrderStep
        from hashids import Hashids
        _hashids = Hashids(salt="Alloh nomi bilan boshlayman", min_length=6, alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
        o = Order.objects.select_related('client').get(pk=mc_order_id)
        total_steps = OrderStep.objects.filter(order=o).count()
        done_steps = OrderStep.objects.filter(order=o, state='done').count()
        progress = int(done_steps * 100 / total_steps) if total_steps else 0
        current_step = OrderStep.objects.filter(order=o, state='in_progress').select_related('step_type').first()
        delivery_labels = dict(Order.DELIVERY_STATE_CHOICES)
        total_sum = 0
        try:
            for link in o.sale_links.select_related('sale').all():
                if link.sale and link.sale.total_uzs:
                    total_sum += float(link.sale.total_uzs)
        except Exception:
            pass
        return {
            'id': o.pk,
            'order_hash': _hashids.encode(o.pk),
            'partner_name': o.client.name if o.client else '',
            'state': o.state,
            'delivery_state': o.delivery_state,
            'delivery_label': delivery_labels.get(o.delivery_state, ''),
            'total_sum': total_sum,
            'progress': progress,
            'current_step': current_step.step_type.name if current_step and current_step.step_type else None,
            'is_urgent': getattr(o, 'is_urgent', False),
        }
    except Exception:
        return None


def _get_mc_order_ids(order):
    ids = set()
    if order.mebelcity_order_id:
        ids.add(order.mebelcity_order_id)
    try:
        from client_erp.models import ClientOrderStage
        for mc_id in ClientOrderStage.objects.filter(
            order_id=order.pk, mebelcity_order_id__isnull=False,
        ).values_list('mebelcity_order_id', flat=True):
            ids.add(mc_id)
    except Exception:
        pass
    return list(ids)


def _get_order_bom(client_order_id, mc_order_ids=None):
    """Mini ERP buyurtmaga bog'langan .b3d BOM smetasi (cost YASHIRIN). Topilmasa None."""
    try:
        from django.db.models import Q
        from bom.models import BomSnapshot
        from bom.services.serialize import serialize_snapshot
        from tenant_manager.middleware import get_current_db_alias

        q = Q(source_order_id=client_order_id)
        if mc_order_ids:
            q |= Q(source_order_id__in=list(mc_order_ids))
        snap = BomSnapshot.objects.filter(q).order_by('-created_at').first()
        if not snap:
            return None
        # Mini ERP: tannarx (cost) YASHIRIN; lekin order ochgan hamma kesish/formula/tahrirni ko'radi
        return serialize_snapshot(snap, db_alias=get_current_db_alias(), include_cost=False, can_edit=True)
    except Exception:
        return None


def _get_order_panoramas(client_order_id, mc_order_ids=None):
    try:
        from widget_panorama.models import PanoramaGallery
        from django.db.models import Q
        q = Q(client_order_id=client_order_id)
        if mc_order_ids:
            q = q | Q(order_id__in=mc_order_ids)
        galleries = PanoramaGallery.objects.filter(q).prefetch_related('panoramas').distinct().order_by('-created_at')[:20]
        result = []
        seen = set()
        for g in galleries:
            if g.pk in seen:
                continue
            seen.add(g.pk)
            panos = list(g.panoramas.all())
            thumb = None
            for p in panos:
                if p.thumbnail:
                    try:
                        thumb = p.thumbnail.url
                    except Exception:
                        pass
                    break
            result.append({
                'uuid': str(g.uuid),
                'name': g.name or '',
                'panorama_count': len(panos),
                'thumbnail': thumb,
            })
        return result
    except Exception:
        return []


def _get_order_rooms(client_order_id, mc_order_ids=None):
    try:
        from bittada_cloud_app.models import Scene
        from django.db.models import Q
        q = Q(client_order_id=client_order_id)
        if mc_order_ids:
            q = q | Q(order_id__in=mc_order_ids)
        scenes = Scene.objects.filter(q, published=True).distinct().order_by('-updated')[:20]
        result = []
        for s in scenes:
            from bittada_cloud_app.conf import url_prefix
            result.append({
                'uuid': str(s.public_id),
                'name': s.seo_title(),
                'thumbnail': (url_prefix() + "/s/" + str(s.public_id) + "/" + s.cover_image_path) if s.cover_image_path else None,
                'viewer_url': f'/room/s/{s.public_id}/',
            })
        return result
    except Exception:
        return []


def _get_order_zamers(client_order_id, mc_order_ids=None):
    try:
        from manfacturing.models import Zamer
        from hashids import Hashids
        from django.db.models import Q
        _hashids = Hashids(salt="Alloh nomi bilan boshlayman", min_length=6, alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
        q = Q(client_order_id=client_order_id)
        if mc_order_ids:
            q = q | Q(order_id__in=mc_order_ids)
        zamers = Zamer.objects.filter(q).prefetch_related('blocks').distinct().order_by('-id')[:20]
        result = []
        for z in zamers:
            thumb = None
            for field in ['wall_HABG_image', 'wall_ABCD_image', 'wall_DEFC_image', 'wall_EFGH_image']:
                img = getattr(z, field, None)
                if img and img.name:
                    try:
                        thumb = img.url
                    except Exception:
                        pass
                    break
            if not thumb and z.preview_image:
                thumb = z.preview_image
            order_hash = _hashids.encode(z.order_id) if z.order_id else ''
            result.append({
                'id': z.id,
                'room_name': z.room_name or '',
                'width': float(z.width or 0),
                'height': float(z.height or 0),
                'depth': float(z.depth or 0),
                'blocks_count': z.blocks.count(),
                'thumbnail': thumb,
                'order_id': z.order_id,
                'order_hash': order_hash,
                'zamer_url': f'/make_zamer/{order_hash}/?mode=input&embed=1' if order_hash else '',
                'created_at': z.created_at.isoformat() if z.created_at else None,
            })
        return result
    except Exception:
        return []


def serialize_zamer_item(z):
    thumb = None
    for field in ['wall_HABG_image', 'wall_ABCD_image', 'wall_DEFC_image', 'wall_EFGH_image']:
        img = getattr(z, field, None)
        if img and img.name:
            try:
                thumb = img.url
            except Exception:
                pass
            break
    if not thumb and z.preview_image:
        thumb = z.preview_image

    order_hash = None
    if z.order_id:
        try:
            from manfacturing.models import Order
            order = Order.objects.get(pk=z.order_id)
            order_hash = order.hash
        except Exception:
            pass

    return {
        'id': z.id,
        'room_name': z.room_name or '',
        'width': float(z.width or 0),
        'height': float(z.height or 0),
        'depth': float(z.depth or 0),
        'blocks_count': z.blocks.count(),
        'thumbnail': thumb,
        'order_id': z.order_id,
        'order_hash': order_hash,
        'client_order_id': z.client_order_id,
        'client_order_title': None,
        'note': z.note or '',
        'created_at': z.created_at.isoformat() if z.created_at else None,
    }


# ── Checklist item ──

def serialize_checklist_item(item):
    return {
        'id': item.pk,
        'title': item.title,
        'is_done': item.is_done,
        'done_by': item.done_by.full_name if item.done_by else None,
        'done_at': item.done_at.isoformat() if item.done_at else None,
        'sort_order': item.sort_order,
    }


# ── Finance record (transaction) ──

def serialize_transaction(t):
    return {
        'id': t.pk,
        'record_type': t.record_type,
        'amount': _dec(t.amount),
        'description': t.description or '',
        'category': t.category or '',
        'payment_method': t.payment_method or '',
        'stage_id': t.stage_id,
        'stage_name': t.stage.title if t.stage else None,
        'order_id': t.order_id,
        'order_title': t.order.title if t.order else None,
        'customer_id': t.customer_id,
        'customer_name': t.customer.full_name if t.customer else None,
        'recipient_name': t.recipient_name or '',
        # ── H10 (2026-08-04): JAMOA ULUSHI belgisi ───────────────────────────
        # Cross-akkaunt kirim/chiqim yozuvlari `source_line` FK bilan foyda-
        # yechish qatoriga bog'langan. Yangi maydon (migratsiya) shart emas —
        # shu FK orqali aniqlaymiz. Hisobotda «bu pul qayerdan keldi?» degan
        # savolga javob beradi (oddiy kirim bilan aralashib ketmasin).
        'is_team_share': bool(t.source_line_id) and not t.order_id,
        'is_reversal': bool(t.is_reversal),
        'date': t.date.isoformat() if t.date else None,
        'created_at': t.created_at.isoformat(),
        # ── RASXOD ULUSHI (2026-08-15 §F3/§F4) — sherikli buyurtmada kim
        # to'lagani va kim qancha ko'targani. Yolg'iz zakazda bo'sh ro'yxat,
        # ya'ni eski ko'rinishga hech qanday ta'sir qilmaydi.
        'expense_split': _serialize_expense_split(t),
    }


def _serialize_expense_split(t):
    if t.record_type != 'expense':
        return []
    try:
        rows = list(t.expense_shares.all().order_by('-is_payer', '-amount'))
    except Exception:
        return []
    return [{
        'name': r.name, 'percent': float(r.percent),
        'amount': _dec(r.amount), 'is_payer': r.is_payer,
        'has_debt': bool(r.debt_id),
    } for r in rows]


# ── Timeline ──

def serialize_timeline(t):
    return {
        'id': t.pk,
        'action': t.action,
        'note': t.note or '',
        'created_at': t.created_at.isoformat(),
    }


# ── Permission ──

def serialize_permission(p):
    return {
        'id': p.pk,
        'user': {
            'id': p.user.pk,
            'full_name': p.user.full_name,
            'phone': p.user.phone,
            'avatar_url': p.user.avatar.url if p.user.avatar else None,
        },
        'role': p.role,
        'stages': [s.pk for s in p.stages.all()],
        'can_add_expense': p.can_add_expense,
        'can_complete_stage': p.can_complete_stage,
        'can_see_money': getattr(p, 'can_see_money', False),
    }


# ── File ──

def serialize_file(f):
    # 2026-09-04: havola-turi yozuvda `file` bo'sh — `external_url` chiqadi.
    _url = f.file.url if f.file else (f.external_url or '')
    return {
        'id': f.pk,
        'file_url': _url,
        'external_url': f.external_url or '',
        'thumbnail_url': f.thumbnail.url if f.thumbnail else '',
        'file_type': f.file_type,
        'file_name': f.file_name,
        'file_size': f.file_size,
        'caption': f.caption or '',
        'uploaded_by': f.uploaded_by.full_name if f.uploaded_by else '',
        'created_at': f.created_at.isoformat(),
        # O'lchov chizmalari (2026-09-08) — bo'sh bo'lsa [] (measurement yo'q).
        'measurements': f.measurements or [],
    }


# ── Note ──

def serialize_note(n):
    return {
        'id': n.pk,
        'text': n.text,
        'created_by': n.created_by.full_name if n.created_by else '',
        'created_by_id': n.created_by_id,
        'created_at': n.created_at.isoformat(),
        'updated_at': n.updated_at.isoformat(),
    }


# ── Stage Template ──

def serialize_template(t):
    items = list(t.items.order_by('sort_order'))
    return {
        'id': t.pk,
        'name': t.name,
        'is_default': t.is_default,
        'items': [{
            'title': i.title,
            'icon': i.icon,
            'color': i.color,
            'sort_order': i.sort_order,
            'is_mebelcity': i.is_mebelcity,
            'note': i.note or '',
            'estimated_cost': i.estimated_cost or 0,
            'checklist': i.checklist_json or [],
        } for i in items],
    }


# ── Dashboard (yig'ma) ──

def _unread_notifications(user, limit=5):
    """O'qilmagan ilova-ichi bildirishnomalar (Bosh sahifada ko'rsatiladi)."""
    from client_erp.models import ClientNotification
    try:
        qs = (ClientNotification.objects
              .filter(user=user, channel='in_app', is_read=False)
              .order_by('-created_at')[:limit])
        return [{
            'id': n.pk, 'title': n.title, 'message': n.message,
            'type': n.notification_type,
            # Ko'zga tashlanadigan karta uchun (2026-08-04)
            'amount': _dec(n.amount) if n.amount is not None else None,
            'link': n.link or '',
            'icon': n.icon or '🔔',
            'created_at': n.created_at.isoformat(),
        } for n in qs]
    except Exception:                                             # noqa: BLE001
        logger.warning("[notifications] o'qib bo'lmadi", exc_info=True)
        return []


def serialize_dashboard(user):
    from client_erp.models import (
        ClientOrder, ClientCustomer, ClientFinanceRecord,
        ClientDebt, Quest, QuestCompletion, Announcement,
        ClientOrderPermission,
    )
    from django.utils import timezone
    from django.db.models import Sum, Q

    today = timezone.localdate()
    orders = ClientOrder.objects.filter(owner=user, is_deleted=False)
    customers = ClientCustomer.objects.filter(owner=user)
    finance = ClientFinanceRecord.objects.filter(
        owner=user, is_deleted=False,
    ).exclude(order__status='cancelled').exclude(order__is_deleted=True)

    # ── BALANS-KESIM (2026-08-12) ──────────────────────────────────────────
    # `cutover_date` o'rnatilgan bo'lsa (hozircha faqat bigone_cl2) — Dashboard
    # ham FAQAT shu sanadan boshlab hisoblanadi, eski (arxivlangan) davr
    # umuman qo'shilmaydi. `cutover_date=None` bo'lsa — eski xatti-harakat,
    # bu blok hech narsani o'zgartirmaydi.
    from client_erp.services.scope import cutover_bounds as _cutover_fn
    _cutover_date, _cutover_amt = _cutover_fn(user)
    if _cutover_date:
        finance = finance.filter(date__gte=_cutover_date)

    total_income = finance.filter(record_type='income').aggregate(
        s=Sum('amount'))['s'] or 0
    total_expense = finance.filter(record_type='expense').aggregate(
        s=Sum('amount'))['s'] or 0

    # ── SHARTNOMA-ASOSLI FOYDA (2026-08-03) ───────────────────────────────
    # Bosh sahifadagi «Foyda» kartasi Moliya sahifasidagi «Sof foyda» bilan
    # BIR XIL bo'lishi kerak — aks holda foydalanuvchi ikki sahifada ikki
    # raqam ko'radi (audit: TZ §0.3-Y2). FINANCE_V2 bayrog'i o'chiq bo'lsa
    # eski naqd-asosli hisob (kirim − chiqim) o'zgarishsiz qoladi.
    from client_erp.services.scope import finance_v2 as _fin_v2_fn
    _dash_profit = None
    if _fin_v2_fn(user):
        # ── E5 (2026-08-17): `ready` HAM foydaga kiradi ────────────────────
        # Ilgari faqat `delivered` sanalardi, «Ustalar foydasi» paneli esa
        # `delivered`+`ready` ni olardi. Natijada ustalarga 6 811 000 bo'linib
        # bo'lgan, bosh sahifada esa 1 912 000 turardi (foydalanuvchi
        # shikoyati). Endi uchala joy BIR XIL to'plamni oladi.
        # `delivered_at` bo'sh bo'lgan `ready` zakazlar `created_at` bo'yicha
        # kesiladi — aks holda ular hisobdan butunlay tushib qolardi.
        from django.db.models.functions import Coalesce as _Coal
        _delivered_qs = ClientOrder.objects.filter(
            owner=user, status__in=['delivered', 'ready'], is_deleted=False).select_related('owner')
        if _cutover_date:
            _delivered_qs = _delivered_qs.annotate(
                _pf=_Coal('delivered_at', 'created_at')
            ).filter(_pf__date__gte=_cutover_date)
        _dash_profit = sum(
            (Decimal(str(_o.contract_profit or 0)) for _o in _delivered_qs),
            Decimal('0'),
        )

    # ── H8 (2026-08-03): «ARVOH PUL» TUZATILDI ────────────────────────────
    # ILGARI: ulashilgan zakazdan hali yechilmagan ulush (`pending`) to'g'ridan-
    # to'g'ri `total_income`ga qo'shilardi. Bu `services/scope.py` sarlavhasidagi
    # O'Z QAT'IY QOIDASINI buzardi ("❌ ISHLATILMAYDI: Kassa / Balans / Kirim
    # jami — kassada bo'lmagan pul ko'rinadi va butun moliya buziladi").
    # Natijada bitta zakaz puli EGASI kassasida ham, A'ZO balansida ham
    # ko'rinardi (audit: TZ-Shartnoma-Foyda-Jamoa-Moliya.md §0.1).
    #
    # ENDI: pending fizik-pul ko'rsatkichlariga TEGMAYDI — alohida
    # `pending_profit` maydonida qaytariladi, UI'da alohida "💰 Kutilayotgan
    # foyda" kartasi bo'lib chiqadi (pul kelgach real yozuv bilan almashadi).
    from client_erp.services.scope import profit_claim_pending as _claim_pending_fn
    _pending_total = sum((p[1] for p in _claim_pending_fn(user)), Decimal('0'))

    total_debt = ClientDebt.objects.filter(
        owner=user, status__in=['active', 'partial'],
    ).aggregate(s=Sum('remaining'))['s'] or 0

    active_orders = orders.exclude(
        status__in=['delivered', 'cancelled'],
    ).select_related('customer').order_by('-created_at')[:10]

    shared_perms = ClientOrderPermission.objects.filter(
        user=user,
    ).select_related('order', 'order__customer')
    shared_tasks = []
    for perm in shared_perms:
        o = perm.order
        active_stages = list(o.stages.filter(status='active'))
        if active_stages:
            shared_tasks.append({
                'order': serialize_order_brief(o),
                'role': perm.role,
                'active_stages': [
                    {'id': s.pk, 'title': s.title, 'icon': s.icon}
                    for s in active_stages
                ],
            })

    daily_quests = Quest.objects.filter(quest_type='daily', is_active=True)
    quests_data = []
    for q in daily_quests:
        completion = QuestCompletion.objects.filter(
            user=user, quest=q, date=today,
        ).first()
        quests_data.append({
            'id': q.pk,
            'title': q.title,
            'icon': q.icon,
            'description': q.description,
            'xp_reward': q.xp_reward,
            'coin_reward': q.coin_reward,
            'action_count': q.action_count,
            'action_type': q.action_type,
            'progress': completion.progress if completion else 0,
            'is_completed': completion.is_completed if completion else False,
        })

    now = timezone.now()
    ann_qs = Announcement.objects.filter(
        is_active=True, start_date__lte=now,
    ).filter(Q(end_date__isnull=True) | Q(end_date__gte=now))
    if user.vip_level:
        ann_qs = ann_qs.filter(
            Q(target_all=True) | Q(target_levels=user.vip_level) | Q(target_users=user),
        )
    else:
        ann_qs = ann_qs.filter(
            Q(target_all=True) | Q(target_users=user),
        )
    announcements = ann_qs.distinct().order_by('-is_pinned', '-created_at')[:5]

    # Bosh sahifadagi "MebelCity" karta — 2026-08-28 foydalanuvchi talabi:
    # BUTUN TARIX emas, SHU OY (joriy kalendar oyi) bo'yicha son ko'rsatilsin.
    mebelcity_count = 0
    try:
        phone = user.phone
        if phone:
            from manfacturing.models import Order as MfOrder
            from client_erp.services.name_match import get_mc_client_ids
            from tenant_manager.middleware import get_current_db_alias
            _db = get_current_db_alias()
            _client_name = None
            if user.client_id:
                from clients.models import Client as _Client
                _c = _Client.objects.using(_db).filter(pk=user.client_id).first()
                _client_name = _c.full_name if _c else None
            _mc_ids = get_mc_client_ids(phone, _client_name, db_alias=_db)
            mebelcity_count = MfOrder.objects.filter(
                client_id__in=_mc_ids,
                order_date__year=today.year, order_date__month=today.month,
            ).count()
    except Exception:
        pass

    # Bosh sahifadagi "Mijozlar" karta — 2026-08-28 foydalanuvchi talabi:
    # BUTUN TARIX emas, SHU OY ichida yangi qo'shilgan mijozlar soni.
    new_customers_this_month = customers.filter(
        created_at__year=today.year, created_at__month=today.month,
    ).count()

    return {
        'user': serialize_user(user),
        'stats': {
            'customers_count': new_customers_this_month,
            'total_orders': orders.count(),
            'active_orders': orders.exclude(status__in=['delivered', 'cancelled']).count(),
            'mebelcity_count': mebelcity_count,
            'total_income': _dec(total_income),
            'total_expense': _dec(total_expense),
            'profit': _dec(_dash_profit if _dash_profit is not None else total_income - total_expense),
            'profit_by_contract': _dash_profit is not None,
            'total_debt': _dec(total_debt),
            # H8: ulashilgan zakazlardan kutilayotgan (hali yechilmagan) ulush —
            # ALOHIDA ko'rsatkich, Kirim/Foyda/Balansga QO'SHILMAYDI.
            'pending_profit': _dec(_pending_total),
        },
        'active_orders': [serialize_order_brief(o) for o in active_orders],
        # ── Ilova ichidagi o'qilmagan bildirishnomalar (2026-08-04) ──
        # Foydalanuvchi ilovaga kirganda ko'rishi kerak — Telegram o'chirilgan
        # yoki bot bloklangan bo'lishi mumkin.
        'notifications': _unread_notifications(user),
        'shared_tasks': shared_tasks,
        'daily_quests': quests_data,
        'announcements': [{
            'id': a.pk,
            'type': a.announcement_type,
            'title': a.title,
            'body': a.body,
            'image': a.image.url if a.image else None,
            'discount_percent': str(a.discount_percent) if a.discount_percent else None,
            'discount_code': a.discount_code or '',
            'start_date': a.start_date.isoformat(),
            'end_date': a.end_date.isoformat() if a.end_date else None,
            'is_pinned': a.is_pinned,
        } for a in announcements],
        'team_invite': _get_team_invite(user),
    }


def _get_team_invite(user):
    from client_erp.models.team import ClientTeamMember
    inv = ClientTeamMember.objects.filter(user=user, status='invited').select_related('team', 'team__owner').first()
    if not inv:
        return None
    return {
        'team_name': inv.team.name,
        'owner_name': inv.team.owner.full_name or inv.team.owner.username,
        'role': inv.role,
    }


def _get_last_profit_shares_full(user):
    """Oxirgi taqsimot — `user_id` va ko'rinadigan nom bilan («Pul yechish»
    oynasini oldindan to'ldirish uchun, 2026-08-18)."""
    from client_erp.models.team import ClientOrderProfitShare
    from client_erp.models import ClientOrder
    # ⚠️ O'chirilgan zakaz manba bo'lmasin va imkon qadar HAQIQIY taqsimot
    # (2+ kishi) olinsin — aks holda «Men 100%» kabi ma'nosiz qator
    # oldindan qo'yilib qolardi (2026-08-18 sinovda aniqlandi).
    from django.db.models import Count as _Cnt
    base = (ClientOrder.objects.filter(owner=user, is_deleted=False)
            .exclude(status='cancelled')
            .filter(profit_shares__isnull=False)
            .annotate(_ns=_Cnt('profit_shares')))
    last_order = (base.filter(_ns__gte=2).order_by('-updated_at').first()
                  or base.order_by('-updated_at').first())
    if not last_order:
        return []
    shares = (ClientOrderProfitShare.objects.filter(order=last_order)
              .select_related('user').order_by('sort_order'))
    return [{'name': s.name, 'percent': float(s.percent),
             'user_id': s.user_id,
             'label': contact_label(s.user) if s.user_id else s.name}
            for s in shares]


def _get_last_profit_shares(user):
    from client_erp.models.team import ClientOrderProfitShare
    from client_erp.models import ClientOrder
    last_order = ClientOrder.objects.filter(owner=user).exclude(
        status='cancelled'
    ).filter(profit_shares__isnull=False).order_by('-updated_at').first()
    if not last_order:
        return []
    shares = ClientOrderProfitShare.objects.filter(order=last_order).order_by('sort_order')
    return [{'name': s.name, 'percent': float(s.percent)} for s in shares]


# ── Finance page ──

def _partner_split(user, period_q=None, start=None, end=None):
    """SHERIKSIZ / SHERIKLI bo'linmasi — moliya TZ (2026-08-15), qo'lyozma
    1- va 2-blok.

    Har guruh uchun:  jami shartnoma summasi − jami xarajat = foyda.
    «Sherikli» — buyurtmada foyda-ulushi (`ClientOrderProfitShare`) yoki
    ulashish (`ClientOrderShare`) bor bo'lganlar; qolganlari «sheriksiz».

    FAQAT O'QIYDI — hech narsa yozmaydi/o'zgartirmaydi.
    """
    from decimal import Decimal
    from django.db.models import Sum
    from client_erp.models import ClientOrder, ClientFinanceRecord
    from client_erp.models.team import ClientOrderProfitShare, ClientOrderShare

    # DAVR: buyurtma ham, xarajat ham BIR XIL davrga tushishi shart. Aks holda
    # eski buyurtmaning shartnomasi sanaladi-yu, xarajati sanalmay «foyda»
    # sun'iy oshib ketadi (shartnoma to'liq − xarajat 0).
    ord_qs = ClientOrder.objects.filter(owner=user, is_deleted=False).exclude(status='cancelled')
    if start:
        # ── DAVRGA TUSHISH MEZONI (2026-08-15 tuzatildi) ──────────────────
        # Ilgari FAQAT «shu davrda ochilgan» sanalardi va OLDIN ochilib,
        # shu davrda davom etayotgan («o'tgan») buyurtmalar tushib qolardi:
        # BigOne'da 16 ta zakaz bor edi-yu, tabda 12 chiqardi.
        # To'g'ri mezon: shu davrda OCHILGAN **yoki** shu davrda PUL
        # HARAKATI bo'lgan.
        _active = set(ClientFinanceRecord.objects
                      .filter(owner=user, is_deleted=False, order__isnull=False,
                              date__gte=start, date__lte=end)
                      .values_list('order_id', flat=True))
        from django.db.models import Q as _Q
        _q = _Q(created_at__date__gte=start, created_at__date__lte=end)
        if _active:
            _q = _q | _Q(pk__in=_active)
        ord_qs = ord_qs.filter(_q)
    orders = list(ord_qs)
    if not orders:
        return {'solo': _empty_split(), 'partner': _empty_split(), 'shares': []}

    oids = [o.pk for o in orders]
    # ── «Sherikli» ta'rifi (2026-08-15 tuzatildi) ─────────────────────────
    # Ilgari: foyda-ulushi qatori BOR bo'lsa yetardi. Endi har yangi zakazda
    # foiz MAJBURIY bo'lgani uchun («Men 100%» bitta qator) — o'sha qoida
    # bilan YOLG'IZ zakaz ham «sherikli» bo'lib chiqardi.
    # To'g'ri ta'rif: ulashilgan YOKI foyda 2+ odamga bo'lingan.
    # ⚠️ 2026-08-17: `ClientOrderShare` (ko'rish uchun ulashish) MEZON EMAS.
    # Zakazni xodimga «ko'rish/ishlash» uchun ulashish — foydani bo'lish
    # DEGANI EMAS. Ilgari ulashilgan zakaz ham «sherikli» bo'lib chiqardi,
    # natijada barcha xodimga ulashilgan zakaz «sherikli» tomonga o'tib
    # ketardi. To'g'ri mezon: FOYDA haqiqatan 2+ odamga bo'lingan.
    from django.db.models import Count
    shared = {r['order_id'] for r in ClientOrderProfitShare.objects
              .filter(order_id__in=oids).values('order_id')
              .annotate(n=Count('id')).filter(n__gte=2)}
    # ── E2 (2026-08-17): foyda 2+ odamga YECHILGAN bo'lsa ham sherikli ──────
    # Ulush jadvali bo'sh bo'lsa-yu, pul bir necha kishiga taqsimlangan bo'lsa
    # (eski uslub: foiz yechish paytida kiritilardi) — bu ham sherikli zakaz.
    # Busiz «Sherikli hisob» bo'sh turardi (foydalanuvchi shikoyati).
    try:
        from client_erp.models.team import ClientProfitWithdrawalLine
        for r in (ClientProfitWithdrawalLine.objects
                  .filter(withdrawal__order_id__in=oids, withdrawal__status='completed')
                  .values('withdrawal__order_id')
                  .annotate(n=Count('name', distinct=True)).filter(n__gte=2)):
            shared.add(r['withdrawal__order_id'])
    except Exception:
        pass

    # Xarajat — tanlangan buyurtmalarning TO'LIQ xarajati (sana bo'yicha
    # kesilmaydi): buyurtma foydasi = shartnoma − o'sha buyurtmaga ketgan
    # hamma pul. Davr allaqachon buyurtma darajasida qo'llangan.
    exp_map = {r['order_id']: r['s'] for r in
               ClientFinanceRecord.objects
               .filter(owner=user, record_type='expense', is_deleted=False,
                       order_id__in=oids)
               .values('order_id').annotate(s=Sum('amount'))}

    def contract_of(o):
        v = getattr(o, 'contract_amount', None) or getattr(o, 'zaklad_amount', None) or 0
        return Decimal(str(v or 0))

    # 🔻 Sherik chiqarilgan buyurtmalar — «Sheriksiz» tomonda yorliq bo'lib
    # ko'rinadi (2026-08-15 §S4): zakaz nega yolg'iz ekani darhol tushunarli.
    from client_erp.models.team import ClientProfitAudit
    removed_map = {}
    for a in (ClientProfitAudit.objects
              .filter(order_id__in=oids, action=ClientProfitAudit.Action.UNSHARE)
              .order_by('-created_at')):
        removed_map.setdefault(a.order_id, []).append({
            'name': a.target_name or '—', 'was': a.old_value or '',
            'reason': a.reason or '', 'at': a.created_at.isoformat(),
        })

    groups = {'solo': {'contract': Decimal('0'), 'expense': Decimal('0'), 'orders': []},
              'partner': {'contract': Decimal('0'), 'expense': Decimal('0'), 'orders': []}}
    for o in orders:
        key = 'partner' if o.pk in shared else 'solo'
        c = contract_of(o)
        e = Decimal(str(exp_map.get(o.pk, 0) or 0))
        groups[key]['contract'] += c
        groups[key]['expense'] += e
        groups[key]['orders'].append({
            'id': o.pk, 'title': o.title or '', 'status': o.status,
            'contract': _dec(c), 'expense': _dec(e), 'profit': _dec(c - e),
            'removed': removed_map.get(o.pk, []),
        })

    # Sherikli tomonda — kimga qancha (ulush foizi bo'yicha)
    # Har kim uchun: shartnoma ulushi · rasxod ulushi · foyda ulushi
    # (2026-08-15 §F4 — «rasxod ham foizga qarab bo'linadi» talabi).
    per_person = {}
    if groups['partner']['orders']:
        pshares = ClientOrderProfitShare.objects.filter(
            order_id__in=[x['id'] for x in groups['partner']['orders']])
        by_order = {x['id']: x for x in groups['partner']['orders']}
        for sh in pshares:
            o = by_order.get(sh.order_id)
            if not o:
                continue
            pct = Decimal(str(sh.percent or 0)) / Decimal('100')
            nm = (sh.name or '').strip() or '—'
            cur = per_person.setdefault(nm, {'contract': Decimal('0'),
                                             'expense': Decimal('0'),
                                             'amount': Decimal('0')})
            cur['contract'] += Decimal(str(o['contract'])) * pct
            cur['expense'] += Decimal(str(o['expense'])) * pct
            cur['amount'] += Decimal(str(o['profit'])) * pct

    # ── MENGA TEGISHLI FOYDA (2026-08-15) ────────────────────────────────
    # «Sherikli» ustuni buyurtmaning TO'LIQ foydasini ko'rsatadi (100%),
    # «Sheriklikdagi foyda» kartasi esa BOSHQANING zakazidagi ulushni.
    # Foydalanuvchi ikkovini solishtirib chalkashdi — endi o'z zakazlaridan
    # o'ziga tegadigan ulush ham aniq raqam bo'lib chiqadi.
    my_share = Decimal('0')
    if groups['partner']['orders']:
        _pids = [x['id'] for x in groups['partner']['orders']]
        _prof = {x['id']: Decimal(str(x['profit'])) for x in groups['partner']['orders']}
        for sh in ClientOrderProfitShare.objects.filter(order_id__in=_pids):
            _is_me = (sh.user_id == user.pk) or (
                sh.user_id is None and ('buyurtma egasi' in (sh.name or '') or sh.is_remainder))
            if _is_me:
                my_share += _prof.get(sh.order_id, Decimal('0')) * Decimal(str(sh.percent or 0)) / Decimal('100')

    def pack(g):
        return {
            'contract': _dec(g['contract']),
            'expense': _dec(g['expense']),
            'profit': _dec(g['contract'] - g['expense']),
            'count': len(g['orders']),
            'orders': sorted(g['orders'], key=lambda x: -float(x['profit']))[:30],
        }

    return {
        'solo': pack(groups['solo']),
        'partner': pack(groups['partner']),
        # O'z sherikli zakazlarimdan menga tegadigan ulush (pul MENDA)
        'my_share': _dec(my_share),
        'shares': sorted(
            [{'name': k, 'amount': _dec(v['amount']),
              'contract': _dec(v['contract']), 'expense': _dec(v['expense'])}
             for k, v in per_person.items()],
            key=lambda x: -float(x['amount'])),
    }


def _empty_split():
    return {'contract': '0', 'expense': '0', 'profit': '0', 'count': 0, 'orders': []}


def _creditor_block(user):
    """USTALAR QARZI — biz kimga qancha qarzdormiz (moliya TZ §F4/§F5).
    FAQAT O'QIYDI. Kassa/balansga qo'shilmaydi — alohida ko'rsatiladi."""
    from decimal import Decimal
    try:
        from client_erp.models import ClientSupplierDebt
    except Exception:
        return {'total': '0', 'items': []}
    rows = list(ClientSupplierDebt.objects.filter(owner=user, is_closed=False)
                .select_related('order').order_by('-created_at')[:100])
    TYPE_LABEL = dict(ClientSupplierDebt.CREDITOR_TYPES)
    total = Decimal('0')
    items = []
    for d in rows:
        rem = Decimal(str(d.remaining or 0))
        if rem <= 0:
            continue
        total += rem
        items.append({
            'id': d.pk, 'name': d.creditor_name,
            'type': d.creditor_type, 'type_label': TYPE_LABEL.get(d.creditor_type, d.creditor_type),
            'amount': _dec(d.amount), 'paid': _dec(d.paid), 'remaining': _dec(rem),
            'note': d.note or '', 'order_id': d.order_id,
            'order_title': (d.order.title if d.order_id else ''),
            # «Qachon» — qo'lda tanlangan sana, bo'lmasa yozuv yaratilgan kun
            'taken_date': (d.taken_date or d.created_at.date()).isoformat(),
            'is_auto': bool(d.creditor_type == 'shaxs' and d.order_id),
            'due_date': d.due_date.isoformat() if d.due_date else None,
        })
    return {'total': _dec(total), 'items': items}


def _undistributed_hint(user):
    """Taqsimlanmagan foyda bor-yo'qligi (Moliya sahifasidagi eslatma uchun).

    Shart: topshirilgan buyurtma + foydasi > 0 + `ClientOrderProfitShare`
    yozuvi YO'Q. Faqat O'Z buyurtmalari (ulashilganlarni egasi bo'ladi).
    """
    from client_erp.models import ClientOrder
    from client_erp.models.team import ClientProfitWithdrawal
    try:
        # ⚠️ 2026-08-18: PUL YECHILGAN buyurtma «taqsimlanmagan» hisoblanmaydi.
        # Ilgari shart faqat `profit_shares` yozuviga qarardi — #296 da pul
        # yechilgan (3 kishiga 2 274 000), lekin ulush yozuvi yo'q edi va
        # Moliya sahifasi hamon «1 ta buyurtma taqsimlanmagan» deb turardi.
        _withdrawn = set(ClientProfitWithdrawal.objects
                         .filter(order__owner=user)
                         .exclude(status='reversed')
                         .values_list('order_id', flat=True))
        cnt, total = 0, Decimal('0')
        for o in (ClientOrder.objects
                  .filter(owner=user, status='delivered', is_deleted=False)
                  .select_related('owner').prefetch_related('profit_shares')):
            if o.pk in _withdrawn:
                continue
            if o.profit_shares.exists():
                continue
            p = Decimal(str(o.contract_profit or 0))
            if p > 0:
                cnt += 1
                total += p
        return {'count': cnt, 'total': _dec(total)} if cnt else None
    except Exception:                                             # noqa: BLE001
        logger.warning("[undistributed_hint] xato", exc_info=True)
        return None


def _pending_accept(user):
    """A'zo hali qabul qilmagan ulushlar (H7).

    Har biri uchun: qaysi zakaz, kim yubordi, qancha, va qabul qilingandan
    keyin balans qanday bo'lishi. Frontend shu ma'lumot bilan
    «Hozir X · Qabul qilsangiz Y» kartasini chizadi.
    """
    from django.db.models import Sum
    from client_erp.models import ClientFinanceRecord
    from client_erp.models.team import ClientProfitWithdrawalLine
    try:
        qs = (ClientProfitWithdrawalLine.objects
              .filter(user=user, confirmed=False)
              .exclude(withdrawal__status='reversed')
              .select_related('withdrawal', 'withdrawal__order',
                              'withdrawal__order__owner')
              .order_by('-withdrawal__created_at'))
        rows = list(qs)
        if not rows:
            return None
        # Hozirgi balans (fizik pul) — kartada «hozir» sifatida ko'rsatiladi
        b = ClientFinanceRecord.objects.filter(owner=user, is_deleted=False)
        inc = b.filter(record_type='income').exclude(
            order__status='cancelled').aggregate(s=Sum('amount'))['s'] or 0
        exp = b.filter(record_type='expense').exclude(
            order__status='cancelled').aggregate(s=Sum('amount'))['s'] or 0
        wd = b.filter(record_type='withdrawal').aggregate(s=Sum('amount'))['s'] or 0
        balance = Decimal(str(inc)) - Decimal(str(exp)) - Decimal(str(wd))

        items, total = [], Decimal('0')
        for ln in rows:
            amt = Decimal(str(ln.amount or 0))
            total += amt
            o = ln.withdrawal.order
            items.append({
                'line_id': ln.pk,
                'amount': _dec(amt),
                'percent': float(ln.percent or 0),
                'order_title': o.title,
                'from_name': contact_label(o.owner) or o.owner.username,
                'created_at': ln.withdrawal.created_at.isoformat(),
            })
        return {
            'items': items,
            'total': _dec(total),
            'balance_now': _dec(balance),
            'balance_after': _dec(balance + total),
        }
    except Exception:                                             # noqa: BLE001
        logger.warning("[pending_accept] xato", exc_info=True)
        return None


def _contract_slices(user, period_q, _not_cancelled, limit=50,
                     shared_ids=None, claim_map=None, pending_list=None):
    """Moliya sahifasi — «Shartnomalar kesimi» (TZ-Moliya-Shartnoma-Kesimi.md).

    FAQAT O'QIYDI. Bitta ham yozuv yaratilmaydi/o'zgartirilmaydi/o'chirilmaydi.

    ── ASOSIY QARORLAR (TZ §4.2) ────────────────────────────────────────────
    Karta RAQAMLARI — HAR DOIM shartnoma boshidan oxirigacha (davr filtridan
    MUSTAQIL). Sabab: shartnoma oylar bo'ylab cho'ziladi — chiqim iyulda,
    kirim avgustda bo'lishi mumkin. Davr filtri raqamlarga qo'llansa foyda
    foizi YOLG'ON chiqadi.
    Davr filtri esa faqat RO'YXATNI cheklaydi: «shu davrda harakat bo'lgan
    shartnomalar» ko'rsatiladi.

    ── withdrawal ≠ chiqim (TZ §3.2) ────────────────────────────────────────
    Foyda taqsimoti `withdrawal` turida yoziladi. Uni `expense`ga qo'shish =
    foydani IKKI MARTA kamaytirish. Shuning uchun alohida «Taqsimlangan»
    qatorida chiqadi.
    Bekor qilingan taqsimot esa `income` + `is_reversal=True` juftligi bilan
    qaytariladi (jonli bazada: 7 ta yozuv, `BEKOR:` prefiksi bilan 1:1 mos).
    Ular o'zaro qisqartiriladi — aks holda #319 da 25 mln taqsimlangandek
    ko'rinardi (aslida 5 mln).
    """
    from client_erp.models import ClientFinanceRecord, ClientOrder
    from django.db.models import Sum, Q, Count

    _real_inc = Q(record_type='income', is_reversal=False)
    _rev_inc = Q(record_type='income', is_reversal=True)
    _exp = Q(record_type='expense')
    _wd = Q(record_type='withdrawal')

    base = ClientFinanceRecord.objects.filter(
        _not_cancelled, owner=user, is_deleted=False,
    )

    # 1) Davr ichida harakat bo'lgan zakazlar — FAQAT ro'yxatni cheklash uchun
    active_ids = set(
        base.filter(period_q, order__isnull=False)
        .values_list('order_id', flat=True).distinct()
    )
    orphan_active = base.filter(period_q, order__isnull=True).exists()

    # 2) Umr bo'yi agregat — BITTA so'rov, zakaz kesimida (N+1 YO'Q)
    agg = {}
    for row in base.filter(order__isnull=False).values('order_id').annotate(
        inc=Sum('amount', filter=_real_inc),
        rev=Sum('amount', filter=_rev_inc),
        exp=Sum('amount', filter=_exp),
        wd=Sum('amount', filter=_wd),
        n=Count('id'),
    ).order_by():
        agg[row['order_id']] = row

    # 3) Xarajat kategoriyalari — ham bitta so'rov
    by_cat = {}
    for row in base.filter(order__isnull=False, record_type='expense').values(
        'order_id', 'category',
    ).annotate(s=Sum('amount')).order_by():
        by_cat.setdefault(row['order_id'], {})[row['category'] or 'other'] = _dec(row['s'])

    # 4) Zakaz + shartnoma — prefetch bilan (contract_amount property N+1 qilmasin)
    orders = {
        o.id: o for o in ClientOrder.objects.filter(
            owner=user, id__in=set(agg.keys()),
        ).select_related('customer').prefetch_related('contracts')
    }

    # 4b) Rasmiy qarz yozuvlari (ClientDebt) — zakaz kesimida, bitta so'rov.
    #     DIQQAT: bu `remaining` (shartnoma − olingan) dan BOSHQA narsa.
    #     `remaining` — shartnoma bo'yicha hali kelmagan pul (hisob-kitob).
    #     `debt_open` — qo'lda ochilgan rasmiy qarz yozuvi (kelishilgan muddat bilan).
    #     Ikkalasi ham ko'rsatiladi, chalkashmasligi uchun alohida nomlanadi.
    from client_erp.models import ClientDebt
    debt_map = {}
    for d in ClientDebt.objects.filter(
        owner=user, order__isnull=False, status__in=['active', 'partial'],
    ).select_related('customer'):
        cur = debt_map.setdefault(d.order_id, {'amount': Decimal('0'), 'count': 0, 'due': None})
        cur['amount'] += Decimal(str(d.remaining or 0))
        cur['count'] += 1
        if d.due_date and (cur['due'] is None or d.due_date < cur['due']):
            cur['due'] = d.due_date

    slices = []
    for oid, a in agg.items():
        o = orders.get(oid)
        if o is None:
            continue
        # ── Shartnoma holati — prefetch KESHIDAN (TZ §2.3) ───────────────────
        # ⚠️ Bu yerda ATAYLAB `o.contract_amount` propertysi CHAQIRILMAYDI.
        # Sabab: u ichida `self.contracts.filter(status='confirmed')` bor —
        # `.filter()` prefetch keshini CHETLAB O'TADI va har zakaz uchun
        # yangi so'rov yuboradi. O'lchandi: 53 shartnoma = 64 so'rov (N+1).
        # Kesh (`.all()`) bilan esa 11 so'rov — zakaz soniga bog'liq emas.
        # Formula `models/order.py:contract_amount` bilan 1:1 bir xil:
        # tasdiqlangan shartnoma (eng so'nggisi) → bo'lmasa zaklad → final_price.
        confirmed = None
        sent = None
        _conf_all = []
        for c in o.contracts.all():                      # kesh — so'rov yubormaydi
            if c.status == 'confirmed':
                _conf_all.append(c)
            elif c.status == 'sent' and sent is None:
                sent = c
        if _conf_all:
            # `contract_amount` `-confirmed_at` bo'yicha eng so'nggisini oladi
            _conf_all.sort(key=lambda x: (x.confirmed_at is not None, x.confirmed_at), reverse=True)
            confirmed = _conf_all[0]

        if confirmed is not None and confirmed.contract_amount:
            camount = Decimal(str(confirmed.contract_amount))
        else:
            camount = Decimal(str(o.zaklad_amount or o.final_price or 0))

        received = Decimal(str(a['inc'] or 0))
        expense = Decimal(str(a['exp'] or 0))
        # Taqsimlangan = yechilgan − bekor qilingan (reversal juftligi)
        distributed = Decimal(str(a['wd'] or 0)) - Decimal(str(a['rev'] or 0))
        profit = camount - expense

        if confirmed is not None:
            badge, badge_label = 'confirmed', 'Tasdiqlangan'
        elif sent is not None:
            badge, badge_label = 'sent', 'Tasdiqlanmagan'
        elif camount > 0:
            badge, badge_label = 'informal', 'Rasmiy shartnomasiz'
        else:
            badge, badge_label = 'none', 'Summa kiritilmagan'

        _dbt = debt_map.get(oid)
        slices.append({
            'order_id': oid,
            'title': o.title,
            # Osilgan FK'da yiqilmaslik uchun getattr (select_related LEFT JOIN → None)
            'customer': getattr(o.customer, 'full_name', '') if o.customer_id else '',
            'customer_id': o.customer_id,
            'status': o.status,
            # Rasmiy qarz yozuvi (ClientDebt) — `remaining`dan alohida
            'debt_open': _dec(_dbt['amount']) if _dbt else '0',
            'debt_count': _dbt['count'] if _dbt else 0,
            'debt_due': _dbt['due'].isoformat() if (_dbt and _dbt['due']) else None,
            'delivered_at': o.delivered_at.isoformat() if o.delivered_at else None,
            'badge': badge,
            'badge_label': badge_label,
            'contract_id': confirmed.pk if confirmed else (sent.pk if sent else None),
            'contract_amount': _dec(camount),
            'received': _dec(received),
            # Shartnomadan ortiq kelgan pul — «qolgan»ni manfiy qilmaydi
            'remaining': _dec(max(camount - received, Decimal('0'))),
            'overpaid': _dec(max(received - camount, Decimal('0'))),
            'expense': _dec(expense),
            'expense_by_cat': by_cat.get(oid, {}),
            'profit': _dec(profit),
            'profit_pct': round(float(profit / camount * 100), 1) if camount > 0 else None,
            'distributed': _dec(distributed),
            'left': _dec(profit - distributed),
            'record_count': a['n'],
            'in_period': oid in active_ids,
        })

    # 5) Tartib — QARZ BIRINCHI (foydalanuvchi talabi 2026-08-04):
    #    «kim bizdan qancha qarz qolgan ko'rinish kere» → qarzi borlar tepada,
    #    qarz miqdori bo'yicha kamayish tartibida; qarzsizlar keyin, foyda bo'yicha.
    def _sort_key(s):
        debt = float(s['remaining']) + float(s['debt_open'])
        return (0 if debt > 0 else 1, -debt, -float(s['profit']))
    slices.sort(key=_sort_key)

    # 6) 🔵 Shartnomasiz — zakazga bog'lanmagan pul. KO'RSATILISHI SHART,
    #    aks holda jami Kirim/Chiqim bilan mos kelmaydi (TZ §4.1).
    orp = base.filter(order__isnull=True).aggregate(
        inc=Sum('amount', filter=_real_inc),
        rev=Sum('amount', filter=_rev_inc),
        exp=Sum('amount', filter=_exp),
        wd=Sum('amount', filter=_wd),
        n=Count('id'),
    )
    orphan = {
        'income': _dec(orp['inc'] or 0),
        'expense': _dec(orp['exp'] or 0),
        'distributed': _dec(Decimal(str(orp['wd'] or 0)) - Decimal(str(orp['rev'] or 0))),
        'count': orp['n'] or 0,
        'in_period': orphan_active,
    }

    # 6b) 🤝 ULASHILGAN SHARTNOMALAR — boshqa akkaunt egaligidagi zakazlar.
    #     Nega alohida: bu pul EGASINING kassasida, bizda emas. Asosiy
    #     ro'yxatga qo'shilsa yuqoridagi «Σ = umumiy kirim» invarianti buzilardi.
    #     Lekin ko'rsatilmasa foydalanuvchi «Sof foydada 3 ta, bu yerda 2 ta —
    #     nega?» deb qolardi (aynan shu savol berildi, 2026-08-04).
    #     Shuning uchun: ko'rsatiladi, lekin portfel yig'indisiga QO'SHILMAYDI.
    #     ⚠️ `shared_ids`/`claim_map`/`pending_list` CHAQIRUVCHIDAN keladi —
    #     `serialize_finance_page` ularni allaqachon hisoblagan. Qayta
    #     chaqirilsa 10 ta ortiqcha so'rov ketardi (o'lchandi).
    shared = []
    try:
        _cm = claim_map or {}
        _pending = {p[0]: p[1] for p in (pending_list or [])}
        _ids = (set(shared_ids or ()) | set(_cm.keys())) - set(agg.keys())
        if _ids:
            # Xarajat annotate bilan — `contract_profit` propertysi har zakaz
            # uchun alohida so'rov yubormasin (N+1).
            sq = ClientOrder.objects.filter(
                pk__in=_ids, is_deleted=False,
            ).exclude(status='cancelled').select_related('owner', 'customer').prefetch_related(
                'contracts',
            ).annotate(
                _exp=Sum('finance_records__amount', filter=Q(
                    finance_records__record_type='expense',
                    finance_records__is_deleted=False,
                )),
            )
            for o in sq:
                _pct = _cm.get(o.id)
                _pend = Decimal(str(_pending.get(o.id, 0)))
                # ⚠️ FAQAT PUL TEGADIGANLARI. Zakaz shunchaki KO'RISH uchun
                # ulashilgan bo'lsa (ulush foizi yo'q, kutilayotgan pul yo'q) —
                # ro'yxatga TUSHMAYDI. Aks holda egasining to'liq foydasi
                # foydalanuvchiga «sizning ulushingiz» bo'lib ko'rinardi
                # (jonli bazada: #316 da 18 400 000 shunday chiqdi — 2026-08-05).
                if _pct is None and _pend <= 0:
                    continue
                _conf = [c for c in o.contracts.all() if c.status == 'confirmed']
                if _conf:
                    _conf.sort(key=lambda x: (x.confirmed_at is not None, x.confirmed_at), reverse=True)
                _camt = (Decimal(str(_conf[0].contract_amount))
                         if (_conf and _conf[0].contract_amount)
                         else Decimal(str(o.zaklad_amount or o.final_price or 0)))
                _full = _camt - Decimal(str(o._exp or 0))
                # Sizga tegadigan aniq summa
                if _pend > 0:
                    _mine = _pend
                elif _pct is not None:
                    _mine = _full * Decimal(str(_pct)) / 100
                else:
                    _mine = Decimal('0')
                shared.append({
                    'order_id': o.id,
                    'title': o.title,
                    'customer': getattr(o.customer, 'full_name', '') if o.customer_id else '',
                    'owner': getattr(o.owner, 'full_name', '') or getattr(o.owner, 'username', ''),
                    'status': o.status,
                    'contract_amount': _dec(_camt),
                    'profit': _dec(_full),                 # egasining to'liq foydasi
                    'my_share': _dec(_mine),               # SIZGA tegadigani
                    'share_percent': _dec(_pct) if _pct is not None else None,
                    'pending': _dec(_pend),
                    'is_waiting': bool(_pend > 0),         # hali yechilmagan
                })
            shared.sort(key=lambda s: -float(s['my_share']))
    except Exception:                                             # noqa: BLE001
        shared = []                    # ulashish mantiqi yiqilsa — tab ishlayversin

    # 6c) QARZDORLAR — «Qarzlar» tabi uchun (2026-08-05).
    #     ⚠️ Davr filtri ATAYLAB QO'LLANMAYDI: qarz — nuqta-vaqt holati,
    #     davr oqimi emas. 3 oy oldingi to'lanmagan shartnoma bugun ham
    #     qarz bo'lib qoladi. «Shu oy» filtri bilan yashirilsa — usta
    #     qarzdorini ko'rmay qoladi (Balans ham shu sababdan filtrsiz).
    debtors = [
        {
            'order_id': s['order_id'], 'title': s['title'],
            'customer': s['customer'], 'customer_id': s['customer_id'],
            'status': s['status'],
            'contract_amount': s['contract_amount'],
            'received': s['received'],
            'remaining': s['remaining'],
            'debt_open': s['debt_open'],
            'badge': s['badge'],
        }
        for s in slices
        if float(s['remaining']) > 0
    ]
    debtors.sort(key=lambda d: -float(d['remaining']))

    # 7) Portfel yig'indisi — davrda ko'rinadiganlar bo'yicha
    shown = [s for s in slices if s['in_period']] or slices
    tot = {k: Decimal('0') for k in ('contract_amount', 'received', 'remaining',
                                     'overpaid', 'expense', 'profit',
                                     'distributed', 'left', 'debt_open')}
    for s in shown:
        for k in tot:
            tot[k] += Decimal(str(s[k]))
    # Qancha shartnomada qarz bor — sarlavhada «3 ta shartnomada qarz» deb chiqadi
    tot_debtors = sum(
        1 for s in shown
        if float(s['remaining']) > 0 or float(s['debt_open']) > 0
    )

    # 8) NOMUVOFIQLIK TEKSHIRUVI (TZ §3.3) — bo'linish TO'LIQ bo'lishi shart.
    #    Umr bo'yi: Σ(kartalar) + shartnomasiz = umumiy kirim/chiqim.
    #    Mos kelmasa UI qizil ogohlantirish chiqaradi — JIMGINA YASHIRILMAYDI.
    all_inc = base.filter(_real_inc).aggregate(s=Sum('amount'))['s'] or 0
    all_exp = base.filter(_exp).aggregate(s=Sum('amount'))['s'] or 0

    # ── Zakazga bog'lanmagan taqsimot (2026-08-05) ───────────────────────
    # Yechimlarning 60% i hech qaysi zakazga bog'lanmagan (o'lchandi).
    # Shartnoma kartalarida ular ko'rinmaydi — foydalanuvchi «ulushim
    # qayerda?» deb qolmasligi uchun tab pastida izoh chiqariladi.
    _unlinked_wd = ClientFinanceRecord.objects.filter(
        owner=user, record_type='withdrawal', is_deleted=False,
        order__isnull=True,
    ).aggregate(s=Sum('amount'))['s'] or 0

    # ── NEGA «Kirim» kartasi bilan farq qiladi (jonli bazada topildi) ──────
    # Kirim kartasi BARCHA income yozuvini sanaydi — shu jumladan BEKOR
    # qilingan foyda-taqsimotining qaytishini ham (`is_reversal=True`).
    # Misol (ibrohim_cl): Kirim kartasi 69 999 628, lekin mijozdan kelgan
    # HAQIQIY pul 50 000 000; farq 19 999 628 — bu 4 ta bekor qilingan ulush.
    # Kassa nuqtai nazaridan to'g'ri (pul haqiqatan qaytdi), lekin «tushum»
    # emas. Shuning uchun bu yerda `received` faqat haqiqiy pulni ko'rsatadi,
    # farq esa UI'da OCHIQ tushuntiriladi — jimgina yashirilmaydi.
    reversal_inc = base.filter(_rev_inc).aggregate(s=Sum('amount'))['s'] or 0
    sum_inc = sum((Decimal(str(s['received'])) for s in slices), Decimal('0')) + Decimal(str(orphan['income']))
    sum_exp = sum((Decimal(str(s['expense'])) for s in slices), Decimal('0')) + Decimal(str(orphan['expense']))
    mismatch = (Decimal(str(all_inc)) - sum_inc) + (Decimal(str(all_exp)) - sum_exp)

    return {
        'items': [dict(s, expense_by_cat=s['expense_by_cat']) for s in shown[:limit]],
        'has_more': max(len(shown) - limit, 0),
        'orphan': orphan,
        # Boshqa akkaunt egaligidagi zakazlar — portfel yig'indisiga kirmaydi
        'shared': shared,
        'shared_total': _dec(sum((Decimal(str(s['my_share'])) for s in shared), Decimal('0'))),
        'shared_waiting': _dec(sum(
            (Decimal(str(s['my_share'])) for s in shared if s['is_waiting']), Decimal('0'))),
        'totals': {k: _dec(v) for k, v in tot.items()},
        'debtor_count': tot_debtors,
        # «Qarzlar» tabi uchun — davr filtridan MUSTAQIL (yuqoridagi izoh)
        'debtors': debtors,
        'debtors_total': _dec(sum((Decimal(str(d['remaining'])) for d in debtors), Decimal('0'))),
        'count': len(shown),
        'mismatch': _dec(mismatch),
        # «Kirim» kartasidan farqni tushuntirish uchun (yuqoridagi izohga qarang)
        'reversal_income': _dec(reversal_inc),
        # Zakazga bog'lanmagan taqsimot — kartalarda ko'rinmaydi, izoh uchun
        'unlinked_withdrawal': _dec(_unlinked_wd),
        # UI izohi: raqamlar davr filtridan mustaqil (TZ §4.2)
        'lifetime': True,
    }


def kassa_ostatka(user):
    """KASSA OSTATKA — ekranda ko'rinadigan qoldiqning YAGONA manbasi.

    Moliya sahifasidagi `stats.balance` bilan AYNAN bir xil formula
    (kesim + bekor qilingan buyurtma istisnosi). «Pul yechish» limiti ham
    shu funksiyadan foydalanadi — ilgari ikkisi turlicha hisoblab,
    foydalanuvchi balansini ko'rib turib "Balans yetarli emas" xatosini
    olardi (TZ-Moliya-Qayta-Qurish-2026-08-15 §F6).
    """
    from decimal import Decimal
    from django.db.models import Sum, Q
    from client_erp.models import ClientFinanceRecord
    from client_erp.services.scope import cutover_bounds as _cutover_fn

    cut_date, cut_amt = _cutover_fn(user)
    cut_q = Q(date__gte=cut_date) if cut_date else Q()
    not_cancelled = ~Q(order__status='cancelled')

    def _s(**kw):
        return ClientFinanceRecord.objects.filter(
            cut_q, owner=user, is_deleted=False, **kw
        ).aggregate(s=Sum('amount'))['s'] or 0

    inc = ClientFinanceRecord.objects.filter(
        not_cancelled, cut_q, owner=user, record_type='income', is_deleted=False
    ).aggregate(s=Sum('amount'))['s'] or 0
    exp = ClientFinanceRecord.objects.filter(
        not_cancelled, cut_q, owner=user, record_type='expense', is_deleted=False
    ).aggregate(s=Sum('amount'))['s'] or 0
    wd = _s(record_type='withdrawal')
    return Decimal(str(inc)) - Decimal(str(exp)) - Decimal(str(wd)) + cut_amt


def serialize_finance_page(user, period='month', date_from=None, date_to=None, ym=None):
    from client_erp.models import ClientFinanceRecord, ClientDebt, ClientOrder
    from django.db.models import Sum, Q
    from client_erp.services.periods import get_period_bounds
    from client_erp.services.scope import cutover_bounds as _cutover_fn

    _cutover_date, _cutover_amt = _cutover_fn(user)

    # ── ARXIVDAN JAVOB (2026-08-12, TZ-Moliya-Tarix-Arxiv-Avgust-Boshlanish.md) ──
    # Balans-kesim o'rnatilgan akkauntda (hozircha faqat bigone_cl2) kesim
    # sanasidan OLDINGI oy to'g'ridan-to'g'ri so'ralsa — LIVE qayta
    # hisoblanmaydi, `ClientFinanceMonthArchive`dagi muzlatilgan natija
    # qaytariladi (hech qachon o'zgarmaydi, hatto formula tuzatilsa ham).
    if ym and _cutover_date and ym < _cutover_date.strftime('%Y-%m'):
        from client_erp.models import ClientFinanceMonthArchive
        _arch = ClientFinanceMonthArchive.objects.filter(owner=user, ym=ym).first()
        if _arch:
            return _arch.finance_snapshot
        # Arxiv hali yaratilmagan (bo'lmasligi kerak, lekin himoya sifatida) —
        # frontend'ni buzmaslik uchun pastga tushib LIVE hisoblaymiz, arxiv
        # yaratilgach bu shart avtomatik ustunlik oladi.

    # Bekor qilingan buyurtma yozuvlari istisno. DIQQAT: o'chirilgan (is_deleted)
    # zakazni BU YERDA (moliya-sahifa/BALANS) istisno QILMAYMIZ — balans = HAQIQIY
    # kassadagi pul (kirim − chiqim − yechim), pul fizik harakat qilgan. O'chirilgan
    # zakaz foydasi ko'pincha allaqachon YECHILGAN (withdrawal order=None) — uni
    # income'dan olib tashlasak "arvoh" manfiy balans chiqadi. O'chirilgan-zakaz
    # istisnosi FAQAT dashboard/analitika KPI'da (foyda ko'rsatkichi) qo'llanadi.
    _not_cancelled = ~Q(order__status='cancelled')

    # Davr chegaralari — Analytics bilan BIR XIL yagona hisoblagich
    # (client_erp/services/periods.py). FAQAT o'qish uchun filtr —
    # yozish/ruxsat mantig'iga tegilmaydi. ym='YYYY-MM' — aniq oy.
    start, end, prev_start, prev_end = get_period_bounds(period, date_from, date_to, ym)
    # ── BALANS-KESIM: davr bilan kesim munosabati (2026-08-12) ──────────────
    # Ikki holat bor:
    # A) Davr kesimni KESIB O'TADI (masalan "Yil" — yanvardan bugungacha):
    #    boshini kesim sanasidan oldinga o'tkazmaymiz, aks holda yanvar-iyul
    #    oqimi HAM `cutover_amt` ichida (bir marta), HAM davr yig'indisida
    #    (yana bir marta) — ikki marta hisoblanib, yopilish qoldig'i shishardi.
    # B) Davr BUTUNLAY kesimdan OLDIN (masalan "O'tgan oy" — hozir avgust
    #    bo'lsa bu iyul degani): (A) yechimi bunda TESKARI oraliq hosil qilardi
    #    (boshi=avgust, oxiri=iyul — bo'sh/noto'g'ri natija, 2026-08-12 xato
    #    sifatida topildi). Bunda arxivdan (agar bor bo'lsa, `ym=` so'ralganda
    #    ishlatiladigan XUDDI SHU arxiv) javob beramiz — topilmasa kesimni
    #    UMUMAN qo'llamaymiz (davr allaqachon kesimdan oldin, ikki marta
    #    hisoblanish xavfi yo'q, asl sanalar bilan hisoblash xavfsiz).
    if _cutover_date and end and end < _cutover_date:
        from client_erp.models import ClientFinanceMonthArchive
        _arch2 = ClientFinanceMonthArchive.objects.filter(owner=user, ym=end.strftime('%Y-%m')).first()
        if _arch2:
            return _arch2.finance_snapshot
    elif _cutover_date and start and start < _cutover_date:
        start = _cutover_date
    elif _cutover_date and start is None:
        # C) "Hammasi" (period='all', chegarasiz) — kesim faol akkauntda ENDI
        # "hammasi" ham avgustdan boshlab degani (2026-08-13, user aniq
        # talab qildi: eski oylar HECH QAYERDA, "Hammasi"da ham chiqmasin).
        from django.utils import timezone as _tz
        start = _cutover_date
        end = _tz.localdate()
    period_q = Q(date__gte=start, date__lte=end) if start else Q()

    # ── H8 (2026-08-03): «ARVOH PUL» TUZATILDI ────────────────────────────
    # ILGARI pending Kirim + Balans + Kassa(opening/closing)ga qo'shilardi —
    # `services/scope.py` sarlavhasidagi O'Z QAT'IY QOIDASI buzilardi
    # ("❌ ISHLATILMAYDI: Kassa bloki / Balans / Kirim-chiqim jami").
    # Natija: bir zakaz puli EGASI kassasida ham, A'ZO balansida ham ko'rinardi
    # (audit: DOCS/TZ-Shartnoma-Foyda-Jamoa-Moliya.md §0.1).
    #
    # ENDI: pending fizik-pul ko'rsatkichlariga TEGMAYDI — `pending_profit`
    # alohida maydonida chiqadi (UI: "💰 Kutilayotgan foyda" kartasi).
    # Foyda ko'rsatkichlarida (Sof foyda / Ustalar foydasi) esa ISHLATILAVERADI
    # — scope.py qoidasi aynan shunga ruxsat beradi.
    from client_erp.services.scope import profit_claim_pending as _claim_pending_fn
    _pending_list = _claim_pending_fn(user)  # [(order_id, pending:Decimal, delivered_date|None)]
    _pending_all = sum((p[1] for p in _pending_list), Decimal('0'))
    _pending_period = sum(
        (p[1] for p in _pending_list if start is None or (p[2] and start <= p[2] <= end)),
        Decimal('0'),
    )

    # ⚠️ 2026-08-26 TUZATILDI: cheklov 100 edi, lekin «Kirim»/«Chiqim»/
    # «Kirim-chiqimdan ayrilgan summa» katakchalari (rc-finance.js) shu
    # RO'YXATdan aralash (kirim+chiqim+yechim) 100 tasini olib, o'sha
    # 100 ta ichidan o'z turini filtrlaydi — natijada eski yozuvlar
    # (masalan ko'p kirim bo'lgan oyda) ro'yxatdan tushib qolib, «tarix»
    # ko'rinishi asosiy kartadagi to'liq yig'indidan KAM chiqardi (jonli
    # holatda: 213 017 000 o'rniga 116 167 000 — foydalanuvchi topdi).
    # Asosiy summalar (`stats.total_income` va h.k.) bunga bog'liq emas —
    # ular alohida to'liq `Sum()` bilan hisoblanadi, shuning uchun TO'G'RI
    # edi; faqat ro'yxat ko'rinishi noto'liq edi. Cheklov 500 ga oshirildi
    # (bitta oyda 500 dan ortiq yozuv amalda uchramaydi; agar uchrasa ham
    # asosiy summalar baribir to'g'ri qoladi, faqat ro'yxat qisqaradi).
    records = ClientFinanceRecord.objects.filter(
        _not_cancelled, period_q, owner=user, is_deleted=False,
    ).select_related('order', 'customer', 'stage').order_by('-date', '-created_at')[:500]

    debts = ClientDebt.objects.filter(
        owner=user, status__in=['active', 'partial'],
    ).select_related('customer').order_by('-created_at')

    income = ClientFinanceRecord.objects.filter(
        _not_cancelled, period_q, owner=user, record_type='income', is_deleted=False,
    ).aggregate(s=Sum('amount'))['s'] or 0
    # H8: `income` — FAQAT real ClientFinanceRecord. pending QO'SHILMAYDI.

    expense = ClientFinanceRecord.objects.filter(
        _not_cancelled, period_q, owner=user, record_type='expense', is_deleted=False,
    ).aggregate(s=Sum('amount'))['s'] or 0

    withdrawal = ClientFinanceRecord.objects.filter(
        period_q, owner=user, record_type='withdrawal', is_deleted=False,
    ).aggregate(s=Sum('amount'))['s'] or 0

    # ── KPI (stats) uchun ALOHIDA hisob — O'CHIRILGAN zakaz istisno ──────────
    # TZ-Moliya-Analitika-Audit-2026-07-30.md §1: KPI (Kirim/Chiqim/Foyda)
    # o'chirilgan zakazni istisno qilsin, BALANS va KASSA bloki esa TEGILMASIN
    # (ular fizik pul — ular uchun yuqoridagi `income`/`expense` ishlatiladi).
    # O'sha tuzatish 2026-07-30 da `serialize_dashboard` va `serialize_analytics`
    # ga qo'llangan, lekin BU FUNKSIYAGA qo'llanmay qolgan edi — natijada Moliya
    # sahifasi boshqa ikki sahifadan farq qilardi (2026-08-07 audit, bigone_cl2:
    # o'chirilgan zakazlardan 123 600 000 kirim / 99 798 300 chiqim KPI'ni
    # shishirardi). Faqat `stats` o'zgardi; kassa/balans/oylik grafik tegilmadi.
    # `order__isnull=True` SHART: zakazga bog'lanmagan yozuv (masalan yechim
    # order=None) NULL-join sababli jimgina tushib qolmasligi kerak.
    _kpi_live = Q(order__isnull=True) | Q(order__is_deleted=False)

    # ── 2026-09-09 — BUYURTMA-HOLAT ASOSLI KIRIM/CHIQIM (uchinchi va yakuniy
    # tuzatish, foydalanuvchi qo'lda ro'yxat tuzib TASDIQLAGAN) ───────────
    # Yo'l bosib o'tilgan xato variantlar: (1) buyurtma-yakunlanish-sanasi
    # (2026-09-04) — zaklad kelsa ham "Topshirildi"gacha KPI o'zgarmasdi;
    # (2) sof `record.date` (2026-09-09, ertalab) — buyurtma hali ochiq
    # bo'lsa ham eski oylardagi xarajat/kirim aralashib, "Shu oy" raqami
    # umuman tanib bo'lmas darajada boshqacha (masalan manfiy) chiqardi.
    #
    # YAKUNIY qoida (foydalanuvchi qo'lda 17+ ta buyurtmani tekshirib
    # tasdiqlagan, 2026-09-09 kechqurun):
    #   - Buyurtma SHU DAVRDA "Topshirildi"/"Tayyor" bo'lgan bo'lsa —
    #     Kirimga UNING TO'LIQ SHARTNOMA SUMMASI qo'shiladi (chunki
    #     tugagach qolgan pul ham to'lanib, jami shartnomaga tenglashadi).
    #   - Buyurtma HALI OCHIQ (boshqa har qanday status) bo'lsa — DAVRDAN
    #     QAT'I NAZAR (qachon boshlanganidan qat'i nazar) — Kirimga uning
    #     HOZIRGACHA HAQIQATDA kelgan puli (zaklad) qo'shiladi. Bu — "hali
    #     tugamagan ish ham kuzatilib turilishi kerak" mantiqi.
    #   - Buyurtma BOSHQA davrda (masalan o'tgan oy) "Topshirildi" bo'lgan
    #     bo'lsa — bu davrga UMUMAN QO'SHILMAYDI (allaqachon o'sha davrga
    #     to'liq hisoblangan, takrorlanmasin).
    #   - Chiqim — har doim buyurtmaning HOZIRGACHA (butun tarix) real
    #     xarajati (davr buyurtma tanlovidan kelib chiqadi, o'zining sanasi
    #     bo'yicha emas).
    #   - Buyurtmasiz (umumiy) yozuvlar — o'zgarishsiz, `record.date`/
    #     `period_q` bo'yicha (bu holatda "buyurtma holati" tushunchasi yo'q).
    from django.db.models.functions import Coalesce as _KpiOrderCoal
    _kpi_orders_qs = ClientOrder.objects.filter(owner=user, is_deleted=False).exclude(status='cancelled')
    _kpi_orders_qs = _kpi_orders_qs.annotate(_pf_dt=_KpiOrderCoal('delivered_at', 'ready_at'))
    if start:
        _kpi_orders_qs = _kpi_orders_qs.filter(
            Q(status__in=['delivered', 'ready'], _pf_dt__date__gte=start, _pf_dt__date__lte=end)
            | ~Q(status__in=['delivered', 'ready'])
        )
    _kpi_orders_qs = _kpi_orders_qs.annotate(
        _o_inc=Sum('finance_records__amount', filter=Q(
            finance_records__record_type='income', finance_records__is_deleted=False,
            finance_records__is_reversal=False)),
        _o_exp=Sum('finance_records__amount', filter=Q(
            finance_records__record_type='expense', finance_records__is_deleted=False)),
    )

    income_kpi = 0.0
    expense_kpi = 0.0
    for _o in _kpi_orders_qs:
        _o_income_actual = float(_o._o_inc or 0)
        if _o.status in ('delivered', 'ready') and _o.uses_contract_profit:
            income_kpi += float(_o.contract_amount or 0)
        else:
            income_kpi += _o_income_actual
        expense_kpi += float(_o._o_exp or 0)

    _none_q = Q(order__isnull=True, owner=user)
    income_kpi += ClientFinanceRecord.objects.filter(
        _not_cancelled, _none_q, period_q, record_type='income', is_deleted=False,
    ).aggregate(s=Sum('amount'))['s'] or 0
    expense_kpi += ClientFinanceRecord.objects.filter(
        _not_cancelled, _none_q, period_q, record_type='expense', is_deleted=False,
    ).aggregate(s=Sum('amount'))['s'] or 0

    recipients = list(
        ClientFinanceRecord.objects.filter(
            owner=user, record_type='withdrawal', is_deleted=False,
        ).exclude(recipient_name='').order_by('recipient_name').values_list('recipient_name', flat=True).distinct()
    )

    # Balans — HAR DOIM barcha vaqt uchun (period_q qo'llanmaydi). "Balans"
    # joriy kassadagi pul qoldig'i (nuqta-vaqt), davr oqimi emas — Pul yechish
    # (profit-split) modali shu qiymatga suyanadi, davr filtridan mustaqil
    # bo'lishi SHART.
    # ── BALANS-KESIM (2026-08-12) ── `_cutover_date` bo'lsa: "barcha vaqt"
    # endi kesim sanasidan boshlanadi, va kesimdan OLDINGI pul
    # `_cutover_amt` sifatida quyida `balance`ga qo'shiladi (§ pastda).
    _balcut_q = Q(date__gte=_cutover_date) if _cutover_date else Q()
    all_income = ClientFinanceRecord.objects.filter(
        _not_cancelled, _balcut_q, owner=user, record_type='income', is_deleted=False,
    ).aggregate(s=Sum('amount'))['s'] or 0
    # H8: Balans = FAQAT fizik pul. pending QO'SHILMAYDI (aks holda «arvoh pul»:
    # bir summa ikki kishining balansida ko'rinadi). Bundan tashqari ilgari UI
    # (balans) va `handle_finance_withdrawal` (yechish limiti) turlicha
    # hisoblardi → foydalanuvchi balansini ko'rib turib "Balans yetarli emas"
    # xatosini olardi. Endi ikkalasi bir xil.

    all_expense = ClientFinanceRecord.objects.filter(
        _not_cancelled, _balcut_q, owner=user, record_type='expense', is_deleted=False,
    ).aggregate(s=Sum('amount'))['s'] or 0

    all_withdrawal = ClientFinanceRecord.objects.filter(
        _balcut_q, owner=user, record_type='withdrawal', is_deleted=False,
    ).aggregate(s=Sum('amount'))['s'] or 0

    # Oylik yig'indi — FAQAT O'QISH (oy bo'yicha kirim/chiqim/withdrawal Sum).
    # Hech narsa yozilmaydi/o'chmaydi — stats bilan bir xil manbadan aggregate.
    from django.db.models.functions import TruncMonth
    monthly = {}
    for row in ClientFinanceRecord.objects.filter(
        _not_cancelled, _balcut_q, owner=user, is_deleted=False,
        record_type__in=['income', 'expense', 'withdrawal'],
    ).annotate(_m=TruncMonth('date')).values('_m', 'record_type').annotate(s=Sum('amount')).order_by():
        if not row['_m']:
            continue
        key = row['_m'].strftime('%Y-%m')
        if key not in monthly:
            monthly[key] = {'income': '0', 'expense': '0', 'withdrawal': '0'}
        monthly[key][row['record_type']] = _dec(row['s'])

    # Oy filtri dropdown uchun: {'2026-07': yozuvlar soni} (barcha vaqt, davr filtriga bog'liq emas)
    # ── (2026-08-12) kesim o'rnatilgan akkauntda avgustdan oldingi oylar
    # dropdown'dan OLIB TASHLANADI — ular arxivda, alohida so'ralganda §
    # yuqoridagi arxiv-blok orqali qaytariladi.
    from django.db.models import Count as _Count
    month_counts = {}
    for row in ClientFinanceRecord.objects.filter(
        _not_cancelled, _balcut_q, owner=user, is_deleted=False,
    ).annotate(_m=TruncMonth('date')).values('_m').annotate(n=_Count('id')).order_by('-_m'):
        if row['_m']:
            month_counts[row['_m'].strftime('%Y-%m')] = row['n']

    # ═══ OYLIK MODEL: Kassa (qoldiq o'tadi) + Sof foyda (topshirilgan oy) + Band pul (WIP) ═══
    # A. KASSA — oy boshi qoldiq (davr boshigacha barcha pul) → +kirim −chiqim −yechim → oy oxiri
    def _cash_before(dt):
        if not dt:
            return 0
        # ── BALANS-KESIM (2026-08-12) ── kesim sanasidan oldingi/teng bo'lsa
        # qulflangan boshlang'ich summani qaytaradi, xom yozuvlarga umuman
        # so'rov yubormaydi (avgustdan oldingi oylar arxivda, o'zgarmaydi).
        if _cutover_date:
            if dt <= _cutover_date:
                return _cutover_amt
            bi = ClientFinanceRecord.objects.filter(_not_cancelled, owner=user, record_type='income', is_deleted=False, date__gte=_cutover_date, date__lt=dt).aggregate(s=Sum('amount'))['s'] or 0
            be = ClientFinanceRecord.objects.filter(_not_cancelled, owner=user, record_type='expense', is_deleted=False, date__gte=_cutover_date, date__lt=dt).aggregate(s=Sum('amount'))['s'] or 0
            bw = ClientFinanceRecord.objects.filter(owner=user, record_type='withdrawal', is_deleted=False, date__gte=_cutover_date, date__lt=dt).aggregate(s=Sum('amount'))['s'] or 0
            return _cutover_amt + Decimal(str(bi)) - Decimal(str(be)) - Decimal(str(bw))
        bi = ClientFinanceRecord.objects.filter(_not_cancelled, owner=user, record_type='income', is_deleted=False, date__lt=dt).aggregate(s=Sum('amount'))['s'] or 0
        be = ClientFinanceRecord.objects.filter(_not_cancelled, owner=user, record_type='expense', is_deleted=False, date__lt=dt).aggregate(s=Sum('amount'))['s'] or 0
        bw = ClientFinanceRecord.objects.filter(owner=user, record_type='withdrawal', is_deleted=False, date__lt=dt).aggregate(s=Sum('amount'))['s'] or 0
        # H8: pending QO'SHILMAYDI — Kassa bloki fizik pul (scope.py qoidasi).
        # Ilgari `+ pend_before` bor edi: oy boshi qoldig'i ham, undan kelib
        # chiqadigan `closing` ham soxta shishardi.
        return Decimal(str(bi)) - Decimal(str(be)) - Decimal(str(bw))
    opening = _cash_before(start)
    closing = opening + income - expense - withdrawal

    # B. SOF FOYDA — davr ichida TOPSHIRILGAN (delivered_at) buyurtmalar: kirim − barcha xarajat
    # O'z zakazlari + UNGA ULASHILGANLAR (TZ-Ulashilgan-Zakaz-Hisobot.md §3.2).
    # DIQQAT: yuqoridagi KASSA bloki va BALANS bunga TEGMAYDI — ular fizik pul,
    # ulashilgan zakaz puli esa boshqa odamning kassasida.
    from client_erp.services.scope import shared_order_ids as _shared_ids_fn, profit_claim_map as _claim_fn
    _sh_ids = _shared_ids_fn(user)
    # BETA (faqat artom_cl/ibrohim_cl, services/scope.py:TEAM_FINANCE_BETA_USER_IDS):
    # egasi bo'lmagan, lekin nom-asosli ulush (ClientOrderProfitShare) + aniq ruxsat
    # (ClientOrderPermission) bilan "claim" qilingan zakazlar. Boshqa userlar uchun {}.
    _claim_map = _claim_fn(user)
    _all_shared_ids = _sh_ids | set(_claim_map.keys()) if (_sh_ids or _claim_map) else set()
    _sof_q = Q(owner=user) | Q(pk__in=_all_shared_ids) if _all_shared_ids else Q(owner=user)
    # ── E5 (2026-08-17): `ready` HAM «Sof foyda»ga kiradi (yuqoridagi izoh) ──
    # ── 2026-09-04 (TZ-Moliya-Buyurtma-Yakunlash-Sanasi): `created_at`
    # (BOSHLANGAN sana) fallback OLIB TASHLANDI — foydalanuvchi talabi: yakunlanmagan
    # buyurtma hech qaysi oy hisobiga tushmasin ("oydan oyga o'tkazilib ketaversin").
    # `ready_at`/`delivered_at` ikkalasi ham bo'sh bo'lgan holat amalda deyarli
    # bo'lmaydi (status filtri delivered/ready, ikkalasi ham consumers.py orqali
    # avto-to'ladi) — lekin bo'lsa ham, `_pf_dt` NULL bo'lib davr filtridan chiqib
    # ketadi (created_at'ga tushmaydi) — bu aynan xohlangan xatti-harakat.
    from django.db.models.functions import Coalesce as _Coal2
    dq = ClientOrder.objects.filter(_sof_q, status__in=['delivered', 'ready'], is_deleted=False)
    dq = dq.annotate(_pf_dt=_Coal2('delivered_at', 'ready_at'))
    if start:
        dq = dq.filter(_pf_dt__date__gte=start, _pf_dt__date__lte=end)
    dq = dq.select_related('customer').annotate(
        # `is_reversal=False` — «Sof foyda» kartasidagi ↓ raqami MIJOZ pulini
        # ko'rsatsin. Ilgari bekor qilingan ulush qaytishi ham qo'shilib,
        # #319 da ↓69 999 628 chiqardi (haqiqiy tushum 50 000 000).
        # Foydaga ta'sir qilmaydi — u `contract_profit`dan olinadi.
        _inc=Sum('finance_records__amount', filter=Q(finance_records__record_type='income', finance_records__is_deleted=False, finance_records__is_reversal=False)),
        _exp=Sum('finance_records__amount', filter=Q(finance_records__record_type='expense', finance_records__is_deleted=False)),
    ).order_by('-_pf_dt')
    sof_orders = []
    sof_total = 0
    sof_contract = 0       # jami shartnoma summasi (foyda foizini hisoblash uchun)
    sof_extra = 0          # «Qo'shimcha daromad» — shartnomadan ortiq kelgan pul
    for o in dq:
        _i = o._inc or 0
        _e = o._exp or 0
        # ── SHARTNOMA-ASOSLI FOYDA (2026-08-03) ──
        # Yagona manba: `ClientOrder.contract_profit` (models/order.py).
        # Bayroq o'chiq yoki shartnoma yo'q bo'lsa — o'zi eski formulaga tushadi
        # (grandfathering), shuning uchun bu yerda shart yozish shart emas.
        _uses = o.uses_contract_profit
        _full_p = o.contract_profit
        _extra = o.extra_income
        # Nom-asosli claim bo'lsa — TO'LIQ emas, faqat ULUSH FOIZIGA masshtablangan
        # (BETA; team-based ulashilgan zakaz — mavjud xatti-harakat, o'zgarmadi).
        _pct = _claim_map.get(o.id)
        _p = (Decimal(str(_full_p)) * Decimal(str(_pct)) / 100) if _pct is not None else _full_p
        sof_total += _p
        # Ulashilgan zakazda shartnoma ham ulushga masshtablanadi —
        # aks holda foiz sun'iy pasayadi (foyda ulushdan, shartnoma to'liq).
        _ca = Decimal(str(o.contract_amount or 0))
        sof_contract += (_ca * Decimal(str(_pct)) / 100) if _pct is not None else _ca
        sof_extra += _extra
        sof_orders.append({
            'id': o.id, 'title': o.title,
            'customer': o.customer.full_name if o.customer_id else '',
            'income': _dec(_i), 'expense': _dec(_e), 'profit': _dec(_p),
            'delivered_at': o.delivered_at.isoformat() if o.delivered_at else None,
            'shared_percent': _dec(_pct) if _pct is not None else None,
            # UI belgisi: 📄 shartnoma bo'yicha / ⚠️ eski usul (shartnomasiz)
            'by_contract': bool(_uses),
            'contract_amount': _dec(o.contract_amount) if _uses else None,
            'extra_income': _dec(_extra),
        })

    # C. BAND PUL (WIP) — hali topshirilmagan/bekor bo'lmagan buyurtmalarga ketgan xarajat
    wip = ClientFinanceRecord.objects.filter(
        owner=user, record_type='expense', is_deleted=False,
    ).exclude(order__status__in=['delivered', 'cancelled']).exclude(order__isnull=True).aggregate(s=Sum('amount'))['s'] or 0

    # ── «SHARTNOMALAR KESIMI» (2026-08-04) ────────────────────────────────
    # Bayroq o'chiq bo'lsa kalit UMUMAN qo'shilmaydi — eski UI bir bayt ham
    # ortiqcha payload olmaydi va eski xatti-harakat 1:1 saqlanadi.
    from client_erp.services.scope import contract_slice_enabled as _slice_on
    _contracts = _contract_slices(
        user, period_q, _not_cancelled,
        # Qayta hisoblanmasin — yuqorida allaqachon olingan (10 so'rov tejaladi)
        shared_ids=_sh_ids, claim_map=_claim_map, pending_list=_pending_list,
    ) if _slice_on(user) else None

    # ── «MENGA QOLDI» (2026-08-05, TZ-Foyda-Egaga-Qolgan-Ulush.md) ────────
    # Talab: foyda umumiy emas, EGAGA tegadigan qismi ko'rinsin.
    #
    # ⚠️ NEGA AKKAUNT DARAJASIDA (zakaz kesimida emas):
    # Jonli bazada o'lchandi — 37 ta yechimning 24 tasi (131 315 835 so'm,
    # 60%) HECH QAYSI ZAKAZGA BOG'LANMAGAN. `bigone_cl2` da esa 8 tasidan
    # BITTASI HAM bog'lanmagan. Sabab: usta oy oxirida umumiy foydani
    # sheriklariga bo'ladi, qaysi zakazdan ekanini ajratmaydi.
    # Shuning uchun zakaz kesimida hisoblasak — 60% holatda noto'g'ri
    # chiqardi. Akkaunt darajasida BARCHA yechim sanaladi → har doim to'g'ri.
    #
    # `withdrawal` — foydaning taqsimlanishi (ustaga ulush YOKI o'ziga).
    # Bekor qilingan taqsimot (`is_reversal`) ayiriladi.
    _wd_period = withdrawal          # yuqorida period_q bilan hisoblangan
    _rev_period = ClientFinanceRecord.objects.filter(
        _not_cancelled, period_q, owner=user, record_type='income',
        is_reversal=True, is_deleted=False,
    ).aggregate(s=Sum('amount'))['s'] or 0
    _distributed = Decimal(str(_wd_period)) - Decimal(str(_rev_period))
    _owner_left = Decimal(str(sof_total)) - _distributed
    _sof_contract = sof_contract

    return {
        'months': month_counts,
        'period': period,
        'ym': ym,
        'stats': {
            # KPI — o'chirilgan zakazsiz (dashboard/analitika bilan bir xil).
            # Kassa/Balans esa `income`/`expense`/`all_*` — fizik pul, tegilmagan.
            'total_income': _dec(income_kpi),
            'total_expense': _dec(expense_kpi),
            'total_withdrawal': _dec(withdrawal),
            'profit': _dec(income_kpi - expense_kpi),
            'balance': _dec(Decimal(str(all_income)) - Decimal(str(all_expense)) - Decimal(str(all_withdrawal)) + _cutover_amt),
        },
        # H8: ulashilgan zakazlardan KUTILAYOTGAN (hali yechilmagan) ulush.
        # Kirim/Foyda/Balans/Kassaga QO'SHILMAYDI — alohida ko'rsatiladi.
        # `orders` — qaysi zakazdan qancha (UI tafsiloti uchun).
        'pending_profit': {
            'total': _dec(_pending_all),
            'period': _dec(_pending_period),
            'count': len(_pending_list),
            'orders': [
                {'order_id': p[0], 'amount': _dec(p[1]),
                 'delivered_at': p[2].isoformat() if p[2] else None}
                for p in _pending_list
            ],
        },
        'kassa': {
            'opening': _dec(opening),
            'income': _dec(income),
            'expense': _dec(expense),
            'withdrawal': _dec(withdrawal),
            'closing': _dec(closing),
        },
        'sof_foyda': {
            'total': _dec(sof_total),
            'count': len(sof_orders),
            # ── Egaga qolgan qism (TZ §3.1) ──
            # `distributed` — shu davrda taqsimlangan (bekor qilinganlarsiz)
            # `owner_left`  — sof_foyda − distributed. Manfiy bo'lishi MUMKIN
            #                 (oldingi oy foydasidan yechilgan bo'lsa) — bu
            #                 xato emas, UI izoh bilan ko'rsatadi.
            'distributed': _dec(_distributed),
            'owner_left': _dec(_owner_left),
            # ── FOYDA FOIZI (2026-08-06) ──────────────────────────────
            # «Foyda umumiy shartnomaning necha foiziga to'g'ri keladi?»
            # margin = sof foyda / jami shartnoma summasi × 100
            # Ya'ni: har 100 so'mlik ishdan qancha foyda qolgani.
            'contract_total': _dec(_sof_contract),
            'margin_pct': (round(float(sof_total) / float(_sof_contract) * 100, 1)
                           if float(_sof_contract) > 0 else None),
            'orders': sof_orders,
            # Shartnomadan ORTIQ kelgan pul — foydaga qo'shilmaydi, lekin
            # yo'qolmaydi ham (alohida satrda ko'rsatiladi).
            'extra_income': _dec(sof_extra),
        },
        'wip': _dec(wip),
        # Shartnoma kesimi — faqat bayroq yoqilgan akkauntlarda (None bo'lsa UI tab chizmaydi)
        'contracts': _contracts,
        # ── SHERIKSIZ / SHERIKLI bo'linmasi (2026-08-15, moliya TZ §8-S2) ──
        # Qo'lyozmadagi 1- va 2-blok: har guruh uchun
        #   jami shartnoma summasi − jami xarajat = foyda
        # Sherikli tomonda foyda ulushlarga ham bo'lib ko'rsatiladi.
        'partner_split': _partner_split(user, period_q, start, end),
        # ── DEBITOR / KREDITOR jamlanmasi (moliya TZ §F5, qo'lyozma 4-5 blok) ──
        # debitor  = mijozlar BIZGA qarzdor
        # kreditor = BIZ boshqaga qarzdormiz (ustalar qarzi, §F4)
        'creditor': _creditor_block(user),
        # ── ESLATMA: taqsimlanmagan foyda (2026-08-04, foydalanuvchi so'rovi) ──
        # Moliya sahifasi ochilganda tepada banner chiqadi: topshirilgan
        # buyurtmada foyda bor, lekin hali bo'lishilmagan. FAQAT ko'rsatadi —
        # pul harakatini avtomatlashtirmaydi.
        'undistributed_hint': _undistributed_hint(user),
        # ── H7 (2026-08-04): QABUL QILISH KUTILAYOTGAN ULUSHLAR ──────────────
        # Egasi pulni yechdi, lekin a'zo hali «Qabul qilaman» bosmagan.
        # A'zoning Moliya sahifasi tepasida karta bo'lib chiqadi.
        'pending_accept': _pending_accept(user),
        'monthly': monthly,
        'withdrawal_recipients': sorted(recipients),
        'last_profit_shares': _get_last_profit_shares(user),
        'expense_cats': expense_categories_for(user),
        'records': [serialize_transaction(r) for r in records],
        'debts': [{
            'id': d.pk,
            'customer': serialize_customer(d.customer) if d.customer else None,
            'original_amount': _dec(d.original_amount),
            'paid_amount': _dec(d.paid_amount),
            'remaining': _dec(d.remaining),
            'status': d.status,
            'due_date': d.due_date.isoformat() if d.due_date else None,
            'created_at': d.created_at.isoformat(),
        } for d in debts],
    }


# ── Analytics page ──

def serialize_analytics(user, period='month', date_from=None, date_to=None, ym=None):
    from client_erp.models import (
        ClientOrder, ClientCustomer, ClientFinanceRecord,
        ClientDebt, ClientOrderStage,
    )
    from django.utils import timezone
    from django.db.models import Sum, Count, Q
    from datetime import timedelta
    import calendar

    today = timezone.localdate()

    from client_erp.services.scope import cutover_bounds as _cutover_fn
    _cutover_date, _cutover_amt = _cutover_fn(user)

    # ── ARXIVDAN JAVOB (2026-08-12) ── serialize_finance_page bilan bir xil
    # qoida: kesim o'rnatilgan akkauntda kesimdan OLDINGI oy to'g'ridan-to'g'ri
    # so'ralsa — LIVE qayta hisoblanmaydi, arxivdagi muzlatilgan natija
    # qaytariladi.
    if ym and _cutover_date and ym < _cutover_date.strftime('%Y-%m'):
        from client_erp.models import ClientFinanceMonthArchive
        _arch = ClientFinanceMonthArchive.objects.filter(owner=user, ym=ym).first()
        if _arch:
            return _arch.analytics_snapshot

    from client_erp.services.periods import get_period_bounds
    start, end, prev_start, prev_end = get_period_bounds(period, date_from, date_to, ym)
    if start is None:
        # Analytics har doim cheklangan davrga ega (period='all' bu funksiyaga
        # yuborilmaydi) — himoya sifatida 'month'ga tushamiz.
        start, end, prev_start, prev_end = get_period_bounds('month')

    # ── BALANS-KESIM: davr bilan kesim munosabati (2026-08-12) ──────────────
    # `serialize_finance_page` bilan bir xil ikki holat (izoh o'sha yerda
    # to'liq). B-holat ("O'tgan oy" kabi butunlay kesimdan oldingi davr)
    # bunda ARXIVGA qaytarmaydi (Analytics arxivi allaqachon yuqorida faqat
    # `ym` bo'yicha tekshiriladi) — shunchaki kesimni qo'llamaymiz, aks holda
    # teskari (boshi>oxiri) oraliq bo'sh/noto'g'ri natija berardi.
    if _cutover_date and end < _cutover_date:
        pass
    elif _cutover_date and start < _cutover_date:
        start = _cutover_date

    # ── ADOLATLI FOIZ-SOLISHTIRISH (2026-08-12) ──────────────────────────
    # Joriy davr hali TUGAMAGAN bo'lsa ("Shu oy" — masalan 12 kunlik avgust),
    # oldingi davrni TO'LIQ oy bilan solishtirish (31 kunlik iyul) foizni
    # sun'iy ravishda katta manfiy ko'rsatardi (kam kun o'tgani uchun, biznes
    # yomonlashgani uchun EMAS — masalan "Buyurtmalar -47%"). Faqat FOIZ
    # hisoblash uchun oldingi davr ham xuddi shuncha kun bilan cheklanadi.
    # `prev_start`/`prev_end`ning o'zi (boshqa joyda ishlatilishi mumkin)
    # o'zgarmaydi — faqat pastdagi `_pct_prev_end` orqali cheklanadi.
    _pct_prev_end = prev_end
    if end == today and prev_start and prev_end:
        _clamped = prev_start + (end - start)
        if _clamped < prev_end:
            _pct_prev_end = _clamped

    # Dashboard bilan BIR XIL: bekor qilingan + o'chirilgan buyurtma yozuvlari
    # KPIga kirmaydi (aks holda analitika↔dashboard raqamlari farq qilardi).
    # ── O'z zakazlari + UNGA ULASHILGANLAR (TZ-Ulashilgan-Zakaz-Hisobot.md) ──
    # 2026-07-31: ilgari faqat `owner=user` edi — ulashilgan zakaz analitikada
    # umuman ko'rinmasdi. Endi foyda/zakaz KPI'ga qo'shiladi.
    # ❗ BALANS bunga TEGMAYDI — pastdagi `balance_cash` faqat O'Z kassasi.
    from client_erp.services.scope import shared_order_ids as _shared_ids_fn
    _sh_ids = _shared_ids_fn(user)
    _own_or_shared = (Q(owner=user) | Q(pk__in=_sh_ids)) if _sh_ids else Q(owner=user)
    _fin_scope = (Q(owner=user) | Q(order_id__in=_sh_ids)) if _sh_ids else Q(owner=user)

    finance = (ClientFinanceRecord.objects.filter(_fin_scope, is_deleted=False)
               .exclude(order__status='cancelled').exclude(order__is_deleted=True))
    orders = ClientOrder.objects.filter(_own_or_shared, is_deleted=False)

    cur_income = finance.filter(record_type='income', date__gte=start, date__lte=end).aggregate(s=Sum('amount'))['s'] or 0
    cur_expense = finance.filter(record_type='expense', date__gte=start, date__lte=end).aggregate(s=Sum('amount'))['s'] or 0
    prev_income = finance.filter(record_type='income', date__gte=prev_start, date__lte=_pct_prev_end).aggregate(s=Sum('amount'))['s'] or 0
    prev_expense = finance.filter(record_type='expense', date__gte=prev_start, date__lte=_pct_prev_end).aggregate(s=Sum('amount'))['s'] or 0

    # ── BALANS-KESIM (2026-08-12) ── "barcha vaqt" kesim o'rnatilgan
    # akkauntda kesim sanasidan boshlanadi (§ pastda `balance_cash`ga
    # `_cutover_amt` qo'shiladi).
    _anacut_q = Q(date__gte=_cutover_date) if _cutover_date else Q()
    all_income = finance.filter(_anacut_q, record_type='income').aggregate(s=Sum('amount'))['s'] or 0
    all_expense = finance.filter(_anacut_q, record_type='expense').aggregate(s=Sum('amount'))['s'] or 0
    all_withdrawal = finance.filter(_anacut_q, record_type='withdrawal').aggregate(s=Sum('amount'))['s'] or 0
    total_debt = ClientDebt.objects.filter(owner=user, status__in=['active', 'partial']).aggregate(s=Sum('remaining'))['s'] or 0

    # ── BALANS — FIZIK pul, moliya sahifasi bilan AYNAN bir xil formula ────────
    # 2026-07-30 TUZATISH: ilgari balans yuqoridagi `finance` querysetidan
    # (o'chirilgan zakazsiz) hisoblanardi → moliya sahifasida 31 374 000,
    # analitikada 8 329 300 chiqardi (farq 23 044 700 = o'chirilgan 6 zakazning
    # sof foydasi). Sabab: ularning KIRIMI chiqarilardi, lekin YECHILGAN puli
    # (`withdrawal`, order=None) chiqarilmasdi → "arvoh" kamayish.
    # Balans = kassadagi haqiqiy pul, shuning uchun o'chirilgan istisnosi
    # QO'LLANMAYDI (`serialize_finance_page` bilan bir xil, 2026-07-15 qoidasi).
    # Foyda KPI esa o'chirilgan/bekorni istisno qilishda DAVOM etadi.
    _cash = ClientFinanceRecord.objects.filter(
        _anacut_q, owner=user, is_deleted=False).exclude(order__status='cancelled')
    bal_income = _cash.filter(record_type='income').aggregate(s=Sum('amount'))['s'] or 0
    bal_expense = _cash.filter(record_type='expense').aggregate(s=Sum('amount'))['s'] or 0
    bal_withdrawal = ClientFinanceRecord.objects.filter(
        _anacut_q, owner=user, is_deleted=False, record_type='withdrawal',
    ).aggregate(s=Sum('amount'))['s'] or 0
    # Balans-kesim: `_cutover_amt` (0 bo'lsa ta'sirsiz) qulflangan
    # boshlang'ich summani qo'shadi — §serialize_finance_page bilan bir xil.
    balance_cash = Decimal(str(bal_income)) - Decimal(str(bal_expense)) - Decimal(str(bal_withdrawal)) + _cutover_amt

    cur_orders = orders.filter(created_at__date__gte=start, created_at__date__lte=end).count()
    prev_orders = orders.filter(created_at__date__gte=prev_start, created_at__date__lte=_pct_prev_end).count()
    # 2026-09-09 TUZATISH: `'completed'` degan status `ClientOrder.STATUS_CHOICES`da
    # UMUMAN YO'Q (faqat delivered/ready/...) — bu shart hech qachon mos kelmagan
    # (o'lik kod). Foydalanuvchi aniq tasdiqladi: "Bajarilgan" — FAQAT
    # "Topshirildi" (delivered) degani, "Tayyor" (ready, hali topshirilmagan)
    # BU YERGA KIRMAYDI — Moliya/Ustalar-foydasidagi "ready ham sof foydaga
    # kiradi" qoidasi FAQAT moliyaviy hisob uchun, "necha buyurtma bajarildi"
    # sanog'iga taalluqli emas.
    completed_orders = orders.filter(status='delivered').count()
    # 2026-07-30 TUZATISH: `updated_at` (tahrirlangan vaqt) bo'yicha sanalardi —
    # eski zakazga bugun izoh qo'shilsa u joriy oyning "bajarilgan"iga qo'shilib
    # ketardi (iyun: 22 o'rniga 19 bo'lishi kerak edi, 15.8% xato). Endi
    # TOPSHIRILGAN sana bo'yicha — `delivered_at` bo'sh bo'lsa (eski yozuvlar)
    # `updated_at`.
    from django.db.models.functions import Coalesce as _Coalesce
    cur_completed = (orders.filter(status='delivered')
                     .annotate(_done=_Coalesce('delivered_at', 'updated_at'))
                     .filter(_done__date__gte=start, _done__date__lte=end).count())

    status_dist = list(
        orders.filter(created_at__date__gte=start, created_at__date__lte=end)
        .values('status').annotate(cnt=Count('id')).order_by('status')
    )

    if period == 'day':
        chart_labels = [end.strftime('%d.%m')]
        inc = finance.filter(record_type='income', date=end).aggregate(s=Sum('amount'))['s'] or 0
        exp = finance.filter(record_type='expense', date=end).aggregate(s=Sum('amount'))['s'] or 0
        chart_income = [int(inc)]
        chart_expense = [int(exp)]
    elif period == 'week':
        chart_labels = []
        chart_income = []
        chart_expense = []
        for i in range(7):
            d = start + timedelta(days=i)
            chart_labels.append(d.strftime('%d.%m'))
            inc = finance.filter(record_type='income', date=d).aggregate(s=Sum('amount'))['s'] or 0
            exp = finance.filter(record_type='expense', date=d).aggregate(s=Sum('amount'))['s'] or 0
            chart_income.append(int(inc))
            chart_expense.append(int(exp))
    elif period == 'year':
        chart_labels = []
        chart_income = []
        chart_expense = []
        months_uz = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek']
        for m in range(1, 13):
            chart_labels.append(months_uz[m - 1])
            # 2026-07-30: `today` → `start` (tanlangan yil bo'yicha, joriy yil emas)
            m_start = start.replace(month=m, day=1)
            if m == 12:
                m_end = start.replace(year=start.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                m_end = start.replace(month=m + 1, day=1) - timedelta(days=1)
            inc = finance.filter(record_type='income', date__gte=m_start, date__lte=m_end).aggregate(s=Sum('amount'))['s'] or 0
            exp = finance.filter(record_type='expense', date__gte=m_start, date__lte=m_end).aggregate(s=Sum('amount'))['s'] or 0
            chart_income.append(int(inc))
            chart_expense.append(int(exp))
    elif period == 'custom':
        chart_labels = []
        chart_income = []
        chart_expense = []
        span_days = (end - start).days
        if span_days <= 31:
            # Qisqa oraliq — kunlik nuqtalar (haftalik grafik uslubi kabi)
            for i in range(span_days + 1):
                d = start + timedelta(days=i)
                chart_labels.append(d.strftime('%d.%m'))
                inc = finance.filter(record_type='income', date=d).aggregate(s=Sum('amount'))['s'] or 0
                exp = finance.filter(record_type='expense', date=d).aggregate(s=Sum('amount'))['s'] or 0
                chart_income.append(int(inc))
                chart_expense.append(int(exp))
        else:
            # Uzun oraliq — oylik nuqtalar (yillik grafik uslubi kabi), faqat
            # start..end oralig'ida qamragan oylar bo'yicha
            months_uz = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek']
            m_cursor = start.replace(day=1)
            while m_cursor <= end:
                chart_labels.append(months_uz[m_cursor.month - 1])
                if m_cursor.month == 12:
                    m_end = m_cursor.replace(year=m_cursor.year + 1, month=1, day=1) - timedelta(days=1)
                else:
                    m_end = m_cursor.replace(month=m_cursor.month + 1, day=1) - timedelta(days=1)
                m_start = max(m_cursor, start)
                m_end = min(m_end, end)
                inc = finance.filter(record_type='income', date__gte=m_start, date__lte=m_end).aggregate(s=Sum('amount'))['s'] or 0
                exp = finance.filter(record_type='expense', date__gte=m_start, date__lte=m_end).aggregate(s=Sum('amount'))['s'] or 0
                chart_income.append(int(inc))
                chart_expense.append(int(exp))
                if m_cursor.month == 12:
                    m_cursor = m_cursor.replace(year=m_cursor.year + 1, month=1)
                else:
                    m_cursor = m_cursor.replace(month=m_cursor.month + 1)
    else:
        chart_labels = []
        chart_income = []
        chart_expense = []
        # 2026-07-30 TUZATISH: ilgari `today` ishlatilardi — o'tgan oy tanlansa ham
        # grafik JORIY oyni chizardi (may tanlansa iyul ma'lumoti chiqardi, 234% xato).
        # Endi tanlangan davr boshi (`start`) bo'yicha.
        days_in_month = calendar.monthrange(start.year, start.month)[1]
        for day in range(1, days_in_month + 1):
            d = start.replace(day=day)
            chart_labels.append(str(day))
            inc = finance.filter(record_type='income', date=d).aggregate(s=Sum('amount'))['s'] or 0
            exp = finance.filter(record_type='expense', date=d).aggregate(s=Sum('amount'))['s'] or 0
            chart_income.append(int(inc))
            chart_expense.append(int(exp))

    cat_data = list(
        finance.filter(record_type='expense', date__gte=start, date__lte=end)
        .exclude(category='')
        .values('category')
        .annotate(total=Sum('amount'))
        .order_by('-total')
    )

    payment_data_income = list(
        finance.filter(record_type='income', date__gte=start, date__lte=end)
        .values('payment_method')
        .annotate(total=Sum('amount'))
        .order_by('-total')
    )

    payment_data_expense = list(
        finance.filter(record_type='expense', date__gte=start, date__lte=end)
        .values('payment_method')
        .annotate(total=Sum('amount'))
        .order_by('-total')
    )

    top_customers = list(
        finance.filter(record_type='income', date__gte=start, date__lte=end)
        .exclude(customer__isnull=True)
        .values('customer__id', 'customer__full_name')
        .annotate(total=Sum('amount'))
        .order_by('-total')[:5]
    )

    stages_perf = list(
        ClientOrderStage.objects.filter(
            order__owner=user, status='completed',
            completed_at__date__gte=start, completed_at__date__lte=end,
        )
        .values('title')
        .annotate(cnt=Count('id'))
        .order_by('-cnt')[:8]
    )

    def _pct_change(cur, prev):
        if prev == 0:
            return 100 if cur > 0 else 0
        return round((cur - prev) / prev * 100)

    # ── Batafsil buyurtma ro'yxati (AI uchun) ──
    from client_erp.models import ClientOrderPermission
    from django.db.models import Avg, F, ExpressionWrapper, DurationField

    active_orders_qs = orders.exclude(
        status__in=['cancelled'],
    ).select_related('customer').prefetch_related(
        'stages', 'permissions__user', 'finance_records',
    ).order_by('-created_at')[:30]

    orders_detail = []
    for o in active_orders_qs:
        stages_list = list(o.stages.all().order_by('sort_order'))
        total_stages = len(stages_list)
        done_stages = sum(1 for s in stages_list if s.status == 'completed')
        active_stage = next((s for s in stages_list if s.status == 'active'), None)
        blocked_stages = [s for s in stages_list if s.status == 'pending']

        o_income = sum(
            int(fr.amount) for fr in o.finance_records.all()
            if fr.record_type == 'income' and not fr.is_deleted
        )
        o_expense = sum(
            int(fr.amount) for fr in o.finance_records.all()
            if fr.record_type == 'expense' and not fr.is_deleted
        )

        perms = list(o.permissions.all())
        shared_with = [
            {'name': p.user.full_name, 'role': p.role}
            for p in perms
        ]

        days_since = (timezone.now() - o.created_at).days

        orders_detail.append({
            'id': o.pk,
            'title': o.title,
            'status': o.status,
            'customer': o.customer.full_name if o.customer else None,
            'progress': o.overall_progress,
            'total_stages': total_stages,
            'done_stages': done_stages,
            'active_stage': active_stage.title if active_stage else None,
            'blocked_count': len(blocked_stages),
            'income': o_income,
            'expense': o_expense,
            # SHARTNOMA-ASOSLI (2026-08-03) — bu ro'yxat AI tahliliga uzatiladi
            # (services/ai_analysis.py). Eski formula qolsa, AI promptida bir
            # necha xil foyda ko'rsatkichi to'qnashib, «anomaliya bor» degan
            # soxta xulosa chiqarardi (audit: TZ §0.3-Y3).
            'profit': int(o.contract_profit or 0),
            'days_since_created': days_since,
            'deadline': o.deadline.isoformat() if o.deadline else None,
            'shared_with': shared_with,
            'has_mc': bool(o.mebelcity_order_id),
        })

    # ── Qarz batafsil ──
    debts_detail = []
    debts_qs = ClientDebt.objects.filter(
        owner=user, status__in=['active', 'partial'],
    ).select_related('customer', 'order')
    for d in debts_qs:
        debts_detail.append({
            'customer': d.customer.full_name if d.customer else 'Nomalum',
            'order': d.order.title if d.order else None,
            'original': int(d.original_amount),
            'paid': int(d.paid_amount),
            'remaining': int(d.remaining),
            'status': d.status,
            'due_date': d.due_date.isoformat() if d.due_date else None,
            'overdue': d.due_date < today if d.due_date else False,
        })

    # ── Bosqich bottleneck (qaysi bosqichda eng ko'p vaqt sarflanadi) ──
    completed_stages = ClientOrderStage.objects.filter(
        order__owner=user, status='completed',
        started_at__isnull=False, completed_at__isnull=False,
    ).annotate(
        duration=ExpressionWrapper(
            F('completed_at') - F('started_at'),
            output_field=DurationField(),
        )
    ).values('title').annotate(
        avg_days=Avg('duration'), cnt=Count('id'),
    ).order_by('-avg_days')[:8]

    bottlenecks = []
    for s in completed_stages:
        avg_d = s['avg_days']
        if avg_d:
            bottlenecks.append({
                'title': s['title'],
                'avg_days': round(avg_d.total_seconds() / 86400, 1),
                'count': s['cnt'],
            })

    # ── Mijoz aktivligi ──
    customer_stats = list(
        orders.exclude(customer__isnull=True)
        .values('customer__id', 'customer__full_name')
        .annotate(order_count=Count('id'))
        .order_by('-order_count')[:10]
    )

    # ── Shared orders (foydalanuvchiga ulashilgan) ──
    shared_in = list(
        ClientOrderPermission.objects.filter(user=user)
        .select_related('order', 'order__owner')
    )
    shared_orders_in = [{
        'order_title': p.order.title,
        'owner': p.order.owner.full_name,
        'role': p.role,
        'status': p.order.status,
    } for p in shared_in]

    # Oy filtri dropdown uchun: {'2026-07': zakazlar soni} (barcha vaqt)
    # ── (2026-08-12) kesim o'rnatilgan akkauntda avgustdan oldingi oylar
    # OLIB TASHLANADI — arxivda, § yuqoridagi arxiv-blok orqali qaytariladi.
    from django.db.models.functions import TruncMonth as _TM
    from django.db.models import Count as _Count
    _an_months_q = ClientOrder.objects.filter(owner=user, is_deleted=False)
    if _cutover_date:
        _an_months_q = _an_months_q.filter(created_at__date__gte=_cutover_date)
    _an_months = {}
    for _row in _an_months_q.annotate(
        _m=_TM('created_at'),
    ).values('_m').annotate(n=_Count('id')).order_by('-_m'):
        if _row['_m']:
            _an_months[_row['_m'].strftime('%Y-%m')] = _row['n']

    # ── Topshirilgan buyurtmalar (shartnoma summasi + deadline + topshirilgan sana)
    #    va MUDDATI O'TGAN (overdue) — davr ichida ──
    from client_erp.models import ClientContract
    from client_erp.models.order import ClientOrderTimeline
    _now = timezone.now()
    _contracts = {}
    for _c in ClientContract.objects.filter(order__owner=user).order_by('created_at').values('order_id', 'contract_amount'):
        _contracts[_c['order_id']] = _c['contract_amount']
    _delivered_at = {}
    for _t in (ClientOrderTimeline.objects.filter(order__owner=user, action='status_change',
               note__icontains='→ Topshirildi').order_by('created_at').values('order_id', 'created_at')):
        _delivered_at[_t['order_id']] = _t['created_at']

    # Overdue: aktiv (delivered/cancelled EMAS) + deadline o'tgan
    overdue_qs = orders.filter(deadline__lt=_now).exclude(status__in=['delivered', 'cancelled'])
    overdue_count = overdue_qs.count()
    overdue_list = [{
        'id': o.id, 'title': o.title, 'status': o.status,
        'customer': o.customer.full_name if o.customer_id else '',
        'deadline': o.deadline.isoformat() if o.deadline else None,
        'days_over': (today - o.deadline.date()).days if o.deadline else 0,
    } for o in overdue_qs.select_related('customer').order_by('deadline')[:25]]

    # Topshirilgan (delivered) — davr ichida (delivered_at yoki updated_at bo'yicha)
    delivered_list = []
    contract_total = 0
    delivered_on_time = 0
    delivered_late = 0
    for o in orders.filter(status='delivered').select_related('customer').order_by('-updated_at'):
        _dat = _delivered_at.get(o.id)
        _dat_date = _dat.date() if _dat else o.updated_at.date()
        if not (start <= _dat_date <= end):
            continue
        _camt = _contracts.get(o.id) or o.final_price or 0
        contract_total += int(_camt or 0)
        _late = (_dat_date - o.deadline.date()).days if o.deadline else 0
        if _late > 0:
            delivered_late += 1
        else:
            delivered_on_time += 1
        delivered_list.append({
            'id': o.id, 'title': o.title,
            'customer': o.customer.full_name if o.customer_id else '',
            'contract': _dec(_camt), 'deadline': o.deadline.isoformat() if o.deadline else None,
            'delivered_at': (_dat.isoformat() if _dat else o.updated_at.isoformat()),
            'days_late': _late,
        })

    # ── Oylik SOF FOYDA (topshirilgan-oy bo'yicha) — oxirgi 6 oy trend ──
    #    Buyurtma foydasi (kirim − barcha xarajat) TOPSHIRILGAN oyga yoziladi.
    from django.db.models.functions import TruncMonth as _TM2
    # SHARTNOMA-ASOSLI (2026-08-03): `contract_profit` yagona manba.
    # `.values()` emas — model obyektlari kerak (property ishlashi uchun).
    _pm = ClientOrder.objects.filter(
        owner=user, status='delivered', is_deleted=False, delivered_at__isnull=False,
    )
    if _cutover_date:
        _pm = _pm.filter(delivered_at__date__gte=_cutover_date)
    _pm = _pm.annotate(_m=_TM2('delivered_at')).select_related('owner')
    _pmonth = {}
    for r in _pm:
        if not r._m:
            continue
        k = r._m.strftime('%Y-%m')
        _pmonth[k] = _pmonth.get(k, 0) + int(r.contract_profit or 0)
    profit_monthly = [{'month': k, 'profit': _pmonth[k]} for k in sorted(_pmonth.keys())[-6:]]

    return {
        'period': period,
        'months': _an_months,
        'profit_monthly': profit_monthly,
        'deliveries': {
            'delivered_count': len(delivered_list),
            'delivered_on_time': delivered_on_time,
            'delivered_late': delivered_late,
            'contract_total': _dec(contract_total),
            'overdue_count': overdue_count,
            'delivered': delivered_list,
            'overdue': overdue_list,
        },
        'summary': {
            'income': _dec(cur_income),
            'expense': _dec(cur_expense),
            'profit': _dec(cur_income - cur_expense),
            'orders': cur_orders,
            'completed': cur_completed,
            'income_change': _pct_change(int(cur_income), int(prev_income)),
            'expense_change': _pct_change(int(cur_expense), int(prev_expense)),
            'orders_change': _pct_change(cur_orders, prev_orders),
        },
        'totals': {
            'income': _dec(all_income),
            'expense': _dec(all_expense),
            'withdrawal': _dec(all_withdrawal),
            'profit': _dec(all_income - all_expense),
            # Balans = FIZIK kassadagi pul (moliya sahifasi bilan aynan bir xil).
            # `all_*` foyda-KPI uchun (o'chirilgan/bekor istisno), balans uchun EMAS.
            'balance': _dec(balance_cash),
            'debt': _dec(total_debt),
            'orders': orders.count(),
            'completed': completed_orders,
            'customers': ClientCustomer.objects.filter(owner=user).count(),
        },
        'chart': {
            'labels': chart_labels,
            'income': chart_income,
            'expense': chart_expense,
        },
        'status_distribution': [
            {'status': s['status'], 'count': s['cnt']} for s in status_dist
        ],
        'expense_categories': [
            {'category': c['category'], 'total': int(c['total'])} for c in cat_data
        ],
        'payment_data_income': [
            {'method': p['payment_method'], 'total': int(p['total'])} for p in payment_data_income
        ],
        'payment_data_expense': [
            {'method': p['payment_method'], 'total': int(p['total'])} for p in payment_data_expense
        ],
        'top_customers': [
            {'id': t['customer__id'], 'name': t['customer__full_name'], 'total': int(t['total'])}
            for t in top_customers
        ],
        'stage_performance': [
            {'title': s['title'], 'count': s['cnt']} for s in stages_perf
        ],
        'orders_detail': orders_detail,
        'debts_detail': debts_detail,
        'bottlenecks': bottlenecks,
        'customer_activity': [
            {'name': c['customer__full_name'], 'orders': c['order_count']}
            for c in customer_stats
        ],
        'shared_orders_in': shared_orders_in,
    }


# ── Oldi-Berdi (MebelCity moliyaviy ma'lumotlar) ──

def _serialize_sale(s):
    return {
        'id': s.pk,
        'doc_number': s.doc_number or '',
        'date': s.sale_date.isoformat() if s.sale_date else None,
        'total_uzs': _dec(s.total_uzs),
        'total_usd': str(s.total_usd) if s.total_usd else None,
        'paid_uzs': _dec(s.paid_uzs or 0),
        'debt_uzs': _dec(s.debt_uzs or 0),
        'status': s.status or '',
        'warehouse': s.warehouse or '',
    }


def _serialize_return(r):
    return {
        'id': r.pk,
        'doc_number': r.doc_number or '',
        'date': r.return_date.isoformat() if r.return_date else None,
        'total_uzs': _dec(r.total_uzs),
        'total_usd': str(r.total_usd) if r.total_usd else None,
        'status': r.status or '',
        'warehouse': r.warehouse or '',
    }


def _serialize_debt(d):
    return {
        'id': d.pk,
        'amount': _dec(d.original_amount),
        'remaining': _dec(d.remaining_amount),
        'currency': d.currency.code if d.currency else '',
        'is_paid': d.is_paid,
        'due_date': d.due_date.isoformat() if d.due_date else None,
        'recorded_date': d.created_at.isoformat() if d.created_at else None,
        'ref_number': d.ref_number or '',
    }


def _serialize_finance_op(o):
    return {
        'id': o.pk,
        'doc_number': o.doc_number or '',
        'doc_type': o.operation_type or '',
        'payment_method': o.payment_method or '',
        'total_uzs': _dec(o.amount_uzs),
        'total_usd': str(o.amount_usd) if o.amount_usd else None,
        'date': o.op_date.isoformat() if o.op_date else None,
        'note': o.note or '',
        'related_doc': o.related_doc_number or '',
        'is_income': o.is_income,
    }


def _serialize_payment(p):
    """Qarz to'lovi (finance.Payment) — Oldi-Berdi «To'lovlar» tabi uchun.

    `debt` FK orqali qaysi qarzni yopgani ko'rinadi.
    """
    d = getattr(p, 'debt', None)
    return {
        'id': p.pk,
        'doc_number': p.number or '',
        'doc_type': 'payment',
        'payment_method': p.payment_method or '',
        'total_uzs': _dec(p.amount_uzs),
        'total_usd': str(p.amount_usd) if getattr(p, 'amount_usd', None) else None,
        'date': p.date.isoformat() if p.date else None,
        'note': p.description or '',
        'related_doc': (d.ref_number or '') if d else '',
        'debt_id': p.debt_id,
        'is_income': True,
    }


def _get_client_safe(user):
    if not user.client_id:
        return None
    from clients.models import Client
    try:
        return Client.objects.get(pk=user.client_id)
    except Client.DoesNotExist:
        return None


def _client_ids_by_phone(user):
    """Foydalanuvchining BARCHA ERP mijoz kartochkalari (id ro'yxati).

    ── MUAMMO (2026-08-06 da o'lchandi) ────────────────────────────────
    MebelCity ERP'da bitta odam bir necha marta kiritilgan bo'lishi mumkin.
    `bigone_cl2` (tel +998911040299) uchun 4 ta kartochka topildi:
        1638 «Big One»               159 826 100  qarz 125 729 097
        1653 «Big One 0299»           11 606 000  qarz  11 606 000
        1699 «Big one 0299 2707»       9 230 600  qarz   9 230 600
        1735 «Big one 0299 0870»               0
    Oldi-Berdi FAQAT `user.client_id` (1638) ni ko'rsatardi → qarzning
    20 836 600 so'mi KO'RINMASDI.

    «Buyurtmalarim» sahifasi esa allaqachon TELEFON bo'yicha qidiradi
    (`consumers.handle_page_mebelcity`) va 4 tasini ham qamrab oladi —
    shuning uchun buyurtmalar to'liq, pul hisobi esa yarim edi.

    ── YECHIM ──────────────────────────────────────────────────────────
    Ikkala sahifa BIR XIL mantiqda ishlaydi: telefon oxirgi 9 raqami.
    Telefon yo'q/qisqa bo'lsa — faqat o'z `client_id`, ya'ni eski xatti-
    harakat (boshqa odamning puli aralashib ketmasin).
    """
    import re
    ids = set()
    if user.client_id:
        ids.add(user.client_id)
    phone = (getattr(user, 'phone', '') or '').strip()
    digits = re.sub(r'\D', '', phone)
    if digits.startswith('998') and len(digits) > 9:
        digits = digits[3:]
    # 9 raqamdan qisqa bo'lsa moslash XAVFLI — kengaytirmaymiz
    if len(digits) >= 9:
        try:
            from clients.models import Client
            ids.update(
                Client.objects.filter(phone__endswith=digits)
                .values_list('id', flat=True)
            )
        except Exception:                                         # noqa: BLE001
            pass
    return list(ids)


def _oldi_berdi_period_range(period):
    """Davr chipi ('all'/'month'/'last_month'/'year') → (start, end) aware dt yoki None."""
    from datetime import timedelta
    from django.utils import timezone
    if period not in ('month', 'last_month', 'year'):
        return None
    now = timezone.localtime()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if period == 'month':
        return (month_start, None)
    if period == 'last_month':
        prev_end = month_start
        prev_start = (month_start - timedelta(days=1)).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0)
        return (prev_start, prev_end)
    # year
    return (month_start.replace(month=1), None)


def _apply_period(qs, field, rng):
    if not rng:
        return qs
    start, end = rng
    if start:
        qs = qs.filter(**{field + '__gte': start})
    if end:
        qs = qs.filter(**{field + '__lt': end})
    return qs


def serialize_oldi_berdi_page(user, data=None):
    empty = {
        'linked': False,
        'client_name': '',
        'balance': {'uzs': '0', 'usd': '0'},
        'summary': {
            'total_sales': '0', 'total_returns': '0',
            'total_debt': '0', 'total_payments': '0',
            'sales_count': 0, 'returns_count': 0,
            'debts_count': 0, 'operations_count': 0,
        },
        'sales': [], 'returns': [], 'debts': [], 'operations': [],
        'has_more': {'sales': False, 'returns': False, 'debts': False, 'operations': False},
    }
    client = _get_client_safe(user)
    if not client:
        return empty

    from sales.models import Sale, Return
    from finance.models import Debt, Payment
    from django.db.models import Sum

    PAGE = 20
    period = (data or {}).get('period') or 'all'
    rng = _oldi_berdi_period_range(period)

    # Bekor qilingan (Отменен) sotuvlar summaga QO'SHILMAYDI — yozuv DB'da qoladi,
    # lekin Oldi-Berdi ro'yxati va jami summadan chiqariladi (ochib ketgan zakaz tuzatildi).
    # ⚠️ 2026-08-06: bitta odamning BARCHA ERP kartochkalari (dublikatlar).
    # Ilgari faqat `client=client` edi → qarzning bir qismi ko'rinmasdi.
    _cids = _client_ids_by_phone(user)
    sales_qs = _apply_period(
        Sale.objects.filter(client_id__in=_cids).exclude(status__icontains='Отмен'),
        'sale_date', rng).order_by('-sale_date')
    returns_qs = _apply_period(
        Return.objects.filter(client_id__in=_cids), 'return_date', rng).order_by('-return_date')
    debts_qs = _apply_period(
        Debt.objects.filter(client_id__in=_cids, is_paid=False), 'created_at', rng).order_by('-created_at')
    # ── TO'LOVLAR (2026-08-06 TUZATILDI) ─────────────────────────────────
    # ⚠️ Ilgari `ERPFinanceOperation(operation_type='incoming')` dan o'qilardi.
    # Jonli bazada o'lchandi: Big One (client=1638) uchun u jadvalda
    # **0 ta** yozuv bor, holbuki mijoz 20 239 403 so'm to'lagan.
    # Sabab: platforma ROSTAPP'dan native moliyaga o'tgan — to'lovlar
    # `Payment` (+ `FinancialOperation`) ga ko'chgan, bu sahifa eskisida
    # qolib ketgan. Natijada «To'lovlar 0» ko'rinardi.
    #
    # To'g'ri manba — `Payment`: u `debt` FK bilan bog'langan, ya'ni qaysi
    # to'lov qaysi qarzni yopgani aniq (`finance/views_qarz.py` oqimi).
    _debt_ids = list(Debt.objects.filter(client_id__in=_cids).values_list('id', flat=True))
    ops_qs = _apply_period(
        Payment.objects.filter(debt_id__in=_debt_ids).select_related('debt'),
        'date', rng).order_by('-date')

    sales_count = sales_qs.count()
    returns_count = returns_qs.count()
    debts_count = debts_qs.count()
    ops_count = ops_qs.count()

    sales_total = sales_qs.aggregate(s=Sum('total_uzs'))['s'] or 0
    returns_total = returns_qs.aggregate(s=Sum('total_uzs'))['s'] or 0
    debts_total = debts_qs.aggregate(s=Sum('remaining_amount'))['s'] or 0
    ops_total = ops_qs.aggregate(s=Sum('amount_uzs'))['s'] or 0

    # Svodka bog'lanishi uchun (davrdan MUSTAQIL — umumiy holat)
    _all_debt = Debt.objects.filter(client_id__in=_cids)
    _debt_created = _all_debt.aggregate(s=Sum('original_amount'))['s'] or 0
    _debt_left = _all_debt.filter(is_paid=False).aggregate(s=Sum('remaining_amount'))['s'] or 0
    _paid_on_debt = Decimal(str(_debt_created)) - Decimal(str(_debt_left))
    _all_sales = Sale.objects.filter(client_id__in=_cids).exclude(status__icontains='Отмен')
    _sales_all = _all_sales.aggregate(s=Sum('total_uzs'))['s'] or 0
    _paid_direct = max(Decimal(str(_sales_all)) - Decimal(str(_debt_created)), Decimal('0'))

    return {
        'linked': True,
        'period': period,
        'client_name': client.full_name,
        # Balans = BARCHA kartochkalarning ochiq qarzi (dublikatlar bilan)
        'balance': {
            'uzs': _dec(debts_total),
            'usd': str(client.balance_usd) if client.balance_usd else '0',
        },
        'client_cards': len(_cids),
        'summary': {
            'total_sales': _dec(sales_total),
            'total_returns': _dec(returns_total),
            'total_debt': _dec(debts_total),
            'total_payments': _dec(ops_total),
            'sales_count': sales_count,
            'returns_count': returns_count,
            'debts_count': debts_count,
            'operations_count': ops_count,
        },
        'sales': [_serialize_sale(s) for s in sales_qs[:PAGE]],
        'returns': [_serialize_return(r) for r in returns_qs[:PAGE]],
        'debts': [_serialize_debt(d) for d in debts_qs],
        'operations': [_serialize_payment(o) for o in ops_qs[:PAGE]],
        # ── Svodka bog'lanishi (2026-08-06) ──
        # «Sotuv − Qaytarish ≠ Balans» chalkashligini yo'qotadi.
        # Farq: qarz ochilmasdan darhol to'langan sotuvlar + qarzdan
        # to'langan qism. UI shu raqamlar bilan izoh chiqaradi.
        'reconcile': {
            'debt_created': _dec(_debt_created),      # sotuvdan ochilgan qarz
            'paid_direct': _dec(_paid_direct),        # qarzsiz darhol to'langan
            'paid_on_debt': _dec(_paid_on_debt),      # qarzdan to'langani
        },
        'has_more': {
            'sales': sales_count > PAGE,
            'returns': returns_count > PAGE,
            'debts': False,
            'operations': ops_count > PAGE,
        },
    }


def serialize_duplicate_check(user):
    """Ehtimoliy TAKROR yozuvlar — foydalanuvchi o'zi tekshirishi uchun.

    TZ yo'q — foydalanuvchi so'rovi (2026-08-06): moliyani tekshirganda
    24 guruh, ~123 800 077 so'mlik takror yozuv topildi. Har ortiqcha
    chiqim foydani kamaytiradi.

    ╔══════════════════════════════════════════════════════════════════╗
    ║  TIZIM HECH NARSANI O'CHIRMAYDI.                                 ║
    ║  Faqat SHUBHALI juftlikni ko'rsatadi — qaysi biri haqiqiy dublikat║
    ║  ekanini FAQAT foydalanuvchi biladi (izohlar har xil bo'lishi     ║
    ║  mumkin: «zapchast» va «oyna» — ikki xarid, tasodifan bir summa). ║
    ╚══════════════════════════════════════════════════════════════════╝

    Belgi: bir xil ega + zakaz + summa + sana + tur.
    `dup_reviewed=True` bo'lganlar ro'yxatga TUSHMAYDI.
    """
    from client_erp.models import ClientFinanceRecord
    from django.db.models import Count

    base = ClientFinanceRecord.objects.filter(
        owner=user, is_deleted=False, dup_reviewed=False,
    )
    groups = (base.values('order_id', 'amount', 'date', 'record_type')
              .annotate(n=Count('id')).filter(n__gt=1).order_by('-amount'))

    out = []
    total_extra = Decimal('0')
    for g in groups[:40]:
        recs = list(base.filter(
            order_id=g['order_id'], amount=g['amount'],
            date=g['date'], record_type=g['record_type'],
        ).select_related('order').order_by('created_at'))
        if len(recs) < 2:
            continue
        gap = (recs[-1].created_at - recs[0].created_at).total_seconds()
        # 60 soniyadan kam farq + bir xil izoh → kuchli shubha
        same_note = len({(r.description or '').strip().lower() for r in recs}) == 1
        risk = 'high' if (gap < 60 and same_note) else ('medium' if gap < 300 else 'low')
        extra = Decimal(str(g['amount'])) * (len(recs) - 1)
        total_extra += extra
        out.append({
            'key': f"{g['order_id']}_{g['amount']}_{g['date']}_{g['record_type']}",
            'order_id': g['order_id'],
            'order_title': (recs[0].order.title if recs[0].order_id else '') or '',
            'record_type': g['record_type'],
            'amount': _dec(g['amount']),
            'date': g['date'].isoformat() if g['date'] else None,
            'count': len(recs),
            'extra': _dec(extra),
            'gap_sec': int(gap),
            'risk': risk,
            'items': [{
                'id': r.pk,
                'note': (r.description or '')[:60],
                'category': r.category or '',
                'created_at': r.created_at.isoformat(),
            } for r in recs],
        })
    return {
        'groups': out,
        'count': len(out),
        'total_extra': _dec(total_extra),
    }


def serialize_profit_proof(user, order_id):
    """«Hisob qanday chiqdi?» — bir zakaz foydasining TO'LIQ zanjiri.

    Foydalanuvchi so'rovi (2026-08-06): *«bu narsaning to'g'ri ekanligini
    qanday isbotlaymiz — ular xato deyishsa ayb bizda yoki ularda ekanini
    ko'rsatish kerak»*.

    Har raqam QAYERDAN kelgani ko'rsatiladi:
      shartnoma summasi → kim kiritgan
      xarajatlar        → har yozuv alohida, sanasi bilan
      ulush foizi       → kim belgilagan, audit jurnali bilan
      yechilgan pul     → qachon, kimga

    FAQAT O'QIYDI. Zakazni ko'rish huquqi tekshiriladi.
    """
    from client_erp.models import ClientOrder, ClientFinanceRecord
    from client_erp.models.team import ClientOrderProfitShare, ClientProfitAudit
    from client_erp.services.scope import shared_order_ids, profit_claim_map
    from decimal import Decimal as D

    try:
        o = ClientOrder.objects.select_related('owner', 'customer').get(pk=int(order_id))
    except (ClientOrder.DoesNotExist, TypeError, ValueError):
        return {'ok': False, 'error': 'Buyurtma topilmadi'}

    # Ruxsat: egasi yoki ulashilgan/ulushi bor
    allowed = (o.owner_id == user.id
               or o.id in shared_order_ids(user)
               or o.id in profit_claim_map(user)
               or ClientOrderProfitShare.objects.filter(order_id=o.id, user=user).exists())
    if not allowed:
        return {'ok': False, 'error': "Bu buyurtmani ko'rish huquqingiz yo'q"}

    ca = D(str(o.contract_amount or 0))
    exp = D(str(o.total_expense or 0))
    profit = D(str(o.contract_profit or 0))

    # Xarajatlar — har biri alohida (kim, qachon, qancha)
    expenses = [{
        'date': r.date.isoformat() if r.date else None,
        'amount': _dec(r.amount),
        'category': r.category or '',
        'note': (r.description or '')[:60],
    } for r in ClientFinanceRecord.objects.filter(
        order=o, record_type='expense', is_deleted=False,
    ).order_by('-amount')[:40]]

    # Ulushlar — kim, necha foiz, akkauntga bog'langanmi
    shares = []
    for sh in ClientOrderProfitShare.objects.filter(order=o).select_related('user').order_by('-percent'):
        pct = D(str(sh.percent or 0))
        shares.append({
            'name': sh.name or '',
            'percent': float(pct),
            'amount': _dec(profit * pct / 100),
            'user_id': sh.user_id,
            'user_label': (sh.user.full_name or sh.user.username) if sh.user_id and sh.user else None,
            'linked': bool(sh.user_id),
            'is_me': bool(sh.user_id and sh.user_id == user.id),
        })

    # Kirimlar (mijoz to'lovlari)
    incomes = [{
        'date': r.date.isoformat() if r.date else None,
        'amount': _dec(r.amount),
        'note': (r.description or '')[:60],
    } for r in ClientFinanceRecord.objects.filter(
        order=o, record_type='income', is_deleted=False, is_reversal=False,
    ).order_by('-date')[:20]]

    # Yechilgan pul (ulush to'lovlari)
    paid = [{
        'date': r.date.isoformat() if r.date else None,
        'amount': _dec(r.amount),
        'to': r.recipient_name or '',
        'note': (r.description or '')[:60],
    } for r in ClientFinanceRecord.objects.filter(
        order=o, record_type='withdrawal', is_deleted=False,
    ).order_by('-date')[:20]]

    # Audit — bu zakazda nima o'zgargan
    audit = [{
        'at': a.created_at.isoformat(),
        'action': a.get_action_display(),
        'who': (a.actor.full_name if a.actor_id and a.actor else '') or a.actor_note,
        'target': a.target_name or '',
        'old': a.old_value, 'new': a.new_value, 'reason': a.reason,
    } for a in ClientProfitAudit.objects.filter(order=o).order_by('-created_at')[:20]]

    return {
        'ok': True,
        'order': {
            'id': o.id, 'title': o.title, 'status': o.get_status_display(),
            'owner': (o.owner.full_name or o.owner.username) if o.owner_id else '',
            'customer': getattr(o.customer, 'full_name', '') if o.customer_id else '',
            'delivered_at': o.delivered_at.isoformat() if o.delivered_at else None,
            'contract_amount': _dec(ca),
            'by_contract': bool(o.uses_contract_profit),
            'total_expense': _dec(exp),
            'profit': _dec(profit),
        },
        'expenses': expenses, 'expenses_count': len(expenses),
        'incomes': incomes,
        'shares': shares,
        'paid': paid,
        'audit': audit,
    }


def serialize_oldi_berdi_sale_detail(user, sale_id):
    """Bitta sotuv tafsiloti — «nima uchun va nimaga qarz bo'lgan».

    Foydalanuvchi so'rovi (2026-08-06): Oldi-Berdi ro'yxatida qatorni
    bosganda qarz sababi ochilsin.

    FAQAT O'QIYDI. Mijoz bo'yicha qat'iy cheklangan — boshqa mijozning
    sotuvi hech qachon qaytmaydi.
    """
    client = _get_client_safe(user)
    if not client:
        return {'ok': False, 'error': 'ERP bilan bog\'lanmagan'}

    from sales.models import Sale
    from finance.models import Debt, Payment
    from decimal import Decimal as D

    try:
        sale = Sale.objects.filter(pk=int(sale_id), client_id__in=_client_ids_by_phone(user)).first()
    except (TypeError, ValueError):
        sale = None
    if not sale:
        return {'ok': False, 'error': 'Topilmadi'}

    total = D(str(sale.total_uzs or 0))
    paid = D(str(sale.paid_uzs or 0))
    debt_left = D(str(sale.debt_uzs or 0))

    # Shu sotuvdan ochilgan qarz yozuvi
    _cids = _client_ids_by_phone(user)
    debt = Debt.objects.filter(client_id__in=_cids, ref_type='sale', ref_id=sale.pk).first()
    if debt is None and sale.doc_number:
        debt = Debt.objects.filter(client_id__in=_cids, ref_number=str(sale.doc_number)).first()

    payments = []
    if debt:
        payments = [{
            'date': p.date.isoformat() if p.date else None,
            'amount': _dec(p.amount_uzs),
            'method': p.payment_method or '',
            'note': p.description or '',
            'number': p.number or '',
        } for p in Payment.objects.filter(debt=debt).order_by('-date')[:20]]

    # Nima olingan (sotuv qatorlari)
    lines = []
    try:
        for ln in sale.lines.all()[:30]:
            lines.append({
                'name': (getattr(ln, 'product_name', '') or getattr(ln, 'name', ''))[:60],
                'qty': str(getattr(ln, 'quantity', '') or ''),
                'price': _dec(getattr(ln, 'price_uzs', 0) or 0),
                'total': _dec(getattr(ln, 'total_uzs', 0) or 0),
            })
    except Exception:                                             # noqa: BLE001
        lines = []

    # ⚠️ To'lov sotuvdan OSHIB ketgan holat (jonli bazada 2 ta topildi:
    # 501967 — 1156%, 501775 — 769%). MebelCity tomonida bitta katta
    # to'lov kichik chekka biriktirilgan. Foiz cheklanadi, lekin fakt
    # YASHIRILMAYDI — ogohlantirish chiqadi.
    overpaid = max(paid - total, D('0'))
    pct = int(min(D('100'), (paid / total * 100) if total > 0 else D('0')))

    return {
        'ok': True,
        'sale': {
            'id': sale.pk,
            'doc_number': sale.doc_number or '',
            'date': sale.sale_date.isoformat() if sale.sale_date else None,
            'status': sale.status or '',
            'warehouse': sale.warehouse or '',
            'total': _dec(total),
            'paid': _dec(paid),
            'debt': _dec(debt_left),
            'pct': pct,
            'overpaid': _dec(overpaid),
        },
        'debt': ({
            'id': debt.pk,
            'original': _dec(debt.original_amount),
            'remaining': _dec(debt.remaining_amount),
            'is_paid': bool(debt.is_paid),
            'due_date': debt.due_date.isoformat() if debt.due_date else None,
            'created_at': debt.created_at.isoformat() if getattr(debt, 'created_at', None) else None,
            'paid_at': debt.paid_at.isoformat() if debt.paid_at else None,
        } if debt else None),
        'payments': payments,
        'lines': lines,
        'lines_count': len(lines),
    }


def serialize_oldi_berdi_section(user, section, offset, limit, period='all'):
    client = _get_client_safe(user)
    if not client:
        return {'items': [], 'has_more': False}

    from sales.models import Sale, Return
    from finance.models import Debt, Payment

    rng = _oldi_berdi_period_range(period or 'all')

    # ⚠️ 2026-08-06: «operations» ham `Payment` ga o'tkazildi —
    # `serialize_oldi_berdi_page` bilan BIR XIL manba bo'lishi shart,
    # aks holda «Ko'proq yuklash» boshqa ma'lumot ko'rsatardi.
    _cids = _client_ids_by_phone(user)
    _debt_ids = list(Debt.objects.filter(client_id__in=_cids).values_list('id', flat=True))

    qs_map = {
        'sales': (_apply_period(Sale.objects.filter(client_id__in=_cids).exclude(status__icontains='Отмен'), 'sale_date', rng)
                  .order_by('-sale_date'), _serialize_sale),
        'returns': (_apply_period(Return.objects.filter(client_id__in=_cids), 'return_date', rng)
                    .order_by('-return_date'), _serialize_return),
        'operations': (_apply_period(
            Payment.objects.filter(debt_id__in=_debt_ids).select_related('debt'),
            'date', rng).order_by('-date'), _serialize_payment),
    }
    if section not in qs_map:
        return {'items': [], 'has_more': False}

    qs, serializer = qs_map[section]
    total = qs.count()
    items = list(qs[offset:offset + limit])
    return {
        'items': [serializer(i) for i in items],
        'has_more': (offset + len(items)) < total,
    }
