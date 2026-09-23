"""client_erp/services/notifications.py — Telegram notification yuborish."""
import logging
import requests as http_requests

logger = logging.getLogger('client_erp.notifications')

SITE_URL = 'https://mebelcity.bittada.uz'


def _get_bot_token():
    try:
        from telegram_bot.models import Bot
        bot = Bot.objects.using('default').filter(is_active=True).first()
        return bot.token if bot else None
    except Exception:
        return None


def _send(chat_id, text, button_text=None, button_url=None):
    if not chat_id:
        return
    token = _get_bot_token()
    if not token:
        return
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if button_text and button_url:
        payload["reply_markup"] = {
            "inline_keyboard": [[{"text": button_text, "web_app": {"url": button_url}}]]
        }
    try:
        http_requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json=payload, timeout=10,
        )
    except Exception as e:
        logger.error("Notification xato: %s", e)


def _mini_url(user):
    # `?tg=1` SHART — shu bayroq bo'lmasa `spa_redesign.html` Telegram
    # WebApp skriptini yuklamaydi (`is_telegram=False`), garchi sahifa
    # haqiqatda Telegram ichida (`web_app` tugmasi orqali) ochilgan bo'lsa
    # ham. Natijada `window.Telegram.WebApp` mavjud bo'lmay qoladi va fayl
    # yuklab olish/kamera kabi WebView-maxsus fallbacklar ishlay olmaydi
    # (2026-09-03, foydalanuvchi xabari: bot orqali fayl yuklanmayapti).
    return f"{SITE_URL}/mini/{user.username}/?tg=1"


# ═══════════════════════════════════════════════════════════════════════════
#  ILOVA ICHIDAGI BILDIRISHNOMA (2026-08-04)
#  `ClientNotification` modeli 0001-migratsiyadan beri mavjud edi, lekin
#  HECH QAYERDA ishlatilmagan. Telegram xabari yetarli emas: foydalanuvchi
#  ilovaga kirganda ham ko'rishi kerak (Telegram o'chirilgan/bot bloklangan
#  bo'lishi mumkin). Endi ikkalasi birga ishlaydi.
# ═══════════════════════════════════════════════════════════════════════════

def notify_in_app(user, title, message, ntype='custom',
                  amount=None, link='', icon=''):
    """Ilova ichida ko'rinadigan bildirishnoma yozadi (Bosh sahifada chiqadi).

    `amount` — kartada KATTA shrift bilan chiqadi (foydalanuvchi so'rovi:
    «summa ham ko'rinishi kerak»).
    `link`   — bosilganda o'tadigan SPA yo'li (masalan '/finance').
    `icon`   — emoji, kartaning chap tomonida doira ichida.

    Xato bo'lsa JIM o'tadi — bildirishnoma pul operatsiyasini buzmasin.
    """
    if not user:
        return None
    try:
        from client_erp.models import ClientNotification
        return ClientNotification.objects.create(
            user=user, channel='in_app', notification_type=ntype,
            title=title[:200], message=message, is_sent=True, is_read=False,
            amount=amount, link=link or '', icon=icon or '',
        )
    except Exception:                                             # noqa: BLE001
        logger.warning("[notify_in_app] yozib bo'lmadi", exc_info=True)
        return None


def notify_share_assigned(member, amount, percent, order_title, order_id=None):
    """A'ZOGA — «sizga ulush BELGILANDI» (pul hali yechilmagan).

    Foydalanuvchi so'rovi (2026-08-04): a'zo ulush belgilangan zahoti bilsin,
    pul yechilishini kutmasdan. Pul hali o'tkazilmagani ANIQ yoziladi —
    aks holda «pulim qani?» degan savol tug'iladi.
    """
    notify_in_app(
        member,
        f"Sizga ulush belgilandi · {order_title}",
        f"{percent:g}% ulush · pul hali yechilmagan. "
        f"Buyurtma egasi yechganda hisobingizga tushadi.",
        'custom', amount=amount, icon='📊',
        # ⚠️ 2026-08-04 TUZATILDI: a'zo zakaz EGASI emas — unga `/orders/<id>`
        # ochilmaydi («Ruxsat yo'q» chiqadi). A'zo o'z ulushini O'Z Moliya
        # sahifasida ko'radi, shuning uchun havola shu yerga.
        link='/finance',
    )
    if getattr(member, 'telegram_chat_id', None):
        _send(member.telegram_chat_id,
              f"📊 <b>Sizga ulush belgilandi</b>\n\n"
              f"📦 <b>{order_title}</b>\n"
              f"📈 Ulush: <b>{percent:g}%</b>\n"
              f"💰 Summa: <b>{amount:,.0f}</b> so‘m\n\n"
              f"<i>Pul hali yechilmagan — egasi yechganda hisobingizga tushadi.</i>",
              "📱 Ochish", _mini_url(member))


def notify_share_assigned_owner(owner, member, amount, percent, order_title, order_id=None):
    """EGAGA — «falonchiga X so'm ulush belgilandi» (tasdiq)."""
    from client_erp.serializers import contact_label
    lbl = contact_label(member) or (member.full_name or member.username)
    notify_in_app(
        owner,
        f"{lbl} ga ulush belgilandi · {order_title}",
        f"{percent:g}% ulush. Pul yechilmaguncha uning hisobiga tushmaydi.",
        'custom', amount=amount, icon='📊',
        link=(f'/orders/{order_id}#profit' if order_id else '/finance'),
    )


def notify_share_sent_to_member(owner, member, amount, percent, order_title, line_id=None):
    """EGAGA — «falonchiga X so'm ulush jo'natildi» (tasdiq).

    Foydalanuvchi so'rovi (2026-08-04): pul yechilganda egasi ham xabar
    olsin — kimga, qancha ketgani ko'rinib tursin.
    """
    from client_erp.serializers import contact_label
    lbl = contact_label(member) or (member.full_name or member.username)
    notify_in_app(
        owner,
        f"{lbl} ga ulush jo‘natildi · {order_title}",
        f"{percent:g}% ulush. U «Qabul qilaman» bosgach hisobiga tushadi.",
        'custom', amount=amount, icon='💸',
        link=(f'/finance#line-{line_id}' if line_id else '/finance'),
    )
    if getattr(owner, 'telegram_chat_id', None):
        _send(owner.telegram_chat_id,
              f"💸 <b>Ulush jo‘natildi</b>\n\n"
              f"📦 <b>{order_title}</b>\n"
              f"👤 Kimga: <b>{lbl}</b>\n"
              f"📊 Ulush: <b>{percent:g}%</b>\n"
              f"💰 Summa: <b>{amount:,.0f}</b> so‘m",
              "📱 Moliyani ochish", _mini_url(owner))


def notify_team_invite(user, team_name, owner_name):
    _send(user.telegram_chat_id,
          f"👥 <b>Jamoaga taklif!</b>\n\n"
          f"<b>{owner_name}</b> sizni <b>{team_name}</b> jamoasiga taklif qildi.\n\n"
          f"Qabul qilish uchun Bittada Usta ni oching.",
          "📱 Bittada Usta ochish", _mini_url(user))


def notify_order_shared(user, order_title, shared_by):
    _send(user.telegram_chat_id,
          f"📦 <b>Yangi buyurtma ulashildi!</b>\n\n"
          f"<b>{shared_by}</b> sizga <b>{order_title}</b> buyurtmasini ulashdi.",
          "📱 Bittada Usta ochish", _mini_url(user))


def notify_order_created(user, order_title):
    _send(user.telegram_chat_id,
          f"✅ <b>Buyurtma yaratildi</b>\n\n"
          f"📦 <b>{order_title}</b>",
          "📱 Bittada Usta ochish", _mini_url(user))


def notify_order_completed(user, order_title):
    _send(user.telegram_chat_id,
          f"🎉 <b>Buyurtma tugallandi!</b>\n\n"
          f"📦 <b>{order_title}</b> to'liq bajarildi.",
          "📱 Bittada Usta ochish", _mini_url(user))


def notify_stage_completed(user, order_title, stage_title, completed_by):
    _send(user.telegram_chat_id,
          f"✅ <b>Etap tugallandi</b>\n\n"
          f"📦 {order_title}\n"
          f"📋 <b>{stage_title}</b> — {completed_by}",
          "📱 Bittada Usta ochish", _mini_url(user))


def notify_profit_withdrawn(user, amount, order_title):
    _send(user.telegram_chat_id,
          f"💰 <b>Foyda yechildi!</b>\n\n"
          f"Sizga <b>{amount:,.0f}</b> so'm yechildi\n"
          f"📦 {order_title}",
          "📱 Bittada Usta ochish", _mini_url(user))


def notify_month_end_pending_shares(user, orders_count, total_amount):
    """F9-b (2026-08-04): oy oxiri — egaga "hali bo'lib berilmagan" eslatmasi.

    PUL O'TKAZMAYDI, faqat eslatma (`ClientMonthEndReminderLog` bilan
    oyiga bir marta). Foydalanuvchi so'ragan "tizim o'zi avtomatik yuborsin"
    o'rniga xavfsizroq variant — H6 (bekor qilish) tayyor bo'lmaguncha."""
    _send(user.telegram_chat_id,
          f"📅 <b>Oy yakunlanmoqda — ulush hali bo'lib berilmagan</b>\n\n"
          f"<b>{orders_count} ta</b> topshirilgan buyurtmada jamoa a'zolariga "
          f"jami <b>{total_amount:,.0f}</b> so'm hali yechilmagan.\n\n"
          f"Moliya sahifasidan «Foyda yechish» orqali bo'lib bering.",
          "📱 Moliyani ochish", _mini_url(user))


def notify_profit_reversed(user, amount, order_title, note):
    """H6 (2026-08-04): a'zoga yozilgan ulush BEKOR qilinganda xabar.

    Boshqa odamning moliyasiga tegilyapti — u buni albatta bilishi kerak,
    aks holda balansi jimgina kamayib, ishonchsizlik tug'diradi."""
    _send(user.telegram_chat_id,
          f"↩️ <b>Ulush bekor qilindi</b>\n\n"
          f"📦 <b>{order_title}</b>\n"
          f"💰 Qaytarilgan summa: <b>{amount:,.0f}</b> so'm\n"
          f"📝 Sabab: {note}\n\n"
          f"Bu summa sizning Kirimingizdan olib tashlandi. "
          f"Savol bo'lsa buyurtma egasi bilan bog'laning.",
          "📱 Moliyani ochish", _mini_url(user))


def notify_team_share_received(user, amount, percent, order_title, line_id=None):
    """F8 (2026-08-04): jamoaviy zakazdan real ulush kelganda a'zoga xabar.

    `handle_profit_withdraw`da real `ClientFinanceRecord(record_type='income')`
    yaratilgan a'zolarga YUBORILADI — bu ikkalasi ALWAYS bir xil ro'yxatdan
    (ehtimoliy false-notification yo'q)."""
    # Ilova ichida ham ko'rinsin — a'zo Telegramni o'chirgan bo'lishi mumkin
    # H7 (2026-08-04): pul HALI KELMAGAN — a'zo «Qabul qilaman» bosishi kerak.
    # Ilgari «hisobingizga o'tkazildi» derdi, lekin bu noto'g'ri edi: yozuv
    # faqat rozilikdan keyin yaratiladi.
    notify_in_app(
        user,
        f"Sizga ulush kelmoqda · {order_title}",
        f"{percent:g}% ulush. Moliya bo‘limida «✅ Qabul qilaman» tugmasini "
        f"bosing — shundan keyin hisobingizga qo‘shiladi.",
        # `#line-<id>` — navigatsiyaga ta'sir qilmaydi (frontend '#' gacha
        # kesadi), lekin server qabul qilingach AYNAN shu kartani yopadi.
        'custom', amount=amount, icon='💰',
        link=(f'/finance#line-{line_id}' if line_id else '/finance'),
    )
    _send(user.telegram_chat_id,
          f"💰 <b>Sizga ulush kelmoqda</b>\n\n"
          f"📦 <b>{order_title}</b>\n"
          f"📊 Ulushingiz: <b>{percent:g}%</b>\n"
          f"💰 Summa: <b>{amount:,.0f}</b> so'm\n\n"
          f"<i>Ilovada «✅ Qabul qilaman» tugmasini bosing — "
          f"shundan keyin hisobingizga qo'shiladi.</i>",
          "📱 Moliyani ochish", _mini_url(user))


def notify_mebelcity_status(user, order_title, old_status, new_status):
    labels = {'draft': 'Draft', 'in_progress': 'Jarayonda', 'done': 'Tugallangan', 'cancel': 'Bekor'}
    _send(user.telegram_chat_id,
          f"🏭 <b>MebelCity buyurtma holati</b>\n\n"
          f"📦 <b>{order_title}</b>\n"
          f"📊 {labels.get(old_status, old_status)} → <b>{labels.get(new_status, new_status)}</b>",
          "📱 Bittada Usta ochish", _mini_url(user))


def notify_referral_joined(user, friend_name):
    _send(user.telegram_chat_id,
          f"🎁 <b>Do'stingiz qo'shildi!</b>\n\n"
          f"<b>{friend_name}</b> sizning havolangiz orqali Bittada Ustaga qo'shildi.\n"
          f"Sizga <b>+30 XP</b> va <b>+20 tanga</b> berildi!",
          "📱 Bittada Usta ochish", _mini_url(user))


def notify_admin_contact_request(user, message=''):
    """Sozlamalar > "Admin bilan bog'lanish" — mijoz so'rovini admin guruhiga yuboradi.

    Guruh xom chat_id (MINI_ERP_ADMIN_GROUP_ID) — brauzer havolasi emas,
    mavjud bot orqali xabar sifatida yetkaziladi (HR_BADGE_ADMIN_CHAT_ID
    patterni bilan bir xil)."""
    from django.conf import settings
    group_id = getattr(settings, 'MINI_ERP_ADMIN_GROUP_ID', '')
    if not group_id:
        return False
    text = (
        f"🆘 <b>Admin bilan bog'lanish so'rovi</b>\n\n"
        f"👤 <b>{user.full_name or user.username}</b> (@{user.username})\n"
    )
    if user.organization:
        text += f"🏢 {user.organization}\n"
    if user.phone:
        text += f"📞 {user.phone}\n"
    if message:
        text += f"\n💬 {message}"
    # Guruhga oddiy matn — "web_app" inline tugma faqat shaxsiy chatlarda ishonchli
    # ishlaydi, guruhga yubormaymiz (xato xavfi).
    _send(group_id, text)
    return True


# ═══════════════════════════════════════════════════════════════════════════
#  🔻 SHERIK BUYURTMADAN CHIQARILDI (2026-08-15, TZ-Sherik-Chiqarish-Izi §S5)
#  Foydalanuvchi talabi: «kim chiqib ketdi va endi foyda qanday bo'linishi
#  bo'yicha; ustiga bosса o'sha zakazga kirib aniq ko'rsatish kerak, sodda
#  bo'lsin». Xabar EGASIGA, qolgan sheriklarga va CHIQARILGANNING o'ziga
#  boradi — u ham nima bo'lganini bilishi kerak.
# ═══════════════════════════════════════════════════════════════════════════

def notify_partner_removed(user, order, removed, now_split, reason=''):
    """`removed` = [{name, percent, amount}], `now_split` = hozirgi taqsimot."""
    if not user:
        return
    title = (order.title or 'Buyurtma')[:60]
    gone_names = ', '.join((r.get('name') or '—') for r in removed)
    # Chiqarilganning o'ziga boshqacha murojaat — "siz chiqarildingiz"
    _me = any(r.get('user_id') == user.pk for r in removed)

    def _money(v):
        return f"{int(v or 0):,}".replace(',', ' ')

    lines = [
        "🔻 <b>Sherik chiqarildi</b>" if not _me else "🔻 <b>Siz buyurtmadan chiqarildingiz</b>",
        "",
        f"📦 <b>{title}</b>",
        (f"👤 <b>{gone_names}</b> chiqdi" if not _me else "👤 Endi bu buyurtmadan sizga hech narsa yozilmaydi")
        + (f" · sababi: {reason}" if reason else ''),
        "",
        "<b>Endi foyda:</b>",
    ]
    for s in (now_split or []):
        lines.append(f"• {s.get('name')} — {s.get('percent')}%  ({_money(s.get('amount'))} so‘m)")
    if not _me:
        lines.append(f"\n{gone_names}ga bu buyurtmadan hech narsa yozilmaydi.")

    text = "\n".join(lines)
    _send(user.telegram_chat_id, text, "📱 Zakazni ochish",
          f"{_mini_url(user)}#/orders/{order.pk}")
    notify_in_app(
        user,
        "Siz buyurtmadan chiqarildingiz" if _me else f"Sherik chiqarildi: {gone_names}",
        text.replace('<b>', '').replace('</b>', ''),
        ntype='custom', link=f'/orders/{order.pk}', icon='🔻',
    )
